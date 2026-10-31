/**
 * JEV-BANC-JOUEUR (décisions Erik 28/10, D1/D2) — « Jev JOUEUR » : en 1v1
 * contre le bot standard, Jev décide UNE FOIS PAR TOUR les orientations
 * STRATÉGIQUES (recherche tenue, conversion or/science, production de la
 * capitale, diplomatie T2 guerre/paix/échange) ; le bot standard exécute
 * tout le TACTIQUE (marche, combats, garnisons, travail des tuiles,
 * fondations). Même pipeline que le banc : condensé pré-calculé (zéro
 * arithmétique chez Jev), formes canon traduites puis revalidées par le
 * moteur, repli bot pur sur erreur/indécision, budget compté par appel.
 *
 * Le condensé exposé ici respecte la PRIVACITÉ canon : puissance ennemie
 * VISIBLE seulement (fog), techs des rivaux visibles (canon T2 — l'UI de
 * négociation les expose), trésorerie ennemie JAMAIS (R-134).
 */
import {
  BOT_SETTINGS,
  agressiviteDe,
  allKnownTechs,
  canSetProduction,
  cityEconomyInputs,
  hexDistance,
  TECHS,
  UNIT_TYPES,
  BUILDINGS,
  WONDERS,
} from '@game/rules';
import { condenserEtat, gainNetSite, sitesFondation, COMPOSANTS_VAISSEAU } from './condense.mjs';
import { pasVersRoutier } from '../../apps/server/src/botPolicy.js';

/** Civs / barbare exclus — seuls les vrais joueurs sont des partenaires. */
function rivalsReels(etatFiltre, moi) {
  return Object.entries(etatFiltre.players ?? {})
    .filter(([id, p]) => id !== moi && id !== 'barbarien' && !p.defeated)
    .map(([id, p]) => ({ id, p }));
}

function atWarAvec(etatFiltre, moi) {
  const war = etatFiltre.diplomacy?.war ?? [];
  return war.some(([a, b]) => a === moi || b === moi);
}

function ennemisDeMoi(etatFiltre, moi) {
  const war = etatFiltre.diplomacy?.war ?? [];
  const out = [];
  for (const [a, b] of war) {
    if (a === moi && etatFiltre.players[b]) out.push(b);
    else if (b === moi && etatFiltre.players[a]) out.push(a);
  }
  return out.sort();
}

/**
 * JEV-CONTACT-GUERRE D1 (décisions Erik 29/10) — état de RENCONTRE construit
 * à partir de la vision : un rival est « rencontré » dès qu'une de ses unités
 * ou villes figure dans l'état FILTRÉ (fog) au moins une fois. La PREMIÈRE
 * rencontre tient (memo inter-tours du harnais) ; les barbares ne comptent
 * pas (rivalsReels). Retourne le memo pour lisibilité. */
export function majRencontres(etatFiltre, moi, memo = {}) {
  memo.rencontres = memo.rencontres ?? {};
  const tour = etatFiltre.turn ?? 0;
  const vus = new Set();
  for (const u of Object.values(etatFiltre.units ?? {})) {
    if (u.owner !== moi && u.owner !== 'barbarien' && !u.aboard) vus.add(u.owner);
  }
  for (const v of Object.values(etatFiltre.cities ?? {})) {
    if (v.owner !== moi && v.owner !== 'barbarien') vus.add(v.owner);
  }
  for (const id of vus) {
    if (memo.rencontres[id] == null) memo.rencontres[id] = tour;
  }
  return memo;
}

/** Provocations visibles d'un rival : ses unités dans le rayon de menace de
 * NOS villes (miroir RAYON_MENACE du condensé — données honnêtes sous fog). */
function provocationsDe(etatFiltre, moi, rival) {
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  return Object.values(etatFiltre.units ?? {}).filter(
    (u) => u.owner === rival && !u.aboard
      && mesVilles.some((v) => hexDistance(u, v) <= 5),
  ).length;
}

function dureeEtBatailles(etatFiltre, moi, ennemi) {
  const depuis = etatFiltre.diplomacy?.warsDepuis?.[[moi, ennemi].sort().join('|')] ?? etatFiltre.turn;
  const batailles = etatFiltre.diplomacy?.batailles?.[[moi, ennemi].sort().join('|')] ?? 0;
  return { toursDeGuerre: Math.max(0, etatFiltre.turn - depuis), batailles };
}

/** Forces visibles d'un joueur (fog respecté — miroir condense.puissance). */
function forcesVisibles(etatFiltre, pid) {
  return Object.values(etatFiltre.units ?? {})
    .filter((u) => u.owner === pid && !u.aboard)
    .reduce((s, u) => s + (UNIT_TYPES[u.type]?.attack ?? 0), 0);
}

/** Distance entre capitales connues (99 si inconnue — fog respecté). */
function distanceCapitales(etatFiltre, a, b) {
  const ca = Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === a && v.capital)
    ?? Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === a);
  const cb = Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === b && v.capital)
    ?? Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === b);
  if (!ca || !cb) return 99;
  // Hex distance locale (le wrap est ignoré — approximation honnête du
  // condensé, cohérente avec le reste du banc 40×40).
  const dq = cb.q - ca.q;
  const dr = cb.r - ca.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Bloc DIPLOMATIE du condensé joueur (canon T2 : techs des rivaux visibles,
 * trésorerie ennemie jamais — R-134 ; puissance visible seulement).
 * L2 v2 : rapportForces EXPLICITE par rival (nos forces visibles / les siennes,
 * arrondi à 0,1 — l'argument de la guerre argumentée).
 * v5 CONTACT-GUERRE D1/D2 : arc de la relation — rencontreTour (première vue),
 * toursDepuisRencontre, provocations (unités hostiles près de nos villes). */
export function blocDiplomatie(etatFiltre, moi, memo = {}) {
  const maPuissance = forcesVisibles(etatFiltre, moi);
  const rencontres = memo?.rencontres ?? {};
  const rivaux = rivalsReels(etatFiltre, moi).map(({ id, p }) => {
    const rencontreTour = rencontres[id] ?? null;
    return {
    id,
    civ: p.civId,
    era: p.era ?? null,
    techsConnues: p.techsUnlocked?.length ?? 0,
    techs: [...(p.techsUnlocked ?? [])].sort(),
    forces: forcesVisibles(etatFiltre, id),
    rapportForces: Math.round((maPuissance / Math.max(1, forcesVisibles(etatFiltre, id))) * 10) / 10,
    enGuerre: ennemisDeMoi(etatFiltre, moi).includes(id),
    distanceCapitale: distanceCapitales(etatFiltre, moi, id),
    rencontreTour,
    toursDepuisRencontre: rencontreTour == null ? null : Math.max(0, (etatFiltre.turn ?? 0) - rencontreTour),
    provocations: provocationsDe(etatFiltre, moi, id),
    };
  });
  const ennemis = ennemisDeMoi(etatFiltre, moi).map((id) => ({
    id,
    ...(dureeEtBatailles(etatFiltre, moi, id)),
  }));
  return { guerreAvec: ennemisDeMoi(etatFiltre, moi), ennemis, rivaux };
}

/** Condensé joueur = condensé du banc + bloc diplomatie (memo v5 : arc de
 * rencontre par rival). */
export function condenseJoueur(etatFiltre, moi, memo = {}) {
  const condense = condenserEtat(etatFiltre, moi);
  condense.diplomatie = blocDiplomatie(etatFiltre, moi, memo);
  return condense;
}

/** Description lisible d'un critère dynamique de production (miroir
 * adapter-jev.descriptionCle — littéral strict, directive n°1). */
function descriptionProduction(c) {
  const genre = c.colon ? 'un colon (fonde une ville)' : c.attaque > 0 ? 'une unité de combat' : 'un bâtiment';
  return `${genre} — coût ${c.cout} marteaux, environ ${c.toursEst} tour(s) de production`;
}

/** JEV-EXPANSION D2 — chemin vers un site : pas ROUTIER BFS (pasVersRoutier,
 * canon BOT-ARMEE — le pas glouton se colle aux obstacles et meurt dans les
 * poches), re-planifié chaque tour. Le fog est respecté : le BFS vit sur
 * l'état FILTRÉ (tuiles inconnues = intransitables, le moteur gèle le chemin
 * à la frontière et le harnais re-planifie au tour suivant). */
function cheminVers(etatFiltre, moi, colon, cible, maxPas = 10) {
  const chemin = [];
  let curseur = { q: colon.q, r: colon.r, type: colon.type };
  for (let i = 0; i < maxPas; i++) {
    const pas = pasVersRoutier(curseur, etatFiltre, cible);
    if (!pas) break;
    chemin.push(pas);
    curseur = { q: pas.q, r: pas.r, type: colon.type };
    if (pas.q === cible.q && pas.r === cible.r) break;
  }
  return chemin;
}

/** JEV-EXPANSION D2 — meilleur colon productible (tech débloquée, hors GP,
 * le moins cher — miroir adapter-jev.colonProductible). */
function colonProductible(techsUnlocked) {
  return Object.values(UNIT_TYPES)
    .filter((t) => t.canFoundCity && (t.tech == null || techsUnlocked.includes(t.tech)))
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0] ?? null;
}

