# HANDOFF-DEFENSE-VILLE-A — Fermer les razes éclair : garnison d=0, rappel défensif hystérésis, hygiène de fondation

**Canon Erik validé le 12/11 (cadrage du pilot sur le diagnostic `DIAG-DEFENSE-VILLE.md` — 7 captures bot p2 + 6 razes barbares + 3 éliminations au banc escort n=10 ; 5/13 chutes avec combattants à d=1-2 jamais dans la tuile ; 4/6 razes sur villes d'1-4 tours garnies d'un colon seul, prises SANS combat).** Tranche A (mécanique partagée) — les tranches B (L3 veto production) et C (L4+L5 condensé localisé + question Jev) suivront après acceptation.

## 1. Préalables

- Docs : `DIAG-DEFENSE-VILLE.md` (la vérité terrain, leviers L1/L2/L6), TB-SIEGE-DEFENSE (`9964a7b` — rassemble/défend ses seuils, socle à réutiliser), CANON-SIEGE (bonus ville 0,25), BATAILLE-COMPLETE (`11b285b` — attaque = mort de l'un des deux : une défense au ralenti est perdante, un défenseur fourni fait un duel), OSCILLATION-MARCHE (`ffa73c8` — anti-piétinement, la hystérésis est obligatoire), GUERRE-VIVANTE, escortColon (le colon est exclu de « combattant » — leçon p08).
- Baseline : rules 1200 / server 453 / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `2094d10`. Journaux bancs archivés : `sableuse/bancs/{joueur-escorte,joueur-gate}/` (mêmes seeds re-jouables ~0,03 $/partie). Périmètre du diagnostic parallèle OSCILLATION-RÉSIDUELLE (cas NP8JEE) : disjoncté, ne pas y toucher.
- ⚠ Vérifier que chaque commit porte ses symboles (`git show` + grep — leçon `704ec5b`) ; rejouer les suites complètes avant tout push.

## 2. Le canon validé (3 leviers, une tranche)

1. **L1 — Garnison d=0** : toute ville de civilisation compte **≥ 1 combattant SUR sa tuile** (colon exclu — un colon seul sur la tuile n'est pas une garnison, leçon p08 où la ville tombe sans combat). La garnison prime sur exploration/escorte offensives : une combattante désignée garnison ne part pas explorer. Seuil forces vs menaces visibles : défaut tranché **1 combattant** (calibrage au banc, table `bot.json`).
2. **L2 — Rappel défensif avec HYSTÉRÉSIS** : menace à d ≤ N d'une ville (défaut : 3, table `bot.json`) → les combattants les plus proches reçoivent la priorité de retour vers LA tuile de la ville ; le rappel **persiste** jusqu'à dissolution de la menace visible (hystérésis — pas de ping-pong : une fois déclenché, le retour ne s'annule que quand plus aucune menace n'est visible d≤N). Recadrage canon entériné par Erik : **défendre une ville n'est pas de l'inactivité**.
3. **L6 — Hygiène de fondation** : fondation refusée (gate fondation : pénalité forte) sur tout site à **d ≤ 3 d'un barbare visible** (table `bot.json`). Canon Erik : « fondé sous les griffes, ce n'est pas un pari évalué » — le colon seul est un pari, un pari s'évalue, et le gate valeurSite doit voir les barbares.

Hors tranche (consignés) : L3 veto production (tranche B), L4/L5 condensé + question Jev (tranche C), L7 événement GUI (backlog).

## 3. Mission L0→L5

- **L0 — Tests FIRST** (`packages/rules/tests/` + `apps/server/tests/`) : ville d'1 tour avec colon seul + barbare à d ≤ 3 → **fondation refusée** (rouge avant fix) ; ville sans combattant d=0 + combattante à d=2 + menace d ≤ 3 → **rappel déclenché**, la combattante Move vers la tuile (rouge avant fix) ; hystérésis : la menace s'éloigne d'un tour → le rappel PERSISTE ; menace dissoute → rappel levé, l'unité reprend son ordre ; garnison désignée ne part pas explorer ; colon seul ne compte PAS comme garnison (leçon p08 : capture sans combat) ; multiple villes → priorité aux plus menacées ; 30 seeds ; non-régression : TB-SIEGE-DEFENSE, escortColon, exploration.
- **L1 — Moteur** : fonctions pures (`garnisonDeficit(state, ville)`, `menaceVisible(...)` — réutilise le BFS de `escortColon` pour la portée réelle), tables `bot.json defense` (défauts : menaceDist 3, fondationBarbareDist 3, seuil garnison 1), zéro durcissement.
- **L2 — botPolicy partagé** : priorités garnison > rappel > escort > exploration ; branchement Jev (harnais `joueur.mjs` + port `jev/joueur.ts`) identique — zéro nouvelle question LLM (L4/L5 sont la tranche C).
- **L3 — Bancs (l'arbitre chiffré)** : re-jouer les **mêmes seeds** du banc joueur-escorte (10 parties, ~0,3 $) + sonde raffinée étendue — critères : **razes barbares 6 → 0** · éliminations précoces < 3 · fondations/partie maintenues (≥ 5,7) · **zéro ping-pong de rappel** (sonde : aucun aller-retour d'une même unité déclenché par le rappel) · zéro suicide D3UUQJ re-testé vert. Banc bot 40×3 AVANT (`2094d10`) / APRÈS : zéro collapse, guerres vivantes maintenues. Si un critère ne passe pas → **arrêt-pour-approbation** avec les chiffres (pas d'itération solo sur les seuils).
- **L4 — Suites + déploiement** : suites complètes, captures locales AVANT tout commit, push, vérifier Deploy SUCCESS + prod 200.

## 4. Critères d'acceptation

Razes 6 → 0 (mêmes seeds) · éliminations < 3 · fondations maintenues · zéro ping-pong · D3UUQJ vert · zéro collapse banc bot · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

Gate d'attaque (R-190), escortColon (règles inchangées — la garnison SURCLASSE l'escorte dans les priorités, ne la modifie pas), gainSite, questions Jev existantes et seuils, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`. Le rappel réutilise Move existant (aucune nouvelle forme d'ordre).

## 6. Fin de session

Rapport `REPORT-DEFENSE-VILLE-A.md` à la racine : tableaux AVANT/APRÈS mêmes seeds, verdict par critère, la table `bot.json defense` effective, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; banc via `tsx`, banc bot ≈ 28-29 min ; UN SEUL worker 8787 ; jev-port via `vitest.jev.config.ts` ; fixture `makeState` : `spawnedUnits[0]` est un ID ; ids recyclés dans les journaux (sonde : cycles de vie) ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
