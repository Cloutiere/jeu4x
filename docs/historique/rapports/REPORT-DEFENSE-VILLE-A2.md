# REPORT-DEFENSE-VILLE-A2 — Mini-suivi cohérence rappel×escort + marqueur d'état (suite de DEFENSE-VILLE-A)

**Mission exécutée le 12/11 sur la base du commit local `2f95e59` (tranche A) — HANDOFF-DEFENSE-VILLE-A2 (arbitrage Erik 5c5b362 : « mini-suivi cohérence puis push » ; options (a) et (b) rejetées, L6 GARDÉ).**

**⚠ ARRÊT-POUR-APPROBATION — les critères de push ne sont pas atteints. Commit A2 `06193b9` LOCAL (2f95e59 + 06193b9 NON POUSSÉS), pas d'itération solo, remise de la main.**

---

## 1. Les deux correctifs livrés (rien d'autre ne bouge)

1. **Cohérence rappel × escort** (`06193b9`) : `escortColon` gagne des paramètres **`exclues` optionnels** (défaut bit-à-bit — règles escort inchangées sinon) sur `escorteEnPlace`, `doitRappelerColon`, `deciderProductionColon` : une combattante **rappelée par le plan défensif ne compte plus** comme escorte (adjacente OU « disponible »). Le port Jev (`jev/joueur.ts`) et le harnais (`joueur.mjs`) calculent le plan défensif **le même tour** (sur l'état connu, avec le memo partagé) et passent `excluesDefense` à `ordreMarcheColon` (2 sites) et `deciderProductionColon` — le colon attend en ville ou est rappelé, il ne reste JAMAIS seul sur une route risquée parce que son escorte a été rappelée.
2. **Marqueur d'état de rappel** (l'option (c) du rapport A) : `planDefenseVille(state, me, profile, memo?)` — memo `unitId → cityId` (le memo Jev persisté, **PAS une donnée de schema**, schemaVersion 28 intacte ; champ `JevMemo.defenseRappels`) :
   - DÉCLENCHEMENT canon (≤ `menaceDist` = 3 tours de MARCHE) → rappel + marqueur POSÉ ;
   - HYSTÉRÉSIS à état : le marqueur TIENT l'unité (rappel en route ou maintien sur tuile) tant que sa ville garde une menace dans la bande (≤ 5) — même hors rayon de déclenchement ;
   - DISSOLUTION (plus aucune menace dans la bande) → marqueur **CONSOMMÉ**, l'unité reprend son ordre ; purge des unités mortes/villes perdues ;
   - **Sans memo (bots purs) : statu quo `2f95e59` bit-à-bit** — prouvé par re-simulation du témoin du banc bot 40×3 (3/3 difficultés identiques à `banc-bot-td-APRES-defense.json`, donc banc bot A toujours valable : **zéro collapse ✓ sans re-jouer 28 min**).
   - Branché : game.ts (opts botPolicy + filtre défensif), harnais `partie.mjs` (miroir), port `joueur.ts`/`joueur.mjs`.

**L0 FIRST** : 9 nouveaux tests (3 escort-exclues — rouges avant fix ; 6 marqueur — déclenchement ≤3, jamais-trigger d=4 → pas de rappel, tenu à d=4 avec marqueur, dissolution consommée, maintien pose le marqueur, purge fantômes, statu quo bots). **Suites vertes : rules 1214 · server 470 · jev-port 40 · sableuse 228 · web 793.**

## 2. Re-mesure UNE FOIS — mêmes seeds (n=10, ~0,31 $, `joueur-defense-2026-11-12` journaux réécrits)

Sondes : `devtmp/arbitre-defense-ville.mjs` + sonde escort raffinée.

| Critère de push (handoff) | Baseline escort | A (2f95e59) | **A2 (06193b9)** | Verdict |
|---|---|---|---|---|
| **Sonde escort 0** | 0 | 2 | **2** (NOUVELLES trajectoires : p03 u172 t96, p09 u56 t64 — tueurs connus) | **✗** |
| **Ping-pong ≤ 136** | 136 | 141 | **162** | **✗** |
| Élims < 3 | 3 | 1 | **1** | ✓ |
| Fondations ≥ 5,7/partie | 6,2 | 5,9 | **5,5** | **✗** (−0,2) |
| Zéro collapse banc bot | — | ✓ | **✓** (bots bit-à-bit inchangés — témoin re-simulé 3/3) | ✓ |
| Razes (NON critère — limite fog consignée) | 6 | 7 | 8 | consigné B/C |
| Fondations sous les griffes (approx. sans fog) | 20 | 22 | 15 | consigné |

## 3. Diagnostic des échecs (chiffres consignés, pas d'itération solo)

1. **Sonde escort ≠ 0 malgré le fix** : les 2 violations d'A2 sont des trajectoires **nouvelles** (les 10 parties divergent entièrement d'un run à l'autre dès que la défense change le comportement) : colons sortis avec une escorte « disponible » **loin** (non rappelée, non adjacente) que Jev n'a jamais fait venir, ou route choisie par Jev à travers un ennemi connu. Le fix mécanique marche (tests, et aucune violation « escorte rappelée » identifiée) ; le zéro dépend de la trajectoire LLM, pas seulement de la mécanique — le critère « sonde 0 » n'est pas un critère STABLE d'un run à l'autre.
2. **Ping-pong 162 > 136** : le marqueur réduit les rappels spurieux (déclenchement ≤3 seulement) mais crée des cycles **quitter/rentrer** autour de la frontière de la bande : menace entre dans la bande → tenu ; sort (> 5) → consommé, l'unité repart ; revient dans la bande → re-rappel. La bande de dissolution SANS re-déclenchement immédiat exigerait un anti-ré-armement (cooldown par ville) — **champ hors canon du handoff** (pas d'itération solo).
3. **Fondations 5,5 < 5,7** : effet bord des exclusions d'escorte (les colons attendent plus souvent en ville) + trajectoires. Marge fine (−0,4 vs baseline escort, −0,2 vs A).

## 4. Écarts consignés

- Harnais : le memo n'est lu par botPolicy qu'à partir du 2e tour de partie (la décision Jev du harnais vient APRÈS la boucle bot ; en prod game.ts la pré-passe la met AVANT — cohérence pleine en prod).
- Le port calcule le plan défensif sur l'état FILTRÉ (fog) ; botPolicy/filtre sur l'état complet — trois écritures du même memo déterministes chacune sur sa vue (consigné).
- Captures GUI : non applicables (zéro visuel). ⚠ **CI/Deploy NON LANCÉS — rien poussé.**
- Symboles vérifiés dans `06193b9` (`git show` + grep : `exclues`, `planDefenseVille(...memo`, `defenseRappels`, `defenseRappelsMemo`).

## 5. Options à Erik (arrêt-pour-approbation)

- **(a) Pousser quand même** (élims ✓, banc bot ✓ ; A2 restaure la cohérence canon escort et l'hystérésis à état ; les 3 ✗ sont trajectoire-dépendants et fines) ;
- **(b) Ajouter un anti-ré-armement** (cooldown par ville après dissolution — hors canon actuel, à cadrer) puis re-mesurer ;
- **(c) Cadrer le critère escort** : « zéro violation où l'escorte était rappelée » (mesurable mécaniquement = 0 à A2) au lieu de « zéro violation totale » (trajectoire LLM).

**Commits locaux : `2f95e59` (tranche A) + `06193b9` (A2) — NON POUSSÉS. Périmètre interdit respecté** (escortColon inchangé hors paramètres optionnels, gainSite, questions Jev, gate R-190, schemaVersion 28).
