/**
 * DIAG-OSCILLATION-RESIDUELLE — sonde de re-simulation locale (zéro code moteur).
 * Rejoue la décision bot du tour 14 (dump prod NP8JEE) pour u4 (24,5).
 */
import { readFileSync } from 'node:fs';
import { assignerObjectifs, pasVers, pasVersRoutier, profileDuBot } from '../src/botPolicy.js';
import { UNIT_TYPES, TERRAINS } from '@game/rules';
import type { GameState, Unit } from '@game/rules';

const dump = JSON.parse(readFileSync('devtmp/etat-NP8JEE/dump.json', 'utf8')) as { state: GameState };
const state = dump.state;
const profile = profileDuBot('normal');

const u4 = state.units['u4'] as Unit;
console.log('u4:', u4.q, u4.r, 'mp', u4.mp, 'hp', u4.hp, 'fortified', u4.fortified, 'stabilized', u4.stabilized);

const objectifs = assignerObjectifs(state, 'p2', profile);
console.log('objectifs p2:', JSON.stringify([...objectifs.entries()]));

const obj = objectifs.get('u4');
console.log('objectif u4:', JSON.stringify(obj));

if (obj && 'cible' in obj && obj.cible) {
  const cible = (obj as { cible: { q: number; r: number } }).cible;
  const routier = pasVersRoutier(u4, state, cible);
  const glouton = pasVers(u4, state, cible);
  console.log('pasVersRoutier(u4 -> cible):', routier);
  console.log('pasVers(u4 -> cible):', glouton);

  // Atteignabilité BFS brute (praticable + libre, cible incluse) depuis u4
  const stats = UNIT_TYPES[u4.type];
  const W = state.mapWidth;
  const origin = `${u4.q},${u4.r}`;
  const dest = `${cible.q},${cible.r}`;
  const praticable = (h: { q: number; r: number }): boolean => {
    const tile = state.map[`${h.q},${h.r}`];
    if (!tile) return false;
    return !!TERRAINS[tile.terrain]?.passable;
  };
  const cameFrom = new Map<string, string | null>([[origin, null]]);
  const queue = [{ q: u4.q, r: u4.r }];
  let atteint = false;
  while (queue.length) {
    const cur = queue.shift()!;
    const voisins = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
      .map(([dq, dr]) => ({ q: (cur.q + dq + W) % W, r: cur.r + dr }))
      .sort((a, b) => a.q - b.q || a.r - b.r);
    for (const n of voisins) {
      const k = `${n.q},${n.r}`;
      if (cameFrom.has(k)) continue;
      if (!praticable(n)) continue;
      if (Object.values(state.units).some((u) => u.q === n.q && u.r === n.r && k !== dest)) continue;
      cameFrom.set(k, `${cur.q},${cur.r}`);
      if (k === dest) { atteint = true; queue.length = 0; break; }
      queue.push(n);
    }
  }
  const prof = cameFrom.get(dest);
  const chemin: string[] = [];
  if (prof !== undefined) {
    let cur = dest;
    while (cur !== origin) { chemin.unshift(cur); cur = cameFrom.get(cur)!; }
  }
  console.log('BFS atteignable:', atteint, '| longueur chemin:', chemin.length);
  console.log('chemin:', chemin.slice(0, 12).join(' → '), chemin.length > 12 ? '…' : '');

  // Terrain de la cible + vision
  const t = state.map[dest];
  const explored = state.players['p2'].vision.explored ?? [];
  console.log('cible:', dest, 'terrain:', t?.terrain, 'passable:', praticable(cible), 'explorée:', explored.includes(dest));
}

// Voisinage de u4 : praticabilité + occupation + distance utile pour le glouton
console.log('\nvoisinage u4 (24,5):');
const W = state.mapWidth;
for (const [dq, dr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
  const q = (u4.q + dq + W) % W, r = u4.r + dr;
  const tile = state.map[`${q},${r}`];
  const occ = Object.values(state.units).find((u) => u.q === q && u.r === r);
  console.log(`  (${q},${r}) terrain=${tile?.terrain} passable=${tile ? TERRAINS[tile.terrain]?.passable : '-'} occupé=${occ ? occ.id + '/' + occ.owner : '-'}`);
}

// --- ANALYSE fine du waypoint de patrouille (cause fine) ---
const capitale = { q: 27, r: 10 };
const DIRS6: Array<[number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const RAYON = profile.rayonPatrouille;
const coins = DIRS6.map(([dq, dr]) => ({ q: capitale.q + dq * RAYON, r: capitale.r + dr * RAYON }));
console.log('\nrayonPatrouille =', RAYON);
for (const c of coins) {
  const t = state.map[`${c.q},${c.r}`];
  const d = pasVers(u4, state, c);
  const b = pasVersRoutier(u4, state, c);
  console.log(`  coin (${c.q},${c.r}) terrain=${t?.terrain ?? 'HORS-CARTE'} passable=${t ? TERRAINS[t.terrain]?.passable : '-'} glouton=${d ? `(${d.q},${d.r})` : 'null'} routier=${b ? `(${b.q},${b.r})` : 'null'}`);
}
console.log('scout p2 = unité id la plus petite : u4 (seule unité p2, nbUnites=1 → quota 0 → patrouille D1)');
