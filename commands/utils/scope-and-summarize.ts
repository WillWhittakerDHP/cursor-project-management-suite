/**
 * Composite Command: /scope-and-summarize [description]
 * 
 * Tier: Utility (Cross-Tier)
 * Operates on: Conversation context and change requests
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * Purpose: Analyze conversation context, determine appropriate tier using tier discriminator,
 * and generate a formatted summary optimized for change request commands.
 * 
 * Workflow:
 * 1. Read conversation context from stdin, environment variable, file, or parameter
 * 2. Apply tier discriminator logic to determine tier
 * 3. Extract key changes and scope information
 * 4. Generate formatted summary ready for change request commands
 * 
 * Context Sources (priority order):
 * 1. stdin input (if piped from another command)
 * 2. Environment variable CURSOR_CONVERSATION_CONTEXT
 * 3. File path parameter (if provided)
 * 4. Direct description parameter (fallback)
 */

import { determineTier, TierAnalysis } from './tier-discriminator';
import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT, getCurrentDate } from './utils';
import { extractFilePaths } from '../../../../utils/context-gatherer';
import { checkDownstreamPlans } from './check-downstream-plans';
import { WorkflowCommandContext } from './command-context';

export interface ScopeAndSummarizeParams {
  description?: string;
  contextFile?: string;
  featureName?: string;
  currentSessionId?: string; // Format: X.Y (e.g., "4.2")
  currentPhase?: string; // Format: N (e.g., "4")
  createDocument?: boolean; // Create scope-and-summary document file
}

export interface ScopeAndSummarizeResult {
  success: boolean;
  tierAnalysis?: TierAnalysis;
  summary: string;
  keyChanges: string[];
  filesAffected: string[];
  output: string;
  documentPath?: string; // Path to created scope document
  downstreamMatch?: boolean; // True if change is already planned downstream
}

/**
 * Read conversation context from various sources
 */
async function readConversationContext(params: ScopeAndSummarizeParams): Promise<string> {
  // Priority 1: stdin (if available and not a TTY)
  if (process.stdin.isTTY === false) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8').trim();
      if (stdinContent) {
        return stdinContent;
      }
    } catch (error) {
      // Silently fall through to next source
    }
  }
  
  // Priority 2: Environment variable
  if (process.env.CURSOR_CONVERSATION_CONTEXT) {
    return process.env.CURSOR_CONVERSATION_CONTEXT;
  }
  
  // Priority 3: File path parameter
  if (params.contextFile) {
    try {
      const filePath = join(PROJECT_ROOT, params.contextFile);
      return await readFile(filePath, 'utf-8');
    } catch {} {
      throw new Error(`Failed to read context file: ${params.contextFile}`);
    }
  }
  
  // Priority 4: Direct description parameter
  if (params.description) {
    return params.description;
  }
  
  throw new Error('No conversation context available. Provide description, context file, or pipe input.');
}

/**
 * Extract key changes from conversation context
 */
function extractKeyChanges(context: string): string[] {
  const changes: string[] = [];
  const lines = context.split('\n');
  
  // Look for bullet points, numbered lists, or action items
  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points or numbered lists
    if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      const content = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
      if (content.length > 10) { // Filter out very short items
        changes.push(content);
      }
    }
    // Match "change", "update", "add", "remove", "rename" patterns
    else if (trimmed.match(/\b(change|update|add|remove|rename|refactor|migrate|implement|create)\b/i)) {
      if (trimmed.length > 20 && trimmed.length < 200) {
        changes.push(trimmed);
      }
    }
  }
  
  // If no structured changes found, extract sentences with action verbs
  if (changes.length === 0) {
    const sentences = context.split(/[.!?]\s+/);
    for (const sentence of sentences) {
      if (sentence.match(/\b(change|update|add|remove|rename|refactor|migrate|implement|create|fix|modify)\b/i)) {
        if (sentence.length > 20 && sentence.length < 200) {
          changes.push(sentence.trim());
        }
      }
    }
  }
  
  // Limit to top 5 changes
  return changes.slice(0, 5);
}

/**
 * Generate formatted summary for change request commands
 */
function generateChangeRequestDescription(
  context: string,
  tierAnalysis: TierAnalysis,
  keyChanges: string[],
  filesAffected: string[]
): string {
  // Use the original description if available, otherwise summarize
  const summary = keyChanges.length > 0
    ? keyChanges.join('. ')
    : context.split('\n').slice(0, 3).join(' ').substring(0, 200);
  
  // Build description with context
  let description = summary;
  
  if (filesAffected.length > 0) {
    description += `\n\nFiles affected: ${filesAffected.slice(0, 5).join(', ')}`;
  }
  
  return description;
}

/**
 * Create scope-and-summary document file
 */
async function createScopeDocument(
  content: string,
  sessionId: string | undefined,
  featureName: string
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sessionPart = sessionId ? `session-${sessionId}-` : 'session-unknown-';
  const fileName = `${sessionPart}scope-${timestamp}.md`;
  const filePath = join(PROJECT_ROOT, context.paths.basePath, 'sessions', fileName);
  
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Scope and summarize conversation context
 */
export async function scopeAndSummarize(
  params: ScopeAndSummarizeParams = {},
  featureName: string = 'vue-migration'
): Promise<ScopeAndSummarizeResult> {
  // Read conversation context
  const context = await readConversationContext(params);
  
  // Step 1: Check if change is already planned downstream
  const downstreamCheck = await checkDownstreamPlans({
    description: context,
    currentSessionId: params.currentSessionId,
    currentPhase: params.currentPhase,
    featureName: params.featureName || featureName,
  }, featureName);
  
  if (downstreamCheck.hasMatches) {
    // Change is already planned, return early
    return {
      success: true,
      summary: context.split('\n').slice(0, 3).join(' ').substring(0, 200),
      keyChanges: [],
      filesAffected: [],
      output: downstreamCheck.output,
      downstreamMatch: true,
    };
  }
  
  // Step 2: Determine tier
  const tierAnalysis = determineTier(context);
  
  // Extract key changes
  const keyChanges = extractKeyChanges(context);
  
  // Extract files mentioned
  const filesAffected = extractFilePaths(context);
  
  // Generate change request description
  const changeRequestDescription = generateChangeRequestDescription(
    context,
    tierAnalysis,
    keyChanges,
    filesAffected
  );
  
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
  const output = `## Scope and Summary

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
${changeRequestDescription}
\`\`\`

**Suggested command:**
\`\`\`
${changeRequestCommand} "${changeRequestDescription.split('\n')[0]}"
\`\`\`
`;
  
  // Step 3: Create document if requested
  let documentPath: string | undefined;
  if (params.createDocument) {
    try {
      documentPath = await createScopeDocument(output, params.currentSessionId, featureName);
    } catch (error) {
      console.warn(`Warning: Failed to create scope document: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  return {
    success: true,
    tierAnalysis,
    summary: context.split('\n').slice(0, 3).join(' ').substring(0, 200),
    keyChanges,
    filesAffected,
    output,
    documentPath,
    downstreamMatch: false,
  };
}

/**
 * Cleanup scope document after logging
 */
export async function cleanupScopeDocument(documentPath: string): Promise<void> {
  try {
    await unlink(documentPath);
  } catch (error) {
    console.warn(`Warning: Failed to delete scope document ${documentPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

