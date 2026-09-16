/**
 * LABO-COMBAT (#/labo-combat) — module PUR du laboratoire de programmation
 * et de résolution. Outil de développement du chapitre 2D (handoff
 * HANDOFF-LABO-COMBAT) : construire des états à poses libres, formater le
 * journal de résolution. Zéro IO, zéro serveur : le moteur (@game/rules)
 * tourne dans le navigateur et ce module ne fait qu'habiller ses entrées/sorties.
 */
import type { TerrainId } from '@game/rules';
import {
  BARBARIAN_ID,
  BARBARIANS,
  TERRAINS,
  makeState,
  tileKey,
  unitType,
} from '@game/rules';
import type { GameState, MakeStateOptions, Order, PlayerId, TileKey, Unit, UnitId } from '@game/rules';

/** Camps programmables du labo : deux joueurs + le camp barbare (pose libre). */
export type CampLabo = 'p1' | 'p2' | 'barbare';

export const CAMPS_LABO: CampLabo[] = ['p1', 'barbare', 'p2'];

export function campVersJoueur(camp: CampLabo): PlayerId {
  return camp === 'barbare' ? BARBARIAN_ID : camp;
}

/** Types d'unité posables (sélecteur du labo — terrestres utiles au combat). */
export const TYPES_POSABLES = [
  'guerrier',
  'archer',
  'piquier',
  'cavalier',
  'legion',
  'catapulte',
  'colon',
  'explorateur',
  'milice',
] as const;

export interface UnitLabo {
  type: string;
  camp: CampLabo;
  q: number;
  r: number;
  /** PV courants (défaut plein — borné à hpMax du type). */
  hp?: number;
}

export interface CityLabo {
  camp: Exclude<CampLabo, 'barbare'>;
  q: number;
  r: number;
  pop?: number;
  capital?: boolean;
}

/** Camp barbare : pile sur la case — `gardes` premières unités de la pile
 *  (ne sortent jamais, T-49) + au plus un explorateur (agit, R-97). */
export interface CampBarbare {
  q: number;
  r: number;
  gardes: number;
  explorateur: boolean;
}

export interface EtatLaboOptions {
  width: number;
  height: number;
  fill: TerrainId;
  terrainOverrides?: Record<TileKey, TerrainId>;
  units?: UnitLabo[];
  cities?: CityLabo[];
  camps?: CampBarbare[];
  /** Compteur T-18 initial des camps posés (résolutions avant prochain spawn). */
  spawnCountdown?: number;
  turn?: number;
  seed?: number;
}

/** Camp posé avec son réglage de pile (unités engendrées à la pose). */
export type CampLaboSpec = CampBarbare;

/**
 * Construit l'état du labo : carte rectangulaire + poses libres, le tout via
 * la fixture canonique du moteur (makeState — même constructeur que les
 * tests, donc un état VALIDÉ v24). La vision est TOTALE (fog désactivé :
 * carte entièrement visible, préalable M2.1). Les barbares posés sont des
 * unités normales du pseudo-joueur barbare ; celles d'un camp posé sont
 * enregistrées dans `spawnedUnits` (le régime BARBARES-PILES s'applique tel
 * quel : les `gardes` premières restent au camp, l'explorateur sort).
 */
