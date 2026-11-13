# HANDOFF-DEFENSE-VILLE-B — L3 : survivre d'abord, la production cesse quand une ville va tomber (dernière tranche du plan défense)

**Canon Erik validé le 13/11 (ordre C avant B — C livrée `b96e401`, la localisation L4/L5 est en place : le veto tournera À VUE).** Le cas déclencheur du diagnostic (`DIAG-DEFENSE-VILLE.md`) : p04 capitale — **5 colons produits en 50 tours de guerre, 0 militaire** ; p03 — **colon produit t34 pendant le siège** (mort avec la ville). Canon : « survivre d'abord » — cohérent avec le veto escort (un colon produit dans une ville qui va tomber meurt avec elle). **Dernière tranche du plan défense-de-ville.**

## 1. Préalables

- Docs : `DIAG-DEFENSE-VILLE.md` (levier L3), tranches A (`4e72dbd` : garnison d=0, rappel hystérésis+cooldown, `defenseVille.ts` — `menacesVille` et le déficit de garnison EXISTENT déjà) et C (`b96e401` : condensé localisé, question `defense` avec réponse Jev `produireGuerrier` déjà câblée). **B complète** : là où la question défense ne répond pas (sous confiance, hors menace d≤2 du seuil L5 mais menace réelle), la MÉCANIQUE interdit quand même la production expansive.
- Baseline : rules **1214** / server **484** / web 793 / jev-port 52 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `9cce52c` (après re-run flocon), prod 200. Journaux `sableuse/bancs/joueur-defense-c/` (mêmes seeds).
- **UNE SEULE MISSION À LA FOIS** (canon Erik 13/11) ; ⚠ chaque commit porte ses symboles (`git show` + grep) ; `git status` avant acceptation (leçon ménage worktree).

## 2. Le canon (un seul levier)

**L3 — Veto production défensive** : une ville avec **menace visible à d ≤ 2** (BFS portée de marche réelle — réutilise `menacesVille` de la tranche A) **ET déficit de garnison** (0 combattant d=0, ou sous `seuilGarnison`) **NE PRODUIT PAS d'item expansif** — colon et bâtiments sont refusés au profit de **guerrier** (pivot mécanique, miroir du veto escort). La priorité : garnison L1 (d=0 obligatoire) > rappel L2 > question défense L5 (si Jev répond `produireGuerrier`, la mécanique est d'accord — le veto la CONFIRME même sans elle) > veto L3 (ce levier) > production normale. Branché aux DEUX endroits canon : `arbitrerProduction` botPolicy partagé (bot classique ET Jev) + harnais/port — miroir exact, `schemaVersion` 28 intacte.

## 3. Mission L0→L3

- **L0 — Tests FIRST** (`apps/server/tests/`) : ville menacée d≤2 + déficit de garnison → SetProduction colon REFUSÉ, guerrier émis (rouge avant fix — reconstituer p04 : 5 colons en 50 tours) ; ville menacée avec garnison complète → production libre ; ville NON menacée → production libre bit-à-bit ; menace à d=3+ → pas de veto (le rayon L5 est 2, le veto L3 suit le même rayon canon) ; bâtiment NON militaire refusé au même titre que colon ; composition avec la question L5 (`produireGuerrier` Jev + veto = même ordre, jamais double) ; 30 seeds ; non-régression escortColon (pivot escort) et production normale.
- **L1 — Code** : veto dans `arbitrerProduction` (botPolicy) + miroir harnais/port ; réutilise `menacesVille` + `seuilGarnison` (tranche A) — zéro nouveau calcul moteur, zéro nouvelle question LLM, table `bot.json defense` étendue si un champ émerge.
- **L2 — Banc Jev 10 seeds MÊMES seeds** (`sableuse/bancs/joueur-defense-b/`, ≤ **0,60 $**) + sonde — critères : **colons produits pendant siège = 0** (sonde : production expansive sur ville menacée-déficiente, miroir p03/p04 — rouge avant fix au banc) · chutes ≤ 2 maintenues · élims ≤ 1 · **fondations ≥ 4,5** (le veto coûtera de l'expansion sous menace — consigné ; si < 4,5 → arrêt-pour-approbation) · D3UUQJ vert · **coût input : inchangé ou négligeable, chiffré** (tarif input-only). Banc bot 40×3 AVANT (`22ebde7` ou le dernier) / APRÈS : zéro collapse (le bot partagé subit le veto aussi — villes/pop dans les marges).
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200 (API GitHub, re-run canonique si flocon wrangler).

## 4. Critères d'acceptation

Colons-pendant-siège = 0 (rouge avant fix) · chutes ≤ 2 · élims ≤ 1 · fondations ≥ 4,5 · D3UUQJ vert · banc bot zéro collapse · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

`defenseVille.ts` (mécanique A : garnison/hystérésis/cooldown — B ne fait que CONSOMMER `menacesVille`), escortColon, condensé L4 et question L5 (inchangés), gate R-190, gainSite, questions Jev existantes et seuils, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`. Aucune nouvelle forme d'ordre (le pivot réutilise SetProduction).

## 6. Fin de session

Rapport `REPORT-DEFENSE-VILLE-B.md` à la racine : tableau AVANT/B (mêmes seeds), colons-pendant-siège = 0 prouvé, fondations chiffrées, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main — clôture du plan défense-de-ville (A+A2+A3+B+C).

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; banc via `tsx` ; UN SEUL worker 8787 ; ids recyclés dans les journaux ; bancs lourds en contention = flaky (re-passer isolés) ; `git status` avant acceptation (leçon ménage worktree `667fc1f`) ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
