/**
 * unitesglb — calque de rendu des modèles .glb de la FONDERIE (session T3,
 * 06/09) : les unités dont l'entrée du catalogue `visuel3d.json`
 * §structures.unites3d pointe un fichier (`{ glb, echelle }`) sont rendues
 * ici ; les gabarits procéduraux de l'atelier restent dans `structures3d.ts`
 * (un type SANS entrée garde son sprite billboard — régression impossible).
 *
 * Contrats (handoff FONDERIE-T3, M3) :
 *  - chargement UNE FOIS par fichier (cache ; géométries/matériaux partagés
 *    entre toutes les instances) ;
 *  - le matériau `accent_joueur` est CLONÉ par propriétaire (même sémantique
 *    que les variantes d'accent des sprites 2D) ; le néon #3DFFCE n'est
 *    JAMAIS teinté ;
 *  - LINES embarquées (arcs, traînées, projections au sol — 0 triangle dans
 *    les .glb) fusionnées par modèle et rendues par clone par instance ;
 *  - instancing par (modèle, partie, accent) : ~1 draw call par partie pour
 *    TOUTE l'armée d'un même type/owner — bench V1 non régressé.
 * Aucune logique de jeu : les entrées viennent de `unites3d.ts` (état FILTRÉ,
 * R-117 embarquées, fog — l'unité hors vision est absente, miroir 2D).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hexWorldPos, FOG_DIM, Pool } from './world3d.js';
import { TERRAINS3D } from './spec3d.js';
import type { UniteGLBEntree } from './unites3d.js';

/** Un .glb parsé : parties TRIANGLES (→ InstancedMesh) + lignes fusionnées. */
export interface ModeleGLB {
  /** Une entrée par primitive TRIANGLES du .glb (géométrie + matériau du
   *  fichier, PARTAGÉS — jamais mutés ici). */
  parties: Array<{ geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; accent: boolean }>;
  /** Toutes les primitives LINES fusionnées (arêtes néon, effets) — null si
   *  le modèle n'en embarque pas. */
  lignes: { geo: THREE.BufferGeometry; mat: THREE.LineBasicMaterial } | null;
}

const NOM_ACCENT = 'accent_joueur';

/**
 * Parse une scène glTF chargée en `ModeleGLB`. Exporté pour les tests (pur :
 * aucun fetch). Les primitives TRIANGLES sont FUSIONNÉES PAR MATÉRIAU : les
 * .glb de la fonderie portent ~60 primitives pour 3 matériaux — un pool par
 * primitive coûterait un draw call par pool et par armée ; fusionné, ~1 draw
 * call par matériau (et par owner pour l'accent), contrat STYLE-3D. Erreur
 * claire si le fichier ne contient AUCUNE géométrie — pas de fallback muet.
 */
export function parserModeleGLB(scene: THREE.Object3D): ModeleGLB {
  const brutes: Array<{ geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; accent: boolean }> = [];
  const geosLignes: THREE.BufferGeometry[] = [];
  let matLignes: THREE.LineBasicMaterial | null = null;
  scene.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (Array.isArray(mat)) throw new Error('unitesglb : matériau multi-passes non supporté dans un .glb de la fonderie');
      if (!mat.name) throw new Error('unitesglb : primitive .glb sans matériau nommé (la fonderie nomme tous ses matériaux)');
      brutes.push({ geo: mesh.geometry, mat, accent: mat.name === NOM_ACCENT });
    }
    const ligne = n as unknown as { isLineSegments?: boolean; isLine?: boolean; geometry: THREE.BufferGeometry; material: THREE.Material };
    if ((ligne.isLineSegments || ligne.isLine) && !mesh.isMesh) {
      geosLignes.push(ligne.geometry as THREE.BufferGeometry);
      matLignes = ligne.material as THREE.LineBasicMaterial;
    }
  });
  if (brutes.length === 0 && geosLignes.length === 0) {
    throw new Error('unitesglb : le fichier .glb ne contient aucune géométrie (fichier corrompu ou vide)');
  }
  // Fusion par matériau (uuid). Jeu d'attributs incompatible → parties
  // séparées (visuel identique, aucune perte silencieuse).
  const groupes = new Map<string, typeof brutes>();
  for (const p of brutes) {
    const g = groupes.get(p.mat.uuid);
    if (g) g.push(p); else groupes.set(p.mat.uuid, [p]);
  }
  const parties: ModeleGLB['parties'] = [];
  for (const g of groupes.values()) {
    if (g.length === 1) {
      parties.push(g[0]!);
      continue;
    }
    const fusion = mergeGeometries(g.map((p) => p.geo), false);
    if (!fusion) {
      parties.push(...g);
      continue;
    }
    parties.push({ geo: fusion, mat: g[0]!.mat, accent: g[0]!.accent });
  }
  let lignes: ModeleGLB['lignes'] = null;
  if (geosLignes.length > 0) {
    const fusion = geosLignes.length === 1 ? geosLignes[0]! : mergeGeometries(geosLignes, false);
    if (!fusion) throw new Error('unitesglb : fusion des primitives LINES impossible');
    lignes = { geo: fusion, mat: matLignes! };
  }
  return { parties, lignes };
}

