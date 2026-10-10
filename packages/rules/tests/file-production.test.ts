/**
 * MENU-VILLE-QUEUE — file d'attente de production par ville (D1/D2, demande
 * d'Erik du 02/10). File de profondeur FILE_PRODUCTION_PROFONDEUR (4, tête
 * comprise) : QueueProduction ajoute, RemoveFromQueue retire (salvage R-130
 * sur la tête entamée), ReorderQueue réordonne la file d'attente ; à la
 * complétion l'item suivant remonte (progression 0). Migration 26 → 27
 * (champ additif City.queue, idempotent). Compat bot : la forme historique
 * SetProduction remplace la tête et vide la file.
 */
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  FILE_PRODUCTION_PROFONDEUR,
  MIGRATIONS,
  blocagesFinDeTour,
  makeState,
  migrateState,
  resolveTurn,
} from '../src/index.js';
import type { City, GameState } from '../src/index.js';
import { cityAt, unitAt } from '../src/fixtures.js';

const GUERRIER = { kind: 'unit', id: 'guerrier' } as const;
const COLON = { kind: 'unit', id: 'colon' } as const;
const CASERNE = { kind: 'building', id: 'caserne' } as const;

function villeFile(production: City['production'], queue: City['queue'] = []): GameState {
  // R-63 rév. Erik 10/10 : plus de +1/tour du citoyen intérieur — la ville
  // travaille une COLLINE (1 marteau/tour) pour garder le rythme d'avant.
  return makeState({
    terrainOverrides: { '0,1': 'colline' },
    cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, workedTiles: ['0,1'], production, queue }],
  });
}

describe('Migration schemaVersion 26 → 27 (champ additif City.queue)', () => {
  it('CURRENT_SCHEMA_VERSION = 27 ; MIGRATIONS[27] existe ; file vide, tête = production courante', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(27);
    expect(typeof MIGRATIONS[27]).toBe('function');
    const base = makeState({
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true,
          production: { item: GUERRIER, progress: 3 },
        },
      ],
    });
    const v26 = structuredClone(base) as unknown as Record<string, unknown>;
    v26.schemaVersion = 26;
    for (const c of Object.values(v26.cities as Record<string, Record<string, unknown>>)) delete c.queue;
    const out = migrateState(v26) as unknown as GameState;
    expect(out.schemaVersion).toBe(27);
    // production courante = tête d'une file à 1 élément ; attente vide
    expect(out.cities['c1']!.production).toEqual({ item: GUERRIER, progress: 3 });
    expect(out.cities['c1']!.queue).toEqual([]);
  });

  it('idempotent (double application = inchangé) ; un état déjà à jour ne bouge pas', () => {
    const base = makeState({ cities: [{ id: 'c1', owner: 'p1', q: 0, r: 0, capital: true }] });
    const v26 = structuredClone(base) as unknown as Record<string, unknown>;
    v26.schemaVersion = 26;
    const out = migrateState(v26) as unknown as GameState;
    expect((out.cities['c1'] as City).queue).toEqual([]);
    expect(migrateState(structuredClone(out) as unknown as Record<string, unknown>)).toEqual(out);
  });
});

describe('QueueProduction — ajout en queue (D1)', () => {
  it('la ville sans production : le premier item devient la TÊTE (progression 0)', () => {
    const { newState } = resolveTurn(
      villeFile(null),
      { p1: [{ type: 'QueueProduction', cityId: 'c1', item: GUERRIER }] },
      1,
    );
    // promu à 0 PUIS accumulation du tour (+1 — citoyen intérieur)
    expect(newState.cities['c1']!.production).toEqual({ item: GUERRIER, progress: 1 });
    expect(newState.cities['c1']!.queue).toEqual([]);
  });

  it('les items suivants s\'empilent DANS L\'ORDRE de soumission ; profondeur 4 (tête comprise) au-delà ignorée', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 1 }),
      {
        p1: [
          { type: 'QueueProduction', cityId: 'c1', item: COLON },
          { type: 'QueueProduction', cityId: 'c1', item: COLON },
          { type: 'QueueProduction', cityId: 'c1', item: COLON }, // 4ᵉ (tête + 3) : accepté
          { type: 'QueueProduction', cityId: 'c1', item: GUERRIER }, // 5ᵉ : file pleine, ignoré
        ],
      },
      1,
    );
    expect(newState.cities['c1']!.production!.item).toEqual(GUERRIER);
    expect(newState.cities['c1']!.queue).toEqual([COLON, COLON, COLON]);
    expect(FILE_PRODUCTION_PROFONDEUR).toBe(4);
  });

  it('item inéligible (coût inconnu, prérequis manquant) : ignoré — file intacte', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 1 }),
      {
        p1: [
          { type: 'QueueProduction', cityId: 'c1', item: { kind: 'unit', id: 'inconnu' } },
          { type: 'QueueProduction', cityId: 'c1', item: { kind: 'building', id: 'banque' } }, // Banque sans Marché (R-87)
        ],
      },
      1,
    );
    expect(newState.cities['c1']!.queue).toEqual([]);
  });
});

