/**
 * Atomic Command: /audit-todos [tier] [identifier] [feature-name]
 * Audit todo creation and propagation
 * 
 * Tier: Cross-tier utility
 * Operates on: Todo system evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { getAllTodos } from '../../utils/todo-io';
import { getStatus, StatusTier } from '../../status/atomic/get-status';
import { WorkflowId } from '../../utils/id-utils';

/**
 * Audit todos for a tier
 */
export async function auditTodos(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  const featureName = params.featureName || 'vue-migration';
  
  try {
    // Get todo for this tier
    const statusTier: StatusTier = params.tier === 'task' ? 'session' : params.tier;
    const statusInfo = await getStatus({
      tier: statusTier,
      identifier: params.identifier,
      featureName
    });
    
    if (!statusInfo) {
      findings.push({
        type: 'error',
        message: `Todo not found for ${params.tier} ${params.identifier}`,
        location: `todo-${params.tier}-${params.identifier}`,
        suggestion: `Create todo using appropriate planning command`
      });
      score -= 30;
      
      return {
        category: 'todos',
        status: 'fail',
        score: Math.max(0, score),
        findings,
        recommendations: ['Create todo for this tier'],
        summary: 'Todo not found'
      };
    }
    
    // Check todo status is appropriate
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled', 'blocked'];
    if (!validStatuses.includes(statusInfo.status)) {
      findings.push({
        type: 'warning',
        message: `Todo status "${statusInfo.status}" is not a standard status`,
        location: statusInfo.todoId,
        suggestion: `Update todo status to one of: ${validStatuses.join(', ')}`
      });
      score -= 5;
    }
    
    // Check child todos (if applicable)
    if (params.tier === 'feature' || params.tier === 'phase' || params.tier === 'session') {
      const allTodos = await getAllTodos(featureName);
      
      // Find child todos
      let childCount = 0;
      let childCompleted = 0;
      
      if (params.tier === 'feature') {
        // Find phase todos
        childCount = allTodos.filter(t => 
          t.id.startsWith('phase-') && t.id !== statusInfo.todoId
        ).length;
        childCompleted = allTodos.filter(t => 
          t.id.startsWith('phase-') && 
          t.id !== statusInfo.todoId &&
          t.status === 'completed'
        ).length;
      } else if (params.tier === 'phase') {
        // Find session todos for this phase
        const phaseNum = params.identifier;
        childCount = allTodos.filter(t => {
          const parsed = WorkflowId.parseSessionId(t.id.replace('session-', ''));
          return parsed && parsed.phase === phaseNum;
        }).length;
        childCompleted = allTodos.filter(t => {
          const parsed = WorkflowId.parseSessionId(t.id.replace('session-', ''));
          return parsed && parsed.phase === phaseNum && t.status === 'completed';
        }).length;
      } else if (params.tier === 'session') {
        // Find task todos for this session
        const sessionId = params.identifier;
        childCount = allTodos.filter(t => {
          const parsed = WorkflowId.parseTaskId(t.id.replace('task-', ''));
          return parsed && `${parsed.phase}.${parsed.session}` === sessionId;
        }).length;
        childCompleted = allTodos.filter(t => {
          const parsed = WorkflowId.parseTaskId(t.id.replace('task-', ''));
          return parsed && 
                 `${parsed.phase}.${parsed.session}` === sessionId &&
                 t.status === 'completed';
        }).length;
      }
      
      if (childCount === 0 && (params.tier === 'feature' || params.tier === 'phase')) {
        findings.push({
          type: 'warning',
          message: `No child todos found for ${params.tier} ${params.identifier}`,
          location: statusInfo.todoId,
          suggestion: `Create child todos (${params.tier === 'feature' ? 'phases' : 'sessions'})`
        });
        score -= 10;
      } else if (childCount > 0) {
        const completionRate = childCompleted / childCount;
        if (completionRate < 0.5 && statusInfo.status === 'completed') {
          findings.push({
            type: 'warning',
            message: `Todo marked complete but only ${Math.round(completionRate * 100)}% of children complete`,
            location: statusInfo.todoId,
            suggestion: 'Update todo status or complete remaining child todos'
          });
          score -= 5;
        }
      }
    }
    
    // Check todo propagation (parent todo exists)
    if (params.tier !== 'feature') {
      let parentTodoId = '';
      
      if (params.tier === 'phase') {
        // Feature is parent
        const featureStatus = await getStatus({
          tier: 'feature',
          featureName
        });
        if (!featureStatus) {
          findings.push({
            type: 'warning',
            message: 'Parent feature todo not found',
            location: statusInfo.todoId,
            suggestion: 'Create feature todo'
          });
          score -= 5;
        }
      } else if (params.tier === 'session') {
        // Phase is parent
        const parsed = WorkflowId.parseSessionId(params.identifier);
        if (parsed) {
          const phaseStatus = await getStatus({
            tier: 'phase',
            identifier: parsed.phase,
            featureName
          });
          if (!phaseStatus) {
            findings.push({
              type: 'warning',
              message: `Parent phase todo not found for phase ${parsed.phase}`,
              location: statusInfo.todoId,
              suggestion: `Create phase ${parsed.phase} todo`
            });
            score -= 5;
          }
        }
      } else if (params.tier === 'task') {
        // Session is parent
        const parsed = WorkflowId.parseTaskId(params.identifier);
        if (parsed) {
          const sessionId = `${parsed.phase}.${parsed.session}`;
          const sessionStatus = await getStatus({
            tier: 'session',
            identifier: sessionId,
            featureName
          });
          if (!sessionStatus) {
            findings.push({
              type: 'warning',
              message: `Parent session todo not found for session ${sessionId}`,
              location: statusInfo.todoId,
              suggestion: `Create session ${sessionId} todo`
            });
            score -= 5;
          }
        }
      }
    }
    
    // Check for citations (if applicable)
    // Note: Citation checking would require access to citation system
    // For now, we'll skip this check
    
    // Generate recommendations
    if (score >= 90) {
      recommendations.push('Todo structure and propagation look good');
    } else if (score >= 70) {
      recommendations.push('Review todo structure and ensure proper propagation');
    } else {
      recommendations.push('Todo system needs attention - create missing todos');
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (score < 70) {
      status = 'fail';
    } else if (score < 85 || findings.some(f => f.type === 'warning')) {
      status = 'warn';
    }
    
    const summary = `Todo ${statusInfo.status} for ${params.tier} ${params.identifier}. ${findings.length} issue(s) found.`;
    
    return {
      category: 'todos',
      status,
      score: Math.max(0, score),
      findings,
      recommendations,
      summary
    };
    
  } catch (error) {
    return {
      category: 'todos',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Todo audit failed: ${error instanceof Error ? error.message : String(error)}`,
        location: params.tier
      }],
      recommendations: ['Review todo system structure'],
      summary: 'Todo audit encountered an error'
    };
  }
}

