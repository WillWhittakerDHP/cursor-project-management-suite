/**
 * Shared: Create planning todo + verify (BLOCKING on failure)
 *
 * Builds tier-specific plain-language input and context, calls createFromPlainLanguageProgrammatic,
 * verifies todo exists, returns formatted output lines. Tier commands append result.outputLines
 * and throw on !result.success.
 */

import type { PlanningTier } from '../../utils/planning-types';
import type { Todo } from '../../utils/todo-types';
import { createFromPlainLanguageProgrammatic } from '../../todo/composite/create-from-plain-language';
import { findTodoById } from '../../utils/todo-io';
import { WorkflowId } from '../../utils/id-utils';

export interface CreatePlanningTodoParams {
  tier: PlanningTier;
  identifier: string;
  description: string;
  feature: string;
}

export interface CreatePlanningTodoResult {
  success: boolean;
  todo?: Todo;
  outputLines: string[];
  error?: Error;
}

const TIER_LABEL: Record<PlanningTier, string> = {
  phase: 'Phase',
  session: 'Session',
  feature: 'Feature',
  task: 'Task',
};

function buildInputAndContext(
  tier: PlanningTier,
  identifier: string,
  description: string
): { input: string; context: { currentPhase?: number; currentSession?: string } } {
  switch (tier) {
    case 'phase': {
      const phaseNum = Number(identifier.split('.')[0]) || 1;
      return {
        input: `Phase ${identifier}: ${description}`,
        context: { currentPhase: phaseNum },
      };
    }
    case 'session': {
      const parsed = WorkflowId.parseSessionId(identifier);
      const currentPhase = parsed ? Number(parsed.feature) : undefined;
      return {
        input: `Session ${identifier}: ${description}`,
        context: { currentPhase, currentSession: identifier },
      };
    }
    case 'feature':
      return {
        input: `Feature: ${identifier}. ${description}`,
        context: {},
      };
    case 'task': {
      const parsed = WorkflowId.parseTaskId(identifier);
      const sessionId = parsed ? parsed.sessionId : undefined;
      const currentPhase = parsed ? Number(parsed.feature) : undefined;
      return {
        input: `Task ${identifier}: ${description}`,
        context: { currentPhase, currentSession: sessionId },
      };
    }
    default:
      return { input: `${tier} ${identifier}: ${description}`, context: {} };
  }
}

/**
 * Create tier todo from planning context; verify it exists. Returns output lines for tier to append.
 * On failure returns success: false and error message lines; tier should throw.
 */
export async function createPlanningTodo(
  params: CreatePlanningTodoParams
): Promise<CreatePlanningTodoResult> {
  const { tier, identifier, description, feature } = params;
  const label = TIER_LABEL[tier];
  const sectionTitle = `## Creating ${label} Todo\n`;
  const outputLines: string[] = [sectionTitle];

  const { input, context } = buildInputAndContext(tier, identifier, description);
  const todoResult = await createFromPlainLanguageProgrammatic(feature, input, context);

  if (!todoResult.success || !todoResult.todo) {
    const errorLines: string[] = [];
    errorLines.push(`❌ **ERROR: ${label} todo creation failed (BLOCKING)**\n`);
    if (todoResult.errors && todoResult.errors.length > 0) {
      errorLines.push(`**Errors:**\n`);
      for (const err of todoResult.errors) {
        errorLines.push(`- ${err.type}${err.field ? ` (${err.field})` : ''}: ${err.message}\n`);
      }
    }
    if (todoResult.suggestions && todoResult.suggestions.length > 0) {
      errorLines.push(`**Suggestions:**\n`);
      for (const s of todoResult.suggestions) {
        errorLines.push(`- ${s}\n`);
      }
    }
    errorLines.push(
      `\n**${label} planning cannot continue without a todo. Please fix the errors above and retry.**\n`
    );
    return {
      success: false,
      outputLines: errorLines,
      error: new Error(errorLines.join('')),
    };
  }

  const createdTodo = todoResult.todo;
  outputLines.push(`✅ **${label} todo created:** ${createdTodo.id}\n`);
  outputLines.push(`**Title:** ${createdTodo.title}\n`);
  outputLines.push(`**Status:** ${createdTodo.status}\n`);
  if (createdTodo.parentId) {
    outputLines.push(`**Parent:** ${createdTodo.parentId}\n`);
  }
  outputLines.push('\n**Verifying todo exists...**\n');
  const verifiedTodo = await findTodoById(feature, createdTodo.id);
  if (!verifiedTodo) {
    const msg = `❌ **ERROR: Todo verification failed**\nTodo ${createdTodo.id} was created but cannot be found. This indicates a critical issue with the todo system.\n`;
    return {
      success: false,
      outputLines: [...outputLines, msg],
      error: new Error(msg),
    };
  }
  outputLines.push(`✅ **Todo verified:** ${verifiedTodo.id}\n`);
  return { success: true, todo: createdTodo, outputLines };
}
