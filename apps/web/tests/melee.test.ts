/**
 * PLACEMENT-MELEE (demande d'Erik du 20/09, D1..D7) — tests du placement des
 * unités en mêlée :
 * 1. réducteur du contexte client (`reduceContexteMelee`) : côtés d'entrée
 *    dérivés des mouvements (6 directions), stabilisée à la création
 *    (pré-état single-occupée + `stabilized`), purges (Snapshot, morts,
 *    fin de mêlée) ;
 * 2. disposition pure (`dispositionMelee`) : stabilisée AU CENTRE au premier
 *    plan, centre vide si morte, une section par côté, empilement DERRIÈRE
 *    (ordre d'arrivée), mélange de nations dans une section, repli zones
 *    sans info, nation seule inchangée (D4).
 * États de test : fixtures de @game/rules (source unique).
 */
import { describe, expect, it } from 'vitest';
import { makeState } from '@game/rules';
import type { GameEvent, GameState } from '@game/rules';
import { contexteMeleeVide, coteDepuisMouvement, reduceContexteMelee } from '../src/lib/melee.js';
import type { ContexteMelee } from '../src/lib/melee.js';
import { dispositionMelee, dispositionsCohabitation, ECHELLE_PILE, ECHELLE_CENTRE } from '../src/lib/render/interaction.js';

