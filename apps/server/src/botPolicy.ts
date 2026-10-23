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
  areAtWar,
  canSetProduction,
  compareCityIds,
  compareUnitIds,
  frontierRadius,
  hexDistanceW,
  isBarbarian,
  rayonCulturelDe,
  rushBuyCostOf,
  wonderTreasuryLocked,
} from '@game/rules';
import type { BotProfileData, City, GameState, Order, PlayerId, ProductionItem, SeededRng, Unit } from '@game/rules';

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

// ---------------------------------------------------------------------------
// Économie (T-B affinera — D4 : seule la pondération de guerre est nouvelle).
// ---------------------------------------------------------------------------

/** R-85 : une tech aléatoire (RNG seedé) disponible — non débloquée, prérequis satisfaits. */
function pickResearch(player: GameState['players'][PlayerId], rng: SeededRng): string | null {
  const unlocked = player.techsUnlocked ?? [];
  const available = Object.values(TECHS).filter(
    (t) => !unlocked.includes(t.id) && t.prereqs.every((p) => unlocked.includes(p)),
  );
  if (available.length === 0) return null;
  return available[rng.nextInt(available.length)]!.id;
}

/** R-135 : coût de base d'un item de production (données — miroir bot.mjs). */
function baseCostOf(item: ProductionItem): number | null {
  if (item.kind === 'unit') return UNIT_TYPES[item.id]?.cost ?? null;
  if (item.kind === 'wonder') return WONDERS[item.id]?.cost ?? null;
  return BUILDINGS[item.id]?.cost ?? null;
}
void baseCostOf;


/**
 * R-87 · Un item de production aléatoire VALIDE pour la ville (miroir bot.mjs
 * `pickProduction`). Le filtre final passe par le VALIDATEUR MOTEUR
 * `canSetProduction` (tech, obsolescence R-110, unités uniques R-148 avec
 * remplacement, GP R-114, stratégiques R-138, bâtiments R-66/R-111) — un
 * ordre que le moteur refuserait n'entre jamais dans le tirage. S'y ajoutent
 * les filtres bot.mjs : coût population (R-112), accès à la mer (R-117),
 * unicité MONDIALE des merveilles (R-129) et verrou de trésorerie (R-137).
 *
 * BOT-TA · D4 : en guerre, la ville produit une UNITÉ si une option unité
 * existe (pondération data-driven minimale — T-B affinera).
 */
