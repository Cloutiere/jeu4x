# HANDOFF-BOT-TC-OBSERVATION — Banc d'observation des guerres IA : rapport qualitatif de calibrage

**Décisions Erik 25/10.** Première passe de calibrage T-C SANS jeu manuel : faire jouer les IA entre elles sur le banc scripté, extraire les chroniques de guerre, et produire un RAPPORT D'OBSERVATION (chiffres + jugement qualitatif de l'agent + valeurs de réglage proposées). **AUCUN changement de comportement dans cette mission** — Erik tranche sur le rapport, l'application fera l'objet d'un mini-handoff.

## 1. Préalables

- Lire le banc T-D (corpus fixe de seeds, RNG dérivés — leçon CI-FLAKY), les événements de guerre (WarDeclared public, batailles, ProposePeace, captures), `bot.json` (seuils de guerre/paix ×3 profils), `agressivite` par civ (civilizations.json).
- Baseline : suites vertes à jour, `schemaVersion` 28, **hors prod** (banc local/devtmp). Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Corpus** : les parties bot-vs-bot du banc T-D (40 seeds × 3 difficultés, 150 tours) — MÊME corpus (comparabilité) ; aucune partie humaine nécessaire.
- **D2 — Extraction** : par partie, la CHRONOLOGIE complète des guerres : qui déclare contre qui (tour, forces des deux camps à la déclaration), combats (nombre, pertes), offensives (progression vers la capitale cible), paix proposées/acceptées/refusées (tour, rapport de forces), fin de guerre, capitales capturées, éliminations.
- **D3 — Métriques agrégées** (par difficulté et par civ) : guerres par 30 tours ; tour de première guerre ; ratio de forces déclarant/cible (la cible est-elle la plus faible ?) ; durée moyenne des guerres ; taux de guerres STÉRILES (déclaration sans bataille) ; taux d'acceptation de la paix (perdant/gagnant) ; écrasement (une civ domine-t-elle tout avant t30/t50 ?) ; agressivité observée vs `agressivite` déclarée par civ (le champ reflète-t-il le comportement ?).
- **D4 — Jugement qualitatif de l'agent** : lecture détaillée d'au moins 10 chronologies représentatives, 3 à 5 anecdotes décrites (bonnes et mauvaises : « Zoulous déclarent t12 mais n'avancent jamais », « la paix refusée alors que le bot perdait »…), et un VERDICT par point de la checklist de calibrage d'Erik (fréquence, cible, conduite, paix, écrasement).
- **D5 — Proposition de réglages** : pour chaque verdict déficient, les VALEURS proposées (tableau actuel → proposé, avec justification) — **NOT APPLIED**. La mission ne touche à aucun fichier de comportement.
- **D6 — Artefacts** : les chronologies extraites (JSON) conservées dans devtmp (réutilisables par les passes suivantes et par le banc Jev).

## 3. Mission

- **L1 — test-first** : l'extracteur (chronologie complète et correcte sur une fixture à guerre connue, métriques agrégées justes), déterminisme du banc.
- **L2 — extraction + banc** : instrumenter le banc T-D (les événements existent — zéro moteur attendu), exécuter 40×3, produire les artefacts D6.
- **L3 — analyse** : D3 (tableaux) + D4 (lecture qualitative) + D5 (propositions).
- **L4** : rapport `REPORT-BOT-TC-OBSERVATION.md` (tableaux, anecdotes, verdicts par point de checklist, tableau de réglages proposés), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Le rapport répond POINT PAR POINT à la checklist de calibrage d'Erik (fréquence, cible, conduite de guerre, paix, écrasement, difficultés) ;
2. Chaque verdict s'appuie sur des chiffres ET des anecdotes lisibles ;
3. Le tableau « actuel → proposé » est prêt à trancher ;
4. Zéro changement de comportement committé.

## 5. Périmètre interdit

Toute modification de `bot.json`/`civilizations.json` ou du bot ; T2/T3 ; Jev ; `schemaVersion`.

## 6. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
