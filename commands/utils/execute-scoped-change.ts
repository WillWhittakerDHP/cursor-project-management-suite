/**
 * Composite Utility (Internal): executeScopedChange
 * 
 * Tier: Utility (Cross-Tier)
 * Operates on: Scope documents and change requests
 * 
 * Mode: Agent Mode (execution)
 * 
 * Purpose: Find and execute a change request using an existing scope document.
 * No re-scoping, no downstream check, no kickout - just execute using the plan.
 * 
 * Workflow:
 * 1. Find most recent scope document for session (pattern: session-{X.Y}-scope-*.md)
 * 2. Parse scope document to extract analysis data
 * 3. Execute appropriate change command using extracted data
 * 4. Log analysis to session log
 * 5. Delete scope document after execution
 */

import { readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { PROJECT_ROOT } from './utils';
import { executeChangeRequest } from './execute-change-request';
import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { logScopeAnalysis } from './scope-and-summarize';
import { ScopeAndSummarizeResult } from './scope-and-summarize';
import { TierAnalysis } from './tier-discriminator';
import { extractFilePaths } from '../../../../utils/context-gatherer';

export interface ExecuteScopedChangeParams {
  sessionId?: string; // Format: X.Y (e.g., "4.2")
  taskId?: string; // Format: X.Y.Z (e.g., "4.2.1")
  phase?: string; // Format: N (e.g., "4")
  featureName?: string;
}

export interface ExecuteScopedChangeResult {
  success: boolean;
  scopeDocumentPath?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  changeResult?: any;
  output: string;
}

/**
 * Find most recent scope document for session
 */
async function findScopeDocument(
  sessionId: string | undefined,
  featureName: string
): Promise<string | null> {
  const context = new WorkflowCommandContext(featureName);
  const sessionsDir = join(PROJECT_ROOT, context.paths.getBasePath(), 'sessions');
  
  try {
    const files = await readdir(sessionsDir);
    
    // Filter for scope documents matching pattern: session-{X.Y}-scope-*.md
    const scopePattern = sessionId 
      ? new RegExp(`^session-${sessionId.replace(/\./g, '\\.')}-scope-\\d+\\.md$`)
      : /^session-[\d.]+-scope-\d+\.md$/;
    
    const scopeFiles = files
      .filter(f => scopePattern.test(f))
      .map(f => ({
        name: f,
        path: join(sessionsDir, f),
        timestamp: parseInt(f.match(/scope-(\d+)\.md$/)?.[1] || '0', 10),
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Most recent first
    
    if (scopeFiles.length === 0) {
      return null;
    }
    
    return scopeFiles[0].path;
  } catch {} {
    return null;
  }
}

/**
 * Parse scope document to extract analysis data
 */
function parseScopeDocument(content: string): {
  sessionId?: string;
  taskId?: string;
  phase?: string;
  description: string;
  tierAnalysis?: TierAnalysis;
  keyChanges: string[];
  filesAffected: string[];
  summary: string;
} {
  // Extract metadata from header
  const sessionMatch = content.match(/\*\*Session:\*\*\s*([^\n]+)/);
  const taskMatch = content.match(/\*\*Task:\*\*\s*([^\n]+)/);
  const phaseMatch = content.match(/\*\*Phase:\*\*\s*([^\n]+)/);
  
  const sessionId = sessionMatch?.[1]?.trim();
  const taskId = taskMatch?.[1]?.trim();
  const phase = phaseMatch?.[1]?.trim();
  
  // Extract summary from "### Summary" section
  const summarySection = MarkdownUtils.extractSection(content, 'Summary');
  const summary = summarySection ? summarySection.split('\n').slice(0, 3).join(' ').substring(0, 200) : '';
  
  // Extract key changes
  const keyChangesSection = MarkdownUtils.extractSection(content, 'Key Changes');
  const keyChanges: string[] = [];
  if (keyChangesSection) {
    const lines = keyChangesSection.split('\n');
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.+)$/);
      if (match) {
        keyChanges.push(match[1].trim());
      }
    }
  }
  
  // Extract files affected
  const filesAffected = extractFilePaths(content);
  
  // Extract description from "Ready for Change Request" section
  const readySection = MarkdownUtils.extractSection(content, 'Ready for Change Request');
  let description = summary;
  if (readySection) {
    const codeBlockMatch = readySection.match(/```\s*\n([^`]+)\n```/);
    if (codeBlockMatch) {
      description = codeBlockMatch[1].trim();
    }
  }
  
  // Extract tier from document
  const tierMatch = content.match(/\*\*Tier:\*\*\s*(\w+)/i);
  const confidenceMatch = content.match(/\*\*Confidence:\*\*\s*(\w+)/i);
  
  // Build basic tier analysis (we don't need full analysis for execution)
  const tierAnalysis: TierAnalysis | undefined = tierMatch ? {
    tier: tierMatch[1].toLowerCase() as 'feature' | 'phase' | 'session' | 'task',
    confidence: confidenceMatch?.[1].toLowerCase() as 'high' | 'medium' | 'low' || 'medium',
    reasoning: [],
    suggestedCommand: '',
    scopeAssessment: {
      duration: 'Unknown',
      complexity: 'medium',
      dependencies: [],
      researchNeeded: false,
    },
  } : undefined;
  
  return {
    sessionId: sessionId !== 'Unknown' ? sessionId : undefined,
    taskId,
    phase,
    description,
    tierAnalysis,
    keyChanges,
    filesAffected,
    summary,
  };
}

/**
 * Execute scoped change using scope document
 */
export async function executeScopedChange(
  params: ExecuteScopedChangeParams = {},
  featureName: string = 'vue-migration'
): Promise<ExecuteScopedChangeResult> {
  // Step 1: Find scope document
  const scopeDocumentPath = await findScopeDocument(params.sessionId, featureName);
  
  if (!scopeDocumentPath) {
    const sessionPart = params.sessionId ? ` for session ${params.sessionId}` : '';
    return {
      success: false,
      output: `## ❌ Scope Document Not Found

No scope document found${sessionPart}.

**Expected pattern:** \`session-{X.Y}-scope-{YYYYMMDD}.md\`

**To create a scope document:**
1. Run \`/scope-and-summarize [description]\` or \`/scope-and-change [description]\`
2. This will create a scope document that can be executed later

**Or provide session ID explicitly:**
\`/execute-scoped-change {sessionId}\`
`,
    };
  }
  
  // Step 2: Parse scope document
  let parsedData;
  try {
    const content = await readFile(scopeDocumentPath, 'utf-8');
    parsedData = parseScopeDocument(content);
  } catch (error) {
    return {
      success: false,
      scopeDocumentPath,
      output: `## ❌ Failed to Parse Scope Document

**Error:** ${error instanceof Error ? error.message : String(error)}

**Document:** \`${scopeDocumentPath}\`

Please check the document format or create a new scope document.`,
    };
  }
  
  // Step 3: Determine session/task/phase IDs (use parsed or provided)
  const sessionId = parsedData.sessionId || params.sessionId;
  const taskId = parsedData.taskId || params.taskId;
  const phase = parsedData.phase || params.phase;
  
  if (!sessionId && !taskId && !phase) {
    return {
      success: false,
      scopeDocumentPath,
      output: `## ❌ Missing Required IDs

Scope document does not contain session/task/phase IDs, and none were provided.

**Parsed from document:**
- Session: ${parsedData.sessionId || 'Not found'}
- Task: ${parsedData.taskId || 'Not found'}
- Phase: ${parsedData.phase || 'Not found'}

**Please provide session ID:**
\`/execute-scoped-change {sessionId}\`
`,
    };
  }
  
  // Step 4: Execute change using atomic command
  if (!parsedData.tierAnalysis) {
    return {
      success: false,
      scopeDocumentPath,
      output: `## ❌ Missing Tier Analysis

Scope document does not contain tier analysis required for execution.

**Please create a new scope document using:**
\`/scope-and-change [description]\` or \`/scope-and-plan [description]\`
`,
    };
  }
  
  try {
    const description = parsedData.description || parsedData.summary;
    
    const executionResult = await executeChangeRequest({
        description,
      tierAnalysis: parsedData.tierAnalysis,
      sessionId,
        taskId,
        phase,
      featureName,
    });
      
    if (!executionResult.success) {
      throw new Error(executionResult.output);
      }
      
    const changeResult = executionResult.changeResult;
    
    // Step 5: Log analysis (create summary result for logging)
    const summaryResult: ScopeAndSummarizeResult = {
      success: true,
      tierAnalysis: parsedData.tierAnalysis,
      summary: parsedData.summary,
      keyChanges: parsedData.keyChanges,
      filesAffected: parsedData.filesAffected,
      output: '', // Not needed for logging
      documentPath: scopeDocumentPath,
      downstreamMatch: false,
    };
    
    await logScopeAnalysis(summaryResult, sessionId, taskId, featureName);
    
    // Step 6: Delete scope document
    try {
      await unlink(scopeDocumentPath);
    } catch (error) {
      console.warn(`Warning: Failed to delete scope document: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      success: true,
      scopeDocumentPath,
      changeResult,
      output: `## ✅ Change Executed

**Scope Document:** \`${scopeDocumentPath}\`
**Tier:** ${parsedData.tierAnalysis.tier || 'Session'}
**Executed:** ${parsedData.tierAnalysis.tier === 'task' ? `/task-change` : parsedData.tierAnalysis.tier === 'phase' ? `/phase-change` : `/session-change`}

### Change Request Executed
${executionResult.output}

**Note:** Scope analysis has been logged and scope document cleaned up.`,
    };
    
  } catch (error) {
    return {
      success: false,
      scopeDocumentPath,
      output: `## ❌ Execution Failed

**Error:** ${error instanceof Error ? error.message : String(error)}

**Scope Document:** \`${scopeDocumentPath}\`

**Parsed Data:**
- Session: ${sessionId || 'Not found'}
- Task: ${taskId || 'Not found'}
- Phase: ${phase || 'Not found'}
- Tier: ${parsedData.tierAnalysis?.tier || 'Unknown'}

Please check the scope document and try again.`,
    };
  }
}

