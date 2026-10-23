# REPORT-BOT-EXPLORATION — la première unité patrouille (boucle de scout)

**Handoff exécuté le 23/10** (décisions Erik 23/10 — méta 4X : la première unité explore en BOUCLE autour de la capitale, garnison = exception).

## L1 — tests-first (`apps/server/tests/bot-exploration.test.ts`, 12 tests)

Rouge d'abord (8 échecs), puis verts :
- **D1** : 1 unité en paix → objectif `patrouiller`, ordre Move vers l'anneau de rayon 3 ; jamais Fortify/Sleep (pas de siège en ville) ;
- **D1/D5** : `prochainWaypointPatrouille` — les 6 coins de l'anneau visités en CYCLE (fenêtre de 6 répétée sur 14 itérations), tous à rayon exact du centre ;
- **D2** : à 2 unités, la 2e garnisonne la capitale (le scout continue la boucle) ; à ≥ `unitesAvantRenfort` (3), quotas du profil (2 en capitale « normal ») ; facile/difficile non régressés (1 / 3 défenseurs) ;
- **D3** : barbare à distance ≤ 3 → rappel (garnison) ; camp barbare (`villages`) à ≤ 3 → rappel ; barbare à 4 → pas de rappel ; guerre déclarée → rappel ;
- **D5** : mêmes ordres de patrouille quel que soit le seed ; plan stable au même seed.

## L2 — implémentation

- `bot.json` : `unitesAvantRenfort` 3, `rayonPatrouille` 3, `rayonMenace` 3 (les trois profils) ; `BotProfileData` étendu.
- `botPolicy.ts` :
  - `ObjectifKind` + `'patrouiller'` ;
  - `quotaCapitale(profile, nbUnites, urgence)` (exporté, pur) : 0 à 1 unité, 1 ensuite, profil complet au renfort ; **urgence ⇒ quota du profil** ;
  - `menaceAutourCapitale` : unité barbare/ennemie OU camp (`state.villages`) à ≤ `rayonMenace` de la capitale ;
  - `prochainWaypointPatrouille` (exporté, pur) : coin suivant de l'anneau (ordre canonique DIRS, tie-break index minimal — R-81) ;
  - dans `assignerObjectifs` : le **scout** (première combattante, id le plus ancien) reçoit `patrouiller` entre ② et ③, **hors urgence seulement** ; il ne compte JAMAIS comme défenseur présent ; émission `patrouiller` = pas déterministe vers le waypoint (repli Hold, D5).

## L3 — banc e2e GUI (`devtmp/bot-exploration-gui.mjs`) — PASS ✓

Solo légal + GOD-MODE, worker 8787 (proxy Vite figé), captures `dev-logs/captures-bot-exploration/` (2 courses, trace.json + trace.md + captures boucle/2e-unité/capitale-tenue) :
- course 2 (t1-t29) : le scout tourne EN BOUCLE visible (t1-t26 — les positions se répètent cycliquement), rayon ≤ 3, jamais fortifié, jamais en ville ; 2e unité t27 → **capitale tenue t29**. La course 1 a en plus montré un **rappel D3 en conditions réelles** (barbare apparu près de la capitale : le scout rentre t15-t18, garnison reprise).

## Pièges consignés

- Vite est figé sur 5174 ET son proxy (/api, /ws, /auth) sur 8787 : les bancs GUI doivent lancer le worker sur 8787, pas un port dédié (le login passe par le proxy).
- La capitale du bot n'existe qu'après la résolution du tour 1 (fondation par le colon) : avancer d'un tour avant de chercher `capBot`.
- Le scout peut dépasser ponctuellement le rayon 3 (t14 course 1 : dCap=4) — contournement de côte par `pasVers`, non bloquant.

## L4 — suites

- rules **1101/1101**, server **161/161** (dont 12 nouveaux), web **691/691** ; `tsc` 0 (rules + server), svelte-check 0 erreur.
- `schemaVersion` inchangée (28) ; périmètre interdit respecté (pas de T-B/T-C, pas de fog bot, pas de valeurs de combat).
