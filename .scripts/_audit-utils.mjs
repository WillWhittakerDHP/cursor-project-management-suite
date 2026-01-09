import fs from 'node:fs'
import path from 'node:path'

export const PROJECT_ROOT = path.resolve(process.cwd())

export function ensureDir(absDirPath) {
  fs.mkdirSync(absDirPath, { recursive: true })
}

export function toRepoPath(absPath) {
  return path.relative(PROJECT_ROOT, absPath).replaceAll(path.sep, '/')
}

export function readTextFile(absPath) {
  return fs.readFileSync(absPath, 'utf8')
}

export function listFilesRecursive(absDirPath, shouldIncludeFile) {
  /** @type {string[]} */
  const out = []
  if (!fs.existsSync(absDirPath)) return out
  const entries = fs.readdirSync(absDirPath, { withFileTypes: true })
  for (const e of entries) {
    const abs = path.join(absDirPath, e.name)
    if (e.isDirectory()) {
      out.push(...listFilesRecursive(abs, shouldIncludeFile))
      continue
    }
    if (e.isFile() && (!shouldIncludeFile || shouldIncludeFile(abs))) out.push(abs)
  }
  return out
}

export function splitLines(contents) {
  return contents.replaceAll('\r\n', '\n').split('\n')
}

export function slugify(input, maxLen = 120) {
  return String(input)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, maxLen)
}

export function stablePoolKey(issue) {
  const msg = String(issue.message || '')
    .replaceAll(/'[^']*'/g, "''")
    .replaceAll(/\"[^\"]*\"/g, '""')
    .replaceAll(/\b\d+\b/g, '0')
    .replaceAll(/\/Users\/[^ ]+/g, '/Users/...')
    .replaceAll(/project-manager\/features\/[^/]+/g, 'project-manager/features/<feature>')
    .replaceAll(/\.cursor\/project-manager\/features\/[^/]+/g, '.cursor/project-manager/features/<feature>')
  return `${issue.kind}::${msg}`.slice(0, 500)
}


