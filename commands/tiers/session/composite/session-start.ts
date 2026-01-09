/**
 * Composite Command: /session-start [session-id] [description]
 * Composition: /read-handoff + /read-guide + /create-session-label
 * 
 * Tier: Session (Tier 2 - Medium-Level)
 * Operates on: Session-level workflow (loads session guide/handoff, triggers task planning)
 * 
 * Mode: Ask Mode (planning/documenting)
 * 
 * IMPORTANT: This command must be used in Ask Mode. It loads context and generates a plan but
 * does NOT implement changes. Implementation requires switching to Agent Mode after explicit
 * approval from the user.
 * 
 * Focus: Load transition context (where we left off, what's next)
 * Also triggers task planning (fills out task embeds in session guide)
 * 
 * Workflow:
 * 1. User runs command in Ask Mode
 * 2. Command loads session context and guide
 * 3. Agent responds with plan following session-start-response-template.md format
 * 4. User reviews plan and approves
 * 5. User switches to Agent Mode for implementation
 * 
 * IMPORTANT: Agent Response Format
 * 
 * When responding to this command, agents should follow the standardized response format
 * defined in `.cursor/commands/tiers/session/templates/session-start-response-template.md`.
 * 
 * Key requirements:
 * - Keep response concise and focused
 * - Show current state (what's done ✅ vs missing ❌)
 * - Provide clear objectives and implementation plan
 * - Include React vs Vue differences (brief)
 * - End with explicit approval request: "Should I proceed with implementing these changes, 
 *   or do you want to review the plan first?"
 * 
 * Avoid:
 * - Redundant sections
 * - Excessive detail in task breakdowns (save for actual task work)
 * - Long code examples upfront
 * - Vague approval requests
 * 
 * See template file for complete format and examples.
 */

import { readHandoff, HandoffTier } from '../../../utils/read-handoff';
import { readGuide } from '../../../utils/read-guide';
import { createSessionLabel, formatSessionLabel } from '../atomic/create-session-label';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { auditSessionStart } from '../../../audit/composite/audit-session-start';
import { spawn } from 'child_process';
import { generateCurrentStateSummary } from '../../../utils/context-gatherer';
import { formatAutoGatheredContext } from '../../../utils/context-templates';
import { createBranch } from '../../../git/atomic/create-branch';
import { getCurrentBranch, runCommand, isBranchBasedOn, branchExists, enforcePlanMode } from '../../../utils/utils';
import { validateSession, formatSessionValidation } from './validate-session';
import { CommandExecutionOptions, isPlanMode } from '../../../utils/command-execution-mode';

