/**
 * Géométrie des flèches de chemin (Phase 5.5 L1) — PURE et testée.
 *
 * Les flèches rendent un ordre de déplacement persistant : polygone de
 * segments case-centre → case-centre, avec une tête de flèche sur la case
 * de destination (le sens se lit d'un coup d'œil). Une variante pointillée
 * sert aux chemins GELÉS (ordre verrouillé restant d'un tour à l'autre).
 * Aucune dépendance PixiJS : les fonctions retournent des coordonnées monde.
 */
import { hexToPixel } from '@game/rules';
import type { Hex } from '@game/rules';

export interface Point {
  x: number;
  y: number;
}

/** Longueur d'un tiret et d'un trou (unités monde) pour les chemins gelés. */
export const DASH_LEN = 26;
export const DASH_GAP = 16;

/** Taille de la tête de flèche (unités monde). */
export const HEAD_SIZE = 30;

/**
 * Points d'ancrage du tracé : le centre de l'ORIGINE puis chaque étape du
 * chemin (le contrat SubmitOrder n'inclut pas l'origine — elle est passée à
 * part). Chaque segment [i, i+1] est un déplacement d'une case voisine.
 */
export function anchorPoints(origin: Hex, path: Hex[], size: number): Point[] {
  return [hexToPixel(origin, size), ...path.map((h) => hexToPixel(h, size))];
}

/**
 * Segments consécutifs entre points d'ancrage : un couple [départ, arrivée]
 * par déplacement. Path vide → aucun segment (pas de flèche à dessiner).
 */
export function segmentsOf(points: Point[]): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  for (let i = 0; i + 1 < points.length; i++) out.push([points[i]!, points[i + 1]!]);
  return out;
}

/** Angle (radians) d'un segment départ → arrivée. */
export function segmentAngle(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Triangle de tête de flèche pointé de `from` vers `to` (posé sur la case de
 * destination) : 3 sommets [pointe, base-gauche, base-droite].
 */
export function arrowHeadPoints(from: Point, to: Point, size = HEAD_SIZE): Point[] {
  const angle = segmentAngle(from, to);
  const tip = { x: to.x, y: to.y };
  const back = size * 0.72;
  const half = size * 0.5;
  return [
    tip,
    { x: to.x - back * Math.cos(angle) - half * Math.sin(angle), y: to.y - back * Math.sin(angle) + half * Math.cos(angle) },
    { x: to.x - back * Math.cos(angle) + half * Math.sin(angle), y: to.y - back * Math.sin(angle) - half * Math.cos(angle) },
  ];
}

/**
 * Sous-segments pointillés d'un segment [a, b] (chemin gelé). Le dernier
 * tiret est tronqué à la longueur restante ; un reste < moitié de tiret est
 * ignoré (le tracé ne se termine jamais par un point minuscule).
 */
export function dashSegments(a: Point, b: Point, dashLen = DASH_LEN, gapLen = DASH_GAP): Array<[Point, Point]> {
  const angle = segmentAngle(a, b);
  const total = Math.hypot(b.x - a.x, b.y - a.y);
  const out: Array<[Point, Point]> = [];
  let d = 0;
  while (d < total) {
    const end = Math.min(d + dashLen, total);
    // Un reste plus court qu'un demi-tiret est ignoré (pas de point
    // minuscule en bout de tracé) — sauf trait plus court qu'un tiret.
    if (end - d >= Math.min(dashLen / 2, total)) {
      out.push([
        { x: a.x + d * Math.cos(angle), y: a.y + d * Math.sin(angle) },
        { x: a.x + end * Math.cos(angle), y: a.y + end * Math.sin(angle) },
      ]);
    }
    d = end + gapLen;
  }
  return out;
}

/**
 * Géométrie complète d'une flèche de chemin. `dashed` (chemin gelé) segmente
 * chaque trait en tirets ; la tête reste pleine pour garder le sens lisible.
 */
export interface ArrowGeometry {
  lines: Array<[Point, Point]>;
  head: Point[] | null;
}

export function arrowGeometry(origin: Hex, path: Hex[], size: number, dashed = false): ArrowGeometry {
  const points = anchorPoints(origin, path, size);
  const segs = segmentsOf(points);
  if (segs.length === 0) return { lines: [], head: null };
  const [lastFrom, lastTo] = segs[segs.length - 1]!;
  return {
    lines: dashed ? segs.flatMap(([a, b]) => dashSegments(a, b)) : segs,
    head: arrowHeadPoints(lastFrom, lastTo),
  };
}
