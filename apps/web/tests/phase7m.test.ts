/**
 * Phase 7m — libellés UI des nouveaux événements (R-138..R-144) et ciblage
 * d'ICBM (nukeTarget) : le journal, les toasts victime/tireur et la modale de
 * confirmation doivent être lisibles. Libellés purs (lib/labels.ts) et
 * décision de clic pure (interaction.ts) — aucune règle calculée côté client.
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import type { GameState } from '@game/rules';
import type { GameEvent } from '@game/shared';
import { eventLabel } from '../src/lib/labels.js';
import { clickAction } from '../src/lib/render/interaction.js';
import type { GameView } from '../src/lib/gameClient.js';
import type { UiState } from '../src/lib/render/ui.js';

/** Miroir des fakes compacts d'interaction.test.ts (viewOf/uiOf). */
function viewOf(state: GameState, over: Partial<GameView> = {}): GameView {
  return {
    code: 'ABC123',
    playerId: 'dev:alice',
    players: [
      { id: 'dev:alice', name: 'Alice', engineId: 'p1' },
      { id: 'dev:bob', name: 'Bob', engineId: 'p2' },
    ],
    status: 'active',
    turn: 0,
    phase: 'orders',
    state,
    orders: [],
    locked: false,
    events: [],
    lastSeq: 0,
    seenEventSeq: -1,
    ...over,
  };
}

function uiOf(over: Partial<UiState> = {}): UiState {
  return { selectedUnitId: null, selectedCityId: null, draft: null, ...over };
}

describe('7m · libellés nucléaire (R-139/R-140/R-141)', () => {
  it('détonation : annonce la frappe et la cible', () => {
    const ev = {
      seq: 1,
      type: 'NukeLaunched',
      unitId: 'u9',
      owner: 'p1',
      at: { q: 3, r: 0 },
      target: { q: 0, r: 0 },
      outcome: 'detonated',
    } as GameEvent;
    expect(eventLabel(ev)).toContain('ICBM');
    expect(eventLabel(ev)).toContain('(0,0)');
  });

  it('refus sous Démocratie : le libellé est explicite (R-140) et le missile est conservé', () => {
    const ev = {
      seq: 2,
      type: 'NukeLaunched',
      unitId: 'u9',
      owner: 'p1',
      at: { q: 3, r: 0 },
      target: { q: 0, r: 0 },
      outcome: 'refused',
      reason: 'democratie',
    } as GameEvent;
    const label = eventLabel(ev);
    expect(label).toContain('REFUSÉ');
    expect(label).toContain('Démocratie');
  });

  it('interception SDI : nomme la ville protectrice (R-141)', () => {
    const ev = {
      seq: 3,
      type: 'NukeLaunched',
      unitId: 'u9',
      owner: 'p1',
      at: { q: 3, r: 0 },
      target: { q: 0, r: 0 },
      outcome: 'intercepted',
      cityId: 'c2',
    } as GameEvent;
    expect(eventLabel(ev)).toContain('INTERCEPTÉE');
    expect(eventLabel(ev)).toContain('c2');
  });

  it('CityNuked (C13) : population résultante et bâtiments détruits, la ville survit', () => {
    const ev = {
      seq: 4,
      type: 'CityNuked',
      cityId: 'c2',
      owner: 'p2',
      at: { q: 0, r: 0 },
      popAfter: 2,
      buildingsDestroyed: ['temple', 'marche'],
    } as GameEvent;
    const label = eventLabel(ev);
    expect(label).toContain('population 2');
    expect(label).toContain('2 bâtiment(s)');
    expect(label).toContain('survit');
  });

  it('pénalité culturelle (R-140 🔶) : la raison « nuke » est lisibile', () => {
    const ev = {
      seq: 5,
      type: 'CultureMilestone',
      player: 'p1',
      delta: -1,
      total: 4,
      reason: 'nuke',
    } as GameEvent;
    expect(eventLabel(ev)).toContain('frappe nucléaire');
  });
});

describe('7m · libellés espionnage (R-143/R-144)', () => {
  it('GoldStolen : la victime est notifiée avec le montant (R-134 — seulement le montant)', () => {
    const ev = {
      seq: 6,
      type: 'GoldStolen',
      spyId: 'u3',
      thief: 'p1',
      victim: 'p2',
      cityId: 'c2',
      amount: 100,
    } as GameEvent;
    const label = eventLabel(ev);
    expect(label).toContain('100');
    expect(label).toContain('p2');
  });

  it('SpyDuel : nomme le vainqueur et la règle du perdant détruit (R-144)', () => {
    const ev = {
      seq: 7,
      type: 'SpyDuel',
      cityId: 'c2',
      attackerId: 'u3',
      defenderId: 'u4',
      thief: 'p1',
      defender: 'p2',
      winner: 'p2',
    } as GameEvent;
    expect(eventLabel(ev)).toContain('Duel');
    expect(eventLabel(ev)).toContain('p2');
  });

  it('SpyAction échouée et SpyBuildingDestroyed : libellés distincts', () => {
    const failed = {
      seq: 8,
      type: 'SpyAction',
      unitId: 'u3',
      owner: 'p1',
      cityId: 'c2',
      target: 'p2',
      action: 'sabotageProduction',
      outcome: 'failed',
    } as GameEvent;
    expect(eventLabel(failed)).toContain('sans effet');
    const destroyed = {
      seq: 9,
      type: 'SpyBuildingDestroyed',
      spyId: 'u3',
      thief: 'p1',
      victim: 'p2',
      cityId: 'c2',
      building: 'temple',
      at: { q: 0, r: 0 },
    } as GameEvent;
    expect(eventLabel(destroyed)).toContain('temple');
  });
});

describe('7m · ciblage d\'ICBM (interaction pure — R-139)', () => {
  it('UiState.nukeArmed : tout clic carte devient une cible pressentie (modale ensuite)', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const view = viewOf(state);
    const action = clickAction(view, uiOf({ nukeArmed: 'u9' }), { q: 4, r: 2 });
    expect(action).toEqual({ kind: 'nukeTarget', hex: { q: 4, r: 2 } });
  });

  it('sans nukeArmed : le clic normal n\'est pas intercepté', () => {
    const state = makeState({ units: [{ id: 'u1', type: 'guerrier', owner: 'p1', q: 0, r: 0 }] });
    const view = viewOf(state);
    const action = clickAction(view, uiOf(), { q: 0, r: 0 });
    expect(action).toEqual({ kind: 'selectUnit', unitId: 'u1', mine: true });
  });
});
