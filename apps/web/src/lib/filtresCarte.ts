/**
 * UI-JEU-T3 · D4 — filtres/décorations de la carte (panneau au-dessus de la
 * minimap, façon Civ VI). Bascules persistées par MACHINE (localStorage,
 * même idiome que le calque dev) :
 *  - `rendements` : 0 masqué → 1 affiché → 2 affiché sans villes/armées
 *    (les 3 états du bouton « Rendements » du calque dev, qui DISPARAÎT —
 *    migration D4, la fonction est inchangée) ;
 *  - `ressources` : art des tuiles-ressources révélées affiché ou non
 *    (off = tuile de base à l'affichage — gameplay/fog intouchés) ;
 *  - `replie` : panneau + minimap repliés (chevron, mémorisé — D5).
 * Structure data-driven : de futurs filtres s'ajoutent à la liste sans
 * changer le panneau (contenu futur — périmètre interdit au-delà de ces deux).
 */
import { writable } from 'svelte/store';

const CLE = 'filtres-carte';

export interface FiltresCarte {
  rendements: 0 | 1 | 2;
  ressources: boolean;
  replie: boolean;
}

const DEFAUT: FiltresCarte = { rendements: 0, ressources: true, replie: false };

/** Relecture défensive d'un état mémorisé (JSON corrompu/valeurs illégales → défauts). */
export function lireFiltres(brut: string | null): FiltresCarte {
  if (!brut) return { ...DEFAUT };
  try {
    const lu = JSON.parse(brut) as Partial<FiltresCarte>;
    return {
      rendements: lu.rendements === 1 || lu.rendements === 2 ? lu.rendements : 0,
      ressources: lu.ressources !== false,
      replie: lu.replie === true,
    };
  } catch {
    return { ...DEFAUT };
  }
}

function initial(): FiltresCarte {
  if (typeof localStorage === 'undefined') return { ...DEFAUT };
  return lireFiltres(localStorage.getItem(CLE));
}

function persister(v: FiltresCarte): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(CLE, JSON.stringify(v));
}

/** Filtres de la carte (défauts : rendements masqués, ressources affichées, panneau ouvert). */
export const filtresCarte = writable<FiltresCarte>(initial());

/** Cycle des rendements : 0 masqué → 1 affiché → 2 sans villes/armées → 0 (Phase 7b). */
export function cycleRendements(): void {
  filtresCarte.update((f) => {
    const suivant = { ...f, rendements: (((f.rendements + 1) % 3) as 0 | 1 | 2) };
    persister(suivant);
    return suivant;
  });
}

/** Art des ressources révélées : affiché ↔ tuile de base (affichage seul). */
export function basculerRessources(): void {
  filtresCarte.update((f) => {
    const suivant = { ...f, ressources: !f.ressources };
    persister(suivant);
    return suivant;
  });
}

/** Repli du bloc minimap + panneau (chevron — D5, mémorisé). */
export function basculerRepli(): void {
  filtresCarte.update((f) => {
    const suivant = { ...f, replie: !f.replie };
    persister(suivant);
    return suivant;
  });
}
