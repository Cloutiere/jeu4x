# HANDOFF-TB-SIEGE-DEFENSE — Le siège qui tombe + les bots qui défendent (fusion T-B × calibrage siège)

**Statut : prêt — NON LANCÉ.** Fusion votée par Erik le 31/10 (verdict REPORT-JEV-CALIBRAGE-OFFENSIF §5) : le verrou restant (39 assauts, 0 chute de capitale) et le T-B prévu (bots défendent leurs seuils) vivent dans le MÊME fichier (`apps/server/src/botPolicy.ts`) — une mission, un banc double.

## 0. Préalables

1. `REPORT-JEV-CALIBRAGE-OFFENSIF.md` (§5 : le verrou, l'indice « les 3 victoires viennent de contre-attaques où le tactique a RASSEMBLÉ l'armée ») + `REPORT-JEV-IT4B-DECLARATION.md` + `HANDOFF-JEV-CALIBRAGE-OFFENSIF.md` (pièges §6 : computeVisibleTiles sur unités, cheminMarche vs BFS fog, banc via tsx, motif sans source) ;
2. Code : `apps/server/src/botPolicy.ts` (tactique BOT-ARMEE : fusion trios, priorité garnison, re-absorption des marcheurs ; menu production ~l.1758), `packages/rules/src/data/bot.json` (data-driven), `sableuse/src/partie.mjs` + `joueur.mjs` (le siège côté harnais : l'arrêt DEVANT la ville est un choix D-E2 de la mission précédente) ; `packages/rules/src/turn.ts` (référence siège/garnison/capture — MOTEUR INTERTOUCHÉ) ;
3. ⚠ Discipline : tests FIRST ; harnais d'abord puis port TS bit-à-bit pour tout ce qui touche `sableuse/` ; suite jev-port via `vitest.jev.config.ts` ; bancs bot = **gratuits** (40×3 déterministes, `botSolo` non convergé — 🔶 connu) ; banc Jev réel : **UN SEUL, plafond 0,50 $** ;
4. ⚠ Entrelacement : personne d'autre sur `botPolicy.ts`, `bot.json`, `sableuse/`, `apps/server/src/jev/`.

## 1. Deux fronts, un banc

**Front A — le siège qui tombe (côté tactique, cible captures ≥ 10 %, victoires ≥ 4/10)** :
- **A1 — Rassemblement avant assaut** : tant que l'effectif d'armée assiégeant < `seuils.effectifAssaut` (data bot.json, défaut à calibrer aux tests — point de départ suggéré : 4 unités ou forces ≥ 2× la garnison visible), le tactique NE lance PAS d'assaut sur la capitale : il agrège (fusion trios existante) et retient les marcheurs aux abords au lieu de les envoyer un par un. Le « 39 assauts, 0 chute » doit devenir « N assauts groupés, ≥ 1 chute » ;
- **A2 — Fini la re-absorption en siège** : les unités en marche vers la capitale en mode domination Jev ne sont plus récupérées comme garnison par le tactique tant que le siège n'est pas levé ou l'assaut lancé ;
- **A3 — Non-régression défensive** : ces changements NE doivent PAS affaiblir la défense des villes bot (banc bot 40×3 : le bot doit tenir contre l'IA agressive existante — aucun recul sur captures subies en défense).

**Front B — les bots défendent leurs seuils (T-B voté)** :
- **B1 — Course à l'ONU** : si un adversaire vivant atteint ≥ 16 jalons culturels (80 % de `CULTURE.milestonesTarget`, constante data) et que l'ONU n'est PAS bâtie, le bot devient ÉLIGIBLE à bâtir l'ONU en course (le filtre `if (w.cultureVictory) continue` ~l.1758 devient conditionnel) — priorité production capitale tant qu'il a lui-même ≥ 12 jalons (sinon : parer culturellement = villes/culture, à trancher aux tests, consigné) ;
- **B2 — Protection de capitale** : si un rival en mode domination approche de SA capitale (siège détecté : assauts récents sur ville capitale), le bot regroupe ses forces mobiles vers la capitale menacée (marche défensive existante, priorité renforcée) ;
- **B3 — Zéro changement moteur** : R-188, R-189, seuils de victoire, merveilles : INTACTS. `schemaVersion` 28.

## 2. Mission L0→L5

- **L0** : préalables, suites vertes (sableuse 140, server 388, jev-port 30, rules 1101) ;
- **L1 — Tests FIRST** : front A (rassemblement : pas d'assaut sous l'effectif, assaut groupé au-delà, marcheurs non re-absorbés, défense non affaiblie) ; front B (éligibilité ONU conditionnelle, gate 16 jalons, protection capitale) — unitaires botPolicy + tests harnais si le côté Jev passe par le harnais (port TS bit-à-bit, tests croisés jev-port) ;
- **L2 — Bancs bot 40×3 (gratuits)** : non-régression A3 prouvée (difficultés Facile/Normal/Difficile, aucune régression captures/temps de survie) ; le botSolo non convergé est 🔶 connu — ne pas tenter de le corriger ici ;
- **L3 — Banc Jev UNIQUE ≤ 0,50 $** (10 seeds corpus) : tableau calibrage → TB-siège : captures de capitales ≥ 10 % des guerres (LE critère raté), victoires ≥ 4/10, percée ≥ 40 % (non-régression 67 %), stériles ≤ 1, 0 guerre avant rencontre, fondations ≥ 2,5 ; ET l'effet front B : les parties où le bot approche des jalons → le bot réagit (consigné même si le corpus n'active jamais la course — alors un banc bot dédié gratuit le prouve). Chaque changement attribuable au transcript ;
- **L4 — Suites complètes** (server, jev-port, rules, web, svelte-check, typechecks), commit + push, rapport `REPORT-TB-SIEGE-DEFENSE.md` (tableaux deux fronts, transcripts des capitales tombées et des défenses).

## 3. Critères d'acceptation

1. **Captures de capitales par Jev ≥ 10 % des guerres** et **victoires ≥ 4/10** (les deux critères ratés du calibrage) ;
2. Percée ≥ 40 %, stériles ≤ 1, 0 guerre avant rencontre, fondations ≥ 2,5 (non-régressions) ;
3. Bancs bot 40×3 sans recul défensif ; front B prouvé (banc ou unitaires) ;
4. Suites vertes, `schemaVersion` 28, budget ≤ 0,50 $, zéro changement moteur.

## 4. Périmètre interdit

`turn.ts` et tout le moteur (siège, garnison, capture : leurs règles ne bougent PAS — c'est la TACTIQUE bot qui change) ; Jev condensé/questions (la structure v7 tient ; une NOUVELLE question est hors périmètre) ; Zii, client, diplomatie R-189 ; difficultés R-90 (🔶 séparé) ; jamais de secret ni de fichier non tracké d'Erik ; pas de mini-rebanc Jev hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation du pilot : **T3** (ONU victoire immédiate, Grande Muraille impose la paix — à cadrer avec Erik), puis l'atelier voix de Zii et les vieux 🔶.
