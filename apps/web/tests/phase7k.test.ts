/**
 * Phase 7k — libellés UI des nouveaux événements (R-130/R-132) : les
 * « marteaux récupérables » et le surclassement Léonard doivent être lisibles
 * dans le journal et les toasts. Libellés purs (lib/labels.ts).
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@game/shared';
import { eventLabel } from '../src/lib/labels.js';

describe('7l · C7 — libellé HammerSalvage (réserve PERMANENTE — plus de dissipation)', () => {
  it('« available » : signale la réserve et invite à choisir un projet', () => {
    const ev = {
      seq: 1,
      type: 'HammerSalvage',
      cityId: 'c2',
      owner: 'p1',
      wonder: 'stonehenge',
      amount: 30,
      outcome: 'available',
    } as GameEvent;
    const label = eventLabel(ev);
    expect(label).toContain('30 marteaux');
    expect(label).toContain('choisissez un projet');
  });

  it("7l · C7 : le littéral « dissipated » est RETIRÉ de l'union (choix documenté) — le libellé ne le mentionne plus", () => {
    // La réserve ne se dissipe plus : le libellé unique invite au choix d'un projet.
    const ev = {
      seq: 2,
      type: 'HammerSalvage',
      cityId: 'c2',
      owner: 'p1',
      wonder: null,
      amount: 30,
      outcome: 'available',
    } as GameEvent;
    expect(eventLabel(ev)).toContain('choisissez un projet');
  });
});

describe('7k · R-132 — libellé UnitsUpgraded (Atelier de Léonard)', () => {
  it('détaille les paires from → to', () => {
    const ev = {
      seq: 3,
      type: 'UnitsUpgraded',
      player: 'p1',
      upgrades: [
        { unitId: 'u1', from: 'guerrier', to: 'legion' },
        { unitId: 'u2', from: 'galere', to: 'galion' },
      ],
    } as GameEvent;
    const label = eventLabel(ev);
    expect(label).toContain('2 unité(s)');
    expect(label).toContain('guerrier → legion');
    expect(label).toContain('galere → galion');
  });
});