/** JEV-EXPANSION D1 — candidats de sites de fondation, pré-triés par le
 * harnais (score moteur existant : gainNet de condense.mjs, JAMAIS une
 * nouvelle formule), filtrés par les cases en liste noire (fondations
 * rejetées — partie.mjs) et par la rentabilité (gainNet > 0 — doctrine v3 :
 * fonder un site non rentable n'est pas une décision). JUSQU'À 3 sites.
 * Sans colon encore produit, les distances sont calées sur la capitale
 * (ancre — même formule). */
export function candidatsFondation(etatFiltre, moi, memo = {}) {
  const colonne = Object.values(etatFiltre.units ?? {}).find(
    (u) => u.owner === moi && UNIT_TYPES[u.type]?.canFoundCity && !u.aboard,
  );
  const capitale =
    Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi && v.capital)
    ?? Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi)
    ?? null;
  if (!colonne && !capitale) return [];
  const echouees = memo.casesFondationEchouees ?? new Set();
  return sitesFondation(etatFiltre, moi, colonne ? null : capitale)
    .map((s) => ({ ...s, gainNet: s.gainNet ?? gainNetSite(etatFiltre, moi, s) }))
    .filter((s) => s.gainNet > 0)
    .filter((s) => !echouees.has(s.case))
    .sort((a, b) => b.gainNet - a.gainNet || a.distance - b.distance || a.case.localeCompare(b.case))
    .slice(0, 3)
    .map((s) => ({ ...s, colonPresent: !!colonne, distanceColon: colonne ? hexDistance(colonne, s) : null }));
}


/**
 * Construit les questions SDK du tour : SEULEMENT les décisions décidables
 * (critères non vides — directive n°3). `criteres` documente la signification
 * de chaque clé pour la traduction. Questions diplomatiques multi-critères
 * portent toujours un critère 'aucun'.
 */
