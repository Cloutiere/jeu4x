# REPORT-UI-JEU-T3 — Minimap + filtres façon Civ VI (01/10/2026)

Mission exécutée selon `HANDOFF-UI-JEU-T3.md` — **2D uniquement, client seul, zéro changement moteur/serveur/protocole**. Rien de committé : **arrêt pour approbation d'Erik (L4)** — le look est 🔶 à l'œil.

> **Correctif retour Erik (01/10, même session)** — « la minimap ne centre pas la vraie carte » : la peinture compressait les colonnes (`col·px` par rangée) tandis que le clic suivait la géométrie monde (`x = √3·size·(col + row/2)`) — décalage croissant avec la rangée. Correctif : un repère UNIQUE monde↔minimap (`poseMinimap`/`pxCellule`/`mondeSousMinimap`/`rectCameraMinimap`, linéaire via les mêmes bornes `mapBounds` que la caméra) partagé par la peinture, le clic/drag ET le rect de caméra ; la miniature épouse désormais la forme réelle de la carte (cisaillement pointy-top préservé). Test aller-retour case→pixel→monde ajouté (`ui-jeu-t3.test.ts`, 15 tests T3) ; revérifié e2e : clic sur la zone révélée → la caméra arrive SUR les terrains découverts ; captures 01/02 mises à jour.

## 1. Livré

1. **Minimap bas-gauche (D1/D2/D5)** — `apps/web/src/lib/render/minimap.ts` (pur, testé) + `apps/web/src/lib/render/Minimap.svelte` :
   - grille basse résolution peinte depuis l'état **filtré** (fog) — une case absente de `state.map` est du brouillard (fond sombre `#14120e`), jamais inventée ; cases explorées-hors-vision atténuées (facteur 0,55) ; palette plate par terrain (`PALETTE_MINIMAP`, 🔶 à l'œil) ; rangées pointy-top décalées d'une demi-case ;
   - villes et unités visibles : point à la couleur de la palette du propriétaire (`couleurBaseJoueur`) ; unité embarquée (R-117) et entité hors état filtré : aucun point ;
   - **rectangle de caméra or** dans un canvas superposé, redessiné seulement quand la pose change (vérification par clé arrondie dans une boucle rAF — le redraw grille, lui, n'arrive QUE sur invalidation : nouvel état, filtres) ;
   - **clic et drag → recentrage caméra au point monde, zoom préservé** (D3) : `mondeSousMinimap` (pur) + nouvelle api canvas `centrerSurMonde(x,y)` (centerOn + clamp + invalidation, miroir exact de `centerOnHex`) ;
   - taille data-driven (224 px, 168 px en fenêtre étroite ≤1500 px — media query D5) ; jamais de chevauchement avec le bouton circulaire (droite) ni la colonne.
2. **Panneau filtres/décorations au-dessus (D4)** — store persistant `apps/web/src/lib/filtresCarte.ts` (localStorage `filtres-carte`, même idiome que le calque dev, relecture défensive `lireFiltres`) :
   - **Rendements** : les 3 états du bouton du calque dev migrent tels quels (0 masqué → 1 affichés → 2 sans villes/armées — le bouton **DISPARAÎT de la rangée DEV**, la fonction Phase 7b est inchangée, seuls `showYields`/`hideEntities` sont dérivés du store) ;
   - **Ressources** : off = tuiles-ressources révélées remplacées par la tuile de base À L'AFFICHAGE (nouvelle prop `montrerRessources` de GameCanvas, branchée au bloc de pose des tuiles — gameplay/fog/jetons hors table intouchés, la brume « cacher » de l'inconnue R-92 reste) ;
   - structure data-driven (liste de boutons — futurs filtres sans changer le panneau) ; chevron de **repli** mémorisé (replié = bouton « ▸ Carte » seul) ;
   - style AAA T1/T2 : blocs dégradé or-sur-sombre, liseré or doux, chips pill, serif sur les états.
3. **Api canvas étendue** (GameCanvas `onReady`) : `centrerSurMonde`, `poseCamera`, `dimsVue`, `bornesMonde` — utilisées par la minimap ; `centerOnHex`/`centerOnUnit`/`hexEcran` inchangés (journal, orientation blocages, popover RAPPORT).

## 2. Vérifications

