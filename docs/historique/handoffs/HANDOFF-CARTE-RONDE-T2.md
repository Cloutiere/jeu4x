# HANDOFF-CARTE-RONDE-T2 — Rendu sans couture (client seul)

**Décisions Erik 04/10.** Suite directe de CARTE-RONDE T1 (`1df59d4`+`e4a8f6c`, acceptée) : le monde est cylindrique dans les règles ; cette tranche le fait **voir** — la caméra boucle Est↔Ouest, aucune couture visible, tout geste traverse le bord.

---

## 1. Préalables

- Lire REPORT-CARTE-RONDE-T1.md (espace colonne, normalisation) et `apps/web/src/lib/render/` (GameCanvas, calques, `interaction.ts`, minimap, previews `preview.ts`, ZONE-CULTIVEE/EXPANSION-CULTURELLE dans `contours.ts`).
- Baseline : suites vertes (rules 993 + web 506 + server 120), svelte-check 0, `schemaVersion` 27. **Client seul** — zéro moteur/serveur/protocole. Vérifier `git status` (sessions parallèles possibles ; serveur dev 5174 d'Erik — ne pas y toucher).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Caméra bouclante** : le pan horizontal Est↔Ouest est modulo la largeur totale du monde ; la scène est dessinée AU MOINS DEUX FOIS (copie décalée de ±largeur monde — calque terrain ET calques entités/overlays), de sorte qu'aucun bord n'existe à l'écran. Le dézoom maximal montre le monde qui se répète (acceptable, standard Civ).
- **D2 — Tout calque wrap** : entités, barres PV, anneau de sélection, flèches/fantômes FLECHE-MOUVEMENT, previews, ZONE-CULTIVEE, anneaux culturels, glyphes de rendement, brouillard, huttes/villages/artefacts — tout ce qui se pose en pixels passe par la même transformation (position colonne → pixel, avec duplication au voisinage de la couture). Aucune entité « coupée » au bord.
- **D3 — Clic et survol à la couture** : pixel→hex considère les deux candidats (écran × 2 copies) et retient le plus proche ; programmer un déplacement qui sort par la droite dessine la flèche qui REPART à gauche (les segments traversant la couture sont dessinés des deux côtés).
- **D4 — Minimap bouclante** : horizontalement périodique (la minimap se répète ou se raccorde — au choix de l'agent, lisible en priorité) ; clic/sélection du cadre de viewport wrap ; tuiles de couture cliquables.
- **D5 — Vue ville et replay** : double-clic vue ville (zoom À PLAT, cadrage des tuiles cultivables) et relecture REPLAY-RESOLUTION fonctionnent à cheval sur la couture (cadrage qui déborde = les deux copies) ; centrages (`centerOnHex`, badge unités sans ordres, entrées Chroniques cliquables) visent la copie la plus proche du viewport courant (pas de téléportation de caméra par grand saut).
- **D6 — Fog et sélections inchangés** : aucune révélation, aucun changement de gameplay — présentation seule. Perf : pas de rebuild de calque par frame (réutiliser les pools/cache existants — VUE-VILLE-PERF) ; le doublage est une transformation d'affichage, pas une recréation.

## 3. Mission

- **L1 — test-first (client)** : tests unitaires sur la transformation (position → pixel × copies, candidat de clic le plus proche, segments de flèche traversant, cadrage caméra modulo) ; réutiliser le motif des suites `interaction`/`preview` pures.
- **L2 — rendu** : D1/D2 (la transformation est UNE fonction partagée par tous les calques — pas de copie ad hoc par calque) ; D3 clic/survol ; D4 minimap ; D5 vue ville/replay/centrages.
- **L3 — vérification GUI locale avec captures AVANT commit** (règle Erik) : partie solo légale — traversée à pied ET en bateau à l'écran, flèche traversant le bord qui repart à gauche, clic à cheval sur la couture, minimap, vue ville près du bord, relecture d'un tour avec traversée, perf 60 FPS au pan continu. Captures `dev-logs/captures-carte-ronde-t2/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push (CI déploie), rapport `REPORT-CARTE-RONDE-T2.md`.

## 4. Critères d'acceptation

1. Pan infini Est↔Ouest sans bord visible ; aucune entité coupée ;
2. Programmation d'un déplacement traversant la couture : flèche + exécution visuelles correctes ;
3. Clic précis sur une tuile à cheval sur le bord ; minimap et vue ville conformes ;
4. Aucune régression des rendus existants (captures avant/après comparées) ; 60 FPS.

## 5. Périmètre interdit

Moteur/serveur/protocole ; les 🔶 tranchages T1 (forme rotation, tolérances, variee-40 — dossier séparé d'Erik) ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Rapport (choix de duplication, 🔶 visuels), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