export function construireQuestionsJoueur(config, condense, etatFiltre, moi, memo = {}) {
  const q = {};
  const meta = {};
  const seuils = config.seuils;
  const me = etatFiltre.players?.[moi];
  const techs = me?.techsUnlocked ?? [];
    const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  const capitale = mesVilles.find((v) => v.capital) ?? mesVilles[0] ?? null;
  const rivaux = condense.diplomatie.rivaux ?? [];
  const ennemis = condense.diplomatie.guerreAvec ?? [];
  const enGuerre = ennemis.length > 0;
  const tenueIncomplete = memo.techRecherche && !techs.includes(memo.techRecherche);

  // Produire (orientation capitale) — toujours proposée s'il y a une capitale.
  if (capitale && (condense.candidats.productionCapitale ?? []).length > 0) {
    const criteria = Object.fromEntries(
      condense.candidats.productionCapitale.map((c) => [c.cle, descriptionProduction(c)]),
    );
    criteria['aucun'] = 'Laisser le bot arbitrer la production ce tour.';
    q.produire = { instructions: config.questions.produire.instructions, criteria, type: 'choice' };
    meta.produire = { genre: 'produire' };
  }

  // Fonder (JEV-EXPANSION D1 — argumentée, miroir de la guerre v2) : JUSQU'À
  // 3 sites pré-triés par le score moteur (gainNet), décision OUI/NON par
  // site ou 'aucun'. Cadence D3 : pas plus d'UNE fondation programmée à la
  // fois — la question est absente tant qu'une fondation est en cours.
  if (!memo.fondationEnCours) {
    const sites = candidatsFondation(etatFiltre, moi, memo);
    if (sites.length > 0) {
      const criteria = { aucun: 'NON — ne pas fonder ce tour (aucune ville de plus).' };
      for (const s of sites) {
        const ou = s.colonPresent ? `colon à ${s.distanceColon} case(s)` : 'pas encore de colon — il sera produit puis marchera (MultiStep)';
        criteria[`fonder:${s.case}`] = `OUI — fonder une ville sur la case ${s.case} : score ${s.gainNet} rendements/tour estimés une fois peuplée (valeur du site ${s.valeurSite}), distance ${s.distance} case(s) — ${ou}.`;
      }
      q.fonder = { instructions: config.questions.fonder.instructions, criteria, type: 'choice' };
      meta.fonder = { genre: 'fonder', sites: sites.map((s) => s.case) };
    }
  }

  // Rechercher — omise tant qu'une tech tenue est en cours (le harnais
  // ré-émet SetResearch lui-même, canon v2 D2).
  if (!tenueIncomplete && (condense.empire.recherche?.candidates ?? []).length > 0) {
    const criteria = Object.fromEntries(
      condense.empire.recherche.candidates.map((t) => [t.id, `Technologie — coût ${t.cout} fioles`]),
    );
    q.rechercher = { instructions: config.questions.rechercher.instructions, criteria, type: 'choice' };
    meta.rechercher = { genre: 'rechercher' };
  }

  // Convertir (L1 v2 — critères plats) : une ville n'est proposée vers la
  // SCIENCE que si sa science/tour est SOUS le seuil (le goulot de
  // l'empire) ; une ville déjà en science au-dessus du seuil peut repasser
  // en OR (trésorerie — rush, compensations de paix). Plafonné à 6 villes.
  if (mesVilles.length > 0) {
    const criteria = { aucun: 'Ne rien changer ce tour.' };
    const seuilScience = seuils.conversionScienceMin ?? 2;
    let techsTour = null;
    try { techsTour = allKnownTechs(etatFiltre); } catch { techsTour = techs; }
    for (const v of mesVilles.slice(0, 6)) {
      const actuelle = v.conversion === 'science' ? 'science' : 'or';
      let scienceVille = 0;
      try { scienceVille = Math.round((cityEconomyInputs(etatFiltre, v, techsTour).science ?? 0) * 10) / 10; } catch { scienceVille = 0; }
      if (actuelle !== 'science' && scienceVille < seuilScience) {
        criteria[`science:${v.id}`] = `Orienter ${v.capitale ? 'la capitale' : 'la ville'} ${v.id} (${v.pop} pop, science ${scienceVille}/tour — SOUS le seuil de ${seuilScience}) vers la SCIENCE : la recherche est le goulot de l'empire.`;
      } else if (actuelle !== 'or' && scienceVille >= seuilScience) {
        criteria[`or:${v.id}`] = `Orienter ${v.capitale ? 'la capitale' : 'la ville'} ${v.id} (${v.pop} pop, science ${scienceVille}/tour — déjà au-dessus du seuil) vers l'OR : trésorerie pour les rushs et les compensations de paix.`;
      }
    }
    if (Object.keys(criteria).length > 1) {
      q.convertir = { instructions: config.questions.convertir.instructions, criteria, type: 'choice' };
      meta.convertir = { genre: 'convertir' };
    }
  }

  // Guerre (L2 v2 — argumentée ; v5 CONTACT-GUERRE D1/D2) : UNE cible pré-triée
  // (le voisin le plus faible) PARMI les rivaux RENCONTRÉS dont le délai
  // minimal de coexistence est écoulé — pas de guerre dans le brouillard, la
  // guerre est l'aboutissement d'un arc relationnel. Critères : rapport de
  // forces explicite + âge de la relation + provocations.
  if (!enGuerre && rivaux.length > 0) {
    const delai = seuils.delaiGuerreApresRencontre ?? 10;
    const eligibles = rivaux.filter(
      (r) => r.rencontreTour != null && (condense.tour - r.rencontreTour) >= delai,
    );
    if (eligibles.length > 0) {
      const cible = [...eligibles].sort(
        (a, b) => a.forces - b.forces || a.distanceCapitale - b.distanceCapitale || a.techsConnues - b.techsConnues,
      )[0];
      const provocation = cible.provocations > 0
        ? `provocations : ${cible.provocations} unité(s) hostile(s) près de nos villes`
        : 'provocations : aucune';
      const criteria = {};
      criteria[`guerre:${cible.id}`] = `OUI — déclarer la guerre à ${cible.civ} (${cible.id}), le voisin le PLUS FAIBLE : nos forces ${condense.monde.puissance.amie} vs les siennes ${cible.forces} (rapport ${cible.rapportForces}× en notre faveur), ère ${cible.era ?? '?'}, ${cible.techsConnues} techs, capitale à ${cible.distanceCapitale} cases. Relation : rencontré depuis ${condense.tour - cible.rencontreTour} tours (premier contact au tour ${cible.rencontreTour}), ${provocation}. Déclarer lance la campagne : le bot assemble l'armée et marche.`;
      criteria['aucun'] = 'NON — ne pas déclarer cette guerre ce tour (bloque aussi toute déclaration du bot pour nous).';
      q.guerre = { instructions: config.questions.guerre.instructions, criteria, type: 'choice' };
      meta.guerre = { genre: 'guerre', cible: cible.id };
    }
  }

  // Paix + compensation (L3 v2 — au juste prix) : fourchette d'or SUGGÉRÉE,
  // miroir du prix indicatif T2 (prixPaixBase × fierté × rapport de forces
  // borné, données negociation de bot.json), plafonnée à la trésorerie.
  if (enGuerre) {
    const criteria = { aucun: 'Refuser toute paix ce tour (les propositions ennemies sont rejetées).' };
    for (const e of condense.diplomatie.ennemis) {
      const r = rivaux.find((x) => x.id === e.id);
      criteria[`paix:${e.id}`] = `Faire la paix avec ${r?.civ ?? e.id} — guerre de ${e.toursDeGuerre} tours, ${e.batailles} bataille(s), forces visibles ${r?.forces ?? '?'} vs nos ${condense.monde.puissance.amie}.`;
    }
    q.paix = { instructions: config.questions.paix.instructions, criteria, type: 'choice' };
    meta.paix = { genre: 'paix' };
    const negoc = BOT_SETTINGS?.negociation ?? { prixPaixBase: 15, facteurFierte: 1, plancherRapportForces: 0.5, plafondRapportForces: 2 };
    const e0 = condense.diplomatie.ennemis[0];
    const r0 = rivaux.find((x) => x.id === e0?.id);
    const treso = me?.treasury ?? 0;
    const fourchette = prixPaixSuggere(negoc, agressiviteDe(etatFiltre.players?.[e0?.id]?.civId), r0?.rapportForces ?? 1, treso);
    const critComp = { 'or:0': 'Paix sèche — aucun or (risque : refus sec).' };
    for (const montant of fourchette) {
      let nuance = '';
      if (montant === fourchette[1]) nuance = ' (PRIX INDICATIF — ce que l\'ennemi exige probablement)';
      else if (montant === fourchette[fourchette.length - 1]) nuance = ' (généreux — maximise l\'acceptation)';
      critComp[`or:${montant}`] = `Offrir ${montant} or${nuance} avec la proposition de paix.`;
    }
    q.compensation = { instructions: config.questions.compensation.instructions, criteria: critComp, type: 'choice' };
    meta.compensation = { genre: 'compensation', fourchette };
  }

  // Échange de techs (canon : JAMAIS en guerre) — techs Offertes (les nôtres
  // inconnues du rival) et Demandées (les siennes que nous ignorons), triées
  // par coût ; les paires DÉJÀ refusées ne sont pas re-proposées (mémo).
  if (!enGuerre && rivaux.length > 0) {
    const refus = memo.echangesRefuses ?? new Set();
    const r0 = rivaux[0];
    const offertes = techs
      .filter((t) => !r0.techs.includes(t) && !refus.has(`${t}>`))
      .map((t) => ({ id: t, cout: TECHS[t]?.cost ?? 0 }))
      .sort((a, b) => b.cout - a.cout || a.id.localeCompare(b.id))
      .slice(0, 5);
    const demandees = r0.techs
      .filter((t) => !techs.includes(t) && !refus.has(`>${t}`))
      .map((t) => ({ id: t, cout: TECHS[t]?.cost ?? 0 }))
      .sort((a, b) => a.cout - b.cout || a.id.localeCompare(b.id))
      .slice(0, 5);
    if (offertes.length > 0) {
      const criteria = { aucun: 'Ne proposer aucun échange ce tour.' };
      for (const t of offertes) criteria[`off:${t.id}`] = `Offrir ${t.id} (coût ${t.cout} fioles) à ${r0.civ}.`;
      q.techOfferte = { instructions: config.questions.techOfferte.instructions, criteria, type: 'choice' };
      meta.techOfferte = { genre: 'techOfferte' };
    }
    if (offertes.length > 0 && demandees.length > 0) {
      const criteria = { aucun: 'Aucune contrepartie (annule l’échange).' };
      for (const t of demandees) criteria[`dem:${t.id}`] = `Demander ${t.id} (coût ${t.cout} fioles) en échange.`;
      q.techDemandee = { instructions: config.questions.techDemandee.instructions, criteria, type: 'choice' };
      meta.techDemandee = { genre: 'techDemandee' };
    }
  }

  // JEV-IT4 · D2/D3 — questions de FIN DE PARTIE, gate de bruit : posées
  // SEULEMENT si le bloc victoire montre un signal (jalons ≥ 10 chez
  // quelqu'un, ≥ 2 composants, merveille de victoire en chantier, ou guerre
  // contre moi). Partie calme = prompt inchangé (non-régression v4).
  // JEV-IT4B · D-B — 5e signal permis par Erik (les 3 parties stériles ne
  // satisfont AUCUN critère it4 : domination 10-40× muette) : la domination
  // MÉCANIQUE (rapport ≥ 2 ET ≥ 3 villes de plus que le leader) ouvre le gate.
  const dominationMecanique = signalDominationMechanique(condense, etatFiltre, moi);
  const signal = signalVictoire(condense) || dominationMecanique;
  if (signal) {
    // D2.1 — finPartie : que faire de la course ? cibles pré-triées :
    // leader de domination = rival vivant au PLUS de villes ; leader de
    // course = rival le plus proche d'un seuil (jalons puis composants).
    const rivauxV = condense.victoire.rivaux ?? [];
    const villesParRival = rivauxV
      .map((r) => ({ id: r.id, civ: r.civ, villes: Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === r.id).length }))
      .sort((a, b) => b.villes - a.villes || a.id.localeCompare(b.id));
    const leaderDomination = villesParRival[0] ?? null;
    const leaderCourse = [...rivauxV].sort(
      (a, b) => (b.jalons + 100 * b.composants) - (a.jalons + 100 * a.composants) || a.id.localeCompare(b.id),
    )[0] ?? null;
    const moiV = condense.victoire.mien ?? {};
    // D4 — la domination reste la voie principale : viserMaVictoire
    // non-domination n'est offert que si la domination est BLOQUÉE ou trop
    // coûteuse (ratio de forces < 1, ou capitaux adverses introuvables).
    const dominationBloquee =
      (condense.monde.puissance?.rapport ?? 0) < 1 ||
      (condense.diplomatie?.rivaux ?? []).every((r) => r.distanceCapitale == null || r.distanceCapitale >= 99);
    const criteria = { continuer: 'Rien de spécial — poursuivre le plan courant (expansion + conquête).' };
    if (leaderDomination && leaderDomination.id && leaderDomination.villes > 0) {
      criteria[`pousserCapitale:${leaderDomination.id}`] = `Concentrer l'effort offensif sur la CAPITALE de ${leaderDomination.civ} (leader en villes : ${leaderDomination.villes}) — produire du militaire et marcher vers sa capitale.`;
    }
    if (leaderCourse && (leaderCourse.jalons > moiV.jalons || leaderCourse.composants > moiV.composants)) {
      criteria[`contrerCourse:${leaderCourse.id}`] = `CONTRER la course de ${leaderCourse.civ} : ${leaderCourse.jalons}/20 jalons, ${leaderCourse.composants}/4 composants, merveilles de victoire en chantier ${JSON.stringify(leaderCourse.merveillesEnChantier)} — il mène vers une victoire non-domination.`;
    }
    criteria['viserMaVictoire:domination'] = 'VISER MA victoire par domination (voie principale) : tout à l\u2019effort de conquête.';
    // JEV-IT4B · D-A — le levier du verdict Erik (3 parties stériles :
    // domination 10-40× sans JAMAIS déclarer) : quand le MODE COURANT est
    // déjà la domination (ou la poussée de capitale) et que le rapport de
    // forces est favorable (≥ guerreTotaleRapportMin, data v6), la
    // DÉCLARATION elle-même devient un choix de finPartie — vers une cible
    // PRÉ-QUALIFIÉE (leader en villes, capitale connue, pas déjà en guerre
    // avec elle). Acte PONCTUEL : jamais un mode persisté.
    const modeFin = memo.finPartie?.mode;
    if (modeFin === 'domination' || modeFin === 'pousserCapitale') {
      const cibleGT = cibleGuerreTotale(condense, etatFiltre, moi, seuils.guerreTotaleRapportMin ?? 1.2, dominationMecanique);
      if (cibleGT) {
        criteria[`guerreTotale:${cibleGT.id}`] = cibleGT.aveugle
          ? `DÉCLARER la guerre TOTALE à ${cibleGT.civ} (${cibleGT.id}), le rival en lice (JAMAIS rencontré — sa position est inconnue, mais sa nation est publique au lobby) : nos forces ${condense.monde.puissance.amie} vs les siennes visibles ${cibleGT.forces} (rapport ${cibleGT.rapportForces}×). C'est l'ACTE qui ouvre la voie de domination : sans déclaration, pas de conquête — et donc aucune victoire — possible.`
          : `DÉCLARER la guerre TOTALE à ${cibleGT.civ} (${cibleGT.id}), leader en villes (${cibleGT.villes}) : nos forces ${condense.monde.puissance.amie} vs les siennes ${cibleGT.forces} (rapport ${cibleGT.rapportForces}× en notre faveur), capitale à ${cibleGT.distanceCapitale} cases. C'est l'ACTE qui ouvre la voie de domination : sans déclaration, pas de conquête possible.`;
      }
    }
    if (dominationBloquee) {
      criteria['viserMaVictoire:culture'] = `Viser MA victoire CULTURELLE (${moiV.jalons}/20 jalons) — la domination est bloquée ou trop coûteuse (rapport de forces ${(condense.monde.puissance?.rapport ?? 0)}×).`;
      criteria['viserMaVictoire:science'] = `Viser MA victoire SCIENTIFIQUE (${moiV.composants}/4 composants) — la domination est bloquée ou trop coûteuse.`;
      criteria['viserMaVictoire:economique'] = `Viser MA victoire ÉCONOMIQUE (${condense.empire?.or ?? 0}/20000 or) — la domination est bloquée ou trop coûteuse.`;
    }
    q.finPartie = { instructions: config.questions.finPartie.instructions, criteria, type: 'choice' };
    meta.finPartie = { genre: 'finPartie', signal: true };

    // D2.3 — protegerCapitale : je suis en guerre ET des unités hostiles
    // rôdent près de mes villes (menaces du condensé).
    if (enGuerre && (condense.menaces ?? []).length > 0 && capitale) {
      const criteriaP = {
        aucun: 'Ne rien changer à la défense ce tour.',
        proteger: `PRIORITÉ DÉFENSE — fortifier les unités autour de ${capitale.capitale ? 'la capitale' : 'la ville'} ${capitale.id} (${condense.menaces.length} unité(s) hostile(s) à proximité).`,
      };
      q.protegerCapitale = { instructions: config.questions.protegerCapitale.instructions, criteria: criteriaP, type: 'choice' };
      meta.protegerCapitale = { genre: 'protegerCapitale' };
    }
  }
  // D2.2 — productionVictoire : SEULEMENT si Jev a VISÉ sa victoire
  // culture/science au tour précédent (memo.finPartie) et qu'un item de
  // victoire est productible dans la capitale.
  const mode = memo.finPartie?.mode;
  if ((mode === 'culture' || mode === 'science') && capitale) {
    const marteaux = Math.max(1, condense.empire?.villes?.find((v) => v.id === capitale.id)?.marteaux ?? 1);
    const items = itemsVictoireProductibles(mode, etatFiltre, moi, capitale, marteaux);
    if (items.length > 0) {
      const criteria = { aucun: 'Ne pas orienter la production vers la victoire ce tour.' };
      for (const it of items) {
        criteria[`${it.kind}:${it.id}`] = `${it.nom} — coût ${it.cout} marteaux, environ ${Math.ceil(it.cout / marteaux)} tour(s).`;
      }
      q.productionVictoire = { instructions: config.questions.productionVictoire.instructions, criteria, type: 'choice' };
      meta.productionVictoire = { genre: 'productionVictoire', mode };
    }
  }

  return { questions: q, meta, seuils };
}

