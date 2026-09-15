# REPORT-BARBARES-PILES — Le camp en pile (2 gardes + 1 explorateur), capture = butin de hutte seedé

**Chantier gameplay du chapitre 2D — spécification d'Erik du 15/09 (`HANDOFF-BARBARES-PILES.md`).**
Livré, testé (test-first), e2e solo avec captures. **Zéro 3D** (contrainte dure respectée — `render3d/` intouché, `poser3d` du GameCanvas est l'estampille 2D locale existante, non le poseur 3D).

## 1. M1 — Le camp en pile (moteur)

**Données (`barbares.json`, R-99)** : `gardeMinimale: 2` (T-49, était 1) ; `villageHP`, `villageDefense`, `villageDestructionGold` **SUPPRIMÉS** (types `BarbariansData`, `constants.ts` — `VILLAGE_HP`/`VILLAGE_DESTRUCTION_GOLD` retirés). `capPerVillage` 3, `spawnInterval` 10, `aggroRadius` 2, escalade 15 : inchangés.

**Pile sur la case du camp (R-96 rév.)** : les barbares d'un camp occupent **la case même du village** (1 à 3, régime spécial barbare). Dotation initiale T-50 et réengendrement T-18 posent désormais l'unité **sur le camp** (`barbares.ts` `spawnInitialGarrisons`, `turn.ts` `processVillages` — l'ancien spawn « case adjacente libre » est supprimé). Spawn stoppé à 3 vivants (cap inchangé), repris après mort (testé).

**Rôles (R-97 rév.)** : les **2 premiers barbares vivants** dans l'**ordre d'engendrement** (`spawnedUnits`, ordre des ids — R-81) sont des **gardes** : ils ne génèrent jamais de `Move` (Hold ou attaque défensive adjacente seulement). **Le dernier arrivé** est l'explorateur (aggro T-19 inchangée). Une pile de 1 ou 2 ne sort donc **personne**. *Ordre des rôles documenté : le plus ancien garde, le dernier arrivé sort.*

**Camps sans PV** : `BarbarianVillage.hp` supprimé de l'état ; **`schemaVersion` 23 → 24** (migration additive-inverse : retrait de `hp` de chaque village, idempotente). Un camp n'est plus une cible en soi.

**Attaque un par un** : entrer sur un camp défendu (et tout ordre `Attack` ciblant un barbare **sur la case de son camp**) est routé vers le plan `villageAttack` → `resolveVillageAttack` enchaîne les combats R-52 complets contre la pile (le plus ancien d'abord) **tant que l'attaquant est vivant** ; attaquant mort = séquence stoppée ; survie mutuelle contre une garde = repli R-54 (garde affaiblie, reprise au tour suivant) ; Overrun R-149 applicable par garde. Un camp **sans défenseur** est capturé à l'entrée, sans combat.

**Capture** : à la mort du **dernier** barbare, le vainqueur **occupe la case** (mêlée ; un attaquant à distance n'avance jamais — R-59-a, case laissée libre, interprétation documentée), le camp est **détruit** et le vainqueur reçoit la **récompense aléatoire des huttes** (`drawHutReward`, table pondérée `huttes.json`, tirée au RNG de résolution — même seed = même récompense, verrouillé par test). **`villageDestructionGold` supprimé** (ni or fixe ni `BootyGold` côté village). Événements journal : **`VillageDestroyed` + `VillageLooted`** (nouvel événement, porte la `reward` ; filtrage fog standard). Le kind `ambush` de la table est **sans effet** pour une capture de camp (engendrer des barbares sur un camp qu'on vient de purger n'a pas de sens — choix documenté).

**Escalation/aggro/spawn : inchangés.** Audit branches mortes : `villageExchange`, `resolveVillageAttack` « rounds R-51 contre le village », `repeatedVillageAttacks`, `PendingRetreat.villageId` (passe 3 anti-village), constantes `VILLAGE_HP`/`VILLAGE_DESTRUCTION_GOLD` — tous **supprimés**.

## 2. M2 — Le drapeau d'empilement (UI, `GameCanvas.svelte`)

Calque dédié **`stackFlagsLayer`** entre `overlayLayer` et `entitiesLayer` (au-dessus du terrain, **sous les unités**). **Générique** : toute case visible portant ≥ 2 unités (hors cargaison) affiche le drapeau — **rouge (couleur barbare)** si au moins un barbare, **accent du propriétaire** sinon ; compte **×N** en clair. Posé au **coin haut-gauche de l'hex** (au centre, les sprites d'unités et l'asset du camp le masquaient entièrement — calibrage itéré ; 🔶 affinage à l'œil par Erik). Lisible vue carte ; en vue ville les unités se cachent, le drapeau reste (même calque). 🔶 calibrage (taille/position) dans `buildStackFlagContainer` + l'appel `poser3d` du tick.

## 3. M3 — Vérification

- **Suites vertes** : rules **815/815**, server **75/75**, web **276/276** (total **1166** ; baseline 1162, +4 nets) ; **typecheck turbo 4/4** ; svelte-check 0 erreur.
- **Tests nouveaux/récrits** (`barbares.test.ts`, 54 tests) : pile 1-3 sur la case du camp ; gardes immobiles / seul le dernier arrivé sort (pile de 2 = personne ne sort) ; cap 3 / reprise après mort ; assaut un par un (Géant enchaîne b1→b2→b3 et capture ; attaquant faible meurt au 1er garde ; survie mutuelle = repli R-54) ; capture seedée (même seed = même récompense ; plus de `BootyGold`) ; camp vide capturé sans combat ; camps sans PV (données + état + cartes) ; migration 24 (chaîne + sweep des littéraux 23→24 dans les tests de migration existants).
- **e2e solo** (partie U56QDY, pilote `dev-logs/driver-barbares-piles.mjs`, wrangler+vite dev, Edge headless CDP) : camp monté à 3 au tour 20 (**drapeau ×3 rouge**, capture 01) ; l'explorateur sort au tour 21 et attaque (02) ; purge en combats successifs sur ~45 tours (**drapeau ×2**, 03) ; **capture au tour 69** : `VillageDestroyed` + `VillageLooted {gold, 39}` (crédité au trésor), vainqueur sur la case, drapeau disparu (05 + `village-looted.json`, `verifications.json`). Journal en jeu : « Camp barbare v6 détruit par ErikMR ! » / « Camp v6 capturé par ErikMR : +39 or ».
- **Zéro diff 3D** ; huttes, aggro, escalation, combats R-52 normaux : intouchés.

## 4. Notes / révisions RULES.md

R-96, R-97, R-99 et la table T-18..T-26 révisées (pile, rôles, camps sans PV, capture-butin). Points 🔶 laissés à l'œil d'Erik : taille/position du drapeau (actuellement coin haut-gauche, petit fanion + ×N) ; le garde **archer** (escalé) qui ne vainc pas en défense cède sa case (R-59-d) puis revient tenir son rôle — comportement conforme aux règles de repli, signalé pour info.

## 5. Hors périmètre observé (non touché, non commité)

`git status` au démarrage contenait déjà des travaux Erik non commités (fonderie/Napoléon : `image_ref/`, `fonderie/captures/`, `assets-src/tools/generate.py`, `apps/web/src/lib/atelier/catalogue.ts`, scripts-tmp-*.py…) — **préservés tels quels**. Rien n'est committé : **validation locale avec captures d'abord** (règle établie), commit/push sur demande explicite. Serveurs dev (wrangler 8787, vite 5174) lancés pour l'e2e puis **arrêtés**.
