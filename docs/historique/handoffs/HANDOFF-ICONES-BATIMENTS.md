# HANDOFF-ICONES-BATIMENTS — Icônes bâtiments et merveilles : bannière + menu de production

**Décisions Erik 14/10** (tranchés D1-D5 présentés — veto possible). Sources : `new_icones/buildings/` et `new_icones/wonders/` d'Erik (NE JAMAIS les committer tels quels) — le pipeline d'ICONES-UNITES s'étend.

## 1. Préalables

- Lire le pipeline d'icônes livré (REPORT-ICONES-UNITES — mapping data-driven, recuisson, repli initiale), la bannière (cercle production), `PanneauVille.svelte` (liste « Programmer la production » + file), `productionMenu.ts` (options de constructible).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 14/10 — non négociables)

- **D1 — Bannière** : icônes bâtiments/merveilles dans le cercle de production ; initiale = repli seul.
- **D2 — Menu** : icône par ligne de la liste (3 onglets) ET par item de la file (en-tête) ; alignement/calibre cohérents (image 2 d'Erik).
- **D3 — Repli universel** : icône manquante = initiale accent (unités, bâtiments ET merveilles).
- **D4 — Affichage** : bannière + PanneauVille seulement ; vue ville dormante et Chroniques inchangés (veto possible).
- **D5 — Calibres data-driven séparés** (bannière/menu), à l'œil.

## 3. Mission

- **L1 — test-first** : mapping étendu (bâtiments/merveilles → icône ou repli), bannière (icône au lieu d'initiale quand livrée), menu (icônes liste + file), aucun trou visuel possible.
- **L2 — pipeline/rendu** : recuisson des nouvelles sources (buildings + wonders), extension du mapping, branchement bannière + liste + file.
- **L3 — captures GUI avant commit** (`dev-logs/captures-icones-batiments/`) : bannière avec bâtiment ET merveille en file, menu 3 onglets avec icônes, file avec icônes, repli initiale sur un type sans image (à l'œil).
- **L4** : suites vertes (web), svelte-check 0, commit, push, rapport `REPORT-ICONES-BATIMENTS.md` (inventaire icônes livrées/manquantes, 🔶 calibres).

## 4. Critères d'acceptation

1. Bannière : icônes au lieu d'initiales pour bâtiments/merveilles ;
2. Menu : icônes dans la liste et la file, repli propre ;
3. Suites vertes, 60 FPS et couture préservés.

## 5. Périmètre interdit

Moteur/serveur ; vue ville zoomée (dormante) ; Chroniques (sauf veto) ; tout le 3D ; `schemaVersion` ; répertoires d'Erik jamais committés tels quels.

## 6. Fin de session

Mini-rapport (inventaire, 🔶 calibres), arrêt, remise de la main.
