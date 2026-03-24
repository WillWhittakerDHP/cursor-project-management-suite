/**
 * LEARNING: Planning docs get more than a path link — a bounded excerpt keeps agents inside the chat artifact.
 * WHY: Reference-only lines are easy to skip; injected text makes domain boundaries visible without opening another file.
 * PATTERN: Single harness helper; no duplicate ARCHITECTURE.md parsers elsewhere.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import type { GovernanceDomain } from './work-profile';

const MAX_EXCERPT_CHARS = 12000;

/**
 * Load `.project-manager/ARCHITECTURE.md` and return a bounded excerpt for embedding in planning docs.
 * Default: sections 1–4 (overview through type boundaries). Optionally appends §5 (per-domain) when domains suggest it.
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
  if (start1 === -1) return null;

  const wantSection5 =
    governanceDomains?.some(d =>
      ['component', 'composable', 'architecture', 'data_flow', 'type'].includes(d)
    ) ?? false;

  let end = start5 === -1 ? raw.length : start5;
  if (wantSection5 && start5 !== -1) {
    end = start6 === -1 ? raw.length : start6;
  }

  let body = raw.slice(start1, end).trim();
  if (!body) return null;
  if (body.length > MAX_EXCERPT_CHARS) {
    body = body.slice(0, MAX_EXCERPT_CHARS) + '\n\n_(Excerpt truncated.)_';
  }
  return body;
}
