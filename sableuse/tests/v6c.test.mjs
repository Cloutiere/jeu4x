/**
 * v6c — JEV-CALIBRAGE-OFFENSIF (31/10) — test-first : de la déclaration à la
 * CAPTURE. Diagnostic D-O (journaux it4b) : l'armée se forme (43-120 unités,
 * forces 147 vs 59) mais ne marche JAMAIS vers la capitale déclarée
 * (2126 destinations de Move en guerre, distance min 16 — cap. adverse ;
 * distanceCapitale reste 99 toute la partie même après contact). Leviers :
 *   D-B — seuil d'écart de villes 3 → 2 dans signalDominationMechanique
 *         (data `seuils.dominationEcartVilles` — le seed 786078703 muet
 *         (écart 2) doit alors déclencher le signal) ;
 *   D-C — paix + compensation NON posées quand memo.finPartie est en mode
 *         domination/pousserCapitale ET rapport de forces ≥ 1 (fin des
 *         boucles 13-45 refus) ; rapport < 1 → paix à nouveau possible ;
 *   D-E1 — cadre du théâtre : le harnais (état COMPLET) calcule par rival
 *         éligible une DIRECTION (6 secteurs hex) + une distance APPROCHÉE
 *         (buckets 5/10/20/40) — JAMAIS de case exacte — exposée au
 *         condensé via `filtre.theatre` → rivaux[].capitaleDirection /
 *         capitaleDistance (null sinon) ;
 *   D-E2 — la MARCHE : memo.finPartie en mode domination + en guerre +
 *         cible de théâtre → les `seuils.marcheTaille` unités offensives
 *         (hors menace adjacente, hors col) les plus proches reçoivent un
 *         MultiStep vers le point de passage (ORDRE EXISTANT — le tactique
 *         garde les combats adjacents et les fondations).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialState, generateProceduralMap, getFilteredState } from '@game/rules';
import {
  calculerTheatre,
  condenseJoueur,
  construireQuestionsJoueur,
  cibleGuerreTotale,
  signalDominationMechanique,
  signalVictoire,
  tourJevJoueur,
} from '../src/joueur.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(racine, 'questions-joueur.json'), 'utf8'));

function etat1v1(seed = 101) {
  const gen = generateProceduralMap(seed);
  return createInitialState(gen.map, seed, { p1: { civId: 'rome' }, p2: { civId: 'egypte' } });
}

/** Miroir etatCourse des tests v6b : capitales synthétiques + unités.
 * visionCap2=false → cap2 hors vision (profil aveugle du stérile). */
function etatCourse({ villesP1 = 1, legionsP1 = 1, legionsP2 = 0, guerre = false, visionCap2 = true } = {}) {
  const etat = etat1v1(101);
  const cities = {
    ...etat.cities,
    cap1: { id: 'cap1', owner: 'p1', q: 5, r: 5, pop: 3, capital: true, buildings: [], workedTiles: [], wonders: [] },
    // visionCap2 : cap2 à (8,5) — portée de vue de la légion en (6,5)
    // (computeVisibleTiles vit sur les UNITÉS, pas sur la vision synthétique
    // — canon v6b) ; sinon (12,5), hors de vue (profil aveugle du stérile).
    cap2: { id: 'cap2', owner: 'p2', q: visionCap2 ? 8 : 12, r: 5, pop: 2, capital: true, buildings: [], workedTiles: [], wonders: [] },
  };
  for (let i = 1; i < villesP1; i++) {
    cities[`v1_${i}`] = { id: `v1_${i}`, owner: 'p1', q: 5 + i, r: 6, pop: 1, capital: false, buildings: [], workedTiles: [], wonders: [] };
  }
  const units = { ...etat.units };
  for (let i = 0; i < legionsP1; i++) {
    units[`u_moi_${i}`] = { id: `u_moi_${i}`, owner: 'p1', type: 'legion', q: 6, r: 5, hp: 100, mp: 2, fortified: false, aboard: false };
  }
  for (let i = 0; i < legionsP2; i++) {
    units[`u_p2_${i}`] = { id: `u_p2_${i}`, owner: 'p2', type: 'legion', q: 9, r: 5 + i, hp: 100, mp: 0, fortified: false, aboard: false };
  }
  return {
    ...etat,
    turn: 40,
    cities,
    units,
    diplomacy: guerre ? { ...etat.diplomacy, war: [['p1', 'p2']] } : etat.diplomacy,
    players: {
      ...etat.players,
      p1: {
        ...etat.players.p1,
        vision: {
          explored: visionCap2 ? ['5,5', '6,5', '5,6', '8,5'] : ['5,5', '6,5', '5,6'],
          visible: visionCap2 ? ['5,5', '6,5', '5,6', '8,5'] : ['5,5', '6,5', '5,6'],
        },
      },
      p2: { ...etat.players.p2 },
    },
  };
}

