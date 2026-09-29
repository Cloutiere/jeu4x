/**
 * Scénarios de faisabilité par victoire (HANDOFF-JEV-V4 D4) — 4 injections
 * locales dans l'état moteur (harnais uniquement, HORS LIGNE) pour prouver
 * que pilote/journal/rapport captent chaque type de victoire de bout en bout.
 * Étiquetés 'scenario:victoire', JAMAIS mélangés au banc. Coût API nul :
 * sans Jev (le pilote est le harnais lui-même).
 *
 *   node src/scenarios-victoire.mjs [dossier-sortie]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Journal } from './journal.mjs';
import { jouerPartie } from './partie.mjs';
import config from '../questions.json';

const SHIP = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];

function capitaleDe(etat, pid) {
  return Object.values(etat.cities).find((c) => c.owner === pid && c.capital)
    ?? Object.values(etat.cities).find((c) => c.owner === pid);
}

const LES_QUATRE = {
  economique: {
    etiquette: 'scenario:victoire',
    /** Trésorerie proche de 20 000 + Banque mondiale posable → achevée tour 1
     * (R-137 : la trésorerie est une CONDITION, non débitée). */
    injection(etat, tour) {
      const [p1] = Object.keys(etat.players).sort();
      const cap = capitaleDe(etat, p1);
      if (!cap || tour < 2) return null;
      cap.production = { item: { kind: 'wonder', id: 'banque_mondiale' }, progress: 499 };
      etat.players[p1].treasury = 20000;
      return etat;
    },
    verdicts: ['economique'],
    proprietaireProduction: 'p1',
  },
  scientifique: {
    etiquette: 'scenario:victoire',
    /** Les 4 composants du Vaisseau contrôlés → R-124 victoire science. */
    injection(etat, tour) {
      const [p1] = Object.keys(etat.players).sort();
      const cap = capitaleDe(etat, p1);
      if (!cap || tour < 2) return null;
      for (const c of SHIP) if (!cap.buildings.includes(c)) cap.buildings.push(c);
      return etat;
    },
    verdicts: ['science'],
  },
  culturel: {
    etiquette: 'scenario:victoire',
    /** Nations Unies sur le point d'être achevées → R-116 victoire culturelle. */
    injection(etat, tour) {
      const [p1] = Object.keys(etat.players).sort();
      const cap = capitaleDe(etat, p1);
      if (!cap || tour < 2) return null;
      cap.production = { item: { kind: 'wonder', id: 'nations_unies' }, progress: 499 };
      // R-116 : l'ONU est GELÉE sous 20 jalons culturels — on les accorde.
      etat.players[p1].cultureMilestones = 20;
      return etat;
    },
    verdicts: ['culture'],
    proprietaireProduction: 'p1',
  },
  domination: {
    etiquette: 'scenario:victoire',
    /** Capitale ennemie voisine SANS défenseur + envahisseur injecté adjacent
     * (R-65 : ville sans défenseur investie → capture). */
    injection(etat, tour) {
      const joueurs = Object.keys(etat.players).sort();
      const [p1, p2] = joueurs;
      const cap = capitaleDe(etat, p2);
      if (!cap || tour < 2) return null;
      // la ville assiégée ne produit plus de défenseurs (assiégée = à sec)
      for (const v of Object.values(etat.cities)) if (v.owner === p2) v.production = null;
      for (const [id, u] of Object.entries(etat.units)) {
        if (u.owner === p2) delete etat.units[id];
      }
      const voisins = [
        [cap.q, cap.r - 1], [cap.q - 1, cap.r], [cap.q - 1, cap.r + 1],
        [cap.q, cap.r + 1], [cap.q + 1, cap.r], [cap.q + 1, cap.r - 1],
      ];
      const tuile = voisins.find(([q, r]) => {
        const t = etat.map?.[`${q},${r}`];
        return t && t.terrain !== 'ocean' && t.terrain !== 'montagne';
      });
      if (!tuile) throw new Error('scenario domination : aucune case terrestre voisine de la capitale ennemie');
      etat.units['u_scenario_invadeur'] = {
        id: 'u_scenario_invadeur', owner: p1, type: 'char_d_assaut',
        q: tuile[0], r: tuile[1], hp: 100, mp: 3, fortified: false, aboard: null, veteran: true, isArmy: false, order: null, detainedBy: null, cargo: null,
      };
      // le bot tiendrait l'envahisseur en réserve — on le pilote nous-mêmes
      LES_QUATRE.domination.cibleInjectee = { q: cap.q, r: cap.r };
      return etat;
    },
    verdicts: ['domination', 'razedCapital'],
    proprietaireProduction: 'p2',
    cibleInjectee: null,
    ordresSupplementaires(etat) {
      const c = LES_QUATRE.domination.cibleInjectee;
      if (!c || !etat.units['u_scenario_invadeur']) return [];
      // R-65 : la capture = OCCUPER la case ville (sans défenseur) — pas une attaque.
      return [{ joueur: Object.keys(etat.players).sort()[0], ordre: { type: 'Move', unitId: 'u_scenario_invadeur', path: [{ q: c.q, r: c.r }] } }];
    },
  },
};

