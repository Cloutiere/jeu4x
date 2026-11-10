# HANDOFF-ORACLE-VERDICT — Chemin B : l'Oracle révèle VRAIMENT l'issue (RNG de combat dérivé par hash + verdict certain)

**Statut : prêt — NON LANCÉ.** Canon voté par Erik (09/11, Chemin B) : la définition de l'Oracle de Delphes enregistrée dans le data (« issue du combat révélée avant engagement ») exige une **certitude**, pas une probabilité. La réforme : les jets de combat **mêlée** ne viennent plus du flux de résolution mais d'un **dérivé déterministe par bataille** (hash de : graine du tour + attaquant + défenseur + cases), rendant l'issue **indépendante des autres ordres du tour** — donc calculable avant la résolution. L'Oracle étend ensuite sa révélation aux **mouvements planifiés** (la préview vivante existante) avec le verdict **VICTOIRE / DÉFAITE**, certain.

## 0. Préalables

1. `RULES.md` R-51 (bataille complète), R-176 rév. COHABITATION-HOSTILE (la mêlée de convergence utilise `performExchange` — elle change aussi), R-128 (obsolescence GLOBALE — l'Oracle meurt si QUI QUE CE SOIT découvre Religion : la gate UI existe, `UnitPanel.svelte` `oracleActive`) ; le data : `oracle_de_delphes` (`battleForeknowledge: true`, `wonders.json`) ;
2. Code : `packages/rules/src/turn.ts` (les appels de jets de combat : `combatRound` dans la Phase B, la mêlée Phase E cohabitation-hostile) ; `apps/web/src/components/UnitPanel.svelte` (la prévision probabiliste actuelle à REMPLACER par le verdict) ; le canal serveur : les messages WebSocket (`packages/shared/src/index.ts`) ;
3. ⚠ **LE COÛT, assumé et voté** : tous les résultats de combats changent (le flux RNG n'est plus consommé par les combats) → **recalage des verrous de tests de combat** (leurs issues attendues changent — travail mécanique, un par un, SANS assouplir les assertions), les bancs bot 40×3 se dé-calent légèrement (re-baseline AVANT/APRÈS, zéro collapse exigé). Les autres consommateurs du flux (fondations, tirages divers) restent inchangés dans leur logique — leur position dans le flux se décale, consigné.
4. ⚠ Discipline : tests FIRST, port TS bit-à-bit non applicable ici (le harnais consomme le même moteur de combat — les deux côtés changent ENSEMBLE, tests croisés jev-port re-verrouillés), banc via tsx, jev-port via config dédiée, sonde crédits, suites complètes avant push. Banc Jev : reporté au prochain banc naturel si le banc bot ne montre pas de drift (consigné).

## 1. Décisions de tranche (votées — ne rien étendre)

- **D1 — Le dérivé par bataille** : chaque bataille **mêlée** tire ses jets via `hash(graineDuTour, idAttaquant, idDefenseur, caseAttaquant, caseDefenseur)` (le helper exact au choix de l'agent — déterministe, seedé canon, jamais `Math.random`). Les tirs à distance (R-59 : 1 PV garanti, SANS jet) ne sont pas concernés. Les autres usages du RNG (fondations, tirages internes) restent sur le flux — consigné : leur valeur se décale d'un cheveu (les combats n'y puisent plus), re-cals des tests concernés.
- **D2 — La révélation, canal serveur** : nouveau message léger `PredictBattle { attaquant, cible }` → le serveur répond `{ verdict: 'victoire' | 'defaite' }` en exécutant le dérivé (fog filtré : cible INVISIBLE = refus propre, jamais d'info) ; cadencé (une prédiction par planning, pas de spam). Le CLIENT affiche le verdict dans la préview vivante (chemin vers un ennemi visible) ET au panneau d'attaque (cible adjacente) — **seulement si l'Oracle est actif** (`oracleActive` existant, obsolescence globale R-128 incluse). Verdicts canon : **« VICTOIRE »** / **« DÉFAITE »** (plus de pourcentages : l'Oracle ne se trompe pas, il parle du dérivé exact) ;
- **D3 — Le périmètre honnête de la révélation** : cibles VISIBLES et engages CE tour (attaque adjacente déclarée, destination de chemin avec ennemi visible). La convergence avec un ennemi qui ARRIVERA (inconnu) reste dans le brouillard — consigné, canon fog. L'Oracle reste un outil du joueur : Jev/bots ne le consultent jamais (aucune IA branchée — consigné).
- **D4 — Intouchés** : la formule de forces R-51 (p = S²/(S²+S²)) — seuls les JETS changent de source ; bataille complète (assauts jusqu'à mort), tirs R-59, soin/fortif, gainSite, Zii, `schemaVersion` 28 (aucune structure persistée).

## 2. Mission L0→L4

- **L0** : préalables, sonde crédits, suites vertes (rules 1138, server 436, web 785, jev-port 40).
- **L1 — Dérivé (tests FIRST, moteur)** : le hash déterministe (même entrées → même issue ; deux batailles différentes → issues indépendantes) ; l'issue calculée AVANT résolution == l'issue RÉELLE à la résolution (LE test canon : simuler la bataille, puis la résolution complète du tour, comparer bit à bit) ; les re-verrouillages des tests de combat (issues attendues changées une par une, assertions gardées strictes) ; tirs R-59 inchangés.
- **L2 — Révélation (tests FIRST, serveur + web)** : `PredictBattle` (fog : cible invisible refusée ; verdict exact ; cadence) ; l'UI : verdict affiché ssi Oracle actif, remplacé par rien sinon (les pourcentages actuels supprimés) ; re-cal des tests UnitPanel (consigné).
- **L3 — Bancs** : bot 40×3 AVANT/APRÈS (re-baseline — les dés changent ; zéro collapse exigé, villes/pop stables) ; banc Jev : reporté au prochain naturel si pas de drift (consigné). Suites complètes (rules, server, jev-port, sableuse, web, svelte-check, typechecks), commit + push, rapport `REPORT-ORACLE-VERDICT.md` (le dérivé, la preuve L1 avant==après, les re-verrouillages listés, les bancs).
- **L4 — Remise de la main** : Erik valide en jouant — il construit l'Oracle, planifie une attaque risquée, et l'Oracle lui dit la vérité AVANT qu'il confirme.

## 3. Critères d'acceptation

1. **La preuve L1** : l'issue calculée au planning == l'issue réelle, bit à bit, sur N seeds ;
2. En jouant avec l'Oracle : verdict VICTOIRE/DÉFAITE certain sur toute cible visible planifiée ; sans Oracle : aucune révélation ; cible invisible : rien ;
3. Bancs bot sans collapse ; suites toutes vertes ; `schemaVersion` 28 ; détermination re-jouable (même graine → même partie).

## 4. Périmètre interdit

La formule de forces et bataille complète (les JETS seulement) ; les tirs R-59 ; les autres merveilles ; le soin/fortification ; Zii ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : l'Oracle de Delphes tient enfin sa promesse de Delphes — il ne se trompe jamais, il parle juste du monde visible.
