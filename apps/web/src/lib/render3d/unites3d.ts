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
import { gabaritUnite3D } from './spec3d.js';
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
 * Une unité moteur a-t-elle un modèle 3D ? (miroir du calibrage : c'est le
 * catalogue qui pilote — sprite billboard sinon.)
 */
export function aModele3D(type: string): boolean {
  return gabaritUnite3D(type) !== null;
}

/**
 * Assemble les entrées `unites` du planificateur depuis l'état FILTRÉ.
 * Pur : aucune invention — id, type (gabarit), q, r, owner, terrain, fog.
 */
export function unitesStructures(src: SourceUnites): EntiteStructure[] {
  const out: EntiteStructure[] = [];
  for (const unit of Object.values(src.state.units)) {
    // R-117 : une unité EMBARQUÉE n'est pas rendue (elle est dans le navire).
    if (unit.aboard) continue;
    const gab = gabaritUnite3D(unit.type);
    if (!gab) continue; // pas de modèle 3D : le sprite billboard reste le rendu
    const key = tileKeyOf(unit);
    if (!src.visible.has(key)) continue; // miroir 2D : hors vision = absent
    const anim = src.moveOf?.(unit.id) ?? null;
    const e: EntiteStructure = {
      id: unit.id,
      q: unit.q,
      r: unit.r,
      fog: src.visible.has(key) ? 'visible' : 'explored',
      terrain: src.state.map[key]?.terrain,
      owner: unit.owner,
      type: gab,
    };
    if (anim) {
      e.interpole = {
        deQ: anim.from.q,
        deR: anim.from.r,
        deTerrain: src.state.map[tileKeyOf(anim.from)]?.terrain,
        t: anim.t,
      };
    }
    out.push(e);
  }
  return out;
}
