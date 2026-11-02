/**
 * HANDOFF-BANC-VANILLA (Erik 01/11) — mode VANILLA du banc Jev : EXPERIENCE
 * de mesure (5 parties jusqu'à une victoire quelconque), zéro changement
 * moteur, zéro retouche de Jev. P2 : toutes les données de civilisation sont
 * NEUTRALISÉES des deux camps en jouant `civId: 'neutre'` (R-147 — la civ
 * par défaut SANS traits, SANS unités uniques, agressivité au défaut canon
 * 0,5). Data-driven par construction : le moteur lit CIVILIZATIONS.civs[civId]
 * → null ; la variante n'existe que CÔTÉ BANC (plan.json), le jeu en prod est
 * INTACT. L2 : la raison de victoire (événement `Victory` du moteur) est
 * consignée au journal de fin.
 */
import { corpusBanc } from '../../apps/server/src/bancBotTd.js';
import { tiragePaireCivs } from '../../apps/server/src/bancObservation.js';

/** P2 — setup de civs vanilla : neutre/neutre, quels que soient les seeds. */
export function civsVanilla() {
  return { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } };
}

/**
 * Plan de banc : n parties du corpus, civs P7 du seed (banc standard) OU
 * neutre/neutre (vanilla), plafond paramétrable (600 pour l'expérience).
 * Pur (le dossier d'écriture reste dans banc-joueur.mjs — testable).
 */
export function construirePlan({ n, vanilla = false, plafondTours = 150, difficulte = 'normal' }) {
  const seeds = corpusBanc(40).slice(0, n);
  const parties = seeds.map((seed, i) => {
    const paire = vanilla ? { p1: 'neutre', p2: 'neutre' } : tiragePaireCivs(seed);
    return { idx: i + 1, seed, civs: { p1: paire.p1, p2: paire.p2 } };
  });
  const plan = { date: new Date().toISOString(), nParties: n, plafondTours, difficulte, corpus: `corpusBanc(40)[:${n}]`, parties };
  if (vanilla) plan.vanilla = true;
  return plan;
}

/** L2 — raison de la victoire : l'événement `Victory` du gagnant (domination,
 *  razedCapital, culture, science, économique ; forfait = serveur seul, non
 *  atteint au banc). null si partie au plafond (indécise) ou pas de gagnant. */
export function raisonVictoireDe(events, gagnant) {
  if (gagnant === null || gagnant === undefined) return null;
  const v = (events ?? []).find((e) => e.type === 'Victory' && e.winner === gagnant);
  return v?.reason ?? null;
}
