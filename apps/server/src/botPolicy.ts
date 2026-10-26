/**
 * Politique du BOT — portage TS de `src/bot.mjs` (Chantier BOT-SOLO, L0),
 * REFONDUE en politique TACTIQUE (BOT-TA, décisions Erik 21/10).
 *
 * `bot.mjs` est un CLIENT Node externe (Phase 3) : inutilisable en prod.
 * Ce module est exécuté par le GameDO à la résolution pour le joueur bot (L1) :
 *   - entrée : l'état moteur COMPLET (choix 🔶 documenté — le bot est le
 *     serveur, équité non garantie ; alternative écartée : état filtré) ;
 *   - RNG seedé DÉDIÉ dérivé du seed de partie et du tour (`botTurnSeed`,
 *     R-80) — il ne consomme JAMAIS le RNG de résolution du moteur ;
 *   - sortie : ordres valides (mêmes règles que le joueur : Move/Attack/
 *     Heal/Fortify/Sleep/Hold, fortification, naval/espion R-117/R-119,
 *     production filtrée R-87, rush-buy R-135, GP en Settle déterministe
 *     R-126, recherche R-85, régimes R-122, vaisseau R-124) + actions
 *     immédiates (SetResearch/SetGovernment — hors ordres de tour,
 *     appliquées par le DO).
 * Le moteur revalide TOUT à la résolution, comme pour un humain.
 *
 * BOT-TA · D1 : chaque unité reçoit un OBJECTIF réassigné à chaque tour
 * (priorités ① soigner → ② attaquer → ③ garnisonner → ④ chasser les
 * barbares → ⑤ explorer), calculé par `assignerObjectifs` (pur, testable) ;
 * l'émission des ordres lit ces objectifs. D2 : les combats défavorables
 * sont refusés (tenir ou replier d'un pas). D3 : déterminisme intégral
 * (R-81 : tris ; aucune décision dépendante d'un Map). D4 : production
 * pondérée (unités si en guerre). D5 : seuils data-driven (bot.json,
 * profils facile/normal/difficile — seul « normal » est implémenté, T-D).
 * BOT-TC (Erik 25/10) : le bot DÉCLARE la guerre (agressivité de sa civ ×
 * tirage seedé, rapport de forces, tour minimum, délai entre guerres —
 * actions publiques DeclareWar) et propose la PAIX quand elle perd ou
 * quand la guerre traîne (ProposePeace) ; en guerre, ses armées
 * excédentaires marchent vers la capitale ennemie. Attaquer une unité ou
 * une ville de JOUEUR exige toujours une paire en guerre dans
 * `diplomacy.war` ; les barbares sont en guerre permanente (R-95).
 *
 * NB : `bot.mjs` est CONSERVÉ tel quel pour les tests/e2e — deux
 * implémentations (duplication documentée, défaut 🔶 du handoff). Le
 * facteur d'ère du rush vient du champ persisté `era` (R-147) et le coût du
 * rush du helper moteur `rushBuyCostOf`. Parcours déterministes R-81.
 */
import {
  ARMY_SIZE,
  BARBARIAN_ID,
  BOT_SETTINGS,
  BUILDINGS,
  CITY_DEFENSE_BONUS,
  CITY_WORK_RADIUS,
  CULTURE,
  FORTIFY_DEFENSE_BONUS,
  GOVERNMENTS,
  TECHS,
  TERRAINS,
  UNIT_TYPES,
  WONDERS,
  activePlayerIds,
  agressiviteDe,
  allKnownTechs,
  areAtWar,
  bataillesDe,
  canSetProduction,
  compareCityIds,
  compareUnitIds,
  dureeGuerre,
  frontierRadius,
  growthThresholdFor,
  hexDistanceW,
  isBarbarian,
  rayonCulturelDe,
  rushBuyCostOf,
  techEraOf,
  tileYield,
  wonderTreasuryLocked,
  workRadiusOf,
  workableTilesFor,
} from '@game/rules';
import type {
  BotEconomieData,
  BotProfileData,
  City,
  GameState,
  Order,
  PlayerId,
  ProductionItem,
  SeededRng,
  TechEra,
  TileKey,
  Unit,
} from '@game/rules';

/** Id de session du joueur bot (réservé — l'auth ne délivre jamais cet id). */
export const BOT_PLAYER_ID = 'bot';
/** Nom affiché du bot. */
export const BOT_NAME = 'Bot';

/**
 * Graine du RNG du bot pour un tour donné : dérivation déterministe du seed
 * de partie (R-80) — même partie rejouée + mêmes ordres humains → mêmes
 * ordres du bot. Sensible au tour (chaque tour re-tire) et indépendant du
 * RNG de résolution du moteur (flux séparés).
 *
 * CARTE-MULTI : `engineId` distingue les bots d'une même partie (5 sièges
 * = jusqu'à 4 bots à seeds INDÉPENDANTS — sinon ils tireraient des plans
 * identiques). COMPATIBILITÉ 1v1 : l'id historique 'bot' (et l'appel à deux
 * arguments) conserve la dérivation ORIGINALE bit à bit — le bot solo ne
 * change pas de comportement. `engineId` est haché FNV-1a (déterministe,
 * R-80/R-82).
 */
export function botTurnSeed(gameSeed: number, turn: number, engineId?: string): number {
  const base = (Math.imul(turn + 0x9e37, 0x85ebca6b) ^ Math.imul(gameSeed >>> 0, 0xc2b2ae35)) >>> 0;
  if (!engineId || engineId === BOT_PLAYER_ID) return base;
  let hash = 0x811c9dc5;
  for (let i = 0; i < engineId.length; i++) {
    hash ^= engineId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (base ^ hash) >>> 0;
}

/** Actions immédiates (hors ordres de tour) choisies par la politique. */
export type BotAction =
  | { type: 'SetResearch'; techId: string }
  | { type: 'SetGovernment'; government: string }
  // BOT-TC (Erik 25/10, D1/D3) : diplomatie — déclaration de guerre (cible
  // calculée D1) et proposition de paix (boucle minimale D3). Actions
  // PUBLIQUES appliquées par le DO via les helpers purs du moteur.
  | { type: 'DeclareWar'; player: PlayerId }
  | { type: 'ProposePeace'; player: PlayerId };

export interface BotPlan {
  /** Ordres de tour — passés à resolveTurn comme ceux d'un humain (L1). */
  orders: Order[];
  /** Actions immédiates R-85/R-122 — appliquées par le DO avant résolution. */
  actions: BotAction[];
}

/** Les 6 directions axiales (hex.ts — miroir bot.mjs DIRS). Ordre canonique
 *  : sert de tie-break DÉTERMINISTE des pas (R-81). */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 0],
  [1, -1],
];

/** Composants du Vaisseau spatial (R-124 — visés en priorité en fin d'arbre). */
const SHIP_COMPONENTS = ['vaisseau_habitation', 'vaisseau_support_vie', 'vaisseau_carburant', 'vaisseau_propulsion'];

// ---------------------------------------------------------------------------
// BOT-TA · D5 — profil de difficulté (bot.json, seul « normal » implémenté).
// ---------------------------------------------------------------------------

/** Le profil du bot pour une difficulté donnée (BOT-TD — bot.json
 *  `profiles` ; valeur absente/inconnue ⇒ le profil global `profil`,
 *  « normal » par défaut). Pur. */
export function profileDuBot(difficulte?: string): BotProfileData {
  const cle = difficulte ?? BOT_SETTINGS.profil;
  return BOT_SETTINGS.profiles[cle] ?? BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
}

// ---------------------------------------------------------------------------
// BOT-TA · estimation des forces (RULES §7.4 simple — pas de simulation
// complète ; les modificateurs exotiques — soutien naval, traits, Himeji —
// sont volontairement ignorés 🔶, le moteur revalide tout).
// ---------------------------------------------------------------------------

/** Force d'ATTAQUE estimée : base × vétéran. */
function forceAttaque(unit: Unit): number {
  const stats = UNIT_TYPES[unit.type];
  return (stats?.attack ?? 0) * (unit.veteran ? 1 + 0.5 : 1);
}

/** Force de DÉFENSE estimée : base × vétéran × (1 + terrain + fortification
 *  + ville [Palais compris]). Miroir simplifié des bonus §7.4 (T-02/T-17). */
function forceDefense(state: GameState, unit: Unit): number {
  const stats = UNIT_TYPES[unit.type];
  const tile = state.map[`${unit.q},${unit.r}`];
  let bonus = tile ? (TERRAINS[tile.terrain]?.defenseBonus ?? 0) : 0;
  if (unit.fortified) bonus += FORTIFY_DEFENSE_BONUS;
  for (const c of Object.values(state.cities)) {
    if (c.q === unit.q && c.r === unit.r) {
      bonus += CITY_DEFENSE_BONUS;
      if (c.buildings.includes('palais')) bonus += CITY_DEFENSE_BONUS;
      break;
    }
  }
  return (stats?.defense ?? 0) * (unit.veteran ? 1 + 0.5 : 1) * (1 + bonus);
}

/** Distance hexagonale avec wrap Est↔Ouest (hex.ts, CARTE-RONDE T1). */
function dist(state: GameState, a: { q: number; r: number }, b: { q: number; r: number }): number {
  return hexDistanceW(a, b, state.mapWidth);
}

/** L'unité est-elle sur la case d'une de ses villes ? */
function surVillePropre(state: GameState, unit: Unit, me: PlayerId): City | undefined {
  return Object.values(state.cities).find((c) => c.owner === me && c.q === unit.q && c.r === unit.r);
}

/** Unité ennemie (barbare ou joueur en guerre) sur la case (q, r). */
function ennemiSurHex(state: GameState, q: number, r: number, me: PlayerId, ennemis: Set<PlayerId>): Unit | undefined {
  return Object.values(state.units).find(
    (u) => u.q === q && u.r === r && !u.aboard && (u.owner === me ? false : isBarbarian(u.owner) || ennemis.has(u.owner)),
  );
}

