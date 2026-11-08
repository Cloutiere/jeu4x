# REPORT-GOD-MODE — Révéler toute la carte (outil d'observation des bots)

**Mission livrée le 23/10/2026** — handoff `HANDOFF-GOD-MODE.md` (décisions Erik 22/10, D1-D5).

## Ce qui est livré

- **Message `ToggleGodMode { on }`** (`packages/shared/src/index.ts`) : action immédiate, même contrat que `DeclareWar` — forme validée EN PREMIER par `orderShapeError` (leçon 7f : `case 'ToggleGodMode'`, booléen `on` requis).
- **GameDO** (`apps/server/src/game.ts`) :
  - flag de session PAR JOUEUR (`godMode: Record<string, boolean>`, clé = id de session réel), persisté en storage clé `'godMode'` — hors état moteur, **aucune migration**, survit à la reconnexion et à l'hibernation (D2/D4/D5) ;
  - handler `handleToggleGodMode` : forme EN PREMIER → partie active → **refus si un autre humain participe** (`aAutreHumain` — bots exclus, D1) → persistance → OrderAck + Snapshot de confirmation ;
  - filtrage contourné STRICTEMENT pour la session du demandeur : `snapshotFor` et `broadcastTurnResult` envoient, quand le flag est actif, `etatRevele(...)` (copie `structuredClone` avec `vision.explored/visible` = toutes les cases) et les événements NON filtrés ; les autres joueurs gardent leur fog exact (D2) ;
  - `etatRevele` est nécessaire car le client dessine sa brume graphique depuis `vision.explored` de l'état : sans la copie, l'état aurait été complet mais le voile serait resté.
- **Client** (`apps/web`) : `GameView.godMode` pilotée par le Snapshot/TurnResult (le client n'active jamais localement, D3) ; `client.toggleGodMode(on)` ; combo **Ctrl+J puis W** (chord — deux touches simultanées étant impossibles, Ctrl+J arme 1,5 s puis W confirme) dans le gestionnaire central de `Game.svelte` avec garde saisie texte ; bandeau discret **GOD MODE** or-sur-sombre dans la barre centrale (`.godmode`), conditionné à `$view.godMode`.

## Vérifications

- **Tests-first** : `apps/server/tests/god-mode.test.ts` — 5 verts :
  1. forme `ToggleGodMode` (booléen requis, refus du reste) ;
  2. solo ON : toutes les unités du bot visibles + carte entière dans le snapshot ; OFF : filtrage exact (moins de cases) ;
  3. D5 : le dump admin ne porte AUCUN `godMode` (rien dans l'état moteur) ;
  4. D1 : refus nommé (« un autre humain participe ») dans un 1v1 humain ;
  5. D4 : après déconnexion/reconnexion, le Snapshot porte encore `godMode: true`.
- **Suites** : rules **1101/1101**, server **149/149** (144 + 5 nouveaux), web **691/691** ; `tsc` 0, `svelte-check` 0 ; `schemaVersion` 28 inchangée.
- **E2E GUI** (`devtmp/god-mode-gui.mjs`, PASS — captures `dev-logs/captures-god-mode/`) :
  - `A-brouillard-initial` : fog de départ, zéro bandeau ;
  - `B-god-mode-on` : bandeau GOD MODE + minimap entièrement révélée ;
  - `B2-bots-visibles` : caméra centrée sur la capitale du bot (via `__gameCanvas.centerOn`) — ville, territoire et garnison ennemies visibles, **zéro brume** ;
  - `C-god-mode-off` : brouillard exact reconstitué (noir à l'endroit non exploré) ;
  - `D-reconnexion-on` : après reload, bandeau toujours là (D4) ;
  - `E-reconnexion-off` : après OFF + reload, bandeau absent.

## Pièges rencontrés

- **Brume graphique ≠ état** : premier jet envoyait l'état brut ; le voile restait car le client lit `vision.explored` → `etatRevele` (copie, vision élargie) corrige sans toucher au client ni au moteur.
- **Vite dev** : port figé 5174, proxy `/ws` `/auth` `/admin` figé sur **8787** — wrangler doit tourner sur 8787 pour tout e2e GUI (le script accepte les ports en arguments).
- **Processus e2e** : un WebSocket ouvert garde Node en vie après une erreur — `process.exit` en `finally` ajouté au script.

## Périmètre respecté

Aucun changement d'état moteur, ni de motif de partie, ni de `schemaVersion`, ni du filtrage des AUTRES joueurs, ni des Chroniques passées, ni du 3D.
