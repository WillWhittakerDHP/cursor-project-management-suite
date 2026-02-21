/**
 * Atomic Command: /feature-create [name] [description]
 * Create feature structure and documentation
 * 
 * Tier: Feature (Tier 0 - Highest Level)
 * Operates on: Feature-level workflow (creates feature directory structure and initial docs)
 */

import { readProjectFile, writeProjectFile, PROJECT_ROOT } from '../../../utils/utils';
import { join } from 'path';
import { mkdir } from 'fs/promises';
import { WorkflowCommandContext } from '../../../utils/command-context';

export async function featureCreate(featureName: string, description: string): Promise<string> {
  const output: string[] = [];
  
  const context = new WorkflowCommandContext(featureName);
  const featureDir = context.paths.getBasePath();
  const phasesDir = join(PROJECT_ROOT, featureDir, 'phases');
  const sessionsDir = join(PROJECT_ROOT, featureDir, 'sessions');
  
  try {
    // Create feature directory structure
    await mkdir(phasesDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    
    output.push(`# Feature ${featureName} Created\n`);
    output.push(`**Date:** ${new Date().toISOString().split('T')[0]}\n`);
    
    // Create feature guide
    const guideTemplate = await readProjectFile('.cursor/commands/tiers/feature/templates/feature-guide.md');
    const guideContent = guideTemplate
      .replace(/\[Name\]/g, featureName)
      .replace(/\[Brief description of feature objectives\]/g, description)
      .replace(/\[Estimated weeks\/months\]/g, '[To be determined]')
      .replace(/\[Date\]/g, new Date().toISOString().split('T')[0]);
    
    const guidePath = `${featureDir}/feature-${featureName}-guide.md`;
    await writeProjectFile(guidePath, guideContent);
    output.push(`**Guide Created:** ${guidePath}\n`);
    
    // Create feature log
    const logTemplate = await readProjectFile('.cursor/commands/tiers/feature/templates/feature-log.md');
    const logContent = logTemplate
      .replace(/\[Name\]/g, featureName)
      .replace(/\[Date\]/g, new Date().toISOString().split('T')[0]);
    
    const logPath = `${featureDir}/feature-${featureName}-log.md`;
    await writeProjectFile(logPath, logContent);
    output.push(`**Log Created:** ${logPath}\n`);
    
    // Create feature handoff
    const handoffTemplate = await readProjectFile('.cursor/commands/tiers/feature/templates/feature-handoff.md');
    const handoffContent = handoffTemplate
      .replace(/\[Name\]/g, featureName)
      .replace(/\[Date\]/g, new Date().toISOString().split('T')[0]);
    
    const handoffPath = `${featureDir}/feature-${featureName}-handoff.md`;
    await writeProjectFile(handoffPath, handoffContent);
    output.push(`**Handoff Created:** ${handoffPath}\n`);
    
    output.push('\n---\n');
    output.push('## Next Steps\n');
    output.push('1. Run `/feature-research [name]` to conduct research phase\n');
    output.push('2. Answer research questions\n');
    output.push('3. Update feature guide with research findings\n');
    output.push('4. Run `/feature-start [name]` to begin feature work\n');
    
  } catch (_error) {
    output.push(`**ERROR:** Failed to create feature structure\n`);
    output.push(`**Error:** ${_error instanceof Error ? _error.message : String(_error)}\n`);
  }
  
  return output.join('\n');
}

