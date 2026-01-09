/**
 * Composite Command: /phase-start [phase]
 * Load phase guide and handoff, set phase context
 * 
 * Tier: Phase (Tier 1 - High-Level)
 * Operates on: Phase-level workflow (loads phase guide/handoff, triggers session planning)
 * 
 * Also triggers session planning (creates session plan files during phase start)
 */

import { readProjectFile, PROJECT_ROOT, getCurrentBranch, runCommand, isBranchBasedOn, branchExists, enforcePlanMode, writeProjectFile } from '../../../utils/utils';
import { readHandoff } from '../../../utils/read-handoff';
import { join } from 'path';
import { access } from 'fs/promises';
import { MarkdownUtils } from '../../../utils/markdown-utils';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { auditPhaseStart } from '../../../audit/composite/audit-phase-start';
import { extractFilesFromPhaseGuide, gatherFileStatuses, extractFilePaths } from '../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../utils/context-templates';
import { createBranch } from '../../../git/atomic/create-branch';
import { validatePhase, formatPhaseValidation } from './validate-phase';
import { parsePhasePlan } from '../../../utils/planning-doc-parser';
import { generatePhaseGuideFromPlan, generatePhaseHandoffFromPlan } from '../../../utils/planning-doc-generator';
import { CommandExecutionOptions, isPlanMode } from '../../../utils/command-execution-mode';

