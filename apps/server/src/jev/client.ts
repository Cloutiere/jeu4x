/**
 * JEV-FUMEE-LOBBY · D2 — client LLM côté GameDO. Le SDK @typesafe-ai/sdk est
 * 100 % fetch (aucune API Node) : compatible Workers. La clé vit en secret
 * Cloudflare (`wrangler secret put TYPESAFE_API_KEY`, jamais dans le git ;
 * `.dev.vars` en local). D4 : un timeout borne l'attente (au-delà → repli
 * bot pour ce tour, compté comme échec).
 */
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ClientJev } from './joueur.js';

export const MODELE_JEV = 'jev-latest';
export const TIMEOUT_APPEL_MS = 20_000;

export function creerClientJev(apiKey: string): ClientJev {
  // defaultModel jev-latest = défaut SDK (cf. index.d.mts) — explicite quand
  // même ; timeout par tentative relevé (le harnais observe des tours lents).
  const client = new TypeSafeClient({ apiKey, defaultModel: MODELE_JEV, timeout: TIMEOUT_APPEL_MS, retry: { maxRetries: 1 } });
  const systemOne = (args: { state: unknown; questions: unknown }) =>
    Promise.race([
      client.systemOne(args as Parameters<typeof client.systemOne>[0]),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout Jev (${TIMEOUT_APPEL_MS} ms)`)), TIMEOUT_APPEL_MS),
      ),
    ]) as Promise<{ answers: any; usage?: { input_tokens?: number } }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { systemOne };
}
