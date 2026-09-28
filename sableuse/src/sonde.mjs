#!/usr/bin/env node
/**
 * Sonde D2 (HANDOFF-JEV-POC) : un appel minimal (Choice triviale) pour
 * valider clé, endpoint, latence et coût réel. N'affiche JAMAIS la clé.
 *   npm run sonde
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TYPESAFE_API_KEY = readFileSync(join(racine, '.env.local'), 'utf8').match(/TYPESAFE_API_KEY=(.*)/)[1].trim();

const client = new TypeSafeClient({ model: 'jev-latest' });
const t0 = Date.now();
const r = await client.systemOne({
  state: { sonde: true, message: 'Appel de validation de la sableuse Eternal Empires.' },
  questions: {
    ok: choice('Le message transmis indique-t-il une sonde de validation ?', { oui: null, non: null }),
  },
});
const latence = Date.now() - t0;
const jetons = r.usage?.input_tokens ?? 0;
console.log(`SONDE OK — HTTP via SDK, latence ${latence} ms, ${jetons} jetons d'entrée, coût ≈ ${(jetons * 0.042 / 1_000_000).toFixed(6)} $`);
console.log('Réponse :', JSON.stringify(r.answers.ok));
