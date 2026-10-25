import { defineConfig } from 'vitest/config';

/**
 * BOT-TD — banc de calibrage (L3) : exécution du banc complet
 * (40 parties × 3 difficultés × 150 tours) HORS CI — environnement Node pur
 * (la config principale utilise le pool Workers, sans fs). Lancement :
 *   pnpm -C apps/server exec vitest run --config vitest.banc.config.ts
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests-banc/**/*.test.ts'],
    env: { BANC_BOT_TD: '1' },
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
});
