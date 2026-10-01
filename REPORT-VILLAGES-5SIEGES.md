# REPORT-VILLAGES-5SIEGES — Plancher de villages en 5 sièges 50×40

Mission HANDOFF-VILLAGES-5SIEGES (01/10/2026). **Verdict mixte : les 3 seeds du handoff sont corrigées (bug de générateur, faisabilité prouvée), MAIS le banc renforcé 500 seeds révèle 4 nouveaux cas dont 2 sont un CONFLIT DE RÈGLES RÉEL → STOP L1, options chiffrées pour Erik (§5).**

## 1. TL;DR

- Les 3 seeds fautives du handoff (**110867, 649359, 760225**) sont **faisables** (backtracking exact 15/15) : correctif appliqué = borne de relances déterministes de `placeEntities` portée **8 → 64** (même mécanisme éprouvé CI-FLAKY 5cf7e28, zéro valeur de règle).
- **Bit-identité prouvée** : 200 seeds × 3/4/5 sièges = 600 empreintes md5 de carte complète ; **596 identiques**, 4 changent — les 3 fautives + **1465016** (4ᵉ fautive découverte au passage, 14/15 avant correctif, confirmée sur worktree HEAD).
- Banc **100 seeds × 3/4/5 sièges (critère du handoff) : 100 % aux planchers**. Suite rules **919/919** (corpus `progen-carte-50` porté 61 → 65 seeds avec les 4 fautives), server 116/116, typecheck monorepo 0 erreur, 5 rejeux du test bit-identiques (md5).
- 🔴 **Banc renforcé 500 seeds × 5 sièges : 4/1500 générations déficitaires** — dont **1884723 (max 14) et 3025059 (max 13) NON FAISABLES** (preuve exacte par branch-and-bound) : les contraintes d'Erik sur ces grilles ne permettent physiquement pas 15 villages. Ce n'est plus un bug : c'est un plafond de règles → décision d'Erik.

## 2. L0 — Reproduction et diagnostic

Reproduction confirmée sur HEAD (`devtmp/diag-villages-5sieges.mjs`) :

| seed | villages (avant) | attendus | cases éligibles (sans spacing) |
|---|---|---|---|
| 110867 | 14 | 15 | 71 |
| 649359 | 13 | 15 | 74 |
| 760225 | 14 | 15 | 69 |

Cause : en 5 sièges 50×40, l'offre de cases (contraintes empilées : 5 spawns × purge, ≥ minResourceDistance de toute ressource, ≥ 2 voisins praticables, capitales) laisse ~70 cases, et le glouton uniforme au spacing 6 n'y atteint 15 que dans **10-26 % des essais RNG** (`devtmp/calib-relances-5sieges.mjs`) — 8 relances laissaient ~40 % d'échec sur la pire seed. Famille exacte du bug CI-FLAKY.

**Faisabilité** (`devtmp/diag-faisabilite-villages-5sieges.mjs`, branch-and-bound EXACT sur les contraintes identiques à l'appel `libre.ts`, sans miroir — le multi n'en a pas) : **15/15 atteint pour les 3 seeds en 16 nœuds** → bug de générateur, pas un conflit de règles. (Première version du diag avec simple backtracking + plafond de nœuds donnait un faux « non faisable » : plafond atteint = borne inférieure, corrigé en BnB exact avec borne supérieure gloutonne.)

## 3. L1 — Correctif (modèle CI-FLAKY, une ligne)

`packages/rules/src/progen/content.ts` — `placeEntities` : borne de la boucle de relances `8 → 64`. Invariance par construction : une graine qui réussit en ≤ 8 relances consomme exactement le même flux RNG qu'avant (première passe au flux principal inchangée ; les relances utilisent le RNG dérivé `rng.state ^ 0x9e3779b9·tentative`, injectif sur 1..64). Seules les seeds qui épuisaient 8 relances peuvent changer — ce sont par définition des seeds déficitaires.

