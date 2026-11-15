# REPORT-CONVERGENCE-FINALE — transit allié + tolérance barbares conditionnelle : clôture du chapitre siège

**Mission FINALE (HANDOFF-CONVERGENCE-FINALE, canon Erik 15/11 — diag `f00f986`).** ⚠ CI/Deploy à vérifier (§5).

## 1. Implémenté (L1)

- **(a) Transit allié** : `pasVersRoutier(unit, state, cible, { transitAllie })` — le **transit** du chemin de convergence admet les cases occupées par des **alliées** (owner = moi) ; les **ennemis restent jamais-transit** ; la cible reste admise occupée (assaut) ; **le pas FINAL sur allié n'est jamais émis** — `ordreConvergence` (nouvelle fonction) émet `Move [pas]` libre ou **`MultiStep [pas-allié, suivant]`** : le moteur **R-159 rév. B** (`turn.ts:1791-1795` : « un PAS INTERMÉDIAIRE (traversée) : entrée directe ») exécute la traversée et gèle le chemin (le pas2 reprend au tour suivant). Émission `rallier`/`offensiver` via `ordreConvergence`. Table `transitAllie: true`.
  - ⚠ Écart consigné : le glouton `pasVers` n'a PAS été étendu (le « transit » n'a pas de sens unitaire ; l'extension aux distances égales porterait un risque d'oscillation 2-cycle contre canon OSCILLATION-MARCHE) — l'effet est porté par le routier, voie canon BOT-MARCHE.
- **(b) Tolérance barbares errants — CODÉ, RESTÉ INERTE** : `toleranceBarbaresErrants: false` dans la table ; le filtre sépare les portées barbare/civil (`arriveeBarbare`/`tuilesBarbares`) et admet le pas qui ne croise QUE la portée d'un barbare errant pour les membres de campagne (`membresCampagneOffensive`, population partagée avec V3-(ii)) ; **la tuile du barbare et les civils restent universels**. Override test possible (6e param).
- `schemaVersion` **28 intacte** ; R-30, D2-collision universelle, D1 non-campagne, escortColon, gate, `defenseVille.ts`, gainSite, Zii : intouchés.

## 2. La pré-règle L2 tranchée : (b) INERTE

Re-mesure diag après (a) seul (34 306 tours-membres, `devtmp/diag-convergence-resultats.json`) :

| Classe | AVANT (`028773d`+D1CAMPAGNE) | APRÈS (a) |
|---|---|---|
| RALLI-ROUTE-NULL | 15 373 (44,6 %) | 14 449 (42,1 %) |
| **MARCHE-PROGRESSIVE** | 2 824 (8,2 %) | **6 737 (19,6 %) — +139 %** |
| RALLI-FILTRE-D2 | 6 454 (18,7 %) | 6 080 (17,7 %) |
| OBJ-D1 | 5 897 (17,1 %) | 4 527 (13,2 %) |
| CONVERGENT | 64 | 16 |

**FILTRE-D2 dans les blocages de convergence restants** (ROUTE-NULL + FILTRE-D2 + CAMPEMENT) = **29,6 % — PAS majoritaire** → la pré-règle pré-enregistrée : **(b) reste INERTE** (table `false`, non activé — le code est prêt et testé, un flip de table suffit si Erik le veut).

Convergence restaurée ? **Partiellement au mécanisme** : les marches effectives **+139 %** (l'émission ne bloque plus dans l'entassement allié) — mais les tours au rayon restent ~0 au diag (16/34 306) : à d≈22 avec ~50 % des tours bloqués (ROUTE-NULL résiduel + D1 résiduel + campements), la marche n'a pas le temps de converger dans des guerres de 63-67 tours. Le banc arbitre ci-dessous.

## 3. Bancs (L2 — UNE re-mesure)

### Banc bot 40×3 — AVANT (main = D1-CAMPAGNE, `banc-bot-td-AVANT-convergence.json`) / APRÈS (`banc-bot-td-APRES-convergence.json`)

