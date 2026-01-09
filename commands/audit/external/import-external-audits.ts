/**
 * External Audit Import (Independent)
 *
 * WHY:
 * Will prefers the workflow manager to be fully self-contained in `.cursor/`, but it’s still useful
 * to *capture* the latest Vue audit outputs as “external signals” when they exist.
 *
 * This module:
 * - does NOT execute `client/scripts/*`
 * - only reads/copies already-emitted artifacts (JSON/MD) into the workflow audit folder
 * - emits a timestamped import bundle under `.project-manager/.../audits/external/...`
 */

import { readFile, mkdir, copyFile, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { WorkflowCommandContext } from '../../utils/command-context';

type ExternalAuditSource = {
  sourceId: string;
  label: string;
  paths: string[];
};

type ExternalAuditConfig = {
  sources: ExternalAuditSource[];
};

export type ExternalAuditImportItem = {
  sourceId: string;
  label: string;
  copied: Array<{ from: string; to: string }>;
  missing: string[];
  errors: string[];
};

export type ExternalAuditImportResult = {
  timestamp: string;
  outputDir: string;
  items: ExternalAuditImportItem[];
};

const PROJECT_ROOT = process.cwd();

function loadDefaultConfig(): ExternalAuditConfig {
  return {
    sources: [
      {
        sourceId: 'client-typecheck',
        label: 'Vue Typecheck Audit',
        paths: [
          'client/.typecheck/typecheck-audit.json',
          'client/.typecheck/typecheck-audit.md',
          'client/.typecheck/typecheck-audit-summary.md',
        ],
      },
      {
        sourceId: 'client-composables-logic',
        label: 'Vue Composables Logic Audit',
        paths: [
          'client/.audit/composables-logic-audit.json',
          'client/.audit/composables-logic-audit.md',
          'client/.audit/composables-logic-audit-summary.md',
        ],
      },
      {
        sourceId: 'client-component-logic',
        label: 'Vue Component Logic Audit',
        paths: [
          'client/.audit/component-logic-audit.json',
          'client/.audit/component-logic-audit.md',
          'client/.audit/component-logic-audit-summary.md',
        ],
      },
    ],
  };
}

async function loadConfig(): Promise<ExternalAuditConfig> {
  const configPath = join(PROJECT_ROOT, '.cursor', 'commands', 'audit', 'external', 'external-audits-config.json');
  if (!existsSync(configPath)) return loadDefaultConfig();
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ExternalAuditConfig;
    return parsed?.sources?.length ? parsed : loadDefaultConfig();
  } catch (error) {
    console.warn(
      `WARNING: Failed to load external audits config; using defaults.\n` +
      `Path: ${configPath}\n` +
      `Error: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return loadDefaultConfig();
  }
}

function toSafeTimestamp(iso: string): string {
  // example: 2026-01-08T00:51:23.146Z -> 2026-01-08T00-51-23Z
  return iso.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

function toRelative(absPath: string): string {
  return absPath.replace(PROJECT_ROOT + '/', '');
}

/**
 * Import/copy configured external audit artifacts (if present) into the feature audits folder.
 */
export async function importExternalAudits(
  context: WorkflowCommandContext,
  meta: { tier: string; identifier: string }
): Promise<ExternalAuditImportResult> {
  const timestampIso = new Date().toISOString();
  const timestamp = toSafeTimestamp(timestampIso);
  const config = await loadConfig();

  const outputDirAbs = join(
    PROJECT_ROOT,
    '.cursor',
    'project-manager',
    'features',
    context.feature.name,
    'audits',
    'external',
    `${meta.tier}-${meta.identifier}`,
    timestamp
  );

  await mkdir(outputDirAbs, { recursive: true });

  const items: ExternalAuditImportItem[] = [];

  for (const source of config.sources) {
    const copied: Array<{ from: string; to: string }> = [];
    const missing: string[] = [];
    const errors: string[] = [];

    const sourceDirAbs = join(outputDirAbs, source.sourceId);
    await mkdir(sourceDirAbs, { recursive: true });

    for (const relPath of source.paths) {
      const fromAbs = join(PROJECT_ROOT, relPath);
      if (!existsSync(fromAbs)) {
        missing.push(relPath);
        continue;
      }
      const toAbs = join(sourceDirAbs, basename(relPath));
      try {
        await copyFile(fromAbs, toAbs);
        copied.push({ from: relPath, to: toRelative(toAbs) });
      } catch (error) {
        errors.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    items.push({
      sourceId: source.sourceId,
      label: source.label,
      copied,
      missing,
      errors,
    });
  }

  // Emit a tiny manifest for deterministic tracking (data-first).
  const manifest = {
    timestamp: timestampIso,
    feature: context.feature.name,
    tier: meta.tier,
    identifier: meta.identifier,
    items,
  };

  await writeFile(join(outputDirAbs, 'external-audits-import.json'), JSON.stringify(manifest, null, 2), 'utf-8');

  const mdLines: string[] = [];
  mdLines.push('# External Audit Import');
  mdLines.push('');
  mdLines.push(`**Feature:** ${context.feature.name}`);
  mdLines.push(`**Tier:** ${meta.tier}`);
  mdLines.push(`**Identifier:** ${meta.identifier}`);
  mdLines.push(`**Timestamp:** ${timestampIso}`);
  mdLines.push('');
  mdLines.push('---');
  mdLines.push('');

  for (const item of items) {
    mdLines.push(`## ${item.label}`);
    mdLines.push('');
    if (item.copied.length === 0) {
      mdLines.push('- **Copied:** none');
    } else {
      mdLines.push('- **Copied:**');
      for (const c of item.copied) {
        mdLines.push(`  - \`${c.from}\` → \`${c.to}\``);
      }
    }
    if (item.missing.length > 0) {
      mdLines.push('- **Missing:**');
      for (const m of item.missing) mdLines.push(`  - \`${m}\``);
    }
    if (item.errors.length > 0) {
      mdLines.push('- **Errors:**');
      for (const e of item.errors) mdLines.push(`  - ${e}`);
    }
    mdLines.push('');
  }

  await writeFile(join(outputDirAbs, 'external-audits-import.md'), mdLines.join('\n'), 'utf-8');

  return {
    timestamp: timestampIso,
    outputDir: toRelative(outputDirAbs),
    items,
  };
}


