# REPORT-CONFIANCE-EXPLORATION (Erik 03/11)

**Mission** : HANDOFF-CONFIANCE-EXPLORATION — deux découvertes du dump prod YU4SHH (partie réelle d'Erik, tours 0-24) : (1) la gate de confiance générique écrasait des réponses valables de Jev — `fonder` 0,21, `convertir` 0,25-0,38, `produire` 0,33-0,49 ; (2) u4 (guerrier, seule unité de Jev) immobile 8+ tours, mp inutilisés. **Canon voté** : seuils de confiance PAR QUESTION (canon v2) + doctrine d'exploration « jamais inactif ».

## 1. Diagnostic L1 (gratuit, avant tout code)

### 1.1 Distribution réelle des confidences (YU4SHH, journaux Jev t0-23 — 61 réponses)

Téléchargés via `/admin/game/YU4SHH/jev?tour=N` → `devtmp/etat-YU4SHH/jev-t*.json`. Tableau question × confidence × sort :

| Question | Réponses | Écrasées par la gate | Confidences écrasées | Choix observés |
|---|---|---|---|---|
| **fonder** | 5 | **3** | 0,21 / 0,21 / 0,31 (t21-23 — MÊME cible `fonder:29,11` trois tours d'affilée) | fondation jamais programmée en t21-23 |
| **convertir** | 5 | **3** | 0,28 / 0,38 / 0,25 (t21-23 — `science:c3` constant) | conversion tombée au repli bot |
| **produire** | 23 | **12** | 0,33-0,49 (t3-20 — `unit:guerrier` CHAQUE FOIS) | repli bot → `wonder:chateau_himeji` (merveilles chères), zéro colon produit |
| **rechercher** | 4 | **1** | 0,28 (t0 — `alphabet`) | repli bot → equitation |
| techOfferte | 24 | 0 | — (min 0,70, toujours `aucun`) | — |

**Lecture** : les écrasements ne sont pas du bruit — ce sont des choix STABLES et répétés (même cible 3 tours de suite, même item 12 fois) que la gate générique jetait. Pendant ce temps les deux villes de Jev bâtissaient des merveilles et aucun colon ne sortait : la croissance bloquée par la même maladie soignée pour `guerreSterile` seule (canon v2 : chaque question porte son propre seuil).

### 1.2 La trajectoire perdue de u4 (chaîne complète, prouvée au rejeu sur l'état prod réel)

Rejouer `botPolicy` sur `admin.json` (état t24, seed 1274568821) reproduit tout :

1. **Le plan bot n'est PAS perdu** : botPolicy émet un ordre pour u4 (le dump montre `order null` parce que les ordres bot sont planifiés à la résolution et consommés — l'instantané est pris en phase `orders` du tour suivant, avant re-plan ; c'est normal).
2. L'objectif est **correct** : `patrouiller` (u4 est le scout), cible (33,7) — coin de l'anneau de patrouille rayon 3 autour de la capitale (30,7).
3. **Le pas est perdu** : `pasVers` glouton STRICT (règle OSCILLATION-MARCHE : jamais un pas qui augmente la distance) renvoie **null** depuis (33,12) — les trois seules sorties terrestres sont non-améliorantes en distance cube : (34,11) est un piège diagonal (dq+1, dr−1 : ds↑), (32,13)/(33,13) s'éloignent, (33,11)/(32,12) sont de l'eau. → `Hold` à chaque tour, **t16→24, mp inutilisés**.
4. Le BFS routier wrappé (`pasVersRoutier`, canon BOT-ARMEE) trouve la route en 1 pas ((32,13)) — u4 est sur un continent de 399 cases relié à ses villes.

**C'est le résiduel « coudes de route » consigné NON corrigé au §1.3 d'OSCILLATION-MARCHE — la prod l'a transformé en parc immobile.** Ni `filtrerMarcheBot` (memo.marche absent du jevEtat prod) ni une question jamais posée (aucune question de déplacement dans les 24 tours : le mouvement est L1).

## 2. Tranche livrée (D-A + D-B, rien d'autre)

### D-A — seuils de confiance PAR QUESTION (canon v2 partout)

`seuils.confianceParQuestion` (data, questions-joueur.json → v11, copie serveur) — chaque seuil = minimum observé en prod, arrondi bas :

| Question | Seuil | Justification (données §1.1) |
|---|---|---|
| `fonder` | **0,2** | min observé 0,21 (choix stable ×3) |
| `convertir` | **0,25** | min observé 0,25 (choix constant) |
| `produire` | **0,3** | min observé 0,33 (12 écrasements, item constant ; le repli bot bâtissait des merveilles) |
| `rechercher` | **0,25** | min observé 0,28 (t0) |

La gate générique (`confianceChoixMin` 0,65 / `decisionMin` 0,5) ne s'applique qu'aux questions sans seuil dédié (test : `techOfferte` 0,45 refusée). `confianceGuerreSterile` 0,3 INTACT. Risque assumé (handoff D-A) : un choix à 0,25 passe — VOULU, le banc arbitre.

Sites d'application (port TS bit-à-bit miroir harnais) : `produire`/`rechercher` (famille confianceChoixMin), `fonder`/`convertir` (famille decisionMin), la branche repli de `convertir` alignée sur le seuil dédié (fini l'aller-retour honorer-puis-repli).

### D-B — doctrine d'exploration (jamais inactif)

`botPolicy.ts` : le cas `patrouiller`/`explorer` route par **`pasVersRoutier` (BFS wrappé) d'abord**, glouton en repli — miroir du cas `offensiver`. `chasser` reste glouton (contact adjacent, intouché guerre). À défaut de route : tenue EXPLICITE (`Hold` émis et journalisé dans le plan — l'unité isolée de test reçoit bien un `Hold`, jamais un silence). Les leviers Jev existants (rappel `protegerCapitale`, éclaireur) sont inchangés.

