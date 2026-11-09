/**
 * ORACLE-VERDICT (canon Erik 09/11, Chemin B) — D1 : le dérivé déterministe
 * par bataille. Les jets de combat MÊLÉE ne puisent plus le flux de
 * résolution (R-80) mais un hash de : graine du tour + attaquant + défenseur
 * + cases + numéro d'assaut. L'issue d'une bataille devient INDÉPENDANTE des
 * autres ordres du tour — donc calculable AVANT la résolution : l'Oracle de
 * Delphes révèle VICTOIRE/DÉFAITE (certain), jamais une probabilité.
 *
 * Propriétés exigées : pur (même entrées → même jet), déterministe (jamais
 * Math.random), sensible à chaque composante (deux batailles différentes =
 * issues indépendantes). Implémentation : FNV-1a 32 bits sur la clé — compacte,
 * rapide, qualité largement suffisante pour un jet de jeu.
 */

/** Jet de bataille mêlée ∈ [0,1) — dérivé, ne consomme AUCUN flux RNG. */
export function jetDeBataille(
  graineTour: number,
  attaquantId: string,
  defenseurId: string,
  caseAttaquant: string,
  caseDefenseur: string,
  assaut: number,
): number {
  const cle = `${graineTour >>> 0}|${attaquantId}|${defenseurId}|${caseAttaquant}|${caseDefenseur}|${assaut}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < cle.length; i++) {
    h ^= cle.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}
