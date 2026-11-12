# DIAG-DEFENSE-VILLE — Pourquoi les villes tombent (diagnostic, zéro code)

**Mission diagnostic exécutée le 12/11 — zéro modification de code, zéro partie nouvelle, zéro re-banc LLM.**
Matériel : journaux archivés `sableuse/bancs/joueur-escorte/journaux/` (10 parties JSONL) + baseline `sableuse/bancs/joueur-gate/journaux/` (mêmes seeds), reconstruction tour par tour par le script `devtmp/diag-defense-ville.mjs` (lecture seule, dérivé de la sonde JEV-ESCORTE), sortie brute dans `devtmp/diag-defense-ville-resultat.txt`. Baseline au moment du diagnostic : rules 1200 / server 453 / web 793 / jev-port 40 / sableuse 228, schemaVersion 28, Deploy `2094d10`.

---

## 0. Correction des données de cadrage (important)

Le handoff comptait « CityCaptured » ; les journaux contiennent AUSSI des **`CityRazed`** (ravage par les barbares), absents du compte initial. Vérité terrain sur le banc joueur-escorte (n=10) :

| Mode | Compte | Détail |
|---|---|---|
| Captures p1 → bot p2 | **7** | p03 c3 t26 + c1 t36 ; p04 c4 t51 + c1 t69 ; p05 c4 t40 + c1 t49 ; p10 c5 t120 + c8 t136 (p10 : 2 reprises p1 t123/t143) |
| **Razes p1 → barbares** | **6** | p05 c4 t48 ; p08 c3 t59 + c6 t59 ; p09 c6 t55 ; p10 c3 t27 + c5 t59 + c4 t66 |
| Éliminations précoces | **3** | p03 t37, p05 t50, p04 t70 — toutes par domination du bot p2 (baseline : 1, p05 t66) |

**« 3 colons morts avec leur ville » exact** : 4 des 6 razes ont un colon p1 SEUL sur la tuile au moment du ravage (p08 c3, p08 c6, p09 c6, p10 c5 t59 ; p10 c3 t27 et c4 t66 ont colon + 0-1 guerrier adjacent jamais rentré). Le cas p08 « (-8,25) » est c3 **rasée t59** (pas capturée), le colon u77 y est capturé-détruit plus tard sur la même tuile.

Le verrou DÉFENSE-DE-VILLE a donc **deux visages distincts** : (A) le **bot p2** qui assiège méthodiquement et capture ; (B) les **barbares** qui razzent les villes jeunes garnies d'un colon seul.

---

## 1. Chronologies (escort)

