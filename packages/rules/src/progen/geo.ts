/**
 * Phase 6b L0 — Couche GÉOPHYSIQUE (d'après le PDF d'Erik, mis à l'échelle).
 *
 * Pipeline (PDF §1-3, allégé — 1v1 sur 40×40 : pas de tectonique Voronoï) :
 *  1. bruit fractal seedé → altitude 0..100 ;
 *  2. lignes de rift simples qui ABAISSENT l'altitude (PDF §rifts : forcer des
 *     mers séparatrices) — appliquées AVANT le seuillage ;
 *  3. seuillage par percentile → le ratio terre/eau est exactement la cible
 *     (borner le ratio par seuillage, pas par retouche après coup) ;
 *  4. climat latitudinal (PDF §TerrainGenerator) : bande équatoriale sèche →
 *     désert, latitudes tempérées humides → prairie/forêt, gradient modulé
 *     par l'altitude ; le bruit d'humidité secondaire du PDF remplace
 *     l'ombre pluviométrique 🔶 (plus simple, symétrique après miroir) ;
 *  5. reliefs secondaires (PDF §3/§FeatureGenerator) : masques de bruit pour
 *     montagnes/collines, forêts sur terrains humides tempérés/froids.
 *
 * PAS de rivières : le moteur n'a pas d'eau douce (hors périmètre, handoff L0-5).
 *
 * La couche ne connaît RIEN du miroir (contrainte architecturale du handoff) :
 * elle produit une grille `width × height` de terrains complète ; la
 * stratégie de placement (`mirror1v1` aujourd'hui, `regionalMulti` demain)
 * demande les dimensions qu'elle veut — et, via `openBottom`, quel bord ne
 * doit PAS recevoir l'océan de bordure (une stratégie qui découpe la grille
 * le long d'un bord ouvert garde une terre continue à travers sa frontière).
 */
import type { TerrainId } from '../types.js';
import type { SeededRng } from '../rng.js';
import { createNoise2d } from './noise.js';
import type { ProgenSettings } from './settings.js';

/** Résultat de la couche géophysique : terrains + champs de debug (altitude,
 *  humidité — affichés par le labo #/progen, inutilisés par le moteur). */
export interface PhysicalMap {
  width: number;
  height: number;
  /** `terrain[row][col]` (disposition rectangulaire — hex.ts). */
  terrain: TerrainId[][];
  altitude: number[][];
  humidity: number[][];
}

/** Options de composition demandées par la stratégie. */
export interface GeoOptions {
  /** Ne pas appliquer l'océan de bordure au bord BAS de la grille
   *  (frontière de découpage de la stratégie — ex. axe de miroir). */
  openBottom: boolean;
}

const smoothstep = (t: number): number => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Humidité latitudinale « physique » (champ de debug du labo) : équateur
 *  sec, températures humides, léger déclin vers les pôles. */
function latitudeHumidity(distEq: number): number {
  if (distEq < 0.12) return 0.05;
  if (distEq < 0.35) return 0.05 + ((distEq - 0.12) / 0.23) * 0.75;
  return Math.max(0.55, 0.8 - (distEq - 0.35) * 0.7);
}

/**
 * Génère la géophysique d'une grille width × height.
 * Pur, déterministe : (rng, settings, width, height) → même résultat bit à bit.
 */
