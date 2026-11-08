# REPORT-MERVEILLE-COUT-FILE

**Mission** : HANDOFF-MERVEILLE-COUT-FILE (signalement Erik 05/10) — une merveille en file
affichait « 36 / Infinity marteaux — à l'arrêt » (Colosse de Rhodes) alors que le rush-buy
était juste. Affichage seul, client seul, schemaVersion 27 inchangée.

## Cause

`apps/web/src/components/PanneauVille.svelte` — `itemCost` ne consultait que
`BUILDINGS[item.id]?.cost ?? Infinity` : les merveilles vivent dans la table `WONDERS`,
d'où le coût `Infinity`, l'ETA `null` et le libellé « à l'arrêt » (branche non-fini de
`etas`). Même défaut dans `itemName` (découvert en GUI : la file affichait l'id brut
« stonehenge »).

## Livré

- **`lib/fileProduction.ts`** — deux helpers PURS, les TROIS tables (UNIT_TYPES /
  BUILDINGS / WONDERS) :
  - `coutItem(item): number | null` — coût en marteaux, `null` si l'item est inconnu
    des données (repli honnête : pas d'ETA, jauge masquée — jamais de coût infini
    affiché) ;
  - `nomItem(item): string` — nom affiché, repli sur l'id.
- **`PanneauVille.svelte`** — `itemCost`/`itemName` délèguent aux helpers ; l'ETA
  (`etas`) teste `cout === null` au lieu de `!Number.isFinite` ; la jauge de tête
  entamée n'est rendue que si le coût est connu (garde `!== null` + `!`).
- **Test-first** `apps/web/tests/merveille-cout-file.test.ts` (6 cas) : Colosse =
  coût `WONDERS` fini ; unité/bâtiment inchangés ; ids inconnus → `null` ; noms des
  merveilles (Stonehenge, Colosse de Rhodes) ; garde-fou source « plus de `Infinity`
  dans PanneauVille ». Rouge 4/4 avant fix, vert après.

## Vérification GUI réelle

`devtmp/merveille-cout-file-gui.mjs` (wrangler 8787 + Vite 5174, partie solo
procedural-40) : fondation → conversion science → `SetProduction` Stonehenge
(aucun prérequis) → tours avancés → PanneauVille capturé.
Capture `dev-logs/captures-merveille-cout-file/merveille-en-file.png`, relecture
visuelle PASS : « Stonehenge — 3 / 50 marteaux — dans 16 tours », ni « Infinity »
ni « à l'arrêt ». Verdict script : 4/4 ✅.

## Suites

- web **565** vertes (+6), rules 993, server 120 — intouchées ;
- svelte-check **0 erreur**, 17 warnings (= baseline).

## Notes / pièges

- ⚠ Session parallèle TECHTREE : `TechTree.svelte` modifié dans l'arbre de travail,
  NON touché, NON commité ici (seuls les 4 fichiers de la mission sont dans le commit).
- `unitType(id)` LÈVE sur un id inconnu — `coutItem`/`nomItem` lisent `UNIT_TYPES`
  directement pour garder le repli `null`/id.
- Wrangler local : première instance restée à l'état « Ready » sans répondre aux
  requêtes (zombie workerd) — purge des processus puis relance unique, ports 8787/5174.
- 🔶 Reste à l'œil d'Erik : le Colosse lui-même (capture faite sur Stonehenge, aucun
  prérequis — même code path table `WONDERS`, coût 100 vs 50).
