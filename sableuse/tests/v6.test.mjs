/**
 * v6 — JEV-IT4-FIN-PARTIE (31/10) — test-first : Jev VOIT la fin de partie
 * (bloc `victoire` du condensé : jalons /20, composants du Vaisseau /4,
 * merveilles de victoire, trésoreries approximées) puis la VISE (questions
 * finPartie / productionVictoire / protegerCapitale, gate de bruit D3,
 * ORDRES EXISTANTS SEULEMENT — D5 zéro changement moteur).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import { condenserEtat, blocVictoire, merveillesVictoire, COMPOSANTS_VAISSEAU } from '../src/condense.mjs';
import {
  condenseJoueur,
  construireQuestionsJoueur,
  signalVictoire,
  itemsVictoireProductibles,
  tourJevJoueur,
} from '../src/joueur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

function fixture(seed = 101, tour = 1) {
  const etat = { ...etat1v1(seed), turn: tour };
  return getFilteredState(etat, 'p1');
}

/** État enrichi : jalons + composants + merveille de victoire en chantier.
 * Capitale p1 SYNTHÉTIQUE (createInitialState ne pose pas de villes — miroir
 * etatAvecContact des tests v5) + capitale p2 voisine (distance < 99 pour la
 * voie domination D4) + un guerrier p1 (rapport de forces ≥ 1). */
function etatCourse({ jalonsMoi = 0, jalonsRival = 0, composantsMoi = 0, chantierMoi = false, techsVol = false } = {}) {
  const etat = etat1v1(101);
  const cap = { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] };
  const buildings = composantsMoi > 0 ? COMPOSANTS_VAISSEAU.slice(0, composantsMoi) : [];
  const cities = {
    ...etat.cities,
    [cap.id]: {
      ...cap,
      buildings,
      production: chantierMoi
        ? { item: { kind: 'wonder', id: 'nations_unies' }, progress: 100 }
        : cap.production ?? null,
    },
    cap2: { id: 'cap2', owner: 'p2', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  const units = {
    ...etat.units,
    u_moi: { id: 'u_moi', owner: 'p1', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false },
  };
  return {
    ...etat,
    turn: 40,
    cities,
    units,
    players: {
      ...etat.players,
      p1: {
        ...etat.players.p1,
        cultureMilestones: jalonsMoi,
        techsUnlocked: techsVol ? ['vol_spatial'] : (etat.players.p1?.techsUnlocked ?? []),
        vision: { explored: ['5,5', '6,5', '8,5'], visible: ['5,5', '6,5', '8,5'] },
      },
      p2: { ...etat.players.p2, cultureMilestones: jalonsRival, treasury: 1234 },
    },
  };
}

describe('v6 · L1 — bloc victoire du condensé (D1)', () => {
  it('partie calme : bloc présent mais NEUTRE (zéros, pas de chantier)', () => {
    const filtre = fixture();
    const c = condenserEtat(filtre, 'p1');
    expect(c.victoire).toBeDefined();
    expect(c.victoire.cibles).toEqual({ jalons: 20, composants: 4, or: 20000 });
    expect(c.victoire.mien.jalons).toBe(0);
    expect(c.victoire.mien.composants).toBe(0);
    expect(c.victoire.mien.merveillesEnChantier).toEqual([]);
    for (const r of c.victoire.rivaux) {
      expect(r.jalons).toBe(0);
      expect(r.composants).toBe(0);
      expect(r.tresorerieApprox).toBe(0);
    }
    expect(signalVictoire(c)).toBe(false);
  });

  it('partie en course : chiffres EXACTS (jalons, composants, chantier, trésorerie approximée)', () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 7, jalonsRival: 12, composantsMoi: 2, chantierMoi: true }), 'p1');
    const c = condenserEtat(filtre, 'p1');
    expect(c.victoire.mien.jalons).toBe(7);
    expect(c.victoire.mien.composants).toBe(2);
    expect(c.victoire.mien.merveillesEnChantier).toEqual([
      { nom: 'nations_unies', ville: expect.any(String), toursRestants: expect.any(Number) },
    ]);
    const r = c.victoire.rivaux.find((x) => x.civ === 'egypte');
    expect(r.jalons).toBe(12);
    // ⚠ le fog moteur ZÉRIFIE la trésorerie adverse (R-134) — le champ
    // tresorerieApprox reste en place (structure D1) mais porte 0 tant que
    // le moteur ne diffuse pas l'or adverse. Consigné 🔶 au rapport.
    expect(r.tresorerieApprox).toBe(0);
    expect(signalVictoire(c)).toBe(true);
  });

  it('rivaux ÉLIMINÉS exclus du bloc victoire', () => {
    const etat = etatCourse({ jalonsRival: 15 });
    etat.players.p2 = { ...etat.players.p2, defeated: true };
    const c = condenserEtat(getFilteredState(etat, 'p1'), 'p1');
    expect(c.victoire.rivaux).toEqual([]);
    expect(signalVictoire(c)).toBe(false); // 15 jalons d'un éliminé ne signalent PAS
  });

  it('liste blanche : JAMAIS de positions d\'unités ni de plans adverses dans le bloc', () => {
    const c = condenserEtat(getFilteredState(etatCourse({ jalonsRival: 12 }), 'p1'), 'p1');
    const plat = JSON.stringify(c.victoire);
    expect(plat).not.toContain('"q"');
    expect(plat).not.toContain('"r"');
    for (const r of c.victoire.rivaux) {
      expect(Object.keys(r).sort()).toEqual(['civ', 'composants', 'id', 'jalons', 'merveillesBatees', 'merveillesEnChantier', 'tresorerieApprox']);
    }
  });

  it('merveillesVictoire : OUI pour ONU/Banque, NON pour une merveille ordinaire', () => {
    expect(merveillesVictoire('nations_unies')).toBe(true);
    expect(merveillesVictoire('banque_mondiale')).toBe(true);
    expect(merveillesVictoire('stonehenge')).toBe(false);
  });
});

