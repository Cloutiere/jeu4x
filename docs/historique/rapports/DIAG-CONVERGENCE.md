# DIAG-CONVERGENCE — Pourquoi l'armée de campagne ne converge jamais

**Diagnostic READ-ONLY du 14/11 (HANDOFF-DIAG-CONVERGENCE) — zéro code source, zéro banc.** Méthode : instrumentation tour par tour (`apps/server/devtmp/diag-convergence.ts` — `assignerObjectifs` exporté lit le kind d'objectif EXACT de chaque membre ; memos clonés pour l'observation, sans double-mutation) sur **20 seeds × 2 difficultés = 34 461 tours-membres** ; re-mesure wrappée de `diag-verrous-siege.ts` (artefact de distance corrigé en cours de route — voir §4). Baseline : commit LOCAL D1-CAMPAGNE (V3-(ii) actif).

## 1. La répartition des 34 461 tours-membres (la cause, tout de suite)

| Classe | Tours | % | Signification |
|---|---|---|---|
| **RALLI-ROUTE-NULL** | **15 373** | **44,6 %** | Objectif `rallier`/`offensiver` MAIS `pasVersRoutier ?? pasVers` = **null** — aucun pas n'existe |
| **RALLI-FILTRE-D2** | **6 454** | **18,7 %** | Un pas existait MAIS `filtrerAntiCollision` le refuse (collision avec un ennemi errant MOBILE — barbares surtout) → Fortify |
| OBJ-D1 (pins résiduels) | 5 897 | 17,1 % | Épinglés par des ennemis de GUERRE (voulu) + hystérésis |
| MARCHE-PROGRESSIVE | 2 824 | 8,2 % | Un pas émis ET la distance baisse |
| MARCHE-NON-PROGRESSIVE | 1 446 | 4,2 % | Pas émis sans progression (wrap corrigé — rare) |
| RALLI-BLOQUE-AUTRE | 1 430 | 4,1 % | Pas existe, non filtré, non émis (campement/bord) |
| OBJ-EXPLORATION / GARNISON / autre | 965 | 2,8 % | Rôles concurrents (marginaux) |
| **CONVERGENT** | **64** | **0,2 %** | Au rayon |

**63,3 % des tours-membres sont des `rallier` qui ne produisent AUCUN pas effectif** (ROUTE-NULL + FILTRE-D2). Quand un pas passe, il progresse (73 % des marches) — la marche n'est pas le problème : **c'est l'émission du pas qui est presque toujours vide ou refusée**.

## 2. La cause dominante : RALLI-ROUTE-NULL (44,6 %)

**Mécanisme précis** : l'émission `rallier` (`botPolicy.ts:2689-2702` : `const step = pasVersRoutier(unit, state, cible) ?? pasVers(unit, state, cible); orders.push(step ? Move : Fortify)`). Or :
- `pasVersRoutier` (`botPolicy.ts:410-459`) exige un **transit LIBRE DE TOUTE UNITÉ** (« cases praticables libres de TOUTE unité », botPolicy.ts:408) — un membre entouré d'alliés (co-membres, garnisons, productions fraîches — les armées de 6-8 sont entassées autour des villes domestiques) n'a **aucun chemin libre de bout en bout** → null ;
- le repli glouton `pasVers` (`botPolicy.ts:367-399`) refuse aussi les cases occupées (botPolicy.ts:391) et n'accepte qu'un pas qui **réduit** la distance → null en entassement ;
- → **Fortify perpétuel** (« jamais inactif » mais jamais parti) : la chronologie le montre — `u34` : 8 tours consécutifs ROUTE-NULL à d=24, puis 9 marches NON-progressives entrecoupées.

