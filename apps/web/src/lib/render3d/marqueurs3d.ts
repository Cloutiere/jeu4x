/**
 * marqueurs3d — calque Three.js des contours de la ville (TRAVAIL-VILLE-3D) :
 * cadres des cases travaillées et rayon de cultivation, en VRAIE 3D —
 * polylignes posées sur le relief (chaque sommet à l'élévation de sa tuile),
 * épaisseur constante EN PIXELS à tous les zooms (LineMaterial écran-espace).
 *
 * Convention des effets existants : couleur joueur, alpha transparent,
 * depthWrite désactivé, renderOrder au-dessus du terrain. Le fog est géré EN
 * AMONT (l'appelant ne fournit que des cases explorées — jamais d'invention).
 */
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { PointContour } from './contours.js';

/** Échelle monde : 1 unité 3D = HEX_SIZE px moteur (miroir world3d). */
const HEX_SIZE = 64;
/** Surélévation au-dessus du plateau de la tuile (anti z-fighting). */
const SURELEVATION = 0.045;

/** Un contour à tracer : boucle de points (px moteur + élévation) + style. */
export interface ContourDef {
  points: PointContour[];
  color: number;
  /** Épaisseur en PIXELS ÉCRAN (constante au zoom). */
  largeur: number;
  alpha: number;
  /** CORRECTIFS-SELECTION : polyline OUVERTE (ligne de cheminement d'un
   *  ordre — pas de fermeture sur le premier sommet). */
  ouvert?: boolean;
}

export class Marqueurs3D {
  readonly group = new THREE.Group();
  private lignes: Line2[] = [];
  private resolution = new THREE.Vector2(800, 600);

  /** Remplace l'ensemble des contours (rebuild sur changement d'état/UI). */
  definir(contours: ContourDef[]): void {
    for (const ligne of this.lignes) {
      this.group.remove(ligne);
      ligne.geometry.dispose();
      (ligne.material as LineMaterial).dispose();
    }
    this.lignes = [];
    for ( const c of contours) {
      if (c.points.length < 2) continue;
      const geo = new LineGeometry();
      const flats: number[] = [];
      // Boucle fermée : la ligne referme sur le premier sommet — sauf polyline
      // OUVERTE (`ouvert`, ligne de cheminement d'un ordre).
      const boucle = c.ouvert ? c.points : [...c.points, c.points[0]!];
      for (const p of boucle) {
        flats.push(p.x / HEX_SIZE, p.elev + SURELEVATION, p.y / HEX_SIZE);
      }
      geo.setPositions(flats);
      const mat = new LineMaterial({
        color: c.color,
        linewidth: c.largeur,
        transparent: true,
        opacity: c.alpha,
        depthWrite: false,
        resolution: this.resolution,
      });
      const ligne = new Line2(geo, mat);
      ligne.computeLineDistances();
      ligne.renderOrder = 4;
      this.group.add(ligne);
      this.lignes.push(ligne);
    }
  }

  /** Taille viewport (px) — l'épaisseur écran des Line2 en dépend. */
  resize(largeur: number, hauteur: number): void {
    this.resolution.set(largeur, hauteur);
  }

  dispose(): void {
    this.definir([]);
  }
}
