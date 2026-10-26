/**
 * BOT-TD · L3 — banc complet : 40 parties bot vs bot × 3 difficultés,
 * 150 tours (D3). Corpus fixe (R-80 — dérivation déterministe), RNG dérivés
 * par joueur/tour : zéro flaky, même corpus ⇒ mêmes chiffres. Sortie : JSON
 * (devtmp/banc-bot-td.json) + tableau markdown au stdout (rapport).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { MesuresPartie } from '../src/bancBotTd.js';
import { agrege, corpusBanc, simulerPartie } from '../src/bancBotTd.js';

const TAILLE = 40;
const TOURS = 150;
const DIFFICULTES = ['facile', 'normal', 'difficile'] as const;

// HORS CI : le banc complet (~4 min) ne tourne que via vitest.banc.config.ts
// (le pool Workers de la config principale ne peut ni l'exécuter ni écrire).
const d = (typeof process !== 'undefined' && process.env?.BANC_BOT_TD) || undefined;

it.skipIf(!d)('banc BOT-TD — 40 parties × 3 difficultés × 150 tours', () => {
  const corpus = corpusBanc(TAILLE);
  const mesures: MesuresPartie[] = [];
  for (const difficulte of DIFFICULTES) {
    for (const seed of corpus) {
      const t0 = Date.now();
      const m = simulerPartie(difficulte, seed, TOURS);
      mesures.push(m);
      console.log(`[${difficulte}] seed ${m.seed} : ${m.tours} tours, ${m.villes} villes, ${m.unites} unités, ${m.techs} techs, ${m.pvMilitaires} PV mil. (${Date.now() - t0} ms)`);
    }
  }
  // Verrou de déterminisme : rejouer UNE partie du corpus donne bit à bit
  // les mêmes mesures (garde CI-FLAKY — même entrée ⇒ même sortie).
  const temoin = corpus[0]!;
  for (const difficulte of DIFFICULTES) {
    expect(simulerPartie(difficulte, temoin, TOURS)).toEqual(
      mesures.find((m) => m.difficulte === difficulte && m.seed === temoin),
    );
  }

  const tableau = agrege(mesures);
  console.log('\n=== BANC BOT-TD — moyennes par difficulté (40 parties × 150 tours) ===');
  console.log('| Difficulté | Villes | Population | Unités | Trésorerie | Techs | PV militaires | Tours moyens |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const t of tableau) {
    console.log(`| ${t.difficulte} | ${t.villes.toFixed(1)} | ${t.population.toFixed(1)} | ${t.unites.toFixed(1)} | ${t.tresorerie.toFixed(0)} | ${t.techs.toFixed(1)} | ${t.pvMilitaires.toFixed(0)} | ${t.tours.toFixed(0)} |`);
  }

  // PIÈGE BOT-TC (25/10) : process.cwd() dépend du worker vitest — deux bancs
  // complets ont été écrits dans ~/devtmp au lieu du dépôt. Ancrage sur LE
  // FICHIER (tests-banc → apps/server → ZCodeProject/devtmp).
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../devtmp');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'banc-bot-td.json'), JSON.stringify({ tableau, mesures }, null, 2));
});
