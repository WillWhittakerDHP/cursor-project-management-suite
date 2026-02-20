/**
 * Planning Document Generator
 * 
 * Generates workflow documents (guide, handoff, log) from parsed planning data.
 * 
 * LEARNING: Separates generation logic from parsing logic
 * WHY: Enables reuse of generation logic and easier testing
 * PATTERN: Template-based generation with structured data injection
 */

import type { ParsedFeaturePlan, ParsedPhasePlan } from './planning-doc-parser';

/**
 * Generate feature guide from parsed plan
 * 
 * @param parsedPlan Parsed feature plan data
 * @param template Feature guide template
 * @returns Generated feature guide content
 */
export function generateFeatureGuideFromPlan(
  parsedPlan: ParsedFeaturePlan,
  template: string
): string {
  let content = template;
  
  // Replace basic placeholders
  content = content.replace(/\[Name\]/g, parsedPlan.name);
  content = content.replace(/\[Brief description of feature objectives\]/g, parsedPlan.overview);
  content = content.replace(/\[Estimated weeks\/months\]/g, '[To be determined]');

  // Replace date placeholders (distinct so Completed is not filled at feature start)
  content = content.replace(/\[StartDate\]/g, parsedPlan.metadata.created);
  content = content.replace(/\[CompletedDate\]/g, '—');
  
  // Replace status
  content = content.replace(/\[Not Started \/ Research \/ Planning \/ In Progress \/ Complete\]/g, parsedPlan.metadata.status);
  content = content.replace(/\[Status\]/g, parsedPlan.metadata.status);
  
  // Replace Feature Objectives section
  const objectivesList = parsedPlan.objectives.length > 0
    ? parsedPlan.objectives.map(obj => `- ${obj}`).join('\n')
    : '- [Objective 1]\n- [Objective 2]\n- [Objective 3]';
  content = content.replace(/- \[Objective 1\]\n- \[Objective 2\]\n- \[Objective 3\]/g, objectivesList);
  
  // Replace Phases Breakdown section
  const phasesList = parsedPlan.phases.length > 0
    ? parsedPlan.phases.map(phase => {
        const sessionsNote = phase.tasks ? `**Sessions:** ${phase.tasks.length} sessions` : '**Sessions:** [Number of sessions]';
        return `- [ ] ### Phase ${phase.number}: ${phase.name}\n**Description:** ${phase.description}\n**Duration:** [Estimated weeks]\n${sessionsNote}\n**Dependencies:** [Prerequisites]\n**Success Criteria:**\n${phase.successCriteria.map(c => `- ${c}`).join('\n')}`;
      }).join('\n\n')
    : '- [ ] ### Phase [N]: [Phase Name]\n**Description:** [What this phase accomplishes]\n**Duration:** [Estimated weeks]\n**Sessions:** [Number of sessions]\n**Dependencies:** [Prerequisites]\n**Success Criteria:**\n- [Criterion 1]\n- [Criterion 2]';
  content = content.replace(/- \[ \] ### Phase \[N\]: \[Phase Name\].*?- \[Criterion 2\]/gs, phasesList);
  
  // Replace Dependencies section
  const dependenciesList = parsedPlan.dependencies.length > 0
    ? parsedPlan.dependencies.map(dep => `- ${dep}`).join('\n')
    : '- [Dependency 1]\n- [Dependency 2]';
  content = content.replace(/- \[Dependency 1\]\n- \[Dependency 2\]/g, dependenciesList);
  
  // Replace Success Criteria section
  const successCriteriaList = parsedPlan.successMetrics.length > 0
    ? parsedPlan.successMetrics.map(metric => `- [ ] ${metric}`).join('\n')
    : '- [ ] All phases completed\n- [ ] All research questions answered\n- [ ] Architecture decisions documented\n- [ ] Code quality checks passing\n- [ ] Documentation updated\n- [ ] Tests passing\n- [ ] Performance targets met\n- [ ] Ready for production';
  content = content.replace(/- \[ \] All phases completed.*?- \[ \] Ready for production/gs, successCriteriaList);
  
  // Replace branch name
  if (parsedPlan.metadata.branch) {
    content = content.replace(/`feature\/\[name\]`/g, `\`${parsedPlan.metadata.branch}\``);
    content = content.replace(/feature\/\[name\]/g, parsedPlan.metadata.branch.replace('feature/', ''));
  }

  // Replace entire Research Phase section — research not started at feature start; see feature-plan.md for architecture
  const researchSectionNote = `## Research Phase\n\nResearch phase not yet started — see feature-plan.md for architectural decisions.\n\n---`;
  content = content.replace(/## Research Phase[\s\S]*?^---$/m, researchSectionNote);

  return content;
}

/**
 * Generate feature handoff from parsed plan
 * 
 * @param parsedPlan Parsed feature plan data
 * @param template Feature handoff template
 * @returns Generated feature handoff content
 */
export function generateFeatureHandoffFromPlan(
  parsedPlan: ParsedFeaturePlan,
  template: string
): string {
  let content = template;
  
  // Replace basic placeholders
  content = content.replace(/\[Name\]/g, parsedPlan.name);
  content = content.replace(/\[Date\]/g, parsedPlan.metadata.lastUpdated);
  
  // Replace status
  content = content.replace(/\[Complete \/ In Progress\]/g, parsedPlan.metadata.status);
  content = content.replace(/\[Feature Status\]/g, parsedPlan.metadata.status);
  
  // Replace transition context
  const transitionContext = `**Where we left off:**\n${parsedPlan.overview}\n\n**What you need to start next feature:**\n${parsedPlan.dependencies.map(dep => `- ${dep}`).join('\n')}`;
  content = content.replace(/\[Minimal notes about feature completion - 2-3 sentences max\]/g, parsedPlan.overview);
  content = content.replace(/\[Brief bullet point about context needed\]/g, parsedPlan.dependencies[0] || '[Brief bullet point about context needed]');
  
  // Replace feature summary — initial handoff: no phases completed yet
  content = content.replace(/\[List phase numbers\]/g, 'None yet');
  
  // Replace branch
  if (parsedPlan.metadata.branch) {
    content = content.replace(/`feature\/\[name\]`/g, `\`${parsedPlan.metadata.branch}\``);
    content = content.replace(/feature\/\[name\]/g, parsedPlan.metadata.branch.replace('feature/', ''));
  }
  
  return content;
}

/**
 * Generate feature log from parsed plan
 * 
 * @param parsedPlan Parsed feature plan data
 * @param template Feature log template
 * @returns Generated feature log content
 */
export function generateFeatureLogFromPlan(
  parsedPlan: ParsedFeaturePlan,
  template: string
): string {
  let content = template;
  
  // Replace basic placeholders
  content = content.replace(/\[Name\]/g, parsedPlan.name);
  content = content.replace(/\[StartDate\]/g, parsedPlan.metadata.created);
  content = content.replace(/\[CompletedDate\]/g, '—');
  
  // Add initial log entry
  const initialEntry = `## Feature Start - ${parsedPlan.metadata.created}\n\n**Feature:** ${parsedPlan.name}\n**Status:** ${parsedPlan.metadata.status}\n**Description:** ${parsedPlan.overview}\n\n**Objectives:**\n${parsedPlan.objectives.map(obj => `- ${obj}`).join('\n')}\n\n**Phases Planned:** ${parsedPlan.phases.length}\n\n---\n\n`;
  
  // Append to template (after initial header)
  const headerEnd = content.indexOf('---');
  if (headerEnd !== -1) {
    content = content.slice(0, headerEnd + 4) + '\n\n' + initialEntry + content.slice(headerEnd + 4);
  } else {
    content = content + '\n\n' + initialEntry;
  }
  
  return content;
}

/**
 * Generate phase guide from parsed phase plan
 * 
 * @param parsedPhase Parsed phase plan data
 * @param template Phase guide template
 * @returns Generated phase guide content
 */
export function generatePhaseGuideFromPlan(
  parsedPhase: ParsedPhasePlan,
  template: string
): string {
  let content = template;
  
  // Replace basic placeholders
  content = content.replace(/\[N\]/g, parsedPhase.number);
  content = content.replace(/\[Name\]/g, parsedPhase.name);
  content = content.replace(/\[Brief description of phase objectives\]/g, parsedPhase.description);
  content = content.replace(/\[Estimated weeks\/months\]/g, '[Estimated weeks]');
  content = content.replace(/\[Not Started \/ In Progress \/ Complete\]/g, 'Not Started');
  content = content.replace(/\[Status\]/g, 'Not Started');
  
  // Replace Phase Overview section
  const overviewSection = `**Phase Number:** ${parsedPhase.number}\n**Phase Name:** ${parsedPhase.name}\n**Description:** ${parsedPhase.description}\n\n**Duration:** [Estimated weeks]\n**Status:** Not Started`;
  content = content.replace(/\[Brief description of phase objectives\]/g, parsedPhase.description);
  
  // Replace Phase Objectives section
  const objectivesList = parsedPhase.objectives.length > 0
    ? parsedPhase.objectives.map(obj => `- ${obj}`).join('\n')
    : '- [Objective 1]\n- [Objective 2]\n- [Objective 3]';
  content = content.replace(/- \[Objective 1\]\n- \[Objective 2\]\n- \[Objective 3\]/g, objectivesList);
  
  // Replace Sessions Breakdown (if tasks exist, use them as session placeholders)
  if (parsedPhase.tasks && parsedPhase.tasks.length > 0) {
    const sessionsList = parsedPhase.tasks.map((task, index) => {
      const sessionId = `${parsedPhase.number.split('.')[0]}.${index + 1}`;
      return `- [ ] ### Session ${sessionId}: ${task}\n**Description:** ${task}\n**Tasks:** [Number of tasks]\n**Learning Goals:**\n- [Learning goal 1]\n- [Learning goal 2]`;
    }).join('\n\n');
    content = content.replace(/- \[ \] ### Session \[SESSION_ID\]: \[SESSION_NAME\].*?- \[Learning goal 2\]/gs, sessionsList);
  }
  
  // Replace Dependencies section
  const dependenciesList = '- [Dependency 1]\n- [Dependency 2]'; // Phase dependencies not typically in plan
  content = content.replace(/- \[Dependency 1\]\n- \[Dependency 2\]/g, dependenciesList);
  
  // Replace Success Criteria section
  const successCriteriaList = parsedPhase.successCriteria.length > 0
    ? parsedPhase.successCriteria.map(criterion => `- [ ] ${criterion}`).join('\n')
    : '- [ ] All sessions completed\n- [ ] All learning goals achieved\n- [ ] Code quality checks passing\n- [ ] Documentation updated\n- [ ] Ready for next phase';
  content = content.replace(/- \[ \] All sessions completed.*?- \[ \] Ready for next phase/gs, successCriteriaList);
  
  return content;
}

/**
 * Generate phase handoff from parsed phase plan
 * 
 * @param parsedPhase Parsed phase plan data
 * @param template Phase handoff template
 * @returns Generated phase handoff content
 */
export function generatePhaseHandoffFromPlan(
  parsedPhase: ParsedPhasePlan,
  template: string
): string {
  let content = template;
  
  // Replace basic placeholders
  content = content.replace(/\[N\]/g, parsedPhase.number);
  content = content.replace(/\[Date\]/g, new Date().toISOString().split('T')[0]);
  content = content.replace(/\[Complete \/ In Progress\]/g, 'Not Started');
  content = content.replace(/\[Phase Status\]/g, 'Not Started');
  
  // Calculate next phase number
  const phaseParts = parsedPhase.number.split('.');
  const nextPhaseNumber = phaseParts.length === 2
    ? `${phaseParts[0]}.${parseInt(phaseParts[1]) + 1}`
    : `${parseInt(phaseParts[0]) + 1}`;
  content = content.replace(/\[N\+1\]/g, nextPhaseNumber);
  
  // Replace transition context
  content = content.replace(/\[Minimal notes about phase completion - 2-3 sentences max\]/g, parsedPhase.description);
  content = content.replace(/\[Brief bullet point about context needed\]/g, parsedPhase.description.split('.')[0] || '[Brief bullet point about context needed]');
  
  return content;
}

