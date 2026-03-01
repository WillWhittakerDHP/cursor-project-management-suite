/**
 * ContextInjector: two-phase context planning and building (charter §7.6).
 * plan() is deterministic; build() reads files and produces ContextPack with dropped-artifact report.
 * Required-artifact overflow logs warnings only (telemetry-only enforcement).
 */

import { readFile, access } from 'fs/promises';
import { join } from 'path';
import type {
  WorkflowSpec,
  ContextInjectionPlan,
  ArtifactRequest,
  ContextSources,
  ContextPackFull,
  ContextArtifact,
  DroppedArtifact,
  ContextInjector,
} from './contracts';

const DEFAULT_ESTIMATE_PER_ARTIFACT = 500;

/** Build a deterministic plan from spec: required + scored candidates and budget. */
function buildPlanFromSpec(spec: WorkflowSpec): ContextInjectionPlan {
  const budget = spec.contextBudget;
  const requiredArtifacts: ArtifactRequest[] = [];
  const scoredCandidates: ArtifactRequest[] = [];

  const tier = spec.tier;
  const action = spec.action;
  const identifier = spec.identifier;
  const featureName = spec.featureContext.featureName;

  // Required: tier guide and scope state for start/end
  if (action === 'start' || action === 'end') {
    requiredArtifacts.push({
      artifactId: `scope_${tier}_${identifier}`,
      path: `.project-manager/.tier-scope`,
      kind: 'scope_state',
      priority: 'required',
      estimatedTokens: 200,
    });
    if (tier === 'session' || tier === 'task') {
      requiredArtifacts.push({
        artifactId: `guide_${tier}_${identifier}`,
        path: tier === 'session'
          ? `.project-manager/phase-guides/${identifier.split('.').slice(0, 2).join('.')}/session-${identifier}.md`
          : `.project-manager/phase-guides/${identifier.split('.').slice(0, 3).join('.')}/session-guide.md`,
        kind: 'tier_guide',
        priority: 'required',
        estimatedTokens: 1500,
      });
    }
  }

  // Scored candidates: handoff, log, code files (placeholder paths)
  scoredCandidates.push({
    artifactId: `handoff_${featureName}`,
    path: `.project-manager/${featureName}-handoff.md`,
    kind: 'tier_handoff',
    priority: 'high',
    estimatedTokens: 800,
  });
  if (tier === 'session' && action === 'end') {
    scoredCandidates.push({
      artifactId: `log_session_${identifier}`,
      path: `.project-manager/session-logs/${identifier}.md`,
      kind: 'tier_log',
      priority: 'medium',
      estimatedTokens: 600,
    });
  }

  return {
    requiredArtifacts,
    scoredCandidates,
    budget,
  };
}

/** Dedup by artifactId before scoring (charter: dedup rules enforced before scoring). */
function dedupRequests(requests: ArtifactRequest[]): ArtifactRequest[] {
  const seen = new Set<string>();
  return requests.filter((r) => {
    if (seen.has(r.artifactId)) return false;
    seen.add(r.artifactId);
    return true;
  });
}

/**
 * Default ContextInjector. plan() returns required + scored with budget; build() reads via sources, fills budget, reports dropped.
 */
/** Node.js FileSystemAdapter using fs/promises; paths are relative to project root. */
export function createNodeFileSystemAdapter(projectRoot: string): import('./contracts').FileSystemAdapter {
  return {
    async readFile(path: string): Promise<string> {
      const full = path.startsWith('/') ? path : join(projectRoot, path);
      return readFile(full, 'utf-8');
    },
    async exists(path: string): Promise<boolean> {
      const full = path.startsWith('/') ? path : join(projectRoot, path);
      try {
        await access(full);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function createContextInjector(): ContextInjector {
  return {
    plan(spec: WorkflowSpec): ContextInjectionPlan {
      return buildPlanFromSpec(spec);
    },

    async build(plan: ContextInjectionPlan, sources: ContextSources): Promise<ContextPackFull> {
      const dropped: DroppedArtifact[] = [];
      const artifacts: ContextArtifact[] = [];
      let usedTokens = 0;
      const maxTokens = plan.budget.maxTokens;

      const required = dedupRequests(plan.requiredArtifacts);
      const scored = dedupRequests(plan.scoredCandidates);

      for (const req of required) {
        const cost = req.estimatedTokens ?? DEFAULT_ESTIMATE_PER_ARTIFACT;
        if (usedTokens + cost > maxTokens) {
          dropped.push({
            artifactId: req.artifactId,
            path: req.path,
            reason: 'over_budget',
            score: 1,
            wouldHaveCost: cost,
          });
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(
              `[ContextInjector] Required artifact overflow (telemetry only): ${req.artifactId} would exceed budget; logged as dropped.`
            );
          }
          continue;
        }
        try {
          const exists = await sources.fs.exists(req.path);
          const snippet = exists ? (await sources.fs.readFile(req.path)).slice(0, 2000) : '';
          usedTokens += cost;
          artifacts.push({
            artifactId: req.artifactId,
            path: req.path,
            kind: req.kind,
            relevanceScore: 1,
            freshnessScore: 1,
            snippet,
            tokenCost: cost,
          });
        } catch {
          dropped.push({
            artifactId: req.artifactId,
            path: req.path,
            reason: 'over_budget',
            score: 1,
            wouldHaveCost: cost,
          });
        }
      }

      for (const cand of scored) {
        const cost = cand.estimatedTokens ?? DEFAULT_ESTIMATE_PER_ARTIFACT;
        if (usedTokens + cost > maxTokens) {
          dropped.push({
            artifactId: cand.artifactId,
            path: cand.path,
            reason: 'over_budget',
            score: 0.5,
            wouldHaveCost: cost,
          });
          continue;
        }
        try {
          const exists = await sources.fs.exists(cand.path);
          const snippet = exists ? (await sources.fs.readFile(cand.path)).slice(0, 2000) : '';
          usedTokens += cost;
          artifacts.push({
            artifactId: cand.artifactId,
            path: cand.path,
            kind: cand.kind,
            relevanceScore: 0.8,
            freshnessScore: 0.9,
            snippet,
            tokenCost: cost,
          });
        } catch {
          dropped.push({
            artifactId: cand.artifactId,
            path: cand.path,
            reason: 'low_relevance',
            score: 0.3,
            wouldHaveCost: cost,
          });
        }
      }

      const headroom = Math.max(0, maxTokens - usedTokens);
      return {
        summary: `Context pack: ${artifacts.length} artifacts, ${usedTokens} tokens used, ${dropped.length} dropped.`,
        artifacts,
        budget: {
          usedTokens,
          maxTokens,
          headroom,
          dropped,
        },
      };
    },
  };
}