export async function sessionStart(sessionId: string, description: string, options?: CommandExecutionOptions): Promise<string> {
  // MODE ENFORCEMENT - Must be first, before any other operations
  const modeCheck = enforcePlanMode('session-start', options);
  const mode = modeCheck.mode;
  const output: string[] = [];
  
  // Always show mode enforcement instructions at the top
  output.push(modeCheck.message);
  output.push('\n---\n');
  
  // Auto-detect feature context
  const context = await WorkflowCommandContext.getCurrent();
  
  // Extract phase number from sessionId (sessionId is X.Y format, phase is X)
  const phaseMatch = sessionId.match(/^(\d+)/);
  const phase = phaseMatch ? phaseMatch[1] : '1';
  
  output.push(`# Session ${sessionId} Start\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Command:** \`/session-start ${sessionId}\`\n`);
  
  // Get current branch and display branch hierarchy (always display, even if errors occur)
  try {
    const currentBranch = await getCurrentBranch();
    const featureBranch = `feature/${context.feature.name}`;
    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${sessionId}`;
    const mainBranch = (await branchExists('main')) ? 'main' : 'master';
    
    // Display branch hierarchy verification
    output.push('## Branch Hierarchy Verification\n');
    output.push('```');
    output.push(`${mainBranch}`);
    output.push(`  └── ${featureBranch}`);
    output.push(`       └── ${phaseBranchName}`);
    output.push(`            └── ${sessionBranchName} (target)`);
    output.push('```');
    output.push(`\n**Current Branch:** \`${currentBranch}\``);
    output.push(`\n**Target Session Branch:** \`${sessionBranchName}\``);
    output.push(`\n**Phase Branch:** \`${phaseBranchName}\``);
    output.push(`\n**Feature Branch:** \`${featureBranch}\``);
    output.push(`\n**Base Branch:** \`${mainBranch}\`\n`);
  } catch (error) {
    // If branch info fails, still show what we can
    output.push('## Branch Hierarchy Verification\n');
    output.push(`**⚠️ Could not determine branch information:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Session ID:** ${sessionId}\n`);
    output.push(`**Feature:** ${context.feature.name}\n`);
  }
  output.push('---\n');
  
  // Validate session can be started
  output.push('## Session Validation\n');
  const validation = await validateSession(sessionId);
  const validationMessage = formatSessionValidation(validation, sessionId);
  output.push(validationMessage);
  
  if (!validation.canStart) {
    output.push('\n---\n');
    output.push('**⚠️ Cannot start session. Please address the issues above before proceeding.**\n');
    return output.join('\n');
  }

  if (isPlanMode(mode)) {
    const featureBranch = `feature/${context.feature.name}`;
    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${sessionId}`;
    const sessionGuidePath = context.paths.getSessionGuidePath(sessionId);
    const sessionHandoffPath = context.paths.getSessionHandoffPath(sessionId);
    const phaseGuidePath = context.paths.getPhaseGuidePath(phase);

    output.push('\n---\n');
    output.push('## Mode: Plan (no side effects)\n');
    output.push('This is a deterministic preview. No server refresh, git commands, or file writes will be executed.\n');
    output.push('\n### What would run (execute mode)\n');
    output.push('- Server: `npm run server:refresh` (background)')
    output.push(`- Git: ensure phase branch exists: \`${phaseBranchName}\``)
    output.push(`- Git: create/switch session branch: \`${sessionBranchName}\``)
    output.push(`- Git: verify branch ancestry: \`${sessionBranchName}\` is based on \`${phaseBranchName}\` (and \`${phaseBranchName}\` is based on \`${featureBranch}\`)`)
    output.push(`- Docs: read session guide: \`${sessionGuidePath}\``)
    output.push(`- Docs: read session handoff: \`${sessionHandoffPath}\``)
    output.push(`- Docs: (reference) phase guide: \`${phaseGuidePath}\``)
    output.push('- Output: render session-start response format + auto-gathered context')
    output.push('- Audit: run session-start audit (non-blocking)')
    return output.join('\n');
  }

  // Restart server in background (non-blocking)
  spawn('npm', ['run', 'server:refresh'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  }).unref();
  
  output.push('\n---\n');
  
  // Step 1: Create session branch
  output.push('## Step 1: Creating Session Branch\n');
  try {
    // Extract phase number from sessionId (sessionId is X.Y format, phase is X)
    const phaseMatch = sessionId.match(/^(\d+)/);
    const phase = phaseMatch ? phaseMatch[1] : '1';
    
    // Get current phase branch name
    const phaseBranchName = `${context.feature.name}-phase-${phase}`;
    const featureBranch = `feature/${context.feature.name}`;
    const currentBranch = await getCurrentBranch();
    
    // Check if phase branch exists
    if (!(await branchExists(phaseBranchName))) {
      output.push(`**❌ ERROR:** Phase branch ${phaseBranchName} does not exist\n`);
      output.push(`**Current Branch:** ${currentBranch}\n`);
      output.push(`**Required Branch:** ${phaseBranchName}\n`);
      output.push(`**Suggestion:** Create the phase branch first with /phase-start ${phase}\n`);
      output.push('\n---\n');
      output.push('**⚠️ Cannot start session. Please create the phase branch first.**\n');
      return output.join('\n');
    }
    
    // Check if phase branch is based on feature branch
    if (await branchExists(featureBranch)) {
      const isPhaseBasedOnFeature = await isBranchBasedOn(phaseBranchName, featureBranch);
      if (!isPhaseBasedOnFeature) {
        output.push(`**❌ ERROR:** Phase branch ${phaseBranchName} is not based on feature branch ${featureBranch}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Phase Branch:** ${phaseBranchName}\n`);
        output.push(`**Required Base:** ${featureBranch}\n`);
        output.push(`**Suggestion:** Ensure phase branch is based on feature branch. You may need to recreate it with /phase-start ${phase}\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start session. Phase branch must be based on feature branch.**\n');
        return output.join('\n');
      }
    }
    
    // Ensure we're on the phase branch before creating session branch
    if (currentBranch !== phaseBranchName && !currentBranch.includes(`-phase-${phase}`)) {
      const checkoutResult = await runCommand(`git checkout ${phaseBranchName}`);
      if (!checkoutResult.success) {
        output.push(`**❌ ERROR:** Could not checkout phase branch ${phaseBranchName}\n`);
        output.push(`**Error:** ${checkoutResult.error || checkoutResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${phaseBranchName}\n`);
        output.push(`**Suggestion:** Ensure phase branch exists or create it first with /phase-start ${phase}, or manually checkout the correct branch\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start session. Please checkout the correct phase branch first.**\n');
        return output.join('\n');
      } else {
        output.push(`**Checked out:** ${phaseBranchName}\n`);
      }
    }
    
    // Create session branch: feature/{featureName}-phase-{phase}-session-{sessionId}
    const sessionBranchName = `${context.feature.name}-phase-${phase}-session-${sessionId}`;
    
    // Check if session branch already exists and verify it's based on phase branch
    if (await branchExists(sessionBranchName)) {
      const isSessionBasedOnPhase = await isBranchBasedOn(sessionBranchName, phaseBranchName);
      if (!isSessionBasedOnPhase) {
        output.push(`**❌ ERROR:** Existing session branch ${sessionBranchName} is not based on phase branch ${phaseBranchName}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Session Branch:** ${sessionBranchName}\n`);
        output.push(`**Required Base:** ${phaseBranchName}\n`);
        output.push(`**Suggestion:** Delete and recreate the session branch, or rebase it: git rebase ${phaseBranchName}\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start session. Session branch must be based on phase branch.**\n');
        return output.join('\n');
      }
      // Switch to existing session branch
      const checkoutSessionResult = await runCommand(`git checkout ${sessionBranchName}`);
      if (checkoutSessionResult.success) {
        output.push(`**Switched to existing session branch:** ${sessionBranchName}\n`);
      } else {
        output.push(`**❌ ERROR:** Could not switch to existing session branch\n`);
        output.push(`**Error:** ${checkoutSessionResult.error || checkoutSessionResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${sessionBranchName}\n`);
        output.push(`**Suggestion:** Resolve conflicts or stash changes first.\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start session. Please resolve branch issues first.**\n');
        return output.join('\n');
      }
    } else {
      // Create new session branch from phase branch
      const branchResult = await createBranch(sessionBranchName);
      if (branchResult.success) {
        output.push(`**Session Branch Created:** ${sessionBranchName}\n`);
        // Verify the new branch is based on phase branch
        const isSessionBasedOnPhase = await isBranchBasedOn(sessionBranchName, phaseBranchName);
        if (!isSessionBasedOnPhase) {
          output.push(`**⚠️ WARNING:** Session branch created but verification failed. Please verify branch hierarchy manually.\n`);
        }
      } else {
        output.push(`**❌ ERROR:** Could not create session branch\n`);
        output.push(`**Error:** ${branchResult.output}\n`);
        output.push(`**Current Branch:** ${currentBranch}\n`);
        output.push(`**Required Branch:** ${sessionBranchName}\n`);
        output.push(`**Suggestion:** Resolve conflicts or stash changes first.\n`);
        output.push('\n---\n');
        output.push('**⚠️ Cannot start session. Please resolve branch issues first.**\n');
        return output.join('\n');
      }
    }
  } catch (error) {
    output.push(`**❌ ERROR:** Failed to create session branch\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n---\n');
    output.push('**⚠️ Cannot start session. Please resolve branch issues first.**\n');
    return output.join('\n');
  }
  output.push('\n---\n');
  
  // Execute atomic commands with tier information for session-specific files
  const handoffContent = await readHandoff('session', sessionId);
  const guideContent = await readGuide(sessionId);
  const sessionLabel = createSessionLabel(sessionId, description);
  const formattedLabel = formatSessionLabel(sessionLabel);
  
  output.push(formattedLabel);
  output.push('\n---\n');
  output.push('## Transition Context');
  output.push('**Where we left off and what you need to start:**');
  output.push('');
  output.push(handoffContent);
  output.push('\n---\n');
  output.push('## Session Guide');
  output.push('**Structure and workflow for this session:**');
  output.push('');
  output.push(guideContent);
  output.push('\n---\n');
  
  // Auto-gather context (non-blocking)
  try {
    const contextSummary = await generateCurrentStateSummary(sessionId, context.feature.name);
    if (contextSummary.filesStatus.length > 0 || contextSummary.implementationStatus.done.length > 0 || contextSummary.implementationStatus.missing.length > 0) {
      output.push(formatAutoGatheredContext(contextSummary));
      output.push('\n---\n');
    }
  } catch (error) {
    // Non-blocking - don't fail session start if context gathering fails
    // Silently continue - context gathering is optional enhancement
  }
  
  output.push('## Task Planning');
  output.push('**Next step:** Fill out task embeds in session guide for this session');
  output.push('**Use:** `/plan-task [X.Y.Z]` to plan each task');
  output.push('\n---\n');
  
  // Extract first task from guide content to provide explicit next action
  const firstTaskNumber = 1;
  const firstTaskId = `${sessionId}.${firstTaskNumber}`;
  const firstTaskPattern = new RegExp(`#### Task ${firstTaskId.replace('.', '\\.')}:.*?(?=#### Task|##|$)`, 's');
  const firstTaskMatch = guideContent.match(firstTaskPattern);
  
  output.push('## Next Action - Plan Mode Workflow\n');
  output.push('**⚠️ IMPORTANT: Follow this workflow in Plan Mode:**\n');
  output.push('\n### Step 1: Review and Plan\n');
  output.push('**Current Status:** You are in Plan Mode (or should be)\n');
  output.push('- ✅ Branch setup completed (safe operations)');
  output.push('- ✅ Validation completed (read-only checks)');
  output.push('- ✅ Context loaded (read-only operations)');
  output.push('- 📋 Plan generation next\n');
  
  output.push('### Step 2: Create Implementation Plan\n');
  if (firstTaskMatch) {
    // Extract task details
    const taskContent = firstTaskMatch[0];
    output.push('**First Task:**');
    output.push(taskContent);
    output.push('\n**Plan Creation Steps:**');
    output.push(`1. Review Task ${firstTaskId} details above`);
    output.push('2. Create a detailed implementation plan (what files to modify, what changes to make)');
    output.push('3. Present the plan to the user for review');
    output.push('4. Show code changes, explain approach, highlight any risks');
    output.push('5. Wait for explicit user approval before proceeding');
  } else {
    // Fallback if task format not found
    output.push(`**Task ${firstTaskId}:** [Task details not found in session guide]`);
    output.push('\n**Plan Creation Steps:**');
    output.push(`1. Review the session guide above for Task ${firstTaskId} details`);
    output.push('2. Create a detailed implementation plan');
    output.push('3. Present the plan to the user for review');
    output.push('4. Wait for explicit user approval');
  }
  
  output.push('\n### Step 3: Get User Approval\n');
  output.push('**Before implementing:**');
  output.push('- ✅ Plan must be reviewed and approved by user');
  output.push('- ✅ User must explicitly confirm: "proceed", "implement", "go ahead", etc.');
  output.push('- ❌ Do NOT implement until approval is received\n');
  
  output.push('### Step 4: Switch to Agent Mode (After Approval)\n');
  output.push('**Only after user approval:**');
  output.push('1. User switches to Agent Mode (or you confirm Agent Mode is active)');
  output.push('2. Begin implementation of the approved plan');
  output.push(`3. Start with Task ${firstTaskId} (create/modify files as needed)`);
  output.push('4. Work through tasks in order (complete each task before moving to the next)');
  output.push('5. Present checkpoint after each task completion');
  output.push('6. Follow the task approach and verify checkpoint criteria\n');
  
  output.push('### ⚠️ Mode Enforcement Reminder\n');
  output.push('- **Plan Mode:** Planning, reviewing, generating plans ✅');
  output.push('- **Agent Mode:** Implementing approved plans ✅');
  output.push('- **Do NOT implement in Plan Mode** ❌');
  output.push('- **Do NOT plan in Agent Mode** ❌');
  
  output.push('\n---\n');
  
  // Run start audit (non-blocking)
  output.push('## Baseline Audit\n');
  try {
    const auditResult = await auditSessionStart({
      sessionId,
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
    // Non-blocking - don't fail session start if audit fails
    output.push('**⚠️ Baseline audit skipped**\n');
    output.push(`**Reason:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('*Session start continues - audit can be run manually later*\n');
  }
  
  output.push('\n---\n');
  output.push('## Compact Prompt Format');
  output.push('```');
  output.push(`@${context.paths.getFeatureHandoffPath()} Continue ${context.feature.name} - start Session ${sessionId} (${description})`);
  output.push('```');
  
  return output.join('\n');
}

