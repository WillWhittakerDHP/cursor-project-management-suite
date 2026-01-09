/**
 * Atomic Command: createScopeDocument
 * 
 * Purpose: Create stable scope document from analysis data
 * 
 * This is a pure function that creates scope documents.
 * Takes analysis data as input and writes document to disk.
 * 
 * LEARNING: Separating document creation allows reuse across commands
 * WHY: Multiple commands need to create scope documents - extract it once
 * PATTERN: Pure function pattern - takes input, produces output, minimal side effects
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT, getCurrentDate } from './utils';
import { WorkflowCommandContext } from './command-context';
import { TierAnalysis } from './tier-discriminator';

export interface CreateScopeDocumentParams {
  analysisOutput: string; // Formatted analysis output
  sessionId?: string;
  taskId?: string;
  phase?: string;
  featureName: string;
}

export interface CreateScopeDocumentResult {
  documentPath: string;
  documentContent: string;
}

/**
 * Create scope-and-summary document file with metadata header
 */
export async function createScopeDocument(
  params: CreateScopeDocumentParams
): Promise<CreateScopeDocumentResult> {
  const { analysisOutput, sessionId, taskId, phase, featureName } = params;
  
  const context = new WorkflowCommandContext(featureName);
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const sessionPart = sessionId ? `session-${sessionId}-` : 'session-unknown-';
  const fileName = `${sessionPart}scope-${timestamp}.md`;
  // Use base path to construct sessions directory path
  const sessionsDir = join(PROJECT_ROOT, context.paths.getBasePath(), 'sessions');
  const filePath = join(sessionsDir, fileName);
  
  // Add metadata header to content
  const date = getCurrentDate();
  const metadataHeader = `# Scope and Summary

**Session:** ${sessionId || 'Unknown'}
${taskId ? `**Task:** ${taskId}` : ''}
${phase ? `**Phase:** ${phase}` : ''}
**Created:** ${date}
**Status:** pending

---
`;
  
  const documentContent = metadataHeader + analysisOutput + `

---

## Execution
To execute this change: \`/execute-scoped-change ${sessionId || '[session-id]'}\`
`;
  
  await writeFile(filePath, documentContent, 'utf-8');
  
  return {
    documentPath: filePath,
    documentContent,
  };
}

