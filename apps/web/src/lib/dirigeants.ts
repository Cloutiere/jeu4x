/**
 * UI-JEU-T1 · D4 — portrait de dirigeant (demande d'Erik du 01/10).
 * Les civs avec un dirigeant dessiné (DIRIGEANTS livrés 14/09) utilisent
 * l'asset médaillon ; les autres retombent sur le LOGO OR de la nation
 * (nations.ts — les logoEchelle existants font foi). Jamais de trou : la
 * fonction renvoie toujours une image et un libellé.
 */
import { civLeader } from './labels.js';
import { nationDe } from './nations.js';

/** Civs avec un portrait de dirigeant dessiné (public/art/dirigeant_*.png). */
const PORTRAITS: Record<string, string> = {
  france: '/art/dirigeant_napoleon.png',
  grece: '/art/dirigeant_alexandre.png',
  egypte: '/art/dirigeant_cleopatre.png',
};

export interface PortraitDirigeant {
  /** Image du médaillon (portrait dessiné ou logo or de nation). */
  src: string | null;
  /** Taille d'affichage relative (logoEchelle de la nation, sinon 1). */
  echelle: number;
  /** true si c'est un portrait dessiné (cadrage médaillon plein). */
  portrait: boolean;
  /** Tooltip : nom du dirigeant (+ civ). */
  titre: string;
}

export function portraitDirigeant(civId: string | null | undefined): PortraitDirigeant {
  const leader = civLeader(civId);
  const portrait = civId ? PORTRAITS[civId] : undefined;
  if (portrait) {
    return { src: portrait, echelle: 1, portrait: true, titre: leader };
  }
  const nation = nationDe(civId);
  return {
    src: nation?.logo ?? null,
    echelle: nation?.logoEchelle ?? 1,
    portrait: false,
    titre: leader,
  };
}
