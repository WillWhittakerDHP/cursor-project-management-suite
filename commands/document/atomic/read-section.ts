/**
 * Atomic Command: /document-read-section [tier] [identifier] [section]
 * Read specific section from document
 * 
 * Tier: Cross-tier utility
 * Operates on: Document sections (guide/log/handoff)
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { DocumentTier } from '../../utils/document-manager';

export interface ReadSectionParams {
  tier: DocumentTier;
  identifier?: string;
  sectionTitle: string;
  docType?: 'guide' | 'log' | 'handoff';
  featureName?: string;
}

/**
 * Read specific section from document
 * 
 * @param params Read section parameters
 * @returns Section content as formatted string
 */
export async function readSection(params: ReadSectionParams): Promise<string> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Read Section: ${params.sectionTitle}\n`);
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
    return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${params.identifier}`;
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
    
    // Extract section
    const { MarkdownUtils } = await import('../../utils/markdown-utils');
    const sectionContent = MarkdownUtils.extractSection(content, params.sectionTitle);
    
    if (!sectionContent) {
      output.push(`**Section not found:** "${params.sectionTitle}"\n`);
      output.push(`**Document:** ${docType} for ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
      output.push(`**Suggestion:** Check section title spelling or use /document-list-sections to see available sections\n`);
      return output.join('\n');
    }
    
    output.push(`## Section Content\n\n`);
    output.push(sectionContent);
    
    const documentPath = 
      params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    output.push(`\n\n---\n`);
    output.push(`**Document:** ${documentPath}\n`);
    
    return output.join('\n');
  } catch (error) {
    const attemptedPath = 
      params.tier === 'feature' ? (params.docType === 'guide' ? context.paths.getFeatureGuidePath() : params.docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (params.docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : params.docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (params.docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : params.docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    output.push(`**ERROR: Failed to read section**\n`);
    output.push(`**Tier:** ${params.tier}\n`);
    output.push(`**Identifier:** ${params.identifier || 'none'}\n`);
    output.push(`**Section:** ${params.sectionTitle}\n`);
    output.push(`**Attempted:** ${attemptedPath}\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Suggestion:** Ensure the document file exists and the section title is correct\n`);
    
    return output.join('\n');
  }
}

