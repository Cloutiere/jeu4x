# HANDOFF-MERVEILLE-COUT-FILE — Coût des merveilles dans la file de production

**Signalement Erik 05/10 (capture)** : une merveille en file affiche « 36 / **Infinity** marteaux — à l'arrêt » (Colosse de Rhodes), alors que le prix d'achat est juste (128 or — le moteur connaît le coût).

## 1. Préalables

Cause repérée par le pilot : `apps/web/src/components/PanneauVille.svelte:125` — `itemCost` lit `BUILDINGS[item.id]?.cost ?? Infinity` : les merveilles ne sont PAS des bâtiments (table `WONDERS`), d'où l'Infinity et le libellé « à l'arrêt » (branche non-fini, lignes ~143-147). Affichage seul — la production avance réellement. Baseline : suites vertes à jour, `schemaVersion` 27, **client seul**. ⚠ Session parallèle TECHTREE en cours — vérifier `git status` avant d'écrire ; ne toucher QUE PanneauVille/tests.

## 2. Mission

- **L1 — test-first** : test du coût de file pour une merveille (Colosse = son coût `WONDERS`), ETA finie, pas de « à l'arrêt » ; un item réellement sans coût connu garde le repli honnête (jamais « Infinity » affiché en clair).
- **L2** : `itemCost` consulte aussi `WONDERS` (une ligne) ; vérifier les autres usages du même motif dans le fichier (achat, cumul — lignes 142-147) et le libellé de repli.
- **L3** : capture GUI avant/après (`dev-logs/captures-merveille-cout-file/`) : merveille en file avec coût et ETA corrects.
- **L4** : suites web vertes, svelte-check 0, commit, push, mini-rapport `REPORT-MERVEILLE-COUT-FILE.md`.

## 3. Périmètre interdit

Moteur/serveur (le coût et le rush sont justes), techs.json/wonders.json, la session TECHTREE en cours, `schemaVersion`.

## 4. Fin de session

Mini-rapport, arrêt, remise de la main.
