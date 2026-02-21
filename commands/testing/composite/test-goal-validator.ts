/**
 * Composite Command: Test Goal Validator
 * 
 * Validates that test strategy documentation aligns with actual test files.
 * Parses test strategy sections from guides and compares against codebase.
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { PROJECT_ROOT } from '../../utils/utils';
import { glob } from 'glob';

export interface TestGoalValidationResult {
  success: boolean;
  aligned: Array<{ goal: string; testFiles: string[] }>;
  gaps: Array<{ goal: string; expectedTests: string[] }>;
  extras: Array<{ testFile: string; reason: string }>;
  message: string;
}

/**
 * Extract test goals from test strategy section
 */
function extractTestGoals(testStrategySection: string): string[] {
  const goals: string[] = [];
  
  // Look for bullet points or numbered lists describing test requirements
  const bulletPattern = /[-*]\s*(.+?)(?:\n|$)/g;
  const numberedPattern = /^\d+\.\s*(.+?)$/gm;
  
  let match;
  
  // Extract from bullet points
  while ((match = bulletPattern.exec(testStrategySection)) !== null) {
    const goal = match[1].trim();
    if (goal && !goal.match(/^\[/)) { // Skip checkboxes
      goals.push(goal);
    }
  }
  
  // Extract from numbered lists
  while ((match = numberedPattern.exec(testStrategySection)) !== null) {
    const goal = match[1].trim();
    if (goal) {
      goals.push(goal);
    }
  }
  
  // Also look for explicit test type mentions
  const testTypePattern = /(unit\s+test|integration\s+test|component\s+test|e2e\s+test|end-to-end\s+test)/gi;
  const testTypes = testStrategySection.match(testTypePattern);
  if (testTypes) {
    testTypes.forEach(type => {
      if (!goals.some(g => g.toLowerCase().includes(type.toLowerCase()))) {
        goals.push(type);
      }
    });
  }
  
  return goals;
}

/**
 * Find test files matching a goal
 */
async function findMatchingTestFiles(goal: string): Promise<string[]> {
  const testFiles: string[] = [];
  
  // Search for test files
  const allTestFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
    cwd: PROJECT_ROOT,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });
  
  // Simple keyword matching - could be enhanced with more sophisticated matching
  const goalLower = goal.toLowerCase();
  
  for (const testFile of allTestFiles) {
    const fileName = testFile.toLowerCase();
    
    // Check if goal keywords appear in filename
    const goalKeywords = goalLower.split(/\s+/).filter(k => k.length > 3);
    const matches = goalKeywords.some(keyword => fileName.includes(keyword));
    
    if (matches) {
      testFiles.push(testFile);
    }
  }
  
  return testFiles;
}

/**
 * Validate test goals for a tier
 */
export async function validateTestGoals(
  tier: 'session' | 'phase' | 'feature',
  id: string
): Promise<TestGoalValidationResult> {
  const context = await WorkflowCommandContext.getCurrent();
  let guideContent = '';
  
  try {
    // Read appropriate guide based on tier
    if (tier === 'session') {
      guideContent = await context.readSessionGuide(id);
    } else if (tier === 'phase') {
      guideContent = await context.readPhaseGuide(id);
    } else if (tier === 'feature') {
      guideContent = await context.readFeatureGuide();
    }
  } catch (_error) {
    return {
      success: false,
      aligned: [],
      gaps: [],
      extras: [],
      message: `Failed to read ${tier} guide: ${_error instanceof Error ? _error.message : String(_error)}`,
    };
  }
  
  // Extract test strategy section
  const testStrategyMatch = guideContent.match(/##\s*Test\s+Strategy([\s\S]*?)(?=##|$)/i);
  
  if (!testStrategyMatch) {
    return {
      success: false,
      aligned: [],
      gaps: [],
      extras: [],
      message: `No "Test Strategy" section found in ${tier} guide. Please add a test strategy section documenting test requirements.`,
    };
  }
  
  const testStrategySection = testStrategyMatch[1];
  const goals = extractTestGoals(testStrategySection);
  
  if (goals.length === 0) {
    return {
      success: false,
      aligned: [],
      gaps: [],
      extras: [],
      message: `Test Strategy section found but no test goals extracted. Please document specific test requirements.`,
    };
  }
  
  // Validate each goal against actual test files
  const aligned: Array<{ goal: string; testFiles: string[] }> = [];
  const gaps: Array<{ goal: string; expectedTests: string[] }> = [];
  
  for (const goal of goals) {
    const matchingFiles = await findMatchingTestFiles(goal);
    
    if (matchingFiles.length > 0) {
      aligned.push({ goal, testFiles: matchingFiles });
    } else {
      // Try to infer expected test file names from goal
      const expectedTests: string[] = [];
      const goalWords = goal.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      if (goalWords.length > 0) {
        const baseName = goalWords[0];
        expectedTests.push(`**/${baseName}*.test.ts`);
        expectedTests.push(`**/${baseName}*.spec.ts`);
      }
      gaps.push({ goal, expectedTests });
    }
  }
  
  // Find extra test files (exist but not documented)
  const allTestFiles = await glob('**/*.{test,spec}.{ts,tsx,js,jsx}', {
    cwd: PROJECT_ROOT,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  });
  
  const documentedFiles = new Set(aligned.flatMap(a => a.testFiles));
  const extras: Array<{ testFile: string; reason: string }> = [];
  
  for (const testFile of allTestFiles) {
    if (!documentedFiles.has(testFile)) {
      extras.push({
        testFile,
        reason: 'Test file exists but not mentioned in test strategy',
      });
    }
  }
  
  const success = gaps.length === 0;
  const message = success
    ? `✅ All test goals aligned: ${aligned.length} goal(s) have matching test files`
    : `❌ Test goal validation failed: ${gaps.length} goal(s) missing test files, ${aligned.length} goal(s) aligned`;
  
  return {
    success,
    aligned,
    gaps,
    extras,
    message,
  };
}

