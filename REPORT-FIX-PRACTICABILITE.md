# REPORT-FIX-PRACTICABILITÉ — Le waypoint de patrouille ne se pose plus sur l'eau

**Mission L0→L3 livrée le 13/11 — canon Erik (levier L1 du diagnostic `DIAG-OSCILLATION-RESIDUELLE.md`, prod NP8JEE).** Commit code `58ecdd2` (base `8deeecc`, HANDOFF `8deeecc`).

## 1. Le fix (un seul levier, rien d'autre)

`apps/server/src/botPolicy.ts` :

1. **`porteeMarcheTerrestre(state, unit)`** (nouveau, exporté) — ensemble des cases atteignables par un **chemin terrestre BFS** depuis l'unité : wrap cylindrique canon (voisinage normalisé Est↔Ouest, miroir `pasVersRoutier`), terrains passables pour la classe de l'unité (navales : accès naval). **L'occupation n'entre pas** — la praticabilité est une propriété du TERRAIN (les unités bougent chaque tour ; les exclure ferait des faux négatifs). Pur, déterministe (voisinage trié R-81).
2. **`prochainWaypointPatrouille(..., praticable?)`** — 5e paramètre optionnel (prédicat). Les coins INpraticables sont **écartés AVANT le tir** ; le cycle ne porte que sur les coins praticables (re-tir déterministe = prochain coin praticable après le plus proche, tie-break index R-81). **AUCUN candidat praticable (capitale mono-tile insulaire) → `null`**. Sans prédicat (appel legacy) : comportement géométrique d'origine bit à bit.
3. **Site d'appel (`assignerObjectifs`, bloc BOT-EXPLORATION D1)** : waypoint = tir filtré par la portée terrestre ; si `null` → **PAS de patrouille impossible** : le scout tombe au classement ④ chasser / ⑤ explorer (repli canon « jamais inactif » existant). Anti-recul, rappel D3, BFS routier et glouton **bit à bit intouchés** (pistes infirmées du diagnostic — non « améliorés »).

Périmètre interdit respecté : defenseVille, escortColon, gate R-190, `combatStrengthsOf`, ORACLE-VERDICT, gainSite, questions Jev, gardien Fortify/R-183, Zii, `schemaVersion` **28** (intacte).

## 2. L0 — Tests FIRST (rouges avant fix)

`apps/server/tests/fix-praticabilite.test.ts` — **10 tests, rouges avant fix (8 échecs + 2 legacy verts vérifiés)**, verts après :

- **Géométrie NP8JEE reconstituée** (capitale côtière (27,10), anneau 3 avec (24,10) eau / (24,13) océan / (27,13) eau — miroir du dump prod) : le waypoint n'est JAMAIS l'eau ; re-tir vers le prochain praticable du cycle.
- Cycle praticables **cyclique et déterministe** (fenêtre 3 coins, 12 tirages).
- **Capitale insulaire** (anneau 100 % eau) → `null` + côté appelant : l'unité reçoit un ordre (jamais d'inertie), jamais un `patrouiller` impossible.
- **Déterminisme 30 seeds** (le sélecteur est pur).
- **Non-régression** : anneau 100 % terre → séquence bit à bit avec/sans prédicat, cycle des 6 coins d'origine (miroir D5 `bot-exploration`).

## 3. L2 — Preuve NP8JEE re-simulée (tsx, PAS via serveur — workerd fige)

`apps/server/devtmp/fix-praticabilite-sonde.ts` sur le dump prod inchangé `devtmp/etat-NP8JEE/dump.json` :

```
u4: 24 5 mp 1 | portée terrestre contient (24,10): false | (27,7): true
objectif u4 (APRÈS fix): {"kind":"patrouiller","cible":{"q":30,"r":10}}
ordre émis u4 (APRÈS fix): {"type":"Move","unitId":"u4","path":[{"q":25,"r":4}]}
cible: 30,10 terrain: prairie praticable: true
```

Avant fix (diagnostic 1b1100a) : cible (24,10) EAU, routier=glouton=null, Hold, mp intactes. Après fix : **la boucle de gel est fermée** — l'eau est re-tirée, u4 marche.

## 4. Banc bot 40×3 AVANT (`22ebde7`, worktree dédiée) / APRÈS (`58ecdd2`)

`devtmp/banc-bot-td-{AVANT,APRES}-praticabilite.json` — zéro collapse :

| Difficulté | Villes (avant→après) | Pop | PV mil. | Tours | Victoires |
|---|---|---|---|---|---|
| facile | 1,85 → 1,925 | 17,6 → 18,6 | 280 → 287 | 121 → 128 | 13 → 13 |
| normal | 1,925 → 1,95 | 17,9 → 18,0 | 289 → 286 | 141 → 138 | 6 → 8 |
| difficile | 1,975 → 1,975 | 14,0 → 13,9 | 264 → 266 | 137 → 138 | 8 → 8 |

**Piétinement résiduel** (`devtmp/pietinement-{AVANT,APRES}-praticabilite.json`, sonde dédiée `banc-praticabilite-pietinement.ts`, définition du diagnostic : même position t-1, mp intactes, non fortifiée, aucun ennemi/village adjacent — corpus 40×3×150) : **0 → 0 (égal, jamais en hausse)**. Le cas NP8JEE (scout seul + capitale côtière) n'arrive pas dans ce corpus 1v1 bot-vs-bot — d'où la preuve par re-simulation du dump réel (§3), la seule qui porte sur le cas.

## 5. Suites

- **server 484 verts** (dont les 10 nouveaux — baseline 474) · `tsc -p apps/server` ✓
- **web 793** ✓ · **rules 1214** ✓ · **jev-port 52** ✓
- ⚠ 4 échecs rules lors du premier passage (spawn/carte-50 — génération stochastique) : **flakiness de contention** (5 bancs lourds en parallèle) — re-passés isolés : **17/17 verts**. Sableuse non relancée (périmètre intouché).
- ⚠ Les bancs parallèles ont réécrit `devtmp/banc-{bot-p7-civs,bot-tc-observation,paix-rythme}.json` (timeouts 1 h en contention, Sortie annexe) — **restaurés bit à bit** (`git checkout --`) avant commit.

## 6. Écarts consignés

- L'« ordre déterministe seedé » du canon est rempli par la détermination pure du sélecteur (tie-break index R-81, zéro RNG) — 30 seeds verrouillent l'absence d'aléa.
- `bot-exploration.test.ts` : 1 ligne retouchée (non-null assertion `!` — la signature retourne maintenant `| null`).

⚠ **CI/Deploy à vérifier après push.**

## 7. Pièges évités

Cache vitest `.vite` RACINE purgé avant re-mesure · banc via tsx/vitest banc config (~74 min en contention, ~4 min seul) · UN SEUL worker 8787 (aucun lancé) · re-simulation via tsx · alias `@game/rules` apps/server only · chaque commit porte ses symboles · secrets/fichiers personnels non committés · worktree AVANT avec **jonctions node_modules** (racine + apps/server) — supprimées après usage ; `@game/rules` résolu vers l'arbre principal = sans effet (packages/rules inchangé entre `22ebde7` et la mission).
