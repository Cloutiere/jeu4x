# REPORT-JEV-STRATEGE — Jev stratège : choisir sa voie, croître, et prendre l'espace

**Livré (commit de ce push).** Les trois volets votés par Erik le 01/11 sont implémentés, testés FIRST, portés bit-à-bit côté serveur, et bancés en vanilla long (4 parties finies, 0,7041 $ ≤ 0,80 $). Verdict chiffré, deux découvertes de banc, un correctif post-banc prouvé en tests (pas de re-banc — §4 interdit sans verdict Erik).

## 1. Les volets livrés

- **D-A — voie opportuniste** (`opportunitesVoies`, joueur.mjs) : seuils DATA `seuils.opportunite` — science (écart ≥ 8 techs avec le leader), domination (rapport ≥ 2), culture (jalons ≥ 12 ET en tête), économique (or ≥ 10 000). La question `finPartie` s'ouvre sur UNE voie favorable même SANS signal (gate de bruit D3 inchangée pour les parties calmes JEUNES — verrou v9). Révision cadencée `opportuniteCooldown` 15 (`memo.decisionVoieTour`) ; choix persisté `memo.finPartie = {mode: voie}` (productionVictoire/marche inchangés) ; critères opportunistes ADDITIFS avec données.
- **D-B — écrasement** (`declarationMechanique` élargie) : rapport ≥ `seuils.ecrasementRapport` 3 ⇒ `DeclareWar` mécanique SANS signal domination, NI écart de villes, NI mode — snapshot `{cible, tour, rapport, aveugle, motif:'ecrasement'}` au journal ; cooldown 8 partagé ; la chaîne v8 (motif 'domination') est bit-à-bit inchangée (verrous re-calés consignés).
- **C1 — fondation parallèle** : garde harnais — en mode guerre, la production du colon (fondation programmée, colon absent, ré-émission D2) PRIME sur la poussée militaire (le dernier SetProduction gagne côté moteur) ; prouvé par tests (le colon sort, aucun militaire ne le suit dans le tour).
- **C2 — pression d'espace** : bloc `condense.espace = {sature, sitesCorrects}` (liste blanche STRICTE, test négatif : aucune coordonnée, aucune ville adverse nominative) ; `declarationEspace` (mécanique : sature + rapport ≥ `conqueteRapportMin` 1 + cible qualifiée + cooldown) et question `conqueteEspace` SANS 'aucun' — déclaration mécanique, cible LLM (`ciblesConqueteEspace` : villes visibles, garnison visible la plus faible d'abord, ≤ 3), formes invalides ignorées. questions-joueur.json → **v9** (+ copie serveur identique, test de copie vert).
- **Journal** : `partie.mjs` journalise `motif` + conditions (guerreMecanique OU guerreEspace) sur chaque déclaration mécanique — attribution transcript (critère 3). La question et la réponse LLM restent dans l'entrée `decision`.

## 2. Banc UNIQUE — `bancs/joueur-stratege-2026-11-01` (vanilla, plafond 600, 5 parties)

| # | seed | fin | raison | tour | villes Jev | fondations Jev | decl. Jev | coût |
|---|------|-----|--------|------|-----------|----------------|-----------|------|
| 1 | 3538506724 | indécise au plafond | — | 601 | 1 | 1 | 0 | 0,2177 $ |
| 2 | 3947827986 | **victoire SCIENCE** | science | 558 | 2 | 2 | 0 | 0,2700 $ |
| 3 | 2121991107 | **victoire DOMINATION** | domination | 121 | 3 | 2 | 0 | 0,0207 $ |
| 4 | 3802591813 | **victoire SCIENCE** | science | 425 | 3 | 3 | 0 | 0,1957 $ |
| 5 | — | COUPE BUDGET (0,80 $ atteint) | — | — | — | — | — | — |

**Coût total 0,7041 $ ≤ 0,80 $ ; 0 erreur API.**

### Verdict vs critères d'acceptation

