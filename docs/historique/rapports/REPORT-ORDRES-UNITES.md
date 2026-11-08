# REPORT-ORDRES-UNITES — Vendre, Soigner, Vigilance, Passer + raccourcis clavier

Mission exécutée (HANDOFF-ORDRES-UNITES, décisions Erik 06/10). Baseline : suites 999/582/120 vertes, schemaVersion 27.

## Formes d'ordres (moteur + protocole)

`packages/rules/src/state.ts` — 4 nouvelles variantes de `Order`, toutes `{ type, unitId }` :
- **`SellUnit`** — vente : +50 % du coût de production EFFECTIF (`productionItemCostOf`, traits compris — base R-135), unité détruite, trésorerie créditée (R-134). Interdits → refus nommé `SellRefused { reason: 'abord' | 'cargo' | 'combat' }` : à bord d'un transport, transport PORTEUR de cargaison (la cargaison ne peut pas périr — consigné), unité ayant combattu ce tour (siège/combat en cours — interdiction supplémentaire consignée).
- **`Heal`** — ordre PERSISTANT (`unit.order`, miroir du chemin gelé) : immobile, taux R-71 inchangé (+1/tour, +2 en ville amie), **jusqu'à PV complets** puis l'ordre se termine (`HealCompleted`, unité sans ordres). **Refus `HealRefused { reason: 'territoireEnnemi' }`** = anneaux culturels R-162, évalué **à la pose seulement** 🔶 (un soin accepté se poursuit même si le territoire évolue ensuite — testé). À bord : ignoré. R-71 préservée : pas de soin après combat (l'ordre demeure).
- **`Sleep`** — ordre PERSISTANT : passe ses tours ; **réveil** en Phase D après recalcul de vision dès qu'un ennemi (unité OU ville) est VISIBLE (fog : case explorée non visible ≠ réveil) → ordre nul + `SleepWoke`. Tout autre ordre (y compris Hold) lève la vigilance.
- **`Pass`** — inerte ce tour (chemin gelé effacé) ; « sans ordres » au tour suivant (consommé).

**Fortifier NE soigne PLUS** : le soin passif R-71 est RÉVOQUÉ (`processHealsAndMp` ne régénère plus que les PM R-72) — fortifié, oisif, barbare : zéro soin ; le soin exige `Heal`. Bonus défensif T-17 inchangé.

## Résolution (turn.ts)

- `applyPersistentUnitOrders` — tête de Phase A (avant fortifications/mouvements) : annulation de Heal/Sleep par tout autre ordre, pose (refus nommé en territoire ennemi), Pass. Un Fortify donné à une unité en soin lève le soin (miroir R-33).
- `applySellUnits` — Phase C (après RushBuy, avant l'économie → les paliers R-136 voient l'or de vente).
- `wakeSleepers` puis `processHealOrders` — Phase D (après `recomputeVision`), puis `processHealsAndMp` (PM seulement).

## Événements (events.ts)

`UnitSold{amount}`, `SellRefused{reason}`, `HealCompleted`, `HealRefused{reason}`, `SleepWoke` — refs fog complètes (filtrage standard, atteignent leur joueur). Durées playback ajoutées (pas d'animation dédiée).

## Helper partagé

`estTerritoireEnnemi(state, hex, playerId)` (economy.ts — évite le cycle culture↔économie) : territoire d'une ville = `frontierRadius(workRadiusOf(buildings), rayonCulturelDe(cultureCumulee))` (R-162). Consommé par le moteur ET l'UI (bouton Soigner désactivé).

## Serveur (L3)

`orderShapeError` : 4 formes acceptées (`unitId` string, EN PREMIER — leçon 7f) ; **`orderOwnerErreur`** : même possession d'unité que Move/Fortify (c'est ce valideur qui rejetait en « ordre inconnu » — découvert en GUI, régression couverte par test).

## Client (L4)

- **UnitPanel** : boutons « Fortifier (F) », « Soigner (H) » (désactivé + tooltip motif : à bord / territoire ennemi / PV complets), « Vigilance (S) », « Passer (Z) », « Vendre (+N or) » (désactivé à bord / transport chargé) ; états « 😴 Vigilance » / « ✚ En soin » ; `orderLabel` étendu ; « Centrer la caméra (C) » (F était pris — migration du raccourci caméra F→C dans GameCanvas).
- **Raccourcis D6** : UN SEUL gestionnaire central (Game.svelte `svelte:window`) — F/H/S/Z-Espace/B sur l'unité sélectionnée, gardes : saisie texte (INPUT/TEXTAREA/SELECT/contentEditable), modale ouverte (régimes, victoire), relecture, vue ville, tour non éditable, unité ennemie/absente. Espace : preventDefault.
- **Sprite** : badges d'état persistant 😴 (vigilance) et ✚ (soin), même mécanisme que l'écu de fortification.
- **Toasts directs** (page, TurnResult) : vente (+N or, good), réveil (bad), refus de soin (bad).
- **Chroniques** : `UnitSold` (empire), `SellRefused` (empire, motif nommé), `HealCompleted` (empire, good), `HealRefused` (empire, bad), `SleepWoke` (menaces). Libellés laboCombat étendus.

## Vérification GUI réelle (L5) — devtmp/ordres-unites-gui.mjs + -suite-gui.mjs

Parties 1v1 DEUX HUMAINS pilotées (map procedural-40, captures `dev-logs/captures-ordres-unites/`) :
- **A** — `B` au clavier sur le colon → ville fondée à la résolution (A-fonde-au-clavier).
- **B** — `S` au clavier → badge 😴 + panneau « Vigilance » ; le guerrier p2 approche → **réveil prouvé** : `SleepWoke` au dump dans la résolution où p2 entre dans la vision (≤ 2), toast « réveillée — ennemi en vue », entrée Chroniques (B-vigilance-badge, B-reveil-toast).
- **C** — combat p2→p1 → blessure ; `H` au clavier → soin multi-tours **jusqu'à guérison** (HP 2→2→2→3, HealCompleted, Chroniques) (C-soin-badge, C-gueri).
- **D** — unité p2 en territoire p1 : bouton **Soigner désactivé** (tooltip « Territoire ennemi (R-162) »), `H` → **`HealRefused` au dump** (D-soin-refuse).
- **E** — `Z` → ordre nul à la résolution (inertie) ; `F` sur stabilisée → `fortified: true` au dump (E-passe, E-fortifie).
- **F** — bouton Vendre → unité retirée, **`UnitSold{amount:5}`** au dump (coût guerrier 10 → +5 or ; la trésorerie brute est vérifiée via l'événement, elle mêle les revenus R-90) (F-vente).
Pièges surmontés et consignés : le workerd local fige après ~10-15 tours (le script redémarre wrangler, reconnecte les sockets et recharge les pages) ; `orderOwnerErreur` sans les nouveaux types rejetait tout en « ordre inconnu » (corrigé, testé) ; blocages R-184 (recherche/production) posés chaque tour.

## Tests

- `packages/rules/tests/ordres-unites.test.ts` — **20 cas** (rouge 13/20 avant implémentation) : vente (montant, destruction, refus à bord/cargaison/combat/ennemi), soin (taux, ville, terminaison, refus territoire, poursuite malgré évolution du territoire 🔶, R-71, annulation par Move), fortifier/oisif sans soin (régression verrouillée), vigilance (persistance, réveil, fog, annulation), Passer, barbares hors scope.
- Révisions des tests du soin passif : fortify.test (1), turn.test (1), barbares.test (1).
- `apps/server/tests/orderShape.test.ts` — +2 describe (formes EN PREMIER, possession).
- Suites finales : **rules 1019 vertes** (+20), **web 582**, **server 123** (+3) ; tsc 0 erreur ×3 ; svelte-check 0 erreur / 17 warnings (baseline).

## schemaVersion (D7) : 27 INCHANGÉE

Les ordres vivent côté serveur (hors état) ; Heal/Sleep persistent dans `unit.order` — champ existant dont le type s'élargit : les états anciens n'ont jamais porté ces formes (aucune migration nécessaire, tolérance miroir de la migration 19).

## RULES.md

§4 : 4 nouvelles lignes d'ordres + révocation du soin dans R-33 ; §9 : R-71 révisée (aucun soin passif, `Heal` unique canal, barbares zéro soin) ; R-95 : ordres hors scope barbare.

## 🔶 Points à l'œil / consignés

1. **Raccourci caméra** : F était « centrer la caméra » — migré sur **C** (décision D6 F=Fortifier est maîtresse ; à l'œil Erik).
2. **Évolution du territoire** : le soin accepté se poursuit si les anneaux ennemis l'englobent ensuite (évalué à la pose seulement) — unitaires seulement.
3. **Vente d'un transport chargé refusée** (extension consignée : la cargaison ne peut pas périr) ; vente refusée après combat ce tour.
4. **Heal à plein PV** : se termine immédiatement (HealCompleted, sans soin).
5. Barbares : zéro soin désormais (miroir de la révocation R-71) — calibrage de difficulté à l'œil en jeu.
6. Le bouton Soigner reste cliquable au clavier (H) même désactivé à l'UI : le refus moteur nommé (HealRefused) + toast couvrent le retour.
