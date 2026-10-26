/**
 * BOT-P7-CIVS (décisions Erik 26/10) — L2 banc complet : 40 parties bot vs
 * bot × 3 difficultés × 150 tours avec de VRAIES civs tirées de façon
 * DÉTERMINISTE du seed (tiragePaireCivs — D1). Produit l'artefact
 * devtmp/banc-bot-p7-civs.json (chronologies + métriques par difficulté ET
 * par civ) pour la comparaison « avant (neutre) / après (civs) » avec
 * devtmp/banc-bot-tc-observation.json. AUCUN changement de comportement
 * (bot.json, seuils, agressivite intouchés — D2), zéro moteur.
 *
 * HORS CI (gate BANC_BOT_TD, ~4-6 min, pool Node).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { ChronologiePartie } from '../src/bancObservation.js';
import {
  metriquesParCiv,
  metriquesParDifficulte,
  simulerPartieObservee,
  tiragePaireCivs,
} from '../src/bancObservation.js';
import { corpusBanc } from '../src/bancBotTd.js';

const TAILLE = 40;
const TOURS = 150;
const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;

const d = (typeof process !== 'undefined' && process.env?.BANC_BOT_TD) || undefined;

it.skipIf(!d)('banc BOT-P7-CIVS — chronologies 40×3×150 avec civs réelles', () => {
  const corpus = corpusBanc(TAILLE);
  const parties: ChronologiePartie[] = [];
  for (const difficulte of DIFFICULTES) {
    for (const seed of corpus) {
      const t0 = Date.now();
      const paire = tiragePaireCivs(seed);
      const c = simulerPartieObservee(difficulte, seed, TOURS, { civs: paire });
      parties.push(c);
      console.log(
        `[${difficulte}] seed ${c.seed} (${paire.p1} vs ${paire.p2}) : ${c.tours} tours, ${c.guerres.length} guerres, ${c.captures.length} captures (${Date.now() - t0} ms)`,
      );
    }
  }

  const parDiff = metriquesParDifficulte(parties);
  const parCiv = metriquesParCiv(parties);
  console.log('\n=== BANC BOT-P7-CIVS — métriques par difficulté (civs réelles) ===');
  console.log('| Difficulté | Guerres/partie | Guerres/30t | 1re guerre (t) | Ratio décl. | Décl. fort | Durée | Stériles | Paix prop. | Paix acc. | Captures | Élim. | Tours moy. |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of parDiff) {
    console.log(
      `| ${m.difficulte} | ${m.guerresParPartie.toFixed(2)} | ${m.guerresPar30Tours.toFixed(2)} | ${m.tourPremiereGuerre?.toFixed(1) ?? '—'} | ${m.ratioDeclarationMoyen.toFixed(2)} | ${(m.declarantFort * 100).toFixed(0)}% | ${m.dureeMoyenne.toFixed(1)} | ${(m.tauxSteriles * 100).toFixed(0)}% | ${m.paixProposees} | ${m.paixAcceptees} | ${m.captures} | ${m.eliminations} | ${m.toursMoyens.toFixed(0)} |`,
    );
  }
  console.log('\n=== Par civ (agressivité déclarée vs déclarations observées) ===');
  console.log('| Civ | Agressivité | Déclarations | Déclarations/partie | Subies |');
  console.log('|---|---|---|---|---|');
  for (const m of parCiv) {
    console.log(
      `| ${m.civId} | ${m.agressiviteDeclaree} | ${m.declarations} | ${m.declarationsParPartie.toFixed(2)} | ${m.subies} |`,
    );
  }

  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../devtmp');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'banc-bot-p7-civs.json'),
    JSON.stringify({ parDiff, parCiv, parties }, null, 2),
  );
});
