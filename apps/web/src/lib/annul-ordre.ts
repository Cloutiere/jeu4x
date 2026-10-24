/**
 * ANNUL-CHEMIN (Erik 24/10, D1) — libellé contextuel du bouton d'annulation
 * pour les ordres PERSISTANTS portés par unit.order : chemin gelé (R-158),
 * soin (Heal), vigilance (Sleep). `null` si l'unité ne porte rien
 * d'annulable par ce canal — les ordres du jour seuls gardent le libellé
 * générique « Annuler l'ordre » côté panneau. Zéro règle : le libellé est de
 * l'affichage, l'annulation reste le CancelOrder existant (D3).
 */
import type { Order } from '@game/shared';

export function libelleAnnulationOrdre(order: Order | null | undefined): string | null {
  switch (order?.type) {
    case 'Move':
    case 'MultiStep':
      return 'Annuler le chemin';
    case 'Heal':
      return 'Annuler le soin';
    case 'Sleep':
      return 'Annuler la vigilance';
    default:
      return null;
  }
}
