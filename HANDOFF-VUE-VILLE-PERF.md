# HANDOFF-VUE-VILLE-PERF — Lag et crash du zoom vue ville : correctifs de rendu (diagnostic du 27/09)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md` (état), `docs/historique/rapports/REPORT-MENU-VILLE.md` et `REPORT-CORRECTIFS-VUE-VILLE.md`. **2D uniquement. Zéro changement gameplay/moteur/serveur/protocole** — tout est rendu client (`apps/web`). La mission PART d'un diagnostic déjà fait (§2) : le vérifier, puis appliquer.

## 1. Problème (signalement d'Erik du 27/09)

Le zoom sur une ville (double-clic → zoom à plat animé 450 ms + menu `CityView` + ressources) **lag visiblement et parfois fait crasher l'application**. Tous les autres zooms (molette) sont fluides. Baseline : suites vertes, prod 200, commit courant.

## 2. Diagnostic (enquête pilot du 27/09 — causes classées, à vérifier en L0)

- **Lag (cause n°1, quasi certaine)** : à l'ENTRÉE en vue ville, trois rebuilds complets se déclenchent **dans la même frame que le démarrage de l'animation** : `$effect` sur `vueVilleId` (GameCanvas.svelte:292-310 → `tilesDirty`+`entitiesDirty`), `selectNothing(ui)` → `overlayDirty` (ui.ts:35-37, GameCanvas:427-429), consommés ensemble au tick (tickInner:2032-2046). `rebuildOverlay()` (~800 lignes, 1131-1928) : scan de TOUTE la carte, `contourUnion` + masques Graphics par ville, **`effectiveWorkedTiles` + `new Set` recalculés DANS la boucle par tuile (1365-1366 — complexité O(tuiles×ordres))**, et **`new Text` Pixi par ligne de rendement (1468-1471, jamais caché)**. `rebuildTiles()` culler depuis `poseVueCourante()` à t≈0 = pose de DÉPART (vue large, pire cas). Montage simultané de `CityView.svelte` (Game.svelte:797) avec ses `$derived` lourds.
- **Lag secondaire (n°2)** : `poseVueVilleCible` (261-290) peut appeler `app.renderer.resize` **au dernier tick de l'animation** (via tickInner:2058) — resize de framebuffer en pleine frame ; idem ResizeObserver (3177-3208). Et la SORTIE de vue ville re-invalide entities+overlay (2068-2069) → 2e `rebuildOverlay` complet par cycle.
- **Crash (n°3, mécanisme)** : `tick` (2001-2015) attrape les erreurs de `tickInner`, tue rAF + fallback, puis **`throw err`** dans le callback rAF → exception non interceptée → app figée. Une erreur ponctuelle dans un rebuild (état transitoire de l'anim, texture détruite — cf. commentaire textures.ts:578) devient un crash complet. « Parfois » = seulement quand la frame de transition en rencontre une.
- **Exclu par les faits** : pas de rebuild par frame pendant l'anim (pose statique), pas de fuite d'overlay (enfants détruits 1132), pas de `$effect` récursif, pas de `structuredClone` sur ce chemin, DPR borné et neutre ici.

## 3. Décisions tranchées par défaut (vetoables)

- **D1 — Ordre des priorités : (a) le ticker ne meurt plus, (b) les rebuilds sortent de la frame de transition, (c) les complexités.** Le crash d'abord : c'est lui qui perd des parties.
- **D2 — Ticker blindé sans masquer les bugs** : une erreur de `tickInner` est **journalisée (console.error + marqueur visible discret type bandeau d'erreur)**, la boucle continue à la frame suivante ; l'état rendu est resynchronisé proprement (re-invalidation des 3 calques, purge des états transitoires). Interdiction d'avaler en silence : le bandeau d'erreur reste tant que l'erreur se reproduit. Tests : injection d'erreur → la boucle survit, le marqueur apparaît, la frame suivante rend.
- **D3 — Les rebuilds lourds se font APRÈS l'animation d'entrée** (et avant l'animation de sortie, pas pendant) : pendant les 450 ms, la frame ne fait qu'interpoler le transform de caméra (comme la molette — c'est prouvé fluide). Le montage de `CityView` est différé de la même façon. Compromis accepté : les calques « anciens » restent visibles pendant l'anim, l'overlay final apparaît à l'arrivée — à l'œil d'Erik à l'acceptation.
- **D4 — Complexités** : (a) `effectiveWorkedTiles` + `new Set` sortis de la boucle par tuile (calculés une fois) ; (b) cache des `Text` de rendement (clé = texte+style ; purge au rebuild comme les autres caches — pas de fuite) ; (c) culling de `rebuildTiles` depuis la pose CIBLE en vue ville (et pose courante sinon) ; (d) `renderer.resize` jamais appelé pendant une frame d'animation (reporté à la fin / au ResizeObserver uniquement).
- **D5 — Double invalidation de sortie** : la sortie de vue ville ne re-rebuild que ce qui a réellement changé (l'overlay vue ville → overlay monde) ; si un rebuild complet est inévitable, il suit la règle D3 (hors frame animée).
- **D6 — Aucune régression visuelle acceptée en jeu normal** : hors vue ville, comportement et apparence identiques (tests existants verts). Les pure functions touchées (poses, contors) gardent leurs tests ; nouvelles fonctions = test-first.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts ; note l'état. Vérifie le diagnostic §2 ligne par ligne (corrige le rapport si une ligne a bougé avec les commits récents) et mesure l'état initial : durée des frames au double-clic ville (performance.now autour des rebuilds, captures `dev-logs/perf-vue-ville/AVANT.md` avec chiffres).

### L1 — Ticker (le crash)
- Blindage D2 + test d'injection d'erreur. Vérifier qu'aucun autre site ne `throw` depuis un callback rAF.

### L2 — Sortie des rebuilds de la frame de transition
- D3 : restructurer la machine d'invalidation (entrée/sortie vue ville) — les flags restent, la consommation est différée/étalée (ex. budget par frame : au plus un rebuild complet par frame, tuiles puis entités puis overlay sur 3 frames si besoin).
- Montage `CityView` différé à la fin d'anim.
- D5 : sortie sans rebuild complet si rien n'a changé.

### L3 — Complexités (D4)
- (a) worked tiles hors boucle ; (b) cache Text de rendement (purge propre) ; (c) culling pose cible ; (d) resize jamais en frame animée.
- Tests : fonctions pures extraites si possible (ex. culling depuis pose, clé de cache texte).

### L4 — Vérification
- Mesures APRÈS (même protocole qu'AVANT) : les rebuilds ne doivent plus être dans une frame avec l'anim ; frame max d'ouverture réduite (chiffres dans le rapport).
- e2e : double-clic ville aller/retour ×10 sans erreur console ; entrée/sortie rapide pendant l'animation (spam de clics) sans crash ; molette inchangée ; relecture (REPLAY-RESOLUTION) et mêlée non affectées.
- **Captures `dev-logs/captures-vue-ville-perf/`** avant tout commit : état final de la vue ville (visuellement identique), bandeau d'erreur en test, chiffres avant/après.

### L5 — ARRÊT POUR APPROBATION D'ERIK
Présenter : chiffres avant/après, compromis D3 (ce qui apparaît quand), captures. NE COMMITTER QU'APRÈS FEU VERT.

### L6 — Rapport
- `REPORT-VUE-VILLE-PERF.md` : diagnostic confirmé/corrigé, changements par cause, mesures, ce qu'Erik valide en ligne (double-clic sur plusieurs villes, parties réelles, sortie par Échap/fond), 🔶 (durée d'anim, budget de frames, look du bandeau d'erreur).

## 5. Critères d'acceptation
1. Le double-clic ville n'est plus perceptiblement laggy (frames de transition courtes, chiffres au rapport) ; l'animation est fluide comme la molette.
2. Une erreur dans un rebuild ne tue plus l'application (boucle survit, bandeau visible, resync propre) — testé par injection.
3. Spam de clics pendant l'animation sans crash ; sorties/entrées répétées propres.
4. Zéro régression visuelle hors vue ville ; suites vertes ; zéro changement moteur/serveur/protocole.

## 6. Périmètre interdit
- Gameplay, moteur, serveur, protocole, migration ; les autres zooms (déjà fluides) sauf retouches nécessaires au mécanisme commun de rebuild ; 3D ; REPLAY-RESOLUTION (ne pas régresser) ; tout nouvel asset.
