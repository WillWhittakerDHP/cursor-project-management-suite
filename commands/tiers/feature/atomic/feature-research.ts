/**
 * Atomic Command: /feature-research [name]
 * Conduct external documentation research (mandatory, includes question set)
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (presents research questions, guides research phase)
 */

import { readProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { join } from 'path';
import { access } from 'fs/promises';

export async function featureResearch(featureName: string): Promise<string> {
  const output: string[] = [];
  
  output.push(`# Feature ${featureName} Research Phase\n`);
  output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
  output.push(`**Status:** Research Phase Initiated\n\n`);
  
  output.push('## Research Phase Overview\n');
  output.push('Every feature **must** include a comprehensive research phase before implementation begins.\n');
  output.push('This ensures architectural decisions are well-informed, technology choices are appropriate,\n');
  output.push('risks are identified early, and scope is clearly defined.\n\n');
  
  output.push('---\n\n');
  
  // Load research question set
  try {
    const researchQuestionsPath = '.cursor/commands/docs/research-question-set.md';
    await access(join(PROJECT_ROOT, researchQuestionsPath));
    const researchQuestions = await readProjectFile(researchQuestionsPath);
    
    // Extract question categories
    const categories = [
      'Architecture & Design',
      'Scope & Phases',
      'External Research',
      'Risk & Mitigation',
      'Testing & Quality',
      'Documentation & Communication'
    ];
    
    output.push('## Research Questions (30+ Questions)\n\n');
    output.push('Answer these questions to complete the research phase:\n\n');
    
    for (const category of categories) {
      output.push(`### ${category}\n\n`);
      
      // Extract questions for this category
      const categoryRegex = new RegExp(`### \\d+\\. ${category.replace(/&/g, '&amp;')}.*?(?=###|$)`, 's');
      const categoryMatch = researchQuestions.match(categoryRegex);
      
      if (categoryMatch) {
        // Extract individual questions
        const questionRegex = /#### Q\d+\.\d+: (.+?)\n\n\*\*Guidance:\*\*\n(.+?)(?=\n####|$)/gs;
        const questions = categoryMatch[0].matchAll(questionRegex);
        
        for (const question of questions) {
          output.push(`**${question[1]}**\n`);
          output.push(`${question[2]}\n\n`);
        }
      }
      
      output.push('\n');
    }
    
  } catch (_error) {
    output.push('**ERROR:** Could not load research question set\n');
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('**Suggestion:** See `.cursor/commands/docs/research-question-set.md` for complete question set\n');
  }
  
  output.push('---\n\n');
  output.push('## Research Documentation\n\n');
  output.push('Document your research findings using:\n');
  output.push('- Research Question Template: `.cursor/commands/tiers/feature/templates/research-question-template.md`\n');
  output.push('- Feature Guide: Update research section in feature guide\n');
  output.push('- Feature Log: Add research phase entry\n\n');
  
  output.push('## Next Steps\n\n');
  output.push('1. Answer all research questions\n');
  output.push('2. Document findings in feature guide\n');
  output.push('3. Update feature log with research phase entry\n');
  output.push('4. Run `/feature-load [name]` to review research\n');
  output.push('5. Run `/feature-start [name]` to begin feature work\n');
  
  return output.join('\n');
}

