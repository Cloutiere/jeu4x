/**
 * Condensé d'état pour Jev (HANDOFF-JEV-POC D6) — « fetch precisely, judge
 * cheaply » (directive n°2 du doc TypeSafe). Entrée : l'état FILTRÉ fog
 * (getFilteredState) de la nation ; sortie : un objet JSON ≤ ~2000 jetons.
 * Zéro arithmétique laissée au modèle : distances, tris et valeurs sont
 * précalculés ici (directive n°2 : exclure l'arithmétique du modèle).
 */
import {
  allKnownTechs,
  availableTechs,
  BUILDINGS,
  canSetProduction,
  cityEconomyInputs,
  hexDistance,
  MIN_CITY_DISTANCE,
  TECHS,
  TERRAINS,
  UNIT_TYPES,
} from '@game/rules';

const RAYON_MENACE = 5;
const MAX_CANDIDATS = 5;

/**
 * Config des formules du condensé v2 (HANDOFF-JEV-QUESTIONS-V2 D1) —
 * éditable sans toucher à la logique. 🔶 cibles de calibrage.
 */
export const configCondense = {
  /** Rayon de la couronne lointaine dans la valeur d'un site de fondation. */
  rayonValeurSite: 2,
  /** Poids de la couronne lointaine (rayon 2) vs couronne proche (rayon 1). */
  poidsCouronneLointaine: 0.5,
  /** Pénalité par case de distance entre le site et le colon. */
  penaliteDistanceSite: 2,
  /** Nombre max de sites de fondation décrits avec leur valeur. */
  maxSitesValues: 3,
  /** Nombre max de candidats de production décrits (toutes catégories). */
  maxCandidatsProduction: 8,
  /** Nombre max de techs candidates décrites. */
  maxTechsCandidates: 3,
  /** v3 (HANDOFF-JEV-V3-BANC2 D1) — formule du GAIN NET d'un site de
   * fondation, en rendements/tour estimés une fois la ville peuplée :
   * gainNet = partCouronne1 × couronne1 + partCouronne2 × couronne2
   *           − penaliteDistance × distance au colon
   *           − penaliteRisque × ennemis connus à rayonRisque du site.
   * Éditable sans toucher à la logique ; cible de calibrage banc 2. */
  gainSite: {
    partCouronne1: 0.5,
    partCouronne2: 0.25,
    penaliteDistance: 2,
    rayonRisque: 4,
    penaliteRisque: 3,
    /** Un gain net jugé « rentable » pour la question fonder (texte + faux client). */
    seuilRentable: 2,
  },
};

