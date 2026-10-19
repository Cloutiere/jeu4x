/**
 * CARAVANE (décisions Erik 19/10, HANDOFF-CARAVANE) — commerce forfaitaire
 * entre nations. Fonctions PURES : montants, facteur d'ère, prédicat. L'effet
 * moteur (paiement, événement `CaravanDelivered`, consommation) vit dans
 * `livrerCaravane` (turn.ts) — kill/emit sont internes à la résolution.
 *
 *  - D1 : entrer sur la case d'une ville ÉTRANGÈRE (toute autre nation,
 *    défenseur en place compris) = livraison AUTOMATIQUE : livreur +80 × mult,
 *    hôte +50 × mult, la Caravane est CONSOMMÉE. Aucune capture possible à la
 *    livraison (l'unité disparaît, jamais de cohabitation R-30).
 *  - D2 : facteur d'ère CARAVANE (economy.json `caravane.eraFactors`, base
 *    Ancienne = 1 — 🔶 table DISTINCTE de la table rush R-135, lue jamais
 *    modifiée) ; ère de référence = celle du LIVREUR ; arrondi au plus proche,
 *    les deux montants indépendamment.
 *  - D3 (amendement R-43) : une caravane CAPTURÉE en guerre rapporte au
 *    capteur 80 × facteur de l'Ère du PROPRIÉTAIRE de la caravane ; le
 *    propriétaire ne reçoit RIEN (appliqué dans capturePeaceful, turn.ts).
 *  - D5 : le trait espagnol `caravanesPlus50` reste INACTIF (dossier séparé).
 *  - D7 : événement `CaravanDelivered` — fog standard (livreur et hôte
 *    référencés : les deux voient leur transaction 🔶, tiers selon vision).
 */
import { ECONOMY } from './economyOr.js';
import type { CaravaneData } from './economyOr.js';
import type { GameState, PlayerId, Unit } from './state.js';
import type { TechEra } from './types.js';

export const CARAVANE: CaravaneData = ECONOMY.caravane;

/** D1 : l'unité est-elle une Caravane ? */
export function isCaravane(unit: Unit): boolean {
  return unit.type === 'caravane';
}

/** D2 : facteur d'ère de la caravane (données economy.json). */
export function facteurCaravane(era: TechEra): number {
  return CARAVANE.eraFactors[era] ?? 1;
}

/** D2 : montants de livraison (arrondi au plus proche, indépendants) —
 *  ère de référence = celle du LIVREUR. */
export function montantsLivraison(eraLivreur: TechEra): { livreur: number; hote: number } {
  const f = facteurCaravane(eraLivreur);
  return {
    livreur: Math.round(CARAVANE.livreurOr * f),
    hote: Math.round(CARAVANE.hoteOr * f),
  };
}

/** D3 : montant capté par l'ennemi qui capture une caravane en guerre —
 *  ère du PROPRIÉTAIRE de la caravane. */
export function montantCapture(state: GameState, owner: PlayerId): number {
  const era = state.players[owner]?.era ?? 'ancienne';
  return Math.round(CARAVANE.captureOr * facteurCaravane(era));
}
