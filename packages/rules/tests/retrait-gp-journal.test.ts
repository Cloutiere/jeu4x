import { expect, it } from 'vitest';
// NOTE : le journal archivé (dev-logs/captures-retrait-gp-accumulateurs/
// 03-journal-simulation-moteur-60-tours.txt) est généré à partir du même
// scénario — ce test porte l'INVARIANT (aucun canal science/production),
// sans IO (le paquet rules n'a pas de runtime node en typecheck).
import { makeState, resolveTurn } from '../src/index.js';

/**
 * RETRAIT-GP-ACCUMULATEURS · M3 — simulation moteur 60 tours à forte
 * production/science : AUCUN GP d'accumulateur (canal science/production) ;
 * canaux admissibles : culture / or (paliers) / combat / artefact.
 * Sorte le journal dans dev-logs/captures-retrait-gp-accumulateurs/.
 */
it('60 tours à forte économie : aucun GP de canal science/production — journal archivé', () => {
  const state = makeState({});
  state.players['p1']!.techsUnlocked = ['code_des_lois', 'rites_funeraires', 'monarchie', 'monnaie'];
  state.players['p2']!.techsUnlocked = ['code_des_lois', 'rites_funeraires', 'monarchie', 'monnaie'];

  const canaux: string[] = [];
  let s = state;
  for (let tour = 0; tour < 60 && s.winner === null; tour++) {
    const r = resolveTurn(s, {}, 1000 + tour);
    for (const e of r.events) {
      if (e.type === 'GreatPersonSpawned') {
        canaux.push(e.canal ?? '(sans)');
      }
    }
    s = r.newState;
  }
  const ADMIS = new Set(['culture', 'or', 'combat', 'artefact']);
  const illicites = canaux.filter((c) => !ADMIS.has(c));
  expect(illicites).toEqual([]);
  expect(s.turn).toBeGreaterThan(55);
});