/** JEV-IT4 · D3 — gate de bruit : un signal de fin de partie dans le bloc
 * victoire (jalons ≥ 10 chez quelqu'un, ≥ 2 composants, merveille de
 * victoire en chantier, ou guerre contre moi). */
export function signalVictoire(condense) {
  const v = condense?.victoire;
  if (!v) return false;
  const seuilJalons = Math.ceil((v.cibles?.jalons ?? 20) / 2);
  if ((v.mien?.jalons ?? 0) >= seuilJalons) return true;
  if ((v.mien?.composants ?? 0) >= 2) return true;
  if ((v.mien?.merveillesEnChantier ?? []).length > 0) return true;
  for (const r of v.rivaux ?? []) {
    if ((r.jalons ?? 0) >= seuilJalons) return true;
    if ((r.composants ?? 0) >= 2) return true;
    if ((r.merveillesEnChantier ?? []).length > 0) return true;
  }
  if ((condense.diplomatie?.guerreAvec ?? []).length > 0) return true;
  return false;
}

/** JEV-IT4B · D-B — 5e signal de gate (LE seul amendement permis) : la
 * domination est MÉCANIQUE — rapport de forces global ≥ 2 ET au moins
 * `ecart` (3) villes de plus que le leader en villes. C'est le profil exact
 * des parties stériles du banc it4 (seeds 3947827986, 4033602994,
 * 786078703 : 76 forces vs 0-11, aucun autre signal). */
