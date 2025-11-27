/**
 * Atomic Planning Command: /planning-enforce-decision-gate
 * Enforce decision gates and track decisions
 * 
 * Wraps decision-gate.ts utilities and provides command interface.
 */

import {
  createDecisionGate,
  enforceDecisionGate,
  makeDecision,
  deferDecision,
  rejectDecisionGate,
  validateDecision,
  getDecisionGateSummary,
  getPendingRequiredGates,
  getBlockingGates,
} from '../../utils/decision-gate';
import { DecisionGate, Alternative } from '../../utils/planning-types';

/**
 * Enforce a decision gate
 * 
 * @param gate Decision gate to enforce
 * @returns Formatted decision gate result
 */
export async function enforceDecisionGateCommand(gate: DecisionGate): Promise<string> {
  const result = enforceDecisionGate(gate);
  
  return formatDecisionGateResult(result);
}

/**
 * Create a new decision gate
 * 
 * @param name Gate name
 * @param alternatives Alternatives to choose from
 * @param prompt Decision prompt/question
 * @param required Whether gate is required
 * @returns Created decision gate
 */
export function createDecisionGateCommand(
  name: string,
  alternatives: Alternative[],
  prompt: string,
  required: boolean = true
): DecisionGate {
  return createDecisionGate(name, alternatives, prompt, required);
}

/**
 * Make a decision on a decision gate
 * 
 * @param gate Decision gate
 * @param chosenAlternativeId ID of chosen alternative
 * @param rationale Decision rationale
 * @param decisionMaker Decision maker (optional)
 * @returns Updated decision gate
 */
export function makeDecisionCommand(
  gate: DecisionGate,
  chosenAlternativeId: string,
  rationale: string,
  decisionMaker?: string
): DecisionGate {
  return makeDecision(gate, chosenAlternativeId, rationale, decisionMaker);
}

/**
 * Defer a decision gate
 * 
 * @param gate Decision gate
 * @param reason Reason for deferral
 * @returns Updated decision gate
 */
export function deferDecisionCommand(gate: DecisionGate, reason: string): DecisionGate {
  return deferDecision(gate, reason);
}

/**
 * Reject a decision gate
 * 
 * @param gate Decision gate
 * @param reason Reason for rejection (optional)
 * @returns Updated decision gate
 */
export function rejectDecisionGateCommand(gate: DecisionGate, reason?: string): DecisionGate {
  return rejectDecisionGate(gate, reason);
}

/**
 * Validate a decision gate
 * 
 * @param gate Decision gate to validate
 * @returns Validation result
 */
export function validateDecisionCommand(gate: DecisionGate): { isValid: boolean; errors: string[] } {
  return validateDecision(gate);
}

/**
 * Get decision gate summary
 * 
 * @param gates Array of decision gates
 * @returns Summary statistics
 */
export function getDecisionGateSummaryCommand(gates: DecisionGate[]): {
  total: number;
  pending: number;
  made: number;
  deferred: number;
  rejected: number;
  requiredPending: number;
  canProceed: boolean;
} {
  return getDecisionGateSummary(gates);
}

/**
 * Get pending required gates
 * 
 * @param gates Array of decision gates
 * @returns Pending required gates
 */
export function getPendingRequiredGatesCommand(gates: DecisionGate[]): DecisionGate[] {
  return getPendingRequiredGates(gates);
}

/**
 * Get blocking gates
 * 
 * @param gates Array of decision gates
 * @returns Gates that block progression
 */
export function getBlockingGatesCommand(gates: DecisionGate[]): DecisionGate[] {
  return getBlockingGates(gates);
}

/**
 * Format decision gate result as string output
 */
function formatDecisionGateResult(result: import('../../../project-manager/utils/planning-types').DecisionGateResult): string {
  const output: string[] = [];
  
  output.push('# Decision Gate Result\n');
  output.push(`**Can Proceed:** ${result.canProceed ? '✅ Yes' : '❌ No'}\n`);
  output.push(`**Message:** ${result.message}\n`);
  output.push('\n---\n');
  
  output.push('## Decision Gate Details\n');
  output.push(`**Name:** ${result.gate.name}\n`);
  output.push(`**Required:** ${result.gate.required ? 'Yes' : 'No'}\n`);
  output.push(`**Status:** ${result.gate.status}\n`);
  output.push(`**Prompt:** ${result.gate.prompt}\n`);
  
  if (result.gate.alternatives.length > 0) {
    output.push('\n### Alternatives\n');
    result.gate.alternatives.forEach((alt, i) => {
      output.push(`${i + 1}. **${alt.title}**\n`);
      output.push(`   ${alt.description}\n`);
    });
  }
  
  if (result.gate.status === 'made' && result.gate.decision) {
    output.push('\n### Decision Made\n');
    const chosen = result.gate.alternatives.find(a => a.id === result.gate.decision!.chosenAlternativeId);
    output.push(`**Chosen:** ${chosen?.title || result.gate.decision.chosenAlternativeId}\n`);
    output.push(`**Rationale:** ${result.gate.decision.rationale}\n`);
    output.push(`**Decision Date:** ${result.gate.decision.decisionDate}\n`);
    if (result.gate.decision.decisionMaker) {
      output.push(`**Decision Maker:** ${result.gate.decision.decisionMaker}\n`);
    }
    if (result.gate.decision.rejectedAlternatives.length > 0) {
      output.push('\n**Rejected Alternatives:**\n');
      result.gate.decision.rejectedAlternatives.forEach(rejectedId => {
        const rejected = result.gate.alternatives.find(a => a.id === rejectedId);
        output.push(`- ${rejected?.title || rejectedId}\n`);
      });
    }
  }
  
  if (result.gate.status === 'deferred' && result.gate.deferredReason) {
    output.push(`\n### Deferred\n`);
    output.push(`**Reason:** ${result.gate.deferredReason}\n`);
  }
  
  if (result.errors && result.errors.length > 0) {
    output.push('\n---\n');
    output.push('## Errors\n');
    result.errors.forEach(error => {
      output.push(`- ❌ ${error}\n`);
    });
  }
  
  if (!result.canProceed) {
    output.push('\n---\n');
    output.push('## ⚠️ Cannot Proceed\n');
    output.push('**This decision gate must be resolved before continuing.**\n');
  }
  
  return output.join('\n');
}

