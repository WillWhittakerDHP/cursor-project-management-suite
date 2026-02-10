/**
 * Atomic Command: /validate-completeness [tier] [identifier]
 * Verify required docs/entries exist
 * 
 * Tier: Cross-tier utility
 * Operates on: Completeness verification
 */

import { WorkflowCommandContext } from '../../utils/command-context';
import { WorkflowId } from '../../utils/id-utils';
import { getAllTodos } from '../../utils/todo-io';
import { ValidationTier } from './validate-workflow';
import { access } from 'fs/promises';
import { join } from 'path';

export interface VerifyCompletenessParams {
  tier: ValidationTier;
  identifier?: string;
  featureName?: string;
}

export interface CompletenessResult {
  complete: boolean;
  missingDocuments: string[];
  missingSections: string[];
  missingTodos: string[];
}

/**
 * Verify completeness
 * 
 * @param params Verify completeness parameters
 * @returns Formatted completeness output
 */
export async function verifyCompleteness(params: VerifyCompletenessParams): Promise<string> {
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  const output: string[] = [];
  
  output.push(`# Verify Completeness: ${params.tier}${params.identifier ? ` ${params.identifier}` : ''}\n`);
  output.push('---\n\n');
  
  // Validate identifier
  if ((params.tier === 'phase' || params.tier === 'session' || params.tier === 'task') && !params.identifier) {
    return 'Error: Identifier is required for phase/session/task completeness verification';
  }
  
  const result: CompletenessResult = {
    complete: true,
    missingDocuments: [],
    missingSections: [],
    missingTodos: []
  };
  
  try {
    const feature = context.feature.name;
    const PROJECT_ROOT = process.cwd();
    
    // Check documents exist
    const documents = ['guide', 'log', 'handoff'];
    for (const docType of documents) {
      try {
        let docPath: string;
        if (params.tier === 'feature') {
          docPath = docType === 'guide' ? context.paths.getFeatureGuidePath() :
                   docType === 'log' ? context.paths.getFeatureLogPath() :
                   context.paths.getFeatureHandoffPath();
        } else if (params.tier === 'phase') {
          docPath = docType === 'guide' ? context.paths.getPhaseGuidePath(params.identifier!) :
                   docType === 'log' ? context.paths.getPhaseLogPath(params.identifier!) :
                   context.paths.getPhaseHandoffPath(params.identifier!);
        } else {
          docPath = docType === 'guide' ? context.paths.getSessionGuidePath(params.identifier!) :
                   docType === 'log' ? context.paths.getSessionLogPath(params.identifier!) :
                   context.paths.getSessionHandoffPath(params.identifier!);
        }
        
        await access(join(PROJECT_ROOT, docPath));
      } catch {
        result.missingDocuments.push(`${docType}`);
        result.complete = false;
      }
    }
    
    // Check required sections in handoff
    try {
      let handoffContent = '';
      try {
        if (params.tier === 'feature') {
          handoffContent = await context.readFeatureHandoff();
        } else if (params.tier === 'phase') {
          handoffContent = await context.readPhaseHandoff(params.identifier!);
        } else {
          handoffContent = await context.readSessionHandoff(params.identifier!);
        }
      } catch {
        // Handoff doesn't exist, already in missingDocuments
      }
      
      if (handoffContent) {
        const requiredSections = ['Current Status', 'Next Action', 'Transition Context'];
        const { MarkdownUtils } = await import('../../utils/markdown-utils');
        
        for (const section of requiredSections) {
          const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
          if (!sectionContent || sectionContent.trim().length === 0) {
            result.missingSections.push(section);
            result.complete = false;
          }
        }
      }
    } catch {}
    
    // Check todo exists
    const allTodos = await getAllTodos(feature);
    let todoId: string;
    
    switch (params.tier) {
      case 'feature':
        todoId = `feature-${featureName}`;
        break;
      case 'phase':
        todoId = `phase-${params.identifier}`;
        break;
      case 'session':
        todoId = `session-${params.identifier}`;
        break;
      case 'task':
        todoId = `task-${params.identifier}`;
        break;
    }
    
    const todo = allTodos.find(t => t.id === todoId);
    if (!todo) {
      result.missingTodos.push(todoId);
      result.complete = false;
    }
    
    // Output results
    if (result.complete) {
      output.push('✅ **Completeness verified**\n\n');
      output.push('All required documents, sections, and todos are present.\n');
    } else {
      output.push('❌ **Completeness check failed**\n\n');
      
      if (result.missingDocuments.length > 0) {
        output.push('## Missing Documents\n\n');
        for (const doc of result.missingDocuments) {
          output.push(`- ❌ ${doc}\n`);
        }
        output.push('\n');
      }
      
      if (result.missingSections.length > 0) {
        output.push('## Missing Sections\n\n');
        for (const section of result.missingSections) {
          output.push(`- ❌ ${section}\n`);
        }
        output.push('\n');
      }
      
      if (result.missingTodos.length > 0) {
        output.push('## Missing Todos\n\n');
        for (const todo of result.missingTodos) {
          output.push(`- ❌ ${todo}\n`);
        }
        output.push('\n');
      }
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to verify completeness**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

