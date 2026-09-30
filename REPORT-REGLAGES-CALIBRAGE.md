# REPORT-REGLAGES-CALIBRAGE — Trois réglages d'Erik (29/09) — exécuté le 30/09

**Statut : IMPLÉMENTÉ, NON COMMITTÉ — arrêt pour approbation d'Erik** (règle du handoff §4 : Erik teste en conditions réelles avant commit). Suites vertes, typecheck 0 erreur, captures dans `dev-logs/captures-reglages-calibrage/`.

## Réglage 1 — GP gratuit Amérique : tirage seedé uniforme sur les 6 classes

- `packages/rules/src/civStartBonus.ts` : la classe n'est plus `greatPersonRotationClass(0)` (toujours artiste_penseur) mais un tirage uniforme sur `GP_CLASSES` au RNG **dédié** `rngSeed ^ AMERICA_GP_SEED_SALT` (nouveau salt `0x3f19c27a`, miroir Égypte R-151/artefacts — le RNG de résolution n'est PAS consommé). Même seed ⇒ même classe ; le tirage vaut le premier élément du flux salé, au setup COMME à la fondation de capitale (source unique `applyCapitalStartBonuses`).
- Compteur d'octroi : `greatPersonsObtained` + `greatPersonsByType` incrémentés comme pour tout GP d'octroi (miroir firstDiscovery — consomme une figure de la classe). SANS jalon culturel (hors canal culture) ; R-127 reste abrogée (octroi, pas ciblage). Sans effet sur la Confucius T-43 (rotation pure inchangée).
- RULES.md : R-127 et R-150 révisées + nouvelle constante T-08c (voir ci-dessous) — l'agent propose le texte, le pilot commette le réalignement avec la livraison.
- Tests (`packages/rules/tests/reglages-calibrage.test.ts`) : déterminisme (même seed → même classe), correspondance tirage ⇄ formule pure `seed ^ salt`, distribution : les 6 classes sortent sur 2000 seeds (pur), les autres civs ne reçoivent rien, compteurs mis à jour. Test existant phase7n mis à jour (seed 1234 → 42, « rotation index 0 » → « tirage seedé »).

## Réglage 2 — Vision +1 sur colline (unités terrestres)

- Data-driven : `terrain.json` colline reçoit `"bonusVision": 1` ; nouveau champ optionnel `TerrainData.bonusVision` (types.ts).
- `packages/rules/src/fog.ts` : nouvelle fonction exportée `visionRadiusOf(state, unit)` = `visionRadius` de l'unité + `bonusVision` du terrain de sa case, appliqué UNIQUEMENT si : unité terrestre (ni `aquatic` ni `aerial`), non embarquée (`aboard === null` — transport naval = vision du navire), non barbare (`isBarbarian` — leurs spawns ne changent pas). `computeVisibleTiles` la consomme → fog serveur (autoriaute), filtrage d'état (`getFilteredState`) et journal cohérents d'un seul coup. Le client ne RE-calcule pas la vision (il consomme `players[me].vision`) — aucune divergence possible serveur/client ; vérifié : aucun `visionRadius` consommé côté apps/web.
- Villes, aériens, barbares : exclus (tests dédiés). Parties existantes : aucun champ d'état nouveau, zéro migration (`schemaVersion` inchangée).
- RULES.md : ligne T-08c ajoutée à la table des constantes (« bonusVisionColline +1, data-driven terrain.json »).
- Tests : +1 au rayon effectif sur colline (une case de plus révélée, bornes 3 inclus / 4 exclus), pas de bonus prairie/forêt/montagne, pas de bonus embarquée, pas de bonus barbare, ville inchangée, `getFilteredState` cohérent (visible/explored).

## Réglage 3 — Menu « unités sans ordre » : boutons Voir / Suivant

