# HANDOFF-ATELIER-POISSON-BALEINE — Refaire les assets Poisson et Baleine

**Session d'atelier visuel** (rituel `ATELIER-ASSETS.md` — il se lit EN PREMIER et prime sur ce qui suit pour le déroulé). Mission spécifique d'Erik : **refaire les assets des ressources Poisson et Baleine**, en veillant à ce que **la baleine soit visiblement plus grosse que le poisson** (échelle relative lisible sur la carte — les deux vivent sur des cases d'eau voisines, la comparaison se fait à l'œil en jeu).

## Contraintes

1. Source de vérité : **`assets-src/tools/generate.py`** (painters des ressources marines), propagation `sync-art` — itération à l'écran avec Erik AVANT tout commit (règle établie) ;
2. **Échelle relative** : les deux assets dessinés dans un gabarit commun — la baleine occupe nettement plus de place que le poisson (ratio visible en taille réelle de carte, pas seulement en zoom atelier — montrer les deux côte à côte sur des cases d'eau) ;
3. Style : le style enrichi validé en atelier (référence ATELIER-STYLE-ENRICHI) — pas de retour au flat basique ;
4. Catalogue : dimensions/ratios du test de complétude inchangés (ou test ajusté si un ratio change, avec justification) ; pas d'accent joueur sur les ressources ;
5. Aucun fichier de jeu (composants, render) — l'atelier et `assets-src` seulement ;
6. `pnpm test` + typecheck verts avant tout commit demandé ; tests web attendus verts (catalogue).

## Fin de session

Itérations à l'œil → Erik valide → commit de l'atome validé sur sa demande explicite (message citant les assets), déploiement CI, arrêt, remise de la main.
