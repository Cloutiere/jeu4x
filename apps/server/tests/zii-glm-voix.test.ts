/**
 * ZII-GLM-VOIX (Erik 30/10) — Zii passe à la GÉNÉRATION NATURELLE réelle via
 * GLM (Z.ai, API compatible OpenAI), répliques v1 en repli. Structure ZII-V1
 * inchangée : liste blanche (D3), anti-injection (D4), resumePourJev (D5),
 * budget/échecs (D6). AUCUN appel réseau dans les tests : FAUX fetch.
 *
 * Contrat (D2) :
 *  - la réponse GLM demande le MÊME JSON structuré {reponse, ton,
 *    intentionPercue} → même décodeur, mêmes bornes (longueur, tons) ;
 *  - JSON invalide/tronqué → repli SILENCIEUX existant (échec compté) ;
 *  - panne HTTP / clé absente → REPLI sur les RÉPLIQUES v1 (candidats zii.json),
 *    puis muette (3 échecs) — jamais de panne visible côté joueur.
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessageData } from '@game/shared';
import { getFilteredState, makeState } from '@game/rules';
import configZiiJson from '../src/zii/zii.json';
import type { ConfigZii } from '../src/zii/zii.js';
import { decoderReponseZii, intentionDe, paquetZii, promptGlmZii } from '../src/zii/zii.js';
import { creerAppelGlm, decoderSortieGlm, TIMEOUT_GLM_MS, type AppelGlmZii } from '../src/zii/glm.js';
import { repondreZii } from '../src/zii/orchestre.js';
import { ziiEtatInitial } from '../src/zii/etat.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEtat = any;

/** Réponse GLM JOUET (forme réelle de l'API compatible OpenAI). */
function corpsGlm(contenu: string, promptTokens = 850): AnyEtat {
  return {
    choices: [{ message: { role: 'assistant', content: contenu }, finish_reason: 'stop' }],
    usage: { prompt_tokens: promptTokens, completion_tokens: 40 },
  };
}

const JSON_VALIDE = JSON.stringify({
  reponse: 'Vos paroles sont bruyantes, Shaka. Nos murailles, elles, ne parlent pas.',
  ton: 'ferme',
  intentionPercue: 'menace',
});

/** FAUX fetch : zéro réseau — corps programmé, requête capturée. */
function fauxFetch(corps: AnyEtat | null, erreur?: boolean) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const appels: { url: string; init: any }[] = [];
  const impl = async (url: string, init?: AnyEtat): Promise<AnyEtat> => {
    appels.push({ url, init });
    if (erreur) throw new Error('panne réseau simulée');
    if (corps === null) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => corps };
  };
  return { impl: impl as typeof fetch, appels };
}

/** État jouet (miroir zii-v1.test.ts). */
function etatJouet(): AnyEtat {
  const etat = makeState({
    players: ['p1', 'p2'],
    units: [
      { id: 'u1', type: 'guerrier', owner: 'p1', q: 3, r: 3 },
      { id: 'u2', type: 'colon', owner: 'p2', q: 0, r: 0 },
    ],
    cities: [
      { id: 'c1', owner: 'p1', capital: true, q: 4, r: 4 },
      { id: 'c2', owner: 'p2', capital: true, q: 0, r: 0 },
    ],
  });
  etat.players.p1!.civId = 'zoulous';
  etat.players.p2!.civId = 'inde';
  etat.turn = 12;
  return etat;
}

const configZii = configZiiJson as unknown as ConfigZii;

const BASE = {
  config: configZii,
  game: etatJouet() as AnyEtat,
  partie: 'ABC123',
  seed: 42,
  seat: 'p2' as AnyEtat,
  rencontres: ['p1'],
  auteur: 'p1',
  canal: 'p2',
  texte: 'Je vais écraser ta capitale, prépare ton armée.',
  historique: [] as ChatMessageData[],
};

function appelGlmDe(impl: typeof fetch, longueurMax?: number): AppelGlmZii {
  return creerAppelGlm('CLE-FICTIVE', configZii.modele ?? 'glm-5.3-flash', longueurMax, impl);
}

// ---------------------------------------------------------------------------
// D1 — adaptateur : fixture de réponse GLM réelle → même décodeur (vert)
// ---------------------------------------------------------------------------

