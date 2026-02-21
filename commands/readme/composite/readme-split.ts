/**
 * Composite Command: /readme-split [filePath] [sections...]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Split large README by extracting sections into GUIDE.md
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { ReadmeSplitParams } from '../types';

/**
 * Split large README
 * 
 * @param params Split parameters
 * @returns Success message
 */
export async function splitReadme(params: ReadmeSplitParams): Promise<string> {
  try {
    const fullPath = join(PROJECT_ROOT, params.filePath);
    const content = await readFile(fullPath, 'utf-8');
    const dir = dirname(fullPath);
    const guidePath = join(dir, 'GUIDE.md');
    
    // Extract sections to guide
    const guideSections: string[] = [];
    const remainingContent: string[] = [];
    const lines = content.split('\n');
    
    let inExtractedSection = false;
    let currentSection: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if this is a section to extract
      const isExtractSection = params.sections.some(section => {
        const sectionMatch = line.match(/^##+\s+(.+)$/);
        return sectionMatch && sectionMatch[1].includes(section);
      });
      
      if (isExtractSection) {
        // Start extracting section
        inExtractedSection = true;
        currentSection = [line];
      } else if (inExtractedSection) {
        // Check if we've hit a sibling or parent section
        if (line.trim().startsWith('##')) {
          const lineDepth = line.match(/^#+/)?.[0].length || 0;
          const sectionDepth = currentSection[0].match(/^#+/)?.[0].length || 0;
          
          if (lineDepth <= sectionDepth) {
            // End of extracted section
            guideSections.push(...currentSection);
            guideSections.push('');
            currentSection = [];
            inExtractedSection = false;
            
            // Add link to guide in remaining content if requested
            if (params.keepLinks !== false) {
              const sectionTitle = currentSection[0]?.replace(/^##+\s+/, '') || 'Section';
              remainingContent.push(`See [GUIDE.md](./GUIDE.md#${sectionTitle.toLowerCase().replace(/\s+/g, '-')}) for details.`);
              remainingContent.push('');
            }
            
            remainingContent.push(line);
          } else {
            // Subsection, continue extracting
            currentSection.push(line);
          }
        } else {
          // Content line, continue extracting
          currentSection.push(line);
        }
      } else {
        // Keep in README
        remainingContent.push(line);
      }
    }
    
    // Save any remaining extracted section
    if (currentSection.length > 0) {
      guideSections.push(...currentSection);
    }
    
    // Write GUIDE.md
    if (guideSections.length > 0) {
      const guideContent = [
        '# Guide',
        '',
        'This guide contains detailed documentation extracted from README.md.',
        '',
        ...guideSections,
      ].join('\n');
      
      await writeFile(guidePath, guideContent, 'utf-8');
    }
    
    // Update README.md
    const updatedReadme = remainingContent.join('\n');
    
    // Add link to guide at top if not present
    if (!updatedReadme.includes('GUIDE.md')) {
      const readmeLines = updatedReadme.split('\n');
      const overviewIndex = readmeLines.findIndex(line => 
        line.toLowerCase().includes('overview')
      );
      if (overviewIndex >= 0) {
        readmeLines.splice(overviewIndex + 2, 0, '', 'See [GUIDE.md](./GUIDE.md) for detailed documentation.', '');
      }
      await writeFile(fullPath, readmeLines.join('\n'), 'utf-8');
    } else {
      await writeFile(fullPath, updatedReadme, 'utf-8');
    }
    
    return `✅ Split README: ${params.filePath}\n` +
           `   Extracted sections: ${params.sections.join(', ')}\n` +
           `   Created: ${guidePath}`;
  } catch (_error) {
    throw new Error(
      `Failed to split README: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

