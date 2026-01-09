/**
 * Atomic Command: /security-check-config [path]
 * Check for security misconfigurations
 * 
 * Tier: Cross-tier utility
 * Operates on: Security configuration validation
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

export interface ConfigCheckParams {
  path?: string;
}

export interface ConfigCheckResult {
  valid: boolean;
  errors: Array<{
    file: string;
    issue: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    file: string;
    message: string;
  }>;
  summary: {
    totalChecks: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Check for security misconfigurations
 * 
 * @param params Check parameters
 * @returns Formatted validation output
 */
export async function checkConfig(params: ConfigCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || PROJECT_ROOT;
  
  const output: string[] = [];
  output.push('# Security Configuration Check\n');
  output.push('---\n\n');
  
  try {
    const result: ConfigCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalChecks: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    const fullTargetPath = join(PROJECT_ROOT, targetPath);
    
    // Check 1: Default credentials in config files
    result.summary.totalChecks++;
    const configFiles = [
      join(fullTargetPath, '.env'),
      join(fullTargetPath, '.env.example'),
      join(fullTargetPath, 'config', 'database.ts'),
      join(fullTargetPath, 'config', 'database.mjs'),
      join(fullTargetPath, 'src', 'config', 'database.ts'),
      join(fullTargetPath, 'src', 'config', 'database.mjs'),
    ];
    
    for (const configFile of configFiles) {
      if (existsSync(configFile)) {
        try {
          const content = readFileSync(configFile, 'utf-8');
          const relativePath = configFile.replace(PROJECT_ROOT + '/', '');
          
          // Check for default passwords
          if (content.match(/password\s*[:=]\s*["'](password|admin|123456|changeme|default)["']/gi)) {
            result.errors.push({
              file: relativePath,
              issue: 'Default password detected',
              severity: 'error',
            });
            result.summary.errorCount++;
          }
          
          // Check for default usernames
          if (content.match(/username\s*[:=]\s*["'](admin|root|user|test)["']/gi)) {
            result.warnings.push({
              file: relativePath,
              message: 'Default username detected',
            });
            result.summary.warningCount++;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    // Check 2: CORS configuration
    result.summary.totalChecks++;
    const appFiles = [
      join(fullTargetPath, 'src', 'app.ts'),
      join(fullTargetPath, 'src', 'index.ts'),
      join(fullTargetPath, 'server.ts'),
      join(fullTargetPath, 'app.js'),
      join(fullTargetPath, 'index.js'),
    ];
    
    let corsFound = false;
    let corsPermissive = false;
    
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          const relativePath = appFile.replace(PROJECT_ROOT + '/', '');
          
          if (content.includes('cors') || content.includes('CORS')) {
            corsFound = true;
            
            // Check for overly permissive CORS
            if (content.match(/origin\s*[:=]\s*["']\*["']/gi) || 
                content.match(/cors\({\s*origin\s*:\s*true/gi)) {
              corsPermissive = true;
              result.warnings.push({
                file: relativePath,
                message: 'CORS configured to allow all origins (*)',
              });
              result.summary.warningCount++;
            }
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    if (!corsFound) {
      result.warnings.push({
        file: 'app configuration',
        message: 'CORS middleware not found - ensure CORS is properly configured',
      });
      result.summary.warningCount++;
    }
    
    // Check 3: Security headers (helmet.js)
    result.summary.totalChecks++;
    let helmetFound = false;
    
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          
          if (content.includes('helmet') || content.includes('Helmet')) {
            helmetFound = true;
            break;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    // Check package.json for helmet
    const packageJsonPath = join(fullTargetPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        
        if (allDeps.helmet) {
          helmetFound = true;
        }
      } catch {
        // Skip if can't parse
      }
    }
    
    if (!helmetFound) {
      result.warnings.push({
        file: 'app configuration',
        message: 'helmet.js not found - consider adding security headers middleware',
      });
      result.summary.warningCount++;
    }
    
    // Check 4: Verbose error messages in production code
    result.summary.totalChecks++;
    const checkVerboseErrors = (dirPath: string): void => {
      try {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          
          if (entry.includes('node_modules') || entry.includes('dist') || entry.includes('.git')) {
            continue;
          }
          
          try {
            const stat = require('fs').statSync(fullPath);
            
            if (stat.isDirectory()) {
              checkVerboseErrors(fullPath);
            } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.js'))) {
              const content = readFileSync(fullPath, 'utf-8');
              
              // Check for stack traces or detailed error messages
              if (content.includes('stack') && content.includes('Error') && 
                  !content.includes('NODE_ENV') && !content.includes('development')) {
                const relativePath = fullPath.replace(PROJECT_ROOT + '/', '');
                result.warnings.push({
                  file: relativePath,
                  message: 'Potential verbose error handling - ensure errors are sanitized in production',
                });
                result.summary.warningCount++;
              }
            }
          } catch {
            // Skip files we can't read
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };
    
    if (existsSync(join(fullTargetPath, 'src'))) {
      checkVerboseErrors(join(fullTargetPath, 'src'));
    }
    
    // Check 5: HTTPS enforcement
    result.summary.totalChecks++;
    let httpsEnforced = false;
    
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          
          if (content.includes('https') || content.includes('HTTPS') || 
              content.includes('ssl') || content.includes('SSL')) {
            httpsEnforced = true;
            break;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    if (!httpsEnforced) {
      result.warnings.push({
        file: 'app configuration',
        message: 'HTTPS enforcement not detected - ensure HTTPS is enforced in production',
      });
      result.summary.warningCount++;
    }
    
    // Check 6: Session configuration
    result.summary.totalChecks++;
    let sessionSecure = false;
    let sessionHttpOnly = false;
    
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          
          if (content.includes('session') || content.includes('Session')) {
            if (content.includes('secure:') || content.includes('secure :')) {
              sessionSecure = true;
            }
            if (content.includes('httpOnly:') || content.includes('httpOnly :')) {
              sessionHttpOnly = true;
            }
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    if (!sessionSecure) {
      result.warnings.push({
        file: 'session configuration',
        message: 'Session secure flag not found - ensure cookies are secure in production',
      });
      result.summary.warningCount++;
    }
    
    if (!sessionHttpOnly) {
      result.warnings.push({
        file: 'session configuration',
        message: 'Session httpOnly flag not found - ensure cookies are httpOnly to prevent XSS',
      });
      result.summary.warningCount++;
    }
    
    // Update valid flag
    if (result.summary.errorCount > 0) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **Security configuration check passed**\n\n');
    } else {
      output.push('❌ **Security configuration issues found**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Checks performed: ${result.summary.totalChecks}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors
    if (result.errors.length > 0) {
      output.push('## Configuration Errors\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}**\n`);
        output.push(`  Issue: ${error.issue}\n\n`);
      }
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      output.push('## Configuration Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.file}**\n`);
        output.push(`  ${warning.message}\n\n`);
      }
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('No security configuration issues found.\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to check security configuration**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check config (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkConfigProgrammatic(
  params: ConfigCheckParams = {}
): Promise<{ success: boolean; result?: ConfigCheckResult; error?: string }> {
  try {
    const output = await checkConfig(params);
    
    // Parse output to extract structured result
    const result: ConfigCheckResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalChecks: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Extract summary numbers
    const checksMatch = output.match(/Checks performed: (\d+)/);
    const errorsMatch = output.match(/Errors: (\d+)/);
    const warningsMatch = output.match(/Warnings: (\d+)/);
    
    if (checksMatch) result.summary.totalChecks = parseInt(checksMatch[1], 10);
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

