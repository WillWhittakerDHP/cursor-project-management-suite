/**
 * Atomic Audit: Vue Architecture Consistency
 *
 * Goal:
 * - Detect high-risk drift away from Vue best practices:
 *   - components doing data fetching / orchestration
 *   - component scripts growing into “logic hubs”
 *   - composables naming/structure drift (basic checks)
 *
 * Scope:
 * - Reads `<frontend-root>/src/**`
 * - Deterministic heuristics only (no AST dependencies)
 *
 * References:
 * - `.project-manager/patterns/vue-architecture-contract.md`
 * - `.project-manager/patterns/composable-taxonomy.md`
 */

import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { AuditParams } from '../types';
import { AuditResult, AuditFinding } from '../types';

const PROJECT_ROOT = process.cwd();
const FRONTEND_ROOT = 'client';
const FRONTEND_SRC_SEGMENTS: [string, string] = [FRONTEND_ROOT, 'src'];

type _FileScanResult = {
  file: string;
  findings: AuditFinding[];
};

async function getAllFilesRecursive(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      await getAllFilesRecursive(abs, out);
      continue;
    }
    if (entry.isFile()) out.push(abs);
  }
  return out;
}

function toRepoPath(absPath: string): string {
  return absPath.replace(PROJECT_ROOT + '/', '');
}

function extractVueScriptBlocks(vueContent: string): string[] {
  const blocks: string[] = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of vueContent.matchAll(re)) {
    blocks.push(match[1] || '');
  }
  return blocks;
}

function scoreFromFindings(findings: AuditFinding[]): { status: 'pass' | 'warn' | 'fail'; score: number } {
  // Deterministic scoring: start at 100, subtract fixed amounts.
  let score = 100;
  for (const f of findings) {
    if (f.type === 'error') score -= 30;
    if (f.type === 'warning') score -= 10;
    if (f.type === 'info') score -= 2;
  }
  if (score < 0) score = 0;

  const hasError = findings.some(f => f.type === 'error');
  const hasWarning = findings.some(f => f.type === 'warning');
  const status = hasError ? 'fail' : hasWarning ? 'warn' : 'pass';
  return { status, score };
}

function scanVueComponentScript(file: string, script: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Hard failures: data fetching directly in components.
  const fetchLike = /\b(fetch|axios|ky|graphql|urql|apollo)\b/i;
  if (fetchLike.test(script)) {
    findings.push({
      type: 'error',
      message: 'Component script references a network/fetch client. Data fetching should be moved into composables/stores/services.',
      location: file,
      suggestion: 'Extract to a composable (use*Query) or store/service and keep component as wiring + UI behavior.',
    });
  }

  // Heuristic: large script blocks tend to accumulate domain logic.
  const nonEmptyLines = script.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (nonEmptyLines.length > 180) {
    findings.push({
      type: 'warning',
      message: `Component script is large (${nonEmptyLines.length} non-empty lines). This often indicates logic creep.`,
      location: file,
      suggestion: 'Move domain rules/orchestration into composables; keep only UI state and event wiring.',
    });
  }

  // Heuristic: lots of locally-defined functions in a component is often a smell.
  const localFnCount =
    (script.match(/\bfunction\s+\w+\s*\(/g) || []).length +
    (script.match(/\bconst\s+\w+\s*=\s*\(/g) || []).length;
  if (localFnCount >= 8) {
    findings.push({
      type: 'warning',
      message: `Component defines many local functions (${localFnCount}). Consider extracting reusable/domain logic into composables.`,
      location: file,
      suggestion: 'If functions implement business rules or shared transforms, move them into composables/utilities.',
    });
  }

  return findings;
}

function scanComposableNaming(file: string, content: string): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Basic rule: file name should match primary exported composable when possible.
  // Find first export function useX or export const useX.
  const fnMatch = content.match(/export\s+(async\s+)?function\s+(use[A-Za-z0-9_]+)\s*\(/);
  const constMatch = content.match(/export\s+const\s+(use[A-Za-z0-9_]+)\s*=/);
  const exportName = fnMatch?.[2] || constMatch?.[1];
  if (!exportName) return findings;

  const fileBase = basename(file).replace(/\.ts$/, '');
  if (fileBase !== exportName) {
    findings.push({
      type: 'warning',
      message: `Composable export name does not match file name: ${exportName} vs ${fileBase}`,
      location: file,
      suggestion: 'Rename the file or export so `useX.ts` exports `useX` (reduces drift and improves discoverability).',
    });
  }

  return findings;
}

export async function auditVueArchitecture(_params: AuditParams): Promise<AuditResult> {
  const findings: AuditFinding[] = [];
  const recommendations: string[] = [];

  const vueSrcDir = join(PROJECT_ROOT, ...FRONTEND_SRC_SEGMENTS);
  if (!existsSync(vueSrcDir)) {
    return {
      category: 'vue-architecture',
      status: 'warn',
      score: 50,
      findings: [
        {
          type: 'warning',
          message: `${FRONTEND_ROOT}/src not found; cannot run Vue architecture audit.`,
          location: `${FRONTEND_ROOT}/src`,
          suggestion: 'Ensure the Vue client exists and the path is correct.',
        },
      ],
      recommendations: [],
      summary: `Vue architecture audit skipped (missing ${FRONTEND_ROOT}/src).`,
    };
  }

  const allFiles = await getAllFilesRecursive(vueSrcDir);
  const vueFiles = allFiles.filter(f => f.endsWith('.vue'));
  const tsFiles = allFiles.filter(f => f.endsWith('.ts'));

  // Scan components
  for (const abs of vueFiles) {
    try {
      const content = await readFile(abs, 'utf-8');
      const scripts = extractVueScriptBlocks(content);
      for (const script of scripts) {
        const file = toRepoPath(abs);
        findings.push(...scanVueComponentScript(file, script));
      }
    } catch (_error) {
      findings.push({
        type: 'warning',
        message: `Failed to read .vue file for audit: ${_error instanceof Error ? _error.message : String(_error)}`,
        location: toRepoPath(abs),
      });
    }
  }

  // Scan composable naming (lightweight, deterministic)
  const composableLike = tsFiles.filter(f => /\/use[A-Za-z0-9_]+\.(ts)$/.test(f) || f.includes('/composables/'));
  for (const abs of composableLike) {
    try {
      const content = await readFile(abs, 'utf-8');
      findings.push(...scanComposableNaming(toRepoPath(abs), content));
    } catch (_error) {
      findings.push({
        type: 'info',
        message: `Failed to read .ts file for composable naming audit: ${_error instanceof Error ? _error.message : String(_error)}`,
        location: toRepoPath(abs),
      });
    }
  }

  const scored = scoreFromFindings(findings);
  if (scored.status !== 'pass') {
    recommendations.push('Review `.project-manager/patterns/vue-architecture-contract.md` and move domain logic out of components.');
    recommendations.push('Review `.project-manager/patterns/composable-taxonomy.md` and standardize composable naming/return shapes.');
  }

  const errorCount = findings.filter(f => f.type === 'error').length;
  const warningCount = findings.filter(f => f.type === 'warning').length;

  return {
    category: 'vue-architecture',
    status: scored.status,
    score: scored.score,
    findings,
    recommendations,
    summary: `Scanned ${vueFiles.length} .vue file(s); found ${errorCount} error(s), ${warningCount} warning(s).`,
  };
}


