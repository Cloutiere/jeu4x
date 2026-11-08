# REPORT-JEV-QUESTIONS-V2 — De Jev « pilote à colons » à Jev pilote complet

> Mission exécutée selon `HANDOFF-JEV-QUESTIONS-V2.md` (suite logique du POC, décision d'Erik du 28/09). **Rien n'est committé** — L5 = arrêt pour approbation. Outil 100 % hors ligne dans `sableuse/` ; zéro changement moteur/serveur (dépôt intact, tests 3/3 paquets verts). **Coût total réel depuis le début (POC inclus) : 0,0932 $** sur 23 parties journalisées — garde-fou 2 $ jamais approché, budget Erik 5 $.

## Verdict en une phrase

**La v2 transforme le pilote** : sur les mêmes seeds, les replis d'ouverture passent de 11/11 à **1 par partie**, la production est pilotée 49-50 tours sur 51 (contre 29 au mieux en v1), la **recherche est choisie puis tenue jusqu'à complétion** (poterie et équitation complétées par la nation Jev — l'objectif n°3 du handoff, impossible au POC), et **menace/attaque fonctionnent enfin** (score 2+ pendant 40+ tours en contact forcé, attaques réellement exécutées). Deux chantiers restent ouverts, consignés dans la fiche v2 : `fonder` reste sous le seuil (noul max 0,58) et les rejets des parties contact sont des attaques contre l'unité FICTIVE injectée (attendu, étiqueté `scenario:test`).

## 1. Ce qui a été livré

| Élément | Contenu |
|---|---|
| **D1 · Condensé enrichi** | `src/condense.mjs` : rendements nets/tour par ville (nourriture/production/science/or via `cityEconomyInputs` du moteur, appelé sur l'état FILTRÉ), file de production courante + marteaux, **candidats de production curés** (coût + tours estimés), **valeur des sites de fondation** (formule §2), puissance militaire connue (amie vs ennemie visible, rapport), état de recherche (tech, coût, progression, tours restants, candidates). Taille mesurée : ~1 200 octets de moyenne (≪ cible 3 000 jetons). Formules éditables dans `configCondense`. |
| **D2 · Questions v2** | `questions.json` : les 4 questions du POC **réécrites sur les faits du condensé** + 2 nouvelles : `produire` (Choice parmi les candidats réels de la capitale) et `rechercher` (Choice parmi les techs réellement disponibles). v1 archivée dans `questions.v1.json`. Critères dynamiques injectés chaque tour par l'adapter (`criteresDynamiques`). |
| **D2 · Tenue de la recherche** | Le harnais mémorise le choix (`memo.techRecherche`) et ré-émet `SetResearch` chaque tour jusqu'à complétion — Jev ne change plus de tech en cours de route, contrairement au bot seul qui re-tire au hasard. |
| **D2 · Routage par domaine** | Itération de calibrage (découverte §3) : la posture indécise ne jette plus les décisions de domaine confiantes ; chaque question porte son seuil (`confidenceChoixMin` pour les Choice, `fonderMin`/`attaquerMin` pour les Noul). En v1 (config archivée), l'ancien repli intégral sur la posture est conservé tel quel — l'A/B reste propre. |
| **D3 · Contact forcé** | `injecterMenace()` (harnais) : unité ennemie FICTIVE dans le SEUL condensé Jev, jamais dans le moteur (testé : l'état moteur est bit-à-bit identique, aucune unité `test` ne fuit). `trouverSeedsContact()` scanne les seeds à spawns les plus serrés. CLI : `--injection` (journal étiqueté `scenario:test`), `--questions <fichier>`. |
| **D5 · Déterminisme/FAUX client** | Format JSONL inchangé (nouvelles décisions ajoutées avec leur question), faux client enrichi des questions dynamiques, 15/15 tests verts (`npm test` sableuse, zéro appel réseau). |

## 2. Tableau A/B (mêmes seeds, v1 = config archivée, v2 = finale — journaux du 28/09 15:42 et 15:48)

| Métrique | 20260928 v1 | 20260928 v2 | 777 v1 | 777 v2 | 130 v2+inj | 59 v2+inj |
|---|---|---|---|---|---|---|
| Replis totaux (/51 tours) | 22 | **1** | 45 | **2** | **1** | **1** |
| Replis d'ouverture (tours 1-10) | 11 | **1** | 11 | **1** | **1** | **1** |
| Dernier repli | tour 21 | tour 0 | tour 50 | tour 38 | tour 0 | tour 0 |
| Tours pilotant la production | 29 | **50** | 6 | **49** | **50** | **50** |
| Tours pilotant la recherche | 0 | **49** | 0 | **20** | **48** | **49** |
| Tours menace ≥ 2 ou attaque | 0 | 0 | 3 | 0 | **40** | **46** |
| Diversité production (Jev) | colon ×29 | colon ×50 | guerrier ×5, colon ×1 | colon ×48, guerrier ×1 | **guerrier ×50** | **guerrier ×50** |
| Techs tenues → complétées | aucune | poterie (tenue, non finie) | aucune | **poterie ✅ (p2)** | **équitation ✅ (p2)** | alphabet (tenue, non finie) |
| Événements de combat (nation Jev) | 0 | 0 | 4 | 0 | **24** | **18** |
| Ordres rejetés | 0 | 0 | 0 | 0 | 1 🔶 | 7 🔶 |
| Coût de la partie | 0,0029 $ | 0,0047 $ | 0,0029 $ | 0,0048 $ | 0,0052 $ | 0,0053 $ |
| Latence moy/max | 227/410 ms | 273/582 ms | 223/290 ms | 236/514 ms | 283/636 ms | 248/447 ms |

**Lecture** : la v1 (avec le condensé enrichi, seule variable = les questions) reste bloquée aux replis de confiance et ne pilote qu'un domaine ; la v2 pilote production + recherche + menace/attaque, avec des choix qui basculent logiquement : colon ×50 sans contact, guerrier ×50 dès l'injection d'une menace (réaction immédiate, tour après tour, sans ordre illégal de forme). La latence reste compatible banc (médiane ~250 ms, un pic historique à 10,8 s sur une tour isolée — voir 🔶).

## 3. Deux découvertes de calibrage (itérations v2, chacune validée par re-mesure)

1. **Le garde global sur la `posture` jetait des décisions confiantes** : sur 20260928, Jev répondait `produire: colon` avec confiance 0,8+ pendant 49 tours mais 27 tours partaient en repli intégral parce que la posture hésitait (économique 0,47 vs tech 0,55). Correctif : routage par domaine (§1). Résultat : 27 → 1 repli.
2. **Trop de candidats = distribution plate** (directive n°3 en action) : avec 8 candidats de production, la confiance de `produire` s'effondrait (0,26-0,51 sur 777, hésitation guerrier/colon 45/55). Correctifs : candidats **curés à ≤ 5** (meilleur colon, meilleure unité de combat, meilleur bâtiment, complétés par coût) + règle de départage littérale dans l'instruction (« menace < 2 → colon ; menace ≥ 2 → unité de combat »). Résultat : 45 → 2 replis sur 777.

## 4. Décisions commentées (journaux réels)

1. **20260928-v2, régime de croisière** : `produire: colon` (confiance ~0,9), `rechercher: poterie` tenu 49 tours de suite, fondation refusée (noul ≤ 0,56, sites sans valeur suffisante face à la croissance de la capitale). Pilote stable et diversifié en fonction des faits.
2. **59-v2-inj, tour 14 — LA décision de menace/attaque demandée (criterion 2)** : menace injectée visible → `menace: 2,01`, `attaquer: 0,82` (≥ seuil 0,80), rapport de puissance 2 en faveur → traduit `SetProduction guerrier` + `Move u4` vers la cible à 1 case. **43 tours sur 51 avec menace ≥ 2** : Jev maintient l'effort de guerre tant que l'ennemi est visible, et bascule immédiatement sa production en guerriers (×50).
3. **777-v2, tour 22-37 (ex-zone de repli)** : sans le départage littéral, Jev hésitait 45/55 entre guerrier et colon ; avec la règle « sans menace → colon », il produit le colon et rejoint le régime de croisière (2 replis au total).
4. **130-v2-inj** : équitation choisie, tenue, **complétée par la nation Jev** (événement `TechResearched p2`) — première tech jamais complétée par un pilote Jev dans la sableuse.

## 5. Fiche de suffisance v2 (ce qui manque ENCORE, question par question)

| Question | Verdict |
|---|---|
| `posture` | 🔶 Devenue un rôle d'arbitrage (fortifier) — la production ne passe plus par elle. Peut-être fusionnable avec `produire` au banc. |
| `menace` | ✅ Départageable et réactive (2,01-2,12 en contact, 0,01 sans). Prête pour le banc. |
| `fonder` | 🔶 **Toujours sous le seuil** : noul max 0,54-0,58 (seuil 0,70) MÊME avec la valeur des sites au condensé. Soit le seuil est trop haut, soit il manque un « gain net » chiffré (valeur site − croissance perdue). C'est le prochain chantier de calibrage ; les 2 fondations par partie viennent du bot. |
| `attaquer` | ✅ Déclenchée en contact (noul 0,82 ≥ 0,80). 🔶 Les rejets 1/7 des parties contact sont des `Attack` contre l'unité FICTIVE injectée (`scenario:test` — le moteur n'en sait rien) : attendu, à exclure de la métrique « ordre illégal » pour ce scénario ; 0 rejet hors injection. |
| `produire` | ✅ Départageable après cure des candidats + règle littérale. 🔶 Aucun bâtiment jamais choisi en 51 tours — critère bâtiment à re-travailler si on veut la diversité longue. |
| `rechercher` | ✅ Tenue et complétée (poterie, équitation). 🔶 20260928-v2 : poterie tenue 49 tours mais non complétée — la science par tour y est très faible ; vérifier au banc si le pilote doit under-write la science (conversion or). |

## 6. Points 🔶 (à vetoer)

- **Routage par domaine** (changement de sémantique vs POC) : le repli intégral sur la posture ne s'applique qu'à la config v1 archivée. C'est le cœur de l'amélioration — mais c'est un changement de contrat à assumer.
- **Candidats de production curés à ≤ 5** (`configCondense`/logique de cure) : choix assumé pour la départageabilité ; on sacrifie la visibilité des items chers.
- **Formule de valeur de site** : `Σ(rayon 1) + 0,5×Σ(rayon 2) − 2×distance au colon`, tuile centrale exclue (testée unitairement). Éditable, non calibrée — `fonder` n'a jamais mordu dessus.
- **Spawns mirror1v1 jamais < 17** (min mesuré sur 150 seeds) : le « contact forcé » repose donc sur l'injection harnais, pas sur des seeds vraiment serrés ; `trouverSeedsContact` prend les plus serrés trouvés (130 d=17, 59 d=19).
- **Pic de latence 10,8 s** sur 1 appel (série 15:43) : sans effet à 1 appel/tour, à surveiller pour le banc parallèle.
- **Coût/jetons v2 ≈ 1,6× v1** (109-127k vs 69k jetons/partie) : toujours ~0,005 $/partie, sans enjeu.

## 7. Critères d'acceptation du handoff

1. ✅ Replis d'ouverture : 11 → **1** (v1 → v2, les deux seeds) ; domaines pilotés : production + recherche + posture, et menace/attaque en contact = **4+ domaines**.
2. ✅ Contact forcé : menace Score = 2,01-2,12 (≠ 0, 43-46 tours), décision d'attaque traduite et analysée (tour 14, seed 59).
3. ✅ Recherche tenue et complétée (poterie et équitation, événements `TechResearched` de la nation Jev) — contrairement au POC.
4. ✅ Coût total **0,0932 $** depuis le début (garde-fou 2 $, budget Erik 5 $) ; latence médiane ~250 ms ; rejouabilité conservée (tests) ; 0 ordre illégal hors injections étiquetées.
5. ✅ Zéro changement moteur/serveur/jeu (tests dépôt 3/3 paquets verts en début de session, `apps/`/`packages/` intacts par la sableuse) ; zéro secret (`journaux/` et `.env.local` gitignorés).

## 8. Recommandation pour le banc de calibrage 5 nations

**Feu vert demandé sur deux options avant le banc** :
1. **Lancer le banc avec l'état v2 actuel** — production/recherche/menace/attaque sont prêts ; `fonder` restera en repli bot (le bot fonde très bien), ce qui est un pilotage hybride honnête.
2. **Ou une courte itération v3 sur `fonder` d'abord** (gain net chiffré + seuil à re-calibrer), puis le banc.

Dans les deux cas : porter la métrique « rejets » avec l'exclusion `scenario:test`, garder la cure des candidats, et instrumenter la distribution `produire` (le départage littéral est l'levier le plus rentable constaté).
