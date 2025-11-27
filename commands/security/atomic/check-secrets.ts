/**
 * Atomic Command: /security-check-secrets [path] [--strict]
 * Check for exposed secrets and hardcoded credentials
 * 
 * Tier: Cross-tier utility
 * Operates on: Exposed secrets detection
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

export interface SecretsCheckParams {
  path?: string;
  strict?: boolean;
}

export interface SecretsCheckResult {
  valid: boolean;
  errors: Array<{
    file: string;
    line: number;
    pattern: string;
    issue: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    file: string;
    line: number;
    message: string;
  }>;
  summary: {
    totalFiles: number;
    errorCount: number;
    warningCount: number;
  };
}

// Secret patterns to detect (conservative patterns to reduce false positives)
const SECRET_PATTERNS = [
  // API keys
  { pattern: /api[_-]?key\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'API Key', severity: 'error' as const },
  { pattern: /apikey\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'API Key', severity: 'error' as const },
  { pattern: /api_key\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'API Key', severity: 'error' as const },
  
  // Passwords
  { pattern: /password\s*[:=]\s*["']([^"']{8,})["']/gi, name: 'Password', severity: 'error' as const },
  { pattern: /pwd\s*[:=]\s*["']([^"']{8,})["']/gi, name: 'Password', severity: 'error' as const },
  
  // Tokens
  { pattern: /token\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'Token', severity: 'error' as const },
  { pattern: /secret\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'Secret', severity: 'error' as const },
  { pattern: /auth[_-]?token\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'Auth Token', severity: 'error' as const },
  
  // Database credentials
  { pattern: /db[_-]?(password|pass|pwd)\s*[:=]\s*["']([^"']{8,})["']/gi, name: 'Database Password', severity: 'error' as const },
  
  // AWS keys
  { pattern: /aws[_-]?(access[_-]?key|secret[_-]?key)\s*[:=]\s*["']([^"']{20,})["']/gi, name: 'AWS Key', severity: 'error' as const },
  
  // Private keys
  { pattern: /private[_-]?key\s*[:=]\s*["']([^"']{40,})["']/gi, name: 'Private Key', severity: 'error' as const },
  
  // Console.log with potential secrets (warning)
  { pattern: /console\.(log|warn|error|info)\([^)]*(password|token|secret|key|api[_-]?key)[^)]*\)/gi, name: 'Console.log with secret', severity: 'warning' as const },
];

// Files to ignore
const IGNORE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.git/,
  /package-lock\.json/,
  /yarn\.lock/,
  /\.log$/,
  /\.min\.js$/,
];

// File extensions to check
const CHECK_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue'];

/**
 * Check for exposed secrets in codebase
 * 
 * @param params Check parameters
 * @returns Formatted validation output (does NOT include actual secrets to avoid context pollution)
 */
export async function checkSecrets(params: SecretsCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || PROJECT_ROOT;
  const strict = params.strict || false;
  
  const output: string[] = [];
  output.push('# Secrets Detection Check\n');
  output.push('---\n\n');
  
  try {
    const result: SecretsCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalFiles: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Recursively scan files
    const scanDirectory = (dirPath: string): void => {
      try {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          
          // Skip ignored patterns
          if (IGNORE_PATTERNS.some(pattern => pattern.test(fullPath))) {
            continue;
          }
          
          try {
            const stat = statSync(fullPath);
            
            if (stat.isDirectory()) {
              scanDirectory(fullPath);
            } else if (stat.isFile()) {
              const ext = extname(fullPath);
              if (CHECK_EXTENSIONS.includes(ext)) {
                result.summary.totalFiles++;
                scanFile(fullPath);
              }
            }
          } catch {
            // Skip files we can't read
            continue;
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };
    
    const scanFile = (filePath: string): void => {
      try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const relativePath = filePath.replace(PROJECT_ROOT + '/', '');
        
        // Check each line against patterns
        lines.forEach((line, index) => {
          // Skip if line contains process.env (environment variable usage)
          if (line.includes('process.env') || line.includes('import.meta.env')) {
            return;
          }
          
          // Check each pattern
          for (const { pattern, name, severity } of SECRET_PATTERNS) {
            const matches = Array.from(line.matchAll(pattern));
            
            for (const match of matches) {
              // Skip if it's a comment explaining why it's safe
              if (line.trim().startsWith('//') && line.includes('safe') || line.includes('example')) {
                continue;
              }
              
              const issue = {
                file: relativePath,
                line: index + 1,
                pattern: name,
                issue: `Potential ${name.toLowerCase()} found`,
                severity,
              };
              
              if (severity === 'error') {
                result.errors.push(issue);
                result.summary.errorCount++;
              } else {
                result.warnings.push(issue);
                result.summary.warningCount++;
              }
            }
          }
        });
      } catch {
        // Skip files we can't read
      }
    };
    
    // Start scanning
    const fullTargetPath = join(PROJECT_ROOT, targetPath);
    if (!statSync(fullTargetPath).isDirectory()) {
      output.push(`⚠️ **Path is not a directory: ${targetPath}**\n`);
      return output.join('\n');
    }
    
    scanDirectory(fullTargetPath);
    
    // Update valid flag
    if (result.summary.errorCount > 0 || (strict && result.summary.warningCount > 0)) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **No exposed secrets found**\n\n');
    } else {
      output.push('❌ **Potential secrets detected**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Files scanned: ${result.summary.totalFiles}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors (without showing actual secrets)
    if (result.errors.length > 0) {
      output.push('## Potential Secrets Found\n\n');
      output.push('**Note:** Actual secret values are not shown for security reasons.\n\n');
      
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}:${error.line}**\n`);
        output.push(`  Pattern: ${error.pattern}\n`);
        output.push(`  Issue: ${error.issue}\n\n`);
      }
      output.push('**Action Required:** Move secrets to environment variables.\n\n');
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      output.push('## Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.file}:${warning.line}**\n`);
        output.push(`  ${warning.message}\n\n`);
      }
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('No exposed secrets found in scanned files.\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to check for secrets**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check secrets (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkSecretsProgrammatic(
  params: SecretsCheckParams = {}
): Promise<{ success: boolean; result?: SecretsCheckResult; error?: string }> {
  try {
    const output = await checkSecrets(params);
    
    // Parse output to extract structured result
    const result: SecretsCheckResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalFiles: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Extract summary numbers
    const filesMatch = output.match(/Files scanned: (\d+)/);
    const errorsMatch = output.match(/Errors: (\d+)/);
    const warningsMatch = output.match(/Warnings: (\d+)/);
    
    if (filesMatch) result.summary.totalFiles = parseInt(filesMatch[1], 10);
    if (errorsMatch) result.summary.errorCount = parseInt(errorsMatch[1], 10);
    if (warningsMatch) result.summary.warningCount = parseInt(warningsMatch[1], 10);
    
    return {
      success: true,
      result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

