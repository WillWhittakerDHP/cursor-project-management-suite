/**
 * Atomic Command: /handoff-generate [tier] [identifier]
 * Generate handoff from current state
 * 
 * Tier: Cross-tier utility
 * Operates on: Handoff generation across all tiers
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { getStatus, StatusTier } from '../../status/atomic/get-status';
import { DocumentTier } from '../../utils/document-manager';
import { resolveFeatureName } from '../../utils';

export type HandoffTier = DocumentTier | 'task';

export interface GenerateHandoffParams {
  tier: HandoffTier;
  identifier?: string;
  featureName?: string;
  nextIdentifier?: string; // Next session/phase/task identifier
  transitionNotes?: string;
}

/**
 * Generate handoff from current state
 * 
 * @param params Generate handoff parameters
 * @returns Formatted handoff output
 */
export async function generateHandoff(params: GenerateHandoffParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Generate Handoff: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task handoff generation';
  }
  
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`;
  }
  
  try {
    // Get current status
    const statusInfo = await getStatus({
      tier: params.tier as StatusTier,
      identifier: params.identifier,
      featureName
    });
    
    if (!statusInfo) {
      output.push('**WARNING: Status not found in control doc**\n');
      output.push(`**Suggestion:** Ensure the tier exists (guide/PROJECT_PLAN) and has a status\n`);
      return output.join('\n');
    }

    const completedItems: Array<{ id: string; title: string }> = [];
    
    // Generate handoff content
    const handoffContent: string[] = [];
    
    // Header
    if (params.tier === 'session') {
      handoffContent.push(`# Session ${params.identifier} Handoff: ${statusInfo.title}\n`);
    } else if (params.tier === 'phase') {
      handoffContent.push(`# Phase ${params.identifier} Handoff: ${statusInfo.title}\n`);
    } else {
      handoffContent.push(`# Feature Handoff: ${statusInfo.title}\n`);
    }
    
    handoffContent.push(`\n**Purpose:** Transition context between ${params.tier}s\n`);
    handoffContent.push(`**Tier:** ${params.tier.charAt(0).toUpperCase() + params.tier.slice(1)} (Tier ${params.tier === 'feature' ? 0 : params.tier === 'phase' ? 1 : params.tier === 'session' ? 2 : 3})\n`);
    handoffContent.push(`\n**Last Updated:** ${new Date().toISOString().split('T')[0]}\n`);
    handoffContent.push(`**Status:** ${statusInfo.status}\n`);
    if (params.nextIdentifier) {
      handoffContent.push(`**Next ${params.tier === 'session' ? 'Session' : params.tier === 'phase' ? 'Phase' : 'Task'}:** ${params.nextIdentifier}\n`);
    }
    handoffContent.push('\n---\n\n');
    
    // Current Status
    handoffContent.push('## Current Status\n\n');
    if (completedItems.length > 0) {
      handoffContent.push(`**Last Completed:** ${completedItems[completedItems.length - 1].id}: ${completedItems[completedItems.length - 1].title}\n`);
    }
    if (params.nextIdentifier) {
      handoffContent.push(`**Next ${params.tier === 'session' ? 'Session' : params.tier === 'phase' ? 'Phase' : 'Task'}:** ${params.nextIdentifier}\n`);
    }
    handoffContent.push(`**Git Branch:** \`feature/${featureName}\`\n`);
    handoffContent.push(`**Last Updated:** ${new Date().toISOString().split('T')[0]}\n`);
    handoffContent.push('\n---\n\n');
    
    // Next Action
    handoffContent.push('## Next Action\n\n');
    if (params.nextIdentifier) {
      handoffContent.push(`Start ${params.tier === 'session' ? 'Session' : params.tier === 'phase' ? 'Phase' : 'Task'} ${params.nextIdentifier}\n`);
    } else {
      handoffContent.push(`Continue with next ${params.tier}\n`);
    }
    handoffContent.push('\n---\n\n');
    
    // Transition Context
    handoffContent.push('## Transition Context\n\n');
    handoffContent.push('**Where we left off:**\n');
    if (params.transitionNotes) {
      handoffContent.push(`${params.transitionNotes}\n`);
    } else if (completedItems.length > 0) {
      handoffContent.push(`Completed ${completedItems[completedItems.length - 1].id}: ${completedItems[completedItems.length - 1].title}\n`);
    } else {
      handoffContent.push(`Status: ${statusInfo.status}\n`);
    }
    
    handoffContent.push('\n**What you need to start:**\n');
    if (params.nextIdentifier) {
      handoffContent.push(`- Begin ${params.tier === 'session' ? 'Session' : params.tier === 'phase' ? 'Phase' : 'Task'} ${params.nextIdentifier}\n`);
    }
    handoffContent.push('\n');
    
    // Write handoff
    if (params.tier === 'feature') {
      await context.documents.writeGuide('feature', undefined, handoffContent.join(''));
    } else if (params.tier === 'phase') {
      await context.documents.writeGuide('phase', params.identifier!, handoffContent.join(''));
    } else {
      await context.documents.writeGuide('session', params.identifier!, handoffContent.join(''));
    }
    
    output.push('✅ **Handoff generated successfully**\n');
    output.push(`\n**Content Preview:**\n`);
    output.push(handoffContent.join('').substring(0, 500) + '...\n');
    
    const handoffPath = 
      params.tier === 'feature' ? context.paths.getFeatureHandoffPath() :
      params.tier === 'phase' ? context.paths.getPhaseHandoffPath(params.identifier!) :
      context.paths.getSessionHandoffPath(params.identifier!);
    
    output.push(`\n**Handoff Path:** ${handoffPath}\n`);
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to generate handoff**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