export function generateTerrain(
  rng: SeededRng,
  settings: ProgenSettings,
  width: number,
  height: number,
  options?: Partial<GeoOptions>,
): PhysicalMap {
  const openBottom = options?.openBottom ?? false;
  // Sous-graines dérivées du RNG de la tentative : chaque champ a son bruit.
  const seedAlt = rng.nextInt(0xffffffff);
  const seedHum = rng.nextInt(0xffffffff);
  const seedMtn = rng.nextInt(0xffffffff);
  const seedHill = rng.nextInt(0xffffffff);
  const seedRift = rng.nextInt(0xffffffff);
  const nAlt = createNoise2d(seedAlt);
  const nHum = createNoise2d(seedHum);
  const nMtn = createNoise2d(seedMtn);
  const nHill = createNoise2d(seedHill);
  const nRift = createNoise2d(seedRift);

  // --- Axes de rift ---------------------------------------------------------
  // Chaque axe : base (rangée), amplitude d'ondulation, profondeur, étendue
  // [colStart, colEnd]. Posés en coordonnées de grille : symétriques après
  // miroir car appliqués à la grille que la stratégie reflète.
  interface Rift {
    baseRow: number;
    amplitude: number;
    depth: number;
    colStart: number;
    colEnd: number;
    /** Colonne d'isthme (continents=2) : le rift l'épargne pour garantir une
     *  jonction terrestre entre les deux masses. */
    gapCol?: number;
  }
  const rifts: Rift[] = [];
  if (settings.continents === 2) {
    // Deux continents : un SEUL rift traversant, posé sur le bas de grille
    // (la stratégie miroir le reflète de l'autre côté) avec un isthme : le
    // col `width/2 - 1` reste hors de portée du rift pour garantir une
    // jonction terrestre entre les deux masses.
    rifts.push({
      baseRow: height - 1.5,
      amplitude: 2.5,
      depth: 70,
      colStart: 0,
      colEnd: width - 1,
      gapCol: Math.floor(width / 2) - 1,
    });
  } else {
    // Pangée : 1-2 rifts courts (mers intérieures) — position/étendue tirées
    // du RNG, jamais sur les bords (les océans de bordure suffisent).
    // Profondeur/étendue modérées : une mer INTÉRIEURE, pas une coupure qui
    // scinde la pangée (la connexité des spawns doit rester possible).
    const count = Math.max(1, settings.rifts);
    for (let i = 0; i < count; i++) {
      const baseRow = height * (0.3 + 0.4 * rng.next());
      const length = width * (0.22 + 0.2 * rng.next());
      const colStart = rng.next() * (width - length);
      rifts.push({ baseRow, amplitude: 1.5, depth: 32, colStart, colEnd: colStart + length });
    }
  }

  const altitudeOf = (col: number, row: number): number => {
    // Fréquence de base ~3 périodes sur la largeur : des MASSES larges et
    // cohérentes (une fréquence trop haute pulvérise la terre en îlots et
    // empêche la connexité des spawns).
    const x = col * 0.08;
    const y = row * 0.08;
    let alt = nAlt.fbm(x, y) * 100;
    // Océan de bordure : l'altitude décroît vers les bords (PDF §Continents),
    // SAUF le bord bas ouvert (frontière de découpage de la stratégie).
    const edge = openBottom
      ? Math.min(col, width - 1 - col, row)
      : Math.min(col, width - 1 - col, row, height - 1 - row);
    const falloff = 0.3 + 0.7 * smoothstep((edge - 1) / 3.5);
    alt *= falloff;
    // Rifts : abaissement gaussien autour de l'axe ondulé.
    for (const r of rifts) {
      if (col < r.colStart || col > r.colEnd) continue;
      if (r.gapCol !== undefined && Math.abs(col - r.gapCol) <= 1) continue; // isthme
      const axisRow = r.baseRow + (nRift.fbm(col * 0.15, 7.7) - 0.5) * 2 * r.amplitude;
      const d = Math.abs(row - axisRow);
      alt -= r.depth * Math.exp(-(d * d) / (2 * 1.4 * 1.4));
    }
    return alt;
  };

  // Seuillage par percentile : exactement `landRatio` de cases terrestres
  // (hors retouches), calé sur les altitudes calculées ci-dessus.
  const alts: number[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) alts.push(altitudeOf(col, row));
  }
  const sorted = [...alts].sort((a, b) => a - b);
  const landCount = Math.round(settings.landRatio * width * height);
  const seaLevel = sorted[Math.min(sorted.length - 1, Math.max(0, sorted.length - landCount))]!;

  const terrain: TerrainId[][] = [];
  const altitude: number[][] = [];
  const humidity: number[][] = [];
  const mountainThreshold = 0.8 - 0.3 * settings.mountainDensity;
  const hillThreshold = 0.78 - 0.28 * settings.hillDensity;
  const forestThreshold = 0.72 - 0.28 * settings.forestDensity;

  for (let row = 0; row < height; row++) {
    const terrRow: TerrainId[] = [];
    const altRow: number[] = [];
    const humRow: number[] = [];
    for (let col = 0; col < width; col++) {
      const alt = alts[row * width + col]!;
      altRow.push(alt);
      const distEq = Math.abs(row / (height - 1) - 0.5) * 2;
      // Humidité compositée (champ de debug du labo) ; les SEUILS de terrain,
      // eux, portent sur le bruit d'humidité brut + le curseur global.
      humRow.push(
        Math.min(
          1,
          Math.max(0, 0.18 + latitudeHumidity(distEq) + (nHum.fbm(col * 0.11, row * 0.11) - 0.5) * 0.55),
        ),
      );
      if (alt < seaLevel) {
        terrRow.push('eau');
        continue;
      }
      const mNoise = nMtn.fbm(col * 0.16, row * 0.16);
      const hNoise = nHill.fbm(col * 0.19, row * 0.19);
      const humNoise = Math.min(
        1,
        Math.max(0, nHum.fbm(col * 0.11, row * 0.11) + (settings.humidity - 0.5) * 0.6),
      );
      // Température : décroît avec la latitude ET l'altitude (PDF §TerrainGenerator).
      const temp = Math.min(
        1,
        Math.max(0, 1 - distEq * 0.85 - (Math.max(0, alt - 60) / 40) * 0.3),
      );
      if (mNoise > mountainThreshold || alt > 88) {
        terrRow.push('montagne');
      } else if (hNoise > hillThreshold) {
        terrRow.push('colline');
      } else if (temp < 0.32) {
        // froid (pôles / haute altitude) : forêt boréale humide, sinon collines
        terrRow.push(humNoise > 0.45 ? 'foret' : 'colline');
      } else if (distEq < 0.18 && humNoise < 0.5) {
        // bande équatoriale sèche (PDF : désert sous les tropiques)
        terrRow.push('desert');
      } else if (humNoise > forestThreshold) {
        // PDF §FeatureGenerator : forêts sur zones tempérées humides
        terrRow.push('foret');
      } else if (humNoise > 0.32) {
        terrRow.push('prairie');
      } else {
        terrRow.push('plaine');
      }
    }
    terrain.push(terrRow);
    altitude.push(altRow);
    humidity.push(humRow);
  }

  // Isthme garanti (continents=2) : les deux cases du pont en demi-carte sont
  // forcées praticables — leur miroir complète la jonction à travers le rift
  // ((col 19, rows 18-19) + images (col 20, rows 20-21) : adjacences exactes).
  if (settings.continents === 2) {
    const gap = Math.floor(width / 2) - 1;
    for (const row of [height - 1, height - 2]) {
      const t = terrain[row]![gap]!;
      if (t === 'eau' || t === 'montagne') terrain[row]![gap] = 'plaine';
    }
  }

  return { width, height, terrain, altitude, humidity };
}
