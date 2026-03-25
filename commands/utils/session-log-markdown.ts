/**
 * Session / phase / feature log markdown normalization (dedupe markers and duplicate ## sections).
 * Shared by DocumentManager.appendLog and log rollup.
 */

const EXCERPT_SESSION_MARKER = '<!-- end excerpt session -->';

function dedupeFirstLevel2Section(content: string, sectionTitle: string): string {
  const lines = content.split('\n');
  const re = new RegExp(`^##\\s+${sectionTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const out: string[] = [];
  let seen = false;
  let skipping = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().match(/^##\s+/) && re.test(line.trim())) {
      if (seen) {
        skipping = true;
        continue;
      }
      seen = true;
      skipping = false;
      out.push(line);
      continue;
    }
    if (skipping) {
      if (line.trim().match(/^##\s+/)) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function dedupeExcerptSessionMarkers(content: string): string {
  const lines = content.split('\n');
  const out: string[] = [];
  let kept = false;
  for (const line of lines) {
    if (line.trim() === EXCERPT_SESSION_MARKER) {
      if (!kept) {
        out.push(line);
        kept = true;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

export function normalizeSessionLogMarkdown(content: string): string {
  let c = dedupeExcerptSessionMarkers(content);
  c = dedupeFirstLevel2Section(c, 'Test Status');
  c = dedupeFirstLevel2Section(c, 'Completed Tasks');
  return c;
}
