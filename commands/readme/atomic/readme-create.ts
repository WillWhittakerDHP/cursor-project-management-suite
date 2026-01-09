/**
 * Atomic Command: /readme-create [filePath] [type] [title] [purpose]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Create a new README file with appropriate template based on type
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';
import { PROJECT_ROOT } from '../../utils/utils';
import { ReadmeCreateParams, ReadmeType } from '../types';

/**
 * Create README file with template
 * 
 * @param params Create parameters
 * @returns Success message
 */
export async function createReadme(params: ReadmeCreateParams): Promise<string> {
  try {
    const fullPath = join(PROJECT_ROOT, params.filePath);
    
    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });
    
    // Load appropriate template
    const templatePath = getTemplatePath(params.type);
    const template = await readFile(templatePath, 'utf-8');
    
    // Replace template placeholders
    let content = template
      .replace(/\[Module Name\]/g, params.title)
      .replace(/\[One sentence purpose\]/g, params.purpose)
      .replace(/\[2-3 sentence overview\]/g, params.overview || `${params.purpose} This module provides commands for managing ${params.title.toLowerCase()}.`);
    
    // Add temporary metadata if type is temporary
    if (params.type === 'temporary' && params.temporaryOptions) {
      const metadataLines: string[] = [];
      metadataLines.push(`<!-- TEMPORARY: ${params.temporaryOptions.reason} -->`);
      if (params.temporaryOptions.expiryDate) {
        metadataLines.push(`<!-- EXPIRY: ${params.temporaryOptions.expiryDate} -->`);
      }
      if (params.temporaryOptions.consolidateInto) {
        metadataLines.push(`<!-- CONSOLIDATE_INTO: ${params.temporaryOptions.consolidateInto} -->`);
      }
      metadataLines.push('');
      
      // Insert metadata at the beginning
      const lines = content.split('\n');
      const titleIndex = lines.findIndex(line => line.trim().startsWith('#'));
      if (titleIndex >= 0) {
        lines.splice(titleIndex + 1, 0, ...metadataLines);
      } else {
        lines.unshift(...metadataLines);
      }
      content = lines.join('\n');
    }
    
    // Write file
    await writeFile(fullPath, content, 'utf-8');
    
    return `✅ Created README: ${params.filePath}\n` +
           `   Type: ${params.type}\n` +
           `   Title: ${params.title}`;
  } catch (error) {
    throw new Error(
      `Failed to create README: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get template path for README type
 */
function getTemplatePath(type: ReadmeType): string {
  const templateMap: Record<ReadmeType, string> = {
    'module': join(PROJECT_ROOT, '.cursor/commands/readme/templates/module-readme.md'),
    'guide': join(PROJECT_ROOT, '.cursor/commands/readme/templates/guide.md'),
    'quick-reference': join(PROJECT_ROOT, '.cursor/commands/readme/templates/quick-reference.md'),
    'temporary': join(PROJECT_ROOT, '.cursor/commands/readme/templates/temporary-status.md'),
  };
  
  return templateMap[type];
}

