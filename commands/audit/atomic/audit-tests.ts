/**
 * Atomic Command: /audit-tests [tier] [identifier] [feature-name]
 * Audit test content and coverage
 * 
 * Tier: Cross-tier utility
 * Operates on: Test quality evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { readFile } from 'fs/promises';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();

/**
 * Audit tests for a tier
 */
export async function auditTests(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  try {
    // Get test results if provided
    const testResults = params.testResults;
    let testPassed = false;
    let testCoverage: number | undefined;
    
    if (testResults) {
      // Parse test results
      if (testResults.success !== undefined) {
        testPassed = testResults.success;
      }
      
      if (testResults.coverage !== undefined) {
        testCoverage = testResults.coverage;
      } else if (testResults.results?.coverage?.output) {
        // Try to extract coverage from output string
        const coverageMatch = testResults.results.coverage.output.match(/(\d+(?:\.\d+)?)%/);
        if (coverageMatch) {
          testCoverage = parseFloat(coverageMatch[1]);
        }
      }
    }
    
    // Find test files for modified files
    let testFiles: string[] = [];
    let testFilesFound = 0;
    let testFilesWithHeaders = 0;
    
    if (params.modifiedFiles && params.modifiedFiles.length > 0) {
      for (const filePath of params.modifiedFiles) {
        // Skip test files themselves
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
          continue;
        }
        
        // Find corresponding test file
        const testPatterns = [
          filePath.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1'),
          filePath.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1'),
          filePath.replace(/(\.[^/]+)$/, '.test$1'),
          filePath.replace(/(\.[^/]+)$/, '.spec$1')
        ];
        
        // Also check __tests__ directories
        const dirParts = filePath.split('/');
        const fileName = dirParts[dirParts.length - 1];
        const baseDir = dirParts.slice(0, -1).join('/');
        testPatterns.push(`${baseDir}/__tests__/${fileName.replace(/\.(ts|tsx|js|jsx)$/, '.test.$1')}`);
        testPatterns.push(`${baseDir}/__tests__/${fileName.replace(/\.(ts|tsx|js|jsx)$/, '.spec.$1')}`);
        
        for (const pattern of testPatterns) {
          try {
            const fullPath = join(PROJECT_ROOT, pattern);
            await readFile(fullPath, 'utf-8');
            testFiles.push(pattern);
            testFilesFound++;
            break;
          } catch {
            // File doesn't exist, continue
          }
        }
      }
      
      // Check if test files exist for modified files
      const filesNeedingTests = params.modifiedFiles.length - testFilesFound;
      if (filesNeedingTests > 0) {
        findings.push({
          type: 'warning',
          message: `${filesNeedingTests} modified file(s) without corresponding test files`,
          location: 'modified files',
          suggestion: 'Create test files for new or modified code'
        });
        score -= filesNeedingTests * 5;
      }
    }
    
    // Check test file quality
    for (const testFile of testFiles) {
      try {
        const fullPath = join(PROJECT_ROOT, testFile);
        const content = await readFile(fullPath, 'utf-8');
        
        // Check for descriptive header comment
        const hasHeader = /^\/\*\*[\s\S]{50,}?\*\//m.test(content) ||
                         /^\/\/.*test.*description/i.test(content.split('\n')[0]);
        
        if (!hasHeader) {
          findings.push({
            type: 'warning',
            message: 'Test file missing descriptive header comment',
            location: testFile,
            suggestion: 'Add header comment explaining what the test covers'
          });
          score -= 2;
        } else {
          testFilesWithHeaders++;
        }
        
        // Check for proper test structure
        const hasDescribe = /describe\(/i.test(content);
        const hasIt = /it\(|test\(/i.test(content);
        
        if (!hasDescribe && !hasIt) {
          findings.push({
            type: 'warning',
            message: 'Test file missing proper test structure (describe/it blocks)',
            location: testFile,
            suggestion: 'Use describe() and it() or test() blocks for test organization'
          });
          score -= 3;
        }
        
        // Check for test coverage (basic heuristic)
        const testCount = (content.match(/(it\(|test\()/gi) || []).length;
        if (testCount === 0) {
          findings.push({
            type: 'error',
            message: 'Test file contains no actual tests',
            location: testFile,
            suggestion: 'Add test cases using it() or test()'
          });
          score -= 10;
        }
        
      } catch (error) {
        findings.push({
          type: 'error',
          message: `Failed to read test file: ${error instanceof Error ? error.message : String(error)}`,
          location: testFile
        });
        score -= 5;
      }
    }
    
    // Check test results
    if (testResults) {
      if (!testPassed) {
        findings.push({
          type: 'error',
          message: 'Tests failed',
          location: 'test execution',
          suggestion: 'Fix failing tests before completing workflow'
        });
        score -= 20;
      }
      
      if (testCoverage !== undefined) {
        if (testCoverage < 70) {
          findings.push({
            type: 'warning',
            message: `Test coverage is ${testCoverage.toFixed(1)}% (target: 70%+)`,
            location: 'test coverage',
            suggestion: 'Increase test coverage to meet standards'
          });
          score -= 10;
        } else if (testCoverage < 80) {
          findings.push({
            type: 'info',
            message: `Test coverage is ${testCoverage.toFixed(1)}% (good, but could be higher)`,
            location: 'test coverage'
          });
          score -= 2;
        }
      }
    } else {
      // No test results provided - check if tests should have been run
      if (params.tier === 'feature' || params.tier === 'phase') {
        findings.push({
          type: 'warning',
          message: 'No test results provided for audit',
          location: 'test execution',
          suggestion: 'Run tests and provide results for comprehensive audit'
        });
        score -= 5;
      }
    }
    
    // Generate recommendations
    if (testFilesFound === 0 && params.modifiedFiles && params.modifiedFiles.length > 0) {
      recommendations.push('Create test files for modified code');
      recommendations.push('Follow test file naming conventions (.test.ts or .spec.ts)');
    }
    
    if (testFilesFound > 0 && testFilesWithHeaders < testFilesFound) {
      recommendations.push('Add descriptive header comments to test files');
    }
    
    if (testPassed && testCoverage !== undefined && testCoverage >= 80) {
      recommendations.push('Test coverage and quality look good');
    } else if (testCoverage !== undefined && testCoverage < 70) {
      recommendations.push('Increase test coverage to meet standards (70%+)');
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (score < 70 || findings.some(f => f.type === 'error')) {
      status = 'fail';
    } else if (score < 85 || findings.some(f => f.type === 'warning')) {
      status = 'warn';
    }
    
    const summary = testFilesFound > 0
      ? `Found ${testFilesFound} test file(s). ${testFilesWithHeaders} with headers. ${testPassed ? 'Tests passed' : 'Tests failed'}. ${testCoverage !== undefined ? `Coverage: ${testCoverage.toFixed(1)}%` : 'Coverage: N/A'}.`
      : 'No test files found for modified code.';
    
    return {
      category: 'tests',
      status,
      score: Math.max(0, score),
      findings,
      recommendations,
      summary
    };
    
  } catch (error) {
    return {
      category: 'tests',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Test audit failed: ${error instanceof Error ? error.message : String(error)}`,
        location: params.tier
      }],
      recommendations: ['Review test structure and coverage'],
      summary: 'Test audit encountered an error'
    };
  }
}

