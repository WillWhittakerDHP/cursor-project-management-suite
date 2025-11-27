/**
 * Composite Command: /new-agent
 * Composition: /update-handoff + /generate-prompt
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level handoff for agent switch
 */

import { updateHandoff, UpdateHandoffParams } from './update-handoff';
import { generatePrompt } from '../../../utils/generate-prompt';

export interface NewAgentParams {
  nextSession: string; // Format: X.Y (e.g., "1.4")
  description: string;
  summary?: {
    accomplished: string[];
    next: string[];
    decisions: string[];
    blockers: string[];
  };
}

export async function newAgent(params: NewAgentParams): Promise<{
  success: boolean;
  handoffUpdated: boolean;
  prompt: string;
  summary?: string;
}> {
  // Update handoff
  const handoffParams: UpdateHandoffParams = {
    nextAction: `Start Session ${params.nextSession}: ${params.description}`,
  };
  await updateHandoff(handoffParams);
  
  // Generate prompt
  const prompt = generatePrompt(params.nextSession, params.description);
  
  // Create summary if provided
  let summary: string | undefined;
  if (params.summary) {
    const summaryParts: string[] = [];
    
    if (params.summary.accomplished.length > 0) {
      summaryParts.push('## Accomplished:');
      summaryParts.push(...params.summary.accomplished.map(a => `- ${a}`));
    }
    
    if (params.summary.next.length > 0) {
      summaryParts.push('\n## Next:');
      summaryParts.push(...params.summary.next.map(n => `- ${n}`));
    }
    
    if (params.summary.decisions.length > 0) {
      summaryParts.push('\n## Key Decisions:');
      summaryParts.push(...params.summary.decisions.map(d => `- ${d}`));
    }
    
    if (params.summary.blockers.length > 0) {
      summaryParts.push('\n## Blockers/Questions:');
      summaryParts.push(...params.summary.blockers.map(b => `- ${b}`));
    }
    
    summary = summaryParts.join('\n');
  }
  
  return {
    success: true,
    handoffUpdated: true,
    prompt,
    summary,
  };
}

