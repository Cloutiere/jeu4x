# REPORT-BOT-ARMEE — La guerre vraie : armées offensives, mur défensif, agressivité lisible (26/10)

**Mission** (HANDOFF-BOT-ARMEE, décisions Erik 26/10) : deux livrables — **A** l'armée et la campagne (bot), **B** le mur défensif par les données + agressivité lisible. Livrés en deux commits **47de885** (A) et **bd74a29** (B), poussés, CI/Deploy en cours.

## 1. Livrable A — l'armée et la campagne (47de885)

- **D1 · Masse critique** : l'objectif offensif assemble une ARMÉE de `tailleArmee` unités (bot.json — facile 4, normal 6, difficile 8, montés par le banc) au **point de ralliement** (`rayonRalliement` 2 de la cible, case praticable libre côté ma capitale) **avant d'attaquer**. Campement `Fortify` dans l'anneau ; effectif = membres vivants au rayon ; requis = min(tailleArmee, membres vivants) — une armée entamée garde sa poussée.
- **D2 · Cible de campagne** : `cibleCampagne` = ville ennemie en guerre **la plus proche** de ma capitale (plus la capitale d'office). Persistance **par construction** : cible et membres sont des fonctions pures de l'état (déterminisme R-81) — rien à persister, l'armée ne se disperse pas ; capture → la cible glisse à la suivante ; rappel par l'urgence capitale (BOT-EXPLORATION D3, la garnison absorbe avant le bloc offensif).
- **Priorité SIÈGE** (découverte du banc) : armée complète → la **garnison de la ville** passe avant les unités de campagne dans le ciblage. Sans cela, les assiégeants pourchassent à l'infini les unités qui millent autour — **0 attaque de ville en 150 tours** sur la guerre « Verdun », 68 batailles sans une percée.
- **Circulation** : nouveau `pasVersRoutier` (BFS déterministe) pour rallier/offensiver. Le pas glouton se collait aux lacs/littoraux et oscillait — au god mode, distMin **figée à 15 pendant 25 tours**. Après BFS : l'armée va au contact (distMin 1 observé).
- **Garnisons stables** : les défenseurs en place (comptés dans le quota) ne sont **jamais** du pool d'armée — sinon la garnison se vide alors que le quota la croit en place (D3).
- **D3** : garnisons/patrouilles/économie T-A/T-B inchangées hors le détachement ; ordre canon BOT-TA « jamais d'attaque-suicide » conservé et testé.

## 2. Livrable B — mur par les données + agressivité (bd74a29)

### D4 — valeurs modifiées (actuel → nouveau)

| Valeur | Avant | Après |
|---|---|---|
| T-02 bonus de case de ville (`CITY_DEFENSE_BONUS`) | 0,5 | **0,25** |
| T-17 fortification (`FORTIFY_DEFENSE_BONUS`) | 0,25 | **0,1** |
| Remparts (`cityDefenseBonus`) | 1,0 | **0,5** |
| Palais (`cityDefenseBonus`) | 0,5 | **0,35** |
| `ratioAttaqueMin` (bot.json f/n/d) | 0,6/0,8/1,0 | **0,45/0,5/0,55** |

Aucune règle nouvelle — des valeurs. **Candidats rejetés au banc** : stats d'unités (attaque/défense) cassaient le canon « Guerrier 1/1/1, référence Civ Rev » → revert ; `EXCHANGES_PER_ATTACK` 1→2 cassait 19 tests de sémantique de combat → revert ; `overrunBaseRatio` 6→4 cassait les tests canon d'écrasement → revert.

Diagnostic itératif : le verrou n'était pas le % de bonus mais **l'équilibre du siège** — la régénération défensive (+1 PV/tour en ville) neutralisait toute grifferie à p≈0,2 par échange. Le couple « bonus abaissés + ratio 0,5 » rend l'assaut tentable sans ouvrir le suicide.

### D6 — agressivité lisible ✓ CIBLES ATTEINTES

`seuilGuerreEffectif = seuilRatioGuerre × (1 + modulationSeuilAgressivite × (1 − 2 × agressivite))`, `modulationSeuilAgressivite` **0,7** (×3 profils).

| ρ (Spearman, par civ) | Avant (pre-ARMEE) | Après | Cible |
|---|---|---|---|
| agressivité ↔ déclarations/100 t | 0,14 | **0,52** | ≥ 0,4 ✓ |
| agressivité ↔ batailles/100 t | 0,53 | **0,49** | ≥ 0,4 ✓ |

(Mongolie/Aztèques 0,9 et Rome/Allemagne 0,7 en tête des batailles ; Inde 0,25 dernière — gradation lisible. Test canon BOT-TC recalé à agressivité **neutre** : à agressivité 1, une civ déclare désormais sous l'ancien seuil — par design.)

## 3. Banc d'arbitrage (40×3×150, civs réelles P7) — tableau D5

| Cible D5 | Avant | **Après** | Verdict |
|---|---|---|---|
| 0 écrasement avant t30 | 0 | **0** | ✓ |
| Parties moyennes > 100 tours | 142,9 | **141,6** | ✓ |
| Défense du joueur viable (scénario scripté) | — | **capitale 2 fortifiés + palais tient 6 tours d'assaut mineur** (nouveau test `defense-joueur.test.ts`) | ✓ |
| ≥ 40 % guerres avec percée (batailles + progression ≤ 3) | 3,9 % | **3,7 %** | ✗ NON ATTEINTE |
| ≥ 10 % guerres avec ≥ 1 capture | ~0,7 % | **0,7 %** (3/430) | ✗ NON ATTEINTE |

### Pourquoi percée/captures restent sous la cible — hors périmètre de ce handoff

1. **L'horloge de paix** : `toursPaixMin` 8/12/20 ferme la majorité des guerres **avant** que l'armée (15-20 cases de marche) ait traversé + assiégé. D7 interdisait d'y toucher.
2. **La production défenseure** : en guerre, la ville assiégée sort ~1 guerrier/tour (`poidsMarteauxGuerre` 5) — l'assiégeant raye 1-2 PV/tour, la ville en régénère autant.
3. **Cible de guerre ≠ cible de campagne** : on déclare contre le voisin le PLUS FAIBLE (souvent loin), la campagne marche vers la ville LA PLUS PROCHE — la marche mange la durée de guerre.

**Leviers proposés pour le prochain banc (décision Erik)** : P5/P6 (paix du gagnant à 2×toursPaixMin ; paix conditionnée à une guerre non stérile), cible de guerre = le plus faible **parmi les proches** (distance pondérée), régénération défensive en ville comme donnée (ex. 1 PV/2 tours), `delaiEntreGuerres` difficile 12→20 (P2, toujours en attente).

## 4. Validation god mode (devtmp/bot-armee-gui.mjs → dev-logs/captures-bot-armee/)

Guerre déclarée par le bot ✓, rassemblement (amas de 3+ unités à ≤3 d'une ville cible) ✓, armée **au contact** (distMin 1) ✓, captures d'écran `assaut-t*.png`. Capture de ville non obtenue sur les seeds GUI testés (même cause : équilibre du siège ci-dessus) — 🔶.

## 5. Suites et fichiers

- L1 test-first : `bot-armee.test.ts` 25 verts (cible campagne, armée, ralliement, persistance, rappel, BFS, D6), `defense-joueur.test.ts` 2 verts.
- Suites : rules **1101** verts, server **274** verts (+3 skip), `tsc 0`, `svelte-check 0`.
- Tests canon recalés : `bot-tc` (agressivité neutre), `data.test` (palais/remparts), `fortify`/`phase7e` (graines re-calées **par issues réelles** — l'ancien scan supposait que le jet de combat était le 1er `next()`, faux en général).
- Artefacts devtmp (non trackés) : `banc-bot-armee-{avant,avantB,D4c1,D4c3,D4c5,FINAL}.json`, `banc-armee-analyse.mjs`, `sonde-siege*.mjs`, `bot-armee-gui.mjs`.
- `schemaVersion` 28 intouchée (aucun champ d'état — tout est dérivé). Fog du bot inchangé, paix inchangée (D7).

## 6. À juger en jouant par Erik (arbitre du ressenti)

1. **Le ressenti du siège** : les bonus de ville abaissés (T-02 0,25, fortify 0,1, remparts 0,5, palais 0,35) se voient aussi en PVP joueur — vos capitales sont plus prenables qu'avant (le scénario scripté garantit « tenir une attaque mineure », pas un siège sérieux).
2. **Le rythme des guerres** en difficile (tourMin 8, delai 12, facteur 1,5, modulation 0,7) : les civs agressives déclarent contre des voisins égaux — cadence à vérifier à l'œil.
3. **Les armées de 6-8 unités** (normal/difficile) : visible en god mode, mais en jeu réel le quota de garnison en guerre absorbe d'abord — densité de campagne à juger.
4. Levetos éventuels → itération par edit de données (bot.json / constants.ts / buildings.json) au handoff suivant.

## 7. Arrêt

Deux commits poussés (47de885 A, bd74a29 B), CI/Deploy en cours à la remise de la main. Rapport remis.
