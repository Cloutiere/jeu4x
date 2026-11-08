# REPORT-VISUEL-ARMEE — Une armée se voit : 3 icônes sur la bannière, barre proportionnelle

**Statut : LIVRÉ EN ATTENTE D'ERIK — captures à l'œil AVANT commit (règle d'Erik, arrêt-pour-approbation).** Suites web **758/758** (751 + 7 nouveaux) et svelte-check **0 erreur**. Aucun commit tant que le visuel n'est pas validé.

## 0. Ce qui a été fait

**Décision d'Erik endossée telle quelle** (handoff §1) : 3 fois l'icône de l'unité sur une première ligne de la bannière, barre de vie en dessous ; asset unité INTOUCHÉ ; une unité simple reste exactement comme avant (le contraste 1 vs 3 est le signal).

### L1 — module pur + tests FIRST

`apps/web/src/lib/render/icones-unites.ts` (rendu pur, motif du module existant) :

- **`ARMEE_BANNIERE`** — constantes de calibrage éditables à l'œil SANS code : `nombreIcones 3, cote 18, gap 4, tailleIcone 14, ecartAxe 11` (axe de la rangée à 11 px AU-DESSUS du sommet de la barre).
- **`geometrieIconesArmee()`** — positions x de la rangée, CENTRÉE sur l'unité, emprise 62 px ≤ largeurTotale 80 (testé : symétrie, sans chevauchement, mini-icône < carré).
- **`pvMaxAffiche(hpMax, isArmy)`** — LE FIX D3 : au moteur, une armée porte `ARMY_SIZE × hpMax` = **9 PV** (turn.ts:2564, canon R-31) alors que `unitType(type).hpMax` reste **3** (celui du premier membre — l'armée est créée avec le type du guerrier de tête). La boucle de rendu divisait par 3 → `ratio` écrasé à 1 : **une armée blessée affichait une barre PLEINE**. Correction CÔTÉ AFFICHAGE SEULEMENT (D4 respecté — moteur/serveur/schemaVersion 28 intouchés). Chaque bloc ≈ un membre : 5/9 → ~1,7 blocs.

### L1 — câblage GameCanvas.svelte (rendu pur)

- `buildUnitContainer(unitId, type, owner, estArmee = false)` : l'armée ne prend PAS le carré latéral ; ses 3 mini-icônes (mêmes textures d'icônes existantes — pipeline ICONES-UNITES réutilisé, AUCUN nouvel asset) sont posées sur leur propre ligne AU-DESSUS de la barre, qui reprend la géométrie historique PLEINE (fond 80, cellules 70/3). Labels `iconeArmeeFond{i}` / `iconeArmee{i}`, masqués par défaut.
- Boucle de rendu : carré+icône simples ssi `!isArmy`, 3 mini-icônes ssi `isArmy` (teinte joueur sur le fond, miroir exact du carré simple) ; ratio PV via `pvMaxAffiche`.
- Garde de rebuild : le flag `__estArmee` est mémorisé sur le conteneur — une armée étant une unité NOUVELLE (fusion R-44, `nextId`) le flag ne bascule jamais en place, mais le garde reconstruit proprement si jamais. Copies couture (`gererCopies`) passent `isArmy`.
- Intouchés (D4) : sprite unité, rendu de tuile, panneau (au-delà du libellé « (armée) » existant), moteur, serveur, schemaVersion 28.

### L2 — labo visuel (script `devtmp/visuel-armee-gui.mjs`, miroir geste-armee-gui)

Partie solo vs bots (pangee-40), mise en scène headless par WS : croissance 3 guerriers → **FormArmy D'ABORD** puis chemins des membres (voir piège P2) → fusion t15 → armée sortie de ville (pleine bannière en campagne) → blessure par combat barbare → captures navigateur 1280×720, centrage caméra (raccourci C). Captures : `dev-logs/captures-visuel-armee/` :

1. `1-armee-pleine-selectionnee.png` — armée 9/9 EN CAMPAGNE sélectionnée : 3 haches sur la première ligne, barre 3 blocs pleins, Ville1 à côté.
2. `1b-unite-simple-contraste.png` — MÊME CADRE : guerrier simple (1 icône) vs armée (3 icônes) — le contraste D2 en un coup d'œil ; panneau « Guerrier » PV 3/3 et bouton « ⚔ Former une armée… ».
3. `2-armee-blessee-selectionnee.png` — armée 8/9 (combat vs barbare u9, t30) : barre à ~2,7 blocs (2 pleins + bloc partiel) — la vie restante SE LIT (D3). Armée revenue en garnison de Ville1 : la bannière 3 icônes s'applique aussi en mode compact (consigné).

## 1. Pièges rencontrés (consignés)

- **P1 — workerd zombie** : après le kill d'un wrangler figé, DEUX workerd écoutaient encore 8787 (le nouveau répondait « Ready » mais ne servait rien). Purge complète `taskkill //F //IM workerd.exe` avant relance.
- **P2 — `POST /login` n'existe plus** : le serveur actuel logine par `GET /auth/dev?name=…` (redirect + cookie de session). Le script geste-armee-gui (04/11) est STALE sur ce point — à l'œil si réutilisé.
- **P3 — l'exemption R-44 exige l'ORDRE FormArmy** : co-localiser 3 guerriers sur la ville SANS FormArmy fait tronquer leurs Moves par R-159 (co-destinations amies) — les guerriers oscillent sur l'anneau de la ville sans jamais converger (exécutions 1-2). Le canon est : **FormArmy (members + rally) D'ABORD, puis les Moves** — la fusion tombe à la résolution (tour 15, 3 exécutions sur 3).
- **P4 — blessure stochastique** : l'armée 9 PV vs guerrier barbare 3 PV domine — elle gagne souvent SANS perdre de PV (0-3 selon les jets). Deux exécutions sur quatre ont donné une blessure (6/9, 8/9). Le script boucle jusqu'à 60 tours ; si échec, il capture la pleine seule et le consigne.

## 2. À l'œil Erik (veto attendu)

- Calibre des mini-icônes (14 px dans carré 18, gap 4) et l'écart au-dessus de la barre (`ecartAxe 11`) — tout est dans `ARMEE_BANNIERE`, ajustable sans code.
- La barre de l'armée reprend la géométrie historique PLEINE (fond 80) puisque le carré latéral disparaît — plus large que la barre d'une unité simple avec icône (58). Si Erik préfère la même largeur que l'unité simple : retour au labo, un paramètre.
- Icônes non retournées au flip (quasi symétriques — consigné, motif ORIENTATION-UNITES).
- Noté hors périmètre (D4, intouché) : le PANNEAU affiche « PV 9/3 » / « PV 8/3 » — le dénominateur y est le hpMax du type (3) ; c'est l'affichage préexistant du panneau, non touché. À l'œil Erik si gênant (mission séparée).
- Types SANS icône cuite (PNG absent) : repli actuel = pas de mini-icônes (comme l'unité simple sans icône — aucun trou visuel, D3 universel).

## 3. Critères d'acceptation

1. Une armée se distingue d'une unité en un coup d'œil (3 icônes) — capture 1b. ✓ (à l'œil Erik)
2. La vie restante d'une armée blessée se lit (8/9 → ~2,7 blocs) — capture 2. ✓ (à l'œil Erik)
3. Zéro changement hors bannière ; asset unité intact ; suites web vertes ; captures avant commit. ✓

## 4. Rév. 2 (retour Erik, photo zoomée) — 6cd899a

Les carrés de la ligne de vie étaient décalés de la barre noire, barre non centrée sous les icônes. Cause : la boucle de rendu recalculait la géométrie avec `geometrieBarre(avecIcône)` SANS `isArmy` — le build posait la géométrie armée mais la boucle l'écrasait par la géométrie unité-avec-icône (fond 58 recalé à droite de la rangée centrée). Fix : `geometrieBarreArmee()` — fond sur l'emprise exacte de la rangée d'icônes (62 px), build ET boucle sur la MÊME géométrie (test par présence des labels `iconeArmeeFond*`). Unité simple strictement inchangée. Web 759/759, svelte-check 0. Recapture 6R8D7G : pleine 9/9 alignée, blessée 7/9 (2 blocs + 1/3) alignée. Piège au passage : module modifié servi STALE par le dev-server Vite tant qu'il tournait depuis avant l'édition — redémarrer Vite avant recapture.
