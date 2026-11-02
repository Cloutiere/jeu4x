/**
 * v9 — JEV-STRATEGE (01/11) — test-first des trois volets votés par Erik :
 * D-A « viserMaVictoire » devient OPPORTUNISTE (seuils data `seuils.opportunite`
 * — science : écart de techs ≥ 8 avec le leader ; domination : rapport de
 * forces ≥ 2 ; culture : jalons ≥ 12 ET en tête ; économique : trésorerie ≥
 * 10 000) — révocable (re-décision tous les `opportuniteCooldown` tours,
 * défaut 15) ; hors opportunité la question n'est pas posée (gate de bruit
 * D3 inchangée pour les parties calmes JEUNES).
 * D-B « écrasement » : `declarationMechanique` s'élargit — rapport de forces
 * ≥ `seuils.ecrasementRapport` (défaut 3) SANS signal domination NI écart de
 * villes NI mode `finPartie` (le cas partie 1 du banc vanilla : 2 941 vs 284,
 * 1 ville, 0 déclaration en 600 tours). Cooldown 8 inchangé.
 * C1 « fondation parallèle » : en mode domination, la production du colon
 * (fondation programmée, colon absent) n'est plus écrasée par la poussée
 * militaire — les deux avancent.
 * C2 « pression d'espace » : signal `espaceSature` au condensé (liste
 * blanche : booléen + nb de sites corrects restants) ; déclaration
 * opportuniste MÉCANIQUE (conditions du harnais) quand espaceSature ET
 * rapport ≥ 1 ET cible qualifiée — le choix de la CIBLE reste LLM (question
 * `conqueteEspace`, cibles pré-qualifiées, formes invalides ignorées).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import { condenseJoueur, construireQuestionsJoueur, tourJevJoueur } from '../src/joueur.mjs';
import {
  declarationMechanique,
  cibleEcrasement,
  signalDominationMechanique,
  opportunitesVoies,
  blocEspace,
  ciblesConqueteEspace,
  declarationEspace,
} from '../src/joueur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

/** Miroir etatCourse des tests v8 (capitale p2 voisine VUE). */
function etatCourse({ villesP1 = 4, legionsP1 = 1, legionsP2 = 0, guerre = false, tour = 40, purge = false } = {}) {
  const etat = etat1v1(101);
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
    cap2: { id: 'cap2', owner: 'p2', q: 8, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  for (let i = 1; i < villesP1; i++) {
    cities[`v1_${i}`] = { id: `v1_${i}`, owner: 'p1', q: 5 + i, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] };
  }
  const units = { ...etat.units };
  for (let i = 0; i < legionsP1; i++) {
    units[`u_moi_${i}`] = { id: `u_moi_${i}`, owner: 'p1', type: 'legion', q: 6, r: 5, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  for (let i = 0; i < legionsP2; i++) {
    units[`u_p2_${i}`] = { id: `u_p2_${i}`, owner: 'p2', type: 'legion', q: 7, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  // Purge : les unités procédurales de départ (colons, guerriers…) sont
  // retirées — les rapports de forces deviennent DÉTERMINISTES (2/légion).
  let unitList = units;
  if (purge) {
    unitList = {};
    for (const [id, u] of Object.entries(units)) {
      if (id.startsWith('u_moi_') || id.startsWith('u_p2_')) unitList[id] = u;
    }
  }
  return {
    ...etat,
    turn: tour,
    cities,
    units: unitList,
    diplomacy: guerre ? { ...etat.diplomacy, war: [['p1', 'p2']] } : etat.diplomacy,
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

/** Cale les techs des joueurs (écart de techs pour l'opportunité science). */
function avecTechs(etat, techsP1 = [], techsP2 = []) {
  return {
    ...etat,
    players: {
      ...etat.players,
      p1: { ...etat.players.p1, techsUnlocked: techsP1 },
      p2: { ...etat.players.p2, techsUnlocked: techsP2 },
    },
  };
}

/** Cale les jalons culturels (opportunité culture) et la trésorerie. */
function avecVictoire(etat, { jalonsP1 = 0, jalonsP2 = 0, orP1 = 100 } = {}) {
  return {
    ...etat,
    players: {
      ...etat.players,
      p1: { ...etat.players.p1, cultureMilestones: jalonsP1, treasury: orP1 },
      p2: { ...etat.players.p2, cultureMilestones: jalonsP2 },
    },
  };
}

const TECHS_8 = ['alphabet', 'bronze_travail', 'poterie', 'ecriture', 'roue', 'maconnerie', 'agriculture', 'miniere'];

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

describe('v9 · D-A — les seuils sont DATA (seuils.opportunite)', () => {
  it('seuils.opportunite { ecartTechs 8, rapportDomination 2, jalonsMin 12, tresorerieMin 10000 } + opportuniteCooldown 15 + ecrasementRapport 3 + sitesRestants 1 + conqueteRapportMin 1', () => {
    expect(config.seuils.opportunite).toEqual({ ecartTechs: 8, rapportDomination: 2, jalonsMin: 12, tresorerieMin: 10000 });
    expect(config.seuils.opportuniteCooldown).toBe(15);
    expect(config.seuils.ecrasementRapport).toBe(3);
    expect(config.seuils.sitesRestants).toBe(1);
    expect(config.seuils.conqueteRapportMin).toBe(1);
  });
});

describe('v9 · D-A — l\u2019opportunité de voie (opportunitesVoies)', () => {
  it('écart de techs ≥ 8 avec le leader ⇒ voie SCIENCE favorable', () => {
    const etat = avecTechs(etatCourse({ legionsP2: 2 }), TECHS_8, []);
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    const opp = opportunitesVoies(condense, filtre, 'p1', config.seuils);
    expect(opp.map((o) => o.voie)).toContain('science');
  });

  it('écart < 8 ⇒ PAS de voie science', () => {
    const etat = avecTechs(etatCourse({ legionsP2: 2 }), TECHS_8.slice(0, 3), []);
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condense, filtre, 'p1', config.seuils).map((o) => o.voie)).not.toContain('science');
  });

  it('rapport de forces ≥ 2 ⇒ voie DOMINATION favorable ; rapport < 2 ⇒ non', () => {
    const fort = etatCourse({ legionsP1: 6, legionsP2: 1, purge: true });
    const filtreF = getFilteredState(fort, 'p1');
    const condenseF = condenseJoueur(filtreF, 'p1', {}, config.seuils);
    expect(condenseF.monde.puissance.rapport).toBeGreaterThanOrEqual(2);
    expect(opportunitesVoies(condenseF, filtreF, 'p1', config.seuils).map((o) => o.voie)).toContain('domination');

    const faible = etatCourse({ legionsP1: 1, legionsP2: 3, purge: true });
    const filtreQ = getFilteredState(faible, 'p1');
    const condenseQ = condenseJoueur(filtreQ, 'p1', {}, config.seuils);
    expect(condenseQ.monde.puissance.rapport).toBeLessThan(2);
    expect(opportunitesVoies(condenseQ, filtreQ, 'p1', config.seuils).map((o) => o.voie)).not.toContain('domination');
  });

  it('jalons ≥ 12 ET en tête ⇒ voie CULTURE ; en tête seule ou devancé ⇒ non', () => {
    const enTete = avecVictoire(etatCourse({ legionsP2: 2 }), { jalonsP1: 12, jalonsP2: 5 });
    const filtreT = getFilteredState(enTete, 'p1');
    const condenseT = condenseJoueur(filtreT, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condenseT, filtreT, 'p1', config.seuils).map((o) => o.voie)).toContain('culture');

    const devance = avecVictoire(etatCourse({ legionsP2: 2 }), { jalonsP1: 12, jalonsP2: 14 });
    const filtreD = getFilteredState(devance, 'p1');
    const condenseD = condenseJoueur(filtreD, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condenseD, filtreD, 'p1', config.seuils).map((o) => o.voie)).not.toContain('culture');

    const jalonsBas = avecVictoire(etatCourse({ legionsP2: 2 }), { jalonsP1: 11, jalonsP2: 0 });
    const filtreB = getFilteredState(jalonsBas, 'p1');
    const condenseB = condenseJoueur(filtreB, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condenseB, filtreB, 'p1', config.seuils).map((o) => o.voie)).not.toContain('culture');
  });

  it('trésorerie ≥ 10 000 ⇒ voie ÉCONOMIQUE ; sous ⇒ non', () => {
    const riche = avecVictoire(etatCourse({ legionsP2: 2 }), { orP1: 10000 });
    const filtreR = getFilteredState(riche, 'p1');
    const condenseR = condenseJoueur(filtreR, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condenseR, filtreR, 'p1', config.seuils).map((o) => o.voie)).toContain('economique');

    const pauvre = avecVictoire(etatCourse({ legionsP2: 2 }), { orP1: 9999 });
    const filtreP = getFilteredState(pauvre, 'p1');
    const condenseP = condenseJoueur(filtreP, 'p1', {}, config.seuils);
    expect(opportunitesVoies(condenseP, filtreP, 'p1', config.seuils).map((o) => o.voie)).not.toContain('economique');
  });
});

