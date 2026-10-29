# HANDOFF-BOT-TD — Difficultés du bot (Facile/Normal/Difficile) + banc de calibrage 40 parties

**Décisions Erik 24/10** (« Maintenant ? » — suite de la file). Les trois profils existent dans `bot.json` depuis BOT-TA mais seul « normal » est branché. Cette tranche : le CHOIX de difficulté au lobby, les profils facile/difficile ajustés, et un BANC de calibrage mesurable.

## 1. Préalables

- Lire `botPolicy.ts` (bloc data-driven, hook difficulté D5 de BOT-TA), `bot.json` (3 profils), `lobby.ts` (case « Partie solo (contre le bot) » — le flag bot vit en `meta`, zéro migration — MÊME PATTERN pour la difficulté), les leçons CI-FLAKY (corpus fixe, RNG dérivés).
- Baseline : suites vertes à jour (rules 1101 / server 195 / web 700), `schemaVersion` 27 — la difficulté vit en `meta` de partie, PAS dans l'état moteur. Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Choix au lobby** : à côté de « Partie solo (contre le bot) », un sélecteur **Facile / Normal / Difficile** (défaut Normal) ; stocké en `meta` (miroir du flag bot), lu par le GameDO → profil appliqué à `botPolicy` ; reprise d'une partie = difficulté conservée ; affiché dans le bandeau de partie (détail survol adversaire — « Bot 🤖 · Difficile »).
- **D2 — Profils ajustés** : les 3 profils restent sur les champs existants (soin, ratio d'attaque, garnisons, économie T-B : poids, objectifs de recherche, seuils) — l'agent CALIBRE facile (plus passif : ratio 0,6, garnisons basses, économie minimale) et difficile (ratio 1,0, garnisons hautes, économie agressive) sur le banc, chiffres au rapport ; « normal » reste tel quel (validé par ton œil en jeu).
- **D3 — Banc de calibrage** : un banc SCRIPTÉ (motif CI-FLAKY : corpus fixe de seeds, RNG dérivés, zéro flaky) de **40 parties bot vs bot** à 150 tours par difficulté, mesurant par difficulté : villes fondées, population, unités, trésorerie, techs, PV militaires — tableau comparatif au rapport. Les chiffres « normal » deviennent la BASELINE de calibrage (T-C et Jev s'y compareront).
- **D4 — Intouchés** : le comportement « normal », les valeurs de gameplay, le fog du bot (cheat consigné), `schemaVersion`.

## 3. Mission

- **L1 — test-first** : difficulté au lobby→meta→GameDO (facile/normal/difficile, défaut normal), profil appliqué (fixtures par difficulté), reprise conservée, refus d'une difficulté inconnue (repli normal), banc déterministe (même corpus ⇒ mêmes chiffres).
- **L2 — serveur + lobby UI** (sélecteur, langage AAA, miroir de la case solo).
- **L3 — banc exécuté** : tableau 40×3 au rapport ; captures GUI (`dev-logs/captures-bot-td/`) du sélecteur et de parties à deux difficultés.
- **L4** : suites vertes, typecheck, commit, push, rapport `REPORT-BOT-TD.md` (tableaux du banc, calibrages, 🔶).

## 4. Critères d'acceptation

1. Le sélecteur de difficulté fonctionne de bout en bout (lobby → partie → bandeau) ;
2. Facile/Normal/Difficile produisent des comportements MESURABLEMENT différents au banc ;
3. Normal inchangé ; déterminisme du banc verrouillé ;
4. Suites vertes, `schemaVersion` 27.

## 5. Périmètre interdit

T-C (déclarations, agressivité de guerre), Jev, le fog du bot, les valeurs de gameplay, `schemaVersion`.

## 6. Fin de session

Rapport (tableaux, calibrages, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
