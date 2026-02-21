/**
 * Atomic Command: /security-check-auth [path]
 * Check authentication patterns and middleware
 * 
 * Tier: Cross-tier utility
 * Operates on: Authentication pattern validation
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname } from 'path';

export interface AuthCheckParams {
  path?: string;
}

export interface AuthCheckResult {
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

// Authentication-related patterns
const AUTH_PATTERNS = [
  /auth/i,
  /authenticate/i,
  /requireAuth/i,
  /isAuthenticated/i,
  /verifyToken/i,
  /validateToken/i,
  /jwt/i,
  /session/i,
  /passport/i,
];

// Password hashing patterns (good)
const PASSWORD_HASHING_PATTERNS = [
  /bcrypt/i,
  /argon2/i,
  /scrypt/i,
  /pbkdf2/i,
];

// Plain password patterns (bad)
const PLAIN_PASSWORD_PATTERNS = [
  /password\s*[:=]\s*req\.body\.password/gi,
  /password\s*[:=]\s*req\.query\.password/gi,
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
 * Check authentication patterns
 * 
 * @param params Check parameters
 * @returns Formatted validation output
 */
export async function checkAuth(params: AuthCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || join(PROJECT_ROOT, 'server', 'src');
  
  const output: string[] = [];
  output.push('# Authentication Pattern Check\n');
  output.push('---\n\n');
  
  try {
    const result: AuthCheckResult = {
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
    
    // Check app.ts for global auth middleware
    const appFiles = [
      join(PROJECT_ROOT, 'server', 'src', 'app.ts'),
      join(PROJECT_ROOT, 'server', 'src', 'index.ts'),
      join(PROJECT_ROOT, 'server.ts'),
    ];
    
    let globalAuth = false;
    for (const appFile of appFiles) {
      if (existsSync(appFile)) {
        try {
          const content = readFileSync(appFile, 'utf-8');
          if (AUTH_PATTERNS.some(pattern => pattern.test(content))) {
            globalAuth = true;
            break;
          }
        } catch (err) {
          console.warn('Check auth: file not readable', appFile, err);
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
          } catch (err) {
            console.warn('Check auth: file not readable', fullPath, err);
            continue;
          }
        }
      } catch (err) {
        console.warn('Check auth: directory not readable', dirPath, err);
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
        
        // Check if file has auth middleware
        const hasAuth = AUTH_PATTERNS.some(pattern => pattern.test(content));
        
        // Find all routes (GET, POST, PUT, DELETE, PATCH)
        lines.forEach((line, index) => {
          const routeMatch = line.match(/router\.(get|post|put|delete|patch)\s*\(['"`]([^'"`]+)['"`]/i);
          if (routeMatch) {
            result.summary.totalRoutes++;
            const method = routeMatch[1].toUpperCase();
            const route = routeMatch[2];
            
            // Check if route should be protected (non-GET routes or sensitive GET routes)
            const shouldBeProtected = method !== 'GET' || 
              route.includes('admin') || 
              route.includes('user') || 
              route.includes('profile') ||
              route.includes('config');
            
            if (shouldBeProtected) {
              // Check for auth middleware before this route
              let hasRouteAuth = false;
              
              // Look backwards in file for middleware
              for (let i = index - 1; i >= Math.max(0, index - 20); i--) {
                if (AUTH_PATTERNS.some(pattern => pattern.test(lines[i]))) {
                  hasRouteAuth = true;
                  break;
                }
              }
              
              if (globalAuth || hasAuth || hasRouteAuth) {
                result.summary.protectedRoutes++;
              } else {
                result.summary.unprotectedRoutes++;
                result.errors.push({
                  file: relativePath,
                  line: index + 1,
                  route,
                  method,
                  issue: 'Route should be protected but no authentication middleware found',
                  severity: 'error',
                });
                result.summary.errorCount++;
              }
            }
          }
        });
      } catch (err) {
        console.warn('Check auth: route file not readable', routeFile, err);
      }
    }
    
    // Check for password hashing
    const checkPasswordHashing = (dirPath: string): void => {
      try {
        const entries = readdirSync(dirPath);
        
        for (const entry of entries) {
          const fullPath = join(dirPath, entry);
          
          if (IGNORE_PATTERNS.some(pattern => pattern.test(fullPath))) {
            continue;
          }
          
          try {
            const stat = statSync(fullPath);
            
            if (stat.isDirectory()) {
              checkPasswordHashing(fullPath);
            } else if (stat.isFile() && CHECK_EXTENSIONS.includes(extname(fullPath))) {
              const content = readFileSync(fullPath, 'utf-8');
              
              // Check for plain password storage
              if (PLAIN_PASSWORD_PATTERNS.some(pattern => pattern.test(content))) {
                const relativePath = fullPath.replace(PROJECT_ROOT + '/', '');
                result.errors.push({
                  file: relativePath,
                  line: 0,
                  route: 'N/A',
                  method: 'N/A',
                  issue: 'Potential plain password storage detected',
                  severity: 'error',
                });
                result.summary.errorCount++;
              }
              
              // Check for password hashing
              if (content.includes('password') && !PASSWORD_HASHING_PATTERNS.some(pattern => pattern.test(content))) {
                const relativePath = fullPath.replace(PROJECT_ROOT + '/', '');
                result.warnings.push({
                  file: relativePath,
                  route: 'N/A',
                  message: 'Password handling found but no hashing library detected',
                });
                result.summary.warningCount++;
              }
            }
          } catch (err) {
            console.warn('Check auth: file not readable (password hashing)', fullPath, err);
          }
        }
      } catch (err) {
        console.warn('Check auth: directory not readable (password hashing)', dirPath, err);
      }
    };
    
    if (existsSync(join(PROJECT_ROOT, 'server', 'src'))) {
      checkPasswordHashing(join(PROJECT_ROOT, 'server', 'src'));
    }
    
    // Check package.json for auth libraries
    const packageJsonPath = join(PROJECT_ROOT, 'server', 'package.json');
    let authLibraryFound = false;
    let passwordHashingFound = false;
    
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const allDeps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        
        if (allDeps.passport || allDeps['jsonwebtoken'] || allDeps['express-session']) {
          authLibraryFound = true;
        }
        
        if (allDeps.bcrypt || allDeps['argon2'] || allDeps['scrypt']) {
          passwordHashingFound = true;
        }
      } catch (err) {
        console.warn('Check auth: package.json parse failed', err);
      }
    }
    
    // Add warnings
    if (!authLibraryFound && result.summary.totalRoutes > 0) {
      result.warnings.push({
        file: 'package.json',
        route: 'all',
        message: 'No authentication library found - consider adding passport, jwt, or session management',
      });
      result.summary.warningCount++;
    }
    
    if (!passwordHashingFound) {
      result.warnings.push({
        file: 'package.json',
        route: 'all',
        message: 'No password hashing library found - ensure passwords are hashed before storage',
      });
      result.summary.warningCount++;
    }
    
    // Update valid flag
    if (result.summary.errorCount > 0) {
      result.valid = false;
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **Authentication pattern check passed**\n\n');
    } else {
      output.push('❌ **Authentication issues found**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Total routes checked: ${result.summary.totalRoutes}\n`);
    output.push(`- Protected routes: ${result.summary.protectedRoutes}\n`);
    output.push(`- Unprotected routes: ${result.summary.unprotectedRoutes}\n`);
    output.push(`- Errors: ${result.summary.errorCount}\n`);
    output.push(`- Warnings: ${result.summary.warningCount}\n\n`);
    
    // Errors
    if (result.errors.length > 0) {
      output.push('## Authentication Issues\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.file}${error.line > 0 ? `:${error.line}` : ''}**\n`);
        if (error.route !== 'N/A') {
          output.push(`  Route: ${error.method} ${error.route}\n`);
        }
        output.push(`  Issue: ${error.issue}\n\n`);
      }
      output.push('**Action Required:** Add authentication middleware to protected routes.\n\n');
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
      output.push('No authentication issues found.\n');
    }
    
    return output.join('\n');
  } catch (_error) {
    output.push(`**ERROR: Failed to check authentication patterns**\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
    return output.join('\n');
  }
}

/**
 * Check auth (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkAuthProgrammatic(
  params: AuthCheckParams = {}
): Promise<{ success: boolean; result?: AuthCheckResult; error?: string }> {
  try {
    const output = await checkAuth(params);
    
    // Parse output to extract structured result
    const result: AuthCheckResult = {
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
    const routesMatch = output.match(/Total routes checked: (\d+)/);
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
  } catch (_error) {
    return {
      success: false,
      error: _error instanceof Error ? _error.message : String(_error),
    };
  }
}

