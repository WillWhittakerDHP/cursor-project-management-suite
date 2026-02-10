/**
 * Atomic Command: /audit-docs [tier] [identifier] [feature-name]
 * Audit guide, log, and handover document quality
 * 
 * Tier: Cross-tier utility (skip for task tier)
 * Operates on: Document quality evaluation
 */

import { AuditResult, AuditFinding, AuditParams } from '../types';
import { WorkflowCommandContext } from '../../utils/command-context';
import { MarkdownUtils } from '../../utils/markdown-utils';

/**
 * Audit docs for a tier
 * Note: Skip for task tier (tasks use session-level docs)
 */
export async function auditDocs(params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];
  let score = 100;
  
  // Skip for task tier
  if (params.tier === 'task') {
    return {
      category: 'docs',
      status: 'pass',
      score: 100,
      findings: [],
      recommendations: [],
      summary: 'Docs audit skipped for task tier (tasks use session-level docs)'
    };
  }
  
  const featureName = params.featureName || 'vue-migration';
  const context = new WorkflowCommandContext(featureName);
  
  try {
    // Audit guide document
    let guideContent = '';
    let guidePath = '';
    let guideExists = false;
    
    try {
      if (params.tier === 'feature') {
        guideContent = await context.readFeatureGuide();
        guidePath = context.paths.getFeatureGuidePath();
        guideExists = true;
      } else if (params.tier === 'phase') {
        guideContent = await context.readPhaseGuide(params.identifier);
        guidePath = context.paths.getPhaseGuidePath(params.identifier);
        guideExists = true;
      } else if (params.tier === 'session') {
        guideContent = await context.readSessionGuide(params.identifier);
        guidePath = context.paths.getSessionGuidePath(params.identifier);
        guideExists = true;
      }
    } catch {} {
      findings.push({
        type: 'error',
        message: `Guide document not found for ${params.tier} ${params.identifier}`,
        location: guidePath || `${params.tier} guide`,
        suggestion: `Create guide document using appropriate planning command`
      });
      score -= 20;
    }
    
    // Check guide required sections
    if (guideExists && guideContent) {
      const requiredSections: Record<string, string[]> = {
        feature: ['Overview', 'Architecture', 'Implementation Plan'],
        phase: ['Overview', 'Objectives', 'Tasks'],
        session: ['Quick Start', 'Learning Goals', 'Tasks', 'Session Workflow']
      };
      
      const sections = requiredSections[params.tier] || [];
      const missingGuideSections: string[] = [];
      
      for (const section of sections) {
        const sectionContent = MarkdownUtils.extractSection(guideContent, section);
        if (!sectionContent || sectionContent.trim().length < 30) {
          missingGuideSections.push(section);
          findings.push({
            type: 'warning',
            message: `Guide missing or incomplete section: ${section}`,
            location: guidePath,
            suggestion: `Add or complete ${section} section in guide`
          });
          score -= 5;
        }
      }
    }
    
    // Audit log document
    let logContent = '';
    let logPath = '';
    let logExists = false;
    
    try {
      if (params.tier === 'feature') {
        logContent = await context.readFeatureLog();
        logPath = context.paths.getFeatureLogPath();
        logExists = true;
      } else if (params.tier === 'phase') {
        logContent = await context.readPhaseLog(params.identifier);
        logPath = context.paths.getPhaseLogPath(params.identifier);
        logExists = true;
      } else if (params.tier === 'session') {
        logContent = await context.readSessionLog(params.identifier);
        logPath = context.paths.getSessionLogPath(params.identifier);
        logExists = true;
      }
    } catch {} {
      findings.push({
        type: 'warning',
        message: `Log document not found for ${params.tier} ${params.identifier}`,
        location: logPath || `${params.tier} log`,
        suggestion: 'Create log document to track progress'
      });
      score -= 10;
    }
    
    // Check log entries format
    if (logExists && logContent) {
      // Check for task entries (for session/phase logs)
      if (params.tier === 'session' || params.tier === 'phase') {
        const taskEntries = logContent.match(/### Task.*✅/g);
        if (!taskEntries || taskEntries.length === 0) {
          findings.push({
            type: 'warning',
            message: 'Log document has no completed task entries',
            location: logPath,
            suggestion: 'Add task entries to log as tasks are completed'
          });
          score -= 5;
        }
      }
      
      // Check log structure (should have status section)
      const hasStatus = /##.*Status|Session Status|Phase Status/i.test(logContent);
      if (!hasStatus) {
        findings.push({
          type: 'info',
          message: 'Log document missing status section',
          location: logPath,
          suggestion: 'Add status section to log document'
        });
        score -= 2;
      }
    }
    
    // Audit handover document
    let handoffContent = '';
    let handoffPath = '';
    let handoffExists = false;
    
    try {
      if (params.tier === 'feature') {
        handoffContent = await context.readFeatureHandoff();
        handoffPath = context.paths.getFeatureHandoffPath();
        handoffExists = true;
      } else if (params.tier === 'phase') {
        handoffContent = await context.readPhaseHandoff(params.identifier);
        handoffPath = context.paths.getPhaseHandoffPath(params.identifier);
        handoffExists = true;
      } else if (params.tier === 'session') {
        handoffContent = await context.readSessionHandoff(params.identifier);
        handoffPath = context.paths.getSessionHandoffPath(params.identifier);
        handoffExists = true;
      }
    } catch {} {
      findings.push({
        type: 'warning',
        message: `Handover document not found for ${params.tier} ${params.identifier}`,
        location: handoffPath || `${params.tier} handoff`,
        suggestion: 'Create handover document for transition context'
      });
      score -= 10;
    }
    
    // Check handover required sections
    if (handoffExists && handoffContent) {
      const requiredHandoffSections = ['Current Status', 'Next Action', 'Transition Context'];
      const missingHandoffSections: string[] = [];
      
      for (const section of requiredHandoffSections) {
        const sectionContent = MarkdownUtils.extractSection(handoffContent, section);
        if (!sectionContent || sectionContent.trim().length < 20) {
          missingHandoffSections.push(section);
          findings.push({
            type: 'warning',
            message: `Handover missing or incomplete section: ${section}`,
            location: handoffPath,
            suggestion: `Add or complete ${section} section in handover`
          });
          score -= 5;
        }
      }
      
      // Check handover is minimal (should be ~100-200 lines)
      const lineCount = handoffContent.split('\n').length;
      if (lineCount > 300) {
        findings.push({
          type: 'info',
          message: `Handover document is long (${lineCount} lines) - consider keeping it minimal`,
          location: handoffPath,
          suggestion: 'Keep handover documents concise (~100-200 lines)'
        });
        score -= 2;
      }
    }
    
    // Check document structure compliance (compare to templates)
    // This is a basic check - full template compliance would require template parsing
    
    // Generate recommendations
    if (!guideExists) {
      recommendations.push('Create guide document');
    }
    
    if (!logExists) {
      recommendations.push('Create log document');
    }
    
    if (!handoffExists) {
      recommendations.push('Create handover document');
    }
    
    if (guideExists && logExists && handoffExists) {
      if (score >= 90) {
        recommendations.push('Documentation is comprehensive and well-structured');
      } else {
        recommendations.push('Review documentation structure and completeness');
      }
    }
    
    // Determine status
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (score < 70 || !guideExists) {
      status = 'fail';
    } else if (score < 85 || findings.some(f => f.type === 'warning')) {
      status = 'warn';
    }
    
    const docsStatus = [];
    if (guideExists) docsStatus.push('guide');
    if (logExists) docsStatus.push('log');
    if (handoffExists) docsStatus.push('handoff');
    
    const summary = `${docsStatus.length}/3 documents exist. ${findings.length} issue(s) found.`;
    
    return {
      category: 'docs',
      status,
      score: Math.max(0, score),
      findings,
      recommendations,
      summary
    };
    
  } catch (error) {
    return {
      category: 'docs',
      status: 'fail',
      score: 0,
      findings: [{
        type: 'error',
        message: `Docs audit failed: ${error instanceof Error ? error.message : String(error)}`,
        location: params.tier
      }],
      recommendations: ['Review documentation structure'],
      summary: 'Docs audit encountered an error'
    };
  }
}

