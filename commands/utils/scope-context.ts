/**
 * Atomic Command: scopeContext
 * 
 * Purpose: Extract and analyze conversation context independently
 * 
 * This is a pure function that analyzes context without side effects.
 * Can be used by any command that needs context analysis.
 * 
 * LEARNING: Separating context analysis from execution allows for better composition
 * WHY: Multiple commands need the same context analysis - extract it once
 * PATTERN: Pure function pattern - no side effects, predictable output
 */

import { determineTier, TierAnalysis } from './tier-discriminator';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { PROJECT_ROOT } from './utils';
import { extractFilePaths } from '../../../../utils/context-gatherer';

export interface ScopeContextParams {
  description?: string;
  contextFile?: string;
}

export interface ScopeContextResult {
  context: string;
  tierAnalysis: TierAnalysis;
  keyChanges: string[];
  filesAffected: string[];
  description: string;
  summary: string;
}

/**
 * Read conversation context from various sources
 */
async function readConversationContext(params: ScopeContextParams): Promise<string> {
  // Priority 1: stdin (if available and not a TTY)
  if (process.stdin.isTTY === false) {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const stdinContent = Buffer.concat(chunks).toString('utf-8').trim();
      if (stdinContent) {
        return stdinContent;
      }
    } catch (error) {
      // Silently fall through to next source
    }
  }
  
  // Priority 2: Environment variable
  if (process.env.CURSOR_CONVERSATION_CONTEXT) {
    return process.env.CURSOR_CONVERSATION_CONTEXT;
  }
  
  // Priority 3: File path parameter
  if (params.contextFile) {
    try {
      const filePath = join(PROJECT_ROOT, params.contextFile);
      return await readFile(filePath, 'utf-8');
    } catch {} {
      throw new Error(`Failed to read context file: ${params.contextFile}`);
    }
  }
  
  // Priority 4: Direct description parameter
  if (params.description) {
    return params.description;
  }
  
  throw new Error('No conversation context available. Provide description, context file, or pipe input.');
}

/**
 * Extract key changes from conversation context
 */
function extractKeyChanges(context: string): string[] {
  const changes: string[] = [];
  const lines = context.split('\n');
  
  // Look for bullet points, numbered lists, or action items
  for (const line of lines) {
    const trimmed = line.trim();
    // Match bullet points or numbered lists
    if (trimmed.match(/^[-*•]\s+/) || trimmed.match(/^\d+\.\s+/)) {
      const content = trimmed.replace(/^[-*•]\s+/, '').replace(/^\d+\.\s+/, '').trim();
      if (content.length > 10) { // Filter out very short items
        changes.push(content);
      }
    }
    // Match "change", "update", "add", "remove", "rename" patterns
    else if (trimmed.match(/\b(change|update|add|remove|rename|refactor|migrate|implement|create)\b/i)) {
      if (trimmed.length > 20 && trimmed.length < 200) {
        changes.push(trimmed);
      }
    }
  }
  
  // If no structured changes found, extract sentences with action verbs
  if (changes.length === 0) {
    const sentences = context.split(/[.!?]\s+/);
    for (const sentence of sentences) {
      if (sentence.match(/\b(change|update|add|remove|rename|refactor|migrate|implement|create|fix|modify)\b/i)) {
        if (sentence.length > 20 && sentence.length < 200) {
          changes.push(sentence.trim());
        }
      }
    }
  }
  
  // Limit to top 5 changes
  return changes.slice(0, 5);
}

/**
 * Generate formatted summary for change request commands
 */
function generateChangeRequestDescription(
  context: string,
  tierAnalysis: TierAnalysis,
  keyChanges: string[],
  filesAffected: string[]
): string {
  // Use the original description if available, otherwise summarize
  const summary = keyChanges.length > 0
    ? keyChanges.join('. ')
    : context.split('\n').slice(0, 3).join(' ').substring(0, 200);
  
  // Build description with context
  let description = summary;
  
  if (filesAffected.length > 0) {
    description += `\n\nFiles affected: ${filesAffected.slice(0, 5).join(', ')}`;
  }
  
  return description;
}

/**
 * Scope context - atomic context analysis
 * 
 * Pure function that analyzes conversation context without side effects.
 * Returns structured analysis data that can be used by other commands.
 */
export async function scopeContext(
  params: ScopeContextParams = {}
): Promise<ScopeContextResult> {
  // Read conversation context
  const context = await readConversationContext(params);
  
  // Determine tier
  const tierAnalysis = determineTier(context);
  
  // Extract key changes
  const keyChanges = extractKeyChanges(context);
  
  // Extract files mentioned
  const filesAffected = extractFilePaths(context);
  
  // Generate change request description
  const description = generateChangeRequestDescription(
    context,
    tierAnalysis,
    keyChanges,
    filesAffected
  );
  
  // Generate summary
  const summary = context.split('\n').slice(0, 3).join(' ').substring(0, 200);
  
  return {
    context,
    tierAnalysis,
    keyChanges,
    filesAffected,
    description,
    summary,
  };
}