/** Menace adjacente : une unité ennemie au contact (distance 1). */
function menaceAdjacente(state: GameState, unit: Unit, me: PlayerId, ennemis: Set<PlayerId>): boolean {
  for (const [dq, dr] of DIRS) {
    if (ennemiSurHex(state, unit.q + dq, unit.r + dr, me, ennemis)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// BOT-EXPLORATION (décisions Erik 23/10) — patrouille du scout et quota de
// garnison dynamique : la première unité TOURNE EN BOUCLE autour de la
// capitale (méta 4X « scouting loop »), la garnison est une exception.
// ---------------------------------------------------------------------------

/** D3 · Y a-t-il urgence près de la capitale : un camp barbare (`villages`)
 *  ou une unité ennemie (barbare ou joueur en guerre) à ≤ `rayon` de la
 *  capitale ? Dans ce cas le quota complet du profil s'applique et le scout
 *  est rappelé. */
function menaceAutourCapitale(
  state: GameState,
  capitale: City,
  me: PlayerId,
  ennemis: Set<PlayerId>,
  rayon: number,
): boolean {
  for (const u of Object.values(state.units)) {
    if (u.aboard) continue;
    if ((isBarbarian(u.owner) || ennemis.has(u.owner)) && dist(state, capitale, u) <= rayon) return true;
  }
  for (const v of state.villages ?? []) {
    if (dist(state, capitale, v) <= rayon) return true;
  }
  return false;
}

/** D1/D2 · Quota de DÉFENSEURS en capitale selon la taille de l'empire :
 *  0 à 1 unité (le scout patrouille), 1 dès la 2e unité, quota complet du
 *  profil à ≥ `unitesAvantRenfort`. Toute urgence (D3) restaure le quota
 *  du profil. Pur, déterministe. */
export function quotaCapitale(profile: BotProfileData, nbUnites: number, urgence: boolean): number {
  if (urgence) return profile.garnisonsCapitale;
  if (nbUnites < 2) return 0;
  if (nbUnites < profile.unitesAvantRenfort) return 1;
  return profile.garnisonsCapitale;
}

/** D1 · Prochain WAYPOINT de patrouille : les 6 coins de l'anneau de rayon
 *  `rayon` autour de la capitale (ordre canonique des directions), visités
 *  en cycle — le coin suivant celui le plus proche du scout (tie-break :
 *  index le plus petit, R-81). Répétable : arrivé sur un coin, le scout vise
 *  le suivant → boucle infinie déterministe autour de la capitale. */
export function prochainWaypointPatrouille(
  capitale: { q: number; r: number },
  unit: { q: number; r: number },
  rayon: number,
  mapWidth: number,
): { q: number; r: number } {
  const coins = DIRS.map(([dq, dr]) => ({ q: capitale.q + dq * rayon, r: capitale.r + dr * rayon }));
  let k = 0;
  let bestD = Infinity;
  for (let i = 0; i < coins.length; i++) {
    const d = hexDistanceW(unit, coins[i]!, mapWidth);
    if (d < bestD) {
      bestD = d;
      k = i;
    }
  }
  return coins[(k + 1) % coins.length]!;
}

/** Heal interdit en territoire ennemi (anneaux culturels R-162) —
 *  approximation : le rayon FRONTIÈRE de chaque ville étrangère (radius de
 *  travail + paliers culturels, culture.ts) — 🔶 l'anneau exact inclut les
 *  cases cultivées ; l'approximation couvre le cas courant. */
function enTerritoireEnnemi(state: GameState, playerId: PlayerId, hex: { q: number; r: number }): boolean {
  for (const c of Object.values(state.cities)) {
    if (c.owner === playerId) continue; // son propre territoire n'est pas ennemi
    const paliers = rayonCulturelDe(c.cultureCumulee);
    const rayon = frontierRadius(CITY_WORK_RADIUS, paliers);
    if (dist(state, hex, c) <= rayon) return true;
  }
  return false;
}

/** Pas unitaire DÉTERMINISTE vers une cible : voisin praticable (classe
 *  navale respectée), libre de TOUTE unité (jamais d'entrée de combat non
 *  planifiée — D2), minimisant la distance à la cible ; tie-break = ordre
 *  canonique des directions (R-81). */
function pasVers(
  unit: Unit,
  state: GameState,
  cible: { q: number; r: number },
): { q: number; r: number } | null {
  const stats = UNIT_TYPES[unit.type];
  const aquatic = stats?.aquatic === true;
  let best: { q: number; r: number } | null = null;
  let bestD = Infinity;
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    if (aquatic) {
      const access = TERRAINS[tile.terrain]?.navalAccess;
      if (!access) continue;
      if (access === 'ocean' && stats?.navalAccess !== 'ocean') continue;
    } else if (!TERRAINS[tile.terrain]?.passable) {
      continue;
    }
    if (unitAtHex(state, q, r)) continue;
    const d = dist(state, { q, r }, cible);
    if (d < bestD) {
      bestD = d;
      best = { q, r };
    }
  }
  return best;
}

/**
 * BOT-ARMEE · pas ROUTIER vers une cible : premier pas du plus court chemin
 * (BFS déterministe — voisinage trié R-81) sur les cases praticables libres
 * de TOUTE unité. Le pas glouton `pasVers` se colle aux obstacles (littoral,
 * lacs) et oscille — les armées n'arrivaient JAMAIS (verrou de circulation,
 * banc god mode 26/10 : distMin figée à 15 sur 25 tours). Terrestres :
 * terrains passables ; navales : accès naval (miroir pasVers). Cible admise
 * même occupée (assaut). Retour : null si inatteignable.
 */
export function pasVersRoutier(
  unit: Unit,
  state: GameState,
  cible: { q: number; r: number },
): { q: number; r: number } | null {
  const stats = UNIT_TYPES[unit.type];
  const aquatic = stats?.aquatic === true;
  const praticable = (h: { q: number; r: number }): boolean => {
    const tile = state.map[`${h.q},${h.r}`];
    if (!tile) return false;
    if (aquatic) {
      const access = TERRAINS[tile.terrain]?.navalAccess;
      if (!access) return false;
      return !(access === 'ocean' && stats?.navalAccess !== 'ocean');
    }
    return !!TERRAINS[tile.terrain]?.passable;
  };
  const origin = `${unit.q},${unit.r}`;
  const dest = `${cible.q},${cible.r}`;
  if (origin === dest) return null;
  const cameFrom = new Map<string, string | null>([[origin, null]]);
  const queue: Array<{ q: number; r: number }> = [{ q: unit.q, r: unit.r }];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const voisins = DIRS.map(([dq, dr]) => ({ q: current.q + dq, r: current.r + dr }))
      .sort((a, b) => a.q - b.q || a.r - b.r); // R-81
    for (const n of voisins) {
      const k = `${n.q},${n.r}`;
      if (cameFrom.has(k)) continue;
      const estCible = n.q === cible.q && n.r === cible.r;
      // transit : praticable + libre ; la cible est admise occupée (assaut).
      if (!estCible && (!praticable(n) || unitAtHex(state, n.q, n.r))) continue;
      if (estCible && !praticable(n) && !unitAtHex(state, n.q, n.r)) continue; // ville/port occupé ok
      cameFrom.set(k, `${current.q},${current.r}`);
      if (estCible) {
        // Reconstituer le PREMIER pas.
        let cur = k;
        while (cameFrom.get(cur) !== origin) cur = cameFrom.get(cur)!;
        const [q, r] = cur.split(',').map(Number);
        return { q: q!, r: r! };
      }
      queue.push(n);
    }
  }
  return null;
}

/** Unité amie sur la case (q, r) — miroir bot.mjs `unitAtHex`. */
function unitAtHex(state: GameState, q: number, r: number, owner?: PlayerId): Unit | undefined {
  return Object.values(state.units).find((u) => u.q === q && u.r === r && (!owner || u.owner === owner));
}

// ---------------------------------------------------------------------------
// BOT-TC (décisions Erik 25/10) — DIPLOMATIE du bot : déclaration de guerre
// (agressivité par civ × tirage seedé, rapport de forces, tour minimum,
// délai entre guerres), ciblage du voisin le plus faible (D2), paix
// minimale (D3) et offensive des armées en guerre vers la capitale cible.
// Fonctions PURES séparées de l'émission — le DO applique DeclareWar/
// ProposePeace via les helpers purs du moteur (diplomatie.ts).
// ---------------------------------------------------------------------------

/** Force MILITAIRE totale estimée d'un joueur : Σ (attaque + défense) des
 *  unités déployées, vétérans compris (estimation simple §7.4 — 🔶 les
 *  bonus de terrain/ville ne comptent pas ici, l'échelle suffit). */
export function forcesDe(state: GameState, playerId: PlayerId): number {
  let total = 0;
  for (const u of Object.values(state.units)) {
    if (u.owner !== playerId || u.aboard) continue;
    const stats = UNIT_TYPES[u.type];
    const vete = u.veteran ? 1.5 : 1;
    total += ((stats?.attack ?? 0) + (stats?.defense ?? 0)) * vete;
  }
  return total;
}

/** D2 · Voisin le plus FAIBLE PARMI LES PROCHES (PAIX-RYTHME, Erik 27/10) :
 *  score = forces × (1 + poidsDistanceCibleGuerre × distance wrap entre
 *  capitales) — le poids affine sans renverser l'échelle des forces. Joueurs
 *  actifs ≠ moi, hors barbares, pas déjà en guerre, avec ville — tri (score,
 *  forces, distance, id) R-81. Null si aucun candidat. */
export function cibleGuerre(state: GameState, me: PlayerId, profile?: BotProfileData): PlayerId | null {
  const prof = profile ?? BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
  return cibleGuerrePonderee(state, me, prof, candidatsGuerre(state, me));
}

/** Candidats à la déclaration (miroir de l'ancien filtre de cibleGuerre). */
function candidatsGuerre(state: GameState, me: PlayerId): PlayerId[] {
  const actifs = new Set(activePlayerIds(state));
  const ennemis = ennemisDe(state, me);
  return Object.values(state.players)
    .filter(
      (p) =>
        p.id !== me &&
        actifs.has(p.id) &&
        !isBarbarian(p.id) &&
        !ennemis.has(p.id) &&
        p.defeated !== true &&
        Object.values(state.cities).some((c) => c.owner === p.id),
    )
    .map((p) => p.id)
    .sort((a, b) => (a < b ? -1 : 1));
}

/** Capitale effective (capitale, sinon première ville — triée R-81). */
function capitaleDe(state: GameState, me: PlayerId): { q: number; r: number } | null {
  const villes = Object.values(state.cities)
    .filter((c) => c.owner === me)
    .sort((a, b) => (a.capital !== b.capital ? (a.capital ? -1 : 1) : compareCityIds(a.id, b.id)));
  const c = villes[0];
  return c ? { q: c.q, r: c.r } : null;
}

/**
 * PAIX-RYTHME · D2 — la cible PONDÉRÉE parmi les candidats donnés (guerre à
 * déclarer : hors guerre ; campagne : ennemis en guerre). score = forces ×
 * (1 + poids × dist(capitales)) ; tri (score, forces, dist, id) R-81. Pur.
 */
export function cibleGuerrePonderee(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  candidats: PlayerId[],
): PlayerId | null {
  const maCapitale = capitaleDe(state, me);
  const scores = candidats.map((id) => {
    const forces = forcesDe(state, id);
    const sesVilles = Object.values(state.cities)
      .filter((c) => c.owner === id)
      .sort((a, b) => compareCityIds(a.id, b.id));
    const saCapitale =
      sesVilles.find((c) => c.capital) ?? sesVilles[0];
    const d = maCapitale && saCapitale ? dist(state, maCapitale, saCapitale) : 0;
    return { id, forces, d, score: forces * (1 + profile.poidsDistanceCibleGuerre * d) };
  });
  scores.sort(
    (a, b) => a.score - b.score || a.forces - b.forces || a.d - b.d || (a.id < b.id ? -1 : 1),
  );
  return scores[0]?.id ?? null;
}

/**
 * BOT-ARMEE · D6 — seuil de guerre modulé par l'AGRESSIVITÉ de la civ :
 * seuil effectif = seuilRatioGuerre × (1 + modulation × (1 − 2 ×
 * agressivite)). Les agressives (agressivite > 0,5) abaissent leur seuil
 * (elles attaquent des voisins ÉGAUX), les pacifiques le relèvent (elles
 * exigent l'écrasement). Pur.
 */
export function seuilGuerreEffectif(profile: BotProfileData, agressivite: number): number {
  return profile.seuilRatioGuerre * (1 + profile.modulationSeuilAgressivite * (1 - 2 * agressivite));
}

/**
 * D1 · Décision de DÉCLARATION de guerre : tour ≥ tourMinGuerre, délai
 * depuis la dernière guerre écoulé, ma capitale existe, rapport de forces
 * ≥ seuil du profil, puis TIRAGE seedé < agressivité de MA civ × facteur du
 * profil. Retourne la cible (voisin le plus faible, D2) ou null. Pur :
 * ne consomme le RNG que par un appel à next (déterminisme R-80).
 */
export function deciderGuerre(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  rng: SeededRng,
  agressivite: number,
): PlayerId | null {
  if (state.turn < profile.tourMinGuerre) return null;
  const derniere = state.diplomacy.dernieresGuerres?.[me];
  if (derniere !== undefined && state.turn - derniere < profile.delaiEntreGuerres) return null;
  const cible = cibleGuerre(state, me, profile);
  if (!cible) return null;
  const mesForces = forcesDe(state, me);
  if (mesForces <= 0) return null;
  const sesForces = forcesDe(state, cible);
  if (mesForces < seuilGuerreEffectif(profile, agressivite) * sesForces) return null;
  if (rng.next() >= agressivite * profile.facteurAgressivite) return null;
  return cible;
}

/**
 * D3 · PAIX-RYTHME (Erik 27/10) — Décision de PAIX du joueur `decideur` face
 * au proposeur, DÉTERMINISTE (chanceAccepteFaible ABROGÉE — jamais
 * déclenchée en 1581 occasions, et le re-tirage par proposition est banni) :
 *   - guerre JAMAIS bataillée (0 bataille comptée) et durée ≥ toursPaixMin
 *     → paix administrative (les guerres vides se ferment au rythme min) ;
 *   - durée ≥ toursPaixGagnant × toursPaixMin → paix du GAGNANT (tout côté
 *     accepte ; les propositions répétées du perdant reçoivent toujours la
 *     même réponse — aucune usure, aucun tirage) ;
 *   - sinon refuse (crédibilité T1, la guerre vivante continue).
 * Pur.
 */
export function deciderPaix(
  state: GameState,
  decideur: PlayerId,
  proposeur: PlayerId,
  profile: BotProfileData,
): boolean {
  if (!areAtWar(state, decideur, proposeur)) return false;
  const duree = dureeGuerre(state, decideur, proposeur);
  if (duree >= profile.toursPaixGagnant * profile.toursPaixMin) return true;
  if (bataillesDe(state, decideur, proposeur) === 0 && duree >= profile.toursPaixMin) return true;
  return false;
}

/** D2 · La capitale ennemie la plus proche de `me` (de SA capitale) :
 *  villes-capitales des ennemis en guerre, tri (distance wrap, id) R-81.
 *  Les objectifs T-A attaquent déjà les cibles adjacentes — la guerre les
 *  nourrit ; celle-ci donne la DIRECTION aux armées excédentaires. */
export function cibleOffensive(state: GameState, me: PlayerId): { q: number; r: number } | null {
  const ennemis = ennemisDe(state, me);
  const maCapitale = Object.values(state.cities).find((c) => c.owner === me && c.capital)
    ?? Object.values(state.cities).find((c) => c.owner === me);
  const origine = maCapitale ?? { q: 0, r: 0 };
  const capitales = Object.values(state.cities)
    .filter((c) => c.capital && c.owner !== me && !isBarbarian(c.owner) && ennemis.has(c.owner))
    .sort((a, b) => dist(state, origine, a) - dist(state, origine, b) || (a.id < b.id ? -1 : 1));
  return capitales[0] ? { q: capitales[0].q, r: capitales[0].r } : null;
}

// ---------------------------------------------------------------------------
// BOT-ARMEE (décisions Erik 26/10) — D1/D2 : la guerre vraie. Le bot raisonne
// en ARMÉE : une campagne vise la ville ennemie LA PLUS PROCHE (pas la
// capitale d'office), une armée de `tailleArmee` unités (data) se rassemble
// au point de ralliement AVANT d'attaquer, puis marche et assiège. La
// campagne PERSISTE par construction : cible et membres sont des fonctions
// PURES de l'état (déterminisme R-81) — pas d'état caché, l'armée ne se
// disperse pas d'un tour à l'autre ; le rappel passe par la garnison
// (BOT-EXPLORATION D3 : urgence capitale → quota complet → les membres sont
// absorbés AVANT d'atteindre le bloc offensif). D3 : hors le détachement,
// garnisons/patrouilles/économie T-A/T-B inchangées.
// ---------------------------------------------------------------------------

/** D2 · Cible de campagne = la cible de GUERRE (PAIX-RYTHME, Erik 27/10) :
 *  parmi les ennemis en guerre (hors barbares) la cible pondérée (D2), puis
 *  SA ville la plus proche de ma capitale — tri (distance wrap, id) R-81.
 *  Null sans guerre. */
export function cibleCampagne(
  state: GameState,
  me: PlayerId,
  profile?: BotProfileData,
): { q: number; r: number; cityId: string } | null {
  const ennemis = ennemisDe(state, me);
  const prof = profile ?? BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
  const enGuerre = [...ennemis].filter(
    (id) => !isBarbarian(id) && Object.values(state.cities).some((c) => c.owner === id),
  );
  const cible = cibleGuerrePonderee(state, me, prof, enGuerre);
  if (!cible) return null;
  const maCapitale = capitaleDe(state, me);
  const origine = maCapitale ?? { q: 0, r: 0 };
  const villes = Object.values(state.cities)
    .filter((c) => c.owner === cible)
    .sort((a, b) => dist(state, origine, a) - dist(state, origine, b) || compareCityIds(a.id, b.id));
  const v = villes[0];
  return v ? { q: v.q, r: v.r, cityId: v.id } : null;
}

/**
 * PAIX-RYTHME · conscription de garnison par appariement GLOBAL : répéter
 * tant qu'une ville manque, en brouillant le couple (ville, unité) AU PLUS
 * PRES — l'ancien parcours par ordre d'id rappelait les MARCHEURS de
 * campagne (premiers ids traités) pendant que les recrues à domicile
 * restaient chez elles, et l'armée se vidait en marche (sonde 27/10 :
 * effectif au rayon plafonné à 1-2, fusion impossible). Les défenseurs EN
 * PLACE ne sont jamais brouillés (D3 : garnisons stables) ; le scout hors
 * urgence part en patrouille (pool). Pur, déterministe (R-81 : tie cityId
 * puis unitId).
 */
export function planGarnison(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
): { drafts: Map<string, string>; pool: Unit[] } {
  const mine = Object.values(state.units)
    .filter((u) => u.owner === me)
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81
  const myCities = Object.values(state.cities)
    .filter((c) => c.owner === me)
    .sort((a, b) => (a.capital !== b.capital ? (a.capital ? -1 : 1) : compareCityIds(a.id, b.id)));
  const estCombattante = (u: Unit): boolean =>
    !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false) && UNIT_TYPES[u.type]?.aquatic !== true;
  const scoutId = mine.find((u) => estCombattante(u))?.id;
  const defenseurs = new Map<string, number>();
  for (const c of myCities) {
    defenseurs.set(
      c.id,
      mine.filter((u) => estCombattante(u) && u.id !== scoutId && u.q === c.q && u.r === c.r).length,
    );
  }
  const capitale = myCities[0];
  const ennemis = ennemisDe(state, me);
  const urgence =
    ennemis.size > 0 ||
    (capitale ? menaceAutourCapitale(state, capitale, me, ennemis, profile.rayonMenace) : false);
  const quotaCap = quotaCapitale(profile, mine.length, urgence);
  const besoinDe = (c: City): number => (c.capital ? quotaCap : profile.garnisonsParVille);
  // BOT-ARMEE · les défenseurs EN PLACE (comptés dans le quota) ne sont
  // JAMAIS du pool — sinon la garnison se vide en campagne alors que le
  // quota la croit toujours là (D3 : garnisons stables).
  const enPlace = new Set<string>();
  for (const c of myCities) {
    for (const u of mine) {
      if (u.id !== scoutId && estCombattante(u) && u.q === c.q && u.r === c.r) enPlace.add(u.id);
    }
  }
  // BOT-EXPLORATION : hors urgence le scout n'est ni brouillé ni poolé ici
  // (patrouille — rajouté au pool plus bas) ; en guerre/urgence il est
  // mobilisable comme les autres (rappel D3).
  const disponibles = mine.filter(
    (u) => estCombattante(u) && !enPlace.has(u.id) && (urgence || u.id !== scoutId),
  );
  const brouillon = myCities
    .map((c) => ({ ville: c, n: besoinDe(c) - (defenseurs.get(c.id) ?? 0) }))
    .filter((b) => b.n > 0);
  if (process.env.DBG_GARN) console.log('[garn] urgence', urgence, 'quotaCap', quotaCap, 'brouillon', brouillon.map((b) => `${b.ville.id}:${b.n}`), 'dispo', disponibles.map((u) => u.id));
  const drafts = new Map<string, string>();
  // BOT-EXPLORATION D3 : à l'URGENCE, le scout RENTRE — brouillé d'office
  // sur la capitale si elle manque (canon du rappel immédiat).
  if (urgence && scoutId) {
    const cap = myCities[0];
    const entree = cap ? brouillon.find((b) => b.ville.id === cap.id) : undefined;
    if (entree && entree.n > 0) {
      drafts.set(scoutId, cap!.id);
      entree.n -= 1;
    }
  }
  // Appariement global : villes en ordre canonique (capitale d'abord —
  // canon T-A), puis pour chacune les unités AU PLUS PRES (tie unitId —
  // R-81). Les recrues à domicile comblent ainsi leur ville pendant que les
  // marcheurs de campagne continuent leur route.
  // PAIX-RYTHME : une unité AU CONTACT d'une ville ennemie (dist ≤
  // rayonRalliement — elle assiège) n'est brouillée qu'en DERNIER recours :
  // la distance effective la relègue derrière toute recrue disponible
  // (déterministe, R-81).
  const villesEnnemies = Object.values(state.cities).filter((c) => c.owner !== me && !isBarbarian(c.owner));
  const auContactEnnemi = (u: Unit): boolean =>
    villesEnnemies.some((c) => dist(state, u, c) <= profile.rayonRalliement);
  for (const b of brouillon) {
    for (let k = 0; k < b.n; k++) {
      let best: Unit | null = null;
      let bestD = Infinity;
      for (const u of disponibles) {
        if (drafts.has(u.id)) continue;
        const d = dist(state, u, b.ville) + (auContactEnnemi(u) ? 1000 : 0);
        if (d < bestD || (d === bestD && best && compareUnitIds(u.id, best.id) < 0)) {
          bestD = d;
          best = u;
        }
      }
      if (!best) break;
      drafts.set(best.id, b.ville.id);
    }
  }
  const pool = disponibles.filter((u) => !drafts.has(u.id));
  // BOT-EXPLORATION D1 : hors urgence, le scout PATROUILLE — il est du pool
  // (jamais brouillé ci-dessus), l'urgence le rappelle via le quota plein.
  if (capitale && !urgence && scoutId) {
    const scout = mine.find((u) => u.id === scoutId);
    if (scout) pool.push(scout);
  }
  return { drafts, pool };
}

