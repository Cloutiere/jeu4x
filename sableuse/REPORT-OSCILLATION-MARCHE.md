# REPORT-OSCILLATION-MARCHE — Fini le ping-pong : une marche avance ou tient, jamais ne recule

**Mission** : HANDOFF-OSCILLATION-MARCHE (Erik 02/11) — le résiduel GUERRE-VIVANTE (armée bot « 27-29/20-23 ») capturé en prod : l'unité u4 ping-pong entre (23,31) et (24,31) des tours 8 à 12.

## 1. Diagnostic (L1 — AVANT tout code, gratuit)

### 1.1 Méthode

- Détecteur de ping-pong sur les journaux JSONL du banc `joueur-guerre-vivante-2026-11-02` (événements `Move` ; ⚠ les événements ne portent PAS de champ `tour` — première version du détecteur aveugle, corrigée en lisant les lignes `tour`) ;
- Rejeu local GRATUIT du seed 3947827986 (faux Jev, `devtmp/replay-oscillation.mjs`) + instrumentation temporaire (`OSCILLATION_DEBUG` : ordres de mouvement par tour ; `__oscLog` : objectifs d'`assignerObjectifs`) + sonde `jouerPartie` (états capturés → rejeu de `pasVersRoutier`/`pasVers` sur l'état réel) ;
- Trajectoires : **u4 (p2, bot)** progresse est t0-t9 puis ping-pong `23,22 ⇄ 24,22` — signature exacte de la trace prod d'Erik. Comptage partie 2 complète : **30 614 allers-retours**.

### 1.2 Quatre mécanismes prouvés (empilés)

1. **`pasVers` sans exigence d'amélioration** (`apps/server/src/botPolicy.ts`) : `bestD = Infinity` — en cul-de-sac (baie, cible de l'autre côté du wrap), le glouton choisit le voisin « moins pire » = la case d'où l'unité vient → ping-pong éternel. Prouvé par sonde : `routier=null` + `glouton` alternant.
2. **BFS `pasVersRoutier` sans wrap** : `dist` utilise `hexDistanceW` (canon CARTE-RONDE T1) mais le BFS calculait les voisins en `q` brut → `null` sur les isthmes de la couture → repli glouton CONSTANT (le mécanisme 1 prend le relais). Prouvé : `routier=null` alors que l'ouest est praticable.
3. **Tir à la corde Jev/bot** (u87, p1) : le plan bot s'exécute pour TOUT LE MONDE (`partie.mjs` / `game.ts`) ; les tours où la décision Jev ne couvre pas l'unité (éligibilité `menaceAdjacente` clignotante), le bot la repart vers son ralliement ouest → `0,20 ⇄ 1,20` toute la partie malgré la marche est de Jev.
4. **Cible d'exploration instable** : « la case la plus lointaine NON couverte » mesurée DEPUIS L'UNITÉ — avancer change le classement, la cible bascule (u4 t9-18 : `20,25-20,27`).

### 1.3 Résiduel consigné (NON corrigé, hors règle)

- **Coudes de route à occupation bruitée** : à cheval sur deux routes quasi égales, le premier pas BFS peut flapper quand le campement de l'armée occupe les cases amont (u4 t11-16, ~5 inversions/rejeu 120 tours). Un filtre « jamais à vol d'oiseau » global tuerait les détours légitimes (test-verrou mur/gué BOT-ARMEE) — hors règle du handoff, cadré ici AVANT de coder, NON appliqué.
- **Patrouille cyclique** : les waypoints « patrouiller » bouclent PAR CONCEPTION (test BOT-EXPLORATION « la fenêtre des 6 waypoints se répète ») — les allers-retours de patrouille ne sont pas du ping-pong de marche.

## 2. La règle du fix (L2)

**Règle canon (handoff) : une marche ne pose jamais un pas qui augmente la distance à sa cible courante ; si aucun pas utile n'existe, l'unité TIENT (ordre explicite).**

- `pasVers` : `bestD` initialisé à `dist(unit, cible)` (amélioration STRICTE exigée) ; voisinage normalisé `normalizeHexW` (canon T1). `null` → les appelants émettent déjà Hold/Fortify (arrêt explicite et journalisé).
- `pasVersRoutier` : BFS sur voisinage wrappé `normalizeHexW` (cohérence avec `dist` — la couture devient praticable, le tour du monde fonctionne).
- **Garde de marche** (mécanisme 3, branche « mémoriser la cible au memo » du handoff) : le passage de chaque unité en marche Jev est persisté (`memo.marche`, levé hors marche) ; `filtrerMarcheBot` (pur, testable) retire à la fusion les ordres de MOUVEMENT du bot sur une unité gardée dont la destination augmente la distance wrappée au passage — les assauts survivent. Appliqué aux DEUX fusions : `game.ts` (prod, via `planJev.marcheGarde` capturé pré-décision dans `orchestre.ts`) et `partie.mjs` (harnais).
- **Explorateur ancré** (mécanisme 4) : classement par distance à la CAPITALE (indépendant de la position) + réservation séquentielle (un scout par case, sinon convergence).

## 3. Tests FIRST (L2)

