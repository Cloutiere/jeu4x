/**
 * Playback des événements (L4) : file d'animation séquencée alimentée par
 * `TurnResult` (et `Snapshot.missedEvents` après reconnexion — §3.4-4).
 *
 * L'état rendu reste TOUJOURS l'état autoritaire du serveur ; le playback
 * superpose des animations cosmétiques :
 *  - `moves`   : interpolation d'une unité entre deux cases (Move/Retreat) ;
 *  - `hpOverride` : PV affichés pendant un échange de combat ;
 *  - `fx`      : flashs/bursts positionnés ;
 *  - `toasts`  : messages courts (store Svelte, rendu par la page).
 *
 * Clic pendant le playback = accélérer (speed ×4, plafonné). Durées courtes :
 * un tour typique se rejoue en < 3 s à vitesse normale.
 */
import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import type { Hex } from '@game/rules';
import type { GameEvent } from '@game/shared';
import { eventLabel } from '../labels.js';

export interface MoveAnim {
  from: Hex;
  to: Hex;
  /** Progression [0..1]. */
  t: number;
}

export interface Fx {
  at: Hex;
  kind: 'combat' | 'good' | 'bad' | 'destroy';
  t: number;
  dur: number;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

interface CurrentItem {
  ev: GameEvent;
  t: number;
  dur: number;
}

/** Durée (ms, vitesse 1) par type d'événement. */
const DURATIONS: Record<GameEvent['type'], number> = {
  Move: 240,
  Retreat: 240,
  Attack: 200,
  CombatExchange: 420,
  UnitDestroyed: 420,
  Captured: 320,
  BootyGold: 260,
  ArmyFormed: 300,
  CityFounded: 320,
  CityCaptured: 380,
  UnitProduced: 300,
  DiplomaticIncident: 300,
  Victory: 400,
  TurnResolved: 140,
};

const TOAST_KINDS: Partial<Record<GameEvent['type'], Toast['kind']>> = {
  BootyGold: 'good',
  CityFounded: 'good',
  CityCaptured: 'bad',
  UnitProduced: 'info',
  Captured: 'bad',
  DiplomaticIncident: 'info',
  Victory: 'good',
};

const TOAST_LIFETIME = 4000;

export class Playback {
  active = false;
  /** Multiplicateur de vitesse (clic = accélérer). */
  speed = 1;

  readonly moves = new Map<string, MoveAnim>();
  readonly hpOverride = new Map<string, number>();
  fxList: Fx[] = [];
  readonly toasts: Writable<Toast[]> = writable([]);

  private queue: GameEvent[] = [];
  private current: CurrentItem | null = null;
  /** Horloge interne (ms) — horodate les effets ; lisible par le renderer. */
  clock = 0;
  private nextToastId = 1;

  /** Enfile des événements à rejouer (TurnResult ou missedEvents). */
  enqueue(events: GameEvent[]): void {
    if (events.length === 0) return;
    this.queue.push(...events);
    if (!this.active) {
      this.active = true;
      this.speed = 1;
      this.next();
    }
  }

  /** Clic utilisateur : accélérer. */
  skip(): void {
    this.speed = Math.min(this.speed * 4, 64);
  }

  /** Purge totale (snapshot/resync : l'état autoritaire prime). */
  reset(): void {
    this.queue = [];
    this.current = null;
    this.active = false;
    this.speed = 1;
    this.moves.clear();
    this.hpOverride.clear();
    this.fxList = [];
    this.toasts.set([]);
  }

  /** Animation de déplacement courante d'une unité, sinon null. */
  moveOf(unitId: string): MoveAnim | null {
    return this.moves.get(unitId) ?? null;
  }

  /** PV affichés : override de combat, sinon la valeur réelle de l'état. */
  hpOf(unitId: string, realHp: number): number {
    return this.hpOverride.get(unitId) ?? realHp;
  }

  /** Avance le playback de dtMs (déjà multiplié par la vitesse par l'appelant). */
  update(dtMs: number): void {
    this.clock += dtMs;
    this.fxList = this.fxList.filter((f) => f.t + f.dur > this.clock);
    if (!this.active) return;

    const cur = this.current;
    if (!cur) {
      this.next();
      return;
    }
    cur.t += dtMs * this.speed;

    // Progression de l'interpolation visible (Move/Retreat courant).
    if (cur.ev.type === 'Move' || cur.ev.type === 'Retreat') {
      const anim = this.moves.get(cur.ev.unitId);
      if (anim) anim.t = Math.min(1, cur.t / cur.dur);
    }

    if (cur.t >= cur.dur) {
      this.finish(cur);
      this.current = null;
      this.next();
    }
  }

  // ------------------------------------------------------------------

  private next(): void {
    const ev = this.queue.shift();
    if (ev === undefined) {
      this.active = false;
      this.speed = 1;
      return;
    }
    const dur = DURATIONS[ev.type] ?? 200;
    const item: CurrentItem = { ev, t: 0, dur };
    this.current = item;

    // Effets au DÉBUT de l'événement.
    switch (ev.type) {
      case 'Move':
      case 'Retreat':
        this.moves.set(ev.unitId, { from: ev.from, to: ev.to, t: 0 });
        break;
      case 'CombatExchange':
        this.hpOverride.set(ev.attackerId, ev.attackerHpAfter);
        this.hpOverride.set(ev.defenderId, ev.defenderHpAfter);
        this.pushFx(ev.at, 'combat', dur);
        break;
      case 'Attack':
        this.pushFx(ev.at, 'combat', dur);
        break;
      case 'UnitDestroyed':
        this.pushFx(ev.at, 'destroy', dur);
        break;
      case 'Captured':
        this.pushFx(ev.at, 'bad', dur);
        break;
      case 'CityCaptured':
        this.pushFx(ev.at, 'bad', dur);
        break;
      case 'CityFounded':
        this.pushFx(ev.at, 'good', dur);
        break;
      case 'UnitProduced':
        this.pushFx(ev.at, 'good', dur);
        break;
      default:
        break;
    }
    const kind = TOAST_KINDS[ev.type];
    if (kind) this.pushToast(eventLabel(ev), kind);
  }

  private finish(cur: CurrentItem): void {
    switch (cur.ev.type) {
      case 'Move':
      case 'Retreat':
        this.moves.delete(cur.ev.unitId);
        break;
      case 'CombatExchange':
        this.hpOverride.delete(cur.ev.attackerId);
        this.hpOverride.delete(cur.ev.defenderId);
        break;
      default:
        break;
    }
  }

  private pushFx(at: Hex, kind: Fx['kind'], dur: number): void {
    this.fxList.push({ at, kind, t: this.clock, dur });
  }

  private pushToast(text: string, kind: Toast['kind']): void {
    const id = this.nextToastId++;
    this.toasts.update((list) => [...list, { id, text, kind }]);
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, TOAST_LIFETIME);
  }
}
