/**
 * Atomic Command: /handoff-review [tier] [identifier]
 * Review handoff completeness
 * 
 * Tier: Cross-tier utility
 * Operates on: Handoff review across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { DocumentTier } from '../../utils/document-manager';

export type HandoffTier = DocumentTier | 'task';

export interface ReviewHandoffParams {
  tier: HandoffTier;
  identifier?: string;
  featureName?: string;
}

export interface HandoffReviewResult {
  complete: boolean;
  missingSections: string[];
  recommendations: string[];
}

/**
 * Review handoff completeness
 * 
 * @param params Review handoff parameters
 * @returns Formatted review output
 */
export async function reviewHandoff(params: ReviewHandoffParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Handoff Review: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task handoff review';
  }
  
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`;
  }
  
  try {
    // Read handoff
    let handoffContent = '';
    try {
      if (params.tier === 'feature') {
        handoffContent = await context.readFeatureHandoff();
      } else if (params.tier === 'phase') {
        handoffContent = await context.readPhaseHandoff(params.identifier!);
      } else {
        handoffContent = await context.readSessionHandoff(params.identifier!);
      }
    } catch (_error) {
      output.push('**ERROR: Handoff not found**\n');
      output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
      output.push(`**Suggestion:** Use \`/handoff-generate ${params.tier} ${params.identifier || ''}\` to create handoff\n`);
      return output.join('\n');
    }
    
    // Required sections
    const requiredSections = [
      'Current Status',
      'Next Action',
      'Transition Context'
    ];
    
    const missingSections: string[] = [];
    const recommendations: string[] = [];
    
    // Check for required sections
    for (const section of requiredSections) {
      const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
      if (!sectionContent || sectionContent.trim().length === 0) {
        missingSections.push(section);
      }
    }
    
    // Check Current Status section
    const currentStatus = MarkdownUtils.extractSection(handoffContent, 'Current Status');
    if (currentStatus) {
      if (!currentStatus.includes('Last Completed') && !currentStatus.includes('Status')) {
        recommendations.push('Current Status should include "Last Completed" or current status');
      }
      if (!currentStatus.includes('Last Updated')) {
        recommendations.push('Current Status should include "Last Updated" timestamp');
      }
    }
    
    // Check Next Action section
    const nextAction = MarkdownUtils.extractSection(handoffContent, 'Next Action');
    if (nextAction) {
      if (nextAction.trim().length < 10) {
        recommendations.push('Next Action should be more specific');
      }
    }
    
    // Check Transition Context section
    const transitionContext = MarkdownUtils.extractSection(handoffContent, 'Transition Context');
    if (transitionContext) {
      if (!transitionContext.includes('Where we left off')) {
        recommendations.push('Transition Context should include "Where we left off"');
      }
      if (!transitionContext.includes('What you need to start')) {
        recommendations.push('Transition Context should include "What you need to start"');
      }
    }
    
    // Check handoff size (should be minimal)
    const lineCount = handoffContent.split('\n').length;
    if (lineCount > 200) {
      recommendations.push(`Handoff is ${lineCount} lines (target: 100-200 lines). Consider moving detailed notes to guide/log.`);
    }
    
    // Output review results
    output.push('## Review Results\n\n');
    
    if (missingSections.length === 0 && recommendations.length === 0) {
      output.push('✅ **Handoff is complete**\n');
      output.push('\nAll required sections are present and properly formatted.\n');
    } else {
      if (missingSections.length > 0) {
        output.push('❌ **Missing Sections:**\n');
        for (const section of missingSections) {
          output.push(`- ${section}\n`);
        }
        output.push('\n');
      }
      
      if (recommendations.length > 0) {
        output.push('⚠️ **Recommendations:**\n');
        for (const rec of recommendations) {
          output.push(`- ${rec}\n`);
        }
        output.push('\n');
      }
    }
    
    output.push('## Section Summary\n\n');
    for (const section of requiredSections) {
      const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
      const exists = sectionContent && sectionContent.trim().length > 0;
      const icon = exists ? '✅' : '❌';
      output.push(`${icon} **${section}**: ${exists ? 'Present' : 'Missing'}\n`);
    }
    
    const handoffPath = 
      params.tier === 'feature' ? context.paths.getFeatureHandoffPath() :
      params.tier === 'phase' ? context.paths.getPhaseHandoffPath(params.identifier!) :
      context.paths.getSessionHandoffPath(params.identifier!);
    
    output.push(`\n**Handoff Path:** ${handoffPath}\n`);
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to review handoff**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

/**
 * Review handoff (programmatic API)
 * 
 * @param params Review handoff parameters
 * @returns Structured review result
 */
export async function reviewHandoffProgrammatic(
  params: ReviewHandoffParams
): Promise<{ success: boolean; result?: HandoffReviewResult; error?: string }> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  
  try {
    // Read handoff
    let handoffContent = '';
    try {
      if (params.tier === 'feature') {
        handoffContent = await context.readFeatureHandoff();
      } else if (params.tier === 'phase') {
        handoffContent = await context.readPhaseHandoff(params.identifier!);
      } else {
        handoffContent = await context.readSessionHandoff(params.identifier!);
      }
    } catch (_error) {
      return {
        success: false,
        error: _error instanceof Error ? _error.message : String(_error)
      };
    }
    
    // Required sections
    const requiredSections = [
      'Current Status',
      'Next Action',
      'Transition Context'
    ];
    
    const missingSections: string[] = [];
    const recommendations: string[] = [];
    
    // Check for required sections
    for (const section of requiredSections) {
      const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
      if (!sectionContent || sectionContent.trim().length === 0) {
        missingSections.push(section);
      }
    }
    
    // Check handoff size
    const lineCount = handoffContent.split('\n').length;
    if (lineCount > 200) {
      recommendations.push(`Handoff is ${lineCount} lines (target: 100-200 lines)`);
    }
    
    return {
      success: true,
      result: {
        complete: missingSections.length === 0,
        missingSections,
        recommendations
      }
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error)
    };
  }
}

