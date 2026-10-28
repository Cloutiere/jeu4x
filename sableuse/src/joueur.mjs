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
  TECHS,
  UNIT_TYPES,
} from '@game/rules';
import { condenserEtat } from './condense.mjs';

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
 * arrondi à 0,1 — l'argument de la guerre argumentée). */
export function blocDiplomatie(etatFiltre, moi) {
  const maPuissance = forcesVisibles(etatFiltre, moi);
  const rivaux = rivalsReels(etatFiltre, moi).map(({ id, p }) => ({
    id,
    civ: p.civId,
    era: p.era ?? null,
    techsConnues: p.techsUnlocked?.length ?? 0,
    techs: [...(p.techsUnlocked ?? [])].sort(),
    forces: forcesVisibles(etatFiltre, id),
    rapportForces: Math.round((maPuissance / Math.max(1, forcesVisibles(etatFiltre, id))) * 10) / 10,
    enGuerre: ennemisDeMoi(etatFiltre, moi).includes(id),
    distanceCapitale: distanceCapitales(etatFiltre, moi, id),
  }));
  const ennemis = ennemisDeMoi(etatFiltre, moi).map((id) => ({
    id,
    ...(dureeEtBatailles(etatFiltre, moi, id)),
  }));
  return { guerreAvec: ennemisDeMoi(etatFiltre, moi), ennemis, rivaux };
}

/** Condensé joueur = condensé du banc + bloc diplomatie. */
export function condenseJoueur(etatFiltre, moi) {
  const condense = condenserEtat(etatFiltre, moi);
  condense.diplomatie = blocDiplomatie(etatFiltre, moi);
  return condense;
}

/** Description lisible d'un critère dynamique de production (miroir
 * adapter-jev.descriptionCle — littéral strict, directive n°1). */
function descriptionProduction(c) {
  const genre = c.colon ? 'un colon (fonde une ville)' : c.attaque > 0 ? 'une unité de combat' : 'un bâtiment';
  return `${genre} — coût ${c.cout} marteaux, environ ${c.toursEst} tour(s) de production`;
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

  // Guerre (L2 v2 — argumentée) : UNE cible pré-triée (le voisin le plus
  // faible), décision oui/non, rapport de forces présenté EXPLICITEMENT
  // (miroir de la question « attaquer » du banc v2 qui passait à 0,85).
  if (!enGuerre && rivaux.length > 0) {
    const cible = [...rivaux].sort(
      (a, b) => a.forces - b.forces || a.distanceCapitale - b.distanceCapitale || a.techsConnues - b.techsConnues,
    )[0];
    const criteria = {};
    criteria[`guerre:${cible.id}`] = `OUI — déclarer la guerre à ${cible.civ} (${cible.id}), le voisin le PLUS FAIBLE : nos forces ${condense.monde.puissance.amie} vs les siennes ${cible.forces} (rapport ${cible.rapportForces}× en notre faveur), ère ${cible.era ?? '?'}, ${cible.techsConnues} techs, capitale à ${cible.distanceCapitale} cases. Déclarer lance la campagne : le bot assemble l'armée et marche.`;
    criteria['aucun'] = 'NON — ne pas déclarer cette guerre ce tour (bloque aussi toute déclaration du bot pour nous).';
    q.guerre = { instructions: config.questions.guerre.instructions, criteria, type: 'choice' };
    meta.guerre = { genre: 'guerre', cible: cible.id };
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

  return { questions: q, meta, seuils };
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
  const condense = condenseJoueur(etatFiltre, moi);
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
