/**
 * Tier Discriminator Utility
 * 
 * Determines the appropriate tier level (Feature/Phase/Session/Task) for a given request
 * based on the decision tree logic from tier-discriminator-guide.md
 * 
 * LEARNING: Tier discrimination prevents scope confusion and ensures work is organized correctly
 * WHY: Different tiers require different planning approaches and documentation
 * PATTERN: Decision tree based on duration, scope, complexity, dependencies, and research needs
 */

export type Tier = 'feature' | 'phase' | 'session' | 'task';

export interface TierAnalysis {
  tier: Tier;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string[];
  suggestedCommand: string;
  scopeAssessment: {
    duration: string;
    complexity: 'low' | 'medium' | 'high';
    dependencies: string[];
    researchNeeded: boolean;
  };
}

/**
 * Determine tier level for a given description
 * 
 * Decision tree:
 * 1. Check Duration (weeks to months → Feature, weeks → Phase, hours to days → Session, minutes to hours → Task)
 * 2. Check Scope (multiple phases → Feature, multiple sessions → Phase, multiple tasks → Session, single work item → Task)
 * 3. Check Complexity (architectural decisions → Feature, significant scope → Phase, focused component → Session, specific implementation → Task)
 * 4. Check Dependencies (new git branch → Feature, dependencies on phases → Phase, dependencies on sessions → Session, dependencies on tasks → Task)
 * 5. Check Research Needs (external research → Feature, technology choices → Feature/Phase, pattern decisions → Phase/Session, implementation only → Task)
 */
