/**
 * JEV-ESCORTE (canon Erik 12/11, prod D3UUQJ) — le déploiement du COLON
 * s'évalue, il n'est ni interdit ni aveugle.
 *
 * Le fait déclencheur : D3UUQJ — colon en production dès t3, guerrier
 * suicidé t5, production JAMAIS pivotée, colon sorti t19 SEUL sans escorte.
 * Verdict Erik : « un colon qui sort seul est un gâchis » — MAIS le colon
 * seul reste acceptable si le déploiement est PEU RISQUÉ (site exploré,
 * ennemis incapables d'atteindre). Le colon seul n'est pas un interdit :
 * c'est un pari, et un pari S'ÉVALUE.
 *
 * L'évaluation est DÉTERMINISTE, data-driven (bot.json `escort`, rayons
 * tunables, zéro durcissement), facteurs au BFS (portée de MARCHE réelle,
 * pas à vol d'oiseau) :
 *   - unité ennemie connue (barbare compris) capable d'atteindre le site OU
 *     un tile de la route dans ≤ toursEnnemi → risque élevé ;
 *   - camp barbare connu à distance ≤ campDistMax du site → risque élevé
 *     (les satellites sortent — D3UUQJ) ;
 *   - site jamais exploré (tile absent de l'état CONNU — brume) → risque
 *     majoré ;
 *   - route traversant la zone d'influence (dist ≤ influenceRouteDist) d'un
 *     ennemi connu → risque élevé.
 *
 * Décisions (canon 12/11) :
 *   D1 colon en file/sorti AUTORISÉ si risque faible OU escorte en place ;
 *   D2 risque élevé ET 0 combattante → PIVOT guerrier ;
 *   D3 escorte en place = combattante dédiée disponible (hors garnison) OU
 *      adjacente au colon (réutilise la notion d'« escorte effective » du
 *      gate — positionCritique) ;
 *   D4 colon déjà sorti, risque montant → RAPPEL (miroir du rappel D3 de
 *      l'exploration — l'appelant réutilise Move, zéro nouvel ordre) ;
 *   D5 risque élevé, combattantes toutes en garnison → le colon ATTEND
 *      (pas de pivot aveugle, pas de sortie).
 *
 * Comme le gate d'attaque, le moteur DÉCIDE — pas Jev : gainSite et la
 * question `produire` (seuil 0,3) restent inchangés, le veto s'applique
 * AU-DESSUS du choix de Jev. Zéro nouvelle question LLM.
 */
import { BOT_SETTINGS, TERRAINS, UNIT_TYPES } from './data.js';
import { isBarbarian } from './state.js';
import { hexDistanceW, normalizeHexW } from './hex.js';
import type { BotEscorteData } from './types.js';
import type { BarbarianVillage, City, GameState, PlayerId, Unit } from './state.js';

/** Table escort (bot.json `escort`). */
export function escortColonDuBot(): BotEscorteData {
  return BOT_SETTINGS.escort;
}

export interface RisqueColon {
  /** 'faible' = aucun facteur (le pari est bon) ; 'eleve' = au moins un. */
  niveau: 'faible' | 'eleve';
  /** Facteurs déclenchés — journalisables tels quels. */
  facteurs: string[];
}

