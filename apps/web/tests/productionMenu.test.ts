/**
 * Tests du menu de production des villes (CORRECTIFS-SOLO, signalement 1) :
 * l'ICBM n'est JAMAIS listée (R-138 — strategic), et la producibilité affichée
 * passe par la MÊME source que le serveur et le bot (`canSetProduction`,
 * R-87/R-110/R-148) — le menu ne peut plus mentir au joueur.
 */
import { describe, expect, it } from 'vitest';
import { UNIT_TYPES, canSetProduction } from '@game/rules';
import { optionsBatiments, optionsUnites } from '../src/lib/productionMenu.js';
import type { CtxVilleProduction } from '../src/lib/productionMenu.js';

function ctx(parts: Partial<CtxVilleProduction> = {}): CtxVilleProduction {
  return {
    techsUnlocked: [],
    buildings: [],
    civId: 'neutre',
    coastal: false,
    prodPerTurn: 2,
    ...parts,
  };
}

const idsUnites = (ctxv: CtxVilleProduction) => optionsUnites(ctxv).map((o) => (o.item as { id: string }).id);

describe('CORRECTIFS-SOLO 1 · R-138 — ICBM jamais dans le menu de production', () => {
  it('début de partie, aucune tech : l’ICBM est absente du menu', () => {
    expect(UNIT_TYPES.icbm.strategic).toBe(true); // garde-fou données
    expect(idsUnites(ctx())).not.toContain('icbm');
  });

  it('même avec TOUTES les technologies débloquées, l’ICBM reste absente', () => {
    const all = ctx({ techsUnlocked: Object.keys(UNIT_TYPES).map((id) => UNIT_TYPES[id].tech ?? '').filter(Boolean) });
    expect(idsUnites(all)).not.toContain('icbm');
  });

  it('aucune option listée ne porte strategic:true (balayage des données)', () => {
    for (const ctxv of [ctx(), ctx({ techsUnlocked: Object.keys(UNIT_TYPES).map((id) => UNIT_TYPES[id].tech ?? '').filter(Boolean) })]) {
      for (const o of optionsUnites(ctxv)) {
        const u = UNIT_TYPES[(o.item as { id: string }).id];
        expect(u.strategic, `unité stratégique listée : ${u.id}`).toBeFalsy();
      }
    }
  });
});

describe('CORRECTIFS-SOLO 1 · R-87 — le menu affiche la même producibilité que le serveur', () => {
  it('sans technologie : seuls Guerrier et Colon sont débloqués', () => {
    const opts = optionsUnites(ctx());
    const unlocked = opts.filter((o) => o.unlocked).map((o) => (o.item as { id: string }).id).sort();
    expect(unlocked).toEqual(['colon', 'guerrier']);
  });

  it('les items verrouillés sont grisés avec leur tech requise (pas exclus)', () => {
    const archer = optionsUnites(ctx()).find((o) => (o.item as { id: string }).id === 'archer');
    expect(archer).toBeDefined();
    expect(archer!.unlocked).toBe(false);
    expect(archer!.requires).toBeTruthy();
  });

  it('chaque option débloquée passe canSetProduction — source unique partagée', () => {
    const techs = ['potterie', 'travailDuBronze', 'equitation'];
    const ctxv = ctx({ techsUnlocked: techs, buildings: ['marche'], coastal: true, civId: 'romains' });
    for (const o of optionsUnites(ctxv).concat(optionsBatiments(ctxv))) {
      if (o.unlocked) {
        expect(canSetProduction(o.item, techs, ['marche'], 'romains'), `${(o.item as { id: string }).id} débloqué côté UI mais refusé côté moteur`).toBe(true);
      }
    }
  });
});
