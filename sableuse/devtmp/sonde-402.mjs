// SONDE 402 (HANDOFF-BANC-VANILLA L0) — un seul appel minimal (systemOne,
// même canal que le banc) pour vérifier que les crédits TypeSafe sont
// rechargés AVANT de lancer le banc long.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TYPESAFE_API_KEY = readFileSync(join(racine, '.env.local'), 'utf8').match(/TYPESAFE_API_KEY=(.*)/)[1].trim();
const { TypeSafeClient } = await import('@typesafe-ai/sdk');
const client = new TypeSafeClient({ model: 'jev-latest' });
try {
  const r = await client.systemOne({
    state: { tour: 1, joueurs: [{ id: 'p1', civId: 'neutre' }], villes: [], unites: [] },
    questions: { sonde: { type: 'noul', instructions: 'Réponds oui.' } },
  });
  console.log('SONDE OK — crédits disponibles :', JSON.stringify(r).slice(0, 200));
} catch (e) {
  console.error('SONDE ÉCHOUÉE :', e.status ?? e.code ?? '', String(e.message).slice(0, 300));
  process.exit(2);
}
