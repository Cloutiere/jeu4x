# REPORT-BOT-TA — le bot standard « joue correctement » (objectifs, combat, soin)

**Livrée 22/10.** Refonte de `botPolicy.ts` : des OBJECTIFS par unité (D1) au
lieu du brassage aléatoire. Déterminisme verrouillé (D3), bloc data-driven
`bot.json` (D5), production pondérée en guerre (D4). T-B (économie fine) et
T-C (diplomatie/Jev) restent hors périmètre.

## Ce qui a été livré

- **Moteur d'objectifs** (`assignerObjectifs`, pur et testable, séparé de
  l'émission d'ordres) — priorités ① soigner (blessé sous le seuil, hors
  menace, hors territoire ennemi — anneaux culturels approximés par
  `frontierRadius`) → ② attaquer une cible adjacente (unité en guerre,
  gardien de camp barbare R-95, ville ennemie SANS défenseur) au rapport
  favorable → repli (D2) si menace défavorable → ③ garnisonner (capitale
  prioritaire, N par ville ; sur place : Fortify puis Vigilance/Sleep —
  Passer jamais) → ④ chasser les barbares (proie prenable la plus proche) →
  ⑤ explorer (case la plus lointaine hors vision empire — tie-break
  déterministe, pas d'errance).
- **D2** : jamais d'attaque-suicide — ratio S_att ≥ `ratioAttaqueMin` × S_def
  (estimation §7.4 simple : base × vétéran × (1 + terrain + fortification +
  ville/Palais)) ; repli d'un pas vers la ville propre la plus proche.
- **R-187 respecté** : attaquer une unité ou une ville de JOUEUR exige une
  paire dans `diplomacy.war` ; le bot ne déclare jamais (T-C) ; barbares
  toujours légitimes (R-95).
- **D4** : en guerre, une ville sans file produit une UNITÉ si une option
  unité existe (le reste de pickProduction est intact).
- **D5** : `packages/rules/src/data/bot.json` — profils
  facile/normal/difficile (seuilSoinPv, ratioAttaqueMin 0,6/0,8/1,0,
  garnisons 1/1·2/2·3). Seul **normal** est actif (`profil: "normal"`) ;
  T-D livrera les autres + le banc de calibrage.
- **D6** : tous les ordres passent par les formes du joueur ;
  `orderShapeError` testé sur chaque forme émise.
- Naval/débarquement/espion/GP settle/recherche/régimes/rush/GP : portage
  bot.mjs conservé, simplement branché sur les objectifs (galères = cibles
  navales + patrouille, ICBM jamais déplacée).

## Bancs et tests

- `tests/bot-ta.test.ts` — **18 tests** (soin/threat, guerre seule, garde de
  camp, capture de ville sans défense, repli, garnison capitale d'abord,
  Fortify→Sleep, chasse, déterminisme, orderShape, D4 guerre/paix, D5
  données). Suites : **rules 1101/1101, server 143/143, web 691/691**,
  tsc 0, svelte-check 0. `schemaVersion` 28 inchangée (handoff disait 27 —
  DIPLOMATIE-T1 l'a portée à 28, déjà déployée).
- `tests/bot-ta-sim.test.ts` — banc headless **120 tours en guerre** (bot vs
  marche d'attaque p1) : aucune exception, aucun tour > 500 ms.
- `src/botSolo-e2e.mjs` — **victoire par domination au tour 105** contre le
  bot « normal » (97 tours avec déplacements du bot, 84 avec production).
  Harnais mis à jour pour le nouveau bot : **DeclareWar côté Alice (R-187 —
  c'était LE verrou : paix par défaut ⇒ attaques refusées, impasse à 300
  tours)**, recherche + meilleure unité disponible, assaut général quand la
  capitale est défendue (garnison + repli tiennent la fenêtre R-57 à 2
  chargeurs), timeout TurnResult 60 s (journal des guerres longues).

## Captures GUI (`dev-logs/captures-bot-ta/`)

- `01-vue-ensemble-t26.png`, `02-capitale-garnison-t50.png` — partie solo
  réelle (war déclarée) : garnison en place, Chroniques de combat (barbares),
  pastille ⚔ « En guerre » du médaillon bot (intégration DIPLOMATIE-T1).
- 🔶 **À l'œil, limité** : la vue est celle d'ALICE (brume) — le territoire
  du bot n'y est visible qu'au contact. La preuve du comportement du bot :
  dump serveur (`BOTUNITES`) du banc — garnison **Fortifiée sur sa capitale,
  colon en exploration, 2 galères en patrouille, concentration défensive
  (milices + impi) sur le flanc menacé** (parties MTNA9H et la victoire
  t105). Erik jugera en jouant ; les scénarios du banc sont rejouables via
  `node src/botSolo-e2e.mjs` et `devtmp/bota-captures2.mjs` (wrangler local).

## Blocs de calibrage (bot.json — normal)

| Levier | Valeur | Effet |
|---|---|---|
| seuilSoinPv | 2 | soigne si hp ≤ 2/3 |
| ratioAttaqueMin | 0,8 | attaque si S_att ≥ 0,8 × S_def (~39 % d'odds) |
| garnisonsParVille | 1 | 1 défenseur par ville |
| garnisonsCapitale | 2 | 2 défenseurs sur la capitale |

## 🔶 Ouverts / à juger en jouant par Erik

1. **Portée d'attaque** : cibles ADJACENTES seulement (pas de plan
   mouvement+attaque en un tour — le cavalier/chevalier (PM 2) n'en profite
   pas 🔶).
2. **Exploration** : le bot voit l'état COMPLET (cheat consigné du handoff,
   inchangé) ; la cible « la plus lointaine non visible » est par unité
   (les explorateurs peuvent se rapprocher 🔶).
3. **Repli** : un pas vers la ville la plus proche, pas de retraite
   multi-tours coordonnée.
4. **Heal en territoire ennemi** : approximé par le rayon de FRONTIÈRE des
   villes (le refus moteur HealRefused reste possible — l'unité ne soigne
   simplement pas ce tour-là 🔶).
5. **Estimation des forces** : §7.4 simple (traits, soutien naval, Himeji,
   régimes ignorés) — le moteur revalide tout.
6. **Calibrage « normal »** : ratio 0,8 rend le bot combattif à odds ≈ 40 % ;
   les bancs t105 (victoire Alice) et l'impasse des premiers runs montrent
   qu'il TIENT sa capitale — Erik arbitre s'il faut monter/baisser.
7. **Fortify** exige l'état stabilisé (R-174) — une garnison qui vient
   d'arriver tient (Hold) un tour avant de se fortifier.
8. Pièges e2e consignés : workerd gèle aléatoirement en tour ~31-70 (le
   même code a tenu 300 tours d'un autre run) ; polling admin + journal
   long étranglent le DO → timeout 60 s.

## Fin de session

Commit unique, CI puis Deploy doivent être verts ; rien des fichiers non
trackés d'Erik n'est committé.
