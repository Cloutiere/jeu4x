# REPORT Phase 5.5 — Polish visuel de la résolution

Date : 30/08/2026. Périmètre : demandes explicites d'Erik (BACKLOG idées 3 et 4),
côté client `apps/web` uniquement — `packages/rules` **intouché** (vérifié : aucun
fichier du package modifié).

## Livrables

### L1 — Flèches de chemin persistantes

- **`apps/web/src/lib/render/arrows.ts`** (nouveau) — helpers **purs et testés** :
  `anchorPoints` (origine + étapes), `segmentsOf`, `arrowHeadPoints` (tête orientée
  départ → arrivée, pointe posée sur la destination), `dashSegments` (pointillés
  pour chemins gelés, dernier tiret tronqué, reste < demi-tiret ignoré),
  `arrowGeometry` (composition).
- **`GameCanvas.svelte`** — le rendu des ordres Move dans `rebuildOverlay` remplace
  l'ancienne pastille de destination par une **flèche** (trait plein jaune, pastille
  à l'origine, tête pleine sur la case d'arrivée) :
  - **ordre actif** (miroir `OrderAck` dans `view.orders`) : trait plein ;
  - **chemin gelé** (`unit.order` restant après une halte — l'état déjà modélisé
    côté panneau) : **pointillé atténué** (alpha 0.4), tête pleine pour garder le
    sens lisible ; masqué si un ordre actif remplace la même unité ;
  - **effacée à la résolution** (TurnResult : `orders=[]`, `unit.order` consommé →
    reconstruction de l'overlay) et **à l'annulation** (CancelOrder → plus d'ordre
    dans la vue) ;
  - persiste d'un tour à l'autre : elle est re-rendue à chaque Snapshot/état via
    `view.orders` + `unit.order`.
- Le tracé à la souris (gauche pas-à-pas, droit BFS) est inchangé.

### L2 — Relecture cinématique de la résolution

- **`playback.ts`** :
  - `buildAnnounceLines(events)` (PURE, testée) : déduit des `Move`/`Retreat` du
    `TurnResult` (ou des `missedEvents` de reconnexion) les lignes de **tous** les
    movers — ennemis compris, le journal étant déjà filtré par le fog (on n'invente
    rien ; les mouvements hors de vue n'existent pas à l'écran). Pas consécutifs
    d'une même unité fusionnés en une ligne `from → to`, ordre de première
    apparition conservé.
  - **Phase annonce** (`ANNOUNCE_MS = 1000`) : démarrée à l'`enqueue` quand aucune
    relecture n'est active ; les lignes restent dans `playback.announce` (colorées
    à l'accent du propriétaire côté rendu) puis la file d'événements existante
    enchaîne **mouvements** (interpolations par unité, combats ancrés sur la case
    d'arrivée) puis **effets** (replis, échanges successifs, captures, toasts,
    victoire) — comportements antérieurs conservés.
  - Skippable d'un clic (la vitesse accélérée s'applique aussi à l'annonce), état
    autoritaire intact, ordres désactivés pendant la relecture (existant).
- **`GameCanvas.svelte`** : rendu des lignes d'annonce dans `rebuildEffects`
  (tête de flèche + pastille d'origine, couleur `playerColor(owner)`) ;
  **correctif** : la couche d'effets est purgée à la fin de la relecture (les
  lignes d'annonce restaient figées à l'écran auparavant — bug introduit par la
  phase annonce, corrigé et revérifié en jeu).

### Tests

- `apps/web/tests/phase5-5.test.ts` (nouveau, 13 tests) : ancres/segments, orientation
  de la tête (2 orientations + envergure), pointillés (bornes, troncature, reste
  ignoré), `buildAnnounceLines` (fusion par unité, ennemis inclus, replis inclus,
  événements non-mouvement ignorés, ordre déterministe, cas vide).
- Suite complète : **tous verts** (`pnpm test` : règles + DO + web, 49 tests web),
  `pnpm typecheck` 0 erreur (2 warnings préexistants, inchangés), `pnpm build` OK.

## Vérification en jeu (local, solo vs bot)

Partie `XJ4D49` (serveur wrangler dev + Vite, bot aléatoire) :

1. Clic droit sur destination → flèche pleine visible immédiatement
   (`docs/captures/phase5-5-fleche-persistante.png`) ;
2. Fin de tour → u1 n'exécute qu'un pas (1 PM) : le **reste du chemin reste
   affiché en pointillé atténué** au tour suivant
   (`docs/captures/phase5-5-chemin-gele.png`) ;
3. Fin de tour suivante → **phase annonce** : ligne rouge (accent p1) d'origine →
   destination avec tête de flèche, bandeau « Relecture du tour », puis
   **mouvements animés**, puis effets ; à la fin, aucune ligne résiduelle
   (`docs/captures/phase5-5-annonce-resolution.png`).
4. Reconnexion : la relecture depuis `missedEvents` emprunte le même chemin de
   code (l'`enqueue` alimente `buildAnnounceLines` de la même façon — couvert par
   les tests purs ; test manuel de reconnexion socket non rejoué, cf. ambiguïtés).

## Déploiement

Push vers `main` → GitHub Actions (`.github/workflows/deploy.yml`) : build, tests,
typecheck, puis `wrangler deploy --env prod` (vérification en ligne à suivre après
le push, cf. fin de session).

## Ambiguïtés + interprétations

1. **« Effacée à la résolution »** : interprété comme « effacée dès la réception du
   TurnResult » (les ordres sont consommés ou gelés à cet instant) — la flèche
   disparaît quand la relecture démarre, ce qui évite le doublon avec la ligne
   d'annonce.
2. **Chemin gelé** : c'est `unit.order` (reste de chemin après halte, R-40),
   déjà affiché par le panneau unité — la variante pointillée/atténuée reflète
   exactement ce champ ; masquée si un ordre actif remplace la même unité.
3. **Position des unités pendant l'annonce** : l'état reçu est déjà l'état final
   (autoritaire) ; les unités sont donc visibles à leur case d'arrivée pendant la
   ligne d'annonce, puis « glissent » depuis leur origine pendant la phase
   mouvements (comportement d'interpolation existant conservé). Une variante
   « unités à l'origine pendant l'annonce » serait possible mais contredirait
   « l'état affiché est autoritaire ».
4. **Annonce et événements multiples** : si un second lot d'événements arrive
   pendant une relecture en cours (rare), il ne génère pas de nouvelle phase
   d'annonce (la relecture est déjà active) — interprétation la plus simple.
5. **Couleur des lignes d'annonce** : couleur d'accent du **propriétaire** du
   mouvement (p1 rouge / p2 bleu — SPEC-ART), comme demandé (« couleur accent
   adverse » = la sienne, pas une couleur dédiée « ennemi »).
