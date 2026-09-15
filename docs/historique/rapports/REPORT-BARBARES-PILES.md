# REPORT-BARBARES-PILES — Le camp en pile (2 gardes + 1 explorateur), capture = butin de hutte seedé

**Chantier gameplay du chapitre 2D — spécification d'Erik du 15/09 (`HANDOFF-BARBARES-PILES.md`).**
Livré, testé (test-first), e2e solo avec captures. **Zéro 3D** (contrainte dure respectée — `render3d/` intouché ; le drapeau d'empilement est un calque 2D qui *utilise* l'estampille `poser3d` existante du GameCanvas sans la modifier).

> **⚠ Reprise de session** — une séance antérieure avait livré une version de ce chantier (rapport + captures GUI, jeu `U56QDY`) **sans committer** : les modifications « données » étaient restées dans le workspace, mais **les sources moteur (`barbares.ts`, `turn.ts`, `state.ts`, `events.ts`) avaient été perdues** (workspace revenu à l'état commité, `schemaVersion` 23, `villageExchange` encore présent). Le moteur a donc été **réécrit intégralement et revalidé** dans la présente session ; les captures de l'ancienne séance sont conservées sous le préfixe `seance-precedente-*` (ilustrations complémentaires), les captures 01–03 viennent du code livré ici.

## 1. M1 — Le camp en pile (moteur, test-first)

**Données (`barbares.json`, R-99)** : `gardeMinimale: 2` (T-49, était 1) ; `villageHP`, `villageDefense`, `villageDestructionGold` **SUPPRIMÉS** (types `BarbariansData`, `constants.ts` — `VILLAGE_HP`/`VILLAGE_DESTRUCTION_GOLD` retirés). `capPerVillage` 3, `spawnInterval` 10, `aggroRadius` 2, escalade 15 : inchangés.

**Pile sur la case du camp (R-96 rév.)** : les barbares d'un camp occupent **la case même du village** (1 à 3, régime spécial barbare — R-30 amendée, aucune autre unité ne s'empile). Dotation initiale T-50 et réengendrement T-18 posent l'unité **sur le camp** (`barbares.ts` `spawnInitialGarrisons`, `turn.ts` `processVillages` — l'ancien spawn « case adjacente libre » est supprimé). Spawn stoppé à 3 vivants, repris après mort (testé).

**Rôles (R-97 rév.)** : les **2 premiers barbares vivants** dans l'**ordre d'engendrement** (`spawnedUnits`, ordre des ids — R-81) sont des **gardes** : ils ne génèrent jamais de `Move` (Hold ou attaque défensive adjacente seulement). **Le dernier arrivé** est l'explorateur (aggro T-19 inchangée). Une pile de 1 ou 2 ne sort donc **personne** ; si un barbare extérieur meurt, le spawn suivant remplit jusqu'à 3 et devient explorateur — l'ordre des rôles reste déterministe. *Ordre des rôles documenté : le plus ancien garde, le dernier arrivé sort.*

**Camps sans PV** : `BarbarianVillage.hp` supprimé de l'état ; **`schemaVersion` 23 → 24** (migration : retrait de `hp` de chaque village, idempotente — **signalé AVANT** conformément au handoff). Un camp n'est plus une cible en soi.

**Attaque un par un** : entrer sur un camp défendu (Phase A, hutte/artefact de la case traités comme avant) planifie un assaut qui **enchaîne les combats R-52 complets** (`resolveAttack` : Overrun R-149, R-59 distance, R-32 vétéran, soin Aztèque, T-31 — tous applicables) contre la pile **triée R-81 (le plus ancien en premier)** **tant que l'attaquant est vivant** ; barbare tué → le suivant encaisse ; **attaquant mort = séquence stoppée** ; **survie mutuelle contre une garde = repli R-54** (passe 1 standard ; sans case de repli → reprise R-55 par le chemin unité existant). Un camp **sans défenseur** est capturé à l'entrée, sans combat.

