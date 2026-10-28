import { defineConfig } from 'vitest/config';

/**
 * JEV-FUMEE-LOBBY · L1 — tests du port serveur du pipeline Jev v3 et de son
 * orchestration GameDO (budget/replis). Environnement Node PUR (comparaisons
 * avec les modules .mjs du harnais sableuse + fs — la config principale
 * utilise le pool Workers). Lancement :
 *   pnpm -C apps/server exec vitest run --config vitest.jev.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-jev/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
