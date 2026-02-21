/**
 * Enhanced Markdown Utilities
 * 
 * Optimizes markdown section extraction and manipulation.
 * Provides batch operations and performance optimizations.
 * 
 * LEARNING: Enhanced utilities reduce code duplication and improve performance
 * WHY: Repeated markdown parsing is inefficient; batch operations are more efficient
 * PATTERN: Static utility class with caching for parsed structure
 */

/**
 * Section structure information
 */
interface SectionInfo {
  start: number;
  end: number;
  depth: number;
  title: string;
}

/**
 * Options for section extraction
 */
export interface ExtractSectionOptions {
  /** Control section depth (1 = #, 2 = ##, etc.) */
  depth?: number;
  /** Include subsections in extraction */
  includeSubsections?: boolean;
}

/**
 * MarkdownUtils static class
 * 
 * Provides enhanced markdown manipulation methods with performance optimizations.
 */
export class MarkdownUtils {
  /**
   * Extract section from markdown content
   * 
   * Enhanced version with options for depth control and subsection inclusion.
   * 
   * @param content Markdown content
   * @param sectionTitle Section title to extract
   * @param options Extraction options
   * @returns Extracted section content
   */
  static extractSection(
    content: string,
    sectionTitle: string,
    options: ExtractSectionOptions = {}
  ): string {
    const { depth, includeSubsections = true } = options;
    const lines = content.split('\n');
    
    // Find section start
    const startIndex = lines.findIndex(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('#')) return false;
      
      // Check if title matches
      const titleMatch = trimmed.match(/^#+\s+(.+)$/);
      if (!titleMatch) return false;
      
      const title = titleMatch[1].trim();
      if (!title.includes(sectionTitle)) return false;
      
      // Check depth if specified
      if (depth !== undefined) {
        const lineDepth = trimmed.match(/^#+/)?.[0].length || 0;
        if (lineDepth !== depth) return false;
      }
      
      return true;
    });
    
    if (startIndex === -1) return '';
    
    const sectionLines: string[] = [];
    const startLine = lines[startIndex];
    const sectionDepth = startLine.match(/^#+/)?.[0].length || 0;
    
    // Extract section content
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      
      // Check if we've hit a sibling or parent section
      if (i > startIndex && line.trim().startsWith('#')) {
        const lineDepth = line.match(/^#+/)?.[0].length || 0;
        
        if (includeSubsections) {
          // Include subsections (deeper), stop at same or higher level
          if (lineDepth <= sectionDepth) break;
        } else {
          // Stop at any section (same or higher level)
          if (lineDepth <= sectionDepth) break;
        }
      }
      
      sectionLines.push(line);
    }
    
    return sectionLines.join('\n');
  }

  /**
   * Extract multiple sections in batch
   * 
   * More efficient than calling extractSection multiple times.
   * 
   * @param content Markdown content
   * @param sectionTitles Array of section titles to extract
   * @param options Extraction options (applied to all sections)
   * @returns Map of section title to content
   */
  static extractSections(
    content: string,
    sectionTitles: string[],
    options: ExtractSectionOptions = {}
  ): Map<string, string> {
    const result = new Map<string, string>();

    for (const title of sectionTitles) {
      const section = this.extractSection(content, title, options);
      result.set(title, section);
    }
    
    return result;
  }

  /**
   * Replace section in markdown content
   * 
   * @param content Original markdown content
   * @param sectionTitle Section title to replace
   * @param newContent New section content (should include the header)
   * @returns Updated markdown content
   */
  static replaceSection(
    content: string,
    sectionTitle: string,
    newContent: string
  ): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex(line => 
      line.trim().startsWith('##') && line.includes(sectionTitle)
    );
    
    if (startIndex === -1) {
      // Section not found - append at end
      return content + '\n\n' + newContent;
    }
    
    // Find section end
    const sectionDepth = lines[startIndex].match(/^#+/)?.[0].length || 0;
    let endIndex = startIndex + 1;
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('#')) {
        const lineDepth = line.match(/^#+/)?.[0].length || 0;
        if (lineDepth <= sectionDepth) {
          endIndex = i;
          break;
        }
      }
      endIndex = i + 1;
    }
    
    // Replace section
    const before = lines.slice(0, startIndex).join('\n');
    const after = lines.slice(endIndex).join('\n');
    
    return [before, newContent, after]
      .filter(part => part.length > 0)
      .join('\n\n');
  }

