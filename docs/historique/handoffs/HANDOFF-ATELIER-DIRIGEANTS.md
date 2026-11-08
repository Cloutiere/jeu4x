# HANDOFF-ATELIER-DIRIGEANTS — Portraits de dirigeants (grand format, très détaillés) — Napoléon d'abord

**Session d'atelier visuel** (rituel `ATELIER-ASSETS.md` — il se lit EN PREMIER et prime pour le déroulé). Mission d'Erik : créer les **assets de dirigeants** en **grand format et beaucoup plus détaillés** que les sprites habituels, en débutant par **Napoléon**, associé à la **France**.

## Décisions et contraintes

1. **Format** : grand format — nouvelle taille de canvas dédiée (ex. 256×256 ou plus, à calibrer ensemble avec Erik dès la première itération ; les portraits de dirigeants ne partagent PAS le gabarit 64×64 des tuiles/unités) ;
2. **Détail** : c'est l'occasion de pousser le vocabulaire du générateur plus loin que les unités (visage, uniforme, décor) — style enrichi validé en atelier, itération à l'œil avec Erik à CHAQUE étape ; si le rendu voulu dépasse ce que les painters polygonaux savent faire, EN PARLER à Erik (option : art fourni par Erik et intégrée au catalogue — même emplacement data-driven, « l'asset arrive sans changement de code ») ;
3. **Pipeline** : `generate.py` + `sync-art` (source de vérité), catalogue à jour (le portrait doit apparaître dans l'atelier, catégorie dédiée « Dirigeants » si nécessaire) ; dimensions/ratios du test de complétude étendus au nouveau gabarit avec justification ;
4. **Périmètre** : assets seulement — AUCUN branchement gameplay/UI (l'association dirigeant→civ dans les menus sera un chantier séparé quand plusieurs portraits existeront) ; France/Napoléon d'abord, les autres civs viendront en sessions suivantes ;
5. Aucun accent joueur sur les portraits ; `pnpm test` + typecheck verts avant tout commit demandé.

## Fin de session

Itérations à l'œil → Erik valide Napoléon → commit de l'atome validé sur sa demande explicite (message citant l'asset), déploiement CI, arrêt, remise de la main.
