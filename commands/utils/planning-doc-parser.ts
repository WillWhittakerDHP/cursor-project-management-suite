/**
 * Planning Document Parser
 * 
 * Parses feature-plan.md and phase plans to extract structured data
 * for generating workflow documents (guide, handoff, log).
 * 
 * LEARNING: Separates parsing logic from generation logic
 * WHY: Enables reuse of parsing logic and easier testing
 * PATTERN: Pure functions that extract structured data from markdown
 */

import { MarkdownUtils } from './markdown-utils';

/**
 * Parsed feature plan data structure
 */
export interface ParsedFeaturePlan {
  name: string;
  overview: string;
  objectives: string[];
  phases: ParsedPhase[];
  dependencies: string[];
  successMetrics: string[];
  metadata: {
    status: string;
    created: string;
    lastUpdated: string;
    branch: string;
  };
}

/**
 * Parsed phase data structure
 */
export interface ParsedPhase {
  number: string;
  name: string;
  description: string;
  objectives: string[];
  tasks?: string[];
  keyFiles: string[];
  successCriteria: string[];
  databaseSchemas?: string;
}

/**
 * Parsed phase plan data structure
 */
export interface ParsedPhasePlan {
  number: string;
  name: string;
  description: string;
  objectives: string[];
  tasks?: string[];
  keyFiles: string[];
  successCriteria: string[];
  databaseSchemas?: string;
}

/**
 * Parse feature-plan.md content into structured data
 * 
 * @param featurePlanContent Content of feature-plan.md file
 * @param featureName Feature name (extracted from title or passed as parameter)
 * @returns Parsed feature plan data
 */
export function parseFeaturePlan(
  featurePlanContent: string,
  featureName?: string
): ParsedFeaturePlan {
  // Extract feature name from title if not provided
  const name = featureName || extractFeatureName(featurePlanContent);
  
  // Extract Overview section
  const overview = MarkdownUtils.extractSection(featurePlanContent, 'Overview') || '';
  
  // Extract metadata from frontmatter-like format
  const metadata = extractMetadata(featurePlanContent);
  
  // Extract Objectives (may be in Overview or separate section)
  const objectives = extractObjectives(featurePlanContent);
  
  // Extract all phases
  const phases = extractPhases(featurePlanContent);
  
  // Extract Dependencies
  const dependencies = extractDependencies(featurePlanContent);
  
  // Extract Success Metrics
  const successMetrics = extractSuccessMetrics(featurePlanContent);
  
  return {
    name,
    overview,
    objectives,
    phases,
    dependencies,
    successMetrics,
    metadata,
  };
}

/**
 * Parse a specific phase from feature-plan.md
 * 
 * @param featurePlanContent Content of feature-plan.md file
 * @param phaseNumber Phase number (e.g., "1.1", "1.2")
 * @returns Parsed phase plan data or null if not found
 */
export function parsePhasePlan(
  featurePlanContent: string,
  phaseNumber: string
): ParsedPhasePlan | null {
  // Find phase section (e.g., "Phase 1.1: ...")
  const phaseSection = MarkdownUtils.extractSection(
    featurePlanContent,
    `Phase ${phaseNumber}`
  );
  
  if (!phaseSection) {
    return null;
  }
  
  // Extract phase name from section header
  const nameMatch = phaseSection.match(/^##\s+Phase\s+[\d.]+:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : `Phase ${phaseNumber}`;
  
  // Extract Description
  const description = extractPhaseDescription(phaseSection);
  
  // Extract Objectives
  const objectives = extractPhaseObjectives(phaseSection);
  
  // Extract Tasks (if present)
  const tasks = extractPhaseTasks(phaseSection);
  
  // Extract Key Files
  const keyFiles = extractKeyFiles(phaseSection);
  
  // Extract Success Criteria
  const successCriteria = extractPhaseSuccessCriteria(phaseSection);
  
  // Extract Database Schemas (if present)
  const databaseSchemas = extractDatabaseSchemas(phaseSection);
  
  return {
    number: phaseNumber,
    name,
    description,
    objectives,
    tasks,
    keyFiles,
    successCriteria,
    databaseSchemas,
  };
}

/**
 * Extract feature name from document title
 */
function extractFeatureName(content: string): string {
  const titleMatch = content.match(/^#\s+Feature\s+\d+:\s*(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  
  // Fallback: try to extract from first line
  const firstLine = content.split('\n')[0];
  const fallbackMatch = firstLine.match(/^#\s+(.+)$/);
  return fallbackMatch ? fallbackMatch[1].trim() : 'Unknown Feature';
}

/**
 * Extract metadata from feature plan
 */
function extractMetadata(content: string): ParsedFeaturePlan['metadata'] {
  const statusMatch = content.match(/\*\*Status:\*\*\s*(.+)/);
  const createdMatch = content.match(/\*\*Created:\*\*\s*(.+)/);
  const lastUpdatedMatch = content.match(/\*\*Last Updated:\*\*\s*(.+)/);
  const branchMatch = content.match(/\*\*Branch:\*\*\s*`(.+)`/);
  
  return {
    status: statusMatch ? statusMatch[1].trim() : 'Planning',
    created: createdMatch ? createdMatch[1].trim() : new Date().toISOString().split('T')[0],
    lastUpdated: lastUpdatedMatch ? lastUpdatedMatch[1].trim() : new Date().toISOString().split('T')[0],
    branch: branchMatch ? branchMatch[1].trim() : '',
  };
}

/**
 * Extract objectives from feature plan
 */
function extractObjectives(content: string): string[] {
  const objectivesSection = MarkdownUtils.extractSection(content, 'Objectives');
  if (!objectivesSection) {
    return [];
  }
  
  // Extract bullet points
  const lines = objectivesSection.split('\n');
  const objectives: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const objective = trimmed.replace(/^-\s*/, '').trim();
      if (objective) {
        objectives.push(objective);
      }
    }
  }
  
  return objectives;
}

/**
 * Extract all phases from feature plan
 */
function extractPhases(content: string): ParsedPhase[] {
  const phases: ParsedPhase[] = [];
  
  // Find all phase sections (## Phase X.Y: ...)
  const phaseMatches = content.matchAll(/^##\s+Phase\s+([\d.]+):\s*(.+)$/gm);
  
  for (const match of phaseMatches) {
    const phaseNumber = match[1];
    const phaseName = match[2].trim();
    
    // Extract phase section
    const phaseSection = MarkdownUtils.extractSection(
      content,
      `Phase ${phaseNumber}`
    );
    
    if (phaseSection) {
      const description = extractPhaseDescription(phaseSection);
      const objectives = extractPhaseObjectives(phaseSection);
      const tasks = extractPhaseTasks(phaseSection);
      const keyFiles = extractKeyFiles(phaseSection);
      const successCriteria = extractPhaseSuccessCriteria(phaseSection);
      const databaseSchemas = extractDatabaseSchemas(phaseSection);
      
      phases.push({
        number: phaseNumber,
        name: phaseName,
        description,
        objectives,
        tasks,
        keyFiles,
        successCriteria,
        databaseSchemas,
      });
    }
  }
  
  return phases;
}

/**
 * Extract dependencies from feature plan
 */
function extractDependencies(content: string): string[] {
  const dependenciesSection = MarkdownUtils.extractSection(content, 'Dependencies');
  if (!dependenciesSection) {
    return [];
  }
  
  const lines = dependenciesSection.split('\n');
  const dependencies: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const dependency = trimmed.replace(/^-\s*/, '').trim();
      if (dependency) {
        dependencies.push(dependency);
      }
    }
  }
  
  return dependencies;
}

