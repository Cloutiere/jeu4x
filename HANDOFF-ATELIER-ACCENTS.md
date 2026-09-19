# HANDOFF-ATELIER-ACCENTS — Enrichir les zones d'accent : détails internes au lieu d'aplats plats

**Session d'atelier visuel** (rituel `ATELIER-ASSETS.md` — il se lit EN PREMIER et prime pour le déroulé). Mission d'Erik : les éléments colorés par l'accent joueur méritent des **détails internes** — exemple : le bouclier du guerrier ne doit pas ressembler à un **cercle plat**, mais porter des lignes et cercles noirs (décor, rayons, liseré) visibles **sous la teinte du joueur**.

## Contraintes techniques et de style

1. **Source de vérité** : `assets-src/tools/generate.py` (painters), propagation `sync-art` — itération à l'écran avec Erik AVANT tout commit (règle établie) ;
2. **Mécanique d'accent à préserver** : l'accent est un calque blanc teinté à l'exécution (multiplicatif). Les détails doivent donc être dessinés en **encre sombre (contour INK) par-dessus/à l'intérieur de la zone d'accent** — le noir survit à toute teinte joueur ; vérifier le rendu avec **plusieurs accents** (menthe J1, rouge barbare, au moins un J3+) à chaque itération ;
3. **Commencer par le guerrier** (bouclier détaillé comme référence), puis étendre aux éléments d'accent des autres unités **une par une avec validation d'Erik** (archer, cavalier, légion…) — ne jamais bâcler un lot d'un coup ;
4. Catalogue : dimensions/ratios inchangés, tests et typecheck verts avant tout commit demandé ;
5. Aucun fichier de jeu touché (le teintage runtime existe déjà — c'est l'art qui s'enrichit).

## Fin de session

Itérations à l'œil → Erik valide → commit de l'atome validé sur sa demande explicite (message citant les assets), déploiement CI, arrêt, remise de la main.
