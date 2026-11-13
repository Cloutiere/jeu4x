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
  // BOT-GATE-ATTAQUE (canon Erik 10/11) — gate d'espérance + valeur tactique.
  deciderAttaqueUnitaire,
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
  derniereDeclarationCible,
  deciderProductionColon,
  // DEFENSE-VILLE-A (canon Erik 12/11) — garnison d=0 + rappel hystérésis
  // (mécanique partagée bot ET Jev) ; L6 hygiène de fondation vit dans le
  // PORT Jev (joueur.ts / joueur.mjs) et le gate fondation, pas ici.
  defenseDuBot,
  garnisonDeficit,
  menacesVille,
  distanceCibleGuerre,
  dureeGuerre,
  frontierRadius,
  growthThresholdFor,
  hexDistanceW,
  isBarbarian,
  siteColonParDefaut,
  normalizeHexW,
  rayonCulturelDe,
  rushBuyCostOf,
  techEraOf,
  tileYield,
  wonderTreasuryLocked,
  workRadiusOf,
  workableTilesFor,
} from '@game/rules';
import type { CategorieTactique } from '@game/rules';
import type {
  BotEconomieData,
  BotNegociationData,
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
 *  canonique des directions (R-81).
 *  OSCILLATION-MARCHE (Erik 02/11) : la règle canon — un pas ne JAMAIS
 *  augmenter la distance (wrappée) à la cible ; en cul-de-sac (baie,
 *  isthme de la couture) le pas « moins pire » était la case d'où l'unité
 *  venait → ping-pong éternel (u4 : 23,22 ⇄ 24,22, banc partie 2). Désormais
 *  null → l'appelant émet l'arrêt explicite (Hold/Fortify). Le voisinage est
 *  normalisé Est↔Ouest (normalizeHexW — canon CARTE-RONDE T1, cohérence
 *  avec dist). */
export function pasVers(
  unit: Unit,
  state: GameState,
  cible: { q: number; r: number },
): { q: number; r: number } | null {
  const stats = UNIT_TYPES[unit.type];
  const aquatic = stats?.aquatic === true;
  const ici = { q: unit.q, r: unit.r };
  const dIci = dist(state, ici, cible);
  let best: { q: number; r: number } | null = null;
  let bestD = dIci;
  for (const [dq, dr] of DIRS) {
    const voisin = normalizeHexW({ q: unit.q + dq, r: unit.r + dr }, state.mapWidth);
    const q = voisin.q;
    const r = voisin.r;
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
    const voisins = DIRS.map(([dq, dr]) =>
      // OSCILLATION-MARCHE : voisinage NORMALISÉ Est↔Ouest (normalizeHexW —
      // canon CARTE-RONDE T1). Sans wrap, le BFS est null sur les isthmes de
      // la couture (dist, elle, wrappe) → repli glouton constant → ping-pong.
      normalizeHexW({ q: current.q + dq, r: current.r + dr }, state.mapWidth),
    )
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

/**
 * HUTTE-EXPLORATION (Erik 04/11, prod ZWV7T5) · D1 — la hutte connue à
 * portée de détour. Diagnostic L1 : u4 (21,5) contournait h9 (22,6)
 * ADJACENTE — le classement d'exploration ignorait les huttes ET l'anti-recul
 * jugeait le pas latéral non-améliorant (dIci=29, via hutte=29). Une hutte
 * atteignable vaut mieux qu'une case lointaine : la PREMIÈRE hutte connue
 * (vision.explored — le bot ne triche pas), praticable pour la classe de
 * l'unité, LIBRE (jamais d'entrée de combat non planifiée), à
 * dist ≤ hutteDetourMax (adjacente toujours — dist 1) et non réservée à un
 * autre scout CE tour. Consommée → retirée de state.huts (openHutAt, turn.ts)
 * → quitte le classement naturellement. Villages barbares EXCLUS (D3 — ce
 * ne sont pas des huttes, l'attaque reste la porte de guerre R-65).
 * Pur, déterministe (tri (dist, clé) R-81).
 */
function hutteConnueProche(
  state: GameState,
  unit: Unit,
  playerId: PlayerId,
  reservees: ReadonlySet<string>,
  detourMax: number,
): { q: number; r: number } | null {
  const stats = UNIT_TYPES[unit.type];
  const explorees = state.players[playerId]?.vision.explored ?? [];
  let best: { q: number; r: number } | null = null;
  let bestD = Infinity;
  let bestKey = '';
  for (const h of state.huts) {
    const key = `${h.q},${h.r}`;
    if (!explorees.includes(key) || reservees.has(key)) continue;
    const tile = state.map[key];
    if (!tile) continue;
    if (stats?.aquatic) {
      // hutte terrestre : une unité navale ne peut pas poser le pied dessus
      if (!TERRAINS[tile.terrain]?.navalAccess) continue;
    } else if (!TERRAINS[tile.terrain]?.passable) {
      continue;
    }
    if (unitAtHex(state, h.q, h.r)) continue;
    const d = dist(state, unit, h);
    if (d > detourMax) continue;
    if (d < bestD || (d === bestD && key < bestKey)) {
      bestD = d;
      bestKey = key;
      best = { q: h.q, r: h.r };
    }
  }
  return best;
}

/** OSCILLATION-MARCHE (Erik 02/11) — la GARDE DE MARCHE : les unités que Jev
 *  a mises en marche (memo.marche — point de passage persisté) ne peuvent pas
 *  être reparties EN ARRIÈRE par le plan bot les tours où Jev ne les couvre
 *  pas (l'éligibilité menaceAdjacente clignote → tir à la corde, u87 :
 *  0,20 ⇄ 1,20 toute la partie). Un ordre de MOUVEMENT du bot sur une unité
 *  gardée est retiré SI sa destination finale augmente la distance (wrappée)
 *  au passage ; les assauts (Move sur le passage lui-même, d=0) et les ordres
 *  hors garde survivent. HUTTE-EXPLORATION (Erik 04/11) · D2 : un pas QUI
 *  ENTRE dans une case hutte (paramètre `huttes` — state.huts) n'est JAMAIS
 *  un pas arrière — le ramassage des bonus prime (exception ciblée, zéro
 *  autre : le ping-pong reste mort). Pur, testable — appelé à la fusion
 *  bot/Jev (game.ts côté prod, partie.mjs côté harnais). */
export function filtrerMarcheBot(
  ordresBot: Order[],
  garde: Array<{ unitId: string; q: number; r: number }>,
  units: Record<string, Unit>,
  largeur: number,
  huttes?: ReadonlyArray<{ q: number; r: number }>,
): Order[] {
  if (garde.length === 0) return ordresBot;
  const passageDe = new Map(garde.map((g) => [g.unitId, { q: g.q, r: g.r }]));
  const surHutte = (h: { q: number; r: number }): boolean =>
    huttes?.some((t) => t.q === h.q && t.r === h.r) ?? false;
  return ordresBot.filter((o) => {
    if (o.type !== 'Move' && o.type !== 'MultiStep') return true;
    const unitId = (o as { unitId: string }).unitId;
    const passage = passageDe.get(unitId);
    if (!passage) return true;
    const unite = units[unitId];
    if (!unite) return true;
    const path = (o as { path: Array<{ q: number; r: number }> }).path ?? [];
    const dest = path[path.length - 1];
    if (!dest) return true; // pas de destination → pas un mouvement évaluable
    // D2 : entrer dans une hutte n'est jamais un pas arrière (ramassage).
    if (path.some(surHutte) || surHutte(dest)) return true;
    const dAvant = hexDistanceW({ q: unite.q, r: unite.r }, passage, largeur);
    const dApres = hexDistanceW(dest, passage, largeur);
    return dApres <= dAvant; // assaut/davantage vers le passage : conservé
  });
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
 *  forces, distance, id) R-81. BOT-MARCHE D4 : cibles verrouillées exclues
 *  (re-déclaration). Null si aucun candidat. */
export function cibleGuerre(
  state: GameState,
  me: PlayerId,
  profile?: BotProfileData,
  exclusions: ReadonlyArray<PlayerId> = [],
): PlayerId | null {
  const prof = profile ?? BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
  return cibleGuerrePonderee(
    state,
    me,
    prof,
    candidatsGuerre(state, me).filter((id) => !exclusions.includes(id)),
  );
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
  // BOT-MARCHE · D4 — verrou de re-déclaration : une cible déjà déclarée il y
  // a moins de delaiRedeclaration est EXCLUE (la meilleure cible restante est
  // choisie ; null si toutes verrouillées) — les guerres en boucle entre
  // voisins épuisés se tarissent.
  const verrouillees = candidatsGuerre(state, me).filter((id) => {
    const d = derniereDeclarationCible(state, me, id);
    return d !== undefined && state.turn - d < profile.delaiRedeclaration;
  });
  const cible = cibleGuerre(state, me, profile, verrouillees);
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
  const dureeMin = dureeMinGuerre(state, decideur, proposeur, profile);
  if (duree >= profile.toursPaixGagnant * dureeMin) return true;
  if (bataillesDe(state, decideur, proposeur) === 0 && duree >= dureeMin) return true;
  return false;
}

/**
 * HORLOGE-DISTANCE (Erik 28/10, D1) · La durée minimale de guerre connaît la
 * DISTANCE de la cible : dureeMin = toursPaixMin + distanceCible ×
 * facteurMarcheCible — la distance wrap entre capitales effectives, FIGÉE à
 * la déclaration (diplomacy.distancesCible). Une guerre lointaine dure le
 * temps de la campagne de son armée ; une guerre pré-existante (champ
 * absent) retombe sur toursPaixMin (comportement historique). Pur.
 */
export function dureeMinGuerre(
  state: GameState,
  a: PlayerId,
  b: PlayerId,
  profile: BotProfileData,
): number {
  return profile.toursPaixMin + distanceCibleGuerre(state, a, b) * profile.facteurMarcheCible;
}

/**
 * GUERRE-VIVANTE (Erik 02/11, D-A) · Jugement de guerre stérile : la paire
 * (me, e) est EN GUERRE depuis `guerreSterile.tours` (data, 30) sans AUCUNE
 * bataille comptée (diplomacy.batailles — les barbares n'y figurent jamais).
 * Pur, déterministe.
 */
export function guerreSterileDe(
  state: GameState,
  me: PlayerId,
  e: PlayerId,
  profile: BotProfileData,
): boolean {
  if (!areAtWar(state, me, e)) return false;
  if (bataillesDe(state, me, e) !== 0) return false;
  return dureeGuerre(state, me, e) >= BOT_SETTINGS.guerreSterile.tours;
}

// ---------------------------------------------------------------------------
// DIPLOMATIE-T2 (décisions Erik 28/10) · D4 — la NÉGOCIATION : le bot répond
// de façon seedée aux offres du JOUEUR (paix compensée, échange de techs).
// Grille data-driven (bot.json `negociation`), pondérée par le RAPPORT DE
// FORCES et la FIERTÉ (agressivité de la civ — une civ fière exige plus).
// Trois réponses : accepter / refuser / contre-proposer (demande d'or — une
// seule itération ; le joueur peut re-proposer, la réponse à une offre
// identique est DÉTERMINISTE). Tirage seedé dédié (miroir R-154 : le RNG de
// résolution du moteur n'est JAMAIS consommé). Canon : JAMAIS d'échange avec
// une nation en guerre (la validation moteur refoule de toute façon).
// Bots ENTRE EUX : pas de négociation (D5 — le joueur est le seul initiateur).
// ---------------------------------------------------------------------------

/** Accès au bloc négociation (bot.json). */
export function negociationDuBot(): BotNegociationData {
  return BOT_SETTINGS.negociation;
}

/** Les trois réponses possibles du bot à une offre. */
export type ReponseNegociation = 'accepte' | 'refuse' | { contreOr: number };

/** FIERTÉ : multiplicateur du prix exigé (≥ 1 agressive, < 1 pacifique). */
function fierteDuBot(negoc: BotNegociationData, agressivite: number): number {
  return 1 + negoc.facteurFierte * (2 * agressivite - 1);
}

/**
 * PRIX DE LA PAIX (D2/D4) : prixPaixBase × fierté × rapport de forces borné
 * (plancher/plafond données) — l'écrasé se rachète à bas prix, le fort fait
 * payer. Pur.
 */
export function prixPaixDuBot(
  state: GameState,
  decideur: PlayerId,
  proposeur: PlayerId,
  negoc: BotNegociationData,
  agressivite: number,
): number {
  const rapport = Math.min(
    negoc.plafondRapportForces,
    Math.max(negoc.plancherRapportForces, forcesDe(state, decideur) / Math.max(1, forcesDe(state, proposeur))),
  );
  return Math.round(negoc.prixPaixBase * fierteDuBot(negoc, agressivite) * rapport);
}

/**
 * D2/D4 · Décision face à une PAIX COMPENSÉE (goldOffer) — réponse seedée :
 *   - deciderPaix (administrative / gagnant) → accepte, l'or passe quand même
 *     (le joueur est généreux, le bot ne refuse pas un cadeau) ;
 *   - goldOffer ≥ prix → accepte ; < prix × zoneGrise → refuse (insulte) ;
 *   - zone grise → tirage seedé : contre-proposition (le prix exigé) ou refus.
 * Pur (le RNG ne consomme qu'un next en zone grise — déterminisme R-80).
 */
export function deciderPaixNegociee(
  state: GameState,
  decideur: PlayerId,
  proposeur: PlayerId,
  goldOffer: number,
  profile: BotProfileData,
  negoc: BotNegociationData,
  rng: SeededRng,
  agressivite: number,
): ReponseNegociation {
  if (deciderPaix(state, decideur, proposeur, profile)) return 'accepte';
  const prix = prixPaixDuBot(state, decideur, proposeur, negoc, agressivite);
  if (goldOffer >= prix) return 'accepte';
  if (goldOffer < prix * negoc.zoneGrise) return 'refuse';
  return rng.next() < negoc.seuilContreTirage ? { contreOr: prix } : 'refuse';
}

/**
 * D3/D4 · Décision face à un ÉCHANGE de techs (le bot REÇOIT techOfferte et
 * DONNE techDemandee ou goldDemande) : la valeur reçue (coût R-135 de la
 * tech) doit dépasser la valeur donnée d'au moins la marge (fierté comprise)
 * → accepte ; sous × zoneGrise → refuse (insulte) ; zone grise → tirage :
 * contre-proposition (l'or maximal que le bot accepterait de payer — forme
 * « tech contre or » SEULE 🔶 : en 1:1 la contrepartie est une tech, pas d'or
 * à négocier) ou refus. Pur (un seul next en zone grise).
 */
export function deciderEchangeTechs(
  state: GameState,
  decideur: PlayerId,
  proposeur: PlayerId,
  offre: { techOfferte: string; techDemandee?: string; goldDemande?: number },
  profile: BotProfileData,
  negoc: BotNegociationData,
  rng: SeededRng,
  agressivite: number,
): ReponseNegociation {
  void state;
  void decideur;
  void proposeur;
  void profile;
  const valeurRecue = TECHS[offre.techOfferte]?.cost ?? 0;
  const valeurDonnee =
    offre.techDemandee !== undefined ? TECHS[offre.techDemandee]?.cost ?? 0 : offre.goldDemande ?? 0;
  const marge = negoc.margeTech * fierteDuBot(negoc, agressivite);
  const seuil = valeurDonnee * (1 + marge);
  if (valeurRecue >= seuil) return 'accepte';
  if (valeurRecue < seuil * negoc.zoneGrise) return 'refuse';
  if (offre.techDemandee === undefined && rng.next() < negoc.seuilContreTirage) {
    return { contreOr: Math.round(valeurRecue / (1 + marge)) };
  }
  return 'refuse';
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
 * BOT-MARCHE (Erik 28/10, D2) · Cible PROJETÉE en temps de paix : la cible
 * de guerre pondérée (D2 PAIX-RYTHME) parmi les candidats EN PAIX — miroir
 * exact de ce que deciderGuerre déclarerait — puis SA ville la plus proche
 * de ma capitale. Sert à l'armée permanente : le pool se rassemble vers
 * cette cible AVANT la déclaration (miroir du joueur qui prépare). Pur.
 */
export function cibleProjetee(
  state: GameState,
  me: PlayerId,
  profile?: BotProfileData,
): { q: number; r: number; owner: PlayerId; cityId: string } | null {
  const prof = profile ?? BOT_SETTINGS.profiles[BOT_SETTINGS.profil] ?? Object.values(BOT_SETTINGS.profiles)[0]!;
  const cible = cibleGuerre(state, me, prof);
  if (!cible) return null;
  const maCapitale = capitaleDe(state, me);
  const origine = maCapitale ?? { q: 0, r: 0 };
  const villes = Object.values(state.cities)
    .filter((c) => c.owner === cible)
    .sort((a, b) => dist(state, origine, a) - dist(state, origine, b) || compareCityIds(a.id, b.id));
  const v = villes[0];
  return v ? { q: v.q, r: v.r, owner: cible, cityId: v.id } : null;
}

/** La guerre est-elle PROBABLE (D2) : ratio de forces ≥ seuil effectif du
 *  profil (même condition que la déclaration, sans le tirage). Pur. */
export function guerreProbable(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  agressivite: number,
): boolean {
  const projet = cibleProjetee(state, me, profile);
  if (!projet) return false;
  const mesForces = forcesDe(state, me);
  if (mesForces <= 0) return false;
  return mesForces >= seuilGuerreEffectif(profile, agressivite) * forcesDe(state, projet.owner);
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
  // TB-SIEGE-DEFENSE · A2 : ids des membres de l'armée de campagne — jamais
  // brouillés comme garnison tant que la capitale n'est pas ASSAILLIE
  // (l'appelant passe undefined quand l'assaut sur la capitale demande le
  // rappel — B2). Le défaut (undefined) conserve le comportement historique.
  exclus?: ReadonlySet<string>,
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
  // BOT-MARCHE · D3 — en guerre CIVILE active (campagne en cours), le
  // détachement PRIME sur le recrutement de nouvelles garnisons : l'urgence
  // n'est plus la guerre elle-même mais la MENACE AUTOUR DE LA CAPITALE
  // (BOT-EXPLORATION D3 reste au-dessus de tout), et seules la capitale
  // recrute — les villes secondaires attendent la paix.
  const enGuerreCivile = [...ennemis].some((id) => !isBarbarian(id));
  const urgence = enGuerreCivile
    ? capitale
      ? menaceAutourCapitale(state, capitale, me, ennemis, profile.rayonMenace)
      : false
    : ennemis.size > 0 ||
      (capitale ? menaceAutourCapitale(state, capitale, me, ennemis, profile.rayonMenace) : false);
  const quotaCap = quotaCapitale(profile, mine.length, urgence);
  const besoinDe = (c: City): number => {
    if (enGuerreCivile && !urgence) return 0; // D3 : la campagne prime
    return c.capital ? quotaCap : profile.garnisonsParVille;
  };
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
    (u) =>
      estCombattante(u) && !enPlace.has(u.id) && (urgence || u.id !== scoutId) &&
      !(exclus?.has(u.id) ?? false), // TB-SIEGE A2 : l'armée de campagne n'est pas ré-absorbée
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

/** D1 · Les `tailleArmee` combattantes disponibles LES PLUS PROCHES de la
 *  cible (ties id, R-81) forment l'armée. Pur, déterministe.
 *  TB-SIEGE-DEFENSE · A2 — l'armée est calculée AVANT le brouillon de
 *  garnison (candidats = combattantes hors défenseurs EN PLACE) : l'ancien
 *  calcul depuis le pool POST-brouillon faisait absorber les futures
 *  assiégeantes par les garnisons avant même que l'armée n'existe (urgence
 *  capitale → armée vide, siège impossible). Les membres sont ensuite
 *  exclus du brouillon par l'appelant (A2). */
export function assignerArmee(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  cible: { q: number; r: number } | null,
): Set<string> {
  const armee = new Set<string>();
  if (!cible) return armee;
  const estCombattante = (u: Unit): boolean =>
    !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false) && UNIT_TYPES[u.type]?.aquatic !== true;
  // Le scout (première combattante, R-81) n'est JAMAIS un défenseur en place
  // (miroir planGarnison — mobilisable, BOT-EXPLORATION D3).
  const scoutId = Object.values(state.units)
    .filter((u) => u.owner === me && estCombattante(u))
    .sort((a, b) => compareUnitIds(a.id, b.id))[0]?.id;
  const enPlace = new Set<string>();
  for (const c of Object.values(state.cities).filter((c) => c.owner === me)) {
    for (const u of Object.values(state.units)) {
      if (u.owner === me && u.id !== scoutId && estCombattante(u) && u.q === c.q && u.r === c.r) enPlace.add(u.id);
    }
  }
  const candidats = Object.values(state.units)
    .filter((u) => u.owner === me && estCombattante(u) && !enPlace.has(u.id))
    .sort((a, b) => dist(state, a, cible) - dist(state, b, cible) || compareUnitIds(a.id, b.id));
  return new Set(candidats.slice(0, profile.tailleArmee).map((u) => u.id));
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
 * BOT-MARCHE (Erik 28/10, D1) · Hex de ralliement STABLE d'un membre : rang
 * du membre dans la liste triée PAR ID (R-81) sur l'anneau — plus JAMAIS le
 * rang par distance au tour courant (l'ancien rang permutait à chaque pas,
 * les membres changeaient de case cible et oscillaient — sonde L1 :
 * d18→21→20 pendant 60 tours). L'anneau étant géométrique (stable), chaque
 * membre garde SA case jusqu'à l'arrivée : la marche devient monotone.
 * Pur, déterministe.
 */
export function hexRalliementMembre(
  state: GameState,
  campagne: { q: number; r: number },
  me: PlayerId,
  profile: BotProfileData,
  membres: ReadonlyArray<Unit>,
  unitId: string,
): { q: number; r: number } {
  const anneau = anneauRalliement(state, campagne, me, profile);
  if (anneau.length === 0) return pointRalliement(state, campagne, me, profile);
  const rang = membres
    .slice()
    .sort((a, b) => compareUnitIds(a.id, b.id))
    .findIndex((m) => m.id === unitId);
  return anneau[((rang % anneau.length) + anneau.length) % anneau.length]!;
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
// DEFENSE-VILLE-A (canon Erik 12/11, diag DIAG-DEFENSE-VILLE) — plan de
// DÉFENSE de ville partagé bot ET branche Jev. Le fait déclencheur : 6
// razes barbares dont 4 villes d'1-4 tours garnies d'un colon seul, prises
// SANS COMBAT, et 5/13 chutes avec des combattants à d=1-2 JAMAIS dans la
// tuile. Priorités canon : garnison > rappel > escort > exploration ;
// recadrage Erik : DÉFENDRE UNE VILLE N'EST PAS DE L'INACTIVITÉ.
// ---------------------------------------------------------------------------

export interface PlanDefense {
  /** L2 — combattantes à rappeler : unitId → ville (LA tuile) à rejoindre. */
  rappels: Map<string, string>;
  /** L1 — combattantes DÉJÀ sur la tuile d'une ville menacée : maintenues
   *  en garnison (ne partent pas explorer — anti ping-pong : c'est ELLES la
   *  garnison que le rappel amène, les relâcher recréerait le déficit). */
  maintiens: Map<string, string>;
}

/**
 * Plan défensif d'un tour : pour chaque ville dont une menace est visible,
 * la garnison manquante (L1 : déficit au seuil data, colon exclu — leçon
 * p08) est comblée par les combattantes disponibles LES PLUS PROCHES ; les
 * villes PLUS MENACÉES sont servies d'abord (nb de menaces desc, puis ordre
 * canonique — R-81). Les membres de l'armée DE CAMPAGNE (même règle que
 * TB-SIEGE A2/B2 : la guerre prime sauf capitale assaillie, où planGarnison
 * B2 prend le relais) ne sont JAMAIS rappelés ; le scout l'est (la défense
 * surclasse la patrouille). Pur, déterministe.
 *
 * DEFENSE-VILLE-A2 · MARQUEUR D'ÉTAT (canon Erik, option (c)) — `memo`
 * (unitId → cityId, le memo Jev persisté — PAS une donnée de schema,
 * schemaVersion 28 intacte) pose l'état « rappel en cours » :
 *   - DÉCLENCHEMENT canon : une menace à ≤ menaceDist tours pose le rappel
 *     ET le marqueur ;
 *   - HYSTÉRÉSIS à état : un marqueur actif TIENT l'unité (rappel en route
 *     ou maintien sur tuile) tant que sa ville garde une menace dans la
 *     bande (≤ menaceDist + hysteresisMarge) — même si la menace est sortie
 *     du rayon de déclenchement ;
 *   - DISSOLUTION : plus aucune menace dans la bande → le marqueur est
 *     CONSOMMÉ (supprimé) et l'unité reprend son ordre ;
 *   - purge : marqueurs d'unités mortes/parties ou de villes perdues.
 * SANS memo (bots — appel historique), la bande tient lieu de
 * déclenchement : comportement 2f95e59 bit-à-bit (statu quo consigné).
 */
export function planDefenseVille(
  state: GameState,
  me: PlayerId,
  profile: BotProfileData,
  // DEFENSE-VILLE-A2 — memo de rappel (unitId → cityId), MUTÉ (pose /
  // consomme les marqueurs). Absent : bots (statu quo sans état).
  memo?: Record<string, string>,
  // DEFENSE-VILLE-A3 — cooldown anti-ré-armement PAR VILLE (cityId → tour
  // de dissolution), MUTÉ. Une ville dissoute ne recrute plus pendant
  // `cooldownRappel` tours (anti quitter/rentrer à la frontière de bande —
  // diagnose A2). Absent : bots (statu quo sans état).
  cooldownMemo?: Record<string, number>,
): PlanDefense {
  const rappels = new Map<string, string>();
  const maintiens = new Map<string, string>();
  const d = defenseDuBot();
  const mine = Object.values(state.units)
    .filter((u) => u.owner === me)
    .sort((a, b) => compareUnitIds(a.id, b.id)); // R-81
  const estCombattante = (u: Unit): boolean =>
    !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false) && UNIT_TYPES[u.type]?.aquatic !== true;
  const myCities = Object.values(state.cities)
    .filter((c) => c.owner === me)
    .sort((a, b) => (a.capital !== b.capital ? (a.capital ? -1 : 1) : compareCityIds(a.id, b.id)));

  // Purge du memo : unités mortes/parties/embarquées, villes perdues.
  if (memo) {
    for (const uid of Object.keys(memo)) {
      const u = state.units[uid];
      const ville = u ? state.cities[memo[uid]!] : undefined;
      if (!u || u.owner !== me || u.aboard || !ville || ville.owner !== me) delete memo[uid];
    }
  }

  // Menacées dans la bande d'hystérésis (dissolution inclusive) et dans le
  // rayon de DÉCLENCHEMENT canon (trigger).
  const menacees = myCities
    .map((ville) => ({ ville, menaces: menacesVille(state, ville, me, d.menaceDist + d.hysteresisMarge) }))
    .filter((m) => m.menaces.length > 0);
  if (menacees.length === 0) {
    // DISSOLUTION GÉNÉRALE — tous les marqueurs sont consommés (A3 : la
    // dissolution ARME le cooldown de chaque ville ainsi relâchée).
    if (memo) {
      for (const uid of Object.keys(memo)) {
        if (cooldownMemo) cooldownMemo[memo[uid]!] = state.turn;
        delete memo[uid];
      }
    }
    return { rappels, maintiens };
  }
  const declenchees = new Set(
    menacees
      .filter((m) => menacesVille(state, m.ville, me, d.menaceDist).length > 0)
      .map((m) => m.ville.id),
  );

  // Canon BOT-EXPLORATION : le scout (première combattante, R-81) n'est
  // JAMAIS un défenseur — ni maintenu ni rappelé ici (sa mobilisation reste
  // celle de planGarnison à l'urgence capitale) ; la non-régression de la
  // patrouille prime hors du rayon de menace canon.
  const scoutId = mine.find((u) => estCombattante(u))?.id;

  // Membres de l'armée de campagne : JAMAIS rappelés — même proches de la
  // capitale (la campagne garde sa poussée ; le rappel défensif de la
  // capitale ASSAILLIE reste le canon TB-SIEGE B2 via planGarnison).
  const capitale = myCities[0];
  const ennemis = ennemisDe(state, me);
  const campagne = ennemis.size > 0 ? cibleCampagne(state, me, profile) : null;
  const armee = campagne ? assignerArmee(state, me, profile, campagne) : new Set<string>();

  // A2 — HOLD (mémoire) : les marqueurs actifs dont la ville est encore
  // menacée DANS LA BANDE tiennent l'unité (rappel en route ou maintien sur
  // tuile) même hors rayon de déclenchement ; marqueur consommé sinon.
  if (memo) {
    for (const [uid, cityId] of Object.entries(memo)) {
      const u = state.units[uid]!;
      if (uid === scoutId || armee.has(uid) || !estCombattante(u)) {
        delete memo[uid];
        continue;
      }
      const encore = menacees.some((m) => m.ville.id === cityId);
      if (!encore) {
        // A3 : la dissolution ARME le cooldown de la ville (anti
        // ré-armement immédiat — cycles quitter/rentrer à la frontière).
        if (cooldownMemo) cooldownMemo[cityId] = state.turn;
        delete memo[uid]; // dissolution — CONSOMMÉ, l'unité reprend son ordre
        continue;
      }
      const ville = state.cities[cityId]!;
      if (u.q === ville.q && u.r === ville.r) maintiens.set(uid, cityId);
      else rappels.set(uid, cityId);
    }
  }

  // L1 — maintien : les combattantes déjà SUR la tuile d'une ville menacée
  // restent quand elles forment LA garnison minimale (≤ seuil — anti
  // ping-pong : c'est ELLES que le rappel amène ; au-delà du seuil, le
  // surplus reste libre — canon planGarnison, quotas inchangés).
  for (const m of menacees) {
    const presentes = mine.filter(
      (u) => u.id !== scoutId && estCombattante(u) && u.q === m.ville.q && u.r === m.ville.r,
    );
    if (presentes.length === 0 || presentes.length > d.seuilGarnison) continue;
    for (const u of presentes) {
      maintiens.set(u.id, m.ville.id);
      if (memo) memo[u.id] = m.ville.id;
    }
  }

  // L2 — rappel : combler le déficit (seuil data), villes PLUS MENACÉES
  // d'abord, combattantes AU PLUS PRÈS (tie id — R-81). A2 : avec memo,
  // seules les villes DÉCLENCHÉES (≤ menaceDist) recrutent — les marqueurs
  // tiennent le reste ; sans memo, la bande déclenche (statu quo).
  // A3 : une ville dont le cooldown est actif (dissolution il y a moins de
  // `cooldownRappel` tours) ne recrute PAS — le maintien L1 (unités déjà sur
  // tuile) reste actif, seul le ré-armement du rappel est bloqué.
  const enCooldown = (cityId: string): boolean =>
    !!cooldownMemo &&
    cooldownMemo[cityId] !== undefined &&
    state.turn - cooldownMemo[cityId]! < d.cooldownRappel;
  const villesRappel = memo
    ? menacees.filter((m) => declenchees.has(m.ville.id) && !enCooldown(m.ville.id))
    : menacees.filter((m) => !enCooldown(m.ville.id));
  const deficitDe = (m: { ville: City }): number =>
    Math.max(
      0,
      d.seuilGarnison -
        [...maintiens.values(), ...rappels.values()].filter((cid) => cid === m.ville.id).length,
    );
  const ordreVilles = [...villesRappel].sort(
    (a, b) => b.menaces.length - a.menaces.length || compareCityIds(a.ville.id, b.ville.id),
  );
  for (const m of ordreVilles) {
    const besoin = Math.min(deficitDe(m), garnisonDeficit(state, m.ville, me, d.seuilGarnison));
    for (let k = 0; k < besoin; k++) {
      let best: Unit | null = null;
      let bestD = Infinity;
      for (const u of mine) {
        if (u.id === scoutId) continue;
        if (!estCombattante(u) || maintiens.has(u.id) || rappels.has(u.id)) continue;
        if (armee.has(u.id)) continue; // la campagne n'est pas dissoute
        const dd = dist(state, u, m.ville);
        if (dd < bestD || (dd === bestD && best && compareUnitIds(u.id, best.id) < 0)) {
          bestD = dd;
          best = u;
        }
      }
      if (!best) break;
      rappels.set(best.id, m.ville.id);
      if (memo) memo[best.id] = m.ville.id;
    }
  }
  return { rappels, maintiens };
}

/**
 * Branchement Jev IDENTIQUE (zéro nouvelle question LLM) — le veto
 * AU-DESSUS de Jev : les ordres de DÉPLACEMENT/SORTIE (Move/MultiStep/Attack)
 * d'une unité défensive (rappelée ou maintenue) sont retirés de la décision
 * Jev ; le plan bot défend. Fortify/Heal/Hold/Sleep passent (défendre n'est
 * pas désobéir). Miroir de la discipline fondation (retiresUnitIds) et de la
 * garde de marche (OSCILLATION-MARCHE). Pur.
 */
export function filtrerOrdresJevDefense(ordres: Order[], unitesDefense: ReadonlySet<string>): Order[] {
  if (unitesDefense.size === 0) return ordres;
  return ordres.filter((o) => {
    if (!('unitId' in o) || !unitesDefense.has(o.unitId)) return true;
    return !(o.type === 'Move' || o.type === 'MultiStep' || o.type === 'Attack');
  });
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
  // BOT-GATE-ATTAQUE (Erik 10/11) : catégories tactiques Jev (L3) —
  // multiplicateur borné sur la valeur de l'attaquant, défaut ×1 (absent).
  categories?: Readonly<Record<string, string>>,
  // DEFENSE-VILLE-A2 — memo de rappel (unitId → cityId) : branché pour le
  // siège Jev (hystérésis à état) ; absent pour les bots (statu quo).
  defenseMemo?: Record<string, string>,
  // DEFENSE-VILLE-A3 — cooldown anti-ré-armement par ville (miroir memo).
  defenseCooldownMemo?: Record<string, number>,
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
  // BOT-MARCHE · D3 — miroir exact de planGarnison : en guerre civile, la
  // seule urgence est la MENACE AUTOUR DE LA CAPITALE (la guerre calme ne
  // rappelle plus personne — la campagne prime).
  const enGuerreCivile = [...ennemis].some((id) => !isBarbarian(id));
  const urgence = enGuerreCivile
    ? capitale
      ? menaceAutourCapitale(state, capitale, playerId, ennemis, profile.rayonMenace)
      : false
    : ennemis.size > 0 ||
      (capitale ? menaceAutourCapitale(state, capitale, playerId, ennemis, profile.rayonMenace) : false);
  const quotaCap = quotaCapitale(profile, mine.length, urgence);
  const besoinDe = (c: City): number => {
    if (enGuerreCivile && !urgence) return 0; // D3 : la campagne prime
    return c.capital ? quotaCap : besoinDeVille(c);
  };
  // PAIX-RYTHME · conscription : le brouillon global (ville, unité) au plus
  // près est calculé PLUS BAS (TB-SIEGE A2 — il a besoin de l'armée de
  // campagne pour l'exclure ; voir drafts ci-dessous).

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
  // TB-SIEGE-DEFENSE · A1 — le siège qui tombe : l'assaut sur la ville de
  // campagne n'est lancé que RASSEMBLÉ — effectif au rayon ≥ effectifAssaut
  // (data), OU ville sans défenseur, OU forces ≥ ratioForcesAssaut × garnison
  // visible à dist ≤ 1. Sinon : campement — l'armée agrège au lieu de mourir
  // en détail (« 39 assauts, 0 chute »).
  const auRayon = campagne
    ? membresArmee.filter((m) => dist(state, m, campagne) <= profile.rayonRalliement)
    : [];
  const effectifSiege = auRayon.length;
  let garnisonVisible = 0;
  let villeDefendue = false;
  if (campagne) {
    for (const u of Object.values(state.units)) {
      if (u.aboard || u.owner === playerId) continue;
      if (u.q === campagne.q && u.r === campagne.r) villeDefendue = true;
      if (dist(state, u, campagne) <= 1 && (ennemis.has(u.owner) || isBarbarian(u.owner))) {
        garnisonVisible += forceDefense(state, u);
      }
    }
  }
  const forcesSiege = auRayon.reduce((s, m) => s + forceAttaque(m), 0);
  const assautAutorise =
    campagne !== null &&
    effectifSiege > 0 && // l'assaut se juge AU rayon — jamais à distance
    (effectifSiege >= profile.effectifAssaut ||
      !villeDefendue ||
      forcesSiege >= profile.ratioForcesAssaut * garnisonVisible);
  // PAIX-RYTHME · conscription : brouillon global au plus près — miroir de
  // planGarnison. TB-SIEGE · A2 : les membres de l'armée EN CAMPAGNE (loin de
  // la capitale) sont EXCLUS du brouillon (fini la re-absorption en siège) —
  // sauf si la capitale est ASSAILLIE (ennemi adjacent — B2 : le rappel
  // défensif prime sur tout). Les membres proches de la capitale restent
  // mobilisables par la garnison (défense locale d'abord).
  const assautSurCapitale =
    capitale !== undefined &&
    Object.values(state.units).some(
      (u) => !u.aboard && (ennemis.has(u.owner) || isBarbarian(u.owner)) && dist(state, u, capitale) <= 1,
    );
  const enCampagne = new Set(
    [...armee].filter((id) => {
      const u = state.units[id];
      return u && (capitale === undefined || dist(state, u, capitale) > profile.rayonMenace);
    }),
  );
  const drafts = planGarnison(
    state,
    playerId,
    profile,
    assautSurCapitale ? undefined : enCampagne,
  ).drafts;
  // DEFENSE-VILLE-A · L1/L2 — le plan défensif PRIME sur hutte/patrouille/
  // garnison-drafts/campagne/chasse/exploration (garnison > rappel > escort
  // > exploration — canon 12/11 ; défendre une ville n'est pas de
  // l'inactivité). L'assautSurCapitale (B2) reste au-dessus via planGarnison.
  const defense = planDefenseVille(state, playerId, profile, defenseMemo, defenseCooldownMemo);
  // BOT-MARCHE · D2 : l'armée PERMANENTE en paix — calculée une fois (le
  // scout qui en fait partie ne patrouille plus, voir plus bas).
  const agressivite = agressiviteDe(me.civId);
  const prep = !campagne && guerreProbable(state, playerId, profile, agressivite)
    ? cibleProjetee(state, playerId, profile)
    : null;
  const armeeProjetee = prep ? assignerArmee(state, playerId, profile, prep) : new Set<string>();
  // PAIX-RYTHME · D1 (canon R-31) : au siège, les trios homogènes de
  // l'armée FUSENT — la conquête passe par la mécanique canon FormArmy.
  const fusionDe = new Map<string, GroupeFusion>();
  if (campagne) {
    for (const g of groupesFusion(state, playerId, profile, campagne)) {
      for (const id of g.membres) fusionDe.set(id, g);
    }
  }

  // OSCILLATION-MARCHE (Erik 02/11) — cases d'exploration déjà attribuées
  // CE tour (un scout par case ; l'attribution est séquentielle, tri R-81).
  const explorationReservees = new Set<string>();

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

    // BOT-ARMEE · siège actif : membre d'armée, campagne complète ET assaut
    // autorisé (TB-SIEGE A1 — rassemblé) → la garnison ennemie est
    // prioritaire (voir ciblesAttaquables).
    const enSiege = campagne !== null && armee.has(unit.id) && assautAutorise;

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
    // BOT-ESCARMOUCHE-GATE (canon Erik 11/11) — le gate REMPLACE le ban
    // structurel hérité d'avant le gate : un membre d'armée en campagne peut
    // ESCARMOUQUER un ennemi adjacent si l'espérance passe (courbe de
    // pression conservée — k décroissant avec la durée de guerre). Le
    // rassemblement et le siège restent prioritaires : le refus du gate
    // laisse tomber aux priorités suivantes (rallier/offensiver), l'assaut
    // complet part toujours à l'effectif (enSiege — priorité garnison).
    // Hors campagne (paix, patrouille, exploration) : personne n'attaque via
    // ② — la chasse aux barbares reste la porte ④.
    const attaquePermise = campagne !== null || enSiege;
    const sAtt = forceAttaque(unit);
    // BOT-GATE-ATTAQUE (canon Erik 10/11) : le rapport de forces simple ne
    // suffit plus — chaque cible adjacente passe le gate d'ESPÉRANCE
    // (P×gain ≥ k×(1−P)×perte, k=2, valeur tactique). Refus → la cible est
    // écartée ; si TOUTES le sont, l'unité tombe aux priorités suivantes
    // (repli/garnison/explorer — doctrine « jamais inactif »). Les villes
    // sans défenseur (capture par entrée) ne sont pas des batailles : pas
    // de gate.
    const categorie = categories?.[unit.id];
    const cibles = attaquePermise
      ? ciblesAttaquables(state, unit, playerId, ennemis, enSiege)
          .filter((c) => {
            if (!(sAtt > 0 && sAtt >= profile.ratioAttaqueMin * c.sDef)) return false;
            const defenseur = ennemiSurHex(state, c.hex.q, c.hex.r, playerId, ennemis);
            if (!defenseur) return true; // ville vide — entrée, pas bataille
            return deciderAttaqueUnitaire(state, unit, defenseur, categorie).passe;
          })
          .sort((a, b) => b.priorite - a.priorite || a.sDef - b.sDef || a.hex.q - b.hex.q || a.hex.r - b.hex.r)
      : [];
    if (cibles.length > 0) {
      objectifs.set(unit.id, { kind: 'attaquer', cible: cibles[0]!.hex });
      continue;
    }

    // DEFENSE-VILLE-A · L1/L2 : rappelée OU maintenue — objectif garnison
    // vers LA tuile de la ville menacée (sur place → Fortify, émission).
    // Passe après ② (une défense qui frappe une cible adjacente au gate
    // reste possible) et AVANT repli/hutte/patrouille/drafts/chasse/
    // exploration — la défense n'est pas de l'inactivité.
    const villeDefense = defense.rappels.get(unit.id) ?? defense.maintiens.get(unit.id);
    if (villeDefense) {
      objectifs.set(unit.id, { kind: 'garnison', cityId: villeDefense });
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

    // HUTTE-EXPLORATION (Erik 04/11) · D1 : la hutte connue à portée de
    // détour est une cible PRIORITAIRE — l'unité ENTRAÎNE (jamais le
    // contournement ZWV7T5). Les urgences passent avant (soigner/attaquer/
    // repli, au-dessus) ; l'armée de campagne NE se disperse PAS (colonne —
    // le rallié de PRÉPARATION, lui, ramasse : le cas u4) ; le brouillon de
    // garnison non plus (sa mission est la défense). La case d'exploration
    // far se re-tire au tour suivant : l'objectif hutte n'est qu'un détour.
    if (!armee.has(unit.id) && !drafts.has(unit.id)) {
      const hutte = hutteConnueProche(state, unit, playerId, explorationReservees, profile.hutteDetourMax);
      if (hutte) {
        objectifs.set(unit.id, { kind: 'explorer', cible: hutte });
        explorationReservees.add(`${hutte.q},${hutte.r}`);
        continue;
      }
    }

    // BOT-EXPLORATION D1 : hors urgence, le scout PATROUILLE en boucle autour
    // de la capitale au lieu de garnisonner (priorité entre ② et ③ — il n'abandonne
    // la boucle que pour soigner, attaquer ou replier).
    // BOT-MARCHE : sauf s'il est du détachement de campagne — en guerre le
    // scout est mobilisable (pool), l'armée passe avant la patrouille.
    if (
      capitale && !urgence && scoutId === unit.id && estCombattante(unit) &&
      !armee.has(unit.id) && !armeeProjetee.has(unit.id)
    ) {
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
      // TB-SIEGE · A1 : l'offensive ne part que si l'assaut est autorisé
      // (effectif requis + rassemblement effectifAssaut / écrasement / ville
      // vide) — sinon campement (rallier), l'armée agrège.
      // GUERRE-VIVANTE · D-A(b) : guerre stérile + rapport ≥ 1 → ASSAILLE :
      // marche DIRECTE sur la ville (objectif offensiver existant) au lieu du
      // campement d'anneau — convertir la guerre nominale en campagne ; la
      // porte d'assaut (assautAutorise) juge au rayon comme toujours.
      const proprietaireCible = state.cities[campagne.cityId]?.owner;
      const sterileGagnant =
        proprietaireCible !== undefined &&
        guerreSterileDe(state, playerId, proprietaireCible, profile) &&
        forcesDe(state, playerId) >= forcesDe(state, proprietaireCible);
      if (assautAutorise || sterileGagnant) {
        objectifs.set(unit.id, { kind: 'offensiver', cible: { q: campagne.q, r: campagne.r }, cityId: campagne.cityId });
      } else {
        // BOT-MARCHE · D1 : hex de ralliement STABLE (rang par id sur
        // l'anneau géométrique) — le rang par distance au tour courant
        // permutait à chaque pas et la colonne oscillait sans jamais
        // s'assembler (sonde L1).
        const hex = hexRalliementMembre(state, campagne, playerId, profile, membresArmee, unit.id);
        objectifs.set(unit.id, { kind: 'rallier', cible: hex, cityId: campagne.cityId });
      }
      continue;
    }

    // BOT-MARCHE · D2 — armée PERMANENTE en temps de paix : quand le rapport
    // de forces annonce une guerre probable (seuil effectif du profil, même
    // condition que la déclaration — miroir du joueur qui prépare), le pool
    // se rassemble vers la cible PROJETÉE. À la déclaration, l'armée est
    // déjà campée au bord ennemi : la guerre éclate en marche.
    if (estCombattante(unit) && prep && armeeProjetee.has(unit.id)) {
      const membresProjet = Object.values(state.units).filter(
        (u) => u.owner === playerId && armeeProjetee.has(u.id) && !u.aboard,
      );
      const hex = hexRalliementMembre(state, prep, playerId, profile, membresProjet, unit.id);
      objectifs.set(unit.id, { kind: 'rallier', cible: hex, cityId: prep.cityId });
      continue;
    }

    // ④ chasser les barbares : proie la plus proche prenable (ratio
    // favorable — sinon D2 s'applique et l'unité ne se suicide pas).
    if (estCombattante(unit) || stats?.aquatic) {
      const proie = barbares
        .slice()
        .sort((a, b) => dist(state, unit, a) - dist(state, unit, b) || compareUnitIds(a.id, b.id))
        .find((b) => sAtt >= profile.ratioAttaqueMin * forceDefense(state, b) &&
          // BOT-GATE-ATTAQUE : la chasse passe aussi par l'espérance —
          // fini le guerrier isolé sacrifié au gardien fortifié (D3UUQJ t5).
          deciderAttaqueUnitaire(state, unit, b, categorie).passe);
      if (proie) {
        objectifs.set(unit.id, { kind: 'chasser', cible: { q: proie.q, r: proie.r } });
        continue;
      }
    }

    // ⑤ explorer : la case la plus lointaine NON couverte par la vision
    // empire (deterministe : distance desc, clé asc) — pas d'errance.
    // OSCILLATION-MARCHE (Erik 02/11) — stabilité de la cible : le classement
    // est ANCRÉ À LA CAPITALE (distance indépendante de la position de
    // l'unité). Mesurée depuis l'unité, la « plus lointaine » basculait à
    // chaque pas (avancer rapproche une frontière et en éloigne une autre)
    // → l'explorateur piétinait (u4 : 20,25-20,27, t9-18 au banc). La case
    // est réservée à UN scout par tour (attribution séquentielle — sinon
    // tous les scouts convergeaient vers la même cible ancrée).
    const ancre = Object.values(state.cities).find((c) => c.owner === playerId && c.capital) ?? unit;
    let meilleure: { q: number; r: number } | null = null;
    let bestD = -1;
    let bestKey = '';
    for (const [key, tile] of Object.entries(state.map)) {
      if (vision.has(key) || explorationReservees.has(key)) continue;
      const parts = key.split(',');
      const hex = { q: Number(parts[0]), r: Number(parts[1]) };
      if (!TERRAINS[tile.terrain]?.passable && !(stats?.aquatic && TERRAINS[tile.terrain]?.navalAccess)) continue;
      const d = dist(state, ancre, hex);
      if (d > bestD || (d === bestD && key < bestKey)) {
        bestD = d;
        bestKey = key;
        meilleure = hex;
      }
    }
    if (meilleure) {
      objectifs.set(unit.id, { kind: 'explorer', cible: meilleure });
      explorationReservees.add(bestKey);
    }
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

/**
 * TB-SIEGE-DEFENSE · B1 (T-B voté, Erik 31/10) — la COURSE À L'ONU : un
 * adversaire vivant (non barbare) à ≥ `victoire.seuilJalonsCourseOnu` jalons
 * culturels (80 % du canon R-116) ET l'ONU PAS encore bâtie dans le monde →
 * le bot devient ÉLIGIBLE à bâtir l'ONU en course (le filtre cultureVictory
 * du menu merveilles devient conditionnel). Pur.
 */
export function courseOnuAdversaire(state: GameState, me: PlayerId): boolean {
  const vict = BOT_SETTINGS.victoire;
  if (Object.values(state.cities).some((c) => (c.wonders ?? []).includes('nations_unies'))) return false;
  const actifs = new Set(activePlayerIds(state));
  return Object.values(state.players).some(
    (p) =>
      p.id !== me &&
      actifs.has(p.id) &&
      !isBarbarian(p.id) &&
      p.defeated !== true &&
      (p.cultureMilestones ?? 0) >= vict.seuilJalonsCourseOnu,
  );
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
  // TB-SIEGE · B1 : les merveilles de victoire culturelle (l'ONU) sont
  // éligibles en COURSE — un adversaire est près des jalons et l'ONU n'est
  // pas bâtie. Hors course : filtre historique (jamais).
  const courseOnu = courseOnuAdversaire(state, player.id);
  for (const w of Object.values(WONDERS)) {
    if (w.implemented === false || (w.cultureVictory && !courseOnu)) continue;
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
  // JEV-ESCORTE (canon Erik 12/11 — botPolicy PARTAGÉ, les calibrages
  // profitent aux deux) : le colon seul est un PARI ÉVALUÉ — risque faible
  // OU escorte en place → autorisé ; risque ÉLEVÉ ET 0 combattante → PIVOT
  // guerrier ; risque élevé, combattantes toutes en garnison → le colon
  // ATTEND (retombée sur ③ bâtiment). Site = approximation géométrique
  // (siteColonParDefaut — la réserve réelle reste le memo Jev 🔶).
  if ((city.pop >= eco.seuilPopColonne || growthThresholdFor(city.pop) === null) &&
      !Object.values(state.units).some((u) => u.owner === player.id && u.type === 'colon' && !u.aboard)) {
    const colon = unitesDisponibles.find((o) => o.kind === 'unit' && o.id === 'colon');
    if (colon) {
      const site = siteColonParDefaut(state, city) ?? { q: city.q, r: city.r };
      const verdict = deciderProductionColon(state, player.id, site);
      if (verdict.decision === 'pivot') {
        const pivot = unitesDisponibles.find((o) => o.kind === 'unit' && o.id === verdict.pivot);
        if (pivot) return pivot;
      } else if (verdict.decision === 'autorise') {
        return colon;
      }
      // 'attendre' (ou pivot indisponible) : pas de colon ce tour — ③.
    }
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
export function botPolicy(
  state: GameState,
  playerId: PlayerId,
  rng: SeededRng,
  difficulte?: string,
  // BOT-GATE-ATTAQUE (Erik 10/11) : qualification Jev (jeGarde/sacrifiable/
  // positionDecisive par unité — multiplicateur borné ×0,5–×2 sur la valeur
  // de l'attaquant). Absent/illisible → neutre (×1), le moteur calcule.
  // Record<string, string> volontaire : une catégorie inconnue/illisible
  // vaut neutre (×1) — multiplicateurCategorie rejette ce qu'elle ne connaît pas.
  opts?: {
    categoriesTactiques?: Readonly<Record<string, string>>;
    // DEFENSE-VILLE-A2 — memo de rappel Jev (pose/consomme les marqueurs
    // d'état « rappel en cours » — hystérésis à état, schemaVersion 28).
    defenseRappelsMemo?: Record<string, string>;
    // DEFENSE-VILLE-A3 — cooldown anti-ré-armement par ville (miroir memo).
    defenseCooldownMemo?: Record<string, number>;
  },
): BotPlan {
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
      bataillesDe(state, playerId, e) === 0 &&
      dureeGuerre(state, playerId, e) >= dureeMinGuerre(state, playerId, e, profile);
    // GUERRE-VIVANTE · D-A(b) + D-C : une guerre STÉRILE se tranche —
    // rapport < 1 → il propose la paix LUI-MÊME, CADENCÉE
    // `guerreSterile.cooldown` tours (déterministe — reste de la division de
    // la durée, zéro état caché) ; la réception est réglée par la grille du
    // receveur (R-189). Rapport ≥ 1 → PAS de proposition : il assaille
    // (conversion en campagne — voir assignerObjectifs). Le videTerme canon
    // (proposition chaque tour) est SUSPENDU pour les guerres stériles —
    // plus jamais 320 tours de propositions-refusées chaque tour.
    if (guerreSterileDe(state, playerId, e, profile)) {
      if (
        sesForces > 0 &&
        forcesDe(state, playerId) < sesForces && // rapport < 1 (handoff D-A)
        dureeGuerre(state, playerId, e) % BOT_SETTINGS.guerreSterile.cooldown === 0
      ) {
        actions.push({ type: 'ProposePeace', player: e });
      }
      continue;
    }
    if ((perd || videTerme) && deciderPaix(state, e, playerId, profile)) {
      actions.push({ type: 'ProposePeace', player: e });
    }
  }
  if (!enGuerre) {
    const cible = deciderGuerre(state, playerId, profile, rng, agressiviteDe(me.civId));
    if (cible) actions.push({ type: 'DeclareWar', player: cible });
  }

  const objectifs = assignerObjectifs(
    state,
    playerId,
    profile,
    opts?.categoriesTactiques,
    opts?.defenseRappelsMemo,
    opts?.defenseCooldownMemo,
  );
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
      // ④ chasse : un pas glouton déterministe vers la cible (le contact est
      // adjacent — pas de route à contourner).
      case 'chasser': {
        const step = obj.cible ? pasVers(unit, state, obj.cible) : null;
        orders.push(step ? { type: 'Move', unitId: unit.id, path: [step] } : { type: 'Hold', unitId: unit.id });
        break;
      }
      // BOT-EXPLORATION patrouille / ⑤ exploration : pas ROUTIER d'abord
      // (BFS wrappé — canon BOT-ARMEE), glouton en repli. CONFIANCE-EXPLORATION
      // (Erik 03/11, prod YU4SHH) : depuis une poche géométrique (u4 à
      // (33,12) t16→24), le glouton strict renvoyait null — les seules
      // sorties terrestres étaient non-améliorantes en distance cube — et
      // l'unité tenait sur place POUR TOUJOURS, mp inutilisés. Le BFS route
      // autour ; à défaut de route, tenue EXPLICITE (Hold émis — doctrine :
      // jamais inactif sans ordre journalisé).
      case 'patrouiller':
      case 'explorer': {
        const step = obj.cible
          ? (pasVersRoutier(unit, state, obj.cible) ?? pasVers(unit, state, obj.cible))
          : null;
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
  // TB-SIEGE · B1 : en course à l'ONU (adversaire à ≥ seuilJalonsCourseOnu,
  // ONU non bâtie), la CAPITALE est priorisée si le bot a lui-même ≥
  // jalonsMinPrioriteOnu jalons — sinon arbitrage inchangé (consigné).
  const courseOnu = courseOnuAdversaire(state, playerId);
  for (const city of myCities) {
    if (city.production) continue;
    const component = (me.techsUnlocked ?? []).includes('vol_spatial') ? missingShipComponent(myCities) : null;
    let item: ProductionItem | null = component
      ? ({ kind: 'building', id: component } as ProductionItem)
      : null;
    if (!item && (me.cultureMilestones ?? 0) >= CULTURE.milestonesTarget) item = { kind: 'wonder', id: 'nations_unies' };
    if (
      !item && courseOnu && city.capital &&
      (me.cultureMilestones ?? 0) >= BOT_SETTINGS.victoire.jalonsMinPrioriteOnu
    ) {
      item = { kind: 'wonder', id: 'nations_unies' };
    }
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