export async function phaseStart(phase: string, options?: CommandExecutionOptions): Promise<string> {
  // MODE ENFORCEMENT - Must be first, before any other operations
  const modeCheck = enforcePlanMode('phase-start', options);
  const output: string[] = [];
  const mode = modeCheck.mode;
  
  // Always show mode enforcement instructions at the top
  output.push(modeCheck.message);
  output.push('\n---\n');
  
  // Auto-detect feature context
  const context = await WorkflowCommandContext.getCurrent();
  
  output.push(`# Phase ${phase} Start\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Command:** \`/phase-start ${phase}\`\n`);
  
  // Get current branch and display branch hierarchy (always display, even if errors occur)
  try {
    const currentBranch = await getCurrentBranch();
    const featureBranch = currentBranch.startsWith('feature/') ? currentBranch : `feature/${context.feature.name}`;
    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    const mainBranch = (await branchExists('main')) ? 'main' : 'master';
    
    // Display branch hierarchy verification
    output.push('## Branch Hierarchy Verification\n');
    output.push('```');
    output.push(`${mainBranch}`);
    output.push(`  └── ${featureBranch}`);
    output.push(`       └── ${phaseBranchName} (target)`);
    output.push('```');
    output.push(`\n**Current Branch:** \`${currentBranch}\``);
    output.push(`\n**Target Phase Branch:** \`${phaseBranchName}\``);
    output.push(`\n**Feature Branch:** \`${featureBranch}\``);
    output.push(`\n**Base Branch:** \`${mainBranch}\`\n`);
  } catch (error) {
    // If branch info fails, still show what we can
    output.push('## Branch Hierarchy Verification\n');
    output.push(`**⚠️ Could not determine branch information:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Phase:** ${phase}\n`);
    output.push(`**Feature:** ${context.feature.name}\n`);
  }
  output.push('---\n');
  
  // Validate phase can be started
  output.push('## Phase Validation\n');
  const validation = await validatePhase(phase);
  const validationMessage = formatPhaseValidation(validation, phase);
  output.push(validationMessage);
  
  if (!validation.canStart) {
    output.push('\n---\n');
    output.push('**⚠️ Cannot start phase. Please address the issues above before proceeding.**\n');
    return output.join('\n');
  }
  
  if (isPlanMode(mode)) {
    output.push('\n---\n');
    output.push('## Mode: Plan (no side effects)\n');
    output.push('This is a deterministic preview. No git commands or file writes will be executed.\n');
    output.push('\n### What would run (execute mode)\n');
    output.push(`- Git: ensure feature branch exists and is based on main/master`)
    output.push(`- Git: create/switch phase branch \`${context.feature.name}-phase-${phase}\``)
    output.push(`- Docs: read \`${context.paths.getFeaturePlanPath()}\` (optional)`)
    output.push('- Docs: generate phase guide/handoff from feature plan (if present and docs missing)')
    output.push('- Audit: run phase-start audit (non-blocking)')
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
  } catch (error) {
    output.push(`**❌ ERROR:** Failed to create phase branch\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
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
    } catch {
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
        } catch {}
        
        try {
          await access(join(PROJECT_ROOT, handoffPath));
          handoffExists = true;
        } catch {}
        
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
      } catch {}
      
      if (!guideExists) {
        output.push(`**Note:** No feature-plan.md found and phase workflow docs don't exist.\n`);
        output.push(`**Suggestion:** Create phase plan in feature-plan.md or use templates.\n`);
      } else {
        output.push(`**Note:** Phase workflow docs already exist. Using existing docs.\n`);
      }
    }
  } catch (error) {
    output.push(`**WARNING:** Failed to generate phase workflow documents from feature-plan.md\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
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
  } catch (error) {
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
  } catch (error) {
    output.push('## Transition Context\n');
    output.push(`**ERROR: Phase handoff not found**\n`);
    output.push(`${error instanceof Error ? error.message : String(error)}\n`);
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
  } catch (error) {
    // Non-blocking - don't fail phase start if context gathering fails
    // Silently continue - context gathering is optional enhancement
  }
  
  // Session planning reminder
  output.push('## Session Planning\n');
  output.push('**Next step:** Create session plan files for this phase');
  output.push('**Use:** `/plan-session [X.Y]` to plan each session');
  output.push(`**Sessions will be created as:** \`${context.paths.getSessionGuidePath('X.Y').replace('X.Y', '[X.Y]')}\`\n`);
  
  output.push('---\n');
  output.push('## Next Action - Plan Mode Workflow\n');
  output.push('**⚠️ IMPORTANT: Follow this workflow in Plan Mode:**\n');
  output.push('\n### Step 1: Review and Plan\n');
  output.push('**Current Status:** You are in Plan Mode (or should be)\n');
  output.push('- ✅ Branch setup completed (safe operations)');
  output.push('- ✅ Validation completed (read-only checks)');
  output.push('- ✅ Context loaded (read-only operations)');
  output.push('- 📋 Session planning next\n');
  
  output.push('### Step 2: Plan Sessions\n');
  output.push('**Session Planning Steps:**');
  output.push('1. Review the phase guide and handoff above');
  output.push('2. Identify which sessions need to be planned');
  output.push('3. Use `/plan-session [X.Y]` for each session');
  output.push('4. Review each session plan');
  output.push('5. Wait for explicit user approval before starting sessions\n');
  
  output.push('### Step 3: Get User Approval\n');
  output.push('**Before starting sessions:**');
  output.push('- ✅ Phase plan must be reviewed');
  output.push('- ✅ Session plans must be created and reviewed');
  output.push('- ✅ User must explicitly confirm to proceed\n');
  
  output.push('### Step 4: Start Sessions (After Approval)\n');
  output.push('**Only after user approval:**');
  output.push('1. User switches to Agent Mode (or you confirm Agent Mode is active)');
  output.push('2. Begin implementing sessions using `/session-start [X.Y]`');
  output.push('3. Follow the session workflow for each session');
  output.push('4. Complete sessions in order\n');
  
  output.push('### ⚠️ Mode Enforcement Reminder\n');
  output.push('- **Plan Mode:** Planning, reviewing, generating plans ✅');
  output.push('- **Agent Mode:** Implementing approved plans ✅');
  output.push('- **Do NOT implement in Plan Mode** ❌');
  output.push('- **Do NOT plan in Agent Mode** ❌\n');
  
  // Run start audit (non-blocking)
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
  } catch (error) {
    // Non-blocking - don't fail phase start if audit fails
    output.push('**⚠️ Baseline audit skipped**\n');
    output.push(`**Reason:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('*Phase start continues - audit can be run manually later*\n');
  }
  
  return output.join('\n');
}

