# REPORT — SPAWN-START : garantie de voisinage du Colon de départ

Mission [`HANDOFF-SPAWN-START.md`](HANDOFF-SPAWN-START.md) — demande d'Erik du 05/09 (fait foi) : le **Colon de départ** est placé de sorte que **1)** ses 6 cases adjacentes comptent **2 forêts, 2 prairies et 1 case d'eau** (6e case libre 🔶 : tout terrain productif non-montagne) et **2)** **aucune ressource** dans les 6 adjacentes **ni à distance 2** (rayon 2 = 18 cases, anneau intérieur + extérieur). Test-first, schemaVersion **18 inchangée** (règle de génération, pas de données).

## L0 — Règle rédigée

- **RULES.md §11bis : nouvelle règle R-157** (garantie de voisinage du départ), R-103 mis à jour (le filtrage des candidats par minimums d'anneau Phase 6c est **remplacé** par le re-paint forcé — settings `startMinRingPrairie`/`startMinRingForest` supprimés ; normalisation en **anneau 3** désormais) ; table §10 : **T-44** (`spawnRingForet` · `spawnRingPrairie` · `spawnRingEau` = 2 · 2 · 1 🔶) et **T-45** (`spawnPurgeRadius` = 2 🔶).
- Source unique `packages/rules/src/progen/settings.ts` — data-driven, sérialisable, passe le protocole/dump admin tels quels.

## L1 — Moteur (test-first)

- `mirror.ts` — nouvelles fonctions pures et déterministes (R-81) :
  - `forceSpawnNeighborhood(grid, site, settings)` : re-paint des 6 voisines — les terrains **déjà conformes sont préservés en priorité**, les cibles manquantes (2F/2P/1E) sont posées dans l'ordre (q, r), la dernière voisine reste **libre** si productive non-montagne (sinon repeinte en prairie 🔶) ;
  - `purgeResourcesNear(resources, centers, radius)` : filtre pur kept/purged ;
  - `spawnNeighborhoodComposition`, `productiveFreeTile` (checksum étendu + règle de la case libre).
- Ordre dans `MIRROR_1V1.build` (décision 🔶 du handoff : **placement d'abord, carte ensuite**) : choix du site (critères R-103 inchangés : bords, axe, distance miroir ≥ 12, voisin praticable) → **re-paint** du voisinage → **purge** des ressources du rayon (demi-liste ; les images miroir suivent par symétrie) → normalisation (**anneau 3** uniquement — les anneaux 1-2 sont réservés) → miroir → garantie de couverture R-108 et ressources marines avec **zone d'exclusion étendue au rayon 2 des deux spawns** → filtre final fail-safe.
- **Checksum d'équité étendu** : la composition des deux voisinages doit être identique (assertion fail-loud `ProgenPlacementError`) + consigne `report.spawn` {purgeRadius, purged, compositionP1, compositionP2} dans `ProgenReport` → dump admin.
- **Artifacts exclus de la purge** 🔶 (défaut du handoff) : `artefactsForMap` non touchée. **Huttes/barbares** : règles 7d inchangées (tests de non-régression verts).
- **Tests** : nouveau `packages/rules/tests/progen-spawn-start.test.ts` — réglages 🔶, unitaires (re-paint déterministe/préservation/pur, purge ≤ rayon des deux centres, pureté), **statistique sur 16 seeds** : 100 % des spawns conformes (≥ 2F, ≥ 2P, exactement 1E, aucune montagne, 0 ressource au rayon 2, composition miroir identique), e2e génération → `createInitialState` → fondation des deux capitales (`FoundCity`) → **ressources et terrains intacts hors fondation**, et conformité des **cartes préfabriquées** ajustées. `progen.test.ts` mis à jour (composition exacte, normalisation anneau 3).

## L2 — Labo `#/progen`

- `GameCanvas.svelte` : nouvelle prop `spawnGuarantee` (labo seul) — **anneau 1 en trait plein cyan** (voisinage forcé) et **anneau 2 en trait fin** (rayon sans ressource) autour des deux spawns.
- `Progen.svelte` : toggle « Zone de garantie des départs (SPAWN-START) » + panneau « Garantie de départ » (composition lisible par joueur — « 2F 2P 1E… », identité de composition, rayon, ressources purgées).

## L3 — Audit des cartes préfabriquées (ajustements)

Audit initial : les trois cartes violaient la garantie (pangee p2 : 2 ressources au rayon 2 ; variee : 1 ; pédagogique p1 : 2 ; aucun anneau conforme — pangee/variee sans forêt ni eau, variee 6 prairies).

Ajustements appliqués (diffs minimaux, inspectables dans le commit) :
- **pangee-40 / variee-40** : re-paint des 6 voisines de chaque spawn (2F/2P/1E + libre ; variee, symétrique : plan calculé sur p1 et appliqué **par miroir** — symétrie 180° vérifiée par assertion) ;
- **pedagogique-40** : idem **SANS le composant « 1 eau »** — 🔶 **déviation documentée, veto Erik possible** : T-11 impose « aucune eau » sur la carte pédagogique (caractère pédagogique, test existant) ; composition obtenue 2F/2P/2Plaine ;
- **Ressources du rayon 2 déplacées** (et non supprimées) à la première case libre conforme à leur terrain à distance ≥ 3 — la **dotation** est préservée (test « dotée de ressources ≥ 6 » reste vert). Cas limite pangee : épices/soufre exigent du désert et **toutes** les cases de désert de la carte sont dans les rayons des spawns → dernier repli : **conversion** d'une case plaine/prairie libre hors rayon en désert (2 cases, adjacentes au caractère désertique existant). Villages/huttes : aucun déplacement (aucun sur case repeinte non productive).

## Critères d'acceptation

- ✅ 100 % des seeds testés (16 seeds × 2 spawns) : voisinage conforme, 0 ressource au rayon 2 ;
- ✅ Miroir : compositions identiques (assert moteur + test) ; checksum delta = 0 ;
- ✅ Cartes préfabriquées auditées/ajustées (déviation pédagogique signalée) ; labo montre la garantie ;
- ✅ Baseline **712 tests rules + 65 server verts**, typecheck vert, build web vert, schemaVersion 18.

## Décisions & signalements

- 🔶 Application stricte des défauts du handoff : placement→re-paint→purge ; artefacts hors purge ; 6e case libre productive non-montagne (impropre → prairie ; une voisine déjà conforme peut porter les forêts/prairies au-delà du minimum — ex. 3 forêts — la garantie est « exactement 1 eau » et « au moins 2F/2P »).
- 🔶 **pédagogique-40 exemptée du « 1 eau »** (T-11) — voir ci-dessus, à valider par Erik.
- La 6e case libre impropre (montagne/eau/cratère) est repeinte **prairie** 🔶 (défaut simple et déterministe).
- Périmètre interdit respecté : interaction 3D, unités 3D, atelier (répertoire inspecté avant commit — rien d'Erik dans la staging), rendements, renommages, espionnage.

## Livraison

Commit sur `main` → CI GitHub Actions (deploy Cloudflare) → health prod vérifiée après push.
