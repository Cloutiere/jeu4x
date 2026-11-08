# REPORT-EMBARQUEMENT-PROGRAMME

**Mission** : HANDOFF-EMBARQUEMENT-PROGRAMME (décisions d'Erik du 03/10, D1-B..D7) — le moteur connaît les chemins programmés des navires : embarquement à la volée, ramassage en marche, dépose au premier pas possible (le navire poursuit), embarquer/débarquer termine le tour, la ville portuaire n'est jamais un embarquement, passe navale d'abord, capacité de chargement infinie.

## Livré

### Moteur (packages/rules/src/turn.ts)

- **D6 — passe navale d'abord (R-41 amendée)** : la Phase A exécute `collectMoveOrders` en DEUX passes `unitId` croissant — navales puis terrestres (barbares compris, leurs ordres étant déjà fusionnés dans `allOrders`). Un guerrier `unitId` inférieur au navire est traité APRÈS lui.
- **D1-B — embarquement à la volée** :
  - *case d'arrêt* : la co-destination amie R-159 ne tronque plus les chemins dont la destination est le terminus d'un transport ami (embarquement, capacité infinie — l'arbitrage se fait à l'exécution). C'est le verrou qui rendait le scénario de la capture impossible ;
  - *ramassage en marche* : un transport qui ENTRE sur une case portant des unités terrestres amies (ville portuaire comprise) embarque toute la pile et poursuit (branche avant le blocage d'entrée amie R-30) ;
  - *limite §4.5* : un pas intermédiaire déjà franchi ne rencontre rien — comportement émergent (l'unité terrestre ne peut pas entrer sur l'eau sans transport), verrouillé par test.
- **D2-A/D3-A — dépose** (`tenterDepose`) : à chaque position du navire (contrôle initial compris, puis à chaque pas, puis à l'arrêt), le premier passager portant un `Move`/`MultiStep` dont le premier pas est une case terrestre LIBRE adjacente est déposé ; le navire ne paie aucun PM et poursuit. Ordre jamais déclenchable → ignoré proprement (cargaison à bord, ordre effacé, consigné `decide('depose-impossible', …)` dans la trace de résolution). Les unités déposées sont marquées dans `board.deposees` (interne, jamais sérialisé) : la passe terrestre ne les exécute pas et ne re-gèle pas leur ordre consommé.
- **D4 — fin de tour** : embarquement = PM 0 + chemin annulé (`order: null` — l'ancien gel « pour débarquer au tour suivant » est abrogé ; les chemins gelés HISTORIQUES d'une partie reprise gardent leur rôle de cible de dépose, premier pas du chemin) ; dépose = PM 0, ordre null, zéro attaque (vérifié avec un assaut-test 99 adjacent).
- **D5 — ville portuaire** : la branche d'embarquement refuse toute case portant une entité de ville (`cityAt`). **Découverte consignée** : le moteur AVANT cette mission embarquait AUSSI dans la ville (le récit « impossible d'embarquer » venait du seul client) — D5 l'interdit désormais côté moteur, verrouillé par test (le guerrier est refusé par R-30, le transport reste défenseur).
- **D7 — capacité infinie** : les conditions `cargo === null` disparaissent ; la pile se lit par `aboard` ; `moveUnit` miroite TOUTE la pile, le naufrage coule TOUTE la pile. Le champ `cargo` de l'état garde le PREMIER passager (compat schéma 27 — dump serveur, UnitPanel, GameCanvas inchangés structurellement). **Aucune migration** : `schemaVersion` inchangée (27).
- Événements `Embark`/`Disembark` inchangés → playback, journal, laboCombat et replay REPLAY-RESOLUTION miroir sans retouche.

### Client (apps/web)

- `boardableTransport` : plus de veto « cargaison pleine » (D7) ; veto VILLE (D5).
- **`destinationsEmbarquement(state, orders, owner)`** (nouveau, pur) : case courante + toutes les cases du chemin programmé (ordre soumis, sinon gelé) de chaque transport ami — villes exclues. `pathTo` accepte un 4e paramètre `embarquables` ; `rightClickAction` le calcule et le passe → le clic droit du guerrier vise la case d'ARRÊT du navire (FLECHE-MOUVEMENT : le survol `creeCacheChemins` reçoit le même ensemble, clé de cache étendue).
- **D3-A** : `deposeValide(state, view, cargo, hex)` (nouveau, pur — miroir exact du moteur : terrestre entrable libre, adjacente à la position du transport ou à un pas de son chemin) ; `rightClickAction` d'une cargaison sélectionnée produit un `moveDraft` d'UN pas (aperçu fantôme existant). `unitsWithoutOrders` inchangé (une cargaison avec ordre de dépose compte comme ordonnée).
- **UnitPanel** : chips de TOUTE la pile à bord (`passagers`, dérive `aboard`) ; nouveau prop `onSelectUnit` (câblé dans Game.svelte) — la cargaison devient sélectionnable depuis le navire ; les boutons « Débarquer en (q,r) » adjacents restent (raccourci du cas immédiat) ; textes mis à jour (D4 : plus de reprise après débarquement).

### Tests

- **rules** : nouveau `tests/embarquement-programme.test.ts` (14 tests : scénario de la capture, ramassage en marche, dépose au 2e pas d'un navire 3 PM avec ZÉRO attaque malgré ennemi adjacent, dépose au contrôle initial, dépose impossible + journal, D4 embarquement/débarquement, D5 ville, bateau bloqué, pas intermédiaire franchi, naufrage après dépose, D6 navale-d'abord, D7 pile infinie, reprise chemins gelés). Réécritures motivées R-62 : `phase7g.test.ts` (embarquement : chemin annulé au lieu de gelé ; e2e 7g : embarquement à l'ARRÊT du navire programmé).
- **web** : nouveau `tests/embarquement-programme.test.ts` (7 tests : destinationsEmbarquement + D5, pathTo vers l'arrêt, clic droit de capture, dépose D3-A valide/au pas/hors chemin/occupée). Réécritures D7/D4 dans `tests/embarquement.test.ts` (« cargaison pleine » → capacité infinie ; gel post-embarquement abrogé ; le débarquement T3 sans ordre reste à bord).
- **Bancs verts** : rules **968/968**, web **495/495**, server **120/120**, `svelte-check` **0 erreur** (14 warnings préexistants).

### e2e + captures

- `devtmp/embarquement-programme-e2e.mjs` (motif `embarquement-e2e.mjs`) : partie solo pangee-40, fonde une ville portuaire à côte ouverte, y produit la galère :
  1. **scénario de la capture** — galère programmée ville→eau (clic droit), guerrier adjacent programmé sur la case d'ARRÊT (clic droit, embarquables) → résolution : `aboard` vérifié au dump serveur ;
  2. **dépose en chemin** — galère (cargaison à bord) programme une chaîne de 2 pas ; la cargaison donne un `Move` terrestre adjacent au 1er pas → résolution : déposée sur sa case (aboard null, cargo null) et **navire poursuivi jusqu'à son arrêt** (-10,21), vérifié au dump.
  Captures `dev-logs/captures-embarquement-programme/` (programmation, cargaison à bord, navigation, dépose, déposée à terre).

## Défauts 🔶 et notes

- 🔶 **Geste GUI D3-A non piloté en e2e** : le harnais e2e soumet la dépose par WS (le geste chip → clic droit est couvert par les tests unitaires `deposeValide`/`rightClickAction`). Les tentatives GUI se heurtaient à deux bruits de harnais : (a) le client local rate parfois un `TurnResult` (workerd — broadcast perdu, état GUI périmé même à tour affiché égal) ; (b) `clickHex` sur le navire ouvrait le panneau de ville dans ces états périmés. **À vérifier en ligne par Erik** : navire sélectionné → chip cargaison → clic droit terrestre = « débarque ici ».
- 🔶 **Champ `cargo` = premier passager uniquement** (compat schéma 27). Le dump serveur (`cargo`/`cargoType` game.ts:754) et le dot 🚢 GameCanvas ne montrent donc le charge que pour la première unité embarquée ; la pile complète est visible dans l'UnitPanel (chips).
- 🔶 **Chemins gelés pré-03/10 d'une partie en cours** : le chemin gelé d'une cargaison (ancienne sémantique « suite de marche ») est désormais interprété comme cible de dépose (son premier pas) ; s'il visait l'eau, la dépose est ignorée proprement (reste à bord). Aucune migration.
- 🔶 Worker wrangler local : EndTurn refusé tant qu'une ville à marteaux n'a pas de production (comportement connu FIN-DE-TOUR-PRODUCTION) — le harnais e2e pose une production à TOUTES les villes à chaque fin de tour.
- Bot : `botPolicy` ne programme ni embarquement ni dépose — inchangé.

## Reste à vérifier en ligne par Erik

1. Le geste complet D3-A en GUI réel (chip → clic droit terrestre → dépose à la résolution) — voir 🔶 ci-dessus ;
2. Le survol (flèche pointillée) vers la case d'arrêt programmée d'un navire ;
3. Le rendu de la pile multi-passagers (chips + débarquements unitaires) au-delà de 2 passagers ;
4. Le journal/replay d'un tour comportant ramassage + dépose (événements `Embark`/`Disembark` intercalés aux pas du navire).

## Périmètre respecté

`cargoCapacity` non re-tranché (D7 infinie, dossier séparé) ; combat naval R-118 intact ; pas d'aérien ; pas de pause-and-resume ; pas de 3D ; `schemaVersion` 27 inchangée ; aucun fichier non tracké d'Erik commité.

## Addendum — rév. du 03/10 (constat d'Erik en jeu, décision immédiate)

**Constat** : galère programmée à portée, guerrier programmé sur l'arrêt, puis galère prolongée plus loin → le pas visé par le guerrier devient INTERMÉDIAIRE ; à la résolution le navire l'a déjà franchi, le guerrier entre sur une eau vide → « Déplacement impossible ». C'était la limite §4.5 consignée au handoff.

**Décision d'Erik** : « le moteur doit permettre ce type de mouvement » — le guerrier DOIT embarquer.

**Implémenté — rendez-vous virtuel** : le moteur enregistre la ROUTE RÉELLEMENT TRAVERSÉE ce tour par chaque transport (`board.routesNavales`, départ + chaque case d'entrée, interne au Board) ; la branche d'embarquement de la passe terrestre admet désormais une destination qui est un pas de cette route même si le navire ne s'y trouve plus — l'unité embarque, position miroit le navire là où il est (départ quitté, pas intermédiaire franchi, arrêt : les trois cas marchent). Un bateau bloqué avant le pas n'a jamais rallongé sa route jusqu'à la case → aucune rencontre (test inchangé, toujours vert). Le client n'a pas besoin de retouche : le geste était déjà offert (`destinationsEmbarquement` inclut tous les pas) — seul le moteur refusait la rencontre.

**Tests** : le test « limite §4.5 » est réécrit (intermédiaire → embarquement, motif R-62) + un nouveau cas « départ déjà quitté → embarquement » ; bancs rules **969/969**, web **495/495**, server **120/120**.