1. **Expansion (≥ 4 villes/partie)** : ✗ — 2,0 villes/partie (vs 1,2 au banc vanilla — progrès, pas la cible). **Découverte de banc (i)** : le verrou n'est PAS le harnais — `sitesCorrects` tombe à 0-1 dès ~t100 sur ces seeds : la fenêtre `gainNet > 0` (formule data `configCondense.gainSite`, pénalité distance 2/case + risque) se referme tôt, la question `fonder` n'a plus de critères. C'est la formule DATA du condensé qui décide (§4 : seuils de fondation intouchables) — levier Erik = calibrer `gainSite` (partCouronne/penaliteDistance), PAS la logique.
2. **Non-régression victoires (3/4 finies)** : ✓ 3/4, et **plus vite** — science t425 (vs t473) et t558 (vs t499) ; la domination tombe t121 (au banc vanilla, le bot déclarait t10 et Jev contre-attaquait t59 ; ici la même seed 2121991107 finit par une campagne complète, capture de capitale incluse). Partie 1 : toujours indécise au plafond (2926 vs 284 forces, 47 vs 3 techs) — **Découverte de banc (ii)** ci-dessous.
3. **Déclarations mécaniques attribuables** : 0 déclaration au banc (voir (ii)) — le canal est prouvé en jeu réel par les tests + fumée ; après correctif, voir §3.
4. Suites : sableuse **198** verts (165 + 33 v9) ; jev-port **35** verts (31 + 4 croisés v9 bit-à-bit) ; rules 1129 ; server 401 (1 flocon `chat-socle D2` « tour 15 jamais résolu » — re-vert 12/12 isolé, piège connu workerd) ; typechecks rules+server verts ; schemaVersion 28 inchangée.

## 3. Découverte de banc (ii) — la qualification de cible fermait le cas partie 1 — CORRIGÉ

Diagnostic de la partie 1 : à t60, p2 est **rencontré** (unités croisées t41, rencontreTour 41) mais sa **capitale n'est jamais vue** (distanceCapitale 99). `cibleGuerreTotale` (v8, INTACTE) rejetait la cible des deux branches : l'aveugle exige `rencontreTour == null`, la non-aveugle exige la capitale vue → rapport 10× et 600 tours de paix totale. **C'est le cas exact que D-B devait lever.**

Correctif (D-B bis) : `cibleEcrasement` — qualification au sens EXACT du handoff (« contact réel + délai OU aveugle voté »), sur-ensemble de la v8 : capitale VUE, OU rencontré depuis ≥ `delaiGuerreApresRencontre` (jamais de guerre dans le brouillard total), OU jamais rencontré (aveugle voté). Utilisée par la SEULE branche écrasement ; la chaîne domination garde `cibleGuerreTotale`. Tests FIRST : cas partie 1 reconstitué (rencontré t20 + rapport ≥ 3 + capitale inconnue ⇒ déclaration `motif:'ecrasement'`), délai non écoulé ⇒ rien, helper pur. Port TS bit-à-bit (jev-port 35 verts), typecheck vert. **Pas de re-banc** (§4 : interdit sans verdict Erik) — le banc dira au prochain passage si la partie 1 finit.

C2 au banc : `espaceSature` s'allume correctement (partie 1 : saturé dès t100, sites 0) mais la conquête d'espace n'a jamais pu tirer — sous le fog, `ciblesConqueteEspace` n'expose que des villes VUES (partie 1 : capitale p2 jamais vue → 0 cibles). Cohérent avec la privacité canon ; l'ouverture éventuelle (cible par DIRECTION du théâtre) serait un amendement Erik.

## 4. Ce qui reste au verrou (pour le prochain cadrage)

1. **La fenêtre d'expansion** : calibrage data `configCondense.gainSite` (ou un plan de banc dédié) — c'est LE levier du critère « ≥ 4 villes/partie ».
2. **L'écrasement en condition réelle** : un banc de confirmation (même protocole, ≤ 0,80 $) montrera les déclarations `motif:'ecrasement'` au transcript — canal + attribution déjà verrouillés par tests.
3. 🔶 La conquête d'espace sous fog (cible par direction théâtre) et le ZAPPING de voie (viserMaVictoire:domination répété chaque tour en partie 1 — le choix tient, mais le LLM re-confirme chaque tour ; coût de jetons non mesuré au budget).

## 5. Fichiers

- Harnais : `sableuse/src/joueur.mjs` (D-A, D-B, D-B bis, C1, C2), `sableuse/src/condense.mjs` (rien — bloc espace dans joueur.mjs), `sableuse/src/partie.mjs` (journal motif+conditions), `sableuse/questions-joueur.json` v9, tests `tests/v9.test.mjs` (33), re-cals `v6/v6b/v6c/v8` (verrous D-A/D-B re-calés, commentés).
- Port : `apps/server/src/jev/joueur.ts` + `questions-joueur.json` (copie identique), tests croisés `tests-jev/jev-port.test.ts` (4 nouveaux).
- Banc : `bancs/joueur-stratege-2026-11-01/` (plan, journaux, RAPPORT.md, etat.json).
