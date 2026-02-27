/**
 * Phase-start reuse check: match phase guide content against inventory audit data
 * and return a formatted "Reuse opportunities" section (or empty string).
 */

interface InventoryEntry {
  name: string;
  repoPath: string;
  directoryDomain: string;
  annotatedDomain?: string | null;
  purpose?: string | null;
  reuseTier?: string;
  tags?: string[];
}

interface OverlapCandidate {
  tag: string;
  entries: string[];
  note?: string;
}

export interface InventoryPayload {
  composables?: InventoryEntry[];
  components?: InventoryEntry[];
  overlapCandidates?: OverlapCandidate[];
  summary?: { totalComposables?: number };
}

const DOMAIN_KEYWORDS = [
  'admin',
  'booking',
  'form',
  'crud',
  'entity',
  'validation',
  'table',
  'wizard',
  'appointment',
  'component',
  'modal',
  'drag',
  'settings',
] as const;

/** Extract composable names (useXxx) and .vue names from guide text. */
function extractMentions(guide: string): { composables: string[]; domains: string[] } {
  const composables = new Set<string>();
  const useRegex = /\b(use[A-Z][a-zA-Z0-9]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = useRegex.exec(guide)) !== null) composables.add(m[1]);

  const vueRegex = /\b([A-Z][a-zA-Z0-9]*)\.vue\b/g;
  while ((m = vueRegex.exec(guide)) !== null) composables.add(m[1]);

  const lower = guide.toLowerCase();
  const domains: string[] = [];
  for (const kw of DOMAIN_KEYWORDS) {
    if (lower.includes(kw)) domains.push(kw);
  }
  return { composables: Array.from(composables), domains };
}

/** Normalize domain for matching (e.g. "admin/tables" matches keyword "admin"). */
function domainMatchesKeyword(domain: string, keyword: string): boolean {
  const d = domain.toLowerCase();
  const k = keyword.toLowerCase();
  return d === k || d.startsWith(k + '/');
}

/**
 * Build the "Reuse opportunities" markdown section from inventory and phase guide.
 * Returns empty string if no inventory, no guide, or no relevant matches.
 */
export function buildReuseOpportunitiesSection(
  inventory: InventoryPayload,
  guide: string
): string {
  if (!guide?.trim()) return '';
  const composables = inventory.composables ?? [];
  const components = inventory.components ?? [];
  if (composables.length === 0 && components.length === 0) return '';

  const { composables: mentionedNames, domains: guideDomains } = extractMentions(guide);

  const byDomain = new Map<string, InventoryEntry[]>();
  for (const c of composables) {
    const domain = c.annotatedDomain ?? c.directoryDomain;
    if (!domain) continue;
    const list = byDomain.get(domain) ?? [];
    list.push(c);
    byDomain.set(domain, list);
  }

  const allNamed = [...composables, ...components];
  const directMatches = allNamed.filter((c) =>
    mentionedNames.some((n) => c.name === n || c.name === n.replace(/\.vue$/, ''))
  );
  const relevantDomains = Array.from(byDomain.keys()).filter((domain) =>
    guideDomains.some((kw) => domainMatchesKeyword(domain, kw))
  );
  const overlapCandidates = inventory.overlapCandidates ?? [];
  const relevantOverlaps = overlapCandidates.filter((o) =>
    guideDomains.some((kw) => o.tag.toLowerCase().includes(kw))
  );

  const lines: string[] = [];
  lines.push('## Reuse Opportunities (from Inventory Audit)');
  lines.push('');

  if (directMatches.length > 0) {
    lines.push('### Composables/components mentioned in phase guide');
    lines.push('');
    for (const c of directMatches.slice(0, 20)) {
      const tier = c.reuseTier && c.reuseTier !== 'unknown' ? ` [${c.reuseTier}]` : '';
      const purpose = c.purpose ? ` — ${c.purpose}` : '';
      lines.push(`- \`${c.name}\` (${c.directoryDomain})${tier}${purpose}`);
    }
    if (directMatches.length > 20) {
      lines.push(`- *...and ${directMatches.length - 20} more. See inventory-audit.md.*`);
    }
    lines.push('');
  }

  if (relevantDomains.length > 0) {
    lines.push('### Existing composables in relevant domains');
    lines.push('');
    for (const domain of relevantDomains.slice(0, 8)) {
      const list = byDomain.get(domain) ?? [];
      const display = list.slice(0, 10).map((c) => `\`${c.name}\``);
      const more = list.length > 10 ? ` (+${list.length - 10} more)` : '';
      lines.push(`**Domain: ${domain}** (${list.length} composables)`);
      lines.push(`- ${display.join(', ')}${more}`);
      lines.push('');
    }
  }

  if (relevantOverlaps.length > 0) {
    lines.push('### Tag overlap clusters to be aware of');
    lines.push('');
    for (const o of relevantOverlaps) {
      lines.push(`- **${o.tag}** (${o.entries.length} entries) — ${o.note ?? 'review for shared responsibilities'}`);
    }
    lines.push('');
  }

  if (lines.length <= 2) return '';

  lines.push('> Tip: Run `npm run audit:inventory` in client to refresh the inventory before starting work.');
  lines.push('');
  return lines.join('\n');
}