## 3. Tests FIRST

- `sableuse/tests/confiance-exploration.test.mjs` — 9 verts (5 rouges avant implémentation) : data seuils + copie serveur identique + gate générique inchangée ; cas YU4SHH reconstitués — `fonder` 0,21 honoré / 0,15 refusé, `convertir` 0,25 → SetConversion, `produire` 0,33 → SetProduction, `rechercher` 0,28 → SetResearch, `techOfferte` 0,45 refusée.
- `apps/server/tests/confiance-exploration.test.ts` — 3 verts (1 rouge avant) : cause racine reproduite (`pasVers` null depuis la poche, BFS non-null) ; l'unité en poche REPART en `Move` ; unité sans sortie → `Hold` explicite.
- Suites AVANT push : sableuse 228 / server 418 (1 flocon chat-socle workerd re-vert isolé — piège connu) / jev-port 40 / typechecks verts. `schemaVersion` 28 (data + logique bot, additif).

## 4. Banc de confirmation UNIQUE (bancs/joueur-confiance-exploration-2026-11-03)

Vanilla, 5 seeds corpus (= baseline croissance 02/11 pour comparaison), plafond 600, garde-fou 0,65 $.

→ Run du 03/11 : **4/5 parties lancées** (garde-fou budget global 0,65 $ atteint — partie 5 non jouée), **0,5560 $ ≤ 0,60 $**, 0 erreur API.

| Partie | Seed | Résultat | Tours | Fondations | Coût | Replis |
|---|---|---|---|---|---|---|
| 1 | 3538506724 | **victoire SCIENCE** | 306 (baseline t332) | **6** | 0,1122 $ | 0 |
| 2 | 3947827986 (le seed ping-pong u4) | **victoire SCIENCE** | 308 (baseline t370) | **12** | 0,1689 $ | 18 (piège glm max_tokens, repli v1, gagnante quand même) |
| 3 | 2121991107 | **victoire SCIENCE** | 312 (baseline t316) | **8** | 0,1582 $ | 0 |
| 4 | 3802591813 | coupée budget t293, Jev dominant | 293 | **10** | 0,1167 $ | 0 |

**Lecture contre la baseline croissance (mêmes seeds, 02/11)** : 3/3 finies gagnantes (non-régression ✓) et PLUS VITE sur 2 seeds ; **expansion 6-12 fondations/partie (moyenne 9,0 ≥ 4 — critère 1 ✓, vs 5,4 baseline)** ; guerres vivantes (partie 1 : guerre inter-nations journalisée) ; les réponses à 0,2-0,4 de Jev passent désormais (la gate dédiée est en data, prouvée par les tests du cas YU4SHH reconstitué). Critère 2 (zéro unité sans ordre) : structurel — le plan bot émet un ordre PAR unité à chaque tour (Move routier ou Hold explicite — test poche + test îlot) ; le diagnostic §1.2 a prouvé que le `order null` du dump était la consommation normale des ordres bot, pas de l'inertie.

**Pièges consignés** : replis partie 2 (glm raisonne, max_tokens — connu GUERRE-VIVANTE) ; la garde budget a coupé la partie 4 à t293 (Jev dominant, 10 fondations) — pas une indécise.

## 5. Critères d'acceptation (rappel handoff)

1. Expansion ≥ 4 fondations/partie ; 2. zéro unité sans ordre explicite en fin de tour ; 3. seuils justifiés par le tableau L1 (§2 — chaque valeur = minimum observé) ; 4. non-régression victoires/guerres/suites, schemaVersion 28, budget ≤ 0,60 $.
