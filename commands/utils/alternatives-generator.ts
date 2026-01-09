/**
 * Planning Management System - Alternatives Generator
 * 
 * Functions for generating and analyzing alternative strategies, architectures, and approaches.
 */

import { Alternative, AlternativesResult, AlternativeAnalysis, AlternativeType, PlanningOutput } from './planning-types';

// ===================================================================
// ALTERNATIVE GENERATION
// ===================================================================

/**
 * Generate alternatives for a given planning output
 */
export function generateAlternatives(
  planningOutput: PlanningOutput,
  alternativeType: AlternativeType = 'approach',
  count: number = 3
): AlternativesResult {
  const alternatives: Alternative[] = [];
  
  try {
    // Generate alternatives based on type
    switch (alternativeType) {
      case 'architecture':
        alternatives.push(...generateArchitectureAlternatives(planningOutput, count));
        break;
      case 'technology':
        alternatives.push(...generateTechnologyAlternatives(planningOutput, count));
        break;
      case 'pattern':
        alternatives.push(...generatePatternAlternatives(planningOutput, count));
        break;
      case 'approach':
      case 'strategy':
        alternatives.push(...generateApproachAlternatives(planningOutput, count));
        break;
    }
    
    // Generate recommendations
    const recommendations = generateRecommendations(alternatives, planningOutput);
    
    return {
      success: true,
      alternatives,
      recommendations,
    };
  } catch (error) {
    return {
      success: false,
      alternatives: [],
      errors: [error instanceof Error ? error.message : 'Unknown error generating alternatives'],
    };
  }
}

// ===================================================================
// ALTERNATIVE TYPE GENERATORS
// ===================================================================

/**
 * Generate architecture alternatives
 */
function generateArchitectureAlternatives(planningOutput: PlanningOutput, count: number): Alternative[] {
  const alternatives: Alternative[] = [];
  const baseId = 'arch-alt-';
  
  // Common architecture patterns
  const patterns = [
    {
      title: 'Monolithic Architecture',
      description: 'Single unified application structure',
      pros: ['Simple to develop and deploy', 'Easier debugging', 'Single codebase'],
      cons: ['Harder to scale', 'Tight coupling', 'Deployment bottlenecks'],
      effort: 'low' as const,
      risk: 'low' as const,
      complexity: 'low' as const,
    },
    {
      title: 'Microservices Architecture',
      description: 'Distributed system with independent services',
      pros: ['Scalable', 'Technology diversity', 'Independent deployment'],
      cons: ['Complexity', 'Network overhead', 'Distributed debugging'],
      effort: 'high' as const,
      risk: 'medium' as const,
      complexity: 'high' as const,
    },
    {
      title: 'Modular Monolith',
      description: 'Monolith with clear module boundaries',
      pros: ['Balance of simplicity and modularity', 'Easier than microservices', 'Can evolve'],
      cons: ['Requires discipline', 'Can become monolithic', 'Migration complexity'],
      effort: 'medium' as const,
      risk: 'low' as const,
      complexity: 'medium' as const,
    },
  ];
  
  for (let i = 0; i < Math.min(count, patterns.length); i++) {
    alternatives.push({
      id: `${baseId}${i + 1}`,
      ...patterns[i],
      type: 'architecture',
      recommendedFor: [],
      notRecommendedFor: [],
    });
  }
  
  return alternatives;
}

/**
 * Generate technology alternatives
 */
