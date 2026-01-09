/**
 * Composite Utility (Internal): scopeAndPlan
 * 
 * Tier: Utility (Cross-Tier)
 * Operates on: Conversation context and change requests
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * Purpose: Analyze conversation context, determine tier, and create a scope document
 * for later execution. This command is planning-only - it never executes changes.
 * 
 * IMPORTANT: This command creates a plan document (scope document) and that's it.
 * The plan document is created by calling createScopeDocument() - no other tools needed.
 * 
 * The AI agent should:
 * - Acknowledge that the plan document was created successfully
 * - NOT attempt to create another plan or call any planning tools
 * - NOT implement code changes
 * - NOT execute change requests
 * 
 * Execution happens later via /execute-scoped-change when the user explicitly requests it.
 * 
 * Workflow:
 * 1. scopeContext() - Analyze context
 * 2. checkDownstreamPlans() - Check for duplicates
 * 3. createScopeDocument() - Always create scope doc
 * 4. Return analysis with execute command reference
 * 
 * LEARNING: Planning-only command provides stable reference for later execution
 * WHY: Sometimes you want to plan without any possibility of auto-execution
 * PATTERN: Composable workflow using atomic commands
 */

import { scopeContext, ScopeContextParams } from './scope-context';
import { checkDownstreamPlans } from './check-downstream-plans';
import { createScopeDocument } from './create-scope-document';
import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { TierAnalysis } from './tier-discriminator';

export interface ScopeAndPlanParams extends ScopeContextParams {
  sessionId?: string; // Optional - will try to extract from context if not provided
  taskId?: string; // Optional - will try to extract from context if not provided
  phase?: string; // Optional - will try to extract from context if not provided
  featureName?: string;
}

export interface ScopeAndPlanResult {
  success: boolean;
  tierAnalysis?: TierAnalysis;
  output: string;
  documentPath?: string; // Path to scope document if created
}

/**
 * Extract current session/task/phase from handoff context
 */
async function extractCurrentContext(featureName: string): Promise<{
  sessionId?: string;
  taskId?: string;
  phase?: string;
}> {
  try {
    const context = new WorkflowCommandContext(featureName);
    const handoffContent = await context.readFeatureHandoff();
    
    // Try to extract session ID from "Current Status" or "Next Action"
    const currentStatus = MarkdownUtils.extractSection(handoffContent, 'Current Status');
    const nextAction = MarkdownUtils.extractSection(handoffContent, 'Next Action');
    
    const combined = (currentStatus || '') + '\n' + (nextAction || '');
    
    // Look for session pattern (X.Y)
    const sessionMatch = combined.match(/session\s+([\d.]+)/i) || combined.match(/(\d+\.\d+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : undefined;
    
    // Look for task pattern (X.Y.Z)
    const taskMatch = combined.match(/task\s+([\d.]+)/i) || combined.match(/(\d+\.\d+\.\d+)/);
    const taskId = taskMatch ? taskMatch[1] : undefined;
    
    // Look for phase pattern
    const phaseMatch = combined.match(/phase\s+(\d+)/i);
    const phase = phaseMatch ? phaseMatch[1] : undefined;
    
    return { sessionId, taskId, phase };
  } catch (error) {
    // Silently return empty if can't extract
    return {};
  }
}

/**
 * Generate formatted analysis output
 */
function generateAnalysisOutput(
  contextResult: Awaited<ReturnType<typeof scopeContext>>,
  tierAnalysis: TierAnalysis
): string {
  const { context, keyChanges, filesAffected } = contextResult;
  
  // Determine appropriate change request command based on tier
  let changeRequestCommand = '';
  switch (tierAnalysis.tier) {
    case 'feature':
      changeRequestCommand = '/feature-change';
      break;
    case 'phase':
      changeRequestCommand = '/phase-change';
      break;
    case 'session':
      changeRequestCommand = '/session-change';
      break;
    case 'task':
      changeRequestCommand = '/task-change';
      break;
  }
  
  // Format output
  return `## Scope and Summary

**Tier:** ${tierAnalysis.tier.charAt(0).toUpperCase() + tierAnalysis.tier.slice(1)}
**Confidence:** ${tierAnalysis.confidence.charAt(0).toUpperCase() + tierAnalysis.confidence.slice(1)}
**Recommended Command:** \`${tierAnalysis.suggestedCommand}\`

### Summary
${context.split('\n').slice(0, 5).join('\n').substring(0, 500)}${context.length > 500 ? '...' : ''}

### Key Changes
${keyChanges.length > 0 ? keyChanges.map((change, i) => `${i + 1}. ${change}`).join('\n') : '- [No structured changes identified]'}

### Scope Assessment
- **Duration:** ${tierAnalysis.scopeAssessment.duration}
- **Complexity:** ${tierAnalysis.scopeAssessment.complexity.charAt(0).toUpperCase() + tierAnalysis.scopeAssessment.complexity.slice(1)}
- **Files Affected:** ${filesAffected.length > 0 ? filesAffected.slice(0, 10).map(f => `\`${f}\``).join(', ') : 'None identified'}
- **Documentation Impact:** ${tierAnalysis.tier === 'task' ? 'Minimal' : 'Yes'}
- **Research Needed:** ${tierAnalysis.scopeAssessment.researchNeeded ? 'Yes' : 'No'}
${tierAnalysis.scopeAssessment.dependencies.length > 0 ? `- **Dependencies:** ${tierAnalysis.scopeAssessment.dependencies.join(', ')}` : ''}

### Tier Reasoning
${tierAnalysis.reasoning.map(r => `- ${r}`).join('\n')}

### Ready for Change Request
Copy this description:
\`\`\`
${contextResult.description}
\`\`\`

**Suggested command:**
\`\`\`
${changeRequestCommand} "${contextResult.description.split('\n')[0]}"
\`\`\`
`;
}

