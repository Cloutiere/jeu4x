# REPORT-GOD-MODE-PRODUCTION — Production des villes IA visible en god mode

**Livré le 23/10.** Client seul, `schemaVersion` 28 inchangée, serveur intact.

## Ce qui a été fait

- **L1 test-first** : `apps/web/tests/bande-ville.test.ts` +2 tests — `construireBanniere` avec `godMode: true` montre croissance/item/ETA d'une ville ENNEMIE (et l'icône quand l'art existe) ; sans le flag, le masquage D3 est verrouillé (régression). 35 tests du fichier verts.
- **L2 client** :
  - `bande-ville.ts` — `EntreeBanniereVille.godMode?: boolean` ; `construireBanniere` ne masque que si `!mienne && !godMode` (D1 : en god mode, TOUTES les villes visibles montrent croissance + production + ETA ; hors god mode, D3 INTACT).
  - `GameCanvas.svelte` — `godModeActif = scene.view?.godMode === true` (déjà porté par le GameView, `gameClient.ts`) ; les candidats (croissance/item/ETA + infobulles `detailsBandes`) sont calculés pour `mienne || godModeActif` ; le flag est passé à `construireBanniere`. Le rebuild suit le Snapshot/TurnResult déjà poussés par la bascule — zéro nouveau message.
- **L3 captures GUI** (`dev-logs/captures-god-mode-production/`, banc `devtmp/god-mode-production-gui.mjs`) : ON — bannière de la capitale du bot avec icône de production (galère) et drapeaux « Tours | 8 | 15 » (croissance, ETA) ; OFF — même cadrage, brume totale (zéro fuite).

## Piège consigné (important pour les prochains bancs)

**Une 2e WebSocket du même joueur ÉVINE celle de la page** : envoyer `EndTurn` depuis une socket de banc empêche la page de recevoir le TurnResult → aucun rebuild client (bannières figées). Les bancs doivent finir le tour PAR L'UI de la page : clic `.fin-tour-rond` puis `text=Finir le tour quand même` (dialogue unités sans ordre).

## Vérifications

- Suites web : 693 verts (58 fichiers) ; svelte-check : 0 erreur.
- Banc e2e PASS (solo + bot, god mode ON/OFF, captures recadrées via `hexToPage`).

## Périmètre respecté

Filtrage fog normal, PanneauVille des ennemis (D2 : inchangé), serveur et `schemaVersion` : intouchés.
