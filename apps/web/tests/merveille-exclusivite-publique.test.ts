/**
 * MERVEILLE-EXCLUSIVITE-PUBLIQUE (Erik 05/10, feu vert 3 volets) — côté
 * client : l'UI ne propose plus une merveille déjà bâtie (liste publique
 * `worldWondersBuilt` du snapshot, brume comprise) et un refus de production
 * devient une ligne de chronique + un toast.
 */
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@game/shared';
import { merveillesMondeConnues } from '../src/lib/fileProduction.js';
import { entreesChronique } from '../src/lib/chronique.js';
import type { ContexteChronique } from '../src/lib/chronique.js';
import type { GameState } from '@game/rules';

describe('merveillesMondeConnues — union liste publique + villes visibles', () => {
  const state = {
    worldWondersBuilt: ['colosse_de_rhodes', 'stonehenge'], // liste publique serveur (brume comprise)
    cities: {
      v1: { owner: 'p1', wonders: ['stonehenge'] }, // doublon avec la liste publique
      v2: { owner: 'p2', wonders: ['jardins_suspendus'] }, // ville visible, pas encore dans la liste
    },
  } as unknown as GameState;

  it('union triée, dédoublonnée — une merveille bâtie dans le brouillard est connue', () => {
    expect(merveillesMondeConnues(state)).toEqual(['colosse_de_rhodes', 'jardins_suspendus', 'stonehenge']);
  });

  it('sans champ public (ancien serveur) : repli sur les villes visibles seules', () => {
    expect(merveillesMondeConnues({ cities: state.cities } as unknown as GameState)).toEqual(['jardins_suspendus', 'stonehenge']);
  });
});

describe('chronique — ProductionRefused devient une ligne (volet 3)', () => {
  const ctx: ContexteChronique = {
    moi: 'p1',
    nomJoueur: (id) => (id === 'p1' ? 'Alice' : id),
    civDe: () => null,
    ville: (cityId) => (cityId === 'v1' ? { nom: 'Ville1', q: 2, r: 2, owner: 'p1' } : null),
    villes: () => [{ nom: 'Ville1', q: 2, r: 2, owner: 'p1' }],
    unite: () => null,
    unites: () => [],
  } as unknown as ContexteChronique;
  const e = (x: object) => x as GameEvent;

  it('le refus de production apparaît avec la raison nommée', () => {
    const entrees = entreesChronique(
      [e({ seq: 9, type: 'ProductionRefused', cityId: 'v1', owner: 'p1', item: { kind: 'wonder', id: 'stonehenge' }, reason: 'déjà construite quelque part (exclusivité mondiale)' })],
      ctx,
      5,
    );
    expect(entrees).toHaveLength(1);
    expect(entrees[0]!.texte).toContain('Stonehenge');
    expect(entrees[0]!.texte).toContain('déjà construite');
  });
});
