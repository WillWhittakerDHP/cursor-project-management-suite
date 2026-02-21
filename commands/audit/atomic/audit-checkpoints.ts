/**
 * Atomic Command: /audit-checkpoints [tier] [identifier] [feature-name]
 * Audit checkpoint documentation
 * 
 * Tier: Cross-tier utility
 * Operates on: Checkpoint documentation evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { resolveFeatureName } from '../../utils';

/**
 * Audit checkpoints for a tier
 */
export async function auditCheckpoints(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  
  try {
    let logContent = '';
    let logPath = '';
    
    // Read log document based on tier
    if (params.tier === 'feature') {
      try {
        logContent = await context.readFeatureLog();
        logPath = context.paths.getFeatureLogPath();
      } catch (err) {
        console.warn('Audit checkpoints: feature log not found', err);
        findings.push({
          type: 'error',
          message: 'Feature log not found',
          location: 'feature log',
          suggestion: 'Create feature log'
        });
        score -= 30;
      }
    } else if (params.tier === 'phase') {
      try {
        logContent = await context.readPhaseLog(params.identifier);
        logPath = context.paths.getPhaseLogPath(params.identifier);
      } catch (err) {
        console.warn('Audit checkpoints: phase log not found', params.identifier, err);
        findings.push({
          type: 'error',
          message: `Phase ${params.identifier} log not found`,
          location: `phase-${params.identifier}-log.md`,
          suggestion: 'Create phase log'
        });
        score -= 30;
      }
    } else if (params.tier === 'session') {
      try {
        logContent = await context.readSessionLog(params.identifier);
        logPath = context.paths.getSessionLogPath(params.identifier);
      } catch (err) {
        console.warn('Audit checkpoints: session log not found', params.identifier, err);
        findings.push({
          type: 'error',
          message: `Session ${params.identifier} log not found`,
          location: `session-${params.identifier}-log.md`,
          suggestion: 'Create session log'
        });
        score -= 30;
      }
    } else if (params.tier === 'task') {
      // Tasks use session-level logs
      const parsed = params.identifier.match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (parsed) {
        const sessionId = `${parsed[1]}.${parsed[2]}`;
        try {
          logContent = await context.readSessionLog(sessionId);
          logPath = context.paths.getSessionLogPath(sessionId);
        } catch (err) {
          console.warn('Audit checkpoints: session log not found', sessionId, err);
          findings.push({
            type: 'error',
            message: `Session ${sessionId} log not found`,
            location: `session-${sessionId}-log.md`,
            suggestion: 'Create session log'
          });
          score -= 30;
        }
      }
    }
    
    if (!logContent) {
      return {
        category: 'checkpoints',
        status: 'fail',
        score: 0,
        findings,
        recommendations: ['Create log document for this tier'],
        summary: 'Log document not found'
      };
    }
    
    // Check for checkpoint entries
    const checkpointPatterns = [
      /## Checkpoint:/i,
      /### Checkpoint:/i,
      /Checkpoint:/i,
      /## Task.*✅/i,
      /### Task.*✅/i
    ];
    
    let checkpointCount = 0;
    for (const pattern of checkpointPatterns) {
      const matches = logContent.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        checkpointCount += matches.length;
      }
    }
    
    if (checkpointCount === 0) {
      findings.push({
        type: 'warning',
        message: 'No checkpoint entries found in log',
        location: logPath,
        suggestion: 'Document checkpoints after completing tasks'
      });
      score -= 20;
    }
    
    // Check checkpoint format compliance
    const checkpointSections = logContent.split(/##? Checkpoint:/i);
    let formattedCheckpoints = 0;
    let unformattedCheckpoints = 0;
    
    for (let i = 1; i < checkpointSections.length; i++) {
      const section = checkpointSections[i];
      
      // Check for required elements
      const hasCompleted = /Completed|completed/.test(section);
      const hasQuality = /Quality|quality/.test(section);
      const hasNext = /Next|next/.test(section);
      
      if (hasCompleted && hasQuality && hasNext) {
        formattedCheckpoints++;
      } else {
        unformattedCheckpoints++;
        findings.push({
          type: 'warning',
          message: 'Checkpoint entry missing required elements (Completed, Quality, Next)',
          location: `${logPath} (checkpoint ${i})`,
          suggestion: 'Use standard checkpoint format with Completed, Quality, and Next sections'
        });
        score -= 5;
      }
      
      // Check for learning checkpoint (for complex tasks)
      if (params.tier === 'task' || params.tier === 'session') {
        const hasLearning = /Learning|learning/.test(section);
        const hasComplexLogic = section.length > 500; // Heuristic for complex task
        
        if (hasComplexLogic && !hasLearning) {
          findings.push({
            type: 'info',
            message: 'Complex task checkpoint missing learning section',
            location: `${logPath} (checkpoint ${i})`,
            suggestion: 'Add learning checkpoint section for complex tasks'
          });
          score -= 2;
        }
      }
    }
    
    // Check for quality verification
    const hasQualityVerification = /verify|quality|checkpoint|test/i.test(logContent);
    if (!hasQualityVerification && checkpointCount > 0) {
      findings.push({
        type: 'warning',
        message: 'No quality verification mentioned in checkpoints',
        location: logPath,
        suggestion: 'Document quality verification in checkpoint entries'
      });
      score -= 10;
    }
    
    // Check checkpoint frequency (should have checkpoints for completed tasks)
    if (params.tier === 'session' || params.tier === 'task') {
      // Try to count tasks vs checkpoints
      const taskMatches = logContent.match(/### Task.*✅/g);
      const taskCount = taskMatches ? taskMatches.length : 0;
      
      if (taskCount > checkpointCount && taskCount > 0) {
        findings.push({
          type: 'warning',
          message: `More tasks completed (${taskCount}) than checkpoints documented (${checkpointCount})`,
          location: logPath,
          suggestion: 'Document checkpoints for all completed tasks'
        });
        score -= 10;
      }
    }
    
    // Generate recommendations
    if (checkpointCount === 0) {
      recommendations.push('Add checkpoint entries to log document');
      recommendations.push('Use standard checkpoint format: Completed, Quality, Next');
    } else if (unformattedCheckpoints > 0) {
      recommendations.push(`Format ${unformattedCheckpoints} checkpoint(s) using standard format`);
    }
    
    if (formattedCheckpoints > 0 && unformattedCheckpoints === 0) {
      recommendations.push('Checkpoint documentation is well-formatted');
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (score < 70) {
      status = 'fail';
    } else if (score < 85 || findings.some(f => f.type === 'warning')) {
      status = 'warn';
    }
    
    const summary = `Found ${checkpointCount} checkpoint(s). ${formattedCheckpoints} formatted correctly, ${unformattedCheckpoints} need formatting.`;
    
    return {
      category: 'checkpoints',
      status,
      score: Math.max(0, score),
      findings,
      recommendations,
      summary
    };
    
  } catch (_error) {
    return {
      category: 'checkpoints',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Checkpoint audit failed: ${_error instanceof Error ? _error.message : String(_error)}`,
        location: params.tier
      }],
      recommendations: ['Review checkpoint documentation structure'],
      summary: 'Checkpoint audit encountered an error'
    };
  }
}

