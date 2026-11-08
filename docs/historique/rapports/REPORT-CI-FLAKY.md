# REPORT-CI-FLAKY — Éradication des échecs CI intermittents (procedural-40, progen-properties)

Mission exécutée le 01/10/2026. **Verdict : bug de générateur (placement glouton), corrigé** — aucun conflit de règles, aucune valeur touchée, aucune remontée d'arrêt nécessaire.

## 1. TL;DR

Les deux échecs intermittents (« villages 10 < 12 » et « −3 barbares ») sont **le même défaut** : sur ~0,1 % des seeds, le placement glouton des villages barbares s'épuise avant le quota (10 villages au lieu de 12) alors qu'une configuration complète existe — chaque village manquant retire 3 barbares (T-50 : 3/village), d'où le « −3 barbares » (ou −6) du test e2e. Correctif : relances déterministes au RNG dérivé dans `placeEntities` (content.ts). Résultat : **1000/1000 seeds à 12 villages + 12 huttes**, seeds saines **bit-identiques** (preuve §5), 919 tests rules verts, typecheck 0 erreur.

## 2. L0 — Quantification (preuve avant tout)

Banc `packages/rules/devtmp/banc-ci-flaky.mjs` (1000 seeds, 1v1 40×40 miroir, défauts — exactement les assertions des deux tests faibles) :

| Commit | Seeds fautives | Distribution villages | Huttes |
|---|---|---|---|
| `535e426` (parent de f2b095f, 28/09 — avant CAMPS-RESSOURCES) | **0/1000** | 12 : 1000 | 12 : 1000 |
| `f2b095f` (CARTE-50/CAMPS-RESSOURCES) | **1/1000 (0,1 %)** — seed **3714012** | 10 : 1, 12 : 999 | 12 : 1000 |
| HEAD `0283252` (avant correctif) | **1/1000** — seed **3714012** | 10 : 1, 12 : 999 | 12 : 1000 |
| HEAD + correctif | **0/1000** | 12 : 1000 | 12 : 1000 |

- Seed fautive unique du corpus : **3714012** (`villages 10 < 12`, aucune violation de distance). Huttes : jamais en défaut sur 1000 seeds.
- Le taux mesuré (0,1 %) est cohérent avec la fréquence CI observée : fast-check tirait 60 seeds aléatoires (p ≈ 6 %/run) et l'e2e `procedural-40` tire un seed crypto par partie (p ≈ 0,1 %/run × plusieurs runs/jour).

### Bisect

Le banc rejoué sur un worktree : **0/1000 au parent `535e426`, 1/1000 dès `f2b095f`** (même seed 3714012). Le commit déclencheur est `f2b095f` (CARTE-50 + CAMPS-RESSOURCES + ARTEFACTS-ILES, 28/09) — mécanisme : la contrainte `resourcesFull` (camp posé à ≥ `minResourceDistance` de toute ressource, images miroir comprises) a réduit l'offre de cases éligibles pour les camps, précipitant l'épuisement du placement glouton sur les grilles archipel peu terrestres. La contrainte d'Erik est restée intacte — c'est le *placeur* qui n'encaissait pas.

## 3. L1 — Diagnostic par cause : **bug de générateur**

`placeEntities` (content.ts) posait les villages en glouton uniforme et faisait `break` silencieux à la première passe sans candidats (« posés en nombre moindre, consigné »). Pour la seed 3714012, le script `devtmp/diag-faisabilite.mjs` (**backtracking sur les contraintes EXACTES** : praticable, ≥ 6 des spawns, spacing 6 entre villages, images miroir et auto-image comprises, ≥ 2 de toute ressource, ≥ 2 voisins praticables) trouve **32 cases éligibles et un ensemble complet de 6 villages par demi en 26 nœuds** :

```
solution : 21,3 29,3 4,8 27,9 31,11 0,16  → FAISABLE
```

La règle était donc atteignable et le générateur la violait sur certaines seeds : case « bug de générateur » du handoff (pas « conflit de règles » — rien à arbitrer par Erik, aucune garantie relâchée).

## 4. Correctif (minimal, aucune valeur touchée)

`packages/rules/src/progen/content.ts` — `placeEntities` :

