# HANDOFF-ASSETS-VILLES-ERRES — Sprites ville/capitale 4K par ère, une seule image pour toutes les nations

**Décisions Erik 15/10** : abandon des couleurs par nation pour les villes — UNE image par (type, ère) pour tous les joueurs ; asset distinct capitale/ville ; changement d'ère = mise à jour du sprite. Sources : `new_villes/` d'Erik (NE JAMAIS committer tel quel).

## 1. Préalables

- Lire le rendu des villes 2D (choix de texture par accent — les variantes actuelles), `wrap.ts`, le pipeline 4K (recuisson, mapping data-driven), les ères moteur (T-36, `EraChanged`, transition au tour suivant).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul** attendu (l'ère du propriétaire est dans l'état filtré). Vérifier `git status`.

## 2. Correspondances (nommages Erik — PIÈGES : `vile`, espace, fichier médiéval décalé)

| Sprite | Fichier source |
|---|---|
| Ville, Ère Ancienne | `new_villes/vile_ancient/vile_ancient_trsp.png` |
| Ville, Médiévale | `new_villes/ville_medievale/vile_medievale_trsp.png` |
| Ville, Industrielle | `new_villes/ville_industrielle/ville_industrielle_trsp.png` |
| Ville, Moderne | `new_villes/ville_moderne/ville_moderne_trsp.png` |
| Capitale, Ère Ancienne | `new_villes/capitale_ancient/capitale_ancient_trsp.png` |
| Capitale, Médiévale | `new_villes/capitale_medievale/capitale_medievale_trsp.png` |
| Capitale, Industrielle | `new_villes/capitale_industrielle/capitale industrielle_trsp.png` *(espace !)* |
| Capitale, Moderne | `new_villes/capitale_moderne/capitale_moderne_trsp.png` |

## 3. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Un sprite pour toutes les nations** : plus aucune variante par accent/joueur pour ville et capitale ; le joueur se lit sur la bannière (logo nation) et les frontières — inchangées.
- **D2 — Ère du propriétaire** : le sprite affiché = l'ère COURANTE du joueur propriétaire (4 ères) ; au changement d'ère (transition au tour suivant, événement `EraChanged`), les sprites se mettent à jour (rebuild propre).
- **D3 — Pipeline** : les 8 PNG 4K RGBA recuits/redimensionnés au calibre d'affichage (cache, poids maîtrisé) ; mapping data-driven `type × ère → fichier` ; **repli** : entrée/ère absente = sprite actuel (jamais de trou).
- **D4 — Calibre data-driven** (échelle/ancrage, miroir des unités) — à l'œil Erik après livraison.
- **D5 — Intouchés** : bannière, étoile capitale, frontières culturelles, lueur/anneaux, villages/huttes/camps barbares, vue ville zoomée (dormante), tout le 3D, couture (copies wrap) et 60 FPS.

## 4. Mission

- **L1 — test-first (client)** : mapping complet (8 entrées, repli), choix du sprite par ère du propriétaire (fixture par ère), capitale vs ville, aucun changement gameplay.
- **L2 — pipeline/rendu** : recuisson 8 sources, mapping, branchement au rendu (sélection par ère, rebuild à `EraChange`), mise en archive des anciennes variantes d'accent (motif `archives/`).
- **L3 — captures GUI avant commit** (`dev-logs/captures-assets-villes-erres/`) : capitale+ville à 2 ères différentes (deux joueurs d'ères distinctes sur la même carte si possible), ville ennemie, couture, zoom.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-ASSETS-VILLES-ERRES.md` (🔶 calibre à l'œil).

## 5. Critères d'acceptation

1. Les 8 sprites Erik affichés, uniques pour toutes les nations, bonne ère par joueur ;
2. Changement d'ère (comptage T-36) → les villes du joueur passent à l'image de la nouvelle ère ;
3. Repli propre, suites vertes, couture et perf préservées.

## 6. Fin de session

Rapport (🔶 calibre), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