function questionsPour(etat, memo = {}, filtreSup = null) {
  const filtre = getFilteredState(etat, 'p1');
  if (filtreSup) Object.assign(filtre, filtreSup);
  const condense = condenseJoueur(filtre, 'p1', memo);
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

// ---------------------------------------------------------------------------
// D-B — seuil d'écart 3 → 2 (data)
// ---------------------------------------------------------------------------
describe('v6c · D-B — seuil d\'écart de villes 3 → 2 (data dominationEcartVilles)', () => {
  it('écart EXACTEMENT 2 + rapport ≥ 2 ⇒ signal VRAI (profil du seed 786078703 muet en it4b)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 3 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(condense.monde.puissance.rapport).toBeGreaterThanOrEqual(2);
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(true);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeDefined();
  });

  it('écart 1 ⇒ PAS de signal (la partie calme reste muette — gate non ouvert)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 2 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
    const { questions } = construireQuestionsJoueur(config, condense, filtre, 'p1', {});
    expect(questions.finPartie).toBeUndefined();
  });

  it('rapport < 2 ⇒ PAS de signal même avec écart ≥ 2 (la moitié mécanique reste entière)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 4, legionsP2: 5 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(condense.monde.puissance.rapport).toBeLessThan(2);
    expect(signalDominationMechanique(condense, filtre, 'p1')).toBe(false);
  });

  it('la donnée `seuils.dominationEcartVilles` existe dans questions-joueur.json v7', () => {
    expect(config.seuils.dominationEcartVilles).toBe(2);
  });

  it('le seuil data est LUI : écart 2 refusé si dominationEcartVilles = 3 (consigne data-driven)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 3 }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(signalDominationMechanique(condense, filtre, 'p1', 2, 3)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D-C — paix interdite en mode domination (rapport ≥ 1)
// ---------------------------------------------------------------------------
describe('v6c · D-C — paix + compensation non posées en mode domination (rapport ≥ 1)', () => {
  function etatGuerre({ legionsP2 = 0 } = {}) {
    return etatCourse({ legionsP1: 2, legionsP2, guerre: true });
  }

  it('en guerre + mode domination + rapport ≥ 1 ⇒ NI paix NI compensation (fin des boucles de refus)', () => {
    const { questions } = questionsPour(etatGuerre(), { finPartie: { mode: 'domination' } });
    expect(questions.paix).toBeUndefined();
    expect(questions.compensation).toBeUndefined();
    expect(metaHas(questions, 'paix')).toBe(false);
  });

  it('en guerre + mode pousserCapitale + rapport ≥ 1 ⇒ NI paix NI compensation', () => {
    const { questions } = questionsPour(etatGuerre(), { finPartie: { mode: 'pousserCapitale:p2' } });
    // mode normalisé : 'pousserCapitale' avec cible — memo.finPartie.mode porte le MODE.
    const memo = { finPartie: { mode: 'pousserCapitale', cible: 'p2' } };
    const again = questionsPour(etatGuerre(), memo);
    expect(again.questions.paix).toBeUndefined();
  });

  it('rapport < 1 (sauve-qui-peut) ⇒ la paix REVIENT même en mode domination', () => {
    const { questions, condense } = questionsPour(etatGuerre({ legionsP2: 8 }), { finPartie: { mode: 'domination' } });
    expect(condense.monde.puissance.rapport).toBeLessThan(1);
    expect(questions.paix).toBeDefined();
    expect(questions.compensation).toBeDefined();
  });

  it('SANS mode finPartie (non-régression) ⇒ paix posée comme avant', () => {
    const { questions } = questionsPour(etatGuerre(), {});
    expect(questions.paix).toBeDefined();
  });

  it('mode non-domination (culture) ⇒ paix posée comme avant', () => {
    const { questions } = questionsPour(etatGuerre(), { finPartie: { mode: 'culture' } });
    expect(questions.paix).toBeDefined();
  });
});

function metaHas(questions, genre) {
  return Object.values(questions).some((q) => q?.meta?.genre === genre);
}

// ---------------------------------------------------------------------------
// D-E1 — cadre du théâtre (direction + distance approchée, JAMAIS la case)
// ---------------------------------------------------------------------------
describe('v6c · D-E1 — calculerTheatre (harnais, état complet) + exposition au condensé', () => {
  it('en guerre ⇒ direction (6 secteurs hex) + distance bucket, sans coordonnées', () => {
    const etat = etatCourse({ guerre: true });
    const theatre = calculerTheatre(etat, 'p1', {});
    expect(theatre.p2).toBeDefined();
    expect(['E', 'O', 'NE', 'NO', 'SE', 'SO']).toContain(theatre.p2.direction);
    // cap1 (5,5) → cap2 (8,5) : distance hex 3 → bucket 5.
    expect(theatre.p2.distance).toBe(5);
    expect(JSON.stringify(theatre)).not.toContain('"q"');
    expect(JSON.stringify(theatre)).not.toContain('"r"');
  });

  it('SANS guerre et SANS mode domination ⇒ théâtre VIDE (rien de révélé)', () => {
    const etat = etatCourse({});
    expect(calculerTheatre(etat, 'p1', {})).toEqual({});
  });

  it('mode domination actif (même sans guerre) ⇒ théâtre rempli (voie de conquête préparée)', () => {
    const etat = etatCourse({});
    const theatre = calculerTheatre(etat, 'p1', { finPartie: { mode: 'domination' } });
    expect(theatre.p2).toBeDefined();
  });

  it('distance buckets : ≤ 5 → 5, ≤ 10 → 10, ≤ 20 → 20, au-delà → 40', () => {
    const etat = etatCourse({ guerre: true });
    etat.cities.cap2 = { ...etat.cities.cap2, q: 8, r: 5 }; // dist 3
    expect(calculerTheatre(etat, 'p1', {}).p2.distance).toBe(5);
    etat.cities.cap2 = { ...etat.cities.cap2, q: 25, r: 5 }; // dist 20
    expect(calculerTheatre(etat, 'p1', {}).p2.distance).toBe(20);
    etat.cities.cap2 = { ...etat.cities.cap2, q: 30, r: 5 }; // dist 25
    expect(calculerTheatre(etat, 'p1', {}).p2.distance).toBe(40);
  });

  it('blocDiplomatie expose capitaleDirection/capitaleDistance depuis filtre.theatre (null sinon)', () => {
    const etat = etatCourse({ guerre: true });
    const filtre = getFilteredState(etat, 'p1');
    const condenseSans = condenseJoueur(filtre, 'p1', {});
    expect(condenseSans.diplomatie.rivaux[0].capitaleDirection).toBeNull();
    expect(condenseSans.diplomatie.rivaux[0].capitaleDistance).toBeNull();
    filtre.theatre = calculerTheatre(etat, 'p1', {});
    const condenseAvec = condenseJoueur(filtre, 'p1', {});
    expect(condenseAvec.diplomatie.rivaux[0].capitaleDirection).toBeTruthy();
    expect(condenseAvec.diplomatie.rivaux[0].capitaleDistance).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// D-E2 — la MARCHE (traduction des choix en mouvements)
// ---------------------------------------------------------------------------
describe('v6c · D-E2 — marche offensive en mode domination + guerre', () => {
  function marcheFiltre(etat, memo = {}) {
    const filtre = getFilteredState(etat, 'p1');
    filtre.theatre = calculerTheatre(etat, 'p1', memo);
    const condense = condenseJoueur(filtre, 'p1', memo);
    return { filtre, condense };
  }

  it('mode domination + guerre + légions ⇒ MultiStep vers la direction pour les unités éligibles', async () => {
    const etat = etatCourse({ legionsP1: 2, guerre: true });
    const memo = { finPartie: { mode: 'domination' } };
    const { filtre, condense } = marcheFiltre(etat, memo);
    const sortie = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    const marche = sortie.ordres.filter((o) => o.type === 'MultiStep');
    // Les 2 légions marchent (le guerrier initial peut s'y ajouter).
    const ids = marche.map((o) => o.unitId);
    expect(ids).toContain('u_moi_0');
    expect(ids).toContain('u_moi_1');
    // Le pas converge vers la cible (cap2 vue à l'Est — q croissant, arrêt
    // DEVANT la ville : (7,5)).
    for (const o of marche) {
      expect(o.path.length).toBeGreaterThan(0);
      expect(o.path[o.path.length - 1].q).toBeGreaterThan(6);
    }
  });

  it('SANS mode domination ⇒ AUCUN ordre de marche (non-régression absolue)', async () => {
    const etat = etatCourse({ legionsP1: 2, guerre: true });
    const { filtre } = marcheFiltre(etat, {});
    const sortie = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', {});
    expect(sortie.ordres.filter((o) => o.type === 'MultiStep' && !o.final)).toEqual([]);
  });

  it('mode domination SANS guerre ⇒ AUCUN ordre de marche (pas de provocation sans conquête possible)', async () => {
    const etat = etatCourse({ legionsP1: 2, guerre: false });
    const memo = { finPartie: { mode: 'domination' } };
    const { filtre } = marcheFiltre(etat, memo);
    const sortie = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(sortie.ordres.filter((o) => o.type === 'MultiStep' && !o.final)).toEqual([]);
  });

  it('unité sous menace adjacente EXCLUE de la marche (le tactique garde les combats)', async () => {
    const etat = etatCourse({ legionsP1: 2, legionsP2: 1, guerre: true });
    // u_p2_0 au contact de u_moi_0 (6,5) — u_moi_1 déplacée hors de portée.
    etat.units.u_p2_0 = { ...etat.units.u_p2_0, q: 7, r: 5 };
    etat.units.u_moi_1 = { ...etat.units.u_moi_1, q: 5, r: 6 };
    const memo = { finPartie: { mode: 'domination' } };
    const { filtre } = marcheFiltre(etat, memo);
    const sortie = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    const marche = sortie.ordres.filter((o) => o.type === 'MultiStep' && !o.final);
    expect(marche.map((o) => o.unitId)).not.toContain('u_moi_0');
    expect(marche.map((o) => o.unitId)).toContain('u_moi_1');
  });

  it('plafond marcheTaille (data 6) : 8 légions ⇒ 6 MultiStep maximum', async () => {
    const etat = etatCourse({ legionsP1: 8, guerre: true });
    const memo = { finPartie: { mode: 'domination' } };
    const { filtre } = marcheFiltre(etat, memo);
    const sortie = await tourJevJoueur(fauxClient({}), config, filtre, 'p1', memo);
    expect(sortie.ordres.filter((o) => o.type === 'MultiStep' && !o.final).length).toBe(6);
  });

  it('sans théâtre ni capitale connue (forme insuffisante) ⇒ pas de panne, pas de marche', async () => {
    const etat = etatCourse({ legionsP1: 2, guerre: true, visionCap2: false });
    const memo = { finPartie: { mode: 'domination' } };
    const filtre = getFilteredState(etat, 'p1');
    // PAS de filtre.theatre — et cap2 hors vision (déjà le cas).
    const condense = condenseJoueur(filtre, 'p1', memo);
    const sortie = await tourJevJoueur(fauxClient({}), config, { ...filtre, theatre: {} }, 'p1', memo);
    expect(sortie.erreur).toBeNull();
    expect(sortie.ordres.filter((o) => o.type === 'MultiStep' && !o.final)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Non-régression
// ---------------------------------------------------------------------------
describe('v6c · non-régression', () => {
  it('le gate des 4 signaux it4 reste la porte d\'entrée de finPartie', () => {
    const etat = etatCourse({});
    etat.players.p1.cultureMilestones = 12;
    const { questions, condense } = questionsPour(etat, {});
    expect(signalVictoire(condense)).toBe(true);
    expect(questions.finPartie).toBeDefined();
  });

  it('cibleGuerreTotale : rival jamais rencontré ET capitale inconnue ⇒ null sans autorisation aveugle (v6b inchangé)', () => {
    const filtre = getFilteredState(etatCourse({ villesP1: 4, visionCap2: false }), 'p1');
    const condense = condenseJoueur(filtre, 'p1', {});
    expect(cibleGuerreTotale(condense, filtre, 'p1', 1.2, false)).toBeNull();
  });

  it('schemaVersion inchangé : la config v7 n\'introduit AUCUN schéma moteur', () => {
    // La config ne porte que des seuils — rien qui exige schemaVersion 29.
    expect(Object.keys(config)).toEqual(
      expect.arrayContaining(['questions', 'seuils', 'regles', 'score']),
    );
  });
});