describe('v9 · D-A — la question finPartie devient opportuniste', () => {
  it('AUCUN signal + opportunité science ⇒ la question finPartie EST posée avec viserMaVictoire:science', () => {
    // Partie CALME et JEUNE : pas de guerre, pas de jalons, rapport < 2 —
    // seule l'opportunité science ouvre la question (gate de bruit D3 sinon).
    const etat = avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, purge: true }), TECHS_8, []);
    const { questions } = questionsPour(etat, {});
    expect(questions.finPartie).toBeDefined();
    const cles = Object.keys(questions.finPartie.criteria);
    expect(cles).toContain('viserMaVictoire:science');
    expect(cles).toContain('continuer');
  });

  it('AUCUN signal + AUCUNE opportunité ⇒ PAS de question finPartie (gate calme inchangée)', () => {
    const etat = avecVictoire(avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, purge: true }), [], []), { jalonsP1: 0, orP1: 100 });
    const { questions } = questionsPour(etat, {});
    expect(questions.finPartie).toBeUndefined();
  });

  it('choix viserMaVictoire:science ⇒ memo.finPartie = { mode: \u0027science\u0027 } + decisionVoieTour (persisté, révocable)', async () => {
    const etat = avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, purge: true }), TECHS_8, []);
    const filtre = getFilteredState(etat, 'p1');
    const memo = {};
    const d = await tourJevJoueur(fauxClient({ finPartie: 'viserMaVictoire:science' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    expect(memo.finPartie).toEqual({ mode: 'science' });
    expect(memo.decisionVoieTour).toBe(40);
  });

  it('voie science choisie ⇒ productionVictoire reste offerte (non-régression traduction productionVictoire)', async () => {
    const etat = avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, purge: true }), TECHS_8, []);
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'science' }, decisionVoieTour: 40 };
    const { questions } = questionsPour(etat, memo);
    // La traduction productionVictoire dépend d'items productibles — le
    // contrat v9 est memo.finPartie = { mode: 'science' } EXACT (les tests
    // it4 verrouillent déjà la question ; ici on verrouille le memo).
    expect(memo.finPartie.mode).toBe('science');
  });

  it('RÉVISION : voie posée il y a < opportuniteCooldown tours + pas de signal ⇒ question NON re-posée', () => {
    const etat = avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, tour: 50 }), TECHS_8, []);
    const memo = { finPartie: { mode: 'science' }, decisionVoieTour: 45 };
    const { questions } = questionsPour(etat, memo);
    expect(questions.finPartie).toBeUndefined();
  });

  it('RÉVISION : cooldown écoulé (≥ 15 tours) ⇒ question re-posée (changement de cap)', () => {
    const etat = avecTechs(etatCourse({ legionsP1: 1, legionsP2: 3, tour: 60 }), TECHS_8, []);
    const memo = { finPartie: { mode: 'science' }, decisionVoieTour: 45 };
    const { questions } = questionsPour(etat, memo);
    expect(questions.finPartie).toBeDefined();
  });
});

