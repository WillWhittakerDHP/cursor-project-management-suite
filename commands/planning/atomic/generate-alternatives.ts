/**
 * Atomic Planning Command: /planning-generate-alternatives
 * Generate alternative strategies/approaches for planning
 * 
 * Wraps alternatives-generator.ts utilities and provides command interface.
 */

import { generateAlternatives, analyzeAlternatives } from '../../utils/alternatives-generator';
import { PlanningOutput, AlternativeType } from '../../utils/planning-types';

/**
 * Generate alternatives for planning output
 * 
 * @param planningOutput Structured planning data
 * @param alternativeType Type of alternatives to generate
 * @param count Number of alternatives to generate
 * @returns Formatted alternatives result
 */
export async function generateAlternativesCommand(
  planningOutput: PlanningOutput,
  alternativeType: AlternativeType = 'approach',
  count: number = 3
): Promise<string> {
  const result = generateAlternatives(planningOutput, alternativeType, count);
  
  return formatAlternativesResult(result);
}

/**
 * Format alternatives result as string output
 */
function formatAlternativesResult(result: import('../../../project-manager/utils/planning-types').AlternativesResult): string {
  const output: string[] = [];
  
  output.push('# Alternatives Generation Result\n');
  output.push(`**Status:** ${result.success ? '✅ Success' : '❌ Failed'}\n`);
  output.push('\n---\n');
  
  if (result.success && result.alternatives.length > 0) {
    output.push(`## Generated Alternatives (${result.alternatives.length})\n`);
    
    for (const alt of result.alternatives) {
      output.push(`### ${alt.title}\n`);
      output.push(`**Type:** ${alt.type}\n`);
      output.push(`**Description:** ${alt.description}\n`);
      
      if (alt.pros.length > 0) {
        output.push('\n**Pros:**\n');
        alt.pros.forEach(pro => {
          output.push(`- ✅ ${pro}\n`);
        });
      }
      
      if (alt.cons.length > 0) {
        output.push('\n**Cons:**\n');
        alt.cons.forEach(con => {
          output.push(`- ❌ ${con}\n`);
        });
      }
      
      if (alt.effort) {
        output.push(`\n**Effort:** ${alt.effort}\n`);
      }
      
      if (alt.risk) {
        output.push(`**Risk:** ${alt.risk}\n`);
      }
      
      if (alt.complexity) {
        output.push(`**Complexity:** ${alt.complexity}\n`);
      }
      
      if (alt.recommendedFor && alt.recommendedFor.length > 0) {
        output.push(`\n**Recommended For:** ${alt.recommendedFor.join(', ')}\n`);
      }
      
      if (alt.notRecommendedFor && alt.notRecommendedFor.length > 0) {
        output.push(`**Not Recommended For:** ${alt.notRecommendedFor.join(', ')}\n`);
      }
      
      output.push('\n---\n');
    }
    
    if (result.recommendations) {
      output.push('## Recommendations\n');
      if (result.recommendations.primary) {
        const primary = result.alternatives.find(a => a.id === result.recommendations!.primary);
        output.push(`**Primary Recommendation:** ${primary?.title || result.recommendations.primary}\n`);
      }
      if (result.recommendations.secondary) {
        const secondary = result.alternatives.find(a => a.id === result.recommendations!.secondary);
        output.push(`**Secondary Recommendation:** ${secondary?.title || result.recommendations.secondary}\n`);
      }
      if (result.recommendations.rationale) {
        output.push(`**Rationale:** ${result.recommendations.rationale}\n`);
      }
    }
  } else if (!result.success) {
    output.push('## Generation Failed\n');
    if (result.errors && result.errors.length > 0) {
      output.push('**Errors:**\n');
      result.errors.forEach(error => {
        output.push(`- ${error}\n`);
      });
    }
  } else {
    output.push('*No alternatives generated*\n');
  }
  
  return output.join('\n');
}

/**
 * Analyze and compare alternatives
 * 
 * @param alternatives Array of alternatives to analyze
 * @returns Formatted analysis result
 */
export async function analyzeAlternativesCommand(
  alternatives: import('../../../project-manager/utils/planning-types').Alternative[]
): Promise<string> {
  const analysis = analyzeAlternatives(alternatives);
  
  return formatAnalysisResult(analysis);
}

/**
 * Format analysis result as string output
 */
function formatAnalysisResult(analysis: import('../../../project-manager/utils/planning-types').AlternativeAnalysis): string {
  const output: string[] = [];
  
  output.push('# Alternatives Analysis\n');
  output.push('\n---\n');
  
  if (analysis.alternatives.length === 0) {
    output.push('*No alternatives to analyze*\n');
    return output.join('\n');
  }
  
  output.push('## Comparison Matrix\n');
  output.push('| Alternative | Effort | Risk | Complexity | Suitability |\n');
  output.push('|-------------|--------|------|------------|-------------|\n');
  
  for (const alt of analysis.alternatives) {
    const scores = analysis.comparison.scores[alt.id];
    const effort = scores?.effort || 0;
    const risk = scores?.risk || 0;
    const complexity = scores?.complexity || 0;
    const suitability = scores?.suitability || 0;
    
    output.push(`| ${alt.title} | ${effort} | ${risk} | ${complexity} | ${suitability} |\n`);
  }
  
  if (analysis.recommendation) {
    output.push('\n---\n');
    output.push('## Recommendation\n');
    const recommended = analysis.alternatives.find(a => a.id === analysis.recommendation!.alternativeId);
    output.push(`**Recommended:** ${recommended?.title || analysis.recommendation.alternativeId}\n`);
    output.push(`**Confidence:** ${analysis.recommendation.confidence}\n`);
    output.push(`**Rationale:** ${analysis.recommendation.rationale}\n`);
  }
  
  return output.join('\n');
}

