/**
 * LEARNING: Planning docs get more than a path link — a bounded excerpt keeps agents inside the chat artifact.
 * WHY: Reference-only lines are easy to skip; injected text makes domain boundaries visible without opening another file.
 * PATTERN: Single harness helper; no duplicate ARCHITECTURE.md parsers elsewhere.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { GovernanceDomain } from './work-profile';

/** Combined cap for injected planning excerpt (map slice + optional domain-rules slice). */
const TOTAL_EXCERPT_CHARS = 12000;
/** Budget for §§1–5 map slice before domain appendix. */
const MAP_SECTION_MAX_CHARS = 8000;
/** Budget for §8+ domain model / PartFinalizer / invariants when governance asks for it. */
const DOMAIN_RULES_MAX_CHARS = 4000;

function wantsDomainRulesAppend(domains?: readonly GovernanceDomain[]): boolean {
  return (
    domains?.some((d) => d === 'booking' || d === 'architecture' || d === 'data_flow') ?? false
  );
}

/**
 * Load `.project-manager/ARCHITECTURE.md` and return a bounded excerpt for embedding in planning docs.
 * Default: sections 1–4 (overview through type boundaries). Optionally appends §5 (per-domain) when domains suggest it.
 * When `booking`, `architecture`, or `data_flow` is present, appends §8+ (domain rules through invariants) with a separate char budget.
 */
export async function readArchitectureExcerptForPlanning(
  projectRoot: string,
  governanceDomains?: readonly GovernanceDomain[]
): Promise<string | null> {
  const path = join(projectRoot, '.project-manager', 'ARCHITECTURE.md');
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return null;
  }

  const start1 = raw.search(/^## 1\. /m);
  const start5 = raw.search(/^## 5\. /m);
  const start6 = raw.search(/^## 6\. /m);
  const start8 = raw.search(/^## 8\. /m);
  if (start1 === -1) return null;

  const wantSection5 =
    governanceDomains?.some((d) =>
      ['component', 'composable', 'architecture', 'data_flow', 'type'].includes(d)
    ) ?? false;

  let mapEnd = start5 === -1 ? raw.length : start5;
  if (wantSection5 && start5 !== -1) {
    mapEnd = start6 === -1 ? raw.length : start6;
  }

  let mapBody = raw.slice(start1, mapEnd).trim();
  if (!mapBody) return null;
  if (mapBody.length > MAP_SECTION_MAX_CHARS) {
    mapBody = mapBody.slice(0, MAP_SECTION_MAX_CHARS) + '\n\n_(Excerpt truncated.)_';
  }

  if (!wantsDomainRulesAppend(governanceDomains) || start8 === -1) {
    return trimToTotalCap(mapBody);
  }

  let domainBody = raw.slice(start8).trim();
  if (domainBody.length > DOMAIN_RULES_MAX_CHARS) {
    domainBody = domainBody.slice(0, DOMAIN_RULES_MAX_CHARS) + '\n\n_(Excerpt truncated.)_';
  }

  const combined = `${mapBody}\n\n---\n\n## (from ARCHITECTURE.md — domain rules §8+)\n\n${domainBody}`;
  return trimToTotalCap(combined);
}

function trimToTotalCap(body: string): string {
  if (body.length <= TOTAL_EXCERPT_CHARS) return body;
  return body.slice(0, TOTAL_EXCERPT_CHARS) + '\n\n_(Excerpt truncated.)_';
}
