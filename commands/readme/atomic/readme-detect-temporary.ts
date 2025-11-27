/**
 * Atomic Command: /readme-detect-temporary [filePath]
 * 
 * Tier: Cross-tier utility
 * Operates on: README files
 * 
 * Description: Detect if a README file is temporary based on filename patterns, content patterns, and metadata markers
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from '../../utils/utils';
import { ReadmeMetadata, TemporaryReadmeInfo } from '../types';

/**
 * Temporary filename patterns
 */
const TEMPORARY_FILENAME_PATTERNS = [
  /STATUS/i,
  /SUMMARY/i,
  /TEMP/i,
  /TMP/i,
  /DRAFT/i,
  /AUDIT/i,
];

/**
 * Temporary content patterns
 */
const TEMPORARY_CONTENT_PATTERNS = [
  /temporary/i,
  /implementation status/i,
  /TODO: Remove after/i,
  /<!-- TEMPORARY:/i,
  /<!-- STATUS:/i,
];

/**
 * Detect if README is temporary
 * 
 * @param filePath Path to README file
 * @returns Detection result with reason and metadata
 */
export async function detectTemporaryReadme(filePath: string): Promise<TemporaryReadmeInfo | null> {
  try {
    const fullPath = join(PROJECT_ROOT, filePath);
    const content = await readFile(fullPath, 'utf-8');
    const filename = filePath.split('/').pop() || '';
    
    // Check filename patterns
    const filenameMatch = TEMPORARY_FILENAME_PATTERNS.find(pattern => pattern.test(filename));
    if (filenameMatch) {
      const metadata = extractMetadata(content);
      return {
        filePath,
        reason: `Filename pattern: ${filenameMatch.source}`,
        metadata: {
          isTemporary: true,
          temporaryReason: metadata.temporaryReason || 'Detected by filename pattern',
          expiryDate: metadata.expiryDate,
          consolidateInto: metadata.consolidateInto,
        },
      };
    }
    
    // Check content patterns
    const contentMatch = TEMPORARY_CONTENT_PATTERNS.find(pattern => pattern.test(content));
    if (contentMatch) {
      const metadata = extractMetadata(content);
      return {
        filePath,
        reason: `Content pattern: ${contentMatch.source}`,
        metadata: {
          isTemporary: true,
          temporaryReason: metadata.temporaryReason || 'Detected by content pattern',
          expiryDate: metadata.expiryDate,
          consolidateInto: metadata.consolidateInto,
        },
      };
    }
    
    // Check metadata markers
    const metadata = extractMetadata(content);
    if (metadata.isTemporary) {
      return {
        filePath,
        reason: 'Metadata marker detected',
        metadata,
      };
    }
    
    return null;
  } catch (error) {
    throw new Error(
      `Failed to detect temporary README: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract metadata from README content
 */
function extractMetadata(content: string): ReadmeMetadata {
  const metadata: ReadmeMetadata = {
    isTemporary: false,
  };
  
  // Check for TEMPORARY marker
  const tempMatch = content.match(/<!-- TEMPORARY:\s*(.+?)\s*-->/i);
  if (tempMatch) {
    metadata.isTemporary = true;
    metadata.temporaryReason = tempMatch[1].trim();
  }
  
  // Check for STATUS marker
  const statusMatch = content.match(/<!-- STATUS:\s*(.+?)\s*-->/i);
  if (statusMatch) {
    metadata.isTemporary = true;
    metadata.temporaryReason = statusMatch[1].trim();
  }
  
  // Check for EXPIRY
  const expiryMatch = content.match(/<!-- EXPIRY:\s*(\d{4}-\d{2}-\d{2})\s*-->/i);
  if (expiryMatch) {
    metadata.expiryDate = expiryMatch[1];
  }
  
  // Check for CONSOLIDATE_INTO
  const consolidateMatch = content.match(/<!-- CONSOLIDATE_INTO:\s*(.+?)\s*-->/i);
  if (consolidateMatch) {
    metadata.consolidateInto = consolidateMatch[1].trim();
  }
  
  return metadata;
}

