import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /.*apps[\/\\]server[\/\\]src[\/\\]botPolicy\.js$/,
        replacement: resolve(racine, '../apps/server/src/botPolicy.ts'),
      },
    ],
  },
  server: { fs: { allow: [resolve(racine, '..')] } },
});
