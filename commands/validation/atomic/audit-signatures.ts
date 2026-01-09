/**
 * Atomic Command: Audit Signature Consistency
 * Validates parameter patterns, return types, and error handling
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { PROJECT_ROOT } from '../../utils/utils';
import { AuditResult, AuditIssue } from './audit-types';

interface CommandSignature {
  tier: string;
  command: string;
  file: string;
  params: string[];
  returnType?: string;
  hasErrorHandling: boolean;
}

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
 * Extract function signature from content
 */
function extractSignature(content: string, functionName: string): CommandSignature | null {
  // Find the function definition
  const functionPattern = new RegExp(
    `export\\s+(async\\s+)?function\\s+${functionName}\\s*\\(([^)]*)\\)\\s*:?\\s*(Promise<[^>]+>|[^\\s{]+)?`,
    's'
  );
  
  const match = content.match(functionPattern);
  if (!match) return null;
  
  const paramsStr = match[2] || '';
  const returnType = match[3];
  
  // Parse parameters
  const params = paramsStr
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      // Extract parameter name (before : or =)
      const nameMatch = p.match(/^([^:=\s]+)/);
      return nameMatch ? nameMatch[1] : p;
    });
  
  // Check for error handling (try-catch)
  const hasErrorHandling = content.includes('try') && content.includes('catch');
  
  return {
    tier: '', // Will be set by caller
    command: functionName,
    file: '', // Will be set by caller
    params,
    returnType: returnType || undefined,
    hasErrorHandling,
  };
}

/**
 * Check signature consistency
 */
export async function auditSignatures(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];

  const commandsDir = join(PROJECT_ROOT, '.cursor/commands/tiers');
  const tiers = ['feature', 'phase', 'session', 'task'];
  
  const signaturesByTier: Record<string, CommandSignature[]> = {};
  
  // Extract signatures for each tier
  for (const tier of tiers) {
    const tierDir = join(commandsDir, tier, 'composite');
    try {
      const files = await readdir(tierDir);
      const tierSignatures: CommandSignature[] = [];
      
      for (const file of files) {
        if (!file.endsWith('.ts')) continue;
        
        const filePath = join(tierDir, file);
        const content = await readFile(filePath, 'utf-8');
        
        // Extract tier and command name from filename
        const commandMatch = file.match(/^(\w+)-(\w+)\.ts$/);
        if (!commandMatch) continue;
        
        const [, tierPrefix, commandType] = commandMatch;
        if (tierPrefix !== tier) continue;
        
        // Find the main exported function (usually matches the file name pattern)
        const functionName = `${tier}${commandType.charAt(0).toUpperCase() + commandType.slice(1)}`;
        const signature = extractSignature(content, functionName);
        
        if (signature) {
          signature.tier = tier;
          signature.file = filePath;
          tierSignatures.push(signature);
        }
      }
      
      signaturesByTier[tier] = tierSignatures;
    } catch (error) {
      // Directory might not exist
      signaturesByTier[tier] = [];
    }
  }
  
  // Check consistency for start commands
  const startCommands = Object.values(signaturesByTier)
    .flat()
    .filter(s => s.command.includes('Start'));
  
  if (startCommands.length > 0) {
    const firstStart = startCommands[0];
    for (const startCmd of startCommands.slice(1)) {
      if (startCmd.params.length !== firstStart.params.length) {
        issues.push({
          severity: 'warning',
          message: `Parameter count mismatch: ${startCmd.command} has ${startCmd.params.length} params, expected ${firstStart.params.length}`,
          file: startCmd.file,
          suggestion: `Standardize ${startCmd.command} parameters to match other start commands`,
        });
      }
    }
  }
  
  // Check consistency for end commands
  const endCommands = Object.values(signaturesByTier)
    .flat()
    .filter(s => s.command.includes('End') || s.command.includes('Complete') || s.command.includes('Close'));
  
  if (endCommands.length > 0) {
    // Check return type consistency
    const returnTypes = endCommands.map(c => c.returnType).filter(Boolean);
    if (returnTypes.length > 0) {
      const firstReturnType = returnTypes[0];
      for (const endCmd of endCommands) {
        if (endCmd.returnType && endCmd.returnType !== firstReturnType && firstReturnType) {
          issues.push({
            severity: 'info',
            message: `Return type mismatch: ${endCmd.command} returns ${endCmd.returnType}, expected ${firstReturnType}`,
            file: endCmd.file,
            suggestion: 'Consider standardizing return types for consistency',
          });
        }
      }
    }
    
    // Check error handling consistency
    const hasErrorHandling = endCommands.filter(c => c.hasErrorHandling).length;
    const missingErrorHandling = endCommands.filter(c => !c.hasErrorHandling);
    
    if (hasErrorHandling > 0 && missingErrorHandling.length > 0) {
      for (const cmd of missingErrorHandling) {
        issues.push({
          severity: 'warning',
          message: `Missing error handling in ${cmd.command}`,
          file: cmd.file,
          suggestion: 'Add try-catch blocks for consistent error handling',
        });
      }
    }
  }
  
  // Check parameter naming consistency
  const paramNamePatterns: Record<string, string[]> = {};
  for (const tier of tiers) {
    const commands = signaturesByTier[tier];
    for (const cmd of commands) {
      for (const param of cmd.params) {
        if (!paramNamePatterns[param]) {
          paramNamePatterns[param] = [];
        }
        paramNamePatterns[param].push(`${cmd.tier}-${cmd.command}`);
      }
    }
  }
  
  // Check for inconsistent parameter names (e.g., sessionId vs session)
  const similarParams: Record<string, string[]> = {};
  const paramKeys = Object.keys(paramNamePatterns);
  for (let i = 0; i < paramKeys.length; i++) {
    for (let j = i + 1; j < paramKeys.length; j++) {
      const param1 = paramKeys[i];
      const param2 = paramKeys[j];
      
      // Check if they're similar (e.g., sessionId vs session)
      if (param1.includes(param2) || param2.includes(param1)) {
        if (!similarParams[param1]) {
          similarParams[param1] = [];
        }
        similarParams[param1].push(param2);
      }
    }
  }
  
  for (const [param, similar] of Object.entries(similarParams)) {
    if (similar.length > 0) {
      issues.push({
        severity: 'info',
        message: `Inconsistent parameter naming: ${param} vs ${similar.join(', ')}`,
        suggestion: 'Consider standardizing parameter names across commands',
      });
    }
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

  return {
    check: 'Signature Consistency',
    status,
    issues,
    recommendations,
    summary: `Found ${issues.length} signature consistency issues`,
  };
}

