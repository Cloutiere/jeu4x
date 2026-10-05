/**
 * MERVEILLE-COUT-FILE (Erik 05/10) — le coût d'une MERVEILLE en file de
 * production était lu dans BUILDINGS seulement (`?? Infinity`), d'où le
 * libellé « 36 / Infinity marteaux — à l'arrêt » (Colosse de Rhodes) alors
 * que le moteur connaît le coût (rush-buy juste). Fix client seul : helper
 * pur `coutItem` (lib/fileProduction.ts) qui consulte unité / bâtiment /
 * MERVEILLE, et PanneauVille qui n'affiche JAMAIS « Infinity » en clair
 * (repli honnête pour un item réellement sans coût connu).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WONDERS, BUILDINGS, unitType } from '@game/rules';
import { coutItem, nomItem } from '../src/lib/fileProduction.js';

const PANNEAU = resolve(import.meta.dirname, '../src/components/PanneauVille.svelte');

describe('coutItem — coût de file pour les 3 kinds (L1)', () => {
  it('une merveille (Colosse de Rhodes) a un coût FINI, celui de WONDERS', () => {
    const item = { kind: 'wonder', id: 'colosse_de_rhodes' } as const;
    const cout = coutItem(item);
    expect(cout).not.toBeNull();
    expect(Number.isFinite(cout)).toBe(true);
    expect(cout).toBe(WONDERS['colosse_de_rhodes']!.cost);
  });

  it('une unité garde son coût (unitType), un bâtiment le sien (BUILDINGS)', () => {
    expect(coutItem({ kind: 'unit', id: 'guerrier' })).toBe(unitType('guerrier').cost);
    const b = Object.entries(BUILDINGS)[0]!;
    expect(coutItem({ kind: 'building', id: b[0] })).toBe(b[1].cost);
  });

  it('un item réellement inconnu → null (repli honnête, pas Infinity)', () => {
    expect(coutItem({ kind: 'wonder', id: 'merveille_inexistante' })).toBeNull();
    expect(coutItem({ kind: 'building', id: 'batiment_inexistant' })).toBeNull();
    expect(coutItem({ kind: 'unit', id: 'unite_inexistante' })).toBeNull();
  });
});

describe('nomItem — nom affiché pour les 3 kinds (L2, même motif que le coût)', () => {
  it('une merveille affiche son NOM, pas son id brut (« stonehenge »)', () => {
    expect(nomItem({ kind: 'wonder', id: 'stonehenge' })).toBe('Stonehenge');
    expect(nomItem({ kind: 'wonder', id: 'colosse_de_rhodes' })).toBe('Colosse de Rhodes');
  });

  it('un item inconnu retombe sur l\'id (jamais de nom vide)', () => {
    expect(nomItem({ kind: 'wonder', id: 'merveille_inexistante' })).toBe('merveille_inexistante');
  });
});

describe('PanneauVille — jamais « Infinity » affiché (L1)', () => {
  it('le composant ne contient plus le motif `?? Infinity` et passe par coutItem', () => {
    const src = readFileSync(PANNEAU, 'utf8');
    expect(src).not.toContain('Infinity');
    expect(src).toContain('coutItem');
  });
});
