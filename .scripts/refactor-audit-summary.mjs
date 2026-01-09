import fs from 'node:fs'
import path from 'node:path'
import { PROJECT_ROOT, toRepoPath } from './_audit-utils.mjs'

/**
 * Workflow Refactor Audit Summary
 *
 * Reads `.cursor/.audit/workflow-refactor-audit.json` and prints the top pools + hotspots.
 *
 * Usage:
 * - node .cursor/scripts/refactor-audit.mjs
 * - node .cursor/scripts/refactor-audit-summary.mjs
 */

const JSON_PATH = path.join(PROJECT_ROOT, '.cursor', '.audit', 'workflow-refactor-audit.json')

function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Missing: ${toRepoPath(JSON_PATH)} (run refactor-audit first)`)
    process.exit(1)
  }

  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'))
  const pools = Array.isArray(data.pools) ? data.pools : []
  const perFile = Array.isArray(data.perFile) ? data.perFile : []

  console.log('Workflow Refactor Audit Summary')
  console.log(`Generated: ${data.generatedAt}`)
  console.log(`Issues: ${data.issues?.length ?? 0}, Pools: ${pools.length}`)
  console.log('')

  console.log('Top pools:')
  for (const p of pools.slice(0, 10)) {
    console.log(`- ${p.priority} ${p.totalScore} ${p.issueCount} issues ${p.fileCount} files :: ${p.poolId}`)
  }
  console.log('')

  console.log('Top files:')
  for (const f of perFile.slice(0, 15)) {
    console.log(`- ${f.issueCount} :: ${f.repoPath}`)
  }
}

main()


