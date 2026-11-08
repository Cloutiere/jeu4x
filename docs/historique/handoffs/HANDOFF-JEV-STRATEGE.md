# HANDOFF-JEV-STRATEGE — Jev stratège : choisir sa voie, croître, et prendre l'espace

**Statut : prêt — NON LANCÉ.** Cadrage voté par Erik le 01/11 (3 volets). Constat fondateur : le banc vanilla (`9b0172a`) montre Jev gagnant (3/4 parties finies) mais **passif** — partie 1 : 2 941 forces vs 284, 47 techs vs 3, **1 seule ville**, 600 tours de paix totale. Son expansion a régressé (3,0 villes/partie à l'it.3 → 1,6-1,9) et sa déclaration dépend d'un signal qu'il ne déclenche jamais. Trois volets : la stratégie (A), l'écrasement (B), l'expansion et la pression d'espace (C).

## 0. Préalables

1. `REPORT-BANC-VANILLA.md` (le constat) + `HANDOFF-JEV-DECISIONNEL.md` (D1-D5, `declarationMechanique`, cooldown 8) + `HANDOFF-JEV-IT4-FIN-PARTIE.md` (D1-D5, bloc `victoire`, `memo.finPartie`) ; R-147 (civ neutre du banc vanilla) ;
2. Code : `sableuse/src/joueur.mjs` (questions, `memo.finPartie`, `declarationMechanique`, `signalDominationMechanique`, `cibleGuerreTotale`), `condense.mjs` (bloc `victoire`, théâtre), copie serveur bit-à-bit `apps/server/src/jev/*`, `questions-joueur.json` (v8) ; le banc vanilla (`--vanilla --plafond 600`, mètre `analyse-vanilla.py`) ;
3. ⚠ Discipline : harnais d'abord, port TS bit-à-bit, tests FIRST, jev-port via config dédiée, banc via tsx, **banc réel UNIQUE ≤ 0,80 $ (5 parties vanilla longues — ~0,14 $/partie)**, sonde 402 avant de lancer, arrêt sur 402 réel. Piège connu : fondations = toutes villes (mètre) ; fog zérifie la trésorerie.
4. ⚠ Entrelacement : personne d'autre sur `sableuse/`, `apps/server/src/jev/`.

## 1. Les trois volets (votés — ne rien étendre)

- **D-A — Le choix de voie devient opportuniste** : `viserMaVictoire` est offert dès qu'UNE voie est favorable — seuils DATA dans `seuils.opportunite` (proposition : écart de techs ≥ 8 avec le leader → science ; rapport de forces ≥ 2 → domination ; jalons ≥ 12 ET en tête → culture ; trésorerie ≥ 10 000 → économique). Jev choisit UNE voie → `memo.finPartie = {mode:'viserMaVictoire', voie}` persisté ; révocable (une re-décision possible tous les `seuils.opportuniteCooldown` tours, défaut 15 — changement de cap, pas de zapping) ; hors opportunité, la question n'est pas posée (gate de bruit D3 de l'it.4 reste vraie pour les parties calmes JEUNES — l'opportunité s'évalue à partir d'un état développé). La voie science prolonge la traduction `productionVictoire` existante (composants + SetConversion) — rien de nouveau côté ordres.
- **D-B — La déclaration d'écrasement** : `declarationMechanique` s'élargit — déclencheur SUPPLÉMENTAIRE : rapport de forces ≥ `seuils.ecrasementRapport` (défaut 3) ET cible qualifiée (contact réel+délai OU aveugle voté) ET pas en guerre → `DeclareWar` mécanique, **sans exiger le signal domination ni d'écart de villes ni de mode `finPartie`** (le cas partie 1). Le cooldown 8 s'applique. Après déclaration, la chaîne existante (mode `pousserCapitale`, marche, siège) s'enclenche — `memo.finPartie` bascule comme aujourd'hui.
- **D-C — L'expansion comme moteur permanent** :
  - **C1 — Fondation parallèle** : Jev fonde tant qu'il existe des sites corrects à portée (réutilise les seuils de fondation existants — qualité de site, rayon), **sans que le mode de fin de partie l'empêche** : si `memo.finPartie` est en mode domination, la production militaire ET les colons avancent ensemble (le arbitrage existant des questions de production décide des proportions — vérifier qu'aucun chemin ne bloque les colons en mode guerre, sinon le consigner et corriger côté harnais).
  - **C2 — Pression d'espace** : nouveau signal au condensé `espaceSature` (booléen + données : nb de sites corrects restants dans le rayon de fondation) — allumé quand ≤ `seuils.sitesRestants` (défaut 1) sites corrects. **Déclaration opportuniste MÉCANIQUE** quand espaceSature ET cible qualifiée ET garnison/capitale faible (rapport ≥ 1 — récupérer une ville est plus facile que gagner une guerre totale) → même canal `DeclareWar` + cooldown ; **le choix de la cible reste LLM** (question opportuniste `conqueteEspace` proposant les cibles pré-qualifiées — ville la plus proche, garnison visible faible) — tranché voté : déclaration mécanique, cible LLM.
- **D-D — Intouchés** : bloc `victoire`, théâtre, marche, CANON-SIEGE, bataille complète, T3/Muraille, bots classiques, Zii, client, `schemaVersion` 28. `questions-joueur.json` → v9 (copie serveur réalignée, test de copie). Les questions existantes (`guerre`, `paix`, production) gardent leur forme — les nouvelles n'ajoutent que `conqueteEspace`.

## 2. Mission L0→L4

- **L0** : préalables, sonde crédits (402 ?), suites vertes (sableuse 165, jev-port 31).
- **L1 — Tests FIRST (harnais v9)** : D-A (opportunité par voie, seuils, cooldown de révision, gate calme inchangée en partie jeune) ; D-B (écrasement sans écart de villes — le cas partie 1 reconstitué en test : rapport 10, 1 ville, 0 guerre → déclaration) ; C1 (colons posés en mode domination — arbitrage non bloqué) ; C2 (signal espaceSature aux bons seuils, déclaration opportuniste, cible LLM pré-qualifiée, formes invalides ignorées) ; port TS bit-à-bit + tests croisés jev-port.
- **L2 — Condensé** : `espaceSature` exposé (et rien de plus — test négatif liste blanche : positions exactes/plan adverse toujours exclus).
- **L3 — Banc UNIQUE ≤ 0,80 $** : **5 parties vanilla longues** (`--vanilla --plafond 600`) — tableau vs BANC-VANILLA : **villes fondées/partie** (LE critère expansion : 1-2 → ≥ 4), **parties « paix totale au plafond »** (1 → 0), **victoires** (3/4 finies — non-régression) et leur **tour** (t473-499 → plus tôt si la stratégie accélère), déclarations attribuables (écrasement/espace/opportunité au transcript avec conditions), coût. Suites complètes, commit + push, rapport `REPORT-JEV-STRATEGE.md` (volets, tableau, transcripts des décisions de voie et des déclarations).

## 3. Critères d'acceptation

1. Expansion : ≥ 4 villes/partie en moyenne au banc vanilla long (vs 1-2) ; zéro partie « paix totale au plafond » ;
2. Victoires : Jev gagne encore les parties qu'il finissait (non-régression 3/4 finies) — idéalement plus vite ;
3. Chaque déclaration mécanique (écrasement/espace) attribuable au transcript avec conditions horodatées ; le choix de cible LLM visible ;
4. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,80 $ ; prod inchangée hors port serveur bit-à-bit.

## 4. Périmètre interdit

Moteur, bots classiques (le bot vanilla neutre ne change pas), Zii, client ; les questions existantes hors `finPartie`/`conqueteEspace` ; les seuils de fondation moteur (le C1 réutilise, ne durcit pas) ; pas de mini-rebanc hors verdict Erik en session ; jamais de secret ni de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : le banc dira si Jev est devenu un stratège complet (croître, choisir, conquérir) — la suite au ressenti d'Erik en jouant, puis miroir JvJ / atelier voix / vieux 🔶.
