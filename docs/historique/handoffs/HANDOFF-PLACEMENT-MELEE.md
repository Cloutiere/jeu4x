# HANDOFF-PLACEMENT-MELEE — Placement des unités en mêlée par côté d'entrée + unité stabilisée au centre

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (clone CivRev). Lis d'abord `RULES.md` (chapitre ENGAGEMENT R-173..R-183 — mêlée d'instabilité R-180, stabilisation R-173), `HANDOFF.md` §4 (conventions), `PROJET.md` (état). **2D uniquement** (pivot 11/09, `rendu3d` reste `false`). Zéro changement gameplay : `packages/rules` et `apps/server` ne bougent PAS.

## 1. Problème et objectif (demande d'Erik, précisée le 20/09)

Aujourd'hui, les unités cohabitant sur une tuile sont réparties sur 6 zones ancrées aux côtés de l'hexagone selon une logique de **remplissage gauche→droite puis diagonales**, groupées par nation. Erik veut un placement **par côté d'entrée**, plus intuitif :

1. **Chaque unité est placée sur le côté de l'hexagone par lequel elle a pénétré la tuile** (direction d'où elle vient) ;
2. **Une 7e position, au centre** : l'unité qui **était stabilisée** (R-173) et occupait seule la tuile à la création de la mêlée. Visuellement, pendant toute la mêlée, on sait qui était la stabilisée (celle qui conserve ses bonus de fortification) et d'où viennent les autres ;
3. **Empilement dans une section** : les nouvelles unités s'ajoutent **derrière** les présentes — même escalier diagonal qu'actuellement, seule l'ordre d'arrivée compte (les plus récentes en arrière) ;
4. **Les sections peuvent mélanger plusieurs nations** (contrairement à l'actuel groupement par nation) ;
5. **Si l'unité stabilisée au centre meurt, le centre reste vide** ;
6. **Les cohabitations AMIES** (une seule nation, pas de mêlée) **gardent le placement actuel** (côte à côte centré, escalier existant).

## 2. Ce qui existe (faits vérifiés)

- **Placement actuel** : `dispositionCohabitationParNation` — `apps/web/src/lib/render/interaction.ts:129-172` (zones `ZONES_HEX` l.117-124 : 6 positions ordre de remplissage ; 1 unité seule centrée l.134-137 ; paquets par nation triés alphabétiquement l.140-146 ; nation unique côte à côte `PAS_COTE_A_COTE` l.147-155 ; multi-nations `ni % 6` + escalier intra-zone `PAS_ESCALIER = 0.09` l.156-168). Wrapper toutes cases : `dispositionsCohabitation` (l.178-190). Consommation : `GameCanvas.svelte` `rebuildEntities` l.545-622 (`disp.dx/dy/echelle/z` → `poser3d`, `c.zIndex = disp.z` l.611). **C'est le seul endroit à modifier.**
- **Z-order** : champ `z` par unité, première du paquet au premier plan (`z=0`, suivantes `z=-ui`) — conserver ce sens (« nouvelles derrière » = z décroissant avec l'ordre d'arrivée).
- **Stabilisation** : `Unit.stabilized: boolean` (`packages/rules/src/state.ts:131-147`, R-173, recalcul Phase E fin de tour). ⚠️ Le drapeau de l'état post-résolution reflète la Phase E **de ce tour**, pas l'état « au moment de la création de la mêlée ». L'information « qui était stabilisée à la création » vit dans le **pré-état** — déjà capturé côté client par REPLAY-RESOLUTION (`apps/web/src/lib/replay.ts`, store `replayPair` : `{ statePrecedente, events, tour }`, remplacé à chaque `TurnResult`, purgé au `Snapshot`). **Réutiliser/prolonger cette capture** (même durée de vie) — c'est purement client, D7 respecté.
- **Côté d'entrée** : les événements `Move { unitId, owner, from: Hex, to: Hex }` (`packages/rules/src/events.ts:45`) du tour permettent de déduire géométriquement le côté (direction `from → to` ; en pointy-top, le côté visé est celui face au voisin `from`). Le client reçoit tous ces événements (filtrés fog) dans le `TurnResult`.
- **Tests existants** : `apps/web/tests/calibration-unites.test.ts` (describe `dispositionCohabitationParNation` l.47+) et `pile-affichee.test.ts` — ils encodent l'ancien comportement ; les adapter (une nation seule = inchangé, multi-nations = nouveau schéma).
- **Labo visuel** : `apps/web/src/pages/LaboRendu.svelte` (`#/labo-rendu`, curseurs nbUnités/nbNations, GameCanvas réel) — à étendre pour calibrer le nouveau placement à l'œil. Le labo `#/labo-combat` (pose libre + résolution seedée) est le banc de validation des mêlées réelles d'Erik.

## 3. Décisions tranchées (vetoées par Erik le 20/09 — à appliquer telles quelles)

- **D1 — Unité sans Move ce tour-ci** (déjà en mêlée depuis un tour précédent) : **dernier côté connu**. Le client mémorise le côté d'entrée par unité (dédit de son dernier `Move`), persistant d'un tour à l'autre tant que l'unité vit et que la session tourne ; purgé au `Snapshot` (reconnexion → mémoire perdue). Si vraiment inconnu (début de partie, reconnexion), **repli sur l'ancienne logique de remplissage** pour cette unité.
- **D2 — Empilement intra-section** : même escalier diagonal qu'actuellement ; **ordre d'arrivée** : les nouvelles unités se placent EN ARRIÈRE des précédentes (derrière, z décroissant). Le premier arrivé de la section reste au premier plan, ancré au bord.
- **D3 — Centre vide si la stabilisée meurt** : personne ne prend le centre.
- **D4 — Cohabitation amie inchangée** : une nation seule sur une tuile (quelle que soit la taille de la pile) garde le placement actuel (côte à côte centré). La nouvelle logique ne s'applique qu'aux tuiles en mêlée (≥ 2 nations).
- **D5 — Zéro changement moteur/serveur.** Tout se déduit côté client : côté d'entrée depuis les `Move` du tour + mémoire locale ; stabilisée-à-la-création depuis le pré-état capturé (prolonger `replayPair` ou en capturer un miroir dédié — au choix de l'agent, mais même politique de purge : remplacé à chaque `TurnResult`, purgé au `Snapshot`, jamais muté l'état du store).
- **D6 — Le placement s'applique aussi en mode relecture** (`etatReplay` de REPLAY-RESOLUTION) : le pré-état porte nativement les drapeaux `stabilized` d'avant résolution, et les `Move` rejoués permettent de dériver les côtés au fil de la relecture — la relecture devient la démonstration idéale du mécanisme.
- **D7 — Barbares = une nation comme les autres** dans les sections (couleur rouge sang déjà en place).

## 4. Mission

### L0 — Préalables
- Baseline : `pnpm test` + typecheck verts (note l'état), prod 200.
- Lis `interaction.ts` (module placement), `GameCanvas.svelte` `rebuildEntities`, `replay.ts` + `gameClient.ts` (capture pré-état), `RULES.md` R-173/R-180, `apps/web/tests/calibration-unites.test.ts`.

### L1 — Données de placement (fonctions pures, test-first)
- Nouvelle fonction pure (ex. `dispositionMelee(unitesDeLaCase, contexte)`) retournant pour chaque unité `{dx, dy, echelle, z}` :
  - déterminer la stabilisée-à-la-création (pré-état) → centre, `z` au-dessus de tout (c'est LA référence visuelle) ;
  - côté d'entrée par unité (Move du tour, sinon mémoire, sinon repli remplissage) ;
  - section = côté ; ordre d'arrivée intra-section (Move du tour ordonnés par `seq`, puis anciens par ordre de mémoire) ; escalier existant, nouvelles en arrière ;
  - géométrie : table direction→offset des 6 côtés du pointy-top (offset aligné au bord visé, miroir des offsets actuels de `ZONES_HEX` repositionnés par côté réel).
- **Mémoire des côtés** : store client `coteEntreeParUnite` (mis à jour à chaque `TurnResult` depuis ses `Move`, purgé au `Snapshot`).
- **Capture de la stabilisée** : prolonger la capture existante (`replayPair`) ou miroir dédié `{ unitIdStabiliseeParCase, tour }` — même purge.
- Tests : stabilisée au centre, centre vide si morte, un côté par direction d'entrée (6 cas), empilement derrière, mélange de nations dans une section, repli sans info, nation seule = comportement inchangé (régression).

### L2 — Branchement rendu
- `dispositionsCohabitation` : si la case est en mêlée (≥ 2 nations) → `dispositionMelee`, sinon chemin actuel intact. `GameCanvas` ne devrait presque pas changer (même contrat `{dx,dy,echelle,z}`).
- Vérifier les interactions : clic sur case cohabitée (cycle de sélection `pile-affichee.test.ts`), interpolation playback (les offsets bougent pendant les `Move` — le sprite doit aboutir à SA place de section), barre de PV rapprochée, badge de population sur la case.

### L3 — Labo
- Étendre `#/labo-rendu` : scénario « mêlée » (pose libre de plusieurs nations + désignation de la stabilisée + directions d'entrée simulables) pour calibrer les offsets à l'œil. Reste simple : quelques curseurs/présets suffisent.

### L4 — Vérification
- Suite complète + typecheck verts.
- e2e : partie solo → provoquer une mêlée à 2-3 nations (ou driver CDP sur `#/labo-rendu`) → vérifier positions par côté, centre sur la stabilisée, empilement ; **et** rejouer la résolution (REPLAY-RESOLUTION) → le placement s'applique pendant la relecture. **Captures dans `dev-logs/captures-placement-melee/` AVANT tout commit** (règle d'Erik).
- Validation au labo `#/labo-combat` documentée dans le rapport (Erik s'en servira pour ajuster).

### L5 — Rapport
- `REPORT-PLACEMENT-MELEE.md` : livrable, décisions appliquées, 🔶 de calibrage (offsets de bord, pas d'escalier, z de la centrale, échelle des empilées), liste de vérification en ligne pour Erik (labo-rendu, labo-combat, vraie partie, relecture).

## 5. Critères d'acceptation

1. En mêlée, chaque unité est posée sur le côté par lequel elle est entrée ; les sans-mouvement gardent leur dernier côté connu.
2. L'unité stabilisée à la création est AU CENTRE, visible au premier plan pendant toute la mêlée ; centre vide si elle meurt.
3. Les nouvelles arrivantes s'empilent derrière les présentes dans leur section ; une section peut mélanger des nations.
4. Cohabitation amie : aucun changement visible.
5. Le placement est correct aussi pendant la relecture du tour.
6. Zéro changement `packages/rules` / `apps/server` / `schemaVersion` / réseau ; suite verte ; reconnexion (Snapshot) sans erreur.

## 6. Périmètre interdit

- Moteur/serveur/protocole (aucun nouveau champ d'état servi — tout est dérivable côté client) ;
- 3D (dort), REPLAY multi-tours, art des sprites ;
- Les règles de mêlée elles-mêmes (R-180, bonus d'étau, tirages) — rendu uniquement ;
- Raccourcis clavier nouveaux.