function pickProduction(
  city: City,
  player: GameState['players'][PlayerId],
  myCities: City[],
  state: GameState,
  rng: SeededRng,
  enGuerre: boolean,
): ProductionItem | null {
  const unlocked = player.techsUnlocked ?? [];
  const obsoleteWonders = new Set<string>();
  for (const techId of unlocked) for (const w of TECHS[techId]?.obsoleteWonders ?? []) obsoleteWonders.add(w);
  const allCities = Object.values(state.cities);
  const empireWonders = new Set(myCities.flatMap((c) => c.wonders ?? []));
  // Unicité MONDIALE R-129 (révision 7k, absente de bot.mjs) : une merveille
  // bâtie chez le rival n'est plus produisible — le moteur le refuserait.
  const worldWonders = new Set(allCities.flatMap((c) => c.wonders ?? []));
  const empireChantiers = new Set(
    myCities.filter((c) => c.production?.item.kind === 'wonder').map((c) => c.production!.item.id),
  );
  const options: ProductionItem[] = [];
  // R-116 : à 20 jalons, le bot VISE l'ONU (victoire culturelle).
  if ((player.cultureMilestones ?? 0) >= CULTURE.milestonesTarget) {
    options.unshift({ kind: 'wonder', id: 'nations_unies' });
  }
  for (const u of Object.values(UNIT_TYPES)) {
    if (u.implemented === false || u.greatPerson || u.strategic) continue;
    if (u.id === 'caravane') continue; // CARAVANE · D4 (Erik 19/10) : le bot solo n'en produit pas
    if ((u.populationCost ?? 0) > 0 && city.pop < u.populationCost!) continue; // R-112 (complétion)
    if (u.aquatic && !isCoastal(city, state)) continue; // R-117 : accès à la mer
    if (!canSetProduction({ kind: 'unit', id: u.id }, unlocked, city.buildings, player.civId)) continue;
    options.push({ kind: 'unit', id: u.id });
  }
  // D4 : en guerre, seules les unités restent dans le tirage.
  if (enGuerre) {
    const unités = options.filter((o) => o.kind === 'unit');
    if (unités.length > 0) return unités[rng.nextInt(unités.length)]!;
  }
  for (const b of Object.values(BUILDINGS)) {
    if (b.fixed || b.implemented === false) continue;
    if (city.buildings.includes(b.id)) continue;
    if (b.replaces && city.buildings.includes(b.replaces)) continue;
    if (!canSetProduction({ kind: 'building', id: b.id }, unlocked, city.buildings, player.civId)) continue;
    options.push({ kind: 'building', id: b.id });
  }
  for (const w of Object.values(WONDERS)) {
    if (w.implemented === false || w.cultureVictory) continue; // ONU déjà priorisée
    if (w.tech && !unlocked.includes(w.tech)) continue;
    if (obsoleteWonders.has(w.id)) continue;
    if (empireWonders.has(w.id) || worldWonders.has(w.id) || empireChantiers.has(w.id)) continue;
    if (wonderTreasuryLocked(w.id, player.treasury)) continue; // R-137 (Banque mondiale)
    options.push({ kind: 'wonder', id: w.id });
  }
  if (options.length === 0) return null;
  return options[rng.nextInt(options.length)]!;
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
// La politique du bot : état complet + RNG seedé dédié → plan (ordres +
// actions immédiates). BOT-TA : les ordres d'unités dérivent des OBJECTIFS
// (D1) ; l'économie (production/rush/GP/recherche/régimes) reste au portage
// bot.mjs (T-B affinera). Le moteur revalide tout (R-80, §5).
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
  const aUneVille = Object.values(state.cities).some((c) => c.owner === playerId);
  if (!aUneVille) {
    const colon = mine.find((u) => u.type === 'colon');
    if (colon) {
      orders.push({ type: 'FoundCity', unitId: colon.id });
      return { orders, actions };
    }
  }

  const ennemis = ennemisDe(state, playerId);
  const enGuerre = ennemis.size > 0;
  const objectifs = assignerObjectifs(state, playerId, profile);

  for (const unit of mine) {
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

  // R-60 : réassignation occasionnelle d'un citoyen (ordre valide — le moteur revalide).
  for (const city of myCities) {
    if (rng.next() >= 0.2) continue;
    const candidates = Object.keys(state.map).filter((key) => {
      const parts = key.split(',');
      const q = Number(parts[0]);
      const r = Number(parts[1]);
      const d = hexDistanceW({ q, r }, { q: city.q, r: city.r }, state.mapWidth);
      return d >= 1 && d <= 2;
    });
    if (candidates.length === 0) continue;
    orders.push({ type: 'SetWorkedTile', cityId: city.id, tile: candidates[rng.nextInt(candidates.length)]! });
  }

  // R-85 : dès qu'il n'a pas de tech en cours, le bot en choisit une (action immédiate).
  if (!me.researching) {
    const tech = pickResearch(me, rng);
    if (tech) actions.push({ type: 'SetResearch', techId: tech });
  }
  // R-122 : adoption de régime SANS Anarchie (action immédiate).
  const gov = pickGovernment(me, myCities, state);
  if (gov) actions.push({ type: 'SetGovernment', government: gov });

  // R-87 : villes sans file → un item aléatoire valide (R-116 ONU, R-124
  // vaisseau, D4 : unités si en guerre).
  for (const city of myCities) {
    if (city.production) continue;
    const component = (me.techsUnlocked ?? []).includes('vol_spatial') ? missingShipComponent(myCities) : null;
    const item = component
      ? ({ kind: 'building', id: component } as ProductionItem)
      : pickProduction(city, me, myCities, state, rng, enGuerre);
    if (item) orders.push({ type: 'SetProduction', cityId: city.id, item });
  }

  // R-135 : rush-buy simple — achète si la trésorerie couvre coût + 30 % de
  // réserve (coût par le helper moteur : toutes réductions 7n comprises).
  const SAFETY = 1.3;
  for (const city of myCities) {
    if (!city.production) continue;
    const cost = rushBuyCostOf(state, city);
    if (cost === null) continue;
    if (me.treasury >= cost * SAFETY && me.treasury - cost > 0) {
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

  void baseCostOf; // conservé pour le portage bot.mjs (miroir minimal, T-B)
  return { orders, actions };
}
