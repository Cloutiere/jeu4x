/**
 * MENU-VILLE-RETOUCHES (retour d'Erik du 14/09) — choix de l'icône de
 * rendement commerce, décision PURE de rendu (aucun calcul moteur : l'état de
 * conversion R-90 de la ville reste la seule source de vérité, la même que le
 * bouton ⇄ de CityView).
 *
 * Vue ville : TOUTES les tuiles du rayon cultivable de la ville affichée
 * reflètent sa conversion (science → icône sciences, or → icône or), en temps
 * réel avec le bouton. Vue carte du monde : toujours l'icône commerce
 * (potentiel), quelle que soit la conversion.
 */
export type IconeCommerce = 'commerce' | 'or' | 'science';

export function iconeCommerceRendement(conversionVille: 'gold' | 'science' | null): IconeCommerce {
  if (conversionVille === 'science') return 'science';
  if (conversionVille === 'gold') return 'or';
  return 'commerce';
}
