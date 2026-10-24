# REPORT-BOT-TB — Le bot « gère son empire » (décisions Erik 24/10)

Deuxième tranche du bot standard : les arbitres ÉCONOMIQUES remplacent le hasard. T-C (guerre/diplomatie) reste HORS PÉRIMÈTRE. Squelette stratégique du futur Jev-joueur.

## Livré

**Données (bot.json — D5)** : nouveau bloc `economie` (partagé 3 profils) + `objectifRecherche` par profil (facile/normal = « auto », difficile = « militaire ») :
- poids worked tiles : `poidsNourriture` 3 / `poidsMarteaux` 2 / `poidsOr` 2 (or seulement si trésorerie < `seuilTresorerieBasse` 40) ; `poidsMarteauxGuerre` 5 ;
- `marteauxMin` 1, `citoyensInterieurs` 0 (levier, voir Pièges) ;
- production : `seuilPopColonne` 4 (② « au plafond ou presque », opérationnalisé), `ordreBatiments` (grenier → bibliotheque → comptoir → caserne → marche → atelier → aqueduc → remparts → universite → banque → usine) ;
- rush D4 : `reserveRush` 1.3, `tresorerieMinimale` 30 ;
- recherche D3 : `techMilitaireCle` travail_du_fer, `techEconomiqueCle` monnaie.

**D1 — worked tiles pondérés** (`poidsVille` + `planWorkedTiles`, pures exportées) : score = Σ poids × rendement EFFECTIF par **miroir exact du moteur** (`tileYield` avec bâtiments, merveilles, union des techs `allKnownTechs`, traits civ + ère). Nourriture si la ville peut croître (`growthThresholdFor` non null), marteaux de guerre si guerre OU production militaire en tête, or si trésorerie basse. Émission : DÉSÉLECTIONS d'abord puis assignations dans la même file (la sémantique moteur « ville pleine » accepte la séquence) — zéro brassage si le plan est déjà optimal. **Garantie `marteauxMin`** : si le plan pondéré ne donne aucun marteau BRUT, les tuiles au score le plus faible sont échangées contre les meilleures productrices — sinon (tout-prairie 2N/0P) la file n'avance JAMAIS (R-60bis rév. 10/10 : les intérieurs ne produisent plus de marteaux directs).

**D2 — production arbitrée** (`arbitrerProduction`, remplace le tirage aléatoire) : ① guerre/menace barbare proche de la capitale → meilleure ATTAQUE disponible (tie coût, id) ; ② pop ≥ seuilPopColonne ou croissance bloquée → colon si aucun colon n'attend dans l'empire ; ③ premier bâtiment de l'ordre data manquant ; ④ merveille si l'empire est pionnier (aucune merveille, première par id, R-129) ; ⑤ repli = tirage parmi les options VALIDES (validateur `canSetProduction`, filtres R-112/R-117/R-137 conservés). ONU à 20 jalons (R-116) et composants du vaisseau (R-124) restent prioritaires.

**D3 — recherche orientée** (`prochaineTech`, remplace `pickResearch` aléatoire) : objectif par profil → fermeture transitive des prérequis manquants ; choix courant = tech de la fermeture disponible immédiatement (prérequis satisfaits) minimisant le coût de la sous-fermeture restante, tie id (R-81). « auto » = tech de l'ÈRE SUIVANTE à la fermeture la moins chère ; fin d'arbre → null.

**D4 — rush discipliné** (`rushPrioritaire`) : rush SEULEMENT si l'item est prioritaire D2 (unité de combat en guerre/menace, ou colon) ET trésorerie ≥ coût × `reserveRush` ET reste ≥ `tresorerieMinimale` (coût par `rushBuyCostOf`, toutes réductions 7n).

**D6 respecté** : aucun objectif d'unité T-A modifié (bot-ta/bot-exploration/bot-fondation verts).

## Vérifications

