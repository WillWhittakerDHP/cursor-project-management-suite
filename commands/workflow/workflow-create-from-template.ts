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
 * @param featureName Optional feature name (defaults to "vue-migration")
 * @param replacements Optional template replacements (key-value pairs)
 */

import { WorkflowCommandContext } from '../utils/command-context';
import { WorkflowId } from '../utils/id-utils';
import { TemplateReplacements } from '../utils/template-manager';

export async function workflowCreateFromTemplate(
  tier: 'feature' | 'phase' | 'session',
  docType: 'guide' | 'log' | 'handoff',
  identifier: string | undefined,
  featureName: string = 'vue-migration',
  replacements: TemplateReplacements = {}
): Promise<string> {
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Workflow Create from Template: ${tier} ${docType}${identifier ? ` ${identifier}` : ''}\n`);
  output.push(`**Feature:** ${featureName}\n`);
  output.push('---\n\n');
  
  // Validate identifier for phase/session
  if (tier === 'phase' && !identifier) {
    return 'Error: Phase identifier is required for phase documents';
  }
  if (tier === 'session' && !identifier) {
    return 'Error: Session ID is required for session documents';
  }
  if (tier === 'session' && identifier && !WorkflowId.isValidSessionId(identifier)) {
    return `Error: Invalid session ID format. Expected X.Y (e.g., 2.1)\nAttempted: ${identifier}`;
  }
  
  try {
    // Load template
    const template = await context.templates.loadTemplate(tier, docType);
    
    // Add default replacements if not provided
    const defaultReplacements: TemplateReplacements = {
      FEATURE_NAME: featureName,
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
    const { writeFile } = await import('fs/promises');
    const { join } = await import('path');
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
    
  } catch (error) {
    const templatePath = context.paths.getTemplatePath(tier, docType);
    
    output.push(`**ERROR: Failed to create document from template**\n`);
    output.push(`**Tier:** ${tier}\n`);
    output.push(`**Document Type:** ${docType}\n`);
    output.push(`**Identifier:** ${identifier || 'none'}\n`);
    output.push(`**Template:** ${templatePath}\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push(`**Suggestion:** Ensure the template file exists at ${templatePath}\n`);
  }
  
  return output.join('\n');
}

