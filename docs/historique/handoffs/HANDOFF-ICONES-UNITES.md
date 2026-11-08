# HANDOFF-ICONES-UNITES — Icônes d'unités : bannière, terrain, garnison compacte

**Décisions Erik 07/10** (tranchés D1-D5 présentés — veto possible). Sources : `new_icones/units/` d'Erik (guerrier livré ; les autres unités suivront) — NE JAMAIS les committer tels quels.

## 1. Préalables

- Lire le rendu des unités 2D (calques entités, barre de vie — `calibration-unites.ts`), les badges d'état (😴/✚ ORDRES-UNITES), la bannière de ville (cercle production à initiale, BANDE-VILLE + BANDE-DETAIL), le pipeline d'assets (import/recuisson, mapping data-driven, repli), les palettes d'accent 4 tons (`accents.json`).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul**. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 07/10 — non négociables)

- **D1 — Bannière** : icône à la place de l'initiale dans le cercle production, POUR LES UNITÉS ; bâtiments et unités sans icône livrée = initiale en repli (aucun trou visuel).
- **D2 — Terrain** : icône dans un carré à l'accent de civilisation (palettes 4 tons), À GAUCHE de la barre de vie ; largeur totale (icône+barre) = largeur actuelle de la barre seule (réduction proportionnelle) ; badges 😴/✚ inchangés (consigner leur arrangement final).
- **D3 — Garnison compacte** : toute unité présente sur une case de VILLE (amie ou ennemie visible) s'affiche icône + barre de vie SEULE (le sprite complet est masqué) — la ville reste lisible ; pile = icône + badge pile ×N existant ; hors ville : sprite complet inchangé.
- **D4 — Pipeline** : recuisson des images (mapping `type → icône` data-driven dans le style des assets actuels), repli initiale automatique par type, tailles des deux usages calibrables séparément.
- **D5 — Fog inchangé** : icône ennemie visible seulement si l'unité l'est déjà (aucune info nouvelle).

## 3. Mission

- **L1 — test-first (client)** : mapping icône (guerrier = icône ; les autres = initiale), bannière (cercle unité → icône, bâtiment → initiale), garnison (sprite masqué, icône+barre affichée, pile ×N), largeur icône+barre ≤ largeur historique.
- **L2 — pipeline/rendu** : recuisson guerrier, carré accent (teinte par propriétaire — même mécanique que les unités), câblage bannière + terrain + garnison.
- **L3 — vérification GUI locale avec captures AVANT commit** : guerrier en campagne (icône+barre), guerrier en garnison (ville lisible), pile en ville, bannière avec production guerrier (icône) et bâtiment (initiale), ennemi visible en ville, à l'œil pour le calibre. Captures `dev-logs/captures-icones-unites/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-ICONES-UNITES.md` (liste des icônes attendues pour les autres unités, 🔶 calibres à l'œil).

## 4. Critères d'acceptation

1. Guerrier : icône en bannière, icône+barre sur le terrain, garnison compacte ;
2. Les autres unités : initiale en repli, ZÉRO régression visuelle ;
3. La ville garnisonée reste lisible (le but d'Erik) ;
4. Suites vertes, couture et 60 FPS préservés.

## 5. Périmètre interdit

Moteur/serveur/protocole ; les mécaniques de garnison (affichage seul) ; les badges d'état ; tout le 3D ; `schemaVersion` ; les répertoires d'Erik jamais committés tels quels.

## 6. Fin de session

Rapport (pipeline prêt pour les icônes suivantes, 🔶 calibres), arrêt, remise de la main.
