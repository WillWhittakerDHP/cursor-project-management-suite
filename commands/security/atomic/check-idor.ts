/**
 * Atomic Command: /security-check-idor [path]
 * Check for IDOR (Insecure Direct Object Reference) vulnerabilities
 * 
 * Tier: Cross-tier utility
 * Operates on: IDOR vulnerability detection
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';

export interface IDORCheckParams {
  path?: string;
}

export interface IDORCheckResult {
  valid: boolean;
  errors: Array<{
    file: string;
    line: number;
    route: string;
    method: string;
    issue: string;
    severity: 'error' | 'warning';
  }>;
  warnings: Array<{
    file: string;
    route: string;
    message: string;
  }>;
  summary: {
    totalEndpoints: number;
    endpointsWithAuth: number;
    endpointsWithoutAuth: number;
    errorCount: number;
    warningCount: number;
  };
}

// Authorization-related patterns (good)
const AUTHORIZATION_PATTERNS = [
  /authorize/i,
  /permission/i,
  /canAccess/i,
  /hasPermission/i,
  /checkOwnership/i,
  /verifyUser/i,
  /validateUser/i,
  /req\.user/i,
  /req\.session\.user/i,
];

// ID patterns that might indicate direct object references
const ID_PATTERNS = [
  /req\.params\.id/gi,
  /req\.params\.userId/gi,
  /req\.params\.(\w+)Id/gi,
  /req\.query\.id/gi,
  /req\.body\.id/gi,
];

// Database access patterns
const DB_ACCESS_PATTERNS = [
  /\.findOne\(/gi,
  /\.findByPk\(/gi,
  /\.findById\(/gi,
  /\.findAll\(/gi,
  /\.find\(/gi,
  /\.findAndCountAll\(/gi,
];

// Files to ignore
const IGNORE_PATTERNS = [
  /node_modules/,
  /dist/,
  /\.git/,
  /\.test\./,
  /\.spec\./,
];

// File extensions to check
const CHECK_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * Check for IDOR vulnerabilities
 * 
 * @param params Check parameters
 * @returns Formatted validation output
 */