- une passe glouton au flux RNG principal, **inchangée** : une seed qui réussit du premier coup consomme exactement le même flux qu'avant ;
- si le quota n'est pas atteint : jusqu'à 8 relances au RNG **dérivé de façon déterministe** de l'état courant du flux (`rng.state ^ 0x9e3779b9·tentative`) — même seed → mêmes relances → même carte ;
- best-effort conservé (relances épuisées = posés en nombre moindre, consigné) — la propriété « 12/12 » est simplement désormais atteinte sur tout le corpus testé.

Test-first : la seed 3714012 a été ajoutée au corpus AVANT le correctif (échec observé « villages 10 < 12 »), puis vert après.

## 5. Invariance (les seeds saines ne changent pas d'octets)

`devtmp/verif-invariance.mjs` comparant la carte complète (villages + huttes + ressources id/case) entre `f2b095f` et le code corrigé sur 6 seeds (1, 7920, 15839, 23758, 31677, 3714012) : **seule 3714012 diffère** (10 → 12 villages). Aucune carte en jeu n'est modifiée par le correctif ; les parties en cours ne sont pas affectées.

## 6. L2 — Durcissement

- **`packages/rules/tests/progen-properties.test.ts`** : fast-check et ses 60 graines ALÉATOIRES sont remplacés par un **corpus FIXE de 61 seeds** (60 graines uint32 arbitraires + 3714012 en non-régression). Zéro RNG non contrôlé : un échec CI futur = un vrai bug reproductible. Les assertions (R-101..R-105, symétrie, connexité, équité, contenu) sont inchangées.
- **Banc hors CI** : `devtmp/banc-ci-flaky.mjs` (1000 seeds, ~30 s, reprise du précédent `banc-carte-50.mjs`) + `devtmp/diag-faisabilite.mjs` (backtracking) + `devtmp/verif-invariance.mjs`.
- **Audit RNG des suites** : `properties.test.ts` fixait déjà sa graine fast-check (20260829) — déterministe ; `botPolicy.test.ts` n'utilise ni `Math.random` ni `Date.now`. Seul `progen-properties.test.ts` consommait du RNG non contrôlé (corrigé). Aucun autre test fast-check.
- **`apps/server/tests/procedural.test.ts`** : la graine de partie reste tirée par `generateSeed()` (crypto) — il n'existe aucun chemin d'injection de seed côté `CreateGame` sans ajout au protocole (périmètre interdit). 🔶 Après correctif, chacune de ses assertions est une propriété universelle vérifiée sur 1000 seeds (12 villages, 12 huttes, 36 barbares, distances, ratio terre 33–45 %) ; si Erik veut un e2e à graine fixe, l'option est un champ `seed` optionnel de création (prototype : accepté en production puisque `meta.seed` est déjà public dans le dump admin — à trancher par Erik, non fait).

## 7. L3 — Vérification

- Suite `@game/rules` complète : **919/919 verts** ; rejeux du corpus ×5 : verts sans variation ; typecheck rules + server : 0 erreur ; suite server : voir §9.
- La seed historiquement fautive 3714012 est couverte par le corpus fixe du test (critère 2).

## 8. L4 — Ce qu'Erik valide en ligne

Au prochain push : CI verte du premier coup attendue (Deploy débloqué). Aucune règle, valeur ni garantie modifiée ; zéro changement protocole/jeu distribué ; les cartes des parties existantes sont inchangées (§5). 🔶 ouverts, non bloquants : (1) e2e à graine fixe (champ `seed` optionnel — décision d'Erik) ; (2) les deux flaky historiques documentés au 30/09 sont tous deux expliqués par ce défaut unique — le flaky `progen-carte-50` (5 sièges) n'a pas montré d'échec (banc 500 seeds 100 % au 28/09) mais consomme encore fast-check aléatoire dans `progen-carte-50.test.ts` 🔶 non touché (hors périmètre strict des deux tests nommés, à durcir sur le même modèle si Erik le souhaite).

## 9. Annexes

- Banc complet pré-correctif (HEAD) : cf. §2. Commandes : `npx tsx devtmp/banc-ci-flaky.mjs 1000` (depuis `packages/rules`).
- Fichiers touchés : `packages/rules/src/progen/content.ts` (correctif), `packages/rules/tests/progen-properties.test.ts` (corpus fixe), `packages/rules/devtmp/banc-ci-flaky.mjs` + `diag-faisabilite.mjs` + `verif-invariance.mjs` (outillage dev, hors CI).
