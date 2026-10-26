/** PAIX-RYTHME — comparateur D5 avant/après des bancs d'observation.
 *  Avant : devtmp/banc-bot-p7-civs.json (baseline BOT-ARMEE, 26/10).
 *  Après : devtmp/banc-paix-rythme.json (armées de siège + cible pondérée +
 *          paix du gagnant/administrative).
 *  Cibles D5 : percée ≥ 40 %, captures ≥ 10 %, 0 écrasement <t30,
 *  tours moyens > 100, ρ agressivité ≥ 0,4.
 */
import { readFileSync } from 'node:fs';

const chemin = (f) => new URL(f, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const avant = JSON.parse(readFileSync(chemin('../devtmp/banc-bot-p7-civs.json'), 'utf8'));
const apres = JSON.parse(readFileSync(chemin('../devtmp/banc-paix-rythme.json'), 'utf8'));

function guerres(art) {
  return art.parties.flatMap((p) => p.guerres.map((g) => ({ ...g, parties: p })));
}
function rhoSpearman(paires) {
  const n = paires.length;
  if (n < 3) return NaN;
  const rang = (xs) => {
    const tri = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const r = new Array(n);
    for (let k = 0; k < n; k++) r[tri[k][1]] = k + 1;
    return r;
  };
  const ra = rang(paires.map((p) => p[0]));
  const rb = rang(paires.map((p) => p[1]));
  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
function agressiviteDeCiv(civId) {
  // miroir civilizations.json — lu à la volée pour éviter l'import ESM.
  return JSON.parse(readFileSync(chemin('../packages/rules/src/data/civilizations.json'), 'utf8')).civs[civId]?.agressivite ?? 0.5;
}
function resume(art, nom) {
  const parties = art.parties;
  const G = guerres(art);
  const finies = G.filter((g) => g.tourFin !== null);
  const percees = G.filter((g) => g.batailles > 0 && g.progressionCapitale !== null && g.progressionCapitale <= 3);
  const captures = parties.reduce((s, p) => s + p.captures.length, 0);
  const elim = parties.reduce((s, p) => s + p.eliminations.length, 0);
  const fins30 = parties.filter((p) => p.winner && p.tours < 30).length;
  const toursMoy = parties.reduce((s, p) => s + p.tours, 0) / parties.length;
  // ρ agressivité vs batailles par civ (toutes difficultés confondues)
  const parCiv = new Map();
  for (const g of G) {
    const pid = g.declarant;
    const civ = g.parties.civs[pid];
    if (!civ) continue;
    const a = parCiv.get(civ) ?? { ag: agressiviteDeCiv(civ), batailles: 0 };
    a.batailles += g.batailles;
    parCiv.set(civ, a);
  }
  const rho = rhoSpearman([...parCiv.values()].map((a) => [a.ag, a.batailles]));
  return {
    banc: nom,
    guerres: G.length,
    dureeMoyenne: finies.length ? (finies.reduce((s, g) => s + g.duree, 0) / finies.length).toFixed(1) : '—',
    sterilesPct: ((G.filter((g) => g.batailles === 0).length / (G.length || 1)) * 100).toFixed(0),
    perceesPct: ((percees.length / (G.length || 1)) * 100).toFixed(1),
    captures,
    capturesPct: ((captures / (G.length || 1)) * 100).toFixed(1),
    elim,
    fins30,
    toursMoy: toursMoy.toFixed(1),
    rhoBatailles: rho.toFixed(2),
  };
}
const A = resume(avant, 'AVANT (BOT-ARMEE 26/10)');
const B = resume(apres, 'APRÈS (PAIX-RYTHME 27/10)');
console.log('| Métrique D5 | Avant | Après | Cible |');
console.log('|---|---|---|---|');
console.log(`| Guerres (total 120 parties) | ${A.guerres} | ${B.guerres} | — |`);
console.log(`| Percée (batailles + progression ≤ 3) | ${A.perceesPct} % | ${B.perceesPct} % | ≥ 40 % |`);
console.log(`| Captures de villes | ${A.captures} (${A.capturesPct} %) | ${B.captures} (${B.capturesPct} %) | ≥ 10 % |`);
console.log(`| Écrasements finis < t30 | ${A.fins30} | ${B.fins30} | 0 |`);
console.log(`| Tours moyens | ${A.toursMoy} | ${B.toursMoy} | > 100 |`);
console.log(`| Guerres stériles | ${A.sterilesPct} % | ${B.sterilesPct} % | — |`);
console.log(`| Durée moyenne des guerres | ${A.dureeMoyenne} | ${B.dureeMoyenne} | — |`);
console.log(`| ρ agressivité ↔ batailles | ${A.rhoBatailles} | ${B.rhoBatailles} | ≥ 0,4 |`);
console.log(`| Éliminations | ${A.elim} | ${B.elim} | — |`);
