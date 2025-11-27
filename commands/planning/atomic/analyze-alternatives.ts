/**
 * Atomic Planning Command: /planning-analyze-alternatives
 * Compare and analyze alternatives side-by-side
 * 
 * Wraps alternatives-generator.ts analyzeAlternatives function.
 */

import { analyzeAlternatives } from '../../utils/alternatives-generator';
import { Alternative } from '../../utils/planning-types';

/**
 * Analyze and compare alternatives
 * 
 * @param alternatives Array of alternatives to analyze
 * @returns Formatted analysis result
 */
export async function analyzeAlternativesCommand(alternatives: Alternative[]): Promise<string> {
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
  
  output.push('\n---\n');
  output.push('## Detailed Comparison\n');
  
  for (const alt of analysis.alternatives) {
    output.push(`### ${alt.title}\n`);
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
    
    const scores = analysis.comparison.scores[alt.id];
    if (scores) {
      output.push('\n**Scores:**\n');
      output.push(`- Effort: ${scores.effort}/3\n`);
      output.push(`- Risk: ${scores.risk}/3\n`);
      output.push(`- Complexity: ${scores.complexity}/3\n`);
      output.push(`- Suitability: ${scores.suitability.toFixed(1)}\n`);
    }
    
    output.push('\n---\n');
  }
  
  return output.join('\n');
}