export function creerEtatLabo(opts: EtatLaboOptions): GameState {
  const unitSpecs: NonNullable<MakeStateOptions['units']> = [];
  // Ids déterministes « u1..uN » dans l'ordre de pose (unités puis camps) —
  // les villages référencent ces ids dans spawnedUnits (ordre d'engendrement
  // = ordre des ids, comme en jeu).
  const ids: UnitId[] = [];
  const pose = (u: UnitLabo): UnitId => {
    const id = `u${unitSpecs.length + 1}`;
    ids.push(id);
    const stats = unitType(u.type);
    unitSpecs.push({
      id,
      type: u.type,
      owner: campVersJoueur(u.camp),
      q: u.q,
      r: u.r,
      hp: Math.max(1, Math.min(stats.hpMax, u.hp ?? stats.hpMax)),
    });
    return id;
  };
  for (const u of opts.units ?? []) pose(u);
  const villages: Array<{ q: number; r: number; spawnCountdown?: number }> = [];
  const spawnedParCamp: UnitId[][] = [];
  for (const camp of opts.camps ?? []) {
    const idsCamp: UnitId[] = [];
    for (let i = 0; i < camp.gardes; i++) {
      idsCamp.push(pose({ type: barbarianUnitType(opts.turn ?? 0), camp: 'barbare', q: camp.q, r: camp.r }));
    }
    if (camp.explorateur) {
      idsCamp.push(pose({ type: 'explorateur', camp: 'barbare', q: camp.q, r: camp.r }));
    }
    villages.push({ q: camp.q, r: camp.r, spawnCountdown: opts.spawnCountdown ?? BARBARIANS.spawnInterval });
    // Liaison village → unités engendrées : injectée après makeState (la
    // fixture crée les villages vides, ids par (q, r) croissant).
    spawnedParCamp.push(idsCamp);
  }
  const state = makeState({
    width: opts.width,
    height: opts.height,
    fill: opts.fill,
    terrainOverrides: opts.terrainOverrides,
    players: ['p1', 'p2'],
    units: unitSpecs,
    cities: (opts.cities ?? []).map((c, i) => ({
      id: `c${i + 1}`,
      owner: campVersJoueur(c.camp),
      q: c.q,
      r: c.r,
      pop: c.pop ?? 1,
      capital: c.capital ?? false,
    })),
    villages,
    turn: opts.turn ?? 0,
    rngSeed: opts.seed ?? 42,
  });
  // BARBARES-PILES : rattacher les piles posées (spawnedUnits = ids de pose).
  const campsTries = [...(opts.camps ?? [])].sort((a, b) => a.q - b.q || a.r - b.r);
  for (let i = 0; i < campsTries.length; i++) {
    const village = state.villages[i];
    if (village) village.spawnedUnits = spawnedParCamp[i] ?? [];
  }
  // La fixture dote chaque village d'une garnison automatique (T-50, miroir
  // du jeu) : le labo pose SES propres barbares — la dotation automatique
  // (unités barbares hors ids de pose) est retirée.
  const poses = new Set(unitSpecs.map((u) => u.id!));
  for (const id of Object.keys(state.units)) {
    const u = state.units[id]!;
    if (u.owner === BARBARIAN_ID && !poses.has(id)) delete state.units[id];
  }
  // Fog désactivé : les deux joueurs voient TOUTE la carte (préalable M2).
  const allKeys = Object.keys(state.map).sort();
  for (const player of Object.values(state.players)) {
    player.vision = { explored: [...allKeys], visible: [...allKeys] };
  }
  return state;
}

/** Type de barbare engendré au tour donné (escalade R-95 — même données). */
function barbarianUnitType(turn: number): string {
  return turn > BARBARIANS.escalationTurn ? BARBARIANS.units.escalated : BARBARIANS.units.initial;
}

// ---------------------------------------------------------------------------
// Journal de résolution — le LUI l'outil d'ajustement d'Erik (M2.4).
// ---------------------------------------------------------------------------

/** Libellés FR des camps pour le journal. */
export function nomCamp(owner: PlayerId): string {
  if (owner === BARBARIAN_ID) return 'Barbare';
  return owner === 'p1' ? 'J1' : owner === 'p2' ? 'J2' : owner;
}

function unitLabel(state: GameState, id: UnitId | null | undefined): string {
  if (!id) return '?';
  const u = state.units[id];
  if (!u) return `${id} (morte)`;
  return `${id} ${u.type} (${nomCamp(u.owner)})`;
}

function hexLabel(h: { q: number; r: number }): string {
  return `(${h.q},${h.r})`;
}

/**
 * Journal UNIQUE en quatre sections (outil d'ajustement — demande d'Erik) :
 *  1. DISPOSITION DE DÉPART : chaque unité (id, type, camp, position, PV),
 *     chaque ville, chaque camp barbare ;
 *  2. ORDRES DONNÉS : pour chaque unité ordonnée, toutes les cases traversées
 *     (chemin multi-étapes R-158), la destination programmée, l'action finale
 *     éventuelle, la cible d'attaque — ou « aucun ordre » ;
 *  3. RÉSOLUTION DÉTAILLÉE : les événements du moteur avec contexte courant
 *     (PV avant→après, terrain du défenseur, repli qualifié R-54-1/R-54-2) ;
 *  4. fin de tour.
 * `pre` = état PRÉ-résolution ; `ordres` = les ordres réellement passés au
 * moteur (tels qu'affichés dans le résumé avant résolution).
 */
