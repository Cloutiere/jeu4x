# REPORT-T3-ONU — la Grande Muraille impose la paix (+ fiches victoires à jour)

**Mission** : HANDOFF-T3-ONU (décisions Erik 31/10 — D1 VETOÉ, D2 VALIDÉE complète, Banque mondiale 20 000 CONFIRMÉE).

## 1. La règle livrée (D2)

**Grande Muraille « impose la paix »** tant qu'elle est debout (jusqu'à `obsoleteBy: ingenierie`, obsolescence GLOBALE R-128 — union des techs) :

- **(a) Refus de déclaration** : `applyDeclareWar` (packages/rules/src/diplomatie.ts) retourne `{ ok:false, reason:'grande_muraille' }` contre le propriétaire — nouveau helper `grandeMurailleImposantLaPaix` (packages/rules/src/culture.ts, miroir exact de `wonderBlocksEnemyAttacks` restée INTACTE). La gate d'ATTAQUE existante est inchangée (les deux effets cohabitent).
- **(b) Paix rétroactive** : à l'achèvement (`completeWonder`, packages/rules/src/turn.ts), chaque paire de guerre contenant le propriétaire est purgée — purge MIROIR de `applyProposePeace` (`war`, `warsDepuis`, `batailles`, `distancesCible` ; `dernieresGuerres` posée ; `dernieresCibles` conservée) — événement PUBLIC `PeaceAccepted motif:'grande_muraille'` (`from` = propriétaire, `on` = l'autre belligérant). `PeaceAccepted` était déjà dans `PUBLIC_EVENTS` (R-73) — champ `motif?: 'grande_muraille'` ajouté dans events.ts (données d'événement, PAS d'état persisté : schemaVersion 28 inchangée, zéro bump nécessaire).
- **(c) Barbares** : jamais dans `diplomacy.war` — non concernés ; la gate `blocksEnemyAttacks` reste telle quelle pour eux.
- **(d) Obsolescence** : Ingénierie dans l'union → (a) et (b) disparaissent (testé aux deux endroits).
- **Le propriétaire déclare normalement** (la protection protège, elle ne ferme pas).

## 2. Intouchés (veto D1 + confirmation 20 000)

- **R-116** : jalons 20 + victoire ONU immédiate TELS QUELS (test de non-régression : Muraille achevée à 19 jalons → 20 jalons, AUCUNE `Victory`) ;
- **R-137** : Banque mondiale 20 000 — zéro ligne de code touchée ;
- science, domination, élimination/forfait, barbares razed, Angkor/anti-rush, course ONU B1 (botPolicy), chaîne conquête Jev (questions v8, déclaration mécanique) — INTACTES ;
- `schemaVersion` 28.

## 3. Condensé Jev (L1bis)

`victoire.muraille: { civ, estMoi } | null` ajouté au bloc victoire (sableuse/src/condense.mjs, port bit-à-bit apps/server/src/jev/condense.ts) — le propriétaire d'une Muraille debout est visible de Jev (déclaration refusée contre lui, paix rétroactive à son achèvement). Obsolescence via l'union des `techsUnlocked` de l'état filtré (R-128). Tests croisés jev-port : blocs identiques bit à bit (31 verts).

## 4. Tests (FIRST)

- **Nouveau** : packages/rules/tests/grande-muraille-paix.test.ts — 15 tests (rouges 6/15 avant implémentation) : refus (a) + asymétrie propriétaire, union Ingénierie (a et d), paix rétroactive (paires purgées, événement public lu par les trois camps, deux guerres simultanées), tiers (p2-p3 intacts), Muraille obsolète à l'achèvement (aucune paix), autre merveille (rien), paix canon sans motif, gate d'attaque intacte, barbares, ONU/Banque non-régression ;
- sableuse/tests/v6.test.mjs : 2 tests muraille (17 verts) ; apps/server/tests-jev/jev-port.test.ts : 1 test muraille bit-à-bit (31 verts).

## 5. Suites AVANT push

rules **1129/1129** · server **401/401** (1 échec flaky au premier run — lobby e2e — revir au re-run, inchangé) · sableuse **156** · jev-port **31** · web **712** · svelte-check **0 erreur** · typechecks rules+server verts.

## 6. Bancs

### Bancs bot 40×3 avant/après (devtmp/banc-bot-td-{AVANT,APRES}-t3.json, même corpus)

| Difficulté | Villes AVANT→APRÈS | Tours AVANT→APRÈS |
|---|---|---|
| facile | 1,9 → 1,9 | 137 → 137 |
| normal | 1,9 → 1,9 | 137 → 137 |
| difficile | 1,8 → 1,8 | 125 → 125 |

**Agrégats IDENTIQUES bit à bit** — zéro drift bot : les guerres bot-vs-bot restent décisionnellement rares et aucune Grande Muraille n'a imposé de paix dans le corpus (zéro soft-lock confirmé : la purge miroir ne peut pas bloquer une re-déclaration — `dernieresCibles` conservée).

### Banc Jev 20 seeds (bancs/joueur-t3-onu-2026-10-31 — corpus élargi D5)

10→20 parties (`--n-parties 20` ajouté au banc), mètre `analyse-tbsiege.py` (devtmp/t3-meter.jsonl) :

- **20 parties, 0,4592 $ ≤ 0,60 $** ✓, replis 0 ;
- **victoires Jev 3/20** (t118, t71, t98 — toutes par domination/élimination) ;
- percée 6/20 = 30 % 🔶 ; captures de capitales 2 ; stériles sans déclaration 10/20 ;
- 0 guerre avant rencontre ✓ ; fondations Jev 1,9 ;
- parties finies : 4/20, TOUTES par domination — **aucune par ONU/Muraille/Banque** (les deux voies merveilles restent hors portée des bots et de Jev en 150 tours) ;
- ⚠ **9 erreurs 402** (crédits TypeSafe épuisés, parties 19-20 → repli v1 partiel) — cause EXTERNE (billing), pas du code ; les parties 19-20 ont quand même fini, leurs mètres sont légèrement dégradés (aucune n'a gagné).

## 7. Verdict variance (L4 — D5)

**La variance est TRANCHÉE : 3/20 victoires Jev (15 %)** — la fourchette des bancs de 10 parties (1-3 victoires, soit 10-30 %) se confirme sur le corpus élargi ; la cible Erik de 4/10 (40 %) n'est PAS atteinte sur 20 seeds indépendants. La conquête fonctionne quand elle a lieu (les 3 victoires = captures de capitales, percée 30 %) mais 10/20 parties restent sans UNE déclaration — le verrou décisionnel identifié à JEV-DECISIONNEL (le mètre « stériles » est structurellement aveugle : 9/10 des guerres viennent du bot classique p2) n'est pas levé par la Muraille. **La Grande Muraille n'a imposé AUCUNE paix ni refusé AUCUNE déclaration dans les 20 parties** (aucune complétion de la Muraille au banc) — la règle est prouvée aux tests unitaires, son effet au banc est neutre (comportement attendu : merveille de 150 marteaux rarement achevée en 150 tours bot).