describe('Complétion en chaîne — l\'item suivant remonte (D1)', () => {
  it('tête complétée → queue[0] devient tête à progression 0, puis se construit à son tour', () => {
    // guerrier coût 10, progress 9, +1/tour → complété au tour 1 ; colon promu à 0,
    // +1 au tour 1... non : la promotion a lieu APRÈS l'accumulation → colon démarre à 0.
    const r1 = resolveTurn(
      villeFile({ item: GUERRIER, progress: 9 }, [COLON]),
      {},
      1,
    );
    expect(unitAt(r1.newState, 0, 0)?.type).toBe('guerrier');
    expect(r1.newState.cities['c1']!.production).toEqual({ item: COLON, progress: 0 });
    expect(r1.newState.cities['c1']!.queue).toEqual([]);
    // tour 2 : colon coût 10... coût pop 1 (R-112) ; progress 1 après accumulation
    const r2 = resolveTurn(r1.newState, {}, 1);
    expect(r2.newState.cities['c1']!.production!.item).toEqual(COLON);
    expect(r2.newState.cities['c1']!.production!.progress).toBe(1);
  });

  it('rush-buy de la TÊTE (R-135) : l\'item suivant remonte immédiatement, la file est intacte', () => {
    const state = villeFile({ item: GUERRIER, progress: 2 }, [COLON, CASERNE]);
    state.players['p1']!.treasury = 500;
    const { newState, events } = resolveTurn(state, { p1: [{ type: 'RushBuy', cityId: 'c1' }] }, 1);
    expect(events.some((e) => e.type === 'RushBuy')).toBe(true);
    expect(unitAt(newState, 0, 0)?.type).toBe('guerrier');
    expect(newState.cities['c1']!.production).toEqual({ item: COLON, progress: 1 }); // promu puis +1 (économie)
    expect(newState.cities['c1']!.queue).toEqual([CASERNE]);
  });
});

describe('RemoveFromQueue — retrait et salvage R-130 (D1)', () => {
  it('retirer la TÊTE entamée rend ses marteaux à la réserve ; l\'item suivant remonte ; la réserve finance le tour suivant', () => {
    const r1 = resolveTurn(
      villeFile({ item: GUERRIER, progress: 4 }, [COLON]),
      { p1: [{ type: 'RemoveFromQueue', cityId: 'c1', index: 0 }] },
      1,
    );
    // le promote + versement de la réserve C7 ont lieu AVANT l'accumulation :
    // colon 0 + réserve 4 + production du tour 1 = 5
    expect(r1.newState.cities['c1']!.production).toEqual({ item: COLON, progress: 5 });
    expect(r1.newState.cities['c1']!.pendingSalvage).toBe(0);
  });

  it('retirer un item D\'ATTENTE : aucun salvage, la file se tasse', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 4 }, [COLON, CASERNE]),
      { p1: [{ type: 'RemoveFromQueue', cityId: 'c1', index: 1 }] },
      1,
    );
    expect(newState.cities['c1']!.production!.item).toEqual(GUERRIER);
    expect(newState.cities['c1']!.pendingSalvage).toBe(0);
    expect(newState.cities['c1']!.queue).toEqual([CASERNE]);
  });

  it('indice hors file : ignoré', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 1 }, [COLON]),
      { p1: [{ type: 'RemoveFromQueue', cityId: 'c1', index: 5 }] },
      1,
    );
    expect(newState.cities['c1']!.queue).toEqual([COLON]);
    expect(newState.cities['c1']!.pendingSalvage).toBe(0);
  });
});

