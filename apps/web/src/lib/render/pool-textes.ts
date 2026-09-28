/**
 * VUE-VILLE-PERF (D4b) — pool d'objets par clé, pour les Text de rendement.
 *
 * `rebuildOverlay` créait un `new Text` Pixi par ligne de rendement à chaque
 * rebuild (mesure + rastérisation à la première frame, garbage à chaque
 * passe). Le pool ACQUIERT un objet par clé (texte — le style est constant
 * par pool), le RELÂCHE au rebuild suivant et le réutilise tel quel : même
 * instance repositionnée, aucune re-création. Capacité bornée par clé (les
 * excédents sont détruits) et `purger()` pour le démontage (les Text libres
 * ne sont pas dans la scène : personne ne les détruirait sinon).
 *
 * Pur et testé sans Pixi : les objets sont créés/détruits par injection.
 */

/** Clé de pool d'un Text de rendement : texte + style. Le style étant une
 *  constante du pool (police/couleur/contour des rendements), la clé se
 *  réduit au texte ; les deux champs restent explicites pour documenter le
 *  contrat (deux styles ⇒ deux pools, jamais une même clé). */
export function cleTexteRendement(texte: string, style: string = 'rendement-15-blanc-gras'): string {
  return `${style}#${texte}`;
}

export class PoolParCle<T> {
  private libres = new Map<string, T[]>();
  private vivants = new Set<T>();

  constructor(
    private readonly creer: (cle: string) => T,
    private readonly detruire: (objet: T) => void,
    /** Bornes mémoire : au plus N objets libres par clé, les excédents sont détruits. 🔶 */
    private readonly capaciteParCle = 64,
  ) {}

  /** Récupère un objet pour la clé : réutilise un libre, sinon le crée. */
  acquerir(cle: string): T {
    const pile = this.libres.get(cle);
    const objet = pile && pile.length > 0 ? pile.pop()! : this.creer(cle);
    this.vivants.add(objet);
    return objet;
  }

  /** Rend un objet au pool (réutilisable à la prochaine acquisition de la clé).
   *  Au-delà de la capacité, l'objet est détruit. Un objet jamais acquis (ou
   *  déjà relâché) est ignoré — robustesse plutôt qu'exception. */
  relacher(objet: T, cle: string): void {
    if (!this.vivants.delete(objet)) return;
    const pile = this.libres.get(cle) ?? [];
    if (pile.length >= this.capaciteParCle) {
      this.detruire(objet);
      return;
    }
    pile.push(objet);
    this.libres.set(cle, pile);
  }

  /** Détruit TOUS les objets libres (démontage du canvas : les textures
   *  Pixi meurent avec le renderer, un Text libre survivant crasherait au
   *  remontage). Les vivants restent à la charge de l'appelant (scène). */
  purger(): void {
    for (const pile of this.libres.values()) {
      for (const objet of pile) this.detruire(objet);
    }
    this.libres.clear();
  }

  /** Objets libres actuellement détenus (sonde de vérification). */
  get tailleLibre(): number {
    let n = 0;
    for (const pile of this.libres.values()) n += pile.length;
    return n;
  }
}
