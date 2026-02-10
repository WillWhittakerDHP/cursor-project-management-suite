/**
 * Composite Command: /readme-consolidate [sources...] [target]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Consolidate multiple READMEs into single focused README, removing duplicates
 */

import { readFile, writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { ReadmeConsolidateParams } from '../types';

/**
 * Consolidate multiple READMEs
 * 
 * @param params Consolidation parameters
 * @returns Success message
 */
export async function consolidateReadmes(params: ReadmeConsolidateParams): Promise<string> {
  try {
    const targetPath = join(PROJECT_ROOT, params.target);
    
    // Read all source files
    const sourceContents: Array<{ path: string; content: string }> = [];
    for (const source of params.sources) {
      const sourcePath = join(PROJECT_ROOT, source);
      const content = await readFile(sourcePath, 'utf-8');
      sourceContents.push({ path: source, content });
    }
    
    // Read target if exists, otherwise start fresh
    let targetContent = '';
    try {
      targetContent = await readFile(targetPath, 'utf-8');
    } catch {
      // Target doesn't exist, will create new
    }
    
    // Extract unique sections from sources
    const consolidatedSections = new Map<string, string>();
    
    // Extract sections from each source
    for (const { content } of sourceContents) {
      const lines = content.split('\n');
      let currentSection = '';
      let currentContent: string[] = [];
      
      for (const line of lines) {
        if (line.trim().startsWith('##')) {
          // Save previous section
          if (currentSection && currentContent.length > 0) {
            const existing = consolidatedSections.get(currentSection);
            if (!existing || existing.length < currentContent.join('\n').length) {
              consolidatedSections.set(currentSection, currentContent.join('\n'));
            }
          }
          
          // Start new section
          currentSection = line.replace(/^##+\s*/, '').trim();
          currentContent = [line];
        } else if (currentSection) {
          currentContent.push(line);
        }
      }
      
      // Save last section
      if (currentSection && currentContent.length > 0) {
        const existing = consolidatedSections.get(currentSection);
        if (!existing || existing.length < currentContent.join('\n').length) {
          consolidatedSections.set(currentSection, currentContent.join('\n'));
        }
      }
    }
    
    // Build consolidated content
    const consolidatedLines: string[] = [];
    
    // Preserve target's title and metadata if exists
    if (targetContent) {
      const targetLines = targetContent.split('\n');
      const titleIndex = targetLines.findIndex(line => line.trim().startsWith('#') && !line.trim().startsWith('##'));
      if (titleIndex >= 0) {
        consolidatedLines.push(targetLines[titleIndex]);
        // Add metadata if exists
        for (let i = titleIndex + 1; i < targetLines.length; i++) {
          if (targetLines[i].trim().startsWith('<!--')) {
            consolidatedLines.push(targetLines[i]);
          } else if (targetLines[i].trim().startsWith('##')) {
            break;
          } else if (targetLines[i].trim()) {
            consolidatedLines.push(targetLines[i]);
          }
        }
      }
    } else {
      // Use title from first source
      const firstSource = sourceContents[0];
      const firstLines = firstSource.content.split('\n');
      const titleIndex = firstLines.findIndex(line => line.trim().startsWith('#') && !line.trim().startsWith('##'));
      if (titleIndex >= 0) {
        consolidatedLines.push(firstLines[titleIndex]);
      }
    }
    
    consolidatedLines.push('');
    
    // Add consolidated sections
    for (const [section, content] of consolidatedSections.entries()) {
      consolidatedLines.push(content);
      consolidatedLines.push('');
    }
    
    const consolidatedContent = consolidatedLines.join('\n');
    
    // Write consolidated content
    await writeFile(targetPath, consolidatedContent, 'utf-8');
    
    // Remove source files if requested
    if (params.removeSources) {
      for (const source of params.sources) {
        const sourcePath = join(PROJECT_ROOT, source);
        await unlink(sourcePath);
      }
    }
    
    return `✅ Consolidated ${params.sources.length} README(s) into ${params.target}\n` +
           `   Sources: ${params.sources.join(', ')}\n` +
           (params.removeSources ? `   Removed source files` : '');
  } catch (error) {
    throw new Error(
      `Failed to consolidate READMEs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

