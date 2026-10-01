/**
 * UI-JEU-T3 (Erik 01/10) — minimap + filtres façon Civ VI :
 * module pur minimap.ts (grille fog, filtre ressources, rect de caméra,
 * case sous clic) et store filtresCarte.ts (bascules persistées — D4),
 * plus le câblage Game.svelte (migration du bouton « Rendements » hors du
 * calque dev, montée de la minimap masquée en vue ville — D6).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get } from 'svelte/store';
import { hexToPixel } from '@game/rules';
import { rendreMinimap, rectCameraMinimap, caseSousMinimap, mondeSousMinimap, poseMinimap, pxCellule, FOND_FOG, PALETTE_MINIMAP } from '../src/lib/render/minimap.js';
import type { GameState } from '@game/rules';
import { filtresCarte, cycleRendements, basculerRessources, basculerRepli, lireFiltres } from '../src/lib/filtresCarte.js';
import { HEX_SIZE } from '../src/lib/render/hexView.js';

/** État minimal ne portant que ce que rendreMinimap lit (fog par absence). */
function etatFixture(): GameState {
  return {
    mapWidth: 4,
    mapHeight: 3,
    map: {
      '0,0': { terrain: 'prairie', resource: null },
      '1,0': { terrain: 'ocean', resource: 'poisson' },
      '2,0': { terrain: 'foret', resource: null },
      // '3,0' absent → brouillard
      '0,1': { terrain: 'montagne', resource: 'fer' },
      '1,1': { terrain: 'plaine', resource: null },
      // '2,1','3,1' absents
      '0,2': { terrain: 'desert', resource: null },
      '1,2': { terrain: 'eau', resource: null },
    },
    units: {
      u1: { id: 'u1', type: 'guerrier', owner: 'P1', q: 2, r: 0, hp: 3, mp: 0, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false },
      uCache: { id: 'uCache', type: 'guerrier', owner: 'P2', q: 1, r: 0, hp: 3, mp: 0, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: 'navire', cargo: null, stabilized: false },
      uFog: { id: 'uFog', type: 'guerrier', owner: 'P2', q: 3, r: 0, hp: 3, mp: 0, veteran: false, isArmy: false, order: null, detainedBy: null, fortified: false, aboard: null, cargo: null, stabilized: false },
    } as unknown as GameState['units'],
    cities: {
      c1: { id: 'c1', q: 0, r: 2, owner: 'P1' },
    } as unknown as GameState['cities'],
    players: {
      P1: { vision: { explored: ['0,0', '1,0', '2,0', '0,1', '1,1', '0,2', '1,2'], visible: ['0,0', '1,0', '2,0', '0,2', '1,2'] } },
    },
  } as unknown as GameState;
}

