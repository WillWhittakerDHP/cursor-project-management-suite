/**
 * Atomic Command: Audit Documentation
 * Validates JSDoc comments, IMPORTANT notes, and documentation consistency
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { PROJECT_ROOT } from '../../utils/utils';
import { AuditResult, AuditIssue } from './audit-types';

/**
 * Recursively get all TypeScript files
 */
async function getAllTsFiles(dir: string, fileList: string[] = []): Promise<string[]> {
  const files = await readdir(dir, { withFileTypes: true });
  
  for (const file of files) {
    const filePath = join(dir, file.name);
    if (file.isDirectory() && !file.name.includes('node_modules') && !file.name.includes('.git')) {
      await getAllTsFiles(filePath, fileList);
    } else if (file.isFile() && file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

/**
 * Check documentation quality
 */
export async function auditDocumentation(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  const commandsDir = join(PROJECT_ROOT, '.cursor/commands');
  const allFiles = await getAllTsFiles(commandsDir);
  
  // Files that should have specific documentation
  const compositeCommandFiles = allFiles.filter(f => 
    f.includes('/composite/') || 
    f.includes('/tiers/') && !f.includes('/atomic/')
  );
  
  for (const file of compositeCommandFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');
      
      // Check for JSDoc comment at the top
      const hasJSDoc = content.includes('/**') && content.includes('* Composite Command:');
      if (!hasJSDoc) {
        issues.push({
          severity: 'warning',
          message: 'Missing JSDoc comment with command description',
          file: file,
          suggestion: 'Add JSDoc comment at the top: /**\n * Composite Command: /command-name\n * Description\n */',
        });
      } else {
        // Check JSDoc quality
        const jsdocMatch = content.match(/\/\*\*([^*]|(\*(?!\/)))*\*\//s);
        if (jsdocMatch) {
          const jsdoc = jsdocMatch[0];
          
          // Check for tier information
          if (!jsdoc.includes('Tier:') && !jsdoc.includes('tier:')) {
            issues.push({
              severity: 'info',
              message: 'JSDoc missing tier information',
              file: file,
              suggestion: 'Add "Tier: [tier name]" to JSDoc',
            });
          }
          
          // Check for operates-on information
          if (!jsdoc.includes('Operates on:') && !jsdoc.includes('operates on:')) {
            issues.push({
              severity: 'info',
              message: 'JSDoc missing "Operates on" information',
              file: file,
              suggestion: 'Add "Operates on: [description]" to JSDoc',
            });
          }
        }
      }
      
      // Check for IMPORTANT notes for Ask Mode vs Agent Mode
      const isPlanningCommand = content.includes('plan-') || 
                                content.includes('Plan') ||
                                content.includes('start') ||
                                content.includes('change');
      
      if (isPlanningCommand) {
        const hasImportantNote = content.includes('IMPORTANT') && 
                                 (content.includes('Ask Mode') || content.includes('Agent Mode'));
        
        if (!hasImportantNote) {
          issues.push({
            severity: 'warning',
            message: 'Missing IMPORTANT note about Ask Mode vs Agent Mode',
            file: file,
            suggestion: 'Add IMPORTANT note clarifying when command should be used (Ask Mode for planning, Agent Mode for implementation)',
          });
        }
      }
      
      // Check for prompt format documentation (for end commands)
      if (content.includes('end') || content.includes('End') || content.includes('complete') || content.includes('Complete')) {
        const hasPromptDoc = content.includes('Prompt Before Execution') || 
                            content.includes('prompt format');
        
        if (!hasPromptDoc) {
          issues.push({
            severity: 'info',
            message: 'End command missing prompt format documentation',
            file: file,
            suggestion: 'Add documentation about prompting user before execution',
          });
        }
      }
      
      // Check for composition documentation
      if (content.includes('Composite Command')) {
        const hasComposition = content.includes('Composition:') || 
                              content.includes('combines') ||
                              content.includes('delegates');
        
        if (!hasComposition) {
          issues.push({
            severity: 'info',
            message: 'Composite command missing composition documentation',
            file: file,
            suggestion: 'Document which atomic commands this composite command uses',
          });
        }
      }
      
    } catch (error) {
      issues.push({
        severity: 'error',
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        file: file,
      });
    }
  }
  
  // Check README files for command documentation
  const readmeFiles = [
    join(PROJECT_ROOT, '.cursor/commands/README.md'),
    join(PROJECT_ROOT, '.cursor/commands/USAGE.md'),
  ];
  
  for (const readmeFile of readmeFiles) {
    try {
      const content = await readFile(readmeFile, 'utf-8');
      
      // Check if it documents the main commands
      const hasCommandList = content.includes('## Commands') || 
                            content.includes('## Command Reference') ||
                            content.includes('### Commands');
      
      if (!hasCommandList) {
        issues.push({
          severity: 'info',
          message: 'README missing command list section',
          file: readmeFile,
          suggestion: 'Add a Commands section listing available commands',
        });
      }
      
    } catch (error) {
      // README might not exist, that's okay
    }
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

  return {
    check: 'Documentation',
    status,
    issues,
    recommendations,
    summary: `Found ${issues.length} documentation issues`,
  };
}