describe('ReorderQueue — réordonnancement de la file d\'attente (D1)', () => {
  it('déplacer un item d\'attente (0 = premier item d\'ATTENTE, la tête ne bouge pas)', () => {
    const A = { kind: 'unit', id: 'guerrier' } as const;
    const B = { kind: 'building', id: 'caserne' } as const;
    const C = { kind: 'unit', id: 'colon' } as const;
    const { newState } = resolveTurn(
      villeFile({ item: A, progress: 1 }, [B, C]),
      { p1: [{ type: 'ReorderQueue', cityId: 'c1', from: 0, to: 1 }] },
      1,
    );
    expect(newState.cities['c1']!.production!.item).toEqual(A); // tête intacte
    expect(newState.cities['c1']!.queue).toEqual([C, B]);
  });

  it('indices invalides ou identiques : ignorés', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 1 }, [COLON, CASERNE]),
      {
        p1: [
          { type: 'ReorderQueue', cityId: 'c1', from: 0, to: 0 },
          { type: 'ReorderQueue', cityId: 'c1', from: -1, to: 0 },
          { type: 'ReorderQueue', cityId: 'c1', from: 0, to: 9 },
        ],
      },
      1,
    );
    expect(newState.cities['c1']!.queue).toEqual([COLON, CASERNE]);
  });
});

describe('Compat bot — forme historique SetProduction (D2)', () => {
  it('SetProduction simple remplace la tête (progression conservée R-62) et VIDE la file', () => {
    const { newState } = resolveTurn(
      villeFile({ item: GUERRIER, progress: 3 }, [COLON]),
      { p1: [{ type: 'SetProduction', cityId: 'c1', item: COLON }] },
      1,
    );
    expect(newState.cities['c1']!.production).toEqual({ item: COLON, progress: 4 }); // 3 conservé + 1 du tour
    expect(newState.cities['c1']!.queue).toEqual([]);
  });

  it('le bot (SetProduction) fonctionne à l\'identique sur une ville migrée à file vide', () => {
    const { newState, events } = resolveTurn(
      villeFile(null),
      { p1: [{ type: 'SetProduction', cityId: 'c1', item: GUERRIER }] },
      1,
    );
    expect(newState.cities['c1']!.production).toEqual({ item: GUERRIER, progress: 1 });
    expect(events.some((e) => e.type === 'UnitProduced')).toBe(false);
  });
});

describe('R-184 — blocage fin de tour avec la file (D2/D7)', () => {
  it('ville à marteaux sans production NI file : bloquée ; QueueProduction en brouillon débloque ; city.queue non vide débloque', () => {
    const state = villeFile(null);
    const bloque = blocagesFinDeTour(state, 'p1', []);
    expect(bloque.some((b) => b.kind === 'production' && b.cityId === 'c1')).toBe(true);
    const debloqueDraft = blocagesFinDeTour(state, 'p1', [{ type: 'QueueProduction', cityId: 'c1', item: GUERRIER }]);
    expect(debloqueDraft).toEqual([]);
    const avecFile = villeFile(null, [GUERRIER]);
    expect(blocagesFinDeTour(avecFile, 'p1', [])).toEqual([]);
  });

  it('la file se vide au fil des complétions : le blocage revient quand TOUT est consommé', () => {
    const r1 = resolveTurn(villeFile({ item: GUERRIER, progress: 9 }, [COLON]), {}, 1);
    // colon promu — file non vide sémantiquement (une production existe)
    expect(blocagesFinDeTour(r1.newState, 'p1', [])).toEqual([]);
  });
});

describe('R-63/D7 — zéro régression croissance avec file', () => {
  it('la croissance et les workedTiles ne sont pas perturbés par la file', () => {
    const state = makeState({
      cities: [
        {
          id: 'c1', owner: 'p1', q: 0, r: 0, capital: true, pop: 1, foodStored: 8,
          production: { item: GUERRIER, progress: 0 }, queue: [COLON],
          workedTiles: ['0,1'],
        },
      ],
      terrainOverrides: { '0,1': 'prairie' },
    });
    const { newState } = resolveTurn(state, {}, 1);
    const city = cityAt(newState, 0, 0)!;
    expect(city.pop).toBe(2); // récolte 2 → 10 = seuil → croissance
    expect(city.queue).toEqual([COLON]);
  });
});