**Candidats infirmés** : la **cible de ralliement mobile** est INFIRMÉE — `cibleChanges = 0` sur **40/40 guerres** (l'anneau est géométrique et la ville de campagne stable, canon BOT-MARCHE D1). Les **drafts de garnison** sont marginaux (1,2 %) ; la défense (0 %) ; l'exploration (1,5 %). Le wrap Est↔Ouest faussait ma première mesure (les « marches non progressives » passent de 7,9 % à 4,2 % une fois `hexDistanceW` appliqué) — corrigé, et le `maxEffectifRayon 0,1` a été **re-confirmé avec wrap** dans `diag-verrous-siege.ts` (40/40 guerres jamais ≥ 4 : pas un artefact).

## 3. Les deux autres causes

- **RALLI-FILTRE-D2 (18,7 %)** : le pas existe mais la collision-mobile le refuse — les barbares ERRANTS (mobiles, donc comptés par `estEnnemiMobile`) parsèment la route vers le front ; chaque pas dans leur portée d'arrivée 1 tour est refusé. Chronologie type : `u2` t12-t20 : **9 tours consécutifs** RALLI-FILTRE-D2 (bloqué à d=35). C'est le prix canon de GZJQZX — mais appliqué à un member en campagne offensive qui devrait percer.
- **OBJ-D1 résiduel (17,1 %)** : les 919-2 432 pins restants — par des ennemis de **guerre déclarée** (le filtre V3-(ii) ne vise que les barbares). **Voulu** : un membre réellement poursuivi par l'ennemi doit se réfugier. À ne PAS toucher.

## 4. Leviers candidats pour le cadrage (mechanism-first, ordre de pose explicite)

1. **(a) Transit ALLIÉ pour le ralliement** — dans `pasVersRoutier`, autoriser le transit par les cases occupées par des ALLIÉS (owner = me) quand l'objectif est rallier/offensiver : le pas FINAL reste libre (l'arrivée sur allié est déjà gérée par le moteur R-30 et le re-tir du tour suivant). **Lève directement les 44,6 %.** Risque : embouteillage/oscillation sur la case alliée (mitigé : pas de case libre = pas de Move résolu, l'unité tient un tour et re-tire — pas de ping-pong de position) ; GZJQZX inchangé (hors campagne). Test de verrouillage : re-jouer `devtmp/diag-convergence.ts` → RALLI-ROUTE-NULL → ~0 ; puis banc bot 40×3.
2. **(b) Convergence tolérante aux barbares errants** — pour les membres de campagne (MÊME sous-population que V3-(ii)), un pas de convergence vers la ville de campagne peut traverser la portée d'arrivée d'un barbare errant (le risque « sorties/errance » est accepté depuis COLLISION-MOBILE) ; les ennemis de civilisation continuent de bloquer. **Lève les 18,7 %.** Risque : pertes Jev déjà à la limite (10,9) — à mesurer au banc Jev avec attention.
3. **(c) D1 résiduel : ne pas toucher** (17,1 % — comportement canon voulu).

**Interaction explicite** : (a) sans (b) = l'armée se dégage de l'entassement puis bute sur les barbares en route (18,7 % + les nouveaux pas exposés) ; (b) sans (a) = inutile (il n'y a pas de pas à émettre). **Ordre : (a) d'abord, re-mesurer, puis (b) si le rassemblement reste partiel.** V2 (effectif 4) reste derrière les deux.

## 5. Méthode & fichiers

- Traceur : `apps/server/devtmp/diag-convergence.ts` (assignerObjectifs exporté = kind EXACT ; sous-classement RALLI par re-jeu de `pasVersRoutier ?? pasVers` + `filtrerAntiCollision` ; distances **wrappées** `hexDistanceW`).
- Résultats bruts : `devtmp/diag-convergence-resultats.json` (chronologies complètes des 40 guerres) ; `devtmp/diag-verrous-siege-resultats.json` (re-mesure wrappée).
- ⚠ Leçon consignée : la première mesure (distances non-wrappées) produisait des « marches non progressives » fantômes et un `auRayon` sous-estimé — **toute distance de ce projet est wrappée (`hexDistanceW`, CARTE-RONDE T1)**.
- Zéro code source touché ; commit LOCAL D1-CAMPAGNE en place (V3-(ii) actif pendant la mesure).
