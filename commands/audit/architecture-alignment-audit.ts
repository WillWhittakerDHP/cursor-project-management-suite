/**
 * Advisory architecture-alignment check: maps changed paths to ARCHITECTURE_DOMAINS.json.
 * Paths come from git-manager — no git subprocess in this module.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PROJECT_ROOT, FRONTEND_ROOT } from '../utils/utils';

const CONFIG_PATH = join(PROJECT_ROOT, '.project-manager', 'ARCHITECTURE_DOMAINS.json');
const OUT_JSON = join(PROJECT_ROOT, FRONTEND_ROOT, '.audit-reports', 'architecture-alignment-audit.json');

interface DomainConfig {
  clientPaths: string[];
  serverPaths: string[];
  composablePrefixes: string[];
  modelNames: string[];
}

interface DomainsFile {
  ignorePathPrefixes: string[];
  domains: Record<string, DomainConfig>;
}

function loadConfig(): DomainsFile | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as DomainsFile;
  } catch {
    return null;
  }
}

function normalizePrefix(p: string): string {
  return p.replace(/\/$/, '');
}

function pathUnderAnyPrefix(rel: string, prefixes: string[]): boolean {
  return prefixes.some(p => {
    const n = normalizePrefix(p);
    return rel === n || rel.startsWith(`${n}/`);
  });
}

function isIgnored(rel: string, ignorePathPrefixes: string[]): boolean {
  return ignorePathPrefixes.some(p => {
    const n = normalizePrefix(p);
    return rel === n || rel.startsWith(`${n}/`);
  });
}

/** Any domain claims this path via clientPaths or serverPaths. */
function domainClaimingPath(
  rel: string,
  domains: Record<string, DomainConfig>
): string | null {
  for (const [name, cfg] of Object.entries(domains)) {
    if (pathUnderAnyPrefix(rel, cfg.clientPaths) || pathUnderAnyPrefix(rel, cfg.serverPaths)) {
      return name;
    }
  }
  return null;
}

/**
 * Run alignment audit; writes architecture-alignment-audit.json for tier-quality consumption.
 */
export function runArchitectureAlignmentAuditSync(changedRepoPaths: string[]): void {
  const cfg = loadConfig();
  const files: Array<{ repoPath: string; score?: number; priority?: string; message?: string }> = [];

  if (!cfg) {
    mkdirSync(join(PROJECT_ROOT, FRONTEND_ROOT, '.audit-reports'), { recursive: true });
    writeFileSync(
      OUT_JSON,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          files: [],
          summary: { totalWarnings: 0, note: 'ARCHITECTURE_DOMAINS.json missing or invalid' },
        },
        null,
        2
      )
    );
    return;
  }

  for (const relRaw of changedRepoPaths) {
    const rel = relRaw.replace(/^\/+/, '');
    if (!rel || isIgnored(rel, cfg.ignorePathPrefixes)) continue;

    if (rel.startsWith('client/src/') || rel.startsWith('server/src/')) {
      const claimed = domainClaimingPath(rel, cfg.domains);
      if (!claimed) {
        files.push({
          repoPath: rel,
          score: 2,
          priority: 'P3',
          message:
            'Changed path is under client/src or server/src but not mapped in ARCHITECTURE_DOMAINS.json — confirm domain placement (see .project-manager/ARCHITECTURE.md).',
        });
      }
    }

    if (/\.(ts|vue|js)$/i.test(rel) && existsSync(join(PROJECT_ROOT, rel))) {
      try {
        const src = readFileSync(join(PROJECT_ROOT, rel), 'utf8');
        if (rel.startsWith('client/') && /from\s+['"][^'"]*server\/src/i.test(src)) {
          files.push({
            repoPath: rel,
            score: 8,
            priority: 'P1',
            message: 'Client file appears to import server/src — violates client/server boundary (use @shared contracts).',
          });
        }
        if (rel.startsWith('server/') && /from\s+['"][^'"]*client\/src/i.test(src)) {
          files.push({
            repoPath: rel,
            score: 8,
            priority: 'P1',
            message: 'Server file appears to import client/src — violates server/client boundary.',
          });
        }
      } catch {
        /* unreadable binary or permission */
      }
    }
  }

  mkdirSync(join(PROJECT_ROOT, FRONTEND_ROOT, '.audit-reports'), { recursive: true });
  writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        files,
        summary: { totalWarnings: files.length },
      },
      null,
      2
    )
  );
}

export async function runArchitectureAlignmentAuditFromGitManager(
  listPaths: () => Promise<string[]>
): Promise<void> {
  const paths = await listPaths();
  runArchitectureAlignmentAuditSync(paths);
}
