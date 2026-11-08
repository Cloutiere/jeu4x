// DIAGNOSTIC OSCILLATION-MARCHE (gratuit) — détecte les ping-pongs dans les
// journaux JSONL du banc guerre-vivante : un Move d'une unité vers une case
// qu'elle vient de quitter dans les 4 derniers tours (aller-retour).
// Usage : node devtmp/diag-oscillation.mjs <journal.jsonl>
import { createReadStream } from 'node:fs';
import readline from 'node:readline';

const file = process.argv[2];
if (!file) { console.error('usage: node diag-oscillation.mjs <jsonl>'); process.exit(1); }

const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });
// par unité : historique [{tour, from, to}]
const histo = new Map(); // unitId -> {owner, tour, to}
const pingpongs = [];

for await (const line of rl) {
  let j; try { j = JSON.parse(line); } catch { continue; }
  if (j.type !== 'evenement') continue;
  const e = j.evenement;
  if (e?.type !== 'Move' || !e.unitId) continue;
  const tour = j.tour ?? null;
  const key = `${e.owner}:${e.unitId}`;
  const h = histo.get(key) ?? [];
  // cible = case d'où l'unité vient (e.from) ; chercher si l'unité y était récemment
  const idx = h.findIndex((x) => x.tour >= tour - 4 && x.to.q === e.from.q && x.to.r === e.from.r);
  if (idx >= 0 && h[h.length - 1].tour <= tour - 1) {
    pingpongs.push({
      unit: e.unitId, owner: e.owner, tour,
      retourVers: `${e.from.q},${e.from.r}`,
      depuis: `${e.to.q},${e.to.r}`,
      dernierTours: h.filter((x) => x.tour >= tour - 6).map((x) => `t${x.tour}:(${x.to.q},${x.to.r})`),
    });
  }
  h.push({ tour, to: e.to });
  while (h.length > 40) h.shift();
  histo.set(key, h);
}

console.log(`Ping-pongs détectés : ${pingpongs.length}`);
const byUnit = new Map();
for (const p of pingpongs) {
  const k = `${p.owner}:${p.unit}`;
  if (!byUnit.has(k)) byUnit.set(k, []);
  byUnit.get(k).push(p);
}
for (const [k, list] of byUnit) {
  console.log(`\n== ${k} — ${list.length} allers-retours, tours ${list[0].tour}-${list[list.length - 1].tour}`);
  for (const p of list.slice(0, 6)) {
    console.log(`  t${p.tour} retour vers ${p.retourVers} depuis ${p.depuis} | ${p.dernierTours.join(' → ')}`);
  }
}