/** D1 · Pool EXCÉDENTAIRE : les combattantes terrestres qui restent APRÈS le
 *  remplissage de garnison (planGarnison — appariement global au plus près,
 *  PAIX-RYTHME). Pur, déterministe. */
export function poolExcedentaire(state: GameState, me: PlayerId, profile: BotProfileData): Unit[] {
  return planGarnison(state, me, profile).pool;
}

/** D1 · Les `tailleArmee` unités excédentaires LES PLUS PROCHES de la cible
 *  (ties id, R-81) forment l'armée. Pur, déterministe. */
export function assignerArmee(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  cible: { q: number; r: number } | null,
): Set<string> {
  const armee = new Set<string>();
  if (!cible) return armee;
  const pool = poolExcedentaire(state, me, profile);
  return new Set(
    pool
      .slice()
      .sort((a, b) => dist(state, a, cible) - dist(state, b, cible) || compareUnitIds(a.id, b.id))
      .slice(0, profile.tailleArmee)
      .map((u) => u.id),
  );
}

/** D1 · Les hex de l'ANNEAU de ralliement : cases praticables (hors villes)
 *  à exactement `rayonRalliement` de la cible, triées (distance à MA
 *  capitale, q, r — R-81). L'anneau est GÉOMÉTRIQUE — SANS exclusion des
 *  cases occupées : la liste doit rester STABLE d'un tour à l'autre (une
 *  case occupée par un co-membre fait déjà partie du rassemblement) ; un
 *  arrivant bloqué s'arrête juste devant (R-30). Pur, déterministe. */
