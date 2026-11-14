# REPORT-D1-CAMPAGNE — les barbares ne poursuivent plus les assiégeants… mais le siège ne reprend pas au banc

**Mission FINALE du chapitre siège (HANDOFF-D1-CAMPAGNE, canon Erik levier V3-(ii) — diag `e031095`).** ⚠ **ARRÊT-POUR-APPROBATION — commit LOCAL (`HEAD`, non poussé, rien déployé)** : le handoff prescrit l'arrêt quand le banc Jev se dégrade (pertes > 10) — c'est le cas (10,9). Aucune itération solo lancée.

## 1. Implémentation (L1) — le levier V3-(ii) exact

- `planAntiCollision` : les membres de l'**armée de campagne offensive en guerre déclarée** (`cibleCampagne`/`assignerArmee`, **table `d1CampagneBarbares: false`** ajoutée à `bot.json antiCollision` + `BotAntiCollisionData`) ignorent les **BARBARES** comme chasseurs de poursuite. Tout le reste du monde (scouts, escortes, garnisons, unités seules, membres sans campagne) garde **D1-barbares entier** (leçon GZJQZX). Les ennemis de civilisation en guerre déclenchent D1 pour tous. **D2-collision mobile UNIVERSAL inchangée** (`estEnnemiMobile` intact) ; `postureAssautSiege`/`effectifCampagne 4` : intouchés (V2 ne bouge pas). `schemaVersion` **28 intacte**.
- L0 FIRST : 5 nouveaux tests — **1 rouge avant fix** (membre + barbare → plus de poursuite), verts après ; `anticollision-chasse.test.ts` **33 verts**. Suites isolées : **rules 1214 · server 536 · web 793 · jev-port 52** verts, `tsc -b` ✓.

## 2. Preuve mécanique (diag re-joué, `devtmp/diag-verrous-siege.ts`)

| | AVANT (`2b4e386`) | APRÈS (V3-(ii)) |
|---|---|---|
| Pins membres de campagne (normal) | 5 539 | **919 (−83 %)** |
| Pins membres de campagne (difficile) | 6 973 | **2 432 (−65 %)** |
| **maxEffectifRayon moyen** | 0,1 | **0,1 — INCHANGÉ** |
| Guerres jamais ≥ 4 au rayon | 40/40 | **40/40** |
| Guerres avec ville de campagne capturée | 0/40 | **0/40** |

Le filtre fait chuter les épinglages comme prévu, **MAIS le rassemblement ne reprend pas** : l'effectif au rayon reste 0,1 — un mécanisme SUPPLÉMENTAire (non diagnostiqué ici, hors périmètre) retient les membres à ~22 cases de la ville de campagne. Candidats pour un futur diag : les membres « en marche » (52-56 % des tours, jamais convergés) — cible de ralliement mobile (`cibleCampagne` re-tirée chaque tour), drafts de garnison à l'urgence, ou re-assignation de l'armée tour à tour.

## 3. Bancs (L2 — UNE re-mesure, comme A3)

### Banc bot 40×3 — AVANT (`2b4e386` = `banc-bot-td-AVANT-d1campagne.json`) / APRÈS (`banc-bot-td-APRES-d1campagne.json`)

| Difficulté | victoires | villes | unités | pvMil | tours |
|---|---|---|---|---|---|
| facile | 2 → 2 | 2,00 → 2,00 | 137 → 137 | 395 → 395 | 145 → 145 |
| normal | 2 → 2 | 2,00 → 2,00 | 135 → 135 | 387 → 387 | 145 → 145 |
| difficile | 1 → 1 | 2,00 → 2,00 | 127 → 127 | 367 → 367 | 147 → 147 |

**Bit-à-bit identiques** — cohérent avec le §2 : l'armée ne se rassemblant toujours pas, le levier ne peut pas se voir au banc. Ni restauration (issue A ratée), ni régression.

### Banc Jev 10 seeds (MÊMES seeds, `bancs/joueur-d1campagne/`, 0,3580 $ ≤ 0,60 $)

| Critère | AVANT (collision-mobile) | APRÈS | Verdict |
|---|---|---|---|
| Duels de cohabitation perdus (ennemi mobile) | 0 | **0** | ✓ |
| **Unités Jev perdues /partie** | 9,9 | **10,9** | ⚠ **> 10 — seuil du handoff touché** |
| Chutes | 1 | **1** | ✓ |
| Fondations /partie | 5,7 | **5,5** | ✓ |
| Élims | 0 | **0** | ✓ |
| Ping-pong rappel | 3 | **0** | ✓ |
| Coût | 0,3608 $ | **0,3580 $** | ✓ |

**Note variance** : l'écart 9,9 → 10,9 = ~1 unité/partie sur n=10 — dans le bruit des bancs (les fondations ont varié de 5,2 à 5,9 sur du MÊME code lors des passes précédentes). Les collisions restent 0 et les chutes 1 : la protection canon tient. Mais le handoff fixe un seuil DUR (pertes > 10 → arrêt) — il est touché, donc arrêt.

## 4. Verdict — ARRÊT-POUR-APPROBATION

- **Issue A ratée** (victoires 2/2/1 < ~8 — bancs inchangés), **issue B ratée** (Jev pertes 10,9 > 10) → **arrêt-pour-approbation** (précédent JEV-ESCORTE `651c9a5` : commit LOCAL, rien poussé, rien déployé).
- **Ce qui est acquis** : l'implémentation V3-(ii) est exacte, testée (rouge→vert), suites vertes, la chute des pins est réelle et chiffrée (−83 %/−65 %).
- **Ce qui manque** : le levier V3 seul ne suffit pas — un second mécanisme empêche la convergence de l'armée (à diagnostiquer : trajectoire de ralliement/drafts/assignation). Et le plafond pertes Jev ≤ 10 est désormais structurellement tendu depuis COLLISION-MOBILE (9,9 → 10,9).

## 5. Options à l'arbitrage Erik (aucune lancée)

- **(a) DIAG-CONVERGENCE** : diagnostiquer pourquoi les membres « en marche » (52-56 % des tours) ne convergent jamais vers le rayon (cible mobile ? drafts ? re-assignation) — puis re-mesurer D1-CAMPAGNE dans la même passe.
- **(b) Accepter la variance** : juger 10,9 ≈ 9,9 (bruit n=10) et pousser V3-(ii) tel quel (l'impl est exacte, GZJQZX intact, bancs non régressés) — verdict final à l'œil Erik vs Jev en prod.
- **(c) Revenir en arrière** : abandonner le chapitre siège à l'état `2b4e386` (poussé, prod 200) et traiter le plafond pertes Jev (9,9-10,9) comme nouveau cadrage.

## 6. État git

- **Commit LOCAL** (HEAD, non poussé, rien déployé) : `planAntiCollision` + `bot.json`/`types.ts` (`d1CampagneBarbares: false`) + tests (33 verts) + ce rapport. Baseline poussée : `2b4e386` (prod 200).
- Suites locales vérifiées APRÈS commit : rules 1214 · server 536 · web 793 · jev-port 52 · `tsc -b` ✓.
- Chapitre siège : gate → escarmouche → k-durée → anti-collision → collision-mobile → **D1-campagne (ici, en attente d'arbitrage)**.
