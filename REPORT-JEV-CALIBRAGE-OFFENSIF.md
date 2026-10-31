# REPORT-JEV-CALIBRAGE-OFFENSIF — de la déclaration à la capture

**Statut : livré, À L'ŒIL ERIK** — critères partiellement atteints (§4) : percée ✓, stériles ✓, fondations ✓, coût ✓ ; **captures 0 % dans les guerres déclarées ✗ et victoires 3/10 < 4 ✗** — le verrou restant est démontré chiffré (§5) et attend ton verdict.

## 0. Préalables exécutés

Suites AVANT tout code : sableuse 116, server 388, jev-port 26 — toutes vertes. Banc LOCAUX it4b relus (`sableuse/bancs/joueur-it4b-2026-10-31/` + stériles).

## 1. Diagnostic D-O — où meurt l'offensive (journaux it4b, zéro API)

Script : `sableuse/devtmp/diagnostic-offensif-it4b.py` (reproductible).

**D-O1 — L'armée se forme.** Forces 137-147 vs 5-59 ; 32-105 unités offensives en fin de partie. Le verrou n'est PAS la production.

**D-O2 — L'armée ne marche JAMAIS vers la capitale déclarée.** C'est LE verrou :
- seed 3538506724 (3 guerres totales) : **2 126 destinations de Move pendant les guerres — distance MINIMALE 16 cases** de la capitale adverse (médiane 25). Errance pure : `u2` ping-pong (-9,20)↔(-10,21) dix tours de suite en pleine guerre totale ;
- 97 combats, distance minimale d'un combat à la capitale adverse : 4 — JAMAIS de siège ;
- `distanceCapitale` du condensé reste **99 toute la partie, même après contact (rencontre t21)** — Jev déclare la guerre sans jamais savoir OÙ marcher (la ville adverse ne rentre dans l'état filtré que si sa case est visible ; elle ne l'a jamais été).

**D-O3 — La paix-éternelle est confirmée mais secondaire.** 45 propositions de paix refusées dans la seule partie 1 — la boucle de paix tournait PENDANT la guerre totale de Jev.

**Verdict du diagnostic** : verrou = « Jev ne voit pas le théâtre + aucune traduction du mode domination en mouvements ». Le remède pré-voté au handoff §1 s'applique (cadre du théâtre) + le levier ordres (traduction des choix en mouvements, prévu §1 du handoff).

## 2. Leviers implémentés (tous data-driven, `questions-joueur.json` v7)