function generateTechnologyAlternatives(planningOutput: PlanningOutput, count: number): Alternative[] {
  const alternatives: Alternative[] = [];
  const baseId = 'tech-alt-';
  
  // Detect technology domain from planning output
  const isFrontend = planningOutput.tags?.some(tag => 
    ['frontend', 'ui', 'client', 'react', 'vue'].includes(tag.toLowerCase())
  );
  const isBackend = planningOutput.tags?.some(tag => 
    ['backend', 'server', 'api', 'database'].includes(tag.toLowerCase())
  );
  
  if (isFrontend) {
    const frontendTechs = [
      {
        title: 'React',
        description: 'Component-based UI library',
        pros: ['Large ecosystem', 'Strong community', 'Flexible'],
        cons: ['Learning curve', 'Rapid changes', 'Boilerplate'],
        effort: 'medium' as const,
        risk: 'low' as const,
        complexity: 'medium' as const,
      },
      {
        title: 'Vue.js',
        description: 'Progressive JavaScript framework',
        pros: ['Easy to learn', 'Good documentation', 'Flexible'],
        cons: ['Smaller ecosystem', 'Less enterprise adoption'],
        effort: 'low' as const,
        risk: 'low' as const,
        complexity: 'low' as const,
      },
      {
        title: 'Svelte',
        description: 'Compile-time optimized framework',
        pros: ['Performance', 'Small bundle size', 'Simple syntax'],
        cons: ['Smaller ecosystem', 'Less tooling'],
        effort: 'medium' as const,
        risk: 'medium' as const,
        complexity: 'medium' as const,
      },
    ];
    
    for (let i = 0; i < Math.min(count, frontendTechs.length); i++) {
      alternatives.push({
        id: `${baseId}${i + 1}`,
        ...frontendTechs[i],
        type: 'technology',
        recommendedFor: [],
        notRecommendedFor: [],
      });
    }
  } else if (isBackend) {
    const backendTechs = [
      {
        title: 'Node.js',
        description: 'JavaScript runtime for backend',
        pros: ['Same language as frontend', 'Large ecosystem', 'Fast development'],
        cons: ['Single-threaded', 'Memory limitations'],
        effort: 'low' as const,
        risk: 'low' as const,
        complexity: 'low' as const,
      },
      {
        title: 'Python',
        description: 'High-level programming language',
        pros: ['Easy to learn', 'Great libraries', 'Rapid development'],
        cons: ['Performance', 'GIL limitations'],
        effort: 'low' as const,
        risk: 'low' as const,
        complexity: 'low' as const,
      },
      {
        title: 'Go',
        description: 'Compiled language for backend',
        pros: ['Performance', 'Concurrency', 'Simple syntax'],
        cons: ['Smaller ecosystem', 'Less flexible'],
        effort: 'medium' as const,
        risk: 'medium' as const,
        complexity: 'medium' as const,
      },
    ];
    
    for (let i = 0; i < Math.min(count, backendTechs.length); i++) {
      alternatives.push({
        id: `${baseId}${i + 1}`,
        ...backendTechs[i],
        type: 'technology',
        recommendedFor: [],
        notRecommendedFor: [],
      });
    }
  } else {
    // Generic technology alternatives
    alternatives.push({
      id: `${baseId}1`,
      title: 'Established Technology',
      description: 'Use well-established, proven technology',
      type: 'technology',
      pros: ['Stable', 'Good documentation', 'Large community'],
      cons: ['May be outdated', 'Less innovative'],
      effort: 'low' as const,
      risk: 'low' as const,
      complexity: 'low' as const,
      recommendedFor: ['Production systems', 'Long-term projects'],
      notRecommendedFor: [],
    });
    
    alternatives.push({
      id: `${baseId}2`,
      title: 'Modern Technology',
      description: 'Use cutting-edge, modern technology',
      type: 'technology',
      pros: ['Innovative', 'Better performance', 'Modern features'],
      cons: ['Less stable', 'Smaller community', 'Rapid changes'],
      effort: 'medium' as const,
      risk: 'medium' as const,
      complexity: 'medium' as const,
      recommendedFor: ['New projects', 'Experiments'],
      notRecommendedFor: ['Critical systems'],
    });
  }
  
  return alternatives;
}

/**
 * Generate pattern alternatives
 */
