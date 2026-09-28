/**
 * Harnais de partie headless (HANDOFF-JEV-POC L1) — boucle seed → génération
 * → ordres (bot pour tout le monde, overrides Jev pour la nation pilotée) →
 * resolveTurn → victoire/plafond, avec journal JSONL complet.
 * Pur consommateur de @game/rules (aucune modification moteur) et de
 * botPolicy (importé tel quel, exécuté hors serveur).
 */
import {
  applySetGovernment,
  applySetResearch,
  createInitialState,
  createRng,
  generateProceduralMap,
  getFilteredState,
  hexDistance,
  resolveTurn,
} from '@game/rules';
import { botPolicy, botTurnSeed } from '../../apps/server/src/botPolicy.js';
import { fusionnerPlan, tourJev } from './adapter-jev.mjs';

/**
 * Joue une partie complète.
 * @param {object} opts
 * @param {object} opts.client client Jev (SDK réel ou faux client)
 * @param {object} opts.config contenu de questions.json
 * @param {number} opts.seed graine de partie
 * @param {number} [opts.plafondTours=50]
 * @param {object} opts.journal instance Journal
 * @param {number} [opts.budgetUsd=2] plafond D8 — la partie s'achève proprement au-delà
 * @param {string} [opts.engineJev] id moteur de la nation pilotée par Jev (défaut : 2e joueur)
 * @param {object} [opts.scenario] scénario de test (HANDOFF-JEV-QUESTIONS-V2 D3) :
 *   { injectionMenace: true } — injecte une unité ennemie FICTIVE dans le SEUL
 *   condensé Jev (jamais dans l'état moteur). Étiqueté 'scenario:test'.
 */
export async function jouerPartie({ client, config, seed, plafondTours = 50, journal, budgetUsd = 2, engineJev, scenario = null }) {
  const gen = generateProceduralMap(seed);
  let etat = createInitialState(gen.map, seed);
  const joueurs = Object.keys(etat.players).sort();
  const jev = engineJev ?? joueurs[1];
  const bots = joueurs.filter((id) => id !== jev);

  journal.meta({
    seed,
    carte: { largeur: etat.mapWidth, hauteur: etat.mapHeight, placement: 'mirror1v1' },
    joueurs: joueurs.map((id) => ({ id, civId: etat.players[id].civId, pilote: id === jev ? 'jev' : 'bot' })),
    plafondTours,
    budgetUsd,
    scenario: scenario ? 'scenario:test' : null,
  });

  const memo = {}; // mémoire inter-tours Jev (tenue de la recherche, D2)
  let coupeParBudget = false;
  let erreurJev = 0;

  while (etat.winner === null && etat.turn <= plafondTours) {
    const tour = etat.turn;
    journal.tour(tour);

    const ordres = {};
    const actionsAppliquees = [];

    // 1. Plan bot de base pour TOUT le monde (Jev inclus — l'override Jev ne
    //    fait que remplacer des ordres par domaine ; un refus moteur retombe
    //    sur le plan bot, cf. adapter).
    for (const id of joueurs) {
      if (etat.players[id]?.defeated) continue;
      const rng = createRng(botTurnSeed(seed, tour, id));
      const plan = botPolicy(etat, id, rng);
      ordres[id] = plan.orders;
      for (const action of plan.actions) actionsAppliquees.push({ id, action });
    }

    // 2. Décision Jev (1 appel/tour, sur l'état FILTRÉ fog).
    let decision = null;
    if (!etat.players[jev]?.defeated) {
      const filtre = getFilteredState(etat, jev);
      // D3 · scénario contact : unité ennemie FICTIVE dans le condensé SEULEMENT
      // (l'état moteur n'est jamais touché — l'outil reste hors ligne).
      if (scenario?.injectionMenace) injecterMenace(filtre, jev);
      decision = await tourJev(client, config, filtre, jev, memo);
      if (decision.erreur) erreurJev += 1;
      // Ordres : les overrides Jev remplacent les ordres bot de même sujet.
      // Actions : appliquées APRÈS celles du bot (dernier mot à Jev).
      ordres[jev] = fusionnerPlan(ordres[jev] ?? [], decision.ordres, [], []).ordres;
      for (const action of decision.actions) actionsAppliquees.push({ id: jev, action });
      journal.decision({
        tour,
        condense: decision.condense,
        questions: decision.questions,
        reponses: decision.reponses,
        repli: decision.repli,
        plate: decision.plate,
        ordresJev: decision.ordres,
        actionsJev: decision.actions,
        latenceMs: decision.latenceMs,
        jetonsEntree: decision.jetonsEntree,
        coutUsd: (decision.jetonsEntree ?? 0) * 0.042 / 1_000_000,
        erreur: decision.erreur,
        scenarioTest: scenario?.injectionMenace ? true : undefined,
      });
      if (journal.budgetDepasse(budgetUsd)) {
        coupeParBudget = true;
        break;
      }
    }

    // 3. Actions immédiates (recherche/régime) via les helpers purs du moteur.
    for (const { id, action } of actionsAppliquees) {
      if (action.type === 'SetResearch') {
        const r = applySetResearch(etat, id, action.techId);
        if (r.ok) etat = r.state;
        else journal.ligne({ type: 'rejet_action', tour, joueur: id, action, raison: r.error ?? 'refus' });
      } else {
        const r = applySetGovernment(etat, id, action.government);
        if (r.ok) etat = r.state;
        else journal.ligne({ type: 'rejet_action', tour, joueur: id, action, raison: r.error ?? 'refus' });
      }
    }

    // 4. Résolution du tour (moteur — revalide tout). Le motif complet est
    //    journalisé : rejouer les mêmes ordres/actions reproduit la même fin.
    journal.ligne({
      type: 'motif',
      tour,
      ordres,
      actions: actionsAppliquees.map(({ id, action }) => ({ id, action })),
      rngSeed: etat.rngSeed,
    });
    const resultat = resolveTurn(etat, ordres, etat.rngSeed);
    const rejets = compterRejets(decision, etat, resultat);
    if (rejets.length > 0) {
      journal.ligne({ type: 'rejets', tour, details: rejets });
      journal.ordresRejetes += rejets.length;
    }
    for (const ev of resultat.events) journal.evenement(ev);
    etat = resultat.newState;
  }

  journal.fin({
    gagnant: etat.winner,
    toursJoues: etat.turn,
    coupeParBudget,
    erreursJev: erreurJev,
    nationJev: jev,
  });
  return { etat, jev, coupeParBudget };
}

