# RAPPORT PHASE 3 — Rendu visuel hexagonal & UI client (PixiJS + Svelte)

**Date :** 30/08 · **Préalables tenus :** DESIGN.md §3-4, RULES.md, HANDOFF.md §4, HANDOFF-PHASE1.md lus ; baseline verte vérifiée (147 tests) ; `packages/rules` **non modifié** (lecture seule, vérifié par historique git).

---

## 1. Livrables

### L0 — Correctifs hérités (commit `774eed7`)
1. **`missedEvents` à la reconnexion** — root-cause trouvée côté client : le handler `Welcome` de `gameClient.ts` écrasait `lastSeq` avec le bout du journal serveur **avant** l'arrivée du Snapshot, et le filtre de dédoublonnage `e.seq > lastSeq` supprimait alors tous les `missedEvents` (journal vide). Fix : nouvelle marque de lecture `seenEventSeq` (distincte de `lastSeq`), `Welcome` n'y touche pas ; le réducteur `reduceView` est désormais **pur et testé**. Test DO ajouté (`missedEvents.test.ts` : résolution → socket neuf → `Snapshot.missedEvents` contient le tour résolu) + 4 tests web du réducteur.
2. **Warning wrangler** — `environments` → `env` (clé Wrangler 4) ; environnement `dev` vide supprimé (le top-level EST le dev) ; `durable_objects` dupliqué dans `env.prod` (non hérité). `wrangler dev` et `wrangler deploy --dry-run --env prod` : **zéro warning**.
3. **Mode reveal (dev uniquement)** — page `#/debug/<code>` (route + `Debug.svelte`) appelant l'endpoint admin avec `VITE_DEV_ADMIN_TOKEN` (`.env.local` gitignored, `.env.local.example` committé). Garde `import.meta.env.DEV` : hors dev, la page affiche « indisponible » et le token n'existe pas dans le build. Lien « Debug » dans la barre de partie, dev-only.

Port web passé de 5173 → **5174 strict** (spécificité locale, `APP_BASE_URL` inchangé).