- Suites : **web 447/447** (baseline 432 + 15 nouvelles `tests/ui-jeu-t3.test.ts` : grille fog/atténuation/pastille ressource ON-OFF/entités embarquées-hors vue, repère minimap — aller-retour case→pixel→monde sur 5 cases réparties + rect caméra borné + case sous clic, store filtres cycles + persistance + `lireFiltres` défensif, câblage Game.svelte — bouton Rendements sorti du calque, minimap sous `{#if !vueVilleActive}`, api `centrerSurMonde`) ; `svelte-check` **0 erreur** (14 warnings = baseline) ; **typecheck monorepo 4/4**.
- Test existant mis à jour sans affaiblissement : `ui-jeu-t1.test.ts` (l'inventaire D2 listait le bouton Rendements dans le calque — remplacé par `cycleRendements`, avec commentaire renvoyant à T3 ; les autres assertions inchangées).
- **e2e GUI réel** (Vite 5174 + wrangler 8787, solo 5 sièges **RUEG29**, Amérique + 4 bots, archipel) :
  - minimap fog : le cluster exploré du départ est peint, le reste sombre — et la vue miniature reste cohérente quand la caméra va au centre (tout fog) ;
  - **clic minimap → caméra déplacée, zoom strictement préservé** (même `scale` avant/après, vérifié sur `__game.camera()`) ; **drag → suivi continu** ; rect de caméra suit (vérifié données + capture) ;
  - Rendements : cycle 0→1→2→0 effectif (rendements N/P/C peints ; état 2 masque villes/armées), chaque état **persisté** et **restauré après reload** ;
  - Ressources : bascule effectue l'invalidation des tuiles sans erreur, état persisté (la logique pixel est couverte par les tests purs — aucune tuile-ressource révélée dans le périmètre visible de la partie de test) ;
  - repli : panneau + minimap remplacés par « ▸ Carte », mémorisé ; dépli OK ;
  - **vue ville (fondée au tour 1) : minimap masquée** comme la colonne (D6) ;
  - relecture « ⟲ Rejouer la résolution » intacte (bandeau + Échap), journal cliquable intact (**vrai clic souris** → centrage ville, zoom préservé — constat : le probe Playwright rate le `span.entry` par hit-testing, l'interaction réelle fonctionne ; aucun changement de code côté journal) ;
  - calque dev T1 intact (rangée DEV sans Rendements, 3D/Debug/Resync inchangés).
- **FPS carte : 60,3 mesurés** (rAF sur 4 s, vue recalée) — inchangé ; `__game.perf()` : step moyen **0,13 ms**, max **0,40 ms** sur 300 frames (la minimap ne coûte rien par frame : grille sur invalidation, rect sur changement de pose seulement — D1 tenu).

## 3. Captures (`dev-logs/captures-ui-t3/`)

| Fichier | Contenu |
|---|---|
| `01-minimap-fog-partielle-filtres-ouverts.png` | plein écran : minimap fog partielle + panneau (Rendements Masqués, Ressources Affichées), rect caméra — **après correctif repère unique** |
| `02-rect-camera-apres-clic-minimap.png` | crop minimap : rect or SUR la zone révélée après clic (cohérence peinture/clic — le correctif Erik) |
| `02b-carte-apres-clic-minimap.png` | la carte correspondante (tout fog — la minimap ne montre que la vision) |
| `03-rendements-affiches.png` | filtre Rendements état 1 : N/P/C peints sur les tuiles |
| `04-rendements-sans-villes-armees.png` | état 2 : rendements lisibles, villes/armées masquées |
| `05-ressources-off.png` | filtre Ressources off (tuiles de base à l'affichage) |
| `06-repliee.png` | bloc replié : bouton « ▸ Carte » seul |
| `07-vue-ville-minimap-masquee.png` | vue ville : minimap ET colonne masquées (D6) |
| `08-relecture-bandeau.png` | bandeau « Relecture du tour » (relecture intacte) |

Comparaison Civ VI : à l'œil d'Erik (L4) avec son image de référence — disposition tenue (minimap bas-gauche, panneau au-dessus, chevron).

## 4. 🔶 à l'œil d'Erik

1. **Taille de la minimap** (224 px / 168 px étroit) et **px/case** (4) — données en tête de `Minimap.svelte` ;
2. **Palette des terrains en miniature** (`PALETTE_MINIMAP` dans `minimap.ts`) et l'atténuation exploré-hors-vision (0,55) ;
3. **Place du panneau filtres** (au-dessus, chips pill ; ordre Rendements → Ressources) et le libellé d'état suffixé (« Affichées/Masquées/Sans villes/armées ») ;
4. Tooltip survol de la minimap : non implémenté (optionnel D3) ;
5. Le chevron de repli (▾/▸ Carte) et la mémorisation.

## 5. Bilan du chantier UI (T1+T2+T3)

- **T1** : calque dev (Ctrl+Alt+D / ⚙), barre AAA, portrait dirigeant, bouton fin de tour circulaire — committé d19b6c3.
- **T2** : colonne droite AAA (unité/historique/journal/adversaires/ligne ⚔) — committé 8edbf71.
- **T3** (celui-ci) : minimap + filtres, migration Rendements — **en attente de feu vert**.
- L'écran de jeu est désormais entièrement au langage LOBBY-PREMIUM (or-sur-sombre, serif) côté HUD ; restera 🔶 si Erik veut rattacher d'autres éléments (vue ville, popovers) au même traitement.

## 6. Notes & suivis

- Le « tout fog » au centre de la carte est le comportement voulu (vision seule) — la capture `02b` le documente pour éviter tout malentendu (« la minimap est vide ? » — non : non exploré = sombre).
- Piège récurrent rappelé : Vite zombie sur 5174 (tué et relancé pendant la session) ; Vite 5174 et wrangler 8787 LAISSÉS TOUR NANTS pour la revue d'Erik (partie RUEG29 ouverte).
- Zéro changement moteur/serveur/protocole ; rien à déployer tant qu'Erik n'a pas donné le feu vert (le commit suivra L4).
