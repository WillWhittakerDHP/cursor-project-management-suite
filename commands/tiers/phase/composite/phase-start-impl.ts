/**
 * Phase-start implementation. Used by tier-start and by phase-start (thin wrapper).
 */

import { readProjectFile, PROJECT_ROOT, getCurrentBranch, runCommand, isBranchBasedOn, branchExists, writeProjectFile } from '../../../utils/utils';
import { formatBranchHierarchy, formatPlanModePreview, formatCannotStart } from '../../../utils/tier-start-utils';
import { readHandoff } from '../../../utils/read-handoff';
import { join } from 'path';
import { access } from 'fs/promises';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { auditPhaseStart } from '../../../audit/composite/audit-phase-start';
import { extractFilesFromPhaseGuide, gatherFileStatuses } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { createBranch } from '../../../git/atomic/create-branch';
import { validatePhase, formatPhaseValidation } from './phase';
import { parsePhasePlan } from '../../../utils/planning-doc-parser';
import { runTierPlan } from '../../shared/tier-plan';
import { PHASE_CONFIG } from '../../configs/phase';
import { generatePhaseGuideFromPlan, generatePhaseHandoffFromPlan } from '../../../utils/planning-doc-generator';
import { CommandExecutionOptions, isPlanMode, resolveCommandExecutionMode } from '../../../utils/command-execution-mode';

