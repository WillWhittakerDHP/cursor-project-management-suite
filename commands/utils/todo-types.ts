/**
 * Todo Management System - Type Definitions
 * 
 * Type definitions for the Todo Management System including core types
 * and advanced feature types (citations, rollback, scoping).
 */

// ===================================================================
// CORE TYPES
// ===================================================================

export type TodoTier = 'feature' | 'phase' | 'session' | 'task';
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'blocked';

export interface Todo {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  tier: TodoTier;
  parentId: string | null;
  planningDocPath: string;
  planningDocSection: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  blockedBy?: string[];
  blocks?: string[];
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  // Advanced features
  citations?: Citation[];
  scope?: Scope;
}

export interface TodoFile {
  feature: string;
  phase?: number;
  session?: string;
  todos: Todo[];
  metadata: {
    version: string;
    lastSynced: string;
  };
}

// ===================================================================
// CITATION SYSTEM TYPES
// ===================================================================

export type CitationType = 
  | 'status_change'
  | 'description_change'
  | 'parent_change'
  | 'planning_doc_change'
  | 'propagation_change'
  | 'conflict_detected'
  | 'rollback_applied';

export type CitationPriority = 'low' | 'medium' | 'high' | 'critical';

export type CitationContext = 
  | 'session-start'
  | 'session-checkpoint'
  | 'session-end'
  | 'phase-start'
  | 'phase-checkpoint'
  | 'phase-end'
  | 'task-start'
  | 'task-checkpoint'
  | 'conflict-detection'
  | 'planning-doc-update';

export interface Citation {
  id: string;
  changeLogId: string;
  type: CitationType;
  priority: CitationPriority;
  context: CitationContext[];
  createdAt: string; // ISO 8601
  reviewedAt?: string | null; // ISO 8601
  metadata?: {
    reason?: string;
    impact?: string;
    affectedTodos?: string[];
    requiresReview?: boolean;
    reviewDeadline?: string;
  };
  relatedCitations?: string[];
}

// ===================================================================
// ROLLBACK CONTROL TYPES
// ===================================================================

export interface PreviousState {
  id: string;
  todoId: string;
  timestamp: string; // ISO 8601
  state: Todo;
  changeLogId: string;
  metadata?: {
    reason?: string;
    snapshot?: boolean;
    relatedChanges?: string[];
    tags?: string[];
  };
}

export type RollbackType = 'full' | 'selective' | 'partial';

export interface Rollback {
  id: string;
  timestamp: string; // ISO 8601
  author: string;
  todoId: string;
  rolledBackTo: string; // state ID
  rolledBackFrom: string; // state ID
  type: RollbackType;
  fields?: string[]; // For selective rollback
  reason?: string;
  conflicts?: RollbackConflict[];
  status: 'pending' | 'completed' | 'cancelled' | 'conflict';
  relatedRollbacks?: string[];
}

export interface RollbackConflict {
  type: 'state_conflict' | 'relationship_conflict' | 'planning_doc_conflict' | 'propagation_conflict';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolution?: string;
}

export interface RollbackHistory {
  feature: string;
  version: string;
  rollbacks: Rollback[];
  metadata: {
    totalRollbacks: number;
    lastRollback: string;
  };
}

// ===================================================================
// TODO SCOPING TYPES
// ===================================================================

export type AbstractionLevel = 'high' | 'medium-high' | 'medium' | 'low';
export type DetailLevel = 'high-level' | 'focused' | 'granular';

export interface Scope {
  level: TodoTier;
  abstraction: AbstractionLevel;
  detailLevel: DetailLevel;
  allowedDetails: string[];
  forbiddenDetails: string[];
  inheritedFrom?: string | null;
}

export interface ScopeViolation {
  type: 'forbidden_detail' | 'abstraction_violation' | 'detail_level_violation';
  detailType?: string;
  location?: string;
  description: string;
}

export interface ScopeCorrection {
  type: 'move_detail' | 'summarize_detail' | 'remove_detail' | 'adjust_scope';
  detail?: string;
  suggestedLocation?: string;
  suggestedSummary?: string;
  reason: string;
}

// ===================================================================
// CHANGE LOGGING TYPES
// ===================================================================

export type ChangeType =
  | 'todo_created'
  | 'todo_updated'
  | 'todo_deleted'
  | 'todo_moved'
  | 'todo_status_changed'
  | 'propagation_triggered'
  | 'propagation_completed'
  | 'propagation_conflict'
  | 'propagation_preserved'
  | 'change_request_created'
  | 'change_request_resolved'
  | 'change_request_dismissed'
  | 'planning_doc_updated'
  | 'planning_doc_synced'
  | 'bulk_update'
  | 'bulk_create'
  | 'bulk_delete'
  | 'rollback_applied';

export interface ChangeLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  author: string;
  changeType: ChangeType;
  tier: TodoTier;
  todoId?: string;
  planningDocPath?: string;
  before: Partial<Todo> | null;
  after: Partial<Todo> | null;
  reason?: string;
  propagationTriggered: boolean;
  changeRequestId?: string | null;
  relatedChanges: string[];
  conflicts?: Array<{
    type: string;
    description: string;
    resolution?: string;
    requiresReview?: boolean;
  }>;
  metadata?: Record<string, unknown>;
}

export interface ChangeLog {
  feature: string;
  version: string;
  entries: ChangeLogEntry[];
  metadata: {
    totalChanges: number;
    lastUpdated: string;
  };
}

// ===================================================================
// PLAIN LANGUAGE UPLOADER TYPES
// ===================================================================

export interface ParsedTodoComponents {
  title?: string;
  description?: string;
  tier?: TodoTier;
  parentId?: string;
  status?: TodoStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  tags?: string[];
  dependencies?: string[];
  blockedBy?: string[];
  blocks?: string[];
}

export interface ParsingResult {
  success: boolean;
  components?: ParsedTodoComponents;
  errors?: ParsingError[];
  suggestions?: string[];
}

export interface ParsingError {
  type: 'missing_field' | 'invalid_value' | 'ambiguous' | 'inconsistency';
  field?: string;
  value?: string;
  message: string;
}

// ===================================================================
// LOOKUP TRIGGERS TYPES
// ===================================================================

export type TriggerConditionType =
  | 'has_unreviewed_citations'
  | 'has_high_priority_citations'
  | 'has_citations_in_context'
  | 'has_conflicts'
  | 'has_high_severity_conflicts'
  | 'has_conflicts_affecting_todo'
  | 'has_recent_changes'
  | 'has_propagation_changes'
  | 'has_planning_doc_changes'
  | 'todo_status_changed'
  | 'parent_status_changed'
  | 'child_status_changed';

export interface TriggerCondition {
  type: TriggerConditionType;
  priority?: CitationPriority;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  hours?: number;
  context?: CitationContext;
}

export interface TriggerDefinition {
  id: string;
  name: string;
  junction: CitationContext;
  conditions: TriggerCondition[];
  priority: CitationPriority;
  suppressible: boolean;
  action: 'show_citations' | 'block_until_review';
}

export interface TriggerConfig {
  feature: string;
  triggers: TriggerDefinition[];
  suppressions: Array<{
    triggerId: string;
    suppressedUntil: string; // ISO 8601
  }>;
}