function arrondi(x, d = 1) {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function valeurTerrain(tile) {
  if (!tile) return 0;
  const t = TERRAINS[tile.terrain];
  if (!t || !t.passable) return 0;
  return (t.yields?.food ?? 0) + (t.yields?.production ?? 0) + (t.yields?.commerce ?? 0);
}

/** Somme des rendements (n+p+c) des tuiles praticables dans le rayon donné. */
function sommeVoisinage(map, q, r, rayon) {
  let somme = 0;
  // Parcours axial explicite (lisibilité plutôt que formule dense).
  for (let dq = -rayon; dq <= rayon; dq++) {
    const rMin = Math.max(-rayon, -dq - rayon);
    const rMax = Math.min(rayon, -dq + rayon);
    for (let dr = rMin; dr <= rMax; dr++) {
      somme += valeurTerrain(map?.[`${q + dq},${r + dr}`]);
    }
  }
  return somme;
}

/** Valeur d'un site de fondation (🔶 formule éditable, configCondense) :
 * somme des rendements du rayon 1 + 0,5 × rayon 2 − 2 × distance au colon.
 * Calculée ICI (directive n°2 : zéro arithmétique chez Jev). */
export function valeurSite(map, q, r, distance) {
  const centre = valeurTerrain(map?.[`${q},${r}`]);
  // Le tuile du site deviendra la ville (rendement 0 une fois fondée) —
  // exclue des deux couronnes.
  const couronne1 = sommeVoisinage(map, q, r, 1) - centre;
  const couronne2 = sommeVoisinage(map, q, r, configCondense.rayonValeurSite) - sommeVoisinage(map, q, r, 1);
  const brute = couronne1 + configCondense.poidsCouronneLointaine * couronne2 - configCondense.penaliteDistanceSite * distance;
  return arrondi(Math.max(0, brute));
}

/** v3 D1 : gain net estimé d'un site de fondation, en rendements/tour une fois
 * la ville peuplée (formule éditable configCondense.gainSite) :
 * part des couronnes 1 et 2 − pénalité de distance au colon − pénalité par
 * ennemi connu (fog respecté) à rayonRisque du site. Peut être négatif —
 * un site sous risque ou trop loin est un MAUVAIS site, Jev doit le voir. */
export function gainNetSite(etatFiltre, moi, site) {
  const g = configCondense.gainSite;
  const map = etatFiltre.map;
  const centre = valeurTerrain(map?.[`${site.q},${site.r}`]);
  const couronne1 = sommeVoisinage(map, site.q, site.r, 1) - centre;
  const couronne2 = sommeVoisinage(map, site.q, site.r, configCondense.rayonValeurSite) - sommeVoisinage(map, site.q, site.r, 1);
  let ennemis = 0;
  for (const u of Object.values(etatFiltre.units ?? {})) {
    if (u.owner === moi || u.aboard) continue;
    if (hexDistance({ q: site.q, r: site.r }, u) <= g.rayonRisque) ennemis += 1;
  }
  return arrondi(
    g.partCouronne1 * couronne1 +
      g.partCouronne2 * couronne2 -
      g.penaliteDistance * site.distance -
      g.penaliteRisque * ennemis,
  );
}

/** Rendements nets par tour de chaque ville (cityEconomyInputs du moteur,
 * appelé sur l'état FILTRÉ — les ressources inconnues ne donnent rien, R-92). */
export function rendementsVilles(filtre, mesVilles) {
  const allTechs = allKnownTechs(filtre);
  return mesVilles.map((v) => {
    const e = cityEconomyInputs(filtre, v, allTechs);
    return {
      id: v.id,
      nourriture: arrondi(e.food),
      production: e.production,
      science: e.science,
      or: (e.rawGold ?? 0) + (e.directGold ?? 0),
    };
  });
}

/** Candidats de production de la ville, CURÉS (v2, itération calibrage) :
 * une liste non départageable écrase la confiance de Jev (directive n°3,
 * observé sur 8 candidats : confiance 0,26-0,51). On présente ≤ 5 options
 * représentatives : meilleur colon, meilleure unité de combat, meilleur
 * bâtiment, puis les moins chers restants — tri final par coût. */
export function candidatsProduction(filtre, ville, moi, max = 5) {
  const joueur = filtre.players?.[moi];
  const techs = joueur?.techsUnlocked ?? [];
  const marteaux = Math.max(1, ville.productionMarteaux ?? 1);
  const colons = [];
  const combat = [];
  const batiments = [];
  for (const u of Object.values(UNIT_TYPES)) {
    if (u.greatPerson || u.implemented === false) continue;
    if (!canSetProduction({ kind: 'unit', id: u.id }, techs, ville.buildings ?? [], joueur?.civId)) continue;
    const item = { cle: `unit:${u.id}`, nom: u.id, cout: u.cost, attaque: u.attack ?? 0, colon: !!u.canFoundCity };
    if (item.colon) colons.push(item);
    else if (item.attaque > 0) combat.push(item);
    else batiments.push({ ...item, batiment: true });
  }
  for (const b of Object.values(BUILDINGS)) {
    if ((ville.buildings ?? []).includes(b.id)) continue;
    if (!canSetProduction({ kind: 'building', id: b.id }, techs, ville.buildings ?? [], joueur?.civId)) continue;
    batiments.push({ cle: `building:${b.id}`, nom: b.id, cout: b.cost, attaque: 0, colon: false, batiment: true });
  }
  const moinsCher = (a, b) => a.cout - b.cout || a.cle.localeCompare(b.cle);
  const retenus = [];
  colons.sort(moinsCher);
  if (colons[0]) retenus.push(colons[0]);
  combat.sort((a, b) => b.attaque - a.attaque || moinsCher(a, b));
  if (combat[0]) retenus.push(combat[0]);
  batiments.sort(moinsCher);
  if (batiments[0]) retenus.push(batiments[0]);
  const reste = [...colons.slice(1), ...combat.slice(1), ...batiments.slice(1)].sort(moinsCher);
  retenus.push(...reste.slice(0, Math.max(0, max - retenus.length)));
  retenus.sort(moinsCher);
  return retenus.map((i) => ({ ...i, toursEst: Math.ceil(i.cout / marteaux) }));
}

/** État de la recherche : tech en cours, coût, progression, tours restants
 * estimés, et les 2-3 candidates suivantes avec leur coût.
 * Fix D4 (HANDOFF-JEV-V3-BANC2) : (a) `enCours` n'est affichée que si elle
 * n'est PAS déjà débloquée (après complétion, le moteur supprime le progrès
 * mais le harnais re-émet SetResearch — afficher « alphabet 0/20 » en boucle
 * était trompeur) ; (b) la réserve `scienceStored` est montrée (l'ancien
 * condensé lisait `me.science`, champ qui n'existe pas → toujours 0) ;
 * (c) la vérité `scienceParTour` (souvent 0 au départ — conversion Or par
 * défaut, canon R-90) est exposée pour que Jev voie pourquoi ça stagne. */
export function etatRecherche(filtre, moi, scienceParTour) {
  const joueur = filtre.players?.[moi];
  if (!joueur) return null;
  const techs = joueur.techsUnlocked ?? [];
  const brute = joueur.researching ? TECHS[joueur.researching] : null;
  const encours = brute && !techs.includes(brute.id) ? brute : null;
  const progres = encours ? (joueur.scienceProgress?.[encours.id] ?? 0) : 0;
  const candidates = availableTechs(joueur)
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))
    .slice(0, configCondense.maxTechsCandidates)
    .map((t) => ({ id: t.id, cout: t.cost }));
  return {
    enCours: encours?.id ?? null,
    cout: encours?.cost ?? null,
    progres: arrondi(progres, 0),
    reserve: joueur.scienceStored ?? 0,
    scienceParTour: arrondi(scienceParTour, 1),
    toursRestants: encours && scienceParTour > 0 ? Math.ceil(Math.max(0, encours.cost - progres) / scienceParTour) : null,
    techsCompletees: techs.length,
    candidates,
  };
}

