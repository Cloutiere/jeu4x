import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * JEV-FUMEE-LOBBY · L1 — tests du port serveur du pipeline Jev v3 et de son
 * orchestration GameDO (budget/replis). Environnement Node PUR (comparaisons
 * avec les modules .mjs du harnais sableuse + fs — la config principale
 * utilise le pool Workers). Lancement :
 *   pnpm -C apps/server exec vitest run --config vitest.jev.config.ts
 */
// Les tests croisés importent les modules .mjs du harnais sableuse (HORS
// workspace — ses node_modules ne sont pas installés en CI) : l'alias
// réérit '@game/rules' vers la source du paquet, résolu partout.
export default defineConfig({
  resolve: {
    alias: {
      '@game/rules': fileURLToPath(new URL('../../packages/rules/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests-jev/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
