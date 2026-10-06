/**
 * REGIMES-MODALE (handoff 05/10, D1-D5) — logique PURE de la modale
 * « Nouveaux régimes » montrée à la complétion d'une tech de gouvernement
 * (R-122 : adoption SANS anarchie pendant le tour qui suit). Aucun état
 * nouveau : tout se lit sur `techsUnlockedThisTurn` / `techsUnlocked` /
 * `anarchyUntil` — le même état moteur que le moteur lit déjà.
 * Client seul, R-122 intouchée.
 */
import {
  GOVERNMENTS,
  DEFAULT_GOVERNMENT,
  anarchyFreeAdoption,
  civAnarchyImmunity,
  isInAnarchy,
  type Player,
} from '@game/rules';
import { imageTech } from './techtree.js';

/** D5 · icône d'un régime : image cuite TECHTREE de sa tech, repli générique
 *  or (icone_gouvernement) pour le Despotisme (art Erik 🔶 plus tard). */
export function iconeRegime(governmentId: string): string {
  const tech = GOVERNMENTS[governmentId]?.tech;
  if (!tech) return '/art/icone_gouvernement.png';
  const src = imageTech(tech);
  return src.endsWith('icone_science.png') ? '/art/icone_gouvernement.png' : src;
}

/** Les régimes DÉBLOQUÉS CETTE TOUR (fenêtre R-122) — ids de gouvernements. */
export function regimesDebloquesCeTour(player: Player | null): string[] {
  if (!player) return [];
  const fresh = player.techsUnlockedThisTurn ?? [];
  return Object.values(GOVERNMENTS)
    .filter((g) => g.tech && fresh.includes(g.tech))
    .map((g) => g.id);
}

/** D3 · la fenêtre « sans anarchie » est-elle ouverte ce tour ? */
export function fenetreRegimeActive(player: Player | null): boolean {
  return regimesDebloquesCeTour(player).length > 0;
}

export type EtatRegime = 'actif' | 'gratuit' | 'payant' | 'verrouille';

export interface LigneRegime {
  id: string;
  nom: string;
  icone: string;
  etat: EtatRegime;
  effet: string;
  penalite: string | null;
  /** Libellé du coût affiché (« Coût : 1 tour d'anarchie ») — JAMAIS montré
   *  pour un joueur immunisé (D4, R-149) ni pour une bascule gratuite. */
  coutAnarchie: string | null;
  /** R-149 : transitions toujours sans anarchie (Chine/Inde/Japon selon ère). */
  immunite: boolean;
}

/** D1 · les 6 régimes avec leur état selon l'état moteur + la fenêtre. */
export function lignesRegimes(
  player: Player | null,
  opts: { hasPyramid: boolean; turn: number },
): LigneRegime[] {
  if (!player) return [];
  const unlocked = player.techsUnlocked ?? [];
  const current = player.government ?? DEFAULT_GOVERNMENT;
  const immune = civAnarchyImmunity(player);
  return Object.values(GOVERNMENTS).map((g) => {
    const techOk = !g.tech || unlocked.includes(g.tech);
    const disponible = (techOk || opts.hasPyramid) && current !== g.id;
    let etat: EtatRegime;
    if (current === g.id) etat = 'actif';
    else if (!disponible) etat = 'verrouille';
    else if (anarchyFreeAdoption(player, g.id) || immune) etat = 'gratuit';
    else etat = 'payant';
    return {
      id: g.id,
      nom: g.name,
      icone: iconeRegime(g.id),
      etat,
      effet: g.effectLabel,
      penalite: g.penaltyLabel,
      coutAnarchie: etat === 'payant' ? 'Coût : 1 tour d’anarchie' : null,
      immunite: immune && etat === 'gratuit' && !anarchyFreeAdoption(player, g.id),
    };
  });
}

/** D2 · refus pendant une anarchie en cours (miroir du refus moteur R-122). */
export function refusAnarchie(player: Player | null, turn: number): string | null {
  if (player && isInAnarchy(player, turn)) {
    return 'Changement impossible pendant l’Anarchie (R-122).';
  }
  return null;
}