/** Chemin servi par Vite/Cloudflare Pages (copie de `assets-src/modeles/`). */
export const DOSSIER_MODELES = 'modeles/';

/** Chargeur GLTF avec cache — UNE requête et UNE parse par fichier. */
export class ChargeurModelesGLB {
  private cache = new Map<string, Promise<ModeleGLB>>();
  private chargeur = new GLTFLoader();

  constructor(private dossier: string = DOSSIER_MODELES) {}

  /** Charge (ou rend du cache) le modèle. Erreur EXPLICITE si le fichier
   *  manque ou est invalide — jamais de fallback silencieux. */
  charger(fichier: string): Promise<ModeleGLB> {
    const enCache = this.cache.get(fichier);
    if (enCache) return enCache;
    const promesse = new Promise<ModeleGLB>((resolve, reject) => {
      this.chargeur.load(
        `${this.dossier}${fichier}`,
        (gltf) => {
          try {
            const modele = parserModeleGLB(gltf.scene);
            (promesse as unknown as { __resolu: boolean }).__resolu = true;
            resolve(modele);
          } catch (e) {
            reject(new Error(`unitesglb : .glb « ${fichier} » invalide — ${(e as Error).message}`));
          }
        },
        undefined,
        (err) => reject(new Error(`unitesglb : chargement IMPOSSIBLE du modèle « ${fichier} » (${this.dossier}${fichier}) — ${(err as Error).message ?? 'fichier manquant ou illisible'}`)),
      );
    });
    this.cache.set(fichier, promesse);
    return promesse;
  }

  /** Lance les chargements sans attendre (préchauffage au démarrage). */
  precharger(fichiers: Iterable<string>): void {
    for (const f of fichiers) void this.charger(f).catch(() => { /* l'erreur est reportée par update() via disponible() */ });
  }
}

const CAPACITE = 512;

interface PoolGLB { pool: Pool; }
/** Clés de pools : `<fichier>#<partie>` (matériau d'origine) ou
 *  `<fichier>#<partie>#<hex accent>` (matériau accent cloné par propriétaire). */
const clePool = (fichier: string, i: number, accent: number | null): string =>
  accent === null ? `${fichier}#${i}` : `${fichier}#${i}#${accent.toString(16)}`;

export interface UnitesGLBStats {
  /** Instances (unités) rendues au dernier update. */
  unites: number;
  /** Pools actifs (≈ draw calls des parties TRIANGLES) + clones de lignes. */
  pools: number;
  lignes: number;
  /** Modèles manquants (chargement en cours ou en échec) — visibles en dev. */
  manquants: string[];
}

/**
 * Monde des unités .glb : même architecture que `StructuresWorld` (pools
 * instanciés consommant des entrées planifiées), branché au groupe de la
 * scène à côté du monde des structures.
 */
export class UnitesGLBWorld {
  readonly group = new THREE.Group();
  readonly stats: UnitesGLBStats = { unites: 0, pools: 0, lignes: 0, manquants: [] };

  private pools = new Map<string, PoolGLB>();
  private clonesLignes: THREE.LineSegments[] = [];
  private materiauxClones: THREE.Material[] = [];
  private modeles = new Map<string, ModeleGLB>();
  private enCours = new Set<string>();
  private disposed = false;
  private tmpColor = new THREE.Color();
  private tmpMatrix = new THREE.Matrix4();

  constructor(
    private chargeur: ChargeurModelesGLB = new ChargeurModelesGLB(),
    /** Rappel après chaque chargement — le consommateur relance son update
     *  (les unités apparaissent dès que leur modèle est prêt). */
    private onCharge: (() => void) | null = null,
  ) {}

  /** Préchauffe les modèles du catalogue (appelé à l'init du monde). */
  precharger(fichiers: Iterable<string>): void {
    for (const f of fichiers) {
      if (this.modeles.has(f) || this.enCours.has(f)) continue;
      this.enCours.add(f);
      void this.chargeur.charger(f).then(
        (m) => {
          this.modeles.set(f, m);
          this.enCours.delete(f);
          this.onCharge?.();
        },
        () => this.enCours.delete(f), // erreur conservée par le chargeur
      );
    }
  }