const DIRS: Array<[number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

/** Ennemis CONNUS du joueur (barbares permanents — R-95 — ou guerre
 *  déclarée). L'appelant passe l'état QU'IL connaît : Jev l'état filtré par
 *  la brume, le botPolicy l'état complet (même philosophie que le gate). */
function ennemisConnus(state: GameState, joueurId: PlayerId): Unit[] {
  const enGuerre = new Set<PlayerId>();
  for (const [a, b] of state.diplomacy.war) {
    if (a === joueurId) enGuerre.add(b);
    if (b === joueurId) enGuerre.add(a);
  }
  return Object.values(state.units).filter(
    (u) => !u.aboard && (isBarbarian(u.owner) || enGuerre.has(u.owner)),
  );
}

function combattantesDe(state: GameState, joueurId: PlayerId): Unit[] {
  return Object.values(state.units).filter(
    (u) => u.owner === joueurId && !u.aboard && (UNIT_TYPES[u.type]?.canAttack ?? false),
  );
}

/** Carte de portée de MARCHE (BFS, wrap canon CARTE-RONDE) : distance en
 *  cases depuis l'unité vers chaque tile praticable, plafonnée à `limite`.
 *  Le transit ignore les unités (la MENACE est la réachabilité du terrain —
 *  une case occupée ce tour ne l'est pas le suivant). DEFENSE-VILLE-A :
 *  exportée pour menacesVille (la menace de ville juge à la portée de MARCHE
 *  réelle — même philosophie, règles inchangées). */
export function porteeMarche(state: GameState, unit: Unit, limite: number): Map<string, number> {
  const dists = new Map<string, number>([[`${unit.q},${unit.r}`, 0]]);
  if (limite <= 0) return dists;
  const stats = UNIT_TYPES[unit.type];
  const aquatic = stats?.aquatic === true;
  const praticable = (h: { q: number; r: number }): boolean => {
    const tile = state.map[`${h.q},${h.r}`];
    if (!tile) return false;
    if (aquatic) {
      const access = TERRAINS[tile.terrain]?.navalAccess;
      return !!access && !(access === 'ocean' && stats?.navalAccess !== 'ocean');
    }
    return !!TERRAINS[tile.terrain]?.passable;
  };
  let frontiere: Array<{ q: number; r: number }> = [{ q: unit.q, r: unit.r }];
  for (let d = 1; d <= limite; d++) {
    const suivante: Array<{ q: number; r: number }> = [];
    for (const cur of frontiere) {
      const voisins = DIRS.map(([dq, dr]) =>
        normalizeHexW({ q: cur.q + dq, r: cur.r + dr }, state.mapWidth),
      ).sort((a, b) => a.q - b.q || a.r - b.r); // R-81 : voisinage trié
      for (const n of voisins) {
        const k = `${n.q},${n.r}`;
        if (dists.has(k) || !praticable(n)) continue;
        dists.set(k, d);
        suivante.push(n);
      }
    }
    frontiere = suivante;
    if (frontiere.length === 0) break;
  }
  return dists;
}

/**
 * L'ÉVALUATION du pari (D2, canon 12/11) — déterministe, pur. `site` est la
 * destination de fondation ; `route` les tiles intermédiaires prévus (la
 * route prévue du colon — absent : seul le site compte). Le tile de site
 * ABSENT de l'état connu = brume (D5 : risque majoré).
 */
export function risqueDeploiementColon(
  state: GameState,
  joueurId: PlayerId,
  site: { q: number; r: number },
  route?: Array<{ q: number; r: number }>,
): RisqueColon {
  const d = escortColonDuBot();
  const facteurs: string[] = [];
  const siteKey = `${site.q},${site.r}`;
  const routeKeys = (route ?? []).map((h) => `${h.q},${h.r}`);
  const tousKeys = [siteKey, ...routeKeys];

  // Brume : le site n'existe pas dans l'état CONNU (jamais exploré — on ne
  // sait pas ce qui est là). Risque majoré.
  if (!state.map[siteKey]) facteurs.push('siteBrume');

  // Camps barbares connus proches du site (les satellites sortent — D3UUQJ).
  const camps: BarbarianVillage[] = state.villages ?? [];
  for (const v of camps) {
    if (hexDistanceW(v, site, state.mapWidth) <= d.campDistMax) {
      facteurs.push('campBarbareProche');
      break;
    }
  }

  const ennemis = ennemisConnus(state, joueurId);
  for (const e of ennemis) {
    const mouvement = UNIT_TYPES[e.type]?.movement ?? 1;
    const limite = d.toursEnnemi * mouvement; // portée de MARCHE, pas à vol d'oiseau
    const portee = porteeMarche(state, e, limite);
    if (portee.has(siteKey)) facteurs.push('uniteAtteintSite');
    else if (routeKeys.some((k) => portee.has(k))) facteurs.push('uniteAtteintRoute');
    // Zone d'influence : la route passe à portée immédiate d'un ennemi
    // connu, même s'il ne peut pas encore courir jusqu'au site.
    if (routeKeys.some((k) => {
      const [q, r] = k.split(',').map(Number);
      return hexDistanceW(e, { q: q!, r: r! }, state.mapWidth) <= d.influenceRouteDist;
    })) {
      facteurs.push('routeInfluence');
    }
  }

  return { niveau: facteurs.length > 0 ? 'eleve' : 'faible', facteurs };
}

/** Combattante amie NON embarquée, hors GARNISON (ni fortifiée ni dans une
 *  de mes villes) = disponible comme escorte dédiée. DEFENSE-VILLE-A2 :
 *  `exclues` (optionnel — défaut bit-à-bit) retire les unités RAPPELÉES par
 *  le plan défensif — une escorte qui rentre en garnison ne protège plus. */
function combattanteDisponible(state: GameState, joueurId: PlayerId, exclues?: ReadonlySet<string>): boolean {
  const villes = new Set(
    Object.values(state.cities)
      .filter((c) => c.owner === joueurId)
      .map((c) => `${c.q},${c.r}`),
  );
  return combattantesDe(state, joueurId).some(
    (u) => !u.fortified && !villes.has(`${u.q},${u.r}`) && !(exclues?.has(u.id) ?? false),
  );
}

/** D3 — escorte en place : une combattante dédiée disponible (elle peut
 *  marcher avec le colon), ou déjà ADJACENTE au colon (escorte effective du
 *  gate — positionCritique). Sans colon (décision de production), seule la
 *  disponibilité compte. Pur, déterministe. */
export function escorteEnPlace(
  state: GameState,
  joueurId: PlayerId,
  colon?: Unit,
  // DEFENSE-VILLE-A2 — cohérence rappel × escort : les combattantes
  // RAPPELÉES par planDefenseVille ne comptent plus (le pari se réévalue
  // quand les conditions changent — canon escort étendu, Erik 12/11).
  exclues?: ReadonlySet<string>,
): boolean {
  if (colon) {
    // Adjacente au sens du gate (positionCritique) : dist === 1. Une
    // combattante SUR la case du colon est une garnison de ville (le colon
    // attend déjà) — pas une escorte qui marchera avec lui.
    const adjacente = combattantesDe(state, joueurId).some(
      (u) => u.id !== colon.id && hexDistanceW(u, colon, state.mapWidth) === 1 && !(exclues?.has(u.id) ?? false),
    );
    if (adjacente) return true;
  }
  return combattanteDisponible(state, joueurId, exclues);
}

export type VerdictProductionColon =
  | { decision: 'autorise'; escorte: boolean; risque: RisqueColon }
  | { decision: 'pivot'; pivot: string; risque: RisqueColon }
  | { decision: 'attendre'; risque: RisqueColon };

/** D1/D2 — décision de production : le colon peut-il être mis en file (ou
 *  rester prioritaire) ? Risque faible → autorisé ; risque élevé MAIS
 *  escorte en place → autorisé ; risque élevé ET 0 combattante → PIVOT
 *  guerrier ; risque élevé avec combattantes toutes en garnison → le colon
 *  ATTEND (ni sortie ni pivot aveugle — D5). Pur, déterministe. */
export function deciderProductionColon(
  state: GameState,
  joueurId: PlayerId,
  site: { q: number; r: number },
  route?: Array<{ q: number; r: number }>,
  // DEFENSE-VILLE-A2 : miroir escorteEnPlace — les rappelées ne protègent plus.
  exclues?: ReadonlySet<string>,
): VerdictProductionColon {
  const risque = risqueDeploiementColon(state, joueurId, site, route);
  if (risque.niveau === 'faible') return { decision: 'autorise', escorte: false, risque };
  if (escorteEnPlace(state, joueurId, undefined, exclues)) return { decision: 'autorise', escorte: true, risque };
  if (combattantesDe(state, joueurId).length === 0) {
    return { decision: 'pivot', pivot: escortColonDuBot().pivotUnit, risque };
  }
  return { decision: 'attendre', risque };
}

/** D4 — le colon déjà SORTI (hors de mes villes) est-il à rappeler ? Risque
 *  élevé ET aucune escorte ADJACENTE (une combattante disponible loin ne
 *  protège pas un colon exposé MAINTENANT — elle le rejoindra, lui, à la
 *  garnison). Dans une ville, le colon attend déjà : pas de rappel. */
export function doitRappelerColon(
  state: GameState,
  joueurId: PlayerId,
  colon: Unit,
  route?: Array<{ q: number; r: number }>,
  // DEFENSE-VILLE-A2 : une escorte RAPPELÉE (exclues) n'empêche plus le
  // rappel du colon — il ne reste JAMAIS seul sur une route risquée.
  exclues?: ReadonlySet<string>,
): boolean {
  const dansMaVille = Object.values(state.cities).some(
    (c) => c.owner === joueurId && c.q === colon.q && c.r === colon.r,
  );
  if (dansMaVille) return false;
  const risque = risqueDeploiementColon(state, joueurId, colon, route);
  if (risque.niveau !== 'eleve') return false;
  const adjacente = combattantesDe(state, joueurId).some(
    (u) => u.id !== colon.id && hexDistanceW(u, colon, state.mapWidth) <= 1 && !(exclues?.has(u.id) ?? false),
  );
  return !adjacente;
}

/** Approximation géométrique du SITE par défaut pour l'arbitrage de
 *  production (miroir `siteFondationDisponible` du gate) : la case
 *  praticable libre la plus proche (sans ville ni village) dans un rayon
 *  `siteParDefautRayon`. La réserve réelle reste le memo Jev — le moteur
 *  juge la place, pas la qualité 🔶. */
export function siteColonParDefaut(
  state: GameState,
  city: City,
): { q: number; r: number } | null {
  const d = escortColonDuBot();
  let best: { q: number; r: number } | null = null;
  let bestD = Infinity;
  for (const [key, tile] of Object.entries(state.map)) {
    if (!TERRAINS[tile.terrain]?.passable) continue;
    const parts = key.split(',');
    const hex = { q: Number(parts[0]), r: Number(parts[1]) };
    if (Object.values(state.cities).some((c) => c.q === hex.q && c.r === hex.r)) continue;
    if ((state.villages ?? []).some((v) => v.q === hex.q && v.r === hex.r)) continue;
    if (Object.values(state.units).some((u) => u.q === hex.q && u.r === hex.r && !u.aboard)) continue;
    const dist = hexDistanceW(hex, city, state.mapWidth);
    if (dist > d.siteParDefautRayon) continue;
    if (dist < bestD || (dist === bestD && best && (hex.q < best.q || (hex.q === best.q && hex.r < best.r)))) {
      bestD = dist;
      best = hex;
    }
  }
  return best;
}
