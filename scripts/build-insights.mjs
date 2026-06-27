#!/usr/bin/env node
// Aggregates the per-model insight files (data/insights/<slug>.json) into the single
// data/insights/all.json that the studioam.art website reads (lib/vehicleInsights.ts).
// The per-model files are the source of truth; all.json is a generated artifact — run this
// whenever the per-model insights change so the site and the data never drift.
//   node scripts/build-insights.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/insights');
const byKey = new Map(); // dedup: one row per model (slug, falling back to make+model+year)
let skipped = 0,
  deduped = 0;
for (const f of fs.readdirSync(dir)) {
  if (f === 'all.json' || !f.endsWith('.json')) continue;
  let m;
  try {
    m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch {
    skipped++;
    continue;
  }
  // only valid ModelInsight rows (must be sortable/renderable by the site)
  if (!(m && typeof m.make === 'string' && typeof m.model === 'string' && typeof m.year === 'number')) {
    skipped++;
    continue;
  }
  const key = m.slug || `${m.make}-${m.model}-${m.year}`.toLowerCase();
  const prev = byKey.get(key);
  if (prev) {
    deduped++;
    // keep the richer record (more complaints/issues)
    if ((m.total || 0) <= (prev.total || 0)) continue;
  }
  byKey.set(key, m);
}
const out = [...byKey.values()].sort(
  (a, b) => a.make.localeCompare(b.make) || b.year - a.year || a.model.localeCompare(b.model)
);
fs.writeFileSync(path.join(dir, 'all.json'), JSON.stringify(out));
console.log(`wrote data/insights/all.json (${out.length} models, skipped ${skipped}, deduped ${deduped})`);
