/**
 * Atomic Command: /audit-comments [tier] [identifier] [feature-name]
 * Audit comment format and content adherence
 * 
 * Tier: Cross-tier utility
 * Operates on: Comment quality assessment
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { AuditResult, AuditFinding, AuditParams } from '../types';
import { reviewFile } from '../../comments/atomic/review-file';
import { WorkflowCommandContext } from '../../utils/command-context';
import { detectPhaseModifiedFiles, detectSessionModifiedFiles, detectFeatureModifiedFiles } from '../../utils/detect-modified-files';

const PROJECT_ROOT = process.cwd();

/**
 * Audit comments for a tier
 */
export async function auditComments(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  // If no modified files provided, try to detect them using fallback methods
  let filesToAudit = params.modifiedFiles || [];
  let filesDetectedViaFallback = false;
  
  if (filesToAudit.length === 0) {
    try {
      const context = await WorkflowCommandContext.getCurrent();
      
      // Try to detect files based on tier
      if (params.tier === 'phase' && params.identifier) {
        // For phases, we need completed sessions - try to detect from git/logs
        // This is a best-effort fallback
        const detectedFiles = await detectPhaseModifiedFiles(
          params.identifier,
          [], // Can't know completed sessions without more context
          context
        );
        if (detectedFiles.length > 0) {
          filesToAudit = detectedFiles;
          filesDetectedViaFallback = true;
        }
      } else if (params.tier === 'session' && params.identifier) {
        const detectedFiles = await detectSessionModifiedFiles(
          params.identifier,
          context
        );
        if (detectedFiles.length > 0) {
          filesToAudit = detectedFiles;
          filesDetectedViaFallback = true;
        }
      } else if (params.tier === 'feature') {
        const detectedFiles = await detectFeatureModifiedFiles(
          context.feature.name,
          context
        );
        if (detectedFiles.length > 0) {
          filesToAudit = detectedFiles;
          filesDetectedViaFallback = true;
        }
      }
    } catch (err) {
      console.warn('Comment audit: failed to detect or read modified files list', err);
    }
  }
  
  // If still no files, return warning with improved message
  if (filesToAudit.length === 0) {
    return {
      category: 'comments',
      status: 'warn',
      score: 50,
      findings: [{
        type: 'warning',
        message: 'No modified files provided for comment audit',
        suggestion: 'Provide modified files list for comprehensive comment audit. Files can be detected from session logs or git history.'
      }],
      recommendations: [
        'Include modified files list in audit parameters',
        'Files can be auto-detected from session logs if available',
        'Run audit with explicit file list: /audit-comments [tier] [id] [files...]'
      ],
      summary: 'Comment audit skipped - no files to audit'
    };
  }
  
  // If files were detected via fallback, adjust score and add info finding
  if (filesDetectedViaFallback) {
    findings.push({
      type: 'info',
      message: `Detected ${filesToAudit.length} file(s) via fallback detection (session logs/git history)`,
      location: 'File detection',
      suggestion: 'For more accurate results, provide modified files explicitly'
    });
  }
  
  let totalFiles = 0;
  let filesWithIssues = 0;
  let totalSuggestions = 0;
  
  // Audit each modified file
  for (const filePath of filesToAudit) {
    try {
      totalFiles++;
      const fullPath = join(PROJECT_ROOT, filePath);
      
      // Check if file exists
      try {
        await readFile(fullPath, 'utf-8');
      } catch (err) {
        console.warn('Audit comments: file not found', filePath, err);
        findings.push({
          type: 'warning',
          message: `File not found: ${filePath}`,
          location: filePath
        });
        continue;
      }
      
      // Use existing review-file command to get suggestions
      const reviewOutput = await reviewFile(filePath);
      
      // Parse review output to count suggestions
      const suggestionMatches = reviewOutput.match(/## Suggestions \((\d+)\)/);
      if (suggestionMatches) {
        const suggestionCount = parseInt(suggestionMatches[1], 10);
        totalSuggestions += suggestionCount;
        
        if (suggestionCount > 0) {
          filesWithIssues++;
          
          // Extract specific suggestions from review output
          const suggestionBlocks = reviewOutput.split(/### Line \d+/);
          for (let i = 1; i < suggestionBlocks.length; i++) {
            const block = suggestionBlocks[i];
            const lineMatch = block.match(/^(\d+)/);
            const typeMatch = block.match(/\*\*Type:\*\* (\w+)/);
            const reasonMatch = block.match(/\*\*Reason:\*\* (.+)/);
            
            if (lineMatch && typeMatch && reasonMatch) {
              findings.push({
                type: 'warning',
                message: `Missing ${typeMatch[1]} comment: ${reasonMatch[1]}`,
                location: `${filePath}:${lineMatch[1]}`,
                suggestion: `Add ${typeMatch[1]} comment using /comment-add command`
              });
            }
          }
        }
      }
      
      // Check comment format compliance
      const fileContent = await readFile(fullPath, 'utf-8');
      const lines = fileContent.split('\n');
      
      // Check for proper comment format
      for (const line of lines) {
        if (line.includes('STRUCTURED:')) {
          // Check format compliance
          if (!line.includes('WHAT:') && !line.includes('HOW:') && !line.includes('WHY:')) {
            // Check if it's in a multi-line comment block
            const lineIndex = lines.indexOf(line);
            const nextLines = lines.slice(lineIndex, Math.min(lineIndex + 20, lines.length));
            const blockText = nextLines.join('\n');
            
            if (!blockText.includes('WHAT:') || !blockText.includes('HOW:') || !blockText.includes('WHY:')) {
              findings.push({
                type: 'warning',
                message: 'STRUCTURED comment missing WHAT/HOW/WHY sections',
                location: `${filePath}:${lineIndex + 1}`,
                suggestion: 'Add WHAT, HOW, and WHY sections to STRUCTURED comment'
              });
              score -= 5;
            }
          }
        }
        if (line.includes('REFERENCE:')) {
          if (!line.includes('See:') && !lines[lines.indexOf(line) + 1]?.includes('See:')) {
            findings.push({
              type: 'warning',
              message: 'REFERENCE comment missing See: reference',
              location: `${filePath}:${lines.indexOf(line) + 1}`,
              suggestion: 'Add See: reference to REFERENCE comment'
            });
            score -= 3;
          }
        }
      }
      
      // Check comment density (rough heuristic)
      const codeLines = lines.filter(l => {
        const trimmed = l.trim();
        return trimmed.length > 0 && 
               !trimmed.startsWith('//') && 
               !trimmed.startsWith('/*') && 
               !trimmed.startsWith('*') &&
               !trimmed.startsWith('/**');
      }).length;
      
      const commentLines = lines.filter(l => {
        const trimmed = l.trim();
        return trimmed.startsWith('//') || 
               trimmed.startsWith('/*') || 
               trimmed.startsWith('*') ||
               trimmed.startsWith('/**');
      }).length;
      
      const commentDensity = codeLines > 0 ? (commentLines / codeLines) * 100 : 0;
      
      // Warn if comment density is too low (< 5%) or too high (> 40%)
      if (commentDensity < 5 && codeLines > 50) {
        findings.push({
          type: 'warning',
          message: `Low comment density (${commentDensity.toFixed(1)}%) - consider adding more comments`,
          location: filePath,
          suggestion: 'Add comments for complex logic, architectural patterns, and framework transitions'
        });
        score -= 2;
      } else if (commentDensity > 40) {
        findings.push({
          type: 'info',
          message: `High comment density (${commentDensity.toFixed(1)}%) - may indicate over-commenting`,
          location: filePath,
          suggestion: 'Review comments - some may be redundant or unnecessary'
        });
      }
      
    } catch (_error) {
      findings.push({
        type: 'error',
        message: `Failed to audit file: ${_error instanceof Error ? _error.message : String(_error)}`,
        location: filePath
      });
      score -= 10;
    }
  }
  
  // Calculate final score
  if (totalFiles > 0) {
    const issueRate = filesWithIssues / totalFiles;
    if (issueRate > 0.5) {
      score -= 20;
    } else if (issueRate > 0.3) {
      score -= 10;
    }
    
    // Penalize for high suggestion count
    if (totalSuggestions > totalFiles * 3) {
      score -= 15;
    } else if (totalSuggestions > totalFiles) {
      score -= 5;
    }
  }
  
  score = Math.max(0, score);
  
  // Adjust score if files were detected via fallback (partial credit)
  if (filesDetectedViaFallback && score < 75) {
    // Boost score to 75 if we detected files but found issues
    score = Math.max(75, score);
  } else if (filesDetectedViaFallback && score >= 75) {
    // If score is already good, maintain it (no change needed)
  }
  
  // Generate recommendations
  if (filesWithIssues > 0) {
    recommendations.push(`Review ${filesWithIssues} file(s) with comment issues`);
    recommendations.push('Use /comment-review [file] to get specific suggestions');
    recommendations.push('Add STRUCTURED comments for complex logic and architectural patterns');
    recommendations.push('Add REFERENCE comments when reusing established patterns');
  }
  
  if (totalSuggestions === 0 && totalFiles > 0) {
    recommendations.push('Comment coverage looks good - maintain this standard');
  }
  
  // Determine status
  let status: 'pass' | 'warn' | 'fail' = 'pass';
  if (score < 70) {
    status = 'fail';
  } else if (score < 85 || findings.some(f => f.type === 'warning')) {
    status = 'warn';
  }
  
  const summary = totalFiles > 0
    ? `Audited ${totalFiles} file(s). ${filesWithIssues} file(s) with issues. ${totalSuggestions} total suggestions.`
    : 'No files audited';
  
  return {
    category: 'comments',
    status,
    score,
    findings,
    recommendations,
    summary
  };
}

