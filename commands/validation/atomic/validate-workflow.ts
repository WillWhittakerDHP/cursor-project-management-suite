/**
 * Atomic Command: /validate-workflow [tier] [identifier]
 * Validate workflow state
 * 
 * Tier: Cross-tier utility
 * Operates on: Workflow state validation
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { WorkflowId } from '../../utils/id-utils';
import { getStatus, StatusTier } from '../../status/atomic/get-status';
import { DocumentTier } from '../../utils/document-manager';
import { access } from 'fs/promises';
import { join } from 'path';
import { MarkdownUtils } from '../../utils/markdown-utils';

export type ValidationTier = DocumentTier | 'task';

export interface ValidateWorkflowParams {
  tier: ValidationTier;
  identifier?: string;
  featureName?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
}

/**
 * Validate workflow state
 * 
 * @param params Validate workflow parameters
 * @returns Formatted validation output
 */
export async function validateWorkflow(params: ValidateWorkflowParams): Promise<string> {
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Validate Workflow: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task validation';
  }
  
  if (params.tier === 'session' && params.identifier && !WorkflowId.isValidSessionId(params.identifier)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${params.identifier}`;
  }
  
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    info: []
  };
  
  try {
    // 1. Check todo exists
    const statusInfo = await getStatus({
      tier: params.tier as StatusTier,
      identifier: params.identifier,
      featureName
    });
    
    if (!statusInfo) {
      result.valid = false;
      result.errors.push(`Status not found in control doc for ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}`);
    } else {
      result.info.push(`Status: ${statusInfo.status} (${statusInfo.title})`);
    }
    
    // 2. Check documents exist
    const documentChecks = await checkDocuments(context, params.tier, params.identifier);
    result.errors.push(...documentChecks.errors);
    result.warnings.push(...documentChecks.warnings);
    result.info.push(...documentChecks.info);
    
    // 3. Check required sections in documents
    const sectionChecks = await checkRequiredSections(context, params.tier, params.identifier);
    result.errors.push(...sectionChecks.errors);
    result.warnings.push(...sectionChecks.warnings);
    
    // Update valid flag
    if (result.errors.length > 0) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **Workflow state is valid**\n\n');
    } else {
      output.push('❌ **Workflow state has errors**\n\n');
    }
    
    if (result.errors.length > 0) {
      output.push('## Errors\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ ${error}\n`);
      }
      output.push('\n');
    }
    
    if (result.warnings.length > 0) {
      output.push('## Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ ${warning}\n`);
      }
      output.push('\n');
    }
    
    if (result.info.length > 0) {
      output.push('## Info\n\n');
      for (const info of result.info) {
        output.push(`- ℹ️ ${info}\n`);
      }
      output.push('\n');
    }
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to validate workflow**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check documents exist
 */
async function checkDocuments(
  context: WorkflowCommandContext,
  tier: ValidationTier,
  identifier?: string
): Promise<{ errors: string[]; warnings: string[]; info: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  
  const PROJECT_ROOT = process.cwd();
  
  // Check guide
  try {
    let guidePath: string;
    if (tier === 'feature') {
      guidePath = context.paths.getFeatureGuidePath();
    } else if (tier === 'phase') {
      guidePath = context.paths.getPhaseGuidePath(identifier!);
    } else {
      guidePath = context.paths.getSessionGuidePath(identifier!);
    }
    
    await access(join(PROJECT_ROOT, guidePath));
    info.push(`Guide exists: ${guidePath}`);
  } catch (err) {
    console.warn('Validate workflow: guide not found', tier, identifier, err);
    warnings.push(`Guide not found: ${tier}${identifier ? ` ${identifier}` : ''}`);
  }
  
  // Check log
  try {
    let logPath: string;
    if (tier === 'feature') {
      logPath = context.paths.getFeatureLogPath();
    } else if (tier === 'phase') {
      logPath = context.paths.getPhaseLogPath(identifier!);
    } else {
      logPath = context.paths.getSessionLogPath(identifier!);
    }
    
    await access(join(PROJECT_ROOT, logPath));
    info.push(`Log exists: ${logPath}`);
  } catch (err) {
    console.warn('Validate workflow: log not found', tier, identifier, err);
    warnings.push(`Log not found: ${tier}${identifier ? ` ${identifier}` : ''}`);
  }
  
  // Check handoff
  try {
    let handoffPath: string;
    if (tier === 'feature') {
      handoffPath = context.paths.getFeatureHandoffPath();
    } else if (tier === 'phase') {
      handoffPath = context.paths.getPhaseHandoffPath(identifier!);
    } else {
      handoffPath = context.paths.getSessionHandoffPath(identifier!);
    }
    
    await access(join(PROJECT_ROOT, handoffPath));
    info.push(`Handoff exists: ${handoffPath}`);
  } catch (err) {
    console.warn('Validate workflow: handoff not found', tier, identifier, err);
    warnings.push(`Handoff not found: ${tier}${identifier ? ` ${identifier}` : ''}`);
  }
  
  return { errors, warnings, info };
}

/**
 * Check required sections in documents
 */
async function checkRequiredSections(
  context: WorkflowCommandContext,
  tier: ValidationTier,
  identifier?: string
): Promise<{ errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Check handoff has required sections
    let handoffContent = '';
    try {
      if (tier === 'feature') {
        handoffContent = await context.readFeatureHandoff();
      } else if (tier === 'phase') {
        handoffContent = await context.readPhaseHandoff(identifier!);
      } else {
        handoffContent = await context.readSessionHandoff(identifier!);
      }
    } catch (err) {
      console.warn('Validate workflow: handoff not found, skipping section checks', tier, identifier, err);
      return { errors, warnings };
    }
    
    const requiredSections = ['Current Status', 'Next Action', 'Transition Context'];

    for (const section of requiredSections) {
      const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
      if (!sectionContent || sectionContent.trim().length === 0) {
        warnings.push(`Handoff missing section: ${section}`);
      }
    }
  } catch (_error) {
    warnings.push(`Failed to check sections: ${_error instanceof Error ? _error.message : String(_error)}`);
  }
  
  return { errors, warnings };
}

/**
 * Validate workflow (programmatic API)
 * 
 * @param params Validate workflow parameters
 * @returns Structured validation result
 */
export async function validateWorkflowProgrammatic(
  params: ValidateWorkflowParams
): Promise<{ success: boolean; result?: ValidationResult; error?: string }> {
  try {
    // Use the CLI version and parse results (simplified)
    // In a real implementation, you'd want to share the validation logic
    const output = await validateWorkflow(params);
    
    // Parse output to extract validation result
    const result: ValidationResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      info: []
    };
    
    // Extract errors, warnings, info from output
    const errorMatches = output.matchAll(/- ❌ (.+)/g);
    for (const match of errorMatches) {
      result.errors.push(match[1]);
    }
    
    const warningMatches = output.matchAll(/- ⚠️ (.+)/g);
    for (const match of warningMatches) {
      result.warnings.push(match[1]);
    }
    
    const infoMatches = output.matchAll(/- ℹ️ (.+)/g);
    for (const match of infoMatches) {
      result.info.push(match[1]);
    }
    
    return {
      success: true,
      result
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error)
    };
  }
}

