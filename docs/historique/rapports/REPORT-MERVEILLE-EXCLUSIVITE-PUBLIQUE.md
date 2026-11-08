# REPORT-MERVEILLE-EXCLUSIVITE-PUBLIQUE

**Mission** (feu vert Erik 05/10, suite au signalement « Stonehenge désélectionnée
entre le tour 28 et 29 ») — trois volets convenus, tous livrés. Cause racine : une
merveille bâtie par un bot DANS LE BROUILLARD était invisible du client (état
filtré + événement filtré), l'onglet la proposait donc, et le moteur refusait
l'ordre à la résolution en silence (RULES §5) — file vide, blocage sans explication.

## Volet 1 — WonderCompleted PUBLIC (annonce Civ)

`packages/rules/src/fog.ts` : `'WonderCompleted'` ajouté à `PUBLIC_EVENTS` — toute
merveille achevée apparaît désormais dans les chroniques de TOUS les joueurs, même
bâtie dans une ville invisible (la ligne existait déjà côté rendu :
`chronique.ts` « merveilles »).

## Volet 2 — worldWondersBuilt publique dans le snapshot

- `state.ts` : champ optionnel `worldWondersBuilt?: string[]` (miroir
  d'`artifactPings` — JAMAIS persisté, posé uniquement par `getFilteredState`,
  **schemaVersion 27 inchangée**) ;
- `fog.ts` `getFilteredState` : liste dérivée de l'état COMPLET (triée,
  dédoublonnée — les villes invisibles comptent) ;
- client : helper pur `merveillesMondeConnues` (`lib/fileProduction.ts`, union
  liste publique + villes visibles — repli si champ absent), branché dans
  **PanneauVille** et **CityView** (qui calculaient la liste sur les seules villes
  visibles) → une merveille déjà bâtie n'est plus proposée.

## Volet 3 — ProductionRefused : un refus ne s'évapore plus

- `events.ts` : nouvel événement `ProductionRefused { cityId, owner, item, reason }`
  (+ case `eventRefs`) ;
- `turn.ts` : la porte `itemProductionRefuse` (booléen) devient
  `itemProductionRefuseCause` (raison nommée : « déjà construite quelque part
  (exclusivité mondiale) », R-87, R-117…) ; `applySetProduction` et
  `applyQueueOps` émettent l'événement au lieu de `continue` muet ;
- client : ligne de **chronique** (« Ordre refusé : Stonehenge n'a pas pu être
  programmé à Ville1 — déjà construite… », catégorie empire) + **toast** en direct
  dans Game.svelte (miroir « Ordre non exécuté » des déplacements) ;
- `playback.ts` : durée 600 ms (pas d'animation dédiée).

## Tests

- **rules** `merveille-exclusivite-publique.test.ts` (6 cas, rouge 4/6 avant) :
  WonderCompleted traverse le filtre de vision, garde-fou (un événement ordinaire
  reste filtré) ; worldWondersBuilt complète/triée/vide + jamais persistée ;
  QueueProduction refusée → file vide + événement avec raison (et l'événement
  atteint le joueur) ; ordre valide → pas d'événement.
- **web** `merveille-exclusivite-publique.test.ts` (3 cas, rouge 3/3 avant) :
  union triée/dédoublonnée du helper, repli sans champ, chronique du refus.
- Suites vertes : **rules 999** (+6), **web 568** (+3), server 120 ;
  svelte-check **0 erreur**, 17 warnings (= baseline).

## GUI réel

`devtmp/merveille-exclusivite-gui.mjs` (wrangler 8787 + Vite 5174, solo
procedural-40) — le geste exact d'Erik : clic « + » Stonehenge dans l'onglet
Merveilles (QueueProduction) → fin de tour → **la production survit**
(`{kind:'wonder', id:'stonehenge'}`, 0 `ProductionRefused`). Captures
`dev-logs/captures-merveille-exclusivite/` (onglet, file, après-résolution),
relecture visuelle PASS.

## 🔶 Limites consignées

- Le scénario BROUILLARD (merveille bâtie par un bot invisible) est prouvé en
  unitaires uniquement — impossible à forcer de façon déterministe en GUI
  (aucune mutation admin d'une partie locale).
- `WonderCompleted` public = ligne chronique chez tout le monde ; le libellé
  adversaire masque à la nation (D4 CHRONIQUES, inchangé).
- Erik doit confirmer dans sa partie PD8TSV qu'un bot détient bien Stonehenge
  (la cause du refus de son tour 28 — reconstruite, non observable rétroactivement).
