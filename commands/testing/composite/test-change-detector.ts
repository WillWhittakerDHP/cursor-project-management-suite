/**
 * Composite Command: Test Change Detector
 * 
 * Analyzes code changes and predicts test impact BEFORE running tests.
 * This provides proactive warnings without auto-modifying tests.
 * 
 * LEARNING: Proactive detection allows us to warn users before tests fail
 * WHY: Better UX - users can prepare for test updates when feature changes
 * PATTERN: Strategy pattern - different detection strategies for different change types
 * RESOURCE: Test immutability rules in .cursor/rules/immutable-tests.mdc
 */

import { access, stat } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { execSync } from 'child_process';

/**
 * Type of code change detected
 * - breaking: Changes that will definitely break tests (signature changes, renames)
 * - non-breaking: Changes that shouldn't break tests (internal refactors)
 * - internal: Changes to implementation details
 * - unknown: Cannot determine impact
 */
export type ChangeType = 'breaking' | 'non-breaking' | 'internal' | 'unknown';

/**
 * Confidence level in the change prediction
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Predicted test failure for a specific test file
 */
export interface TestFailurePrediction {
  testFile: string;
  likelyFailures: string[]; // Test names that might fail
  reason: string;
  suggestedAction: string;
}

/**
 * Analysis of code change impact on tests
 */
export interface TestImpactAnalysis {
  affectedTests: string[];
  changeType: ChangeType;
  confidence: ConfidenceLevel;
  predictions: TestFailurePrediction[];
  shouldPromptBeforeRunning: boolean;
  summary: string;
  detectedChanges: CodeChange[];
}

/**
 * Individual code change detected
 */
export interface CodeChange {
  type: 'signature' | 'rename' | 'add' | 'remove' | 'modify';
  location: string;
  details: string;
}

/**
 * Analyze code changes and predict test impact
 * 
 * @param changedFiles Array of file paths that changed
 * @param options Additional options for analysis
 * @returns Test impact analysis
 */
export async function analyzeCodeChangeImpact(
  changedFiles: string[],
  options: {
    includeUncommitted?: boolean; // Include uncommitted changes in git
    detailedAnalysis?: boolean; // Perform detailed code analysis
  } = {}
): Promise<TestImpactAnalysis> {
  const {
    includeUncommitted = true,
    detailedAnalysis = true,
  } = options;
  
  // Get all changed files (provided + uncommitted if requested)
  const allChangedFiles = includeUncommitted
    ? [...changedFiles, ...getUncommittedFiles()]
    : changedFiles;
  
  // Remove duplicates and filter to code files
  const uniqueChangedFiles = Array.from(new Set(allChangedFiles))
    .filter(file => isCodeFile(file))
    .filter(file => !isTestFile(file)); // Exclude test files from impact analysis
  
  // Find corresponding test files
  const affectedTests = await findAffectedTestFiles(uniqueChangedFiles);
  
  // Analyze changes for each file
  const detectedChanges: CodeChange[] = [];
  const predictions: TestFailurePrediction[] = [];
  
  for (const file of uniqueChangedFiles) {
    const changes = detailedAnalysis
      ? await analyzeFileChanges(file)
      : [];
    
    detectedChanges.push(...changes);
    
    // Find related test file
    const testFile = findTestFile(file);
    if (testFile && affectedTests.includes(testFile)) {
      const prediction = predictTestFailures(file, testFile, changes);
      if (prediction) {
        predictions.push(prediction);
      }
    }
  }
  
  // Determine overall change type and confidence
  const { changeType, confidence } = classifyChanges(detectedChanges);
  
  // Determine if we should prompt before running
  const shouldPromptBeforeRunning = 
    changeType === 'breaking' && confidence === 'high';
  
  // Generate summary
  const summary = generateSummary(
    uniqueChangedFiles,
    affectedTests,
    changeType,
    confidence,
    predictions
  );
  
  return {
    affectedTests,
    changeType,
    confidence,
    predictions,
    shouldPromptBeforeRunning,
    summary,
    detectedChanges,
  };
}

/**
 * Get uncommitted files from git status
 */
