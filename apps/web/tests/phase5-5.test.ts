/**
 * Tests Phase 5.5 — polish visuel de la résolution :
 *  - L1 : géométrie des flèches de chemin persistantes (ancres, tête, tirets) ;
 *  - L2 : plan d'annonce de la relecture (lignes de tous les movers).
 */
import { describe, expect, it } from 'vitest';
import { arrowHeadPoints, anchorPoints, dashSegments, segmentsOf, HEAD_SIZE } from '../src/lib/render/arrows.js';
import { buildAnnounceLines, ANNOUNCE_MS } from '../src/lib/render/playback.js';
import type { GameEvent } from '@game/rules';

// ---------------------------------------------------------------------------
// L1 — flèches persistantes
// ---------------------------------------------------------------------------

describe('anchorPoints / segmentsOf', () => {
  it('retourne origine + chaque étape (ancres par segment)', () => {
    const pts = anchorPoints({ q: 0, r: 0 }, [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }], 64);
    expect(pts).toHaveLength(4);
    // Origine au centre monde (0,0) pour q=0,r=0 (pointy-top, taille 64).
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    // Les points avancent en x (axe q) de √3·size par colonne.
    expect(pts[1]!.x).toBeCloseTo(Math.sqrt(3) * 64, 6);
    expect(pts[2]!.x).toBeCloseTo(2 * Math.sqrt(3) * 64, 6);
  });

  it('segmentsOf : un couple [départ, arrivée] par déplacement', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const segs = segmentsOf(pts);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toEqual([pts[0], pts[1]]);
    expect(segs[1]).toEqual([pts[1], pts[2]]);
    expect(segmentsOf([{ x: 1, y: 1 }])).toHaveLength(0);
  });
});

describe('arrowHeadPoints', () => {
  it('la pointe est posée sur la destination et orientée vers elle', () => {
    const head = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(head[0]).toEqual({ x: 100, y: 0 }); // pointe = case de destination
    // Base de la tête en arrière de la pointe (x < 100), symétrique en y.
    expect(head[1]!.x).toBeLessThan(100);
    expect(head[2]!.x).toBeLessThan(100);
    expect(head[1]!.y).toBeGreaterThan(0);
    expect(head[2]!.y).toBeLessThan(0);
  });

  it('l\'orientation suit le segment (vers le haut → base sous la pointe)', () => {
    const head = arrowHeadPoints({ x: 0, y: 100 }, { x: 0, y: 0 });
    expect(head[0]).toEqual({ x: 0, y: 0 });
    expect(head[1]!.y).toBeGreaterThan(0);
    expect(head[2]!.y).toBeGreaterThan(0);
    expect(head[1]!.x).toBeGreaterThan(0);
    expect(head[2]!.x).toBeLessThan(0);
  });

  it('taille par défaut = HEAD_SIZE (envergure cohérente)', () => {
    const head = arrowHeadPoints({ x: 0, y: 0 }, { x: 0, y: -50 });
    const spread = Math.hypot(head[1]!.x - head[2]!.x, head[1]!.y - head[2]!.y);
    expect(spread).toBeCloseTo(HEAD_SIZE, 6);
  });
});

