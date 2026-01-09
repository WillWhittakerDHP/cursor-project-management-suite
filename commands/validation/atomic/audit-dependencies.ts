/**
 * Atomic Command: Audit Dependencies
 * Validates imports, exports, deprecated usage, and cross-tier dependencies
 */

import { readFile, access, readdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
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

const DEPRECATED_FUNCTIONS = [
  'FILE_PATHS',
  'getSessionLogPath',
  'extractMarkdownSection',
  'parseTaskId',
  'parseSessionId',
  'parseSubSessionId',
];

const DEPRECATED_REPLACEMENTS: Record<string, string> = {
  FILE_PATHS: 'WorkflowCommandContext.paths',
  getSessionLogPath: 'WorkflowCommandContext.paths.getSessionLogPath()',
  extractMarkdownSection: 'MarkdownUtils.extractSection()',
  parseTaskId: 'WorkflowId.parseTaskId() or WorkflowCommandContext.idUtils.parseTaskId()',
  parseSessionId: 'WorkflowId.parseSessionId() or WorkflowCommandContext.idUtils.parseSessionId()',
  parseSubSessionId: 'WorkflowId.parseTaskId() or WorkflowCommandContext.idUtils.parseTaskId()',
};

// Files that legitimately define or document deprecated functions
const EXCLUDED_FILES = [
  'utils/utils.ts', // Documents deprecated functions
  'utils/id-utils.ts', // Defines WorkflowId methods
  'utils/path-resolver.ts', // Defines path methods
  'validation/atomic/audit-dependencies.ts', // Uses deprecated functions to detect them
];

/**
 * Check if a line is inside a comment block
 * Tracks multi-line comments and JSDoc comments
 */
function isInComment(line: string, lineIndex: number, allLines: string[]): boolean {
  // Check for single-line comment
  const singleLineCommentIndex = line.indexOf('//');
  if (singleLineCommentIndex !== -1) {
    // Check if // is inside a string
    const beforeComment = line.substring(0, singleLineCommentIndex);
    const stringCount = (beforeComment.match(/['"`]/g) || []).length;
    if (stringCount % 2 === 0) {
      return true; // Not in a string, so it's a comment
    }
  }

  // Check for multi-line comment start
  const multiLineStart = line.indexOf('/*');
  if (multiLineStart !== -1) {
    const beforeStart = line.substring(0, multiLineStart);
    const stringCount = (beforeStart.match(/['"`]/g) || []).length;
    if (stringCount % 2 === 0) {
      // Check if comment ends on same line
      const afterStart = line.substring(multiLineStart + 2);
      const multiLineEnd = afterStart.indexOf('*/');
      if (multiLineEnd !== -1) {
        return true; // Comment on same line
      }
      // Comment spans multiple lines - check previous lines
      for (let i = lineIndex - 1; i >= 0; i--) {
        if (allLines[i].includes('*/')) {
          break; // Found end of comment
        }
        if (allLines[i].includes('/*')) {
          return true; // Still in comment block
        }
      }
    }
  }

  // Check if we're inside a multi-line comment from previous lines
  for (let i = lineIndex - 1; i >= 0; i--) {
    const prevLine = allLines[i];
    const commentStart = prevLine.indexOf('/*');
    if (commentStart !== -1) {
      const beforeStart = prevLine.substring(0, commentStart);
      const stringCount = (beforeStart.match(/['"`]/g) || []).length;
      if (stringCount % 2 === 0) {
        // Check if comment ends on this line
        if (line.includes('*/')) {
          break; // Comment ends here
        }
        return true; // Still in comment block
      }
    }
    if (prevLine.includes('*/')) {
      break; // Found end of comment
    }
  }

  return false;
}

/**
 * Strip comments from a line for analysis
 */
function stripComments(line: string): string {
  // Remove single-line comments
  const singleLineMatch = line.match(/^([^'"]*\/\/[^'"]*)/);
  if (singleLineMatch) {
    return line.substring(0, singleLineMatch.index || 0);
  }
  
  // Remove multi-line comments (simple case - full line)
  if (line.trim().startsWith('/*') || line.trim().startsWith('*')) {
    return '';
  }
  
  return line;
}

/**
 * Check if deprecated function is used correctly (via replacement pattern)
 */
function isCorrectUsage(line: string, deprecated: string): boolean {
  const strippedLine = stripComments(line);
  
  switch (deprecated) {
    case 'getSessionLogPath':
      // Correct: context.paths.getSessionLogPath, WorkflowCommandContext.paths.getSessionLogPath
      return strippedLine.includes('.paths.getSessionLogPath');
    
    case 'parseTaskId':
      // Correct: WorkflowId.parseTaskId, context.idUtils.parseTaskId
      return strippedLine.includes('WorkflowId.parseTaskId') || 
             strippedLine.includes('.idUtils.parseTaskId');
    
    case 'parseSessionId':
      // Correct: WorkflowId.parseSessionId, context.idUtils.parseSessionId
      return strippedLine.includes('WorkflowId.parseSessionId') || 
             strippedLine.includes('.idUtils.parseSessionId');
    
    case 'extractMarkdownSection':
      // Correct: MarkdownUtils.extractSection
      return strippedLine.includes('MarkdownUtils.extractSection');
    
    case 'FILE_PATHS':
      // FILE_PATHS in comments is OK, but direct usage FILE_PATHS. is deprecated
      // Check if it's a direct property access
      return strippedLine.includes('FILE_PATHS.') === false;
    
    default:
      return false;
  }
}

/**
 * Check if deprecated function is actually used (not just mentioned)
 */
function isDeprecatedFunctionUsage(line: string, deprecated: string, allLines: string[], lineIndex: number): boolean {
  // Skip if in comment
  if (isInComment(line, lineIndex, allLines)) {
    return false;
  }
  
  // Skip if correct usage pattern
  if (isCorrectUsage(line, deprecated)) {
    return false;
  }
  
  // Check if it's a direct call or property access
  const strippedLine = stripComments(line);
  const regex = new RegExp(`\\b${deprecated}\\b`);
  
  if (!regex.test(strippedLine)) {
    return false;
  }
  
  // Check if it's in a string literal
  const stringMatches = strippedLine.match(/['"`]/g);
  if (stringMatches && stringMatches.length % 2 !== 0) {
    // Odd number of quotes - might be in a string
    // Simple check: if deprecated function appears before the last quote, it's likely in a string
    const lastQuoteIndex = strippedLine.lastIndexOf(stringMatches[stringMatches.length - 1]);
    const deprecatedIndex = strippedLine.indexOf(deprecated);
    if (deprecatedIndex < lastQuoteIndex) {
      return false; // Likely in a string
    }
  }
  
  return true;
}

/**
 * Check if file should be excluded from deprecated function checks
 */
function shouldCheckFile(filePath: string, commandsDir: string): boolean {
  const relativePath = filePath.replace(commandsDir + '/', '');
  return !EXCLUDED_FILES.includes(relativePath);
}

/**
 * Check if dynamic import exists for a dependency
 */
function hasDynamicImport(content: string, depPath: string): boolean {
  // Pattern: (await )?import(['"]path['"])
  const dynamicImportPattern = new RegExp(
    `(await\\s+)?import\\s*\\(['"]${depPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)`,
    'g'
  );
  
  if (dynamicImportPattern.test(content)) {
    return true;
  }
  
  // Check for import().then() pattern
  const importThenPattern = new RegExp(
    `import\\s*\\(['"]${depPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\)\\s*\\.then`,
    'g'
  );
  
  return importThenPattern.test(content);
}

/**
 * Check dependencies and imports
 */
export async function auditDependencies(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  // Get all TypeScript files in commands directory
  const commandsDir = join(PROJECT_ROOT, '.cursor/commands');
  const allFiles = await getAllTsFiles(commandsDir);
  const commandFiles = allFiles.map(f => f.replace(commandsDir + '/', ''));

  // Check exports in index.ts
  const indexPath = join(PROJECT_ROOT, '.cursor/commands/index.ts');
  try {
    const indexContent = await readFile(indexPath, 'utf-8');
    const exportMatches = indexContent.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g);
    
    for (const match of exportMatches) {
      const exportPath = match[1];
      // Resolve relative path
      const resolvedPath = exportPath.startsWith('.')
        ? resolve(dirname(indexPath), exportPath + '.ts')
        : join(PROJECT_ROOT, '.cursor/commands', exportPath + '.ts');
      
      try {
        await access(resolvedPath);
      } catch (error) {
        issues.push({
          severity: 'error',
          message: `Export references non-existent file: ${exportPath}`,
          file: indexPath,
          code: match[0],
          suggestion: `Remove export or create missing file at ${resolvedPath}`,
        });
      }
    }
  } catch (error) {
    issues.push({
      severity: 'error',
      message: `Failed to read index.ts: ${error instanceof Error ? error.message : String(error)}`,
      file: indexPath,
    });
  }

  // Check for deprecated function usage
  for (const file of allFiles) {
    const filePath = file;
    try {
      // Skip excluded files
      if (!shouldCheckFile(filePath, commandsDir)) {
        continue;
      }
      
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (const deprecated of DEPRECATED_FUNCTIONS) {
        // Check for usage using improved detection
        lines.forEach((line, index) => {
          if (isDeprecatedFunctionUsage(line, deprecated, lines, index)) {
            issues.push({
              severity: 'warning',
              message: `Uses deprecated function: ${deprecated}`,
              file: filePath,
              line: index + 1,
              code: line.trim(),
              suggestion: `Replace with ${DEPRECATED_REPLACEMENTS[deprecated]}`,
            });
            const relativePath = filePath.replace(PROJECT_ROOT + '/', '');
            recommendations.push(`Update ${relativePath} to use ${DEPRECATED_REPLACEMENTS[deprecated]} instead of ${deprecated}`);
          }
        });
      }

      // Check for WorkflowCommandContext usage where needed
      // Files that should use WorkflowCommandContext but might not
      if (filePath.includes('tiers/') && !filePath.includes('utils/')) {
        const shouldUseContext = content.includes('getSessionLogPath') || 
                                 content.includes('parseTaskId') || 
                                 content.includes('parseSessionId') ||
                                 content.includes('FILE_PATHS');
        const usesContext = content.includes('WorkflowCommandContext');
        
        if (shouldUseContext && !usesContext) {
          issues.push({
            severity: 'warning',
            message: 'Should use WorkflowCommandContext for path operations',
            file: filePath,
            suggestion: 'Import and use WorkflowCommandContext instead of deprecated utilities',
          });
        }
      }

      // Check for MarkdownUtils vs deprecated extractMarkdownSection
      // Only flag if extractMarkdownSection is actually used (not just in comments or correct usage)
      const hasExtractMarkdownSection = lines.some((line, index) => 
        isDeprecatedFunctionUsage(line, 'extractMarkdownSection', lines, index)
      );
      if (hasExtractMarkdownSection && !content.includes('MarkdownUtils')) {
        issues.push({
          severity: 'warning',
          message: 'Uses deprecated extractMarkdownSection instead of MarkdownUtils',
          file: filePath,
          suggestion: 'Import MarkdownUtils and use MarkdownUtils.extractSection()',
        });
      }

      // Check imports resolve
      const importMatches = content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        
        // Skip node modules and built-ins
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
          const resolvedImport = importPath.startsWith('.')
            ? resolve(dirname(filePath), importPath + (importPath.endsWith('.ts') ? '' : '.ts'))
            : join(PROJECT_ROOT, importPath + (importPath.endsWith('.ts') ? '' : '.ts'));
          
          try {
            await access(resolvedImport);
          } catch (error) {
            // Try without .ts extension
            try {
              await access(resolvedImport.replace('.ts', ''));
            } catch {
              // Check if it's a directory with index.ts
              try {
                await access(join(resolvedImport.replace('.ts', ''), 'index.ts'));
              } catch {
                issues.push({
                  severity: 'error',
                  message: `Import resolves to non-existent file: ${importPath}`,
                  file: filePath,
                  code: match[0],
                  suggestion: `Check import path: ${resolvedImport}`,
                });
              }
            }
          }
        }
      }

      // Check for cross-tier dependencies
      const crossTierDeps = [
        { name: 'workflowCleanupReadmes', path: 'readme/composite/readme-workflow-cleanup' },
        { name: 'securityAudit', path: 'security/composite/security-audit' },
      ];

      for (const dep of crossTierDeps) {
        if (content.includes(dep.name)) {
          // Skip if file exports the function (self-reference)
          const exportsFunction = new RegExp(`export\\s+(async\\s+)?function\\s+${dep.name}|export\\s+const\\s+${dep.name}\\s*=|export\\s+\\{[^}]*${dep.name}[^}]*\\}`);
          if (exportsFunction.test(content)) {
            continue; // File exports the function, not using it
          }
          
          // Check if static import exists (various relative path patterns)
          const pathVariations = [
            dep.path,
            `../../${dep.path}`,
            `../../../${dep.path}`,
            `../../../../${dep.path}`,
            `./${dep.path}`,
            `../${dep.path}`,
          ];
          
          const hasStaticImport = pathVariations.some(pathVar => 
            content.includes(`from '${pathVar}'`) || 
            content.includes(`from "${pathVar}"`)
          );
          
          if (!hasStaticImport) {
            // Check if it's a dynamic import (improved detection with relative paths)
            const hasDynamic = pathVariations.some(pathVar => 
              hasDynamicImport(content, pathVar)
            );
            
            if (!hasDynamic) {
              issues.push({
                severity: 'warning',
                message: `Uses ${dep.name} but import may be missing or incorrect`,
                file: filePath,
                suggestion: `Ensure ${dep.name} is imported from ${dep.path}`,
              });
            }
          }
        }
      }

    } catch (error) {
      issues.push({
        severity: 'error',
        message: `Failed to read file ${file}: ${error instanceof Error ? error.message : String(error)}`,
        file: filePath,
      });
    }
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

    return {
    check: 'Dependencies',
    status,
    issues,
    recommendations,
    summary: `Found ${issues.length} dependency issues across ${allFiles.length} files`,
  };
}

