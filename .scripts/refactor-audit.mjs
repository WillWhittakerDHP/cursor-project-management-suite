import path from 'node:path'
import fs from 'node:fs'

import {
  PROJECT_ROOT,
  ensureDir,
  toRepoPath,
  readTextFile,
  listFilesRecursive,
  splitLines,
  slugify,
  stablePoolKey,
} from './_audit-utils.mjs'

/**
 * Workflow Refactor Audit (Generated Outputs)
 *
 * Purpose:
 * - Deterministic, data-first inventory of refactor blockers inside `.cursor/commands/`
 * - Emits JSON + Markdown reports (like `client/scripts/*audit*.mjs`)
 *
 * What it detects (high leverage):
 * - Plan/execute mixing: Ask-mode claims but includes side-effects (git/file writes/runCommand)
 * - Path duality and hard-coded workflow doc paths (project-manager vs .cursor/project-manager)
 * - Registry drift risks: large export surface + untracked command files (inventory only)
 *
 * Output:
 * - .cursor/.audit/workflow-refactor-audit.json
 * - .cursor/.audit/workflow-refactor-audit.md
 */

const CURSOR_COMMANDS_DIR = path.join(PROJECT_ROOT, '.cursor', 'commands')
const OUT_DIR = path.join(PROJECT_ROOT, '.cursor', '.audit')
const OUT_JSON = path.join(OUT_DIR, 'workflow-refactor-audit.json')
const OUT_MD = path.join(OUT_DIR, 'workflow-refactor-audit.md')
const CONFIG_PATH = path.join(OUT_DIR, 'workflow-refactor-audit-config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

function isTsFile(absPath) {
  return absPath.endsWith('.ts') || absPath.endsWith('.mts') || absPath.endsWith('.cts')
}

function isIgnoredPath(repoPath, config) {
  const ignored = config?.scope?.ignoreContains || []
  return ignored.some((frag) => repoPath.includes(frag))
}

function scoreIssue(issue, config) {
  const weights = config?.weights || {}
  const baseByKind = weights.baseByKind || {}
  const base = Number(baseByKind[issue.kind] ?? 10)

  const fileWeight = Number(weights.fileWeight ?? 1)
  const lineWeight = Number(weights.lineWeight ?? 0)
  const textWeight = Number(weights.textWeight ?? 0)

  return (
    base +
    fileWeight * (issue.repoPath ? 1 : 0) +
    lineWeight * (issue.line ? 1 : 0) +
    textWeight * (issue.evidence ? 1 : 0)
  )
}

function assignPriority(totalScore, config) {
  const p0Min = Number(config?.priorities?.p0MinScore ?? 18)
  const p1Min = Number(config?.priorities?.p1MinScore ?? 10)
  if (totalScore >= p0Min) return 'P0'
  if (totalScore >= p1Min) return 'P1'
  return 'P2'
}

/**
 * Plan/execute mismatch heuristic
 */
function scanPlanExecuteIssues(repoPath, contents) {
  const lines = splitLines(contents)
  const issues = []

  const docClaimsAskModeOnly = /Ask Mode Only|outputs a plan, not an implementation|planning and should be used in Ask Mode/i
  const sideEffectMarkers = [
    /\brunCommand\s*\(/,
    /\bcreateBranch\s*\(/,
    /\bgit\s+checkout\b/i,
    /\bgit\s+pull\b/i,
    /\bwrite(Project)?File\s*\(/,
    /\bwriteFile\s*\(/,
    /\bmkdir\b/,
    /\bspawnSync\b/,
    /\bexecSync\b/,
  ]

  const hasClaim = docClaimsAskModeOnly.test(contents)
  if (!hasClaim) return issues

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]
    const hit = sideEffectMarkers.find((re) => re.test(l))
    if (!hit) continue
    issues.push({
      kind: 'plan_execute_mismatch',
      repoPath,
      line: i + 1,
      message: 'Ask-mode/plan-only claim but side-effect call detected',
      evidence: l.trim(),
    })
  }

  return issues
}

/**
 * Path hardcoding + dual-root heuristic
 */
function scanPathIssues(repoPath, contents, config) {
  const issues = []
  const lines = splitLines(contents)

  const allowed = config?.paths?.allowHardcodedIn || []
  const isAllowedFile = allowed.some((p) => repoPath.endsWith(p) || repoPath.includes(p))
  if (isAllowedFile) return issues

  // NOTE: `.cursor/project-manager/features/` contains the substring `project-manager/features/`,
  // so we must detect the "repo root" path with a negative lookbehind.
  const reRepoRoot = /(?<!\.cursor\/)project-manager\/features\//g
  const hasRepoRoot = reRepoRoot.test(contents)
  const hasCursorRoot = contents.includes('.cursor/project-manager/features/')
  if (hasRepoRoot && hasCursorRoot) {
    issues.push({
      kind: 'path_duality',
      repoPath,
      message: 'File references both workflow-doc roots (project-manager/ and .cursor/project-manager/)',
      evidence: 'Contains both `project-manager/features/` and `.cursor/project-manager/features/`',
    })
  }

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i]
    if (reRepoRoot.test(l)) {
      issues.push({
        kind: 'hardcoded_workflow_path',
        repoPath,
        line: i + 1,
        message: 'Hard-coded workflow path detected (repo root)',
        evidence: l.trim(),
      })
    }
    if (l.includes('.cursor/project-manager/features/')) {
      issues.push({
        kind: 'hardcoded_workflow_path',
        repoPath,
        line: i + 1,
        message: 'Hard-coded workflow path detected (.cursor root)',
        evidence: l.trim(),
      })
    }
  }

  return issues
}

function scanExportSurface(repoPath, contents) {
  if (!repoPath.endsWith('.cursor/commands/index.ts')) return null
  const lines = splitLines(contents)
  const exportLines = lines.filter((l) => l.trim().startsWith('export '))

  return {
    kind: 'command_export_surface',
    repoPath,
    message: 'Command export surface inventory (manual exports are drift-prone at scale)',
    evidence: `exportLines=${exportLines.length}`,
    exportLines: exportLines.slice(0, 200),
  }
}

function buildPools(issues, config) {
  const poolMap = new Map()
  for (const issue of issues) {
    const key = stablePoolKey(issue)
    const list = poolMap.get(key) || []
    list.push(issue)
    poolMap.set(key, list)
  }

  const pools = Array.from(poolMap.entries()).map(([key, poolIssues]) => {
    const files = new Set(poolIssues.map((i) => i.repoPath))
    const totalScore = poolIssues.reduce((sum, i) => sum + scoreIssue(i, config), 0) + files.size * Number(config?.weights?.blastRadiusPerFile ?? 2)
    const poolId = `${poolIssues[0].kind}-${slugify(key)}`
    return {
      poolId,
      groupKey: key,
      issueCount: poolIssues.length,
      fileCount: files.size,
      totalScore,
      priority: assignPriority(totalScore, config),
      sample: poolIssues.slice(0, 5),
    }
  })

  pools.sort((a, b) => b.totalScore - a.totalScore || a.poolId.localeCompare(b.poolId))
  return pools
}

function renderMarkdown(data) {
  const lines = []
  lines.push('# Workflow Refactor Audit (Generated)')
  lines.push('')
  lines.push('This file is generated by `.cursor/scripts/refactor-audit.mjs`.')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Generated at: **${data.generatedAt}**`)
  lines.push(`- Scope: \`${data.scope.root}\``)
  lines.push(`- Files scanned: **${data.filesScanned}**`)
  lines.push(`- Issues: **${data.issues.length}**`)
  lines.push(`- Pools: **${data.pools.length}**`)
  lines.push('')

  lines.push('## Top pools (by score)')
  lines.push('')
  lines.push('| Priority | Pool | score | issues | files |')
  lines.push('| --- | --- | ---: | ---: | ---: |')
  for (const p of data.pools.slice(0, 25)) {
    lines.push(`| ${p.priority} | \`${p.poolId}\` | ${p.totalScore} | ${p.issueCount} | ${p.fileCount} |`)
  }
  lines.push('')

  lines.push('## Per-file issue counts')
  lines.push('')
  lines.push('| File | issues |')
  lines.push('| --- | ---: |')
  for (const f of data.perFile.slice(0, 60)) {
    lines.push(`| \`${f.repoPath}\` | ${f.issueCount} |`)
  }
  if (data.perFile.length > 60) {
    lines.push('')
    lines.push(`(omitted ${data.perFile.length - 60} more files)`)
    lines.push('')
  } else {
    lines.push('')
  }

  if (data.exportSurface) {
    lines.push('## Export surface')
    lines.push('')
    lines.push(`- \`${data.exportSurface.repoPath}\`: ${data.exportSurface.evidence}`)
    lines.push('')
  }

  lines.push('## Issues (detailed)')
  lines.push('')
  lines.push('Legend:')
  lines.push('- **plan_execute_mismatch**: claims plan-only/Ask-mode but contains side effects')
  lines.push('- **path_duality**: same file references both workflow-doc roots')
  lines.push('- **hardcoded_workflow_path**: raw workflow-doc paths used outside the resolver')
  lines.push('')

  const byKind = new Map()
  for (const i of data.issues) {
    const list = byKind.get(i.kind) || []
    list.push(i)
    byKind.set(i.kind, list)
  }

  const kinds = Array.from(byKind.keys()).sort()
  for (const kind of kinds) {
    lines.push(`### ${kind}`)
    lines.push('')
    const list = byKind.get(kind) || []
    for (const i of list.slice(0, 120)) {
      const loc = i.line ? `:${i.line}` : ''
      lines.push(`- \`${i.repoPath}${loc}\` — ${i.message}`)
      if (i.evidence) lines.push(`  - evidence: \`${i.evidence.slice(0, 220)}\``)
    }
    if (list.length > 120) {
      lines.push(`- (omitted ${list.length - 120} more)`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function main() {
  ensureDir(OUT_DIR)
  const config = loadConfig()

  const absFiles = listFilesRecursive(CURSOR_COMMANDS_DIR, isTsFile)
  const issues = []
  let exportSurface = null

  for (const abs of absFiles) {
    const repoPath = toRepoPath(abs)
    if (isIgnoredPath(repoPath, config)) continue

    const contents = readTextFile(abs)

    issues.push(...scanPlanExecuteIssues(repoPath, contents))
    issues.push(...scanPathIssues(repoPath, contents, config))

    const exportInfo = scanExportSurface(repoPath, contents)
    if (exportInfo) exportSurface = exportInfo
  }

  const pools = buildPools(issues, config)

  // Per-file view
  const fileMap = new Map()
  for (const i of issues) {
    fileMap.set(i.repoPath, (fileMap.get(i.repoPath) || 0) + 1)
  }
  const perFile = Array.from(fileMap.entries())
    .map(([repoPath, issueCount]) => ({ repoPath, issueCount }))
    .sort((a, b) => b.issueCount - a.issueCount || a.repoPath.localeCompare(b.repoPath))

  const out = {
    generatedAt: new Date().toISOString(),
    scope: { root: '.cursor/commands', include: ['**/*.ts'], exclude: config?.scope?.ignoreContains || [] },
    filesScanned: absFiles.length,
    issues,
    pools,
    perFile,
    exportSurface,
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2))
  fs.writeFileSync(OUT_MD, renderMarkdown(out))

  // Deterministic: do not fail CI; this is a reporting tool.
  console.log(`Wrote:\n- ${toRepoPath(OUT_JSON)}\n- ${toRepoPath(OUT_MD)}\nIssues: ${issues.length}, Pools: ${pools.length}`)
  process.exitCode = 0
}

main()