function generatePatternAlternatives(planningOutput: PlanningOutput, count: number): Alternative[] {
  const alternatives: Alternative[] = [];
  const baseId = 'pattern-alt-';
  
  const patterns = [
    {
      title: 'MVC Pattern',
      description: 'Model-View-Controller separation',
      pros: ['Well-understood', 'Clear separation', 'Testable'],
      cons: ['Can be verbose', 'Tight coupling in some implementations'],
      effort: 'low' as const,
      risk: 'low' as const,
      complexity: 'low' as const,
    },
    {
      title: 'MVVM Pattern',
      description: 'Model-View-ViewModel with data binding',
      pros: ['Two-way binding', 'Clear separation', 'Testable'],
      cons: ['More complex', 'Framework-dependent'],
      effort: 'medium' as const,
      risk: 'low' as const,
      complexity: 'medium' as const,
    },
    {
      title: 'Component Pattern',
      description: 'Component-based architecture',
      pros: ['Reusable', 'Composable', 'Modern'],
      cons: ['Requires discipline', 'Can become complex'],
      effort: 'medium' as const,
      risk: 'low' as const,
      complexity: 'medium' as const,
    },
  ];
  
  for (let i = 0; i < Math.min(count, patterns.length); i++) {
    alternatives.push({
      id: `${baseId}${i + 1}`,
      ...patterns[i],
      type: 'pattern',
      recommendedFor: [],
      notRecommendedFor: [],
    });
  }
  
  return alternatives;
}

/**
 * Generate approach/strategy alternatives
 */
function generateApproachAlternatives(planningOutput: PlanningOutput, count: number): Alternative[] {
  const alternatives: Alternative[] = [];
  const baseId = 'approach-alt-';
  
  const approaches = [
    {
      title: 'Incremental Approach',
      description: 'Build incrementally, adding features gradually',
      pros: ['Lower risk', 'Early feedback', 'Manageable'],
      cons: ['May need refactoring', 'Slower initial progress'],
      effort: 'medium' as const,
      risk: 'low' as const,
      complexity: 'medium' as const,
      recommendedFor: ['Large features', 'Uncertain requirements'],
      notRecommendedFor: ['Simple features', 'Time-critical'],
    },
    {
      title: 'Big Bang Approach',
      description: 'Build complete solution at once',
      pros: ['Faster completion', 'No integration issues', 'Clear scope'],
      cons: ['Higher risk', 'Late feedback', 'Harder to change'],
      effort: 'high' as const,
      risk: 'high' as const,
      complexity: 'high' as const,
      recommendedFor: ['Simple features', 'Well-understood requirements'],
      notRecommendedFor: ['Complex features', 'Uncertain requirements'],
    },
    {
      title: 'Prototype-First Approach',
      description: 'Build prototype, then refine',
      pros: ['Early validation', 'Risk reduction', 'User feedback'],
      cons: ['May throw away work', 'Time investment'],
      effort: 'medium' as const,
      risk: 'low' as const,
      complexity: 'medium' as const,
      recommendedFor: ['New features', 'Uncertain requirements'],
      notRecommendedFor: ['Well-understood features'],
    },
  ];
  
  for (let i = 0; i < Math.min(count, approaches.length); i++) {
    alternatives.push({
      id: `${baseId}${i + 1}`,
      ...approaches[i],
      type: 'approach',
      recommendedFor: approaches[i].recommendedFor || [],
      notRecommendedFor: approaches[i].notRecommendedFor || [],
    });
  }
  
  return alternatives;
}

// ===================================================================
// RECOMMENDATION GENERATION
// ===================================================================

/**
 * Generate recommendations based on alternatives and planning output
 */
function generateRecommendations(
  alternatives: Alternative[],
  planningOutput: PlanningOutput
): AlternativesResult['recommendations'] {
  if (alternatives.length === 0) {
    return undefined;
  }
  
  // Score alternatives based on planning output
  const scores = alternatives.map(alt => ({
    alternative: alt,
    score: scoreAlternative(alt, planningOutput),
  }));
  
  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);
  
  const primary = scores[0]?.alternative.id;
  const secondary = scores.length > 1 ? scores[1]?.alternative.id : undefined;
  
  let rationale = `Recommended: ${scores[0]?.alternative.title}`;
  if (scores[0]?.alternative.recommendedFor && scores[0].alternative.recommendedFor.length > 0) {
    rationale += ` (best for: ${scores[0].alternative.recommendedFor.join(', ')})`;
  }
  
  return {
    primary,
    secondary,
    rationale,
  };
}

/**
 * Score an alternative based on planning output
 */
