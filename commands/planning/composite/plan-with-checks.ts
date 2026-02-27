/**
 * Composite Planning Command: /planning-plan-with-checks
 * Plan with scoping, documentation checks, reuse checks, and validation
 *
 * Combines: (optional) auto-context + downstream dedup → parse → docs check → reuse check → validate → (optional) scope document
 */

import { parsePlainLanguage } from '../atomic/parse-plain-language';
import { checkDocumentation } from '../atomic/check-documentation';
import { checkReuse } from '../atomic/check-reuse';
import { validatePlanningCommand } from '../atomic/validate-planning';
import { PlanningInput, PlanningTier } from '../../utils/planning-types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { checkDownstreamPlans } from '../../utils/check-downstream-plans';
import { createScopeDocument } from '../../utils/create-scope-document';
import { resolveFeatureName } from '../../utils/feature-context';
import { parseNaturalLanguage } from '../../utils/planning-parser';
import { securityAudit } from '../../security/composite/security-audit';

export type DocCheckType = 'component' | 'transformer' | 'pattern' | 'migration';

export interface PlanWithChecksOptions {
  createScopeDocument?: boolean;
  featureName?: string;
}

/**
 * Extract current session/task/phase from handoff when not provided
 */
async function extractCurrentContextFromHandoff(featureName: string): Promise<{
  sessionId?: string;
  taskId?: string;
  phase?: string;
}> {
  try {
    const context = new WorkflowCommandContext(featureName);
    const handoffContent = await context.readFeatureHandoff();
    const currentStatus = MarkdownUtils.extractSection(handoffContent, 'Current Status');
    const nextAction = MarkdownUtils.extractSection(handoffContent, 'Next Action');
    const combined = (currentStatus || '') + '\n' + (nextAction || '');
    const sessionMatch = combined.match(/session\s+([\d.]+)/i) || combined.match(/(\d+\.\d+)/);
    const sessionId = sessionMatch ? sessionMatch[1] : undefined;
    const taskMatch = combined.match(/task\s+([\d.]+)/i) || combined.match(/(\d+\.\d+\.\d+)/);
    const taskId = taskMatch ? taskMatch[1] : undefined;
    const phaseMatch = combined.match(/phase\s+(\d+)/i);
    const phase = phaseMatch ? phaseMatch[1] : undefined;
    return { sessionId, taskId, phase };
  } catch (err) {
    console.warn('Plan with checks: failed to load plan', err);
    return {};
  }
}

/**
 * Plan with comprehensive checks (including optional scoping)
 *
 * @param description Natural language description
 * @param tier Planning tier
 * @param feature Feature name context
 * @param phase Phase number context (optional)
 * @param sessionId Session ID context (optional)
 * @param taskId Task ID context (optional)
 * @param docCheckType Type of documentation check
 * @param options createScopeDocument: persist plan as .md; featureName: for context extraction
 * @returns Comprehensive planning output with checks
 */
export async function planWithChecks(
  description: string,
  tier: PlanningTier,
  feature?: string,
  phase?: number,
  sessionId?: string,
  taskId?: string,
  docCheckType: DocCheckType = 'migration',
  options?: PlanWithChecksOptions
): Promise<string> {
  const output: string[] = [];
  const resolvedFeature = await resolveFeatureName(feature ?? options?.featureName);

  // Step 0a: Auto-extract context from handoff when session/task/phase not provided
  let resolvedSessionId = sessionId;
  let resolvedTaskId = taskId;
  let resolvedPhase = phase;
  if (!resolvedSessionId && !resolvedTaskId && resolvedPhase === undefined) {
    const extracted = await extractCurrentContextFromHandoff(resolvedFeature);
    resolvedSessionId = resolvedSessionId ?? extracted.sessionId;
    resolvedTaskId = resolvedTaskId ?? extracted.taskId;
    resolvedPhase = resolvedPhase ?? (extracted.phase !== undefined ? Number(extracted.phase) : undefined);
  }

  // Step 0b: Downstream plan dedup — bail early if change already planned
  const downstreamCheck = await checkDownstreamPlans(
    {
      description,
      currentSessionId: resolvedSessionId,
      currentPhase: resolvedPhase?.toString(),
      featureName: resolvedFeature,
    },
    resolvedFeature
  );
  if (downstreamCheck.hasMatches) {
    return downstreamCheck.output;
  }

  output.push('# Planning with Checks\n');
  output.push(`**Tier:** ${tier}\n`);
  output.push(`**Description:** ${description}\n`);
  output.push('\n---\n');

  // Step 1: Parse plain language
  output.push('## Step 1: Parse Planning Input\n');
  try {
    const parseResult = await parsePlainLanguage(description, tier, feature, resolvedPhase, resolvedSessionId, resolvedTaskId);
    output.push(parseResult);
    output.push('\n---\n');
  } catch (_error) {
    output.push(`**ERROR:** Failed to parse planning input\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
    return output.join('\n');
  }
  
  // Step 2: Check documentation
  output.push('## Step 2: Documentation Check\n');
  try {
    const docCheckResult = await checkDocumentation(docCheckType);
    output.push(docCheckResult);
    output.push('\n---\n');
  } catch (_error) {
    output.push(`**WARNING:** Documentation check failed\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }
  
  // Step 3: Check reuse
  output.push('## Step 3: Pattern Reuse Check\n');
  try {
    const reuseCheckResult = await checkReuse(description);
    output.push(reuseCheckResult);
    output.push('\n---\n');
  } catch (_error) {
    output.push(`**WARNING:** Reuse check failed\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }
  
  // Step 4: Validate planning
  output.push('## Step 4: Planning Validation\n');
  try {
    // Parse again to get structured output for validation
    const input: PlanningInput = {
      description,
      tier,
      feature,
      phase: resolvedPhase,
      sessionId: resolvedSessionId,
      taskId: resolvedTaskId,
    };
    const parseResult = parseNaturalLanguage(input);
    
    if (parseResult.success && parseResult.output) {
      const validationResult = await validatePlanningCommand(parseResult.output, tier);
      output.push(validationResult);
    } else {
      output.push('**WARNING:** Cannot validate - parsing failed\n');
      if (parseResult.errors) {
        output.push('**Parsing Errors:**\n');
        parseResult.errors.forEach(error => {
          output.push(`- ${error.message}\n`);
        });
      }
    }
  } catch (_error) {
    output.push(`**WARNING:** Validation failed\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  output.push('\n---\n');
  
  // Step 5: Security Audit (optional but recommended)
  output.push('## Step 5: Security Validation\n');
  try {
    const securityResult = await securityAudit({ path: 'server/src' });
    output.push(securityResult);
  } catch (_error) {
    output.push(`**WARNING:** Security check failed\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('**Note:** Security checks are optional but recommended. You can run `/security-audit` manually.\n');
  }
  
  output.push('\n---\n');
  output.push('## Summary\n');
  output.push('Planning with checks completed. Review the results above before proceeding.\n');

  // Optional: persist plan as scope document
  if (options?.createScopeDocument) {
    try {
      const documentResult = await createScopeDocument({
        analysisOutput: output.join('\n'),
        sessionId: resolvedSessionId,
        taskId: resolvedTaskId,
        phase: resolvedPhase?.toString(),
        featureName: resolvedFeature,
      });
      output.push(`\n---\n## Scope Document\n**Path:** \`${documentResult.documentPath}\`\n`);
    } catch (_error) {
      output.push(`\n---\n## Scope Document\n**Warning:** Failed to create scope document: ${_error instanceof Error ? _error.message : String(_error)}\n`);
    }
  }

  return output.join('\n');
}

