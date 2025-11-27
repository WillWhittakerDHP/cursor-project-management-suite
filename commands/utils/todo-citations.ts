/**
 * Todo Management System - Citation System Implementation
 * 
 * Functions for creating, managing, and querying citations that link todos
 * to change log entries for context-aware lookups at critical workflow junctions.
 */

import { Todo, Citation, CitationPriority, CitationContext, CitationType, ChangeLogEntry } from './todo-types';
import { findTodoById, saveTodo, getChangeLogEntry, getAllTodos } from './todo-io';

function generateCitationId(): string {
  return `citation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ===================================================================
// CITATION CREATION
// ===================================================================

/**
 * Create a citation for a todo linking it to a change log entry
 */
export async function createCitation(
  feature: string,
  todoId: string,
  changeLogId: string,
  type: CitationType,
  context: CitationContext[],
  priority: CitationPriority,
  metadata?: Citation['metadata']
): Promise<Citation> {
  const citation: Citation = {
    id: generateCitationId(),
    changeLogId,
    type,
    priority,
    context,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    metadata,
  };
  
  // Load todo and add citation
  const todo = await findTodoById(feature, todoId);
  if (!todo) {
    throw new Error(`Todo not found: ${todoId}`);
  }
  
  if (!todo.citations) {
    todo.citations = [];
  }
  
  todo.citations.push(citation);
  await saveTodo(feature, todo);
  
  return citation;
}

/**
 * Create citation automatically from change log entry
 */
export async function createCitationFromChange(
  feature: string,
  todoId: string,
  changeLogId: string,
  context: CitationContext[]
): Promise<Citation | null> {
  const changeLogEntry = await getChangeLogEntry(feature, changeLogId);
  if (!changeLogEntry) {
    return null;
  }
  
  // Determine citation type from change type
  const type = getCitationTypeFromChangeType(changeLogEntry.changeType);
  if (!type) {
    return null;
  }
  
  // Determine priority based on change type and context
  const priority = determineCitationPriority(changeLogEntry, context);
  
  // Extract metadata from change log entry
  const metadata = extractCitationMetadata(changeLogEntry);
  
  return createCitation(feature, todoId, changeLogId, type, context, priority, metadata);
}

/**
 * Create citations for all affected todos when planning doc changes
 */
export async function createCitationsForPlanningDocChange(
  feature: string,
  changeLogId: string,
  affectedTodoIds: string[],
  context: CitationContext[]
): Promise<Citation[]> {
  const citations: Citation[] = [];
  
  for (const todoId of affectedTodoIds) {
    const citation = await createCitationFromChange(
      feature,
      todoId,
      changeLogId,
      context
    );
    if (citation) {
      citations.push(citation);
    }
  }
  
  return citations;
}

// ===================================================================
// CITATION LOOKUP
// ===================================================================

/**
 * Lookup citations for a todo in a specific context
 */
export async function lookupCitations(
  feature: string,
  todoId: string,
  context: CitationContext
): Promise<Citation[]> {
  const todo = await findTodoById(feature, todoId);
  if (!todo || !todo.citations) {
    return [];
  }
  
  // Filter by context
  const relevantCitations = todo.citations.filter(citation =>
    citation.context.includes(context)
  );
  
  // Filter out dismissed citations
  const activeCitations = relevantCitations.filter(citation =>
    citation.reviewedAt === null || citation.reviewedAt === undefined
  );
  
  // Prioritize citations
  return prioritizeCitations(activeCitations, context);
}

/**
 * Lookup citations for multiple todos
 */
export async function lookupCitationsForTodos(
  feature: string,
  todoIds: string[],
  context: CitationContext
): Promise<Map<string, Citation[]>> {
  const results = new Map<string, Citation[]>();
  
  for (const todoId of todoIds) {
    const citations = await lookupCitations(feature, todoId, context);
    if (citations.length > 0) {
      results.set(todoId, citations);
    }
  }
  
  return results;
}

/**
 * Get all unreviewed citations for a todo
 */
export async function getUnreviewedCitations(
  feature: string,
  todoId: string
): Promise<Citation[]> {
  const todo = await findTodoById(feature, todoId);
  if (!todo || !todo.citations) {
    return [];
  }
  
  return todo.citations.filter(citation =>
    citation.reviewedAt === null || citation.reviewedAt === undefined
  );
}

/**
 * Get high priority citations for a todo
 */
export async function getHighPriorityCitations(
  feature: string,
  todoId: string,
  minPriority: CitationPriority = 'high'
): Promise<Citation[]> {
  const todo = await findTodoById(feature, todoId);
  if (!todo || !todo.citations) {
    return [];
  }
  
  const priorityOrder: CitationPriority[] = ['low', 'medium', 'high', 'critical'];
  const minPriorityIndex = priorityOrder.indexOf(minPriority);
  
  return todo.citations.filter(citation => {
    const citationPriorityIndex = priorityOrder.indexOf(citation.priority);
    return citationPriorityIndex >= minPriorityIndex;
  });
}

// ===================================================================
// CITATION REVIEW
// ===================================================================

/**
 * Mark citation as reviewed
 */
export async function reviewCitation(
  feature: string,
  todoId: string,
  citationId: string
): Promise<void> {
  const todo = await findTodoById(feature, todoId);
  if (!todo || !todo.citations) {
    throw new Error(`Todo or citations not found: ${todoId}`);
  }
  
  const citation = todo.citations.find(c => c.id === citationId);
  if (!citation) {
    throw new Error(`Citation not found: ${citationId}`);
  }
  
  citation.reviewedAt = new Date().toISOString();
  await saveTodo(feature, todo);
}

/**
 * Dismiss citation (mark as reviewed and don't show again)
 */
export async function dismissCitation(
  feature: string,
  todoId: string,
  citationId: string
): Promise<void> {
  await reviewCitation(feature, todoId, citationId);
  // Additional dismissal logic can be added here if needed
}

/**
 * Defer citation review
 */
export async function deferCitation(
  feature: string,
  todoId: string,
  citationId: string,
  deferUntil: Date
): Promise<void> {
  const todo = await findTodoById(feature, todoId);
  if (!todo || !todo.citations) {
    throw new Error(`Todo or citations not found: ${todoId}`);
  }
  
  const citation = todo.citations.find(c => c.id === citationId);
  if (!citation) {
    throw new Error(`Citation not found: ${citationId}`);
  }
  
  if (!citation.metadata) {
    citation.metadata = {};
  }
  
  citation.metadata.reviewDeadline = deferUntil.toISOString();
  await saveTodo(feature, todo);
}

// ===================================================================
// CITATION QUERYING
// ===================================================================

/**
 * Query citations by various filters
 */
export async function queryCitations(
  feature: string,
  filters: {
    todoId?: string;
    changeLogId?: string;
    type?: CitationType;
    priority?: CitationPriority;
    context?: CitationContext;
    unreviewed?: boolean;
  }
): Promise<Citation[]> {
  const todos = filters.todoId
    ? [await findTodoById(feature, filters.todoId)].filter(Boolean) as Todo[]
    : await getAllTodos(feature);
  
  const citations: Citation[] = [];
  
  for (const todo of todos) {
    if (!todo.citations) continue;
    
    for (const citation of todo.citations) {
      // Apply filters
      if (filters.changeLogId && citation.changeLogId !== filters.changeLogId) continue;
      if (filters.type && citation.type !== filters.type) continue;
      if (filters.priority && citation.priority !== filters.priority) continue;
      if (filters.context && !citation.context.includes(filters.context)) continue;
      if (filters.unreviewed && citation.reviewedAt) continue;
      
      citations.push(citation);
    }
  }
  
  return citations;
}

// ===================================================================
// CONTEXT-AWARE CITATION FILTERING
// ===================================================================

/**
 * Score citation relevance for a context
 */
export function scoreCitation(citation: Citation, context: CitationContext): number {
  let score = 0;
  
  // Priority score
  const priorityScores: Record<CitationPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  score += priorityScores[citation.priority];
  
  // Review status score (unreviewed gets higher score)
  if (!citation.reviewedAt) {
    score += 2;
  }
  
  // Recency score (recent citations get higher score)
  const age = Date.now() - new Date(citation.createdAt).getTime();
  const hours = age / (1000 * 60 * 60);
  if (hours < 24) {
    score += 2;
  } else if (hours < 7 * 24) {
    score += 1;
  }
  
  // Context match score
  if (citation.context.includes(context)) {
    score += 2;
  } else if (citation.context.some(c => c.includes(context.split('-')[0]))) {
    score += 1;
  }
  
  return score;
}

/**
 * Prioritize citations by relevance score
 */
export function prioritizeCitations(
  citations: Citation[],
  context: CitationContext
): Citation[] {
  const scored = citations.map(citation => ({
    citation,
    score: scoreCitation(citation, context),
  }));
  
  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);
  
  return scored.map(item => item.citation);
}

/**
 * Filter citations by context
 */
export function filterCitationsByContext(
  citations: Citation[],
  context: CitationContext
): Citation[] {
  return citations.filter(citation => {
    // Skip dismissed citations
    if (citation.reviewedAt) {
      return false;
    }
    
    // Check if deferred
    if (citation.metadata?.reviewDeadline) {
      const deadline = new Date(citation.metadata.reviewDeadline);
      if (deadline > new Date()) {
        return false; // Still deferred
      }
    }
    
    // Check context match
    return citation.context.includes(context);
  });
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

function getCitationTypeFromChangeType(changeType: ChangeLogEntry['changeType']): CitationType | null {
  const mapping: Record<string, CitationType> = {
    todo_status_changed: 'status_change',
    todo_updated: 'description_change',
    todo_moved: 'parent_change',
    planning_doc_updated: 'planning_doc_change',
    planning_doc_synced: 'planning_doc_change',
    propagation_triggered: 'propagation_change',
    propagation_completed: 'propagation_change',
    propagation_conflict: 'conflict_detected',
    rollback_applied: 'rollback_applied',
  };
  
  return mapping[changeType] || null;
}

function determineCitationPriority(
  changeLogEntry: ChangeLogEntry,
  context: CitationContext[]
): CitationPriority {
  // Critical contexts always get high priority
  if (context.includes('conflict-detection')) {
    return 'critical';
  }
  
  // Status changes are usually high priority
  if (changeLogEntry.changeType === 'todo_status_changed') {
    return 'high';
  }
  
  // Propagation changes are medium-high priority
  if (changeLogEntry.changeType.startsWith('propagation_')) {
    return 'high';
  }
  
  // Conflicts are critical
  if (changeLogEntry.changeType === 'propagation_conflict' || changeLogEntry.conflicts) {
    return 'critical';
  }
  
  // Default to medium
  return 'medium';
}

function extractCitationMetadata(changeLogEntry: ChangeLogEntry): Citation['metadata'] {
  return {
    reason: changeLogEntry.reason,
    impact: assessImpact(changeLogEntry),
    affectedTodos: changeLogEntry.relatedChanges,
    requiresReview: changeLogEntry.conflicts?.some(c => c.requiresReview) || false,
  };
}

function assessImpact(changeLogEntry: ChangeLogEntry): string {
  if (changeLogEntry.changeType === 'todo_status_changed') {
    return 'affects_todo_status';
  }
  if (changeLogEntry.changeType.startsWith('propagation_')) {
    return 'affects_multiple_todos';
  }
  if (changeLogEntry.conflicts) {
    return 'has_conflicts';
  }
  return 'affects_todo';
}