**Capture** : à la mort du **dernier** barbare (`captureCamp`), le vainqueur **occupe la case** (déjà entré en Phase A ; un attaquant à distance n'avance jamais — R-59-a), le camp est **détruit** et le vainqueur reçoit la **récompense aléatoire des huttes** (`drawHutReward`, table pondérée `huttes.json`, tirée au **RNG de résolution** — même seed = même récompense, verrouillé par test ; même philosophie que hutte/artefacts). Application miroir R-98 (`applyCampReward`) : or (×Espagnol), unité gratuite (adjacente libre), science, révélation, indice d'artefact ; le kind `ambush` (poids 0) est **sans effet** pour une capture de camp — engendrer des barbares sur un camp qu'on vient de purger n'a pas de sens (choix documenté). **`villageDestructionGold` supprimé** (ni or fixe ni `BootyGold` côté village). Événements journal : **`VillageDestroyed` + `VillageLooted`** (nouvel événement, porte la `reward` ; filtrage fog standard). Vétérane R-32 + T-31 sur le coup fatal.

**Escalation/aggro/spawn : inchangés.** Audit branches mortes : `villageExchange`, `destroyVillage` (or fixe), `repeatedVillageAttacks`, `PendingRetreat.villageId` (passe 3 anti-village), `sourceVillageId` de `BootyGold`, constantes `VILLAGE_HP`/`VILLAGE_DESTRUCTION_GOLD` — tous **supprimés**.

## 2. M2 — Le drapeau d'empilement (UI, `GameCanvas.svelte`)

Calque dédié **`stackFlagsLayer`** entre `overlayLayer` et `entitiesLayer` (au-dessus du terrain, **sous les unités**). **Générique** : toute case visible portant ≥ 2 unités (hors unités embarquées) affiche le drapeau — **rouge (couleur barbare)** si au moins un barbare est présent, **accent du propriétaire** sinon (mécanisme prêt pour tout empilement futur) ; compte **×N** en clair sous le fanion. Posé **au centre de l'hex**, légèrement à gauche du fanion pour ne pas masquer l'asset du camp 🔶 (calibrage à l'œil par Erik — `buildStackFlagContainer`). Lisible **vue carte ET vue ville** (le calque n'est pas masqué par la vue ville, contrairement aux sprites d'unités — la pile reste lisible). **Zéro 3D**.

## 3. M3 — Vérification

- **Suites vertes** : rules **816/816**, server **75/75**, web **276/276** (total **1167**) ; **typecheck turbo 4/4** (svelte-check 0 erreur, 11 warnings préexistants).
- **Tests nouveaux/récrits** (`barbares.test.ts`, **55 tests**) : pile 1-3 sur la case du camp (dotation, rengendrement T-18) ; gardes immobiles / seul le dernier arrivé sort (pile de 2 = personne ne sort) ; cap 3 / reprise après mort ; assaut un par un (Géant enchaîne et capture ; attaquant faible meurt au 1er garde — le 2e garde n'est JAMAIS combattu ; survie mutuelle = repli R-54) ; capture complète (occupation de la case, vétéran, `VillageDestroyed` + `VillageLooted`, zéro `BootyGold`) ; **même seed = même récompense** ; camps sans PV (données + état + cartes) ; migration 23→24 idempotente. Suites serveur (schema 24 du dump admin) et web vertes.
- **e2e/partie solo — captures `dev-logs/captures-barbares-piles/`** (partie solo bot `6S46AA`, wrangler local `:8787` + vite `:5174`) :
  - `01-camp-pile-3-drapeau-rouge.png` — camp v1 à **3 barbares** (2 guerriers + 1 archer escaladé) en pile sur sa case, **drapeau rouge ×3** lisible, guerrier du joueur à distance 2 ;
  - `02-explorateur-sort-drapeau-x2.png` — **le 3e (l'archer) est sorti** attaquer, le camp passe à **×2** (les 2 gardes tiennent), l'UI propose « Attaquer u11 (8,20) » ;
  - `03-attaquant-detruit-un-par-un.png` — journal : échanges successifs (« Échange : u1 2 PV vs u11 3 PV », puis « u1 1 PV vs u11 3 PV ») et « **u1 est détruit (combat)** » — l'attaquant meurt un par un, le camp tient ;
  - `seance-precedente-*` + `verifications.json` / `village-looted.json` — illustrations de la séance antérieure (purge en combats successifs, capture avec `VillageLooted {kind:'gold', amount:39}`) ; la chaîne complète est verrouillée sur le code livré par les tests moteur.
  - **Reste à l'appréciation d'Erik** : le calibrage 🔶 du drapeau ×N et, si souhaité, une purge complète rejouée en GUI (partie `6S46AA` encore active en local, tour ~34, un guerrier disponible + production en file).
- **Zéro diff 3D** confirmé.

## 4. Périmètre respecté

Huttes (goody huts) inchangées ; aggro/escalation inchangés ; combats R-52 normaux inchangés ; aucun empilement de joueur possible (pile réservée au propriétaire barbare sur sa case de camp) ; 3D intouchée. Les modifications préexistantes hors chantier présentes dans le workspace (`apps/web/src/lib/atelier/catalogue.ts`, `assets-src/*`, `image_ref/*`, `Territoire_culturel.md`, scripts-tmp-*) n'appartiennent pas à cette session et sont à exclure d'un éventuel commit.

## 5. Fin de session

Rapport remis. **Aucun commit/push** — sur demande explicite d'Erik uniquement. Arrêt, remise de la main. Serveurs locaux laissés tournants (wrangler `:8787` — relancé après un crash du runtime workerd ; vite `:5174` préexistant).
