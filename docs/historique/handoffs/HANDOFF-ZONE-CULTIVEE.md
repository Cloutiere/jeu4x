# HANDOFF-ZONE-CULTIVEE — La zone des tuiles cultivées au style CivRev (contour + dégradé)

**Chantier du chapitre 2D** (post-pivot du 11/09). Décisions d'Erik du 13/09 : le visuel de la zone entoure **les tuiles cultivées réelles** (worked tiles), ajustement **en temps réel au clic**, une **seule ville** pour l'instant, **zéro toucher au 3D**. La référence visuelle est la capture CivRev fournie par Erik (liseré extérieur de la couleur du joueur, transparence dégradée vers l'intérieur — saturée sur le bord, s'estompant jusqu'à disparaître au centre des tuiles).

## 1. Préalables

1. Lire `RULES.md` (R-60 worked tiles, R-66 socle de ville), `PROJET.md` (§pivot du 11/09), `PILOT-HANDOFF.md` §3-§4, et `docs/historique/rapports/REPORT-INTERACTION-3D.md` (worked tiles = **file d'ordres par ville**, miroir `effectiveWorkedTiles`).
2. Baseline : suite verte (**1044 tests**), typecheck 4/4, `schemaVersion` **19**, `git status` propre. **Rendu 2D = seul chemin actif** (`rendu3d: false`).
3. **Zéro gameplay** : `packages/rules` src, serveur, `orderShapeError` intouchés. UX de rendu sur l'existant.

## 2. Contexte

La vue actuelle colore **toutes les tuiles cultivables** de la ville (contour + remplissage du rayon `workRadiusOf`, géométrie dans `contours.ts`, tracé dans `GameCanvas.svelte` ~ligne 1184 et bloc TRAVAIL-VILLE-3D ~ligne 206). Erik veut le style CivRev : la zone entoure **ce que la ville cultive réellement**, pas ce qu'elle peut cultiver. Le concept de territoire culturel n'existe PAS dans le moteur (reporté au backlog) — ce visuel est une **indication de contrôle, pas une frontière** ; il se branchera plus tard sur les vraies zones culturelles quand la culture générée les fera s'étendre (début de partie : la zone = les tuiles cultivées seulement). Un futur menu de ville (double-clic, zoom, tuiles sélectionnables) est annoncé comme prochaine étape — le liseré discret du rayon reste donc utile.

## 3. Décisions tranchées (validées par Erik le 13/09)

- **Zone = tuiles cultivées (worked tiles effectives)** de la ville, contour au style CivRev : liseré extérieur en `accent_joueur` de la civ du propriétaire, transparence **dégradée vers l'intérieur** (opaque/saturée sur le liseré, s'estompant, invisible au centre des tuiles). Constantes 🔶 en tête de bloc (couleur, épaisseur, paliers d'alpha) calibrables à l'œil par Erik.
- **Ajustement en temps réel** : cliquer/dé-cliquer une tuile cultivable met la zone à jour immédiatement, comme l'aperçu de déplacement — basé sur le miroir de la file d'ordres (`effectiveWorkedTiles` / état d'aperçu existant), PAS sur l'état post-résolution.
- **Le contour du rayon cultivable** : supprimé de la vue normale ; conservé **en version très discrète (liseré pointillé fin, sans remplissage) uniquement quand la ville est sélectionnée** — pédagogique (« ce que je peux encore cultiver ») et réutilisable par le futur menu de ville.
- **Une ville seule** : pas de fusion inter-villes dans ce chantier (session de validation de jonction prévue ensuite par Erik, séparément).
- **Les marqueurs de worked tiles existants** restent (petits marqueurs sur les cases cultivées) — la zone les habille, elle ne les remplace pas.

## 4. Mission

### M1 — Géométrie de la zone (purs, testés)
1. Dans `contours.ts` (ou module voisin) : produire le contour extérieur de l'**union des cases worked** de la ville (polygone fermé suivant les bords extérieurs des hexagones, géré pour les formes non convexes et les cases détachées — une worked tile discontigue produit sa propre boucle, comme le font déjà les contours de rayon).
2. Fonctions pures testées : entrée = ensemble de cases worked + rayon ; sortie = boucles de contour. Cas couverts : tuiles contiguës, trou intérieur (anneau), tuile détachée, zéro worked tile (pas de zone), ville de pop 1.

### M2 — Rendu 2D
1. Tracé du contour (liseré accent joueur) + **remplissage dégradé** vers l'intérieur (implémentation libre : couches de contour concentriques à alphas croissants, ou gradient par polygone — la lisibilité du dégradé prime, Erik tranche à l'œil).
2. Affichage par défaut de **toutes** les villes visibles (comme les frontières de l'empire dans la référence) — la zone d'une ville n'exige pas sa sélection.
3. Suppression du remplissage/contour actuel du rayon cultivable en vue normale ; liseré pointillé discret du rayon **à la sélection de la ville seulement** (réutiliser la géométrie existante de `contours.ts`).
4. Réactivité : la zone est recalculée au clic worked tile sans attendre la résolution (même flux que les marqueurs/flèches — invalidation du rebuild overlay).

### M3 — Vérification
1. Tests : fonctions pures (M1), test de rendu/compétence catalogue inchangé.
2. e2e + partie solo (captures `dev-logs/captures-zone-cultivee/`) : ville au départ (worked tiles par défaut) → zone autour des tuiles cultivées ; clic sur une tuile cultivable → la zone s'étend immédiatement ; dé-clic → se rétracte ; ville sélectionnée → liseré discret du rayon visible ; désélection → liseré disparaît.
3. Bench : le contour est calculé au rebuild (pas par frame).

## 5. Contrainte dure — le 3D n'est pas touché

**Interdiction absolue de modifier le rendu 3D** (calques 3D, bloc TRAVAIL-VILLE-3D, `poser3d`, `visuel3d.json`) même pour « garder la cohérence ». Si une fonction partagée de `contours.ts` est étendue, le comportement 3D existant doit rester bit-identique (tests 3D existants verts, aucun nouvel appel 3D vers les nouvelles fonctions). Le 3D rattrapera à la reprise, pas maintenant.

## 6. Critères d'acceptation

- Chaque ville visible montre sa zone de tuiles cultivées : liseré accent joueur + dégradé vers l'intérieur invisible au centre.
- Clic/dé-clic d'une tuile cultivable = la zone s'ajuste instantanément (avant toute résolution).
- Vue normale : plus de coloration du rayon cultivable ; ville sélectionnée : liseré pointillé discret du rayon.
- Suite verte, typecheck 4/4, zéro gameplay, `schemaVersion` 19, zéro diff dans les fichiers 3D.

## 7. Périmètre interdit

- Le concept de territoire/frontières culturelles (moteur, expansion, flip culturel — backlog) ;
- Toute modification 3D (§5) ;
- Le futur menu de ville (double-clic/zoom — prochaine étape d'Erik), les fichiers `packages/rules` src et serveur.

## 8. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-ZONE-CULTIVEE.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