| Difficulté | victoires | villes | unités | pvMil | tours | guerres |
|---|---|---|---|---|---|---|
| facile | 2 → **1** | 2,00 | 137 → **143** | 395 → **414** | 145 → 148 | 1,63 → 1,55 |
| normal | 2 → **0** | 2,00 | 135 → **139** | 387 → **400** | 145 → **150** | 2,17 → 2,15 |
| difficile | 1 → **3** | 2,00 | 127 → 123 | 367 → 355 | 147 → **144** | 2,70 → 2,70 |

Victoires 5 → 4 (shuffle de variance : −1 facile, −2 normal, +2 difficile) — **pas de restauration nette, pas de régression** ; zéro collapse ✓ (unités/pvMil stables ou en hausse) ; piétinement 0 ✓ (suite fix-praticabilite verte).

### Banc Jev 10 seeds (MÊMES seeds, `bancs/joueur-convergence/`, 0,3541 $ ≤ 0,60 $)

| Critère | AVANT (collision-mobile/d1campagne) | APRÈS | Verdict |
|---|---|---|---|
| **Pertes Jev /partie** (garde dure ≤ 11) | 9,9 / 10,9 | **8,1** | ✓ **meilleur score** |
| Collisions mobiles | 0 | **0** | ✓ |
| Chutes | 1 | **1** | ✓ |
| Fondations | 5,7 / 5,5 | **5,1** | ✓ (≥ 5,0) |
| Élims | 0 | **0** | ✓ |
| Ping-pong rappel | 3 / 0 | **0** | ✓ |
| Coût | 0,3608 / 0,3580 $ | **0,3541 $** | ✓ |

**Aucune régression** — le transit allié fait même baisser les pertes Jev (8,1 : meilleur score de la série 16,9 → 6,6 → 7,2 → 9,9 → 10,9 → 8,1).

## 4. Verdict : PUSH (issue B-flavor — chapitre siège CLOS)

- Ni régression (garde dure du handoff : non déclenchée), ni restauration nette des victoires (issue A non atteinte). Conformément au canon « push DANS LES DEUX ISSUES » et « le chapitre siège est CLOS, le verdict final sera à l'œil d'Erik vs Jev en prod » : **push avec les chiffres consignés**.
- **(b) reste codé et inerte** : un flip de table (`toleranceBarbaresErrants: true`) l'activerait sans nouveau code — à réserver à un futur arbitrage si les pertes Jev en prod le permettent.
- **L'état du chapitre siège** : gate → escarmouche → k-durée → anti-collision → collision-mobile → D1-campagne → convergence-finale (ici). Les verrous résiduels consignés : ROUTE-NULL résiduel 42 % (chemins inexistants même à transit allié — eaux/ennemis/encerclements réels), guerres trop courtes pour les distances (d≈22 vs 63-67 tours), D1-guerre résiduel 13 %.

## 5. Suites + déploiement

- L0 : 8 nouveaux tests (transit allié + MultiStep traversée + transit ennemi refusé + (b) admis/refusé + tuile barbare + civils + hors-campagne + invariants GZJQZX 30 seeds) → `anticollision-chasse.test.ts` **41 verts**.
- Suites isolées : **rules 1214 · server 544 · web 793 · jev-port 52** verts, `tsc -b` ✓ (1 flaky contention chat-socle re-passé isolé 12/12).
- ⚠ Push + Deploy SUCCESS + prod 200 : à vérifier après push.

## 6. Pièges consignés

- `d1CampagneBarbares`/`transitAllie`/`toleranceBarbaresErrants` : 3 tables lues dans `planAntiCollision`/`filtrerAntiCollision`/`ordreConvergence` — ne pas les confondre au cadrage.
- Mesures AVANT **sauvées au vol** (`banc-bot-td-AVANT-convergence.json`) avant réécriture du script banc ; banc Jev = nouveau dossier `bancs/joueur-convergence`.
- Le pas FINAL sur allié est refusé par le moteur (R-159) — l'émission MultiStep exige un pas2, sinon attente (jamais un ordre mal formé).
