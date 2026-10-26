/**
 * BOT-P7-CIVS — analyse avant (neutre, banc-bot-tc-observation.json) /
 * après (civs, banc-bot-p7-civs.json). Pur lecture d'artefacts, console.
 * Résoudre depuis le FICHIER (import.meta.url — piège ~/devtmp).
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const avant = JSON.parse(readFileSync(join(here, 'banc-bot-tc-observation.json'), 'utf8'));
const apres = JSON.parse(readFileSync(join(here, 'banc-bot-p7-civs.json'), 'utf8'));

const parCivAgg = (parties) => {
  // agrégat par civ SUR TOUTES difficultés : déclarations, subies, lignes.
  const acc = new Map();
  for (const p of parties) {
    for (const [pid, civ] of Object.entries(p.civs)) {
      if (pid !== 'p1' && pid !== 'p2') continue;
      const a = acc.get(civ) ?? { decl: 0, sub: 0, n: 0, batailles: 0, guerres: 0, steriles: 0 };
      a.n++;
      a.decl += p.guerres.filter((g) => g.declarant === pid).length;
      a.sub += p.guerres.filter((g) => g.cible === pid).length;
      const mes = p.guerres.filter((g) => g.declarant === pid);
      a.guerres += mes.length;
      a.batailles += mes.reduce((s, g) => s + g.batailles, 0);
      a.steriles += mes.filter((g) => g.batailles === 0).length;
      acc.set(civ, a);
    }
  }
  return acc;
};

const aggApres = parCivAgg(apres.parties);
const declNeutre = avant.parCiv.find((c) => c.civId === 'neutre');
const totApres = [...aggApres.values()].reduce((s, a) => s + a.decl, 0);
const totSub = [...aggApres.values()].reduce((s, a) => s + a.sub, 0);

console.log('=== Par civ — APRÈS (civs réelles, toutes difficultés, 120 lignes) ===');
console.log('| Civ | Agressivité | Lignes | Déclarations | Décl./partie | Subies | Subies/partie | Guerres du déclarant | Stériles % | Batailles tot |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const civs = [...aggApres.entries()].sort((a, b) => a[1].decl / a[1].n - b[1].decl / b[1].n);
for (const [civ, a] of civs) {
  const ag = apres.parCiv.find((c) => c.civId === civ)?.agressiviteDeclaree ?? '?';
  console.log(
    `| ${civ} | ${ag} | ${a.n} | ${a.decl} | ${(a.decl / a.n).toFixed(2)} | ${a.sub} | ${(a.sub / a.n).toFixed(2)} | ${a.guerres} | ${a.guerres ? ((a.steriles / a.guerres) * 100).toFixed(0) : '—'}% | ${a.batailles} |`,
  );
}
console.log(`\nDéclarations totales après : ${totApres} ; subies : ${totSub} ; neutre (avant) : ${declNeutre?.declarations} décl. / ${declNeutre?.partiesJouees} lignes = ${declNeutre ? (declNeutre.declarations / declNeutre.partiesJouees).toFixed(2) : '?'} par partie`);

// Corrélation rang agressivité vs décl./partie (Spearman simple).
const pts = civs.map(([civ, a]) => ({
  civ,
  ag: apres.parCiv.find((c) => c.civId === civ)?.agressiviteDeclaree ?? 0,
  d: a.decl / a.n,
}));
const rang = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return xs.map((x) => s.indexOf(x) + 1);
};
const ra = rang(pts.map((p) => p.ag));
const rd = rang(pts.map((p) => p.d));
const n = pts.length;
const d2 = ra.reduce((s, x, i) => s + (x - rd[i]) ** 2, 0);
const rho = 1 - (6 * d2) / (n * (n * n - 1));
console.log(`Spearman (agressivité déclarée vs décl./partie) : rho = ${rho.toFixed(3)} sur ${n} civs`);

// Par difficulté : avant / après.
console.log('\n=== Avant / après par difficulté ===');
console.log('| Difficulté | Guerres/partie (avant → après) | 1re guerre (avant → après) | Stériles | Durée | Captures | Élim. |');
console.log('|---|---|---|---|---|---|---|');
for (const [av, ap] of avant.parDiff.map((x, i) => [x, apres.parDiff[i]])) {
  console.log(
    `| ${ap.difficulte} | ${av.guerresParPartie.toFixed(2)} → ${ap.guerresParPartie.toFixed(2)} | ${av.tourPremiereGuerre?.toFixed(1)} → ${ap.tourPremiereGuerre?.toFixed(1)} | ${(av.tauxSteriles * 100).toFixed(0)}% → ${(ap.tauxSteriles * 100).toFixed(0)}% | ${av.dureeMoyenne.toFixed(1)} → ${ap.dureeMoyenne.toFixed(1)} | ${av.captures} → ${ap.captures} | ${av.eliminations} → ${ap.eliminations} |`,
  );
}

// Anecdotes : guerres marquantes par civ (plus gros écarts agressivité).
const paireCivs = new Map(); // seed -> paire
for (const p of apres.parties) paireCivs.set(`${p.difficulte}:${p.seed}`, p.civs);
const anecdotes = [];
for (const p of apres.parties) {
  for (const g of p.guerres) {
    const civD = p.civs[g.declarant];
    const civC = p.civs[g.cible];
    const agD = apres.parCiv.find((c) => c.civId === civD)?.agressiviteDeclaree ?? 0;
    const agC = apres.parCiv.find((c) => c.civId === civC)?.agressiviteDeclaree ?? 0;
    anecdotes.push({
      diff: p.difficulte, seed: p.seed, t: g.tourDeclaration, civD, civC, agD, agC,
      batailles: g.batailles, ratio: g.ratioDeclaration, duree: g.duree, issue: g.issue,
    });
  }
}
console.log('\n=== Guerres « civ fortes vs civ faibles » (écart agressivité ≥ 0,5) ===');
for (const a of anecdotes.filter((x) => x.agD - x.agC >= 0.5).slice(0, 30)) {
  console.log(`[${a.diff}] seed ${a.seed} t${a.t} : ${a.civD} (${a.agD}) déclare vs ${a.civC} (${a.agC}) — ${a.batailles} batailles, ratio ${a.ratio.toFixed(2)}, ${a.duree} tours, ${a.issue}`);
}
console.log('\n=== Top 10 guerres les plus meurtrières (batailles) ===');
for (const a of [...anecdotes].sort((x, y) => y.batailles - x.batailles).slice(0, 10)) {
  console.log(`[${a.diff}] seed ${a.seed} t${a.t} : ${a.civD} vs ${a.civC} — ${a.batailles} batailles, ${a.duree} tours, ${a.issue}`);
}
// Paires par seed pour le rapport (couverture).
const couv = {};
for (const p of paireCivs.values()) {
  for (const c of Object.values(p)) couv[c] = (couv[c] ?? 0) + 1;
}
console.log('\nOccurrences par civ (lignes sur 120) :', JSON.stringify(couv, null, 0));
