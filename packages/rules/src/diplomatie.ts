/**
 * DIPLOMATIE-T1 (décisions Erik 19/10, HANDOFF-DIPLOMATIE-T1) — module pur :
 * l'état de guerre PUBLIC par paire de nations (`diplomacy.war`, défaut
 * absent = Paix) et l'action immédiate `DeclareWar` (même contrat que
 * SetGovernment — appliquée à la réception par le DO, hors ordres de tour).
 *
 * T1 volontairement minimal : PAS de négociation (T2), PAS de paix imposée
 * (T3), les bots ne déclarent JAMAIS (D4 — leur politique ne porte pas
 * l'action). Re-déclaration après paix : permise par conception (T2 la
 * négociera) — mais la re-déclaration SANS paix est refusée.
 */
import type { GameEvent } from './events.js';
import type { GameState, PlayerId } from './state.js';
import { areAtWar, activePlayerIds } from './state.js';
import { hexDistanceW } from './hex.js';
import { TECHS } from './techs.js';
import { eraOfTechCount } from './civilizations.js';

export interface DeclareWarOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}
export interface DeclareWarKo {
  ok: false;
  reason: string;
}

/** Paire canonique (ids triés) — miroir des paires stockées dans `war`. */
export function paireGuerre(a: PlayerId, b: PlayerId): [PlayerId, PlayerId] {
  return a < b ? [a, b] : [b, a];
}

/**
 * D3 · DeclareWar { player } — action IMMÉDIATE, PUBLIQUE (aucun fog sur les
 * guerres) et MUTUELLE : la paire rejoint `diplomacy.war`, débloquant les
 * attaques DANS LES DEUX SENS (gate D2). Pur : l'état d'entrée est cloné,
 * jamais muté. L'événement `WarDeclared` prolonge le journal diffusé (le DO
 * l'ajoute à `lastEvents`, miroir SetGovernment/GovernmentChanged).
 *
 * BOT-TC (Erik 25/10) : le tour de DÉBUT est consigné dans
 * `diplomacy.warsDepuis` (champ optionnel — zéro migration) pour la durée de
 * guerre (paix minimale, délai entre guerres).
 */
