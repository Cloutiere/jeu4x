# REPORT-HORLOGE-DISTANCE — L'horloge de paix connaît la distance + conquêtes par ère (28/10)

**Mission** (HANDOFF-HORLOGE-DISTANCE, décisions Erik 28/10) : D1 durée minimale de guerre modulée par la distance de la cible, D2 conduite inchangée, D3 métriques du banc PAR ÈRE, D4 cibles révisées (percée/captures évaluées en ère Médiévale+), D5 sonde étendue. **D1-D3-D5 livrés et verts ; D4 : la relation distance→durée est PROUVÉE et les guerres durent enfin le temps de la campagne (12,1 → 37,4 tours), mais percée/captures restent SOUS les cibles — échec localisé et documenté (le verrou est la MARCHE, pas l'horloge).**

## 1. Ce qui est livré

- **D1 — duréeMin = toursPaixMin + distanceCible × facteurMarcheCible** (donnée, ×3 profils, valeur 1) : la distance WRAP entre capitales effectives est FIGÉE À LA DÉCLARATION dans `diplomacy.distancesCible` (champ OPTIONNEL — `schemaVersion` 28 inchangée, miroir `batailles`), purgée à la paix. La paix ADMINISTRATIVE (guerre jamais bataillée) attend `duréeMin` ; la paix du GAGNANT s'applique au-dessus (`toursPaixGagnant × duréeMin`). Une guerre pré-existante (champ absent) retombe sur `toursPaixMin` (comportement historique). Helper `dureeMinGuerre` (botPolicy), branché dans `deciderPaix` ET dans la proposition `videTerme` du bot.
- **D2 — conduite inchangée** : armées de siège R-31, cible pondérée, valeurs de combat/villes, R-31/R-71, spawns (décision Erik) — rien d'autre ne bouge.
- **D3 — ères au banc** : `bancObservation` consigne l'ÈRE de chaque joueur par tour (compage techs, `techEraOf`), l'ère du DÉCLARANT à la déclaration (`ereDeclaration`) et celle du perdant à chaque capture, plus la distance consignée (`distCible`) sur chaque guerre.
- **D5 — sonde étendue** : `devtmp/sonde-horloge-distance.mjs` (sonde-paix-rythme conservée) — (distance, durée, issue) par guerre + régression.

## 2. Validation

- L1 test-first : `bot-horloge-distance.test.ts` 10 verts (consigne à la déclaration, WRAP Est↔Ouest, proche=brève/loin=longue, paix du gagnant à 2×duréeMin, repli champ absent, proposition `videTerme`, purges, données ×3 profils). Tests PAIX-RYTHME/BOT-TC recalés à duréeMin (fixtures dist 4 → min+4) ; fixture banc-observation étendue (ères, distances).
- Suites : **server 298 verts** (+10), **rules 1101 verts**, **turbo typecheck 4/4** (tsc 0, svelte-check 0 erreurs).
- Banc 40×3×150 civs réelles : artefact `devtmp/banc-horloge-distance.json` (449 s) ; comparateur `devtmp/banc-horloge-analyse.mjs`.

## 3. Tableau D4 — AVANT (PAIX-RYTHME 27/10) / APRÈS (HORLOGE-DISTANCE)

| Métrique D4 | Avant | **Après** | Cible | Verdict |
|---|---|---|---|---|
| Durée moyenne des guerres | 12,1 | **37,4** | le temps de la campagne | ✓✓ (×3) |
| Relation distance→durée (sonde) | — | **plancher = toursPaixMin + dist exact** | prouvée | ✓ |
| 0 écrasement fin <t30 | 0 | **0** | 0 | ✓ |
| Parties moyennes > 100 tours | 144,2 | **146** | > 100 | ✓ |
| ρ agressivité ↔ batailles | 0,57 | **0,61** | ≥ 0,4 | ✓ |
| Percée (toutes ères) | 3,6 % | **11,9 %** | ≥ 40 % | ✗ (×3,3) |
| Captures (toutes ères) | 3 (0,5 %) | **5 (1,6 %)** | ≥ 10 % | ✗ |
| Percée (Médiévale+, cible D4) | — (0 guerres) | **0/22 (0 %)** | ≥ 40 % | ✗ |
| Captures (Médiévale+, cible D4) | — | **1/22 (4,5 %)** | ≥ 10 % | ✗ |

### D3 — par ère (banc APRÈS, 318 guerres)

| Ère (déclarant) | Guerres | Percées | Captures | Durée moy. | Stériles | Dist moy. |
|---|---|---|---|---|---|---|
| Ancienne | 296 | 38 (12,8 %) | 4 (1,4 %) | 37,4 | 79 % | 21,8 |
| Médiévale | 22 | 0 (0 %) | 1 (4,5 %) | 38,1 | 95 % | 25,5 |
| Industrielle/Moderne | 0 | — | — | — | — | — |

**Lecture D3 (question d'Erik : la conquête est-elle un phénomène de milieu/fin de partie ?)** — NON sur ce banc : 93 % des guerres se déclarent encore en ère Ancienne (1v1, frontières déjà en contact), et les 22 guerres Médiévale+ ne percent JAMAIS (95 % stériles — des re-déclarations entre voisins déjà épuisés). La conquête observée (5 villes en 120 parties) est un phénomène d'ère Ancienne. À 1v1 le banc ne fait pas émerger de conquête médiévale ; il faudrait du multi (3+ joueurs) pour le tester.

### D5 — durée par distance (sonde, difficile, 26 guerres sur 8 seeds)

Plancher EXACT de la relation D1 : durée minimale observée = `toursPaixMin(8) + dist` dans chaque tranche (dist 17→25, 18→26, 19→27, 21→29, 23→31, 26→34, 29→37). Les durées dépassent souvent le plancher (paix du gagnant à 2×, guerres laissées ouvertes) — la corrélation brute est donc faible (r = -0,08) mais le PLANCHER colle bit à bit à la formule : l'horloge connaît la marche.

## 4. God mode (devtmp/horloge-distance-gui.mjs → dev-logs/captures-horloge-distance/)

Guerre déclarée ✓ à dist 18-19 ; **la guerre VIT au-delà de t80** (avant : fermée à t69+8 par la paix administrative) — l'horloge-distance fait son travail côté serveur. Mais : armée NON formée, `distMin` bloquée 18-19 pendant 60 tours (les unités bot ne MARCHENT pas vers la cible), 0 capture. 🔴 Le verrou n'est plus l'horloge : c'est la MARCHE (verrou de circulation préexistant, consigné BOT-ARMEE/PAIX-RYTHME).

## 5. Verdict — la conquête émerge-t-elle ? 🔶

Partiellement : les guerres durent le temps de la campagne (cœur de la mission, atteint), la percée triple et les captures progressent (3 → 5 en 120 parties) — mais les cibles D4 (40 % / 10 %) restent hors de portée car l'armée n'atteint JAMAIS la cible : elle ne se constitue pas et ne marche pas. Le levier suivant est côté BOT-ARMEE §5 (leviers 2 « armée permanente hors guerre » / 3 « marche coordonnée ») ou côté spawns (décision Erik : intouchés) — PAS côté paix.

## 6. À juger en jouant par Erik

1. **Le rythme des guerres lointaines** : une guerre déclarée à 20 cases dure 20+ tours minimum (8/12/20 selon difficulté + distance) — vérifier que ce rythme est le bon ressenti en solo/multi (levier de calibrage : `facteurMarcheCible`, actuellement 1).
2. **La paix du gagnant à 2×duréeMin** : une guerre bataillée lointaine peut durer 60-80 tours — voulu ?
3. **Les re-déclarations en ère Médiévale** (95 % stériles) : des voisins re-déclarent périodiquement sans jamais se battre — acceptable ou à verrouiller (délai entre guerres par civ) ?
4. **1 capture à l'ère Médiévale observée au banc** — première conquête « tardive » du banc.

## 7. Fichiers

- rules : `state.ts` (`diplomacy.distancesCible` optionnel), `diplomatie.ts` (consigne à `applyDeclareWar`, `distanceCibleGuerre`, purge à la paix), `types.ts` + `data/bot.json` (`facteurMarcheCible` 1 ×3 profils).
- server : `botPolicy.ts` (`dureeMinGuerre`, `deciderPaix` + `videTerme` recalés), `bancObservation.ts` (ères par tour, `ereDeclaration`, `distCible`, ère des captures).
- tests : `bot-horloge-distance.test.ts` (10), recalage `bot-paix-rythme`/`bot-tc`/`banc-observation` ; banc `tests-banc/banc-horloge-distance.test.ts` (gate BANC_BOT_TD).
- devtmp (non suivi) : `banc-horloge-distance.json`, `banc-horloge-analyse.mjs`, `sonde-horloge-distance.mjs`, `horloge-distance-gui.mjs`, captures `dev-logs/captures-horloge-distance/`.

## 8. Arrêt

Un commit poussé (CI déploie). Les fichiers non trackés d'Erik ne sont pas touchés.