- **tests-first** `apps/server/tests/bot-tb.test.ts` : **29 verts** (données, poids, plan/tuiles, désélection-avant-assignation, marteauxMin, 5 situations de production, chaîne de recherche complète militaire/économique/auto, rush discipliné ×3, déterminisme, non-mutation de l'état).
- Suites : **rules 1101 / server 195 / web 700**, tsc 0 (server+rules), svelte-check 0 erreur. `schemaVersion` 28 intouchée (serveur seul).
- Un test T-A réécrit : « en paix, équilibre aléatoire » → « en paix, production arbitrée et DÉTERMINISTE » (contrat T-B remplace le tirage varié — comportement voulu D2).
- **Banc e2e GUI** `devtmp/bot-tb-gui.mjs` PASS (solo procédural + GOD-MODE, 14 tours, captures `dev-logs/captures-bot-tb/`) : capitale du bot (27,6), worked tiles suivant la pop (2→3), stonehenge en file AVANÇANT (+2 marteaux/tour, 26/50 en t14), croissance pop 2→3, trésorerie 0→15, recherche posée (travail_du_bronze). Trace par tour : `trace-tours.json` / `trace.md`.
- Banc carte-multi : 400 tours SANS victoire — structurel et préexistant (R-187 : les bots ne déclarent jamais la guerre = T-C, aucune domination possible entre 5 bots en paix) ; même famille que l'échec botSolo 300 tours, T-C recadrera. En revanche l'économie T-B y est démontrée en conditions réelles : Alice (bot) à 191 unités et trésorerie 6 637 à t400 (l'ancien bot restait inerte). Piège reproduit : wrangler zombie → « pas de carte connexe en 12 tentatives » à la génération (le harnais ne démarre PAS wrangler lui-même — le redémarrer avant).

## À juger en jouant par Erik (god mode)

1. **Calibre des poids** (3/2/2) : en début de partie le bot privilégie nettement la nourriture (croissance rapide, files lentes). Leviers data : `poidsMarteaux`, `marteauxMin` (1 → 2), `seuilTresorerieBasse`.
2. **`seuilPopColonne` 4** : opérationnalisation de « pop au plafond ou presque » (D2 ②) — la croissance n'est JAMAIS bloquée dans ce moteur (pas de plafond avant 31), donc un seuil data était nécessaire. Ajustable.
3. **Objectif « auto » du profil normal** : chemin le moins cher vers l'ère médiévale (religion était le moins cher sur l'arbre actuel). Vérifier que le bot ne « rayonne » pas au lieu de se développer.
4. Files visibles en god mode : bannières IA (GOD-MODE-PRODUCTION) montrent l'ETA — cohérence attendue avec la situation (guerre → unités).
5. 🔶 **Science lente** : le bot ne touche pas à SetConversion (défaut Or, R-90) — il peut mettre longtemps à finir une tech. Hors périmètre T-B (levier T-C/T-D ou règle bot dédiée).

## 🔶 Ouvert

- Le banc **botSolo 300 tours** (harnais BOT-TA) reste en échec PRÉEXISTANT (ne perce plus la défense post-BOT-EXPLORATION) — non « réparé » conformément au handoff ; T-C recadrera avec la guerre. Non relancé cette session (coût e2e) : aucune évolution attendue, l'économie n'ajoute pas d'unités.
- Chasse aux barbares/guerre : la production ① réagit à la menace (testé unitairement) mais l'agressivité reste T-C.
- `ordreBatiments` ne contient pas les bâtiments à remplacement (cathédrale, universite→remplace bibliotheque est géré par le filtre `replaces`) ni port/mine_de_fer (contextuels).

## Fichiers

- `packages/rules/src/data/bot.json` (bloc economie + objectifRecherche ×3), `packages/rules/src/types.ts` (BotEconomieData, BotProfileData.objectifRecherche)
- `apps/server/src/botPolicy.ts` (ecoDuBot, poidsVille, planWorkedTiles, rushPrioritaire, prochaineTech, arbitrerProduction ; botPolicy recâblé D1-D4 ; pickResearch/pickProduction supprimés)
- `apps/server/tests/bot-tb.test.ts` (29 verts), `apps/server/tests/bot-ta.test.ts` (1 test réécrit)
- `devtmp/bot-tb-gui.mjs` + `dev-logs/captures-bot-tb/`
