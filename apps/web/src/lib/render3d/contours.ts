/**
 * contours — géométrie PURE des contours posés sur le relief (TRAVAIL-VILLE-3D).
 *
 * Aucune dépendance Three.js : ces fonctions produisent des polylignes en px
 * moteur (mêmes coordonnées que `hexToPixel`), chaque sommet portant
 * l'élévation de SA tuile — le consommateur (2D ou 3D) decide du rendu.
 * Testées unitairement (rayon quelconque — l'aqueduc étendra le rayon plus tard).
 */
import { hexDistance, hexToPixel } from '@game/rules';
import type { Hex } from '@game/rules';

/** Point d'un contour : px moteur + élévation de la tuile porteuse. */
export interface PointContour {
  x: number;
  y: number;
  elev: number;
}

/** Sommets d'un hexagone pointy-top (angles 30° + 60°i — même convention que
 *  world3d/PixiJS), centre en px moteur, rayon `r` px. */
function sommetsHex(centreX: number, centreY: number, r: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180;
    pts.push([centreX + r * Math.cos(a), centreY + r * Math.sin(a)]);
  }
  return pts;
}

/** Contour hexagonal d'UNE tuile (anneau intérieur des cases travaillées) :
 *  boucle fermée de 6 sommets à l'élévation de la tuile. */
export function contourHexTile(hex: Hex, size: number, inset: number, elev: number): PointContour[] {
  const c = hexToPixel(hex, size);
  return sommetsHex(c.x, c.y, size - inset).map(([x, y]) => ({ x, y, elev }));
}

/**
 * Contour EXTÉRIEUR d'une région hexagonale (rayon de cultivation) — générique
 * pour un rayon quelconque : on collecte les arêtes de l'anneau GÉOMÉTRIQUE
 * (distance ≤ rayon, case centrale incluse) qui bordent une case hors du
 * rayon, puis on les chaîne en boucle(s) fermée(s) par suivi de bord.
 * `elevationDe` est appelée pour TOUTES les tuiles de l'anneau : l'appelant
 * retourne l'élévation connue, ou 0 sous le fog (aucun terrain révélé — la
 * portion masquée reste une simple ligne).
 */
export function contourRegion(
  centre: Hex,
  rayon: number,
  size: number,
  elevationDe: (hex: Hex) => number,
): PointContour[][] {
  // Tuiles de l'anneau (itération axiale bornée par le rayon).
  const tuiles: Hex[] = [];
  for (let dq = -rayon; dq <= rayon; dq++) {
    for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
      tuiles.push({ q: centre.q + dq, r: centre.r + dr });
    }
  }
  // Arêtes de frontière : pour chaque tuile, les 6 arêtes (sommet i → i+1)
  // dont le voisin en face n'appartient PAS à la région. Le voisin en face de
  // l'arête i (sommets aux angles 30+60i et 30+60(i+1)) est le voisin axial
  // d'angle 60(i+1) : E, SE, SW, W, NW, NE (y écran vers le bas).
  const VOISIN_PAR_ARRETE: Array<[number, number]> = [
    [0, 1], // arête 0 (30°→90°, normale 60°) : SE
    [-1, 1], // arête 1 (90°→150°, normale 120°) : SW
    [-1, 0], // arête 2 (150°→210°, normale 180°) : W
    [0, -1], // arête 3 (210°→270°, normale 240°) : NW
    [1, -1], // arête 4 (270°→330°, normale 300°) : NE
    [1, 0], // arête 5 (330°→30°, normale 0°) : E
  ];
  // Arrondi NUMÉRIQUE (pas toFixed) : toFixed produit "-0.000" ≠ "0.000",
  // ce qui casserait le chaînage des coins sur l'axe.
  const clef = (p: { x: number; y: number }): string => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  interface Arete { a: PointContour; b: PointContour }
  const parSommet = new Map<string, { arete: Arete; extremite: 'a' | 'b' }[]>();
  const ajouter = (p: PointContour, arete: Arete, extremite: 'a' | 'b'): void => {
    const k = clef(p);
    const liste = parSommet.get(k) ?? [];
    liste.push({ arete, extremite });
    parSommet.set(k, liste);
  };
  for (const tuile of tuiles) {
    const c = hexToPixel(tuile, size);
    const sommets = sommetsHex(c.x, c.y, size);
    const elev = elevationDe(tuile);
    for (let i = 0; i < 6; i++) {
      const [dq, dr] = VOISIN_PAR_ARRETE[i]!;
      const voisin = { q: tuile.q + dq, r: tuile.r + dr };
      // Frontière GÉOMÉTRIQUE : le voisin est-il dans le rayon théorique ?
      // (pas « dans la carte » — sinon, rayon entièrement exploré, aucune
      // arête n'est frontière et le contour disparaît.)
      if (dansRayonTravail(centre, voisin, rayon)) continue;
      const [x1, y1] = sommets[i]!;
      const [x2, y2] = sommets[(i + 1) % 6]!;
      const arete: Arete = { a: { x: x1, y: y1, elev }, b: { x: x2, y: y2, elev } };
      ajouter(arete.a, arete, 'a');
      ajouter(arete.b, arete, 'b');
    }
  }
  // Chaînage par suivi de bord : à chaque sommet, on prend l'arête suivante
  // au tournant LE PLUS SERRÉ (wall-follower) — indispensable quand une case
  // du rayon est absente (fog) : les coins de « pincement » portent alors 3
  // arêtes de frontière, et un chaînage naïf ne referme pas la boucle.
  const vues = new Set<Arete>();
  const boucles: PointContour[][] = [];
  for (const liste of parSommet.values()) {
    for (const depart of liste) {
      if (vues.has(depart.arete)) continue;
      const boucle: PointContour[] = [depart.arete.a, depart.arete.b];
      vues.add(depart.arete);
      let point = depart.arete.b;
      while (true) {
        const candidats = (parSommet.get(clef(point)) ?? []).filter((e) => !vues.has(e.arete));
        if (candidats.length === 0) break;
        // Tournant signé (repère écran, y vers le bas) depuis la direction
        // d'arrivée ; le plus négatif = le plus à droite = on longe la région.
        const arrivee = boucle[boucle.length - 2]!;
        const vx = point.x - arrivee.x, vy = point.y - arrivee.y;
        let meilleure = candidats[0]!;
        let meilleurAngle = Infinity;
        for (const cand of candidats) {
          const sortie = cand.extremite === 'a' ? cand.arete.b : cand.arete.a;
          const wx = sortie.x - point.x, wy = sortie.y - point.y;
          const angle = Math.atan2(vx * wy - vy * wx, vx * wx + vy * wy);
          if (angle < meilleurAngle) { meilleurAngle = angle; meilleure = cand; }
        }
        vues.add(meilleure.arete);
        point = meilleure.extremite === 'a' ? meilleure.arete.b : meilleure.arete.a;
        boucle.push(point);
        if (clef(point) === clef(boucle[0]!)) break;
      }
      if (boucle.length > 3 && clef(boucle[0]!) === clef(boucle[boucle.length - 1]!)) {
        boucles.push(boucle);
      }
    }
  }
  return boucles;
}

/** Région de travail d'une ville (cases à distance ≤ rayon, case même incluse). */
export function dansRayonTravail(centre: Hex, hex: Hex, rayon: number): boolean {
  const d = hexDistance(centre, hex);
  return d >= 0 && d <= rayon;
}
