/**
 * Governance Context Builder
 *
 * Reads audit JSON findings and governance playbook summaries, then produces
 * a tier-appropriate markdown string injected into tier-start output.
 *
 * Each tier gets different depth:
 *   Feature  → strategic (test coverage, security, dependency health, governance dashboard)
 *   Phase    → structural (type health, duplication, import graph, architecture)
 *   Session  → tactical (all four governance domains with findings + condensed decision trees)
 *   Task     → file-scoped (violations filtered to the task's files, inventory matches)
 *
 * Source data: client/.audit-reports/*.json
 * Playbook source: .project-manager/*_AUTHORING_PLAYBOOK.md (condensed inline)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { TierName } from '../tiers/shared/types';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../utils/utils';

const REPORTS_DIR = join(PROJECT_ROOT, FRONTEND_ROOT, '.audit-reports');

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

interface AuditJson {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function loadJson(relativePath: string): AuditJson | null {
  const fullPath = join(REPORTS_DIR, relativePath);
  if (!existsSync(fullPath)) return null;
  try {
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Condensed playbook content (stable extracts — update when playbooks change)
// Source: .project-manager/*_AUTHORING_PLAYBOOK.md
// ---------------------------------------------------------------------------

const FUNCTION_THRESHOLDS = [
  '| Concern | Threshold |',
  '|---------|-----------|',
  '| Nesting depth | ≤ 3 levels |',
  '| Branch count | ≤ 8 / function |',
  '| Length (branchy) | ≤ 50 lines |',
  '| Script setup | ≤ 100 lines |',
  '| Params / returns | ≤ 4 each |',
  '| Return type | Explicit on exported/boundary |',
].join('\n');

const FUNCTION_DECISION_TREE =
  '1. Exceeds thresholds? → extract helpers or use lookup tables\n' +
  '2. Route handler / allowlisted context? → confirm allowlist entry\n' +
  '3. In composable or UI-facing module? → prefer extraction, low nesting';

const COMPONENT_THRESHOLDS = [
  '| Concern | Threshold |',
  '|---------|-----------|',
  '| Prop count | ≤ 8 (or config object) |',
  '| Emit count | ≤ 8 (or grouped) |',
  '| Component coupling | ≤ 5 direct imports |',
  '| Template directive depth | ≤ 3 |',
  '| Template size | ≤ 200 lines |',
  '| Complex expression | ≤ 80 chars |',
].join('\n');

const COMPONENT_DECISION_TREE =
  '1. Exceeds prop/emit/coupling/template thresholds? → decompose or extract\n' +
  '2. Orchestrator / allowlisted wrapper? → confirm allowlist entry\n' +
  '3. Script logic can move to composable/util? → extract (Tier1 hotspots: watch, async, map/reduce, DOM)';

const COMPOSABLE_THRESHOLDS = [
  '| Concern | Threshold |',
  '|---------|-----------|',
  '| Return surface | < 10 properties |',
  '| Composable imports | < 6 per file |',
  '| Return type | Explicit on exported |',
  '| Provide | Typed InjectionKey (no string keys) |',
  '| Mutation | Action-based (setX / updateX / toggleX) |',
].join('\n');

const COMPOSABLE_DECISION_TREE =
  '1. Oversized return? → decompose into focused composables\n' +
  '2. Excessive imports? → introduce facade or split orchestration\n' +
  '3. Missing return type / untyped provide? → add explicit types';

const TYPE_THRESHOLDS = [
  '| Concern | Threshold |',
  '|---------|-----------|',
  '| Mixed type+constant files | Separate into types/ and constants/ |',
  '| Inline types in composables | Move shared to types/<domain>/ |',
  '| Duplicate type names | Consolidate or disambiguate |',
  '| Escape hatches (as any) | Avoid; use type guards instead |',
  '| Boundary: read-only | ComputedRef<T> |',
  '| Boundary: read+write | Ref<T> |',
].join('\n');

const TYPE_DECISION_TREE =
  '1. Shared type? → types/<domain>/; composable contract? → co-locate\n' +
  '2. Single-file-only type? → inline in <script setup>\n' +
  '3. New escape hatch? → prefer type guard over assertion';

// ---------------------------------------------------------------------------
// Governance score helpers (mirrors audit/utils.ts but returns raw counts too)
// ---------------------------------------------------------------------------

interface GovernanceScores {
  functionGovernance?: number;
  componentGovernance?: number;
  composableGovernance?: number;
  typeInventory?: number;
}

function computeGovernanceScores(): GovernanceScores {
  const scores: GovernanceScores = {};

  const funcData = loadJson('function-complexity-audit.json');
  if (funcData?.files) {
    const files = funcData.files as Array<{ priority?: string }>;
    const p0 = files.filter(f => f.priority === 'P0').length;
    const p1 = files.filter(f => f.priority === 'P1').length;
    scores.functionGovernance = Math.max(0, 100 - p0 * 3 - p1);
  }

  const compData = loadJson('component-health-audit.json');
  if (compData?.files) {
    const files = compData.files as Array<{ priority?: string }>;
    const p0 = files.filter(f => f.priority === 'P0').length;
    const p1 = files.filter(f => f.priority === 'P1').length;
    scores.componentGovernance = Math.max(0, 100 - p0 * 3 - p1);
  }

  const composableHealth = loadJson('composable-health-audit.json');
  const funcForComposable = funcData;
  if (composableHealth || funcForComposable) {
    let score = 100;
    if (composableHealth?.findings) {
      for (const f of composableHealth.findings as Array<{ ruleId?: string }>) {
        const id = f.ruleId ?? '';
        if (id === 'missing-return-type') score -= 5;
        else if (id === 'oversized-return') score -= 2;
        else if (id === 'excessive-composable-imports') score -= 2;
        else if (id === 'untyped-provide') score -= 2;
      }
    }
    if (funcForComposable?.files) {
      const p0 = (funcForComposable.files as Array<{ priority?: string }>)
        .filter(f => f.priority === 'P0').length;
      score -= p0 * 3;
    }
    scores.composableGovernance = Math.max(0, score);
  }

  const typeData = loadJson('type-constant-inventory-audit.json');
  if (typeData?.summary?.classificationIssues) {
    const issues = typeData.summary.classificationIssues as Record<string, number>;
    let score = 100;
    score -= (issues.mixedTypeConstantFiles ?? 0) * 2;
    score -= (issues.inlineTypesInComposables ?? 0) * 1;
    score -= (issues.duplicateTypeNames ?? 0) * 5;
    score -= (issues.configsWithLogic ?? 0) * 2;
    score -= (issues.cleanupCandidates ?? 0) * 3;
    scores.typeInventory = Math.max(0, score);
  }

  return scores;
}

function formatScoreDashboard(scores: GovernanceScores): string {
  const lines: string[] = ['| Domain | Score |', '|--------|-------|'];
  if (scores.functionGovernance !== undefined)
    lines.push(`| Function governance | ${scores.functionGovernance}/100 |`);
  if (scores.componentGovernance !== undefined)
    lines.push(`| Component governance | ${scores.componentGovernance}/100 |`);
  if (scores.composableGovernance !== undefined)
    lines.push(`| Composable governance | ${scores.composableGovernance}/100 |`);
  if (scores.typeInventory !== undefined)
    lines.push(`| Type inventory | ${scores.typeInventory}/100 |`);
  return lines.length > 2 ? lines.join('\n') : '';
}

// ---------------------------------------------------------------------------
// Feature-tier builder (strategic)
// ---------------------------------------------------------------------------

function buildFeatureGovernance(): string {
  const sections: string[] = ['## Governance Context (Feature)\n'];

  const testData = loadJson('test-audit.json');
  if (testData?.summary) {
    const s = testData.summary;
    const untested = s.untestedSourceFiles ?? 0;
    const coverage = s.coveragePercentage ?? 0;
    const orphaned = s.orphanedTestFiles ?? 0;
    sections.push(
      `### Test Coverage\n- **${untested}** untested source files (${coverage}% coverage)` +
      (orphaned > 0 ? `\n- ${orphaned} orphaned test files` : '')
    );
  }

  const secData = loadJson('security-audit.json');
  if (secData?.summary) {
    const errors = secData.summary.totalErrors ?? 0;
    const warnings = secData.summary.totalWarnings ?? 0;
    sections.push(
      `### Security Posture\n- Errors: **${errors}** | Warnings: **${warnings}**`
    );
  }

  const depData = loadJson('dep-freshness-audit.json');
  if (depData?.byBehind) {
    const major = depData.byBehind['major-behind'] ?? 0;
    const minor = depData.byBehind['minor-behind'] ?? 0;
    if (major > 0 || minor > 0) {
      sections.push(
        `### Dependency Health\n- **${major}** major-behind | **${minor}** minor-behind`
      );
    }
  }

  const bundleData = loadJson('bundle-size-budget-audit.json');
  if (bundleData?.budgetViolations && (bundleData.budgetViolations as unknown[]).length > 0) {
    sections.push(
      `### Bundle Budget\n- **${(bundleData.budgetViolations as unknown[]).length}** over-budget entries`
    );
  }

  const dupData = loadJson('duplication-audit.json');
  if (dupData?.candidates?.similarFunctionPatterns) {
    const patterns = dupData.candidates.similarFunctionPatterns as unknown[];
    if (patterns.length > 0) {
      sections.push(
        `### Duplication\n- **${patterns.length}** similar-function-pattern groups detected`
      );
    }
  }

  const scores = computeGovernanceScores();
  const dashboard = formatScoreDashboard(scores);
  if (dashboard) {
    sections.push(`### Governance Dashboard\n\n${dashboard}`);
  }

  sections.push(
    '\n*Governance playbooks:* `.project-manager/*_AUTHORING_PLAYBOOK.md`'
  );

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Phase-tier builder (structural)
// ---------------------------------------------------------------------------

function buildPhaseGovernance(): string {
  const sections: string[] = ['## Governance Context (Phase)\n'];

  const typeHealthData = loadJson('type-health-audit.json');
  if (typeHealthData) {
    const findings = (typeHealthData.findings ?? []) as Array<{ ruleId?: string }>;
    const p0 = findings.filter(
      f => f.ruleId === 'nested-partial' || f.ruleId === 'record-string-any'
    ).length;
    const waves = typeHealthData.repairWaves ?? {};
    const highFanIn = ((waves as Record<string, unknown[]>).highFanIn ?? []).length;
    if (p0 > 0 || highFanIn > 0) {
      const parts = [`### Type Health`];
      if (p0 > 0) parts.push(`- **${p0}** P0 findings (nested utility types, Record<string,any>)`);
      if (highFanIn > 0) parts.push(`- **${highFanIn}** high-fan-in types requiring coordinated repair`);
      sections.push(parts.join('\n'));
    }
  }

  const typeInvData = loadJson('type-constant-inventory-audit.json');
  if (typeInvData?.summary?.classificationIssues) {
    const ci = typeInvData.summary.classificationIssues as Record<string, number>;
    const issues: string[] = [];
    if (ci.mixedTypeConstantFiles) issues.push(`${ci.mixedTypeConstantFiles} mixed type+constant files`);
    if (ci.inlineTypesInComposables) issues.push(`${ci.inlineTypesInComposables} inline types in composables`);
    if (ci.duplicateTypeNames) issues.push(`${ci.duplicateTypeNames} duplicate type names`);
    if (issues.length > 0) {
      sections.push(`### Type Inventory Issues\n${issues.map(i => `- ${i}`).join('\n')}`);
    }
  }

  const dupData = loadJson('duplication-audit.json');
  if (dupData?.candidates?.similarFunctionPatterns) {
    const patterns = dupData.candidates.similarFunctionPatterns as Array<{ prefix?: string; files?: string[] }>;
    const top = patterns.slice(0, 5);
    if (top.length > 0) {
      const lines = top.map(p =>
        `- **${p.prefix ?? '?'}** pattern across ${(p.files ?? []).length} files`
      );
      sections.push(`### Duplication Hotspots (top ${top.length})\n${lines.join('\n')}`);
    }
  }

  const igData = loadJson('import-graph-audit.json');
  if (igData) {
    const cycles = (igData.cycles ?? []) as unknown[];
    const fanIn = (igData.fanInViolations ?? []) as Array<{ file?: string; fanIn?: number }>;
    const chainDepth = (igData.composableChainDepthViolations ?? []) as Array<{ file?: string; depth?: number }>;
    const parts: string[] = [];
    if (cycles.length > 0) parts.push(`- **${cycles.length}** circular dependencies`);
    if (fanIn.length > 0) {
      const top = fanIn.slice(0, 3).map(v => `\`${v.file}\` (${v.fanIn})`).join(', ');
      parts.push(`- **${fanIn.length}** fan-in violations: ${top}`);
    }
    if (chainDepth.length > 0) {
      parts.push(`- **${chainDepth.length}** composable chain depth violations (max depth exceeded)`);
    }
    if (parts.length > 0) {
      sections.push(`### Import Graph\n${parts.join('\n')}`);
    }
  }

  const scores = computeGovernanceScores();
  const dashboard = formatScoreDashboard(scores);
  if (dashboard) {
    sections.push(`### Governance Dashboard\n\n${dashboard}`);
  }

  sections.push(
    '\n*Type playbook:* `.project-manager/TYPE_AUTHORING_PLAYBOOK.md`'
  );

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Session-tier builder (tactical — all four governance domains)
// ---------------------------------------------------------------------------

function buildSessionGovernance(): string {
  const sections: string[] = ['## Governance Context (Session)\n'];

  // --- Function governance ---
  const funcData = loadJson('function-complexity-audit.json');
  if (funcData?.files && (funcData.files as unknown[]).length > 0) {
    const files = funcData.files as Array<{ repoPath?: string; priority?: string; violations?: string[] }>;
    const p0Files = files.filter(f => f.priority === 'P0');
    const p1Files = files.filter(f => f.priority === 'P1');
    const parts = ['### Function Governance'];
    if (p0Files.length > 0) {
      parts.push(`**P0 violations (${p0Files.length}):**`);
      for (const f of p0Files.slice(0, 5)) {
        parts.push(`- \`${f.repoPath}\` — ${(f.violations ?? []).join(', ') || 'threshold exceeded'}`);
      }
      if (p0Files.length > 5) parts.push(`- … and ${p0Files.length - 5} more`);
    }
    if (p1Files.length > 0) {
      parts.push(`**P1 violations (${p1Files.length}):**`);
      for (const f of p1Files.slice(0, 3)) {
        parts.push(`- \`${f.repoPath}\` — ${(f.violations ?? []).join(', ') || 'threshold exceeded'}`);
      }
      if (p1Files.length > 3) parts.push(`- … and ${p1Files.length - 3} more`);
    }
    parts.push('', '**Thresholds:**', FUNCTION_THRESHOLDS, '', FUNCTION_DECISION_TREE);
    sections.push(parts.join('\n'));
  } else {
    sections.push(`### Function Governance\nClean — no violations detected.\n\n**Thresholds:**\n${FUNCTION_THRESHOLDS}`);
  }

  // --- Component governance ---
  const compHealthData = loadJson('component-health-audit.json');
  const compLogicData = loadJson('component-logic-audit.json');
  {
    const parts = ['### Component Governance'];
    const healthFindings = (compHealthData?.findings ?? []) as Array<{ file?: string; ruleId?: string; message?: string }>;
    const logicFiles = (compLogicData?.files ?? []) as Array<{ repoPath?: string; score?: number; complexityScore?: number }>;
    const hotspots = logicFiles.filter(f => (f.score ?? f.complexityScore ?? 0) >= 20);

    if (healthFindings.length > 0) {
      parts.push(`**Health findings (${healthFindings.length}):**`);
      for (const f of healthFindings.slice(0, 5)) {
        parts.push(`- \`${f.file}\` — ${f.ruleId}: ${f.message ?? ''}`);
      }
      if (healthFindings.length > 5) parts.push(`- … and ${healthFindings.length - 5} more`);
    }
    if (hotspots.length > 0) {
      parts.push(`**Logic hotspots (${hotspots.length}):**`);
      for (const f of hotspots.slice(0, 3)) {
        parts.push(`- \`${f.repoPath}\` (score: ${f.score ?? f.complexityScore ?? 0})`);
      }
    }
    if (healthFindings.length === 0 && hotspots.length === 0) {
      parts.push('Clean — no violations detected.');
    }
    parts.push('', '**Thresholds:**', COMPONENT_THRESHOLDS, '', COMPONENT_DECISION_TREE);
    sections.push(parts.join('\n'));
  }

  // --- Composable governance ---
  const composableHealthData = loadJson('composable-health-audit.json');
  const composableLogicData = loadJson('composables-logic-audit.json');
  {
    const parts = ['### Composable Governance'];
    const findings = (composableHealthData?.findings ?? []) as Array<{ file?: string; ruleId?: string; message?: string }>;
    const logicFiles = (composableLogicData?.files ?? []) as Array<{ repoPath?: string; score?: number; complexityScore?: number }>;
    const hotspots = logicFiles.filter(f => (f.score ?? f.complexityScore ?? 0) >= 20);

    if (findings.length > 0) {
      parts.push(`**Health findings (${findings.length}):**`);
      for (const f of findings.slice(0, 5)) {
        parts.push(`- \`${f.file}\` — ${f.ruleId}: ${f.message ?? ''}`);
      }
      if (findings.length > 5) parts.push(`- … and ${findings.length - 5} more`);
    }
    if (hotspots.length > 0) {
      parts.push(`**Logic hotspots (${hotspots.length}):**`);
      for (const f of hotspots.slice(0, 3)) {
        parts.push(`- \`${f.repoPath}\` (score: ${f.score ?? f.complexityScore ?? 0})`);
      }
    }
    if (findings.length === 0 && hotspots.length === 0) {
      parts.push('Clean — no violations detected.');
    }
    parts.push('', '**Thresholds:**', COMPOSABLE_THRESHOLDS, '', COMPOSABLE_DECISION_TREE);
    sections.push(parts.join('\n'));
  }

  // --- Type governance ---
  const typeEscapeData = loadJson('type-escape-audit.json');
  const typeInvData = loadJson('type-constant-inventory-audit.json');
  {
    const parts = ['### Type Governance'];
    const escapeFindings = (typeEscapeData?.findings ?? []) as Array<{ file?: string; ruleId?: string; message?: string }>;
    const ci = (typeInvData?.summary?.classificationIssues ?? {}) as Record<string, number>;

    if (escapeFindings.length > 0) {
      parts.push(`**Escape hatches (${escapeFindings.length}):**`);
      for (const f of escapeFindings.slice(0, 5)) {
        parts.push(`- \`${f.file}\` — ${f.ruleId ?? 'type-escape'}`);
      }
      if (escapeFindings.length > 5) parts.push(`- … and ${escapeFindings.length - 5} more`);
    }

    const issueLines: string[] = [];
    if (ci.mixedTypeConstantFiles) issueLines.push(`${ci.mixedTypeConstantFiles} mixed type+constant files`);
    if (ci.inlineTypesInComposables) issueLines.push(`${ci.inlineTypesInComposables} inline types in composables`);
    if (ci.duplicateTypeNames) issueLines.push(`${ci.duplicateTypeNames} duplicate type names`);
    if (issueLines.length > 0) {
      parts.push(`**Inventory issues:**\n${issueLines.map(l => `- ${l}`).join('\n')}`);
    }

    if (escapeFindings.length === 0 && issueLines.length === 0) {
      parts.push('Clean — no violations detected.');
    }
    parts.push('', '**Thresholds:**', TYPE_THRESHOLDS, '', TYPE_DECISION_TREE);
    sections.push(parts.join('\n'));
  }

  // --- Score dashboard ---
  const scores = computeGovernanceScores();
  const dashboard = formatScoreDashboard(scores);
  if (dashboard) {
    sections.push(`### Governance Dashboard\n\n${dashboard}`);
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Task-tier builder (file-scoped)
// ---------------------------------------------------------------------------

/**
 * Normalise a file path for comparison: strip leading `./`, ensure no trailing slash,
 * strip any extension for partial matching.
 */
function normalisePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\/$/, '');
}

interface FileFinding {
  ruleId: string;
  message: string;
  fixHint?: string;
  source: string;
}

function collectFileFindings(taskFiles: string[]): Map<string, FileFinding[]> {
  const map = new Map<string, FileFinding[]>();
  const normalised = taskFiles.map(normalisePath);

  function matchesTask(filePath: string | undefined): string | undefined {
    if (!filePath) return undefined;
    const norm = normalisePath(filePath);
    return normalised.find(tf => norm === tf || norm.startsWith(tf) || tf.startsWith(norm));
  }

  function push(taskFile: string, finding: FileFinding): void {
    const list = map.get(taskFile) ?? [];
    list.push(finding);
    map.set(taskFile, list);
  }

  // Function complexity
  const funcData = loadJson('function-complexity-audit.json');
  if (funcData?.files) {
    for (const f of funcData.files as Array<{ repoPath?: string; priority?: string; violations?: string[] }>) {
      const match = matchesTask(f.repoPath);
      if (match) {
        push(match, {
          ruleId: 'function-complexity',
          message: `${f.priority ?? '?'} — ${(f.violations ?? []).join(', ') || 'threshold exceeded'}`,
          source: 'function-complexity-audit',
        });
      }
    }
  }

  // Component health
  const compHealth = loadJson('component-health-audit.json');
  if (compHealth?.findings) {
    for (const f of compHealth.findings as Array<{ file?: string; ruleId?: string; message?: string; fixHint?: string }>) {
      const match = matchesTask(f.file);
      if (match) {
        push(match, {
          ruleId: f.ruleId ?? 'component-health',
          message: f.message ?? f.ruleId ?? 'violation',
          fixHint: f.fixHint,
          source: 'component-health-audit',
        });
      }
    }
  }

  // Component logic
  const compLogic = loadJson('component-logic-audit.json');
  if (compLogic?.files) {
    for (const f of compLogic.files as Array<{ repoPath?: string; score?: number; complexityScore?: number }>) {
      const score = f.score ?? f.complexityScore ?? 0;
      if (score < 20) continue;
      const match = matchesTask(f.repoPath);
      if (match) {
        push(match, {
          ruleId: 'component-logic-hotspot',
          message: `Tier1 logic hotspot (score: ${score})`,
          source: 'component-logic-audit',
        });
      }
    }
  }

  // Composable health
  const composableHealth = loadJson('composable-health-audit.json');
  if (composableHealth?.findings) {
    for (const f of composableHealth.findings as Array<{ file?: string; ruleId?: string; message?: string; fixHint?: string }>) {
      const match = matchesTask(f.file);
      if (match) {
        push(match, {
          ruleId: f.ruleId ?? 'composable-health',
          message: f.message ?? f.ruleId ?? 'violation',
          fixHint: f.fixHint,
          source: 'composable-health-audit',
        });
      }
    }
  }

  // Composable logic
  const composableLogic = loadJson('composables-logic-audit.json');
  if (composableLogic?.files) {
    for (const f of composableLogic.files as Array<{ repoPath?: string; score?: number; complexityScore?: number }>) {
      const score = f.score ?? f.complexityScore ?? 0;
      if (score < 20) continue;
      const match = matchesTask(f.repoPath);
      if (match) {
        push(match, {
          ruleId: 'composable-logic-hotspot',
          message: `Tier1 logic hotspot (score: ${score})`,
          source: 'composables-logic-audit',
        });
      }
    }
  }

  // Type escape
  const typeEscape = loadJson('type-escape-audit.json');
  if (typeEscape?.findings) {
    for (const f of typeEscape.findings as Array<{ file?: string; ruleId?: string; message?: string }>) {
      const match = matchesTask(f.file);
      if (match) {
        push(match, {
          ruleId: f.ruleId ?? 'type-escape',
          message: f.message ?? 'escape hatch',
          source: 'type-escape-audit',
        });
      }
    }
  }

  // Typecheck errors
  const typecheck = loadJson('typecheck/typecheck-audit.json');
  if (typecheck?.errors) {
    for (const e of typecheck.errors as Array<{ repoPath?: string; code?: string; message?: string }>) {
      const match = matchesTask(e.repoPath);
      if (match) {
        push(match, {
          ruleId: `ts(${e.code ?? '?'})`,
          message: e.message ?? 'TypeScript error',
          source: 'typecheck-audit',
        });
      }
    }
  }

  // Error handling
  const errHandling = loadJson('error-handling-audit.json');
  if (errHandling?.issues) {
    for (const issue of errHandling.issues as Array<{ severity?: string; file?: string; message?: string }>) {
      if (issue.severity !== 'critical' && issue.severity !== 'error') continue;
      const match = matchesTask(issue.file);
      if (match) {
        push(match, {
          ruleId: 'error-handling',
          message: issue.message ?? 'error handling issue',
          source: 'error-handling-audit',
        });
      }
    }
  }

  // Hardcoding
  const hardcoding = loadJson('hardcoding-audit.json');
  if (hardcoding?.files) {
    for (const f of hardcoding.files as Array<{ repoPath?: string; score?: number }>) {
      if ((f.score ?? 0) < 15) continue;
      const match = matchesTask(f.repoPath);
      if (match) {
        push(match, {
          ruleId: 'hardcoding',
          message: `Hardcoding patterns detected (score: ${f.score})`,
          source: 'hardcoding-audit',
        });
      }
    }
  }

  // Loop mutations
  const loopMutation = loadJson('loop-mutation-audit.json');
  if (loopMutation?.files) {
    for (const f of loopMutation.files as Array<{ repoPath?: string; forEachMutationHits?: unknown[] }>) {
      if ((f.forEachMutationHits?.length ?? 0) === 0) continue;
      const match = matchesTask(f.repoPath);
      if (match) {
        push(match, {
          ruleId: 'loop-mutation',
          message: `forEach→mutation pattern (${f.forEachMutationHits!.length} hits)`,
          source: 'loop-mutation-audit',
        });
      }
    }
  }

  return map;
}

