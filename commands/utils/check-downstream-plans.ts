/**
 * Downstream Planning Check Utility
 * 
 * Checks if a change request is already planned in downstream sessions/phases/features.
 * Searches future guides for keywords and phrases from the change description.
 * 
 * LEARNING: Checking downstream plans prevents duplicate work and ensures changes align with planned workflow
 * WHY: Changes might already be planned in future sessions; we should detect this before creating change requests
 * PATTERN: Keyword extraction and fuzzy matching against guide content
 */

import { WorkflowCommandContext } from './command-context';
import { MarkdownUtils } from './markdown-utils';
import { readFile } from 'fs/promises';
import { access } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from './utils';
import { WorkflowId } from './id-utils';

export interface DownstreamMatch {
  tier: 'feature' | 'phase' | 'session';
  id: string;
  title: string;
  section: string;
  excerpt: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface CheckDownstreamPlansParams {
  description: string;
  currentSessionId?: string; // Format: X.Y (e.g., "4.2")
  currentPhase?: string; // Format: N (e.g., "4")
  featureName?: string;
}

export interface CheckDownstreamPlansResult {
  hasMatches: boolean;
  matches: DownstreamMatch[];
  output: string;
}

/**
 * Extract keywords from description
 * Removes stop words and keeps nouns, verbs, and file names
 */
function extractKeywords(description: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
    'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  ]);
  
  // Extract words (alphanumeric + dots/slashes for file paths)
  const words = description.toLowerCase()
    .replace(/[^\w\s./-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  // Remove duplicates and return
  return [...new Set(words)];
}

/**
 * Score match between keywords and content
 */
function scoreMatch(keywords: string[], content: string): { score: number; confidence: 'high' | 'medium' | 'low'; excerpt: string } {
  const contentLower = content.toLowerCase();
  let matchCount = 0;
  const matchedKeywords: string[] = [];
  
  // Check for exact phrase match (highest score)
  const fullPhrase = keywords.join(' ');
  if (contentLower.includes(fullPhrase)) {
    const index = contentLower.indexOf(fullPhrase);
    const excerpt = content.substring(Math.max(0, index - 50), Math.min(content.length, index + fullPhrase.length + 50));
    return { score: 100, confidence: 'high', excerpt };
  }
  
  // Check for individual keyword matches
  for (const keyword of keywords) {
    if (contentLower.includes(keyword)) {
      matchCount++;
      matchedKeywords.push(keyword);
    }
  }
  
  // Calculate score based on match ratio
  const matchRatio = matchCount / keywords.length;
  let confidence: 'high' | 'medium' | 'low';
  let score: number;
  
  if (matchRatio >= 0.7) {
    confidence = 'high';
    score = 80 + (matchRatio - 0.7) * 20;
  } else if (matchRatio >= 0.4) {
    confidence = 'medium';
    score = 40 + (matchRatio - 0.4) * 40;
  } else if (matchRatio >= 0.2) {
    confidence = 'low';
    score = matchRatio * 40;
  } else {
    confidence = 'low';
    score = 0;
  }
  
  // Find excerpt around first match
  let excerpt = '';
  if (matchedKeywords.length > 0) {
    const firstKeyword = matchedKeywords[0];
    const index = contentLower.indexOf(firstKeyword);
    if (index !== -1) {
      excerpt = content.substring(Math.max(0, index - 100), Math.min(content.length, index + firstKeyword.length + 100));
      // Clean up excerpt
      excerpt = excerpt.replace(/\s+/g, ' ').trim();
      if (excerpt.length > 200) {
        excerpt = excerpt.substring(0, 197) + '...';
      }
    }
  }
  
  return { score, confidence, excerpt };
}

/**
 * Search guide content for matches
 */
function searchGuideContent(
  content: string,
  keywords: string[],
  tier: 'feature' | 'phase' | 'session',
  id: string,
  title: string
): DownstreamMatch[] {
  const matches: DownstreamMatch[] = [];
  
  // Relevant sections to search
  const sectionsToSearch = [
    'Implementation Tasks',
    'Tasks',
    'Goals',
    'Objectives',
    'Scope',
    'Planned Changes',
    'Future Work',
    'Next Steps',
    'Session Structure',
    'Phase Structure',
  ];
  
  for (const sectionTitle of sectionsToSearch) {
    const sectionContent = MarkdownUtils.extractSection(content, sectionTitle, { includeSubsections: true });
    if (sectionContent) {
      const { score, confidence, excerpt } = scoreMatch(keywords, sectionContent);
      if (score > 0) {
        matches.push({
          tier,
          id,
          title,
          section: sectionTitle,
          excerpt: excerpt || sectionContent.substring(0, 200),
          confidence,
        });
      }
    }
  }
  
  // Also search full content if no section matches found
  if (matches.length === 0) {
    const { score, confidence, excerpt } = scoreMatch(keywords, content);
    if (score > 20) { // Lower threshold for full content search
      matches.push({
        tier,
        id,
        title,
        section: 'General Content',
        excerpt: excerpt || content.substring(0, 200),
        confidence,
      });
    }
  }
  
  return matches;
}

/**
 * Get all future session IDs
 */
function getFutureSessionIds(currentSessionId?: string): string[] {
  if (!currentSessionId) return [];
  
  const parsed = WorkflowId.parseSessionId(currentSessionId);
  if (!parsed) return [];
  
  const futureIds: string[] = [];
  // Generate potential future session IDs (up to 10 sessions ahead)
  for (let session = parsed.session + 1; session <= parsed.session + 10; session++) {
    futureIds.push(`${parsed.phase}.${session}`);
  }
  
  // Also check next phase sessions
  for (let phase = parsed.phase + 1; phase <= parsed.phase + 3; phase++) {
    for (let session = 1; session <= 5; session++) {
      futureIds.push(`${phase}.${session}`);
    }
  }
  
  return futureIds;
}

/**
 * Get all future phase IDs
 */
function getFuturePhaseIds(currentPhase?: string): string[] {
  if (!currentPhase) return [];
  
  const currentPhaseNum = parseInt(currentPhase, 10);
  if (isNaN(currentPhaseNum)) return [];
  
  const futureIds: string[] = [];
  for (let phase = currentPhaseNum + 1; phase <= currentPhaseNum + 5; phase++) {
    futureIds.push(phase.toString());
  }
  
  return futureIds;
}

/**
 * Extract title from guide content
 */
function extractTitle(content: string): string {
  // Look for title in first few lines
  const lines = content.split('\n').slice(0, 10);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      return trimmed.substring(2).trim();
    }
    if (trimmed.startsWith('**Title:**') || trimmed.startsWith('**Session:**') || trimmed.startsWith('**Phase:**')) {
      const match = trimmed.match(/\*\*.*?:\*\*\s*(.+)/);
      if (match) {
        return match[1].trim();
      }
    }
  }
  return 'Unknown';
}

/**
 * Check if change is already planned in downstream workflows
 */
export async function checkDownstreamPlans(
  params: CheckDownstreamPlansParams,
  featureName: string = 'vue-migration'
): Promise<CheckDownstreamPlansResult> {
  const keywords = extractKeywords(params.description);
  if (keywords.length === 0) {
    return {
      hasMatches: false,
      matches: [],
      output: '',
    };
  }
  
  const context = new WorkflowCommandContext(featureName);
  const allMatches: DownstreamMatch[] = [];
  
  // Search future session guides
  const futureSessionIds = getFutureSessionIds(params.currentSessionId);
  for (const sessionId of futureSessionIds) {
    try {
      const guidePath = join(PROJECT_ROOT, context.paths.getSessionGuidePath(sessionId));
      await access(guidePath);
      const content = await readFile(guidePath, 'utf-8');
      const title = extractTitle(content);
      const matches = searchGuideContent(content, keywords, 'session', sessionId, title);
      allMatches.push(...matches);
    } catch {
      // Guide doesn't exist, skip
    }
  }
  
  // Search future phase guides
  const futurePhaseIds = getFuturePhaseIds(params.currentPhase);
  for (const phaseId of futurePhaseIds) {
    try {
      const guidePath = join(PROJECT_ROOT, context.paths.getPhaseGuidePath(phaseId));
      await access(guidePath);
      const content = await readFile(guidePath, 'utf-8');
      const title = extractTitle(content);
      const matches = searchGuideContent(content, keywords, 'phase', phaseId, title);
      allMatches.push(...matches);
    } catch {
      // Guide doesn't exist, skip
    }
  }
  
  // Search feature guide (future phases section)
  try {
    const featureGuidePath = join(PROJECT_ROOT, context.paths.getFeatureGuidePath());
    await access(featureGuidePath);
    const content = await readFile(featureGuidePath, 'utf-8');
    const futurePhasesSection = MarkdownUtils.extractSection(content, 'Future Phases', { includeSubsections: true }) ||
                                MarkdownUtils.extractSection(content, 'Planned Phases', { includeSubsections: true });
    if (futurePhasesSection) {
      const { score, confidence, excerpt } = scoreMatch(keywords, futurePhasesSection);
      if (score > 20) {
        allMatches.push({
          tier: 'feature',
          id: featureName,
          title: `Feature: ${featureName}`,
          section: 'Future Phases',
          excerpt: excerpt || futurePhasesSection.substring(0, 200),
          confidence,
        });
      }
    }
  } catch {
    // Feature guide doesn't exist, skip
  }
  
  // Sort matches by confidence and score
  allMatches.sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return 0; // Could add score-based sorting here if we track it
  });
  
  // Filter to high/medium confidence matches only
  const significantMatches = allMatches.filter(m => m.confidence === 'high' || m.confidence === 'medium');
  
  // Generate output
  let output = '';
  if (significantMatches.length > 0) {
    output = `## ⚠️ Change Already Planned\n\n`;
    output += `This change appears to be already planned in a downstream workflow:\n\n`;
    
    for (const match of significantMatches.slice(0, 3)) { // Top 3 matches
      const tierLabel = match.tier === 'feature' ? 'Feature' : match.tier === 'phase' ? `Phase ${match.id}` : `Session ${match.id}`;
      output += `**Planned in:** ${tierLabel} - ${match.title}\n`;
      output += `**Section:** ${match.section}\n`;
      output += `**Excerpt:** ${match.excerpt}\n\n`;
    }
    
    output += `**Recommendation:** This change will be handled as part of the planned workflow above. No change request needed.\n`;
  }
  
  return {
    hasMatches: significantMatches.length > 0,
    matches: significantMatches,
    output,
  };
}

