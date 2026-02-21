/**
 * Todo Management System - Lookup Triggers Implementation
 * 
 * Functions for detecting, evaluating, and activating lookup triggers at
 * critical workflow junctions to show relevant citations.
 */

import { 
  TriggerDefinition, 
  TriggerCondition, 
  CitationContext,
  CitationPriority 
} from './todo-types';
import { lookupCitations, getUnreviewedCitations, getHighPriorityCitations } from './todo-citations';
import * as fs from 'fs/promises';
import * as path from 'path';

// ===================================================================
// TRIGGER CONFIGURATION
// ===================================================================

export function getTriggerConfigPath(feature: string): string {
  return path.join('.cursor', 'project-manager', 'features', feature, 'todos', 'trigger-config.json');
}

export async function readTriggerConfig(feature: string): Promise<{ triggers: TriggerDefinition[]; suppressions: Array<{ triggerId: string; suppressedUntil: string }> } | null> {
  const filePath = getTriggerConfigPath(feature);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeTriggerConfig(
  feature: string,
  config: { triggers: TriggerDefinition[]; suppressions: Array<{ triggerId: string; suppressedUntil: string }> }
): Promise<void> {
  const filePath = getTriggerConfigPath(feature);
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getDefaultTriggers(): TriggerDefinition[] {
  return [
    {
      id: 'trigger-session-start',
      name: 'session-start-lookup',
      junction: 'session-start',
      conditions: [
        { type: 'has_unreviewed_citations', priority: 'high' },
        { type: 'has_conflicts', severity: 'high' },
      ],
      priority: 'high',
      suppressible: true,
      action: 'show_citations',
    },
    {
      id: 'trigger-session-checkpoint',
      name: 'session-checkpoint-lookup',
      junction: 'session-checkpoint',
      conditions: [
        { type: 'has_recent_changes', hours: 24 },
      ],
      priority: 'medium',
      suppressible: true,
      action: 'show_citations',
    },
    {
      id: 'trigger-conflict-detection',
      name: 'conflict-detection-lookup',
      junction: 'conflict-detection',
      conditions: [
        { type: 'has_conflicts', severity: 'high' },
      ],
      priority: 'critical',
      suppressible: false,
      action: 'block_until_review',
    },
    {
      id: 'trigger-phase-start',
      name: 'phase-start-lookup',
      junction: 'phase-start',
      conditions: [
        { type: 'has_unreviewed_citations', priority: 'high' },
      ],
      priority: 'high',
      suppressible: true,
      action: 'show_citations',
    },
  ];
}

// ===================================================================
// TRIGGER DETECTION
// ===================================================================

/**
 * Detect triggers for a specific junction
 */
export async function detectTriggers(
  feature: string,
  junction: CitationContext,
  context: { todoId?: string; [key: string]: unknown }
): Promise<TriggerDefinition[]> {
  const config = await readTriggerConfig(feature);
  const triggers = config?.triggers || getDefaultTriggers();
  
  // Filter triggers for this junction
  const junctionTriggers = triggers.filter(t => t.junction === junction);
  
  // Evaluate conditions for each trigger
  const activeTriggers: TriggerDefinition[] = [];
  
  for (const trigger of junctionTriggers) {
    const shouldActivate = await evaluateTriggerConditions(
      feature,
      trigger,
      context
    );
    
    if (shouldActivate) {
      // Check if suppressed
      const isSuppressed = await isTriggerSuppressed(feature, trigger.id);
      if (!isSuppressed) {
        activeTriggers.push(trigger);
      }
    }
  }
  
  return activeTriggers;
}

/**
 * Evaluate trigger conditions
 */
export async function evaluateTriggerConditions(
  feature: string,
  trigger: TriggerDefinition,
  context: { todoId?: string; [key: string]: unknown }
): Promise<boolean> {
  for (const condition of trigger.conditions) {
    const result = await evaluateCondition(feature, condition, context);
    if (!result) {
      return false; // All conditions must be true
    }
  }
  return true;
}

/**
 * Evaluate a single condition
 */
async function evaluateCondition(
  feature: string,
  condition: TriggerCondition,
  context: { todoId?: string; [key: string]: unknown }
): Promise<boolean> {
  const { type } = condition;
  
  if (!context.todoId) {
    return false;
  }
  
  switch (type) {
    case 'has_unreviewed_citations': {
      const citations = await getUnreviewedCitations(feature, context.todoId);
      if (condition.priority) {
        const priorityOrder: CitationPriority[] = ['low', 'medium', 'high', 'critical'];
        const minPriorityIndex = priorityOrder.indexOf(condition.priority);
        return citations.some(c => {
          const citationPriorityIndex = priorityOrder.indexOf(c.priority);
          return citationPriorityIndex >= minPriorityIndex;
        });
      }
      return citations.length > 0;
    }
    
    case 'has_high_priority_citations': {
      const citations = await getHighPriorityCitations(
        feature,
        context.todoId,
        condition.priority || 'high'
      );
      return citations.length > 0;
    }
    
    case 'has_citations_in_context': {
      if (!condition.context) return false;
      const citations = await lookupCitations(feature, context.todoId, condition.context);
      return citations.length > 0;
    }
    
    case 'has_recent_changes': {
      // This would need integration with change log
      // For now, return false as placeholder
      return false;
    }
    
    case 'has_conflicts': {
      // This would need integration with conflict detection
      // For now, return false as placeholder
      return false;
    }
    
    default:
      return false;
  }
}

// ===================================================================
// TRIGGER ACTIVATION
// ===================================================================

/**
 * Activate a trigger and return citations to show
 */
export async function activateTrigger(
  feature: string,
  trigger: TriggerDefinition,
  context: { todoId: string; [key: string]: unknown }
): Promise<{ citations: Array<{ todoId: string; citations: unknown[] }>; priority: CitationPriority }> {
  const citations: Array<{ todoId: string; citations: unknown[] }> = [];
  
  // Get citations for the todo
  const todoCitations = await lookupCitations(feature, context.todoId, trigger.junction);
  if (todoCitations.length > 0) {
    citations.push({
      todoId: context.todoId,
      citations: todoCitations,
    });
  }
  
  return {
    citations,
    priority: trigger.priority,
  };
}

/**
 * Check if trigger is suppressed
 */
async function isTriggerSuppressed(feature: string, triggerId: string): Promise<boolean> {
  const config = await readTriggerConfig(feature);
  if (!config) {
    return false;
  }
  
  const suppression = config.suppressions.find(s => s.triggerId === triggerId);
  if (!suppression) {
    return false;
  }
  
  const suppressedUntil = new Date(suppression.suppressedUntil);
  return suppressedUntil > new Date();
}

/**
 * Suppress a trigger temporarily
 */
export async function suppressTrigger(
  feature: string,
  triggerId: string,
  durationHours: number = 1
): Promise<void> {
  let config = await readTriggerConfig(feature);
  
  if (!config) {
    config = {
      triggers: getDefaultTriggers(),
      suppressions: [],
    };
  }
  
  const suppressedUntil = new Date();
  suppressedUntil.setHours(suppressedUntil.getHours() + durationHours);
  
  // Remove existing suppression if any
  config.suppressions = config.suppressions.filter(s => s.triggerId !== triggerId);
  
  // Add new suppression
  config.suppressions.push({
    triggerId,
    suppressedUntil: suppressedUntil.toISOString(),
  });
  
  await writeTriggerConfig(feature, config);
}

// ===================================================================
// REVIEW PROMPTS
// ===================================================================

/**
 * Format citations for display in review prompt
 */
export function formatCitationsForPrompt(
  citations: Array<{ todoId: string; citations: unknown[] }>
): string {
  let prompt = '🔔 Change Review Required\n\n';
  
  for (const item of citations) {
    prompt += `You have ${item.citations.length} unreviewed citations for ${item.todoId}:\n\n`;
    
    for (const citation of item.citations as Array<{ priority: string; changeLogId: string; metadata?: { reason?: string; impact?: string } }>) {
      const priorityIcon = getPriorityIcon(citation.priority as CitationPriority);
      prompt += `${priorityIcon} ${citation.priority.toUpperCase()}: Change\n`;
      prompt += `   Change: ${citation.changeLogId}\n`;
      if (citation.metadata?.reason) {
        prompt += `   Reason: ${citation.metadata.reason}\n`;
      }
      if (citation.metadata?.impact) {
        prompt += `   Impact: ${citation.metadata.impact}\n`;
      }
      prompt += `   [Review] [Dismiss] [Defer]\n\n`;
    }
  }
  
  prompt += '[Review All] [Dismiss All] [Continue Without Review]';
  
  return prompt;
}

function getPriorityIcon(priority: CitationPriority): string {
  const icons: Record<CitationPriority, string> = {
    critical: '🔴',
    high: '🟡',
    medium: '🟢',
    low: '⚪',
  };
  return icons[priority] || '⚪';
}