export function anneauRalliement(
  state: GameState,
  cible: { q: number; r: number },
  me: PlayerId,
  profile: BotProfileData,
): Array<{ q: number; r: number }> {
  const maCapitale = Object.values(state.cities).find((c) => c.owner === me && c.capital)
    ?? Object.values(state.cities).find((c) => c.owner === me);
  const origine = maCapitale ?? { q: 0, r: 0 };
  const villes = Object.values(state.cities);
  const out: Array<{ q: number; r: number; d: number }> = [];
  for (const [key, tile] of Object.entries(state.map)) {
    const parts = key.split(',');
    const hex = { q: Number(parts[0]), r: Number(parts[1]) };
    if (hexDistanceW(hex, cible, state.mapWidth) !== profile.rayonRalliement) continue;
    if (!TERRAINS[tile.terrain]?.passable) continue;
    if (villes.some((c) => c.q === hex.q && c.r === hex.r)) continue;
    out.push({ q: hex.q, r: hex.r, d: dist(state, hex, origine) });
  }
  return out
    .sort((a, b) => a.d - b.d || a.q - b.q || a.r - b.r)
    .map((h) => ({ q: h.q, r: h.r }));
}

/** D1 · Point de RALLIEMENT : la TÊTE de l'anneau (PAIX-RYTHME : le
 *  ralliement est RÉPARTI sur l'anneau — voir anneauRalliement). Repli : la
 *  cible elle-même (île sans rivage praticable 🔶). */
export function pointRalliement(
  state: GameState,
  cible: { q: number; r: number },
  me: PlayerId,
  profile: BotProfileData,
): { q: number; r: number } {
  return anneauRalliement(state, cible, me, profile)[0] ?? { q: cible.q, r: cible.r };
}

/**
 * PAIX-RYTHME (Erik 27/10, D1 — CANON R-31) · Groupes de FUSION de siège :
 * parmi les membres de l'armée AU RAYON de la campagne, les trios HOMOGÈNES
 * (même type, hors armées — une armée ne re-fusionne pas) forment des
 * groupes ; le point de rendez-vous = l'hex du membre le plus PROCHE de la
 * campagne (tie-break id, R-81). La fusion passe par l'ordre canon
 * FormArmy (3 membres mêmes type, A/D somme, PV ≤ 9) — le moteur revalide.
 * Pur, déterministe.
 */
export interface GroupeFusion {
  membres: [string, string, string];
  rdv: { q: number; r: number };
}

export function groupesFusion(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  campagne: { q: number; r: number } | null,
): GroupeFusion[] {
  if (!campagne) return [];
  const armee = assignerArmee(state, me, profile, campagne);
  const membres = Object.values(state.units)
    .filter(
      (u) =>
        u.owner === me && !u.aboard && !u.isArmy && armee.has(u.id) &&
        dist(state, u, campagne) <= profile.rayonRalliement,
    )
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81
  const parType = new Map<string, typeof membres>();
  for (const u of membres) {
    const l = parType.get(u.type) ?? [];
    l.push(u);
    parType.set(u.type, l);
  }
  const groupes: GroupeFusion[] = [];
  // Types dans l'ordre du tri par id (déterministe) ; paquets consécutifs de 3.
  for (const type of [...parType.keys()].sort()) {
    const l = parType.get(type)!;
    for (let i = 0; i + ARMY_SIZE <= l.length; i += ARMY_SIZE) {
      const trio = l.slice(i, i + ARMY_SIZE);
      const rdv = trio
        .slice()
        .sort(
          (a, b) =>
            dist(state, a, campagne) - dist(state, b, campagne) || compareUnitIds(a.id, b.id),
        )[0]!;
      groupes.push({
        membres: [trio[0]!.id, trio[1]!.id, trio[2]!.id],
        rdv: { q: rdv.q, r: rdv.r },
      });
    }
  }
  return groupes;
}

// ---------------------------------------------------------------------------
// BOT-TA · D1 — assignation d'objectifs (pure, séparée de l'émission).
// ---------------------------------------------------------------------------

export type ObjectifKind =
  | 'soigner'
  | 'attaquer'
  | 'repli'
  | 'garnison'
  | 'patrouiller'
  | 'chasser'
  | 'explorer'
  | 'debarquer'
  | 'espion'
  | 'offensiver'
  | 'rallier'
  | 'fusionner'
  | 'converger'
  | 'tenir';

export interface Objectif {
  kind: ObjectifKind;
  /** Cible hexagonale (attaque, chasse, exploration, repli, convergence). */
  cible?: { q: number; r: number };
  /** Ville visée (garnison) ou cible d'espionnage. */
  cityId?: string;
  /** PAIX-RYTHME D1 : membres du trio de fusion (tri id, R-81) — l'émission
   *  porte le FormArmy depuis le premier membre. */
  membres?: string[];
}

/** Une cible d'attaque adjacente : unité ennemie ou ville ennemie sans
 *  défenseur sur sa case (capture par entrée). */
interface CibleAttaque {
  hex: { q: number; r: number };
  sDef: number;
  /** Priorité de ciblage : capture de ville > gardien de camp > unité. */
  priorite: number;
}

/** Ensemble des joueurs en guerre avec `me` (R-187 — paix par défaut). */
function ennemisDe(state: GameState, me: PlayerId): Set<PlayerId> {
  const out = new Set<PlayerId>();
  for (const [a, b] of state.diplomacy.war) {
    if (a === me) out.add(b);
    if (b === me) out.add(a);
  }
  return out;
}

/** Cibles d'attaque ADJACENTES (à portée de ce tour — 🔶 le pas d'approche
 *  + attaque en une tour n'est pas planifié). Aquatique : cibles navales
 *  seulement. Barbares R-95 : toujours légitimes ; joueurs : en guerre
 *  seulement (R-187, le bot ne déclare pas — T-C). */
function ciblesAttaquables(
  state: GameState,
  unit: Unit,
  me: PlayerId,
  ennemis: Set<PlayerId>,
  siege = false,
): CibleAttaque[] {
  const stats = UNIT_TYPES[unit.type];
  const aquatic = stats?.aquatic === true;
  const out: CibleAttaque[] = [];
  for (const [dq, dr] of DIRS) {
    const hex = { q: unit.q + dq, r: unit.r + dr };
    const e = ennemiSurHex(state, hex.q, hex.r, me, ennemis);
    if (e) {
      const eAquatic = UNIT_TYPES[e.type]?.aquatic === true;
      if (aquatic !== eAquatic) continue;
      out.push({ hex, sDef: forceDefense(state, e), priorite: isBarbarian(e.owner) ? 1 : 2 });
      continue;
    }
    const ville = Object.values(state.cities).find((c) => c.q === hex.q && c.r === hex.r);
    if (ville && !aquatic && ville.owner !== me && !isBarbarian(ville.owner) && ennemis.has(ville.owner)) {
      const defendue = Object.values(state.units).some((u) => !u.aboard && u.q === hex.q && u.r === hex.r);
      if (!defendue) out.push({ hex, sDef: 0, priorite: 3 }); // ville sans défense : capture
      // 🔴 note : la ville DÉFENDUE est ciblée via l'unité ennemie sur sa
      // case (branche `e` ci-dessus, priorite 2) — en siège, rehaussée plus bas.
    }
  }
  // BOT-ARMEE · siège : quand l'armée est réunie, la GARNISON de la ville
  // passe AVANT les unités de campagne (sinon les assiégeants pourchassent
  // à l'infini les unités qui millent autour — banc 26/10 : 0 attaque de
  // ville en 150 tours, guerres de 68 batailles sans percée).
  if (siege) {
    for (const c of out) if (c.priorite === 2) c.priorite = 5;
  }
  return out;
}

/**
 * D1 · OBJECTIF par unité, réassigné à chaque tour. Priorités :
 * ① soigner (blessé sous le seuil du profil, hors menace, hors territoire
 *   ennemi) → ② attaquer une cible adjacente au rapport favorable (seuil
 *   data-driven) → repli si menace défavorable (D2) → ③ garnisonner (N par
 *   ville, capitale prioritaire) → ④ chasser les barbares (force favorable)
 *   → ⑤ explorer (case la plus lointaine hors vision empire — pas
 *   d'errance) → tenir. Passer jamais (D1-⑥ : le bot n'a pas de badge) ;
 *   vigilance (Sleep) en garnison stable (émission). Pur et déterministe :
 *   tris R-81, tie-breaks (distance, id) — même état ⇒ mêmes objectifs.
 */
