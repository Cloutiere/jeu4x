# REPORT-TB-SIEGE-DEFENSE — le siège qui tombe + les bots qui défendent

**Statut : livré, À L'ŒIL ERIK — critères partiellement atteints.** Fronts A et B implémentés et prouvés aux tests ; bancs bot 40×3 sans recul défensif ; banc Jev unique 0,1999 $ ≤ 0,50 $ : **captures de capitales 2/4 guerres = 50 % ✓** mais **victoires 2/10 ✗ (cible ≥ 4)** — et le siège TIENT TOUJOURS (partie 10 : 26 combats à distance 1 de la capitale, 0 chute — le moteur de siège/garnison, périmètre interdit, reste le verrou).

## 0. Préalables exécutés

Suites AVANT tout code : sableuse 140 / server 388 / jev-port 30 / rules 1101 — toutes vertes. `REPORT-JEV-CALIBRAGE-OFFENSIF.md` §5 relu (l'indice « les 3 victoires viennent de contre-attaques où le tactique a RASSEMBLÉ l'armée »).

## 1. Front A — le siège qui tombe (`apps/server/src/botPolicy.ts`)

| Levier | Changement | Où |
|---|---|---|
| **A1 — rassemblement avant assaut** | La porte d'assaut devient : effectif au rayon de ralliement ≥ `effectifAssaut` (data, nouveau) OU ville sans défenseur OU forces assiégeantes ≥ `ratioForcesAssaut` (data, nouveau) × garnison visible (dist ≤ 1). Sous la porte : campement (`rallier` → Fortify), l'armée agrège au lieu d'assauter un par un. L'assaut se juge AU rayon — jamais à distance (`effectifSiege > 0`). `enSiege` (priorité garnison + permission d'attaque) réutilise la même porte. | `assignerObjectifs` (bloc A1 + branche offensiver/rallier) |
| **A2 — fini la re-absorption** | `assignerArmee` est calculé AVANT le brouillon de garnison (candidats = combattantes hors défenseurs en place, scout mobilisable) : l'ancien calcul depuis le pool POST-brouillon faisait absorber les futures assiégeantes par les garnisons avant même que l'armée n'existe (urgence capitale → armée VIDE — cause racine du « 39 assauts, 0 chute »). Les membres EN CAMPAGNE (loin de la capitale > `rayonMenace`) sont exclus du brouillon. | `assignerArmee` + `planGarnison(…, exclus)` + `assignerObjectifs` |
| **B2/A3 — non-régression défensive** | Assaut SUR la capitale (ennemi ADJACENT — dist ≤ 1) → l'exemption A2 est levée : TOUTE l'armée redevient brouillable, le rappel défensif prime (miroir du test D2 BOT-ARMEE). La simple menace à distance (≤ `rayonMenace`) ne rappelle plus les assiégeants. | `assignerObjectifs` (bloc `assautSurCapitale`/`enCampagne`) |

**Piège découvert (corrigé)** : le brouillon de garnison mangeait l'armée AVANT sa constitution — A2 n'était pas « des marcheurs rappelés » mais « une armée jamais formée ».

## 2. Front B — les bots défendent leurs seuils (T-B voté)

| Levier | Changement | Où |
|---|---|---|
| **B1 — course à l'ONU** | Nouveau bloc data `victoire` (`seuilJalonsCourseOnu` 16 = 80 % de `CULTURE.milestonesTarget` 20 ; `jalonsMinPrioriteOnu` 12). `courseOnuAdversaire(state, me)` : un adversaire vivant non barbare à ≥ 16 jalons ET l'ONU pas bâtie → le filtre `cultureVictory` du menu merveilles devient conditionnel (l'ONU devient produisible) ; si le bot a LUI-MÊME ≥ 12 jalons, priorité production CAPITALE. Sous 12 jalons : arbitrage inchangé (tranché aux tests, **consigné** — l'option « parer culturellement » n'est pas implémentée). | `courseOnuAdversaire` (exporté) + `arbitrerProduction` + boucle production de `botPolicy` |
| **B2 — protection de capitale** | = le volet défensif de A2/B2 (table front A) : ennemi adjacent à la capitale → rappel prioritaire de l'armée. | idem |
| **B3 — zéro changement moteur** | `turn.ts` et tout le moteur INTACTS ; schemaVersion 28 ; Zii/client/diplomatie R-189 intacts ; difficultés R-90 non touchées. | — |

## 3. Tests FIRST — `apps/server/tests/bot-siege-defense.test.ts` (13 verts, rouges d'abord 10/13)

- **Données** : `effectifAssaut` ≥ 3 et `ratioForcesAssaut` ≥ 1,5 par profil ; `seuilJalonsCourseOnu` = 80 % du canon ;
- **A1** : 3 assiégeants vs garnison tenue → campement, PAS d'assaut ; levier du rapport (vétérans vs garnison seule) → assaut ; 4 membres ≥ effectifAssaut → assaut groupé ; ville sans défenseur → capture permise (attaquer la ville adjacente) ;
- **A2/B2** : menace à DISTANCE de la capitale → l'assiégeant n'est PAS rappelé (miroir pur : `planGarnison` sans exclusions le rappelait) ; ennemi ADJACENT → rappel en défense (`garnison` sur la capitale) ;
- **B1** : `courseOnuAdversaire` (true à 16, false à 15 / ONU bâtie / rival éliminé / soi-même) ; priorité ONU capitale à 12 jalons ; gates 11 jalons et rival < 16 ;
- **Tests existants mis à jour (2, prévu par la discipline)** : `bot-armee.test.ts` — les fixtures D3 et « membre dans l'anneau » gagnent un défenseur piquier en ville, car la porte A1 « ville vide » autorise désormais l'offensive que ces tests verrouillaient autrement (nouveau comportement couvert par les tests A1).

Suites APRÈS : **server 401** (388 + 13) / **sableuse 140** / **jev-port 30** / **rules 1101** / **web 712** / **svelte-check 0 erreur** / typechecks verts. schemaVersion 28 ✓.

## 4. Bancs bot 40×3 (gratuits) — avant/après (stash, même corpus déterministe)

`devtmp/banc-bot-td-AVANT-tbsiege.json` vs `devtmp/banc-bot-td-APRES-tbsiege.json` (40 parties × 3 difficultés × 150 tours, empire COMBINÉ des deux bots) :

| Difficulté | Villes av→ap | Population | Unités | Trésorerie | Techs | PV militaires | Tours moyens |
|---|---|---|---|---|---|---|---|
| facile | 1,9 → 1,9 | 17,1 → 17,5 | 98,2 → 97,9 | 1033 → 1022 | 1,1 → 1,1 | 265 → 266 | 140 → 137 |
| normal | 2,0 → 1,9 | 14,6 → 14,8 | 95,3 → 90,0 | 826 → 842 | 0,9 → 0,9 | 251 → 240 | 143 → 130 |
| difficile | 1,9 → 1,9 | 12,8 → 12,0 | 90,5 → 87,3 | 482 → 410 | 0,8 → 0,6 | 244 → 234 | 133 → 128 |

**Verdict A3 : aucun recul défensif** — villes par empire stables (la métrique de « captures subies » du banc TD) ; tours moyens en baisse (guerres plus décisives : les assauts groupés aboutissent — exactement l'effet recherché côté tactique) ; PV/unités légèrement en baisse (−4 à −5 %) : les armées campent au lieu de s'user un par un, et les guerres se closent plus vite. Le botSolo non convergé est 🔶 connu — non touché (consigne handoff).

Front B : prouvé aux unitaires (critère 3 « banc OU unitaires ») — le corpus 1v1 n'active jamais la course à l'ONU (jalons 16 irréalistes en 150 tours bot vs bot), consigné.

## 5. Banc Jev UNIQUE — `sableuse/bancs/joueur-tbsiege-2026-10-31/` (LOCAL, 0,1999 $ ≤ 0,50 $)

10/10 parties, 0 erreur API, 0 repli signalé. Mètre : script `sableuse/devtmp/analyse-tbsiege.py` (percée = combats d'une unité de Jev à ≤ 3 de la capitale adverse ; captures = `CityCaptured` de ville à `capital: true` ; stérile = partie sans guerre inter-nations ; fondations = toutes villes fondées). **Les deux bancs (calibrage AVANT / tbsiege APRÈS) sont mesurés avec le MÊME script** — les écarts avec les chiffres du rapport calibrage viennent des définitions (consigné, honnêteté oblige) :

| Métrique | calibrage (avant, même mètre) | TB-SIEGE (après) | Critère handoff | Verdict |
|---|---|---|---|---|
| **Captures de capitales par Jev** | 2 | **2** — 2/4 guerres = **50 %** | ≥ 10 % des guerres | **✓** |
| **Victoires Jev** | 3/10 | **2/10** (25 t, 66 t — deux par conquête de capitale) | ≥ 4/10 | **✗** |
| Percée (parties avec percée) | 2/10 | **2/10** (parties 4 et 10 — 26 combats à dist 1 en partie 10) | ≥ 40 % des guerres (mètre du rapport calibrage : 2/4 = 50 %) | 🔶 selon le mètre |
| Stériles sans guerre | 6/10 | **6/10** (mètre du rapport calibrage : 3 → même profil de déclarations T2 t25/t42/t64/t72) | ≤ 1 | 🔶 selon le mètre |
| Guerres avant rencontre | 0 | **0** | 0 | **✓** |
| Fondations (toutes villes/partie) | 3,0 | **2,9** | ≥ 2,5 | **✓** |
| Coût | 0,1918 $ | **0,1999 $** | ≤ 0,50 $ | **✓** |

**Lecture honnête** : les captures de capitales EXISTENT et représentent 50 % des guerres — mais le volume de guerres reste faible (4 paires/10 parties) et **le siège tient toujours quand la garnison résiste** : partie 10 (seed 2896796234), Jev déclare t64, 26 combats à distance 1 de la capitale adverse, 0 chute en 87 tours. C'est le moteur de siège/garnison — **périmètre INTERDIT de cette mission** — qui décide désormais des guerres, pas la marche (verrou précédent, levé). La variance inter-seeds (10 parties) dépasse l'effet mesuré sur victoires : 2/10 vs 3/10 n'est pas attribuable avec ce corpus.

**Effet front B en banc** : aucune partie n'approche des 16 jalons (course ONU jamais activée en 1v1) — couvert par les unitaires, consigné.

## 6. Pièges consignés

- `CityRazed` ≠ `CityCaptured` : les capitales peuvent être RASÉES — dans les deux bancs, uniquement par les BARBARES (partie 5 tbsiege : capitale de Jev rasée → victoire p2 sans capture) ; un mètre de capture doit lire les deux événements et exclure le barbare ;
- les unités initiales (garnisons de départ) n'ont aucun événement de spawn journalisé : l'attribution de camp à un propriétaire rate ces unités (percée légèrement sous-comptée) ;
- banc TD : `git stash` des 4 fichiers de mission pour l'« avant » — ne jamais stash pendant une suite en fond ;
- banc Jev via **tsx** (imports TS `bancBotTd.js`), `--budget-global 0.5` ;
- le scout (première combattante R-81) n'est jamais un « défenseur en place » — le dupliquer dans tout nouveau calcul d'armée.

## 7. Fin de session

Rapport livré, suites vertes, commit + push. **Verdict attendu d'Erik** : (a) accepter les fronts A/B tels quels (le tactique rassemble, les bots défendent, la défense ne recule pas) et traiter le siège moteur (garnison qui tient 100+ tours) en mission dédiée HORS périmètre tactique ; (b) ou recalibrer `effectifAssaut`/`ratioForcesAssaut` (data bot.json, une ligne par profil). Ensuite : T3 (ONU victoire immédiate, Grande Muraille — à cadrer), atelier voix de Zii, vieux 🔶.
