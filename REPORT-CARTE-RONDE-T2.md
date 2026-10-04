# REPORT-CARTE-RONDE-T2 — Rendu sans couture (client seul)

**04/10/2026.** Exécution de HANDOFF-CARTE-RONDE-T2 (décisions Erik D1-D6). Le monde
cylindrique (T1, `1df59d4`) devient **visible** : caméra bouclante Est↔Ouest, tous les
calques dupliqués au voisinage de la couture, gestes à cheval corrects. Zéro moteur /
serveur / protocole — `schemaVersion` 27 inchangée, suites rules 993 et server 120
**intouchées** (bit-identiques).

## Ce qui est livré

### Le module pur `wrap.ts` (L1 — test-first, 20 tests `tests/wrap.test.ts`)

Toute la transformation est UNE fonction partagée (exigence L2), pure, sans PixiJS :

- `periodeHorizontale(size, W)` = √3·size·W ; sentinelle SANS_WRAP → Infinity (monde plat) ;
- `envelopperX` replie tout x dans la bande canonique [0, P) — x et x+kP sont LA même case ;
- `copiesDe(x0, vx0, vx1, P)` : indices de copie k nécessaires (exactement celles qui
  intersectent la fenêtre — économie D6 : loin de la couture, exactement 1 copie = coût nul) ;
- `deplierPoints` : DÉPLIE une polyligne canonique en tracé continu — un chemin qui sort
  par la droite REPART à gauche (D3) ;
- `copiesPolyline` : copies nécessaires pour un tracé déplié (le segment traversant est
  dessiné une seule fois, À CHEVAL sur la couture, donc visible des deux côtés) ;
- `hexCanoniqueSousPoint` : picking — point monde replié + `normalizeHexW` (espace
  COLONNE de T1, jamais q brut) → toujours une case canonique de la carte ;
- `copieLaPlusProche` / `pointProcheDe` / `colonneVirtuelle` pour les centrages, le
  playback et le culling.

### Caméra bouclante (D1)

`Camera.wrapClamp(bounds, vw, vh, P)` (camera.ts) : le centre caméra est REPLIÉ dans
[0, P) (saut de ±P invisible, la scène étant périodique) ; la borne verticale 30 % de
`clamp` s'applique inchangée. Tous les sites caméra de GameCanvas (pan, molette,
`centerOnHex`, `centrerSurMonde`, `maybeCenter`, zoom de départ, resize) passent par
`wrapClamp`. Le PAN ne rebuild que les tuiles (comme avant) ; le pan **sur la couture**
(`panSurSeam()`) re-invalide entités+surcouche pour y rafraîchir les copies ; molette,
centrages et resize invalident tout (la demi-largeur du viewport change).

### Tous les calques wrap (D2)

- **Tuiles + ressources** : culling wrap `hexesInRectW` (hexView.ts) — colonnes
  virtuelles repliées, sprites clés `key` (k=0) / `key@k` (copie k·P).
- **Entités** (unités, villes, villages, huttes, artefacts) : copies d'affichage clées
  `id@k`, REFLETS synchronisés sur le sprite de base par `syncCopie` (position, échelle,
  tri zIndex, barres PV, labels) — jamais des données ; prune à chaque rebuild.
- **Surcouche** : frontières, anneaux culturels, worked tiles, zone cultivable,
  rendements (glyphes + Textes du pool), croix d'attaque, cases disputées, arrivée
  ennemie (anneau + fantôme + badge), badges de tours, anneaux de sélection et de
  survol, lueur d'artefact — chaque item passe par `avecCopies(x, dx => …)`.
- **Contours à travers la couture** : les ensembles de cases (bande culturelle, rayon
  de cultivation, zone cultivable de la ville sélectionnée) sont ÉTENDUS aux colonnes
  virtuelles (`hexesCopies` + `hexesWithinRadiusW` — plus aucune boucle dq/dr en q brut)
  avant `contourUnion` : le liseré chaîne À TRAVERS la couture au lieu d'être coupé.
- **Flèches** (ordre, chemin gelé, préview maintien, brouillon, annonces de playback) :
  dépliées puis dessinées par copie — le segment traversant est continu sur les deux
  bords, badges de tours dupliqués.
- **Playback** : interpolation DÉPLIÉE (`pointProcheDe`) — l'unité animée passe PAR LA
  COUTURE au lieu de retraverser le monde ; effets (flashs, destructions) dupliqués.

### Clic, survol, centrages (D3/D5)