| Levier | Changement | Où |
|---|---|---|
| **D-B** | Écart de villes 3 → 2 dans `signalDominationMechanique` (data `seuils.dominationEcartVilles: 2`) | `sableuse/src/joueur.mjs` + port TS |
| **D-C** | Paix + compensation NON posées quand `memo.finPartie` ∈ {domination, pousserCapitale} ET rapport ≥ 1 ; rapport < 1 → paix de retour (sauve-qui-peut) | questions v6c |
| **D-E1 (théâtre)** | `calculerTheatre(etatComplet, moi, memo)` — harnais UNIQUEMENT — expose par rival éligible (en guerre, ou mode domination actif) une **direction** (6 secteurs hex) + une **distance bucket** (5/10/20/40). JAMAIS de case, jamais de coordonnée (testé). Exposé au condensé via `filtre.theatre` → `rivaux[].capitaleDirection/capitaleDistance` (null sinon) | `joueur.mjs` + injection dans `partie.mjs` + port TS |
| **D-E2 (marche)** | En mode domination/pousserCapitale + en guerre + cible de théâtre connue : les `seuils.marcheTaille` (6) unités offensives hors menace adjacente reçoivent un **MultiStep** vers la capitale vue ou le point de passage projeté — pas glouton déterministe (`cheminMarche`), fog traversé (le moteur gèle à la frontière, re-planifié chaque tour), arrêt DEVANT une ville ennemie vue (l'assaut reste au tactique BOT-ARMEE), rejets → repli bot | `joueur.mjs` + port TS bit-à-bit |
| **D-D non-régression** | Gate calmes inchangé, zéro ordre moteur nouveau (MultiStep/DeclareWar existent), schemaVersion 28, bots/Zii/client intacts | tests v6c |

**Tests FIRST** : `sableuse/tests/v6c.test.mjs` 24 verts (rouges d'abord : 14/24). Un test v6b verrouillant explicitement le seuil 3 a été mis à jour (prévu au handoff L2). Port : `apps/server/src/jev/joueur.ts` miroir + 4 tests croisés bit-à-bit v6c (théâtre, condensé, D-C, marche) — jev-port 30 verts.

## 3. Banc UNIQUE (plafond 0,50 $) — `sableuse/bancs/joueur-calibrage-2026-10-31/`

10/10 parties, **coût 0,1918 $** ✓, 0 erreur API, replis 2/1117 tours, tours moyens 112.

### Tableau it4b → calibrage

| Métrique | it4b (avant) | calibrage (après) | Critère | Verdict |
|---|---|---|---|---|
| **Percée** (guerre avec capitale atteinte/assiégée) | 1/5 guerres (2121991107) | **2/3 = 67 %** (2121991107 : 39 combats à ≤3, dist min 1 ; 4033602994 : dist min 1) — 3947827986 échoue (dist min 7) | ≥ 40 % | **✓** |
| **Captures de capitales dans les guerres de Jev** | 0/5 | **0/3** | ≥ 10 % | **✗** |
| **Victoires Jev** | 1/6 | **3/10** (81 t, 76 t, 31 t — toutes par conquête de la capitale adverse) | ≥ 4/10 | **✗ (3/10)** |
| Stériles sans déclaration | 3 | **1** (786078703 : écart villes 0 cette fois — Jev n'a fondé qu'1 ville survivante, le signal est correctement muet ; les 2 autres stériles déclarent maintenant : t25 et t42) | ≤ 1 | **✓** |
| Guerres avant rencontre | 0 | **0** | 0 | **✓** |
| Fondations | 2,5/partie | **3,0/partie** (30 fondations / 10 parties) | ≥ 2,5 | **✓** |
| Propositions de paix (spam) | 88 (45 refusées p1 seule) | **10** (D-C — la boucle 13-45 refus est morte) | — | ✓ |
| Coût | 0,2408 $ | **0,1918 $** | ≤ 0,50 $ | **✓** |

### Transcripts avant/après

**AVANT** (it4b, seed 3538506724 — guerre totale déclarée t48) :
```
t48 u2 Move -> (-9,20)   t49 u2 Move -> (-10,21)
t50 u2 Move -> (-9,20)   t51 u2 Move -> (-10,21)   … ping-pong 10 tours
```

**APRÈS** (calibrage, seed 2121991107 — guerre déclarée t30, capitale adverse en (26,13)) :
```
t61 assaut près de cap adverse (25,14) ×2
t73 assaut près de cap adverse (26,14) ×2   ← ADJACENT à la capitale : siège
t80 assaut près de cap adverse (25,14)
t82 assaut près de cap adverse (23,13)
```
Les 3 victoires du banc sont des conquêtes de capitale (score 333/42, 207/15, 72/3).

## 4. Critères d'acceptation — état honnête

1. Percée 67 % ✓ ; captures 0 % ✗ ;
2. Victoires 3/10 (cible ≥4) ✗ ; stériles ≤ 1 ✓ (D-B a débloqué 2 des 3 stériles it4b) ;
3. Non-régression ✓ (0 guerre avant rencontre, gate calme vert, fondations 3,0) ;
4. Suites : sableuse **140** / server **388** / jev-port **30** / rules **1101** / web **712** / svelte-check **0 erreur** / typechecks verts — schemaVersion 28 ✓ — budget 0,1918 $ ✓ — chaque changement attribuable au transcript ✓.

## 5. Le verrou restant — démontré chiffré, Erik tranche

La marche est levée : **2 guerres sur 3 atteignent la capitale et l'assiègent** (39 combats adjacents sur seed 2121991107). La prise échoue : le siège tient 100+ tours sans capturer la garnison (39 assauts, 0 chute). C'est le moteur de siège/garnison + le tactique BOT-ARMEE (fusion trios, priorité garnison) — **périmètre INTERDIT de cette mission**. Constats pour la suite :
- seed 2121991107 : 176 combats, la capitale assiégée dès ~t60, jamais tombée en 90 tours ;
- les 3 victoires viennent de guerres DÉCLARÉES PAR LE BOT contre Jev (contre-attaque tactique gagnante, capture en ≤81 tours) — la mécanique de capture EXISTE et marche quand l'armée est rassemblée par le tactique ;
- 🔶 suite naturelle (décision Erik) : **T-B** (bots défendent) telle que prévue, ou un calibrage siège côté harnais (lever la marche → including fortifiées : les unités fortifiées exclues ? non — la marche les réveille déjà ; suspect : unités envoyées au siège une par une se font tuer en détail — le tactique re-absorbe les marcheurs dans les garnisons avant l'effectif d'armée).

## 6. Pièges consignés

- `computeVisibleTiles` vit sur les UNITÉS du moteur — une vision synthétique dans l'état de test ne rend PAS une ville ennemie visible (il faut la placer à portée d'une unité) ;
- `cheminVers` (BFS fondation) traite le fog comme intransitable — la marche exige son propre pas glouton (`cheminMarche`) ; le moteur gèle le chemin à la frontière du connu (R-161) ;
- le banc se lance via **tsx** (import TS `bancBotTd.js` → ERR_MODULE_NOT_FOUND sinon) ;
- les `motif` du journal mélangent ordres bot et ordres Jev (pas de source) — compter les MultiStep dans un motif ne prouve pas la marche de Jev.

## 7. Fin de session

Rapport livré, suites vertes, commit + push. À l'acceptation : T-B, puis T3 (canon).