function collectInventoryMatches(taskFiles: string[]): string[] {
  const matches: string[] = [];
  const normalised = taskFiles.map(normalisePath);

  function domainFromPath(filePath: string): string[] {
    const segments = filePath.split('/');
    const keywords: string[] = [];
    for (const seg of segments) {
      if (['client', 'src', 'composables', 'components', 'utils', 'types', 'admin'].includes(seg)) continue;
      if (seg.includes('.')) {
        keywords.push(seg.replace(/\.[^.]+$/, ''));
      } else {
        keywords.push(seg);
      }
    }
    return keywords.filter(k => k.length > 2);
  }

  const allKeywords = normalised.flatMap(domainFromPath).map(k => k.toLowerCase());
  if (allKeywords.length === 0) return matches;

  const inventoryData = loadJson('inventory-audit.json');
  if (inventoryData?.composables) {
    for (const c of (inventoryData.composables as Array<{ name?: string; repoPath?: string; directoryDomain?: string }>).slice(0, 500)) {
      const name = (c.name ?? '').toLowerCase();
      const domain = (c.directoryDomain ?? '').toLowerCase();
      if (allKeywords.some(k => name.includes(k) || domain.includes(k))) {
        matches.push(`\`${c.name}\` (${c.repoPath ?? 'composable'})`);
      }
    }
  }

  if (inventoryData?.utils) {
    for (const u of (inventoryData.utils as Array<{ name?: string; repoPath?: string; directoryDomain?: string }>).slice(0, 300)) {
      const name = (u.name ?? '').toLowerCase();
      const domain = (u.directoryDomain ?? '').toLowerCase();
      if (allKeywords.some(k => name.includes(k) || domain.includes(k))) {
        matches.push(`\`${u.name}\` (${u.repoPath ?? 'util'})`);
      }
    }
  }

  const typeInvData = loadJson('type-constant-inventory-audit.json');
  if (typeInvData?.typeFiles) {
    for (const t of (typeInvData.typeFiles as Array<{ name?: string; repoPath?: string; directoryDomain?: string }>).slice(0, 500)) {
      const name = (t.name ?? '').toLowerCase();
      const domain = (t.directoryDomain ?? '').toLowerCase();
      if (allKeywords.some(k => name.includes(k) || domain.includes(k))) {
        matches.push(`\`${t.name}\` (${t.repoPath ?? 'type'})`);
      }
    }
  }

  return [...new Set(matches)].slice(0, 15);
}