/** Puissance militaire connue : somme des attaques de MES unités vs celles
 * des unités ennemies VISIBLES (fog respecté), avec le rapport estimé. */
export function puissanceMilitaire(filtre, moi) {
  const sum = (pred) =>
    Object.values(filtre.units ?? {}).reduce(
      (a, u) => (pred(u) ? a + (UNIT_TYPES[u.type]?.attack ?? 0) : a),
      0,
    );
  const amie = sum((u) => u.owner === moi && !u.aboard);
  const ennemieVisible = sum((u) => u.owner !== moi && !u.aboard);
  return {
    amie,
    ennemieVisible,
    rapport: arrondi(amie / Math.max(1, ennemieVisible), 2),
  };
}

/** Sites de fondation viables : terre passable, à ≥ MIN_CITY_DISTANCE de
 * TOUTE ville connue, triés par valeur (décroissante) puis distance (croissante). */
export function sitesFondation(etatFiltre, moi) {
  const villes = Object.values(etatFiltre.cities ?? {});
  const colonnes = Object.values(etatFiltre.units ?? {}).filter(
    (u) => u.owner === moi && UNIT_TYPES[u.type]?.canFoundCity,
  );
  if (colonnes.length === 0) return [];
  const sites = [];
  for (const [cle, tile] of Object.entries(etatFiltre.map ?? {})) {
    const [q, r] = cle.split(',').map(Number);
    const valeur = valeurTerrain(tile);
    if (valeur <= 0) continue;
    let ok = true;
    for (const v of villes) {
      if (hexDistance({ q, r }, { q: v.q, r: v.r }) < MIN_CITY_DISTANCE + 1) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const colon = colonnes.reduce((a, b) =>
      hexDistance({ q, r }, { q: a.q, r: a.r }) <= hexDistance({ q, r }, { q: b.q, r: b.r }) ? a : b,
    );
    sites.push({ case: cle, q, r, valeur, distance: hexDistance({ q, r }, { q: colon.q, r: colon.r }) });
  }
  for (const s of sites) s.valeurSite = valeurSite(etatFiltre.map, s.q, s.r, s.distance);
  sites.sort(
    (a, b) => b.valeurSite - a.valeurSite || a.distance - b.distance || a.case.localeCompare(b.case),
  );
  return sites.slice(0, Math.max(MAX_CANDIDATS, configCondense.maxSitesValues));
}

/** Cibles d'attaque visibles : unités et villes ennemies, triées par distance
 * croissante depuis la meilleure unité de combat amie. */
export function ciblesAttaque(etatFiltre, moi) {
  const attaquants = Object.values(etatFiltre.units ?? {}).filter(
    (u) => u.owner === moi && (UNIT_TYPES[u.type]?.canAttack ?? false) && !u.aboard,
  );
  if (attaquants.length === 0) return [];
  const base = attaquants.reduce((a, b) =>
    (UNIT_TYPES[a.type]?.attack ?? 0) * a.hp >= (UNIT_TYPES[b.type]?.attack ?? 0) * b.hp ? a : b,
  );
  const cibles = [];
  for (const u of Object.values(etatFiltre.units ?? {})) {
    if (u.owner === moi || u.aboard) continue;
    cibles.push({ case: `${u.q},${u.r}`, q: u.q, r: u.r, genre: 'unite', type: u.type, distance: hexDistance(base, u) });
  }
  for (const v of Object.values(etatFiltre.cities ?? {})) {
    if (v.owner === moi) continue;
    cibles.push({ case: `${v.q},${v.r}`, q: v.q, r: v.r, genre: 'ville', type: v.capital ? 'capitale' : 'ville', distance: hexDistance(base, v) });
  }
  cibles.sort((a, b) => a.distance - b.distance || a.case.localeCompare(b.case));
  return cibles.slice(0, MAX_CANDIDATS);
}

export function condenserEtat(etatFiltre, moi) {
  const joueurs = etatFiltre.players ?? {};
  const me = joueurs[moi];
  const autres = Object.entries(joueurs).filter(([id]) => id !== moi);
  const mesVilles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner === moi);
  const mesUnites = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner === moi && !u.aboard);
  const ennemiesVisibles = Object.values(etatFiltre.units ?? {}).filter((u) => u.owner !== moi && !u.aboard);
  const villesEnnemuesVisibles = Object.values(etatFiltre.cities ?? {}).filter((v) => v.owner !== moi);

  const menaces = ennemiesVisibles
    .map((u) => ({
      distanceVilleLaPlusProche: Math.min(...mesVilles.map((v) => hexDistance(u, v)), 99),
      type: u.type,
    }))
    .filter((m) => m.distanceVilleLaPlusProche <= RAYON_MENACE)
    .sort((a, b) => a.distanceVilleLaPlusProche - b.distanceVilleLaPlusProche)
    .slice(0, MAX_CANDIDATS);

  // D1 · v2 : rendements nets par tour par ville + marteaux (pour le coût
  // des candidats de production), via la fonction PURE du moteur.
  const allTechs = allKnownTechs(etatFiltre);
  const economieVilles = rendementsVilles(etatFiltre, mesVilles);
  const marteauxParVille = new Map(
    mesVilles.map((v, i) => [v.id, economieVilles[i]?.production ?? 0]),
  );

  // D1 · v2 : candidats de production + valeur des sites + recherche.
  const capitale = mesVilles.find((v) => v.capital) ?? mesVilles[0] ?? null;
  const candidatsProd = capitale
    ? candidatsProduction({ ...etatFiltre, players: etatFiltre.players }, { ...capitale, productionMarteaux: marteauxParVille.get(capitale.id) ?? 1 }, moi)
    : [];
  const fileCourante = capitale?.production
    ? { item: `${capitale.production.item.kind}:${capitale.production.item.id}`, progres: capitale.production.progress }
    : null;
  const sites = sitesFondation(etatFiltre, moi).slice(0, configCondense.maxSitesValues);
  // v3 D1 : gain net estimé (rendements/tour une fois peuplée) par site.
  for (const s of sites) s.gainNet = gainNetSite(etatFiltre, moi, s);
  const recherche = etatRecherche(etatFiltre, moi, economieVilles.reduce((a, e) => a + e.science, 0));

  const condense = {
    tour: etatFiltre.turn,
    empire: {
      or: me?.treasury ?? 0,
      // Fix D4 : l'ancien champ `science` lisait `me.science` (inexistant).
      // La science d'un joueur moteur vit dans `scienceStored` (réserve) —
      // le flux par tour est dans empire.recherche.scienceParTour.
      scienceReserve: me?.scienceStored ?? 0,
      ratioScience: me?.scienceRatio ?? 0.5,
      regime: me?.government ?? null,
      era: me?.era ?? null,
      techsConnues: me?.techsUnlocked?.length ?? 0,
      rechercheEnCours: me?.researching ?? null,
      villes: mesVilles.map((v) => ({
        id: v.id,
        case: `${v.q},${v.r}`,
        pop: v.pop,
        capitale: v.capital,
        production: v.production ? `${v.production.item.kind}:${v.production.item.id}` : null,
        progresProduction: v.production?.progress ?? 0,
        marteaux: marteauxParVille.get(v.id) ?? 0,
        rendements: economieVilles.find((e) => e.id === v.id) ?? null,
        batiments: v.buildings?.length ?? 0,
      })),
      // D1 · v2 : état de la recherche (tech en cours, tours restants, candidates).
      recherche,
      fileCouranteCapitale: fileCourante,
      unites: mesUnites.map((u) => ({
        type: u.type,
        case: `${u.q},${u.r}`,
        pv: `${u.hp}/${UNIT_TYPES[u.type]?.hpMax ?? '?'}`,
        pm: u.mp,
        fortifiee: u.fortified,
      })),
    },
    monde: {
      ennemisVisibles: ennemiesVisibles.map((u) => ({ type: u.type, case: `${u.q},${u.r}` })),
      villesEnnemuesVisibles: villesEnnemuesVisibles.map((v) => ({
        civ: joueurs[v.owner]?.civId ?? v.owner,
        case: `${v.q},${v.r}`,
        capitale: v.capital,
      })),
      rivaux: autres.map(([id, p]) => ({ civ: p.civId, era: p.era, techsConnues: p.techsUnlocked?.length ?? 0 })),
      // D1 · v2 : puissance militaire connue (visible seulement) et rapport.
      puissance: puissanceMilitaire(etatFiltre, moi),
    },
    menaces,
    candidats: {
      fondation: sites,
      attaque: ciblesAttaque(etatFiltre, moi),
      // D1 · v2 : candidats de production de la capitale (coût + tours estimés).
      productionCapitale: candidatsProd,
    },
  };
  return condense;
}