### L1-L5 — Rendu & UI (commits `550a974`, `1c210ce`, `d4c17a5`, `a6c5d3b`)
- **PixiJS v8.20** en dépendance `apps/web` ; `<GameCanvas>` encapsule l'application (init async, `ResizeObserver`, destruction propre au démontage). Toutes les conversions hexagonales importées de `@game/rules` (pointy-top verrouillé) — zéro maths dupliquée.
- **Caméra** : zoom molette borné 0.5×–2.25× ancré curseur, pan par glisser (seuil 5 px glisser-vs-clic), recentrage sélection (touche **F** ou bouton), clamp aux bornes du monde.
- **Culling** : `hexesInRect` (helper pur testé) — seules les cases intersectant le viewport sont créées, celles qui en sortent sont détruites ; 1 600 cases sans friction.
- **Brouillard 3 états** : inexploré = rien de rendu (case absente du JSON) ; exploré-masqué = teinte atténuée ; visible = plein. Entités uniquement sur cases visibles.
- **Assets réels (SPEC-ART, commit `29723ed` de l'utilisateur)** : 23 PNG synchronisés vers `public/art/` (script `pnpm sync-art`), chargés via PixiJS `Assets` avec **fallback placeholder généré à l'exécution fichier par fichier** (mêmes géométrie 2×, ancrages et nommage que la spec). Système d'accent : calque `_accent` blanc teinté p1 `#D64545` / p2 `#3B6FD6`. Icônes or/science dans la barre. PV en barre, badge de population, barre de progression de production et indicateurs d'ordre programmatiques.
- **Ordres à la souris (L3)** : sélection (alternance unité↔ville sur capitale défendue), chemin pas à pas sur cases adjacentes praticables **connues** (troncature en re-cliquant), Valider/annuler (bouton, Entrée, Échap, clic droit), Hold, FoundCity (Colon), Attack sur unité ennemie visible adjacente, **entrée dans une ville ennemie vide = déplacement** (capture par entrée R-57/R-65 — un ordre Attack sans défenseur « fizzle » côté moteur), SetProduction + annulation via le menu de ville. Brouillons miroirs via `OrderAck` (déjà en place), refus en toast.
- **Playback (L4)** : file séquencée alimentée par `TurnResult` **et** `Snapshot.missedEvents` (relecture après reconnexion) ; interpolation Move/Retreat, flashs de combat avec override des PV affichés, bursts destruction/fondation/capture, toasts ; indicateur pendant `phase === 'resolving'` et pendant la relecture ; **clic = accélérer** ; purge sur Snapshot (l'état reçu prime). Durées ~0,2-0,4 s/événement.
- **Panneaux (L5)** : panneau unité (PV, PM, ordre courant, Hold/Fonder/Attaquer/Annuler/Centrer), menu de ville (population, production + progression, Guerrier/Colon, annulation), journal avec libellés français, vue « état brut » repliable conservée, écran de victoire/défaite (domination/forfait), toasts d'événements et d'erreurs.

### L6 — Bot aléatoire (commit `13a3301`, corrigé en vérification)
`apps/server/src/bot.mjs` + `pnpm bot -- <code> <nom>` : login stub (capture du cookie de session) → **`JoinGame` via le socket de lobby** (le GameDO refuse un non-joueur) → socket de partie ; à chaque tour : Hold ou Move d'un pas vers une case adjacente praticable **connue** de son état filtré (terrains lus dans `packages/rules/src/data/terrain.json`), puis EndTurn ; replanification à chaque `TurnResult` ; arrêt sur `Victory`. Aucune logique serveur, WebSocket natif Node ≥ 22.

### L7 — Tests, qualité, documentation
- Tests web (Vitest) : réducteur de vue/`missedEvents`, culling + caméra (aller-retour écran→hex multi-zooms), chemin pas à pas, décision de clic (sélection, attaque, capture par entrée, verrouillage, brouillard).
- `apps/web/README.md` : commandes, contrôles souris/clavier, fonctionnement du bot, mode reveal, architecture.
- Captures de la vérification manuelle dans `docs/phase3/`.
- Annotation DESIGN.md (Phase 3 ✅) — aucune autre modification de RULES.md/DESIGN.md.

## 2. Tests

| Suite | Résultat |
|---|---|
| `packages/rules` (moteur pur) | **132** verts (inchangé — zéro modif) |
| `apps/server` (DO) | **16** verts (15 + 1 nouveau : missedEvents socket neuf)
| `apps/web` (helpers purs) | **25** verts (nouveau : vitest dans le paquet web)
| `pnpm typecheck` (4 paquets) | 0 erreur (1 warning svelte-check préexistant à la baseline, noté ci-dessous)
| `pnpm build` (web) | OK — `dist/` contient `art/` (23 PNG) et le bundle PixiJS
| `wrangler deploy --dry-run --env prod` | 0 warning

## 3. Vérification manuelle — partie solo complète à la souris contre le bot

Environnement : `wrangler dev` :8787 (démarrage **sans warning**), Vite :5174, bot lancé par script. Trois parties jouées intégralement à la souris (clics canvas via coordonnées de case, panneaux, boutons) — jamais de JSON brut soumis.

| Critère | Résultat |
|---|---|
| Créer la partie + inviter le bot | ✅ lobby → code → le bot rejoint (socket lobby puis partie)
| Fonder une ville | ✅ Colon déplacé ≥ T-09 puis FoundCity → `CityFounded` + nouvelle ville rendue (accent rouge, badge pop)
| Produire une unité | ✅ SetProduction Guerrier → `UnitProduced` quelques tours plus tard (+ Colon au second village)
| Déplacer | ✅ chemins pas à pas multi-cases, fog évoluant, cases exploré-masqué derrière
| Combattre | ✅ attaque d'un colon ennemi (capturé-détruit, R-43/I-3) puis **guerre d'usure complète contre le guerrier bot** : 10+ échanges R-51 (PV 3→2→1 des deux côtés, observés dans le journal et les barres), replis R-52/54, soins R-71 entre échanges, destruction finale (UnitDestroyed) — le bot guerrier errait, la chasse a duré ~20 tours.
| Brouillard visuellement correct | ✅ 3 états visibles sur une seule capture (`docs/phase3/brouillard-3-etats.png`) ; ennemis apparaissant/disparaissant selon la vision.
| Playback rejoue le tour manqué | ✅ rechargements à chaque reconnexion : journal restauré depuis `missedEvents` et rejoué (toasts/interpolations).
| Caméra fluide + culling | ✅ zoom/pan/centrer sur 1 600 cases ; sprites hors viewport détruits (compteur debug).
| Victoire | ✅ 2 victoires par domination (capture capitale vide = entrée ; écran « Victoire ! — motif : domination »).

Captures : `docs/phase3/carte-tour0.png` (rendu initial, brouillard circulaire, capitale+p1), `carte-tour1-fog.png` (après résolution, colon déplacé), `carte-tour2-ville-fondee.png` (seconde ville, guerrier sélectionné, forêts révélées), `brouillard-3-etats.png` (les 3 états du brouillard + zone de combat).

## 4. Ambiguïtés et interprétations choisies

1. **Attaque d'une ville ennemie vide** — le moteur « fizzle » un ordre `Attack` sans défenseur (`turn.ts` : `if (!enemy) continue`) ; la capture passe par l'**entrée** sur la case (R-57/R-65). Le client a donc été aligné : ville ennemie adjacente sans unité visible → étape de déplacement (bouton « Entrer dans la ville » / clic canvas), Attack réservé aux unités. Documenté dans `interaction.ts` et testé. **Aucune modification moteur**.
2. **Alternance unité/ville** — sur une capitale défendue, un clic ne peut désigner qu'une entité : 1er clic l'unité, 2e clic la ville (deterministe, testé).
3. **`lastSeq` vs lecture du journal** — deux marques distinctes (`lastSeq` protocole, `seenEventSeq` journal) : le Welcome pose le premier, jamais le second.
4. **Boucle de rendu hybride** — dans certains contextes (onglet masqué), rAF est suspendu par Chromium et PixiJS ne rend plus ; la boucle pilote elle-même le rendu (rAF prioritaire + `setInterval` de secours). Le playback reste donc non bloquant même en arrière-plan.
5. **Clic = accélérer** — premier clic ×4, plafonné ×64 ; purge complète du playback à chaque Snapshot (resync) : l'état autoritaire prime toujours.
6. **Barres de PV au-dessus des sprites** — position fixe au-dessus du canvas d'unité (2×, ancrage bas-centre) conformément à SPEC-ART ; lisible à tous les zooms.

## 5. Constats et restes mineurs

- **Warning svelte-check préexistant** (`Game.svelte:11` — `code` capturé à l'initialisation du client) : présent à la baseline, la page est reconstruite par le routeur à chaque navigation ; sans effet observé. À traiter en Phase 4 si souhaité (recréation du client par `$effect`).
- Le handle debug `window.__gameCanvas` (stats/export PNG/centerOn) est volontairement conservé : outil de développement, sans effet en production.
- Extraction canvas : PixiJS vide son buffer WebGL après compositing ; le handle debug passe par `renderer.extract` (aucun impact gameplay).
- Le bot ne gère ni production ni fondation : conforme à sa spécification L6 (Hold/Move + EndTurn).

## 6. Proposition pour la Phase 4 (prototype J1 de bout en bout)

1. **Timers & forfait en conditions réelles** : jouer une partie avec timer court (2-5 min) à deux clients réels ; vérifier auto-verrouillage, alarme, `missedTurns`, forfait T-06, puis notification UI d'échéance (prochain chantier UI : compte à rebours dans la barre).
2. **Persistance & redéploiement** : déployer sur un compte Cloudflare (Workers Paid), rejouer une partie à cheval sur un redéploiement (migrations §3.8 en conditions réelles), tester la reconnexion mobile/réseau instable.
3. **Admin debug** : lister les parties, forcer une résolution, injacter un état — l'endpoint + le mode reveal existent déjà côté client.
4. **Validation du livrable jouable à deux humains** : une partie 1v1 complète deux humains (OAuth réels ou stubs), y compris abandon, forfait et victoire — avec reconnexion des deux côtés.
5. **Divers remontés cette phase** : (a) supprimer le warning svelte-check sus-mentionné ; (b) bouton « Passer le playback » dédié en plus du clic-carte ; (c) indiquer les PM restants sur l'unité sélectionnée ; (d) variation déterministe des tuiles (SPEC-ART P1) quand les assets P1 arriveront ; (e) envisager un ping/keepalive applicatif si des coupures WS sont observées en ligne.

**La Phase 3 est terminée — s'arrêter ici et rendre la main.**