function scoreAlternative(alternative: Alternative, planningOutput: PlanningOutput): number {
  let score = 0;
  
  // Lower effort = higher score
  const effortScores = { low: 3, medium: 2, high: 1, very_high: 0 };
  score += effortScores[alternative.effort || 'medium'];
  
  // Lower risk = higher score
  const riskScores = { low: 3, medium: 2, high: 1, critical: 0 };
  score += riskScores[alternative.risk || 'medium'];
  
  // Lower complexity = higher score (unless high complexity is acceptable)
  const complexityScores = { low: 3, medium: 2, high: 1 };
  score += complexityScores[alternative.complexity || 'medium'];
  
  // Match priority
  if (planningOutput.priority === 'critical' && alternative.effort === 'low') {
    score += 2; // Prefer low effort for critical items
  }
  
  // Match constraints
  if (planningOutput.constraints) {
    const constraintText = planningOutput.constraints.join(' ').toLowerCase();
    if (constraintText.includes('simple') && alternative.complexity === 'low') {
      score += 2;
    }
    if (constraintText.includes('fast') && alternative.effort === 'low') {
      score += 2;
    }
  }
  
  return score;
}

// ===================================================================
// ALTERNATIVE ANALYSIS
// ===================================================================

/**
 * Analyze and compare alternatives
 */
export function analyzeAlternatives(alternatives: Alternative[]): AlternativeAnalysis {
  if (alternatives.length === 0) {
    return {
      alternatives: [],
      comparison: {
        criteria: [],
        scores: {},
      },
    };
  }
  
  // Define comparison criteria
  const criteria = ['effort', 'risk', 'complexity', 'suitability'];
  
  // Calculate scores for each alternative
  const scores: Record<string, Record<string, number>> = {};
  
  for (const alt of alternatives) {
    scores[alt.id] = {
      effort: scoreEffort(alt.effort),
      risk: scoreRisk(alt.risk),
      complexity: scoreComplexity(alt.complexity),
      suitability: scoreSuitability(alt),
    };
  }
  
  // Generate recommendation
  const recommendation = generateAnalysisRecommendation(alternatives, scores);
  
  return {
    alternatives,
    comparison: {
      criteria,
      scores,
    },
    recommendation,
  };
}

/**
 * Score effort level
 */
function scoreEffort(effort?: Alternative['effort']): number {
  const scores = { low: 3, medium: 2, high: 1, very_high: 0 };
  return scores[effort || 'medium'];
}

/**
 * Score risk level
 */
function scoreRisk(risk?: Alternative['risk']): number {
  const scores = { low: 3, medium: 2, high: 1, critical: 0 };
  return scores[risk || 'medium'];
}

/**
 * Score complexity level
 */
function scoreComplexity(complexity?: Alternative['complexity']): number {
  const scores = { low: 3, medium: 2, high: 1 };
  return scores[complexity || 'medium'];
}

/**
 * Score suitability based on pros/cons
 */
function scoreSuitability(alternative: Alternative): number {
  let score = 0;
  
  // More pros = higher score
  score += alternative.pros.length;
  
  // Fewer cons = higher score
  score -= alternative.cons.length * 0.5;
  
  // Has recommendations = higher score
  if (alternative.recommendedFor && alternative.recommendedFor.length > 0) {
    score += 1;
  }
  
  return Math.max(0, score);
}

/**
 * Generate recommendation from analysis
 */
function generateAnalysisRecommendation(
  alternatives: Alternative[],
  scores: Record<string, Record<string, number>>
): AlternativeAnalysis['recommendation'] {
  if (alternatives.length === 0) {
    return undefined;
  }
  
  // Calculate total scores
  const totalScores = alternatives.map(alt => {
    const altScores = scores[alt.id];
    const total = Object.values(altScores).reduce((sum, score) => sum + score, 0);
    return { alternative: alt, total };
  });
  
  // Sort by total score
  totalScores.sort((a, b) => b.total - a.total);
  
  const best = totalScores[0];
  const confidence = best.total >= 8 ? 'high' : best.total >= 5 ? 'medium' : 'low';
  
  let rationale = `${best.alternative.title} scores highest overall`;
  if (best.alternative.recommendedFor && best.alternative.recommendedFor.length > 0) {
    rationale += ` and is recommended for: ${best.alternative.recommendedFor.join(', ')}`;
  }
  
  return {
    alternativeId: best.alternative.id,
    rationale,
    confidence,
  };
}

