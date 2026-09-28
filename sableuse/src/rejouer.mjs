#!/usr/bin/env node
/**
 * Rejouabilité depuis le journal (HANDOFF-JEV-POC L3) : rejouer la partie
 * depuis les lignes `motif` (ordres + actions par tour) reproduit la même fin
 * (déterminisme du moteur). Ne consomme AUCUN appel Jev.
 *   tsx src/rejouer.mjs journaux/partie-XXX.jsonl
 */
import { readFileSync } from 'node:fs';
import { applySetGovernment, applySetResearch, createInitialState, generateProceduralMap, resolveTurn } from '@game/rules';

export async function rejouerDepuisJournal(cheminJournal) {
  const lignes = readFileSync(cheminJournal, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const meta = lignes.find((l) => l.type === 'meta');
  const fin = [...lignes].reverse().find((l) => l.type === 'fin');
  const motifs = lignes.filter((l) => l.type === 'motif');

  const gen = generateProceduralMap(meta.seed);
  let etat = createInitialState(gen.map, meta.seed);
  for (const motif of motifs) {
    if (etat.winner !== null) break;
    for (const { id, action } of motif.actions) {
      if (action.type === 'SetResearch') {
        const r = applySetResearch(etat, id, action.techId);
        if (r.ok) etat = r.state;
      } else {
        const r = applySetGovernment(etat, id, action.government);
        if (r.ok) etat = r.state;
      }
    }
    const resultat = resolveTurn(etat, motif.ordres, motif.rngSeed);
    etat = resultat.newState;
  }
  const identique = etat.winner === fin.gagnant && etat.turn === fin.toursJoues;
  return { identique, gagnantRejoue: etat.winner, gagnantJournal: fin.gagnant, toursRejoues: etat.turn, toursJournal: fin.toursJoues };
}

if (process.argv[1] && process.argv[1].endsWith('rejouer.mjs')) {
  const chemin = process.argv[2];
  if (!chemin) {
    console.error('Usage : tsx src/rejouer.mjs <journal.jsonl>');
    process.exit(1);
  }
  const r = await rejouerDepuisJournal(chemin);
  console.log(JSON.stringify(r));
  process.exit(r.identique ? 0 : 1);
}
