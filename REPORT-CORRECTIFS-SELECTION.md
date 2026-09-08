# REPORT-CORRECTIFS-SELECTION — Clics sélection/programmation, flèches orphelines, aperçu animé (08/09/2026)

Exécution du handoff [`HANDOFF-CORRECTIFS-SELECTION.md`](HANDOFF-CORRECTIFS-SELECTION.md). **Zéro changement gameplay** : input, rendu d'overlay et aperçu uniquement — `packages/rules` et serveur NON touchés, `schemaVersion` **19 inchangée**.

**État final : 1006 tests verts (750 rules + 72 server + 184 web, +15 nets), typecheck 4/4, vérification GUI réelle en partie solo 2D ET 3D (captures `dev-logs/captures-correctifs-selection/`), 60 FPS avec aperçu animé actif. RIEN N'EST COMMITTÉ — Erik déclenche.**

## 0. Préalables

- Baseline vérifiée avant chantier : suite verte (169 web / 983 au total), typecheck 4/4. Les modifications préexistantes de `apps/web/tests/unites3d.test.ts` et les retouches `image_ref/` d'Erik n'ont PAS été touchées ni absorbées.
- **Phase d'investigation d'abord** : causes racines des 3 signalements localisées AVANT correction (§1-3), comme demandé.

## 1. M1 — Rôles des clics (cause racine + correction)

**Cause (investigation)** : le routage historique (Phase 5 L1) portait la PROGRAMMATION sur le clic droit : `rightClickAction` (interaction.ts) construisait un chemin complet BFS (`pathTo`) et le soumettait (`moveDraft`), le clic droit servant aussi d'annulation (`cancelDraft`). Le clic gauche, lui, sélectionnait et traçait pas à pas. Les deux boutons programmaient donc — d'où la confusion signalée.