/** Joue un scénario (≤ 20 tours, sans Jev — gratuit) et retourne le verdict
 * lu sur l'état final ET sur le journal (événement Victory). */
export async function jouerScenarioVictoire(type, { seed = 2026, dossier = null } = {}) {
  const spec = LES_QUATRE[type];
  if (!spec) throw new Error(`scénario inconnu : ${type}`);
  const chemin = dossier
    ? join(dossier, `scenario-${type}-seed${seed}.jsonl`)
    : join(dirname(fileURLToPath(import.meta.url)), '..', 'journaux', `scenario-${type}-seed${seed}.jsonl`);
  const journal = new Journal(chemin);
  const { etat } = await jouerPartie({
    client: null,
    config,
    seed,
    plafondTours: 20,
    journal,
    sansJev: true,
    scenario: {
      etiquette: spec.etiquette,
      injection: spec.injection,
      proprietaireProduction: spec.proprietaireProduction ?? null,
      unitIdsPilotes: spec === LES_QUATRE.domination ? ['u_scenario_invadeur'] : [],
      ordresSupplementaires: spec.ordresSupplementaires ?? null,
    },
  });
  const lignes = readFileSync(journal.chemin, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const victoire = lignes
    .filter((l) => l.type === 'evenement' && l.evenement.type === 'Victory')
    .map((l) => l.evenement)
    .at(-1) ?? null;
  const victoireCapitale = lignes.some((l) => l.type === 'evenement' && l.evenement.type === 'CityCaptured');
  return {
    type,
    seed,
    gagnant: etat.winner,
    raison: victoire?.reason ?? (victoireCapitale ? 'capturé-sans-événement' : null),
    tours: etat.turn,
    verdictAttendu: spec.verdicts,
    ok: victoire ? spec.verdicts.includes(victoire.reason) : false,
  };
}

/** Mini-rapport : les 4 types atteints, détectés et journalisés ? */
export async function lancerTousScenarios(dossierSortie = null) {
  const dossier = dossierSortie ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'bancs', 'scenarios-victoire');
  mkdirSync(dossier, { recursive: true });
  const resultats = [];
  for (const type of Object.keys(LES_QUATRE)) {
    const r = await jouerScenarioVictoire(type, { dossier });
    resultats.push(r);
    console.log(`scenario ${type} : gagnant ${r.gagnant ?? 'aucun'} (${r.raison ?? '—'}) en ${r.tours} tours — ${r.ok ? 'OK' : 'ÉCHEC'}`);
  }
  const lignes = ['# Mini-rapport — scénarios de faisabilité par victoire (V4 D4)', ''];
  lignes.push('Injections locales dans l\'état moteur (harnais, hors ligne), sans Jev, ≤ 20 tours, étiquetés `scenario:victoire` — jamais mélangés au banc.\n');
  lignes.push('| Type | Gagnant | Type de victoire | Tours | Détecté |');
  lignes.push('|---|---|---|---|---|');
  for (const r of resultats) {
    lignes.push(`| ${r.type} | ${r.gagnant ?? '—'} | ${r.raison ?? '—'} | ${r.tours} | ${r.ok ? 'oui' : '**NON**'} |`);
  }
  writeFileSync(join(dossier, 'RAPPORT.md'), lignes.join('\n') + '\n');
  console.log(`Mini-rapport : ${join(dossier, 'RAPPORT.md')}`);
  return resultats;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  await lancerTousScenarios(process.argv[2] ?? null);
}
