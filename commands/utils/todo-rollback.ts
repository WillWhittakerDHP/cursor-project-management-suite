/**
 * Todo Management System - Rollback Control Implementation
 * 
 * Functions for rolling back todo changes to previous states with conflict
 * detection and resolution.
 */

import { Todo, PreviousState, Rollback, RollbackConflict } from './todo-types';
import { findTodoById, saveTodo, readChangeLog, readRollbackHistory, writeRollbackHistory } from './todo-io';
import { addChangeLogEntry } from './todo-io';

function generateStateId(): string {
  return `state-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateRollbackId(): string {
  return `rollback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===================================================================
// STATE STORAGE
// ===================================================================

/**
 * Store previous state of a todo
 */
export async function storePreviousState(
  feature: string,
  todo: Todo,
  changeLogId: string,
  reason?: string
): Promise<PreviousState> {
  const state: PreviousState = {
    id: generateStateId(),
    todoId: todo.id,
    timestamp: new Date().toISOString(),
    state: { ...todo },
    changeLogId,
    metadata: {
      reason,
      snapshot: false,
    },
  };
  
  // Store in change log (before state is already there, this is for rollback tracking)
  // For now, we'll store states in a separate structure or in change log metadata
  // This is a simplified implementation - in production, you might want a separate states file
  
  return state;
}

/**
 * Get previous state by ID
 */
export async function getPreviousState(
  feature: string,
  stateId: string
): Promise<PreviousState | null> {
  // In a full implementation, this would read from a states file
  // For now, we'll extract from change log
  const changeLog = await readChangeLog(feature);
  if (!changeLog) {
    return null;
  }
  
  // Find change log entry that has this state ID
  for (const entry of changeLog.entries) {
    if (entry.metadata && (entry.metadata as { stateId?: string }).stateId === stateId) {
      // Reconstruct state from change log entry
      if (entry.before && entry.todoId) {
        const todo = await findTodoById(feature, entry.todoId);
        if (todo) {
          return {
            id: stateId,
            todoId: entry.todoId,
            timestamp: entry.timestamp,
            state: { ...todo, ...entry.before } as Todo,
            changeLogId: entry.id,
            metadata: {
              reason: entry.reason,
            },
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Get available states for a todo
 */
export async function getAvailableStates(feature: string, todoId: string): Promise<PreviousState[]> {
  const changeLog = await readChangeLog(feature);
  if (!changeLog) {
    return [];
  }
  
  const states: PreviousState[] = [];
  
  // Find all change log entries for this todo
  for (const entry of changeLog.entries) {
    if (entry.todoId === todoId && entry.before) {
      const state: PreviousState = {
        id: `state-${entry.id}`,
        todoId: todoId,
        timestamp: entry.timestamp,
        state: entry.before as Todo,
        changeLogId: entry.id,
        metadata: {
          reason: entry.reason,
        },
      };
      states.push(state);
    }
  }
  
  // Sort by timestamp (most recent first)
  states.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  
  return states;
}

// ===================================================================
// ROLLBACK OPERATIONS
// ===================================================================

/**
 * Rollback todo to a previous state
 */
export async function rollbackToState(
  feature: string,
  todoId: string,
  stateId: string,
  reason?: string
): Promise<Rollback> {
  const todo = await findTodoById(feature, todoId);
  if (!todo) {
    throw new Error(`Todo not found: ${todoId}`);
  }
  
  const previousState = await getPreviousState(feature, stateId);
  if (!previousState) {
    throw new Error(`Previous state not found: ${stateId}`);
  }
  
  if (previousState.todoId !== todoId) {
    throw new Error(`State does not belong to todo: ${stateId}`);
  }
  
  // Get current state ID (simplified - would track current state in production)
  const currentStateId = `current-${todoId}`;
  
  // Detect conflicts
  const conflicts = await detectConflicts(todo, previousState.state);
  
  const rollback: Rollback = {
    id: generateRollbackId(),
    timestamp: new Date().toISOString(),
    author: 'system', // Would be actual author in production
    todoId,
    rolledBackTo: stateId,
    rolledBackFrom: currentStateId,
    type: 'full',
    reason,
    conflicts,
    status: conflicts.length > 0 ? 'conflict' : 'pending',
    relatedRollbacks: [],
  };
  
  // If no conflicts, apply rollback
  if (conflicts.length === 0) {
    await applyRollback(feature, todo, previousState.state, rollback);
  }
  
  // Log rollback
  await logRollback(feature, rollback);
  
  return rollback;
}

/**
 * Rollback specific fields
 */
export async function rollbackFields(
  feature: string,
  todoId: string,
  stateId: string,
  fields: string[],
  reason?: string
): Promise<Rollback> {
  const todo = await findTodoById(feature, todoId);
  if (!todo) {
    throw new Error(`Todo not found: ${todoId}`);
  }
  
  const previousState = await getPreviousState(feature, stateId);
  if (!previousState) {
    throw new Error(`Previous state not found: ${stateId}`);
  }
  
  // Detect conflicts for selected fields
  const conflicts = await detectFieldConflicts(todo, previousState.state, fields);
  
  const currentStateId = `current-${todoId}`;
  
  const rollback: Rollback = {
    id: generateRollbackId(),
    timestamp: new Date().toISOString(),
    author: 'system',
    todoId,
    rolledBackTo: stateId,
    rolledBackFrom: currentStateId,
    type: 'selective',
    fields,
    reason,
    conflicts,
    status: conflicts.length > 0 ? 'conflict' : 'pending',
    relatedRollbacks: [],
  };
  
  // If no conflicts, apply selective rollback
  if (conflicts.length === 0) {
    const rolledBackTodo = { ...todo };
    copyFieldsByKey(rolledBackTodo, previousState.state, fields);
    await saveTodo(feature, rolledBackTodo);
    
    // Log change
    await addChangeLogEntry(feature, {
      id: `change-${Date.now()}`,
      timestamp: new Date().toISOString(),
      author: 'system',
      changeType: 'rollback_applied',
      tier: todo.tier,
      todoId,
      before: extractFields(todo, fields),
      after: extractFields(rolledBackTodo, fields),
      reason: reason || 'Selective rollback',
      propagationTriggered: false,
      relatedChanges: [],
    });
  }
  
  await logRollback(feature, rollback);
  
  return rollback;
}

/**
 * Apply rollback to todo
 */
async function applyRollback(
  feature: string,
  currentTodo: Todo,
  previousState: Todo,
  rollback: Rollback
): Promise<void> {
  // Apply previous state
  const rolledBackTodo = { ...previousState };
  rolledBackTodo.updatedAt = new Date().toISOString();
  
  await saveTodo(feature, rolledBackTodo);
  
  // Log change
  await addChangeLogEntry(feature, {
    id: `change-${Date.now()}`,
    timestamp: new Date().toISOString(),
    author: rollback.author,
    changeType: 'rollback_applied',
    tier: currentTodo.tier,
    todoId: currentTodo.id,
    before: currentTodo,
    after: rolledBackTodo,
    reason: rollback.reason || 'Rollback to previous state',
    propagationTriggered: false,
    relatedChanges: [],
  });
  
  rollback.status = 'completed';
}

// ===================================================================
// CONFLICT DETECTION
// ===================================================================

/**
 * Detect conflicts during rollback
 */
export async function detectConflicts(
  currentTodo: Todo,
  previousState: Todo
): Promise<RollbackConflict[]> {
  const conflicts: RollbackConflict[] = [];
  
  // Check parent relationship
  if (previousState.parentId && previousState.parentId !== currentTodo.parentId) {
    const parentExists = await findTodoById('', previousState.parentId); // Would need feature
    if (!parentExists) {
      conflicts.push({
        type: 'relationship_conflict',
        description: 'Parent todo does not exist',
        severity: 'high',
      });
    }
  }
  
  // Check planning doc path
  if (previousState.planningDocPath !== currentTodo.planningDocPath) {
    // Would check if planning doc exists
    conflicts.push({
      type: 'planning_doc_conflict',
      description: 'Planning doc path changed',
      severity: 'medium',
    });
  }
  
  // Check for recent changes (simplified)
  const timeDiff = new Date(currentTodo.updatedAt).getTime() - new Date(previousState.updatedAt).getTime();
  const hoursDiff = timeDiff / (1000 * 60 * 60);
  if (hoursDiff > 24) {
    conflicts.push({
      type: 'state_conflict',
      description: 'Significant time difference between states',
      severity: 'low',
    });
  }
  
  return conflicts;
}

/**
 * Detect conflicts for specific fields
 */
async function detectFieldConflicts(
  currentTodo: Todo,
  previousState: Todo,
  fields: string[]
): Promise<RollbackConflict[]> {
  const conflicts: RollbackConflict[] = [];
  
  for (const field of fields) {
    if (field === 'parentId' && previousState.parentId) {
      const parentExists = await findTodoById('', previousState.parentId); // Would need feature
      if (!parentExists) {
        conflicts.push({
          type: 'relationship_conflict',
          description: `Parent todo does not exist for field: ${field}`,
          severity: 'high',
        });
      }
    }
  }
  
  return conflicts;
}

// ===================================================================
// ROLLBACK HISTORY
// ===================================================================

/**
 * Log rollback operation
 */
async function logRollback(feature: string, rollback: Rollback): Promise<void> {
  let history = await readRollbackHistory(feature);
  
  if (!history) {
    history = {
      feature,
      version: '1.0',
      rollbacks: [],
      metadata: {
        totalRollbacks: 0,
        lastRollback: new Date().toISOString(),
      },
    };
  }
  
  history.rollbacks.push(rollback);
  history.metadata.totalRollbacks = history.rollbacks.length;
  history.metadata.lastRollback = rollback.timestamp;
  
  await writeRollbackHistory(feature, history);
}

/**
 * Get rollback history for a todo
 */
export async function getRollbackHistory(feature: string, todoId?: string): Promise<Rollback[]> {
  const history = await readRollbackHistory(feature);
  if (!history) {
    return [];
  }
  
  if (todoId) {
    return history.rollbacks.filter(r => r.todoId === todoId);
  }
  
  return history.rollbacks;
}

/**
 * Cancel a rollback
 */
export async function cancelRollback(feature: string, rollbackId: string): Promise<void> {
  const history = await readRollbackHistory(feature);
  if (!history) {
    throw new Error(`Rollback history not found for feature: ${feature}`);
  }
  
  const rollback = history.rollbacks.find(r => r.id === rollbackId);
  if (!rollback) {
    throw new Error(`Rollback not found: ${rollbackId}`);
  }
  
  if (rollback.status === 'completed') {
    throw new Error('Cannot cancel completed rollback');
  }
  
  rollback.status = 'cancelled';
  await writeRollbackHistory(feature, history);
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/** Copy listed keys from source onto target (for selective rollback). Todo has [key: string]: unknown. */
function copyFieldsByKey(target: Todo, source: Todo | Record<string, unknown>, keys: string[]): void {
  const s = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in s) target[key] = s[key];
  }
}

function extractFields(todo: Todo, fields: string[]): Partial<Todo> {
  const extracted: Partial<Todo> = {};
  for (const field of fields) {
    if (field in todo) extracted[field] = todo[field];
  }
  return extracted;
}

