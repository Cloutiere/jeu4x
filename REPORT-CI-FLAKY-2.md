# REPORT-CI-FLAKY-2 — Durcissement progen-carte-50.test.ts

Mission HANDOFF-CI-FLAKY-2 (décision Erik 01/10). Test-only, zéro changement moteur/serveur/protocole.

## Constat principal : le fichier était DÉJÀ à corpus fixe

La prémisse du handoff était obsolète. `progen-carte-50.test.ts` ne consomme **aucun fast-check** : il balaye un tableau `SEEDS` fixe (50 seeds, en place depuis f2b095f, commit CARTE-50). Le message du commit CI-FLAKY (5cf7e28) qui disait « progen-carte-50.test.ts consomme encore fast-check aléatoire » était inexact.

État réel des suites de `packages/rules` côté RNG :
- `progen-carte-50.test.ts` : corpus fixe ✅ (déjà le cas) ;
- `progen-properties.test.ts` : corpus fixe 61 seeds ✅ (CI-FLAKY) ;
- `properties.test.ts` : fast-check **seedé** (20260829, paramètre `seed` explicite à chaque `fc.assert`) → déterministe ✅.

## Changements effectués (2 fichiers, test-only + banc dev)

1. `tests/progen-carte-50.test.ts` : seed **3714012** (la fautive CI-FLAKY, « villages 10 < 12 » en 1v1, épuisement glouton pré-correctif) ajoutée au corpus en non-régression — même modèle que progen-properties. Corpus : **61 seeds** × 3/4/5 sièges. En-tête et titre de test mis à jour (60 → 61). **Assertions inchangées.**
2. `devtmp/banc-ci-flaky.mjs` : seconde passe ajoutée — **50×40, 3/4/5 sièges**, mêmes assertions que le test CI (totaux villages/huttes × échelle d'aire 15/15, distances villages/huttes↔spawns). Usage : `npx tsx devtmp/banc-ci-flaky.mjs [N_1v1] [N_50x40]`.

## Résultats

- Test CI vert : 919/919 suites rules, typecheck 0 erreur.
- **Déterminisme** : 5 rejeux du test, tableaux de conformité **bit-identiques** (md5 comparés après nettoyage ANSI), 2/2 tests passés à chaque rejeu.
- Seed 3714012 passe en 3/4/5 sièges 50×40 (la fautive ne l'était qu'en 1v1 40×40 pré-correctif).

## 🔴 Cas remonté à Erik : déficit best-effort en 5 sièges 50×40

Le banc dev élargi (100 seeds × 3 sièges) a trouvé **3/300 générations** avec moins de villages que le total attendu — **aucune de ces seeds n'est dans le corpus du test CI** :

| siège | seed | constat |
|---|---|---|
| 5 | 110867 | villages 14 ≠ 15 |
| 5 | 649359 | villages 13 ≠ 15 |
| 5 | 760225 | villages 14 ≠ 15 |

Nuance : la règle « totaux villages/huttes exacts » est **déjà consignée 🔶** dans le test (placeEntities est best-effort, voir consignees dans le test — REPORT-CARTE-MULTI §3), donc ce n'est pas une violation dure au sens du banc. Mais c'est la **même famille que le bug CI-FLAKY** (glouton placeEntities à court de cases), et c'est spécifique à la combinaison 5 sièges × 50×40 (0/200 en 3 et 4 sièges). Un correctif moteur (relances dérivées comme en 5cf7e28, ou élargissement de l'offre de cases) = **mission séparée** — non touché ici, conformément au périmètre interdit.

## Critères d'acceptation

1. ✅ Déterministe (5 rejeux identiques), assertions inchangées (une seed ajoutée au corpus, zéro assertion retouchée).
2. ✅ Zéro changement hors le fichier de test + banc dev ; suites rules 919/919, typecheck 0.
3. ✅ Seeds en déficit documentées ci-dessus, jamais éludées (et hors corpus CI).