function detectTaskFileTypes(taskFiles: string[]): Set<'component' | 'composable' | 'type' | 'util' | 'other'> {
  const types = new Set<'component' | 'composable' | 'type' | 'util' | 'other'>();
  for (const f of taskFiles) {
    if (f.endsWith('.vue') || f.includes('/components/')) types.add('component');
    else if (f.includes('/composables/') || f.match(/use[A-Z]/)) types.add('composable');
    else if (f.includes('/types/')) types.add('type');
    else if (f.includes('/utils/')) types.add('util');
    else types.add('other');
  }
  return types;
}

function buildTaskGovernance(taskFiles: string[]): string {
  if (taskFiles.length === 0) {
    return '## Governance Context (Task)\n\nNo task files specified — governance checks skipped. ' +
      'Fill in **Files:** in the session guide for file-scoped governance.';
  }

  const sections: string[] = [`## Governance Context (Task)\n`];

  // File-scoped findings
  const findingsMap = collectFileFindings(taskFiles);
  if (findingsMap.size > 0) {
    const parts = ['### File-Scoped Violations\n'];
    for (const [file, findings] of findingsMap) {
      parts.push(`**\`${file}\`:**`);
      for (const f of findings) {
        const fix = f.fixHint ? ` → ${f.fixHint}` : '';
        parts.push(`- **${f.ruleId}:** ${f.message}${fix}`);
      }
      parts.push('');
    }
    sections.push(parts.join('\n'));
  } else {
    sections.push('### File-Scoped Violations\nNo existing violations in task files.');
  }

  // Inventory matches
  const inventoryMatches = collectInventoryMatches(taskFiles);
  if (inventoryMatches.length > 0) {
    sections.push(
      `### Related Existing Code\nBefore creating new, check:\n${inventoryMatches.map(m => `- ${m}`).join('\n')}`
    );
  }

  // Tier-appropriate thresholds based on file types
  const fileTypes = detectTaskFileTypes(taskFiles);
  const thresholdParts: string[] = ['### Thresholds (Quick Reference)\n'];
  if (fileTypes.has('component')) {
    thresholdParts.push('**Component:**', COMPONENT_THRESHOLDS, '');
  }
  if (fileTypes.has('composable')) {
    thresholdParts.push('**Composable:**', COMPOSABLE_THRESHOLDS, '');
  }
  if (fileTypes.has('component') || fileTypes.has('composable') || fileTypes.has('util')) {
    thresholdParts.push('**Function:**', FUNCTION_THRESHOLDS, '');
  }
  if (fileTypes.has('type')) {
    thresholdParts.push('**Type:**', TYPE_THRESHOLDS, '');
  }
  if (thresholdParts.length > 1) {
    sections.push(thresholdParts.join('\n'));
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GovernanceContextConfig {
  tier: TierName;
  taskFiles?: string[];
}

/**
 * Build a tier-appropriate governance context string for injection into tier-start output.
 * Returns empty string if no governance data is available.
 */
export async function buildGovernanceContext(config: GovernanceContextConfig): Promise<string> {
  try {
    switch (config.tier) {
      case 'feature':
        return buildFeatureGovernance();
      case 'phase':
        return buildPhaseGovernance();
      case 'session':
        return buildSessionGovernance();
      case 'task':
        return buildTaskGovernance(config.taskFiles ?? []);
      default:
        return '';
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return `## Governance Context\n\n⚠️ Failed to build governance context: ${msg}`;
  }
}
