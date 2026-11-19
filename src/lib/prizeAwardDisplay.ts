/**
 * Display-only grouping of special awards for the Prizes panel.
 * Pure: no React, no Supabase. Never changes amounts or winners.
 *
 * Awards are grouped by their base award (multi-winner places 2º, 3º… go
 * under their base), and consecutive groups sharing the first label segment
 * ("Oyes" in "Oyes · Hoyo 5") are shown under one section heading.
 */

export interface DisplayAwardInput {
  id: string;
  label: string;
  amount: number;
  winner: string | null;
  groupId?: string | null;
  place?: number | null;
}

export interface DisplayAwardRow extends DisplayAwardInput {
  /** 1 for the base award, 2+ for extra places. */
  place: number;
}

export interface DisplayAwardGroup {
  key: string;
  /** Label without the section prefix ("Hoyo 5"); empty when the label is only the section. */
  title: string;
  rows: DisplayAwardRow[];
}

export interface DisplayAwardSection {
  key: string;
  /** Section heading ("Oyes"); empty when awards have no shared prefix. */
  heading: string;
  groups: DisplayAwardGroup[];
}

const SEP = ' · ';
const EXTRA_ID = /^(.*)-p(\d+)$/;
const PLACE_SUFFIX = /\s·\s\d+º$/;

/** Base id and place, from explicit fields or the `${baseId}-p${n}` id (frozen snapshots lack groupId). */
function baseAndPlace(a: DisplayAwardInput, ids: Set<string>): { base: string; place: number } {
  if (a.groupId) return { base: a.groupId, place: Math.max(2, Number(a.place) || 2) };
  const m = EXTRA_ID.exec(a.id);
  if (m && ids.has(m[1])) return { base: m[1], place: Math.max(2, Number(m[2]) || 2) };
  return { base: a.id, place: 1 };
}

function splitLabel(label: string): { heading: string; title: string } {
  const clean = (label || '').replace(PLACE_SUFFIX, '').trim();
  const idx = clean.indexOf(SEP);
  if (idx <= 0) return { heading: clean, title: '' };
  return { heading: clean.slice(0, idx).trim(), title: clean.slice(idx + SEP.length).trim() };
}

export function buildAwardDisplaySections(list: DisplayAwardInput[]): DisplayAwardSection[] {
  const awards = list || [];
  const ids = new Set(awards.map(a => a.id));
  const groups: (DisplayAwardGroup & { heading: string })[] = [];
  const byBase = new Map<string, DisplayAwardGroup & { heading: string }>();

  for (const a of awards) {
    const { base, place } = baseAndPlace(a, ids);
    let g = byBase.get(base);
    if (!g) {
      const baseAward = awards.find(x => x.id === base) ?? a;
      const { heading, title } = splitLabel(baseAward.label);
      g = { key: base, heading, title, rows: [] };
      byBase.set(base, g);
      groups.push(g);
    }
    g.rows.push({ ...a, place });
  }
  for (const g of groups) g.rows.sort((x, y) => x.place - y.place);

  const sections: DisplayAwardSection[] = [];
  for (const g of groups) {
    const last = sections[sections.length - 1];
    const { heading, ...group } = g;
    // A label with no " · " is its own titled group, not a shared section.
    if (!group.title) {
      sections.push({ key: `s-${group.key}`, heading, groups: [group] });
      continue;
    }
    if (last && last.heading === heading && last.groups[0]?.title) last.groups.push(group);
    else sections.push({ key: `s-${group.key}`, heading, groups: [group] });
  }
  return sections;
}