/**
 * Scope and plan - planning-only command
 * Uses atomic commands for composability
 */
export async function scopeAndPlan(
  params: ScopeAndPlanParams = {},
  featureName: string = 'vue-migration'
): Promise<ScopeAndPlanResult> {
  // Step 1: Extract current context if IDs not provided
  let { sessionId, taskId, phase } = params;
  if (!sessionId && !taskId && !phase) {
    const context = await extractCurrentContext(featureName);
    sessionId = sessionId || context.sessionId;
    taskId = taskId || context.taskId;
    phase = phase || context.phase;
  }
  
  // Step 2: Analyze context using atomic command
  const contextResult = await scopeContext({
    description: params.description,
    contextFile: params.contextFile,
  });
  
  // Step 3: Check if change is already planned downstream
  const downstreamCheck = await checkDownstreamPlans({
    description: contextResult.context,
    currentSessionId: sessionId,
    currentPhase: phase,
    featureName: params.featureName || featureName,
  }, featureName);
  
  if (downstreamCheck.hasMatches) {
    // Change is already planned, return early
    return {
      success: true,
      tierAnalysis: contextResult.tierAnalysis,
      output: downstreamCheck.output,
      documentPath: undefined,
    };
  }
  
  // Step 4: Always create scope document (planning-only)
  const analysisOutput = generateAnalysisOutput(contextResult, contextResult.tierAnalysis);
  
  const documentResult = await createScopeDocument({
    analysisOutput,
    sessionId,
    taskId,
    phase,
    featureName: params.featureName || featureName,
  });
  
  const executeCommand = sessionId 
    ? `/execute-scoped-change ${sessionId}`
    : taskId
    ? `/execute-scoped-change ${taskId.split('.').slice(0, 2).join('.')}` // Extract session from task
    : phase
    ? `/execute-scoped-change` // Will need to find by phase or provide session
    : '/execute-scoped-change [session-id]';
  
  return {
    success: true,
    tierAnalysis: contextResult.tierAnalysis,
    output: `## ✅ Plan Document Created Successfully

**The scope document (plan) has been created. This is the complete action - no further steps needed.**

### Plan Document Created
**Path:** \`${documentResult.documentPath}\`
**Status:** ✅ Created and ready for later execution

### Analysis
${analysisOutput}

### Next Steps (For User, Not AI Agent)
When the user is ready to execute this change request, they will:
1. Switch to **Agent Mode**
2. Run: \`${executeCommand}\`

This will:
1. Load the scope document
2. Execute the change request via the tier change command
3. Log the analysis
4. Clean up the scope document

---
**Note for AI Agent:** The plan document has been created by this command. 
**DO NOT attempt to create another plan or call any tools.**
**DO NOT implement code changes.**
**Simply acknowledge that the plan document was created successfully.**`,
    documentPath: documentResult.documentPath,
  };
}

