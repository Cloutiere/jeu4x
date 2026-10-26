/**
 * HORLOGE-DISTANCE (décisions Erik 28/10) — L3 banc d'arbitrage : 40 parties
 * bot vs bot × 3 difficultés × 150 tours, civs réelles (tirage P7), APRÈS D1
 * (durée minimale de guerre modulée par la distance de la cible —
 * facteurMarcheCible). Produit devtmp/banc-horloge-distance.json (ères D3
 * consignées par guerre et par capture) ; le comparateur
 * devtmp/banc-horloge-analyse.mjs met en tableau D4 avant (devtmp/
 * banc-paix-rythme.json) / après, TOUTES-ÈRES et PAR ÈRE.
 *
 * HORS CI (gate BANC_BOT_TD, ~4-6 min, pool Node).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'vitest';
import type { ChronologiePartie } from '../src/bancObservation.js';
import {
  metriquesParDifficulte,
  simulerPartieObservee,
  tiragePaireCivs,
} from '../src/bancObservation.js';
import { corpusBanc } from '../src/bancBotTd.js';

const TAILLE = 40;
const TOURS = 150;
const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;

const d = (typeof process !== 'undefined' && process.env?.BANC_BOT_TD) || undefined;

it.skipIf(!d)('banc HORLOGE-DISTANCE — arbitrage D4 40×3×150 (civs réelles)', () => {
  const corpus = corpusBanc(TAILLE);
  const parties: ChronologiePartie[] = [];
  for (const difficulte of DIFFICULTES) {
    for (const seed of corpus) {
      const paire = tiragePaireCivs(seed);
      const c = simulerPartieObservee(difficulte, seed, TOURS, { civs: paire });
      parties.push(c);
      console.log(
        `[${difficulte}] seed ${c.seed} (${paire.p1} vs ${paire.p2}) : ${c.tours} tours, ${c.guerres.length} guerres, ${c.captures.length} captures`,
      );
    }
  }

  const parDiff = metriquesParDifficulte(parties);
  console.log('\n=== BANC HORLOGE-DISTANCE — métriques par difficulté ===');
  console.log('| Difficulté | Guerres/partie | 1re guerre (t) | Durée | Stériles | Paix prop. | Paix acc. | Captures | Élim. | Tours moy. |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const m of parDiff) {
    console.log(
      `| ${m.difficulte} | ${m.guerresParPartie.toFixed(2)} | ${m.tourPremiereGuerre?.toFixed(1) ?? '—'} | ${m.dureeMoyenne.toFixed(1)} | ${(m.tauxSteriles * 100).toFixed(0)}% | ${m.paixProposees} | ${m.paixAcceptees} | ${m.captures} | ${m.eliminations} | ${m.toursMoyens.toFixed(0)} |`,
    );
  }

  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../devtmp');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, 'banc-horloge-distance.json'),
    JSON.stringify({ parDiff, parties }, null, 2),
  );
});