### p03 (seed2121991107) — élimination t37
- **c3 (10,8), fondée t15, CAPTUREE t26** → p2. Premier assaut t23 (u4+u17 guerriers p2). Garnison au tour de la chute : **1 guerrier u33 produit t25** (frais, non fortifié) + colon u18 dans la tuile. Menaces visibles dès **t22 (d=2)** soit 4 tours d'avance. Jev répond : Fortify u33 + SetProduction guerrier (t26) — mais l'assaut t26 tue le défenseur (canon : attaque = mort de l'un des deux) et u17 entre. Production guerrier t20 (u30) déjà morte au combat.
- **c1 (13,7), capitale, CAPTUREE t36** → p2. Production de la ville : colon t13, colon t21, guerrier t29 (u45), colon t34 — **Jev produit un colon t34 au milieu du siège**. t36 : ordre p1 = `Attack u45` (sortie offensive avec le seul défenseur) + SetProduction guerrier. u17 assaut, capture. u18 (colon escorté en attente) meurt sur place.
- élimination t37 (domination, p2 3 villes / p1 0).

### p04 (seed3802591813) — élimination t70 (baseline même seed : AUCUNE chute)
- **c4 (3,11), fondée t32, CAPTUREE t51** → p2. Siège t38→t51 (**13 tours d'avance visible**, menaces d=1-2 continuelles). Production c4 : 6 guerriers t35→t50 (1 / 3 tours). Chaque défenseur meurt au duel contre des assiégeants multiples (guerrier_impi p2 + barbare u53). t51 : Jev ordonne Fortify u60 + SetProduction guerrier — trop tard, la ville tombe le même tour.
- **c1 (2,9), capitale, CAPTUREE t69** → p2. Production pendant TOUTE la guerre (t18→t65) : **5 colons, zéro unité militaire**. t69 : garnison VIDE (0 combattant ≤ 2), 5 guerriers_impi p2 à d=1 ; Jev ordonne `GreatPersonAction settle` au lieu de défendre. u57 (d=3) est ordonné de s'éloigner. Menaces d=1 pendant 5 tours consécutifs avant la chute.
- élimination t70.

### p05 (seed214915776) — élimination t50 (baseline : chutes t59/t65, élimination t66)
- **c4 (8,8), fondée t34, CAPTUREE t40** → p2 (u30 guerrier_jaguar). Garnison : 1 guerrier_impi u54 produit t39 + colon. Assaut t40 : le duel tue le défenseur, capture. 5 unités p1 à d=3-4 n'interviennent pas.
- **c4 RAZEE t48** → barbares (sur la possession p2 !). Les barbares razzent indifféremment la ville tombée.
- **c1 (5,8), capitale, CAPTUREE t49** → p2. Garnison VIDE ; 6 unités p1 à d=3-4 (dont 3 guerriers_impi groupés en (9,7)) jamais rappelées ; 2 jaguars + 1 barbare entrent. Menaces d=0 affichées au condensé le tour même.

### p08 (seed2837671077) — pas d'élimination (p1 finit 5 villes, forces 241)
- **c3 (-8,25), fondée t20, RAZEE t59** → barbares. La ville a produit **7 guerriers t25→t55** — tous à d=1-2 (Hold/Fortify à côté) mais **aucun DANS la tuile** ; le barbare u58 entre à d=1 sans duel décisif et raze. Menaces d=2-3 visibles t55-58.
- **c6 (-5,30), fondée t57 (2 tours), RAZEE t59** → barbare u19 ; garnison = colon u67 seul sur la tuile.
- Le colon u77 meurt « capture » sur la tuile de c3 rasée (seq 675) — le « p08 idem (-8,25) » du handoff.

### p09 (seed4005827268)
- **c6 (-10,26), fondée t54 (1 tour), RAZEE t55** → 2 barbares. Garnison : colon seul + u53 à d=1 — que Jev ordonne de **MOVE AWAY** le tour même de la raze. La ville est fondée sur le trajet de barbares visibles (menaces d=4 dès t49).

### p10 (seed2896796234) — guerre longue, pas d'élimination (2 chutes reprises)
- **c3 (6,7), fondée t20, RAZEE t27** : garnison colon + guerrier u32 (produit t24) — Jev ordonne `MultiStep u32` HORS de la ville le tour de la raze.
- **c5 (-2,7), fondée t57 (2 tours), RAZEE t59** : colon seul sur la tuile ; guerriers p1 à d=8-15.
- **c4 (5,8), fondée t43, RAZEE t66** : garnison colon u54 (d=0) + guerrier u78 (produit t64, à d=1) ; barbare u22 entre et raze pendant que Jev lance 2 `GreatPersonAction settle` et une attaque ailleurs. Production c4 t46-64 : 7 guerriers, aucun n'est jamais DANS la ville.
- **c5 (7,9), fondée t97, CAPTUREE t120 puis REPRISE t123** ; **c8 (10,9), fondée t129, CAPTUREE t136 puis REPRISE t143** : siège massif (4-6 guerriers p2), garnisons présentes (légions+trébuchets) mais submergées ; à ce stade Jev est grand empire, la défense tient globablement (recaptures, plunder 133/151 pour p1).

### Baseline joueur-gate (mêmes seeds) — comparaison
- 9 captures (p02 ×2 avec reprise, p03 ×6 dont 2 reprises p1, p05 ×2) + **5 razes barbares identiques en nature** (p08 c6 t59/c5 t77/c6 t90, p09 c3 t59, p10 c5 t47) + 1 élimination (p05 t66).
- **Le verrou préexiste** : les razes barbares de villes jeunes existent déjà en baseline. Ce que l'escorte a changé : **p04 0 chute → 2 chutes + élimination**, p03 chutes t56-146 → t26/t36 + élimination t37, p05 élimination t66 → t50. Le veto escort (colon tenu en ville) a **aggravé** la défense sur ces 3 seeds, amélioré p02 (0 → aucune chute escort).

---

## 2. Réponses aux trois questions

### Q1 — Qui a pris les villes ?
**Deux belligérants, deux mécanismes.**
1. **Le bot p2 (civil déclaré, guerres via DeclareWar/contact)** : 7 captures p1, 3 éliminations. Toujours le même schéma TAS : rassemblement de 4-10 unités (FormArmy vu p04 t69, p10), premiers assauts concentrés, duels un-par-un contre des défenseurs produits au ralenti. Durées de siège visibles : 13 tours (p04 c4), 4 tours (p03 c3), ~10 tours (p10).
2. **Les barbares (satellites aggro)** : 6 razes, jamais de capture — ils **razent**, y compris les villes fraîchement prises par p2 (p05 c4 t48). 4 razes sur 6 contre des villes **âgées de 1-4 tours** fondées sur le trajet de barbares déjà visibles, garnison = colon seul sur la tuile (un colon ne défend pas : entrée = destruction + raze).
Éliminations précoces : 3/3 par le bot p2 (domination). Les barbares ne ont jamais éliminé p1.

### Q2 — Qu'est-ce qui défendait (et pourquoi ça n'a pas suffi) ?
- **Garnison « présente mais jamais dedans »** : dans 5 chutes sur 13, des combattants p1 étaient à d=1-2 de la ville au moment de la chute (p08 c3 : 4 guerriers à côté d'une ville rasée ; p10 c4 : guerrier frais à d=1) — jamais ordonnés d'ENTRER dans la tuile. Une ville sans défenseur sur sa tuile tombe à la première entrée ennemie, sans combat.
- **Le canon « attaque = mort de l'un des deux »** rend la défense passive perdante : 1 défenseur frais (force 1-2) meurt du duel contre le premier assiégeant, le suivant entre. Produire 1 guerrier / 3 tours (p04 c4) contre 4-10 assiégeants = érosion programmée.
- **Production défensive absente ou trop tardive** : p04 c1 = 5 colons / 0 militaires pendant 50 tours de guerre ; SetProduction guerrier ordonné le tour même de la chute (p03 t26, p04 t51) n'arrive jamais à maturité ; au t68 escort-p04 le condensé estime `unit:guerrier` à **10 tours** dans la capitale menacée à d=1.
- **Bonus ville 0,25 (T-02) et fortification 0,1** visibles dans les `CombatExchange` mais sans effet décisif en duel inégal.
- Les unités ailleurs sont parfois nombreuseS (p05 t49 : 6 unités à d=3-4 ; p08 c3 : 4 guerriers à d=1-2) — **jamais de rappel défensif** : l'arbitrage botPolicy/Jev (escorter, explorer, attendre en anneau) les tient ailleurs.

### Q3 — Qu'est-ce que Jev savait ?
- **La menace était visible à temps dans TOUS les cas** : le condensé porte des `menaces` 2 à 13 tours avant chaque chute (moyenne ~5 tours ; p04 c4 : 13 tours d'avance ; p05 c1 : « d=0 » affiché le tour même). Aucune chute-éclair hors visibilité.
- **Mais la menace n'est ni localisée ni chiffrée** : `menaces` ne donne que `distanceVilleLaPlusProche` + type — avec 4 villes (p04 t49), Jev ne peut PAS savoir laquelle est visée ; et `empire.villes` ne porte **aucune info de défense** (`def: null`). Jev ne peut pas savoir que ses 4 guerriers « à côté » ne défendent rien.
- **Pas de question défense dédiée** dans le schéma de choix (vérifié : aucune rubrique défensive ; seulement fondation/rechercher/production/attaque…). Les réponses Jev observées : Fortify + SetProduction guerrier (le bon réflexe, trop tard), parfois SetProduction **colon pendant le siège** (p03 t34, p04), et `GreatPersonAction settle` le tour de la chute (p04 t69, p05 t40, p10 ×5) — l'expansion prime systématiquement.
- **botPolicy (branche bot)** : p1 est piloté par Jev dans ce banc ; c'est le bot p2 qui exécute la tactique TB-SIEGE (rassemble → assauts). L'arbitrage qui éloigne les défenseurs est côté Jev/harnais : MultiStep hors ville (p10 t27, p09 t55), Attack sortie avec le dernier défenseur (p03 t36), anneau d'attente d=1-2 qui n'entre jamais (p08).

---

## 3. Leviers candidats pour le cadrage (PAS implémentés)

| # | Levier | Ce qu'il change | Ce qu'il coûte | Canon Erik supposé |
|---|---|---|---|---|
| L1 | **Garnison minimale dans la tuile** : toute ville doit compter ≥ 1 combattant à d=0 (seuil forces vs menaces visibles à cadrer) | Ferme le mode « entrée sans combat » (razes p08/p09/p10) ; transforme chaque assaut en duel de défenseur fourni | Unités immobilisées ; tension avec l'escort/exploration ; il faut définir « combattant » (colon exclus — leçon p08) | « Une ville sans défenseur intérieur est une ville perdue » ; canon attaque = mort de l'un des deux |
| L2 | **Rappel défensif automatique à menace visible** : menaces d≤N sur une ville → les unités p1 les plus proches reçoivent Move vers la tuile, priorité sur tout autre ordre | Convertit « 4 guerriers à côté » en défense effective (p08 c3, p05 c1) ; supprime l'arbitrage manuel qui laisse les anneaux d'attente hors ville | Interrompt exploration/escorte offensives ; risque de ping-pong si la menace s'éloigne (leçon OSCILLATION-MARCHE) | Canon « explorer, JAMAIS inactif » à recadrer : la défense d'une ville n'est pas de l'inactivité |
| L3 | **Veto production quand ville menacée sans défenseur** : SetProduction colon/bâtiment refusé (ou re-ordonné guerrier) sur ville avec menaces d≤2 et 0 combattant d=0 | Ferme « 5 colons pendant la guerre » (p04 c1) et « colon produit t34 pendant le siège » (p03) | Ralentit l'expansion (le banc escort compte les fondations) ; touche les candidats de production, donc le comportement Jev | « Survivre d'abord » ; cohérent avec le veto escort (un colon produit dans une ville qui va tomber meurt avec elle) |
| L4 | **Condensé : menaces localisées + défense par ville** : chaque `menace` porte sa ville cible et sa distance à CETTE ville ; chaque `ville` porte sa garnison (nb combattants d=0, forces) | Rend la menace actionnable (p04 : Jev ne peut pas choisir LA ville à défendre aujourd'hui) et le déficit visible | Condensé plus long (coût jetons Jev, déjà ~110 k/partie) | Transparence Jev ; sans info pas de décision (même leçon que la diag D3UUQJ) |
| L5 | **Question Jev dédiée « défense »** déclenchée quand menaces d≤2 : choix explicite (rappeler X / produire guerrier / tenir / abandonner la ville) | Force un arbitrage conscient au lieu du réflexe expansion ; chaque réponse est auditable dans le journal | +1 question par tour menacé (coût/appels) ; risque de bruit si seuil trop bas | Le pilot décide ; cohérent avec la mécanique de choix existante |
| L6 | **Hygiène de fondation** : interdire (ou pénaliser fortement au gate fondation) toute fondation à distance ≤ 2-3 d'un barbare visible | Supprime les razes « ville d'un tour » (p09 c6 t55, p10 c5 t59 : fondées sur le trajet d'un barbare vu depuis t49/t55) | Réduit les sites disponibles ; le gate valeurSite ne voit pas les barbares aujourd'hui (à vérifier au cadrage) | Un pari se fonde évalué — fondé sous les griffes, ce n'est pas un pari évalué |
| L7 | *(constat moteur, hors périmètre du pilot bot)* Une ville dont la tuile ne contient qu'un colon est prise/razée **sans aucun combat** — ni le condensé ni l'UI ne le signalent. À garder en tête si un jour le cadrage touche au moteur (ex. : raze interdite si unité non combattante seule, ou événement public `CityRazed` au snapshot — il est aujourd'hui absent des événements vus par le GUI, cf. MERVEILLE-EXCLUSIVITE). | — | — | N/A diagnostic |

Ordre suggéré pour le cadrage : L4 (info, prérequis de tout le reste) → L1+L2 (le mode barbare ferme avec deux leviers mécaniques) → L3/L5 (comportement Jev) → L6 (gate). Chaque levier est bancable sur les MÊMES seeds (journaux archivés re-jouables via le harnais, coût LLM ~0,03 $/partie ×10).

---

## 4. Statistiques honnêtes (n=10, n_baseline=10)

- Cas **confirmés** (chaîne causale complète depuis les journaux) : les 3 éliminations (p03/p05/p04), les 6 razes barbares escort, les 7 captures bot escort — tous avec chronologie tour par tour.
- **Pattern suggéré** (n trop petit pour trancher) : l'escorte aggrave la défense précoce sur 3/10 seeds et l'améliore sur 1/10 (p02) ; le reste est identique. La cause probable (colons accumulés + production expansionniste pendant les guerres) est cohérente mais non prouvée par contre-factuel.
- **Angles morts consignés** : les snapshots sont pris « à la décision » (avant résolution du tour) — la durée de siège de villes fondées sur une tuile déjà trafiquée (p10 c5 « depuis t19 ») est surestimée ; les ids d'unités recyclés sont gérés par cycles de vie (méthode sonde raffinée) ; les bonus de terrain de défense ne sont pas dans les journaux (seuls les mods de combat le sont).

## 5. Pièges rencontrés (pour la suite du pilot)

1. **`CityRazed` n'est pas `CityCaptured`** — tout compte de chutes doit couvrir les deux (7 razes escort, 5 baseline, toutes barbares ; 1 sur possession p2).
2. La trace du banc est complète (événements moteur non tronqués, contrairement à la trace prod admin) — aucune donnée manquante.
3. `empire.villes[].def` est null partout : le moteur n'envoie PAS de garnison au condensé (L4 part de ce constat, pas d'une hypothèse).
4. Les razes barbares existent en baseline : la DÉFENSE-DE-VILLE n'est pas un verrou introduit par JEV-ESCORTE — il est révélé par elle.

**Arrêt ici — remise de la main au pilot pour le cadrage DÉFENSE-DE-VILLE.**
