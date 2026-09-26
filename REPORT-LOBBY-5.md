# REPORT-LOBBY-5 — Écran de création de partie à 5 sièges (humains/bots, couleurs, civs, topographie)

Mission exécutée (HANDOFF-LOBBY-5.md), **NON COMMITTÉE — arrêt pour approbation d'Erik (L5)**.
Toutes les décisions tranchées D1-D8 ont été appliquées ; les défauts non vetoables sont marqués 🔶.

## 1. Forme de la config + validateur (L1)

- `packages/shared/src/config.ts` (nouveau) : `ConfigPartie = { sieges: 5×{type:'humain'|'bot', paletteId, civId?}, civsAleatoires, topographie }`.
  - `SIEGES_PAR_PARTIE = 5` (réglable en un seul endroit) ;
  - palettes : **import direct de l'unique `apps/web/src/lib/render/accents.json`** (§factions4) — pas de duplication ; `CLES_PALETTES4`, `ORDRE_PALETTES4`, `PALETTES4`, `nomPalette4()` ;
  - `configPartieErreur()` : validateur dédié AVANT les handlers (même contrat que `orderShapeError`) — forme, 5 sièges, types, palette inconnue/doublon, civ inconnue/doublon (mode manuel ; ignorées si `civsAleatoires`), topographie inconnue, ≥ 1 humain ;
  - `configPartieDefaut(civ)` : siège 1 = hôte (humain, Bleu Saphir), 2-5 bots, palettes dans l'ordre `ordre_joueurs4`, archipel par défaut.
- La config voyage dans `GameCreationSettings.config` (champ **ADDITIF**) : **aucune migration** — les parties créées avant la mission n'en portent pas et suivent le flux historique (testé : `partie 1v1 historique` dans lobby-5.test.ts + suites existantes vertes). La topographie est la liste data-driven `TOPOGRAPHIES` de `packages/rules/src/progen/settings.ts` (l'EXISTANT du labo : pangée / rift+isthme / archipel) — ajouter une topographie = éditer ce tableau.
- Le `paletteId` + `siege` (index de siège) sont portés par `GamePlayer`/`GamePlayerInfo`/résumés lobby (meta uniquement, **zéro champ GameState**, D8).

## 2. Flux serveur (L2)

