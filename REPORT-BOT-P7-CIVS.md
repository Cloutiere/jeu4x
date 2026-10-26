# REPORT-BOT-P7-CIVS — Le banc avec de vraies civilisations (26/10)

**Mission** (HANDOFF-BOT-P7-CIVS, décisions Erik 26/10) : assigner de vraies civs (tirage DÉTERMINISTE par seed, D1) aux deux bots du banc d'observation et ré-observer — l'`agressivite` 0,25-0,9 de `civilizations.json` n'avait jamais été exercée. **Aucun changement de comportement** (D2, D5 : aucune proposition de valeur cette fois — les P1-P6 du rapport d'observation restent les propositions en attente).

## 1. Ce qui a été livré

- `tiragePaireCivs(seed)` (dans `apps/server/src/bancObservation.ts`) — tirage DÉTERMINISTE de deux civs DISTINCTES, miroir du tirage seedé lobby (R-80/R-81 : ids triés, RNG dérivé du seed) ; salage 0x5ebc0 choisi pour **zéro paire ordonnée dupliquée + couverture 16/16 sur le corpus 40** (vérifié par tests).
- `simulerPartieObservee(difficulte, seed, tours, { civs })` — porte le `civSetup` à `createInitialState` ; défaut = tirage P7, `{ civs: neutre }` = baseline exacte d'avant.
- **L1 test-first** `apps/server/tests/bot-p7-civs.test.ts` — **4 verts** (déterminisme, civs valides/distinctes, couverture 16/16, paires toutes différentes). Suites : server **246 verts**, `tsc 0`.
- **L2 banc** `apps/server/tests-banc/banc-bot-p7-civs.test.ts` (gate `BANC_BOT_TD`, 219 s) — **PASS** ; artefact **`devtmp/banc-bot-p7-civs.json`** (chronologies + métriques, 120 parties). Le banc baseline `banc-bot-tc-observation.test.ts` est PINNÉ explicitement sur « neutre » (il reste rejouable à l'identique — l'artefact « avant » `banc-bot-tc-observation.json` est intact).
- `devtmp/banc-p7-analyse.mjs` — comparateur avant/après + tableaux par civ + anecdotes.
- Rien de committé (remise de la main) ; zéro moteur, `bot.json`/`civilizations.json` intouchés, `schemaVersion` 28.

## 2. Verdict principal — ⚠ l'agressivité « rôle-play » n'est PAS lisible sur ce banc

Le critère d'acceptation 1 (« Zoulous > Inde, mesurable ») **n'est PAS atteint** :

| Civ | Agressivité | Lignes | Décl./100 tours | Stériles du déclarant | Batailles tot |
|---|---|---|---|---|---|
| azteques | 0,9 | 18 | 1,47 | 87 % | 45 |
| mongolie | 0,9 | 6 | **0,56** | 100 % | **0** |
| zoulous | 0,85 | 24 | **1,13** | 81 % | 107 |
| france | 0,8 | 15 | 1,14 | 88 % | 38 |
| grece | 0,75 | 9 | 1,56 | 100 % | 0 |
| rome | 0,7 | 12 | 1,50 | 72 % | 156 |
| allemagne | 0,7 | 21 | **2,39** | 82 % | 132 |
| russie | 0,6 | 30 | 1,23 | 92 % | 14 |
| espagne | 0,55 | 12 | 0,84 | 100 % | 0 |
| angleterre | 0,5 | 15 | 0,70 | 93 % | 16 |
| arabie | 0,5 | 12 | **1,73** | 97 % | 29 |
| chine | 0,5 | 21 | 0,90 | 100 % | 0 |
| egypte | 0,45 | 9 | 1,35 | 100 % | 0 |
| japon | 0,4 | 12 | 0,69 | 100 % | 0 |
| amerique | 0,35 | 9 | 1,19 | 75 % | 26 |
| inde | 0,25 | 15 | **1,11** | 100 % | 0 |