describe('v6 · L2 — gate de bruit (D3) et questions', () => {
  it('partie calme : AUCUNE question victoire (prompt inchangé, non-régression v4)', () => {
    const filtre = fixture();
    const condense = condenseJoueur(filtre, 'p1', {});
    const { questions, meta } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeUndefined();
    expect(questions.productionVictoire).toBeUndefined();
    expect(questions.protegerCapitale).toBeUndefined();
    expect(meta.finPartie).toBeUndefined();
  });

  it('signal (12 jalons chez le rival) : finPartie POSE avec cibles pré-triées', () => {
    const filtre = getFilteredState(etatCourse({ jalonsRival: 12 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const { questions, meta } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeDefined();
    expect(meta.finPartie.signal).toBe(true);
    const cles = Object.keys(questions.finPartie.criteria);
    expect(cles).toContain('continuer');
    expect(cles).toContain('viserMaVictoire:domination');
    expect(cles.some((k) => k.startsWith('pousserCapitale:') || k.startsWith('contrerCourse:'))).toBe(true);
    // D4 : la domination n'est PAS bloquée (rapport de forces sain) → pas de
    // virage culturel/scientifique/économique proposé.
    expect(cles.some((k) => k.startsWith('viserMaVictoire:culture'))).toBe(false);
  });

  it('productionVictoire : posée SEULEMENT après viserMaVictoire culture/science (memo), jamais avant', () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12, composantsMoi: 1, techsVol: true }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const sansMemo = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(sansMemo.questions.productionVictoire).toBeUndefined();
    const avecMemo = construireQuestionsJoueur(config, condense, filtre, 'p1', { finPartie: { mode: 'science' } });
    expect(avecMemo.questions.productionVictoire).toBeDefined();
    // Les items proposés sont des composants productibles (formes canon existantes).
    for (const k of Object.keys(avecMemo.questions.productionVictoire.criteria)) {
      if (k === 'aucun') continue;
      expect(k.startsWith('building:vaisseau_') || k.startsWith('wonder:')).toBe(true);
    }
  });

  it('protegerCapitale : posée en guerre AVEC menaces, absente sinon', () => {
    const etat = etatCourse({ jalonsMoi: 12 });
    // guerre p1↔p2 + unité p2 proche de la capitale p1.
    etat.diplomacy = { ...etat.diplomacy, war: [['p1', 'p2']] };
    const cap = Object.values(etat.cities).find((v) => v.owner === 'p1');
    etat.units = { ...etat.units, u_env: { id: 'u_env', owner: 'p2', type: 'guerrier', q: cap.q + 1, r: cap.r, hp: 100, mp: 0, fortified: false, aboard: false } };
    etat.players.p1 = { ...etat.players.p1, vision: { explored: [`${cap.q},${cap.r}`], visible: [`${cap.q},${cap.r}`, `${cap.q + 1},${cap.r}`] } };
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.protegerCapitale).toBeDefined();
    expect(Object.keys(questions.protegerCapitale.criteria)).toEqual(['aucun', 'proteger']);
  });
});