export function assignerObjectifs(
  state: GameState,
  playerId: PlayerId,
  profile: BotProfileData,
): Map<string, Objectif> {
  const objectifs = new Map<string, Objectif>();
  const me = state.players[playerId];
  if (!me) return objectifs;
  const ennemis = ennemisDe(state, playerId);

  const mine = Object.values(state.units)
    .filter((u) => u.owner === playerId)
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81
  const myCities = Object.values(state.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => {
      if (a.capital !== b.capital) return a.capital ? -1 : 1; // capitale prioritaire
      return compareCityIds(a.id, b.id);
    });

  // Garnison : défenseurs PRÉSENTS (unités de combat sur la case) + unités
  // déjà assignées — les besoins sont comblés capitale d'abord.
  const estCombattante = (u: Unit): boolean =>
    !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false) && UNIT_TYPES[u.type]?.aquatic !== true;
  // BOT-EXPLORATION : le scout (première combattante, R-81) ne compte JAMAIS
  // comme défenseur présent — il patrouille (D1), la garnison est pour les autres.
  const scoutId = mine.find((u) => estCombattante(u))?.id;
  const defenseurs = new Map<string, number>();
  for (const c of myCities) {
    defenseurs.set(
      c.id,
      mine.filter((u) => estCombattante(u) && u.id !== scoutId && u.q === c.q && u.r === c.r).length,
    );
  }
  const besoinDeVille = (c: City): number => (c.capital ? profile.garnisonsCapitale : profile.garnisonsParVille);

  // BOT-EXPLORATION D1/D2/D3 : quota DYNAMIQUE de la capitale (0 à 1 unité,
  // 1 ensuite, profil complet au renfort) — relevé par toute urgence (D3).
  const capitale = myCities[0]; // triée : capitale d'abord (sinon première ville)
  const urgence =
    ennemis.size > 0 ||
    (capitale ? menaceAutourCapitale(state, capitale, playerId, ennemis, profile.rayonMenace) : false);
  const quotaCap = quotaCapitale(profile, mine.length, urgence);
  const besoinDe = (c: City): number => (c.capital ? quotaCap : besoinDeVille(c));
  // PAIX-RYTHME · PAIX-RYTHME conscription : brouillon global (ville, unité)
  // au plus près — miroir exact de planGarnison (le pool en est le complément).
  const drafts = planGarnison(state, playerId, profile).drafts;

  // Proies barbares (R-95) : unités vivantes, triées par id (R-81) — la
  // distance est évaluée par unité chasseuse au moment du choix.
  const barbares = Object.values(state.units)
    .filter((u) => isBarbarian(u.owner) && !u.aboard)
    .sort((a, b) => compareUnitIds(a.id, b.id));

  const vision = new Set(me.vision.visible ?? []);

  // BOT-ARMEE · D1/D2 : en guerre, l'ARMÉE (tailleArmee excédentaires les
  // plus proches de la cible de campagne — la ville ennemie la plus proche,
  // PAS la capitale d'office) se rassemble au point de ralliement AVANT
  // d'attaquer ; complète, elle marche et assiège. L'effectif compte les
  // membres vivants au rayon de ralliement ; requis = min(tailleArmee,
  // membres vivants) — une armée entamée garde sa poussée (anéantissement
  // partiel ≠ campement éternel). Hors armée, l'excédent garde les objectifs
  // T-A (chasse/exploration) — D3, seul le détachement part en campagne.
  const campagne = ennemis.size > 0 ? cibleCampagne(state, playerId, profile) : null;
  const armee = campagne ? assignerArmee(state, playerId, profile, campagne) : new Set<string>();
  const membresArmee = campagne
    ? Object.values(state.units).filter((u) => u.owner === playerId && armee.has(u.id) && !u.aboard)
    : [];
  // PAIX-RYTHME · D1 (canon R-31) : au siège, les trios homogènes de
  // l'armée FUSENT — la conquête passe par la mécanique canon FormArmy.
  const fusionDe = new Map<string, GroupeFusion>();
  if (campagne) {
    for (const g of groupesFusion(state, playerId, profile, campagne)) {
      for (const id of g.membres) fusionDe.set(id, g);
    }
  }

  for (const unit of mine) {
    const stats = UNIT_TYPES[unit.type];
    // R-117 : embarquée → débarquement (émission).
    if (unit.aboard) {
      objectifs.set(unit.id, { kind: 'debarquer' });
      continue;
    }
    // R-119 : espion en mission (émission) — sinon il explore comme les autres.
    if (stats?.spy) {
      const target = spyTarget(unit, state, playerId);
      if (target) {
        objectifs.set(unit.id, { kind: 'espion', cityId: target.id });
        continue;
      }
    }
    // ICBM : jamais déplacée par la tactique (arme stratégique R-139 — T-C).
    if (unit.type === 'icbm') {
      objectifs.set(unit.id, { kind: 'tenir' });
      continue;
    }

    const menace = menaceAdjacente(state, unit, playerId, ennemis);

    // ① soigner.
    if (unit.hp < (stats?.hpMax ?? 3) && unit.hp <= profile.seuilSoinPv && !menace && !enTerritoireEnnemi(state, playerId, unit)) {
      objectifs.set(unit.id, { kind: 'soigner' });
      continue;
    }

    // BOT-ARMEE · siège actif : membre d'armée, campagne complète → la
    // garnison ennemie est prioritaire (voir ciblesAttaquables).
    const enSiege =
      campagne !== null && armee.has(unit.id) &&
      membresArmee.filter((m) => dist(state, m, campagne) <= profile.rayonRalliement).length >=
        Math.min(profile.tailleArmee, membresArmee.length);

    // PAIX-RYTHME · D1 : membre d'un trio de fusion — la formation d'armée
    // (canon R-31) passe AVANT l'attaque (Erik : former l'armée, PUIS
    // assiéger). Co-localisé au rendez-vous → fusionner ; sinon converger.
    const fusion = fusionDe.get(unit.id);
    if (fusion && campagne) {
      objectifs.set(
        unit.id,
        fusion.rdv.q === unit.q && fusion.rdv.r === unit.r
          ? { kind: 'fusionner', cible: fusion.rdv, membres: fusion.membres }
          : { kind: 'converger', cible: fusion.rdv, membres: fusion.membres },
      );
      continue;
    }

    // ② attaquer une cible adjacente au rapport favorable.
    const sAtt = forceAttaque(unit);
    const cibles = ciblesAttaquables(state, unit, playerId, ennemis, enSiege)
      .filter((c) => sAtt > 0 && sAtt >= profile.ratioAttaqueMin * c.sDef)
      .sort((a, b) => b.priorite - a.priorite || a.sDef - b.sDef || a.hex.q - b.hex.q || a.hex.r - b.hex.r);
    if (cibles.length > 0) {
      objectifs.set(unit.id, { kind: 'attaquer', cible: cibles[0]!.hex });
      continue;
    }

    // D2 : menace défavorable — repli d'un pas vers la ville propre la plus
    // proche (ou tenir sur place si déjà en ville). EXCEPTION BOT-ARMEE : un
    // membre de l'armée NE REPLIE PAS — il presse le siège (rallier/
    // offensiver, plus bas) ; sans cela l'assaut ne part jamais.
    if (menace && !armee.has(unit.id)) {
      const ici = surVillePropre(state, unit, playerId);
      if (ici) {
        objectifs.set(unit.id, { kind: 'garnison', cityId: ici.id });
        continue;
      }
      const refuge = myCities
        .slice()
        .sort((a, b) => dist(state, unit, a) - dist(state, unit, b) || compareCityIds(a.id, b.id))[0];
      if (refuge) {
        objectifs.set(unit.id, { kind: 'repli', cible: { q: refuge.q, r: refuge.r }, cityId: refuge.id });
        continue;
      }
    }

    // BOT-EXPLORATION D1 : hors urgence, le scout PATROUILLE en boucle autour
    // de la capitale au lieu de garnisonner (priorité entre ② et ③ — il n'abandonne
    // la boucle que pour soigner, attaquer ou replier).
    if (capitale && !urgence && scoutId === unit.id && estCombattante(unit)) {
      const wp = prochainWaypointPatrouille(capitale, unit, profile.rayonPatrouille, state.mapWidth);
      objectifs.set(unit.id, { kind: 'patrouiller', cible: wp });
      continue;
    }

    // ③ garnisonner (unités de combat terrestres seulement) — PAIX-RYTHME :
    // brouillon GLOBAL au plus près (miroir planGarnison) ; les marcheurs de
    // campagne ne sont plus rappelés quand une recrue à domicile convient.
    const draftVille = drafts.get(unit.id);
    if (estCombattante(unit) && draftVille) {
      objectifs.set(unit.id, { kind: 'garnison', cityId: draftVille });
      continue;
    }

    // BOT-ARMEE · D1/D2 : le détachement de campagne — rallier (incomplète)
    // ou offensiver (complète) vers la ville la plus proche. Les cibles
    // adjacentes (② ) restent prises en route par la re-assignation.
    // PAIX-RYTHME · ralliement RÉPARTI : chaque membre reçoit UN hex distinct
    // de l'anneau (rang du membre — tri distance/id R-81) — le rendez-vous
    // unique embouteillait la colonne à dist 3-5 (sonde 27/10 : 1 seul membre
    // au rayon, l'armée empilée derrière) et la fusion n'arrivait jamais.
    if (estCombattante(unit) && campagne && armee.has(unit.id)) {
      const effectif = membresArmee.filter((m) => dist(state, m, campagne) <= profile.rayonRalliement).length;
      const requis = Math.min(profile.tailleArmee, membresArmee.length);
      if (effectif >= requis) {
        objectifs.set(unit.id, { kind: 'offensiver', cible: { q: campagne.q, r: campagne.r }, cityId: campagne.cityId });
      } else {
        const anneau = anneauRalliement(state, campagne, playerId, profile);
        // Rang par DISTANCE (approche du bon côté — chaque membre reçoit un
        // hex de l'anneau dans SA direction d'arrivée), tie id (R-81).
        const rang = membresArmee
          .slice()
          .sort(
            (a, b) =>
              dist(state, a, campagne) - dist(state, b, campagne) || compareUnitIds(a.id, b.id),
          )
          .findIndex((m) => m.id === unit.id);
        const hex = anneau.length > 0 ? anneau[((rang % anneau.length) + anneau.length) % anneau.length]! : pointRalliement(state, campagne, playerId, profile);
        objectifs.set(unit.id, { kind: 'rallier', cible: hex, cityId: campagne.cityId });
      }
      continue;
    }

    // ④ chasser les barbares : proie la plus proche prenable (ratio
    // favorable — sinon D2 s'applique et l'unité ne se suicide pas).
    if (estCombattante(unit) || stats?.aquatic) {
      const proie = barbares
        .slice()
        .sort((a, b) => dist(state, unit, a) - dist(state, unit, b) || compareUnitIds(a.id, b.id))
        .find((b) => sAtt >= profile.ratioAttaqueMin * forceDefense(state, b));
      if (proie) {
        objectifs.set(unit.id, { kind: 'chasser', cible: { q: proie.q, r: proie.r } });
        continue;
      }
    }

    // ⑤ explorer : la case la plus lointaine NON couverte par la vision
    // empire (deterministe : distance desc, clé asc) — pas d'errance.
    let meilleure: { q: number; r: number } | null = null;
    let bestD = -1;
    let bestKey = '';
    for (const [key, tile] of Object.entries(state.map)) {
      if (vision.has(key)) continue;
      const parts = key.split(',');
      const hex = { q: Number(parts[0]), r: Number(parts[1]) };
      if (!TERRAINS[tile.terrain]?.passable && !(stats?.aquatic && TERRAINS[tile.terrain]?.navalAccess)) continue;
      const d = dist(state, unit, hex);
      if (d > bestD || (d === bestD && key < bestKey)) {
        bestD = d;
        bestKey = key;
        meilleure = hex;
      }
    }
    if (meilleure) objectifs.set(unit.id, { kind: 'explorer', cible: meilleure });
    else objectifs.set(unit.id, { kind: 'tenir' });
  }
  return objectifs;
}

