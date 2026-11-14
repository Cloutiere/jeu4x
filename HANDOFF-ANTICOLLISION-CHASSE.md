# HANDOFF-ANTICOLLISION-CHASSE — L'unité chassée entre en ville et se fortifie ; elle n'offre jamais le duel (D1+D2)

**Canon Erik validé le 14/11 (cas prod GZJQZX, dumps `devtmp/etat-GZJQZX/` — partie PERDUE t39 : capitale c2 rasée par UN satellite barbare).** La séquence fatale : u4 (seul guerrier, 3 PV) poursuivi par u27 (3 PV) pendant 3 tours ; au t36 u4 marche SUR la case (19,22) où u27 arrive le même tour → bataille complète de cohabitation **3 v 3, p = 0,5 — pièce perdue** ; capitale vide t38 (aucun combat, aucune garnison), rasée t39 — le guerrier en production terminait CE tour-là, un tour trop tard. **Le comportement optimal (canon Erik) : une fois près de ses villes sachant qu'on est pris en chasse, l'unité ARRÊTE de se déplacer et se FORTIFIE.** Chiffré : u4 fortifié dans c2 = défense ~1,3-1,6 + soin 1 PV/tour contre un attaquant 3 PV (bataille R-183, défenseur fourni) — odds largement favorables, et le temps travaillait pour Jev (production en cours). La lacune : le gate R-190 filtre les attaques ÉMISES, rien ne filtre les duels **OFFERTS** par collision de trajectoire.

## 1. Préalables

- Docs : tranche A (`defenseVille.ts` — `menacesVille` BFS, garnison L1, rappel L2 hystérésis+cooldown), tranche C (condensé localisé — la menace portait villeId + distance DEPUIS t35 dans GZJQZX), gate R-190 (`gateAttaque.ts` — le pendant offensif), CANON-SIEGE (T-02 + fortification, soin 1 PV/tour), COHABITATION-HOSTILE / BATAILLE-COMPLETE (la collision force la bataille), doctrine « jamais inactif ».
- Baseline : rules **1214** / server **503** / web 793 / jev-port 52 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `e5cdf6d`, prod 200. Dumps : `devtmp/etat-GZJQZX/` (trace 38 = entrée dans c2 vide), `devtmp/etat-NP8JEE/`.
- **UNE SEULE MISSION À LA FOIS** (canon Erik 13/11) ; ⚠ symboles dans chaque commit (`git show` + grep) ; `git status` avant acceptation (leçon ménage worktree `667fc1f`).

## 2. Le canon validé (2 règles mécaniques, au-dessus de Jev)

1. **D1 — Chasse près de mes villes** : une unité de combat **poursuivie** (une menace visible persiste à son encontre sur ≥ 2 tours consécutifs — même ennemi qui se rapproche d'elle ou de sa ville, détecté via `menacesVille`/condensé localisé) située à **d ≤ 2 d'une de mes villes** → elle **ENTRE dans la ville la plus proche** (si déficit de garnison ou menace sur cette ville) **ou se FORTIFIE sur place adjacente**, et ne re-sort PAS tant que la menace existe (hystérésis du rappel L2 s'applique). Priorité : la ville la plus proche à déficit de garnison (le rappel L2 vise déjà la tuile — D1 change la MANIÈRE d'y marcher : par la porte, pas en champ).
2. **D2 — Anti-collision** : **jamais un pas qui atterrit sur une case où un ennemi CONNU peut arriver ce même tour** (intersection avec la portée de marche ennemie à 1 tour — BFS, réutilise `porteeMarcheTerrestre`/`menacesVille`) ni à d≤1 d'un ennemi connu plus fort/égal ; si tous les pas disponibles sont mauvais → **fortifier sur place** (seule exception : un pas qui passe le gate R-190 — l'attaque volontaire reste possible). Un rappel L2 dont la route croise la portée ennemie **s'arrête et fortifie** : le rappel vise la tuile de la ville, et y arriver en vie > y arriver mort.

Composition : L1 garnison (la ville doit avoir un défenseur DANS la tuile — D1 est la manière de l'y amener vivant) > L2 rappel > **D1/D2 trajectoire** > L5 question défense > L3 veto production. Zéro nouvelle question LLM, zéro retouche au gate (le test du « dernier recours » est le gate lui-même).

## 3. Mission L0→L4

- **L0 — Tests FIRST** (`apps/server/tests/`) : reconstitution GZJQZX t36 — u4 à (19,21), u27 connu pouvant atteindre (19,22) → le pas vers (19,22) REFUSÉ, u4 fortifie ou entre en ville (rouge avant fix) ; unité poursuivie 2+ tours à d≤2 d'une ville → Move DANS la ville + fortifié ; menace persistante → ne re-sort pas ; ennemi hors portée du pas → pas autorisé bit-à-bit ; pas qui passe le gate → attaque permise (non-régression escarmouche) ; rappel L2 route croisée → arrêt+fortification, pas de collision ; capitale insulaire/sans ville à d≤2 → fortifier sur place ; 30 seeds ; non-régression : exploration (BOT-EXPLORATION, HUTTE-EXPLORATION — un scout NON poursuivi continue), escortColon, tranche A.
- **L1 — Code** : `botPolicy` (trajectoire de l'unité : pré-filtre des pas par la portée ennemie + état « poursuivie » via memo de tour, miroir `defenseRappels`/`defenseCooldown` — `schemaVersion` 28 intacte) + harnais/port miroir bit-à-bit ; tables `bot.json` (`antiCollision`, ex. distance d'arrivée 1, toursDePoursuite 2, distanceVille 2).
- **L2 — Bancs** : banc Jev 10 seeds MÊMES seeds (`sableuse/bancs/joueur-anticollision/`, ≤ **0,60 $**) — critères : **0 duel de cohabitation perdu par collision avec un ennemi connu** (sonde : convergence même-case/tour avec tueur connu à la décision — le cas GZJQZX reconstitué = rouge avant fix) · chutes ≤ 2 · élims ≤ 1 · fondations ≥ 5,0 · D3UUQJ vert · re-simulation GZJQZX t36 ET NP8JEE (u4 reçoit toujours un ordre — non-régression praticabilité) · ping-pong rappel isolé ≤ 113 · coût input chiffré (tarif input-only). Banc bot 40×3 AVANT (`e5cdf6d`) / APRÈS : zéro collapse, piétinement 0→0 maintenu.
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200 (re-run canonique si flocon wrangler).

## 4. Critères d'acceptation

GZJQZX t36 : le pas fatal refusé (rouge avant fix) · 0 collision-perdue avec ennemi connu au banc · chutes ≤ 2 · fondations ≥ 5,0 · NP8JEE non-régressif · D3UUQJ vert · banc bot zéro collapse, piétinement 0→0 · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

`defenseVille.ts` (mécanique A consommée, jamais retouchée), escortColon, `gateAttaque.ts` (le gate est CONSULTÉ, jamais modifié), condensé L4 / question L5, gainSite, questions Jev et seuils, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`. Aucune nouvelle forme d'ordre (fortifier = Fortify existant).

## 6. Fin de session

Rapport `REPORT-ANTICOLLISION-CHASSE.md` à la racine : les deux re-simulations (GZJQZX + NP8JEE), tableau banc AVANT/APRÈS, collisions évitées une à une, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; banc via `tsx` ; UN SEUL worker 8787 ; ids recyclés dans les journaux ; bancs lourds en contention = flaky (re-passer isolés) ; `git status` avant acceptation (leçon `667fc1f`) ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
