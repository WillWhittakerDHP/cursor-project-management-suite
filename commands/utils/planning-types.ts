/**
 * Planning Management System - Type Definitions
 * 
 * Type definitions for the Planning Management System including core types
 * for planning input/output, alternatives, decision gates, validation, and critical checks.
 */

// ===================================================================
// CORE TYPES
// ===================================================================

export type PlanningTier = 'feature' | 'phase' | 'session' | 'task';
export type AlternativeType = 'architecture' | 'technology' | 'pattern' | 'approach' | 'strategy';
export type DecisionStatus = 'pending' | 'made' | 'deferred' | 'rejected';
export type ValidationSeverity = 'error' | 'warning' | 'info';
export type CriticalCheckType = 'documentation' | 'reuse' | 'best_practices' | 'alternatives' | 'risks';

// ===================================================================
// PLANNING INPUT/OUTPUT TYPES
// ===================================================================

/**
 * Natural language or structured planning input
 */
export interface PlanningInput {
  /** Natural language description */
  description: string;
  /** Tier level for planning */
  tier: PlanningTier;
  /** Feature name context */
  feature?: string;
  /** Phase number context (if applicable) */
  phase?: number;
  /** Session ID context (if applicable) */
  sessionId?: string;
  /** Task ID context (if applicable) */
  taskId?: string;
  /** Structured fields (if provided) */
  structured?: {
    objectives?: string[];
    scope?: string;
    dependencies?: string[];
    risks?: string[];
    constraints?: string[];
  };
}

/**
 * Structured planning output data
 */
export interface PlanningOutput {
  /** Parsed objectives */
  objectives: string[];
  /** Scope description */
  scope: string;
  /** Dependencies identified */
  dependencies: string[];
  /** Risks identified */
  risks: string[];
  /** Constraints identified */
  constraints: string[];
  /** Estimated effort/duration */
  estimatedEffort?: string;
  /** Priority level */
  priority?: 'low' | 'medium' | 'high' | 'critical';
  /** Tags for categorization */
  tags?: string[];
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Parsing result with errors and suggestions
 */
export interface ParsingResult {
  success: boolean;
  output?: PlanningOutput;
  errors: ParsingError[];
  suggestions: string[];
}

/**
 * Parsing error details
 */
export interface ParsingError {
  type: 'missing_field' | 'ambiguous' | 'invalid_format' | 'validation_error';
  field?: string;
  message: string;
  value?: unknown;
}

// ===================================================================
// ALTERNATIVES TYPES
// ===================================================================

/**
 * Alternative strategy/approach/architecture
 */
export interface Alternative {
  id: string;
  title: string;
  description: string;
  type: AlternativeType;
  /** Pros of this alternative */
  pros: string[];
  /** Cons of this alternative */
  cons: string[];
  /** Effort estimate */
  effort?: 'low' | 'medium' | 'high' | 'very_high';
  /** Risk level */
  risk?: 'low' | 'medium' | 'high' | 'critical';
  /** Complexity level */
  complexity?: 'low' | 'medium' | 'high';
  /** Recommended for specific scenarios */
  recommendedFor?: string[];
  /** Not recommended for specific scenarios */
  notRecommendedFor?: string[];
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Alternative generation result
 */
export interface AlternativesResult {
  success: boolean;
  alternatives: Alternative[];
  recommendations?: {
    primary?: string; // Alternative ID
    secondary?: string; // Alternative ID
    rationale?: string;
  };
  errors?: string[];
}

/**
 * Alternative analysis/comparison result
 */
export interface AlternativeAnalysis {
  alternatives: Alternative[];
  comparison: {
    criteria: string[];
    scores: Record<string, Record<string, number>>; // alternativeId -> criteria -> score
  };
  recommendation?: {
    alternativeId: string;
    rationale: string;
    confidence: 'low' | 'medium' | 'high';
  };
}

// ===================================================================
// DECISION GATE TYPES
// ===================================================================

/**
 * Decision gate configuration
 */
export interface DecisionGate {
  id: string;
  /** Gate name/description */
  name: string;
  /** Whether gate is required (cannot proceed without decision) */
  required: boolean;
  /** Alternatives that must be considered */
  alternatives: Alternative[];
  /** Decision prompt/question */
  prompt: string;
  /** Decision status */
  status: DecisionStatus;
  /** Decision made (if status is 'made') */
  decision?: {
    chosenAlternativeId: string;
    rationale: string;
    rejectedAlternatives: string[]; // Alternative IDs
    decisionDate: string; // ISO 8601
    decisionMaker?: string;
  };
  /** Deferred reason (if status is 'deferred') */
  deferredReason?: string;
  /** Created timestamp */
  createdAt: string; // ISO 8601
  /** Updated timestamp */
  updatedAt: string; // ISO 8601
}

/**
 * Decision gate enforcement result
 */
export interface DecisionGateResult {
  canProceed: boolean;
  gate: DecisionGate;
  message: string;
  errors?: string[];
}

// ===================================================================
// PLANNING VALIDATION TYPES
// ===================================================================

/**
 * Planning validation result
 */
export interface PlanningValidation {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
  /** Required fields that are missing */
  missingFields: string[];
  /** Suggestions for improvement */
  suggestions: string[];
}

/**
 * Validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  field?: string;
  message: string;
  suggestion?: string;
}

/**
 * Validation rule configuration
 */
export interface ValidationRule {
  field: string;
  required: boolean;
  validator?: (value: unknown) => boolean;
  errorMessage?: string;
}

/**
 * Tier-specific validation rules
 */
export interface TierValidationRules {
  tier: PlanningTier;
  requiredFields: string[];
  recommendedFields: string[];
  rules: ValidationRule[];
}

// ===================================================================
// CRITICAL CHECK TYPES
// ===================================================================

/**
 * Critical check definition
 */
export interface CriticalCheck {
  id: string;
  type: CriticalCheckType;
  name: string;
  description: string;
  /** Whether check is required (cannot proceed without passing) */
  required: boolean;
  /** Check status */
  status: 'pending' | 'passed' | 'failed' | 'skipped';
  /** Check result */
  result?: {
    passed: boolean;
    message: string;
    details?: string;
    checkedAt: string; // ISO 8601
  };
  /** Created timestamp */
  createdAt: string; // ISO 8601
}

/**
 * Critical checks result
 */
export interface CriticalChecksResult {
  allPassed: boolean;
  checks: CriticalCheck[];
  canProceed: boolean;
  failedChecks: CriticalCheck[];
  pendingChecks: CriticalCheck[];
}

// ===================================================================
// PLANNING TEMPLATE TYPES
// ===================================================================

/**
 * Planning template type
 */
export type PlanningTemplateType = 'architecture' | 'technology' | 'pattern' | 'risk' | 'general';

/**
 * Template application result
 */
export interface TemplateApplicationResult {
  success: boolean;
  content: string;
  appliedTemplate: PlanningTemplateType;
  errors?: string[];
}

// ===================================================================
// COMPOSITE PLANNING TYPES
// ===================================================================

/**
 * Complete planning result with all components
 */
export interface CompletePlanningResult {
  input: PlanningInput;
  parsed: PlanningOutput;
  alternatives?: AlternativesResult;
  decisionGate?: DecisionGateResult;
  validation: PlanningValidation;
  criticalChecks?: CriticalChecksResult;
  templateApplied?: TemplateApplicationResult;
  /** Overall planning status */
  status: 'complete' | 'incomplete' | 'blocked';
  /** Can proceed with implementation */
  canProceed: boolean;
  /** Blocking issues */
  blockingIssues: string[];
}

