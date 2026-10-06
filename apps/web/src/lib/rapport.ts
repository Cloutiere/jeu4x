/**
 * RAPPORT-ENGAGEMENT (L1) — agrégation PURE des événements de combat du tour
 * par case. Alimente le popover « sommaire de case » d'Erik (30/09) : tout se
 * déduit des GameEvent déjà reçus (filtrés fog côté serveur) — zéro
 * changement moteur/serveur/protocole.
 *
 * PV avant : seedés depuis le pré-état (`replayPair.statePre`) ; une unité
 * absente du pré-état (produite dans le tour, fog résiduel) a pvAvant null —
 * on n'invente jamais de valeur.
 */
import type { GameEvent, GameState, UnitId } from '@game/shared';
import type { Hex } from '@game/rules';
import type { CombatDetail, MeleeDetail } from '@game/rules';

export type RoleMelee = 'winner' | 'loser' | 'middle';

export type SortUnite = 'reste' | 'detruit' | 'expulse' | 'repli' | 'capture';

export interface ParticipantRapport {
  unitId: UnitId;
  owner: string;
  type: string;
  /** PV avant le premier événement de combat du tour (null = inconnu — unité absente du pré-état). */
  pvAvant: number | null;
  /** Dernier PV connu du tour (null = jamais connu). */
  pvApres: number | null;
  /** Rôle R-180 (mêlée seulement). */
  role?: RoleMelee;
  sort: SortUnite;
  /** Destination d'expulsion/repli (case d'arrivée — affichage « → »). */
  deplaceVers?: Hex;
}

export interface ResumeCase {
  hex: Hex;
  /** Mêlée d'instabilité R-180 résolue sur la case. */
  melee: boolean;
  participants: ParticipantRapport[];
  /** COMBAT-EXPLIQUE (D1/D4) : détail du dernier échange de la case (forces,
   *  modificateurs, jets) — absent des combats antérieurs au déploiement (D5). */
  detailCombat?: CombatDetail | null;
  /** COMBAT-EXPLIQUE : détail des poids de mêlée — même contrat D5. */
  detailMelee?: MeleeDetail | null;
}

interface Brouillon {
  unitId: UnitId;
  owner: string | null;
  type: string | null;
  pvAvant: number | null;
  pv: number | null;
  role?: RoleMelee;
  sort: SortUnite;
  deplaceVers?: Hex;
  ordre: number;
}

/** Événements de combat porteurs d'une case pertinente, avec la case et les unités qu'ils impliquent. */
function portees(ev: GameEvent): Array<{ hex: Hex; unites: UnitId[] }> {
  switch (ev.type) {
    case 'Attack':
      return [{ hex: ev.at, unites: [ev.attackerId, ev.defenderId] }];
    case 'CombatExchange':
      return [{ hex: ev.at, unites: [ev.attackerId, ev.defenderId] }];
    case 'UnitDestroyed':
      return [{ hex: ev.at, unites: [ev.unitId] }];
    case 'MeleeResolved':
      return [{ hex: ev.at, unites: [...ev.participants] }];
    case 'Captured':
      return [{ hex: ev.at, unites: [ev.unitId] }];
    case 'UnitExpelled':
    case 'UnitDispersed':
      return [{ hex: ev.from, unites: [ev.unitId] }];
    case 'Retreat':
      return [{ hex: ev.from, unites: [ev.unitId] }];
    default:
      return [];
  }
}

/** Clé "q,r" des cases portant au moins un événement de combat du tour. */
export function casesDeCombat(events: GameEvent[]): Set<string> {
  const out = new Set<string>();
  for (const ev of events) {
    for (const { hex } of portees(ev)) out.add(`${hex.q},${hex.r}`);
  }
  return out;
}

/**
 * UI-JEU-T2 · §1.6 — dernière case de combat du tour (ordre chronologique) :
 * cible de la ligne « ⚔ n combats ce tour » du Journal (ouvre le même
 * popover que le clic case). null = aucun combat ce tour.
 */
