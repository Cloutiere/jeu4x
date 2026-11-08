# HANDOFF-GARNISON-SELECTION — Le sprite complet quand l'unité en ville est sélectionnée

**Décisions Erik 14/10.** Suite directe d'ICONES-UNITES (garnison compacte) : l'unité stationnée dans une ville reste compacte (icône + barre) SAUF quand elle est sélectionnée — alors c'est le sprite complet qui s'affiche.

## 1. Préalables

- Lire le rendu garnison d'ICONES-UNITES (sprite masqué en ville, icône+barre, pile ×N), l'alternance de sélection ville↔unité (R-2, re-clic), l'anneau de sélection (REGLAGES-CALIBRAGE), la position de mêlée/centrage (PLACEMENT-MELEE, « stabilisée »).
- Baseline : suites vertes à jour (web notamment), `schemaVersion` 27, **client seul**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 14/10 — défaut appliqué, veto possible)

- **D1 — Visible si sélectionnée** : unité sur une case de ville + `selectedUnitId` = CETTE unité → **sprite complet** (position standard de mêlée, anneau et barre normaux) à la place de l'icône compacte.
- **D2 — Compacte sinon** : dès la désélection (clic ville, clic ailleurs, sélection d'une autre entité) → retour immédiat à icône + barre.
- **D3 — Pile en ville** : la règle vaut pour l'unité SÉLECTIONNÉE seulement ; les autres de la pile restent compactes (badge pile ×N inchangé).
- **D4 — Ennemis en ville** : visible selon le fog existant — pas de changement (jamais « sélectionnable » par le joueur, donc toujours compacts).
- **D5 — Replay/couture/60 FPS** : la bascule s'applique aux copies couture et pendant la relecture (unités affichées) ; zéro allocation par frame.

## 3. Mission

- **L1 — test-first** : décision d'affichage PURE (état ville + sélection → compacte/complet) : sélectionnée → complet ; désélectionnée → compacte ; pile → sélectionnée seule complète ; ennemi → toujours compact.
- **L2 — rendu** : brancher le prédicat au calque entités (la bascule au CHANGEMENT de sélection — pas un rebuild global par frame).
- **L3 — captures GUI avant commit** (`dev-logs/captures-garnison-selection/`) : unité en ville compacte → sélection (clic alternance) → sprite complet → désélect → compacte ; pile en ville ; couture si facile.
- **L4** : suites web vertes, svelte-check 0, commit, push, mini-rapport `REPORT-GARNISON-SELECTION.md`.

## 4. Critères d'acceptation

Le scénario d'Erik : cliquer la ville bascule vers l'unité — le sprite complet apparaît ; re-cliquer repasse à la ville — l'icône compacte revient. Tout le reste inchangé.

## 5. Périmètre interdit

Moteur/serveur ; la mécanique d'alternance R-2 (affichage seul) ; les icônes/barres existantes ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
