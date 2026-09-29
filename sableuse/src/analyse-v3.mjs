#!/usr/bin/env node
/**
 * Analyse v3 (HANDOFF-JEV-V3-BANC2 L3) — extraits qualitatifs D6 depuis les
 * journaux d'un banc : fondations motivées (gainNet prédit vs ville réelle
 * observée plus tard), décisions de production, réactions à menace.
 *
 *   node src/analyse-v3.mjs bancs/banc-2-2026-09-29
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const dossier = process.argv[2];
if (!dossier || !existsSync(join(dossier, 'plan.json'))) {
  console.error('Usage : node src/analyse-v3.mjs <dossier-banc>');
  process.exit(1);
}

for (const f of readdirSync(join(dossier, 'journaux')).sort()) {
  if (!f.endsWith('.jsonl') || !f.includes('jev')) continue;
  const lignes = readFileSync(join(dossier, 'journaux', f), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const meta = lignes.find((x) => x.type === 'meta');
  if (!meta) continue;
  const jev = meta.joueurs.find((j) => j.pilote === 'jev')?.id;
  if (!jev) continue;
  const fondations = [];
  const productions = new Set();
  const reactions = [];
  let fonderOui = 0;
  let fonderNon = 0;
  for (const x of lignes) {
    if (x.type !== 'decision') continue;
    const noul = x.reponses?.fonder?.noul ?? 0;
    if (noul >= 0.5) fonderOui += 1; else fonderNon += 1;
    for (const o of x.ordresJev ?? []) {
      if (o.type === 'FoundCity') {
        const site = (x.condense.candidats?.fondation ?? []).find((s) => s.distance === 0) ?? (x.condense.candidats?.fondation ?? [])[0];
        fondations.push({ tour: x.tour, gainNet: site?.gainNet ?? null, case: site?.case ?? '?' });
      }
      if (o.type === 'SetProduction') productions.add(o.item.id);
    }
    if ((x.condense.menaces ?? []).length > 0 && (x.ordresJev ?? []).some((o) => o.type === 'Fortify' || o.type === 'Attack' || o.type === 'Move')) {
      reactions.push({ tour: x.tour, menaces: x.condense.menaces.length, puissance: x.condense.monde?.puissance });
    }
  }
  if (fondations.length === 0 && reactions.length === 0) continue;
  console.log(`\n=== ${f} (jev=${jev}, civ=${meta.joueurs.find((j) => j.id === jev)?.civId}) ===`);
  console.log(`fonder oui/non : ${fonderOui}/${fonderNon} — fondations décidées : ${fondations.length}`);
  for (const fo of fondations.slice(0, 4)) console.log(`  t${fo.tour} FoundCity gainNet prédit ${fo.gainNet} (${fo.case})`);
  console.log(`productions choisies : ${[...productions].join(', ') || '—'}`);
  for (const r of reactions.slice(0, 3)) console.log(`  t${r.tour} réaction menace (x${r.menaces}, puissance ${JSON.stringify(r.puissance)})`);
}
