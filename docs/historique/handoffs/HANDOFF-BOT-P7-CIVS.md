# HANDOFF-BOT-P7-CIVS — Le banc avec de vraies civilisations (l'agressivité exercée)

**Décisions Erik 26/10** (recommandation de l'agent d'observation, votée). Les deux bots du banc sont « neutre » : l'`agressivite` 0,25-0,9 de `civilizations.json` n'a jamais été exercée. Cette mission assigne de vraies civs au banc et ré-observe.

## 1. Préalables

- Lire le banc T-D/T-C (devtmp, corpus fixe de seeds, RNG dérivés), `civilizations.json` (16 civs + `agressivite`), le rapport `REPORT-BOT-TC-OBSERVATION.md` (extracteur, artefacts D6, métriques D3).
- Baseline : suites vertes à jour, `schemaVersion` 28, **banc/devtmp seulement — zéro prod attendu**. Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Tirage de civs par partie** : chaque partie du banc reçoit deux civs DISTINCTES tirées de façon DÉTERMINISTE (RNG dérivé du seed de partie — miroir du choix seedé lobby) sur les 16 ; sur le corpus de 40 seeds, les civs couvrent l'éventail (au moins une occurrence de chacune ; vérifier la couverture au rapport).
- **D2 — Le comportement ne change pas** : `bot.json`, seuils, `agressivite` — AUCUNE valeur touchée ; seuls les bots du banc portent des civs réelles.
- **D3 — Ré-observation complète** : relancer le banc d'observation (extraction + métriques D3 de la mission précédente, artefacts réutilisés) avec les civs ; tableaux PAR CIV (agressivité déclarée vs guerres observées — le paramètre « rôle-play » est-il lisible ?), comparaison « avant (neutre) / après (civs) » à constantes égales.
- **D4 — Jugement qualitatif renouvelé** : anecdotes par civilisation marquante (Zoulous vs Inde…), verdict mis à jour sur la checklist (fréquence, cible, conduite, paix, écrasement).
- **D5 — Zéro proposition de valeur cette fois** : la mission P7 mesure ; les propositions de réglages restent celles du rapport d'observation (elles seront révisées si la mesure par civ les contredit — consigné).

## 3. Mission

- **L1 — test-first** : tirage déterministe de paires de civs (même seed ⇒ même paire, couverture 16/16 sur le corpus, jamais de paire identique).
- **L2 — banc** : brancher les civs, relancer 40×3, produire artefacts + tableaux.
- **L3 — rapport** `REPORT-BOT-P7-CIVS.md` (tableaux par civ, avant/après neutre, anecdotes, verdicts mis à jour), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Les guerres du banc reflètent les agressivités (Zoulous > Inde, mesurable) ;
2. Tableaux avant/après comparables ; déterminisme verrouillé ;
3. Zéro changement de comportement committé.

## 5. Périmètre interdit

Toute valeur de comportement ; la grande tranche P1/mur défensif (préparée ensuite) ; T2/T3 ; `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