  /** Le modèle est-il prêt ? (garde-fou testable — pas de rendu partiel muet) */
  disponible(fichier: string): boolean {
    return this.modeles.has(fichier);
  }

  /** Reconstruit les instances depuis les entrées de `unites3d.ts`. */
  update(entrees: UniteGLBEntree[], couleurDe: (owner: string) => number): void {
    if (this.disposed) return;
    for (const p of this.pools.values()) p.pool.used = 0;
    for (const c of this.clonesLignes) this.group.remove(c);
    this.clonesLignes = [];

    const manquants = new Set<string>();
    let unites = 0;
    let lignes = 0;

    for (const u of entrees) {
      const modele = this.modeles.get(u.glb);
      if (!modele) { manquants.add(u.glb); continue; }

      // Position + élévation (interpolation de playback identique à
      // planifierStructures : lerp position ET élévation entre deux cases).
      let { x, z } = hexWorldPos({ q: u.q, r: u.r });
      let elev = TERRAINS3D[u.terrain ?? '']?.elev ?? 0;
      if (u.interpole) {
        const it = u.interpole;
        const a = hexWorldPos({ q: it.deQ, r: it.deR });
        const b = hexWorldPos({ q: u.q, r: u.r });
        const elevA = TERRAINS3D[it.deTerrain ?? '']?.elev ?? elev;
        x = a.x + (b.x - a.x) * it.t;
        z = a.z + (b.z - a.z) * it.t;
        elev = elevA + (elev - elevA) * it.t;
      }
      const k = u.echelle;
      const fogClair = u.fog === 'visible' ? 0xffffff : FOG_DIM.getHex();
      const accentHex = couleurDe(u.owner ?? 'barbarien');
      const accentDim = u.fog === 'visible' ? accentHex : new THREE.Color(accentHex).multiply(FOG_DIM).getHex();
      this.tmpMatrix.makeScale(k, k, k).setPosition(x, elev, z);

      for (let i = 0; i < modele.parties.length; i++) {
        const p = modele.parties[i]!;
        // Teinte joueur : le matériau accent est CLONÉ par propriétaire (le
        // néon #3DFFCE est un AUTRE matériau du .glb — jamais touché) ;
        // l'instanceColor ne porte que l'atténuation de fog.
        const cle = clePool(u.glb, i, p.accent ? accentDim : null);
        let entry = this.pools.get(cle);
        if (!entry) {
          let mat = p.mat;
          if (p.accent) {
            mat = p.mat.clone();
            // Teinte MULTIPLICATIVE : le glb cuit un facteur de luminance dans
            // accent_joueur.color (6.6 — choix d'Erik, piège knight rapport
            // HABILLAGE-TRIPO #7) ; remplacer la couleur l'écraserait et le
            // corps repartirait sombre. Même comportement que fonderie/viewer.js.
            mat.color.copy(p.mat.color).multiply(new THREE.Color(accentDim));
            this.materiauxClones.push(mat);
          }
          entry = { pool: new Pool(p.geo, mat, CAPACITE, this.group) };
          this.pools.set(cle, entry);
        }
        entry.pool.push(this.tmpMatrix, this.tmpColor.set(fogClair));
      }

      // LINES (arêtes néon, effets — 0 triangle) : 1 clone par unité,
      // géométrie fusionnée partagée ; atténuation de fog par clone couleur.
      if (modele.lignes) {
        const mat = modele.lignes.mat.clone();
        if (u.fog !== 'visible') mat.color.multiply(FOG_DIM);
        this.materiauxClones.push(mat);
        const clone = new THREE.LineSegments(modele.lignes.geo, mat);
        clone.position.set(x, elev, z);
        clone.scale.setScalar(k);
        clone.frustumCulled = false;
        this.group.add(clone);
        this.clonesLignes.push(clone);
        lignes++;
      }
      unites++;
    }

    for (const p of this.pools.values()) p.pool.flush();
    this.stats.unites = unites;
    this.stats.pools = [...this.pools.values()].filter((p) => p.pool.used > 0).length;
    this.stats.lignes = lignes;
    this.stats.manquants = [...manquants].sort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.pools.values()) {
      this.group.remove(p.pool.mesh);
      p.pool.mesh.dispose();
    }
    this.pools.clear();
    for (const c of this.clonesLignes) this.group.remove(c);
    this.clonesLignes = [];
    for (const m of this.materiauxClones) m.dispose();
    this.materiauxClones = [];
  }
}
