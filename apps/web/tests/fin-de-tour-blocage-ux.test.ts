/**
 * HANG-LOCAL UX (Erik 01/10) — verdict « pas un hang » : options 1+2.
 * Option 1 : le bouton « Fin de tour » reste CLIQUABLE sous blocage — le
 * clic affiche le toast du motif (`requestEndTurn`, même libellé que le
 * rejet serveur). Option 2 : à l'apparition du blocage (TurnResult),
 * orientation vers la ville fautive — miroir « unités sans ordre » :
 * sélection + centrage `centerOnHex`, zoom préservé.
 * Partie pure (`villeDuPremierBlocageProduction`) + câblage Game.svelte
 * (le rendu Pixi n'est pas rejouable en vitest — même convention que
 * reglages-calibrage.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { villeDuPremierBlocageProduction } from '../src/lib/blocages.js';
import type { BlocageFinDeTour } from '@game/rules';

const blocageVilleA: BlocageFinDeTour = { kind: 'production', cityId: 'c1', reason: '3 marteaux/tour' };
const blocageVilleB: BlocageFinDeTour = { kind: 'production', cityId: 'c2', reason: '2 marteaux/tour' };
const blocageRecherche: BlocageFinDeTour = { kind: 'recherche', reason: 'x', points: 3 };

describe('HANG-LOCAL UX · villeDuPremierBlocageProduction', () => {
  it('renvoie la première ville de production (ordre du tableau, R-81)', () => {
    expect(villeDuPremierBlocageProduction([blocageVilleA, blocageVilleB, blocageRecherche])).toBe('c1');
    expect(villeDuPremierBlocageProduction([blocageRecherche, blocageVilleB])).toBe('c2');
  });
  it('renvoie null sans blocage production porteur de ville', () => {
    expect(villeDuPremierBlocageProduction([])).toBeNull();
    expect(villeDuPremierBlocageProduction([blocageRecherche])).toBeNull();
  });
});

describe('HANG-LOCAL UX · câblage Game.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');

  it('option 1 — le bouton Fin de tour ne désactive PLUS sur myBlocages, le clic toaste le motif', () => {
    // disabled sans la clause de blocage
    const disabled = src.match(/disabled=\{[^}]*\}[^>]*\n[^>]*title=\{myBlocages/);
    expect(disabled).not.toBeNull();
    expect(disabled![0]).not.toContain('myBlocages.length > 0');
    // le style et le libellé de blocage restent (signal visuel conservé)
    expect(src).toContain('class:blocage={myBlocages.length > 0}');
    expect(src).toContain('`Fin de tour bloquée (${myBlocages.length})`');
    // requestEndTurn affiche le toast du motif (chemin désormais accessible)
    expect(src).toMatch(/if \(blocages\.length > 0\) \{\s*\n\s*for \(const b of blocages\) pushErrorToast/);
  });

  it('option 2 — à la TurnResult, orientation vers la ville fautive (sélection + centerOnHex)', () => {
    expect(src).toContain("villeDuPremierBlocageProduction(blocages)");
    // miroir « unités sans ordre » : sélection de la ville + centrage zoom préservé
    expect(src).toMatch(/ui\.set\(\{ selectedUnitId: null, selectedCityId: cityId, draft: null \}\)/);
    expect(src).toMatch(/canvasApi\?\.centerOnHex\(\{ q: ville\.q, r: ville\.r \}\)/);
    // branché dans le hook TurnResult (apparition), pas sur Snapshot
    const turnResult = src.slice(src.indexOf("if (message.type === 'TurnResult')"));
    expect(turnResult).toContain('villeDuPremierBlocageProduction');
  });
});