/**
 * R-122 · Le régime à adopter — République dès Code des lois, puis Démocratie
 * ou Communisme selon les rendements d'empire, LORSQUE la tech a été
 * complétée CE tour (bascule sans Anarchie). Sinon : null (le bot évite de
 * payer un tour d'Anarchie). Miroir bot.mjs `pickGovernment`.
 */
function pickGovernment(
  player: GameState['players'][PlayerId],
  myCities: City[],
  state: GameState,
): string | null {
  const fresh = player.techsUnlockedThisTurn ?? [];
  const current = player.government ?? 'despotisme';
  const canFree = (id: string): boolean => {
    const tech = GOVERNMENTS[id]?.tech;
    return current !== id && (!tech || fresh.includes(tech));
  };
  if (canFree('republique')) return 'republique';
  let commerce = 0;
  let production = 0;
  for (const c of myCities) {
    for (const key of [...c.workedTiles, `${c.q},${c.r}`]) {
      const tile = state.map[key];
      const y = tile && TERRAINS[tile.terrain]?.yields;
      if (!y) continue;
      commerce += y.commerce ?? 0;
      production += y.production ?? 0;
    }
  }
  if (commerce >= production && canFree('democratie')) return 'democratie';
  if (production > commerce && canFree('communisme')) return 'communisme';
  if (canFree('democratie')) return 'democratie';
  if (canFree('communisme')) return 'communisme';
  return null;
}

/** R-124 : un composant du vaisseau manquant (fin d'arbre — Vol spatial). */
function missingShipComponent(myCities: City[]): string | null {
  const batis = new Set(myCities.flatMap((c) => c.buildings ?? []));
  return SHIP_COMPONENTS.find((id) => !batis.has(id)) ?? null;
}

/** R-117 · débarquement — première case terrestre connue, LIBRE, adjacente
 *  (ordre canonique des directions — déterministe). */
function landStep(unit: Unit, state: GameState): { q: number; r: number } | null {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const tile = state.map[`${q},${r}`];
    if (!tile) continue;
    if (!TERRAINS[tile.terrain]?.passable) continue;
    if (unitAtHex(state, q, r)) continue;
    return { q, r };
  }
  return null;
}

/** R-119 · ville ennemie adjacente avec un GP installé à voler. */
function spyTarget(unit: Unit, state: GameState, myEngineId: PlayerId): City | null {
  for (const [dq, dr] of DIRS) {
    const q = unit.q + dq;
    const r = unit.r + dr;
    const city = Object.values(state.cities).find((c) => c.q === q && c.r === r && c.owner !== myEngineId);
    if (!city) continue;
    // GP installés dérivables : jalons du propriétaire − merveilles de l'empire.
    const wonders = Object.values(state.cities)
      .filter((c) => c.owner === city.owner)
      .flatMap((c) => c.wonders ?? []).length;
    const gpInstalled = Math.max(0, (state.players[city.owner]?.cultureMilestones ?? 0) - wonders);
    if (gpInstalled > 0) return city;
  }
  return null;
}

