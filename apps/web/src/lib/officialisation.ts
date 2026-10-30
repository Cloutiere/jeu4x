/**
 * OFFICIALISATION (Erik 30/10) — pur : logique du bouton « ✍ Officieliser… »
 * sur les bulles de Zii (HANDOFF-OFFICIALISATION · D1/D2).
 *
 * Zii ne propose JAMAIS d'accord (R-190) : l'intention perçue sert UNIQUEMENT
 * à afficher le bouton ; l'accord naît exclusivement dans la NegociationModale
 * (moteur + grille seedée, R-189 inchangé). Le clic est un pur événement
 * client (D4 — zéro storage, schemaVersion 28).
 */
import type { ChatMessageData } from '@game/shared';

/** Intentions qui déclenchent le bouton (D1). */
export const INTENTIONS_OFFICIELISABLES = ['demandePaix', 'offre'] as const;

export type SectionNegociation = 'paix' | 'techs';

/**
 * Le bouton apparaît-il sur cette bulle ? Oui ssi la bulle porte une
 * intention éligible POSÉE PAR LE SERVEUR (seule Zii la pose — un message
 * humain n'en porte jamais, donc le bouton ne naît que face à une nation
 * bot) et que l'auteur n'est pas moi-même.
 */
export function officielisable(m: ChatMessageData, monEngineId: string | null): boolean {
  if (m.auteur === monEngineId) return false;
  const intention = m.intentionPercue as (typeof INTENTIONS_OFFICIELISABLES)[number] | undefined;
  return !!intention && (INTENTIONS_OFFICIELISABLES as readonly string[]).includes(intention);
}

/**
 * Section de la NegociationModale à mettre en avant (D1) :
 *  - demandePaix EN GUERRE → « Proposer la paix » ;
 *  - demandePaix HORS guerre (paix déjà établie) → « Échanger des technologies » ;
 *  - offre → « Échanger des technologies ».
 */
export function sectionSuggeree(intention: string, enGuerre: boolean): SectionNegociation {
  if (intention === 'demandePaix' && enGuerre) return 'paix';
  return 'techs';
}