**Correction** :
- Nouvelle fonction pure **`rightSelectAction`** (interaction.ts) : le clic droit CHANGE DE SÉLECTION — unité sous le curseur (amie ou ennemie visible, lecture seule), ville, et **jamais** un ordre. L'ancienne `rightClickAction` est supprimée ; `pathTo` reste (pur, testé, invariants R-161 utiles).
- Le clic gauche est le seul chemin de programmation : sélection → tracé pas à pas → soumission automatique (inchangé).
- Game.svelte (`handleRightClick`) et le labo `#/lab3d` (miroir d'interaction) remappés ; le ciblage ICBM (R-139 : clic droit neutralisé pendant le ciblage) est préservé.
- **Arbitrages — défauts appliqués faute de réponse d'Erik (les questions lui ont été posées en session, sans réponse ; VETO POSSIBLE à l'acceptation)** :
  1. Re-clic GAUCHE sur l'unité déjà sélectionnée = **désélection** (comportement actuel inchangé ; alternance ville préservée sur capitale défendue) ;
  2. Clic droit sur une case VIDE = **aucune action** — la sélection existante est PRÉSERVÉE (le clic droit ne désélectionne plus et n'annule plus ; l'annulation est relocalisée sur **Échap** et le bouton **« Annuler l'ordre »** du panneau, sans perte) ;
  3. Clic droit sur une case unité+ville (capitale défendue) = **l'unité d'abord** (miroir du 1er clic gauche).
  Ces trois défauts sont verrouillés par tests (`correctifs-selection.test.ts`, `phase5.test.ts` — les 2 tests de l'ancien `rightClickAction` ont été réécrits : ils incarnaient le comportement supprimé).
- Textes d'aide du panneau unité mis à jour (« Clic gauche : sélectionner puis tracer · Clic droit : sélectionner ce qui est sous le curseur »).

## 2. M2 — Flèches orphelines à l'annulation (cause racine)

**Cause (investigation — c'est bien le « deux pools » pressenti au handoff)** : les flèches sont dessinées depuis DEUX sources distinctes qui n'étaient pas purgées ensemble :
1. l'**ordre soumis** (`view.orders`) → flèche d'aperçu `previewPrograms` (trait + pointe + fantômes) ;
2. le **brouillon UI** (`ui.draft`) → ligne jaune + pastilles tracée SANS pointe (GameCanvas `rebuildOverlay`, bloc « brouillon de chemin en construction »).

Depuis la soumission automatique (chaque extension re-soumet), brouillon et ordre coexistent en permanence. **« Annuler l'ordre »** (panneau → `client.cancelOrderFor`) purgait (1) — la pointe disparaissait — mais laissait (2) : le CORPS de la ligne demeurait sur le terrain. Exactement le symptôme signalé. À l'inverse, Échap ne purgeait que (2).

**Correction à la racine** : une seule voie de purge — nouvelle fonction pure **`annulationOrdre(view, ui, unitId)`** (interaction.ts) qui retourne ensemble « faut-il envoyer le CancelOrder » et « quel brouillon survit ». `cancelDraft` (Échap, GameCanvas) et le nouveau handler `handleCancelOrder` (bouton du panneau — UnitPanel reçoit la prop `onCancelOrder` au lieu d'appeler `client.cancelOrderFor` directement) l'utilisent : brouillon + ordre de la MÊME unité partent ENSEMBLE, les brouillons des autres unités sont préservés.

**Test** : `correctifs-selection.test.ts` verrouille le cas critique — après purge, `previewPrograms` ne contient plus l'unité (plus de flèche/pointe/fantôme) ET le brouillon est nul (plus de ligne orpheline) ; couverte : Move, MultiStep R-158, annulation croisée entre unités. **Vérifié en GUI 2D et 3D** : après Échap → 0 enfant overlay, 0 mover d'aperçu, ordre absent du panneau (captures).

## 3. M3 — Aperçu animé du déplacement programmé

**Cause (investigation)** : le chantier DEPLACEMENT-PLANIFIÉ affichait flèches, fantômes et cases disputées depuis `previewPrograms`, mais l'unité restait posée sur sa case source : rien ne « montrait » le mouvement pendant la programmation.

**Implémentation** (GameCanvas) :
- Nouvelle couche dédiée **`previewLayer`** (au-dessus des flèches, SOUS les entités — coexiste avec flèches, fantômes, rayon de cultivation sans se chevaucher).
- **Pool** `previewMovers` : UN `Graphics` par unité programmée (disque translucide à la couleur joueur), créé/détruit dans `rebuildOverlay` (même invalidation que l'overlay — lien avec M2 : la purge unifiée retire flèches + fantômes + aperçu animé ensemble). Zéro instanciation par frame : l'anim ne fait que REPOSER le marqueur le long du polyline.
- **Animation en boucle douce** : interpolation pure **`pointLeLongDuChemin`** (arrows.ts, testée : départ/milieu/fin/bornes/segments), vitesse ≈ 2,3 cases/s, modulo de la longueur du chemin. Le chemin utilisé est celui de `previewPrograms` — donc **déjà tronqué au bord du fog + 1 pas (R-161)**, l'aperçu ne va jamais plus loin que les flèches. L'unité réelle reste à sa case source jusqu'à la résolution (miroir du moteur, inchangé).
- 2D comme 3D : même couche Pixi ; en 3D le marqueur passe par `poser3d` avant `projeterCalques3d` (estampille monde, comme les entités).

## 4. Vérification (GUI réelle — partie solo TS8VB9 vs bot, dev 5174/8787)

- **3D** (mode actif d'office — localStorage d'Erik) : sélection au clic, programmation 1 case au clic gauche (flèche + fantôme + **aperçu animé prouvé** : le marqueur glisse x=375→425 en 500 ms), clic droit sur le colon → changement de sélection SANS ordre, clic droit sur du vide → sélection préservée, Échap → **0 résidu** (overlay 0, preview 0, ordre absent du panneau).
- **2D** (bascule bouton « 3D ») : même séquence complète rejouée — programmation OK (flèche + aperçu), clic droit = sélection, annulation = 0 résidu.
- **Perf** : 60,5 FPS mesurés en partie avec l'aperçu animé actif (bench labo non impacté : Lab3d n'embarque pas GameCanvas ; le surcoût par frame = reposition de ≤ N Graphics, N = unités programmées).
- Captures : `dev-logs/captures-correctifs-selection/` — `3D-programmation-fleche-apercu-anime.png`, `3D-apres-annulation-aucun-residu.png`, `3D-programmation-clic-gauche-apercu.png`, `2D-programmation-fleche-apercu-anime.png`, `2D-apres-annulation-aucun-residu.png`.
- Hook dev étendu : `__gameCanvas.sprites()` liste désormais la couche `preview` (vérifications GUI).

## 5. Interprétations 🔶 / points à l'acceptation d'Erik

1. **Les 3 défauts M1 (§1)** sont appliqués sans réponse d'Erik — à trancher à l'acceptation ; chaque défaut est isolé dans une fonction pure, un veto = retouche localisée.
2. **Échap annule aussi l'ordre soumis** (pas seulement le brouillon) — c'est le M2 voulu (« l'annulation purge corps + pointe + fantôme ensemble »), mais cela change la portée d'Échap : avant, il laissait l'ordre partir à la résolution.
3. L'aperçu animé boucle indéfiniment tant que l'ordre existe (pas de pause entre les boucles) 🔶 calibrable (`VITESSE_APERCU` dans GameCanvas).

## 6. Reste à vérifier en ligne par Erik (login réel)

1. En partie : clic droit = sélection (jamais de déplacement), clic gauche = tracé — en 2D et 3D, avec ses propres unités/villes.
2. Annulation (Échap ou bouton) : plus AUCUNE trace de flèche, même sur un chemin multi-étapes et après re-programmation.
3. Lisibilité/vitesse de l'aperçu animé (veto possible sur ~2,3 cases/s).
4. Les 3 défauts M1 du §1 (re-clic gauche, clic droit sur vide, unité-vs-ville).

**Arrêt-pour-approbation** : rien n'est committé ni déployé ; Erik fait committer et déployer quand il est satisfait.
