# REPORT-JEV-IT4-FIN-PARTIE — Jev voit les victoires, puis les vise

**Mission** (HANDOFF-JEV-IT4-FIN-PARTIE, 31/10) : au banc v4, Jev gagnait 1/10 par hasard — il ne VOYAIT pas la fin de partie (ni jalons, ni composants du vaisseau, ni merveilles de victoire, ni trésoreries). Itération 4 : un bloc `victoire` au condensé + trois questions de fin de partie, gate de bruit, **zéro changement moteur** (`schemaVersion` 28, client, Zii, bots classiques intacts). Méthode harnais-d'abord (`sableuse/`) puis port TS mécanique, tests croisés bit-à-bit.

## 1. Livré

**Harnais (`sableuse/src/condense.mjs`)** — **D1 · bloc `victoire`** du condensé, pur calcul depuis l'état FILTRÉ, zéro storage :
- `cibles` : jalons 20 (`CULTURE.milestonesTarget`), composants 4, or 20 000 (`WONDERS.banque_mondiale.treasuryRequired`) — lus des DONNÉES moteur, jamais codés en dur ;
- `mien` : jalons (mêmes compteurs que la gate ONU R-116), composants posés (dérivé des bâtiments des villes — R-124/R-66, miroir `SHIP_COMPONENTS` de turn.ts), merveilles de victoire (ONU `cultureVictory` / Banque mondiale `economicVictory`) en chantier (ville + tours restants estimés), merveilles déjà bâties ;
- `rivaux` : mêmes compteurs par rival VIVANT (éliminés exclus), trésorerie `tresorerieApprox` à la centaine, `merveillesBateesQui` (par qui) ;
- liste blanche respectée : JAMAIS de positions d'unités ni de plans adverses (test négatif v6).