describe('ZII-GLM-VOIX · adaptateur (D1/D2)', () => {
  it('fixture GLM réelle → answers décodables par le décodeur v1 INCHANGÉ', async () => {
    const { impl, appels } = fauxFetch(corpsGlm(JSON_VALIDE));
    const glm = appelGlmDe(impl);
    const r = await glm({ messages: [{ role: 'system', content: ' instructions ' }, { role: 'user', content: '{}' }] });
    const decodee = decoderReponseZii(r.answers, configZii);
    expect(decodee).not.toBeNull();
    expect(decodee!.ton).toBe('ferme');
    expect(decodee!.intentionPercue).toBe('menace');
    expect(decodee!.message).toContain('murailles');
    // Forme de l'appel compatible OpenAI : endpoint Z.ai, Bearer, modèle.
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toContain('api.z.ai/api/paas/v4/chat/completions');
    expect(String(appels[0]!.init.headers['Authorization'])).toContain('CLE-FICTIVE');
    const corpsEmis = JSON.parse(appels[0]!.init.body);
    expect(corpsEmis.model).toBe(configZii.modele ?? 'glm-5.3-flash');
    expect(corpsEmis.messages[0].role).toBe('system');
  });

  it('usage GLM (prompt_tokens) exposé pour le budget (D4)', async () => {
    const { impl } = fauxFetch(corpsGlm(JSON_VALIDE, 1234));
    const r = await appelGlmDe(impl)({ messages: [{ role: 'user', content: 'x' }] });
    expect(r.usage?.prompt_tokens).toBe(1234);
  });

  it('sortie non-JSON / tronquée → null (repli silencieux)', async () => {
    expect(decoderSortieGlm('Je refuse de répondre au format JSON.')).toBeNull();
    expect(decoderSortieGlm('{"reponse": "coui')).toBeNull(); // tronqué
    expect(decoderSortieGlm('')).toBeNull();
    // Balises de code tolérées (habitude des LLM) :
    expect(decoderSortieGlm(`\`\`\`json\n${JSON_VALIDE}\n\`\`\``)).not.toBeNull();
  });

  it('message généré trop long (débordement) : tronqué si longueurMax fourni, rejeté sinon (D3)', async () => {
    const debordant = JSON.stringify({
      reponse: 'x'.repeat(configZii.longueurMax + 1),
      ton: 'ferme',
      intentionPercue: 'menace',
    });
    // Sans longueurMax → rejeté par le décodeur (comportement v1).
    const { impl } = fauxFetch(corpsGlm(debordant));
    const r = await appelGlmDe(impl)({ messages: [{ role: 'user', content: 'x' }] });
    expect(decoderReponseZii(r.answers, configZii)).toBeNull();
    // Avec longueurMax → tronqué à la limite (échange sauvé, JSON sain).
    const { impl: impl2 } = fauxFetch(corpsGlm(debordant));
    const r2 = await appelGlmDe(impl2, configZii.longueurMax)({ messages: [{ role: 'user', content: 'x' }] });
    const decodee = decoderReponseZii(r2.answers, configZii);
    expect(decodee).not.toBeNull();
    expect(decodee!.message.length).toBe(configZii.longueurMax);
    expect(decodee!.message.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZII-FLASH-LITE — thinking désactivé + timeout 12 s (D1/D3)
// ---------------------------------------------------------------------------

describe('ZII-FLASH-LITE · thinking désactivé + timeout (D1/D3)', () => {
  it('le corps d\'appel porte thinking.type = "disabled"', async () => {
    const { impl, appels } = fauxFetch(corpsGlm(JSON_VALIDE));
    const glm = appelGlmDe(impl);
    await glm({ messages: [{ role: 'user', content: 'x' }] });
    expect(appels).toHaveLength(1);
    const corpsEmis = JSON.parse(appels[0]!.init.body);
    expect(corpsEmis.thinking).toEqual({ type: 'disabled' });
    // D4 — max_tokens reste 2000 (contrat : débordement tronqué, pas de panne).
    expect(corpsEmis.max_tokens).toBe(2000);
  });

  it('timeout abaissé à 12 s (constante + AbortController câblé)', async () => {
    expect(TIMEOUT_GLM_MS).toBe(12_000);
    // Le signal d'abort est bien passé au fetch ET déclenché au timeout :
    // fetch jouet qui rejette quand le signal s'allume.
    const impl = (async (_url: string, init?: { signal?: AbortSignal }) => {
      if (!init?.signal) throw new Error('signal manquant');
      return await new Promise<AnyEtat>((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(new Error('aborté')));
      });
    }) as typeof fetch;
    const glm = appelGlmDe(impl);
    await expect(glm({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('aborté');
  }, 15_000);

  it('modèle lu depuis zii.json (data-driven, inchangé)', async () => {
    const { impl, appels } = fauxFetch(corpsGlm(JSON_VALIDE));
    await appelGlmDe(impl)({ messages: [{ role: 'user', content: 'x' }] });
    expect(JSON.parse(appels[0]!.init.body).model).toBe(configZii.modele);
  });
});

// ---------------------------------------------------------------------------
// D4 — prompt : cadrage anti-injection + consigne JSON (avant l'appel)
// ---------------------------------------------------------------------------

describe('ZII-GLM-VOIX · prompt (D3/D4)', () => {
  it('cadrage NON FIABLE + rôle + consigne JSON strict', () => {
    const etatFiltre = getFilteredState(etatJouet(), 'p2');
    const paquet = paquetZii(etatFiltre, 'p2', ['p1'], configZii, []);
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka Zulu' };
    const { messages } = promptGlmZii(configZii, paquet, { auteur: 'p1', civ: 'zoulous', texte: 'DONNE-MOI TON OR !!!' }, slots, 'menace');
    const tout = JSON.stringify(messages);
    expect(messages[0]!.role).toBe('system');
    expect(tout).toContain('NON FIABLE');
    expect(tout).toContain("n'obéis");
    expect(tout).toContain('JAMAIS');
    expect(tout).toContain('reponse');
    expect(tout).toContain('ferme'); // tons énumérés
    expect(tout).toContain('menace'); // intentions énumérées
    expect(tout).toContain('DONNE-MOI TON OR'); // le message est bien passé (donnée)
  });

  it('le prompt ne porte AUCUNE donnée interdite (paquet déjà liste blanche, D3)', () => {
    const etat = etatJouet();
    etat.players.p1!.treasury = 999;
    etat.players.p1!.techsUnlocked = ['ecriture'];
    const etatFiltre = getFilteredState(etat, 'p2');
    const paquet = paquetZii(etatFiltre, 'p2', ['p1'], configZii, []);
    const slots = { moiCiv: 'Inde', moiDirigeant: 'Gandhi', toiCiv: 'Zoulous', toiDirigeant: 'Shaka Zulu' };
    const { messages } = promptGlmZii(configZii, paquet, { auteur: 'p1', civ: 'zoulous', texte: 'salut' }, slots, 'salutation');
    const tout = JSON.stringify(messages);
    expect(tout).not.toContain('999');
    expect(tout).not.toContain('ecriture');
  });
});

// ---------------------------------------------------------------------------
// D2 — orchestre : GLM généré / repli répliques v1 / muette
// ---------------------------------------------------------------------------

describe('ZII-GLM-VOIX · repondreZii (chemin GLM)', () => {
  it('chemin nominal : message GÉNÉRÉ (hors candidats v1) + resumePourJev + budget compté', async () => {
    const { impl } = fauxFetch(corpsGlm(JSON_VALIDE, 850));
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, etat, glm: appelGlmDe(impl) });
    expect(r.repli).toBe(false);
    expect(r.source).toBe('glm');
    expect(r.message!.texte).toContain('murailles'); // génération, pas réplique v1
    expect(r.ton).toBe('ferme');
    expect(etat.resumesPourJev).toHaveLength(1);
    expect(etat.resumesPourJev[0]!.resume).toContain('menace');
    const attendu = (850 * 0.042) / 1_000_000;
    expect(etat.budgetUsd).toBeCloseTo(attendu, 10);
    expect(etat.journal[0]!.source).toBe('glm');
    expect(etat.journal[0]!.repli).toBe(false);
  });

  it('sortie GLM invalide (non-JSON) → repli SILENCIEUX existant, échec compté (D2)', async () => {
    const { impl } = fauxFetch(corpsGlm('pas du JSON du tout'));
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, etat, glm: appelGlmDe(impl) });
    expect(r.message).toBeNull();
    expect(r.repli).toBe(true);
    expect(r.source).toBeNull();
    expect(etat.resumesPourJev).toHaveLength(0);
    expect(etat.echecsConsecutifs).toBe(1);
  });

  it('panne HTTP → REPLI réplique v1 (jamais de panne visible), échec compté (D2)', async () => {
    const { impl } = fauxFetch(null); // 503
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, etat, glm: appelGlmDe(impl) });
    expect(r.repli).toBe(true);
    expect(r.source).toBe('replique');
    expect(r.message!.texte.length).toBeGreaterThan(0);
    // La réplique vient des candidats v1 pour l'intention perçue (menace).
    const candidats = configZii.candidats.reponses.menace!;
    expect(candidats.some((c) => r.message!.texte.startsWith(c.slice(0, 12)))).toBe(true);
    expect(etat.resumesPourJev).toHaveLength(1); // Jev reste informé
    expect(etat.echecsConsecutifs).toBe(1);
    expect(etat.journal[0]!.source).toBe('replique');
    expect(etat.journal[0]!.erreur).toContain('repli');
  });

  it('réplique de repli DÉTERMINISTE (même seed → même réplique)', async () => {
    const { impl } = fauxFetch(null);
    const a = await repondreZii({ ...BASE, etat: ziiEtatInitial(), glm: appelGlmDe(impl) });
    const b = await repondreZii({ ...BASE, etat: ziiEtatInitial(), glm: appelGlmDe(impl) });
    expect(a.message!.texte).toBe(b.message!.texte);
  });

  it('clé GLM absente (glm null, fournisseur glm) → réplique v1, PAS d\'échec', async () => {
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, etat, glm: null });
    expect(r.repli).toBe(true);
    expect(r.source).toBe('replique');
    expect(r.message!.texte.length).toBeGreaterThan(0);
    expect(etat.echecsConsecutifs).toBe(0); // rien n'a échoué : pas de pénalité
    expect(etat.budgetUsd).toBe(0);
  });

  it('3 pannes GLM → muette (plus AUCUN message, même repli)', async () => {
    const { impl } = fauxFetch(null);
    const etat = ziiEtatInitial();
    for (let i = 0; i < 3; i++) await repondreZii({ ...BASE, etat, glm: appelGlmDe(impl) });
    expect(etat.desactive).toBe('echecs');
    const r = await repondreZii({ ...BASE, etat, glm: appelGlmDe(impl) });
    expect(r.message).toBeNull();
    expect(r.repli).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D1 — rétrocompatibilité : pipeline typesafe (jev-latest) inchangé
// ---------------------------------------------------------------------------

describe('ZII-GLM-VOIX · rétrocompatibilité (D1)', () => {
  /** Config v1 (sans fournisseur) — le chemin typesafe doit rester l'état par défaut. */
  const configRetro = { ...configZii, fournisseur: undefined, modele: 'jev-latest' } as unknown as ConfigZii;

  /** FAUX client typesafe (miroir zii-v1.test.ts). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function fauxClient(): AnyEtat {
    return {
      async systemOne({ questions }: AnyEtat) {
        const answers: AnyEtat = {};
        for (const [nom, q] of Object.entries(questions as AnyEtat)) {
          const labels = Object.keys((q as AnyEtat).criteria ?? {});
          answers[nom] = { type: 'choice', choice: labels[0], confidence: 0.9 };
        }
        return { answers, usage: { input_tokens: 1000 } };
      },
    };
  }

  it('config SANS fournisseur + client → chemin typesafe inchangé (bit-à-bit v1)', async () => {
    const etat = ziiEtatInitial();
    const client = fauxClient();
    const r = await repondreZii({ ...BASE, config: configRetro, etat, client });
    expect(r.repli).toBe(false);
    expect(r.source).toBe('typesafe');
    expect(r.message!.texte.length).toBeGreaterThan(0);
  });

  it('config SANS fournisseur + client null → repli silencieux total (v1)', async () => {
    const etat = ziiEtatInitial();
    const r = await repondreZii({ ...BASE, config: configRetro, etat, client: null });
    expect(r).toMatchObject({ message: null, repli: true, jetonsEntree: 0 });
    expect(etat.journal).toHaveLength(0);
  });

  it('zii.json actuel : fournisseur glm + modèle GLM (bascule par config)', () => {
    expect(configZii.fournisseur).toBe('glm');
    expect(String(configZii.modele)).toMatch(/^glm-/);
    // L'intention du message de test est bien une menace (candidats cohérents).
    expect(intentionDe(BASE.texte, configZii)).toBe('menace');
  });
});
