# HANDOFF-BARRES-CITYVIEW — Des vraies barres de progression à côté des compteurs de la vue ville

**Retouche UI du chapitre « menus »** (constat d'Erik du 15/09, capture à l'appui) : dans la vue ville, les cartes Nourriture / Frontière culturelle / Production affichent les compteurs (**12 / 20**, **8 / 10**, **0 / 10**) mais **aucune barre de progression visible** — juste un élément vide. Le style des barres de l'ancien panneau (fusionné en FUSION-MENU-VILLE) doit être rétabli et visible.

## 1. Préalables

Baseline : suite verte (**1169 tests**), typecheck 4/4, `schemaVersion` **23**, `git status` propre. Zéro gameplay, 3D intouché, `assets-src` intouché (atelier parallèle éventuel).

## 2. Mission

1. Dans `CityView.svelte` (les trois cartes **Nourriture**, **Frontière culturelle**, **Production**) : à côté de chaque compteur « X / Y », une **barre de progression visible** — remplissage proportionnel (X/Y, plafonné à 100 %), style reprenant les barres de l'ancien panneau (piste sombre + remplissage de la couleur de la ressource : vert nourriture, violet culture, ocre production — constantes 🔶 à l'œil par Erik) ;
2. Le caractère « | » orphelin visible à l'écran (résidu de l'élément de barre mal stylé) disparaît ;
3. États limites soignés : 0/Y (barre vide), plafond atteint (« Plafond » — barre pleine ou état dédié), item sans file (carte production : pas de barre orpheline) ;
4. Les cartes restent par ailleurs inchangées (mêmes textes, bouton d'achat intact).

## 3. Vérification

1. Tests : ratios de remplissage (0, partiel, plein, plafond) — purs si extractibles ;
2. e2e + captures `dev-logs/captures-barres-cityview/` : les trois barres visibles avec remplissages distincts, plafond, aucune file ;
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 23, zéro diff 3D.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-BARRES-CITYVIEW.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
