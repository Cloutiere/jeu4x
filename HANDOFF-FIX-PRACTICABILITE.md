# HANDOFF-FIX-PRACTICABILITE — Le waypoint de patrouille ne se pose plus sur l'eau (mini-mission)

**Canon Erik validé le 13/11 (levier L1 du diagnostic `DIAG-OSCILLATION-RESIDUELLE.md`, commit `1b1100a`).** Le bogue capturé en prod **NP8JEE** (dumps `devtmp/etat-NP8JEE/`) : le guerrier de Jev u4 piétine en (24,5) avec mp intactes et ordre null t11-14 — cause identifiée par le diagnostic : le **waypoint de patrouille (24,10) était sur l'EAU** (l'anneau 3/6 coins autour de la capitale tombe en mer), et le sélecteur géométrique (`botPolicy.ts:267` — sélection du waypoint le plus proche) **ne teste jamais la praticabilité** : l'unité ne peut ni atteindre ni consommer le waypoint, et le mécanisme ne re-tire jamais. Les pistes anti-recul et rappel D3 sont **infirmées** — BFS et glouton sont conformes au canon. Doctrine violée : « jamais inactif » (CONFIANCE-EXPLORATION).

## 1. Préalables

- Baseline : rules **1214** / server **474** / web 793 / jev-port 52 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `22ebde7`, prod 200.
- **UNE SEULE MISSION À LA FOIS** (canon Erik 13/11) — cette mission est la seule en cours ; ne pas toucher aux périmètres récents (defenseVille, escortColon, gate R-190) sauf lecture.
- Diagnostic à relire : `DIAG-OSCILLATION-RESIDUELLE.md` (cause fichier:ligne, pistes infirmées, levier L1 déjà esquissé).

## 2. Le canon (un seul levier, rien d'autre)

**Le waypoint de patrouille/exploration doit être PRATICABLE** : atteignable par un **chemin terrestre BFS** depuis la position de l'unité (portée de marche réelle, wrap cylindrique canon). Si le candidat géométrique n'est pas praticable → **re-tirer un waypoint** (prochain candidat praticable de l'anneau, ordre déterministe seedé) ; si AUCUN candidat praticable → repli canon « jamais inactif » (patrouille autour de la capitale / objectif par défaut existant). Le diagnostic recommande ce filtre au sélecteur — pas de refonte, un test au point d'entrée.

## 3. Mission L0→L3

- **L0 — Tests FIRST** (`apps/server/tests/`) : waypoint géométrique sur l'eau → re-tiré vers le candidat praticable (rouge avant fix — reconstituer la géométrie NP8JEE : anneau 3/6 coins avec tuiles marines) ; unité plantée → ordre émis vers le nouveau waypoint ; TOUS candidats non praticables → repli jamais-inactif (pas d'inertie) ; déterminisme 30 seeds ; non-régression exploration (BOT-EXPLORATION, HUTTE-EXPLORATION) et anti-piétinement (OSCILLATION-MARCHE : le piétinement mesuré ne remonte PAS).
- **L1 — Code** : filtre de praticabilité au sélecteur (`botPolicy.ts:267` zone), re-tir déterministe, table `bot.json` si un rayon/paramètre émerge — zéro durcissement, réutilise le BFS existant.
- **L2 — Bancs** : banc bot 40×3 AVANT (`22ebde7`) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-praticabilite.json`) — zéro collapse, piétinement résiduel mesuré **en baisse ou égal** (jamais en hausse — si en hausse : arrêt-pour-approbation, le filtre a trouvé le mauvais chemin). Re-simulation du cas NP8JEE : u4 reçoit un ordre praticable (preuve locale tsx, miroir du diagnostic).
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200.

## 4. Critères d'acceptation

Cas NP8JEE re-simulé : ordre praticable émis (rouge avant fix) · banc bot zéro collapse, piétinement non dégradé · suites vertes · `schemaVersion` 28 · exploration non-régressive.

## 5. Périmètre interdit

`defenseVille.ts`, `escortColon.ts`, gate R-190 / `gateAttaque.ts`, `combatStrengthsOf`, dérivé ORACLE-VERDICT, gainSite, questions Jev, gardien Fortify / R-183, Zii, `schemaVersion`. L'anti-recul et le rappel D3 ne bougent PAS (pistes infirmées — ne pas « améliorer » ce qui n'est pas la cause).

## 6. Fin de session

Rapport `REPORT-FIX-PRACTICABILITE.md` à la racine : preuve NP8JEE re-simulée, bancs AVANT/APRÈS, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; banc via `tsx` (~28-29 min) ; UN SEUL worker 8787 ; re-simulation via `tsx` (PAS via un serveur — workerd fige ~10 tours) ; alias `@game/rules` apps/server only ; chaque commit porte ses symboles (`git show` + grep) ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
