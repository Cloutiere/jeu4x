/**
 * unites3d — pont entre l'état FILTRÉ du moteur et le calque `unites` des
 * structures 3D (chantier V2-unités3D). Module PARTAGÉ labo/jeu (comme
 * `rendement.ts`) : Lab3d.svelte et GameCanvas.svelte l'appellent — zéro
 * logique d'assemblage dupliquée, miroir exact du rendu 2D (unités visibles
 * seulement, embarquées non rendues R-117, fog 3 états).
 *
 * Le mapping type moteur → modèle 3D est DATA-DRIVEN (`visuel3d.json`
 * §structures.unites3d, catalogue de l'atelier d'Erik) : un type SANS modèle
 * garde son sprite billboard 2D — cette fonction ne le passe PAS au calque.
 */
import { tileKeyOf } from '@game/rules';
import type { GameState, Hex } from '@game/rules';
import { entreeUnite3DDe, gabaritUnite3D } from './spec3d.js';
import type { EntiteStructure } from './structures3d.js';

/** Animation de playback (miroir structurel de MoveAnim — découplage pixi.js). */
export interface AnimUnite {
  from: Hex;
  to: Hex;
  /** Progression [0..1]. */
  t: number;
}

/** Source d'assemblage : l'état filtré + la vision du spectateur. */
export interface SourceUnites {
  state: GameState;
  /** Cases actuellement VISIBLES (fog : hors vision = pas de rendu, miroir 2D). */
  visible: Set<string>;
  /** Interpolation du playback par unité (null = position statique). */
  moveOf?: (unitId: string) => AnimUnite | null;
}

/**
 * Une unité moteur a-t-elle un modèle 3D (gabarit procédural OU .glb) ?
 * (miroir du calibrage : c'est le catalogue qui pilote — sprite billboard sinon.)
 * `owner` optionnel : la surcharge par propriétaire (T4bis) peut donner un
 * modèle à une unité SANS entrée par type — le sprite doit alors être masqué.
 */
export function aModele3D(type: string, owner?: string): boolean {
  return entreeUnite3DDe(owner, type) !== null;
}

/** Entrée du calque .glb (session T3, fonderie) — miroir structurel des
 *  entrées procédurales : mêmes filtres (R-117 embarquées, fog 3 états),
 *  même interpolation de playback ; le rendu est fait par `unitesglb.ts`. */
export interface UniteGLBEntree {
  id: string;
  q: number;
  r: number;
  fog: EntiteStructure['fog'];
  terrain?: string;
  owner?: string;
  /** Fichier du modèle (clé du catalogue — servie par `public/modeles/`). */
  glb: string;
  /** Facteur d'échelle du catalogue (défaut conservateur, calibrage à l'œil). */
  echelle: number;
  interpole?: { deQ: number; deR: number; deTerrain?: string; t: number };
}

/** Extraction partagée des filtres (R-117, fog, playback) entre les deux
 *  calques — pur, aucune invention : id, type, position, owner, interpolation.
 *  `rendu` décide quel calque prend l'unité (gabarit OU .glb — exclusifs) ;
 *  il reçoit aussi l'owner (surcharge data-driven par propriétaire, T4bis). */
function extraire<T>(src: SourceUnites, rendu: (type: string, owner: string) => boolean, construire: (u: { id: string; type: string; q: number; r: number; owner: string; fog: EntiteStructure['fog']; terrain?: string; anim: AnimUnite | null }) => T): T[] {
  const out: T[] = [];
  for (const unit of Object.values(src.state.units)) {
    // R-117 : une unité EMBARQUÉE n'est pas rendue (elle est dans le navire).
    if (unit.aboard) continue;
    if (!rendu(unit.type, unit.owner)) continue; // pas de modèle 3D : le sprite billboard reste le rendu
    const key = tileKeyOf(unit);
    if (!src.visible.has(key)) continue; // miroir 2D : hors vision = absent
    const fog: EntiteStructure['fog'] = 'visible';
    out.push(construire({
      id: unit.id,
      type: unit.type,
      q: unit.q,
      r: unit.r,
      owner: unit.owner,
      fog,
      terrain: src.state.map[key]?.terrain,
      anim: src.moveOf?.(unit.id) ?? null,
    }));
  }
  return out;
}

/**
 * Assemble les entrées `unites` PROCÉDURALES du planificateur (gabarits de
 * l'atelier) depuis l'état FILTRÉ. Pur : aucune invention.
 */
export function unitesStructures(src: SourceUnites): EntiteStructure[] {
  return extraire(src, (type) => gabaritUnite3D(type) !== null, ({ id, type, q, r, owner, terrain, anim }) => {
    const gab = gabaritUnite3D(type)!;
    const e: EntiteStructure = { id, q, r, fog: 'visible', terrain, owner, type: gab };
    if (anim) {
      e.interpole = {
        deQ: anim.from.q,
        deR: anim.from.r,
        deTerrain: src.state.map[tileKeyOf(anim.from)]?.terrain,
        t: anim.t,
      };
    }
    return e;
  });
}

/**
 * Assemble les entrées du calque .glb (fonderie T3) depuis l'état FILTRÉ.
 * Pur, miroir exact de `unitesStructures` — même fog, même playback.
 */
export function unitesGLBStructures(src: SourceUnites): UniteGLBEntree[] {
  return extraire(src, (type, owner) => entreeUnite3DDe(owner, type)?.kind === 'glb', ({ id, type, q, r, owner, terrain, anim }) => {
    const entree = entreeUnite3DDe(owner, type)!;
    if (entree.kind !== 'glb') throw new Error(`unites3d : « ${type} » (owner ${owner}) n'est pas une entrée .glb`);
    const e: UniteGLBEntree = { id, q, r, fog: 'visible', terrain, owner, glb: entree.glb, echelle: entree.echelle };
    if (anim) {
      e.interpole = {
        deQ: anim.from.q,
        deR: anim.from.r,
        deTerrain: src.state.map[tileKeyOf(anim.from)]?.terrain,
        t: anim.t,
      };
    }
    return e;
  });
}
