/**
 * VUE-VILLE-PERF (27/09) — pièces pures du correctif de performance de la
 * vue ville : le pool des Text de rendement (D4b). Le blindage du ticker
 * (D2) et la sortie des rebuilds des frames d'animation (D3) vivent dans la
 * boucle du composant GameCanvas — vérifiés en GUI par injection
 * (`__game.injectTickError`) et par le journal `__game.perf` (voir
 * dev-logs/perf-vue-ville et REPORT-VUE-VILLE-PERF.md).
 */
import { describe, expect, it } from 'vitest';
import { cleTexteRendement, PoolParCle } from '../src/lib/render/pool-textes.js';

describe('cleTexteRendement — clé de cache texte+style (D4b)', () => {
  it('même texte ⇒ même clé ; texte différent ⇒ clé différente', () => {
    expect(cleTexteRendement('3')).toBe(cleTexteRendement('3'));
    expect(cleTexteRendement('3')).not.toBe(cleTexteRendement('4'));
  });

  it('deux styles ne partagent jamais une clé (le contrat est texte+style)', () => {
    expect(cleTexteRendement('3', 'a')).not.toBe(cleTexteRendement('3', 'b'));
  });
});

describe('PoolParCle — réutilisation des Text de rendement (D4b)', () => {
  it('acquerir crée une fois par clé ; relacher puis acquerir réutilise la MÊME instance', () => {
    let creees = 0;
    const detruites: string[] = [];
    const pool = new PoolParCle<string>(
      () => `objet-${++creees}`,
      (o) => detruites.push(o),
    );
    const a = pool.acquerir('3');
    expect(a).toBe('objet-1');
    pool.relacher(a, '3');
    expect(pool.acquerir('3')).toBe('objet-1'); // réutilisé, pas de re-création
    expect(creees).toBe(1);
    expect(detruites).toEqual([]);
  });

  it('acquisitions simultanées de la même clé créent des instances DISTINCTES (une par position à l\'écran)', () => {
    let creees = 0;
    const pool = new PoolParCle<string>(() => `o${++creees}`, () => {});
    const a = pool.acquerir('2');
    const b = pool.acquerir('2');
    expect(a).not.toBe(b);
  });

  it('capacité par clé : les excédents relâchés sont détruits, pas empilés', () => {
    let creees = 0;
    const detruites: string[] = [];
    const pool = new PoolParCle<string>(() => `o${++creees}`, (o) => detruites.push(o), 2);
    const objets = [pool.acquerir('1'), pool.acquerir('1'), pool.acquerir('1')];
    for (const o of objets) pool.relacher(o, '1');
    expect(pool.tailleLibre).toBe(2); // capacité 2
    expect(detruites).toEqual(['o3']); // le relâché excédentaire (pile pleine) est détruit
  });

  it('purger détruit tous les libres et vide le pool (démontage)', () => {
    const detruites: string[] = [];
    let creees = 0;
    const pool = new PoolParCle<string>(() => `o${++creees}`, (o) => detruites.push(o));
    const a = pool.acquerir('7');
    const b = pool.acquerir('9');
    pool.relacher(a, '7');
    pool.relacher(b, '9');
    expect(pool.tailleLibre).toBe(2);
    pool.purger();
    expect(pool.tailleLibre).toBe(0);
    expect(detruites).toEqual([a, b]);
    // Les vivants ne sont PAS touchés par la purge (à la charge de la scène).
    const vivant = pool.acquerir('1');
    expect(detruites).not.toContain(vivant);
  });

  it('relacher un objet jamais acquis est ignoré (pas de pollution du pool)', () => {
    const pool = new PoolParCle<string>(() => 'cree', () => {});
    pool.relacher('fantome', '5');
    expect(pool.tailleLibre).toBe(0);
  });
});
