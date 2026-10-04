/**
 * HANDOFF-BLOCAGE-NAVIGATION · L1 (test-first) — navigation vers le menu
 * fautif depuis le clic « Fin de tour bloquée (n) » (D1/D2 : Recherche
 * prioritaire, sinon première ville au tri R-81) et cycle des flèches
 * ⟵ ⟶ de l'en-tête de PanneauVille (D3 : ordre R-81 par id, cyclique).
 * Fonctions PURES de lib/blocages.ts — aucun changement moteur.
 */
import { describe, expect, it } from 'vitest';
import type { BlocageFinDeTour } from '@game/rules';
import { menuAOuvrir, villeVoisine } from '../src/lib/blocages.js';

function prod(cityId: string): BlocageFinDeTour {
  return { kind: 'production', cityId, reason: '4 marteaux/tour' };
}
function rech(): BlocageFinDeTour {
  return { kind: 'recherche', reason: 'science en attente', points: 3 };
}

describe('menuAOuvrir (D1/D2 — clic sur le bouton bloqué)', () => {
  it('lot vide → null (rien à ouvrir)', () => {
    expect(menuAOuvrir([])).toBeNull();
  });

  it('recherche seule → ResearchPanel', () => {
    expect(menuAOuvrir([rech()])).toEqual({ kind: 'recherche' });
  });

  it('production seule → première ville fautive (ordre du tableau R-81)', () => {
    const blocages = [prod('c3'), prod('c1'), prod('c2')];
    expect(menuAOuvrir(blocages)).toEqual({ kind: 'ville', cityId: 'c3' });
  });

  it('les deux → Recherche d\'abord (priorité D1)', () => {
    const blocages = [prod('c1'), rech(), prod('c2')];
    expect(menuAOuvrir(blocages)).toEqual({ kind: 'recherche' });
  });

  it('recherche seule même si une production suit après', () => {
    const blocages = [rech(), prod('c9')];
    expect(menuAOuvrir(blocages)).toEqual({ kind: 'recherche' });
  });
});

describe('villeVoisine (D3 — flèches ⟵ ⟶, ordre R-81 cyclique)', () => {
  const ids = ['c5', 'c1', 'c3']; // désordre volontaire — le tri R-81 est interne

  it('suivante : cyclique par id croissant', () => {
    expect(villeVoisine(ids, 'c5', 1)).toBe('c1');
    expect(villeVoisine(ids, 'c1', 1)).toBe('c3');
    expect(villeVoisine(ids, 'c3', 1)).toBe('c5'); // reboucle
  });

  it('précédente : cyclique dans l\'autre sens', () => {
    expect(villeVoisine(ids, 'c5', -1)).toBe('c3');
    expect(villeVoisine(ids, 'c3', -1)).toBe('c1');
    expect(villeVoisine(ids, 'c1', -1)).toBe('c5'); // reboucle
  });

  it('une seule ville → elle-même (les flèches sont masquées côté UI)', () => {
    expect(villeVoisine(['c1'], 'c1', 1)).toBe('c1');
    expect(villeVoisine(['c1'], 'c1', -1)).toBe('c1');
  });

  it('liste vide ou ville absente → null (no-op)', () => {
    expect(villeVoisine([], 'c1', 1)).toBeNull();
    expect(villeVoisine(ids, 'inconnue', 1)).toBeNull();
  });
});