- **Création** (`handleCreateConfig`) : config validée, carte forcée `procedural-40` (D1 — préfabriquées hors UI, intactes au labo `#/progen`), hôte au premier siège humain, partie `waiting` — l'état moteur N'EST PAS créé (démarrage = acte de l'hôte).
- **Jointure** (`handleJoinConfig`) : premier siège humain libre + couleur **libre** (unicité SERVEUR, refus explicite « couleur déjà prise par X ») + civ libre (unicité en mode manuel). `demarrageManuel` empêche l'auto-activation du GameDO.
- **Édition** (`UpdateGameConfig`, hôte, `waiting`) : même validateur ; les sièges humains occupés restent humains et gardent couleur/civ de leur occupant (un invité ne peut pas être délogé) ; la copie `settings` du GameDO est alignée immédiatement (le dump admin ne ment pas).
- **Démarrage** (`StartGame`, hôte, `waiting`) : garde D6 « tout siège humain doit être occupé » (sinon refus — les bots ne remplissent que les sièges bots) → tirage seedé des civs aléatoires (16 distinctes, même seed → même tirage) + civs de confort tirées pour les bots laissés sans choix → `/internal/configurerJoueurs` (civs + palettes + config sur le GameDO) → remplissage des sièges bots par le chemin NORMAL `/internal/join` (ids réservés `bot`, `bot:4`, `bot:5`) → le dernier join crée l'état initial (civSetup + `paletteId` par joueur).
- **Abandon en salle d'attente** : un invité libère SON siège (`/internal/leave`, partie continue) ; l'hôte supprime la partie. Robustesse : une divergence lobby/GameDO ne bloque plus l'abandon (409 toléré).
- Tests : `apps/server/tests/config-partie.test.ts` (12) + `tests/lobby-5.test.ts` (11 : collision couleur, sièges humains pleins, civs doublons, UpdateGameConfig hôte/invité, solo 1+4 bots, duel 2+3, civs aléatoires distinctes, quitte-la-salle, 1v1 historique intact, refus siège humain vide). **Suite serveur : 111 verts ; moteur 895 verts ; web 380 verts ; typecheck 0 erreur.**

## 3. Client (L3)

- **D5 — la palette choisie pilote l'accent EN JEU** : `accents.ts` gagne `definirPalettesJoueurs(map engineId→paletteId)` (appelée par `GameCanvas.onNewView` depuis `Welcome.players`), `paletteDe(owner)` (override par partie, sinon défaut par index de siège, barbare inchangé) ; `playerColor()` (textures.ts) est devenu DYNAMIQUE → barres PV, anneaux de ville, zone cultivée, frontière culturelle, camps, mêlée, GLB suivent automatiquement. Les variantes cuites sont chargées PAR PALETTE (`guerrier@bleu-saphir` ← `j1..j7` via `ordre_joueurs4`) et la sélection en rendu suit la couleur choisie, plus l'index de siège (fallback clé historique `@pN` conservé). Testé : `apps/web/tests/accents-par-palette.test.ts` (6).
- **Lobby.svelte** refondu : écran de création 5 sièges (rangées Humain/Bot — siège 1 fixé humain, nuancier des 7 palettes 4 tons avec prises grisées + nom du preneur, civ par siège désactivée si aléatoires, toggle « Civilisations aléatoires », topographies, timer, publique/privée). Les préfabriquées/solo quittent l'UI (D1). Jointure : liste publique (places libres + topographie affichées) → panneau couleur (prises grisées avec preneur, temps réel) + civ ; jointure par code pareil.
- **Attente.svelte** (nouveau, `#/attente/<code>`) : vue hôte (tout éditable, bouton Lancer désactivé tant qu'un siège humain est vide + bouton Supprimer) / vue invité (lecture seule + Quitter) ; statut des sièges en temps réel (diffusion GameList) ; bascule automatique en jeu au démarrage. Composants partagés : `ConfigPartieEditor.svelte`, `Nuancier.svelte`.
- `Join.svelte` (lien d'invitation) : choix couleur + civ. Bandeau « Adversaires » et `nomJoueur()` : déjà génériques (CARTE-MULTI), vérifiés en capture (Rome = l'invité humain, « Bot : Japon »…).
- Style : thème existant conservé, accent CSS menthe inchangé.

## 4. e2e + captures (L4)

- `apps/server/src/lobby-5-e2e.mjs` (wrangler dev) : création → collision couleur refusée avec le nom du preneur → jointure → UpdateGameConfig (topographie propagée au GameDO, siège invité préservé) → StartGame (5 joueurs, 5 palettes distinctes, bots civs) → Welcome hôte/invité avec paletteId + civ → variante `civsAleatoires` (5 civs distinctes) → l'invité quitte (siège libéré). **PASSANT.**
- Captures `dev-logs/captures-lobby-5/` : `01-ecran-creation-5-sieges.png`, `02-salle-attente-2-humains.png` (Erik + ErikInvite en temps réel), `03a/03b/03d-partie-*.png` (partie démarrée : guerrier cuit Rouge Royal de l'invité, Colon teinté Bleu Saphir, bandeau adversaires), `05-panneau-jointure-nuancier-prises.png` (Bleu Saphir grisée « ErikInvite », Confirmer désactivé).
  - Manque : quadrant `03c` (bas-gauche, majoritairement carte vide — la surface de capture du navigateur a cessé de répondre sur ce clip) ; la vue INVITÉ de la salle d'attente n'est pas capturée (un seul navigateur = une seule session ; le flux invité est couvert par l'e2e).

## 5. Note Steam (D7)

- Zéro référence fournisseur dans le flux : libellé neutre « Connecté : X », identité = `id` + `name` de session (`session.ts`), aucun appel OAuth dans Lobby/Attente/Join.
- Ce que la tranche Steam branchera ici : (1) la source de la session (aujourd'hui cookie dev/Google) — `LobbyDO` ne connaît que `{ playerId, name }` ; (2) un 2e humain local nécessite aujourd'hui un 2e compte (2 navigateurs/profils) — sous Steam, ce seront 2 licences/tickets : prévoir le mappage ticket → `playerId` stable AVANT le join ; (3) le lien d'invitation `/join/<code>` est le candidat naturel au \"lobby via amis Steam\" (invite overlay) ; (4) displayName Steam remplira `name` tel quel (aucun champ profil supplémentaire dans le protocole).

## 6. Ce qu'Erik valide en ligne (L5)

Parcours conseillé : créer (jouer avec les nuanciers), mettre un siège en Humain, rejoindre avec un 2e compte (2e navigateur — noter pour Steam), éditer la config, lancer, vérifier EN JEU que les unités/barres/frontières portent les couleurs choisies ; duel 2+3 jusqu'à la première résolution. Vérifier aussi : parties 1v1 existantes rejouables, labo `#/progen` intact.

## 7. 🔶 Calibrages défauts (vetoables)

- Ordre des topographies dans le sélecteur (pangée → rift → archipel) et défaut = archipel.
- Défauts du formulaire : timer 60 min, partie publique cochée, hôte = Amérique, palettes par défaut selon `ordre_joueurs4`.
- Libellés : « Humain/Bot », « Civilisations aléatoires », « Lancer la partie », « couleur déjà prise par X », « siège N (humain) est vide… ».
- Bots sans civ choisie : tirage de confort seedé au démarrage (au lieu de « neutre »).
- Nuancier : l'étiquette du preneur sous la pastille grisée peut chevaucher le libellé « Civilisation » sur les fenêtres étroites (cosmétique).
- La civ des humains à la jointure est optionnelle (sans choix → « neutre ») — l'UI propose Rome par défaut.
- Réaffectation automatique des bots dépossédés : la première palette libre suit `ordre_joueurs4` (Bleu Saphir d'abord) — ordre vetoable.

## 8. Ajout du 25/09 (retour Erik sur l'écran de création) — règle des couleurs humain/bot

Constat d'Erik : en donnant au siège 1 humain la couleur du bot du siège 5, la couleur restait sélectionnée sur le siège 5 (doublon dans la config). Corrigé + règle demandée implémentée :

- **Règle** : un humain peut toujours prendre une couleur déjà attribuée à un BOT (jamais celle d'un autre humain) ; le bot dépossédé se choisit automatiquement la première palette libre (priorité `ordre_joueurs4`). Vérifié en navigateur : siège 1 → Violet Améthyste ⇒ siège 5 bascule sur Bleu Saphir.
- Implémentation : `resoutConflitsPalettes()` + `premierePaletteLibre()` dans `packages/shared/src/config.ts` (pures, testées — 4 tests dans config-partie.test.ts) ; utilisées par l'éditeur de config (client, création ET salle d'attente) et par le `StartGame` serveur, qui synchronise d'abord les palettes réelles des humains joints dans la config (un invité peut avoir joint avec la palette d'un bot) — testé de bout en bout dans lobby-5.test.ts.
- Le nuancier grisait auparavant les palettes des bots pour les sièges humains : désormais seules les couleurs des HUMAINS (et des occupants réels) sont bloquées pour un humain ; un bot, lui, ne peut toujours prendre aucune couleur prise.
- Capture : `dev-logs/captures-lobby-5/06-humain-prend-couleur-bot-reassignee.png` (comportement vérifié au DOM ; la surface de capture du navigateur a re-cédé — à re-capturer si besoin avant commit).
- Suites après ajout : moteur 895, serveur **116**, web 380 — toutes vertes ; typecheck 0 erreur ; e2e lobby-5-e2e.mjs passant.
