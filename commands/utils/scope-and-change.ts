/**
 * Composite Command: /scope-and-change [description]
 * 
 * Tier: Utility (Cross-Tier)
 * Operates on: Conversation context and change requests
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * Purpose: Analyze conversation context, determine tier, and automatically execute
 * change request commands for safe changes, or show analysis for review for larger changes.
 * 
 * Auto-execution criteria (ALL must be met):
 * - Tier confidence: HIGH
 * - Tier level: Session or Task (not Feature/Phase)
 * - Complexity: LOW
 * - Files affected: ≤ 3 files
 * - No dependencies mentioned
 * - No research needed
 * 
 * If criteria not met, shows full analysis and requires manual execution.
 * 
 * Workflow:
 * 1. Read conversation context (stdin/env/file/param)
 * 2. Run scope-and-summarize to get tier analysis
 * 3. Check auto-execution criteria
 * 4. If safe: Auto-execute appropriate change command
 * 5. If not safe: Show analysis, require manual execution
 */

import { scopeAndSummarize, ScopeAndSummarizeParams, ScopeAndSummarizeResult, cleanupScopeDocument } from './scope-and-summarize';
import { changeRequest, ChangeRequestParams } from '../tiers/session/composite/session-change';
import { taskChange, TaskChangeRequestParams } from '../tiers/task/composite/task-change';
import { phaseChange, PhaseChangeRequestParams } from '../tiers/phase/composite/phase-change';
import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { WorkflowId } from './id-utils';
import { appendLog } from './append-log';
import { getCurrentDate } from './utils';

export interface ScopeAndChangeParams extends ScopeAndSummarizeParams {
  sessionId?: string; // Optional - will try to extract from context if not provided
  taskId?: string; // Optional - will try to extract from context if not provided
  phase?: string; // Optional - will try to extract from context if not provided
  forceManual?: boolean; // Force manual execution even if criteria met
}

export interface ScopeAndChangeResult {
  success: boolean;
  autoExecuted: boolean;
  tierAnalysis: ScopeAndSummarizeResult['tierAnalysis'];
  changeResult?: any;
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
 * Check if change is safe for auto-execution
 */
function isSafeForAutoExecution(
  result: ScopeAndSummarizeResult,
  params: ScopeAndChangeParams
): { safe: boolean; reasons: string[] } {
  if (params.forceManual) {
    return { safe: false, reasons: ['Manual execution forced by user'] };
  }
  
  const reasons: string[] = [];
  const { tierAnalysis } = result;
  
  // Check confidence
  if (tierAnalysis.confidence !== 'high') {
    reasons.push(`Tier confidence is ${tierAnalysis.confidence} (requires HIGH)`);
  }
  
  // Check tier level (only Session/Task allowed)
  if (tierAnalysis.tier === 'feature' || tierAnalysis.tier === 'phase') {
    reasons.push(`Tier is ${tierAnalysis.tier} (only Session/Task allowed for auto-execution)`);
  }
  
  // Check complexity
  if (tierAnalysis.scopeAssessment.complexity !== 'low') {
    reasons.push(`Complexity is ${tierAnalysis.scopeAssessment.complexity} (requires LOW)`);
  }
  
  // Check files affected
  if (result.filesAffected.length > 3) {
    reasons.push(`Too many files affected (${result.filesAffected.length}, max 3)`);
  }
  
  // Check dependencies
  if (tierAnalysis.scopeAssessment.dependencies.length > 0) {
    reasons.push(`Dependencies mentioned: ${tierAnalysis.scopeAssessment.dependencies.join(', ')}`);
  }
  
  // Check research needed
  if (tierAnalysis.scopeAssessment.researchNeeded) {
    reasons.push('Research needed (requires manual review)');
  }
  
  const safe = reasons.length === 0;
  return { safe, reasons };
}

/**
 * Log scope analysis to appropriate log file
 */
async function logScopeAnalysis(
  summaryResult: ScopeAndSummarizeResult,
  sessionId: string | undefined,
  taskId: string | undefined,
  featureName: string
): Promise<void> {
  const context = new WorkflowCommandContext(featureName);
  const date = getCurrentDate();
  
  // Extract useful content from scope document
  const logContent = `## Change Request Analysis - ${date}

**Tier:** ${summaryResult.tierAnalysis?.tier || 'Unknown'}
**Confidence:** ${summaryResult.tierAnalysis?.confidence || 'Unknown'}

### Summary
${summaryResult.summary}

### Key Changes
${summaryResult.keyChanges.length > 0 ? summaryResult.keyChanges.map((change, i) => `${i + 1}. ${change}`).join('\n') : '- [No structured changes identified]'}

### Scope Assessment
- **Duration:** ${summaryResult.tierAnalysis?.scopeAssessment.duration || 'Unknown'}
- **Complexity:** ${summaryResult.tierAnalysis?.scopeAssessment.complexity || 'Unknown'}
- **Files Affected:** ${summaryResult.filesAffected.length > 0 ? summaryResult.filesAffected.map(f => `\`${f}\``).join(', ') : 'None identified'}
- **Research Needed:** ${summaryResult.tierAnalysis?.scopeAssessment.researchNeeded ? 'Yes' : 'No'}

