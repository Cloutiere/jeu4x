# REPORT-COLLISION-MOBILE — la collision ne compte que les ennemis MOBILES (levier (a') validé)

**Mini-mission exécutée le 14/11 (canon Erik « levier (a') ennemis mobiles seulement » — HANDOFF-COLLISION-MOBILE, suite de D2-POSTURE `028773d`).** Commit : ⚠ CI/Deploy à vérifier (§4).

## 1. Implémentation (L1)

- `estEnnemiMobile(state, e)` (fonction pure locale, `botPolicy.ts`) : un ennemi est MOBILE s'il n'est **NI fortifié** (Fortify R-33 — il tient sa tuile), **NI en garnison canon** (sur la tuile d'une de SES villes — L1 défense). Le calcul de la portée d'arrivée dans `filtrerAntiCollision` n'agrège plus que les ennemis mobiles. **D2-collision reste UNIVERSAL** — seul le CALCUL de la menace se précise. `postureAssautSiege` **conservée** telle quelle (l'exonération d'effectif devient redondante mais inoffensive — choix consigné : garder, le plus simple). Table `bot.json antiCollision` **inchangée** (aucun champ n'a émergé). `schemaVersion` **28 intacte**.
- Le test D2-POSTURE « atterrir sur la case d'arrivée reste refusé » est **amendé au nouveau canon** : la tuile de la ville garnisonnée n'est plus une « arrivée » — l'entrée y est un assaut volontaire que le moteur juge (bataille complète R-183). L'invariant universel vit dans le test « atterrir SUR la case d'un ennemi MOBILE reste refusé » (cohabitation).

## 2. Preuves (L0)

- **Tests FIRST** : 6 nouveaux — **3 rouges avant fix** (pas adjacent à ville garnisonnée autorisé · défenseur fortifié hors ville autorisé · invariant 30 seeds siège) ; verts après. `anticollision-chasse.test.ts` : **28 verts**.
- **Diag siège** (`devtmp/diag-d2-siege.ts`) : l'armée réunie **marche à nouveau** vers la ville garnie (a1/a2/a5/a6 reçoivent des `Move` d'approche ; avant : Fortify aux portes).
- **GZJQZX t36 toujours protégé** : u27 était mobile et marchait → ordre fatal `Move u4 → (19,22)` → **Fortify** (re-sim `anticollision-resim.ts`, 30 seeds invariant). **NP8JEE actif** ✓.
- Suites : **rules 1214 · server 531 · web 793 · jev-port 52** verts, `tsc -b` ✓ (1 flaky contention re-passé vert).

## 3. Bancs (L2) — AVANT = `028773d` (`banc-bot-td-AVANT-collision-mobile.json`)

### Banc bot 40×3 (`banc-bot-td-APRES-collision-mobile.json`)

| Difficulté | victoires | villes | unités | pvMil | tours | guerres |
|---|---|---|---|---|---|---|
| facile | 0 → **2** | 2,00 → 2,00 | 144 → 137 | 410 → 395 | 150 → **145** | 1,82 → 1,63 |
| normal | 1 → **2** | 2,00 → 2,00 | 136 → 135 | 389 → 387 | 149 → **145** | 2,48 → 2,17 |
| difficile | 0 → **1** | 2,00 → 2,00 | 136 → 127 | 394 → 367 | 150 → **147** | 2,90 → 2,70 |

- **Zéro collapse ✓** · parties ne plafonnent **plus massivement** à 150 (145-147) · victoires **×5** (1 → 5) — mais **critère « ≥ ~8/difficulté » NON ATTEINT**.

### Banc Jev 10 seeds (MÊMES seeds, `bancs/joueur-collision-mobile/`, 0,3608 $ ≤ 0,60 $)

| Critère (handoff) | AVANT (d2posture) | APRÈS | Verdict |
|---|---|---|---|
| **Duels de cohabitation perdus avec ennemi MOBILE connu** | 0 | **0** | ✓ |
| **Unités Jev perdues /partie** (≤ 10) | 7,2 | **9,9** | ✓ (juste) |
| **Chutes** | 1 | **1** (≤ 2) | ✓ |
| **Fondations** /partie | 5,2 | **5,7** (≥ 5,0) | ✓ |
| Élims | 0 | **0** | ✓ |
| Ping-pong rappel | 0 | **3** (≤ 113) | ✓ |
| Coût | 0,3585 $ | **0,3608 $** | ✓ |

### Le sort des sorties de garnison (chiffré)

- Échanges de combat au banc Jev : **205 → 239 (+17 %)** — les défenseurs garnisonnés et les assiégeants échangent à nouveau (contact de siège rétabli).
- Pertes Jev 7,2 → **9,9/partie** (+2,7) : le prix du risque résiduel accepté (une garnison peut SORTIR et attaquer — guerre normale, pas une collision à pièce de face). Sous le plafond ≤ 10, mais **à la limite** — consigné pour l'arbitrage.
- Victoires bot ×5 (sièges qui reprennent) sans collapse : les empires restent riches (unités 127-137, pvMil 367-395).

## 3bis. VERDICT — ARRÊT-POUR-APPROBATION

- **Critère banc bot « victoires ≥ ~8/difficulté » ÉCHOUÉ** (2/2/1) — la restauration est réelle (×5, plafond 150 relâché, contact +17 %) mais partielle. **Aucune itération solo lancée** (handoff §2). Les verrous restants, à diagnostiquer SI Erik le demande : le gate R-190 en début de guerre (k = 2 jusqu'à toursPaixMin), le seuil TB-SIEGE (effectif ≥ 4 au rayon), et D1 qui peut épingler des membres en marche près de leurs propres villes.
- Tous les AUTRES critères passent : banc Jev 0 collision mobile · pertes ≤ 10 (juste) · chutes ≤ 2 · fondations ≥ 5,0 · zéro collapse · piétinement 0→0 (suite fix-praticabilite verte) · GZJQZX t36 refusé · NP8JEE actif · suites vertes · `schemaVersion` 28.

## 4. Suites + déploiement

- Push + Deploy SUCCESS + prod 200 : ⚠ à vérifier (§4bis).

## 5. Pièges consignés

- Mesures AVANT **sauvées au vol** (`banc-bot-td-AVANT-collision-mobile.json` = 028773d) avant de réécrire le script banc ; banc Jev dans un **nouveau dossier** (`bancs/joueur-collision-mobile` — réutiliser un dossier « fait » saute les parties).
- Pertes Jev 9,9/partie : sous le plafond mais **à la limite** — le seul critère sans marge.
