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
 */
export async function jouerPartie({ client, config, seed, plafondTours = 50, journal, budgetUsd = 2, engineJev }) {
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
  });

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
      decision = await tourJev(client, config, filtre, jev);
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
