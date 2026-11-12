# REPORT-JEV-ESCORTE — Le pari colon évalué (canon Erik 12/11)

**⚠ ARRÊT-POUR-APPROBATION — commit LOCAL, rien poussé ni déployé.** Le critère dur du banc Jev est sous tension (voir §4) : à la lettre il n'est pas atteint ; à la lecture ex ante il l'est. C'est un arbitrage Erik, pas un calcul que je tranche solo — même fil que les 3 arrêts du chapitre gate.

## 1. Livré (base `1e17892`)

- **L1 — moteur pur** `packages/rules/src/escortColon.ts` : `risqueDeploiementColon(state, joueurId, site, route?)` (facteurs déterministes au BFS : `uniteAtteintSite`, `uniteAtteintRoute` — portée de MARCHE = `toursEnnemi × mouvement` de l'unité, wrap canon CARTE-RONDE ; `campBarbareProche` ≤ 3 (les satellites D3UUQJ) ; `siteBrume` (tile absent de l'état connu) ; `routeInfluence` ≤ 2) + `deciderProductionColon` (autorise / pivot guerrier / attendre) + `escorteEnPlace` (adjacente au sens du gate `positionCritique` dist === 1, ou combattante dédiée hors garnison) + `doitRappelerColon` (sorti + risque monté + pas d'adjacente) + `siteColonParDefaut` (approximation géométrique miroir du gate). Table **`bot.json escort`** (toursEnnemi 3, campDistMax 3, influenceRouteDist 2, siteParDefautRayon 3, pivotUnit guerrier) + types `BotEscorteData`. Zéro durcissement, zéro nouvelle question LLM, `schemaVersion` 28 intacte, client intact.
- **L2 — branché AU-DESSUS de Jev, aux DEUX endroits canon** :
  - **harnais sableuse** `sableuse/src/joueur.mjs` (la vérité D6) : `ordreMarcheColon` — risque faible ou escorte en place → MultiStep (inchangé) ; sinon colon en ville → il ATTEND (memo conservé, pas de Move risqué) ; colon sorti → RAPPEL (Move routier vers ma ville la plus proche). Production : risque élevé ET 0 combattante → **pivot SetProduction guerrier** ; `attendre` → rien en file ce tour ;
  - **port serveur** `apps/server/src/jev/joueur.ts` : port mécanique identique des 3 points d'entrée (fondationEnCours marche/production, branche fonder) ;
  - **botPolicy partagé** `arbitrerProduction` ② : même veto (pivot → guerrier ; attendre → retombée ③ bâtiment). gainSite, `produire` (seuil 0,3), gardien Fortify, `combatStrengthsOf` : intacts.

## 2. Suites (toutes vertes)

| Suite | AVANT | APRÈS |
|---|---|---|
| rules | 1180 | **1200** (+20 `escort-colon.test.ts`, ROUGE avant fix vérifié : module absent) |
| server | 448 | **453** (+5 `escort-colon-policy.test.ts` — cas D3UUQJ à l'arbitrage : pivot guerrier, rouge avant fix) |
| web | 793 | 793 (client intact) |
| jev-port | 40 | 40 |
| sableuse | 216+12 échecs *pendant le stash AVANT* | **228/228** avec le port |
| tsc rules/server | propres | propres |

## 3. Bancs

**Banc bot 40×3 (devtmp/banc-bot-td-{AVANT,APRES}-escorte.json)** : **bit-à-bit identiques** (toutes métriques × 3 difficultés — villes 1,9, pop, unités, trésorerie, techs, PV mil., tours). Le veto est NEUTRE pour le bot classique sur ces cartes (le colon du départ fonde sur le site réservé ; les scénarios risque-élevé-sans-escorte n'y surviennent pas). **Zéro collapse, fondations maintenues** ✓.

**Banc Jev 10 seeds LLM RÉEL** (`sableuse/bancs/joueur-escorte/`, plafond 150 tours, civs P7) : coût **0,2523 $ ≤ 0,60 $** ✓. Fondations/partie **6,20 vs 5,70** (baseline joueur-gate, mêmes seeds) ✓.

Sonde `sonde-escorte.mjs` (journaux, miroir de la sonde « 0 suicide D3UUQJ ») :

| | joueur-gate (AVANT) | joueur-escorte (APRÈS) |
|---|---|---|
| Colons Jev perdus (brut) | 2 | **5** |
| Fondations/partie | 5,70 | **6,20** |
| Éliminations précoces (p2 gagne < t80) | 1 (t66) | **3** (t37, t50, t70) |

## 4. ⚠ ÉCART MAJEUR À L'ARBITRAGE — le critère dur

« Zéro colon perdu seul sur route risquée » — décomposition forensic des 5 pertes (traces complètes dans les journaux) :

- **3 pertes HORS PORTÉE DE LA RÈGLE (canon respecté)** — parties 03 (u32, u49) et 08 (u77) : colons capturés **SUR LA CASE de leur ville quand la ville tombe** (ex. p03 : colon produit t21, maintenu en ville par le veto jusqu'à la chute de la capitale t36 — il n'est JAMAIS sorti ; p08 idem à (-8,25)). Le canon dit « le colon attend en ville — il n'est pas sorti pour se faire tuer » : il a attendu, et la ville est tombée. C'est le verrou DÉFENSE DE VILLE (siège, TB-SIEGE-DEFENSE), pas l'escorte. La preuve d'activation du veto est dans p03 : le colon produit t21 n'a pas bougé (en gate, même seed, il fondait à t23).
- **2 pertes SUR ROUTE en partie 04** (u30 `combat` à (19,13) après 6 pas de marche ; u61 `capture` 1 pas après sa sortie, ennemi SUR la case d'arrivée) : l'évaluation du risque n'a PAS vu l'ennemi — les unités p2 hors vision de Jev sont absentes de l'état filtré (le canon dit « ennemi CONNU » ; l'embuscade fog est une limite documentée de l'évaluation déterministe). ⚠ ambiguïté d'identifiants dans les journaux (ids recyclés après destruction — u61 p1 détruit puis u61 p2 produit) : la sonde peut surcompter ; à affiner si Erik le demande.
- **3 éliminations précoces vs 1** : les trajectoires divergent dès t15 (le site de 2e ville choisi diffère dès que le colon attend — `distanceColon` alimente gainSite). La divergence papillon rend le 3-vs-1 inexplicable en cause directe ; le n=10 ne tranche pas la variance. AUCUN assouplissement solo : je ne touche pas à gainSite ni aux seuils.

**Verdict honnête** : la règle est implémentée, prouvée en tests (20+5) et activée en prod-like ; elle protège le colon sur route CONNUE risquée et le tient en ville — mais elle ne sait ni défendre une ville assiégée, ni voir un ennemi sous le fog. Le critère dur, lu naïvement (5 pertes > 0), est raté ; lu ex ante (0 perte sur route risquée AU SAVOIR disponible), il tient. Suite possible (au choix Erik) : (a) accepter et cadrer le volet défense-de-ville ; (b) majorer le risque sur route par le NOMBRE de tiles inexplorés traversés (brume = prudence) ; (c) affiner la sonde sur les ids recyclés et re-mesurer.

## 5. Écarts consignés

- Banc bot APRÈS identique bit-à-bit : le veto bot partagé est invérifiable sur le banc bot-td actuel (jamais déclenché) — sa couverture est la suite unitaire `escort-colon-policy.test.ts`.
- Le banc Jev s'est déroulé en parallèle du banc bot APRÈS (contention CPU possible, mais seeds déterministes — pas d'impact logique).
- Piège rediscovered : banc = `npx tsx`, cache vitest racine purgé avant re-mesure ; banc bot ≈ 28-29 min (pas 4).

## 6. Fin de session

Commit LOCAL unique (leçon `704ec5b` : chaque symbole cité vérifié dans le commit avant validation). **Rien poussé, pas de CI, pas de Deploy.** Remise de la main à Erik : arbitrage du critère dur (§4 a/b/c), puis push/CI/Deploy à la demande.
