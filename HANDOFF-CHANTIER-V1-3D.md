# HANDOFF CHANTIER V1 — Rendu du jeu en vraie 3D (Three.js)

Tu reprends le pilotage de l'implémentation pour le premier chantier visuel. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**796 tests**), **les sources visuelles d'Erik qui font foi : [Refonte Cybernétique De Civilization Revolution.md](Refonte%20Cybernétique%20De%20Civilization%20Revolution.md) (§Langage visuel des tuiles — décisions du 04/09) et le prototype de référence [prototypes/tuile-secteur-memoire-flux/](prototypes/tuile-secteur-memoire-flux/) — Three.js, spec déclarative `design.js` (8 terrains, glyphes bus/CPU/RAM, élévations sémantiques, teintes par terrain)**. `RULES.md` (rendements §2/R-66/R-93 — le rendement affiché DOIT rester exact case par case), fog R-70..R-73, brouillard 3 états. `schemaVersion` : **18 — AUCUNE migration attendue (chantier de rendu pur, zéro changement de gameplay)**.

**Contexte.** Le spike visuel est tranché : **faux 3D abandonné, vraie 3D Three.js retenue** (décision d'Erik du 04/09). Le prototype valide le langage : potentiel de la tuile affiché en glyphes pâles, rendement actif allumé, glyphes d'une seule couleur néon, élévations fixes (eau plus basse ; plaine/prairie/forêt base ; colline +1 ; montagne +2), substrat teinté par terrain. **Ce chantier porte le plateau RÉEL (40×40) dans Three.js, gameplay strictement identique.**

## ⛔ L0 — SPIKE D'ARCHITECTURE IN-SITU : ARRÊT-POUR-APPROBATION (modèle 7b — OBLIGATOIRE AVANT TOUT LE RESTE)

Implémente une **preuve de rendu minimal sur le vrai jeu** (une seule tranche de la carte réelle, ~10×10, avec fog, une ville et une unité) sous **les deux architectures candidates**, mesure, et **STOPPE** en présentant à Erik :

1. **Option A — Remplacement complet de PixiJS par Three.js** (une seule scène 3D : terrain + structures + unités en sprites/billboards ou volumes simples, UI DOM inchangée) ;
2. **Option B — Couche hybride** : terrain 3D Three.js en fond (tuiles, élévations, glyphes, eau), sprites 2D PixiJS superposés pour unités/villes/ressources avec projection caméra partagée.

Critères mesurés à présenter dans le rapport d'arrêt : performance 40×40 (comptage d'objets, instancing/merged geometry, FPS cible ≥ 60 desktop), **picking hex → sélection** (le cœœur de l'interaction : clic/drag/zoom/pan actuels doivent survivre sans régression), **fog en 3D** (cases inexplorées invisibles/cachées, pings artefacts), lisibilité des glyphes à tous les niveaux de zoom, coût de maintenance de chaque option, risque sur les tests d'interaction existants (`interaction.test.ts` etc.). **Aucune écriture RULES.md avant l'approbation d'Erik** — le choix d'architecture est une décision de design (modèle 7b : maquette avant implémentation).

## Après approbation — livrables dans l'ordre

- **L1 — Portage de la spec visuelle** : le `design.js` du prototype devient une **spec déclarative data-driven** (`assets-src` ou `packages/rules/data/visuel.json` 🔶 — couleurs, élévations, glyphes par terrain calibrables sans code) ; intégration du pipeline `generate.py`/`sync-art` si des assets 3D sont nécessaires ;
- **L2 — Terrain complet 40×40** : les 8 terrains (prairie, plaine, forêt, colline, montagne, désert, mer, océan) + **cratère** (déclinaison stérile 7m) ; caméra pan/zoom/culling (limites de la carte), lueur/activations selon le **rendement réel** (miroir exact des helpers moteur partagés — `tileYield`, les worked tiles, les bonus de civ R-146 et les bâtiments s'affichent comme « allumé »), **fog 3 états** (inconnu/exploré/visible), pings artefacts (R-155), ressource = glyphes distincts 🔶 (ou report V2 si le spike le recommande) ;
- **L3 — Interaction** : picking hex complet (sélection, chemins, ordres à la souris, clic droit, alternance unité/ville R-2), overlays (chemins fléchés idée 4, jetons), toasts/journal inchangés (DOM) ; **flag de repli** : garder le rendu 2D actuel derrière un flag `#/debug` ou setting 🔶 (défaut : oui, jusqu'à l'acceptation d'Erik) ;
- **L4 — Vérification & livraison** : tests d'interaction verts **sans réécriture sémantique** (c'est le critère clé — l'interaction reste identique), perf (mesures comparées au spike), e2e complet, GUI vs bot sur 5174, captures `dev-logs/captures-v1-3d/`, CI, prod health, **acceptation visuelle d'Erik obligatoire** (le rendu 3D se juge à l'œil — session en ligne prévue avec lui).

## Critères d'acceptation
- Le plateau réel s'affiche en 3D conforme au langage visuel d'Erik (teintes, élévations, glyphes, états allumé/pâle) ;
- **Aucun changement de gameplay** : même seed → même partie ; toute la suite de tests passe (adaptations de rendu seulement) ; schemaVersion inchangée ;
- Picking/pan/zoom/ordres sans régression (tests d'interaction) ; fog et pings corrects ;
- Performance : 40×40 fluide desktop (objectif ≥ 60 FPS, instancing si nécessaire) ;
- Baseline : tests verts (≥ 796), typecheck vert, CI deploy vert.

## Périmètre interdit (cette tranche)
**Ville, ressources complètes, unités/bâtiments en volume** (V2 — structures posées et calques, sauf si l'option A du spike les rend triviales — signaler) ; **renommage thématique** (V3 — les noms de base restent dans le code) ; **espionnage avancé** ; tout recalibrage de gameplay ; aucun changement de `packages/rules` (moteur) — si un helper manque pour l'affichage, passer par les sources uniques existantes, pas de logique dupliquée.

## Fin de session
**Rapport d'arrêt au L0** (comparatif A/B avec mesures, recommandation argumentée, captures des deux options) — puis après approbation, rapport `REPORT-CHANTIER-V1-3D.md` (décisions, perf, 🔶 à calibrer — palette, densité des glyphes, respiration/animation, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