describe('v6 · L2 — traduction des décisions (ORDRES EXISTANTS, D5)', () => {
  function fauxClient(reponses) {
    return {
      async systemOne() {
        const answers = {};
        for (const [k, v] of Object.entries(reponses)) {
          answers[k] = typeof v === 'string' ? { choice: v, confidence: 0.9 } : v;
        }
        return { answers, usage: { input_tokens: 100 } };
      },
    };
  }

  it('viserMaVictoire:domination → memo + poussée militaire de la capitale', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    const memo = {};
    const d = await tourJevJoueur(fauxClient({ finPartie: 'viserMaVictoire:domination' }), config, filtre, 'p1', memo);
    expect(memo.finPartie).toEqual({ mode: 'domination' });
    expect(d.ordres.some((o) => o.type === 'SetProduction' && typeof o.item.id === 'string')).toBe(true);
    // L'item poussé est un candidat DÉJÀ listé (jamais d'ordre hors liste).
    const item = d.ordres.find((o) => o.type === 'SetProduction').item;
    expect((condense.candidats.productionCapitale ?? []).some((c) => c.cle === `${item.kind}:${item.id}`)).toBe(true);
  });

  it('viserMaVictoire:science → memo + conversion science ; productionVictoire traduit en SetProduction', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12, composantsMoi: 1, techsVol: true }), 'p1');
    const memo = {};
    const d1 = await tourJevJoueur(fauxClient({ finPartie: 'viserMaVictoire:science' }), config, filtre, 'p1', memo);
    expect(memo.finPartie).toEqual({ mode: 'science' });
    expect(d1.actions).toContainEqual({ type: 'SetConversion', cityId: expect.any(String), vers: 'science' });
    // Tour suivant : la question productionVictoire existe et se traduit.
    const condense2 = condenseJoueur(filtre, 'p1', memo);
    const { questions } = construireQuestionsJoueur(config, condense2, filtre, 'p1', memo);
    expect(questions.productionVictoire).toBeDefined();
    const cle = Object.keys(questions.productionVictoire.criteria).find((k) => k !== 'aucun');
    const d2 = await tourJevJoueur(fauxClient({ productionVictoire: cle }), config, filtre, 'p1', memo);
    const [kind, id] = cle.split(':');
    expect(d2.ordres).toContainEqual({ type: 'SetProduction', cityId: expect.any(String), item: { kind, id } });
  });

  it('continuer efface le memo ; forme invalide → ignorée sans panne, repli compté', async () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 12 }), 'p1');
    const memo = { finPartie: { mode: 'science' } };
    await tourJevJoueur(fauxClient({ finPartie: 'continuer' }), config, filtre, 'p1', memo);
    expect(memo.finPartie).toBeUndefined();
    // forme invalide (confidence OK mais cle hors liste)
    const memo2 = {};
    const d = await tourJevJoueur(fauxClient({ finPartie: 'viserMaVictoire:plat' }), config, filtre, 'p1', memo2);
    expect(d.erreur).toBeNull();
    expect(d.ordres).toEqual([]);
    expect(d.repli).toBe(true); // compté, jamais de panne
  });

  it('protegerCapitale → ordres Fortify sur les unités proches non fortifiées', async () => {
    const etat = etatCourse({ jalonsMoi: 12 });
    etat.diplomacy = { ...etat.diplomacy, war: [['p1', 'p2']] };
    const cap = Object.values(etat.cities).find((v) => v.owner === 'p1');
    etat.units = {
      ...etat.units,
      u_moi1: { id: 'u_moi1', owner: 'p1', type: 'guerrier', q: cap.q, r: cap.r, hp: 100, mp: 0, fortified: false, aboard: false },
      u_moi2: { id: 'u_moi2', owner: 'p1', type: 'guerrier', q: cap.q, r: cap.r, hp: 100, mp: 0, fortified: true, aboard: false },
      u_env: { id: 'u_env', owner: 'p2', type: 'guerrier', q: cap.q + 1, r: cap.r, hp: 100, mp: 0, fortified: false, aboard: false },
    };
    etat.players.p1 = { ...etat.players.p1, vision: { explored: [`${cap.q},${cap.r}`], visible: [`${cap.q},${cap.r}`, `${cap.q + 1},${cap.r}`] } };
    const filtre = getFilteredState(etat, 'p1');
    const memo = {};
    const d = await tourJevJoueur(fauxClient({ protegerCapitale: 'proteger' }), config, filtre, 'p1', memo);
    expect(d.ordres).toContainEqual({ type: 'Fortify', unitId: 'u_moi1' });
    expect(d.ordres.some((o) => o.type === 'Fortify' && o.unitId === 'u_moi2')).toBe(false); // déjà fortifiée
    expect(d.ordres.some((o) => o.type === 'Fortify' && o.unitId === 'u_env')).toBe(false);
  });
});

describe('v6 · déterminisme et intégrité', () => {
  it('blocVictoire déterministe (deux appels ⇒ même JSON, clés triées)', () => {
    const filtre = getFilteredState(etatCourse({ jalonsMoi: 3, jalonsRival: 5 }), 'p1');
    const m = new Map();
    const a = JSON.stringify(blocVictoire(filtre, 'p1', m));
    const b = JSON.stringify(blocVictoire(filtre, 'p1', m));
    expect(a).toBe(b);
  });

  it('itemsVictoireProductibles : science → composants manquants seulement', () => {
    const filtre = getFilteredState(etatCourse({ composantsMoi: 2, techsVol: true }), 'p1');
    const cap = Object.values(filtre.cities).find((v) => v.owner === 'p1');
    const items = itemsVictoireProductibles('science', filtre, 'p1', cap, 5);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(COMPOSANTS_VAISSEAU.slice(2));
  });
});
