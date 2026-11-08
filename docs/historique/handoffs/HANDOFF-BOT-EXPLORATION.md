# HANDOFF-BOT-EXPLORATION — La première unité patrouille (boucle de scout), quota de garnison dynamique

**Décisions Erik 23/10** (recherche de méta 4X validée par Erik : la première unité part explorer en BOUCLE autour de la capitale ; garnison = exception). Correction du comportement observé en god mode (tout rentre en ville dès le départ).

## 1. Préalables

- Lire `apps/server/src/botPolicy.ts` (assignerObjectifs — priorités ①→⑤) et `packages/rules/src/data/bot.json` (3 profils).
- Baseline : suites vertes à jour, `schemaVersion` 27, **serveur seul**. Vérifier `git status`.

## 2. Décisions (Erik 23/10 — méta 4X validée)

- **D1 — La première unité PATROUILLE, elle ne garnisonne pas** : tant que l'empire n'a qu'UNE unité (ou moins que `unitesAvantRenfort` — donnée, défaut 3), la priorité garnison vaut **0 en capitale** : l'unité exécute une **boucle de patrouille** autour de la capitale (rayon data-driven, défaut 3-4 — « scouting loop » : waypoints déterministes en anneau, répétables, jamais un aller simple vers le bout de la carte).
- **D2 — Fin de patrouille / montée en défense** : dès qu'une 2e unité existe, elle garnisonne la capitale (quota 1) et la première continue la boucle élargie ou passe à l'exploration lointaine (⑤) ; à ≥ `unitesAvantRenfort`, le quota du profil s'applique (2 en capitale pour « normal »).
- **D3 — Exceptions (méta)** : la garnison prévaut IMMÉDIATEMENT si (a) un camp barbare ou une unité ennemie est à ≤ `rayonMenace` (donnée, défaut 3) de la capitale, ou (b) l'état de guerre existe. Rappel des patrouilleurs dans les deux cas.
- **D4 — Exploration lointaine** (pour les unités au-delà de la boucle) : inchangée (case déterministe la plus lointaine hors vision empire).
- **D5 — Déterminisme et validité** : inchangés (R-81, botTurnSeed, ordres validés, Hold en repli).

## 3. Mission

- **L1 — test-first** : début de partie (1 unité → boucle de patrouille, PAS de garnison, waypoints cycliques déterministes) ; 2e unité → elle garnisonne ; ≥ 3 unités → quotas du profil ; menace à rayon 3 (rappel immédiat, garnison) ; guerre déclarée (rappel) ; facile/difficile non régressés ; même seed ⇒ mêmes ordres.
- **L2 — implémentation** : `bot.json` (`unitesAvantRenfort` 3, `rayonPatrouille` 3-4, `rayonMenace` 3 par profil) + logique de boucle (helper pur : prochain waypoint de patrouille).
- **L3 — banc e2e** : bancs bot solo verts ; partie solo légale avec GOD-MODE — captures `dev-logs/captures-bot-exploration/` (t1-t15 : boucle autour de la capitale, puis montée en défense à la 2e unité ; rappel si barbare proche).
- **L4** : suites vertes, typecheck, commit, push, mini-rapport `REPORT-BOT-EXPLORATION.md`.

## 4. Critères d'acceptation

Le scénario d'Erik (god mode) : dès le début, la première unité du bot TOURNE EN BOUCLE autour de sa capitale (pas de siège immobile en ville) ; elle rentre si barbare proche ou guerre ; à la 2e unité, la capitale est tenue.

## 5. Périmètre interdit

T-B/T-C, le fog du bot, les valeurs de combat, `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