export function applyDeclareWar(input: GameState, playerId: PlayerId, target: PlayerId): DeclareWarOk | DeclareWarKo {
  if (playerId === target) return { ok: false, reason: 'on ne se déclare pas la guerre à soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(playerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${playerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (areAtWar(input, playerId, target)) return { ok: false, reason: 'déjà en guerre' };
  const st = structuredClone(input);
  const [a, b] = paireGuerre(playerId, target);
  st.diplomacy.war = [...st.diplomacy.war, paireGuerre(playerId, target)].sort(
    (x, y) => x[0].localeCompare(y[0]) || x[1].localeCompare(y[1]),
  );
  st.diplomacy.warsDepuis = { ...st.diplomacy.warsDepuis, [`${a},${b}`]: st.turn };
  // HORLOGE-DISTANCE (Erik 28/10) : la distance WRAP entre capitales
  // effectives est FIGÉE à la déclaration — l'horloge de paix connaît le
  // coût de la marche tel qu'il se présentait au départ de campagne.
  st.diplomacy.distancesCible = {
    ...(st.diplomacy.distancesCible ?? {}),
    [`${a},${b}`]: distanceCapitales(st, playerId, target),
  };
  // BOT-MARCHE (Erik 28/10) : le tour de déclaration est consigné par PAIRE
  // (conservé après la paix) — verrou de re-déclaration delaiRedeclaration.
  st.diplomacy.dernieresCibles = {
    ...(st.diplomacy.dernieresCibles ?? {}),
    [`${a},${b}`]: st.turn,
  };
  const events: GameEvent[] = [{ seq: 0, type: 'WarDeclared', from: playerId, on: target }];
  return { ok: true, state: st, events };
}

/** Capitale effective (capitale, sinon première ville — tri (capital, id)). */
function capitaleEffective(state: GameState, joueur: PlayerId): { q: number; r: number } | null {
  const villes = Object.values(state.cities)
    .filter((c) => c.owner === joueur)
    .sort((x, y) =>
      x.capital !== y.capital ? (x.capital ? -1 : 1) : x.id < y.id ? -1 : 1,
    );
  const c = villes[0];
  return c ? { q: c.q, r: c.r } : null;
}

/** HORLOGE-DISTANCE · Distance wrap entre capitales effectives (0 si
 *  capitale introuvable — cas dégénéré, repli du comportement historique). */
function distanceCapitales(state: GameState, a: PlayerId, b: PlayerId): number {
  const ca = capitaleEffective(state, a);
  const cb = capitaleEffective(state, b);
  if (!ca || !cb) return 0;
  return hexDistanceW(ca, cb, state.mapWidth);
}

/** Clé canonique d'une paire dans `warsDepuis`. */
function cleDepuis(a: PlayerId, b: PlayerId): string {
  const [x, y] = paireGuerre(a, b);
  return `${x},${y}`;
}

/**
 * PAIX-RYTHME (Erik 27/10, D3) · Nombre de BATAILLES de la guerre (a, b) —
 * les échanges de combat comptés par le moteur (compterBataille). 0 si
 * absen­t/champ pré-PAIX-RYTHME.
 */
export function bataillesDe(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.diplomacy.batailles?.[cleDepuis(a, b)] ?? 0;
}

/**
 * PAIX-RYTHME (Erik 27/10, D3) · Compte UNE bataille de la guerre (a, b) —
 * appelé par le moteur à chaque échange de combat entre deux joueurs dont la
 * paire est dans `diplomacy.war` (les barbares n'y figurent jamais). Mute
 * l'état MOTEUR (contexte de résolution — miroir des compteurs du board) ;
 * champ optionnel créé à la première bataille (zéro migration).
 */
export function compterBataille(state: GameState, a: PlayerId, b: PlayerId): void {
  const cle = cleDepuis(a, b);
  const batailles = { ...state.diplomacy.batailles };
  batailles[cle] = (batailles[cle] ?? 0) + 1;
  state.diplomacy.batailles = batailles;
}

/**
 * BOT-TC (Erik 25/10, D3) · Durée de la guerre (a, b) en tours — 0 si la
 * guerre est inconnue/pré-BOT-TC (pas d'entrée `warsDepuis`) ou finie.
 */
export function dureeGuerre(state: GameState, a: PlayerId, b: PlayerId): number {
  const depuis = state.diplomacy.warsDepuis?.[cleDepuis(a, b)];
  return depuis === undefined ? 0 : Math.max(0, state.turn - depuis);
}

/**
 * HORLOGE-DISTANCE (Erik 28/10, D1) · Distance WRAP entre capitales
 * effectives de la guerre (a, b), FIGÉE À LA DÉCLARATION (clé canonique).
 * 0 si absente (guerre pré-existante — repli du comportement historique).
 */
export function distanceCibleGuerre(state: GameState, a: PlayerId, b: PlayerId): number {
  return state.diplomacy.distancesCible?.[cleDepuis(a, b)] ?? 0;
}

/**
 * BOT-MARCHE (Erik 28/10, D4) · Tour de la DERNIÈRE DÉCLARATION de la paire
 * (a, b) — consigné à DeclareWar, CONSERVÉ après la paix (clé canonique).
 * Undefined si jamais déclarée. Sert au verrou de re-déclaration
 * (delaiRedeclaration côté botPolicy).
 */
export function derniereDeclarationCible(state: GameState, a: PlayerId, b: PlayerId): number | undefined {
  return state.diplomacy.dernieresCibles?.[cleDepuis(a, b)];
}

/**
 * BOT-TC (Erik 25/10, D3) · ProposePeace { player } — action immédiate,
 * PUBLIQUE, même contrat que DeclareWar (forme validée EN PREMIER côté DO,
 * leçon 7f). La DÉCISION d'accepter est EXTERNE (le bot la calcule : écrasé
 * ou guerre traînante ⇒ oui — botPolicy.deciderPaix) ; ici on l'applique :
 *   accepte  → la paire quitte `wars` (purge), `warsDepuis` effacée,
 *              `dernieresGuerres` (fin de guerre) posée pour le délai D1,
 *              événement `PeaceAccepted` ;
 *   refuse   → `wars` intacte, événement `PeaceRefused` (crédibilité T1).
 * Re-déclaration après paix : permise (miroir T1).
 */
export function applyProposePeace(
  input: GameState,
  proposerId: PlayerId,
  target: PlayerId,
  accepte: boolean,
  goldOffer?: number,
): DeclareWarOk | DeclareWarKo {
  if (proposerId === target) return { ok: false, reason: 'on ne se propose pas la paix à soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(proposerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${proposerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (!areAtWar(input, proposerId, target)) return { ok: false, reason: 'pas en guerre' };
  // DIPLOMATIE-T2 (Erik 28/10, D2) : la COMPENSATION est validée avec le
  // reste de la forme métier — entier ≥ 0, trésorerie suffisante (le refus
  // du bot ne passe JAMAIS par ici : l'or ne quitte que la trésorerie d'une
  // paix SIGNÉE).
  const or = goldOffer ?? 0;
  if (!Number.isInteger(or) || or < 0) return { ok: false, reason: 'compensation invalide' };
  if (input.players[proposerId]!.treasury < or) return { ok: false, reason: 'trésorerie insuffisante' };
  if (!accepte) {
    // DIPLOMATIE-T2 · D1 : une offre NÉGOCIÉE (compensation présente) refusée
    // reste PRIVÉE (PeaceOfferRefused) — miroir de l'acceptation compensée ;
    // la paix sèche (T1) conserve son refus PUBLIC (crédibilité T1).
    if (goldOffer !== undefined) {
      return {
        ok: true,
        state: structuredClone(input),
        events: [{ seq: 0, type: 'PeaceOfferRefused', from: proposerId, on: target, gold: or }],
      };
    }
    return {
      ok: true,
      state: structuredClone(input),
      events: [{ seq: 0, type: 'PeaceRefused', from: proposerId, on: target }],
    };
  }
  const st = structuredClone(input);
  if (or > 0) {
    // D2 : l'or passe À L'ACCEPTATION — atomique avec la purge de la guerre.
    st.players[proposerId]!.treasury -= or;
    st.players[target]!.treasury += or;
  }
  const [a, b] = paireGuerre(proposerId, target);
  st.diplomacy.war = st.diplomacy.war.filter(([x, y]) => !(x === a && y === b));
  const warsDepuis = { ...st.diplomacy.warsDepuis };
  delete warsDepuis[cleDepuis(a, b)];
  st.diplomacy.warsDepuis = warsDepuis;
  // PAIX-RYTHME : le compteur de batailles repart à zéro avec la guerre.
  const batailles = { ...st.diplomacy.batailles };
  delete batailles[cleDepuis(a, b)];
  st.diplomacy.batailles = batailles;
  // HORLOGE-DISTANCE : la distance consignée repart avec la guerre.
  const distances = { ...(st.diplomacy.distancesCible ?? {}) };
  delete distances[cleDepuis(a, b)];
  st.diplomacy.distancesCible = distances;
  st.diplomacy.dernieresGuerres = {
    ...st.diplomacy.dernieresGuerres,
    [a]: st.turn,
    [b]: st.turn,
  };
  // DIPLOMATIE-T2 · D1/D2 : le FAIT de la paix reste public (PeaceAccepted
  // sans montant — canon CivRev) ; la compensation, elle, est PRIVÉE.
  const events: GameEvent[] = [{ seq: 0, type: 'PeaceAccepted', from: proposerId, on: target }];
  if (or > 0) events.push({ seq: 0, type: 'PeaceCompensated', from: proposerId, on: target, gold: or });
  return { ok: true, state: st, events };
}

// ---------------------------------------------------------------------------
// DIPLOMATIE-T2 (décisions Erik 28/10) · D3 — ÉCHANGE de technologies :
// TradeTechs { target, techOfferte, techDemandee?, goldDemande? } — action
// IMMÉDIATE (résolue À LA RÉCEPTION, D6 : zéro état persisté, schemaVersion
// 28 inchangée). Canon : JAMAIS d'échange avec une nation en GUERRE.
// ---------------------------------------------------------------------------

/** Forme canon d'une offre d'échange : 1:1 (techDemandee) OU tech contre or
 *  (goldDemande) — exactement UNE des deux contreparties. */
export interface OffreEchangeTechs {
  techOfferte: string;
  techDemandee?: string;
  goldDemande?: number;
}

export interface EchangeOk {
  ok: true;
  state: GameState;
  events: GameEvent[];
}

/** En anarchie ? (miroir R-122 — le canal est gelé.) */
function enAnarchie(state: GameState, id: PlayerId): boolean {
  const p = state.players[id];
  return typeof p?.anarchyUntil === 'number' && state.turn < p.anarchyUntil;
}

/** Accorde une tech à un joueur (miroir complétion R-87 : tri + ère
 *  recomptée ; le tirage Premier découvrir ne s'applique PAS — la tech est
 *  déjà connue de quelqu'un). Vol Spatial 🔶 : la révélation de carte n'est
 *  pas rejouée ici (le receveur la verra à sa prochaine résolution si elle
 *  vient d'une récompense — cas marginal consigné au rapport). */
function accorderTech(state: GameState, id: PlayerId, techId: string): void {
  const p = state.players[id]!;
  if (!p.techsUnlocked.includes(techId)) p.techsUnlocked.push(techId);
  p.techsUnlocked.sort();
  p.era = eraOfTechCount(p.techsUnlocked.length);
}

/**
 * D3 · applyTradeTechs — applique la DÉCISION (le bot la calcule : botPolicy.
 * deciderEchangeTechs) sur une offre validée. Validations métier (refus nommé,
 * miroir applyProposePeace) : nations actives, PAS EN GUERRE (canon), pas en
 * anarchie, techs existantes et connues de leurs donneurs, tech reçue
 * INCONNUE du receveur, contrepartie exactement une (1:1 ou or), or
 * disponible. À l'acceptation : échange ATOMIQUE (techs + or), événement
 * PRIVÉ TechTraded ; au refus : rien ne bouge, événement PRIVÉ
 * TechTradeRefused. La contre-proposition du bot ({ contreOr }) ne passe PAS
 * ici — c'est une réponse textuelle (OrderAck), aucune application.
 */
export function applyTradeTechs(
  input: GameState,
  proposerId: PlayerId,
  target: PlayerId,
  offre: OffreEchangeTechs,
  accepte: boolean,
): EchangeOk | DeclareWarKo {
  if (proposerId === target) return { ok: false, reason: 'on ne troque pas avec soi-même' };
  const actifs = activePlayerIds(input);
  if (!actifs.includes(proposerId)) return { ok: false, reason: `joueur inconnu ou éliminé : ${proposerId}` };
  if (!actifs.includes(target)) return { ok: false, reason: `nation inconnue ou éliminée : ${target}` };
  if (areAtWar(input, proposerId, target)) return { ok: false, reason: 'aucun échange avec une nation en guerre' };
  if (enAnarchie(input, proposerId)) return { ok: false, reason: 'en anarchie : aucun échange' };
  if (enAnarchie(input, target)) return { ok: false, reason: `${target} est en anarchie : aucun échange` };
  const { techOfferte, techDemandee, goldDemande } = offre;
  if (!TECHS[techOfferte]) return { ok: false, reason: `technologie inconnue : ${techOfferte}` };
  const deuxContreparties = techDemandee !== undefined && goldDemande !== undefined;
  if (deuxContreparties) return { ok: false, reason: 'une seule contrepartie (tech OU or)' };
  if (techDemandee !== undefined && !TECHS[techDemandee]) return { ok: false, reason: `technologie inconnue : ${techDemandee}` };
  const or = goldDemande ?? 0;
  if (!Number.isInteger(or) || or < 0) return { ok: false, reason: 'or demandé invalide' };
  const moi = input.players[proposerId]!;
  const lui = input.players[target]!;
  if (!moi.techsUnlocked.includes(techOfferte)) return { ok: false, reason: 'technologie offerte inconnue de vous' };
  if (lui.techsUnlocked.includes(techOfferte)) return { ok: false, reason: `${target} connaît déjà ${techOfferte}` };
  if (techDemandee !== undefined) {
    if (!lui.techsUnlocked.includes(techDemandee)) return { ok: false, reason: `${target} ne connaît pas ${techDemandee}` };
    if (moi.techsUnlocked.includes(techDemandee)) return { ok: false, reason: `vous connaissez déjà ${techDemandee}` };
  }
  if (techDemandee === undefined && or === 0) return { ok: false, reason: 'contrepartie absente' };
  if (lui.treasury < or) return { ok: false, reason: `${target} n'a pas ${or} or` };
  if (!accepte) {
    return {
      ok: true,
      state: structuredClone(input),
      events: [{ seq: 0, type: 'TechTradeRefused', from: proposerId, on: target, techOfferte, ...(techDemandee !== undefined ? { techDemandee } : {}), goldDemande: or }],
    };
  }
  const st = structuredClone(input);
  // Échange ATOMIQUE : techs + or basculent ensemble.
  accorderTech(st, target, techOfferte);
  if (techDemandee !== undefined) accorderTech(st, proposerId, techDemandee);
  if (or > 0) {
    st.players[target]!.treasury -= or;
    st.players[proposerId]!.treasury += or;
  }
  const events: GameEvent[] = [
    {
      seq: 0,
      type: 'TechTraded',
      from: proposerId,
      on: target,
      techRecue: techOfferte,
      ...(techDemandee !== undefined ? { techDonnee: techDemandee } : {}),
      gold: or,
    },
  ];
  return { ok: true, state: st, events };
}
