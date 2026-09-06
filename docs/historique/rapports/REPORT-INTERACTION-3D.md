# REPORT — INTERACTION-3D : déplacements refusés à tort + re-clic worked tiles

Mission `HANDOFF-INTERACTION-3D.md` — correctifs d'interaction test-first, constats d'Erik en partie solo vue 3D. **901 tests verts** (698 moteur / 65 serveur / 138 web), `pnpm typecheck` 4/4, `schemaVersion` 18 inchangée.

## Correctif 1 — Déplacements : cases refusées à tort

**Cause** (prédicat pur partagé 2D/3D `render/interaction.ts` — le picking 3D `pickHex3D` est analytique sur le sol, aucun mesh n'intercepte) :
1. `clickAction` règle 1 refusait toute case adjacente occupée par un ALLIÉ comme étape de chemin (relict R-30 « polish Phase 5 ») ;
2. `pathTo` (clic droit) refusait toute destination occupée par un allié — y compris **sa propre ville garnie**, alors que l'entrée en garnison est légale (R-30 : ville + 1 défenseur).

**Correctif** — le client cible, le moteur tranche (R-42 s'arrête proprement sur la case précédente si l'occupant est toujours là ; R-41 en résolution simultanée fait que l'occupant peut partir avant) :
- `clickAction` : toute case adjacente **entrable** est traçable, occupée ou non ; une ville amie **adjacente** pendant un brouillon est une étape de chemin (garnison) au lieu d'interrompre le brouillon ;
- `pathTo` : destination alliée admise ; le **transit** à travers une case occupée reste refusé (non-régression testée) ;
- 🔶 tranché (défaut du handoff, appliqué) : la case amie occupée est ciblable **avec ou sans ordre de départ** de l'occupant — le moteur gère. La Phase 7b (menu de ville accessible d'un clic) est préservée pour une ville **non adjacente** ou hors brouillon (alternance inchangée).

**Tests** : `apps/web/tests/interaction.test.ts` (extend sur allié, garnison ville amie adjacente, Phase 7b non adjacente préservée, non-régression attaque ennemie) et `apps/web/tests/phase5.test.ts` (pathTo arrivée alliée + invariant « jamais d'étape intermédiaire sur une case occupée »).

**e2e solo 3D vérifié** : guerrier sélectionné → clic sur sa propre ville adjacente → ordre `Move` soumis → résolution → unité en garnison dans la ville (`docs/captures-interaction-3d/garnison-ville-3d.png`). Le cas « occupant avec ordre de départ » est couvert par les tests purs et la résolution simultanée du moteur.

## Correctif 2 — Worked tiles : re-clic impossible

**Cause** (reproduite en e2e solo 3D avant correctif) : les ordres `SetWorkedTile` n' sont appliqués **qu'à la résolution** (Phase C), et le coalescing (`sameSubject` client + serveur) **remplaçait** l'ordre de la ville à chaque clic. Après une désélection (ordre `null` en attente), la ville paraissait **pleine tout le tour** sur l'état connu → le prédicat refusait tout re-clic (retour `none`). Et même si le clic passait, la réassignation **remplaçait** la désélection → ordre final ignoré par le moteur (ville pleine). Symptôme exact d'Erik, en 3D comme en 2D (prédicat partagé).

**Correctif — file d'ordres par ville** (le handoff autorise la touche serveur « si le prédicat partagé l'exige », tests 2D d'abord) :
- **Moteur** : aucun changement de code — `applySetWorkedTile` appliquait déjà une séquence pop/`push` par ville dans l'ordre de soumission ; contrat verrouillé par un test (`packages/rules/tests/economy.test.ts`) ;
- **Serveur** (`apps/server/src/game.ts`) et **client** (`gameClient.ts`) : `sameSubject` — deux `SetWorkedTile` de la même ville ne se remplacent plus (file) ; `SetProduction` inchangé (remplacement par ville) ;
- **Prédicat** (`interaction.ts`) : nouveau helper exporté `effectiveWorkedTiles(view, city)` — applique les ordres en attente en miroir exact du moteur (pop/push, ville pleine ignorée) ; la règle 3 de `clickAction` valide sur cet état **effectif** ;
- **Marqueurs 2D/3D** (`GameCanvas.svelte`) : anneaux pointillés +/− dessinés depuis `effectiveWorkedTiles` (avant : heuristique « dernier de la liste » sur l'état obsolète). `CityPanel` avait déjà sa propre simulation de file — inchangé.

**e2e solo 3D vérifié** : ville → clic case travaillée (−) → re-clic autre case (+) → **deux/trois ordres empilés** côté serveur → panneau « valeurs projetées » cohérent → résolution : la nouvelle case est travaillée, l'ancienne libérée (`docs/captures-interaction-3d/reclic-worked-tile-3d.png`). La règle d'Erik est préservée : ville pleine à l'état **effectif** = clic refusé (pas d'échange automatique — désélectionner d'abord).

## Décisions & signalements
- 🔶 Case amie occupée ciblable sans condition d'ordre (défaut du handoff), documenté dans le code.
- La doc `RULES.md` §4 (`SetWorkedTile` : « échange ») décrit l'ancienne sémantique remplacée par la règle d'Erik « pas d'échange automatique » (docstring moteur à jour) — signalement, non modifié (spécification normative hors périmètre du correctif).
- Non touché : atelier d'Erik (répertoire inspecté avant commit — rien de sien dans la staging), unités 3D (chantier parallèle).

## Livraison
Commit sur `main` → CI GitHub Actions (deploy Cloudflare) → health prod vérifiée après push.
