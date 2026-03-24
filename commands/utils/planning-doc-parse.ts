/**
 * Parse planning doc sections for harness advisory steps (deliverables drift, etc.).
 */

/** Extract ## Deliverables body; collect backtick paths and obvious repo-relative paths. */
export function parseDeliverablesFromPlanningDoc(content: string): string[] {
  const match = content.match(/\n##\s+Deliverables\s*[\r\n]+([\s\S]*?)(?=\n##\s+|$)/i);
  if (!match) return [];
  const body = match[1];
  const paths = new Set<string>();
  const tick = /`([^`\n]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = tick.exec(body)) !== null) {
    const p = m[1].trim();
    if (looksLikeRepoPath(p)) paths.add(normalizeRepoPath(p));
  }
  const plain = /\b((?:client|server|shared)\/[^\s`#|,;)]*)/g;
  while ((m = plain.exec(body)) !== null) {
    const p = m[1].trim().replace(/[.,;:]+$/, '');
    if (looksLikeRepoPath(p)) paths.add(normalizeRepoPath(p));
  }
  return [...paths];
}

function looksLikeRepoPath(s: string): boolean {
  return /^(client\/|server\/|shared\/|\.project-manager\/)/.test(s);
}

function normalizeRepoPath(s: string): string {
  return s.replace(/^\/+/, '').trim();
}