export function signalDominationMechanique(condense, etatFiltre, moi, seuilRapport = 2, ecart = 3) {
  const rapport = condense?.monde?.puissance?.rapport ?? 0;
  if (rapport < seuilRapport) return false;
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi).length;
  const leaderVilles = Object.values(etatFiltre.cities ?? {})
    .filter((v) => v.owner !== moi && v.owner !== 'barbarien' && etatFiltre.players?.[v.owner] && !etatFiltre.players[v.owner].defeated)
    .reduce((m, v) => Math.max(m, villesDe(etatFiltre, v.owner)), 0);
  return mesVilles >= leaderVilles + ecart;
}

function villesDe(etatFiltre, pid) {
  return Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === pid).length;
}

/** JEV-IT4B · D-A — cible pré-qualifiée de la guerre totale : un rival
 * RENCONTRÉ (bloc diplomatie — fog respecté), PAS déjà en guerre avec lui,
 * rapport de forces ≥ `seuilRapport` (1,2 — data v6), capitale CONNUE
 * (distance < 99). Tri : le plus de villes (leader), puis le meilleur
 * rapport, puis l'id (déterminisme). Null si personne n'est éligible.
 * Amendement AVENIR (verdict Erik 31/10, banc v1) : avec `autoriserAveugle`
 * (le signal D-B « domination mécanique » est actif), un rival JAMAIS
 * rencontré devient une cible valable — la liste des joueurs est publique
 * au lobby (canon T2 : l'UI de négociation expose les rivaux), et c'est le
 * profil EXACT des parties stériles (domination à l'aveugle, distance 99). */
export function cibleGuerreTotale(condense, etatFiltre, moi, seuilRapport = 1.2, autoriserAveugle = false) {
  const enGuerre = new Set(condense?.diplomatie?.guerreAvec ?? []);
  return (condense?.diplomatie?.rivaux ?? [])
    .filter((r) => !enGuerre.has(r.id) && (r.rapportForces ?? 0) >= seuilRapport)
    .map((r) => ({
      ...r,
      villes: villesDe(etatFiltre, r.id),
      aveugle: (r.distanceCapitale ?? 99) >= 99,
    }))
    .filter((r) => (r.aveugle ? autoriserAveugle && r.rencontreTour == null : r.villes > 0))
    .sort((a, b) => b.villes - a.villes || b.rapportForces - a.rapportForces || a.id.localeCompare(b.id))[0] ?? null;
}

/** JEV-IT4 · D2.2 — items de victoire productibles dans la capitale pour le
 * mode visé : culture → merveilles cultureVictory ; science → composants du
 * Vaisseau. ORDRES EXISTANTS SEULEMENT (kind wonder/building + canSetProduction).
 * JAMAIS de nouvel ordre moteur. */
export function itemsVictoireProductibles(mode, etatFiltre, moi, capitale, marteaux = 1) {
  const joueur = etatFiltre.players?.[moi];
  const techs = joueur?.techsUnlocked ?? [];
  const batiments = capitale.buildings ?? [];
  const out = [];
  if (mode === 'culture') {
    for (const w of Object.values(WONDERS)) {
      if (w.cultureVictory !== true || batiments.includes(w.id)) continue;
      if (canSetProduction({ kind: 'wonder', id: w.id }, techs, batiments, joueur?.civId)) {
        out.push({ kind: 'wonder', id: w.id, nom: `Merveille ${w.id} (victoire culturelle — ONU)`, cout: w.cost });
      }
    }
  } else if (mode === 'science') {
    for (const c of COMPOSANTS_VAISSEAU) {
      if (batiments.includes(c)) continue;
      if (canSetProduction({ kind: 'building', id: c }, techs, batiments, joueur?.civId)) {
        out.push({ kind: 'building', id: c, nom: `Composant du Vaisseau spatial ${c}`, cout: BUILDINGS[c]?.cost ?? 0 });
      }
    }
  }
  return out.sort((a, b) => a.cout - b.cout || a.id.localeCompare(b.id)).slice(0, 4);
}