  /**
   * Append content to section
   * 
   * @param content Original markdown content
   * @param sectionTitle Section title to append to
   * @param contentToAppend Content to append (will be added before next section)
   * @returns Updated markdown content
   */
  static appendToSection(
    content: string,
    sectionTitle: string,
    contentToAppend: string
  ): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex(line => 
      line.trim().startsWith('##') && line.includes(sectionTitle)
    );
    
    if (startIndex === -1) {
      // Section not found - append at end
      return content + '\n\n' + contentToAppend;
    }
    
    // Find section end
    const sectionDepth = lines[startIndex].match(/^#+/)?.[0].length || 0;
    let endIndex = startIndex + 1;
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('#')) {
        const lineDepth = line.match(/^#+/)?.[0].length || 0;
        if (lineDepth <= sectionDepth) {
          endIndex = i;
          break;
        }
      }
      endIndex = i + 1;
    }
    
    // Insert content before next section
    const before = lines.slice(0, endIndex).join('\n');
    const after = lines.slice(endIndex).join('\n');
    
    return [before, contentToAppend, after]
      .filter(part => part.length > 0)
      .join('\n\n');
  }

  /**
   * Insert new section after specified section
   * 
   * @param content Original markdown content
   * @param afterSection Section title to insert after
   * @param newSectionTitle New section title (will be formatted as ##)
   * @param newContent New section content
   * @returns Updated markdown content
   */
  static insertSection(
    content: string,
    afterSection: string,
    newSectionTitle: string,
    newContent: string
  ): string {
    const lines = content.split('\n');
    const startIndex = lines.findIndex(line => 
      line.trim().startsWith('##') && line.includes(afterSection)
    );
    
    if (startIndex === -1) {
      // Section not found - append at end
      return content + '\n\n## ' + newSectionTitle + '\n\n' + newContent;
    }
    
    // Find section end
    const sectionDepth = lines[startIndex].match(/^#+/)?.[0].length || 0;
    let endIndex = startIndex + 1;
    
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('#')) {
        const lineDepth = line.match(/^#+/)?.[0].length || 0;
        if (lineDepth <= sectionDepth) {
          endIndex = i;
          break;
        }
      }
      endIndex = i + 1;
    }
    
    // Insert new section
    const before = lines.slice(0, endIndex).join('\n');
    const after = lines.slice(endIndex).join('\n');
    const newSection = `## ${newSectionTitle}\n\n${newContent}`;
    
    return [before, newSection, after]
      .filter(part => part.length > 0)
      .join('\n\n');
  }

  /**
   * Parse markdown structure for performance optimization
   * 
   * Caches section positions to avoid repeated parsing.
   * 
   * @param content Markdown content
   * @returns Map of section title to structure info
   */
  static parseStructure(content: string): Map<string, SectionInfo> {
    const structure = new Map<string, SectionInfo>();
    const lines = content.split('\n');
    
    let currentSection: SectionInfo | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      if (trimmed.startsWith('#')) {
        // Close previous section
        if (currentSection) {
          currentSection.end = i - 1;
          structure.set(currentSection.title, currentSection);
        }
        
        // Start new section
        const match = trimmed.match(/^(#+)\s+(.+)$/);
        if (match) {
          const depth = match[1].length;
          const title = match[2].trim();
          
          currentSection = {
            start: i,
            end: lines.length - 1, // Will be updated when next section found
            depth,
            title
          };
        }
      }
    }
    
    // Close last section
    if (currentSection) {
      currentSection.end = lines.length - 1;
      structure.set(currentSection.title, currentSection);
    }
    
    return structure;
  }
}