/**
 * Extract success metrics from feature plan
 */
function extractSuccessMetrics(content: string): string[] {
  const metricsSection = MarkdownUtils.extractSection(content, 'Success Metrics');
  if (!metricsSection) {
    return [];
  }
  
  const lines = metricsSection.split('\n');
  const metrics: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const metric = trimmed.replace(/^-\s*/, '').trim();
      if (metric) {
        metrics.push(metric);
      }
    }
  }
  
  return metrics;
}

/**
 * Extract phase description
 */
function extractPhaseDescription(phaseSection: string): string {
  const descriptionMatch = phaseSection.match(/\*\*Description:\*\*\s*(.+?)(?=\n\n|\n###|\n##|$)/s);
  if (descriptionMatch) {
    return descriptionMatch[1].trim();
  }
  
  // Fallback: try to get first paragraph after status
  const statusMatch = phaseSection.match(/\*\*Status:\*\*\s*.+?\n\n(.+?)(?=\n\n|\n###|\n##|$)/s);
  if (statusMatch) {
    return statusMatch[1].trim();
  }
  
  return '';
}

/**
 * Extract phase objectives
 */
function extractPhaseObjectives(phaseSection: string): string[] {
  const objectivesSection = MarkdownUtils.extractSection(phaseSection, 'Objectives');
  if (!objectivesSection) {
    return [];
  }
  
  const lines = objectivesSection.split('\n');
  const objectives: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const objective = trimmed.replace(/^-\s*/, '').trim();
      if (objective) {
        objectives.push(objective);
      }
    }
  }
  
  return objectives;
}

/**
 * Extract phase tasks
 */
function extractPhaseTasks(phaseSection: string): string[] | undefined {
  const tasksSection = MarkdownUtils.extractSection(phaseSection, 'Tasks');
  if (!tasksSection) {
    return undefined;
  }
  
  const lines = tasksSection.split('\n');
  const tasks: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-') || trimmed.startsWith('**')) {
      const task = trimmed.replace(/^[-*]\s*/, '').replace(/\*\*/g, '').trim();
      if (task && !task.startsWith('**')) {
        tasks.push(task);
      }
    }
  }
  
  return tasks.length > 0 ? tasks : undefined;
}

/**
 * Extract key files from phase section
 */
function extractKeyFiles(phaseSection: string): string[] {
  const keyFilesSection = MarkdownUtils.extractSection(phaseSection, 'Key Files');
  if (!keyFilesSection) {
    return [];
  }
  
  const lines = keyFilesSection.split('\n');
  const keyFiles: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      // Extract file path from markdown code format or plain text
      const fileMatch = trimmed.match(/`([^`]+)`/);
      if (fileMatch) {
        keyFiles.push(fileMatch[1].trim());
      } else {
        const file = trimmed.replace(/^-\s*/, '').trim();
        if (file) {
          keyFiles.push(file);
        }
      }
    }
  }
  
  return keyFiles;
}

/**
 * Extract phase success criteria
 */
function extractPhaseSuccessCriteria(phaseSection: string): string[] {
  const criteriaSection = MarkdownUtils.extractSection(phaseSection, 'Success Criteria');
  if (!criteriaSection) {
    return [];
  }
  
  const lines = criteriaSection.split('\n');
  const criteria: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      const criterion = trimmed.replace(/^-\s*/, '').trim();
      if (criterion) {
        criteria.push(criterion);
      }
    }
  }
  
  return criteria;
}

/**
 * Extract database schemas from phase section
 */
function extractDatabaseSchemas(phaseSection: string): string | undefined {
  const schemasSection = MarkdownUtils.extractSection(phaseSection, 'Database Schemas');
  if (!schemasSection) {
    return undefined;
  }
  
  // Return the entire schemas section as-is
  return schemasSection.trim();
}

