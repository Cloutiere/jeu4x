# REPORT-TUILE-OCCUPEE — Cultiver une tuile occupée par une unité

**02/10/2026 — mission client seul, zéro moteur. Handoff exécuté intégralement (L0→L4).**

## Diagnostic (§2 du handoff) — confirmé, non refait

- Moteur sain : `applySetWorkedTile` ne vérifie jamais l'occupation (re-vérifié à la lecture).
- Client carte : règle 1 gardée par `!unit && !city` → toute unité sur la tuile basculait le clic en sélection d'unité.
- Client vue ville : `!unitAtHex(state, hex)` dans le prédicat `free` refusait la tuile occupée alors que la vue ne sélectionne jamais d'unité.

## Changements (2 portes de clic pures, `apps/web/src/lib/render/interaction.ts`)

- **D1 — `clickAction`** : la garde de la règle 1 passe de `!unit && !city` à `!city`. Dans le rayon de travail d'une ville amie sélectionnée, une tuile **déjà travaillée** (désélection exacte R-60) ou **cultivable libre** reçoit le clic **même occupée** (unité amie ou ennemie, au sens dessiné). La case de **ville** reste hors culture (règle 0b re-clic = désélection, règle 2 = sélection — inchangées).
- **D1bis — repli sélection** : si la culture est impossible sur une tuile occupée (ville pleine à l'état effectif, tuile prise par une autre ville), le clic retombe sur la **sélection de l'unité** (fall-through règle 2) au lieu de « rien ». Une tuile **vide** non affectable garde le refus honnête `none` (inchangé).
- **D3 — `clickActionVueVille`** : `!unitAtHex(state, hex)` retiré du prédicat `free` — miroir exact du moteur.
- **D2 — règle 0 intacte** : re-clic sur l'unité déjà sélectionnée = cycle/désélection (au-dessus de la règle 1). Pour saisir une unité non sélectionnée posée sur une tuile cultivable du rayon : Échap / re-clic ville / clic vide d'abord, puis clic unité — 2 gestes.
- **D4 — zéro moteur/serveur/protocole**, `schemaVersion` 27 inchangée. `UnitPanel.svelte` et les autres portes de clic non concernées (GameCanvas est la seule porte ; `pathTo`/clic droit intouchés).

## Tests

- `tests/interaction.test.ts` : 6 nouveaux cas D1/D1bis/D2 (amie sur tuile libre → `setWorkedTile` ; déjà travaillée occupée → désélection exacte ; ennemie visible → `setWorkedTile` ; ville pleine → repli `selectUnit` ; case ville occupée → `selectUnit` inchangé ; re-clic règle 0 inchangé).
- `tests/menu-ville.test.ts` : le cas « unité posée dessus → none » est réécrit vers D3 (tuile du rayon occupée → `setWorkedTile`) ; l'ancien test passait pour la mauvaise raison (tuile hors rayon, à distance 2). Les cas hors rayon / case de ville / ville pleine / ordres verrouillés sont conservés.
- Suites : **rules 952/952, server 120/120, web 488/488**, svelte-check 0 erreurs, typecheck 4 paquets OK.

## Vérification GUI en vraie partie solo légale (`devtmp/tuile-occupee-e2e.mjs`)

Parties solo pangee-40 légales (production/mouvements/ordres WS réels, guerrier déplacé SUR la tuile cible), vérification au dump serveur après résolution :

- **C (D1bis)** : ville PLEINE 2/2 + clic sur la tuile occupée non cultivée → aucun ordre émis (prouvé : le clic suivant a pu affecter la tuile, sinon il aurait désélectionné) + panneau unité ouvert (capture 1).
- **A (D1)** : ville sélectionnée, libération d'un créneau puis clic sur la tuile occupée → `workedTiles` contient la tuile après résolution (capture 2).
- **B (D1)** : re-clic sur la tuile TRAVAILLÉE et occupée → `workedTiles` ne la contient plus après résolution (capture 3).
- **D2** : Échap puis clic sur l'unité → unité sélectionnée (capture 6).

Captures : `dev-logs/captures-tuile-occupee/` (1, 2, 3, 6 — vérifiées à l'œil).

## Défauts consignés 🔶 / reste à vérifier en ligne par Erik

- 🔴 **D — vue ville INTESTABLE en GUI** : l'entrée en vue ville est **débranchée** dans le build actuel (MENU-VILLE-QUEUE D4 — `onEnterVueVille` en commentaire dans `Game.svelte:1034`, la vue est dormante). Le double-clic sur une ville ne fait plus rien. La couverture D3 (`clickActionVueVille`) est donc **uniquement unitaire** (`menu-ville.test.ts`). À re-vérifier en GUI le jour où la vue ville est rebranchée.
- 🔶 **Tuile « non cultivable » inconstructible dans les données** : TOUS les terrains de `terrain.json` ont des `yields` — le cas D1bis « tuile occupée non cultivable → selectUnit » n'est pas testable via les données actuelles (le prédicat `TERRAINS[...].yields` est toujours vrai). Le repli est couvert par le cas « ville pleine » et la case ville.
- 🔶 **D2 (défaut assumé du handoff)** : saisir une unité posée sur une tuile cultivable du rayon coûte 2 gestes (purge de sélection puis clic). Erik peut vetoer — l'alternative est le statu quo qu'il a signalé comme le problème.
- À l'œil en ligne : lisibilité du marqueur de tuile cultivée sous le sprite de l'unité (la capture 2 montre l'anneau bleu sur une tuile voisine de la ville ; la tuile cible elle-même est derrière le panneau ville sur cette résolution).

## Périmètre respecté

Moteur, protocole, serveur, migration, clic droit, règle 0, rendu ZONE-CULTIVEE, vue ville zoomée, 3D, `schemaVersion` : intouchés.
