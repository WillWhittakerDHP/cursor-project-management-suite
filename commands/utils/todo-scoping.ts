/**
 * Todo Management System - Todo Scoping Implementation
 * 
 * Functions for maintaining abstraction levels, detecting scope creep,
 * and aggregating details across the four-tier hierarchy.
 */

import { Todo, Scope, ScopeViolation, ScopeCorrection, AbstractionLevel, TodoTier } from './todo-types';
import { saveTodo, getAllTodos } from './todo-io';

// ===================================================================
// SCOPE PROPERTY MANAGEMENT
// ===================================================================

/**
 * Get default scope for a tier
 */
export function getDefaultScopeForTier(tier: TodoTier): Scope {
  const scopes: Record<TodoTier, Scope> = {
    feature: {
      level: 'feature',
      abstraction: 'high',
      detailLevel: 'high-level',
      allowedDetails: ['objectives', 'phases', 'major_milestones'],
      forbiddenDetails: ['implementation', 'specific_technologies', 'code'],
      inheritedFrom: null,
    },
    phase: {
      level: 'phase',
      abstraction: 'medium-high',
      detailLevel: 'focused',
      allowedDetails: ['objectives', 'sessions', 'dependencies', 'high_level_tasks'],
      forbiddenDetails: ['implementation_details', 'specific_apis', 'code_snippets'],
      inheritedFrom: null,
    },
    session: {
      level: 'session',
      abstraction: 'medium',
      detailLevel: 'focused',
      allowedDetails: ['objectives', 'tasks', 'dependencies', 'approach'],
      forbiddenDetails: ['specific_code', 'detailed_implementation_steps'],
      inheritedFrom: null,
    },
    task: {
      level: 'task',
      abstraction: 'low',
      detailLevel: 'granular',
      allowedDetails: ['all'],
      forbiddenDetails: [],
      inheritedFrom: null,
    },
  };
  
  return scopes[tier];
}

/**
 * Inherit scope from parent todo
 */
export function inheritScope(parentTodo: Todo, childTier: TodoTier): Scope {
  const parentScope = parentTodo.scope || getDefaultScopeForTier(parentTodo.tier);
  
  const childScope = getDefaultScopeForTier(childTier);
  childScope.inheritedFrom = parentTodo.id;
  
  // Adjust abstraction based on parent
  if (parentScope.abstraction === 'high' && childTier === 'phase') {
    childScope.abstraction = 'medium-high';
  } else if (parentScope.abstraction === 'medium-high' && childTier === 'session') {
    childScope.abstraction = 'medium';
  } else if (parentScope.abstraction === 'medium' && childTier === 'task') {
    childScope.abstraction = 'low';
  }
  
  return childScope;
}

/**
 * Assign scope to todo
 */
export async function assignScope(feature: string, todo: Todo, parentTodo?: Todo | null): Promise<void> {
  if (!todo.scope) {
    if (parentTodo) {
      todo.scope = inheritScope(parentTodo, todo.tier);
    } else {
      todo.scope = getDefaultScopeForTier(todo.tier);
    }
    await saveTodo(feature, todo);
  }
}

// ===================================================================
// SCOPE CREEP DETECTION
// ===================================================================

/**
 * Detect scope creep violations
 */
export function detectScopeCreep(todo: Todo): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  
  if (!todo.scope) {
    return violations; // No scope to check
  }
  
  const scope = todo.scope;
  
  // Check forbidden details
  for (const forbiddenType of scope.forbiddenDetails) {
    if (containsDetailType(todo, forbiddenType)) {
      violations.push({
        type: 'forbidden_detail',
        detailType: forbiddenType,
        location: findDetailLocation(todo, forbiddenType),
        description: `Todo contains forbidden detail type: ${forbiddenType}`,
      });
    }
  }
  
  // Check abstraction level
  if (scope.abstraction === 'high' && containsMediumLevelDetails(todo)) {
    violations.push({
      type: 'abstraction_violation',
      description: 'High-level todo contains medium-level details',
    });
  }
  
  // Check detail level
  if (scope.detailLevel === 'high-level' && containsGranularDetails(todo)) {
    violations.push({
      type: 'detail_level_violation',
      description: 'High-level detail todo contains granular details',
    });
  }
  
  return violations;
}

/**
 * Check if todo contains a specific detail type
 */
