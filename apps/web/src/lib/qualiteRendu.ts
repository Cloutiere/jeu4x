/**
 * FULLSCREEN-PERF · L2 option (c) — « Qualité de rendu » (feu vert Erik 01/10).
 *
 * Plafond data-driven du DPR effectif de rendu (backing store = CSS × DPR) :
 * 'auto' = statu quo PLEIN-ECRAN-NET (le DPR réel est suivi, borne 4) ;
 * sinon 1 / 1,5 / 2 = plafond du DPR (l'image est agrandie par le navigateur
 * — compromis fluidité/netteté tranché EN JEU par Erik via le curseur du
 * calque dev, aucune perte tant qu'il reste sur 'auto').
 * Mémorisé par MACHINE (localStorage), comme le calque dev.
 */
import { writable } from 'svelte/store';

const CLE = 'qualite-rendu';

/** Positions du curseur. 'auto' par défaut — PLEIN-ECRAN-NET intact. */
export type QualiteRendu = 'auto' | 1 | 1.5 | 2;
export const QUALITES: QualiteRendu[] = ['auto', 1, 1.5, 2];

function initial(): QualiteRendu {
  if (typeof localStorage === 'undefined') return 'auto';
  return qualiteDepuisValeur(localStorage.getItem(CLE));
}

/** 'auto' = suivi du DPR réel (défaut) ; sinon plafond de DPR effectif. */
export const qualiteRendu = writable<QualiteRendu>(initial());

export function changerQualiteRendu(v: QualiteRendu): void {
  qualiteRendu.set(v);
  if (typeof localStorage !== 'undefined') localStorage.setItem(CLE, String(v));
}

/** Valeur brute (attribut DOM, localStorage) → QualiteRendu validée. */
export function qualiteDepuisValeur(brut: string | null): QualiteRendu {
  if (brut === 'auto') return 'auto';
  const n = Number(brut);
  return (QUALITES as unknown[]).includes(n) ? (n as QualiteRendu) : 'auto';
}

/**
 * DPR effectif de rendu : le DPR réel plafonné par le choix de qualité
 * ('auto' = borne 4, comportement PLEIN-ECRAN-NET inchangé). PUR, testé.
 */
export function dprEffectif(qualite: QualiteRendu, dprReel: number): number {
  const reel = dprReel || 1;
  if (qualite === 'auto') return Math.min(4, reel);
  return Math.min(qualite, reel);
}
