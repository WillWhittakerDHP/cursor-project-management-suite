/**
 * Planning Management System - Decision Gate Enforcement
 * 
 * Functions for enforcing decision gates, tracking decisions, and validating decision completeness.
 */

import { DecisionGate, DecisionGateResult, DecisionStatus, Alternative } from './planning-types';

// ===================================================================
// DECISION GATE CREATION
// ===================================================================

/**
 * Create a new decision gate
 */
export function createDecisionGate(
  name: string,
  alternatives: Alternative[],
  prompt: string,
  required: boolean = true
): DecisionGate {
  const now = new Date().toISOString();
  
  return {
    id: `gate-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    required,
    alternatives,
    prompt,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
}

// ===================================================================
// DECISION GATE ENFORCEMENT
// ===================================================================

/**
 * Enforce a decision gate (check if decision can proceed)
 */
export function enforceDecisionGate(gate: DecisionGate): DecisionGateResult {
  const errors: string[] = [];
  
  // Check if gate is required
  if (gate.required && gate.status !== 'made') {
    errors.push(`Decision gate "${gate.name}" is required but no decision has been made`);
  }
  
  // Check if alternatives are provided
  if (gate.alternatives.length === 0) {
    errors.push(`Decision gate "${gate.name}" has no alternatives to choose from`);
  }
  
  // Check decision completeness if status is 'made'
  if (gate.status === 'made') {
    if (!gate.decision) {
      errors.push(`Decision gate "${gate.name}" status is 'made' but no decision details provided`);
    } else {
      if (!gate.decision.chosenAlternativeId) {
        errors.push(`Decision gate "${gate.name}" decision missing chosen alternative ID`);
      }
      if (!gate.decision.rationale || gate.decision.rationale.trim().length === 0) {
        errors.push(`Decision gate "${gate.name}" decision missing rationale`);
      }
      // Validate chosen alternative exists
      const chosenExists = gate.alternatives.some(alt => alt.id === gate.decision!.chosenAlternativeId);
      if (!chosenExists) {
        errors.push(`Decision gate "${gate.name}" chosen alternative ID does not exist`);
      }
    }
  }
  
  const canProceed = errors.length === 0 && (!gate.required || gate.status === 'made');
  
  let message = '';
  if (canProceed) {
    if (gate.status === 'made') {
      const chosenAlt = gate.alternatives.find(alt => alt.id === gate.decision!.chosenAlternativeId);
      message = `Decision gate "${gate.name}" passed. Chosen: ${chosenAlt?.title || gate.decision!.chosenAlternativeId}`;
    } else if (!gate.required) {
      message = `Decision gate "${gate.name}" is optional and can be deferred`;
    }
  } else {
    if (gate.required && gate.status !== 'made') {
      message = `Cannot proceed: Decision gate "${gate.name}" requires a decision. ${gate.prompt}`;
    } else {
      message = `Cannot proceed: Decision gate "${gate.name}" has errors: ${errors.join('; ')}`;
    }
  }
  
  return {
    canProceed,
    gate,
    message,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ===================================================================
// DECISION MAKING
// ===================================================================

/**
 * Make a decision on a decision gate
 */
export function makeDecision(
  gate: DecisionGate,
  chosenAlternativeId: string,
  rationale: string,
  decisionMaker?: string
): DecisionGate {
  // Validate chosen alternative exists
  const chosenExists = gate.alternatives.some(alt => alt.id === chosenAlternativeId);
  if (!chosenExists) {
    throw new Error(`Chosen alternative ID "${chosenAlternativeId}" does not exist in gate alternatives`);
  }
  
  // Get rejected alternatives (all except chosen)
  const rejectedAlternatives = gate.alternatives
    .filter(alt => alt.id !== chosenAlternativeId)
    .map(alt => alt.id);
  
  return {
    ...gate,
    status: 'made',
    decision: {
      chosenAlternativeId,
      rationale: rationale.trim(),
      rejectedAlternatives,
      decisionDate: new Date().toISOString(),
      decisionMaker,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Defer a decision gate
 */
export function deferDecision(gate: DecisionGate, reason: string): DecisionGate {
  if (gate.required) {
    throw new Error(`Cannot defer required decision gate "${gate.name}"`);
  }
  
  return {
    ...gate,
    status: 'deferred',
    deferredReason: reason.trim(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reject a decision gate (mark as not applicable)
 */
export function rejectDecisionGate(gate: DecisionGate, reason?: string): DecisionGate {
  return {
    ...gate,
    status: 'rejected',
    deferredReason: reason?.trim(),
    updatedAt: new Date().toISOString(),
  };
}

// ===================================================================
// DECISION VALIDATION
// ===================================================================

/**
 * Validate decision completeness
 */
export function validateDecision(gate: DecisionGate): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (gate.status === 'made') {
    if (!gate.decision) {
      errors.push('Decision status is "made" but no decision details provided');
      return { isValid: false, errors };
    }
    
    if (!gate.decision.chosenAlternativeId) {
      errors.push('Decision missing chosen alternative ID');
    }
    
    if (!gate.decision.rationale || gate.decision.rationale.trim().length === 0) {
      errors.push('Decision missing rationale');
    }
    
    if (gate.decision.rationale && gate.decision.rationale.trim().length < 10) {
      errors.push('Decision rationale is too short (minimum 10 characters)');
    }
    
    // Validate chosen alternative exists
    const chosenExists = gate.alternatives.some(alt => alt.id === gate.decision!.chosenAlternativeId);
    if (!chosenExists) {
      errors.push(`Chosen alternative ID "${gate.decision.chosenAlternativeId}" does not exist`);
    }
    
    // Validate rejected alternatives
    for (const rejectedId of gate.decision.rejectedAlternatives) {
      const rejectedExists = gate.alternatives.some(alt => alt.id === rejectedId);
      if (!rejectedExists) {
        errors.push(`Rejected alternative ID "${rejectedId}" does not exist`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ===================================================================
// DECISION QUERYING
// ===================================================================

/**
 * Get decision gate status summary
 */
export function getDecisionGateSummary(gates: DecisionGate[]): {
  total: number;
  pending: number;
  made: number;
  deferred: number;
  rejected: number;
  requiredPending: number;
  canProceed: boolean;
} {
  const summary = {
    total: gates.length,
    pending: 0,
    made: 0,
    deferred: 0,
    rejected: 0,
    requiredPending: 0,
    canProceed: true,
  };
  
  for (const gate of gates) {
    switch (gate.status) {
      case 'pending':
        summary.pending++;
        if (gate.required) {
          summary.requiredPending++;
          summary.canProceed = false;
        }
        break;
      case 'made':
        summary.made++;
        break;
      case 'deferred':
        summary.deferred++;
        break;
      case 'rejected':
        summary.rejected++;
        break;
    }
  }
  
  return summary;
}

/**
 * Get all pending required decision gates
 */
export function getPendingRequiredGates(gates: DecisionGate[]): DecisionGate[] {
  return gates.filter(gate => gate.required && gate.status === 'pending');
}

/**
 * Get all decision gates that block progression
 */
export function getBlockingGates(gates: DecisionGate[]): DecisionGate[] {
  return gates.filter(gate => {
    const result = enforceDecisionGate(gate);
    return !result.canProceed;
  });
}

