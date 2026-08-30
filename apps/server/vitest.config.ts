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
        },
      },
    }),
  ],
  test: {
    testTimeout: 30_000,
  },
});
