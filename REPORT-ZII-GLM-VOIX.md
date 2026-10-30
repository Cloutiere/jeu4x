# REPORT-ZII-GLM-VOIX — Zii prend la parole en langage naturel (GLM-5.3-Flash)

**Erik 30/10 — mission livrée.** Zii passe des répliques pré-écrites (ZII-V1, le compte
n'exposait que `jev-latest` — consigné) à la **génération naturelle réelle** via GLM
(Z.ai, API compatible OpenAI, clé `ZII_GLM_API_KEY` fournie par Erik : posée en prod et
dans `.dev.vars`, JAMAIS committée). Structure ZII-V1 inchangée : liste blanche,
anti-injection, `resumePourJev`, budget 0,05 $/partie, `schemaVersion` 28.

## Ce qui a été livré

- **D1 — Adaptateur** `apps/server/src/zii/glm.ts` : fetch compatible OpenAI
  (`api.z.ai/api/paas/v4/chat/completions`), timeout propre 20 s, fetch injectable
  (tests en FAUX fetch — zéro réseau). `zii.json` gagne `fournisseur: "glm"` +
  `modele: "glm-5.3-flash"` (surcharge `ZII_GLM_MODELE`) ; config SANS `fournisseur`
  = pipeline typesafe v1 inchangé (rétro, testé bit-à-bit). Le cadrage anti-injection
  est FACTORISÉ (`cadrageZii`) et partagé par les deux chemins.
- **D2 — contrat inchangé** : le prompt GLM demande le MÊME JSON
  `{reponse, ton, intentionPercue}` ; l'adaptateur l'enveloppe dans la forme `answers`
  du SDK et le décodeur v1 (`decoderReponseZii`) reste l'unique arbitre (longueurMax
  300 — débordement TRONQUÉ avec « … » dans l'adaptateur, tons/intentions exacts).
  - non-JSON / tronqué / ton hors liste → **repli silencieux existant** (échec compté) ;
  - panne HTTP / timeout / clé absente → **REPLI RÉPLIQUES v1** (candidats `zii.json`
    pour l'intention perçue, énoncé SEEDÉ — même seed → même réplique, `resumePourJev`
    poussé quand même : Jev reste informé) — jamais de panne visible ;
  - clé absente = repli SANS pénalité d'échec (rien n'a échoué) ; 3 échecs → muette
    inchangé ; journal enrichi du champ `source` (`glm` | `typesafe` | `replique`).
- **D3/D4** : paquet léger inchangé (test négatif rappelé sur le PROMPT GLM aussi) ;
  budget compté sur les appels GLM (`usage.prompt_tokens`, prix d'entrée Jev).
- **Pièges découverts (consignés R-191)** :
  1. `vitest-pool-workers` lit `.dev.vars` — les clés réelles fuyaient dans les tests
     (appel GLM RÉEL proven!). Neutralisées à chaîne vide dans `vitest.config.ts`.
  2. `glm-5.3-flash` est un modèle à RAISONNEMENT : `reasoning_content` non
     désactivable (erreur 1210), et `max_tokens: 400` laissait un **contenu vide**
     quand le raisonnement épuisait le plafond → `max_tokens: 2000` (5/5 JSON valides).
  3. Timeout 10 s (SDK typesafe) trop court : latences GLM observées 3,6-9 s → 20 s.
  4. Le proxy Vite (8787 figé) : capture GUI faite via un wrangler dédié sur 8787.

## Vérification locale RÉELLE (L3) — dev-logs/captures-zii-glm/

Dialogue scripté (bonjour → menace → demande de paix), partie solo vs Jev :

| Échange | Extrait de la réponse GÉNÉRÉE | source | latence | jetons |
|---|---|---|---|---|
| bonjour | « Au nom de Sa Majesté Isabelle I et du peuple espagnol… Que les dés de cette nouvelle ère tournent avec sagesse. » | glm | 9,0 s | 359 |
| menace | « L'Espagne ne craint pas les épées brandies… nos remparts, eux, sont déjà bâtis. » | glm | 5,1 s | 473 |
| demandePaix | « Après des menaces si véhémentes, voilà un revirement soudain… Isabelle I n'oublie rien. » | glm | 4,7 s | 594 |

- **Variation libre** (Isabelle/Égypte/Grèce/Arabie selon la civ tirée), ton ferme sur
  menace, et **mémoire de conversation** : à la demande de paix, Zii rappelle les
  menaces précédentes (« braises », « flèches tirées trop tôt ») — impossible aux
  répliques v1. 3/3 sur la passe finale ; `resumePourJev` ×3 au journal.
- **Coût GLM réel** : 0,00006 $ pour les 3 échanges (≈ 1 426 jetons d'entrée cumulés)
  — le plafond 0,05 $/partie laisse ~800 échanges.
- **Repli prouvé** : wrangler relancé SANS clé (`--var ZII_GLM_API_KEY:""`) → Zii
  répond avec une réplique v1 (`source=replique`, `echecsConsecutifs=0`) ;
  repli silencieux prouvé aussi (JSON invalide → aucun message, échec compté).
- Captures : `dialogue-glm.json` (transcrits + journaux), `repli-v1.json`,
  `GUI-bulle-zii-glm.png` (bulle dans la Messagerie). Scripts :
  `devtmp/zii-glm-dialogue.mjs`, `devtmp/zii-glm-capture-gui.mjs`.

## Tests (test-first)

`tests/zii-glm-voix.test.ts` 15 verts : fixture de réponse GLM réelle → décodeur v1
VERT ; non-JSON/tronqué → null ; débordement tronqué/rejeté ; cadrage NON FIABLE du
prompt (et jamais de donnée interdite) ; chemin nominal généré + budget ; panne →
réplique v1 déterministe ; 3 échecs → muette ; clé absente → réplique v1 sans échec ;
rétro typesafe inchangé. `tests/zii-v1.test.ts` : 2 tests mis à jour pour la nouvelle
sémantique D2 (clé absente = réplique v1 ; e2e PROUVE le repli — la réponse du siège
Jev est vérifiée membre des candidats zii.json substitués).

Suites : server 384 (369 + 15) / jev-port 20 / rules 1101 / web 706 / svelte-check 0 ;
typechecks verts ; `schemaVersion` 28 ; zéro secret committé (vérifié : `.dev.vars`
gitignore, seuls des noms de variables dans le code).

## 🔶 À l'œil Erik (prod)

1. **La voix** : la validation finale est la TIENNE en prod (dialogue libre vs
   répliques v1) — CI déployée, le secret prod s'active au déploiement.
2. **Température 0,8** et personnalité par civ (le prompt fixe le rôle/trempé, la
   variation vient de GLM) — calibrage fin possible plus tard.
3. **Repli silencieux** (JSON invalide ~1/5 avant les fix `max_tokens`/timeout) : le
   joueur ne voit RIEN dans ce cas ; si tu préfères la réplique v1 même là, c'est une
   ligne à changer (repliReplique sur le chemin invalide).
4. **Latence 4-9 s** : le message de Zii arrive après le message du joueur — l'UI
   chat-socle l'affiche en temps réel, rien à changer, mais c'est perceptible.
