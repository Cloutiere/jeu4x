/**
 * JEV-FUMEE-LOBBY · D2 (décisions Erik 28/10) — port SERVEUR du condensé v3
 * FIGÉ du harnais sableuse (sableuse/src/condense.mjs, traduction mécanique —
 * mêmes formules, même ordre de calcul, même arrondi). Le comportement est
 * prouvé par tests croisés (tests-jev/jev-port.test.ts : mêmes états filtrés
 * ⇒ mêmes condensés bit à bit). Zéro calibrage (D6) : toute modification de
 * formule se fait dans le harnais SEUL, puis re-port.
 *
 * Les types d'état sont volontairement lâches (`any`-indexé) : la vérité de
 * forme est le harnais JS, jamais un modèle TS du GameState.
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
  CULTURE,
  WONDERS,
} from '@game/rules';

export const RAYON_MENACE = 5;
export const MAX_CANDIDATS = 5;

/** Config des formules du condensé v2/v3 — MIROIR EXACT de configCondense
 * (sableuse/src/condense.mjs). 🔶 cibles de calibrage, GELÉES (v3 figée). */
export const configCondense = {
  rayonValeurSite: 2,
  poidsCouronneLointaine: 0.5,
  penaliteDistanceSite: 2,
  maxSitesValues: 3,
  maxCandidatsProduction: 8,
  maxTechsCandidates: 3,
  gainSite: {
    partCouronne1: 0.5,
    partCouronne2: 0.25,
    penaliteDistance: 2,
    rayonRisque: 4,
    penaliteRisque: 3,
    seuilRentable: 2,
    facteurMaturite: 0.65,
    actifMaturite: true,
  },
};

type AnyEtat = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function vals(x: AnyEtat): AnyEtat[] {
  return Object.values(x ?? {}) as AnyEtat[];
}

function arrondi(x: number, d = 1): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

function valeurTerrain(tile: AnyEtat): number {
  if (!tile) return 0;
  const t = TERRAINS[tile.terrain];
  if (!t || !t.passable) return 0;
  return (t.yields?.food ?? 0) + (t.yields?.production ?? 0) + (t.yields?.commerce ?? 0);
}

function sommeVoisinage(map: AnyEtat, q: number, r: number, rayon: number): number {
  let somme = 0;
  for (let dq = -rayon; dq <= rayon; dq++) {
    const rMin = Math.max(-rayon, -dq - rayon);
    const rMax = Math.min(rayon, -dq + rayon);
    for (let dr = rMin; dr <= rMax; dr++) {
      somme += valeurTerrain(map?.[`${q + dq},${r + dr}`]);
    }
  }
  return somme;
}

export function valeurSite(map: AnyEtat, q: number, r: number, distance: number): number {
  const centre = valeurTerrain(map?.[`${q},${r}`]);
  const couronne1 = sommeVoisinage(map, q, r, 1) - centre;
  const couronne2 = sommeVoisinage(map, q, r, configCondense.rayonValeurSite) - sommeVoisinage(map, q, r, 1);
  const brute = couronne1 + configCondense.poidsCouronneLointaine * couronne2 - configCondense.penaliteDistanceSite * distance;
  return arrondi(Math.max(0, brute));
}

export function gainNetSite(etatFiltre: AnyEtat, moi: string, site: AnyEtat): number {
  const g = configCondense.gainSite;
  const map = etatFiltre.map;
  const centre = valeurTerrain(map?.[`${site.q},${site.r}`]);
  const couronne1 = sommeVoisinage(map, site.q, site.r, 1) - centre;
  const couronne2 = sommeVoisinage(map, site.q, site.r, configCondense.rayonValeurSite) - sommeVoisinage(map, site.q, site.r, 1);
  let ennemis = 0;
  for (const u of vals(etatFiltre.units ?? {})) {
    if (u.owner === moi || u.aboard) continue;
    if (hexDistance({ q: site.q, r: site.r }, u) <= g.rayonRisque) ennemis += 1;
  }
  const maturite = g.actifMaturite ? (g.facteurMaturite ?? 1) : 1;
  return arrondi(
    maturite * (g.partCouronne1 * couronne1 + g.partCouronne2 * couronne2) -
      g.penaliteDistance * site.distance -
      g.penaliteRisque * ennemis,
  );
}

