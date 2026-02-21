/**
 * Atomic Planning Command: /planning-apply-template
 * Apply planning templates based on tier and type
 * 
 * Supports architecture, technology, pattern, and risk templates.
 */

import { PlanningTemplateType, TemplateApplicationResult, PlanningOutput } from '../../utils/planning-types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';
import { readFile } from 'fs/promises';

/**
 * Apply a planning template
 * 
 * @param templateType Type of template to apply
 * @param planningOutput Planning data to populate template
 * @param feature Feature name (optional; resolved from .current-feature or git branch)
 * @returns Template application result
 */
export async function applyTemplate(
  templateType: PlanningTemplateType,
  planningOutput: PlanningOutput,
  feature?: string
): Promise<TemplateApplicationResult> {
  try {
    const resolvedFeature = await resolveFeatureName(feature);
    const context = new WorkflowCommandContext(resolvedFeature);
    const templatePath = context.paths.getTemplatePath('planning', templateType);
    
    // Try to load template
    let templateContent: string;
    try {
      templateContent = await readFile(templatePath, 'utf-8');
    } catch (err) {
      console.warn('Apply template: template file not found, using default', templatePath, err);
      templateContent = generateDefaultTemplate(templateType);
    }
    
    // Render template with planning data
    const rendered = renderTemplate(templateContent, planningOutput, templateType);
    
    return {
      success: true,
      content: rendered,
      appliedTemplate: templateType,
    };
  } catch (error) {
    return {
      success: false,
      content: '',
      appliedTemplate: templateType,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}

/**
 * Render template with planning data
 */
function renderTemplate(
  template: string,
  planningOutput: PlanningOutput,
  templateType: PlanningTemplateType
): string {
  let rendered = template;
  
  // Replace common placeholders
  rendered = rendered.replace(/\{\{OBJECTIVES\}\}/g, planningOutput.objectives.join('\n- '));
  rendered = rendered.replace(/\{\{SCOPE\}\}/g, planningOutput.scope);
  rendered = rendered.replace(/\{\{DEPENDENCIES\}\}/g, planningOutput.dependencies.join('\n- '));
  rendered = rendered.replace(/\{\{RISKS\}\}/g, planningOutput.risks.join('\n- '));
  rendered = rendered.replace(/\{\{CONSTRAINTS\}\}/g, planningOutput.constraints.join('\n- '));
  rendered = rendered.replace(/\{\{PRIORITY\}\}/g, planningOutput.priority || 'medium');
  rendered = rendered.replace(/\{\{EFFORT\}\}/g, planningOutput.estimatedEffort || 'TBD');
  
  // Template-specific rendering
  switch (templateType) {
    case 'architecture':
      rendered = renderArchitectureTemplate(rendered, planningOutput);
      break;
    case 'technology':
      rendered = renderTechnologyTemplate(rendered, planningOutput);
      break;
    case 'pattern':
      rendered = renderPatternTemplate(rendered, planningOutput);
      break;
    case 'risk':
      rendered = renderRiskTemplate(rendered, planningOutput);
      break;
  }
  
  return rendered;
}

/**
 * Render architecture template
 */
function renderArchitectureTemplate(template: string, _planningOutput: PlanningOutput): string {
  // Add architecture-specific sections if not present
  if (!template.includes('## Alternatives')) {
    template += '\n\n## Alternatives\n\n[To be filled during alternatives generation]\n';
  }
  if (!template.includes('## Decision Rationale')) {
    template += '\n\n## Decision Rationale\n\n[To be filled when decision is made]\n';
  }
  return template;
}

/**
 * Render technology template
 */
function renderTechnologyTemplate(template: string, _planningOutput: PlanningOutput): string {
  // Add technology-specific sections if not present
  if (!template.includes('## Technology Comparison')) {
    template += '\n\n## Technology Comparison\n\n[To be filled during alternatives generation]\n';
  }
  if (!template.includes('## Migration Considerations')) {
    template += '\n\n## Migration Considerations\n\n[To be filled]\n';
  }
  return template;
}

/**
 * Render pattern template
 */
function renderPatternTemplate(template: string, _planningOutput: PlanningOutput): string {
  // Add pattern-specific sections if not present
  if (!template.includes('## Pattern Comparison')) {
    template += '\n\n## Pattern Comparison\n\n[To be filled during alternatives generation]\n';
  }
  if (!template.includes('## Trade-offs')) {
    template += '\n\n## Trade-offs\n\n[To be filled]\n';
  }
  return template;
}

/**
 * Render risk template
 */
function renderRiskTemplate(template: string, _planningOutput: PlanningOutput): string {
  // Add risk-specific sections if not present
  if (!template.includes('## Risk Analysis')) {
    template += '\n\n## Risk Analysis\n\n[To be filled]\n';
  }
  if (!template.includes('## Mitigation Strategies')) {
    template += '\n\n## Mitigation Strategies\n\n[To be filled]\n';
  }
  return template;
}

/**
 * Generate default template structure if template file doesn't exist
 */
function generateDefaultTemplate(templateType: PlanningTemplateType): string {
  const baseTemplate = `# Planning: ${templateType}

**Date:** {{DATE}}
**Tier:** {{TIER}}

## Objectives

- {{OBJECTIVES}}

## Scope

{{SCOPE}}

## Dependencies

- {{DEPENDENCIES}}

## Risks

- {{RISKS}}

## Constraints

- {{CONSTRAINTS}}

## Priority

{{PRIORITY}}

## Estimated Effort

{{EFFORT}}
`;

  switch (templateType) {
    case 'architecture':
      return baseTemplate + '\n## Alternatives\n\n[To be filled]\n\n## Decision Rationale\n\n[To be filled]\n';
    case 'technology':
      return baseTemplate + '\n## Technology Comparison\n\n[To be filled]\n\n## Migration Considerations\n\n[To be filled]\n';
    case 'pattern':
      return baseTemplate + '\n## Pattern Comparison\n\n[To be filled]\n\n## Trade-offs\n\n[To be filled]\n';
    case 'risk':
      return baseTemplate + '\n## Risk Analysis\n\n[To be filled]\n\n## Mitigation Strategies\n\n[To be filled]\n';
    default:
      return baseTemplate;
  }
}

