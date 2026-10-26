/**
 * BOT-TC-OBSERVATION (décisions Erik 25/10) — L2 banc complet : 40 parties
 * bot vs bot × 3 difficultés × 150 tours, MÊME corpus que le banc BOT-TD
 * (comparabilité D1). Produit les ARTEFACTS D6 (devtmp/banc-bot-tc-observation
 * .json : chronologies complètes + métriques agrégées) — AUCUN changement de
 * comportement, zéro moteur.
 *
 * HORS CI (gate BANC_BOT_TD, miroir du banc BOT-TD — ~4 min, pool Node).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { ChronologiePartie } from '../src/bancObservation.js';
import { metriquesParCiv, metriquesParDifficulte, simulerPartieObservee } from '../src/bancObservation.js';
import { corpusBanc } from '../src/bancBotTd.js';

const TAILLE = 40;
const TOURS = 150;
const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;

const d = (typeof process !== 'undefined' && process.env?.BANC_BOT_TD) || undefined;

it.skipIf(!d)('banc BOT-TC-OBSERVATION — chronologies 40×3×150', () => {
  const corpus = corpusBanc(TAILLE);
  const parties: ChronologiePartie[] = [];
  for (const difficulte of DIFFICULTES) {
    for (const seed of corpus) {
      const t0 = Date.now();
      // BOT-P7-CIVS : cette banche reste la BASELINE « neutre » (avant) —
      // les civs réelles tirées par seed sont dans banc-bot-p7-civs.test.ts.
      const c = simulerPartieObservee(difficulte, seed, TOURS, {
        civs: { p1: 'neutre', p2: 'neutre' },
      });
      parties.push(c);
      console.log(
        `[${difficulte}] seed ${c.seed} : ${c.tours} tours, ${c.guerres.length} guerres, ${c.captures.length} captures (${Date.now() - t0} ms)`,
      );
    }
  }

  const parDiff = metriquesParDifficulte(parties);
  const parCiv = metriquesParCiv(parties);
  console.log('\n=== BANC BOT-TC-OBSERVATION — métriques par difficulté ===');
  console.log('| Difficulté | Guerres/partie | Guerres/30t | 1re guerre (t) | Ratio décl. | Décl. fort | Durée | Stériles | Paix prop. | Paix acc. | Acc. perdant | Captures | Élim. | Fins <t30 | Fins <t50 | Tours moy. |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of parDiff) {
    console.log(
      `| ${m.difficulte} | ${m.guerresParPartie.toFixed(2)} | ${m.guerresPar30Tours.toFixed(2)} | ${m.tourPremiereGuerre?.toFixed(1) ?? '—'} | ${m.ratioDeclarationMoyen.toFixed(2)} | ${(m.declarantFort * 100).toFixed(0)}% | ${m.dureeMoyenne.toFixed(1)} | ${(m.tauxSteriles * 100).toFixed(0)}% | ${m.paixProposees} | ${m.paixAcceptees} | ${(m.tauxAcceptePerdant * 100).toFixed(0)}% | ${m.captures} | ${m.eliminations} | ${m.finiesAvantT30} | ${m.finiesAvantT50} | ${m.toursMoyens.toFixed(0)} |`,
    );
  }
  console.log('\n=== Par civ (agressivité déclarée vs observée) ===');
  for (const m of parCiv) {
    console.log(`| ${m.civId} | agressivité ${m.agressiviteDeclaree} | ${m.declarations} déclarations / ${m.partiesJouees} lignes = ${m.declarationsParPartie.toFixed(2)} | ${m.subies} subies |`);
  }

  // Artefact D6 — réutilisable par les passes suivantes et le banc Jev.
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../devtmp');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'banc-bot-tc-observation.json'),
    JSON.stringify({ parDiff, parCiv, parties }, null, 2),
  );
});
