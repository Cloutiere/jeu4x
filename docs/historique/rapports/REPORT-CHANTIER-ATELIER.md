# RAPPORT CHANTIER — Atelier d'assets (`#/atelier`)

**Date :** 05/09/2026 · **Baseline :** 829 tests → **839 verts** (695 rules + 106 web + 38 serveur, dont +9 tests atelier) · **Typecheck :** 0 erreur · **Rituel complet testé en local (5174).**

## Livré

- **L0 — Catalogue** (`apps/web/src/lib/atelier/catalogue.ts`) : index généré des sources de vérité — `visuel3d.json` via `spec3d.ts` (terrains 3D, structures 3D, cartes), registres moteur `@game/rules` (sprites 2D : unités, bâtiments, ressources, artefacts, icônes), overlays programmatiques. **178 assets**, 5 catégories. Test de complétude `tests/atelier-catalogue.test.ts` (9 tests) : ressources ↔ cartes 1:1, terrains moteur ↔ tuiles 3D, sprites référencés par `textures.ts` ↔ PNG de `public/art`, filtrage pur testé sans DOM.
- **L1 — Page `#/atelier`** (`apps/web/src/pages/Atelier.svelte`, route en **première branche** du routeur comme `#/lab3d` — aucun appel `/api`, aucune garde de session) : barre de catégories + recherche (id exact ou nom FR), grille avec aperçus (vignette PNG / pastille couleur de la spec), **vue d'isolement** — 3D : `Stage3D` + `TerrainWorld`/`StructuresWorld` sur une tuile, **caméra orbitale** (glisser/molette ; `cam.apply` remplacé sur l'instance car `render()` l'appelle à chaque frame — sinon orbite écrasée), interrupteurs **Bloom / Animation / Fond clair / Grille hex** (voisinage hex rendu), contrôles **pop / Capitale** pour le Mainframe ; sprites : damier + **variantes d'accent** p1/p2/barbare teintées canvas depuis le calque `_accent` blanc ; **fiche** : id exact + bouton copier (fallback `execCommand`), catégorie, source de vérité, **note de session** persistée (`atelier:note:<id>`, sauvegarde à chaque frappe).
- **L2 — Avant/après** : snapshot JPEG du rendu posé automatiquement au **premier isolement** de chaque asset 3D (`atelier:ref:<id>`), bouton « Refaire la référence (après) », **Comparer A/B** (volet AVANT 50 % à gauche du rendu courant). **Testé de bout en bout** : modification de `structures.cartes.ble` dans `visuel3d.json` (`couleur #FFB020`, `taille 1.4`) → rechargement complet → A/B montre l'ancienne carte vs la nouvelle dorée agrandie → JSON annulé (arbre propre).
- **L3 — Vérification** : charge sans session ni API (page rend 178 assets immédiatement) ; **60 FPS** en orbite sur asset isolé (compteur affiché) ; captures dans `dev-logs/captures-atelier/` (catalogue, montagne + grille hex, Mainframe capitale, sprites accents) ; 839 tests verts, typecheck vert.

## Décisions

1. **Catalogue = dérivation, pas duplication** : aucune liste en dur — les ids viennent des registres (`TERRAINS`, `UNIT_TYPES`, `BUILDINGS`, `RESOURCES`, `ARTEFACTS`, `TERRAINS3D`/`STRUCTURES3D`). Un asset moteur nouveau apparaît automatiquement ; le test de complétude casse si sa carte/tuile/sprite manque.
2. **« PNG absent » dynamique** : les ids moteur sans art (16 unités uniques, 4 pièces de vaisseau, `tile_cratere`) s'affichent « PNG absent » (détection `onerror`) — quand `generate.py` produira le PNG, l'atelier l'affiche sans changement de code.
3. **Overlays = fiches seules** : effets programmatiques (aucun fichier) — la fiche pointe vers le code source, pas de rendu isolé (divergence documentée dans ATELIER-ASSETS.md).
4. **Stage3D paresseux** : le canvas 3D n'existant qu'après sélection, le stage est installé par l'effet de reconstruction (et réinstallé si l'élément canvas est recréé au retour en vue 3D) — corrige la « vue noire » du premier essai.
5. **Structures du catalogue** : 9 entrées (`slot`, `carteNeutre`, `mainframe`, `mainframePalier`, `mainframeCapitale`, `mainframeMerveille`, `cratere`, `hutte`, `village`) rendues en isolant via `planifierStructures` avec entrées minimales (tuile prairie/ville + entité) — zéro duplication de géométrie.

## 🔶 Ouvertures (non bloquant, à calibrer en session)

- **`tile_cratere` référencé mais absent** (`TILE_ASSETS`) — GAP repéré par le test de complétude ; art 2D à créer dans `generate.py` si un jour le rendu 2D revient (sans effet en 3D).
- art manquante : unités uniques & vaisseau (au-delà des alias `UNIQUE_UNIT_ALIASES`) — visible « PNG absent » dans l'atelier.
- Tailles/cadrage orbite (dist défaut 2.2, cible y 0.2) — calibrage fin à l'usage.
- `schemaVersion` inchangée (18) : page client-side pure, aucune migration.

## Fin de session

Commit + push effectués (CI standard — page inerte côté gameplay). Serveur de dev arrêté. Main remise au pilot : **prochaine session = première session d'atelier avec Erik** (lire ATELIER-ASSETS.md en tête).