- `apps/web/src/pages/Game.svelte` : la liste `idleUnits` porte désormais (q, r) + index courant `idleIndex`.
  - **Voir** (bouton par ligne) : sélectionne l'unité via le même pipeline que le clic carte (`ui.set({ selectedUnitId … })` → panneau unité ouvert) et centre l'écran sur sa case via `canvasApi.centerOnHex({q,r})` — exactement le chemin du journal cliquable REPLAY-RESOLUTION, `camera.centerOn` ne touche PAS le zoom.
  - **Suivant** (visible seulement si ≥ 2 unités) : cycle cyclique dans l'ordre déterministe de la liste (`unitsWithoutOrders`, tri R-81), avec indicateur **« Suivant (n / total) »**. 1 seule unité = Voir seul, pas de Suivant (vérifié en jeu).
  - Liste recalculée à chaque ouverture de menu (jamais stale ; l'unité morte disparaît à la prochaine ouverture). 🔶 choix UX par défaut : le menu RESTE OUVERT après Voir/Suivant (Erik valide à l'œil — fermeture possible par « Revenir aux ordres »).
- Tests (`apps/web/tests/reglages-calibrage.test.ts`) : ordre déterministe de la liste (R-81, fortifiée/cargo exclues), câblage Voir/Suivant/indicateur/centerOnHex dans Game.svelte.

## Vérification

- **Suites** : `pnpm test` monorepo VERT (3 packages, exit 0 — rules 906+10 tests, web 400, server) ; `pnpm typecheck` 0 erreur (4/4).
- **e2e solo réelles** (serveur local 8787 + Vite 5174, parties 24DAMS et 3JQFE6) :
  - **2 seeds → 2 classes** : 24DAMS → **Grand Explorateur / Industriel**, 3JQFE6 → **Grand Bâtisseur** (journal + `greatPersonsByType` à 1). Fidèle au constat d'Erik : avant, c'était TOUJOURS artiste_penseur.
  - **Vision colline** : GP déplacé sur la colline (4,26) → tuiles (7,23)…(7,26) visibles = distance 3, impossibles au rayon de base 2 (la ville en (3,25) rayon 3 ne les couvre pas non plus). Fog serveur/diffusé cohérents.
  - **Voir/Suivant** : menu tour 0 à 1 unité → « Voir » seul, clic → caméra centrée sur le guerrier, panneau unité ouvert, zoom inchangé ; tour 2 à 2 unités → « Suivant (1/2) » puis (2/2), cyclique, centrage sur l'explorateur sur colline, zoom préservé.
- **Captures `dev-logs/captures-reglages-calibrage/`** : depart-24DAMS, reglage1-gp-explorateur-fonde, reglage1-gp-batisseur-seed2, reglage2-gp-sur-colline-vision3, reglage3-menu-1unite-voir, reglage3-menu-2unites-suivant, reglage3-suivant-cycle-2sur2.

## Notes / incidents de session

- Le serveur local wrangler (8787) tournait sur l'ANCIEN bundle : redémarré (`pnpm -C apps/server dev`) pour servir les nouvelles règles — Erik doit savoir que son wrangler local a été relancé (le Vite 5174 déjà lancé n'a pas été touché).
- Deux parties de test restent sur le serveur local : 24DAMS et 3JQFE6 (Amérique, tour 2) — à abandonner si gênantes.
- Zéro changement JEV/sableuse ; fichiers d'Erik intacts ; aucune clé ; journaux bruts non committés.

## Périmètre committable après feu vert

`packages/rules/src/civStartBonus.ts`, `packages/rules/src/fog.ts`, `packages/rules/src/types.ts`, `packages/rules/src/data/terrain.json`, `packages/rules/tests/reglages-calibrage.test.ts` (nouveau), `packages/rules/tests/phase7n.test.ts` (adapté), `apps/web/src/pages/Game.svelte`, `apps/web/tests/reglages-calibrage.test.ts` (nouveau), `RULES.md` (R-127, R-150, T-08c), captures (via -f comme d'habitude).
