# apps/web — Client SPA (Svelte 5 + PixiJS v8)

Client du jeu 4X multijoueur asynchrone. Build statique (Cloudflare Pages), pas de SSR.
La Phase 3 ajoute le rendu hexagonal complet : carte, brouillard 3 états, ordres à la
souris, playback des événements et bot aléatoire pour le solo local.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev:web` (racine) | Dev server Vite sur **http://localhost:5174** (port strict — le 5173 est occupé localement ; proxifie `/api`, `/auth`, `/admin`, `/ws` vers `:8787`) |
| `pnpm dev:server` (racine) | Worker + DO (`wrangler dev`) sur http://127.0.0.1:8787 — préalable indispensable |
| `pnpm test` (dans apps/web) | Tests unitaires des helpers purs (réducteur de vue, culling, interaction) |
| `pnpm typecheck` | svelte-check (0 erreur attendu) |
| `pnpm build` | Build de production dans `dist/` (les assets de `public/art/` y sont copiés) |
| `pnpm sync-art` | Re-synchronise `assets-src/exports/*.png` → `public/art/` (à relancer après tout nouvel asset) |

Login de dev : `/auth/dev?name=Alice` (stub, bouton sur la page de login).

## Contrôles (desktop only, ≥ 1280×720)

| Action | Contrôle |
|---|---|
| Sélectionner une unité / une ville | Clic gauche sur la case (sur une capitale défendue : 1er clic l'unité, 2e clic la ville) |
| **Désélectionner** | Re-clic sur l'entité sélectionnée (Phase 5), **Échap**, ou clic sur une case vide |
| Tracer un déplacement | **Clic droit sur la case de destination** : chemin complet calculé à travers les cases connues praticables et **soumis automatiquement** (Phase 5). Variante pas à pas : clics gauche sur des cases adjacentes libres — chaque extension re-soumet le chemin (re-cliquer une case du chemin = retour arrière) |
| **Flèche de chemin persistante** (Phase 5.5) | L'ordre de déplacement soumis reste affiché en **flèche** (origine → tête sur la destination) tant que l'ordre est actif, y compris d'un tour à l'autre ; un **chemin gelé** (reste de chemin qui s'exécutera à la prochaine résolution) s'affiche en **pointillé atténué**. Effacée à la résolution du tour ou à l'annulation de l'ordre |
| Annuler le brouillon | **Clic droit** hors d'une case cible valable, ou **Échap** (l'ordre déjà soumis s'annule via « Annuler l'ordre » du panneau) |
| Attaquer une unité ennemie visible | Bouton « Attaquer … » du panneau, ou clic direct sur sa case adjacente |
| Capturer/assaut une ville ennemie | Bouton « Entrer dans la ville … » ou clic sur la case (l'entrée déclenche capture si vide, assaut du défenseur sinon — R-57) |
| Tenir la position / Fortifier | Boutons du panneau — Fortifier : bonus défensif permanent +25 % (R-33/T-17), marqueur 🛡 sur le sprite ; tout autre ordre annule ; « Ne plus fortifier » soumet un Hold |
| Fonder une ville | Bouton du panneau (Colon uniquement) — désactivé avec info-bulle si une ville connue est à distance < T-09 |
| Production d'une ville | Menu de ville → unités (Guerrier 10 / Colon 20) **et bâtiments** (Grenier 20, Atelier 30, Mine de fer 40, Comptoir 30, Port 30, Tribunal 40 — R-66) — file unique, progression conservée (R-62) |
| **Réassigner un citoyen** (Phase 6, R-60) | Sélectionner une ville amie puis **clic sur une case** de la carte (dans le rayon de travail, case libre) — re-clic sur une case déjà travaillée par la ville = désassignation. Les cases travaillées portent un **cadre de la couleur du propriétaire** |
| **Overlay des rendements** (Phase 6, cycle 7b) | Bouton « Rendements » de la barre supérieure — cycle à 3 états : masqué → affiché → affiché **sans villes ni armées** (pour lire les icônes sous les entités). Les cases travaillées affichent or/science selon la conversion de la ville (R-90) |
| **Menu de ville — refonte 7b** | Tableau de bord : identité, rendements N/P/C avec répartition or/science selon la **conversion de la ville** (R-90, bouton Or ⇄ Science — R-88 : la Bibliothèque ajoute sa science), jauges croissance/production avec **durées en tours**, citoyens cliquables (désassignation), bâtiments avec effet, production à deux niveaux (en cours + choix catégorisés unités/bâtiments, verrouillés « Requiert : … » en fin de section, R-87). Le clic sur une ville interrompt un brouillon de déplacement en cours (le chemin soumis reste actif) |
| Centrer la caméra sur la sélection | Bouton « Centrer la caméra » ou touche **F** |
| Zoom | Molette (borné 0.5×–2.25×), ancré sur le curseur |
| Pan | Glisser (un glisser de > 5 px ne déclenche jamais de clic) |
| Fin de tour / Resync | Barre supérieure — « Fin de tour » confirme d'abord si des unités n'ont aucun ordre (dialogue listant leurs positions, Phase 5) |

Pendant la résolution et la relecture du tour (playback), les ordres sont désactivés ;
**un clic sur la carte accélère la relecture**. L'état affiché reste toujours l'état
autoritaire du serveur — les animations sont une surcouche cosmétique.

### Relecture cinématique (Phase 5.5)

La résolution se rejoue en trois phases lisibles :

1. **Annonce** (~1 s) : lignes de déplacement prévues de **tous** les movers du tour,
   y compris ennemis (déduites des événements `Move`/`Retreat` reçus — filtrés par le
   brouillard ; les mouvements hors de vue n'existent simplement pas à l'écran),
   colorées à l'accent du propriétaire, avec tête de flèche sur la destination.
2. **Mouvements** : chaque unité est animée le long de son trajet (séquentiel) ;
   les combats s'ancrent sur la case d'arrivée.
3. **Effets** : replis, échanges successifs (flashs + PV qui descendent), captures,
   butin, fondation/capture de ville (toasts + effets), victoire.

## Brouillard de guerre (3 états, R-70)

- **Inexploré** : rien n'est dessiné (la case est absente du JSON filtré) — fond sombre.
- **Exploré-masqué** : terrain en teinte atténuée, jamais d'entité.
- **Visible** : couleurs pleines, unités et villes (y compris ennemies) visibles.

Le client n'invente jamais de données : pas de prévision de dégâts, pas de validation
métier au-delà de l'UX ; toute règle est revalidée par le moteur côté serveur.

## Assets (SPEC-ART)

Les textures viennent de `public/art/` (PNG 2× de `assets-src/exports/`, chargés via
PixiJS `Assets`). Chaque entité est rendue en deux calques : sprite de base + calque
`_accent` teinté à la couleur du joueur (p1 `#D64545`, p2 `#3B6FD6`). Tout fichier
absent retombe automatiquement sur un **placeholder géométrique généré à l'exécution**
(`Graphics` → `generateTexture`) — un seul chemin de rendu.

## Bot aléatoire (solo local)

```bash
# 1. créer une partie dans le navigateur (lobby), sans timer de préférence
# 2. inviter le bot avec le code affiché :
pnpm bot -- ABC123 Bot          # GAME_URL=http://127.0.0.1:8787 par défaut
# 3. jouer son tour à la souris puis « Fin de tour » — le bot enchaîne seul.
```

Le bot est un client comme les autres : login stub → `JoinGame` via le socket de lobby →
socket de partie ; à chaque tour il donne des ordres aléatoires **valides** (Hold, ou
Move d'un pas vers une case adjacente praticable connue de son état filtré) puis
verrouille. Aucune logique serveur (`apps/server/src/bot.mjs`, WebSocket natif Node).

## Mode reveal (développement uniquement)

`#/debug/<code>` affiche le dump NON filtré d'une partie (endpoint admin). Nécessite
`VITE_DEV_ADMIN_TOKEN` dans `apps/web/.env.local` (voir `.env.local.example`, valeur =
`ADMIN_TOKEN` du `.dev.vars` serveur). Gardé par `import.meta.env.DEV` : absent de tout
build de production. La page de partie conserve aussi une vue « État brut » repliable.

## Architecture rapide

```
src/
├── lib/gameClient.ts      Client WS de partie : reduceView PUR (Snapshot/TurnResult/
│                          missedEvents, dédoublonnage par seq), stores Svelte.
├── lib/render/
│   ├── GameCanvas.svelte  App PixiJS (montage/démontage propres, ResizeObserver,
│   │                      boucle hybride rAF + timer de secours), culling par viewport,
│   │                      couches tuiles/overlay/entités/effets, entrées souris.
│   ├── hexView.ts         Helpers purs : culling (hexesInRect), bornes, chemin pas à pas.
│   ├── interaction.ts     Décision de clic PURE (sélection, attaque, extension de chemin).
│   ├── playback.ts        File d'animation séquencée (Move/Combat/… → interpolations,
   │                      flashs, toasts) — clic = accélérer.
│   ├── camera.ts          Pan/zoom borné/clampé.
│   ├── textures.ts        Chargement /art/ + fallback placeholder (SPEC-ART).
│   └── ui.ts              Sélection + brouillon de chemin (store partagé canvas/panneaux).
├── components/            UnitPanel, CityPanel, Journal (Svelte, overlay HTML).
└── pages/                 Login, Lobby, Join, Game, Debug (reveal).

tests/                     Vitest : réducteur de vue (missedEvents L0), culling/caméra,
                           construction de chemin, décision de clic.
```

## Tests des Durable Objects côté serveur

Voir `apps/server/README.md` (scénario à deux onglets, reconnexion, alarmes) —
`pnpm test` à la racine lance toutes les suites (moteur, DO, web).
