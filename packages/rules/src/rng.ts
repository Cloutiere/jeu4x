/**
 * R-80 : RNG seedé obligatoire dans le moteur. Math.random() est interdit :
 * la résolution de tour doit pouvoir être rejouée à l'identique (crash-recovery).
 * Implémentation : mulberry32 (compacte, rapide, qualité suffisante pour du jeu).
 */
export interface SeededRng {
  /** Nombre dans [0, 1). Fait avancer la graine. */
  next(): number;
  /** Entier dans [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** État courant — à persister dans le GameState après la résolution. */
  readonly state: number;
}

export function createRng(seed: number): SeededRng {
  let s = seed >>> 0;
  return {
    next(): number {
      s = (s + 0x6d2b79f5) | 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextInt(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
    get state(): number {
      return s;
    },
  };
}