**Preuve de bit-identité** (`devtmp/verif-invariance-5sieges.mjs`, md5 de {villages, huttes, ressources, spawns, artefacts} — 200 seeds × 3/4/5 sièges, corpus `1 + i·7919`) : **596/600 empreintes identiques** ; les 4 qui changent sont exactement les 4 seeds déficitaires (110867, 649359, 760225 + 1465016, dont le déficit pré-correctif 14/15 a été confirmé sur worktree HEAD `ad7afda`).

**Non-régression** : les 4 seeds ajoutées au corpus fixe de `tests/progen-carte-50.test.ts` (61 → 65, mêmes assertions, comptes de titre mis à jour).

## 4. L2 — Vérification

- Banc `devtmp/banc-ci-flaky.mjs 100 100` : **0/300 fautif en 50×40 (3/4/5 sièges), 0/100 en 1v1** — critère 1 du handoff atteint sur le banc demandé.
- Suites rules **919/919** (dont le corpus 65 × 3/4/5 sièges, 97 s) ; server **116/116** ; typecheck turbo **4/4** ; **5 rejeux** du test : tableaux bit-identiques (md5).
- **Banc renforcé** `500 500` (mon initiative, dépasse le périmètre demandé) : **4/1500 déficits, tous en 5 sièges** → §5.

## 5. 🔴 STOP L1 — Le banc 500 dépasse ce que des relances peuvent garantir

| seed | villages observés | faisabilité (preuve exacte) | succès glouton/essai (2000 essais) |
|---|---|---|---|
| 1884723 | 13 | **NON FAISABLE — max indépendant = 14** | n/a |
| 3025059 | 10 | **NON FAISABLE — max indépendant = 13** | n/a |
| 3349738 | 14 | faisable (15/15) | **3,5 %** → 65 essais laissent ~10 % d'échec |
| 3405171 | 12 | faisable (15/15) | **0,4 %** → des relances seules ne suffiront jamais |

Taux global résiduel : 4/1500 générations 5 sièges (~0,27 %) ; 0 en 3 et 4 sièges (1000/1000).

**Options pour Erik (aucune appliquée)** :

1. **Statu quo qualifié** (aucun travail) : le critère du handoff (banc 100, corpus CI) est 100 % vert ; le déficit reste best-effort consigné (déjà 🔶 au test, REPORT-CARTE-MULTI §3). Les 2 seeds non faisables montrent que le plancher 15 est une aspiration, pas une garantie des règles actuelles.
2. **Complétion déterministe bornée** (2 seeds faisables, ~1 j) : après épuisement des relances, une passe de backtracking exact (contraintes IDENTIQUES, aucune relâchée, RNG non consommé) complète le placement. Garantit le plancher partout où c'est faisable ; zéro impact sur les seeds qui passent (déclenché seulement après 64 relances infructueuses).
3. **Conflit de règles (2 seeds non faisables)** : soit accepter le déficit (statu quo), soit assouplir une valeur de règle (villageSpacing 6, minResourceDistance, rayon de purge spawn) — décision de gameplay, hors périmètre de cette mission.

## 6. Coût

Diagnostic + correctif une ligne + outillage dev : ~1 h 30 de calculs de bancs incluses. Fichiers touchés : `content.ts` (1 borne), `progen-carte-50.test.ts` (4 seeds + comptes), bancs/diags devtmp (4 scripts, hors CI). Zéro changement protocole/serveur/UI/coquille ; aucune valeur de règle.

## 7. Décision d'Erik (01/10)

**Option 1 — statu quo qualifié, feu vert pour le commit.** L'objectif reste 15 villages ; quand les contraintes de la grille ne le permettent pas (2 seeds non faisables prouvées) ou que le tirage n'y arrive pas, le nombre diminue jusqu'à ce que ça rentre — la sémantique best-effort consignée est bien la règle voulue. L'option 2 (complétion déterministe) reste disponible si le 5 sièges devient un mode majeur ; l'option 3 est écartée (aucune valeur de règle touchée).

## 8. État

Commité et poussé (CI déploie).
