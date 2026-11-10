# REPORT-ORACLE-VERDICT — l'Oracle révèle VRAIMENT l'issue (Chemin B, canon Erik 09/11)

**Mission livrée.** La définition du data (« issue du combat révélée avant engagement ») tient désormais : les jets de combat **mêlée** sont un **dérivé déterministe par bataille** (indépendants du flux RNG), et l'Oracle affiche un verdict **VICTOIRE / DÉFAITE certain** — au panneau d'attaque et dans la préview vivante — seulement si la merveille est active (obsolescence globale R-128 incluse).

## 1. Le dérivé (L1, D1)

- **`packages/rules/src/derive.ts`** — `jetDeBataille(graineTour, idAttaquant, idDefenseur, caseAttaquant, caseDefenseur, assaut)` : FNV-1a 32 bits sur la clé → [0,1). Pur, déterministe, jamais `Math.random`, sensible à chaque composante.
- **`turn.ts` `performExchange`** : l'assaut MÊLÉE tire son jet du dérivé (Phase B attaque + Phase E convergence hostile COHABITATION-HOSTILE — même chemin). **Piège consigné : `rollTrace` ignore sa closure `tirer` et consomme TOUJOURS le flux** — le dérivé est rapporté à la trace via `board.trace.roll(jet, usage)`. `Board.seedTour` (nouveau champ interne) porte la graine d'entrée de `resolveTurn`.
- **Restent sur le flux** (consigné, D1) : le tir R-59 distance-vs-distance (un assaut, jamais à la mort), le tirage d'égalité R-177, la mêlée pondérée R-180, et tous les autres consommateurs (huttes, espions, destruction de bâtiments, Oxford, fondations) — **leur valeur se décale d'un cheveu** (les combats n'y puisent plus) : c'est le recalage attendu des bancs.
- Intouchés (D4) : formule de forces p = S²/(S²+S²), bataille complète, tirs R-59 sans riposte (jet null), soin/fortif, gainSite, Zii, `schemaVersion` 28.

**La preuve L1** (`packages/rules/tests/oracle-verdict.test.ts`, 5 tests verts) : LE test canon — sur 30 seeds, chaque jet de la bataille RÉELLE == `jetDeBataille` calculé avant résolution, bit à bit ; **indépendance du flux** — une hutte explorée par une autre unité (tirages décalés) laisse l'issue et les jets bit à bit identiques (30 seeds) ; la mêlée de convergence Phase E utilise le même dérivé (cas Erik 5633Y3 reconstitué, 20 seeds) ; les tirs R-59 restent intouchés.

## 2. La révélation (L2, D2/D3)

- **`packages/rules/src/oracle.ts`** — `oracleActif(st, playerId)` : gate data-driven (`battleForeknowledge` de `wonders.json`, pas d'id en dur) + obsolescence GLOBALE R-128.
- **`apps/server/src/prediction.ts`** — `predireBataille` : gates Oracle actif → attaquant à moi → MÊLÉE (tirs R-59 refusés, pas de dérivé) → **fog** (`computeVisibleTiles`, cible invisible = `refus`, jamais d'info) → unité à la cible ; puis **simulation complète** : clone de l'état, ordres brouillons + attaque hypothèse (remplaçant tout ordre de l'attaquant), `resolveTurn` sur `st.rngSeed` → verdict sur le dernier `CombatExchange` de l'attaquant (`defenderHpAfter <= 0` → victoire).
- **Canal** : `PredictBattle { attaquant, cible }` (client→serveur) → `BattlePrediction { attaquant, cibleQ, cibleR, verdict }` **privé** (socket du demandeur seulement) — `packages/shared/src/index.ts`, dispatch `game.ts`.
- **Web** : `lib/oracle.ts` (table des verdicts par (attaquant, cible) + cadence D2 : une demande par tour×attaquant×cible, purge au TurnResult/Snapshot/**OrderAck** — un verdict caduc ne reste jamais affiché après un autre ordre) ; `gameClient.predireBataille` ; **UnitPanel** : les pourcentages (`combatOdds`, `% /round`) sont SUPPRIMÉS, remplacés par « 🔮 VICTOIRE / DÉFAITE » sur chaque bouton d'attaque (gate `oracleActive`, tirs exclus) ; **GameCanvas préview vivante** : demande au survol d'une destination-ennemie visible (Oracle actif, mêlée), verdict dans l'infobulle + reconstruction à réception.
- **Périmètre honnête (D3, consigné)** : la simulation porte les ordres connus AU MOMENT de la demande — un ennemi qui ARRIVERA (ordres pas encore soumis des bots/Jev) reste dans le brouillard. L'Oracle est un outil du joueur : Jev/bots ne le consultent jamais (aucune IA branchée).
- **RULES.md amendé** : R-51 rév. ORACLE-VERDICT (jets dérivés) + R-125 Oracle (verdict certain, canal, gates, périmètre).

## 3. Tests

- **FIRST** : les tests ont été écrits rouges avant chaque implémentation (rules 5, oracleActif 3, serveur 7, web 8 — tous verts).
- **Re-verrouillages (issues attendues changées une par une, assertions gardées strictes)** :
  - `turn.test.ts` : les deux chercheurs de graine (`seedWhereDefenderIsHit`/`seedWhereAttackerIsHit`) cherchent désormais SUR LE DÉRIVÉ (l'ancien raisonnement « 1er/2e tir du flux » est caduc).
  - `engagement.test.ts` : barbare tient 3 PV (2 victoires sans perdre un round sous le dérivé).
  - `engagement-dispute.test.ts` : 3 graines re-sondées (0 au lieu de rngSeed/3/14 — même scénario, même verrou).
  - `phase7n.test.ts` : overrun non-zoulou, graine 5 (l'attaquant gagne avec pertes).
  - Aucune assertion assouplie : mêmes invariants, nouvelles issues attendues.

## 4. Suites & bancs (L3)

- **Suites toutes vertes** : rules **1146/1146** (1138+8 nouveaux), serveur **443/443** (436+7), web **793/793** (785+8), jev-port 40/40, sableuse 228/228 ; tsc server/rules/shared propres ; svelte-check 0 erreur.
- **Banc bot 40×3 AVANT/APRÈS** (`devtmp/banc-bot-td-{AVANT,APRES}-oracle.json`) — re-baseline assumée (les dés changent) :

  | Difficulté | Villes | Population | Unités | Trésorerie | PV mil. | Tours |
  |---|---|---|---|---|---|---|
  | facile | 1,9→1,9 | 17,8→16,6 | 88,0→89,2 | 1313→1116 | 250→257 | 130→129 |
  | normal | 2,0→1,9 | 15,4→14,3 | 87,7→79,4 | 803→890 | 246→224 | 136→123 |
  | difficile | 1,9→1,8 | 12,9→11,8 | 84,0→72,8 | 474→564 | 235→206 | 142→126 |

  **Zéro collapse** : villes stables (±0,1), population −7 %, unités −10 % (normal/difficile) — l'écart d'issue attendu des dés recomposés ; trésorerie en hausse (moins d'entretien). **Banc Jev : reporté au prochain banc naturel** (pas de drift structurel — consigné, canon du handoff).
- ✅ **CI/Deploy vérifiés** : run **Deploy SUCCESS sur c2a8c34** (le Deploy en échec de 0f55d11 — flocon consigné — est couvert/repassé par celui-ci) ; prod HTTP 200.
- Sonde crédits Z.ai : HTTP 200 en tête de session (aucune quille).

## 5. Remise de la main (L4)

À Erik : construire l'Oracle de Delphes (alphabet), sélectionner une unité mêlée adjacente à un ennemi visible (verdict au panneau) ou tracer un chemin clic-droit vers lui (verdict 🔮 dans l'infobulle de la préview vivante) — l'Oracle dit la vérité AVANT la confirmation. Sans l'Oracle (ou après Religion), plus rien n'est révélé.
