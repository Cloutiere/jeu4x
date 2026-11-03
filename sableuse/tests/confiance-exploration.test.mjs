// HANDOFF-CONFIANCE-EXPLORATION (Erik 03/11) — deux volets votés :
// D-A — seuils de confiance PAR QUESTION (canon v2, miroir guerreSterile) :
//   la gate générique (confianceChoixMin 0,65 / decisionMin 0,5) écrasait en
//   prod réelle (YU4SHH t0-23) des réponses valables : fonder 0,21 (×3, même
//   cible), convertir 0,25-0,38 (science:c3 constant), produire 0,33-0,49
//   (unit:guerrier constant — le repli bot bâtissait des merveilles),
//   rechercher 0,28 (t0). Chaque seuil = minimum observé, arrondi bas.
// D-B — doctrine d'exploration (côté botPolicy, testée dans apps/server) :
//   ici le volet JEV — les décisions à confiance 0,2-0,4 HONORÉES quand c'est
//   le meilleur choix disponible ; sans seuil dédié → gate générique.
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
  return createInitialState(gen.map, seed, { p1: { civId: 'neutre' }, p2: { civId: 'neutre' } });
}

/** État avec une capitale p1 (pour produire/convertir — le spawn n'a qu'un colon). */
function etatAvecCapitale() {
  const etat = etat1v1(101);
  const colon = Object.values(etat.units).find((u) => u.owner === 'p1' && u.type === 'colons');
  return {
    ...etat,
    cities: {
      ...etat.cities,
      cap1: { id: 'cap1', owner: 'p1', q: colon?.q ?? 0, r: (colon?.r ?? 0) + 1, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [], conversion: 'gold' },
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

describe('confiance-exploration · D-A — data seuils par question', () => {
  it('seuils.confianceParQuestion = minimums observés en prod (YU4SHH t0-23)', () => {
    expect(config.seuils.confianceParQuestion).toEqual({
      fonder: 0.2, // observé 0,21 ×3 (même cible fonder:29,11 t21-23)
      convertir: 0.25, // observé 0,25-0,38 (science:c3 constant t21-23)
      produire: 0.3, // observé 0,33-0,49 (unit:guerrier, 12 écrasements)
      rechercher: 0.25, // observé 0,28 (alphabet t0)
    });
  });
  it('copie serveur identique (questions-joueur.json)', () => {
    const copie = JSON.parse(readFileSync(join(racine, '..', 'apps', 'server', 'src', 'jev', 'questions-joueur.json'), 'utf8'));
    expect(copie).toEqual(config);
  });
  it('la gate générique est inchangée (défaut des questions sans seuil dédié)', () => {
    expect(config.seuils.confianceChoixMin).toBe(0.65);
    expect(config.seuils.decisionMin).toBe(0.5);
    expect(config.seuils.confianceGuerreSterile).toBe(0.3); // intouché
  });
});

describe('confiance-exploration · D-A — réponses 0,2-0,4 HONORÉES (cas YU4SHH reconstitués)', () => {
  it('fonder à 0,21 < 0,5 → fondation programmée (t21-23 : 3 tours, même cible)', async () => {
    const etat = etat1v1(101);
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const site = (condense.candidats?.fondation ?? [])[0];
    expect(site).toBeDefined();
    const sortie = await tourJevJoueur(
      fauxClient({ fonder: { choice: `fonder:${site.case}`, confidence: 0.21 }, produire: 'aucun', convertir: 'aucun', techOfferte: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    const ordreFondation = sortie.ordres.find(
      (o) => o.type === 'FoundCity' || (o.type === 'MultiStep' && o.final === 'foundCity'),
    );
    expect(ordreFondation).toBeDefined();
    expect(memo.fondationEnCours?.case).toBe(site.case);
  });

  it('fonder à 0,15 < seuil dédié 0,2 → ignoré', async () => {
    const etat = etat1v1(101);
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const site = (condense.candidats?.fondation ?? [])[0];
    const sortie = await tourJevJoueur(
      fauxClient({ fonder: { choice: `fonder:${site.case}`, confidence: 0.15 }, produire: 'aucun', convertir: 'aucun', techOfferte: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.ordres.find((o) => o.type === 'FoundCity' || o.type === 'MultiStep')).toBeUndefined();
    expect(memo.fondationEnCours).toBeUndefined();
  });

  it('convertir à 0,25 → SetConversion science (t21-23 : science:c3 refusé 3 fois)', async () => {
    const etat = etatAvecCapitale();
    const memo = {};
    const { filtre } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ convertir: { choice: 'science:cap1', confidence: 0.25 }, produire: 'aucun', fonder: 'aucun', techOfferte: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.actions).toContainEqual({ type: 'SetConversion', cityId: 'cap1', vers: 'science' });
  });

  it('produire à 0,33 → SetProduction (t11-17 : guerrier refusé, le bot bâtissait des merveilles)', async () => {
    const etat = etatAvecCapitale();
    const memo = {};
    const { filtre, condense } = questionsPour(etat, memo);
    const candidat = (condense.candidats?.productionCapitale ?? []).find((c) => c.cle === 'unit:guerrier');
    expect(candidat).toBeDefined();
    const sortie = await tourJevJoueur(
      fauxClient({ produire: { choice: 'unit:guerrier', confidence: 0.33 }, convertir: 'aucun', fonder: 'aucun', techOfferte: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.ordres).toContainEqual({ type: 'SetProduction', cityId: 'cap1', item: { kind: 'unit', id: 'guerrier' } });
  });

  it('rechercher à 0,28 → SetResearch (t0 : alphabet écrasé)', async () => {
    const etat = etat1v1(101);
    const memo = {};
    const { filtre } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ rechercher: { choice: 'alphabet', confidence: 0.28 }, produire: 'aucun', convertir: 'aucun', fonder: 'aucun', techOfferte: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.actions).toContainEqual({ type: 'SetResearch', techId: 'alphabet' });
  });

  it('question SANS seuil dédié (techOfferte) à 0,45 → gate générique s\u2019applique, refusée', async () => {
    const etat = etat1v1(101);
    const memo = {};
    const { filtre } = questionsPour(etat, memo);
    const sortie = await tourJevJoueur(
      fauxClient({ techOfferte: { choice: 'p2', confidence: 0.45 }, produire: 'aucun', convertir: 'aucun', fonder: 'aucun', finPartie: 'continuer' }),
      config, filtre, 'p1', memo,
    );
    expect(sortie.diplomatie).toHaveLength(0);
  });
});
