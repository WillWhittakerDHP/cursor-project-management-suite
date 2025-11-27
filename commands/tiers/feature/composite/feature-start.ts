/**
 * Composite Command: /feature-start [name]
 * Start a feature (create branch, initialize structure, load context)
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (creates git branch, loads feature context)
 * 
 * Composition: /feature-load + git checkout -b feature/[name] + /feature-checkpoint
 * 
 * IMPORTANT: Ask Mode Only
 * This command is for planning and should be used in Ask Mode.
 * It outputs a plan, not an implementation.
 */

import { featureLoad } from '../atomic/feature-load';
import { featureCheckpoint } from '../atomic/feature-checkpoint';
import { createBranch } from '../../../git/atomic/create-branch';
import { runCommand } from '../../../utils/utils';
import { auditFeatureStart } from '../../../audit/composite/audit-feature-start';
import { WorkflowCommandContext } from '../../../utils/command-context';
import { extractFilePaths, gatherFileStatuses } from '../../../../utils/context-gatherer';
import { formatFileStatusList } from '../../../../utils/context-templates';
import { readProjectFile } from '../../../utils/utils';

export async function featureStart(featureName: string): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Starting Feature: ${featureName}\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n\n`);
  
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
    
    // Create feature branch
    const branchName = `feature/${featureName}`;
    const branchResult = await createBranch(branchName);
    if (branchResult.success) {
      output.push(`**Branch Created:** ${branchName}\n`);
    } else {
      output.push(`**WARNING:** Could not create branch: ${branchResult.output}\n`);
      output.push(`**Suggestion:** Branch may already exist. Use \`git checkout ${branchName}\` to switch to it.\n`);
    }
  } catch (error) {
    output.push(`**ERROR:** Failed to create git branch\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n\n');
  
  // Step 2: Load feature context
  output.push('## Step 2: Loading Feature Context\n\n');
  try {
    const loadOutput = await featureLoad(featureName);
    output.push(loadOutput);
  } catch (error) {
    output.push(`**ERROR:** Failed to load feature context\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Auto-gather context (non-blocking)
  try {
    const context = new WorkflowCommandContext(featureName);
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
  } catch (error) {
    // Non-blocking - don't fail feature start if context gathering fails
    // Silently continue - context gathering is optional enhancement
  }
  
  output.push('\n---\n\n');
  
  // Step 3: Create initial checkpoint
  output.push('## Step 3: Creating Initial Checkpoint\n\n');
  try {
    const checkpointOutput = await featureCheckpoint(featureName);
    output.push(checkpointOutput);
  } catch (error) {
    output.push(`**WARNING:** Failed to create checkpoint\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  output.push('\n---\n\n');
  
  // Run start audit (non-blocking)
  output.push('## Baseline Audit\n\n');
  try {
    const auditResult = await auditFeatureStart({
      featureName
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
    // Non-blocking - don't fail feature start if audit fails
    output.push('**⚠️ Baseline audit skipped**\n');
    output.push(`**Reason:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('*Feature start continues - audit can be run manually later*\n');
  }
  
  output.push('\n---\n\n');
  output.push('## Next Steps\n\n');
  output.push('1. Review feature guide and research findings\n');
  output.push('2. Plan first phase: `/plan-phase [N] [description]`\n');
  output.push('3. Start first phase: `/phase-start [N]`\n');
  
  return output.join('\n');
}

