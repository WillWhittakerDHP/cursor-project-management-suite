/**
 * Atomic Command: /audit-planning [tier] [identifier] [feature-name]
 * Audit planning outcomes and document quality
 * 
 * Tier: Cross-tier utility (skip for task tier)
 * Operates on: Planning document evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { MarkdownUtils } from '../../utils/markdown-utils';
import { resolveFeatureName } from '../../utils';

/**
 * Audit planning for a tier
 * Note: Skip for task tier (tasks don't have planning docs)
 */
export async function auditPlanning(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  // Skip for task tier
  if (params.tier === 'task') {
    return {
      category: 'planning',
      status: 'pass',
      score: 100,
      findings: [],
      recommendations: [],
      summary: 'Planning audit skipped for task tier (tasks use session-level planning)'
    };
  }
  
  const featureName = await resolveFeatureName(params.featureName);
  const context = new WorkflowCommandContext(featureName);
  
  try {
    let planningContent = '';
    let planningPath = '';
    
    // Read planning document based on tier
    if (params.tier === 'feature') {
      try {
        planningContent = await context.readFeatureGuide();
        planningPath = context.paths.getFeatureGuidePath();
      } catch (err) {
        console.warn('Audit planning: feature guide not found', err);
        findings.push({
          type: 'error',
          message: 'Feature guide not found',
          location: 'feature guide',
          suggestion: 'Create feature guide using /plan-feature command'
        });
        score -= 30;
      }
    } else if (params.tier === 'phase') {
      try {
        planningContent = await context.readPhaseGuide(params.identifier);
        planningPath = context.paths.getPhaseGuidePath(params.identifier);
      } catch (err) {
        console.warn('Audit planning: phase guide not found', params.identifier, err);
        findings.push({
          type: 'error',
          message: `Phase ${params.identifier} guide not found`,
          location: `phase-${params.identifier}-guide.md`,
          suggestion: 'Create phase guide using /phase-plan command'
        });
        score -= 30;
      }
    } else if (params.tier === 'session') {
      try {
        planningContent = await context.readSessionGuide(params.identifier);
        planningPath = context.paths.getSessionGuidePath(params.identifier);
      } catch (err) {
        console.warn('Audit planning: session guide not found', params.identifier, err);
        findings.push({
          type: 'error',
          message: `Session ${params.identifier} guide not found`,
          location: `session-${params.identifier}-guide.md`,
          suggestion: 'Create session guide using /plan-session command'
        });
        score -= 30;
      }
    }
    
    if (!planningContent) {
      return {
        category: 'planning',
        status: 'fail',
        score: 0,
        findings,
        recommendations: ['Create planning document for this tier'],
        summary: 'Planning document not found'
      };
    }
    
    // Check for required sections
    const requiredSections: Record<string, string[]> = {
      feature: ['Overview', 'Architecture', 'Implementation Plan', 'Success Criteria'],
      phase: ['Overview', 'Objectives', 'Tasks', 'Success Criteria'],
      session: ['Quick Start', 'Learning Goals', 'Tasks', 'Session Workflow']
    };
    
    const sections = requiredSections[params.tier] || [];
    const missingSections: string[] = [];
    
    for (const section of sections) {
      const sectionContent = MarkdownUtils.extractSection(planningContent, section);
      if (!sectionContent || sectionContent.trim().length < 50) {
        missingSections.push(section);
        findings.push({
          type: 'warning',
          message: `Missing or incomplete section: ${section}`,
          location: planningPath,
          suggestion: `Add or complete ${section} section in planning document`
        });
        score -= 10;
      }
    }
    
    // Check for planning outcomes (tasks completed, objectives met)
    if (params.tier === 'session' || params.tier === 'phase') {
      const tasksSection = MarkdownUtils.extractSection(planningContent, 'Tasks');
      if (tasksSection) {
        // Check if tasks are marked complete
        const taskMatches = tasksSection.match(/- \[([ x])\]/g);
        if (taskMatches) {
          const totalTasks = taskMatches.length;
          const completedTasks = taskMatches.filter(m => m.includes('x')).length;
          
          if (totalTasks > 0 && completedTasks === 0) {
            findings.push({
              type: 'warning',
              message: 'No tasks marked as complete in planning document',
              location: planningPath,
              suggestion: 'Update task checkboxes as tasks are completed'
            });
            score -= 5;
          }
        }
      }
    }
    
    // Check for alternatives considered (if applicable)
    if (planningContent.toLowerCase().includes('alternative') || 
        planningContent.toLowerCase().includes('consider')) {
      // Good - alternatives mentioned
    } else if (params.tier === 'feature' || params.tier === 'phase') {
      findings.push({
        type: 'info',
        message: 'No alternatives considered section found',
        location: planningPath,
        suggestion: 'Consider documenting alternatives for major architectural decisions'
      });
      score -= 2;
    }
    
    // Check for risk assessment (if applicable)
    if (planningContent.toLowerCase().includes('risk') || 
        planningContent.toLowerCase().includes('challenge') ||
        planningContent.toLowerCase().includes('blocker')) {
      // Good - risks mentioned
    } else if (params.tier === 'feature') {
      findings.push({
        type: 'info',
        message: 'No risk assessment section found',
        location: planningPath,
        suggestion: 'Consider documenting risks and mitigation strategies'
      });
      score -= 2;
    }
    
    // Check document completeness (length heuristic)
    const contentLength = planningContent.trim().length;
    const minLengths: Record<string, number> = {
      feature: 1000,
      phase: 500,
      session: 300
    };
    
    const minLength = minLengths[params.tier] || 200;
    if (contentLength < minLength) {
      findings.push({
        type: 'warning',
        message: `Planning document seems incomplete (${contentLength} chars, expected ~${minLength}+)`,
        location: planningPath,
        suggestion: 'Add more detail to planning document'
      });
      score -= 5;
    }
    
    // Generate recommendations
    if (missingSections.length > 0) {
      recommendations.push(`Add missing sections: ${missingSections.join(', ')}`);
    }
    
    if (score >= 90) {
      recommendations.push('Planning document is comprehensive and well-structured');
    } else if (score >= 70) {
      recommendations.push('Planning document is mostly complete - address missing sections');
    } else {
      recommendations.push('Planning document needs significant improvement');
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (score < 70) {
      status = 'fail';
    } else if (score < 85 || findings.some(f => f.type === 'warning')) {
      status = 'warn';
    }
    
    const summary = `Planning document ${status === 'pass' ? 'meets' : 'partially meets'} quality standards. ${missingSections.length} missing section(s).`;
    
    return {
      category: 'planning',
      status,
      score,
      findings,
      recommendations,
      summary
    };
    
  } catch (_error) {
    return {
      category: 'planning',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Planning audit failed: ${_error instanceof Error ? _error.message : String(_error)}`,
        location: params.tier
      }],
      recommendations: ['Review planning document structure and content'],
      summary: 'Planning audit encountered an error'
    };
  }
}

