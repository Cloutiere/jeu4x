/**
 * LOBBY-5 (fix CI 26/09) — la génération libre à 5 spawns ne doit JAMAIS
 * échouer sur une graine : tolérance d'équidistance évolutive (2 premières
 * tentatives au calibrage 🔶 8, puis +3 par tentative). MONDE CYLINDRIQUE
 * (CARTE-RONDE T1) : les distances wrap créent de VRAIS opposés — l'écart
 * pairwise plafonne désormais à 8 + 27 = 35 (re-baseline D4).
 * Balayage déterministe de graines : même entrée → même carte (rejeu OK).
 */
import { describe, expect, it } from 'vitest';
import { generateProceduralMap } from '../src/index.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => 0x5eed0000 + i * 7919);

describe('progen · tolérance évolutive à 5 spawns', () => {
  it('40 graines successives : aucune génération ne jette, spawns 5, écart ≤ 35 (cylindre)', { timeout: 180_000 }, () => {
    for (const seed of SEEDS) {
      const { map, report } = generateProceduralMap(seed, { playerCount: 5 });
      expect(map.spawns).toHaveLength(5);
      expect(report.multi).toBeDefined();
      expect(report.multi!.pairSpread).toBeLessThanOrEqual(35);
    }
  });

  it('déterminisme : même seed → même rapport (attempts et pairSpread)', { timeout: 60_000 }, () => {
    const a = generateProceduralMap(SEEDS[0]!, { playerCount: 5 });
    const b = generateProceduralMap(SEEDS[0]!, { playerCount: 5 });
    expect(b.report.attempts).toBe(a.report.attempts);
    expect(b.report.multi!.pairSpread).toBe(a.report.multi!.pairSpread);
  });
});
