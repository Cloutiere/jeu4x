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
      {
        find: /.*apps[\/\\]server[\/\\]src[\/\\]bancBotTd\.js$/,
        replacement: resolve(racine, '../apps/server/src/bancBotTd.ts'),
      },
      {
        find: /.*apps[\/\\]server[\/\\]src[\/\\]bancObservation\.js$/,
        replacement: resolve(racine, '../apps/server/src/bancObservation.ts'),
      },
    ],
  },
  server: { fs: { allow: [resolve(racine, '..')] } },
});
