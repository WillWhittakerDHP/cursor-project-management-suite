/**
 * Atomic Command: /document-extract-section [tier] [identifier] [section]
 * Extract section content (programmatic API - returns structured data)
 * 
 * Tier: Cross-tier utility
 * Operates on: Document sections (guide/log/handoff)
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { DocumentTier } from '../../utils/document-manager';
import { MarkdownUtils } from '../../utils/markdown-utils';

export interface ExtractSectionParams {
  tier: DocumentTier;
  identifier?: string;
  sectionTitle: string;
  docType?: 'guide' | 'log' | 'handoff';
  featureName?: string;
}

export interface ExtractSectionResult {
  success: boolean;
  sectionContent?: string;
  documentPath?: string;
  error?: string;
}

/**
 * Extract section content (programmatic API)
 * 
 * Use this function when calling from other commands that need structured data.
 * 
 * @param params Extract section parameters
 * @returns Structured result with section content
 */
export async function extractSectionProgrammatic(
  params: ExtractSectionParams
): Promise<ExtractSectionResult> {
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
    
    // Extract section
    const sectionContent = MarkdownUtils.extractSection(content, params.sectionTitle);
    
    if (!sectionContent) {
      const documentPath = 
        params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
        params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
        (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
      
      return {
        success: false,
        documentPath,
        error: `Section "${params.sectionTitle}" not found in document`
      };
    }
    
    const documentPath = 
      params.tier === 'feature' ? (docType === 'guide' ? context.paths.getFeatureGuidePath() : docType === 'log' ? context.paths.getFeatureLogPath() : context.paths.getFeatureHandoffPath()) :
      params.tier === 'phase' ? (docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) : docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) : context.paths.getPhaseHandoffPath(params.identifier!)) :
      (docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) : docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) : context.paths.getSessionHandoffPath(params.identifier!));
    
    return {
      success: true,
      sectionContent,
      documentPath
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error)
    };
  }
}

