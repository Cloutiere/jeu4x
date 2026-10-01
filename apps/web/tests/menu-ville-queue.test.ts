/**
 * MENU-VILLE-QUEUE (Erik 02/10) — file de production EFFECTIVE côté client
 * (lib/fileProduction.ts, miroir pur de `applyQueueOps` du moteur) + câblage
 * Game.svelte (panneau de ville à GAUCHE au clic simple — D3 ; abandon de la
 * vue ville zoomée, code DORMANT non supprimé — D4 ; rendements + zone
 * cultivable à l'ouverture — D5) + miroir sameSubject (opérations de file
 * sans dédoublonnage — D2).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FILE_PRODUCTION_PROFONDEUR } from '@game/rules';
import type { GameState, ProductionItem } from '@game/rules';
import { fileEffective } from '../src/lib/fileProduction.js';
import { sameSubject } from '../src/lib/gameClient.js';
import type { GameView, Order } from '../src/lib/gameClient.js';
import { initialView } from '../src/lib/gameClient.js';

const GUERRIER: ProductionItem = { kind: 'unit', id: 'guerrier' };
const COLON: ProductionItem = { kind: 'unit', id: 'colon' };
const GRANIER: ProductionItem = { kind: 'building', id: 'granier' };

function vueFixture(orders: Order[] = []): GameView {
  const state = {
    schemaVersion: 27,
    cities: {
      c1: {
        id: 'c1', q: 0, r: 0, owner: 'p1', pop: 1, capital: true, foodStored: 0,
        production: { item: GUERRIER, progress: 4 }, queue: [COLON],
        workedTiles: [], buildings: [], conversion: 'gold', cultureCumulee: 0,
        wonders: [], pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
      },
      cEnnemie: {
        id: 'cEnnemie', q: 3, r: 3, owner: 'p2', pop: 1, capital: false, foodStored: 0,
        production: null, queue: [], workedTiles: [], buildings: [], conversion: 'gold',
        cultureCumulee: 0, wonders: [], pendingSalvage: 0, settledGreatPersons: [], wasCaptured: false,
      },
    },
    players: {
      p1: { id: 'p1' },
      p2: { id: 'p2' },
    },
  } as unknown as GameState;
  return {
    ...initialView('ABCD'),
    playerId: 'siege1',
    players: [
      { id: 'siege1', name: 'Erik', engineId: 'p1' },
      { id: 'siege2', name: 'Bot', engineId: 'p2', bot: true },
    ],
    status: 'active',
    state,
    orders,
  } as GameView;
}

describe('fileEffective — miroir pur du moteur (D1/D2)', () => {
  it('sans brouillon : tête (progression) + file d\'attente de l\'état', () => {
    const f = fileEffective(vueFixture(), 'c1');
    expect(f.rangs).toEqual([
      { item: GUERRIER, progress: 4 },
      { item: COLON, progress: 0 },
    ]);
    expect(f.profondeur).toBe(FILE_PRODUCTION_PROFONDEUR);
    expect(f.mine).toBe(true);
  });

  it('QueueProduction en brouillon s\'empile ; profondeur respectée', () => {
    const f = fileEffective(vueFixture(), 'c1', 3);
    expect(f.rangs).toHaveLength(2);
    const f2 = fileEffective(vueFixture([
      { type: 'QueueProduction', cityId: 'c1', item: GRANIER },
    ]), 'c1', 3);
    expect(f2.rangs.map((r) => r.item)).toEqual([GUERRIER, COLON, GRANIER]);
    const f3 = fileEffective(vueFixture([
      { type: 'QueueProduction', cityId: 'c1', item: GRANIER },
      { type: 'QueueProduction', cityId: 'c1', item: COLON }, // au-delà de 3 (tête comprise)
    ]), 'c1', 3);
    expect(f3.rangs).toHaveLength(3);
  });

  it('ville SANS production : le QueueProduction devient la TÊTE', () => {
    const v = vueFixture([{ type: 'QueueProduction', cityId: 'cEnnemie', item: GUERRIER }]);
    // ennemie : l'ordre ne serait pas soumis — test de la sémantique pure
    const f = fileEffective({ ...v, orders: [] }, 'cEnnemie');
    expect(f.rangs).toEqual([]);
    const mienne = { ...vueFixture([{ type: 'QueueProduction', cityId: 'c1', item: COLON }]) };
    const c1 = mienne.state!.cities['c1'] as { production: unknown; queue: unknown };
    c1.production = null;
    c1.queue = [];
    const f2 = fileEffective(mienne, 'c1');
    expect(f2.rangs).toEqual([{ item: COLON, progress: 0 }]);
  });

  it('RemoveFromQueue index 0 (tête) : l\'item suivant remonte (progression 0)', () => {
    const f = fileEffective(vueFixture([{ type: 'RemoveFromQueue', cityId: 'c1', index: 0 }]), 'c1');
    expect(f.rangs).toEqual([{ item: COLON, progress: 0 }]);
  });

  it('RemoveFromQueue d\'un item d\'attente : la file se tasse ; indice hors bornes ignoré', () => {
    const v = vueFixture([
      { type: 'QueueProduction', cityId: 'c1', item: GRANIER },
      { type: 'RemoveFromQueue', cityId: 'c1', index: 1 },
    ]);
    expect(fileEffective(v, 'c1').rangs.map((r) => r.item)).toEqual([GUERRIER, GRANIER]);
    const v2 = vueFixture([{ type: 'RemoveFromQueue', cityId: 'c1', index: 9 }]);
    expect(fileEffective(v2, 'c1').rangs).toHaveLength(2);
  });

  it('ReorderQueue : réordonne la file d\'ATTENTE (indices décalés), dans l\'ordre des commandes', () => {
    const v = vueFixture([
      { type: 'QueueProduction', cityId: 'c1', item: GRANIER },
      { type: 'ReorderQueue', cityId: 'c1', from: 0, to: 1 }, // COLON après GRANIER
    ]);
    expect(fileEffective(v, 'c1').rangs.map((r) => r.item)).toEqual([GUERRIER, GRANIER, COLON]);
  });

  it('ville ennemie : mine = false', () => {
    expect(fileEffective(vueFixture(), 'cEnnemie').mine).toBe(false);
  });
});

describe('sameSubject (miroir client) — opérations de file sans dédoublonnage (D2)', () => {
  it('deux QueueProduction de la même ville coexistent ; SetProduction reste unique par ville', () => {
    const q1: Order = { type: 'QueueProduction', cityId: 'c1', item: COLON };
    const q2: Order = { type: 'QueueProduction', cityId: 'c1', item: GRANIER };
    expect(sameSubject(q1, q2)).toBe(false);
    const s1: Order = { type: 'SetProduction', cityId: 'c1', item: COLON };
    const s2: Order = { type: 'SetProduction', cityId: 'c1', item: GUERRIER };
    expect(sameSubject(s1, s2)).toBe(true);
    // une op de file n'écrase jamais le SetProduction (compat bot)
    expect(sameSubject(s1, q1)).toBe(false);
  });
});

describe('câblage Game.svelte (D3/D4/D5)', () => {
  const page = () => readFileSync(resolve(import.meta.dirname, '../src/pages/Game.svelte'), 'utf-8');

  it('D3 : le panneau de ville est monté sur selectedCityId (clic simple), fermeture selectNothing', () => {
    const s = page();
    expect(s).toContain('PanneauVille');
    expect(s).toMatch(/\{#if \$ui\.selectedCityId && \$view\.state\}/);
    expect(s).toContain('onFermer={() => selectNothing(ui)}');
    expect(s).toContain("e.key === 'Escape' && get(ui).selectedCityId !== null");
  });

  it('D4 : CityView n\'est plus monté ; le store vueVille reste DORMANT (non supprimé)', () => {
    const s = page();
    expect(s).not.toMatch(/<CityView/);
    expect(s).toContain('import CityView'); // import commenté = code dormant documenté
    expect(s).toContain('createVueVille()'); // store conservé (dormant)
    expect(s).not.toMatch(/^\s*onEnterVueVille=\{entrerVueVille\}/m); // débranché du canvas (la ligne commentée ne compte pas)
  });

  it('D5 : le canvas reçoit villeRendementsId = ville du panneau', () => {
    expect(page()).toContain('villeRendementsId={$ui.selectedCityId}');
  });

  it("retour Erik : la minimap s'efface quand le panneau de ville est ouvert (l'un OU l'autre — même position bas-gauche)", () => {
    const s = page();
    expect(s).toMatch(/\{#if \$ui\.selectedCityId === null\}[\s\S]*?<Minimap/);
  });

  it('D5 : GameCanvas inclut villeRendementsId dans sa condition de rendements (miroir vue ville)', () => {
    const canvas = readFileSync(resolve(import.meta.dirname, '../src/lib/render/GameCanvas.svelte'), 'utf-8');
    expect(canvas).toContain('villeRendementsId = null');
    expect(canvas).toContain('const villeZoneId = vueVilleId ?? villeRendementsId;');
    expect(canvas).toContain('if (showYields || villeZoneId) {');
  });

  it('PanneauVille : clic d\'option = QueueProduction (ajout EN QUEUE, plus de SetProduction)', () => {
    const s = readFileSync(resolve(import.meta.dirname, '../src/components/PanneauVille.svelte'), 'utf-8');
    expect(s).toContain("type: 'QueueProduction'");
    expect(s).toContain("type: 'RemoveFromQueue'");
    expect(s).toContain("type: 'ReorderQueue'");
    expect(s).not.toContain("type: 'SetProduction'");
    // le panneau est ancré À GAUCHE (D3 — miroir de la colonne de droite)
    expect(s).toMatch(/left:\s*0\.6rem/);
  });
});
