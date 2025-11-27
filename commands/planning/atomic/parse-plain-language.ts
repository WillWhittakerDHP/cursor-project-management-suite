/**
 * Atomic Planning Command: /planning-parse-plain-language
 * Parse natural language input into structured planning data
 * 
 * Wraps planning-parser.ts utilities and provides command interface.
 */

import { parseNaturalLanguage } from '../../utils/planning-parser';
import { PlanningInput, ParsingResult } from '../../utils/planning-types';

/**
 * Parse plain language into structured planning
 * 
 * @param description Natural language description
 * @param tier Planning tier (feature/phase/session/task)
 * @param feature Feature name context
 * @param phase Phase number context (optional)
 * @param sessionId Session ID context (optional)
 * @param taskId Task ID context (optional)
 * @returns Formatted parsing result
 */
export async function parsePlainLanguage(
  description: string,
  tier: PlanningInput['tier'],
  feature?: string,
  phase?: number,
  sessionId?: string,
  taskId?: string
): Promise<string> {
  const input: PlanningInput = {
    description,
    tier,
    feature,
    phase,
    sessionId,
    taskId,
  };
  
  const result = parseNaturalLanguage(input);
  
  return formatParsingResult(result);
}

/**
 * Format parsing result as string output
 */
function formatParsingResult(result: ParsingResult): string {
  const output: string[] = [];
  
  output.push('# Plain Language Parsing Result\n');
  output.push(`**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n`);
  output.push('\n---\n');
  
  if (result.success && result.output) {
    output.push('## Parsed Planning Data\n');
    output.push('### Objectives\n');
    if (result.output.objectives.length > 0) {
      result.output.objectives.forEach((obj, i) => {
        output.push(`${i + 1}. ${obj}\n`);
      });
    } else {
      output.push('*No objectives extracted*\n');
    }
    
    output.push('\n### Scope\n');
    output.push(result.output.scope || '*No scope extracted*\n');
    
    if (result.output.dependencies.length > 0) {
      output.push('\n### Dependencies\n');
      result.output.dependencies.forEach(dep => {
        output.push(`- ${dep}\n`);
      });
    }
    
    if (result.output.risks.length > 0) {
      output.push('\n### Risks\n');
      result.output.risks.forEach(risk => {
        output.push(`- ${risk}\n`);
      });
    }
    
    if (result.output.constraints.length > 0) {
      output.push('\n### Constraints\n');
      result.output.constraints.forEach(constraint => {
        output.push(`- ${constraint}\n`);
      });
    }
    
    if (result.output.priority) {
      output.push(`\n### Priority: ${result.output.priority}\n`);
    }
    
    if (result.output.estimatedEffort) {
      output.push(`\n### Estimated Effort: ${result.output.estimatedEffort}\n`);
    }
    
    if (result.output.tags && result.output.tags.length > 0) {
      output.push('\n### Tags\n');
      result.output.tags.forEach(tag => {
        output.push(`- ${tag}\n`);
      });
    }
  }
  
  if (result.errors && result.errors.length > 0) {
    output.push('\n---\n');
    output.push('## Parsing Errors\n');
    result.errors.forEach(error => {
      output.push(`### ${error.type}${error.field ? ` (${error.field})` : ''}\n`);
      output.push(`**Message:** ${error.message}\n`);
      if (error.value !== undefined) {
        output.push(`**Value:** ${JSON.stringify(error.value)}\n`);
      }
      output.push('\n');
    });
  }
  
  if (result.suggestions && result.suggestions.length > 0) {
    output.push('\n---\n');
    output.push('## Suggestions\n');
    result.suggestions.forEach(suggestion => {
      output.push(`- ${suggestion}\n`);
    });
  }
  
  return output.join('\n');
}

