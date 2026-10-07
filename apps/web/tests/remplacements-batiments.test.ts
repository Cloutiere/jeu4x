/**
 * REMPLACEMENTS-BATIMENTS (signalement Erik 06/10) — menu de production :
 * le filtre inversait le sens de `replaces` (R-111) : l'Université était
 * retirée du menu PRÉCISÉMENT quand la Bibliothèque (son prérequis) était
 * présente. D1 : un remplaçant est proposé quand son remplacé est construit
 * (grisé « Requiert X » sinon) ; le remplacé disparaît du menu dès qu'il
 * est construit (R-66) — au profit du remplaçant.
 */
import { describe, expect, it } from 'vitest';
import { optionsBatiments, type CtxVilleProduction } from '../src/lib/productionMenu.js';

function ctx(buildings: string[], techs: string[]): CtxVilleProduction {
  return { techsUnlocked: techs, buildings, civId: 'p1', coastal: false, prodPerTurn: 10 };
}

const IDS = (opts: ReturnType<typeof optionsBatiments>) => new Set(opts.map((o) => o.item.id));

describe('optionsBatiments — sens de `replaces` (R-111, D1)', () => {
  it('Bibliothèque construite + tech → l’Université est PROPOSÉE (le scénario d’Erik)', () => {
    const opts = optionsBatiments(ctx(['bibliotheque'], ['litteratie', 'universite']));
    expect(IDS(opts)).toContain('universite');
    const u = opts.find((o) => o.item.id === 'universite')!;
    expect(u.unlocked).toBe(true);
    expect(u.requires).toBeNull(); // prérequis satisfait
  });

  it('sans Bibliothèque : l’Université apparaît GRISÉE avec « Requiert Bibliothèque »', () => {
    const opts = optionsBatiments(ctx([], ['litteratie', 'universite']));
    const u = opts.find((o) => o.item.id === 'universite');
    expect(u).toBeDefined();
    expect(u!.unlocked).toBe(false);
    expect(u!.requires).toContain('Bibliothèque');
  });

  it('Banque avec Marché et Cathédrale avec Temple : même chaîne', () => {
    const opts = optionsBatiments(ctx(['marche', 'temple'], ['monnaie', 'banque', 'religion']));
    expect(IDS(opts)).toContain('banque');
    expect(IDS(opts)).toContain('cathedrale');
    expect(opts.find((o) => o.item.id === 'banque')!.unlocked).toBe(true);
    expect(opts.find((o) => o.item.id === 'cathedrale')!.unlocked).toBe(true);
  });

  it('le remplacé disparaît du menu au profit du remplaçant (R-66 + D1)', () => {
    const opts = optionsBatiments(ctx(['universite'], ['litteratie', 'universite']));
    expect(IDS(opts)).not.toContain('bibliotheque'); // construite
    expect(IDS(opts)).not.toContain('universite'); // déjà bâtie
  });
});
