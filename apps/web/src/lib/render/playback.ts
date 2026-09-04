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
import type { TechEra } from '@game/rules';

/** 7n · R-147 : bandeau de transition d'ère (libellés canon « Ère Médiévale ! »). */
const ERA_BANNER: Record<TechEra, string> = {
  ancienne: 'Ère Ancienne',
  medievale: 'Ère Médiévale',
  industrielle: 'Ère Industrielle',
  moderne: 'Ère Moderne',
};
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
  kind: 'combat' | 'good' | 'bad' | 'destroy' | 'nuke';
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
  RushBuy: 1200,
  EconomyMilestone: 1600,
  EraChanged: 2000, // 7n · R-147 : bandeau « Ère Médiévale ! »
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
  PopulationGrew: 320,
  PopulationConsumed: 320,
  TechResearched: 400,
  FirstDiscovered: 460,
  BuildingCompleted: 320,
  // 7i (D5) : ressource détruite par une fondation.
  ResourceDestroyed: 320,
  DiplomaticIncident: 300,
  Victory: 400,
  // Phase 7h (R-122/R-124) : gouvernements & vaisseau spatial.
  GovernmentChanged: 320,
  Launch: 520,
  // Phase 7d (R-95..R-98) : barbares & huttes.
  BarbarianSpawned: 320,
  VillageDestroyed: 420,
  CityRazed: 420,
  HutOpened: 360,
  // Phase 7f (R-113..R-116) : culture.
  GreatPersonSpawned: 380,
  InstallPerson: 360,
  GreatPersonConsumed: 380,
  CultureMilestone: 320,
  WonderCompleted: 400,
  // Phase 7k (R-130/R-132) : récupération de marteaux, surclassement Léonard.
  HammerSalvage: 400,
  UnitsUpgraded: 360,
  // Phase 7g (R-117..R-119) : naval & espionnage.
  Embark: 280,
  Disembark: 280,
  SpyMission: 420,
  GreatPersonStolen: 480,
  // Phase 7m (R-138..R-144) : nucléaire & espionnage jeu de base.
  NukeLaunched: 900,
  CityNuked: 700,
  SpyAction: 420,
  SpyDuel: 520,
  GoldStolen: 480,
  GreatPersonKidnapped: 480,
  SpyBuildingDestroyed: 480,
  TurnResolved: 140,
};

const TOAST_KINDS: Partial<Record<GameEvent['type'], Toast['kind']>> = {
  BootyGold: 'good',
  CityFounded: 'good',
  CityCaptured: 'bad',
  UnitProduced: 'info',
  PopulationGrew: 'good',
  PopulationConsumed: 'info',
  FirstDiscovered: 'good',
  TechResearched: 'good',
  BuildingCompleted: 'good',
  Captured: 'bad',
  DiplomaticIncident: 'info',
  Victory: 'good',
  // Phase 7d : village détruit +or (good), hutte ouverte +récompense (good),
  // ville rasée / barbares engendrés (bad).
  VillageDestroyed: 'good',
  HutOpened: 'good',
  CityRazed: 'bad',
  BarbarianSpawned: 'bad',
  // Phase 7f (R-113..R-116) : GP, installation, jalons, merveilles, ONU.
  GreatPersonSpawned: 'good',
  InstallPerson: 'good',
  GreatPersonConsumed: 'good',
  WonderCompleted: 'good',
  CultureMilestone: 'info',
  // Phase 7k (R-130/R-132) : marteaux récupérés (good), dissipés (bad),
  // unités surclassées par Léonard (good).
  HammerSalvage: 'good',
  UnitsUpgraded: 'good',
  // Phase 7g (R-117..R-119) : naval & espionnage — un vol est bon pour le
  // voleur… mais le toast est neutre (la victime le voit aussi).
  Embark: 'info',
  Disembark: 'info',
  SpyMission: 'info',
  GreatPersonStolen: 'bad',
  // Phase 7m : une frappe nucléaire est vue des deux camps (événements
  // touchant leurs joueurs) ; le vol/sabotage est une mauvaise nouvelle
  // partagée (miroir GreatPersonStolen).
  NukeLaunched: 'bad',
  CityNuked: 'bad',
  SpyAction: 'info',
  SpyDuel: 'info',
  GoldStolen: 'bad',
  GreatPersonKidnapped: 'bad',
  SpyBuildingDestroyed: 'bad',
};

const TOAST_LIFETIME = 4000;

/** Durée (ms, vitesse 1) de la phase « annonce » en tête de relecture. */
export const ANNOUNCE_MS = 1000;

/** Ligne de déplacement prévue (phase annonce) : d'une case vers une autre. */
export interface AnnounceLine {
  from: Hex;
  to: Hex;
  /** Propriétaire de l'unité (couleur d'accent du rendu). */
  owner: string;
}

/**
 * Plan d'annonce (Phase 5.5 L2) — PURE : déduit des événements `Move`/`Retreat`
 * du tour les lignes de déplacement de TOUS les movers (y compris ennemis
 * présents dans le journal — donc visibles, le fog ayant déjà filtré).
 * Les pas consécutifs d'une même unité sont fusionnés en une ligne
 * from → to ; l'ordre de première apparition est conservé.
 */