function getUncommittedFiles(): string[] {
  try {
    const output = execSync('git status --porcelain', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    
    return output
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Parse git status format: "XY filename"
        const parts = line.split(/\s+/);
        return parts.slice(1).join(' '); // Handle filenames with spaces
      })
      .filter(file => file.length > 0);
  } catch (err) {
    console.warn('Test change detector: getChangedFilesFromGit failed', err);
    return [];
  }
}

/**
 * Check if file is a code file (not test, not config)
 */
function isCodeFile(filePath: string): boolean {
  const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue'];
  const hasCodeExt = codeExtensions.some(ext => filePath.endsWith(ext));
  
  // Exclude config and build files
  const isConfigOrBuild = /\.(config|spec|test)\.(ts|js)$/.test(filePath) ||
                          filePath.includes('node_modules') ||
                          filePath.includes('dist/') ||
                          filePath.includes('build/');
  
  return hasCodeExt && !isConfigOrBuild;
}

/**
 * Check if file is a test file
 */
function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

/**
 * Find test files affected by changed code files
 */
async function findAffectedTestFiles(changedFiles: string[]): Promise<string[]> {
  const affectedTests: string[] = [];
  
  for (const file of changedFiles) {
    const testFile = findTestFile(file);
    if (testFile) {
      // Check if test file exists
      try {
        await access(join(PROJECT_ROOT, testFile));
        affectedTests.push(testFile);
      } catch (err) {
        console.warn('Test change detector: test file not found', testFile, err);
      }
    }
  }
  
  return Array.from(new Set(affectedTests));
}

/**
 * Find test file corresponding to a source file
 */
function findTestFile(sourcePath: string): string | null {
  // Convert source file path to test file path
  // e.g., src/utils/calculator.ts -> src/utils/calculator.test.ts
  const ext = sourcePath.match(/\.(ts|tsx|js|jsx|vue)$/)?.[0];
  if (!ext) return null;
  
  const basePath = sourcePath.replace(/\.(ts|tsx|js|jsx|vue)$/, '');
  
  // Try common test file patterns
  const testExtensions = [
    '.test.ts',
    '.test.tsx',
    '.spec.ts',
    '.spec.tsx',
    '.test.js',
    '.test.jsx',
  ];
  
  // Return first possible test path (existence check happens in caller)
  return `${basePath}${testExtensions[0]}`;
}

/**
 * Analyze changes in a specific file
 */