describe('UI-JEU-T3 · rendreMinimap (pur)', () => {
  it('fog : case absente de l état filtré = 0 (fond sombre à la peinture)', () => {
    const img = rendreMinimap(etatFixture(), 'P1', { montrerRessources: true });
    expect(img.w).toBe(4);
    expect(img.h).toBe(3);
    expect(img.cellules[3]).toBe(0); // '3,0' inexploré
    expect(img.cellules[2 * 4 + 2]).toBe(0); // '2,1' inexploré
  });

  it('terrains à la palette plate ; exploré-masqué atténué', () => {
    const img = rendreMinimap(etatFixture(), 'P1', { montrerRessources: true });
    expect(img.cellules[0]).toBe(PALETTE_MINIMAP.prairie); // '0,0' visible
    // '0,1' exploré mais HORS vision : atténué
    const masque = img.cellules[1 * 4 + 0];
    expect(masque).not.toBe(0);
    expect(masque).not.toBe(PALETTE_MINIMAP.montagne);
    const r = (c: number) => (c >> 16) & 0xff;
    expect(r(masque)).toBeLessThan(r(PALETTE_MINIMAP.montagne!));
  });

  it('filtre Ressources : pastille mêlée si ON, terrain nu si OFF ; inconnue jamais pastillée', () => {
    const on = rendreMinimap(etatFixture(), 'P1', { montrerRessources: true });
    const off = rendreMinimap(etatFixture(), 'P1', { montrerRessources: false });
    expect(on.cellules[1]).not.toBe(PALETTE_MINIMAP.ocean); // poisson → pastille
    expect(off.cellules[1]).toBe(PALETTE_MINIMAP.ocean); // filtre OFF → terrain nu
    // '0,1' porte du fer (identité révélée) — la pastille suit le filtre
    expect(on.cellules[1 * 4 + 0]).not.toBe(off.cellules[1 * 4 + 0]);
  });

  it('villes et unités : point couleur du propriétaire ; unité embarquée et hors état filtré ignorées', () => {
    const img = rendreMinimap(etatFixture(), 'P1', { montrerRessources: true });
    expect(img.cellules[2 * 4 + 0]).toBeGreaterThan(0); // ville c1 (0,2)
    expect(img.cellules[0 * 4 + 2]).toBeGreaterThan(0); // unité u1 (2,0) — visible
    // uCache embarquée : pas de point — '1,0' reste son terrain (ressources OFF)
    const nu = rendreMinimap(etatFixture(), 'P1', { montrerRessources: false });
    expect(nu.cellules[0 * 4 + 1]).toBe(PALETTE_MINIMAP.ocean);
    expect(img.cellules[3]).toBe(0); // uFog sur case inexplorée : jamais inventée
  });
});

describe('UI-JEU-T3 · rect de caméra + clic (pur)', () => {
  it('rectCameraMinimap projette le viewport et se borne à la minimap', () => {
    const pose = poseMinimap(10, 8, 4);
    const rect = rectCameraMinimap({ x: 0, y: 0, scale: 1 }, 500, 300, pose);
    // centre du monde (0,0 point) : la projection est linéaire via pose
    const centre = pxCellule(pose, 0, 0);
    expect(rect.x).toBeLessThanOrEqual(centre.x);
    expect(rect.x + rect.w).toBeGreaterThanOrEqual(centre.x);
    // caméra très en dehors : le rect reste dans la minimap
    const hors = rectCameraMinimap({ x: -99999, y: -99999, scale: 0.3 }, 500, 300, pose);
    expect(hors.x).toBeGreaterThanOrEqual(0);
    expect(hors.y).toBeGreaterThanOrEqual(0);
    expect(hors.x + hors.w).toBeLessThanOrEqual(pose.mw);
    expect(hors.y + hors.h).toBeLessThanOrEqual(pose.mh);
  });

  it('aller-retour monde↔minimap : le clic sur le pixel d une case retombe sur son centre monde (CORRECTIF Erik 01/10)', () => {
    const pose = poseMinimap(50, 40, 4);
    for (const [col, row] of [[0, 0], [5, 23], [25, 20], [49, 39], [30, 3]]) {
      const centre = hexToPixel({ q: col, r: row }, HEX_SIZE);
      const px = (centre.x - pose.bx) * pose.kx;
      const py = (centre.y - pose.by) * pose.ky;
      const monde = mondeSousMinimap(px, py, pose);
      expect(monde.x).toBeCloseTo(centre.x, 4);
      expect(monde.y).toBeCloseTo(centre.y, 4);
      // la peinture d une case est AU MÊME pixel que la conversion du clic
      const peint = pxCellule(pose, col, row);
      expect(peint.x).toBeCloseTo(px, 4);
      expect(peint.y).toBeCloseTo(py, 4);
    }
  });

  it('caseSousMinimap : un clic au centre monde du hex (0,0) retombe sur (0,0)', () => {
    const pose = poseMinimap(10, 8, 4);
    const centre = hexToPixel({ q: 0, r: 0 }, HEX_SIZE);
    const px = (centre.x - pose.bx) * pose.kx;
    const py = (centre.y - pose.by) * pose.ky;
    const hex = caseSousMinimap(px, py, pose, HEX_SIZE);
    expect(hex.q).toBe(0);
    expect(hex.r).toBe(0);
  });
});

