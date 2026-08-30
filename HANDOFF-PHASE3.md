# HANDOFF PHASE 3 — Rendu visuel hexagonal & UI client (PixiJS + Svelte)

Tu reprends le pilotage du développement. **Préalables :** lire `DESIGN.md` (§3, §4), `RULES.md`, puis `HANDOFF.md` §4 (conventions — elles restent en vigueur) et `HANDOFF-PHASE1.md` (architecture réseau en place). Vérifier la baseline :

- `pnpm test` vert à la racine (moteur ~132 tests + DO 15 tests) ; `pnpm typecheck` propre dans les 4 paquets.
- Les correctifs de la vérification manuelle sont commités (`1efb019` : file d'attente d'envoi WS dans `net.ts`, page `Join.svelte` réactive).
- Un éventuel `wrangler dev`/`pnpm dev:web` résiduel peut tourner : vérifier les ports avant de relancer.

## Contexte

Phases 0 et 1 complétées : le moteur pur (`resolveTurn`, fog 3 états, journal d'événements) et le socle réseau (`GameDO`/`LobbyDO`, WS hibernation, snapshot/seq/resync, OAuth + stub) fonctionnent, validés manuellement à deux clients. Le client actuel (`apps/web`) a login/lobby/page de partie **sans carte** (état brut JSON + journal textuel).

**Livrable vérifiable de cette phase : une partie se se joue entièrement à la souris contre un bot aléatoire local** — carte hexagonale, caméra, brouillard visuel, ordres à la souris, animations de résolution.

**Spécificités locales :** le port 5173 est occupé par une autre application — le web tourne sur **5174** (`.dev.vars` a `APP_BASE_URL=http://localhost:5174`, ne pas changer). `.dev.vars` existe (gitignored). Desktop only (≥ 1280×720), jamais de mobile.

## Mission — livrables dans l'ordre

### L0 — Correctifs hérités de la vérification manuelle

1. **`missedEvents` à la reconnexion** : observé en test — le journal du client reconnecté est parfois vide alors que le snapshot est l'autorité et que `lastEvents` contient la dernière résolution. Root-cause côté `GameDO.snapshotFor` (et/ou filtre client dans `gameClient.ts`), corriger, et **ajouter un test DO** : résoudre un tour, connecter un nouveau socket, `Snapshot.missedEvents` contient les événements de la dernière résolution et le journal client les affiche.
2. **Warning wrangler** : `Unexpected fields found in top-level field: "environments"` au démarrage — nettoyer `wrangler.jsonc` (format `environments`/`env` attendu par Wrangler 4) jusqu'à zéro warning, en gardant `dev`/`prod` fonctionnels (`wrangler deploy --dry-run` pour valider la config sans déployer).
3. **Mode reveal (dev uniquement)** : pour développer le rendu sans jouer les deux côtés, exposer l'état non filtré au client en développement uniquement — ex. store/page `#/debug/<code>` qui appelle l'endpoint admin existant avec un `VITE_DEV_ADMIN_TOKEN` (`.env.local` gitignored, gardé par `import.meta.env.DEV`, **jamais dans un build de production**).

**Commit dédié. Aucun changement de règles dans `packages/rules` pendant toute la phase (lecture seule).**

### L1 — Socle de rendu

- `pixi.js` v8 en dépendance de `apps/web` ; composant Svelte `<GameCanvas code={code}>` encapsulant l'app PixiJS, détruit proprement au démontage (`onDestroy`), resize observé (ResizeObserver).
- Alignement **obligatoire** avec le moteur : conversions axial→pixel et disposition rectangulaire importées de `@game/rules` (`hexToPixel`, `hexesWithinRadius`, etc.) — orientation **pointy-top verrouillée**. Ne jamais dupliquer les maths hexagonales.
- Caméra : zoom molette borné, pan par glisser (seuil de discrimination glisser-vs-clic ~5 px), recentrage sur l'unité sélectionnée (touche ou bouton).
- **Culling** : ne dessiner que les cases intersectant le viewport (les 1 600 cases tiennent dans PixiJS, mais le culling est requis — DESIGN.md Phase 3) ; helper pur testé.

### L2 — Rendu carte + brouillard visuel (3 états)

- **Inexploré** : fond sombre uni (les cases sont absentes du JSON — ne rien dessiner).
- **Exploré-masqué** : terrain en teinte atténuée/désaturée, **jamais d'entité** (les entités ennemies sont absentes de l'état filtré de toute façon — ne pas inventer de données localement).
- **Visible** : terrain en couleurs, unités/villes du joueur et ennemies visibles.
- **Les assets réels existent déjà** (commit `29723ed`) : 24 fichiers dans `assets-src/exports/`, conformes à `SPEC-ART.md` (7 tuiles 224×256, 2 unités + accents 256×320, 2 villes + accents 224×256, 8 icônes 64×64). Les charger via PixiJS `Assets` depuis `apps/web/public/art/` (copie des PNG — script de sync ou import statique, au choix, mais ils doivent être inclus dans le build Pages).
- **Système d'accent** : chaque entité a un calque `_accent.png` (zones blanches, ancrage identique) à superposer au sprite et teinter avec la couleur du joueur — p1 `#D64545`, p2 `#3B6FD6` (`assets-src/palette.txt`).
- **Fallback placeholder** (`Graphics` → `generateTexture`) conservé pour tout fichier absent (les unités P2 futures arriveront plus tard) : un seul chemin de rendu, résolution texture réelle → fallback.
- PV en barre et indicateur d'ordre : programmatiques, posés par-dessus le sprite.
- superpositions : frontières/couleur de possession des villes, cases travaillées si présentes dans l'état.

