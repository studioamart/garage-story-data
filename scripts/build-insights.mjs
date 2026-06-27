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
const out = [];
for (const f of fs.readdirSync(dir)) {
  if (f === 'all.json' || !f.endsWith('.json')) continue;
  out.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
out.sort((a, b) => a.make.localeCompare(b.make) || b.year - a.year || a.model.localeCompare(b.model));
fs.writeFileSync(path.join(dir, 'all.json'), JSON.stringify(out));
console.log(`wrote data/insights/all.json (${out.length} models)`);