/** R-117 · la ville est-elle côtière (adjacente à une case d'eau connue) ? */
function isCoastal(city: City, state: GameState): boolean {
  for (const [dq, dr] of DIRS) {
    const tile = state.map[`${city.q + dq},${city.r + dr}`];
    if (tile && TERRAINS[tile.terrain]?.navalAccess) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// BOT-TB (décisions Erik 24/10) — arbitres ÉCONOMIQUES (D1-D4). Fonctions
// pures séparées de l'émission ; miroirs exacts des formules moteur
// (tileYield/workRadiusOf/workableTilesFor pour D1, canSetProduction pour
// D2, l'arbre TECHS pour D3, rushBuyCostOf pour D4). Seuils et poids :
// bot.json (bloc `economie` + `objectifRecherche` par profil).
// ---------------------------------------------------------------------------

/** Accès au bloc économie (bot.json). */
export function ecoDuBot(): BotEconomieData {
  return BOT_SETTINGS.economie;
}

/** Poids de pondération des rendements pour une ville (D1) :
 *  - nourriture si la ville peut encore croître (seuil non nul) ;
 *  - marteaux de guerre si en guerre OU production militaire en tête de file ;
 *  - or seulement si trésorerie basse (seuil data-driven).
 *  Pur, déterministe. */
export function poidsVille(
  state: GameState,
  city: City,
  player: GameState['players'][PlayerId],
  eco: BotEconomieData,
  enGuerre: boolean,
): { food: number; production: number; commerce: number } {
  const militaireEnTete =
    city.production?.item.kind === 'unit' && (UNIT_TYPES[city.production.item.id]?.canAttack ?? false);
  return {
    food: growthThresholdFor(city.pop) === null ? 0 : eco.poidsNourriture,
    production: enGuerre || militaireEnTete ? eco.poidsMarteauxGuerre : eco.poidsMarteaux,
    commerce: player.treasury < eco.seuilTresorerieBasse ? eco.poidsOr : 0,
  };
}

/** D1 · Plan optimal de worked tiles : les `pop` meilleures cases libres par
 *  score pondéré (rendements EFFECTIFS — miroir tileYield : bâtiments,
 *  merveilles, ressources, union des techs et traits civ comme le moteur).
 *  Tie-break clé croissant (R-81). Pur : ne mute jamais l'état. */
export function planWorkedTiles(
  state: GameState,
  city: City,
  player: GameState['players'][PlayerId],
  poids: { food: number; production: number; commerce: number },
  opts: { reserveInterieurs?: number; marteauxMin?: number } = {},
): TileKey[] {
  const reserveInterieurs = opts.reserveInterieurs ?? 0;
  const marteauxMin = opts.marteauxMin ?? 0;
  const autresVilles = Object.values(state.cities)
    .filter((c) => c.id !== city.id)
    .map((c) => ({ q: c.q, r: c.r }));
  const prises = new Set<TileKey>(
    Object.values(state.cities).flatMap((c) => (c.id === city.id ? [] : c.workedTiles)),
  );
  const allTechs = allKnownTechs(state);
  const civ = { civId: player.civId, era: player.era };
  const radius = workRadiusOf(city.buildings);
  const candidates = workableTilesFor(state.map, autresVilles, city, radius, state.mapWidth)
    .filter((key) => !prises.has(key))
    .map((key) => {
      const y = tileYield(state.map, city.buildings, key, player.techsUnlocked ?? [], city.wonders ?? [], allTechs, civ);
      const score = y ? poids.food * y.food + poids.production * y.production + poids.commerce * y.commerce : -1;
      return { key, score, production: y?.production ?? 0 };
    });
  const picks = candidates
    .slice()
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.max(0, city.pop - reserveInterieurs));
  // BOT-TB · garantie de marteaux BRUTS (miroir processEconomy : les citoyens
  // intérieurs ne produisent plus de marteaux directs — R-60bis rév. 10/10) :
  // un plan tout-nourriture (prairies 2N/0P) ne ferait JAMAIS avancer la file.
  // Correction déterministe : on échange les tuiles choisies au score le plus
  // faible contre les meilleures productrices restantes, jusqu'au quota data.
  let marteaux = picks.reduce((s, p) => s + p.production, 0);
  if (marteaux < marteauxMin) {
    const productrices = candidates
      .filter((c) => !picks.includes(c) && c.production > 0)
      .sort((a, b) => b.production - a.production || b.score - a.score || (a.key < b.key ? -1 : 1));
    for (const cand of productrices) {
      if (marteaux >= marteauxMin) break;
      if (picks.length === 0) picks.push(cand);
      else {
        // la moins utile des choisies : production croissante puis score croissant
        let worst = 0;
        for (let i = 1; i < picks.length; i++) {
          const a = picks[i]!;
          const w = picks[worst]!;
          if (a.production < w.production || (a.production === w.production && a.score < w.score)) worst = i;
        }
        if (picks[worst]!.production >= cand.production) break; // rien à gagner
        picks[worst] = cand;
      }
      marteaux += cand.production;
    }
  }
  return picks
    .map((c) => c.key)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // R-81 : sortie triée
}

/** D2 · L'item de production est-il PRIORITAIRE pour le rush (D4) :
 *  unité de combat en guerre ou sous menace, ou colon (expansion). */
export function rushPrioritaire(
  item: ProductionItem,
  enGuerre: boolean,
  menace: boolean,
): boolean {
  if (item.kind !== 'unit') return false;
  if (item.id === 'colon') return true;
  return (enGuerre || menace) && (UNIT_TYPES[item.id]?.canAttack ?? false);
}

/**
 * D3 · Prochaine tech du bot — plus de hasard. Objectif par profil :
 * « militaire »/« economique » → chaîne complète de prérequis vers la tech
 * clé (bot.json) ; « auto » → tech de l'ère suivante à la chaîne la moins
 * chère (somme des coûts de la fermeture de prérequis manquants). Le choix
 * courant = une tech de la fermeture DONT LES PRÉREQUIS SONT SATISFAITS
 * (légal immédiatement), minimisant le coût des dépendances manquantes
 * restantes vers l'objectif, tie-break id croissant (R-81). Null si tout
 * est débloqué.
 */
export function prochaineTech(
  player: GameState['players'][PlayerId],
  profile: BotProfileData,
  eco: BotEconomieData,
): string | null {
  const unlocked = new Set(player.techsUnlocked ?? []);
  const fermeture = (cible: string): Set<string> => {
    const manquants = new Set<string>();
    const visite = new Set<string>();
    const pile = [cible];
    while (pile.length > 0) {
      const id = pile.pop()!;
      if (visite.has(id) || unlocked.has(id)) continue;
      visite.add(id);
      const t = TECHS[id];
      if (!t) continue;
      manquants.add(id);
      for (const p of t.prereqs) pile.push(p);
    }
    return manquants;
  };

  let cible: string | null = null;
  if (profile.objectifRecherche === 'militaire') cible = eco.techMilitaireCle;
  else if (profile.objectifRecherche === 'economique') cible = eco.techEconomiqueCle;
  else {
    // auto : ère suivante, tech à la fermeture la moins chère ; en dernière
    // ère, la moins chère de ce qui reste (fin d'arbre → null).
    const eraActuelle = techEraOf(player.techsUnlocked ?? []);
    const idx = ERA_ORDRE.indexOf(eraActuelle);
    const eraCible = ERA_ORDRE[idx + 1];
    let bestCost = Infinity;
    let bestId: string | null = null;
    for (const t of Object.values(TECHS)) {
      if (unlocked.has(t.id)) continue;
      if (eraCible && t.era !== eraCible) continue;
      if (!eraCible && t.era !== eraActuelle) continue;
      const cout = [...fermeture(t.id)].reduce((s, id) => s + (TECHS[id]?.cost ?? 0), 0);
      if (cout < bestCost || (cout === bestCost && (bestId === null || t.id < bestId))) {
        bestCost = cout;
        bestId = t.id;
      }
    }
    cible = bestId;
  }
  if (!cible || unlocked.has(cible)) return null;
  const manquants = fermeture(cible);
  let choix: string | null = null;
  let bestReste = Infinity;
  for (const id of manquants) {
    const t = TECHS[id]!;
    if (!t.prereqs.every((p) => unlocked.has(p))) continue;
    // Mesure : coût total de la sous-fermeture nécessaire APRÈS id — les
    // manquants qui dépendent (transitivement) de id, plus id lui-même.
    let sous = 0;
    for (const m of manquants) {
      if (m === id || dependDe(m, id)) sous += TECHS[m]?.cost ?? 0;
    }
    if (sous < bestReste || (sous === bestReste && (choix === null || id < choix))) {
      bestReste = sous;
      choix = id;
    }
  }
  return choix;
}

/** La tech `a` dépend-elle (transitivement) de la tech `b` ? */
function dependDe(a: string, b: string): boolean {
  const pile = [...(TECHS[a]?.prereqs ?? [])];
  const vus = new Set<string>();
  while (pile.length > 0) {
    const id = pile.pop()!;
    if (id === b) return true;
    if (vus.has(id)) continue;
    vus.add(id);
    for (const p of TECHS[id]?.prereqs ?? []) pile.push(p);
  }
  return false;
}

/** Ordre croissant des ères (miroir growth.ts — non exporté là-bas). */
const ERA_ORDRE: TechEra[] = ['ancienne', 'medievale', 'industrielle', 'moderne'];

/** D2 · Production pondérée — remplace le tirage aléatoire.
 *  ① besoin militaire (guerre ou barbares actifs proches → meilleure unité
 *  d'attaque disponible) ; ② pop au seuil (ou croissance bloquée) → colon
 *  si aucun colon n'existe déjà dans l'empire ; ③ premier bâtiment
 *  économique manquant (ordre bot.json) ; ④ merveille si l'empire est
 *  pionnier (aucune merveille, première disponible par id, R-129) ;
 *  ⑤ repli = l'ancien tirage aléatoire VALIDE (canSetProduction). */
export function arbitrerProduction(
  city: City,
  player: GameState['players'][PlayerId],
  myCities: City[],
  state: GameState,
  eco: BotEconomieData,
  enGuerre: boolean,
  menace: boolean,
  rng?: SeededRng,
): ProductionItem | null {
  const unlocked = player.techsUnlocked ?? [];
  // Options VALIDES (miroir de l'ancien tirage — le validateur moteur tranche).
  const unitesDisponibles: ProductionItem[] = [];
  const batimentsManquants: ProductionItem[] = [];
  const merveillesDisponibles: ProductionItem[] = [];

  for (const u of Object.values(UNIT_TYPES)) {
    if (u.implemented === false || u.greatPerson || u.strategic) continue;
    if (u.id === 'caravane') continue; // CARAVANE · D4 : le bot n'en produit pas
    if ((u.populationCost ?? 0) > 0 && city.pop < u.populationCost!) continue; // R-112
    if (u.aquatic && !isCoastal(city, state)) continue; // R-117
    if (!canSetProduction({ kind: 'unit', id: u.id }, unlocked, city.buildings, player.civId)) continue;
    unitesDisponibles.push({ kind: 'unit', id: u.id });
  }
  for (const b of Object.values(BUILDINGS)) {
    if (b.fixed || b.implemented === false) continue;
    if (city.buildings.includes(b.id)) continue;
    if (b.replaces && city.buildings.includes(b.replaces)) continue;
    if (!canSetProduction({ kind: 'building', id: b.id }, unlocked, city.buildings, player.civId)) continue;
    batimentsManquants.push({ kind: 'building', id: b.id });
  }
  const empireWonders = new Set(myCities.flatMap((c) => c.wonders ?? []));
  const worldWonders = new Set(Object.values(state.cities).flatMap((c) => c.wonders ?? []));
  const empireChantiers = new Set(
    myCities.filter((c) => c.production?.item.kind === 'wonder').map((c) => c.production!.item.id),
  );
  const obsoleteWonders = new Set<string>();
  for (const techId of unlocked) for (const w of TECHS[techId]?.obsoleteWonders ?? []) obsoleteWonders.add(w);
  for (const w of Object.values(WONDERS)) {
    if (w.implemented === false || w.cultureVictory) continue;
    if (w.tech && !unlocked.includes(w.tech)) continue;
    if (obsoleteWonders.has(w.id)) continue;
    if (empireWonders.has(w.id) || worldWonders.has(w.id) || empireChantiers.has(w.id)) continue;
    if (wonderTreasuryLocked(w.id, player.treasury)) continue; // R-137
    merveillesDisponibles.push({ kind: 'wonder', id: w.id });
  }

  // ① besoin militaire : la meilleure ATTAQUE disponible (tie : coût, id — R-81).
  if (enGuerre || menace) {
    const combattantes = unitesDisponibles
      .filter((o) => o.kind === 'unit' && (UNIT_TYPES[o.id]?.canAttack ?? false) && UNIT_TYPES[o.id]?.aquatic !== true)
      .sort(
        (a, b) =>
          (UNIT_TYPES[b.id]?.attack ?? 0) - (UNIT_TYPES[a.id]?.attack ?? 0) ||
          (UNIT_TYPES[a.id]?.cost ?? 0) - (UNIT_TYPES[b.id]?.cost ?? 0) ||
          (a.id < b.id ? -1 : 1),
      );
    if (combattantes.length > 0) return combattantes[0]!;
  }
  // ② expansion : colon si la ville est « au plafond ou presque » (seuil
  // data) ou bloquée, et si l'empire n'a AUCUN colon en attente de fondation.
  if ((city.pop >= eco.seuilPopColonne || growthThresholdFor(city.pop) === null) &&
      !Object.values(state.units).some((u) => u.owner === player.id && u.type === 'colon' && !u.aboard)) {
    const colon = unitesDisponibles.find((o) => o.kind === 'unit' && o.id === 'colon');
    if (colon) return colon;
  }
  // ③ bâtiment économique : premier de l'ordre data-driven présent dans les
  // manquants (tie par l'ordre lui-même — déterministe).
  for (const id of eco.ordreBatiments) {
    const b = batimentsManquants.find((o) => o.kind === 'building' && o.id === id);
    if (b) return b;
  }
  // ④ merveille si pionnier : l'empire n'en possède AUCUNE — première par id.
  if (empireWonders.size === 0 && merveillesDisponibles.length > 0) {
    return merveillesDisponibles.slice().sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;
  }
  // ⑤ repli : l'ancien tirage aléatoire parmi TOUTES les options valides.
  const options: ProductionItem[] = [
    ...unitesDisponibles,
    ...batimentsManquants,
    ...merveillesDisponibles,
  ];
  if (options.length === 0) return null;
  return rng ? options[rng.nextInt(options.length)]! : options[0]!;
}

// ---------------------------------------------------------------------------
// La politique du bot : état complet + RNG seedé dédié → plan (ordres +
// actions immédiates). BOT-TA/BOT-TB : les ordres d'unités dérivent des
// OBJECTIFS (D1) ; l'économie est arbitrée (T-B). Le moteur revalide tout
// (R-80, §5).
// ---------------------------------------------------------------------------

/**
 * @param difficulte BOT-TD : difficulté de la partie (meta lobby) — profil
 *        data-driven bot.json (`profileDuBot`) ; absent = comportement
 *        historique (profil « normal »).
 */
export function botPolicy(state: GameState, playerId: PlayerId, rng: SeededRng, difficulte?: string): BotPlan {
  const orders: Order[] = [];
  const actions: BotAction[] = [];
  const me = state.players[playerId];
  if (!me) return { orders, actions };
  const profile = profileDuBot(difficulte);

  const mine = Object.values(state.units)
    .filter((u) => u.owner === playerId)
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81 : parcours déterministe

  // CARTE-MULTI · départ COLON (cartes procédurales — R-64) : le bot fonde
  // SA capitale dès qu'il possède un colon sans ville (coût nul sur le site
  // réservé). Sans ceci, le bot restait inerte toute la partie sur ces
  // cartes. Ordre unitaire du même validateur orderShapeError.
  // BOT-FONDATION-MOUVEMENT D1 : la fondation N'INTERROMPT plus la politique —
  // les autres unités reçoivent leurs objectifs dès ce premier tour ; le
  // colon fondateur lui-même ne reçoit que FoundCity (jamais de mouvement).
  const aUneVille = Object.values(state.cities).some((c) => c.owner === playerId);
  let fondateurId: string | null = null;
  if (!aUneVille) {
    const colon = mine.find((u) => u.type === 'colon');
    if (colon) {
      orders.push({ type: 'FoundCity', unitId: colon.id });
      fondateurId = colon.id;
    }
  }

  const ennemis = ennemisDe(state, playerId);
  const enGuerre = ennemis.size > 0;

  // BOT-TC (Erik 25/10) · DIPLOMATIE — actions immédiates calculées AVANT
  // les ordres (l'ordre de consommation du RNG est fixé : paix puis guerre).
  // D3 paix : le bot ne propose QUE S'IL PERD (rapport de forces < seuil —
  // proposer en position de force tuerait ses propres offensives ; la clause
  // de durée toursPaixMin reste du côté ACCEPTATION). D1 guerre : si en
  // paix, la cible (voisin le plus faible) est tirée selon l'agressivité de
  // MA civ — la déclaration est PUBLIQUE (événement DO).
  // PAIX-RYTHME · D3 paix : le bot propose quand il PERD (canon BOT-TC)
  // OU pour fermer une guerre JAMAIS bataillée arrivée à terme (paix
  // administrative — réponse déterministe de l'adversaire, plus aucun
  // tirage : les propositions répétées n'usent personne).
  for (const e of [...ennemis].sort((a, b) => (a < b ? -1 : 1))) {
    const sesForces = forcesDe(state, e);
    const perd = sesForces > 0 && forcesDe(state, playerId) < profile.seuilRatioPaix * sesForces;
    const videTerme =
      bataillesDe(state, playerId, e) === 0 && dureeGuerre(state, playerId, e) >= profile.toursPaixMin;
    if ((perd || videTerme) && deciderPaix(state, e, playerId, profile)) {
      actions.push({ type: 'ProposePeace', player: e });
    }
  }
  if (!enGuerre) {
    const cible = deciderGuerre(state, playerId, profile, rng, agressiviteDe(me.civId));
    if (cible) actions.push({ type: 'DeclareWar', player: cible });
  }

  const objectifs = assignerObjectifs(state, playerId, profile);
  if (fondateurId) objectifs.set(fondateurId, { kind: 'tenir' as const });

  for (const unit of mine) {
    // D1 : le colon fondateur ne reçoit QUE FoundCity — un 2e ordre (Hold)
    // sur la même unité ferait tomber la fondation à la résolution.
    if (unit.id === fondateurId) continue;
    const obj = objectifs.get(unit.id) ?? { kind: 'tenir' as const };
    switch (obj.kind) {
      // R-117 : débarquement vers une rive libre.
      case 'debarquer': {
        const step = landStep(unit, state);
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
        break;
      }
      // R-119 : mission d'espionnage.
      case 'espion': {
        if (obj.cityId) orders.push({ type: 'SpyMission', unitId: unit.id, cityId: obj.cityId, mission: 'stealGreatPerson' });
        else orders.push({ type: 'Hold', unitId: unit.id });
        break;
      }
      // ① soin — ordre PERSISTANT (unité.order) : demandé chaque tour tant
      // que l'objectif tient (le moteur revalide territoire R-162).
      case 'soigner':
        orders.push({ type: 'Heal', unitId: unit.id });
        break;
      // ② attaque — le dernier pas SUR la case de l'ennemi déclenche le
      // combat d'entrée (R-42/D4) ; la cible est adjacente (voir
      // ciblesAttaquables).
      case 'attaquer':
        if (obj.cible) orders.push({ type: 'Attack', unitId: unit.id, target: obj.cible });
        else orders.push({ type: 'Hold', unitId: unit.id });
        break;
      // D2 : repli d'un pas vers la ville propre la plus proche.
      case 'repli': {
        const cible = obj.cible ?? { q: unit.q, r: unit.r };
        const step = pasVersRoutier(unit, state, cible) ?? pasVers(unit, state, cible);
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Fortify', unitId: unit.id });
        break;
      }
      // ③ garnison : sur place → Fortify puis Vigilance (jamais Passer, D1-⑥) ;
      // ailleurs → un pas vers la ville.
      case 'garnison': {
        const ville = obj.cityId ? state.cities[obj.cityId] : undefined;
        if (!ville) {
          orders.push({ type: 'Hold', unitId: unit.id });
          break;
        }
        if (unit.q === ville.q && unit.r === ville.r) {
          if (!unit.fortified) orders.push({ type: 'Fortify', unitId: unit.id });
          else if (unit.stabilized) orders.push({ type: 'Sleep', unitId: unit.id });
          else orders.push({ type: 'Hold', unitId: unit.id });
        } else {
          const step = pasVers(unit, state, ville);
          orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
        }
        break;
      }
      // ④ chasse / BOT-EXPLORATION patrouille / ⑤ exploration : un pas
      // déterministe vers la cible.
      case 'chasser':
      case 'patrouiller':
      case 'explorer': {
        const step = obj.cible ? pasVers(unit, state, obj.cible) : null;
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
        break;
      }
      // BOT-ARMEE · marche offensive : pas ROUTIER (BFS — contourne l'eau et
      // les obstacles, verrou de circulation consigné), repli glouton ; un pas
      // SEULEMENT s'il réduit la distance — au contact bloqué, tenir plutôt
      // qu'osciller.
      case 'offensiver': {
        if (!obj.cible) {
          orders.push({ type: 'Hold', unitId: unit.id });
          break;
        }
        const step = pasVersRoutier(unit, state, obj.cible) ?? pasVers(unit, state, obj.cible);
        if (step && dist(state, step, obj.cible) < dist(state, unit, obj.cible)) {
          orders.push({ type: 'Move', unitId: unit.id, path: [step] });
        } else {
          orders.push({ type: 'Hold', unitId: unit.id });
        }
        break;
      }
      // BOT-ARMEE · D1 : rassemblement — déjà DANS l'anneau de ralliement
      // (dist ≤ rayonRalliement de la cible) → campement (Fortify) ; sinon un
      // pas déterministe vers le point de ralliement. (Le point exact se
      // déplace dès qu'il est occupé : c'est l'anneau qui fait foi, pas la
      // case — sinon l'armée orbite sans jamais camper.)
      case 'rallier': {
        const cible = obj.cible ?? { q: unit.q, r: unit.r };
        if (dist(state, unit, cible) <= profile.rayonRalliement) {
          orders.push({ type: 'Fortify', unitId: unit.id });
          break;
        }
        const step = pasVersRoutier(unit, state, cible) ?? pasVers(unit, state, cible);
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Fortify', unitId: unit.id });
        break;
      }
      // PAIX-RYTHME · D1 (canon R-31) : trio co-localisé au rendez-vous —
      // le FormArmy est porté par le PREMIER membre (ordre non unitaire) ;
      // les autres tiennent la case.
      case 'fusionner': {
        if (obj.membres && obj.membres[0] === unit.id && obj.cible) {
          orders.push({
            type: 'FormArmy',
            members: [obj.membres[0], obj.membres[1]!, obj.membres[2]!],
            rally: obj.cible,
          });
        } else {
          orders.push({ type: 'Hold', unitId: unit.id });
        }
        break;
      }
      // PAIX-RYTHME · D1 : convergence vers le rendez-vous — le FormArmy est
      // émis DÈS la convergence (l'exemption R-44 autorise l'entrée sur la
      // case de rendez-vous occupée par un co-membre).
      case 'converger': {
        const cible = obj.cible ?? { q: unit.q, r: unit.r };
        if (obj.membres && obj.membres[0] === unit.id) {
          orders.push({
            type: 'FormArmy',
            members: [obj.membres[0], obj.membres[1]!, obj.membres[2]!],
            rally: cible,
          });
        }
        const step = pasVersRoutier(unit, state, cible) ?? pasVers(unit, state, cible);
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
        break;
      }
      default:
        orders.push({ type: 'Hold', unitId: unit.id });
    }
  }

  const myCities = Object.values(state.cities)
    .filter((c) => c.owner === playerId)
    .sort((a, b) => compareCityIds(a.id, b.id)); // R-81 : parcours déterministe

  // BOT-TB · D1 — worked tiles au meilleur rendement pondéré (remplace la
  // réassignation aléatoire R-60). Plan optimal par ville ; si le plan
  // diffère des assignations courantes : DÉSÉLECTIONS d'abord (sémantique
  // moteur « ville pleine »), puis assignations — la file d'ordres d'une
  // même ville est appliquée séquentiellement par applySetWorkedTile.
  const eco = ecoDuBot();
  for (const city of myCities) {
    if (city.pop <= 0) continue;
    const poids = poidsVille(state, city, me, eco, enGuerre);
    const plan = planWorkedTiles(state, city, me, poids, {
      reserveInterieurs: eco.citoyensInterieurs,
      marteauxMin: eco.marteauxMin,
    });
    const aRetirer = city.workedTiles.filter((t) => !plan.includes(t));
    const aAjouter = plan.filter((t) => !city.workedTiles.includes(t));
    for (const t of aRetirer) orders.push({ type: 'SetWorkedTile', cityId: city.id, tile: t });
    for (const t of aAjouter) orders.push({ type: 'SetWorkedTile', cityId: city.id, tile: t });
  }

  // R-85 · BOT-TB · D3 : dès qu'il n'a pas de tech en cours, le bot choisit
  // la PROCHAINE BRIQUE de son objectif de recherche (chaîne de prérequis
  // complète — plus de tech au hasard).
  if (!me.researching) {
    const tech = prochaineTech(me, profile, eco);
    if (tech) actions.push({ type: 'SetResearch', techId: tech });
  }
  // R-122 : adoption de régime SANS Anarchie (action immédiate).
  const gov = pickGovernment(me, myCities, state);
  if (gov) actions.push({ type: 'SetGovernment', government: gov });

  // R-87 · BOT-TB · D2 : villes sans file → ARBITRAGE (① militaire ② colon
  // ③ bâtiment ④ merveille ⑤ repli) ; priorités conservées : ONU à 20 jalons
  // (R-116) et composants du vaisseau (R-124).
  const capitale = myCities.find((c) => c.capital) ?? myCities[0];
  const menace = capitale ? menaceAutourCapitale(state, capitale, playerId, ennemis, profile.rayonMenace) : false;
  for (const city of myCities) {
    if (city.production) continue;
    const component = (me.techsUnlocked ?? []).includes('vol_spatial') ? missingShipComponent(myCities) : null;
    let item: ProductionItem | null = component
      ? ({ kind: 'building', id: component } as ProductionItem)
      : null;
    if (!item && (me.cultureMilestones ?? 0) >= CULTURE.milestonesTarget) item = { kind: 'wonder', id: 'nations_unies' };
    if (!item) item = arbitrerProduction(city, me, myCities, state, eco, enGuerre, menace, rng);
    if (item) orders.push({ type: 'SetProduction', cityId: city.id, item });
  }

  // R-135 · BOT-TB · D4 : rush DISCIPLINÉ — seulement un item prioritaire
  // (D2 ①/②), coût × réserve (data) couvert ET trésorerie restante au-dessus
  // du plancher (coût par le helper moteur : toutes réductions 7n comprises).
  for (const city of myCities) {
    if (!city.production) continue;
    if (!rushPrioritaire(city.production.item, enGuerre, menace)) continue;
    const cost = rushBuyCostOf(state, city);
    if (cost === null) continue;
    if (me.treasury >= cost * eco.reserveRush && me.treasury - cost >= eco.tresorerieMinimale) {
      orders.push({ type: 'RushBuy', cityId: city.id });
    }
  }

  // R-126 : le bot SETTLE ses GP dans une ville amie adjacente (choix
  // déterministe simple 🔶 — toujours Settle, jamais Consume). L'ordre
  // REMPLACE l'ordre d'exploration déjà donné à ce GP (sémantique
  // same-subject).
  for (const unit of mine) {
    if (!UNIT_TYPES[unit.type]?.greatPerson) continue;
    const target = myCities.find((c) => dist(state, unit, c) <= 1);
    if (!target) continue;
    const existing = orders.findIndex((o) => 'unitId' in o && o.unitId === unit.id);
    const settle: Order = { type: 'GreatPersonAction', unitId: unit.id, action: 'settle', cityId: target.id };
    if (existing >= 0) orders[existing] = settle;
    else orders.push(settle);
  }

  return { orders, actions };
}
