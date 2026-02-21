/**
 * Atomic Command: /validate-security [path] [--strict]
 * Validate codebase for security vulnerabilities
 * 
 * Tier: Cross-tier utility
 * Operates on: Code security validation using ESLint security plugin
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { FRONTEND_ROOT } from '../../utils/utils';

export interface ValidateSecurityParams {
  path?: string;
  strict?: boolean;
}

export interface SecurityValidationResult {
  valid: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    rule: string;
    message: string;
  }>;
  warnings: Array<{
    file: string;
    line: number;
    column: number;
    rule: string;
    message: string;
  }>;
  summary: {
    totalFiles: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Validate security using ESLint security plugin
 * 
 * @param params Validation parameters
 * @returns Formatted validation output (does NOT include problematic code to avoid context pollution)
 */
export async function validateSecurity(params: ValidateSecurityParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || PROJECT_ROOT;
  const strict = params.strict || false;
  
  const output: string[] = [];
  output.push('# Security Validation Report\n');
  output.push('---\n\n');
  
  try {
    // Check if ESLint is available
    const eslintPath = join(targetPath, 'node_modules', '.bin', 'eslint');
    const hasLocalEslint = existsSync(eslintPath);
    
    if (!hasLocalEslint) {
      output.push('⚠️ **ESLint not found in node_modules**\n');
      output.push('Please run `npm install` first.\n');
      return output.join('\n');
    }
    
    // Build ESLint command
    const eslintCommand = hasLocalEslint 
      ? `cd "${targetPath}" && npx eslint`
      : 'eslint';
    
    // Determine which paths to check
    const pathsToCheck: string[] = [];
    if (params.path) {
      pathsToCheck.push(params.path);
    } else {
      // Check common source directories
      const commonPaths = [
        'server/src',
        `${FRONTEND_ROOT}/src`
      ];
      
      for (const commonPath of commonPaths) {
        const fullPath = join(PROJECT_ROOT, commonPath);
        if (existsSync(fullPath)) {
          pathsToCheck.push(commonPath);
        }
      }
      
      // If no common paths found, check root
      if (pathsToCheck.length === 0) {
        pathsToCheck.push('.');
      }
    }
    
    // Run ESLint with security rules
    const result: SecurityValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalFiles: 0,
        errorCount: 0,
        warningCount: 0
      }
    };
    
    for (const checkPath of pathsToCheck) {
      try {
        const fullPath = join(PROJECT_ROOT, checkPath);
        const command = `${eslintCommand} "${fullPath}" --format json --ext .ts,.tsx,.js,.jsx,.mjs,.cjs`;
        
        const eslintOutput = execSync(command, {
          encoding: 'utf-8',
          cwd: PROJECT_ROOT,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        // Parse ESLint JSON output
        const eslintResults = JSON.parse(eslintOutput);
        
        for (const fileResult of eslintResults) {
          if (fileResult.errorCount > 0 || fileResult.warningCount > 0) {
            result.summary.totalFiles++;
            
            for (const message of fileResult.messages) {
              // Only include security-related rules
              if (message.ruleId && message.ruleId.startsWith('security/')) {
                const issue = {
                  file: fileResult.filePath.replace(PROJECT_ROOT + '/', ''),
                  line: message.line,
                  column: message.column,
                  rule: message.ruleId,
                  message: message.message
                };
                
                if (message.severity === 2) {
                  result.errors.push(issue);
                  result.summary.errorCount++;
                } else if (message.severity === 1) {
                  result.warnings.push(issue);
                  result.summary.warningCount++;
                }
              }
            }
          }
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // ESLint may exit with non-zero code if issues found
        if (error.stdout) {
          try {
            const eslintResults = JSON.parse(error.stdout);
            
            for (const fileResult of eslintResults) {
              if (fileResult.errorCount > 0 || fileResult.warningCount > 0) {
                result.summary.totalFiles++;
                
                for (const message of fileResult.messages) {
                  if (message.ruleId && message.ruleId.startsWith('security/')) {
                    const issue = {
                      file: fileResult.filePath.replace(PROJECT_ROOT + '/', ''),
                      line: message.line,
                      column: message.column,
                      rule: message.ruleId,
                      message: message.message
                    };
                    
                    if (message.severity === 2) {
                      result.errors.push(issue);
                      result.summary.errorCount++;
                    } else if (message.severity === 1) {
                      result.warnings.push(issue);
                      result.summary.warningCount++;
                    }
                  }
                }
              }
            }
          } catch (_parseError) {
            // If parsing fails, ESLint might not be configured or there's a different error
            output.push(`⚠️ **Could not parse ESLint output for ${checkPath}**\n`);
            output.push(`Error: ${error.message}\n\n`);
          }
        } else {
          output.push(`⚠️ **ESLint execution failed for ${checkPath}**\n`);
          output.push(`Error: ${error.message}\n\n`);
        }
      }
    }
    
    // Update valid flag
    if (result.summary.errorCount > 0 || (strict && result.summary.warningCount > 0)) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **No security vulnerabilities found**\n\n');
    } else {
      output.push('❌ **Security vulnerabilities detected**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Files checked: ${result.summary.totalFiles}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors (without code snippets to avoid context pollution)
    if (result.errors.length > 0) {
      output.push('## Security Errors\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}:${error.line}:${error.column}**\n`);
        output.push(`  Rule: \`${error.rule}\`\n`);
        output.push(`  Message: ${error.message}\n\n`);
      }
    }
    
    // Warnings (without code snippets to avoid context pollution)
    if (result.warnings.length > 0) {
      output.push('## Security Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.file}:${warning.line}:${warning.column}**\n`);
        output.push(`  Rule: \`${warning.rule}\`\n`);
        output.push(`  Message: ${warning.message}\n\n`);
      }
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('No security issues found in checked files.\n');
    }
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to validate security**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    output.push('\n**Note:** Make sure ESLint and eslint-plugin-security are installed.\n');
    return output.join('\n');
  }
}

/**
 * Validate security (programmatic API)
 * 
 * @param params Validation parameters
 * @returns Structured validation result
 */
export async function validateSecurityProgrammatic(
  params: ValidateSecurityParams = {}
): Promise<{ success: boolean; result?: SecurityValidationResult; error?: string }> {
  try {
    const output = await validateSecurity(params);
    
    // Parse output to extract structured result
    // This is a simplified version - in production you'd want to share the parsing logic
    const result: SecurityValidationResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalFiles: 0,
        errorCount: 0,
        warningCount: 0
      }
    };
    
    // Extract summary numbers
    const filesMatch = output.match(/Files checked: (\d+)/);
    const errorsMatch = output.match(/Errors: (\d+)/);
    const warningsMatch = output.match(/Warnings: (\d+)/);
    
    if (filesMatch) result.summary.totalFiles = parseInt(filesMatch[1], 10);
    if (errorsMatch) result.summary.errorCount = parseInt(errorsMatch[1], 10);
    if (warningsMatch) result.summary.warningCount = parseInt(warningsMatch[1], 10);
    
    return {
      success: true,
      result
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error)
    };
  }
}

