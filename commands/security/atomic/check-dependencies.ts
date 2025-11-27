/**
 * Atomic Command: /security-check-dependencies [path] [--strict]
 * Check for vulnerable dependencies using npm audit
 * 
 * Tier: Cross-tier utility
 * Operates on: Dependency vulnerability scanning
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface DependenciesCheckParams {
  path?: string;
  strict?: boolean;
}

export interface DependenciesCheckResult {
  valid: boolean;
  errors: Array<{
    package: string;
    version: string;
    severity: string;
    advisory: string;
    path: string;
  }>;
  warnings: Array<{
    package: string;
    version: string;
    severity: string;
    advisory: string;
    path: string;
  }>;
  summary: {
    totalPackages: number;
    errorCount: number;
    warningCount: number;
  };
}

/**
 * Check for vulnerable dependencies using npm audit
 * 
 * @param params Check parameters
 * @returns Formatted validation output (does NOT include full vulnerability details to avoid context pollution)
 */
export async function checkDependencies(params: DependenciesCheckParams = {}): Promise<string> {
  const PROJECT_ROOT = process.cwd();
  const targetPath = params.path || PROJECT_ROOT;
  const strict = params.strict || false;
  
  const output: string[] = [];
  output.push('# Dependency Vulnerability Check\n');
  output.push('---\n\n');
  
  try {
    // Check if package.json exists, walk up directory tree if needed
    let packageJsonPath = join(targetPath, 'package.json');
    let searchPath = targetPath;
    let foundPackageJson = existsSync(packageJsonPath);
    
    // If not found, walk up directory tree to find package.json
    if (!foundPackageJson) {
      const pathParts = searchPath.split('/');
      for (let i = pathParts.length - 1; i > 0; i--) {
        const parentPath = pathParts.slice(0, i).join('/');
        const candidatePath = join(PROJECT_ROOT, parentPath, 'package.json');
        if (existsSync(candidatePath)) {
          packageJsonPath = candidatePath;
          searchPath = join(PROJECT_ROOT, parentPath);
          foundPackageJson = true;
          break;
        }
      }
    }
    
    if (!foundPackageJson) {
      output.push('⚠️ **package.json not found**\n');
      output.push(`Searched in: ${targetPath} and parent directories\n`);
      output.push('Please run this command from a directory with package.json.\n');
      output.push('**Suggestion:** If path is `server/src`, package.json should be in `server/` directory.\n');
      return output.join('\n');
    }
    
    // Check if node_modules exists (use same search path as package.json)
    const nodeModulesPath = join(searchPath, 'node_modules');
    if (!existsSync(nodeModulesPath)) {
      output.push('⚠️ **node_modules not found**\n');
      output.push(`Searched in: ${searchPath}\n`);
      output.push('Please run `npm install` first.\n');
      return output.join('\n');
    }
    
    // Run npm audit
    const result: DependenciesCheckResult = {
      valid: true,
      errors: [],
      warnings: [],
      summary: {
        totalPackages: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    try {
      const auditCommand = `cd "${searchPath}" && npm audit --json`;
      const auditOutput = execSync(auditCommand, {
        encoding: 'utf-8',
        cwd: PROJECT_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      const auditData = JSON.parse(auditOutput);
      
      // Parse vulnerabilities
      if (auditData.vulnerabilities) {
        const vulnerabilities = auditData.vulnerabilities;
        result.summary.totalPackages = Object.keys(vulnerabilities).length;
        
        for (const [packageName, vulnData] of Object.entries(vulnerabilities)) {
          const vuln = vulnData as any;
          const severity = vuln.severity || 'unknown';
          const version = vuln.version || 'unknown';
          const advisory = vuln.url || vuln.id || 'N/A';
          
          const issue = {
            package: packageName,
            version,
            severity,
            advisory,
            path: vuln.path || packageName,
          };
          
          // High and critical are errors, moderate/low are warnings
          if (severity === 'high' || severity === 'critical') {
            result.errors.push(issue);
            result.summary.errorCount++;
          } else if (severity === 'moderate' || (strict && severity === 'low')) {
            result.warnings.push(issue);
            result.summary.warningCount++;
          }
        }
      }
      
      // Update valid flag
      if (result.summary.errorCount > 0 || (strict && result.summary.warningCount > 0)) {
        result.valid = false;
      }
    } catch (error: any) {
      // npm audit exits with non-zero code if vulnerabilities found
      if (error.stdout) {
        try {
          const auditData = JSON.parse(error.stdout);
          
          if (auditData.vulnerabilities) {
            const vulnerabilities = auditData.vulnerabilities;
            result.summary.totalPackages = Object.keys(vulnerabilities).length;
            
            for (const [packageName, vulnData] of Object.entries(vulnerabilities)) {
              const vuln = vulnData as any;
              const severity = vuln.severity || 'unknown';
              const version = vuln.version || 'unknown';
              const advisory = vuln.url || vuln.id || 'N/A';
              
              const issue = {
                package: packageName,
                version,
                severity,
                advisory,
                path: vuln.path || packageName,
              };
              
              if (severity === 'high' || severity === 'critical') {
                result.errors.push(issue);
                result.summary.errorCount++;
              } else if (severity === 'moderate' || (strict && severity === 'low')) {
                result.warnings.push(issue);
                result.summary.warningCount++;
              }
            }
          }
          
          if (result.summary.errorCount > 0 || (strict && result.summary.warningCount > 0)) {
            result.valid = false;
          }
        } catch (parseError) {
          output.push('⚠️ **Could not parse npm audit output**\n');
          output.push(`Error: ${error.message}\n\n`);
          return output.join('\n');
        }
      } else {
        output.push('⚠️ **npm audit execution failed**\n');
        output.push(`Error: ${error.message}\n\n`);
        return output.join('\n');
      }
    }
    
    // Output results
    if (result.valid) {
      output.push('✅ **No critical dependency vulnerabilities found**\n\n');
    } else {
      output.push('❌ **Dependency vulnerabilities detected**\n\n');
    }
    
    // Summary
    output.push('## Summary\n\n');
    output.push(`- Packages checked: ${result.summary.totalPackages}\n`);
    output.push(`- Critical/High severity: ${result.summary.errorCount}\n`);
    output.push(`- Moderate/Low severity: ${result.summary.warningCount}\n\n`);
    
    // Errors (without full vulnerability details to avoid context pollution)
    if (result.errors.length > 0) {
      output.push('## Critical Vulnerabilities\n\n');
      for (const error of result.errors) {
        output.push(`- ❌ **${error.package}@${error.version}**\n`);
        output.push(`  Severity: ${error.severity}\n`);
        output.push(`  Path: ${error.path}\n`);
        output.push(`  Advisory: ${error.advisory}\n\n`);
      }
      output.push('**Action Required:** Update or replace vulnerable packages.\n\n');
    }
    
    // Warnings
    if (result.warnings.length > 0) {
      output.push('## Moderate Vulnerabilities\n\n');
      for (const warning of result.warnings) {
        output.push(`- ⚠️ **${warning.package}@${warning.version}**\n`);
        output.push(`  Severity: ${warning.severity}\n`);
        output.push(`  Path: ${warning.path}\n\n`);
      }
      output.push('**Recommendation:** Review and update packages when possible.\n\n');
    }
    
    if (result.errors.length === 0 && result.warnings.length === 0) {
      output.push('No dependency vulnerabilities found.\n');
    }
    
    return output.join('\n');
  } catch (error) {
    output.push(`**ERROR: Failed to check dependencies**\n`);
    output.push(`**Error:** ${error instanceof Error ? error.message : String(error)}\n`);
    output.push('\n**Note:** Make sure npm is installed and package.json exists.\n');
    return output.join('\n');
  }
}

/**
 * Check dependencies (programmatic API)
 * 
 * @param params Check parameters
 * @returns Structured validation result
 */
export async function checkDependenciesProgrammatic(
  params: DependenciesCheckParams = {}
): Promise<{ success: boolean; result?: DependenciesCheckResult; error?: string }> {
  try {
    const output = await checkDependencies(params);
    
    // Parse output to extract structured result
    const result: DependenciesCheckResult = {
      valid: !output.includes('❌'),
      errors: [],
      warnings: [],
      summary: {
        totalPackages: 0,
        errorCount: 0,
        warningCount: 0,
      },
    };
    
    // Extract summary numbers
    const packagesMatch = output.match(/Packages checked: (\d+)/);
    const errorsMatch = output.match(/Critical\/High severity: (\d+)/);
    const warningsMatch = output.match(/Moderate\/Low severity: (\d+)/);
    
    if (packagesMatch) result.summary.totalPackages = parseInt(packagesMatch[1], 10);
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