`hexSousEcran` (carte ET vue ville) passe par `hexCanoniqueSousPoint` — e2e : picks
écran au centre/ouest/est d'une caméra posée sur la couture → colonnes canoniques
[0, 38, 37, 2]. Les centrages (`centerOnHex`, badge sans-ordres, Chroniques, ancrage
du popover `hexEcran`) visent la copie la plus proche du viewport ; l'entrée en vue
ville (dormante, cf. 🔶) visait aussi cette copie.

### Minimap bouclante (D4)

Choix « se RACCORDE » (lisible en priorité) : image canonique unique ; le viewport à
cheval est DECOUPÉ en deux rects (`rectsCameraMinimap`, période déduite de la géométrie)
— visible en capture ; le clic/drag normalise la colonne (`caseSousMinimap(px, py,
pose, size, mapWidth)`, paramètre optionnel → suite ui-jeu-t3 inchangée) : les tuiles
de couture sont cliquables.

## Vérification GUI réelle (L3 — `devtmp/carte-ronde-t2-gui.mjs`)

Serveurs dédiés (le wrangler local 8787/8788 était FIGÉ — hang workerd connu — ;
worker dédié 8790 + Vite dédié 5175 via `devtmp/vite.t2.config.ts`, processus d'Erik
intouchés). Partie solo légale procedural-40 (graines retry), captures
`dev-logs/captures-carte-ronde-t2/` :

1. **Traversée à pied** : guerrier BFS jusqu'à la couture, ordre soumis, 12-17 tours →
   colonne finale 39 ou 1 (vérifiée au dump serveur) ; capture `01-couture` : terrain,
   entités et villages continus des deux côtés, AUCUN bord visible.
2. **Flèche traversante** : guerrier à col 39 programmé vers col 1 (et miroir) —
   aperçu posé, badges de tours (1)(2)(3), tracé déplié continu ; capture `02`.
3. **Picking à cheval** : cols [0, 38, 37, 2] toutes canoniques (§ ci-dessus).
4. **Pan continu à travers la couture** : **60 FPS** (perfResume : fps 60, frame
   moyenne 0,11-0,38 ms, max 3,8 ms) ; captures `03`.
5. **Minimap** : rect viewport DÉCOUPÉ en deux aux deux bords (raccord) — capture `04`.
6. **Ville sélectionnée** près de la couture impossible à forcer (spawn aléatoire) ;
   la sélection de ville (zone cultivable + rendements du panneau) vérifiée — `05`.
7. **Relecture REPLAY-RESOLUTION** du tour résolu page ouverte : bannière, rendu,
   Échap — capture `06`. Contrôle hors couture `07` (rendu inchangé).

## 🔶 Points à l'œil d'Erik / notes

- **Vue ville ZOOMÉE dormante** (décision Erik 02/10, MENU-VILLE-QUEUE D4) : le D5
  « vue ville à cheval » se limite donc au chemin actif — zone cultivable/rendements
  de la ville SÉLECTIONNÉE (villeRendementsId), qui est wrap (contour chaîné à travers
  la couture). Si la vue zoomée est réactivée un jour, pose + picking wrap sont déjà
  en place (copie la plus proche + `hexCanoniqueSousPoint`).
- **Traversée en bateau NON exercée en GUI** : un navire demande des tours de
  production/tech incompatibles avec le solo de vérification ; le bateau emprunte le
  MÊME pipeline (sprites + interpolation dépliée) que la traversée à pied, vérifiée
  visuellement. 🔶 à voir en jeu réel.
- **Perf au pan sur la couture** : le pan qui chevauche la couture re-invalide
  entités+surcouche par frame (copies à rafraîchir) — mesuré 60 FPS constant, le
  budget par frame (VUE-VILLE-PERF) absorbe ; ailleurs, pan sans rebuild (inchangé).
- **Copies = reflets** (`syncCopie`) : une copie est synchronisée au rebuild — pendant
  un playback frôlant la couture, la copie d'une unité animée se met à jour au
  rebuild suivant (jamais observé à l'œil, transitoire < 1 s) 🔶.
- Le `doubleClickAt`/`vueVille` hooks du calque dev restent tels quels (dormants).
- Erreur 404 d'un asset au chargement : préexistante (hors périmètre, non liée au wrap).

## Périmètre

Moteur/serveur/protocole, 3D (le wrap est désactivé en mode 3D : `periodeActive()`
rend Infinity — comportement 3D bit-identique), tranchages 🔶 T1, `schemaVersion` :
intouchés. Fichiers : `wrap.ts` (nouveau), `wrap.test.ts` (nouveau), `camera.ts`,
`hexView.ts`, `minimap.ts`, `Minimap.svelte`, `GameCanvas.svelte`.

## Suites

rules **993/993** · server **120/120** (intouchées) · web **526/526** (506 + 20 wrap)
· svelte-check **0 erreur**. Commit + push (CI déploie).
