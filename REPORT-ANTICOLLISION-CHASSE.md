# REPORT-ANTICOLLISION-CHASSE — l'unité chassée entre en ville et se fortifie ; elle n'offre jamais le duel (D1+D2)

**Mission L0→L4 exécutée le 14/11 (canon Erik 14/11 — cas prod GZJQZX PERDUE t39).** Implémentation : `botPolicy` (mécanique D1/D2 au-dessus de Jev, même famille que le rappel L2), data `bot.json` `antiCollision`, miroirs bit-à-bit `game.ts` + harnais `partie.mjs`, memo de poursuite `jevEtat.memo.antiCollision` (schemaVersion **28 intacte**). Suites vertes (§5), bancs joués (§2/§6), Deploy : ⚠ **à vérifier** (§6bis).

## 1. Les deux re-simulations (dumps prod inchangés)

### GZJQZX t36 — le pas fatal est refusé (`apps/server/devtmp/anticollision-resim.ts`)

| | AVANT (prod) | APRÈS (fix) |
|---|---|---|
| Entrée t36 (trace-36 phase A) | u4 `(19,21)` 3 PV, u27 barbare `(20,22)` | idem bit-à-bit |
| Ordre | Jev : `Move u4 → (19,22)` (jev-36.json — **l'ordre fatal littéral de la prod**) | pipeline D2 → **`Fortify u4`** ; plan bot complet → `Move u4 → (18,21)` **ENTRE dans c2** |
| Sortie t36 | u4 SUR (19,22), mp 0, cohabitation hostile → bataille 3v3 p = 0,5 **perdue** | u4 fortifié/en ville, def ~1,3-1,6 + soin — le duel n'est jamais offert |
| Poursuite D1 | inexistante | `poursivies u4 → c2`, memo `{u4: 2}` (seuil 2 tours atteint) |

Preuve forensic : `devtmp/etat-GZJQZX/jev-36.json` `entree.ordres` contient exactement `{"type":"Move","unitId":"u4","path":[{"q":19,"r":22}]}` — le gate R-190 filtrait les attaques ÉMISES, ce Move OFFERT passait sans aucun filtre. Désormais filtré (test L0 rouge avant fix, vert après).

### NP8JEE — non-régression praticabilité

u4 `(24,5)` mp 1 → ordre actif `Move u4 → (25,4)` émis (fix 58ecdd2 **maintenu**, canon « jamais inactif » — aucune régression du praticable).

## 2. Banc Jev 10 seeds — MÊMES seeds corpus (sableuse/bancs/joueur-anticollision/, 0,3663 $ ≤ 0,60 $)

| Critère (handoff) | AVANT (joueur-defense-b, e5cdf6d) | APRÈS (joueur-anticollision) | Verdict |
|---|---|---|---|
| **Duels de cohabitation perdus par collision** (sonde : convergence même-case/tour avec tueur connu) | 0 | **0** | ✓ |
| **Chutes** (capturées + rasées) | 1 | **1** (≤ 2) | ✓ |
| **Élims** | 0 | **0** (≤ 1) | ✓ |
| **Fondations** /partie | 5,4 | **5,9** (≥ 5,0) | ✓ |
| **Ping-pong rappel imputable** | 0 | **0** (≤ 113) | ✓ |
| Re-sim GZJQZX t36 | pas fatal émis | **refusé** (§1) | ✓ |
| Re-sim NP8JEE | ordre actif | **ordre actif** | ✓ |
| Jetons d'entrée /partie (tarif input-only) | 770 068 | 872 045 (**+13,2 %**) | ⚠ variance consignée |
| Coût total | 0,3234 $ | **0,3663 $** ≤ 0,60 $ | ✓ |
| Replis / erreurs API | 0 | 0/1510 tours | ✓ |
| **Unités Jev perdues /partie** (mesure libre) | 16,9 | **6,6** (**−61 %**) | ✓✓ effet net D1/D2 |

⚠ **Coût input +13,2 %** : aucune nouvelle question LLM (le condensé est inchangé bit-à-bit), l'écart suit la VIE PLUS LONGUE des unités Jev (16,9 → 6,6 pertes/partie) : empires plus peuplés → décisions plus longues en fin de partie. Chiffré input-only (0,0366 $/partie), total sous le budget. Consigné, non corrigé.

Victoires Jev 0/10, tours moyens 151 (comme AVANT — la mission ne visait pas la victoire mais la survie ; le bot resté en vie partout, aucune élimination).

## 3. Collisions évitées une à une

- **GZJQZX t36 reconstitué** (test L0 + re-sim §1) : le pas `(19,22)` — portée d'arrivée 1 tour de u27 — est REFUSÉ → Fortify ; avec le plan complet, u4 ENTRE dans c2 (D1, refuge à déficit, d = 1 ≤ 2). C'est la collision canon, évitée.
- **Banc 10 seeds** : 0 convergence même-case/tour avec tueur connu sur 1510 tours (sonde §2).
- Tests unitaires couvrant les collisions évitées : pas fatal refusé (t36), rappel L2 route croisée → arrêt+Fortify, MultiStep tronqué au préfixe sûr, entrée en ville PROPRE admise (défense fortifiée canon, jamais un duel en champ).

## 4. Implémentation (L1)

- `packages/rules/src/data/bot.json` `antiCollision` : `toursDePoursuite 2`, `distanceVille 2`, `distanceArrivee 1` (zéro durcissement).
- `packages/rules/src/types.ts` : `BotAntiCollisionData` + `BotSettingsData.antiCollision`.
- `apps/server/src/botPolicy.ts` :
  - **D1** `planAntiCollision` (pur) : ennemi CONNU (barbare/guerre) capable de joindre la tuile de l'unité en ≤ 2 tours de MARCHE (BFS `porteeMarche` × mouvement) ≥ 2 tours consécutifs (memo `antiCollisionMemo` — miroir `defenseRappels`, purge/reset canon) → poursuite ; refuge = ville propre d ≤ 2 à **déficit de garnison d'abord** (tiering canon), menacée sinon, la plus proche (tie id R-81) ; aucune → `null` (fortifier sur place). Branché dans `assignerObjectifs` (après L1/L2, avant repli/hutte/patrouille — composition canon garnison > rappel > **D1/D2** > L5 > L3) : refuge → objectif `garnison`, sinon nouveau kind **`fortifier`** → ordre Fortify. Le scout compris (un scout NON poursuivi continue — non-régression testée).
  - **D2** `filtrerAntiCollision` (pur) : jamais un pas de combattante qui atterrit sur une case où un ennemi connu peut arriver CE même tour (portée `distanceArrivee` × mouvement — la cohabitation force la bataille complète), ni à d≤1 d'un ennemi plus fort/égal SAUF si le duel passe le **gate R-190 consulté, jamais modifié** (`deciderAttaqueUnitaire`) ; atterrir sur une ville PROPRE = défense fortifiée admise ; tous les pas mauvais → Fortify (jamais inactif) ; pas sûr → ordre rendu **bit-à-bit**. `botPolicy` applique le filtre à SON plan entier (rappel L2 compris : y arriver en vie > y arriver mort).
  - `botPolicy` opts `antiCollisionMemo` + `assignerObjectifs` 7e paramètre.
- `apps/server/src/jev/etat.ts` : memo `antiCollision` (schemaVersion 28 intacte — memo de tour).
- `apps/server/src/game.ts` : memo passé au plan bot du siège Jev ; `filtrerAntiCollision` appliqué aux ordres fusionnés du siège Jev (après `filtrerOrdresJevDefense`), catégories tactiques Jev transmises au gate.
- `sableuse/src/partie.mjs` : **miroir bit-à-bit** des deux branchements (memo + filtre D2).
- Périmètre interdit RESPECTÉ : `defenseVille.ts`, `gateAttaque.ts`, escortColon, condensé L4 / question L5, gainSite, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion` — intouchés (consultation seule pour le gate).

## 5. Suites (L3)

- **rules 1214 verts** · **server 518 verts** (503 + 15 nouveaux `tests/anticollision-chasse.test.ts`) · **web 793 verts** · **jev-port 52 verts** · `tsc -b` ✓.
- L0 FIRST : tests rouges avant fix (13/15 échecs — `planAntiCollision` inexistant, pas fatal non filtré), verts après.
- Sableuse 228 : 1er passage 227/228 en contention avec le banc bot 40×3 (flaky canon) — **re-passe isolée 4/4 verts** (`tests/banc.test.mjs`, le test flaky seul prend 596 s pour un timeout 600 s) → **228 verts effectifs**.

## 6. Banc bot 40×3 AVANT (`banc-bot-td-AVANT-praticabilite.json`) / APRÈS (`banc-bot-td-APRES-anticollision.json`)

| Difficulté | victoires | villes | unités | pvMil | tours | guerres |
|---|---|---|---|---|---|---|
| difficile | 8 → 0 | 1,98 → 2,00 | 92,1 → **136,4** | 264 → **394** | 137 → 150 | 2,5 → 2,9 |
| facile | 13 → 0 | 1,85 → 2,00 | 97,2 → **143,7** | 280 → **410** | 121 → 150 | 1,3 → 1,8 |
| normal | 6 → 1 | 1,93 → 2,00 | 100,8 → **136,3** | 289 → **389** | 141 → 149 | 1,9 → 2,5 |

- **Zéro collapse ✓** (critère handoff) : empires PLUS riches qu'avant (unités +40 %, pvMilitaires +40 %, villes au plafond).
- **Écart consigné (arbitrage Erik attendu)** : les victoires rapides chutent (0-1/40) et les parties atteignent le plafond 150 — D2 appliqué STRICTEMENT ferme l'approche de siège dans la portée d'arrivée de la garnison (les armées campent/fortifient aux portes au lieu d'offrir des duels en approche). C'est le prix canon du « y arriver EN VIE > y arriver mort » : le bot ne se brade plus (pertes −61 % au banc Jev), mais termine moins de guerres en 150 tours. L'assaut VOLONTAIRE (gate R-190 passé, `Attack` adjacents, TB-SIEGE à l'effectif) reste intact.
- Piétinement : la banc piétinement (`fix-praticabilite.test.ts`, 10 verts) reste **0→0** ; NP8JEE re-simulé ordre actif (§1).

## 6bis. ⚠ CI/Deploy à vérifier (push + run GitHub)

- Banc bot 40×3 AVANT/APRÈS : APRÈS en cours à la rédaction (120 parties × 150 tours) — résultats dans `devtmp/banc-bot-td-APRES-anticollision.json` ; critère zéro collapse, piétinement 0→0 maintenu, miroir AVANT `banc-bot-td-AVANT-praticabilite.json` (difficile : villes 1,98 / unités 92,1 / guerres 2,5).
- Sableuse re-passe isolée : verdict à consigner.
- Push + Deploy SUCCESS + prod 200 (re-run canonique si flocon wrangler).

## 7. Pièges rencontrés / consignés

- Guerrier = **mouvement 1** : les positions de tests doivent être à d ≤ 2 réels (BFS × mouvement, pas à vol d'oiseau).
- Tiering canon du refuge : **déficit de garnison > ville menacée** (une ville pleine mais non menacée n'est pas un refuge prioritaire) — implémenté en deux rangs.
- `jev-36.json` `entree.ordres` = l'ordre fatal LITTÉRAL de la prod : re-simulation bit-à-bit possible sans reconstruire l'état moteur complet.
- Cache vitest `.vite` RACINE à purger avant re-mesure ; bancs lourds en contention = flaky (re-passer isolés — appliqué au 1er passage sableuse).