describe('dashSegments (chemins gelés)', () => {
  it('segmente un trait en tirets ≤ DASH et trous ≥ GAP, sans dépasser l\'arrivée', () => {
    const segs = dashSegments({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(segs.length).toBeGreaterThanOrEqual(2);
    let prevEnd = 0;
    for (const [a, b] of segs) {
      expect(a.y).toBe(0);
      expect(a.x).toBeGreaterThanOrEqual(prevEnd); // trou ≥ GAP entre tirets
      expect(b.x - a.x).toBeLessThanOrEqual(26);
      expect(b.x).toBeLessThanOrEqual(100);
      prevEnd = b.x;
    }
    // Le dernier tiret touche l'arrivée (tête de flèche raccordée).
    expect(prevEnd).toBe(100);
  });

  it('trait plus court qu\'un tiret : un seul tiret tronqué', () => {
    const segs = dashSegments({ x: 0, y: 0 }, { x: 12, y: 0 });
    expect(segs).toHaveLength(1);
    expect(segs[0]![1].x).toBe(12);
  });

  it('reste inférieur à un demi-tiret : ignoré (pas de point minuscule)', () => {
    // 26 (tiret) + 16 (trou) + 10 (reste < 13) → un seul tiret.
    const segs = dashSegments({ x: 0, y: 0 }, { x: 52, y: 0 }, 26, 16);
    expect(segs).toHaveLength(1);
    expect(segs[0]![1].x).toBe(26);
  });
});

// ---------------------------------------------------------------------------
// L2 — plan d'annonce de la relecture
// ---------------------------------------------------------------------------

let seq = 0;
function move(unitId: string, owner: string, from: { q: number; r: number }, to: { q: number; r: number }): GameEvent {
  return { seq: seq++, type: 'Move', unitId, owner, from, to };
}

describe('buildAnnounceLines (Phase 5.5 L2 — annonce de résolution)', () => {
  it('extrait une ligne par mover, y compris les ennemis (propriétaire conservé)', () => {
    const lines = buildAnnounceLines([
      move('u1', 'p1', { q: 0, r: 0 }, { q: 1, r: 0 }),
      move('u9', 'p2', { q: 5, r: 5 }, { q: 5, r: 4 }),
    ]);
    expect(lines).toEqual([
      { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, owner: 'p1' },
      { from: { q: 5, r: 5 }, to: { q: 5, r: 4 }, owner: 'p2' },
    ]);
  });

  it('fusionne les pas consécutifs d\'une même unité en une ligne from → to', () => {
    const lines = buildAnnounceLines([
      move('u1', 'p1', { q: 0, r: 0 }, { q: 1, r: 0 }),
      move('u1', 'p1', { q: 1, r: 0 }, { q: 2, r: 0 }),
      move('u1', 'p1', { q: 2, r: 0 }, { q: 3, r: 0 }),
    ]);
    expect(lines).toEqual([{ from: { q: 0, r: 0 }, to: { q: 3, r: 0 }, owner: 'p1' }]);
  });

  it('ignore les événements non-mouvement ; inclut les replis (Retreat)', () => {
    const events: GameEvent[] = [
      { seq: seq++, type: 'Attack', attackerId: 'u1', defenderId: 'u2', at: { q: 1, r: 1 } },
      move('u2', 'p2', { q: 1, r: 1 }, { q: 2, r: 1 }),
      { seq: seq++, type: 'Retreat', unitId: 'u2', owner: 'p2', from: { q: 2, r: 1 }, to: { q: 2, r: 2 } },
      { seq: seq++, type: 'TurnResolved', turn: 3 },
    ];
    const lines = buildAnnounceLines(events);
    expect(lines).toEqual([{ from: { q: 1, r: 1 }, to: { q: 2, r: 2 }, owner: 'p2' }]);
  });

  it('ordre de première apparition conservé (déterminisme du rendu)', () => {
    const lines = buildAnnounceLines([
      move('b', 'p2', { q: 9, r: 9 }, { q: 9, r: 8 }),
      move('a', 'p1', { q: 0, r: 0 }, { q: 0, r: 1 }),
      move('b', 'p2', { q: 9, r: 8 }, { q: 9, r: 7 }),
    ]);
    expect(lines.map((l) => l.from)).toEqual([{ q: 9, r: 9 }, { q: 0, r: 0 }]);
  });

  it('aucun mouvement → aucune annonce (constante de durée exposée)', () => {
    expect(buildAnnounceLines([{ seq: seq++, type: 'TurnResolved', turn: 1 }])).toEqual([]);
    expect(ANNOUNCE_MS).toBeGreaterThan(0);
  });
});