// ---------------------------------------------------------------------------
// coteDepuisMouvement — les 6 directions axiales (pointy-top)
// ---------------------------------------------------------------------------
describe('coteDepuisMouvement — un côté par direction d\'entrée', () => {
  const cas: Array<[ papier: { q: number; r: number }, attendu: string ]> = [
    [{ q: -1, r: 0 }, 'O'],
    [{ q: 1, r: 0 }, 'E'],
    [{ q: 0, r: -1 }, 'NO'],
    [{ q: 1, r: -1 }, 'NE'],
    [{ q: -1, r: 1 }, 'SO'],
    [{ q: 0, r: 1 }, 'SE'],
  ];
  for (const [from, cote] of cas) {
    it(`${JSON.stringify(from)} → ${cote}`, () => {
      expect(coteDepuisMouvement(from, { q: 0, r: 0 })).toBe(cote);
    });
  }
  it('mouvement non voisin : null (repli zones)', () => {
    expect(coteDepuisMouvement({ q: 0, r: 0 }, { q: 3, r: 3 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reduceContexteMelee — mémoires client (D1/D3/D5)
// ---------------------------------------------------------------------------

/** Pré-état : la stabilisée s (p1) SEULE en (0,0) ; post : mêlée s + e (p2). */
function paireMelee(): { pre: GameState; post: GameState; events: GameEvent[] } {
  const pre = makeState({
    width: 8,
    height: 8,
    units: [{ id: 's', type: 'guerrier', owner: 'p1', q: 0, r: 0 }],
    cities: [],
  });
  pre.units['s']!.stabilized = true;
  const post = makeState({
    width: 8,
    height: 8,
    units: [
      { id: 's', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'e', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
    ],
    cities: [],
  });
  post.units['s']!.stabilized = false; // R-175/instabilité : perdu en mêlée
  const events: GameEvent[] = [
    { seq: 1, type: 'Move', unitId: 'e', owner: 'p2', from: { q: 1, r: 0 }, to: { q: 0, r: 0 } },
    { seq: 2, type: 'MeleeResolved', at: { q: 0, r: 0 }, participants: ['s', 'e'], results: [] },
  ];
  return { pre, post, events };
}

function turnResult(events: GameEvent[]): Parameters<typeof reduceContexteMelee>[1] {
  return { type: 'TurnResult', turn: 3, events, players: [] } as unknown as Parameters<typeof reduceContexteMelee>[1];
}

describe('reduceContexteMelee — stabilisée à la création + côtés d\'entrée', () => {
  it('la single-occupée stabilisée du pré-état devient la stabilisée de la mêlée ; l\'entrant prend son côté', () => {
    const { pre, post, events } = paireMelee();
    const ctx = reduceContexteMelee(contexteMeleeVide, turnResult(events), pre, post);
    expect(ctx.stabiliseeParCase.get('0,0')).toBe('s');
    expect(ctx.coteParUnite.get('e')).toEqual({ cote: 'E', ordre: 1 });
  });

  it('D1 — sans mouvement ce tour-ci : le dernier côté connu persiste', () => {
    const { pre, post, events } = paireMelee();
    const ctx1 = reduceContexteMelee(contexteMeleeVide, turnResult(events), pre, post);
    // Tour suivant : e reste en (0,0), aucun Move.
    const ctx2 = reduceContexteMelee(ctx1, turnResult([]), post, structuredClone(post));
    expect(ctx2.coteParUnite.get('e')).toEqual({ cote: 'E', ordre: 1 });
    // Le centre reste occupé par la même stabilisée pendant toute la mêlée.
    expect(ctx2.stabiliseeParCase.get('0,0')).toBe('s');
  });

  it('D3 — la stabilisée meurt : centre vide (entrée retirée de la mémoire)', () => {
    const { pre, post, events } = paireMelee();
    const ctx1 = reduceContexteMelee(contexteMeleeVide, turnResult(events), pre, post);
    const post2 = structuredClone(post);
    delete post2.units['s'];
    const events2: GameEvent[] = [
      { seq: 3, type: 'UnitDestroyed', unitId: 's', owner: 'p1', cause: 'melee' } as GameEvent,
    ];
    const ctx2 = reduceContexteMelee(ctx1, turnResult(events2), post, post2);
    expect(ctx2.stabiliseeParCase.has('0,0')).toBe(false);
    expect(ctx2.coteParUnite.has('s')).toBe(false);
  });

  it('purge au Snapshot (reconnexion → repli zones, D1/D5)', () => {
    const { pre, post, events } = paireMelee();
    const ctx1 = reduceContexteMelee(contexteMeleeVide, turnResult(events), pre, post);
    const ctx2 = reduceContexteMelee(ctx1, { type: 'Snapshot' } as Parameters<typeof reduceContexteMelee>[1], null, null);
    expect(ctx2).toEqual(contexteMeleeVide);
  });

  it('une case pré-occupée par PLUSIEURS unités (pas de création) n\'a pas de stabilisée', () => {
    const pre = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'a', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'b', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      ],
      cities: [],
    });
    pre.units['a']!.stabilized = true;
    const post = makeState({
      width: 8,
      height: 8,
      units: [
        { id: 'a', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'b', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
        { id: 'e', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      ],
      cities: [],
    });
    const events: GameEvent[] = [
      { seq: 1, type: 'Move', unitId: 'e', owner: 'p2', from: { q: 0, r: 1 }, to: { q: 0, r: 0 } },
    ];
    const ctx = reduceContexteMelee(contexteMeleeVide, turnResult(events), pre, post);
    expect(ctx.stabiliseeParCase.has('0,0')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dispositionMelee — poses (D1..D4, D7)
// ---------------------------------------------------------------------------

const CTX: ContexteMelee = {
  coteParUnite: new Map([
    ['e1', { cote: 'E', ordre: 1 }],
    ['e2', { cote: 'E', ordre: 5 }],
    ['o1', { cote: 'O', ordre: 3 }],
  ]),
  stabiliseeParCase: new Map([['0,0', 's']]),
};

describe('dispositionMelee — côté d\'entrée + stabilisée au centre', () => {
  it('la stabilisée est AU CENTRE au CRAN INTERMÉDIAIRE, premier plan absolu (Erik 21/09)', () => {
    const poses = dispositionMelee(
      [
        { id: 's', owner: 'p1' },
        { id: 'e1', owner: 'p2' },
      ],
      '0,0',
      CTX,
    );
    expect(poses.get('s')!.echelle).toBe(ECHELLE_CENTRE);
    expect(poses.get('s')!.echelle).toBeGreaterThan(ECHELLE_PILE); // entre pile et pleine grandeur
    expect(poses.get('s')!.echelle).toBeLessThan(1);
    expect(poses.get('s')!.z).toBe(1);
  });

  it('chaque unité est posée sur son côté d\'entrée ; sections à nations MÊLÉES (D4/D7)', () => {
    const poses = dispositionMelee(
      [
        { id: 's', owner: 'p1' },
        { id: 'e1', owner: 'p2' },
        { id: 'e2', owner: 'p2' },
        { id: 'o1', owner: 'p3' },
      ],
      '0,0',
      CTX,
    );
    // o1 (p3) et e1 (p2) : côtés opposés, nationalités sans effet.
    expect(poses.get('e1')!.dx).toBeGreaterThan(0);
    expect(poses.get('o1')!.dx).toBeLessThan(0);
    expect(poses.get('o1')!.dy).toBe(0);
  });

  it('D2 — empilement DERRIÈRE : le premier arrivé est au bord au premier plan, la suivante derrière en escalier', () => {
    const poses = dispositionMelee(
      [
        { id: 'e1', owner: 'p2' },
        { id: 'e2', owner: 'p2' },
      ],
      '0,0',
      CTX,
    );
    expect(poses.get('e1')!.z).toBe(0);
    expect(poses.get('e2')!.z).toBeLessThan(poses.get('e1')!.z);
    // e2 est arrivée APRÈS (ordre 5 > 1) : escalier derrière e1.
    expect(poses.get('e2')!.dx).toBeGreaterThan(poses.get('e1')!.dx);
    expect(poses.get('e2')!.dy).toBeLessThan(poses.get('e1')!.dy);
  });

  it('D3 — stabilisée morte : personne ne prend SA place (centre resté vide)', () => {
    // Deux unités, ex-centrale absente : e1 (est) et o1 (ouest) — aucun dx nul.
    const poses = dispositionMelee(
      [
        { id: 'e1', owner: 'p2' },
        { id: 'o1', owner: 'p3' },
      ],
      '0,0',
      CTX,
    );
    expect(poses.get('e1')!.dx).toBeGreaterThan(0);
    expect(poses.get('o1')!.dx).toBeLessThan(0);
  });

  it('D1 — sans info de côté : repli zones (ancien remplissage, paquets par nation triée)', () => {
    const poses = dispositionMelee(
      [
        { id: 'x1', owner: 'p2' },
        { id: 'x2', owner: 'p1' },
      ],
      '0,0',
      contexteMeleeVide,
    );
    // Nations triées : p1 → zone gauche, p2 → zone droite (miroir ancien).
    expect(poses.get('x2')!.dx).toBeLessThan(0);
    expect(poses.get('x1')!.dx).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// dispositionsCohabitation — routage mêlée / amie (D4)
// ---------------------------------------------------------------------------

describe('dispositionsCohabitation — routage par régime de la case', () => {
  function etat(units: Array<{ id: string; type: string; owner: string; q: number; r: number }>): GameState {
    return makeState({ width: 8, height: 8, units, cities: [] });
  }

  it('rév. 21/09 — pile amie (1 nation) : même régime que la mêlée (côtés ou repli zones)', () => {
    const state = etat([
      { id: 'e1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'e2', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'o1', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
    ]);
    // Côtés connus : chaque unité sur son côté, la pile amie comme une mêlée.
    const poses = dispositionsCohabitation(state, new Map(), CTX);
    expect(poses.get('e1')!.dx).toBeGreaterThan(0);
    expect(poses.get('e2')!.dx).toBeGreaterThan(poses.get('e1')!.dx); // 2e arrivée derrière
    expect(poses.get('o1')!.dx).toBeLessThan(0);
    // Sans aucune info (reconnexion) : repli zones, paquet unique centré au bord gauche.
    const repli = dispositionsCohabitation(state, new Map(), null);
    for (const p of repli.values()) expect(p.dx).toBeLessThan(0);
  });

  it('rév. 21/09 cor. — unité SEULE sur sa case : TOUJOURS centrée, pleine grandeur', () => {
    // Même avec un côté d'entrée mémorisé : jamais de décentrement solitaire.
    const poses = dispositionMelee([{ id: 'e1', owner: 'p2' }], '0,0', CTX);
    expect(poses.get('e1')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 });
  });

  it('rév. 21/09 cor. — ex-centrale seule sur la case : centrée pleine grandeur', () => {
    const poses = dispositionMelee([{ id: 's', owner: 'p1' }], '0,0', CTX);
    expect(poses.get('s')).toEqual({ dx: 0, dy: 0, echelle: 1, z: 0 });
  });

  it('mêlée avec contexte : le côté d\'entrée prime sur le groupement par nation', () => {
    const state = etat([
      { id: 'e1', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      { id: 'o1', type: 'guerrier', owner: 'p3', q: 0, r: 0 },
    ]);
    const poses = dispositionsCohabitation(state, new Map(), CTX);
    expect(poses.get('e1')!.dx).toBeGreaterThan(0); // entré par l'est
    expect(poses.get('o1')!.dx).toBeLessThan(0); // entré par l'ouest
  });

  it('mêlée SANS contexte (démarrage, reconnexion) : repli = ancien groupement par nation', () => {
    const state = etat([
      { id: 'u1', type: 'guerrier', owner: 'p2', q: 0, r: 0 },
      { id: 'u2', type: 'guerrier', owner: 'p1', q: 0, r: 0 },
      { id: 'u3', type: 'colon', owner: 'p1', q: 0, r: 0 },
    ]);
    const poses = dispositionsCohabitation(state, new Map(), null);
    expect(poses.get('u2')!.dx).toBeLessThan(0); // p1 à gauche (ancien schéma)
    expect(poses.get('u1')!.dx).toBeGreaterThan(0);
  });
});