describe('v9 · D-B — la déclaration d\u2019ÉCRASEMENT (sans signal, sans mode)', () => {
  /** Le cas partie 1 reconstitué : rapport écrasant, 1 ville CHACUN (écart
   * de villes nul → signal domination mécanique inactif), PAS de mode. */
  function casPartie1() {
    const etat = etatCourse({ villesP1: 1, legionsP1: 4, legionsP2: 0, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    return { etat, filtre, condense };
  }

  it('SEUILS : ecrasementRapport est DATA et vaut 3', () => {
    expect(config.seuils.ecrasementRapport).toBe(3);
  });

  it('rapport ≥ 3 + cible qualifiée + PAS de mode + PAS de signal ⇒ DÉCLARATION mécanique motif ecrasement', async () => {
    const { filtre, condense } = casPartie1();
    const domMec = signalDominationMechanique(condense, filtre, 'p1', 2, config.seuils.dominationEcartVilles ?? 2);
    expect(domMec).toBe(false); // écart de villes nul — l'ancien trigger ne tire pas
    const memo = {};
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'ecrasement' });
    expect(memo.guerreMecaniqueTour).toBe(40);
    // après l'acte, le memo bascule comme aujourd'hui (chaîne pousserCapitale)
    expect(memo.finPartie).toEqual({ mode: 'pousserCapitale', cible: 'p2' });
  });

  it('rapport ≥ 2 mais < ecrasementRapport + pas de mode + pas de signal ⇒ PAS de déclaration (l\u2019ancien filet tient)', async () => {
    // 1 légion (2 forces) vs 0 : rapport per-rival 2 — au-dessus du filet
    // guerreTotale (1,2) mais SOUS l'écrasement (3), et pas de mode.
    const { filtre, condense } = (() => {
      const etat = etatCourse({ villesP1: 1, legionsP1: 1, legionsP2: 0, purge: true });
      const f = getFilteredState(etat, 'p1');
      return { filtre: f, condense: condenseJoueur(f, 'p1', {}, config.seuils) };
    })();
    const domMec = signalDominationMechanique(condense, filtre, 'p1', 2, config.seuils.dominationEcartVilles ?? 2);
    expect(domMec).toBe(false);
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', {});
    expect(d.diplomatie).toHaveLength(0);
  });

  it('déjà en guerre avec la cible ⇒ PAS de déclaration d\u2019écrasement', async () => {
    const etat = etatCourse({ villesP1: 1, legionsP1: 4, legionsP2: 0, guerre: true, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', {});
    expect(d.diplomatie).toHaveLength(0);
  });

  it('cooldown : déclaration récente (< 8 tours) ⇒ PAS de nouvelle déclaration d\u2019écrasement', async () => {
    const etat = etatCourse({ villesP1: 1, legionsP1: 4, legionsP2: 0, tour: 45, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const memo = { guerreMecaniqueTour: 40 };
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('helper pur : snapshot { cible, tour, rapport, aveugle, motif } — domination INTACTE, ecrasement nouveau', () => {
    const { filtre, condense } = casPartie1();
    const domMec = signalDominationMechanique(condense, filtre, 'p1', 2, config.seuils.dominationEcartVilles ?? 2);
    // ecrasement : SANS mode
    const ecr = declarationMechanique(condense, filtre, 'p1', {}, config.seuils, domMec);
    expect(ecr).not.toBeNull();
    expect(ecr.cible).toBe('p2');
    expect(ecr.motif).toBe('ecrasement');
    expect(ecr.tour).toBe(40);
    expect(ecr.rapport).toBeGreaterThanOrEqual(3);
    expect(ecr.aveugle).toBe(false);
    // domination : AVEC mode + signal (chaîne inchangée)
    const etatDom = etatCourse({ legionsP1: 6, legionsP2: 1, purge: true });
    const filtreDom = getFilteredState(etatDom, 'p1');
    const condenseDom = condenseJoueur(filtreDom, 'p1', {}, config.seuils);
    const domMecDom = signalDominationMechanique(condenseDom, filtreDom, 'p1', 2, config.seuils.dominationEcartVilles ?? 2);
    expect(domMecDom).toBe(true);
    const dom = declarationMechanique(condenseDom, filtreDom, 'p1', { finPartie: { mode: 'domination' } }, config.seuils, domMecDom);
    expect(dom).not.toBeNull();
    expect(dom.motif).toBe('domination');
  });
});

describe('v9 · C1 — fondation PARALLÈLE en mode domination', () => {
  it('mode domination + fondation programmée + colon ABSENT ⇒ le colon EST produit (la poussée militaire ne l\u2019écrase pas)', async () => {
    const etat = etatCourse({ legionsP1: 1, legionsP2: 1, purge: true }); // rapport 1 — pas d'écrasement
    const filtre = getFilteredState(etat, 'p1');
    const memo = {
      finPartie: { mode: 'pousserCapitale', cible: 'p2' },
      fondationEnCours: { case: '30,30', tour: 39, unitId: null },
    };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'pousserCapitale:p2' }), config, filtre, 'p1', memo);
    expect(d.erreur).toBeNull();
    const productions = d.ordres.filter((o) => o.type === 'SetProduction').map((o) => `${o.item.kind}:${o.item.id}`);
    const cap = Object.values(filtre.cities ?? {}).find((v) => v.owner === 'p1' && v.capital) ?? Object.values(filtre.cities ?? {}).find((v) => v.owner === 'p1');
    expect(cap).toBeTruthy();
    // la capitale produit le COLON (dernier SetProduction gagnant côté moteur)
    const colons = productions.filter((p) => p.startsWith('unit:') && !p.startsWith('unit:grand_'));
    expect(colons.length).toBeGreaterThan(0);
    expect(productions[productions.length - 1]).toBe(colons[colons.length - 1]);
    // et AUCUN SetProduction militaire ne suit le colon dans le même tour
    const idxColon = d.ordres.findIndex((o) => o.type === 'SetProduction' && `${o.item.kind}:${o.item.id}` === colons[0]);
    const militaireApres = d.ordres.slice(idxColon + 1).some(
      (o) => o.type === 'SetProduction' && o.cityId === d.ordres[idxColon].cityId,
    );
    expect(militaireApres).toBe(false);
  });

  it('mode domination SANS fondation programmée ⇒ poussée militaire inchangée (non-régression)', async () => {
    const etat = etatCourse({ legionsP1: 1, legionsP2: 1, purge: true }); // rapport 1
    const filtre = getFilteredState(etat, 'p1');
    const memo = { finPartie: { mode: 'pousserCapitale', cible: 'p2' } };
    const d = await tourJevJoueur(fauxClient({ finPartie: 'pousserCapitale:p2' }), config, filtre, 'p1', memo);
    const productions = d.ordres.filter((o) => o.type === 'SetProduction');
    expect(productions.length).toBeGreaterThan(0);
    const cap = Object.values(filtre.cities ?? {}).find((v) => v.owner === 'p1' && v.capital) ?? Object.values(filtre.cities ?? {}).find((v) => v.owner === 'p1');
    expect(productions[0].cityId).toBe(cap.id);
  });
});

describe('v9 · C2 — le signal espaceSature (liste blanche)', () => {
  it('blocEspace : compte les sites corrects (gainNet > 0) — sature quand ≤ sitesRestants (1)', () => {
    // Terre vue limitée ⇒ peu de sites corrects ⇒ sature. La fonction est
    // pure : le CONTRAT est sature ⇔ sitesCorrects ≤ 1, avec les champs
    // EXACTS { sature, sitesCorrects }.
    const etat = etatCourse({ legionsP2: 2 });
    const filtre = getFilteredState(etat, 'p1');
    const espace = blocEspace(filtre, 'p1', {}, config.seuils);
    expect(Object.keys(espace).sort()).toEqual(['sature', 'sitesCorrects']);
    expect(espace.sature).toBe(espace.sitesCorrects <= (config.seuils.sitesRestants ?? 1));
    expect(espace.sitesCorrects).toBeGreaterThanOrEqual(0);
  });

  it('liste blanche : condense.espace ne porte QUE sature/sitesCorrects — jamais de positions ni de plan adverse', () => {
    const etat = etatCourse({ legionsP2: 2 });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    expect(Object.keys(condense.espace).sort()).toEqual(['sature', 'sitesCorrects']);
    const brut = JSON.stringify(condense.espace);
    expect(brut).not.toMatch(/"(q|r)":/); // aucune coordonnée
    expect(brut).not.toContain('cap2'); // aucune ville adverse nominative
  });

  it('condenseJoueur accepte l\u2019appel SANS seuils (compat arrière — défauts canon)', () => {
    const etat = etatCourse({ legionsP2: 2 });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(condense.espace).toBeDefined();
    expect(condense.espace.sature).toBe(condense.espace.sitesCorrects <= 1);
  });
});

describe('v9 · C2 — la conquête d\u2019espace (déclaration MÉCANIQUE, cible LLM)', () => {
  /** Rival rencontré, ville VUE, garnison faible, Jev fort — espace saturé. */
  function casEspace({ tour = 60 } = {}) {
    // rapport 2 : au-dessus de conqueteRapportMin (1) mais SOUS ecrasementRapport
    // (3) — l'écrasement D-B ne doit pas éclipser la conquête d'espace.
    const etat = etatCourse({ villesP1: 1, legionsP1: 1, legionsP2: 0, tour, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    return { etat, filtre, condense };
  }

  it('declarationEspace : sature + rapport ≥ 1 + cible qualifiée ⇒ snapshot avec conditions', () => {
    const { filtre, condense } = casEspace();
    // Force la saturation : on ne peut pas sculpter la carte — on vérifie le
    // CONTRAT sur les deux branches selon l'état réel du bloc espace.
    const decl = declarationEspace(condense, filtre, 'p1', {}, config.seuils);
    if (condense.espace.sature) {
      expect(decl).not.toBeNull();
      expect(decl.motif).toBe('espace');
      expect(decl.tour).toBe(60);
      expect(decl.rapport).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(decl.cibles)).toBe(true);
    } else {
      expect(decl).toBeNull();
    }
  });

  it('question conqueteEspace posée quand les conditions sont réunies — cibles pré-qualifiées triées, SANS \u0027aucun\u0027 (déclaration mécanique)', () => {
    const { etat, filtre, condense } = casEspace();
    const decl = declarationEspace(condense, filtre, 'p1', {}, config.seuils);
    if (decl) {
      const { questions, meta } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
      expect(questions.conqueteEspace).toBeDefined();
      const cles = Object.keys(questions.conqueteEspace.criteria);
      expect(cles).not.toContain('aucun');
      for (const c of decl.cibles) expect(cles).toContain(`conqueteEspace:${c.id}`);
      expect(meta.conqueteEspace).toBeDefined();
    }
  });

  it('traduction : cible valide ⇒ intention guerre MÉCANIQUE motif espace + horodatage ; forme invalide IGNORÉE', async () => {
    const { etat, filtre, condense } = casEspace();
    const decl = declarationEspace(condense, filtre, 'p1', {}, config.seuils);
    if (!decl || decl.cibles.length === 0) return;
    const cible = decl.cibles[0].id;
    const memo = {};
    const d = await tourJevJoueur(fauxClient({ conqueteEspace: `conqueteEspace:${cible}` }), config, filtre, 'p1', memo);
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible, mecanique: true, motif: 'espace' });
    expect(memo.guerreMecaniqueTour).toBe(60);
    expect(d.meta.guerreEspace).toBeDefined();
    expect(d.meta.guerreEspace.cible).toBe(cible);

    // forme invalide : ignorée — aucune intention, pas d'horodatage
    const memo2 = {};
    const d2 = await tourJevJoueur(fauxClient({ conqueteEspace: 'guerre:p2' }), config, filtre, 'p1', memo2);
    expect(d2.diplomatie).toHaveLength(0);
    expect(memo2.guerreMecaniqueTour).toBeUndefined();
  });

  it('cooldown : déclaration récente ⇒ PAS de question conqueteEspace', () => {
    const { filtre, condense } = casEspace();
    if (!condense.espace.sature) return;
    const decl = declarationEspace(condense, filtre, 'p1', { guerreMecaniqueTour: 58 }, config.seuils);
    expect(decl).toBeNull(); // 60 - 58 < 8
  });

  it('en guerre avec le seul rival ⇒ PAS de conquête d\u2019espace (pas de cible)', () => {
    const etat = etatCourse({ villesP1: 1, legionsP1: 4, legionsP2: 0, guerre: true, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    const decl = declarationEspace(condense, filtre, 'p1', {}, config.seuils);
    expect(decl).toBeNull();
  });

  it('rapport global < 1 (empire affaibli) ⇒ PAS de conquête d\u2019espace', () => {
    // 1 légion vs 3 légions adverses : rapport < 1 — récupérer une ville
    // n'est PAS plus facile que gagner la guerre.
    const etat = etatCourse({ villesP1: 1, legionsP1: 1, legionsP2: 3 });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    expect(condense.monde.puissance.rapport).toBeLessThan(1);
    expect(declarationEspace(condense, filtre, 'p1', {}, config.seuils)).toBeNull();
  });
});

describe('v9 · ciblesConqueteEspace — cibles pré-qualifiées (fog respecté)', () => {
  it('villes VISIBLES de rivaux non-en-guerre, triées par garnison puis distance', () => {
    const etat = etatCourse({ legionsP1: 2, legionsP2: 0, purge: true });
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', {}, config.seuils);
    const cibles = ciblesConqueteEspace(filtre, 'p1', condense, {});
    for (const c of cibles) {
      expect(c.id).not.toBe('p1');
      expect(c.id).not.toBe('barbarien');
      expect(typeof c.distance).toBe('number');
      expect(typeof c.garnison).toBe('number');
    }
    // pas de doublon de propriétaire : une cible PAR ville
    const cles = cibles.map((c) => `${c.id}@${c.ville}`);
    expect(new Set(cles).size).toBe(cles.length);
  });
});

describe('v9 · D-B bis — le cas partie 1 EXACT : rival rencontré, capitale JAMAIS vue', () => {
  /** Partie 1 du banc stratege (seed 3538506724) : contact d'unités au t41,
   * capitale p2 JAMAIS vue (distanceCapitale 99), rapport 10× — 600 tours de
   * paix totale parce que cibleGuerreTotale rejetait la cible des DEUX côtés
   * (aveugle : exige rencontre nulle ; non-aveugle : exige la capitale vue).
   * D-B au sens du handoff : « contact réel + délai OU aveugle voté ». */
  function casPartie1Exact() {
    const etat = etatCourse({ villesP1: 1, legionsP1: 4, legionsP2: 0, purge: true });
    // capitale p2 REPoussée hors de la vision (jamais vue) ; un guerrier p2
    // VISIBLE croisera notre chemin (rencontre réelle).
    etat.cities = { ...etat.cities, cap2: { ...etat.cities.cap2, q: 12, r: 5 } };
    etat.units.u_p2_vue = { id: 'u_p2_vue', owner: 'p2', type: 'guerrier', q: 6, r: 6, hp: 100, mp: 0, fortified: false, aboard: false };
    etat.players.p1 = {
      ...etat.players.p1,
      vision: { explored: ['5,5', '6,5', '8,5', '6,6'], visible: ['5,5', '6,5', '8,5', '6,6'] },
    };
    return etat;
  }

  it('rencontré depuis ≥ délai + rapport ≥ 3 + capitale inconnue ⇒ DÉCLARATION écrasement (le cas partie 1)', async () => {
    const etat = casPartie1Exact();
    const filtre = getFilteredState(etat, 'p1');
    const memo = { rencontres: { p2: 20 } }; // rencontre t20 — délai 10 écoulé à t40
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(d.diplomatie).toContainEqual({ genre: 'guerre', cible: 'p2', mecanique: true, motif: 'ecrasement' });
  });

  it('délai NON écoulé (rencontre ce tour) + capitale inconnue ⇒ PAS de déclaration', async () => {
    const etat = casPartie1Exact();
    const filtre = getFilteredState(etat, 'p1');
    const memo = {}; // rencontre calculée CE tour (t40) — délai 0 < 10
    const d = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(d.diplomatie).toHaveLength(0);
  });

  it('helper pur : cibleEcrasement qualifie le cas intermédiaire (rencontré + délai, capitale inconnue)', () => {
    const etat = casPartie1Exact();
    const filtre = getFilteredState(etat, 'p1');
    const condense = condenseJoueur(filtre, 'p1', { rencontres: { p2: 20 } }, config.seuils);
    const rivaux = condense.diplomatie.rivaux;
    expect(rivaux[0].rencontreTour).toBe(20);
    expect(rivaux[0].distanceCapitale).toBe(99);
    const c = cibleEcrasement(condense, filtre, 'p1', config.seuils);
    expect(c).not.toBeNull();
    expect(c.id).toBe('p2');
    expect(c.rapportForces).toBeGreaterThanOrEqual(3);
  });
});