export function construireJournal(
  pre: GameState,
  events: Array<{ type: string } & Record<string, unknown>>,
  ordres?: Record<PlayerId, Order[]>,
): string[] {
  const lignes: string[] = [`Tour ${pre.turn + 1} — seed ${pre.rngSeed}`];

  // --- 1. Disposition de départ ----------------------------------------------
  lignes.push('— DISPOSITION DE DÉPART —');
  for (const id of Object.keys(pre.units).sort()) {
    const u = pre.units[id]!;
    lignes.push(`  ${id} ${u.type} (${nomCamp(u.owner)}) en (${u.q},${u.r}) — PV ${u.hp}/${unitType(u.type).hpMax}${u.veteran ? ', vétéran' : ''}${u.fortified ? ', fortifiée' : ''}`);
  }
  for (const id of Object.keys(pre.cities).sort()) {
    const c = pre.cities[id]!;
    lignes.push(`  ville ${c.name ?? id} (${nomCamp(c.owner)}) en (${c.q},${c.r}) — pop ${c.pop}${c.capital ? ', capitale' : ''}`);
  }
  for (const v of [...pre.villages].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const pile = v.spawnedUnits.filter((uid) => pre.units[uid]).length;
    lignes.push(`  camp barbare en (${v.q},${v.r}) — pile ${pile}, spawn dans ${v.spawnCountdown} résolution(s)`);
  }

  // --- 2. Ordres donnés --------------------------------------------------------
  lignes.push('— ORDRES DONNÉS —');
  if (ordres) {
    let aucun = true;
    for (const side of ['p1', 'p2'] as const) {
      const liste = ordres[side] ?? [];
      for (const o of liste) {
        if (!('unitId' in o)) continue;
        const id = o.unitId;
        const u = pre.units[id];
        if (!u) continue;
        aucun = false;
        lignes.push(`  ${ordreEnLigne(o, u)}`);
      }
    }
    if ((ordres[BARBARIAN_ID] ?? []).length > 0) {
      aucun = false;
      lignes.push('  Barbares : ordres automatiques (R-97 — garde/explorateur/aggro)');
    }
    if (aucun) lignes.push('  (aucun ordre pour J1/J2)');
  } else {
    lignes.push('  (ordres non consignés)');
  }

  // --- 3. Résolution détaillée -------------------------------------------------
  lignes.push('— RÉSOLUTION —');
  lignes.push(...journalEvenements(pre, events));

  return lignes;
}

/** Ligne lisible d'un ordre unitaire (toutes les cases traversées incluses). */
function ordreEnLigne(o: Order & { unitId: UnitId }, u: { q: number; r: number; type: string; owner: PlayerId }): string {
  const qui = `${nomCamp(u.owner)} ${o.unitId} ${u.type} en (${u.q},${u.r})`;
  switch (o.type) {
    case 'MultiStep':
    case 'Move': {
      const chemin = o.path.map((h) => `(${h.q},${h.r})`).join(' → ');
      const destination = o.path.length > 0 ? o.path[o.path.length - 1]! : { q: u.q, r: u.r };
      return `${qui} : CHEMIN ${u.q},${u.r} → ${chemin} — destination programmée (${destination.q},${destination.r})${o.type === 'MultiStep' && o.final === 'foundCity' ? ' + FONDATION à l’arrivée' : ''}`;
    }
    case 'Attack':
      return `${qui} : ATTAQUE de la case (${o.target.q},${o.target.r})`;
    case 'FoundCity':
      return `${qui} : FONDATION de ville sur place`;
    case 'Hold':
      return `${qui} : TIENT (aucun déplacement)`;
    case 'Fortify':
      return `${qui} : FORTIFIE (+25 % défense, T-17)`;
    default:
      return `${qui} : ordre ${o.type}`;
  }
}