### L3 — Interactions & ordres à la souris

- Clic sur une unité amie → sélection (surbrillance) ; panneau contextuel (L5).
- Ordre `Move` : construction de chemin pas à pas (clics sur cases adjacentes praticables connues), confirmation → `SubmitOrder` ; chemin affiché sur la carte ; édition/annulation avant verrouillage (`CancelOrder`).
- Ordres `Hold`, `FoundCity` (Colon), `Attack` (case ennemie visible adjacente), `SetProduction` (menu ville) — mêmes contrats que `packages/shared`.
- Miroir des brouillons via `OrderAck` (déjà en place) ; refus affichés (toast/panneau) ; ordres visualisés sur les unités (marqueur + destination).
- Le client **ne calcule jamais de règle** : il n'affiche que ce que l'état filtré autorise (pas de prévision de dégâts, pas de validation métier locale au-delà de l'UX).

### L4 — Playback des événements

- File d'animation séquencée alimentée par `TurnResult` (et `Snapshot.missedEvents` après reconnexion) : `Move`/`Retreat` interpolés entre cases, `CombatExchange` (flash + PV qui descendent), `UnitDestroyed`/`Captured`/`BootyGold`/`CityFounded`/`CityCaptured` (effets/toasts courts), `Victory` (écran de fin).
- Pendant `phase === 'resolving'` : indicateur visible, interactions d'ordre désactivées ; le playback rejoue le tour manqué après une absence (§3.4).
- Durées courtes (< 3 s par tour typique), skippables (clic = accélérer).

### L5 — Panneau d'unité & menu de ville (overlay Svelte)

- Panneau unité sélectionnée : type, PV, PM, ordre courant, boutons d'action contextuels (Hold/annuler, Fonder une ville si Colon, Attaque si cible visible adjacente).
- Menu de ville (clic sur sa ville) : population, production courante + progression, choix Guerrier/Colon (`SetProduction`), file unique.
- Barre supérieure existante conservée (tour, phase, ressources, statut réseau, Fin de tour, Resync) ; garder la vue « état brut » accessible (mode debug, L0) — elle reste l'outil de référence pendant le développement.

### L6 — Bot aléatoire (mode solo)

- Script Node (`apps/server/src/bot.mjs` + script `pnpm bot -- <code> <nom>`) : login stub (`/auth/dev`), join via lobby WS (`JoinGame`), socket de partie, et à chaque tour : ordres aléatoires **valides** (Hold, ou Move d'un pas vers une case adjacente praticable connue de son état filtré) puis `EndTurn`.
- Utilisable immédiatement : créer une partie dans le navigateur, lancer le bot avec le code, jouer son tour à la souris. Le bot est un client comme les autres — **aucune logique dans le serveur**.

### L7 — Tests, qualité, documentation

- Tests unitaires des helpers purs (culling, construction de chemin, état de sélection) ; suites moteur/DO toujours vertes ; `pnpm typecheck` propre.
- `apps/web/README.md` : commandes, contrôles souris/clavier, capture d'écran du rendu, fonctionnement du bot.
- Rapport final : livrables, tests, ambiguïtés + interprétations, captures avant/après, **proposition pour la Phase 4** (timers/forfait en conditions réelles, persistance complète, admin debug, prototype J1 de bout en bout).

## Critères d'acceptation

1. **Partie solo complète à la souris** contre le bot : créer la partie, inviter le bot, fonder une ville, produire une unité, déplacer, combattre — sans jamais toucher au JSON brut.
2. Brouillard visuellement correct : les 3 états distincts, ennemis apparaissant/disparaissant selon la vision, et le playback rejoue le tour manqué après reconnexion.
3. Caméra fluide (pan/zoom/culling) sur 1 600 cases ; animations non bloquantes et skippables.
4. `pnpm test` + `pnpm typecheck` verts partout ; **zéro modification de `packages/rules`** ; zéro warning wrangler.
5. Le mode reveal est impossible à activer en production (gardé par `import.meta.env.DEV`).

## Périmètre interdit (cette session)

- Pas de modification des règles, des constantes 🔶, ni du protocole réseau (hors L0.1 côté affichage) ; pas de `FormArmy` dans l'UI (contenu Phase 7) ; pas de re-assignment de case travaillée (pas d'ordre v1 pour ça) ; pas de naval, pas de diplomatie jouable.
- Pas de déploiement (même dry-run de push), pas de push distant, pas d'art réel (placeholders uniquement), pas de mobile/responsive.
- Ne pas modifier `RULES.md`/`DESIGN.md` hors annotation « implémenté en Lx ».

## Fin de session

Rapport comme pour les phases précédentes (livrables, tests, ambiguïtés + interprétations choisies, captures), puis **s'arrêter et rendre la main** — la Phase 4 (prototype J1 de bout en bout : robustesse online, admin, validation du livrable jouable à deux humains) sera cadrée avec l'utilisateur.
