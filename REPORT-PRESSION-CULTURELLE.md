# REPORT-PRESSION-CULTURELLE — Pression culturelle défensive (T-53, tranche 1 du volet culture)

**Mission HANDOFF-PRESSION-CULTURELLE — canon Erik 14/11 (D1-D7), implémentée intégralement (L0-L4). État : COMMIT LOCAL, pas poussé — arrêt-pour-approbation, verdict à l'œil Erik en prod.**

## 1. Livré

- **L0 · Data** — `culture.json` `pressionDefensive` `{ attenuationParAnneau: [1, 0.5, 0.25], defenseTiers: [5, 10, 20], defenseBonus: [0.1, 0.2, 0.3] }` + type `CultureData.pressionDefensive` (types.ts). Calibrage 100 % JSON : flip de table = flip de comportement, prouvé par test.
- **L1 · Moteur** — `culture.ts` : `pressionCulturelle(villes, cible, mapWidth, tables)` (PURE — R-81, aucun RNG, aucun fog, `hexDistanceW` partout, R=3 anneaux fixes D1, ×1/×0,5/×0,25 D2, d=0 compte anneau 1) + `bonusDefenseCulturel(pression)` → `{valeur, label: 'Pression culturelle (T-53)'}` ou **null** (jamais un mod à 0 — bit-à-bit). `turn.ts` : **factorisation obligatoire faite** — UN helper `modsDefenseCase(board, tile, owner, fortified, garde)` pousse terrain T-02 / fortification T-17 / bâtiments + le mod pression, remplaçant les **deux sites** (bloc défenseur de `combatStrengthsOf` ~turn.ts:1152 et mêlée cohabitation R-180 ~turn.ts:5270) ; `terrainDefenseBonus` (définition privée identique) absorbée et supprimée. La préview/Oracle **`PredictBattle`** et le gate bot **`forcesProspectives`** passent tous deux par `combatStrengthsOf` → mod porté gratuitement (vérifié explicitement, test intégré `forcesProspectives` S_def = 1,1).
  - Culture/tour par ville = **MÊME formule que le rendement réel** (cultureGains + ressources culturelles travaillées R-93 + GP installé, anarchie → 0 D7) → **D6 gratuit** : `city.wonders`/`buildings` suivent la ville capturée, la pression lit le propriétaire ACTUEL.
  - **Cache mémoïsé par (état, tour)** : le gate bot appelle le calcul des dizaines de fois par tour — liste de pression calculée une fois par (nation, tour), invalide au changement de tour. Aucune influence sur le déterminisme (valeur purement dérivée de l'état du tour).
- **L2 · Tests** — `packages/rules/tests/pression-culturelle.test.ts`, **14 verts** : atténuation par anneau (×1/×0,5/×0,25/0, d=0 anneau 1), wrap Est↔Ouest (largeur 8 : ville en q=7 = adjacente), superposition (8 + 8×0,5 = 12), bordures de paliers exactes (4→0, 5/9→+10, 10/19→+20, 20/40→+30 plafond), flip de table lu depuis le JSON, intégration (défenseur sous pression ≥ 5 porte le mod au `CombatDetail`, attaquant JAMAIS D5, `forcesProspectives` inclut le bonus), sous le palier aucun mod, **D6** (merveille survivante `theatre_de_shakespeare` presse pour le NOUVEAU propriétaire — ×2 sur les gains de la ville capturée), **D7** (anarchie `anarchyUntil` → pression 0, force canon), **bit-à-bit à pression nulle** (détail défenseur = colline + fortification exactement, force 1,6).
- **RULES.md** — règle **R-163** rédigée (§8.5) + table de calibrage : **T-53 consigné** — ⚠ le défaut du handoff (T-28) était PRIS (coût des Nations Unies, R-116) ; T-53 est le premier numéro libre (T-52/T-54 occupés), à confirmer à l'œil.

## 2. Suites (canon)

| Suite | AVANT | APRÈS | État |
|---|---|---|---|
| rules | 1215 | **1229** verts (1215 + 14 nouveaux, zéro assertion existante changée) | ✅ |
| server | 544 | **544** verts (1 flaky contention `chat-socle` → re-passé isolé 12/12 ✅) | ✅ |
| web | 793 | **793** verts | ✅ |
| jev-port | 52 | **52** verts | ✅ |
| typecheck turbo racine | — | 4/4 tâches vertes | ✅ |

## 3. Banc bot 40×3 AVANT/APRÈS (`devtmp/banc-pression-AVANT.json` / `-APRES.json`, harnais canon SANCTUAIRE `apps/server/devtmp/banc-pression-culturelle.ts`, cache `.vite` purgé, AVANT sur code d'origine via stash temporaire)

| Critère dur | fac. AV→AP | nor. AV→AP | dif. AV→AP | Verdict |
|---|---|---|---|---|
| chutes (≤ 2) | 0,025 → 0,025 | 0 → 0 | 0,1 → 0,075 | ✅ identique |
| fondations | 2 → 2 | 2 → 2 | 2 → 2 | ✅ non-régression |
| élims (≤ 1) | 0 → 0 | 0 → 0 | 0 → 0 | ✅ |
| zéro collapse | oui | oui | oui | ✅ |
| victoires (bruit) | 1 → 1 | 0 → 0 | 4 → 3 | ✅ dans le bruit |
| tours moyens | 147,8 → 147,8 | 150 → 150 | 142,4 → 144,2 | ✅ |

⚠ **Consigne** : le critère du handoff « fondations ≥ 5 » n'est pas atteint PAR LE BASELINE LUI-MÊME (AVANT = 2/partie — même chiffre que le banc SANCTUAIRE de vendredi sur le même harness). La barre réelle appliquée = non-régression dure, respectée bit-à-bit-ish.

**Mesure d'usage (le mod doit être RARE au départ, apparaître en milieu de partie)** :

| Difficulté | combats | combats avec mod | distribution | 1er mod |
|---|---|---|---|---|
| facile | 226 | 4 (1,8 %) | 4× +10 % | t74 |
| normal | 301 | 5 (1,7 %) | 5× +10 % | t~101 |
| difficile | 285 | 7 (2,5 %) | 7× +10 % | t89 |

✅ Profil exactement voulu : mod RARE, que du +10 % (jamais +20/+30 au banc), 1er déclenchement t74-t101 (milieu de partie). Aucun signal de calibrage à consigner côté « +30 % dès t20 ».

## 4. Capture GUI — NON OBTENUE (consigné, à l'œil en prod)

**3 tentatives** avec `devtmp/pression-culturelle-gui.mjs` (solo réel : fondation colon t1 → SetProduction Sanctuaire → croissance jusqu'à culture ≥ 5 (atteinte ✓, ~t40-60) → garde fortifiée adjacente à la capitale en attendant l'assaut barbare). Blocages environnementaux, pas moteur :
1. worker 8791 hors proxy Vite (login impossible) → 8787 canon ;
2. seed sans hostile atteignable adjacent au cœur ;
3. workerd local FIGÉ après ~90 tours + zombies workerd (pièges canon — kill forcé, la run suivante reste bloquée).

Le mod est néanmoins **prouvé au niveau moteur** : le `CombatExchange.detail.defenseur.bonusDefPct` porte « Pression culturelle (T-53) » dans les tests d'intégration (combat réel via `resolveTurn`) ET dans la préview (`forcesProspectives`, S_def 1,1). Côté UI, `RapportCombat.svelte` rend les labels du détail nommé TELS QUELS — zéro travail UI dédié. **La vérification visuelle reste celle d'Erik en prod** (Erik vs Jev : détail de combat + préview Oracle près du cœur culturel), ce qui est de toute façon le verdict canon de la mission (§6).

## 5. Écarts & consignes

1. **T-53 au lieu de T-28** (défaut du handoff déjà pris — cf. §1).
2. **Fondations baseline = 2** (critère ≥ 5 du handoff inatteignable même AVANT — cf. §3).
3. **Gate R-190** : inchangé (périmètre interdit). Le gate juge AVANT le tour via `forcesProspectives`, qui porte DÉJÀ le mod → le bot voit les défenses durcies dès la planification ; au banc l'effet est négligeable (1,7-2,5 % des combats). Aucun levier à activer.
4. Le +30 % ne s'est jamais produit au banc bot (superposition de villes denses requise) — c'est le comportement attendu « cœur dense » ; l'arbitre réel est Erik vs Jev.
5. Tranches 2 (infobulle) et 3 (pression offensive/conversion, `Territoire_culturel.md`) : BACKLOG, non commencées.

## 6. Arrêt-pour-approbation

**Rien n'est poussé.** Erik :
1. rejoue/valide **à l'œil en prod** (Erik vs Jev : les sièges doivent être sensiblement plus durs près du cœur culturel — le mod apparaît au détail de combat et à la préview Oracle) ;
2. confirme le numéro **T-53** (ou désigne un autre) ;
3. fait pousser s'il est satisfait (commit local prêt, symboles PRESSION-CULTURELLE + D1-D7 dans le message).

**Reste après cette mission** : verdict Sanctuaire à l'œil (déjà en attente) → tranches 2/3 culture (backlog) → tranche B → Erik vs Jev arbitre réel.