/** Section 3 : événements avec contexte courant (PV, positions mis à jour). */
function journalEvenements(pre: GameState, events: Array<{ type: string } & Record<string, unknown>>): string[] {
  const hp = new Map<UnitId, number>();
  const pos = new Map<UnitId, { q: number; r: number }>();
  const origine = new Map<UnitId, { q: number; r: number }>();
  for (const [id, u] of Object.entries(pre.units)) {
    hp.set(id, u.hp);
    pos.set(id, { q: u.q, r: u.r });
    origine.set(id, { q: u.q, r: u.r });
  }
  const nom = (id: unknown): string => {
    const uid = id as UnitId;
    const u = pre.units[uid];
    const p = pos.get(uid);
    const ou = u ? ` (${nomCamp(u.owner)})` : ' (morte)';
    return p ? `${uid} ${u?.type ?? '?'}${ou} en (${p.q},${p.r})` : `${uid}${ou}`;
  };
  const hex = (h: { q: number; r: number }): string => `(${h.q},${h.r})`;
  const lignes: string[] = [];
  for (const ev of events) {
    switch (ev.type) {
      case 'Move': {
        lignes.push(`${nom(ev.unitId)} : ${hex(ev.from as { q: number; r: number })} → ${hex(ev.to as { q: number; r: number })}`);
        pos.set(ev.unitId as UnitId, ev.to as { q: number; r: number });
        break;
      }
      case 'Attack': {
        lignes.push(`ATTAQUE ${nom(ev.attackerId)} → ${nom(ev.defenderId)} en ${hex(ev.at as { q: number; r: number })}`);
        break;
      }
      case 'CombatExchange': {
        const a = ev.attackerId as UnitId;
        const d = ev.defenderId as UnitId;
        const pa = hp.get(a);
        const pd = hp.get(d);
        const tuile = pre.map[tileKey((ev.at as { q: number; r: number }).q, (ev.at as { q: number; r: number }).r)];
        const bonus = tuile ? TERRAINS[tuile.terrain]?.defenseBonus ?? 0 : 0;
        const noteDefense = bonus > 0 ? ` — défenseur : terrain ${tuile!.terrain} (+${Math.round(bonus * 100)} %)` : '';
        lignes.push(
          `échange en ${hex(ev.at as { q: number; r: number })} — ${nom(a)} PV ${pa}→${ev.attackerHpAfter} / ${nom(d)} PV ${pd}→${ev.defenderHpAfter}${noteDefense}`,
        );
        hp.set(a, ev.attackerHpAfter as number);
        hp.set(d, ev.defenderHpAfter as number);
        break;
      }
      case 'UnitDestroyed': {
        lignes.push(`MORT ${nom(ev.unitId)}${ev.byUnitId ? ` (par ${nom(ev.byUnitId)})` : ''}`);
        hp.delete(ev.unitId as UnitId);
        pos.delete(ev.unitId as UnitId);
        break;
      }
      case 'Retreat': {
        const uid = ev.unitId as UnitId;
        const to = ev.to as { q: number; r: number };
        const orig = origine.get(uid);
        const surOrigine = orig && orig.q === to.q && orig.r === to.r;
        lignes.push(
          `REPLI ${nom(uid)} : ${hex(ev.from as { q: number; r: number })} → ${hex(to)} — ${surOrigine ? 'case d’origine (libre, R-54-1)' : `case adjacente la plus proche de l’origine (${orig ? hex(orig) : '?'}), R-54-2`}`,
        );
        pos.set(uid, to);
        break;
      }
      default:
        lignes.push(formatEvent(pre, ev));
    }
  }
  return lignes;
}

/**
 * Formate UN événement de résolution en ligne de journal lisible (FR).
 * Retour du journal = l'outil d'ajustement : chaque combat, repli, défenseur
 * de pile, ordre tronqué doit se lire événement par événement.
 */
