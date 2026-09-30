#!/usr/bin/env node
/**
 * Générateur de plans CIBLÉS (HANDOFF-JEV-BANC-SUIVI D2/D3) — jamais écraser
 * les bancs précédents, plans dans des fichiers séparés.
 *
 *   node --import tsx src/plans-suivi.mjs
 *
 * D2 « grèce » : la grèce est TOUJOURS présente (siège tourné), les 4 autres
 * civs tirées sans remise ; 16 Jev (sièges 1-5 tournés) + 6 contrôle.
 * D3 « siège vs civ » : arabie et inde chacune à 3 sièges différents sous Jev
 * (mêmes seeds + mêmes civs en contrôle) — si le score suit le siège plutôt
 * que la civ, l'effet-siège est démontré.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIVS = ['amerique', 'arabie', 'azteques', 'chine', 'egypte', 'angleterre', 'france', 'allemagne', 'grece', 'inde', 'japon', 'mongolie', 'rome', 'russie', 'espagne', 'zoulous'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 24), 1 | t)) >>> 0;
    return t / 4294967296;
  };
}
function melange(rng, tab) {
  const d = [...tab];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function civsPour(civForcee, siege, rng) {
  const autres = melange(rng, CIVS.filter((c) => c !== civForcee)).slice(0, 4);
  const cle = {};
  let k = 0;
  for (let s = 1; s <= 5; s++) cle[`p${s}`] = s === siege ? civForcee : autres[k++];
  return cle;
}
function ecrire(dossier, parties, planSeed) {
  if (existsSync(join(racine, dossier, 'plan.json'))) { console.error(`Refus : ${dossier}/plan.json existe déjà.`); process.exit(1); }
  mkdirSync(join(racine, dossier), { recursive: true });
  const plan = { planSeed, date: new Date().toISOString(), nJev: parties.filter((p) => !p.controle).length, nControle: parties.filter((p) => p.controle).length, playerCount: 5, plafondTours: 150, parties };
  writeFileSync(join(racine, dossier, 'plan.json'), JSON.stringify(plan, null, 2));
  writeFileSync(join(racine, dossier, 'etat.json'), JSON.stringify({ parties: {} }, null, 2));
  console.log(`Plan écrit : ${dossier} (${plan.nJev} Jev + ${plan.nControle} contrôle)`);
}

// — D2 grèce : 16 Jev (sièges 1..5 tournés, grece toujours là) + 6 contrôle.
{
  const rng = mulberry32(20260929);
  const parties = [];
  let seedBase = 3_000_000 + Math.floor(rng() * 5_000_000);
  for (let i = 0; i < 16; i++) {
    parties.push({ idx: i + 1, seed: seedBase + i * 7919, controle: false, siegeJev: 1 + (i % 5), civs: civsPour('grece', 1 + (i % 5), rng) });
  }
  for (let i = 0; i < 6; i++) {
    const siege = 1 + (i % 5);
    parties.push({ idx: 17 + i, seed: seedBase + 100_000 + i * 7919, controle: true, siegeJev: null, civs: civsPour('grece', siege, rng) });
  }
  ecrire('bancs/banc-suivi-grece', parties, 20260929);
}

// — D3 siège vs civ : arabie et inde à 3 sièges (1, 2, 4) sous Jev, MÊMES
//   seeds + civs en contrôle (le bras bot diffère uniquement par le pilote).
{
  const rng = mulberry32(20260930);
  const parties = [];
  let seedBase = 4_000_000 + Math.floor(rng() * 5_000_000);
  let idx = 1;
  for (const civ of ['arabie', 'inde']) {
    for (const siege of [1, 2, 4]) {
      const civs = civsPour(civ, siege, rng);
      parties.push({ idx, seed: seedBase + idx * 7919, controle: false, siegeJev: siege, civs });
      parties.push({ idx: idx + 1, seed: seedBase + idx * 7919, controle: true, siegeJev: null, civs: { ...civs } });
      idx += 2;
    }
  }
  ecrire('bancs/banc-suivi-siege', parties, 20260930);
}