### Tier Reasoning
${summaryResult.tierAnalysis?.reasoning.map(r => `- ${r}`).join('\n') || '- [No reasoning available]'}

---
`;
  
  // Append to appropriate log
  try {
    if (taskId) {
      const parsed = WorkflowId.parseTaskId(taskId);
      if (parsed) {
        const sessionIdFromTask = `${parsed.phase}.${parsed.session}`;
        await appendLog(logContent, 'session', sessionIdFromTask, featureName);
      }
    } else if (sessionId) {
      await appendLog(logContent, 'session', sessionId, featureName);
    } else {
      // Fall back to feature log
      await context.appendFeatureLog(logContent);
    }
  } catch (error) {
    console.warn(`Warning: Failed to log scope analysis: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Scope and change - hybrid auto-execution command
 */
export async function scopeAndChange(
  params: ScopeAndChangeParams = {},
  featureName: string = 'vue-migration'
): Promise<ScopeAndChangeResult> {
  // Step 1: Extract current context if IDs not provided
  let { sessionId, taskId, phase } = params;
  if (!sessionId && !taskId && !phase) {
    const context = await extractCurrentContext(featureName);
    sessionId = sessionId || context.sessionId;
    taskId = taskId || context.taskId;
    phase = phase || context.phase;
  }
  
  // Step 2: Run scope-and-summarize with context and document creation
  const summarizeParams: ScopeAndSummarizeParams = {
    ...params,
    currentSessionId: sessionId,
    currentPhase: phase,
    createDocument: true, // Always create document for scope-and-change
  };
  const summaryResult = await scopeAndSummarize(summarizeParams, featureName);
  
  // Step 3: Check if change is already planned downstream
  if (summaryResult.downstreamMatch) {
    return {
      success: true,
      autoExecuted: false,
      tierAnalysis: summaryResult.tierAnalysis,
      output: summaryResult.output,
      documentPath: summaryResult.documentPath,
    };
  }
  
  // Step 4: Check auto-execution criteria
  const safetyCheck = isSafeForAutoExecution(summaryResult, params);
  
  // Step 5: Determine if we can auto-execute
  const canAutoExecute = safetyCheck.safe && 
    summaryResult.tierAnalysis &&
    (summaryResult.tierAnalysis.tier === 'session' || summaryResult.tierAnalysis.tier === 'task') &&
    (sessionId || taskId);
  
  if (canAutoExecute) {
    // Auto-execute appropriate change command
    try {
      const description = summaryResult.summary || params.description || '';
      let changeResult: any;
      
      if (summaryResult.tierAnalysis.tier === 'task' && taskId) {
        // Execute task-change
        if (!WorkflowId.isValidTaskId(taskId)) {
          throw new Error(`Invalid task ID: ${taskId}. Expected format: X.Y.Z`);
        }
        
        changeResult = await taskChange({
          description,
          taskId,
        }, featureName);
        
        // Log scope analysis and cleanup document
        await logScopeAnalysis(summaryResult, sessionId, taskId, featureName);
        if (summaryResult.documentPath) {
          await cleanupScopeDocument(summaryResult.documentPath);
        }
        
        return {
          success: true,
          autoExecuted: true,
          tierAnalysis: summaryResult.tierAnalysis,
          changeResult,
          output: `## ✅ Auto-Executed: /task-change

**Reason:** All safety criteria met for auto-execution:
- Tier: Task (HIGH confidence)
- Complexity: LOW
- Files affected: ${summaryResult.filesAffected.length} (≤ 3)
- No dependencies
- No research needed

### Change Request Executed
${changeResult.output}

### Summary
${summaryResult.output}

**Note:** Scope analysis has been logged and temporary scope document cleaned up.`,
        };
      } else if (summaryResult.tierAnalysis.tier === 'session' && sessionId) {
        // Execute session-change
        if (!WorkflowId.isValidSessionId(sessionId)) {
          throw new Error(`Invalid session ID: ${sessionId}. Expected format: X.Y`);
        }
        
        changeResult = await changeRequest({
          description,
          sessionId,
        }, featureName);
        
        // Log scope analysis and cleanup document
        await logScopeAnalysis(summaryResult, sessionId, taskId, featureName);
        if (summaryResult.documentPath) {
          await cleanupScopeDocument(summaryResult.documentPath);
        }
        
        return {
          success: true,
          autoExecuted: true,
          tierAnalysis: summaryResult.tierAnalysis,
          changeResult,
          output: `## ✅ Auto-Executed: /session-change

**Reason:** All safety criteria met for auto-execution:
- Tier: Session (HIGH confidence)
- Complexity: LOW
- Files affected: ${summaryResult.filesAffected.length} (≤ 3)
- No dependencies
- No research needed

### Change Request Executed
${changeResult.output}

### Summary
${summaryResult.output}

**Note:** Scope analysis has been logged and temporary scope document cleaned up.`,
        };
      } else {
        throw new Error(`Cannot auto-execute: Missing required ID (sessionId or taskId)`);
      }
    } catch (error) {
      // If auto-execution fails, fall back to showing analysis
      return {
        success: false,
        autoExecuted: false,
        tierAnalysis: summaryResult.tierAnalysis,
        output: `## ⚠️ Auto-Execution Failed

**Error:** ${error instanceof Error ? error.message : String(error)}

### Analysis
${summaryResult.output}

### Manual Execution Required
Please review the analysis above and execute the appropriate change command manually:
- \`${summaryResult.tierAnalysis.suggestedCommand}\`
- Or use: \`/session-change "${summaryResult.summary}"\` (if session-level)
- Or use: \`/task-change "${summaryResult.summary}"\` (if task-level)`,
      };
    }
  } else {
    // Show analysis and require manual execution
    const reasonsList = safetyCheck.reasons.length > 0
      ? `\n**Reasons for manual review:**\n${safetyCheck.reasons.map(r => `- ${r}`).join('\n')}`
      : '';
    
    const missingIdNote = !sessionId && !taskId && !phase
      ? '\n**Note:** Could not determine current session/task/phase from context. Please provide explicitly or run from within a session context.'
      : '';
    
    return {
      success: true,
      autoExecuted: false,
      tierAnalysis: summaryResult.tierAnalysis,
      output: `## ⚠️ Requires Review Before Execution

**Tier:** ${summaryResult.tierAnalysis.tier.charAt(0).toUpperCase() + summaryResult.tierAnalysis.tier.slice(1)}
**Confidence:** ${summaryResult.tierAnalysis.confidence.charAt(0).toUpperCase() + summaryResult.tierAnalysis.confidence.slice(1)}${reasonsList}${missingIdNote}

### Analysis
${summaryResult.output}

### Manual Execution Required
Please review the analysis above and execute the appropriate change command manually:

**Suggested command:**
\`\`\`
${summaryResult.tierAnalysis.suggestedCommand}
\`\`\`

**Or use tier-specific change command:**
${summaryResult.tierAnalysis.tier === 'session' && sessionId
  ? `\`\`\`\n/session-change "${summaryResult.summary}" ${sessionId}\n\`\`\``
  : summaryResult.tierAnalysis.tier === 'task' && taskId
  ? `\`\`\`\n/task-change "${summaryResult.summary}" ${taskId}\n\`\`\``
  : summaryResult.tierAnalysis.tier === 'phase' && phase
  ? `\`\`\`\n/phase-change "${summaryResult.summary}" ${phase}\n\`\`\``
  : `\`\`\`\n/${summaryResult.tierAnalysis.tier}-change "${summaryResult.summary}"\n\`\`\``
}`,
    };
  }
}

