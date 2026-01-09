/**
 * Atomic Command: Audit Command Registry
 *
 * Goal:
 * - Prevent export drift between `.cursor/commands/index.ts` and command implementation files.
 * - Detect duplicate slash-command names.
 * - Detect orphaned command files (have a command header but are not exported).
 *
 * PATTERN: Deterministic audits (data-first) — this is a structural integrity check, not a runtime test.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { PROJECT_ROOT } from '../../utils/utils';
import { AuditResult, AuditIssue } from './audit-types';

interface RegistryConfig {
  allowUnexportedCommandFiles?: string[];
  ignoreDirsContains?: string[];
}

interface IndexExport {
  kind: 'star' | 'named';
  modulePath: string; // like "./tiers/feature/atomic/feature-create"
  names?: string[]; // for named exports
}

function toCommandModuleFile(modulePath: string): string {
  // index.ts is in `.cursor/commands/`, so modulePath is relative to that folder
  // normalize: remove leading "./"
  const normalized = modulePath.replace(/^\.\//, '');
  return join(PROJECT_ROOT, '.cursor', 'commands', `${normalized}.ts`);
}

function toRepoPath(absPath: string): string {
  return absPath.replace(PROJECT_ROOT + '/', '');
}

function parseIndexExports(indexContent: string): IndexExport[] {
  const out: IndexExport[] = [];

  // export * from './path';
  const star = indexContent.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]\s*;?/g);
  for (const m of star) {
    out.push({ kind: 'star', modulePath: m[1] });
  }

  // export { a, b as c } from './path';
  const named = indexContent.matchAll(/export\s*\{\s*([^}]+?)\s*\}\s*from\s*['"]([^'"]+)['"]\s*;?/g);
  for (const m of named) {
    const namesRaw = m[1];
    const modulePath = m[2];
    const names = namesRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(part => part.split(/\s+as\s+/i)[0].trim())
      .filter(Boolean);
    out.push({ kind: 'named', modulePath, names });
  }

  return out;
}

function extractSlashCommandName(fileContent: string): string | null {
  const header = extractHeaderBlock(fileContent);
  // Matches: * Composite Command: /session-start ...
  const m = header.match(/\*\s+(Composite|Atomic)\s+Command:\s*(\/[A-Za-z0-9_-]+)/);
  return m ? m[2] : null;
}

function isCommandFile(fileContent: string): boolean {
  const header = extractHeaderBlock(fileContent);
  // Registry scope: only treat files as "slash commands" if they explicitly declare a `/command-name`
  // in the leading file header (not in examples later in the file).
  return /\*\s+(Composite|Atomic)\s+Command:\s*\/[A-Za-z0-9_-]+/.test(header);
}

function extractHeaderBlock(fileContent: string): string {
  // Prefer the leading JSDoc block comment if present; otherwise fall back to first 80 lines.
  const m = fileContent.match(/^\/\*\*[\s\S]*?\*\//);
  if (m) return m[0];
  return fileContent.split('\n').slice(0, 80).join('\n');
}

async function loadRegistryConfig(): Promise<RegistryConfig> {
  const configPath = join(PROJECT_ROOT, '.cursor', 'commands', 'registry', 'registry-audit-config.json');
  if (!existsSync(configPath)) return {};
  try {
    const raw = await readFile(configPath, 'utf-8');
    return JSON.parse(raw) as RegistryConfig;
  } catch {
    return {};
  }
}

async function getAllFilesRecursive(dir: string, ignoreContains: string[], out: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const abs = join(dir, e.name);
    const repoPath = toRepoPath(abs);
    if (ignoreContains.some(frag => repoPath.includes(frag))) continue;
    if (e.isDirectory()) {
      await getAllFilesRecursive(abs, ignoreContains, out);
      continue;
    }
    if (e.isFile()) out.push(abs);
  }
  return out;
}

/**
 * Registry audit entry point
 */
export async function auditRegistry(): Promise<AuditResult> {
  const issues: AuditIssue[] = [];
  const recommendations: string[] = [];
  const config = await loadRegistryConfig();
  const ignoreContains = config.ignoreDirsContains || ['/node_modules/', '/dist/', '/.git/'];
  const allowUnexported = new Set(config.allowUnexportedCommandFiles || []);

  const indexAbs = join(PROJECT_ROOT, '.cursor', 'commands', 'index.ts');
  const indexContent = await readFile(indexAbs, 'utf-8');
  const exports = parseIndexExports(indexContent);

  // 1) Export surface must resolve to existing modules
  const exportedModuleFiles = new Set<string>();
  for (const ex of exports) {
    const absFile = toCommandModuleFile(ex.modulePath);
    exportedModuleFiles.add(absFile);
    if (!existsSync(absFile)) {
      issues.push({
        severity: 'critical',
        message: `Index export points to missing module: ${ex.modulePath}`,
        file: toRepoPath(indexAbs),
        suggestion: 'Fix the export path in index.ts or restore the missing file',
        code: ex.modulePath,
      });
    }
  }

  // 2) Slash command names should be unique across exported command files
  const slashToFile = new Map<string, string>();
  for (const absFile of exportedModuleFiles) {
    if (!existsSync(absFile)) continue;
    const content = await readFile(absFile, 'utf-8');
    const slash = extractSlashCommandName(content);
    if (!slash) continue;
    const existing = slashToFile.get(slash);
    if (existing) {
      issues.push({
        severity: 'error',
        message: `Duplicate slash command name: ${slash}`,
        file: toRepoPath(absFile),
        suggestion: `Ensure slash command names are unique. Also defined in: ${existing}`,
      });
    } else {
      slashToFile.set(slash, toRepoPath(absFile));
    }
  }

  // 3) Orphan command files: files with command headers but not exported by index.ts
  const commandsRoot = join(PROJECT_ROOT, '.cursor', 'commands');
  const allFiles = await getAllFilesRecursive(commandsRoot, ignoreContains);

  const commandFiles = allFiles.filter(p => p.endsWith('.ts'));
  for (const absFile of commandFiles) {
    const repoPath = toRepoPath(absFile);
    if (repoPath === '.cursor/commands/index.ts') continue;
    if (allowUnexported.has(repoPath)) continue;

    const content = await readFile(absFile, 'utf-8');
    if (!isCommandFile(content)) continue;

    // Command-like file but not exported anywhere
    if (!exportedModuleFiles.has(absFile)) {
      issues.push({
        severity: 'warning',
        message: 'Command file has an Atomic/Composite header but is not exported in index.ts',
        file: repoPath,
        suggestion: 'Either export it from `.cursor/commands/index.ts` or add it to `registry-audit-config.json` allowlist if intentional',
      });
    }
  }

  if (issues.length > 0) {
    recommendations.push('Keep `.cursor/commands/index.ts` as the single public surface and ensure all command files are exported or explicitly allowlisted.');
    recommendations.push('Avoid duplicate slash command names in file headers (Composite/Atomic Command: /name).');
  }

  const status = issues.some(i => i.severity === 'critical' || i.severity === 'error')
    ? 'error'
    : issues.some(i => i.severity === 'warning')
    ? 'warning'
    : 'pass';

  return {
    check: 'Registry',
    status,
    issues,
    recommendations,
    summary: `Verified ${exports.length} index exports; found ${issues.length} registry issues`,
  };
}