**Harnais (`sableuse/src/joueur.mjs`)** — **D2/D3/D4 · trois questions gateées** :
- `finPartie` (gate D3 : jalons ≥ 10 chez quelqu'un, ≥ 2 composants, merveille de victoire en chantier, ou guerre contre moi) : `pousserCapitale:<id>` / `contrerCourse:<id>` (cibles pré-triées : leader en villes, leader de course) / `viserMaVictoire:domination` (voie principale) — les choix NON-domination ne sont PROPOSÉS que si la domination est bloquée (rapport de forces < 1 ou capitaux introuvables, D4) ; `continuer` efface le memo. Traduction : poussée militaire de la capitale vers le meilleur candidat DÉJÀ listé (`productionCapitale`), mode persisté au `memo.finPartie` ;
- `productionVictoire` : posée SEULEMENT après `viserMaVictoire` culture/science ; items de victoire réellement productibles (`canSetProduction`, kind wonder/building — ORDRES EXISTANTS, jamais de nouvel ordre moteur) ; culture/science oriente aussi la capitale en science (SetConversion existant) ;
- `protegerCapitale` : posée en guerre AVEC menaces (unités hostiles à rayon 5) ; `proteger` → ordres `Fortify` existants sur les unités de combat non fortifiées à rayon 2 de la capitale (max 4) ;
- partie calme pré-ère classique : AUCUNE des trois questions (gate testée) — le prompt de décision v4 est inchangé.

**Copie serveur** : `apps/server/src/jev/condense.ts`, `joueur.ts`, `questions-joueur.json` (v5, copie IDENTIQUE au harnais — test de copie vert) : port mécanique, comportement prouvé bit-à-bit par `tests-jev/jev-port.test.ts` (24 tests, dont 5 nouveaux IT4 : bloc neutre en partie calme, chiffres exacts en course, questions identiques harnais ⇄ serveur avec memo `finPartie`, décision domination ⇒ mêmes ordres et mêmes mémos, D3 calme ⇒ zéro question victoire).

**Tests FIRST** : `sableuse/tests/v6.test.mjs` (15 tests) — bloc neutre/chiffres exacts/éliminés exclus/liste blanche, gate D3, traductions (domination ⇒ SetProduction militaire listé ; science ⇒ SetConversion + productionVictoire au tour suivant ⇒ SetProduction ; continuer efface ; forme invalide ⇒ ignorée SANS panne, repli compté ; proteger ⇒ Fortify ciblés), déterminisme.

**Suites** : server **388**, jev-port **24**, rules **1101**, web **712**, svelte-check **0 erreur**, typecheck server vert, harnais **95/95**.

## 2. Banc final UNIQUE — `sableuse/bancs/joueur-it4-2026-10-31/`

10 parties 1v1, seeds corpus identiques à v3/v4, civs P7 du seed, plafond 150 tours. Coût réel **0,1566 $** (plafond mission 0,50 $ respecté). 0 erreur API, latence médiane 92 ms, 73/1012 tours repliés.

## 3. Comparaison v4/it4 (L3)

| Métrique | v4 (contact réel) | it4 (fin de partie visible) |
|---|---|---|
| **Victoires Jev (LE critère)** | 1/10 | **4/10** ✅ (≥ 3 requis) |
| Victoires ATTRIBUABLES (transcript `finPartie`) | — | **4/4** (toutes précédées du choix `viserMaVictoire:domination` maintenu toute la partie) |
| Guerres déclarées AVANT rencontre + délai | 0 | **0** ✅ |
| Guerres déclarées (ok moteur) | 26 | **4** ⚠ hors fourchette 20-35 (voir §5) |
| Rendement d'une guerre (victoires / déclarations) | 1/26 ≈ 4 % | **4/4 = 100 %** |
| Fondations Jev | 31 (3,0/partie) | 25 (2,5/partie) ✅ (≥ 2,5 requis) |
| Tours moyens | 141 | 101 |
| Coût total | 0,2316 $ | 0,1566 $ |

**Les 4 victoires** (bot à 0 villes en fin — capitales capturées, domination moteur) :
- seed 2896796234 (france vs russie) : guerre t11, `viserMaVictoire:domination` t11→t49, puis **`pousserCapitale:p2` t50** (rapport 1,75×, 14 forces vs 8) → victoire t51 ;
- seed 3802591813 (allemagne vs zoulous) : `viserMaVictoire:domination` de t11 à t78 (rapport final 5,2×, 26 vs 5 forces) → victoire t79 ;
- seed 2121991107 (rome vs arabie) et seed 3538506724 (angleterre vs russie) : même profil — `viserMaVictoire:domination` maintenu, capitale bot capturée en 53-55 tours.

**Transcript type** (seed 2896796234, t50, la décision qui a enclenché la fin) : `victoire.mien {jalons 4, composants 0}` / `rivaux [{russie, jalons 1}]` / `puissance {amie 14, ennemie 8, rapport 1,75}` / `guerreAvec [p2]` → **`pousserCapitale:p2`** → capitale russe capturée au tour suivant.

**Transcript « calme »** (seed 3947827986, t30 et t150) : aucune guerre, jalons 0-8 des deux côtés, pas de chantier → **gate D3 silencieuse, aucune question victoire posée** (Jev fonde 8 villes et domine le score, 1218 vs 100, mais ne déclarera pas — voir §5).

## 4. Critères d'acceptation

1. **Victoires ≥ 3/10 : 4/10, toutes attribuables** ✅ ;
2. Non-régression : guerres avant rencontre **0** ✅, fondations **2,5** ✅ (au raz), guerres totales **4 — HORS fourchette 20-35** ⚠ ;
3. Parties calmes : prompt inchangé (bloc neutre + zéro question victoire, prouvé harnais v6 + jev-port) ✅ ;
4. Suites toutes vertes, `schemaVersion` 28, budget 0,1566 $ ≤ 0,50 $, copie harnais réalignée (jev-port 24/24) ✅.

## 5. 🔶 Ouvert — verdict Erik

- **Les 4 guerres au lieu de 26** : le critère « fourchette 20-35 » n'est PAS atteint, mais la QUALITÉ des guerres a basculé — v4 déclarait 26 guerres pour 1 victoire (ping-pong paix/re-déclaration, 125 propositions de paix refusées en it4 aussi, or moyen offert 0) ; it4 déclare 4 guerres et les 4 gagnent (chacune = capture de capitale). Hypothèse : la question `finPartie` canalise l'intention — répondre `viserMaVictoire:domination` chaque tour « occupe » la décision d'agressivité, et la déclaration n'arrive que quand elle est gagnante. Deux profils restent stériles (seeds 3947827986, 4033602994, 786078703 : Jev écrase le score — 1218/100, 792/19, 1113/45 — et 76 forces vs 0-11 sans JAMAIS déclarer → pas de victoire en 151 tours). Levier suivant naturel : offrir la déclaration DANS la décision `finPartie` (mode domination = guerre au leader), ou T-B.
- **`tresorerieApprox` porte 0** : le fog moteur ZÉRIFIE la trésorerie adverse (R-134, `getFilteredState`) — le champ D1 reste en place mais l'approximation exige une diffusion moteur (hors périmètre D5). À l'œil Erik.
- `contrerCourse` et `productionVictoire` n'ont jamais été déclenchés au banc (personne n'approche des seuils en 151 tours contre des bots qui ne courent pas — c'est précisément T-B).

## 6. Commit & fin

- Commits : harnais (`sableuse/src/condense.mjs`, `joueur.mjs`, `questions-joueur.json` v5, `tests/v6.test.mjs`, `src/analyse-it4.mjs`) + port serveur (`apps/server/src/jev/*`, `tests-jev/jev-port.test.ts`) + rapport. L'artefact de banc `sableuse/bancs/joueur-it4-2026-10-31/` (plan, état, journaux JSONL, RAPPORT.md) reste LOCAL (convention `bancs/` gitignoré). Jamais de clés (`.env.local` hors git).
- Suites complètes rejouées AVANT push (règle d'entrelacement). Arrêt. Remise de la main — à l'acceptation du pilot : T-B (bots défendent leurs seuils), puis calibrage offensif post-T2, puis T3.