export async function checkIDOR(params: IDORCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || join(PROJECT_ROOT, 'server', 'src');
  
  const output: string[] = [];
  output.push('# IDOR Vulnerability Check\n');
  output.push('---\n\n');
  
  try {
    const result: IDORCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalEndpoints: 0,
        endpointsWithAuth: 0,
        endpointsWithoutAuth: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Scan controller and route files
    const controllerFiles: string[] = [];
    
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
                // Check if it's a controller or route file
                if (fullPath.includes('Controller') || 
                    fullPath.includes('controller') ||
                    fullPath.includes('route') || 
                    fullPath.includes('Route') ||
                    fullPath.includes('router') || 
                    fullPath.includes('Router') ||
                    fullPath.includes('api')) {
                  controllerFiles.push(fullPath);
                }
              }
            }
          } catch (err) {
            console.warn('Check IDOR: file not readable', fullPath, err);
            continue;
          }
        }
      } catch (err) {
        console.warn('Check IDOR: directory not readable', dirPath, err);
      }
    };
    
    const fullTargetPath = join(PROJECT_ROOT, targetPath);
    if (existsSync(fullTargetPath)) {
      scanDirectory(fullTargetPath);
    }
    
    // Analyze each controller file
    for (const controllerFile of controllerFiles) {
      try {
        const content = readFileSync(controllerFile, 'utf-8');
        const lines = content.split('\n');
        const relativePath = controllerFile.replace(PROJECT_ROOT + '/', '');
        
        // Find endpoints that accept IDs and access data
        lines.forEach((line, index) => {
          // Check if line has ID pattern and database access
          const hasIdPattern = ID_PATTERNS.some(pattern => pattern.test(line));
          const hasDbAccess = DB_ACCESS_PATTERNS.some(pattern => pattern.test(line));
          
          if (hasIdPattern || hasDbAccess) {
            // Look for route definition (router.get, router.post, etc.)
            let routeMethod = 'UNKNOWN';
            let routePath = 'UNKNOWN';
            
            // Look backwards for route definition
            for (let i = index - 1; i >= Math.max(0, index - 30); i--) {
              const routeMatch = lines[i].match(/router\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)['"`]/i);
              if (routeMatch) {
                routeMethod = routeMatch[1].toUpperCase();
                routePath = routeMatch[2];
                break;
              }
            }
            
            // Check if there's authorization before this line
            let hasAuthorization = false;
            
            // Look backwards for authorization checks
            for (let i = index - 1; i >= Math.max(0, index - 50); i--) {
              if (AUTHORIZATION_PATTERNS.some(pattern => pattern.test(lines[i]))) {
                hasAuthorization = true;
                break;
              }
            }
            
            // Also check if file has auth middleware at top level
            const fileHasAuth = AUTHORIZATION_PATTERNS.some(pattern => pattern.test(content));
            
            if (hasIdPattern && hasDbAccess && !hasAuthorization && !fileHasAuth) {
              result.summary.totalEndpoints++;
              result.summary.endpointsWithoutAuth++;
              
              // Determine if this is a sensitive endpoint
              const isSensitive = routePath.includes('user') || 
                                 routePath.includes('admin') ||
                                 routePath.includes('profile') ||
                                 routeMethod !== 'GET';
              
              if (isSensitive) {
                result.errors.push({
                  file: relativePath,
                  line: index + 1,
                  route: routePath,
                  method: routeMethod,
                  issue: 'Direct object reference without authorization check',
                  severity: 'error',
                });
                result.summary.errorCount++;
              } else {
                result.warnings.push({
                  file: relativePath,
                  route: routePath,
                  message: 'Direct object reference found - verify authorization is handled elsewhere',
                });
                result.summary.warningCount++;
              }
            } else if (hasIdPattern && hasDbAccess) {
              result.summary.totalEndpoints++;
              result.summary.endpointsWithAuth++;
            }
          }
        });
      } catch (err) {
        console.warn('Check IDOR: controller file not readable', controllerFile, err);
      }
    }
    
    // Update valid flag
    if (result.summary.errorCount > 0) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **IDOR vulnerability check passed**\n\n');
    } else {
      output.push('❌ **Potential IDOR vulnerabilities found**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Total endpoints with ID access: ${result.summary.totalEndpoints}\n`);
    output.push(`- Endpoints with authorization: ${result.summary.endpointsWithAuth}\n`);
    output.push(`- Endpoints without authorization: ${result.summary.endpointsWithoutAuth}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors
    if (result.errors.length > 0) {
      output.push('## IDOR Vulnerabilities\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}:${error.line}**\n`);
        output.push(`  Route: ${error.method} ${error.route}\n`);
        output.push(`  Issue: ${error.issue}\n\n`);
      }
      output.push('**Action Required:** Add authorization checks before accessing data by ID.\n\n');
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      output.push('## Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.file}**\n`);
        output.push(`  Route: ${warning.route}\n`);
        output.push(`  ${warning.message}\n\n`);
      }
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('No IDOR vulnerabilities detected.\n');
    } else {
      output.push('**Note:** This check uses pattern matching and may have false positives.\n');
      output.push('Review flagged endpoints to verify authorization is properly implemented.\n');
    }
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to check for IDOR vulnerabilities**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check IDOR (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkIDORProgrammatic(
  params: IDORCheckParams = {}
): Promise<{ success: boolean; result?: IDORCheckResult; error?: string }> {
  try {
    const output = await checkIDOR(params);
    
    // Parse output to extract structured result
    const result: IDORCheckResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalEndpoints: 0,
        endpointsWithAuth: 0,
        endpointsWithoutAuth: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Extract summary numbers
    const endpointsMatch = output.match(/Total endpoints with ID access: (\d+)/);
    const withAuthMatch = output.match(/Endpoints with authorization: (\d+)/);
    const withoutAuthMatch = output.match(/Endpoints without authorization: (\d+)/);
    const errorsMatch = output.match(/Errors: (\d+)/);
    const warningsMatch = output.match(/Warnings: (\d+)/);
    
    if (endpointsMatch) result.summary.totalEndpoints = parseInt(endpointsMatch[1], 10);
    if (withAuthMatch) result.summary.endpointsWithAuth = parseInt(withAuthMatch[1], 10);
    if (withoutAuthMatch) result.summary.endpointsWithoutAuth = parseInt(withoutAuthMatch[1], 10);
    if (errorsMatch) result.summary.errorCount = parseInt(errorsMatch[1], 10);
    if (warningsMatch) result.summary.warningCount = parseInt(warningsMatch[1], 10);
    
    return {
      success: true,
      result,
    };
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error),
    };
  }
}

