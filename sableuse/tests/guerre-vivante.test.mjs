/**
 * GUERRE-VIVANTE (02/11) — test-first des trois volets votés par Erik :
 * D-B Jev en guerre modifie son jeu : (a) poids militaires en guerre
 * (productionCapitale militaire en tête, data `seuils.guerrePoidsMilitaire`) ;
 * (b) fortification ouverte par la guerre elle-même (protegerCapitale posée
 * SANS menaces à rayon 5) ; (c) jugement `guerreSterile` — gate (enGuerre ≥
 * `seuils.guerreSterileTours` 30 ET 0 bataille), choix paix/assauts/continuer,
 * formes invalides ignorées, révision cadencée `opportuniteCooldown`.
 * D-C anti-boucle : la paix proposée par Jev (guerreSterile) est réglée par
 * la grille du bot (deciderPaixNegociee) ; le harnais accepte la paix du bot
 * quand le jugement persisté de Jev est 'paix'.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import { condenseJoueur, construireQuestionsJoueur, tourJevJoueur } from '../src/joueur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

/** Miroir etatCourse (v8/v9) — guerre purement nominale : war posée,
 *  warsDepuis calé, batailles vides, unités purgées sauf légions calées. */
function etatGuerreSterile({
  tour = 60, depuis = 10, legionsP1 = 2, legionsP2 = 2, batailles = 0,
} = {}) {
  const etat = etat1v1(101);
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
    cap2: { id: 'cap2', owner: 'p2', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  const units = {};
  for (let i = 0; i < legionsP1; i++) {
    units[`u_moi_${i}`] = { id: `u_moi_${i}`, owner: 'p1', type: 'legion', q: 6, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  for (let i = 0; i < legionsP2; i++) {
    units[`u_p2_${i}`] = { id: `u_p2_${i}`, owner: 'p2', type: 'legion', q: 7, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  return {
    ...etat,
    turn: tour,
    cities,
    units,
    diplomacy: {
      ...etat.diplomacy,
      war: [['p1', 'p2']],
      warsDepuis: { 'p1,p2': depuis },
      batailles: batailles > 0 ? { 'p1,p2': batailles } : {},
      distancesCible: { 'p1,p2': 3 },
    },
    players: {
      ...etat.players,
      p1: {
        ...etat.players.p1,
        vision: { explored: ['5,5', '6,5', '8,5', '5,6'], visible: ['5,5', '6,5', '8,5', '5,6'] },
      },
      p2: { ...etat.players.p2 },
    },
  };
}

function questionsPour(etat, memo = {}) {
  const filtre = getFilteredState(etat, 'p1');
  const condense = condenseJoueur(filtre, 'p1', memo, config.seuils);
  const { questions, meta } = construireQuestionsJoueur(config, condense, filtre, 'p1', memo);
  return { questions, meta, condense, filtre };
}

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

describe('guerre-vivante · data v10', () => {
  it('seuils.guerreSterileTours 30 + guerrePoidsMilitaire + confianceGuerreSterile 0.3 + question guerreSterile présente (copie serveur identique)', () => {
    expect(config.seuils.guerreSterileTours).toBe(30);
    expect(config.seuils.guerrePoidsMilitaire).toBe(true);
    expect(config.seuils.confianceGuerreSterile).toBe(0.3);
    expect(config.questions.guerreSterile).toBeDefined();
    const copie = JSON.parse(readFileSync(join(racine, '..', 'apps', 'server', 'src', 'jev', 'questions-joueur.json'), 'utf8'));
    expect(copie).toEqual(config);
  });
});

describe('guerre-vivante · D-B(c) — gate guerreSterile', () => {
  it('posée à ≥ 30 tours de guerre avec 0 bataille', () => {
    const { questions } = questionsPour(etatGuerreSterile({ tour: 60, depuis: 10 }));
    expect(questions.guerreSterile).toBeDefined();
    expect(Object.keys(questions.guerreSterile.criteria)).toContain('paix:p2');
    expect(Object.keys(questions.guerreSterile.criteria)).toContain('assauts:p2');
    expect(Object.keys(questions.guerreSterile.criteria)).toContain('continuer');
  });
  it('pas posée avant le seuil', () => {
    const { questions } = questionsPour(etatGuerreSterile({ tour: 30, depuis: 10 }));
    expect(questions.guerreSterile).toBeUndefined();
  });
  it('pas posée si la guerre a connu des batailles', () => {
    const { questions } = questionsPour(etatGuerreSterile({ tour: 60, depuis: 10, batailles: 2 }));
    expect(questions.guerreSterile).toBeUndefined();
  });
  it('pas posée hors guerre', () => {
    const etat = etatGuerreSterile({ tour: 60 });
    etat.diplomacy = { ...etat.diplomacy, war: [] };
    const { questions } = questionsPour(etat);
    expect(questions.guerreSterile).toBeUndefined();
  });
});

describe('guerre-vivante · D-B(c) — traduction des trois choix', () => {
  it('paix:p2 → intention diplomatie paix (canon existant, grille du bot décide)', async () => {
    const etat = etatGuerreSterile();
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ guerreSterile: 'paix:p2', produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toContainEqual({ genre: 'paix', cible: 'p2', or: 0 });
    expect(memo.guerreSterile?.choix).toBe('paix');
  });
  it('assauts:p2 → memo.finPartie = { mode: pousserCapitale, cible p2 }', async () => {
    const etat = etatGuerreSterile();
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    await tourJevJoueur(
      fauxClient({ guerreSterile: 'assauts:p2', produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(memo.finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p2' });
    expect(memo.guerreSterile?.choix).toBe('assauts');
  });
  it('continuer → jugement persisté, aucune intention', async () => {
    const etat = etatGuerreSterile();
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ guerreSterile: 'continuer', produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toHaveLength(0);
    expect(memo.guerreSterile?.choix).toBe('continuer');
  });
  it('choix sous-confiant (0,4 < décisionMin) traduit quand même — seuil dédié 0,3', async () => {
    const etat = etatGuerreSterile();
    const memo = {};
    const { filtre } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ guerreSterile: { choice: 'paix:p2', confidence: 0.4 }, produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toContainEqual({ genre: 'paix', cible: 'p2', or: 0 });
  });
  it('forme invalide ignorée', async () => {
    const etat = etatGuerreSterile();
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ guerreSterile: 'paix:p3', produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toHaveLength(0);
  });
  it('jugement persisté « paix » : la question n’est pas re-posée avant le cooldown, l’intention paix REPART (boucle bornée)', async () => {
    const etat = etatGuerreSterile();
    const memo = { guerreSterile: { choix: 'paix', cible: 'p2', tour: 50 } };
    // tour courant 60 : pas de re-consultation avant 50+15
    const { questions, filtre, condense } = questionsPour(etat, memo);
    expect(questions.guerreSterile).toBeUndefined();
    const sortie = await tourJevJoueur(
      fauxClient({ produire: 'aucun', finPartie: 'continuer', convertir: 'aucun' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toContainEqual({ genre: 'paix', cible: 'p2', or: 0 });
  });
});

describe('guerre-vivante · D-B(b) — fortification ouverte par la guerre', () => {
  it('protegerCapitale posée en guerre SANS aucune menace à rayon 5', () => {
    const { questions } = questionsPour(etatGuerreSterile());
    expect(questions.protegerCapitale).toBeDefined();
  });
  it('pas posée hors guerre (canon inchangé : menaces seules ne suffisent pas sans guerre)', () => {
    const etat = etatGuerreSterile();
    etat.diplomacy = { ...etat.diplomacy, war: [] };
    const { questions } = questionsPour(etat);
    expect(questions.protegerCapitale).toBeUndefined();
  });
  it('choix protéger → Fortify des unités de combat non fortifiées près de la capitale', async () => {
    const etat = etatGuerreSterile({ tour: 60, depuis: 10, legionsP1: 2 });
    etat.units.u_moi_0.fortified = false;
    etat.units.u_moi_0.q = 5; etat.units.u_moi_0.r = 6;
    etat.units.u_moi_1.fortified = true;
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ produire: 'aucun', finPartie: 'continuer', convertir: 'aucun', protegerCapitale: 'proteger' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.ordres).toContainEqual({ type: 'Fortify', unitId: 'u_moi_0' });
    expect(sortie.ordres.some((o) => o.unitId === 'u_moi_1')).toBe(false);
  });
});

describe('guerre-vivante · D-B(a) — poids militaires en guerre', () => {
  it('productionCapitale : les combattantes passent en tête en guerre (data guerrePoidsMilitaire)', () => {
    const etat = etatGuerreSterile();
    const enGuerre = questionsPour(etat).condense.candidats.productionCapitale.map((c) => c.cle);
    const militaire = enGuerre.filter((k) => !k.startsWith('building:') && !k.startsWith('wonder:'));
    expect(militaire.length).toBeGreaterThan(0);
    expect(enGuerre.indexOf(militaire[0])).toBe(0);
  });
  it('en paix : ordre inchangé (canon)', () => {
    const etat = etatGuerreSterile();
    etat.diplomacy = { ...etat.diplomacy, war: [] };
    const cles = questionsPour(etat).condense.candidats.productionCapitale.map((c) => c.cle);
    const etatRef = etatGuerreSterile();
    etatRef.diplomacy = { ...etatRef.diplomacy, war: [] };
    const clesBis = questionsPour(etatRef).condense.candidats.productionCapitale.map((c) => c.cle);
    expect(cles).toEqual(clesBis);
  });
});
