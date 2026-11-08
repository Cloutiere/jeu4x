# REPORT-BOT-FONDATION-MOUVEMENT — 24/10/2026

## Observation corrigée
Au premier tour des cartes à départ Colon, le guerrier du bot restait immobile : la branche fondation de `botPolicy.ts` émettait `FoundCity` puis **retournait prématurément** (avant l'assignation d'objectifs), gelant toutes les autres unités pour ce tour.

## Correctif (D1)
`apps/server/src/botPolicy.ts` — la branche « fonder SA capitale » :
- émet `FoundCity` **puis poursuit** la politique normale (objectifs + ordres + économie pour tout le reste) ;
- le colon fondateur est verrouillé sur « tenir » et **sauté dans la boucle d'ordres** : il ne reçoit QUE `FoundCity`.

**Piège trouvé par le banc** : un 2e ordre (`Hold`) sur le colon dans le même tour fait **tomber la fondation à la résolution** (le banc e2e `carte-multi.test.ts` l'a attrapé : plus de capitale à t2). D'où le `continue` pour le fondateur plutôt qu'un simple `Hold`.

## Audit D2 — autres sorties anticipées
- `botPolicy.ts:728` (`!me`) : joueur absent, légitime (aucune unité à ordonner).
- Aucun autre `return` prématuré dans `botPolicy` ni `bot.mjs` (le bot client hérité donne un ordre à chaque unité chaque tour).
- Les refus d'objectif (`continue` dans `assignerObjectifs`) laissent toujours l'unité avec un objectif ⇒ un ordre. Rien d'autre ne gèle.

## Tests (test-first)
`apps/server/tests/bot-fondation-mouvement.test.ts` — 4 verts :
1. t1 départ colon : `FoundCity` du colon **ET** `Move` du guerrier au même tour ;
2. le colon ne reçoit QUE `FoundCity` (jamais de mouvement) ;
3. pas de régression colon seul (comportement CARTE-MULTI) ;
4. déterminisme (même état ⇒ mêmes ordres).

## Suites
- rules **1101** verts, server **166** verts, web **698** verts ; `tsc` server 0, svelte-check 0 erreurs.
- NB : un e2e server a échoué au 1er passage complet puis vert à deux relances (flaky réseau/wrangler local, non lié au correctif — le même fichier est vert en isolation et en suite).

## Bancs e2e (L3)
- `devtmp/bot-fondation-gui.mjs` **PASS** (solo procédural + GOD-MODE, captures `dev-logs/captures-bot-fondation/`) :
  - t0 : colon (19,14) + guerrier (18,14), aucune ville ;
  - **t1 : capitale (19,14) fondée ET guerrier en (19,13) — déplacement 1** ;
  - t2-t3 : la patrouille continue (miroir BOT-EXPLORATION).
- Banc `botSolo-e2e` (victoire domination) : **échec à 300 tours — PRÉEXISTANT, hors périmètre, prouvé** : le même banc sans mon correctif (stash) échoue identiquement (Alice 207 unités vs bot 69, capitale jamais prise). Le harnais « assaut général » (daté BOT-TA, victoire t105 à l'époque) ne perce plus la défense post-BOT-EXPLORATION (quota dynamique + rappel D3 : la garnison se relève et se renforce). Mission de harnais/bot à cadrer séparément — aucune régression imputable à ce correctif.

## Périmètre
Serveur seul, `schemaVersion` intouchée, rien d'autre du bot modifié.
