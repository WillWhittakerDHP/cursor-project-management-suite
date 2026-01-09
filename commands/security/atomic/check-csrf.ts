/**
 * Atomic Command: /security-check-csrf [path]
 * Check CSRF protection on state-changing routes
 * 
 * Tier: Cross-tier utility
 * Operates on: CSRF protection validation
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';

export interface CSRFCheckParams {
  path?: string;
}

export interface CSRFCheckResult {
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
    totalRoutes: number;
    protectedRoutes: number;
    unprotectedRoutes: number;
    errorCount: number;
    warningCount: number;
  };
}

// State-changing HTTP methods that require CSRF protection
const STATE_CHANGING_METHODS = ['post', 'put', 'delete', 'patch'];

// CSRF-related patterns to look for
const CSRF_PATTERNS = [
  /csrf/i,
  /csurf/i,
  /csrfProtection/i,
  /csrfToken/i,
  /validateCsrf/i,
  /verifyCsrf/i,
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
 * Check CSRF protection on routes
 * 
 * @param params Check parameters
 * @returns Formatted validation output
 */
export async function checkCSRF(params: CSRFCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || join(PROJECT_ROOT, 'server', 'src');
  
  const output: string[] = [];
  output.push('# CSRF Protection Check\n');
  output.push('---\n\n');
  
  try {
    const result: CSRFCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalRoutes: 0,
        protectedRoutes: 0,
        unprotectedRoutes: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Check app.ts for global CSRF middleware
    const appFiles = [
      join(PROJECT_ROOT, 'server', 'src', 'app.ts'),
      join(PROJECT_ROOT, 'server', 'src', 'index.ts'),
      join(PROJECT_ROOT, 'server.ts'),
    ];
    
    let globalCSRF = false;
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          if (CSRF_PATTERNS.some(pattern => pattern.test(content))) {
            globalCSRF = true;
            break;
          }
        } catch {
          // Skip files we can't read
        }
      }
    }
    
    // Scan route files
    const routeFiles: string[] = [];
    
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
                // Check if it's a route file
                if (fullPath.includes('route') || fullPath.includes('Route') || 
                    fullPath.includes('router') || fullPath.includes('Router')) {
                  routeFiles.push(fullPath);
                }
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
    
    const fullTargetPath = join(PROJECT_ROOT, targetPath);
    if (existsSync(fullTargetPath)) {
      scanDirectory(fullTargetPath);
    }
    
    // Analyze each route file
    for (const routeFile of routeFiles) {
      try {
        const content = readFileSync(routeFile, 'utf-8');
        const lines = content.split('\n');
        const relativePath = routeFile.replace(PROJECT_ROOT + '/', '');
        
        // Check if file has CSRF protection
        const hasCSRF = CSRF_PATTERNS.some(pattern => pattern.test(content));
        
        // Find state-changing routes
        lines.forEach((line, index) => {
          for (const method of STATE_CHANGING_METHODS) {
            // Look for router.post, router.put, router.delete, router.patch
            const methodPattern = new RegExp(`router\\.${method}\\s*\\(`, 'gi');
            if (methodPattern.test(line)) {
              result.summary.totalRoutes++;
              
              // Extract route path if possible
              const routeMatch = line.match(/router\.\w+\s*\(['"`]([^'"`]+)['"`]/);
              const route = routeMatch ? routeMatch[1] : 'unknown';
              
              if (globalCSRF || hasCSRF) {
                result.summary.protectedRoutes++;
              } else {
                result.summary.unprotectedRoutes++;
                result.errors.push({
                  file: relativePath,
                  line: index + 1,
                  route,
                  method: method.toUpperCase(),
                  issue: 'Missing CSRF protection',
                  severity: 'error',
                });
                result.summary.errorCount++;
              }
            }
          }
        });
      } catch {
        // Skip files we can't read
      }
    }
    
    // Check package.json for CSRF libraries
    const packageJsonPath = join(PROJECT_ROOT, 'server', 'package.json');
    let csrfLibraryFound = false;
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        
        if (allDeps.csurf || allDeps['csrf'] || allDeps['express-csrf']) {
          csrfLibraryFound = true;
        }
      } catch {
        // Skip if can't parse
      }
    }
    
    // Add warnings if CSRF library exists but no routes are protected
    if (csrfLibraryFound && result.summary.unprotectedRoutes > 0) {
      result.warnings.push({
        file: 'package.json',
        route: 'all',
        message: 'CSRF library installed but routes may not be using it',
      });
      result.summary.warningCount++;
    }
    
    // Add error if no CSRF library and routes exist
    if (!csrfLibraryFound && result.summary.totalRoutes > 0) {
      result.errors.push({
        file: 'package.json',
        line: 0,
        route: 'all',
        method: 'ALL',
        issue: 'No CSRF protection library found',
        severity: 'error',
      });
      result.summary.errorCount++;
    }
    
    // Update valid flag
    if (result.summary.errorCount > 0) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **CSRF protection check passed**\n\n');
    } else {
      output.push('❌ **CSRF protection issues found**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Total state-changing routes: ${result.summary.totalRoutes}\n`);
    output.push(`- Protected routes: ${result.summary.protectedRoutes}\n`);
    output.push(`- Unprotected routes: ${result.summary.unprotectedRoutes}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors
    if (result.errors.length > 0) {
      output.push('## CSRF Protection Issues\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}${error.line > 0 ? `:${error.line}` : ''}**\n`);
        output.push(`  Route: ${error.method} ${error.route}\n`);
        output.push(`  Issue: ${error.issue}\n\n`);
      }
      output.push('**Action Required:** Add CSRF protection middleware to state-changing routes.\n\n');
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      output.push('## Warnings\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.file}**\n`);
        output.push(`  ${warning.message}\n\n`);
      }
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('All state-changing routes appear to have CSRF protection.\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to check CSRF protection**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check CSRF (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkCSRFProgrammatic(
  params: CSRFCheckParams = {}
): Promise<{ success: boolean; result?: CSRFCheckResult; error?: string }> {
  try {
    const output = await checkCSRF(params);
    
    // Parse output to extract structured result
    const result: CSRFCheckResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalRoutes: 0,
        protectedRoutes: 0,
        unprotectedRoutes: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Extract summary numbers
    const routesMatch = output.match(/Total state-changing routes: (\d+)/);
    const protectedMatch = output.match(/Protected routes: (\d+)/);
    const unprotectedMatch = output.match(/Unprotected routes: (\d+)/);
    const errorsMatch = output.match(/Errors: (\d+)/);
    const warningsMatch = output.match(/Warnings: (\d+)/);
    
    if (routesMatch) result.summary.totalRoutes = parseInt(routesMatch[1], 10);
    if (protectedMatch) result.summary.protectedRoutes = parseInt(protectedMatch[1], 10);
    if (unprotectedMatch) result.summary.unprotectedRoutes = parseInt(unprotectedMatch[1], 10);
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

