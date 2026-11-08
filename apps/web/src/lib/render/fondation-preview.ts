/**
 * FONDATION-PREVIEW (demande Erik 05/11) — décision PURE de la case de
 * fondation teintée à la couleur de la nation : quand un colon porte une
 * fondation (ordre FoundCity direct SUR PLACE, ou chemin programmé/gelé
 * R-158 dont l'action finale est `foundCity`), la case visée reçoit le
 * rendu du territoire culturel (texture radiale du dégradé, profil
 * smoothstep ZONE-CULTURELLE-DEGRADE) à une opacité d'aperçu — l'ordre se
 * VOIT, comme un futur territoire qui attend sa ville.
 *
 * Rendu PUR : tout dérive de l'aperçu et des ordres DÉJÀ calculés
 * (scenePreviews + scene.orders) — annulation, vente, mort et fondation
 * font tomber la case sans aucun état UI dédié (miroir du moteur, D3).
 * Jev et les bots en profitent automatiquement : le rendu est celui de la
 * case, jamais du joueur seul (les chemins gelés ennemis vivent dans
 * l'aperçu commun — visible seulement si la case est explorée).
 */
import type { Order, ProgramPreview, UnitId } from '@game/rules';
import { tileKeyOf } from '@game/rules';
import { CALIBRAGE_ZONE_CULTURELLE, profilAlpha } from './zone-culturelle.js';

/** Bloc de calibrage D1 — l'opacité d'aperçu est subjective, au labo À
 *  L'ŒIL (un chiffre, un commit data si veto). */
export const APERCU_FONDATION = {
  /** Opacité de la teinte d'aperçu sur la case visée. */
  fondationPreviewAlpha: 0.5,
  /** Diamètre du halo radial, en multiple du diamètre d'un hex (1.0 : la
   *  case seule — la pente smoothstep reste visible à l'intérieur, sans
   *  déborder sur les voisines). */
  haloTuiles: 1.0,
  /** Liseré de la case (trait hexagonal, couleur nation) — le langage du
   *  liseré culturel / possession de ville, pour la lecture d'un coup d'œil. */
  alphaLisere: 0.85,
} as const;

export interface CaseFondation {
  key: string;
  q: number;
  r: number;
  /** La teinte suit la NATION du colon (même palette que son drapeau). */
  owner: string;
  unitId: UnitId;
}

export interface EntreesApercuFondation {
  /** Aperçu des programmes (previewPrograms — ordre posé ET chemin gelé). */
  previews: ProgramPreview[];
  /** Ordres brouillons du tour (l'ordre FoundCity direct y figure). */
  orders: Order[];
  /** Lecture unité (état filtré) — null si l'unité a disparu. */
  uniteDe: (id: UnitId) => { q: number; r: number; owner: string; type: string } | null;
}

/**
 * Les cases à teinter : (a) ordre `FoundCity` direct → la case COURANTE du
 * colon ; (b) action finale `foundCity` en fin de chemin → la DESTINATION.
 * Seul un COLON teinte (D2) ; une case visée par plusieurs colons n'est
 * teintée qu'UNE fois (gagnant déterministe : plus petit unitId — même
 * arbitrage que la dispute R-159).
 */
export function casesApercuFondation(opts: EntreesApercuFondation): CaseFondation[] {
  const parCase = new Map<string, CaseFondation>();
  const poser = (hex: { q: number; r: number }, owner: string, unitId: UnitId) => {
    const key = tileKeyOf(hex);
    const deja = parCase.get(key);
    if (deja && deja.unitId <= unitId) return;
    parCase.set(key, { key, q: hex.q, r: hex.r, owner, unitId });
  };
  for (const order of opts.orders) {
    if (order.type !== 'FoundCity') continue;
    const unit = opts.uniteDe(order.unitId);
    if (!unit || unit.type !== 'colon') continue;
    poser({ q: unit.q, r: unit.r }, unit.owner, order.unitId);
  }
  for (const p of opts.previews) {
    if (p.final !== 'foundCity' || !p.destination) continue;
    const unit = opts.uniteDe(p.unitId);
    if (!unit || unit.type !== 'colon') continue;
    poser(p.destination, p.owner, p.unitId);
  }
  return [...parCase.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Arrêts du dégradé radial de l'APERÇU : le MÊME profil smoothstep que le
 * territoire culturel (zone-culturelle.ts), lu en MIROIR — la zone
 * culturelle est maximale au liseré (bord) et décroît vers l'intérieur ;
 * pour UNE case d'aperçu, la teinte est maximale au CENTRE de la case (le
 * futur territoire naît là) et décroît smoothstep vers l'extérieur du
 * halo, jusqu'au plancher du voile (voile/alphaExt). Le profil reste le
 * seul générateur de forme ; la teinte du sprite porte l'opacité d'aperçu
 * (fondationPreviewAlpha), pleine dynamique.
 */
export function arretsCanvasApercu(
  cal: typeof CALIBRAGE_ZONE_CULTURELLE = CALIBRAGE_ZONE_CULTURELLE,
  pas = 0.02,
): Array<[number, number]> {
  const arrets: Array<[number, number]> = [];
  for (let t = 0; t <= 1 + 1e-9; t += pas) {
    arrets.push([Math.min(1, t), profilAlpha(1 - Math.min(1, t), cal) / cal.alphaExt]);
  }
  return arrets;
}