export function derniereCaseDeCombat(events: GameEvent[]): Hex | null {
  let hex: Hex | null = null;
  for (const ev of events) {
    for (const portee of portees(ev)) hex = portee.hex;
  }
  return hex;
}

const SORTS: Record<string, SortUnite> = {
  UnitDestroyed: 'detruit',
  UnitExpelled: 'expulse',
  UnitDispersed: 'expulse',
  Retreat: 'repli',
};

/**
 * Sommaire d'une case : participants (triés vainqueur → milieu → perdant en
 * mêlée, ordre de première mention sinon), PV avant→après, rôle et sort.
 * `preEtat` : état pré-résolution (replayPair.statePre) — source des PV avant
 * et des (owner, type). `etatApres` : état post-résolution — repli pour les
 * unités absentes du pré-état. null = case sans combat ce tour.
 */
export function resumesDeCase(
  events: GameEvent[],
  hex: Hex,
  preEtat?: GameState | null,
  etatApres?: GameState | null,
): ResumeCase | null {
  const cle = `${hex.q},${hex.r}`;
  const brouillons = new Map<UnitId, Brouillon>();
  let melee = false;
  let ordre = 0;
  let detailCombat: CombatDetail | null = null;
  let detailMelee: MeleeDetail | null = null;

  const brouillon = (id: UnitId): Brouillon => {
    let b = brouillons.get(id);
    if (!b) {
      const pre = preEtat?.units[id];
      const post = etatApres?.units[id];
      b = {
        unitId: id,
        owner: pre?.owner ?? post?.owner ?? null,
        type: pre?.type ?? post?.type ?? null,
        pvAvant: pre ? pre.hp : null,
        pv: pre ? pre.hp : null,
        sort: 'reste',
        ordre: ordre++,
      };
      brouillons.set(id, b);
    }
    return b;
  };

  for (const ev of events) {
    for (const portee of portees(ev)) {
      if (portee.hex.q !== hex.q || portee.hex.r !== hex.r) continue;
      for (const id of portee.unites) {
        const b = brouillon(id);
        if (ev.type === 'UnitDestroyed') {
          b.owner = ev.owner;
          b.sort = 'detruit';
        }
        if ((ev.type === 'UnitExpelled' || ev.type === 'UnitDispersed' || ev.type === 'Retreat') && b.sort === 'reste') {
          b.sort = SORTS[ev.type]!;
          b.deplaceVers = ev.to;
        }
        if (ev.type === 'Captured') {
          b.owner = ev.owner;
          b.sort = ev.outcome === 'destroyed' ? 'detruit' : 'capture';
        }
      }
      if (ev.type === 'CombatExchange') {
        const a = brouillon(ev.attackerId);
        const d = brouillon(ev.defenderId);
        a.pv = ev.attackerHpAfter;
        d.pv = ev.defenderHpAfter;
        if (ev.detail) detailCombat = ev.detail; // le dernier échange de la case fait foi
      } else if (ev.type === 'MeleeResolved') {
        melee = true;
        if (ev.detail) detailMelee = ev.detail;
        for (const res of ev.results) {
          const b = brouillon(res.unitId);
          b.role = res.role;
          b.pv = res.hpAfter;
        }
      }
    }
  }

  if (brouillons.size === 0) return null;

  const participants: ParticipantRapport[] = [...brouillons.values()].map((b) => ({
    unitId: b.unitId,
    owner: b.owner ?? '?',
    type: b.type ?? '?',
    pvAvant: b.pvAvant,
    pvApres: b.pv,
    role: b.role,
    sort: b.sort,
    deplaceVers: b.deplaceVers,
  }));
  if (melee) {
    const rang: Record<RoleMelee, number> = { winner: 0, middle: 1, loser: 2 };
    participants.sort((x, y) => (rang[x.role ?? 'middle'] - rang[y.role ?? 'middle']) || 0);
  }
  return { hex, melee, participants, detailCombat, detailMelee };
}
