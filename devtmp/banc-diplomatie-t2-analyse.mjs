/**
 * DIPLOMATIE-T2 — comparateur banc (L5) : évolution des dynamiques de paix
 * AVANT (devtmp/banc-horloge-AVANT-diplomatie-t2.json = HORLOGE-DISTANCE 28/10)
 * / APRÈS (devtmp/banc-horloge-distance.json re-exécuté après T2), SANS cible
 * de conquête (le calibrage offensif vient après, sur ce nouveau système).
 *
 * Les bots ne négocient JAMAIS ENTRE EUX (R-189-d : le joueur est le seul
 * initiateur) → les acceptations compensées du banc sont structurellement 0 ;
 * le tableau le consigne (colonne « Paix compensées ») et le rapport le
 * documente. Usage : node devtmp/banc-diplomatie-t2-analyse.mjs
 */
import { readFileSync } from 'node:fs';

const avant = JSON.parse(readFileSync('devtmp/banc-horloge-AVANT-diplomatie-t2.json', 'utf8'));
const apres = JSON.parse(readFileSync('devtmp/banc-horloge-distance.json', 'utf8'));

const pour = (banc, difficulte) => banc.parDiff.find((m) => m.difficulte === difficulte);
const cles = [
  ['guerresParPartie', 'Guerres/partie', (v) => v.toFixed(2)],
  ['tourPremiereGuerre', '1re guerre (t)', (v) => (v == null ? '—' : v.toFixed(1))],
  ['dureeMoyenne', 'Durée moy. (t)', (v) => v.toFixed(1)],
  ['tauxSteriles', 'Stériles', (v) => `${(v * 100).toFixed(0)}%`],
  ['paixProposees', 'Paix prop.', (v) => String(v)],
  ['paixAcceptees', 'Paix acc.', (v) => String(v)],
  ['captures', 'Captures', (v) => String(v)],
  ['eliminations', 'Élim.', (v) => String(v)],
  ['toursMoyens', 'Tours moy.', (v) => v.toFixed(0)],
];

// Acceptations compensées APRÈS : comptées sur les événements consignés —
// les chronologies du banc ne portent que WarDeclared/PeaceAccepted/Refused
// (bots seulement) → structurellement 0 (R-189-d).
const compensations = (banc) => {
  let n = 0;
  for (const p of banc.parties) {
    for (const e of p.evenements ?? []) if (e.type === 'PeaceCompensated') n += 1;
  }
  return n;
};

console.log('=== BANC DIPLOMATIE-T2 — dynamiques de paix AVANT (HORLOGE-DISTANCE) / APRÈS (T2) ===');
console.log('| Difficulté | Métrique | AVANT | APRÈS |');
console.log('|---|---|---|---|');
for (const diff of ['facile', 'normal', 'difficile']) {
  const a = pour(avant, diff);
  const b = pour(apres, diff);
  for (const [cle, label, fmt] of cles) {
    console.log(`| ${diff} | ${label} | ${fmt(a?.[cle])} | ${fmt(b?.[cle])} |`);
  }
}
console.log(`\nPaix compensées (banc APRÈS) : ${compensations(apres)} — attendu 0 (les bots ne négocient pas entre eux, R-189-d).`);
const tot = (banc) => banc.parDiff.reduce((s, m) => s + m.paixAcceptees, 0);
console.log(`Paix acceptées totales : avant ${tot(avant)} → après ${tot(apres)}.`);
const guerres = (banc) => banc.parDiff.reduce((s, m) => s + m.guerresParPartie * m.parties ?? 0, 0);
const nbParties = (banc) => banc.parties.length;
console.log(`Parties : avant ${nbParties(avant)}, après ${nbParties(apres)}.`);
void guerres;
