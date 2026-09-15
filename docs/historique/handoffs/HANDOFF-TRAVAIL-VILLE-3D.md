# HANDOFF-TRAVAIL-VILLE-3D — Worked tiles en 3D, toggle immédiat, rayon de cultivation

**Signalements d'Erik du 08/09** (captures dans la session) : les indicateurs de cases de production de la ville sont encore « sur le modèle 2D » (contours hexagonaux plaqués), la suppression/ajout passe par des marqueurs « +/− » au lieu d'un retour immédiat, et il manque le rayon de cultivation de la ville. **Zéro changement gameplay** : les worked tiles restent des ordres serveur (file d'ordres par ville, INTERACTION-3D) — tout ceci est rendu + UX.

## 1. Préalables

1. Lire `RULES.md` (worked tiles / SetWorkedTile), `PROJET.md`, `PILOT-HANDOFF.md` §3-§4 (item INTERACTION-3D : worked tiles = file d'ordres par ville, `effectiveWorkedTiles` miroir du moteur).
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19** (inchangée), `git status` propre.
3. Vérifier l'état des marqueurs actuels : où sont-ils dessinés (calque overlay 2D projeté ? calque 3D ?), qui les alimente (`effectiveWorkedTiles` ?), et où se logent les « +/− » (état d'attente d'ordre ?).

## 2. Mission

### M1 — Les marqueurs de worked tiles en vraie 3D
1. Remplacer les contours plaqués (modèle 2D) par des **contours hexagonaux 3D** : lignes posées SUR le relief de la tuile (suivent l'élévation — eau plus basse, colline/montagne plus hautes), épaisseur/lisibilité constantes à tous les zooms, couleur joueur comme aujourd'hui (le rouge des captures actuelles = accent).
2. Le contour 3D doit vivre dans le calque 3D quand le jeu est en 3D (et le 2D garde son rendu propre — les deux modes restent cohérents).
3. Réutiliser la convention des effets existants (LINES 0 triangle, émissif léger, fog : pas de marqueur hors vision).

### M2 — Toggle immédiat (fin des « +/− »)
Comportement voulu par Erik :
1. **Retirer une case en production → le marqueur disparaît IMMÉDIATEMENT** au clic (pas de « − » en attente) ;
2. **Cliquer une autre case → son marqueur apparaît IMMÉDIATEMENT** (pas de « + ») ;
3. L'état affiché est **optimiste** : l'UI reflète la file d'ordres telle que le joueur vient de la composer (les ordres restent envoyés au serveur et validés comme aujourd'hui — en cas de refus serveur, retour à l'état valide avec le message d'erreur existant) ;
4. Supprimer les marqueurs « +/− » du chemin de rendu (et leur code mort éventuel) ; les indicateurs de la file d'ordres de la ville (panneau ville) restent inchangés.

### M3 — Le rayon de cultivation de la ville
1. Une **ligne fermée de la couleur du joueur** qui trace le contour EXTÉRIEUR des 6 cases entourant la ville (le grand hexagone à rayon 1) — visuellement « un grand cercle délimité par les 6 hexagones », comme les contours rouges intérieurs des captures mais en contour extérieur englobant.
2. **Ne modifie PAS la couleur des tuiles** — uniquement la ligne.
3. Posée sur le relief (miroir M1), visible en 2D et 3D, dans le fog (masquée si hors vision).
4. **Data-driven et extensible** : le rayon est une entrée de configuration (défaut 1), car un rayon plus grand arrivera avec l'aqueduc — le contour doit se tracer correctement pour un rayon quelconque (ring hexagonal générique, pas un contour codé en dur à 6 cases). L'entrée aqueduc elle-même est HORS périmètre.
5. Affichage : le contour de cultivation est visible quand la ville est sélectionnée (comportement par défaut proposé — Erik ajustera à l'œil).

## 3. Critères d'acceptation

- En 3D : contours de worked tiles 3D posés sur le relief, couleur joueur ; en 2D : rendu cohérent.
- Clic sur une case produite → disparition immédiate ; clic sur une case libre du rayon → apparition immédiate ; aucun « +/− » visible.
- Le contour de cultivation (rayon 1) trace le pourtour exact des 6 cases, couleur joueur, sans modifier les tuiles ; paramètre de rayon testé aussi avec une valeur > 1 (test unitaire, pas d'UI).
- Aucune régression des ordres worked tiles (tests INTERACTION-3D verts) ; suite complète verte ; typecheck 4/4 ; `schemaVersion` 19.
- Vraie partie solo (captures `dev-logs/captures-travail-ville-3d/`) : sélection de ville, toggle de 2 cases, contour visible, en 2D ET 3D.

## 4. Périmètre interdit

- Toute règle gameplay : nombre de worked tiles, file d'ordres, validation serveur, aqueduc (le rayon étendu arrive plus tard — seule la génériCITÉ du contour est en scope) ;
- `packages/rules`, serveur, `schemaVersion` ;
- Les cartes-ressources/slots 3D, les glyphes, V3 renommage.

## 5. Fin de session

Rapport `REPORT-TRAVAIL-VILLE-3D.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md (le pilot s'en charge).
