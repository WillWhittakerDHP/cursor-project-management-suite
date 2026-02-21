/**
 * Atomic Command: /document-list-sections [tier] [identifier]
 * List all sections in document
 * 
 * Tier: Cross-tier utility
 * Operates on: Document sections (guide/log/handoff)
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { DocumentTier } from '../../utils/document-manager';
import { MarkdownUtils } from '../../utils/markdown-utils';

export interface ListSectionsParams {
  tier: DocumentTier;
  identifier?: string;
  docType?: 'guide' | 'log' | 'handoff';
  featureName?: string;
}

export interface SectionInfo {
  title: string;
  depth: number;
  lineNumber: number;
}

/**
 * List all sections in document
 * 
 * @param params List sections parameters
 * @returns List of sections as formatted string
 */
export async function listSections(params: ListSectionsParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Document Sections\n`);
  output.push(`**Tier:** ${params.tier}\n`);
  if (params.identifier) {
    output.push(`**Identifier:** ${params.identifier}\n`);
  }
  output.push(`**Document Type:** ${params.docType || 'guide'}\n`);
  output.push('---\n\n');
  
  // Validate identifier for phase/session
  if (params.tier === 'phase' && !params.identifier) {
    return 'Error: Phase identifier is required for phase documents';
  }
  if (params.tier === 'session' && !params.identifier) {
    return 'Error: Session ID is required for session documents';
  }
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`;
  }
  
  try {
    let content: string;
    const docType = params.docType || 'guide';
    
    // Read document based on type
    switch (docType) {
      case 'guide':
        if (params.tier === 'feature') {
          content = await context.readFeatureGuide();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseGuide(params.identifier!);
        } else {
          content = await context.readSessionGuide(params.identifier!);
        }
        break;
      case 'log':
        if (params.tier === 'feature') {
          content = await context.readFeatureLog();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseLog(params.identifier!);
        } else {
          content = await context.readSessionLog(params.identifier!);
        }
        break;
      case 'handoff':
        if (params.tier === 'feature') {
          content = await context.readFeatureHandoff();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseHandoff(params.identifier!);
        } else {
          content = await context.readSessionHandoff(params.identifier!);
        }
        break;
    }
    
    // Parse sections
    const structure = MarkdownUtils.parseStructure(content);

    if (structure.size === 0) {
      output.push(`**No sections found in document**\n`);
      const documentPath = 
        params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
        params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
        (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
      output.push(`**Document:** ${documentPath}\n`);
      return output.join('\n');
    }
    
    // Sort sections by start position
    const sections = Array.from(structure.entries())
      .map(([, info]) => ({ ...info }))
      .sort((a, b) => a.start - b.start);
    
    output.push(`## Sections (${sections.length})\n\n`);
    
    for (const section of sections) {
      const indent = '  '.repeat(section.depth - 1);
      const prefix = '#'.repeat(section.depth);
      output.push(`${indent}- **${prefix} ${section.title}** (line ${section.start + 1})\n`);
    }
    
    const documentPath = 
      params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    output.push(`\n---\n`);
    output.push(`**Document:** ${documentPath}\n`);
    
    return output.join('\n');
  } catch (_error) {
    const attemptedPath = 
      params.tier === 'feature' ? (params.docType === 'guide' ? context.paths.getFeatureGuidePath() : params.docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (params.docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : params.docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (params.docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : params.docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    output.push(`**ERROR: Failed to list sections**\n`);
    output.push(`**Tier:** ${params.tier}\n`);
    output.push(`**Identifier:** ${params.identifier || 'none'}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Suggestion:** Ensure the document file exists\n`);
    
    return output.join('\n');
  }
}

/**
 * List sections (programmatic API)
 * 
 * @param params List sections parameters
 * @returns Structured result with section list
 */
export async function listSectionsProgrammatic(
  params: ListSectionsParams
): Promise<{ success: boolean; sections?: SectionInfo[]; documentPath?: string; error?: string }> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  
  // Validate identifier for phase/session
  if (params.tier === 'phase' && !params.identifier) {
    return {
      success: false,
      error: 'Phase identifier is required for phase documents'
    };
  }
  if (params.tier === 'session' && !params.identifier) {
    return {
      success: false,
      error: 'Session ID is required for session documents'
    };
  }
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return {
      success: false,
      error: `Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3). Attempted: ${params.identifier}`
    };
  }
  
  try {
    let content: string;
    const docType = params.docType || 'guide';
    
    // Read document based on type
    switch (docType) {
      case 'guide':
        if (params.tier === 'feature') {
          content = await context.readFeatureGuide();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseGuide(params.identifier!);
        } else {
          content = await context.readSessionGuide(params.identifier!);
        }
        break;
      case 'log':
        if (params.tier === 'feature') {
          content = await context.readFeatureLog();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseLog(params.identifier!);
        } else {
          content = await context.readSessionLog(params.identifier!);
        }
        break;
      case 'handoff':
        if (params.tier === 'feature') {
          content = await context.readFeatureHandoff();
        } else if (params.tier === 'phase') {
          content = await context.readPhaseHandoff(params.identifier!);
        } else {
          content = await context.readSessionHandoff(params.identifier!);
        }
        break;
    }

    // Parse sections
    const structure = MarkdownUtils.parseStructure(content);

    const documentPath = 
      params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    const sections = Array.from(structure.entries())
      .map(([title, info]) => ({
        title,
        depth: info.depth,
        lineNumber: info.start + 1
      }))
      .sort((a, b) => a.lineNumber - b.lineNumber);
    
    return {
      success: true,
      sections,
      documentPath
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error)
    };
  }
}