**Spearman (agressivité déclarée vs décl./partie) : ρ = 0,07** — aucune corrélation exploitable. Zoulous 1,13 ≈ Inde 1,11. Contre-exemples flagrants : l'Allemagne (0,7) sur-déclare à 2,39 quand la Mongolie (0,9) somnole à 0,56, l'Arabie (0,5) déclare plus que les Aztèques (0,9).

**Cause structurelle** (lue dans `deciderGuerre`) : le tirage `agressivite × facteurAgressivite` n'opère QU'UNE FOIS le bot éligible (tour min atteint, délai entre guerres écoulé, voisin plus faible trouvé, `seuilRatioGuerre` franchi). Le taux de déclaration est donc dominé par la VITESSE à laquelle l'économie rend le bot éligible, pas par le tirage — et l'échantillon par civ est minuscule (3 parties × 3 difficultés = 6-30 lignes par civ). Sur 150 tours, même un tirage à 0,25 finit par passer.

**Conséquence (D5)** : les propositions P1-P6 du rapport d'observation (seuils, paix) ne sont ni confirmées ni contredites ; pour rendre l'agressivité lisible il faudrait soit un corpus beaucoup plus grand, soit mesurer le hazard CONDITIONNEL à l'éligibilité (hors périmètre de cette mission, consigné).

## 3. Avant (neutre) / après (civs) — à constantes égales (mêmes 40 seeds × 3 × 150 tours, 240 lignes)

| Difficulté | Guerres/partie | 1re guerre (t) | Ratio décl. | Décl. fort | Durée | Stériles | Paix prop. | Paix acc. | Captures | Élim. |
|---|---|---|---|---|---|---|---|---|---|---|
| facile | 1,57 → 2,02 | 16,8 → 16,8 | 1,49 → 2,43 | 100 % → 100 % | 35,3 → 27,5 | 75 % → 81 % | 352 → 468 | 27 → 48 | 1 → 2 | 0 → 0 |
| normal | 2,75 → 3,27 | 11,3 → 11,3 | 1,71 → 2,18 | 95 % → 95 % | 20,3 → 16,1 | 89 % → 88 % | 481 → 671 | 79 → 101 | 0 → 1 | 0 → 0 |
| difficile | 5,20 → 5,47 | 9,0 → 9,0 | 1,95 → 2,30 | 85 % → 82 % | 11,0 → 11,1 | 92 % → 94 % | 1041 → 1116 | 187 → 194 | 0 → 0 | 0 → 0 |

Lecture : la gradation PAR DIFFICULTÉ est intacte (première guerre identique au tour près — 9,0/11,3/16,8). Les civs réelles gonflent la fréquence globale (+13 à +39 %, variance des bonus de départ), le ratio de forces à la déclaration monte nettement (1,49-1,95 → 2,18-2,43) et la conduite de guerre NE CHANGE PAS : 88-94 % de guerres stériles, **3 captures en 120 parties** (vs 1), 0 élimination de duel (1 mort par contre-coup).

## 4. Verdicts mis à jour — checklist d'Erik

- **Fréquence** — ✅ gradation par difficulté confirmée ; ⚠ **gradation par civ ABSENTE** (§2) : le paramètre « rôle-play » est noyé par les conditions d'éligibilité.
- **Cible** — ✅ inchangé : le voisin le plus faible est visé (82-100 % de déclarations à ratio ≥ 1), encore plus fort qu'avant (ratio moyen 2,18-2,43).
- **Conduite** — ❌ CONFIRMÉ déficient : 88-94 % de stériles, 3 captures/120, 84→ aucune percée durable. La vraie guerre reste un grind (§5).
- **Paix** — ❌ CONFIRMÉ : même horloge (les acceptations restent ~exclusivement à `toursPaixMin`, 194/1116 en difficile).
- **Écrasement** — ✅ aucun (0 fin < t30 ; parties moyennes 142-145 tours).

