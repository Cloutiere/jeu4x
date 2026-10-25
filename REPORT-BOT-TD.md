# REPORT-BOT-TD — Difficultés du bot (Facile/Normal/Difficile) + banc de calibrage

Exécution du 25/10 du `HANDOFF-BOT-TD.md` (décisions Erik 24/10). Tout D1-D4
respecté : « normal » intouché, fog du bot intouché, valeurs de gameplay
intouchées, `schemaVersion` 28 **inchangée** (NB : le handoff dit 27 — la
branche porte 28 depuis DIPLOMATIE-T1, champ méta : aucune migration).

## L1 — test-first (`apps/server/tests/bot-td.test.ts`, 11 verts)

- **Normalisation** : `normaliseDifficulteBot` (@game/shared) — toute valeur
  absente/inconnue retombe sur « normal » (repli D1, couvert par 2 tests).
- **Profil appliqué** : `profileDuBot(difficulte)` lit `bot.json` (sans
  argument = profil global) ; `botPolicy` reçoit la difficulté en 4e
  paramètre optionnel — la recherche (auto vs militaire) et les garnisons
  (quota capitale 2 vs 3) TRIENT différemment (2 tests comportementaux).
- **Lobby → meta → Welcome** : solo « difficile » traversé (dump admin +
  Welcome), inconnu ⇒ « normal » stocké, absent ⇒ Welcome « normal », voie
  structurée 5 sièges portée aussi (4 tests DO).
- **Banc déterministe** : même (difficulté, seed, tours) ⇒ mesures
  identiques bit à bit (2 tests courts, pool Workers).

## L2 — serveur + lobby UI

- `shared` : `DIFFICULTES_BOT` / `BotDifficulte` / `normaliseDifficulteBot`,
  `GameCreationSettings.botDifficulte?` (champ META, miroir du flag `solo`),
  `Welcome.botDifficulte?` (bandeau).
- `lobby.ts` : la difficulté demandée est normalisée puis stockée dans
  `settings` (ancienne forme solo ET config structurée 5 sièges).
- `game.ts` : normalisation à l'`internal/init` (le GameDO reçoit la demande
  brute du client — reprise d'anciennes parties ⇒ « normal ») ;
  `botPolicy(..., meta.settings.botDifficulte)` à la résolution ;
  `Welcome.botDifficulte` (reprise conservée : la meta porte la difficulté).
- `Lobby.svelte` : sélecteur **Facile / Normal / Difficile** (défaut Normal)
  à côté de « Partie publique », envoyé à chaque création.
- `Game.svelte` : pastille adverse — **« Bot 🤖 · Difficile »** (libellé
  capitalisé depuis le Welcome) ; `gameClient` porte `botDifficulte`.

## L3 — banc exécuté (40 parties × 3 difficultés × 150 tours)

Banc SCRIPTÉ (motif CI-FLAKY : corpus fixe de 40 seeds dérivés, RNG dérivés
par bot/tour, zéro hasard externe) — `apps/server/src/bancBotTd.ts` (pur),
exécution hors CI via `apps/server/vitest.banc.config.ts` (pool Node — le
pool Workers ne peut pas écrire les JSON) :
`pnpm -C apps/server exec vitest run --config vitest.banc.config.ts`
(~4 min ; sortie : `devtmp/banc-bot-td.json` + `devtmp/banc-bot-td-run.log`).
Chaque partie : **bot vs bot** (1v1, les DEUX joueurs à la difficulté
testée, carte procédurale miroir `generateProceduralMap(seed, {playerCount:2})`).
Témoin de déterminisme : la partie-étalon de chaque difficulté est rejouée
et comparée bit à bit DANS le banc (vert).

### Tableau comparatif (moyennes sur 40 parties, empires des 2 bots cumulés)

| Difficulté | Villes | Population | Unités | Trésorerie | Techs | PV militaires | Tours moyens | Duels conclus |
|---|---|---|---|---|---|---|---|---|
| facile | 1,83 | 7,15 | 60,0 | 322 | 0,35 | 137,5 | 134,5 | 7/40 |
| normal (**baseline**) | 1,90 | 7,85 | 61,1 | **395** | 0,45 | 142,4 | 139,9 | 4/40 |
| difficile | 1,93 | 7,50 | 61,4 | 343 | 0,43 | 142,3 | 142,3 | 3/40 |

**Lecture (calibrage)** : la gradation est MESURABLE mais MODÉRÉE à 150
tours — facile meurt plus tôt (tours moyens 134,5 vs 142,3), normal amasse
le plus d'or (395 — arbitrage économique sobre), difficile tient la
partie la plus longue. 🔶 **Limite structurelle** : les techs restent
quasi nulles quelle que soit la difficulté (0,35-0,45 techs/empire en 150
tours) — le défaut de conversion or/science (R-90, personne ne pose
SetConversion) écrase l'objectif de recherche « militaire » du profil
difficile ; la différencation par l'ÉCONOMIE de recherche ne pourra se lire
qu'après un chantier R-90 (hors périmètre BOT-TD). Le comportement
tactique (garnisons 3 vs 2, ratio d'attaque 1,0 vs 0,6) est couvert par les
tests unitaires D2 ci-dessus.

### Captures (`dev-logs/captures-bot-td/`, banc `devtmp/bot-td-gui.mjs` PASS)

1. `1-lobby-selecteur-difficile.png` — sélecteur au lobby, « Difficile »
   choisi PUIS « Créer la partie » cliqué DANS L'UI (preuve bout en bout).
2. `2-difficile-carte.png` / `3-difficile-pastille.png` — partie difficile
   (créée par l'UI), god mode, survol pastille : « **Bot 🤖 · Difficile** »
   (Inde — Mohandas Gandhi).
3. `4-facile-pastille.png` / `5-facile-carte.png` — partie facile
   (création WS) : « **Bot 🤖 · Facile** » (Angleterre — Élisabeth I).

Assertions du banc : meta porte la bonne difficulté (×2), Welcome
`botDifficulte` correct (×2, log), bandeau affiché (×2).

## Pièges consignés

- **Routeur hash** : `#/game/A → #/game/B` ne re-monte PAS `<Game>` (pas de
  `{#key}` dans App.svelte) — préexistant, hors périmètre : la 2e partie du
  banc GUI passe par un `page.reload()` (le Welcome « facile » arrivait sur
  une vue restée « difficile »). À cadrer si le changement de partie sans
  reload devient un chemin utilisateur.
- **Sélecteur lobby en test** : le premier `<select>` de `.creation` est
  celui (désactivé) de l'éditeur de config — cibler
  `label:has-text("Difficulté des bots") select`.
- **tests-banc dans la suite principale** : le banc complet doit rester hors
  CI (pool Workers sans fs, ~4 min) — gate `BANC_BOT_TD` + config dédiée.

## Suites

rules **1101** verts / server **206 verts + 1 skipped** (le banc, hors CI) /
web **700** verts / `tsc --noEmit` 0 (shared, rules, server) /
`svelte-check` 0 erreur. 🔶 restants : différenciation économie limitée par
R-90 (ci-dessus) ; le libellé du bandeau affiche la difficulté même
« Normal » (choix d'explicitation — veto possible) ; calibrage fin des
chiffres facile/difficile à l'œil d'Erik en jeu réel.