export async function phaseStartImpl(phaseId: string, options?: CommandExecutionOptions): Promise<string> {
  const phase = phaseId;
  // Mode gate is applied by generic tier-start; we only branch on plan vs execute for steps.
  const mode = resolveCommandExecutionMode(options);
  const output: string[] = [];

  // Auto-detect feature context
  const context = await WorkflowCommandContext.getCurrent();
  
  output.push(`# Phase ${phase} Start\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Command:** \`/phase-start ${phase}\`\n`);
  
  // Get current branch and display branch hierarchy (always display, even if errors occur)
  output.push(await formatBranchHierarchy({ featureName: context.feature.name, phase }));
  output.push('---\n');
  
  // Validate phase can be started
  output.push('## Phase Validation\n');
  const validation = await validatePhase(phase);
  const validationMessage = formatPhaseValidation(validation, phase);
  output.push(validationMessage);
  
  if (!validation.canStart) {
    output.push(formatCannotStart('phase', phase));
    return output.join('\n');
  }

  if (isPlanMode(mode)) {
    const planSteps = [
      'Git: ensure feature branch exists and is based on main/master',
      `Git: create/switch phase branch \`${context.feature.name}-phase-${phase}\``,
      `Docs: read \`${context.paths.getFeaturePlanPath()}\` (optional)`,
      'Docs: generate phase guide/handoff from feature plan (if present and docs missing)',
      'Audit: run phase-start audit (non-blocking)',
    ];
    output.push(formatPlanModePreview(planSteps, { intro: 'This is a deterministic preview. No git commands or file writes will be executed.' }));
    return output.join('\n');
  }

  output.push('\n---\n');
  
  // Step 1: Create phase branch
  output.push('## Step 1: Creating Phase Branch\n');
  try {
    // Get current feature branch (should be feature/{featureName})
    const currentBranch = await getCurrentBranch();
    const featureBranch = currentBranch.startsWith('feature/') ? currentBranch : `feature/${context.feature.name}`;
    
    // Check if feature branch exists
    if (!(await branchExists(featureBranch))) {
      output.push(`**❌ ERROR:** Feature branch ${featureBranch} does not exist\n`);
      output.push(`**Current Branch:** ${currentBranch}\n`);
      output.push(`**Required Branch:** ${featureBranch}\n`);
      output.push(`**Suggestion:** Create the feature branch first: git checkout -b ${featureBranch} main\n`);
      output.push('\n---\n');
      output.push('**⚠️ Cannot start phase. Please create the feature branch first.**\n');
      return output.join('\n');
    }
    
    // Check if feature branch is based on main (or master)
    const mainBranch = (await branchExists('main')) ? 'main' : 'master';
    if (await branchExists(mainBranch)) {
      const isFeatureBasedOnMain = await isBranchBasedOn(featureBranch, mainBranch);
      if (!isFeatureBasedOnMain) {
        output.push(`**❌ ERROR:** Feature branch ${featureBranch} is not based on ${mainBranch}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Feature Branch:** ${featureBranch}\n`);
        output.push(`**Required Base:** ${mainBranch}\n`);
        output.push(`**Suggestion:** Ensure feature branch is based on ${mainBranch}. You may need to rebase: git rebase ${mainBranch}\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start phase. Feature branch must be based on main branch.**\n');
        return output.join('\n');
      }
    }
    
    // Ensure we're on the feature branch before creating phase branch
    if (currentBranch !== featureBranch) {
      const checkoutResult = await runCommand(`git checkout ${featureBranch}`);
      if (!checkoutResult.success) {
        output.push(`**❌ ERROR:** Could not checkout feature branch ${featureBranch}\n`);
        output.push(`**Error:** ${checkoutResult.error || checkoutResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${featureBranch}\n`);
        output.push(`**Suggestion:** Ensure feature branch exists or create it first, or manually checkout the correct branch\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start phase. Please checkout the correct feature branch first.**\n');
        return output.join('\n');
      } else {
        output.push(`**Checked out:** ${featureBranch}\n`);
      }
    }
    
    // Create phase branch: feature/{featureName}-phase-{phase}
    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    
    // Check if phase branch already exists and verify it's based on feature branch
    if (await branchExists(phaseBranchName)) {
      const isPhaseBasedOnFeature = await isBranchBasedOn(phaseBranchName, featureBranch);
      if (!isPhaseBasedOnFeature) {
        output.push(`**❌ ERROR:** Existing phase branch ${phaseBranchName} is not based on feature branch ${featureBranch}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Phase Branch:** ${phaseBranchName}\n`);
        output.push(`**Required Base:** ${featureBranch}\n`);
        output.push(`**Suggestion:** Delete and recreate the phase branch, or rebase it: git rebase ${featureBranch}\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start phase. Phase branch must be based on feature branch.**\n');
        return output.join('\n');
      }
      // Switch to existing phase branch
      const checkoutPhaseResult = await runCommand(`git checkout ${phaseBranchName}`);
      if (checkoutPhaseResult.success) {
        output.push(`**Switched to existing phase branch:** ${phaseBranchName}\n`);
      } else {
        output.push(`**❌ ERROR:** Could not switch to existing phase branch\n`);
        output.push(`**Error:** ${checkoutPhaseResult.error || checkoutPhaseResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${phaseBranchName}\n`);
        output.push(`**Suggestion:** Resolve conflicts or stash changes first.\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start phase. Please resolve branch issues first.**\n');
        return output.join('\n');
      }
    } else {
      // Create new phase branch from feature branch
      const branchResult = await createBranch(phaseBranchName);
      if (branchResult.success) {
        output.push(`**Phase Branch Created:** ${phaseBranchName}\n`);
        // Verify the new branch is based on feature branch
        const isPhaseBasedOnFeature = await isBranchBasedOn(phaseBranchName, featureBranch);
        if (!isPhaseBasedOnFeature) {
          output.push(`**⚠️ WARNING:** Phase branch created but verification failed. Please verify branch hierarchy manually.\n`);
        }
      } else {
        output.push(`**❌ ERROR:** Could not create phase branch\n`);
        output.push(`**Error:** ${branchResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${phaseBranchName}\n`);
        output.push(`**Suggestion:** Resolve conflicts or stash changes first.\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start phase. Please resolve branch issues first.**\n');
        return output.join('\n');
      }
    }
  } catch (_error) {
    output.push(`**❌ ERROR:** Failed to create phase branch\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
    output.push('**⚠️ Cannot start phase. Please resolve branch issues first.**\n');
    return output.join('\n');
  }
  output.push('\n---\n');
  
  // Step 1.5: Generate workflow docs from phase plan in feature-plan.md if it exists
  output.push('## Step 1.5: Generating Phase Workflow Documents\n');
  try {
    const featurePlanPath = context.paths.getFeaturePlanPath();
    const featurePlanFullPath = join(PROJECT_ROOT, featurePlanPath);
    
    let featurePlanExists = false;
    try {
      await access(featurePlanFullPath);
      featurePlanExists = true;
    } catch (err) {
      console.warn('Phase start: feature-plan.md not found or not accessible', featurePlanFullPath, err);
      featurePlanExists = false;
    }
    
    if (featurePlanExists) {
      output.push(`**Found:** ${featurePlanPath}\n`);
      
      // Read feature-plan.md
      const featurePlanContent = await readProjectFile(featurePlanPath);
      
      // Parse phase plan
      const parsedPhase = parsePhasePlan(featurePlanContent, phase);
      
      if (parsedPhase) {
        output.push(`**Parsed:** Phase ${phase} plan - "${parsedPhase.name}"\n`);
        
        // Check if phase workflow docs already exist
        const guidePath = context.paths.getPhaseGuidePath(phase);
        const handoffPath = context.paths.getPhaseHandoffPath(phase);
        
        let guideExists = false;
        let handoffExists = false;
        
        try {
          await access(join(PROJECT_ROOT, guidePath));
          guideExists = true;
        } catch (err) {
          console.warn('Phase start: phase guide path not found', guidePath, err);
        }
        
        try {
          await access(join(PROJECT_ROOT, handoffPath));
          handoffExists = true;
        } catch (err) {
          console.warn('Phase start: phase handoff path not found', handoffPath, err);
        }
        
        if (guideExists || handoffExists) {
          output.push(`**Note:** Some phase workflow documents already exist. Skipping generation.\n`);
          output.push(`**Existing:** ${guideExists ? 'guide' : ''} ${handoffExists ? 'handoff' : ''}\n`);
        } else {
          // Load templates
          const guideTemplate = await context.templates.loadTemplate('phase', 'guide');
          const handoffTemplate = await context.templates.loadTemplate('phase', 'handoff');
          
          // Generate docs from plan
          const guideContent = generatePhaseGuideFromPlan(parsedPhase, guideTemplate);
          const handoffContent = generatePhaseHandoffFromPlan(parsedPhase, handoffTemplate);
          
          // Write generated docs
          await writeProjectFile(guidePath, guideContent);
          await writeProjectFile(handoffPath, handoffContent);
          
          output.push(`**Generated:** phase-${phase}-guide.md, phase-${phase}-handoff.md\n`);
          output.push(`**Source:** feature-plan.md\n`);
        }
      } else {
        output.push(`**Warning:** Phase ${phase} plan not found in feature-plan.md\n`);
        output.push(`**Note:** Falling back to template-based creation if docs don't exist\n`);
      }
    } else {
      output.push(`**Not found:** feature-plan.md\n`);
      
      // Check if phase workflow docs exist
      const guidePath = context.paths.getPhaseGuidePath(phase);
      let guideExists = false;
      try {
        await access(join(PROJECT_ROOT, guidePath));
        guideExists = true;
      } catch (err) {
        console.warn('Phase start: phase guide path not found (no feature-plan)', guidePath, err);
      }
      
      if (!guideExists) {
        output.push(`**Note:** No feature-plan.md found and phase workflow docs don't exist.\n`);
        output.push(`**Suggestion:** Create phase plan in feature-plan.md or use templates.\n`);
      } else {
        output.push(`**Note:** Phase workflow docs already exist. Using existing docs.\n`);
      }
    }
  } catch (_error) {
    output.push(`**WARNING:** Failed to generate phase workflow documents from feature-plan.md\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Note:** Phase start continues - docs can be created manually later\n`);
  }
  
  output.push('\n---\n');
  
  // Try to load phase guide with explicit error handling
  const phaseGuidePath = context.paths.getPhaseGuidePath(phase);
  try {
    await access(join(PROJECT_ROOT, phaseGuidePath));
    const phaseGuideContent = await readProjectFile(phaseGuidePath);
    const phaseSection = MarkdownUtils.extractSection(phaseGuideContent, `Phase ${phase}`);
    
    if (phaseSection) {
      output.push('## Phase Guide\n');
      output.push(phaseSection);
      output.push('\n---\n');
    }
  } catch (_error) {
    const fullPath = join(PROJECT_ROOT, phaseGuidePath);
    output.push('## Phase Guide\n');
    output.push(`**ERROR: Phase guide not found**\n`);
    output.push(`**Attempted:** ${phaseGuidePath}\n`);
    output.push(`**Full Path:** ${fullPath}\n`);
    output.push(`**Expected:** Phase guide file for phase ${phase}\n`);
    output.push(`**Suggestion:** Create the file at ${phaseGuidePath}\n`);
    output.push(`**Template:** Use \`.cursor/commands/tiers/phase/templates/phase-guide.md\` as a starting point\n`);
    output.push('\n---\n');
  }
  
  // Load phase handoff using tiered handoff checking
  try {
    const handoffContent = await readHandoff('phase', phase);
      output.push('## Transition Context\n');
    output.push(handoffContent);
      output.push('\n---\n');
  } catch (_error) {
    output.push('## Transition Context\n');
    output.push(`**ERROR: Phase handoff not found**\n`);
    output.push(`${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n---\n');
  }
  
  // Auto-gather context (non-blocking)
  try {
    const filePaths = await extractFilesFromPhaseGuide(phase, context.feature.name);
    if (filePaths.length > 0) {
      const fileStatuses = await gatherFileStatuses(filePaths);
      const reactFiles = fileStatuses.filter(f => f.isReact);
      const vueFiles = fileStatuses.filter(f => f.isVue);
      
      if (reactFiles.length > 0 || vueFiles.length > 0) {
        output.push('## Auto-Gathered Context\n');
        output.push('**Files mentioned in phase guide:**\n');
        
        if (reactFiles.length > 0) {
          output.push('\n**React Source Files:**');
          output.push(formatFileStatusList(reactFiles));
        }
        
        if (vueFiles.length > 0) {
          output.push('\n**Vue Target Files:**');
          output.push(formatFileStatusList(vueFiles));
        }
        
        output.push('\n---\n');
      }
    }
  } catch (err) {
    console.warn('Phase start: context gathering failed (non-blocking)', err);
  }

  output.push('---\n');
  output.push('## Baseline Audit\n');
  try {
    const auditResult = await auditPhaseStart({
      phase,
      featureName: context.feature.name
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
    // Non-blocking - don't fail phase start if audit fails
    output.push('**⚠️ Baseline audit skipped**\n');
    output.push(`**Reason:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('*Phase start continues - audit can be run manually later*\n');
  }

  output.push('\n---\n\n');
  output.push('## Plan (same tier)\n\n');
  try {
    const planOutput = await runTierPlan(PHASE_CONFIG, phaseId, undefined, undefined);
    if (planOutput) {
      output.push(planOutput);
      output.push('\n---\n\n');
    }
  } catch (planError) {
    console.warn('Phase start: plan step skipped', planError);
    output.push(`> Plan step skipped: ${planError instanceof Error ? planError.message : String(planError)}\n\n---\n\n`);
  }

  let firstSessionId: string | null = null;
  try {
    const phaseGuideContent = await context.readPhaseGuide(phase);
    const firstSessionMatch = phaseGuideContent.match(/Session\s+(\d+\.\d+(?:\.\d+)?):/);
    firstSessionId = firstSessionMatch ? firstSessionMatch[1] : null;
  } catch (_e) {
    // non-blocking
  }
  const cascadeSessionId = firstSessionId ?? 'X.Y.Z';
  output.push(`**Cascade:** Plan complete for phase ${phaseId}. Review above, then confirm to start session. Run \`/session-start ${cascadeSessionId}\` after confirmation.\n`);

  return output.join('\n');
}

