/**
 * Todo Management System - Plain Language Uploader Implementation
 * 
 * Functions for parsing natural language input and creating structured todos
 * with validation and error handling.
 * 
 * Uses shared parsing utilities from natural-language-parser.ts for common patterns.
 */

import { Todo, TodoTier, TodoStatus, ParsedTodoComponents, ParsingResult, ParsingError } from './todo-types';
import { findTodoById, getAllTodos, saveTodo } from './todo-io';
import { assignScope, validateScope, enforceScope } from './todo-scoping';
import { tokenize, extractPriority, extractTags, extractDependencies, hasExplicitField, extractExplicitField } from './natural-language-parser';

// ===================================================================
// NATURAL LANGUAGE PARSING
// ===================================================================

/**
 * Parse natural language input into todo components
 */
export function parseNaturalLanguage(input: string, context?: {
  feature?: string;
  currentPhase?: number;
  currentSession?: string;
}): ParsingResult {
  const errors: ParsingError[] = [];
  const suggestions: string[] = [];
  const components: ParsedTodoComponents = {};
  
  // Tokenize input (using shared utility)
  const tokens = tokenize(input);
  
  // Extract components
  try {
    // Extract title (first sentence or explicit field)
    if (hasExplicitField(tokens, 'title')) {
      components.title = extractExplicitField(tokens, 'title');
    } else {
      components.title = extractFirstSentence(tokens);
    }
    
    // Extract tier (keywords or explicit field)
    if (hasExplicitField(tokens, 'tier')) {
      components.tier = extractExplicitField(tokens, 'tier') as TodoTier;
    } else {
      components.tier = extractTierKeywords(tokens) || (context?.currentSession ? 'task' : context?.currentPhase ? 'session' : 'phase');
    }
    
    // Extract description (remaining text or explicit field)
    if (hasExplicitField(tokens, 'description')) {
      components.description = extractExplicitField(tokens, 'description');
    } else {
      components.description = extractDescription(tokens);
    }
    
    // Extract status
    if (hasExplicitField(tokens, 'status')) {
      components.status = extractExplicitField(tokens, 'status') as TodoStatus;
    } else {
      components.status = extractStatusKeywords(tokens) || 'pending';
    }
    
    // Extract priority (using shared utility)
    if (hasExplicitField(tokens, 'priority')) {
      components.priority = extractExplicitField(tokens, 'priority') as 'low' | 'medium' | 'high' | 'critical';
    } else {
      components.priority = extractPriority(tokens);
    }
    
    // Extract tags (using shared utility)
    components.tags = extractTags(tokens);
    
    // Extract dependencies (using shared utility)
    components.dependencies = extractDependencies(tokens);
    
    // Extract parent reference
    // For phase todos, parent is always feature-${feature} (inferred in generateTodoFromComponents)
    // For session todos, parent is inferred from currentPhase context
    // For task todos, parent is inferred from currentSession context
    // So we don't extract parent reference - it will be inferred in generateTodoFromComponents
    if (components.tier === 'phase') {
      // Explicitly don't set parentId for phase todos - it will be inferred as feature-${feature}
      delete components.parentId;
    } else if (components.tier === 'session') {
      // Don't extract parent for session todos - it will be inferred as phase-${currentPhase}
      delete components.parentId;
    } else if (components.tier === 'task') {
      // Don't extract parent for task todos - it will be inferred as session-${currentSession}
      delete components.parentId;
    } else if (hasExplicitField(tokens, 'parent')) {
      // Only extract if explicitly specified
      components.parentId = extractExplicitField(tokens, 'parent');
    }
    
  } catch (error) {
    errors.push({
      type: 'ambiguous',
      message: `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
  
  // Validate completeness
  if (!components.title) {
    errors.push({
      type: 'missing_field',
      field: 'title',
      message: 'Title is required',
    });
    suggestions.push('Provide a title or description for the todo');
  }
  
  if (!components.tier) {
    errors.push({
      type: 'missing_field',
      field: 'tier',
      message: 'Tier level is required',
    });
    suggestions.push('Specify tier level: feature, phase, session, or task');
  }
  
  return {
    success: errors.length === 0,
    components: errors.length === 0 ? components : undefined,
    errors: errors.length > 0 ? errors : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
  };
}

// ===================================================================
// COMPONENT EXTRACTION
// ===================================================================

// Note: tokenize(), hasExplicitField(), extractExplicitField(), extractPriority(),
// extractTags(), and extractDependencies() are now imported from natural-language-parser.ts

function extractFirstSentence(tokens: string[]): string {
  const text = tokens.join(' ');
  const sentences = text.split(/[.!?]/);
  return sentences[0]?.trim() || text.substring(0, 100).trim();
}

function extractDescription(tokens: string[]): string {
  const text = tokens.join(' ');
  // Remove title if it's the first sentence
  const sentences = text.split(/[.!?]/);
  if (sentences.length > 1) {
    return sentences.slice(1).join('.').trim();
  }
  return '';
}

function extractTierKeywords(tokens: string[]): TodoTier | null {
  const text = tokens.join(' ').toLowerCase();
  
  if (text.match(/\bfeature\b/)) return 'feature';
  if (text.match(/\bphase\s+\d+/)) return 'phase';
  if (text.match(/\bsession\s+\d+\.\d+/)) return 'session';
  if (text.match(/\btask\b/) || text.match(/\bsession\s+\d+\.\d+-\d+/)) return 'task';
  
  return null;
}

function extractStatusKeywords(tokens: string[]): TodoStatus | null {
  const text = tokens.join(' ').toLowerCase();
  
  if (text.match(/\b(done|completed|finished)\b/)) return 'completed';
  if (text.match(/\b(started|in progress|working)\b/)) return 'in_progress';
  if (text.match(/\b(blocked|waiting)\b/)) return 'blocked';
  if (text.match(/\b(cancelled|canceled)\b/)) return 'cancelled';
  
  return null;
}

// Note: extractPriority(), extractTags(), and extractDependencies()
// are now imported from natural-language-parser.ts

function extractParentReference(tokens: string[], context?: {
  feature?: string;
  currentPhase?: number;
  currentSession?: string;
}): string | undefined {
  const text = tokens.join(' ').toLowerCase();
  
  // Match explicit parent references
  const parentMatches = text.match(/(?:under|in|part of|parent:)\s*(?:phase\s+)?(\d+)|(?:session\s+)?(\d+\.\d+)|(?:feature\s+)?([\w-]+)/i);
  if (parentMatches) {
    if (parentMatches[1]) {
      return `phase-${parentMatches[1]}`;
    }
    if (parentMatches[2]) {
      return `session-${parentMatches[2]}`;
    }
    if (parentMatches[3]) {
      return `feature-${parentMatches[3]}`;
    }
  }
  
  // Infer from context
  if (context?.currentSession) {
    return `session-${context.currentSession}`;
  }
  if (context?.currentPhase) {
    return `phase-${context.currentPhase}`;
  }
  
  return undefined;
}

// ===================================================================
// TODO GENERATION
// ===================================================================

/**
 * Generate structured todo from parsed components
 */
export async function generateTodoFromComponents(
  feature: string,
  components: ParsedTodoComponents,
  context?: {
    currentPhase?: number;
    currentSession?: string;
  }
): Promise<Todo> {
  if (!components.title) {
    throw new Error('Title is required');
  }
  
  if (!components.tier) {
    throw new Error('Tier is required');
  }
  
  // Generate ID
  const id = generateTodoId(components.tier, context);
  
  // Determine parent
  let parentId: string | null = null;
  if (components.parentId) {
    parentId = components.parentId;
  } else if (components.tier !== 'feature') {
    // Infer parent from context
    if (components.tier === 'task' && context?.currentSession) {
      parentId = `session-${context.currentSession}`;
    } else if (components.tier === 'session' && context?.currentPhase) {
      parentId = `phase-${context.currentPhase}`;
    } else if (components.tier === 'phase') {
      parentId = `feature-${feature}`;
    }
  }
  
  // Infer planning doc path
  const planningDocPath = inferPlanningDocPath(feature, components.tier, context);
  const planningDocSection = inferPlanningDocSection(components.tier);
  
  const todo: Todo = {
    id,
    title: components.title,
    description: components.description || '',
    status: components.status || 'pending',
    tier: components.tier,
    parentId,
    planningDocPath,
    planningDocSection,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: components.tags,
    blockedBy: components.dependencies,
  };
  
  // Assign scope
  if (parentId) {
    const parentTodo = await findTodoById(feature, parentId);
    await assignScope(feature, todo, parentTodo || null);
  } else {
    await assignScope(feature, todo, null);
  }
  
  return todo;
}

/**
 * Generate todo ID based on tier
 */
function generateTodoId(tier: TodoTier, context?: {
  currentPhase?: number;
  currentSession?: string;
}): string {
  const now = Date.now();
  
  switch (tier) {
    case 'feature':
      return `feature-${now}`;
    case 'phase':
      return `phase-${context?.currentPhase || 1}`;
    case 'session':
      if (context?.currentPhase && context?.currentSession) {
        return `session-${context.currentSession}`;
      }
      return `session-${now}`;
    case 'task':
      if (context?.currentSession) {
        // Would need to count existing tasks
        return `session-${context.currentSession}-${now}`;
      }
      return `task-${now}`;
    default:
      return `todo-${now}`;
  }
}

/**
 * Infer planning document path
 */
function inferPlanningDocPath(
  feature: string,
  tier: TodoTier,
  context?: { currentPhase?: number; currentSession?: string }
): string {
  const workflowContext = new WorkflowCommandContext(feature);
  switch (tier) {
    case 'feature':
      return workflowContext.paths.getFeatureGuidePath();
    case 'phase':
      return workflowContext.paths.getPhaseGuidePath(String(context?.currentPhase || 1));
    case 'session':
      return workflowContext.paths.getPhaseGuidePath(String(context?.currentPhase || 1));
    case 'task':
      return workflowContext.paths.getPhaseGuidePath(String(context?.currentPhase || 1));
    default:
      return workflowContext.paths.getFeatureGuidePath();
  }
}

/**
 * Infer planning document section
 */
function inferPlanningDocSection(tier: TodoTier): string {
  switch (tier) {
    case 'feature':
      return 'Feature Objectives';
    case 'phase':
      return 'Phase Objectives';
    case 'session':
      return 'Sessions Breakdown';
    case 'task':
      return 'Task Breakdown';
    default:
      return 'Objectives';
  }
}

// ===================================================================
// VALIDATION
// ===================================================================

/**
 * Validate parsed components
 */
export async function validateParsedComponents(
  feature: string,
  components: ParsedTodoComponents
): Promise<{ valid: boolean; errors: ParsingError[] }> {
  const errors: ParsingError[] = [];
  
  // Check required fields
  if (!components.title) {
    errors.push({
      type: 'missing_field',
      field: 'title',
      message: 'Title is required',
    });
  }
  
  if (!components.tier) {
    errors.push({
      type: 'missing_field',
      field: 'tier',
      message: 'Tier level is required',
    });
  }
  
  // Check tier validity
  if (components.tier && !['feature', 'phase', 'session', 'task'].includes(components.tier)) {
    errors.push({
      type: 'invalid_value',
      field: 'tier',
      value: components.tier,
      message: `Invalid tier: ${components.tier}`,
    });
  }
  
  // Check status validity
  if (components.status && !['pending', 'in_progress', 'completed', 'cancelled', 'blocked'].includes(components.status)) {
    errors.push({
      type: 'invalid_value',
      field: 'status',
      value: components.status,
      message: `Invalid status: ${components.status}`,
    });
  }
  
  // Check parent relationship (allow inference from context)
  // Parent can be inferred from context in generateTodoFromComponents
  // For phase todos, parent is always feature-${feature} - verify it exists
  if (components.tier === 'phase') {
    const featureParentId = `feature-${feature}`;
    const featureParentExists = await findTodoById(feature, featureParentId);
    if (!featureParentExists) {
      errors.push({
        type: 'inconsistency',
        message: `Feature todo does not exist: ${featureParentId}. Please create the feature todo first.`,
      });
    }
  } else if (components.tier && components.tier !== 'feature') {
    // For session/task todos, require parentId or context for inference
    // Parent will be inferred in generateTodoFromComponents if not provided
    // We don't validate inferred parents here - that happens after generation
    if (components.parentId) {
      // If parentId is explicitly set, verify it exists
      const parentExists = await findTodoById(feature, components.parentId);
      if (!parentExists) {
        errors.push({
          type: 'inconsistency',
          message: `Parent todo does not exist: ${components.parentId}`,
        });
      }
    }
    // If parentId is not set, it will be inferred from context - skip validation
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

// ===================================================================
// MAIN CREATE FUNCTION
// ===================================================================

/**
 * Create todo from plain language input
 */
export async function createTodoFromPlainLanguage(
  feature: string,
  input: string,
  context?: {
    currentPhase?: number;
    currentSession?: string;
  }
): Promise<{ success: boolean; todo?: Todo; errors?: ParsingError[]; suggestions?: string[] }> {
  // Parse input
  const parseResult = parseNaturalLanguage(input, { feature, ...context });
  
  if (!parseResult.success || !parseResult.components) {
    return {
      success: false,
      errors: parseResult.errors,
      suggestions: parseResult.suggestions,
    };
  }
  
  // Validate components
  const validation = await validateParsedComponents(feature, parseResult.components);
  
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.errors,
    };
  }
  
  // Generate todo
  const todo = await generateTodoFromComponents(feature, parseResult.components, context);
  
  // Enforce scope
  const parentTodo = todo.parentId ? await findTodoById(feature, todo.parentId) : null;
  const enforcedTodo = await enforceScope(feature, todo, parentTodo, 'warn');
  
  // Save todo
  await saveTodo(feature, enforcedTodo);
  
  return {
    success: true,
    todo: enforcedTodo,
  };
}

