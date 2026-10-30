import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

/**
 * Tests des Durable Objects via @cloudflare/vitest-pool-workers (L7).
 * La config Wrangler (DO + migrations) est lue depuis wrangler.jsonc ; les
 * secrets de test sont injectés par bindings Miniflare (jamais de vrai secret).
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          AUTH_SECRET: 'test-secret',
          ADMIN_TOKEN: 'test-admin-token',
          DEV_STUB_AUTH: '1',
          // ZII-GLM-VOIX / JEV : NE JAMAIS propager les clés réelles (.dev.vars)
          // dans les tests — FAUSSE LLM obligatoire (zéro appel réseau).
          // Chaîne vide = « clé absente » (falsy côté code).
          TYPESAFE_API_KEY: '',
          ZII_GLM_API_KEY: '',
          ZII_GLM_MODELE: '',
        },
      },
    }),
  ],
  test: {
    testTimeout: 30_000,
    // JEV-FUMEE-LOBBY / BOT-TD : bancs et ports en Node pur — configs dédiées
    // (vitest.jev.config.ts, vitest.banc.config.ts), jamais dans le pool Workers.
    exclude: ['**/node_modules/**', 'tests-banc/**', 'tests-jev/**'],
  },
});