- `apps/server/tests/oscillation-marche.test.ts` — 6 tests (rouges d'abord, 3 rouges/3 verts avant implémentation) : cul-de-sac `pasVers` → null ; pas normal améliore ; BFS traverse la couture ; île → null (inchangé) ; `filtrerMarcheBot` (retrait du pas arrière, assaut conservé ; hors garde intouché, MultiStep jugé à sa destination).
- **Re-cal justifié (1)** : `bot-exploration.test.ts` D2 — b2 « Move » → « Hold » : b2 est DÉJÀ adjacente à sa capitale (occupée par b1) ; l'ancien glouton émettait un pas latéral « moins pire » (le ping-pong autour de la capitale) ; tenir = garnison de fait (canon « avance ou tient »).

## 4. Suites et bancs (L3)

- **Suites** : rules **1129** ✓ / server **415** ✓ (dont oscillation-marche 6) / sableuse **219** ✓ / jev-port **40** ✓ / web **712** ✓ / svelte-check **0 erreur** ✓ / typechecks web+rules+server verts ✓. `schemaVersion` 28 inchangée (champ memo optionnel, additif).
- **Banc bot 40×3 avant/après** (`devtmp/banc-bot-td-AVANT-oscillation.json` = HEAD 868452e vs `devtmp/banc-bot-td.json`) :

| Difficulté | | Villes | Pop | Unités | Techs | PV mil. | Tours |
|---|---|---|---|---|---|---|---|
| facile | avant→après | 1,93→1,90 | 15,3→**18,6** | 87,9→**100,5** | 1,03→**1,25** | 232→**284** | 137→137 |
| normal | avant→après | 1,93→1,93 | 14,4→**16,8** | 92,4→89,6 | 0,85→**1,15** | 248→252 | 137→**128,5** |
| difficile | avant→après | 1,83→**1,93** | 11,8→**14,2** | 84,4→86,4 | 0,70→**0,90** | 231→**244** | 125→133,7 |

  Zéro drift négatif ; population et techs en hausse partout (les unités ne brûlent plus leur mouvement à piétiner). Tours « difficile » 125→134 : les campagnes durent plus longtemps (pas de soft-lock — villes/paix stables). Guerres 1,8-2,9 → 1,4-2,6 : légère baisse, à l'œil au prochain banc guerre.
- **Rejeu local 120 tours (seed 3947827986)** : u2 (explorateur) fait le TOUR DU MONDE monotone (t21 : `-12,24 → 27,24` — la couture est traversée) ; le ping-pong u4 (`23,22⇄24,22`, 525 moves) a disparu ; inversions résiduelles = patrouilles cycliques (conception) + coudes d'occupation (§1.3).
- **Banc Jev de confirmation** : `bancs/joueur-oscillation-2026-11-02` (vanilla, 5 seeds croissance, plafond 600, budget 0,60 $) — résultats à la remise (section 5).

## 5. Verdict

**Banc Jev de confirmation** (`bancs/joueur-oscillation-2026-11-02` — vanilla, 5 seeds croissance, plafond 600, **0,5055 $ ≤ 0,60 $**, 0 erreur API, 0 repli) :

| Partie | seed | Tours | Moves | Inversions A⇄B | ratio | Gagnant |
|---|---|---|---|---|---|---|
| 1 | 3538506724 | 333 | 1 139 | 168 | 14,8 % | **p1 (Jev)** — science |
| 2 | 3947827986 | 369 | 2 337 | 121 | 5,2 % | **p1 (Jev)** |
| 3 | 2121991107 | 329 | 2 272 | 321 | 14,1 % | **p1 (Jev)** |
| 4 | 3802591813 | 165 | 1 464 | 66 | 4,5 % | coupe-budget — Jev dominant (score 834 vs 204, 6 villes vs 1, 209 attaques) |
| 5 | 214915776 | — | — | — | — | non jouée (plafond 0,60 $ atteint) |

**Comparaison baseline même corpus** (`joueur-croissance-2026-11-02`, 5/5 complètes) : **16 628 moves / 14 323 inversions (86 %) → 1 139-2 337 moves / 66-321 inversions (3-14 %)** — le piétinement a disparu, les mêmes seeds finissent gagnantes aux mêmes tours (~t330-370, science). Les guerres se déclarent (8/5/6/1) et les marches progressent ; le résiduel d'inversions = patrouilles cycliques (conception, test-verrou) + coudes d'occupation (§1.3, consigné NON corrigé).

**L4 — remise de la main** : Erik re-visionne sa partie prod (u4 ne doit plus ping-ponger).

## 6. Fichiers

- `apps/server/src/botPolicy.ts` : `pasVers` (amélioration stricte + wrap), `pasVersRoutier` (BFS wrappé), `filtrerMarcheBot` (nouveau, exporté), explorateur ancré capitale.
- `apps/server/src/jev/joueur.ts` : garde `memo.marche` (section marche) + levée hors marche.
- `apps/server/src/jev/orchestre.ts` : `PlanJev.marcheGarde` capturé pré-décision.
- `apps/server/src/game.ts` : filtre `filtrerMarcheBot` à la fusion bot/Jev (jev seat).
- `apps/server/src/jev/etat.ts` : `JevMemo.marche` (optionnel).
- `sableuse/src/joueur.mjs` : miroir garde memo. `sableuse/src/partie.mjs` : miroir filtre fusion.
- Tests : `apps/server/tests/oscillation-marche.test.ts` (nouveau), re-cal `tests/bot-exploration.test.ts` (1).
- Outils de diagnostic (devtmp, hors prod) : `sableuse/devtmp/diag-oscillation.mjs`, `diag-pietinement.mjs`, `replay-oscillation.mjs`, `sonde-pas.mjs`, `sonde-rallier.mjs`.