/** L3 v2 — fourchette de compensation suggérée, miroir du prix indicatif T2
 * (prixPaixBase × fierté × rapport de forces borné — données negociation de
 * bot.json), chaque montant plafonné à la trésorerie, dédupliqué et trié.
 * `agressivite` est celle de la CIV ennemie (visible — canon T2). */
export function prixPaixSuggere(negoc, agressivite, rapportForces, tresorerie) {
  const fierte = negoc.facteurFierte ?? 1;
  const rapport = Math.min(
    negoc.plafondRapportForces ?? 2,
    Math.max(negoc.plancherRapportForces ?? 0.5, rapportForces ?? 1),
  );
  const prix = Math.round((negoc.prixPaixBase ?? 15) * fierte * rapport * (agressivite ?? 1));
  const plafond = Math.max(0, Math.floor(tresorerie ?? 0));
  const montants = [...new Set([prix, Math.min(plafond, Math.ceil(prix / 2)), Math.min(plafond, Math.ceil(prix * 2))])]
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  return montants;
}

/**
 * Un tour de décision Jev JOUEUR (D1/D2). Traduit les réponses en formes
 * canon : ordres (SetProduction capitale), actions immédiates (SetResearch,
 * SetConversion) et intentions DIPLOMATIques retournées BRUTES au harnais
 * (la réponse du bot — deciderPaixNegociee/deciderEchangeTechs — est calculée
 * côté harnais sur l'état COMPLET, pas sur le condensé fog).
 */