export function buildAnnounceLines(events: GameEvent[]): AnnounceLine[] {
  const byUnit = new Map<string, AnnounceLine>();
  const order: string[] = [];
  for (const ev of events) {
    if (ev.type !== 'Move' && ev.type !== 'Retreat') continue;
    const existing = byUnit.get(ev.unitId);
    if (existing) {
      existing.to = ev.to;
    } else {
      byUnit.set(ev.unitId, { from: ev.from, to: ev.to, owner: ev.owner });
      order.push(ev.unitId);
    }
  }
  return order.map((id) => byUnit.get(id)!);
}

export class Playback {
  active = false;
  /** Multiplicateur de vitesse (clic = accélérer). */
  speed = 1;

  /**
   * Phase 1 « annonce » (Phase 5.5 L2) : lignes de déplacement prévues de
   * tous les movers du tour, affichées ~1 s avant les mouvements. Vide dès
   * que la phase est consommée (ou si aucun Move dans le tour rejoué).
   */
  announce: AnnounceLine[] = [];

  readonly moves = new Map<string, MoveAnim>();
  readonly hpOverride = new Map<string, number>();
  fxList: Fx[] = [];
  readonly toasts: Writable<Toast[]> = writable([]);

  private queue: GameEvent[] = [];
  private current: CurrentItem | null = null;
  /** Progression de la phase annonce (ms consommées à vitesse courante). */
  private announceT = 0;
  /** Horloge interne (ms) — horodate les effets ; lisible par le renderer. */
  clock = 0;
  private nextToastId = 1;

  /** Enfile des événements à rejouer (TurnResult ou missedEvents). */
  enqueue(events: GameEvent[]): void {
    if (events.length === 0) return;
    const start = !this.active;
    this.queue.push(...events);
    if (start) {
      this.active = true;
      this.speed = 1;
      // Phase annonce : lignes de tous les movers AVANT tout mouvement.
      this.announce = buildAnnounceLines(events);
      this.announceT = 0;
      if (!this.announce.length) this.next();
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
    this.announce = [];
    this.announceT = 0;
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
      // Phase annonce en cours (aucun événement démarré) : consommer avant
      // de lancer la file des mouvements/effets.
      if (this.announce.length > 0) {
        this.announceT += dtMs * this.speed;
        if (this.announceT >= ANNOUNCE_MS) {
          this.announce = [];
          this.announceT = 0;
          this.next();
        }
        return;
      }
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
      case 'PopulationGrew':
      case 'BuildingCompleted':
        this.pushFx(ev.at, 'good', dur);
        break;
          // Phase 7h (R-122/R-124) : gouvernements & vaisseau spatial.
      case 'GovernmentChanged':
        this.pushToast('Changement de gouvernement', 'info');
        break;
      // 7n · R-147 : le joueur entre dans une nouvelle ÈRE (compage de techs,
      // transition au tour suivant) — bandeau plein écran en toast.
      case 'EraChanged': {
        const eraName = ERA_BANNER[ev.era] ?? ev.era;
        this.pushToast(`Ère ${eraName} !`, 'good');
        break;
      }
      case 'Launch':
        this.pushToast('Vaisseau spatial lancé !', 'good');
        break;
      // Phase 7d (R-95..R-98) : barbares & huttes.
      case 'BarbarianSpawned':
        this.pushFx(ev.at, 'bad', dur);
        break;
      case 'VillageDestroyed':
      case 'CityRazed':
        this.pushFx(ev.at, 'destroy', dur);
        break;
      case 'HutOpened':
        this.pushFx(ev.at, 'good', dur);
        break;
      // Phase 7f (R-113..R-116) : culture — GP posé, installation, merveille.
      case 'GreatPersonSpawned':
      case 'InstallPerson':
      case 'WonderCompleted':
        this.pushFx(ev.at, 'good', dur);
        break;
      case 'GreatPersonConsumed':
        // L'effet consume est empire/ville : sans hex dédiée fiable, toast seul.
        break;
      // Phase 7m (R-139..R-143) : détonation nucléaire (explosion sur la
      // cible), interception, sabotage.
      case 'NukeLaunched':
        this.pushFx(ev.outcome === 'detonated' ? ev.target : ev.at, ev.outcome === 'refused' ? 'bad' : 'nuke', dur);
        break;
      case 'CityNuked':
        this.pushFx(ev.at, 'nuke', dur);
        break;
      case 'SpyBuildingDestroyed':
        this.pushFx(ev.at, 'destroy', dur);
        break;
      default:
        break;
    }
    const kind = TOAST_KINDS[ev.type];
    if (kind) {
      // 7k · R-130 : des marteaux récupérés DISSIPÉS sont une perte, pas un gain.
      this.pushToast(eventLabel(ev), kind); // 7l · C7 : plus de dissipation
    }
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