describe('UI-JEU-T3 · filtresCarte (D4 — persistées)', () => {
  beforeEach(() => {
    const map = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    };
    filtresCarte.set({ rendements: 0, ressources: true, replie: false });
  });

  it('défauts : rendements masqués, ressources affichées, panneau ouvert', () => {
    expect(get(filtresCarte)).toEqual({ rendements: 0, ressources: true, replie: false });
  });

  it('cycleRendements : 0 → 1 → 2 → 0, chaque état persisté', () => {
    cycleRendements();
    expect(get(filtresCarte).rendements).toBe(1);
    expect(JSON.parse(localStorage.getItem('filtres-carte')!).rendements).toBe(1);
    cycleRendements();
    expect(get(filtresCarte).rendements).toBe(2);
    cycleRendements();
    expect(get(filtresCarte).rendements).toBe(0);
  });

  it('basculerRessources et basculerRepli persistent', () => {
    basculerRessources();
    expect(get(filtresCarte).ressources).toBe(false);
    basculerRepli();
    expect(get(filtresCarte).replie).toBe(true);
    expect(JSON.parse(localStorage.getItem('filtres-carte')!)).toEqual({ rendements: 0, ressources: false, replie: true });
  });

  it('état mémorisé corrompu → repli sur les défauts (lireFiltres défensif)', () => {
    expect(lireFiltres(null)).toEqual({ rendements: 0, ressources: true, replie: false });
    expect(lireFiltres('pas du json')).toEqual({ rendements: 0, ressources: true, replie: false });
    expect(lireFiltres(JSON.stringify({ rendements: 9, ressources: 'x', replie: 1 }))).toEqual({ rendements: 0, ressources: true, replie: false });
    expect(lireFiltres(JSON.stringify({ rendements: 2, ressources: false, replie: false }))).toEqual({ rendements: 2, ressources: false, replie: false });
  });
});

describe('UI-JEU-T3 · câblage Game.svelte', () => {
  const src = readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf8');
  const calque = src.slice(src.indexOf('{#if $calqueDev}'), src.indexOf('</header>'));

  it('D4 — le bouton Rendements a QUITTÉ le calque dev ; les rendements viennent du store filtresCarte', () => {
    expect(calque).not.toContain('cycleRendements');
    expect(calque).not.toContain('active-toggle={showYields}');
    expect(src).toContain('cycleRendements');
    expect(src).toContain('$filtresCarte.rendements');
  });

  it('D4 — filtre Ressources branché au rendu du canvas (affichage seul)', () => {
    expect(src).toContain('montrerRessources={$filtresCarte.ressources}');
  });

  it('D1/D5 — minimap montée dans la zone de carte, masquée en vue ville', () => {
    expect(src).toContain('<Minimap');
    // D6 : la minimap est SOUS le même {#if !vueVilleActive} que la colonne —
    // le garde dont les {#if}/{/if} imbriqués restent ouverts jusqu'au composant.
    const cible = src.indexOf('<Minimap');
    let garde = -1;
    for (let i = src.indexOf('{#if !vueVilleActive'); i !== -1 && i < cible; i = src.indexOf('{#if !vueVilleActive', i + 1)) {
      const profondeur = (src.slice(i, cible).match(/\{#if|\{\/if\}/g) ?? []).reduce(
        (d, m) => d + (m === '{/if}' ? -1 : 1),
        0,
      );
      if (profondeur > 0) garde = i;
    }
    expect(garde).toBeGreaterThan(-1);
  });

  it('D3 — le clic minimap passe par l api canvas (zoom préservé)', () => {
    expect(src).toContain('centrerSurMonde');
  });
});