async function analyzeFileChanges(filePath: string): Promise<CodeChange[]> {
  const changes: CodeChange[] = [];
  
  try {
    // Get git diff for the file
    const diff = execSync(`git diff HEAD ${filePath}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    
    if (!diff) {
      // No git diff available (new file or uncommitted)
      return changes;
    }
    
    // Analyze diff for breaking changes
    const lines = diff.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect function signature changes
      if (line.startsWith('-') && /function|const.*=.*\(|export/.test(line)) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.startsWith('+')) {
          // Function signature changed
          changes.push({
            type: 'signature',
            location: filePath,
            details: `Function signature changed: ${line.substring(1).trim()}`,
          });
        }
      }
      
      // Detect exports being removed
      if (line.startsWith('-') && /export/.test(line)) {
        changes.push({
          type: 'remove',
          location: filePath,
          details: `Export removed: ${line.substring(1).trim()}`,
        });
      }
      
      // Detect renames
      if (line.startsWith('-') && /function|const|class|interface|type/.test(line)) {
        const match = line.match(/(?:function|const|class|interface|type)\s+(\w+)/);
        if (match) {
          changes.push({
            type: 'rename',
            location: filePath,
            details: `Possible rename: ${match[1]}`,
          });
        }
      }
    }
  } catch (err) {
    console.warn('Test change detector: analyzeFileChanges failed', filePath, err);
  }
  
  return changes;
}

/**
 * Predict test failures for a specific file
 */
function predictTestFailures(
  sourceFile: string,
  testFile: string,
  changes: CodeChange[]
): TestFailurePrediction | null {
  if (changes.length === 0) {
    return null;
  }
  
  const likelyFailures: string[] = [];
  const reasons: string[] = [];
  
  for (const change of changes) {
    switch (change.type) {
      case 'signature':
        likelyFailures.push('Tests calling modified function');
        reasons.push(change.details);
        break;
      case 'remove':
        likelyFailures.push('Tests importing removed export');
        reasons.push(change.details);
        break;
      case 'rename':
        likelyFailures.push('Tests referencing renamed symbol');
        reasons.push(change.details);
        break;
    }
  }
  
  if (likelyFailures.length === 0) {
    return null;
  }
  
  const reason = reasons.join('; ');
  const suggestedAction = getSuggestedAction(changes);
  
  return {
    testFile,
    likelyFailures: Array.from(new Set(likelyFailures)),
    reason,
    suggestedAction,
  };
}

/**
 * Get suggested action based on changes
 */
function getSuggestedAction(changes: CodeChange[]): string {
  const changeTypes = new Set(changes.map(c => c.type));
  
  if (changeTypes.has('signature')) {
    return 'Update test calls to match new function signature';
  }
  if (changeTypes.has('remove')) {
    return 'Remove or update tests for removed exports';
  }
  if (changeTypes.has('rename')) {
    return 'Update test imports and references to renamed symbols';
  }
  
  return 'Review tests and update as needed';
}

/**
 * Classify changes into overall change type and confidence
 */
function classifyChanges(
  changes: CodeChange[]
): { changeType: ChangeType; confidence: ConfidenceLevel } {
  if (changes.length === 0) {
    return { changeType: 'unknown', confidence: 'low' };
  }
  
  const changeTypes = new Set(changes.map(c => c.type));
  
  // Breaking changes: signature, remove, rename
  if (changeTypes.has('signature') || changeTypes.has('remove') || changeTypes.has('rename')) {
    return { changeType: 'breaking', confidence: 'high' };
  }
  
  // Non-breaking changes: add
  if (changeTypes.has('add')) {
    return { changeType: 'non-breaking', confidence: 'high' };
  }
  
  // Internal changes: modify
  if (changeTypes.has('modify')) {
    return { changeType: 'internal', confidence: 'medium' };
  }
  
  return { changeType: 'unknown', confidence: 'low' };
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  changedFiles: string[],
  affectedTests: string[],
  changeType: ChangeType,
  confidence: ConfidenceLevel,
  predictions: TestFailurePrediction[]
): string {
  const fileCount = changedFiles.length;
  const testCount = affectedTests.length;
  const predictionCount = predictions.length;
  
  let summary = `Detected ${fileCount} changed file(s) affecting ${testCount} test file(s).\n`;
  summary += `Change Type: ${changeType} (confidence: ${confidence})\n`;
  
  if (predictionCount > 0) {
    summary += `\n${predictionCount} test file(s) likely to have failures:\n`;
    for (const prediction of predictions) {
      summary += `  - ${prediction.testFile}\n`;
      summary += `    Reason: ${prediction.reason}\n`;
      summary += `    Action: ${prediction.suggestedAction}\n`;
    }
  }
  
  if (changeType === 'breaking' && confidence === 'high') {
    summary += `\n⚠️  Breaking changes detected. Tests may need updates.\n`;
    summary += `This is a FEATURE CHANGE - test modifications are allowed.\n`;
  }
  
  return summary;
}

/**
 * Get recently modified files (within time window)
 */
export async function getRecentlyModifiedFiles(
  windowMinutes: number = 5
): Promise<string[]> {
  try {
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;
    
    // Get uncommitted files from git
    const uncommittedFiles = getUncommittedFiles();
    
    // Check modification time of each file
    const recentFiles: string[] = [];
    
    for (const file of uncommittedFiles) {
      try {
        const filePath = join(PROJECT_ROOT, file);
        const stats = await stat(filePath);
        const modTime = stats.mtime.getTime();
        
        if (now - modTime <= windowMs) {
          recentFiles.push(file);
        }
      } catch (err) {
        console.warn('Test change detector: file stat failed', file, err);
      }
    }
    
    return recentFiles;
  } catch (err) {
    console.warn('Test change detector: getRecentlyModifiedFiles failed', err);
    return [];
  }
}


