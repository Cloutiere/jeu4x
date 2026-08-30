#!/usr/bin/env node
/**
 * Sync des assets réels : assets-src/exports/*.png → apps/web/public/art/.
 * (HANDOFF-PHASE3 L2 — les PNG doivent être inclus dans le build Pages.)
 * Usage : pnpm --filter @game/web sync-art
 */
import { mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../../assets-src/exports');
const dst = join(here, '../public/art');

mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (f.endsWith('.png')) {
    copyFileSync(join(src, f), join(dst, f));
    n += 1;
  }
}
console.log(`sync-art : ${n} fichier(s) copié(s) vers apps/web/public/art/`);
