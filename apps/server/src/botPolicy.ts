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
 * Le bot NE déclare JAMAIS la guerre (R-187, T-C) : attaquer une unité ou
 * une ville de JOUEUR exige une paire en guerre dans `diplomacy.war` ; les
 * barbares sont en guerre permanente (R-95).
 *
 * NB : `bot.mjs` est CONSERVÉ tel quel pour les tests/e2e — deux
 * implémentations (duplication documentée, défaut 🔶 du handoff). Le
 * facteur d'ère du rush vient du champ persisté `era` (R-147) et le coût du
 * rush du helper moteur `rushBuyCostOf`. Parcours déterministes R-81.
 */
import {
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
  allKnownTechs,
  areAtWar,
  canSetProduction,
  compareCityIds,
  compareUnitIds,
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
  | { type: 'SetGovernment'; government: string };

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

/** Le profil actif du bot (BOT_SETTINGS.profil — défaut « normal »). */
export function profileDuBot(): BotProfileData {
  return BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
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

/** Unité amie sur la case (q, r) — miroir bot.mjs `unitAtHex`. */
function unitAtHex(state: GameState, q: number, r: number, owner?: PlayerId): Unit | undefined {
  return Object.values(state.units).find((u) => u.q === q && u.r === r && (!owner || u.owner === owner));
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
  | 'tenir';

export interface Objectif {
  kind: ObjectifKind;
  /** Cible hexagonale (attaque, chasse, exploration, repli). */
  cible?: { q: number; r: number };
  /** Ville visée (garnison) ou cible d'espionnage. */
  cityId?: string;
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
function ciblesAttaquables(state: GameState, unit: Unit, me: PlayerId, ennemis: Set<PlayerId>): CibleAttaque[] {
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
    }
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

  // Proies barbares (R-95) : unités vivantes, triées par id (R-81) — la
  // distance est évaluée par unité chasseuse au moment du choix.
  const barbares = Object.values(state.units)
    .filter((u) => isBarbarian(u.owner) && !u.aboard)
    .sort((a, b) => compareUnitIds(a.id, b.id));

  const vision = new Set(me.vision.visible ?? []);

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

    // ② attaquer une cible adjacente au rapport favorable.
    const sAtt = forceAttaque(unit);
    const cibles = ciblesAttaquables(state, unit, playerId, ennemis)
      .filter((c) => sAtt > 0 && sAtt >= profile.ratioAttaqueMin * c.sDef)
      .sort((a, b) => b.priorite - a.priorite || a.sDef - b.sDef || a.hex.q - b.hex.q || a.hex.r - b.hex.r);
    if (cibles.length > 0) {
      objectifs.set(unit.id, { kind: 'attaquer', cible: cibles[0]!.hex });
      continue;
    }

    // D2 : menace défavorable — repli d'un pas vers la ville propre la plus
    // proche (ou tenir sur place si déjà en ville).
    if (menace) {
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

    // ③ garnisonner (unités de combat terrestres seulement).
    if (estCombattante(unit)) {
      const manque = myCities.filter((c) => (defenseurs.get(c.id) ?? 0) < besoinDe(c));
      if (manque.length > 0) {
        const cible = manque
          .slice()
          .sort((a, b) => dist(state, unit, a) - dist(state, unit, b) || compareCityIds(a.id, b.id))[0]!;
        defenseurs.set(cible.id, (defenseurs.get(cible.id) ?? 0) + 1);
        objectifs.set(unit.id, { kind: 'garnison', cityId: cible.id });
        continue;
      }
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

export function botPolicy(state: GameState, playerId: PlayerId, rng: SeededRng): BotPlan {
  const orders: Order[] = [];
  const actions: BotAction[] = [];
  const me = state.players[playerId];
  if (!me) return { orders, actions };
  const profile = profileDuBot();

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
        const step = pasVers(unit, state, cible);
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