export async function tourJevJoueur(client, config, etatFiltre, moi, memo = {}) {
  // v5 CONTACT-GUERRE D1 : l'état de rencontre est mis à jour AVANT le
  // condensé (le bloc diplomatie lit memo.rencontres).
  majRencontres(etatFiltre, moi, memo);
  const condense = condenseJoueur(etatFiltre, moi, memo);
  const { questions, meta, seuils } = construireQuestionsJoueur(config, condense, etatFiltre, moi, memo);
  const sortie = {
    condense,
    questions,
    reponses: null,
    repli: false,
    plate: false,
    latenceMs: null,
    jetonsEntree: 0,
    ordres: [],
    actions: [],
    attentes: [],
    // Intentions diplomatiques brutes — appliquées par le harnais (réponse
    // du bot seedée sur l'état complet).
    diplomatie: [],
    // Un choix 'guerre' (MÊME 'aucun') bloque toute déclaration du bot pour
    // nous ce tour — Jev a le dernier mot sur le timing des guerres.
    bloqueGuerreBot: false,
    erreur: null,
    meta,
  };

  if (Object.keys(questions).length === 0) {
    // Rien de décidable ce tour (rare) — bot pur, aucun appel.
    sortie.repli = true;
    return sortie;
  }

  const t0 = Date.now();
  let reponse;
  try {
    reponse = await client.systemOne({ state: condense, questions });
  } catch (e) {
    sortie.erreur = String(e?.message ?? e);
    sortie.repli = true;
    sortie.latenceMs = Date.now() - t0;
    return sortie;
  }
  sortie.latenceMs = Date.now() - t0;
  sortie.jetonsEntree = reponse?.usage?.input_tokens ?? Math.ceil(JSON.stringify({ state: condense, questions }).length / 4);
  sortie.reponses = reponse.answers;
  const ans = reponse.answers ?? {};

  const confMin = seuils.confianceChoixMin ?? 0.65;
  // Seuil « dialogue » PAR DOMAINE (canon v2 : chaque question porte son
  // propre seuil) — les questions diplomatiques/conversion sont chroniquement
  // sous-confiantes chez le modèle.
  const confDial = seuils.decisionMin ?? confMin;
  const confiance = (r, seuil = confMin) => (r?.confidence ?? 0) >= seuil ? r : null;
  const confDialMin = (r) => confiance(r, confDial);
  const me = etatFiltre.players?.[moi];
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  // JEV-IT4 · D2 : capitale de portée tour (décisions finPartie/proteger).
  const capitale = mesVilles.find((v) => v.capital) ?? mesVilles[0] ?? null;

  // Distribution plate = état insuffisant (directive n°3), consigné.
  const premier = Object.values(ans)[0];
  const probs = Object.values(premier?.probabilities ?? {});
  if (probs.length > 1 && probs.every((p) => Math.abs(p - 1 / probs.length) < 0.02)) sortie.plate = true;

  // 1. Production de la capitale (orientation militaire/éco).
  const produire = confiance(ans.produire);
  if (produire && produire.choice && produire.choice !== 'aucun') {
    const valide = (condense.candidats.productionCapitale ?? []).some((c) => c.cle === produire.choice);
    const capitale = Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi && v.capital)
      ?? Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi);
    const [kind, id] = produire.choice.split(':');
    if (valide && capitale && canSetProduction({ kind, id }, me?.techsUnlocked ?? [], capitale.buildings ?? [], me?.civId)) {
      sortie.ordres.push({ type: 'SetProduction', cityId: capitale.id, item: { kind, id } });
      sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: `${kind}:${id}` });
    }
  }

  // 1.5 Fonder (JEV-EXPANSION D2 — exécution canon). Deux chemins :
  //     (a) COMPLÉTION MÉCANIQUE d'une fondation programmée (Jev a déjà
  //         choisi — D3, pas de re-question) : colon produit s'il manque
  //         (SetProduction — « production du colon si absent », D2), marche
  //         MultiStep re-planifiée chaque tour (le pas glouton converge ;
  //         re-planifier contourne l'annulation R-161 sous le fog et les
  //         chemins gelés tués), puis FoundCity DIRECT quand le colon est
  //         SUR place (un MultiStep à l'arrivée consomme tous ses PM et
  //         l'action finale est annulée « PM insuffisants » — canon moteur ;
  //         la fondation doit être émise le tour SUIVANT, PM frais).
  //     (b) NOUVEAU choix Jev (question `fonder`, absente tant qu'une
  //         fondation est programmée) : site choisi → même exécution.
  sortie.fondationProgrammee = null;
  const echouees = memo.casesFondationEchouees ?? new Set();
  const trouveColon = () =>
    Object.values(etatFiltre.units ?? {}).find(
      (u) => u.owner === moi && UNIT_TYPES[u.type]?.canFoundCity && !u.aboard,
    );
  const caseDe = (u) => `${u.q},${u.r}`;
  if (memo.fondationEnCours) {
    const cible = memo.fondationEnCours;
    if (echouees.has(cible.case)) {
      // Case invalidée par un rejet moteur (ville ennemie invisible,
      // cohabitation…) — v3.1 : on n'y retourne JAMAIS, la question revient.
      delete memo.fondationEnCours;
    } else {
      const [cq, cr] = cible.case.split(',').map(Number);
      const colon = trouveColon();
      if (colon) {
        cible.unitId = colon.id;
        if (colon.q === cq && colon.r === cr) {
          sortie.ordres.push({ type: 'FoundCity', unitId: colon.id });
          sortie.attentes.push({ genre: 'fondation', unitId: colon.id, case: cible.case });
        } else {
          const chemin = cheminVers(etatFiltre, moi, colon, { q: cq, r: cr });
          if (chemin.length > 0) {
            sortie.ordres.push({ type: 'MultiStep', unitId: colon.id, path: chemin, final: 'foundCity' });
            sortie.attentes.push({ genre: 'mouvement', unitId: colon.id, attendu: `${chemin[0].q},${chemin[0].r}` });
          } else {
            // Site inatteignable au savoir actuel (fog, obstacle) — la
            // programmation est levée, la question `fonder` revient.
            delete memo.fondationEnCours;
          }
        }
      } else {
        // « Production du colon si absent » (D2) : ré-émise chaque tour —
        // un autre choix `produire` de Jev écraserait sinon le colon (le
        // dernier SetProduction gagne côté moteur) et l'expansion mourrait
        // en phase production (vu au banc v3a, parties 4/6).
        const capitale =
          Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi && v.capital)
          ?? Object.values(etatFiltre.cities ?? {}).find((v) => v.owner === moi)
          ?? null;
        const typeColon = colonProductible(me?.techsUnlocked ?? []);
        if (capitale && typeColon && canSetProduction({ kind: 'unit', id: typeColon.id }, me?.techsUnlocked ?? [], capitale.buildings ?? [], me?.civId)) {
          sortie.ordres.push({ type: 'SetProduction', cityId: capitale.id, item: { kind: 'unit', id: typeColon.id } });
          sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: `unit:${typeColon.id}` });
        }
      }
    }
  }
  const fond = confDialMin(ans.fonder);
  if (fond?.choice && fond.choice.startsWith('fonder:') && !memo.fondationEnCours) {
    const caseCible = fond.choice.slice('fonder:'.length);
    const site = candidatsFondation(etatFiltre, moi, memo).find((s) => s.case === caseCible);
    const colon = trouveColon();
    if (site) {
      memo.fondationEnCours = { case: site.case, tour: etatFiltre.turn, unitId: colon?.id ?? null };
      sortie.fondationProgrammee = { ...memo.fondationEnCours, nouvelle: true };
      if (colon) {
        const [cq, cr] = site.case.split(',').map(Number);
        if (colon.q === cq && colon.r === cr) {
          sortie.ordres.push({ type: 'FoundCity', unitId: colon.id });
          sortie.attentes.push({ genre: 'fondation', unitId: colon.id, case: site.case });
        } else {
          const chemin = cheminVers(etatFiltre, moi, colon, { q: cq, r: cr });
          if (chemin.length > 0) {
            sortie.ordres.push({ type: 'MultiStep', unitId: colon.id, path: chemin, final: 'foundCity' });
            sortie.attentes.push({ genre: 'mouvement', unitId: colon.id, attendu: `${chemin[0].q},${chemin[0].r}` });
          }
        }
      }
    }
  }

  // 2. Recherche tenue (canon v2 D2).
  const techTenue = memo.techRecherche;
  const techs = me?.techsUnlocked ?? [];
  if (techTenue && !techs.includes(techTenue)) {
    sortie.actions.push({ type: 'SetResearch', techId: techTenue });
    sortie.attentes.push({ genre: 'recherche', techId: techTenue, joueur: moi });
  } else {
    const chercher = confiance(ans.rechercher);
    if (chercher?.choice && (condense.empire.recherche?.candidates ?? []).some((t) => t.id === chercher.choice)) {
      memo.techRecherche = chercher.choice;
      sortie.actions.push({ type: 'SetResearch', techId: chercher.choice });
      sortie.attentes.push({ genre: 'recherche', techId: chercher.choice, joueur: moi });
    }
  }

  // 3. Conversion d'une ville (L1 v2). Repli : une réponse INDÉCISE (sous le
  //    seuil) applique la règle regle:conversion en PLANCHER (miroir du repli
  //    bot — bibliothèque posée/en cours ou capitale après premier colon →
  //    science) ; un 'aucun' CONFIANT reste une décision volontaire.
  const convertir = confDialMin(ans.convertir);
  if (convertir?.choice && convertir.choice !== 'aucun') {
    const [vers, ...rest] = convertir.choice.split(':');
    const cityId = rest.join(':');
    const ville = Object.values(etatFiltre.cities ?? {}).find((v) => v.id === cityId && v.owner === moi);
    if (ville && (vers === 'science' || vers === 'or') && (ville.conversion ?? 'gold') !== vers) {
      sortie.actions.push({ type: 'SetConversion', cityId, vers });
      sortie.attentes.push({ genre: 'conversion', cityId, vers });
    }
  } else if (mesVilles.length > 0 && (ans.convertir?.confidence ?? 1) < confDial) {
    for (const v of mesVilles) {
      const cible = cibleConversionRepli(v, moi, memo);
      if (cible && (v.conversion ?? 'gold') !== cible) {
        sortie.actions.push({ type: 'SetConversion', cityId: v.id, vers: cible });
        sortie.attentes.push({ genre: 'conversion', cityId: v.id, vers: cible, repli: true });
      }
    }
  }

  // 4. Guerre — un choix CONFIANT ('aucun' compris) bloque le bot ; une
  //    réponse indécise (sous seuil) laisse l'initiative au bot (canon D2).
  const guerre = confDialMin(ans.guerre);
  if ((ans.guerre?.confidence ?? 0) >= confDial) sortie.bloqueGuerreBot = true;
  if (guerre?.choice && guerre.choice.startsWith('guerre:')) {
    const cible = guerre.choice.slice('guerre:'.length);
    if ((condense.diplomatie.rivaux ?? []).some((r) => r.id === cible)) {
      sortie.diplomatie.push({ genre: 'guerre', cible });
    }
  }

  // 5. Paix (+ compensation au juste prix — L3 v2 : le choix 'or:N' de la
  //    fourchette devient le montant transféré, plafonné trésorerie).
  const paix = confDialMin(ans.paix);
  if (paix?.choice && paix.choice.startsWith('paix:')) {
    const cible = paix.choice.slice('paix:'.length);
    if ((condense.diplomatie.guerreAvec ?? []).includes(cible)) {
      let or = 0;
      const choixComp = ans.compensation?.choice;
      if (typeof choixComp === 'string' && choixComp.startsWith('or:')) {
        or = Number.parseInt(choixComp.slice(3), 10) || 0;
      }
      or = Math.min(me?.treasury ?? 0, Math.max(0, or));
      sortie.diplomatie.push({ genre: 'paix', cible, or });
    }
  }

  // 6. Échange de techs (1:1 — canon T2 D3).
  const off = confDialMin(ans.techOfferte);
  const dem = confDialMin(ans.techDemandee);
  if (
    off?.choice?.startsWith('off:') &&
    dem?.choice?.startsWith('dem:')
  ) {
    const techOfferte = off.choice.slice('off:'.length);
    const techDemandee = dem.choice.slice('dem:'.length);
    const refus = memo.echangesRefuses;
    const dejaRefusee = memo.echangesRefuses && (
      memo.echangesRefuses.has(`${techOfferte}>`) || memo.echangesRefuses.has(`>${techDemandee}`)
    );
    if ((me?.techsUnlocked ?? []).includes(techOfferte) && !dejaRefusee) {
      sortie.diplomatie.push({ genre: 'echange', cible: (condense.diplomatie.rivaux ?? [])[0]?.id, techOfferte, techDemandee });
    }
  }

  // JEV-IT4 · D2 — traduction des décisions de fin de partie.

  // 7. finPartie — le mode est PERSISTÉ au memo (les questions 2 en
  // dépendent) ; pousserCapitale/contrerCourse/viserMaVictoire:domination
  // orientent la production de la capitale vers le MEILLEUR candidat
  // militaire déjà listé (ORDRES EXISTANTS — jamais de nouvel ordre).
  const fin = confDialMin(ans.finPartie);
  if (fin?.choice && fin.choice !== 'continuer') {
    if (fin.choice === 'viserMaVictoire:domination') {
      memo.finPartie = { mode: 'domination' };
    } else if (fin.choice.startsWith('viserMaVictoire:')) {
      const type = fin.choice.slice('viserMaVictoire:'.length);
      memo.finPartie = { mode: type };
      // culture/science : la recherche est le goulot — orienter la capitale
      // vers la science (ORDRE EXISTANT SetConversion).
      if ((type === 'culture' || type === 'science') && capitale) {
        if ((capitale.conversion ?? 'gold') !== 'science') {
          sortie.actions.push({ type: 'SetConversion', cityId: capitale.id, vers: 'science' });
          sortie.attentes.push({ genre: 'conversion', cityId: capitale.id, vers: 'science' });
        }
      }
    } else if (fin.choice.startsWith('guerreTotale:')) {
      // JEV-IT4B · D-A — ACTE PONCTUEL : la déclaration est traduite en
      // intention de guerre EXISTANTE (le harnais émet DeclareWar), JAMAIS
      // persistée au memo — le mode courant (domination/pousserCapitale)
      // est préservé et la question retrouve ses choix habituels. Double
      // garde : mode courant + cible rencontrée, pas déjà en guerre avec
      // elle, rapport ≥ seuil (miroir exact de la construction de question).
      const cible = fin.choice.slice('guerreTotale:'.length);
      const modeFin = memo.finPartie?.mode;
      const seuil = seuils.guerreTotaleRapportMin ?? 1.2;
      const r = (condense.diplomatie.rivaux ?? []).find((x) => x.id === cible);
      const dejaEnGuerre = (condense.diplomatie.guerreAvec ?? []).includes(cible);
      if (
        (modeFin === 'domination' || modeFin === 'pousserCapitale') &&
        r && !dejaEnGuerre && (r.rapportForces ?? 0) >= seuil
      ) {
        sortie.diplomatie.push({ genre: 'guerre', cible });
      }
    } else {
      const [modeF, cible] = fin.choice.split(':');
      memo.finPartie = { mode: modeF, cible: cible ?? null };
    }
    // Poussée militaire : produire le meilleur candidat de combat dans la
    // capitale (parmi candidats productionCapitale DÉJÀ validés).
    if (fin.choice.startsWith('pousserCapitale:') || fin.choice.startsWith('contrerCourse:') || fin.choice === 'viserMaVictoire:domination') {
      const militaire = (condense.candidats.productionCapitale ?? [])
        .filter((c) => c.attaque > 0)
        .sort((a, b) => b.attaque - a.attaque || a.cout - b.cout || a.cle.localeCompare(b.cle))[0];
      const prodCourante = capitale?.production ? `${capitale.production.item.kind}:${capitale.production.item.id}` : null;
      if (militaire && capitale && prodCourante !== militaire.cle) {
        const [kind, id] = militaire.cle.split(':');
        if (canSetProduction({ kind, id }, me?.techsUnlocked ?? [], capitale.buildings ?? [], me?.civId)) {
          sortie.ordres.push({ type: 'SetProduction', cityId: capitale.id, item: { kind, id } });
          sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: militaire.cle });
        }
      }
    }
  } else if (fin?.choice === 'continuer') {
    delete memo.finPartie;
  }

  // 8. productionVictoire — l'item choisi est DÉJÀ validé par
  // canSetProduction à la construction de la question ; revalider quand même
  // (le moteur est l'arbitre final).
  const prodV = confiance(ans.productionVictoire);
  if (prodV?.choice && prodV.choice !== 'aucun' && capitale) {
    const [kind, id] = prodV.choice.split(':');
    if ((kind === 'wonder' || kind === 'building') && canSetProduction({ kind, id }, me?.techsUnlocked ?? [], capitale.buildings ?? [], me?.civId)) {
      sortie.ordres.push({ type: 'SetProduction', cityId: capitale.id, item: { kind, id } });
      sortie.attentes.push({ genre: 'production', cityId: capitale.id, item: prodV.choice });
    }
  }

  // 9. protegerCapitale — fortifier les unités de combat NON fortifiées
  // dans un rayon de 2 autour de la capitale (ORDRE EXISTANT Fortify).
  const prot = confDialMin(ans.protegerCapitale);
  if (prot?.choice === 'proteger' && capitale) {
    const proches = Object.values(etatFiltre.units ?? {})
      .filter((u) => u.owner === moi && !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false) && !u.fortified)
      .filter((u) => hexDistance(u, capitale) <= 2)
      .sort((a, b) => `${a.q},${a.r}`.localeCompare(`${b.q},${b.r}`));
    for (const u of proches.slice(0, 4)) {
      sortie.ordres.push({ type: 'Fortify', unitId: u.id });
      sortie.attentes.push({ genre: 'fortification', unitId: u.id });
    }
  }

  // Repli métrique : aucune décision traduite cette tour (le choix 'aucun'
  // est une décision VOLONTAIRE — pas un repli).
  sortie.repli = sortie.ordres.length === 0 && sortie.actions.length === 0 && sortie.diplomatie.length === 0;
  return sortie;
}