export function formatEvent(state: GameState, ev: { type: string } & Record<string, unknown>): string {
  switch (ev.type) {
    case 'Move':
      return `${unitLabel(state, ev.unitId as UnitId)} : ${hexLabel(ev.from as { q: number; r: number })} → ${hexLabel(ev.to as { q: number; r: number })}`;
    case 'Attack':
      return `ATTAQUE ${unitLabel(state, ev.attackerId as UnitId)} → ${unitLabel(state, ev.defenderId as UnitId)} en ${hexLabel(ev.at as { q: number; r: number })}`;
    case 'CombatExchange':
      return `échange en ${hexLabel(ev.at as { q: number; r: number })} — ${unitLabel(state, ev.attackerId as UnitId)} PV ${ev.attackerHpAfter} / ${unitLabel(state, ev.defenderId as UnitId)} PV ${ev.defenderHpAfter}`;
    case 'UnitDestroyed':
      return `MORT ${unitLabel(state, ev.unitId as UnitId)} en ${hexLabel(ev.at as { q: number; r: number })}${ev.byUnitId ? ` (par ${unitLabel(state, ev.byUnitId as UnitId)})` : ''}`;
    case 'Retreat':
      return `REPLI ${unitLabel(state, ev.unitId as UnitId)} : ${hexLabel(ev.from as { q: number; r: number })} → ${hexLabel(ev.to as { q: number; r: number })}`;
    case 'Captured':
      return `CAPTURE ${unitLabel(state, ev.unitId as UnitId)} par ${nomCamp(ev.byPlayer as PlayerId)} (${ev.outcome})`;
    case 'CityFounded':
      return `VILLE FONDÉE en ${hexLabel(ev.at as { q: number; r: number })} par ${nomCamp(ev.owner as PlayerId)}`;
    case 'CityCaptured':
      return `VILLE CAPTURÉE en ${hexLabel(ev.at as { q: number; r: number })} par ${nomCamp(ev.byPlayer as PlayerId)}`;
    case 'CityRazed':
      return `VILLE RASÉE en ${hexLabel(ev.at as { q: number; r: number })}`;
    case 'VillageDestroyed':
      return `CAMP BARBARE DÉTRUIT en ${hexLabel(ev.at as { q: number; r: number })}`;
    case 'VillageLooted':
      return `CAMP PILLÉ en ${hexLabel(ev.at as { q: number; r: number })} — récompense : ${String(ev.reward ?? '?')}`;
    case 'BarbarianSpawned':
      return `SPAWN BARBARE en ${hexLabel(ev.at as { q: number; r: number })} — ${String(ev.unitType ?? 'barbare')}`;
    case 'HutOpened':
      return `HUTTE ouverte en ${hexLabel(ev.at as { q: number; r: number })}`;
    case 'BootyGold':
      return `BUTIN ${ev.amount} or pour ${nomCamp((ev.player ?? ev.owner) as PlayerId)}`;
    case 'PopulationGrew':
      return `VILLE ${String(ev.cityId ?? '?')} : pop → ${ev.pop}`;
    case 'UnitProduced':
      return `PRODUCTION ${unitLabel(state, ev.unitId as UnitId)} en ${hexLabel(ev.at as { q: number; r: number })}`;
    case 'TechResearched':
      return `TECH ${String(ev.techId ?? '?')} (${nomCamp(ev.owner as PlayerId)})`;
    case 'TurnResolved':
      return `— TOUR ${ev.turn} RÉSOLU —`;
    case 'Victory':
      return `VICTOIRE ${nomCamp(ev.winner as PlayerId)} (${String(ev.cause ?? '?')})`;
    default:
      return `${ev.type} ${JSON.stringify(ev, (_k, v) => (typeof v === 'object' && v !== null && 'q' in (v as object) ? hexLabel(v as { q: number; r: number }) : v))}`;
  }
}

// ---------------------------------------------------------------------------
// Aides de programmation (M2.1) — R-158/R-159 côté client.
// ---------------------------------------------------------------------------

/**
 * Construit l'ordre d'une unité à partir de la programmation du labo :
 * chemin multi-étapes (chaque pas adjacent au précédent, premier pas
 * adjacent à l'unité) + action finale `foundCity` éventuelle (R-158),
 * attaque explicite, ou tenir. Retourne null si rien à ordonner.
 */
export function ordreDe(
  unit: Pick<Unit, 'id' | 'q' | 'r' | 'type'>,
  path: Array<{ q: number; r: number }>,
  finalFoundCity: boolean,
  attackTarget: { q: number; r: number } | null,
): Order | null {
  if (attackTarget) return { type: 'Attack', unitId: unit.id, target: attackTarget };
  if (finalFoundCity && unitType(unit.type).canFoundCity) {
    return path.length > 0
      ? { type: 'MultiStep', unitId: unit.id, path: [...path], final: 'foundCity' }
      : { type: 'FoundCity', unitId: unit.id };
  }
  if (path.length > 0) return { type: 'MultiStep', unitId: unit.id, path: [...path] };
  return { type: 'Hold', unitId: unit.id };
}

/** Terrain praticable pour le pinceau (les données du moteur font foi). */
export function terrainsPosables(): TerrainId[] {
  return (Object.keys(TERRAINS) as TerrainId[]).filter((t) => t !== 'ville' && t !== 'cratere');
}

export { tileKey };
