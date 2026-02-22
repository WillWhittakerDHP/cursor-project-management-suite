/**
 * Feature-start implementation. Used by tier-start and by feature-start (thin wrapper).
 */

import { featureLoad } from '../atomic/feature-load';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { createBranch } from '../../../git/atomic/create-branch';
import { runCommand, readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { auditFeatureStart } from '../../../audit/composite/audit-feature-start';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { extractFilePaths, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { access } from 'fs/promises';
import { join } from 'path';
import { CommandExecutionOptions, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';
import { formatPlanModePreview } from '../../../utils/tier-start-utils';
import { resolveFeatureId } from '../../../utils/feature-context';
import { runTierPlan } from '../../shared/tier-plan';
import { FEATURE_CONFIG } from '../../configs/feature';

const BLOCKED_STATUSES = ['complete', 'blocked'] as const;

export async function featureStartImpl(featureId: string, options?: CommandExecutionOptions): Promise<string> {
  const mode = resolveCommandExecutionMode(options);
  const output: string[] = [];
  const featureName = await resolveFeatureId(featureId);
  const normalizedFeatureName = featureName.toLowerCase().replace(/\s+/g, '-');
  
  output.push(`# Starting Feature: ${featureName}\n`);
  output.push(`**Feature ID:** ${featureId}\n`);
  if (normalizedFeatureName !== featureName) {
    output.push(`**Normalized:** ${normalizedFeatureName}\n`);
  }
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n\n`);

  try {
    const context = new WorkflowCommandContext(normalizedFeatureName);
    const currentStatus = await FEATURE_CONFIG.controlDoc.readStatus(context, featureId);
    if (currentStatus !== null) {
      output.push(`**PROJECT_PLAN Status:** ${currentStatus}\n\n`);
      if (BLOCKED_STATUSES.includes(currentStatus as typeof BLOCKED_STATUSES[number])) {
        output.push(`**ERROR:** Cannot start feature with status "${currentStatus}".\n`);
        if (currentStatus === 'complete') {
          output.push('This feature is marked Complete in PROJECT_PLAN. All work is finished.\n');
        } else {
          output.push('This feature is Blocked. Resolve the blocker before starting.\n');
        }
        output.push('**Action:** Update the feature status in PROJECT_PLAN.md if this is incorrect.\n');
        return output.join('\n');
      }
    }
  } catch (err) {
    console.warn('Feature start: could not read PROJECT_PLAN for status validation', err);
    output.push('**Note:** Could not read PROJECT_PLAN for status validation. Proceeding.\n\n');
  }

  if (isPlanMode(mode)) {
    const context = new WorkflowCommandContext(normalizedFeatureName);
    const planSteps = [
      'Git: `git checkout develop`',
      'Git: `git pull origin develop`',
      `Git: create/switch branch \`feature/${normalizedFeatureName}\``,
      `Docs: read \`${context.paths.getFeatureGuidePath()}\``,
      'Docs: generate workflow docs from feature plan (if plan exists and docs missing)',
      'Workflow: load feature context',
      'Workflow: create initial checkpoint',
      'Audit: run feature-start audit (non-blocking)',
    ];
    output.push(formatPlanModePreview(planSteps, { intro: 'This is a deterministic preview. No git commands or file writes will be executed.' }));
    return output.join('\n');
  }
  
  output.push('---\n\n');
  
  // Step 1: Create git branch from develop
  output.push('## Step 1: Creating Git Branch\n\n');
  try {
    // Checkout develop first
    const checkoutDevelop = await runCommand('git checkout develop');
    if (!checkoutDevelop.success) {
      output.push(`**WARNING:** Could not checkout develop: ${checkoutDevelop.error || checkoutDevelop.output}\n`);
      output.push(`**Suggestion:** Ensure you're in a git repository and develop branch exists\n`);
    } else {
      output.push('**Checked out:** develop\n');
    }
    
    // Pull latest develop
    const pullDevelop = await runCommand('git pull origin develop');
    if (!pullDevelop.success) {
      output.push(`**WARNING:** Could not pull latest develop: ${pullDevelop.error || pullDevelop.output}\n`);
    } else {
      output.push('**Pulled:** latest develop\n');
    }
    
    // Create feature branch (use normalized name)
    const branchName = `feature/${normalizedFeatureName}`;
    const branchResult = await createBranch(branchName);
    if (branchResult.success) {
      output.push(`**Branch Created:** ${branchName}\n`);
    } else {
      output.push(`**WARNING:** Could not create branch: ${branchResult.output}\n`);
      output.push(`**Suggestion:** Branch may already exist. Use \`git checkout ${branchName}\` to switch to it.\n`);
    }
  } catch (_error) {
    output.push(`**ERROR:** Failed to create git branch\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  output.push('\n---\n\n');

  // Step 2: Load feature context
  output.push('## Step 2: Loading Feature Context\n\n');
  try {
    const loadOutput = await featureLoad(normalizedFeatureName);
    output.push(loadOutput);
  } catch (_error) {
    output.push(`**ERROR:** Failed to load feature context\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  // Auto-gather context (non-blocking)
  try {
    const context = new WorkflowCommandContext(normalizedFeatureName);
    const featureGuideContent = await context.readFeatureGuide();
    const filePaths = extractFilePaths(featureGuideContent);
    
    if (filePaths.length > 0) {
      const fileStatuses = await gatherFileStatuses(filePaths);
      const reactFiles = fileStatuses.filter(f => f.isReact);
      const vueFiles = fileStatuses.filter(f => f.isVue);
      
      if (reactFiles.length > 0 || vueFiles.length > 0) {
        output.push('\n### Auto-Gathered Context\n');
        output.push('**Key files mentioned in feature guide:**\n');
        
        if (reactFiles.length > 0) {
          output.push('\n**React Source Files:**');
          output.push(formatFileStatusList(reactFiles));
        }
        
        if (vueFiles.length > 0) {
          output.push('\n**Vue Target Files:**');
          output.push(formatFileStatusList(vueFiles));
        }
      }
    }
  } catch (err) {
    console.warn('Feature start: context gathering failed (non-blocking)', err);
  }
  
  output.push('\n---\n\n');
  
  // Step 3: Create initial checkpoint
  output.push('## Step 3: Creating Initial Checkpoint\n\n');
  try {
    const checkpointOutput = await featureCheckpoint(normalizedFeatureName);
    output.push(checkpointOutput);
  } catch (_error) {
    output.push(`**WARNING:** Failed to create checkpoint\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  output.push('\n---\n\n');
  
  // Run start audit (non-blocking)
  output.push('## Baseline Audit\n\n');
  try {
    const auditResult = await auditFeatureStart({
      featureName: normalizedFeatureName
    });
    
    if (auditResult.success) {
      output.push('**Baseline audit completed successfully**\n');
      output.push(`**Report:** ${auditResult.reportPath}\n`);
      output.push('\n### Baseline Scores\n');
      
      // Extract scores from audit result
      const scores = auditResult.auditResult.results
        .filter(r => r.score !== undefined)
        .map(r => {
          const emoji = r.status === 'pass' ? '✅' : r.status === 'warn' ? '⚠️' : '❌';
          return `- ${emoji} **${r.category}**: ${r.score}/100`;
        });
      
      if (scores.length > 0) {
        output.push(scores.join('\n'));
        output.push('\n');
      }
      
      output.push('*Baseline scores will be compared with end audit scores*\n');
    } else {
      output.push('**⚠️ Baseline audit completed with warnings**\n');
      output.push(`**Report:** ${auditResult.reportPath}\n`);
    }
  } catch (_error) {
    // Non-blocking - don't fail feature start if audit fails
    output.push('**⚠️ Baseline audit skipped**\n');
    output.push(`**Reason:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('*Feature start continues - audit can be run manually later*\n');
  }

  output.push('\n---\n\n');
  output.push('## Plan (same tier)\n\n');
  try {
    const planOutput = await runTierPlan(FEATURE_CONFIG, featureId, undefined);
    if (planOutput) {
      output.push(planOutput);
      output.push('\n---\n\n');
    }
  } catch (planError) {
    console.warn('Feature start: plan step skipped', planError);
    output.push(`> Plan step skipped: ${planError instanceof Error ? planError.message : String(planError)}\n\n---\n\n`);
  }

  output.push('**Cascade:** Plan complete for feature. Review above, then confirm to start phase 1. Run `/phase-start 1` after confirmation.\n');
  
  return output.join('\n');
}