/** L1 v2 — repli de conversion (miroir exact de la règle regle:conversion du
 * harnais, partie.changementsConversion, appliquée à la SEULE nation de Jev) :
 * bibliothèque posée ou en production (université incluse) → science ;
 * capitale après le premier colon produit (memo.colonProduit, alimenté par le
 * harnais) → science. Idempotent (null si rien à changer). */
export function cibleConversionRepli(ville, moi, memo) {
  const buildings = ville.buildings ?? [];
  const enProduction = ville.production?.item;
  const biblioPosee = buildings.includes('bibliotheque') || buildings.includes('universite');
  const biblioEnCours =
    enProduction?.kind === 'building' &&
    (enProduction.id === 'bibliotheque' || enProduction.id === 'universite');
  if (biblioPosee || biblioEnCours) return 'science';
  if (ville.capital && memo?.colonProduit?.has?.(moi)) return 'science';
  return null;
}

/** Mémorise un échange refusé (réponse du bot) pour ne pas le re-proposer. */
export function memoRefusEchange(memo, techOfferte, techDemandee) {
  memo.echangesRefuses = memo.echangesRefuses ?? new Set();
  if (techOfferte) memo.echangesRefuses.add(`${techOfferte}>`);
  if (techDemandee) memo.echangesRefuses.add(`>${techDemandee}`);
}