## 5. Anecdotes par civilisation

- **« Zoulous vs Aztèques, Verdun des agressifs »** (facile, seed 214915776, t16) : les deux civs les plus agressives du jeu (0,85 vs 0,9) se déclarent la guerre t16 et s'entre-tuent **78 batailles, 80 tours** — paix à t96, aucune percée. L'agressivité déclarée ne change pas la CONDUITE : deux 0,9 produisent exactement le grind des deux 0,5 d'avant.
- **« La mitraillette allemande »** : l'Allemagne (0,7) est la reine CONTRE-INTUITIVE du banc — 71 déclarations (3,38/partie, 2,39/100 tours), jusqu'à 8 guerres dans UNE partie (difficile, seeds 437617546, 2827631197, 3773221664). Son bonus de croissance la rend éligible tôt et souvent ; le tirage à 0,7 passe presque toujours sur 150 tours.
- **« La Mongolie pacifique »** (0,9 !) : 3 parties seulement, 5 déclarations, **100 % stériles, 0 bataille** — la civ la plus agressive du jeu n'a jamais battallié. n=6 lignes : l'échantillon, pas la civ (mais c'est exactement le problème de lisibilité).
- **« L'Aztèque de façade »** (seed 3947827986) : les Aztèques (0,9) déclarent à l'Amérique (0,35) dans les TROIS difficultés du même seed (t9/t11/t16), **0 bataille à chaque fois** — et en difficile, déclarent 4 fois (t9, t31, t78 à ratio 0,52 !, t98). L'agressivité multiplie les déclarations vides, pas les campagnes.
- **« Rome meurt les armes à la main »** (normal, seed 2121991107, t93) : Rome (0,7) vs Arabie (0,5) — 4 guerres successives sur la partie (36, 34, 29, 20 batailles selon la difficulté), la 2e se termine par l'ÉLIMINATION DU DÉCLARANT : la seule vraie guerre de revers du banc.
- **« Zoulous > Inde » vérifié… sur les BATAILLES** : Zoulous 107 batailles en 37 guerres (81 % stériles) vs Inde 0 bataille en 25 guerres (100 % stériles). L'agressivité se lit dans l'INTENSITÉ quand la guerre a lieu, pas dans la FRÉQUENCE.

## 6. Pièges consignés

- Cache vitest `apps/server/node_modules/.vite` purgé avant chaque re-mesure (toujours actif).
- Le banc baseline est désormais PINNÉ sur `{ civs: neutre }` — rejouer `banc-bot-tc-observation.test.ts` écraserait `banc-bot-tc-observation.json` ; l'artefact « avant » d'origine est conservé.
- Salage du tirage : 0x000b07 (lobby) donne 3 paires dupliquées sur le corpus ; 0x5ebc0 est propre (tests L1 verrouillent).
- `devtmp` : résoudre depuis le fichier (import.meta.url) — piège `~/devtmp` toujours actif.

## 7. Arrêt

Rapport remis, aucun changement de comportement, rien de committé. Fichiers nouveaux/modifiés (non trackés) : `apps/server/src/bancObservation.ts` (+ tirage, + param civs), `apps/server/tests/bot-p7-civs.test.ts`, `apps/server/tests-banc/banc-bot-p7-civs.test.ts`, `apps/server/tests-banc/banc-bot-tc-observation.test.ts` (pin neutre), artefacts `devtmp/banc-bot-p7-civs.json` + `devtmp/banc-p7-analyse.mjs`. La main est à Erik — suite naturelle : la grande tranche P1/mur défensif (déjà préparée) ; si l'agressivité « rôle-play » doit devenir lisible, il faudra soit la faire agir AVANT l'éligibilité (ex. abaisser `seuilRatioGuerre` selon l'agressivité), soit l'exercer sur un corpus dédié — hors périmètre de cette mission.