export function rendementsVilles(filtre: AnyEtat, mesVilles: AnyEtat[]): AnyEtat[] {
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

export function candidatsProduction(filtre: AnyEtat, ville: AnyEtat, moi: string, max = 5): AnyEtat[] {
  const joueur = filtre.players?.[moi];
  const techs = joueur?.techsUnlocked ?? [];
  const marteaux = Math.max(1, ville.productionMarteaux ?? 1);
  const colons: AnyEtat[] = [];
  const combat: AnyEtat[] = [];
  const batiments: AnyEtat[] = [];
  for (const u of vals(UNIT_TYPES)) {
    if (u.greatPerson || u.implemented === false) continue;
    if (!canSetProduction({ kind: 'unit', id: u.id }, techs, ville.buildings ?? [], joueur?.civId)) continue;
    const item = { cle: `unit:${u.id}`, nom: u.id, cout: u.cost, attaque: u.attack ?? 0, colon: !!u.canFoundCity };
    if (item.colon) colons.push(item);
    else if (item.attaque > 0) combat.push(item);
    else batiments.push({ ...item, batiment: true });
  }
  for (const b of vals(BUILDINGS)) {
    if ((ville.buildings ?? []).includes(b.id)) continue;
    if (!canSetProduction({ kind: 'building', id: b.id }, techs, ville.buildings ?? [], joueur?.civId)) continue;
    batiments.push({ cle: `building:${b.id}`, nom: b.id, cout: b.cost, attaque: 0, colon: false, batiment: true });
  }
  const moinsCher = (a: AnyEtat, b: AnyEtat) => a.cout - b.cout || a.cle.localeCompare(b.cle);
  const retenus: AnyEtat[] = [];
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

export function etatRecherche(filtre: AnyEtat, moi: string, scienceParTour: number): AnyEtat {
  const joueur = filtre.players?.[moi];
  if (!joueur) return null;
  const techs = joueur.techsUnlocked ?? [];
  const brute = joueur.researching ? TECHS[joueur.researching] : null;
  const encours = brute && !techs.includes(brute.id) ? brute : null;
  const progres = encours ? (joueur.scienceProgress?.[encours.id] ?? 0) : 0;
  const candidates = availableTechs(joueur)
    .sort((a: AnyEtat, b: AnyEtat) => a.cost - b.cost || a.id.localeCompare(b.id))
    .slice(0, configCondense.maxTechsCandidates)
    .map((t: AnyEtat) => ({ id: t.id, cout: t.cost }));
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

export function puissanceMilitaire(filtre: AnyEtat, moi: string): AnyEtat {
  const sum = (pred: (u: AnyEtat) => boolean) =>
    vals(filtre.units ?? {}).reduce((a: number, u: AnyEtat) => (pred(u) ? a + (UNIT_TYPES[u.type]?.attack ?? 0) : a), 0);
  const amie = sum((u) => u.owner === moi && !u.aboard);
  const ennemieVisible = sum((u) => u.owner !== moi && !u.aboard);
  return {
    amie,
    ennemieVisible,
    rapport: arrondi(amie / Math.max(1, ennemieVisible), 2),
  };
}

export function sitesFondation(etatFiltre: AnyEtat, moi: string, ancre: AnyEtat = null): AnyEtat[] {
  const villes = vals(etatFiltre.cities ?? {});
  const colonnes: AnyEtat[] = vals(etatFiltre.units ?? {}).filter(
    (u: AnyEtat) => u.owner === moi && UNIT_TYPES[u.type]?.canFoundCity,
  );
  if (colonnes.length === 0) {
    if (!ancre) return [];
    colonnes.push({ q: ancre.q, r: ancre.r });
  }
  const sites: AnyEtat[] = [];
  for (const [cle, tile] of Object.entries(etatFiltre.map ?? {})) {
    const [q, r] = cle.split(',').map(Number) as [number, number];
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
    const colon = colonnes.reduce((a: AnyEtat, b: AnyEtat) =>
      hexDistance({ q, r }, { q: a.q, r: a.r }) <= hexDistance({ q, r }, { q: b.q, r: b.r }) ? a : b,
    );
    sites.push({ case: cle, q, r, valeur, distance: hexDistance({ q, r }, { q: colon.q, r: colon.r }) });
  }
  for (const s of sites) s.valeurSite = valeurSite(etatFiltre.map, s.q, s.r, s.distance);
  sites.sort(
    (a: AnyEtat, b: AnyEtat) => b.valeurSite - a.valeurSite || a.distance - b.distance || a.case.localeCompare(b.case),
  );
  return sites.slice(0, Math.max(MAX_CANDIDATS, configCondense.maxSitesValues));
}

export function ciblesAttaque(etatFiltre: AnyEtat, moi: string): AnyEtat[] {
  const attaquants = vals(etatFiltre.units ?? {}).filter(
    (u: AnyEtat) => u.owner === moi && (UNIT_TYPES[u.type]?.canAttack ?? false) && !u.aboard,
  );
  if (attaquants.length === 0) return [];
  const base = attaquants.reduce((a: AnyEtat, b: AnyEtat) =>
    (UNIT_TYPES[a.type]?.attack ?? 0) * a.hp >= (UNIT_TYPES[b.type]?.attack ?? 0) * b.hp ? a : b,
  );
  const cibles: AnyEtat[] = [];
  for (const u of vals(etatFiltre.units ?? {})) {
    if (u.owner === moi || u.aboard) continue;
    cibles.push({ case: `${u.q},${u.r}`, q: u.q, r: u.r, genre: 'unite', type: u.type, distance: hexDistance(base, u) });
  }
  for (const v of vals(etatFiltre.cities ?? {})) {
    if (v.owner === moi) continue;
    cibles.push({ case: `${v.q},${v.r}`, q: v.q, r: v.r, genre: 'ville', type: v.capital ? 'capitale' : 'ville', distance: hexDistance(base, v) });
  }
  cibles.sort((a: AnyEtat, b: AnyEtat) => a.distance - b.distance || a.case.localeCompare(b.case));
  return cibles.slice(0, MAX_CANDIDATS);
}

/**
 * JEV-IT4 · D1 — bloc `victoire` du condensé : pur calcul depuis l'état
 * FILTRÉ, zéro storage. Jalons culturels (mêmes compteurs que la gate ONU
 * moteur, R-116), composants du Vaisseau spatial (suivi DÉRIVÉ des bâtiments
 * des villes — R-124/R-66, miroir de SHIP_COMPONENTS de turn.ts), merveilles
 * de victoire (ONU cultureVictory / Banque mondiale economicVictory) en
 * chantier (files des villes) et déjà bâties par qui, trésorerie (mienne
 * exacte — déjà exposée à empire.or ; rivaux ARRONDIE à la centaine — même
 * économie de liste blanche que le reste du condensé : JAMAIS de positions
 * d'unités ni de plans adverses ici). Rivaux ÉLIMINÉS exclus.
 */
export const COMPOSANTS_VAISSEAU = [
  'vaisseau_habitation',
  'vaisseau_support_vie',
  'vaisseau_carburant',
  'vaisseau_propulsion',
]; // miroir SHIP_COMPONENTS (packages/rules/src/turn.ts, R-124)

export function merveillesVictoire(id: string): boolean {
  const w = WONDERS[id];
  return !!(w && (w.cultureVictory === true || w.economicVictory === true));
}

function merveillesEnChantier(villes: AnyEtat[], marteauxParVille: Map<string, number>): AnyEtat[] {
  const out: AnyEtat[] = [];
  for (const v of villes) {
    const p = v.production;
    if (!p || p.item?.kind !== 'wonder' || !merveillesVictoire(p.item.id)) continue;
    const cout = WONDERS[p.item.id]?.cost ?? 0;
    const marteaux = Math.max(1, marteauxParVille.get(v.id) ?? 1);
    out.push({
      nom: p.item.id,
      ville: v.id,
      toursRestants: Math.ceil(Math.max(0, cout - (p.progress ?? 0)) / marteaux),
    });
  }
  return out.sort((a: AnyEtat, b: AnyEtat) => a.ville.localeCompare(b.ville) || a.nom.localeCompare(b.nom));
}

function composantsPoses(villes: AnyEtat[]): number {
  const poses = new Set<string>();
  for (const v of villes) for (const b of v.buildings ?? []) if (COMPOSANTS_VAISSEAU.includes(b)) poses.add(b);
  return poses.size;
}

export function blocVictoire(etatFiltre: AnyEtat, moi: string, marteauxParVille: Map<string, number>): AnyEtat {
  const joueurs = etatFiltre.players ?? {};
  const vivant = ([id, p]: [string, AnyEtat]) => id !== 'barbarien' && p.defeated !== true;
  const villesDe = (pid: string) => vals(etatFiltre.cities ?? {}).filter((v: AnyEtat) => v.owner === pid);
  const jalonsDe = (p: AnyEtat) => p.cultureMilestones ?? 0;
  const autres = Object.entries(joueurs)
    .filter(([id]) => id !== moi)
    .filter(vivant);
  const me = joueurs[moi] ?? {};
  const mesVilles = villesDe(moi);
  const compteMerveillesBatees = (villes: AnyEtat[]) =>
    villes.reduce((a: number, v: AnyEtat) => a + (v.buildings ?? []).filter((b: string) => merveillesVictoire(b)).length, 0);
  const mien = {
    jalons: jalonsDe(me),
    composants: composantsPoses(mesVilles),
    merveillesEnChantier: merveillesEnChantier(mesVilles, marteauxParVille),
    merveillesBatees: compteMerveillesBatees(mesVilles),
  };
  const rivaux = autres.map(([id, p]) => ({
    id,
    civ: (p as AnyEtat).civId,
    jalons: jalonsDe(p),
    composants: composantsPoses(villesDe(id)),
    merveillesEnChantier: merveillesEnChantier(villesDe(id), marteauxParVille),
    tresorerieApprox: Math.round(((p as AnyEtat).treasury ?? 0) / 100) * 100,
    merveillesBatees: compteMerveillesBatees(villesDe(id)),
  }));
  const merveillesBateesQui = autres
    .map(([id, p]) => ({ civ: (p as AnyEtat).civId, n: compteMerveillesBatees(villesDe(id)) }))
    .filter((x) => x.n > 0);
  if (mien.merveillesBatees > 0) merveillesBateesQui.push({ civ: me.civId, n: mien.merveillesBatees });
  return {
    cibles: {
      jalons: CULTURE?.milestonesTarget ?? 20,
      composants: COMPOSANTS_VAISSEAU.length,
      or: WONDERS?.banque_mondiale?.treasuryRequired ?? 20000,
    },
    mien,
    rivaux,
    merveillesBateesQui,
  };
}

export function condenserEtat(etatFiltre: AnyEtat, moi: string): AnyEtat {
  const joueurs = etatFiltre.players ?? {};
  const me = joueurs[moi];
  const autres = Object.entries(joueurs).filter(([id]) => id !== moi);
  const mesVilles = vals(etatFiltre.cities ?? {}).filter((v: AnyEtat) => v.owner === moi);
  const mesUnites = vals(etatFiltre.units ?? {}).filter((u: AnyEtat) => u.owner === moi && !u.aboard);
  const ennemiesVisibles = vals(etatFiltre.units ?? {}).filter((u: AnyEtat) => u.owner !== moi && !u.aboard);
  const villesEnnemuesVisibles = vals(etatFiltre.cities ?? {}).filter((v: AnyEtat) => v.owner !== moi);

  const menaces = ennemiesVisibles
    .map((u: AnyEtat) => ({
      distanceVilleLaPlusProche: Math.min(...mesVilles.map((v: AnyEtat) => hexDistance(u, v)), 99),
      type: u.type,
    }))
    .filter((m: AnyEtat) => m.distanceVilleLaPlusProche <= RAYON_MENACE)
    .sort((a: AnyEtat, b: AnyEtat) => a.distanceVilleLaPlusProche - b.distanceVilleLaPlusProche)
    .slice(0, MAX_CANDIDATS);

  const allTechs = allKnownTechs(etatFiltre);
  const economieVilles = rendementsVilles(etatFiltre, mesVilles);
  const marteauxParVille = new Map(
    mesVilles.map((v: AnyEtat, i: number) => [v.id, economieVilles[i]?.production ?? 0]),
  );

  const capitale = mesVilles.find((v: AnyEtat) => v.capital) ?? mesVilles[0] ?? null;
  const candidatsProd = capitale
    ? candidatsProduction({ ...etatFiltre, players: etatFiltre.players }, { ...capitale, productionMarteaux: marteauxParVille.get(capitale.id) ?? 1 }, moi)
    : [];
  const fileCourante = capitale?.production
    ? { item: `${capitale.production.item.kind}:${capitale.production.item.id}`, progres: capitale.production.progress }
    : null;
  const sites = sitesFondation(etatFiltre, moi).slice(0, configCondense.maxSitesValues);
  for (const s of sites) s.gainNet = gainNetSite(etatFiltre, moi, s);
  const recherche = etatRecherche(etatFiltre, moi, economieVilles.reduce((a: number, e: AnyEtat) => a + e.science, 0));

  return {
    tour: etatFiltre.turn,
    empire: {
      or: me?.treasury ?? 0,
      scienceReserve: me?.scienceStored ?? 0,
      ratioScience: me?.scienceRatio ?? 0.5,
      regime: me?.government ?? null,
      era: me?.era ?? null,
      techsConnues: me?.techsUnlocked?.length ?? 0,
      rechercheEnCours: me?.researching ?? null,
      villes: mesVilles.map((v: AnyEtat) => ({
        id: v.id,
        case: `${v.q},${v.r}`,
        pop: v.pop,
        capitale: v.capital,
        production: v.production ? `${v.production.item.kind}:${v.production.item.id}` : null,
        progresProduction: v.production?.progress ?? 0,
        marteaux: marteauxParVille.get(v.id) ?? 0,
        rendements: economieVilles.find((e: AnyEtat) => e.id === v.id) ?? null,
        batiments: v.buildings?.length ?? 0,
        conversion: v.conversion === 'science' ? 'science' : 'or',
      })),
      recherche,
      fileCouranteCapitale: fileCourante,
      unites: mesUnites.map((u: AnyEtat) => ({
        type: u.type,
        case: `${u.q},${u.r}`,
        pv: `${u.hp}/${UNIT_TYPES[u.type]?.hpMax ?? '?'}`,
        pm: u.mp,
        fortifiee: u.fortified,
      })),
    },
    monde: {
      ennemisVisibles: ennemiesVisibles.map((u: AnyEtat) => ({ type: u.type, case: `${u.q},${u.r}` })),
      villesEnnemuesVisibles: villesEnnemuesVisibles.map((v: AnyEtat) => ({
        civ: joueurs[v.owner]?.civId ?? v.owner,
        case: `${v.q},${v.r}`,
        capitale: v.capital,
      })),
      rivaux: autres.map(([id, p]) => ({ civ: (p as AnyEtat).civId, era: (p as AnyEtat).era, techsConnues: (p as AnyEtat).techsUnlocked?.length ?? 0 })),
      puissance: puissanceMilitaire(etatFiltre, moi),
    },
    // JEV-IT4 · D1 : la fin de partie devient VISIBLE (jalons, composants,
    // merveilles de victoire, trésoreries approximées) — Jev ne peut viser
    // une victoire qu'il ne voit pas.
    victoire: blocVictoire(etatFiltre, moi, marteauxParVille),
    menaces,
    candidats: {
      fondation: sites,
      attaque: ciblesAttaque(etatFiltre, moi),
      productionCapitale: candidatsProd,
    },
  };
}