function containsDetailType(todo: Todo, detailType: string): boolean {
  const text = `${todo.title} ${todo.description}`.toLowerCase();
  
  const patterns: Record<string, RegExp[]> = {
    implementation: [/implement/, /code/, /function/, /class/],
    specific_technologies: [/vue\.js/, /react/, /typescript/, /javascript/],
    code: [/```/, /function\s+\w+/, /const\s+\w+\s*=/],
    implementation_details: [/step\s+\d+/, /first\s+do/, /then\s+do/],
    specific_apis: [/\.get\(/, /\.post\(/, /api\./],
    code_snippets: [/```[\s\S]*?```/],
    specific_code: [/const\s+\w+\s*=\s*\{/, /export\s+function/],
    detailed_implementation_steps: [/step\s+\d+:/, /first:/, /second:/, /third:/],
  };
  
  const regexes = patterns[detailType] || [];
  return regexes.some(regex => regex.test(text));
}

/**
 * Find location of detail type in todo
 */
function findDetailLocation(todo: Todo, detailType: string): string {
  if (containsDetailType(todo, detailType)) {
    if (todo.description && containsDetailType({ ...todo, title: '' }, detailType)) {
      return 'description';
    }
    return 'title';
  }
  return 'unknown';
}

/**
 * Check if todo contains medium-level details
 */
function containsMediumLevelDetails(todo: Todo): boolean {
  const text = `${todo.title} ${todo.description}`.toLowerCase();
  return /session|task|phase/.test(text) && /implement|create|build/.test(text);
}

/**
 * Check if todo contains granular details
 */
function containsGranularDetails(todo: Todo): boolean {
  const text = `${todo.title} ${todo.description}`.toLowerCase();
  return /step|first|then|finally|code|function|class/.test(text);
}

// ===================================================================
// SCOPE VALIDATION
// ===================================================================

/**
 * Validate todo scope
 */
export async function validateScope(feature: string, todo: Todo, parentTodo?: Todo | null): Promise<{
  valid: boolean;
  errors: Array<{ type: string; description: string }>;
}> {
  const errors: Array<{ type: string; description: string }> = [];
  
  // Ensure scope exists
  if (!todo.scope) {
    if (parentTodo) {
      todo.scope = inheritScope(parentTodo, todo.tier);
    } else {
      todo.scope = getDefaultScopeForTier(todo.tier);
    }
  }
  
  // Check scope level matches tier
  if (todo.scope.level !== todo.tier) {
    errors.push({
      type: 'scope_tier_mismatch',
      description: `Scope level ${todo.scope.level} does not match tier ${todo.tier}`,
    });
  }
  
  // Check abstraction appropriateness
  const expectedAbstraction = getExpectedAbstraction(todo.tier);
  if (todo.scope.abstraction !== expectedAbstraction) {
    errors.push({
      type: 'abstraction_mismatch',
      description: `Abstraction ${todo.scope.abstraction} not appropriate for tier ${todo.tier}`,
    });
  }
  
  // Check for scope creep
  const violations = detectScopeCreep(todo);
  if (violations.length > 0) {
    errors.push({
      type: 'scope_creep',
      description: `Found ${violations.length} scope violations`,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get expected abstraction for tier
 */
function getExpectedAbstraction(tier: TodoTier): AbstractionLevel {
  const abstractions: Record<TodoTier, AbstractionLevel> = {
    feature: 'high',
    phase: 'medium-high',
    session: 'medium',
    task: 'low',
  };
  return abstractions[tier];
}

/**
 * Enforce scope (validate and optionally auto-correct)
 */
export async function enforceScope(
  feature: string,
  todo: Todo,
  parentTodo: Todo | null | undefined,
  mode: 'strict' | 'warn' | 'auto' = 'warn'
): Promise<Todo> {
  const validation = await validateScope(feature, todo, parentTodo);
  
  if (!validation.valid) {
    if (mode === 'strict') {
      throw new Error(`Scope validation failed: ${validation.errors.map(e => e.description).join(', ')}`);
    } else if (mode === 'auto') {
      // Auto-correct scope violations
      const violations = detectScopeCreep(todo);
      for (const violation of violations) {
        if (violation.type === 'forbidden_detail' && violation.detailType) {
          // Remove or filter forbidden details
          // This is simplified - in production, would have more sophisticated filtering
          if (violation.location === 'description') {
            todo.description = filterForbiddenDetails(todo.description, violation.detailType);
          }
        }
      }
    }
    // In 'warn' mode, just return the todo as-is
  }
  
  return todo;
}

/**
 * Filter forbidden details from text
 */
function filterForbiddenDetails(text: string, detailType: string): string {
  // Simplified filtering - in production, would have more sophisticated logic
  const patterns: Record<string, RegExp> = {
    code: /```[\s\S]*?```/g,
    implementation: /implement\s+[^.]*\./gi,
  };
  
  const pattern = patterns[detailType];
  if (pattern) {
    return text.replace(pattern, '[filtered]');
  }
  
  return text;
}

// ===================================================================
// DETAIL AGGREGATION
// ===================================================================

/**
 * Aggregate details from child todos for parent
 */
export async function aggregateDetails(feature: string, parentTodo: Todo): Promise<{
  objectives: string[];
  tasks: Array<{ id: string; title: string; status: string }>;
  dependencies: string[];
  status: string;
  progress: { completed: number; inProgress: number; pending: number; total: number };
}> {
  const allTodos = await getAllTodos(feature);
  const childTodos = allTodos.filter(t => t.parentId === parentTodo.id);
  
  const aggregated = {
    objectives: [] as string[],
    tasks: [] as Array<{ id: string; title: string; status: string }>,
    dependencies: [] as string[],
    status: 'pending' as string,
    progress: {
      completed: 0,
      inProgress: 0,
      pending: 0,
      total: childTodos.length,
    },
  };
  
  for (const child of childTodos) {
    // Aggregate objectives
    if (child.tier === 'session' || child.tier === 'phase') {
      aggregated.objectives.push(summarizeObjective(child));
    }
    
    // Aggregate tasks
    if (child.tier === 'task') {
      aggregated.tasks.push({
        id: child.id,
        title: child.title,
        status: child.status,
      });
    }
    
    // Aggregate dependencies
    if (child.blockedBy) {
      aggregated.dependencies.push(...child.blockedBy);
    }
    
    // Count progress
    if (child.status === 'completed') {
      aggregated.progress.completed++;
    } else if (child.status === 'in_progress') {
      aggregated.progress.inProgress++;
    } else {
      aggregated.progress.pending++;
    }
  }
  
  // Determine overall status
  if (aggregated.progress.completed === aggregated.progress.total) {
    aggregated.status = 'completed';
  } else if (aggregated.progress.inProgress > 0 || aggregated.progress.completed > 0) {
    aggregated.status = 'in_progress';
  }
  
  return aggregated;
}

/**
 * Generate summary for parent todo
 */
export async function generateSummary(feature: string, todo: Todo): Promise<{
  title: string;
  status: string;
  objectives: string[];
  progress: { completed: number; inProgress: number; pending: number; total: number };
  keyDependencies: string[];
  nextSteps: string[];
}> {
  const aggregated = await aggregateDetails(feature, todo);

  const summary = {
    title: todo.title,
    status: aggregated.status,
    objectives: aggregated.objectives,
    progress: aggregated.progress,
    keyDependencies: [...new Set(aggregated.dependencies)],
    nextSteps: generateNextSteps(aggregated.tasks),
  };

  return summary;
}

/**
 * Summarize objective from todo
 */
function summarizeObjective(todo: Todo): string {
  if (todo.description) {
    // Extract first sentence or first 100 chars
    const sentences = todo.description.split(/[.!?]/);
    return sentences[0] || todo.description.substring(0, 100);
  }
  return todo.title;
}

/**
 * Generate next steps from tasks
 */
function generateNextSteps(tasks: Array<{ id: string; title: string; status: string }>): string[] {
  return tasks
    .filter(t => t.status === 'pending' || t.status === 'in_progress')
    .slice(0, 5)
    .map(t => t.title);
}

/**
 * Filter details for tier level
 */
export function filterDetailsForTier(details: string[], targetTier: TodoTier): string[] {
  const scope = getDefaultScopeForTier(targetTier);
  const filtered: string[] = [];
  
  for (const detail of details) {
    if (isAllowedDetail(detail, scope)) {
      filtered.push(detail);
    } else if (canSummarizeDetail(detail, scope)) {
      filtered.push(summarizeDetail(detail, scope));
    }
  }
  
  return filtered;
}

/**
 * Check if detail is allowed for scope
 */
function isAllowedDetail(detail: string, scope: Scope): boolean {
  if (scope.allowedDetails.includes('all')) {
    return true;
  }
  
  // Simplified check - in production, would have more sophisticated logic
  return true; // Placeholder
}

/**
 * Check if detail can be summarized
 */
function canSummarizeDetail(detail: string, scope: Scope): boolean {
  // Simplified - in production, would check if detail can be abstracted
  return scope.abstraction !== 'low';
}

/**
 * Summarize detail for scope
 */
function summarizeDetail(detail: string, _scope: Scope): string {
  // Simplified summarization - in production, would have more sophisticated logic
  if (detail.length > 100) {
    return detail.substring(0, 100) + '...';
  }
  return detail;
}

// ===================================================================
// SCOPE CORRECTION SUGGESTIONS
// ===================================================================

/**
 * Suggest corrections for scope violations
 */
export function suggestCorrections(violations: ScopeViolation[]): ScopeCorrection[] {
  const suggestions: ScopeCorrection[] = [];
  
  for (const violation of violations) {
    if (violation.type === 'forbidden_detail') {
      suggestions.push({
        type: 'move_detail',
        detail: violation.detailType || 'detail',
        suggestedLocation: 'task-level-todo',
        reason: 'Detail is too granular for this tier',
      });
    } else if (violation.type === 'abstraction_violation') {
      suggestions.push({
        type: 'summarize_detail',
        detail: violation.description,
        suggestedSummary: violation.description.substring(0, 50) + '...',
        reason: 'Detail should be summarized for this abstraction level',
      });
    }
  }
  
  return suggestions;
}