/** D3 · Injection de test (harnais uniquement, jamais le moteur) : place une
 * unité ennemie fictive (guerrier, owner 'test') à 2-3 cases de la capitale
 * de la nation Jev, sur une case explorée et libre. Le condensé la voit donc
 * comme un ennemi visible ; le moteur, lui, n'en sait RIEN. */
export function injecterMenace(filtre, moi) {
  const villesMoi = Object.values(filtre.cities ?? {}).filter((v) => v.owner === moi);
  const ancre = villesMoi.find((v) => v.capital) ?? villesMoi[0]
    ?? Object.values(filtre.units ?? {}).find((u) => u.owner === moi && !u.aboard);
  if (!ancre) return false;
  const occupees = new Set(
    Object.values(filtre.units ?? {}).filter((u) => !u.aboard).map((u) => `${u.q},${u.r}`),
  );
  for (let dist = 2; dist <= 3; dist++) {
    for (let dq = -dist; dq <= dist; dq++) {
      const rMin = Math.max(-dist, -dq - dist);
      const rMax = Math.min(dist, -dq + dist);
      for (let dr = rMin; dr <= rMax; dr++) {
        const cle = `${ancre.q + dq},${ancre.r + dr}`;
        const tuile = filtre.map?.[cle];
        if (!tuile || tuile.terrain === 'ocean' || tuile.terrain === 'eau' || tuile.terrain === 'montagne') continue;
        if (occupees.has(cle)) continue;
        filtre.units[`u_test_menace`] = {
          id: 'u_test_menace',
          owner: 'test',
          type: 'guerrier',
          q: ancre.q + dq,
          r: ancre.r + dr,
          hp: 100,
          mp: 0,
          fortified: false,
          aboard: false,
        };
        return true;
      }
    }
  }
  return false;
}

/** D3 · Cherche des seeds mirror1v1 à spawns proches (contact forcé).
 * Retourne les `n` premières seeds ≥ départ dont la distance entre spawns est
 * ≤ distanceMax — la sélection vit ICI, jamais dans le moteur. */
export function trouverSeedsContact({ n = 2, depart = 1, distanceMax = 12, plafond = 5000 }) {
  const seeds = [];
  for (let s = depart; s < depart + plafond && seeds.length < n; s++) {
    const spawns = generateProceduralMap(s).map.spawns;
    if (spawns.length < 2) continue;
    const d = hexDistance(spawns[0].capital, spawns[1].capital);
    if (d <= distanceMax) seeds.push({ seed: s, distanceCapitales: d });
  }
  return seeds;
}

/** Vérifie, pour chaque ordre traduit de Jev, si le moteur l'a exécuté —
 * un ordre soumis sans effet visible = rejeté (métrique clé du POC). */
export function compterRejets(decision, etatAvant, resultat) {
  if (!decision || decision.repli) return [];
  const rejets = [];
  const apres = resultat.newState;
  const evenements = resultat.events ?? [];
  const evUnit = (id, types) => evenements.filter((e) => types.includes(e.type) && (e.unitId === id || e.attackerId === id));
  for (const attente of decision.attentes ?? []) {
    switch (attente.genre) {
      case 'mouvement': {
        const u = apres.units?.[attente.unitId];
        if (u && `${u.q},${u.r}` !== attente.attendu && evUnit(attente.unitId, ['Move']).length === 0) {
          rejets.push(attente);
        }
        break;
      }
      case 'fondation': {
        const fondee = evenements.some((e) => e.type === 'CityFounded' && e.byUnitId === attente.unitId);
        const u = apres.units?.[attente.unitId];
        if (!fondee && u && (u.type === 'colon' || u.type.includes('colon'))) {
          rejets.push(attente);
        }
        break;
      }
      case 'attaque': {
        if (evUnit(attente.unitId, ['Attack', 'CombatExchange']).length === 0) rejets.push(attente);
        break;
      }
      case 'production': {
        const v = apres.cities?.[attente.cityId];
        const courant = v?.production ? `${v.production.item.kind}:${v.production.item.id}` : null;
        const [kind, id] = attente.item.split(':');
        // Exécuté si la file porte encore l'item OU si l'item a été produit
        // dans le tour (la file avance alors sur le suivant).
        const produit = evenements.some(
          (e) =>
            (e.type === 'UnitProduced' && e.cityId === attente.cityId && kind === 'unit' && e.unitType === id) ||
            (e.type === 'BuildingBuilt' && e.cityId === attente.cityId && kind === 'building' && e.buildingId === id),
        );
        if (courant !== attente.item && !produit) rejets.push(attente);
        break;
      }
      case 'recherche': {
        // Validée au moment de l'application (applySetResearch → rejet_action).
        break;
      }
      case 'fortifier': {
        const u = apres.units?.[attente.unitId];
        if (u && !u.fortified) rejets.push(attente);
        break;
      }
      default:
        break;
    }
  }
  return rejets;
}
