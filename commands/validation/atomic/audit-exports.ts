/**
 * Atomic Command: Audit Export Usage
 * Identifies unused exports and dead code
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
 * Extract exported functions/constants from a file
 */
function extractExports(content: string): string[] {
  const exports: string[] = [];
  
  // Named exports: export function name, export const name, export async function name
  const functionExports = content.matchAll(/export\s+(async\s+)?function\s+(\w+)/g);
  for (const match of functionExports) {
    exports.push(match[2]);
  }
  
  const constExports = content.matchAll(/export\s+const\s+(\w+)/g);
  for (const match of constExports) {
    exports.push(match[1]);
  }
  
  // Type exports
  const typeExports = content.matchAll(/export\s+(type|interface)\s+(\w+)/g);
  for (const match of typeExports) {
    exports.push(match[2]);
  }
  
  // Export * from - these are re-exports, skip for now
  // We'll check these separately
  
  return exports;
}

/**
 * Check for unused exports
 */
export async function auditExports(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  const commandsDir = join(PROJECT_ROOT, '.cursor/commands');
  const allFiles = await getAllTsFiles(commandsDir);
  
  // Read index.ts to get all exports
  const indexPath = join(PROJECT_ROOT, '.cursor/commands/index.ts');
  const indexContent = await readFile(indexPath, 'utf-8');
  
  // Extract all export * from statements
  const exportMatches = indexContent.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g);
  const exportedModules: string[] = [];
  
  for (const match of exportMatches) {
    exportedModules.push(match[1]);
  }
  
  // Check if exported modules are actually used elsewhere
  // Read a few key files that might use commands
  const usageFiles = [
    join(PROJECT_ROOT, '.cursor/commands/README.md'),
    join(PROJECT_ROOT, '.cursor/commands/USAGE.md'),
  ];
  
  const usageContent: string[] = [];
  for (const usageFile of usageFiles) {
    try {
      const content = await readFile(usageFile, 'utf-8');
      usageContent.push(content);
    } catch (_error) {
      // File might not exist, continue
    }
  }
  
  // Check each exported module
  for (const modulePath of exportedModules) {
    const fullPath = join(PROJECT_ROOT, '.cursor/commands', modulePath + '.ts');
    
    try {
      const moduleContent = await readFile(fullPath, 'utf-8');
      const exports = extractExports(moduleContent);
      
      // Check if exports are mentioned in usage docs
      for (const exportName of exports) {
        const mentionedInDocs = usageContent.some(content => 
          content.includes(exportName) || 
          content.includes(`/${exportName.replace(/([A-Z])/g, '-$1').toLowerCase()}`)
        );
        
        // Check if used in other command files
        let usedInCode = false;
        for (const file of allFiles) {
          if (file === fullPath) continue; // Skip self
          try {
            const fileContent = await readFile(file, 'utf-8');
            if (fileContent.includes(exportName) && !fileContent.includes(`// Unused`)) {
              // Check if it's actually imported/used, not just a comment
              const importPattern = new RegExp(`import.*\\b${exportName}\\b.*from`, 's');
              if (importPattern.test(fileContent) || fileContent.includes(`{ ${exportName}`)) {
                usedInCode = true;
                break;
              }
            }
          } catch (_error) {
            // Skip files we can't read
          }
        }
        
        if (!mentionedInDocs && !usedInCode && exports.length > 0) {
          issues.push({
            severity: 'info',
            message: `Export ${exportName} from ${modulePath} may be unused`,
            file: fullPath,
            suggestion: 'Verify if this export is needed, or remove if unused',
          });
        }
      }
    } catch (err) {
      console.warn('Audit exports: module file not found or unreadable', fullPath, err);
      continue;
    }
  }
  
  // Check for dead code patterns
  for (const file of allFiles) {
    try {
      const content = await readFile(file, 'utf-8');
      
      // Check for commented-out exports
      const commentedExports = content.match(/\/\/\s*export\s+(function|const|async function)\s+(\w+)/g);
      if (commentedExports && commentedExports.length > 0) {
        issues.push({
          severity: 'info',
          message: `Found commented-out exports (potential dead code)`,
          file: file,
          suggestion: 'Review and either uncomment or remove commented exports',
        });
      }
      
      // Check for TODO/FIXME comments about unused code
      if (content.includes('TODO: remove') || content.includes('FIXME: unused')) {
        issues.push({
          severity: 'info',
          message: 'File contains TODO/FIXME about unused code',
          file: file,
          suggestion: 'Review and clean up unused code',
        });
      }
      
    } catch (err) {
      console.warn('Audit exports: failed to check file for dead code patterns', file, err);
    }
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

  return {
    check: 'Export Usage',
    status,
    issues,
    recommendations,
    summary: `Found ${issues.length} potential unused exports or dead code`,
  };
}

