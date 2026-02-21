/**
 * Workflow Command: /workflow-create-from-template
 * Create a document from a template using unified workflow manager utilities
 * 
 * Provides a convenient interface to create documents from templates at any tier
 * using the unified CommandContext architecture.
 * 
 * Usage:
 *   /workflow-create-from-template feature guide [featureName] [replacements...]
 *   /workflow-create-from-template phase guide [phase] [featureName] [replacements...]
 *   /workflow-create-from-template session guide [sessionId] [featureName] [replacements...]
 * 
 * @param tier Document tier: "feature" | "phase" | "session"
 * @param docType Document type: "guide" | "log" | "handoff"
 * @param identifier Optional identifier (phase number, session ID)
 * @param featureName Optional feature name (from .current-feature or git branch if omitted)
 * @param replacements Optional template replacements (key-value pairs)
 */

import { resolveFeatureName } from '../../utils';
import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { TemplateReplacements } from '../../utils/template-manager';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function workflowCreateFromTemplate(
  tier: 'feature' | 'phase' | 'session',
  docType: 'guide' | 'log' | 'handoff',
  identifier: string | undefined,
  featureName?: string,
  replacements: TemplateReplacements = {}
): Promise<string> {
  const resolved = await resolveFeatureName(featureName);
  const context = new WorkflowCommandContext(resolved);
  const output: string[] = [];
  
  output.push(`# Workflow Create from Template: ${tier} ${docType}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Feature:** ${resolved}\n`);
  output.push('---\n\n');
  
  // Validate identifier for phase/session
  if (tier === 'phase' && !identifier) {
    return 'Error: Phase identifier is required for phase documents';
  }
  if (tier === 'session' && !identifier) {
    return 'Error: Session ID is required for session documents';
  }
  if (tier === 'session' && identifier && !WorkflowId.isValidSessionId(identifier)) {
    return `Error: Invalid session ID format. Expected X.Y.Z (e.g., 4.1.3)\nAttempted: ${identifier}`;
  }
  
  try {
    // Load template
    const template = await context.templates.loadTemplate(tier, docType);
    
    // Add default replacements if not provided
    const defaultReplacements: TemplateReplacements = {
      FEATURE_NAME: resolved,
      DATE: new Date().toISOString().split('T')[0],
      ...(identifier ? { IDENTIFIER: identifier } : {}),
      ...(tier === 'session' && identifier ? {
        SESSION_ID: identifier,
        PHASE: WorkflowId.extractPhaseId(identifier) || '',
      } : {}),
      ...(tier === 'phase' && identifier ? {
        PHASE: identifier,
      } : {}),
    };
    
    const finalReplacements = { ...defaultReplacements, ...replacements };
    
    // Render template
    const rendered = context.templates.render(template, finalReplacements);
    
    // Determine output path
    const outputPath = 
      tier === 'feature' ? (
        docType === 'guide' ? context.paths.getFeatureGuidePath() :
        docType === 'log' ? context.paths.getFeatureLogPath() :
        context.paths.getFeatureHandoffPath()
      ) :
      tier === 'phase' ? (
        docType === 'guide' ? context.paths.getPhaseGuidePath(identifier!) :
        docType === 'log' ? context.paths.getPhaseLogPath(identifier!) :
        context.paths.getPhaseHandoffPath(identifier!)
      ) : (
        docType === 'guide' ? context.paths.getSessionGuidePath(identifier!) :
        docType === 'log' ? context.paths.getSessionLogPath(identifier!) :
        context.paths.getSessionHandoffPath(identifier!)
      );
    
    // Write document
    const PROJECT_ROOT = process.cwd();
    await writeFile(join(PROJECT_ROOT, outputPath), rendered, 'utf-8');
    context.cache.invalidate(outputPath);
    
    output.push(`✅ **Document created successfully**\n`);
    output.push(`**Path:** ${outputPath}\n`);
    output.push(`**Template:** ${tier}-${docType}.md\n`);
    output.push(`**Replacements used:**\n`);
    for (const [key, value] of Object.entries(finalReplacements)) {
      output.push(`- ${key}: ${value}\n`);
    }
    
  } catch (_error) {
    const templatePath = context.paths.getTemplatePath(tier, docType);
    
    output.push(`**ERROR: Failed to create document from template**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Document Type:** ${docType}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Template:** ${templatePath}\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push(`**Suggestion:** Ensure the template file exists at ${templatePath}\n`);
  }
  
  return output.join('\n');
}

