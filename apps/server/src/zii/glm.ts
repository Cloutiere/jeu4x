/**
 * ZII-GLM-VOIX (Erik 30/10) · D1 — adaptateur de fournisseur GLM (Z.ai, API
 * compatible OpenAI) pour Zii. Un simple `fetch` POST : {model, messages} →
 * choices[0].message.content. La clé est le secret ZII_GLM_API_KEY (jamais
 * dans le git — environnement uniquement). D2 : la sortie GLM est un JSON
 * {reponse, ton, intentionPercue} enveloppé dans la MÊME forme d'answers que
 * le SDK systemOne — le décodeur v1 (`decoderReponseZii`) reste l'unique
 * arbitre (longueur, tons, ensembles exacts).
 */
export const URL_GLM = 'https://api.z.ai/api/paas/v4/chat/completions';

/** ZII-FLASH-LITE (Erik 30/10) — thinking désactivé (D1) : latences attendues
 * ≤ 2 s ; marge ×6, repli répliques v1 au timeout (jamais de panne visible). */
export const TIMEOUT_GLM_MS = 12_000;

export interface MessageGlm {
  role: 'system' | 'user';
  content: string;
}

export interface ReponseAppelGlm {
  answers: unknown;
  usage?: { prompt_tokens?: number } | undefined;
}

/** Signet de l'appelant injectable (orchestre) — mêmes données que ClientZii. */
export type AppelGlmZii = (args: { messages: MessageGlm[] }) => Promise<ReponseAppelGlm>;

/**
 * D2 — contenu texte du choix GLM → answers à la forme systemOne. Retourne
 * null si le contenu n'est pas le JSON attendu (non-JSON, tronqué) → repli
 * silencieux existant. Les balises de code ```json sont tolérées.
 */
export function decoderSortieGlm(contenu: string, longueurMax?: number): unknown | null {
  let texte = (contenu ?? '').trim();
  const balise = texte.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (balise) texte = balise[1]!.trim();
  if (!texte.startsWith('{')) return null;
  let parse: unknown;
  try {
    parse = JSON.parse(texte);
  } catch {
    return null;
  }
  const o = parse as { reponse?: unknown; ton?: unknown; intentionPercue?: unknown };
  if (typeof o !== 'object' || o === null || typeof o.reponse !== 'string') return null;
  // D3 — débordement tronqué (le décodeur reste l'arbitre ; rejet évité quand
  // le JSON est sain mais la réplique dépasse longueurMax).
  const reponse = longueurMax !== undefined && o.reponse.length > longueurMax
    ? `${o.reponse.slice(0, longueurMax - 1)}…`
    : o.reponse;
  return {
    reponse: { choice: reponse },
    ton: { choice: o.ton },
    intentionPercue: { choice: o.intentionPercue },
  };
}

/** D1 — client GLM injectable (fetch remplacé dans les tests — zéro réseau). */
export function creerAppelGlm(apiKey: string, modele: string, longueurMax?: number, fetchImpl: typeof fetch = fetch): AppelGlmZii {
  return async ({ messages }) => {
    const controle = new AbortController();
    const minuteur = setTimeout(() => controle.abort(), TIMEOUT_GLM_MS);
    let http: Response;
    try {
      http = await fetchImpl(URL_GLM, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        // D1 ZII-FLASH-LITE — thinking désactivé pour les modèles qui le
        // tolèrent (glm-4.5/4.7-flash) ; envoyé inconditionnellement : les
        // modèles qui refusent renvoient 1210 → repli v1 (déjà géré).
        // D4 — max_tokens 2000 inchangé : glm-5.3-flash (reasoning forcé,
        // erreur 1210 « use low, high, or max ») garde un contenu non vide.
        body: JSON.stringify({
          model: modele,
          messages,
          temperature: 0.8,
          max_tokens: 2000,
          thinking: { type: 'disabled' },
        }),
        signal: controle.signal,
      });
    } finally {
      clearTimeout(minuteur);
    }
    if (!http.ok) throw new Error(`GLM HTTP ${http.status}`);
    const corps = (await http.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number };
    };
    const contenu = corps.choices?.[0]?.message?.content ?? '';
    // D2 — non-JSON/tronqué → answers null = repli SILENCIEUX existant
    // (distingué d'une panne HTTP, qui donne le repli répliques v1).
    return { answers: decoderSortieGlm(contenu, longueurMax), usage: corps.usage };
  };
}
