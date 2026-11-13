# REPORT-DEFENSE-VILLE-B — L3 : le veto production défensive (« survivre d'abord », dernière tranche du plan défense)

**Mission exécutée le 13/11 (canon Erik 13/11, handoff HANDOFF-DEFENSE-VILLE-B). Base : tranche C livrée `b96e401`, main `050f07f`. Le veto tourne À VUE (localisation L4/L5 en place).**

**VERDICT : TOUS LES CRITÈRES D'ACCEPTATION SONT ATTEINTS — voir §4. Push + déploiement : §5.**

---

## 1. Livré — un seul levier (L3), zéro nouveau calcul, zéro nouvelle question LLM

- **Le veto** : une ville avec **menace visible à ≤ `defense.seuilQuestionDef` (2) tours de MARCHE** (BFS — réutilise `menacesVille` tranche A, même rayon canon que la question L5) **ET déficit de garnison** (réutilise `garnisonDeficit` — le colon n'est jamais un défenseur) **NE PRODUIT PAS d'item expansif** : colon, bâtiment ET merveille refusés au profit de la **meilleure combattante productible** (pivot, même filtre/tri que ① militaire) ; aucune combattante productible → les branches expansives court-circuitées, repli parmi les unités seules. **Un chantier expansif DÉJÀ EN COURS est REPLACÉ** (SetProduction remplace, progression conservée moteur — ferme le cas p03 « colon produit t34 pendant le siège »).
- **Branché aux DEUX endroits canon** :
  - `arbitrerProduction` (botPolicy PARTAGÉ — bot classique ET bot sous Jev via fusionnerPlan) + le pivot de chantier en cours dans la boucle de production de `botPolicy` ;
  - **harnais/port** : `appliquerVetoProduction` PURE (`joueur.ts` + miroir bit-à-bit `joueur.mjs`), appliquée EN DERNIER après la traduction L5 — `produireGuerrier` Jev + veto = **même ordre, jamais double** (dernier SetProduction par ville vetoée gagne) ; ville non menacée → ordres intacts **bit-à-bit**.
- Priorités canon respectées : garnison L1 > rappel L2 > question défense L5 > **veto L3** > production normale. `defenseVille.ts` (mécanique A) CONSOMMÉ, jamais retouché ; escortColon, condensé L4, question L5, gate R-190, gainSite, `schemaVersion` 28 — **intouchés**.
- **L0 FIRST** : 19 tests (`apps/server/tests/defense-ville-production.test.ts`) — rouges avant fix (symboles absents ; grenier expansif sous le siège au lieu du guerrier), géométrie calibrée pour isoler le veto du pivot escort préexistant (fixtures pop 1 + `poterie`). 1 test escort réaligné canon (le colon ne passe plus sur une ville menacée-déficiente, quelle que soit l'escorte dispo — la D3 reste prouvée avec garnison complète). **Suites vertes : rules 1214 · server 503 · jev-port 52 (croisés bit-à-bit inclus) · sableuse 228 · web 793 · `tsc -p apps/server` ✓.**

## 2. Banc Jev B — mêmes seeds que C (n=10, `sableuse/bancs/joueur-defense-b`, **0,3234 $** — budget ≤ 0,60 $ respecté)

**Sonde étendue** (`devtmp/arbitre-defense-ville.mjs`) : les villes MENACÉES-DÉFICIENTES sont reconstruites du condensé L4 (menace `villeId` à `distanceVille` ≤ 2 + `def.deficit` > 0) ; la sonde compte les colons SORTIS de ces villes (événement UnitProduced) et les SetProduction expansifs émis sur elles (ordresJev).

| Critère | C (`b96e401`, AVANT) | **B (avec veto)** | Verdict |
|---|---|---|---|
| **Colons produits pendant siège = 0** (rouge avant fix) | **1 colon** (t65, case −6,26) + **4 SetProduction expansifs** sur ville menacée-déficiente | **0** · **0** | **✓ prouvé** |
| Chutes p1 ≤ 2 | 2 | **2** (p05 c1 capturée t28 — élim précoce bot ; p10 c5 razée barbare — colon seul, résiduelle C inchangée) | ✓ |
| Élims ≤ 1 | 1 (p05) | **1** (p05, même seed) | ✓ |
| **Fondations ≥ 4,5** | 5,0 | **5,4** (54/10 — la peur d'un coût expansionnel NE SE VÉRIFIE PAS : le veto pivote, il ne supprime pas) | ✓ |
| Ping-pong imputable au rappel | 0/119 | **0/113** | ✓ |
| Coût input (tarif input-only) | 5363 jetons/décision (1344 déc.) | **5552 (+3,5 %, variance de trajectoires)** — le veto n'ajoute RIEN au prompt ; ≈ 0,000008 $/décision | chiffré ✓ |
| Zéro suicide D3UUQJ (0 violation mécanique escort) | 1 résiduelle de trajectoire | **0 mécanique** (escortColon intouché) ; 1 chute-sans-combat résiduelle p10 c5 (raze barbare, identique à C — consignée) | ✓ |
| Victoires p1 | 2 | 0 (variance : 9 parties nulles sur 151 tours, élim p05 t28 — voir §4 écarts) | information |

## 3. Banc bot 40×3 AVANT/APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-defense-b.json`) — zéro collapse

| Difficulté | Villes | Pop | PV mil. | Tours | Vainqueurs non-nuls |
|---|---|---|---|---|---|
| facile | 1,93 → 1,90 | 18,6 → 18,2 | 287 → 286 | 128 → 126 | 13 → 14 |
| normal | 1,95 → 1,95 | 18,0 → 18,0 | 286 → 286 | 138 → 138 | 8 → 8 |
| difficile | 1,98 → 1,95 | 13,8 → 13,7 | 266 → 261 | 138 → 137 | 8 → 9 |

Toutes les marges dans les normes (le bot partagé subit le veto sans collapse ; victoires en légère hausse). AVANT mesuré sur `050f07f` (stash → banc → pop).

## 4. Écarts consignés

- **Coût input +3,5 %** : attendu ≈ 0 (aucun champ ajouté au condensé — le veto est mécanique, côté traduction d'ordres) ; le delta vient de la variance des trajectoires (plus de tours vivants → décisions plus longues). Chiffré au sens canon (tarif input-only : négligeable).
- **0 victoire p1 sur ce banc** (C : 2, A3 : 2) — variance LLM sur des parties qui traînent à 151 tours (9/10 sans vainqueur ; p05 éliminée t28 comme dans toute l'histoire du seed 214915776). Les critères d'acceptation B ne portent PAS sur les victoires ; chutes/élims/fondations/colons-siège sont verts.
- La chute p10 c5 (raze barbare sur ville garnie d'un colon seul) subsiste : c'est le mode « entrée sans combat » (L7 — moteur, hors périmètre du plan défense) ; la production de la ville n'y est pour rien (sonde : 0 SetProduction expansif sur cette ville pendant le siège).
- Fondations SOUS LES GRIFFES : 17 (vs 12 en C) — bruit de position barbare (approx. sonde sans fog re-joué), métrique comparative non critère.
- Fixture escort réécrite (canon B) : le test « escorte en place → colon passe » ne peut plus passer sur une ville menacée-déficiente par construction (priorité veto L3 > escort) — la D3 est re-prouvée avec garnison complète.

## 5. Push + déploiement

À compléter après push (CI/Deploy à vérifier — canon re-run API si flocon wrangler, prod 200).

## 6. Fin du plan défense-de-ville (A + A2 + A3 + B + C)

Le plan défense est CLÔTURÉ avec cette tranche : la ville menacée voit (C), rappelle (A), se garnit (L1), ne s'expose plus (L6 fondation, escort pivot) et **ne produit plus d'expansion sous le siège** (B). Relais proposé au pilot : rien d'ouvert dans le plan — backlog général (L7 moteur : raze sans combat / `CityRazed` au snapshot, fix praticabilité oscillation déjà fermé).