export function determineTier(description: string): TierAnalysis {
  const desc = description.toLowerCase();
  const descLower = desc.toLowerCase();
  
  // Initialize scoring
  const scores: Record<Tier, number> = {
    feature: 0,
    phase: 0,
    session: 0,
    task: 0,
  };
  
  const reasoning: string[] = [];
  
  // Step 1: Check Duration Indicators
  if (descLower.includes('months') || descLower.includes('month') || descLower.match(/\d+\s*(week|weeks)/) && parseInt(descLower.match(/\d+\s*(week|weeks)/)?.[1] || '0') >= 4) {
    scores.feature += 3;
    reasoning.push('Duration: Weeks to months indicates Feature-level work');
  } else if (descLower.includes('week') || descLower.includes('weeks')) {
    scores.phase += 2;
    reasoning.push('Duration: Weeks indicates Phase-level work');
  } else if (descLower.includes('day') || descLower.includes('days') || descLower.includes('hour') || descLower.includes('hours')) {
    if (descLower.includes('day') || descLower.includes('days')) {
      scores.session += 2;
      reasoning.push('Duration: Days indicates Session-level work');
    } else {
      scores.task += 2;
      reasoning.push('Duration: Hours indicates Task-level work');
    }
  }
  
  // Step 2: Check Scope Indicators
  const featureScopeWords = ['entire', 'whole', 'all', 'complete', 'full', 'migrate', 'build', 'implement', 'refactor'];
  const phaseScopeWords = ['phase', 'milestone', 'multiple sessions', 'multiple components'];
  const sessionScopeWords = ['session', 'component', 'feature', 'store', 'module'];
  const taskScopeWords = ['single', 'one', 'file', 'function', 'method', 'task'];
  
  if (featureScopeWords.some(word => descLower.includes(word)) && (descLower.includes('application') || descLower.includes('system') || descLower.includes('layer'))) {
    scores.feature += 3;
    reasoning.push('Scope: Major initiative spanning multiple phases');
  } else if (phaseScopeWords.some(word => descLower.includes(word)) || descLower.match(/phase\s+\d+/i)) {
    scores.phase += 2;
    reasoning.push('Scope: Major milestone within a feature');
  } else if (sessionScopeWords.some(word => descLower.includes(word)) || descLower.match(/session\s+[\d.]+/i)) {
    scores.session += 2;
    reasoning.push('Scope: Focused work within a phase');
  } else if (taskScopeWords.some(word => descLower.includes(word)) || descLower.match(/task\s+[\d.]+/i)) {
    scores.task += 2;
    reasoning.push('Scope: Single focused work item');
  }
  
  // Step 3: Check Complexity Indicators
  const architecturalWords = ['architecture', 'architectural', 'design', 'pattern', 'framework', 'technology'];
  const significantScopeWords = ['multiple', 'several', 'various', 'different'];
  
  if (architecturalWords.some(word => descLower.includes(word))) {
    scores.feature += 3;
    reasoning.push('Complexity: Architectural decisions required');
  } else if (significantScopeWords.some(word => descLower.includes(word)) && (descLower.includes('component') || descLower.includes('file') || descLower.includes('module'))) {
    scores.phase += 2;
    reasoning.push('Complexity: Significant scope with multiple components');
  } else if (descLower.includes('component') || descLower.includes('store') || descLower.includes('module')) {
    scores.session += 2;
    reasoning.push('Complexity: Focused component/feature work');
  } else if (descLower.includes('file') || descLower.includes('function') || descLower.includes('method') || descLower.includes('type')) {
    scores.task += 1;
    reasoning.push('Complexity: Specific implementation');
  }
  
  // Step 4: Check Dependency Indicators
  if (descLower.includes('new branch') || descLower.includes('git branch') || descLower.includes('feature branch')) {
    scores.feature += 2;
    reasoning.push('Dependencies: New git branch needed');
  } else if (descLower.includes('depends on') && descLower.includes('phase')) {
    scores.phase += 2;
    reasoning.push('Dependencies: Depends on other phases');
  } else if (descLower.includes('depends on') && descLower.includes('session')) {
    scores.session += 1;
    reasoning.push('Dependencies: Depends on other sessions');
  }
  
  // Step 5: Check Research Needs
  if (descLower.includes('research') || descLower.includes('investigate') || descLower.includes('evaluate') || descLower.includes('explore')) {
    scores.feature += 2;
    reasoning.push('Research: External research required');
  } else if (descLower.includes('pattern') || descLower.includes('approach') || descLower.includes('strategy')) {
    scores.phase += 1;
    reasoning.push('Research: Pattern decisions needed');
  }
  
  // Determine winner
  const maxScore = Math.max(...Object.values(scores));
  const winners = (Object.keys(scores) as Tier[]).filter(tier => scores[tier] === maxScore);
  
  let tier: Tier;
  let confidence: 'high' | 'medium' | 'low';
  
  if (winners.length === 1 && maxScore >= 3) {
    tier = winners[0];
    confidence = 'high';
  } else if (winners.length === 1 && maxScore >= 2) {
    tier = winners[0];
    confidence = 'medium';
  } else if (winners.length > 1) {
    // Tie-breaker: prefer higher tier if scores are close
    tier = winners.includes('feature') ? 'feature' : winners.includes('phase') ? 'phase' : winners.includes('session') ? 'session' : 'task';
    confidence = 'low';
    reasoning.push(`Note: Multiple tiers scored similarly, defaulting to ${tier}`);
  } else {
    // Default to session if unclear
    tier = 'session';
    confidence = 'low';
    reasoning.push('Note: Tier unclear from description, defaulting to Session');
  }
  
  // Generate suggested command
  let suggestedCommand = '';
  switch (tier) {
    case 'feature':
      // Extract feature name from description
      const featureNameMatch = descLower.match(/(?:build|create|implement|migrate|refactor)\s+([a-z-]+(?:\s+[a-z-]+)*)/i);
      const featureName = featureNameMatch ? featureNameMatch[1].replace(/\s+/g, '-') : 'new-feature';
      suggestedCommand = `/plan-feature ${featureName} "${description}"`;
      break;
    case 'phase':
      // Extract phase number if present
      const phaseMatch = descLower.match(/phase\s+(\d+)/i);
      const phaseNum = phaseMatch ? phaseMatch[1] : 'N';
      suggestedCommand = `/plan-phase ${phaseNum} "${description}"`;
      break;
    case 'session':
      // Extract session ID if present
      const sessionMatch = descLower.match(/session\s+([\d.]+)/i);
      const sessionId = sessionMatch ? sessionMatch[1] : 'X.Y';
      suggestedCommand = `/plan-session ${sessionId} "${description}"`;
      break;
    case 'task':
      // Extract task ID if present
      const taskMatch = descLower.match(/task\s+([\d.]+)/i);
      const taskId = taskMatch ? taskMatch[1] : 'X.Y.Z';
      suggestedCommand = `/plan-task ${taskId} "${description}"`;
      break;
  }
  
  // Estimate duration
  let duration = 'Unknown';
  if (tier === 'feature') {
    duration = 'Weeks to months';
  } else if (tier === 'phase') {
    duration = 'Weeks';
  } else if (tier === 'session') {
    duration = 'Hours to days';
  } else {
    duration = 'Minutes to hours';
  }
  
  // Estimate complexity
  let complexity: 'low' | 'medium' | 'high' = 'medium';
  if (tier === 'feature') {
    complexity = 'high';
  } else if (tier === 'phase') {
    complexity = 'medium';
  } else if (tier === 'session') {
    complexity = 'medium';
  } else {
    complexity = 'low';
  }
  
  // Extract dependencies
  const dependencies: string[] = [];
  const dependsMatch = descLower.match(/depends?\s+on\s+([^.]+)/i);
  if (dependsMatch) {
    dependencies.push(dependsMatch[1].trim());
  }
  
  // Determine research needs
  const researchNeeded = tier === 'feature' || descLower.includes('research') || descLower.includes('investigate');
  
  return {
    tier,
    confidence,
    reasoning,
    suggestedCommand,
    scopeAssessment: {
      duration,
      complexity,
      dependencies,
      researchNeeded,
    },
  };
}

