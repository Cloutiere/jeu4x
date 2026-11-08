// DIAGNOSTIC OSCILLATION 2 — par unité : nb de Moves, déplacement net
// (Manhattan hex), boîte englobante des positions. Repère le piétinement
// (beaucoup de moves, faible progression nette) pendant les guerres.
// Usage : node devtmp/diag-pietinement.mjs <journal.jsonl>
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const rl = readline.createInterface({ input: createReadStream(file), crlfDelay: Infinity });

const histo = new Map(); // key -> {owner, moves: [{tour, from, to}], minX...}
let finTour = 0;
let guerreDebut = null;

for await (const line of rl) {
  let j; try { j = JSON.parse(line); } catch { continue; }
  if (j.type === 'evenement') {
    const e = j.evenement;
    if (e?.type === 'Move' && e.unitId) {
      const key = `${e.owner}:${e.unitId}`;
      const h = histo.get(key) ?? { owner: e.owner, moves: [] };
      h.moves.push({ tour: j.tour, from: e.from, to: e.to });
      histo.set(key, h);
    }
  }
}

function hexDist(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

const rows = [];
for (const [key, h] of histo) {
  const m = h.moves;
  if (m.length === 0) continue;
  const first = m[0].from, last = m[m.length - 1].to;
  let net = 0;
  for (const x of m) net += hexDist(x.from, x.to); // distance totale parcourue
  const prog = hexDist(first, last);
  const xs = m.flatMap((x) => [x.from.q, x.to.q]);
  const rs = m.flatMap((x) => [x.from.r, x.to.r]);
  rows.push({
    key, n: m.length, parcouru: net, net: prog,
    box: `${Math.min(...xs)}-${Math.max(...xs)}×${Math.min(...rs)}-${Math.max(...rs)}`,
    premiersTours: `${m[0].tour}-${m[m.length - 1].tour}`,
    ratio: (net / Math.max(1, prog)).toFixed(1),
  });
}
rows.sort((a, b) => b.n - a.n);
console.log('unité | moves | parcouru | net | box | tours | ratio parcouru/net');
for (const r of rows.slice(0, 25)) console.log(`${r.key} | ${r.n} | ${r.parcouru} | ${r.net} | ${r.box} | ${r.premiersTours} | ${r.ratio}`);
const pietineurs = rows.filter((r) => r.n >= 10 && r.net <= 4);
console.log(`\nPietineurs (≥10 moves, ≤4 net) : ${pietineurs.length}`);
for (const r of pietineurs.slice(0, 10)) console.log(`  ${r.key} : ${r.n} moves, net ${r.net}, box ${r.box}, tours ${r.premiersTours}`);
