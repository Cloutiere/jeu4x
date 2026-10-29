/**
 * ZII-V1 · D1 — client LLM côté GameDO pour Zii (même SDK que Jev, modèle
 * LÉGER distinct data-driven dans zii.json ; D2 : deux cerveaux, deux
 * modèles). La clé est le secret commun TYPESAFE_API_KEY (jamais dans le git).
 * D6 : un timeout court borne l'attente (au-delà → repli silencieux, compté
 * comme échec).
 */
import { TypeSafeClient } from '@typesafe-ai/sdk';
import type { ClientZii } from './orchestre.js';

export const TIMEOUT_ZII_MS = 10_000;

export function creerClientZii(apiKey: string): ClientZii {
  // defaultModel « jev-latest » = défaut SDK ; Zii surcharge CHAQUE appel
  // avec le modèle léger de zii.json (`model` du SystemOneRequest).
  const client = new TypeSafeClient({ apiKey, defaultModel: 'jev-latest', timeout: TIMEOUT_ZII_MS, retry: { maxRetries: 0 } });
  const systemOne = (args: { state: unknown; questions: unknown; model?: string }) =>
    Promise.race([
      client.systemOne(args as Parameters<typeof client.systemOne>[0]),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`timeout Zii (${TIMEOUT_ZII_MS} ms)`)), TIMEOUT_ZII_MS),
      ),
    ]) as Promise<{ answers: unknown; usage?: { input_tokens?: number } }>;
  return { systemOne };
}
