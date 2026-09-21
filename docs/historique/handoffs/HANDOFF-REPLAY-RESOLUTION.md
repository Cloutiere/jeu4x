# HANDOFF-REPLAY-RESOLUTION — Relecture de la résolution de fin de tour (2D) + journal cliquable

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (clone CivRev). Lis d'abord `RULES.md` (spec normative, identifiants R-xx/T-xx), `HANDOFF.md` §4 (conventions agent), `PROJET.md` (état). Le pivot du 11/09 tient : **2D uniquement**, ne touche jamais au drapeau `rendu3d` (reste `false`). Zéro changement de gameplay : `packages/rules` et le serveur **ne doivent pas bouger** (sauf un éventuel passage de données déjà disponible — voir L2, rien à ajouter).

## 1. Problème

Les tours sont simultanés : tout se résout d'un coup, en des endroits différents de la carte, et le playback actuel (`apps/web/src/lib/render/playback.ts`) ne **superpose** que des animations cosmétiques sur l'état **post-résolution** — les unités sont déjà arrivées à destination quand le joueur regarde. Erik veut pouvoir :

1. **Rejouer la dernière résolution en conditions réelles** : remettre la carte dans son état d'avant la résolution, puis rejouer les mouvements/combats événement par événement, **en se déplaçant librement sur la carte pendant la relecture** (pan/zoom inchangés pendant le playback — c'est déjà le cas, à préserver) ;
2. **Cliquer sur une entrée du journal** (panneau droit, ex. « #20 u2 se déplace vers (-2,13) ») pour **centrer la carte sur la case concernée sans changer le zoom** — pour se positionner au bon endroit avant de déclencher la relecture.

## 2. Ce qui existe (faits vérifiés, à réutiliser tel quel)

- **Journal** : `apps/web/src/components/Journal.svelte` lit `view.events` (200 dernières, ordre inverse) et rend `eventLabel(event, nameOf)` (`apps/web/src/lib/labels.ts:218+`). Les événements (`GameEvent`, `packages/rules/src/events.ts`) portent **déjà** des données structurées : `Hex {q,r}`, `unitId`, `owner`, PV, etc. Les coordonnées « (-2,13) » ne sont du texte qu'au moment du rendu du libellé.
- **Événements de résolution côté client** : le `TurnResult` (`apps/server/src/game.ts:1360-1372`, type `packages/shared/src/index.ts:178-186`) contient `events: GameEvent[]` **filtrés par le fog du joueur** + `state` post-résolution. C'est la matière première de la relecture — rien à demander au serveur.
- **État pré-résolution accessible côté client** : dans le traitement du message WS (`apps/web/src/lib/gameClient.ts:139-152`, `case 'TurnResult'`), l'état affiché actuel EST l'état pré-résolution au moment où le `TurnResult` arrive. Le conserver localement suffit (voir L2). ⚠️ La page (`Game.svelte`, hook `onMessage`) voit aussi le message avant mise à jour — choisir UN point de capture, de préférence dans `gameClient.ts`.
- **Playback** : `playback.ts` (classe `Playback`) — file d'événements séquencée, durées par type (`DURATIONS`), interpolation des `Move` via `moves: Map<unitId, MoveAnim>`, override de PV des combats via `hpOverride`, fx, toasts, phase « annonce » des déplacements (`ANNOUNCE_MS`), clic = accélérer (×4 plafonné), `reset()` pour purge. Consommé par `GameCanvas.svelte`.
- **Caméra** : `apps/web/src/lib/render/camera.ts` — `centerOn(worldX, worldY, viewW, viewH)` ne touche PAS au scale. `GameCanvas.svelte` expose déjà `centerOnHex(hex)` (lignes ~2831-2844) et `centerOnUnit(unitId)`, déjà câblées (touche F, UnitPanel). **« Sans zoom appliqué » = `centerOnHex` tel quel** (conserve le zoom courant de l'utilisateur).
- **Trace admin** (`packages/rules/src/trace.ts`, endpoint `/admin/game/<code>/trace`) : hors périmètre — la relecture utilise les `GameEvent` du `TurnResult`, pas la trace.

## 3. Décisions tranchées par défaut (veto possible — Erik répond « validé » ou corrige)

- **D1 — Relecture = dernier tour résolu, côté client uniquement.** On conserve localement UNE paire {état pré-résolution filtré, événements du tour}. Pas d'historique multi-tours, pas de stockage serveur, pas de migration `schemaVersion`. (Un historique profond serait un chantier séparé, plus tard.)
- **D2 — L'état « avant résolution » est l'état filtré par le fog que le joueur avait.** Cohérent avec le journal (déjà filtré) et sans faille de triche : on ne rejoue que ce que le joueur a le droit de voir.
- **D3 — Pendant la relecture, l'état RENDU est l'état pré-résolution, et les événements y sont appliqués visuellement** : les `Move` déplacent les sprites (interpolation existante), les `UnitDestroyed` font disparaître le sprite À L'ÉVÉNEMENT (pas dès le début — c'est LA différence avec le playback cosmétique actuel), les combats montrent les PV via `hpOverride` existant. Implémentation attendue : une surcouche de rendu en mode « relecture » qui part de l'état pré-résolution et maintient un delta visuel (positions courantes, unités mortes, PV), SANS jamais muter l'état autoritaire du store — à la fin de la relecture, on revient à l'état post-résolution réel. Le plus sûr : un « état de relecture » dérivé (clone léger) que le renderer consomme quand le mode est actif.
- **D4 — UI : un bouton « Rejouer la résolution »** (près du journal ou du bandeau de fin de tour — à l'œil avec Erik) + pendant la relecture : clic = accélérer (mécanique existante), un bouton/Échap = **quitter la relecture** (retour immédiat à l'état réel). La relecture est aussi **relançable** tant qu'on n'a pas entamé le tour suivant ; au `TurnResult` suivant, la paire mémorisée est remplacée.
- **D5 — Journal cliquable : un clic sur une entrée centre la carte sur la case de l'événement sans changer le zoom** (`centerOnHex`), **et déclenche aussi la relecture ? NON** — le clic ne fait QUE centrer (c'est la demande d'Erik : se positionner avant de lancer la relecture). Chaque type d'événement expose sa case pertinente (Move → `to`, Attack/CombatExchange/UnitDestroyed → `at`, CityCaptured → case de la ville, etc.) — brancher depuis les **données structurées** de l'événement, pas en parsant le libellé.
- **D6 — Le fog s'applique aussi en relecture.** Si l'état pré-résolution filtré ne contient pas l'unité, elle n'apparaît pas (l'événement correspondant n'est d'ailleurs déjà pas dans le journal du joueur).
- **D7 — Zéro impact réseau/serveur/moteur.** Si un fichier de `packages/rules` ou `apps/server` semble devoir changer, c'est que la conception dérive — revenir au rendu client.

## 4. Mission

### L0 — Préalables
- Baseline : `pnpm test` et typecheck verts à la racine (turbo), prod 200. Note l'état de départ.
- Lis `playback.ts` en entier, `GameCanvas.svelte` (intégration playback + caméra + renderer des unités), `gameClient.ts`, `Game.svelte`, `Journal.svelte`, `labels.ts`.

### L1 — Journal cliquable (livrable autonome, le plus simple d'abord)
- Ajouter au rendu du journal (`Journal.svelte`) un handler de clic par entrée ; déterminer la case cible depuis l'événement structuré (table par type de `GameEvent`, avec une fonction pure testée du genre `hexDeLEvenement(ev): Hex | null` — couvre les types portant une case, `null` sinon, entrée non cliquable dans ce cas, curseur différent).
- Câbler via `canvasApi` existant → `centerOnHex(hex)` (zoom inchangé). Vérifier que ça marche aussi quand le panneau de ville/vue ville est ouvert (l'événement doit fermer/revenir proprement si besoin — même comportement que la touche F, à aligner).
- Tests unitaires sur `hexDeLEvenement` (tous les types à case + cas null).

### L2 — Capture de l'état pré-résolution
- Dans `gameClient.ts` (case `TurnResult`) : avant d'écraser l'état, mémoriser `{ statePrecedente: view.state, events: message.events, tour }` dans un store dédié (ex. `replayStore`). Remplacé à chaque `TurnResult` ; purgé au chargement de partie/reconnexion (un `Snapshot` complet invalide la paire — après reconnexion on n'a PAS le pré-état, le bouton doit être indisponible et l'expliquer en tooltip).
- Gérer le cas `missedEvents` : si des événements ont été manqués, la relecture du tour reste possible avec ce qu'on a, MAIS le pré-état peut être décalé — **défaut : désactiver la relecture après une reconnexion** (simple et sûr).

### L3 — Mode relecture (le cœur)
- Construire l'« état de relecture » dérivé de `statePrecedente` (positions d'origine, unités vivantes) et le fil d'événements mémorisés.
- Étendre ou encapsuler `Playback` pour ce mode : les événements consommés appliquent leur effet **à l'état de relecture** (sprite disparaît sur `UnitDestroyed`, ville change de drapeau sur `CityCaptured`, PV sur `CombatExchange`, etc.). Les durées/fx/toasts existants sont réutilisés.
- `GameCanvas.svelte` rend l'état de relecture quand le mode est actif (basculer proprement les caches de sprites — s'inspirer de la bascule 2D↔3D qui purge déjà ses caches). Pan/zoom de la caméra restent pleinement opérationnels pendant la relecture (déjà vrai, à verrouiller par un test si possible).
- Fin de file → l'état de relecture doit coïncider avec l'état réel post-résolution (vérification visuelle + test : positions/vivants égaux après replay ; si un écart résiduel existe par construction — ex. état non visible par le joueur — le documenter).
- Contrôles : bouton « Rejouer la résolution » (indisponible/grisé + tooltip si pas de paire mémorisée), quitter (bouton + Échap), clic = accélérer (existant).

### L4 — Vérification
- Tests unitaires (état de relecture, fin de file = état réel, hexDeLEvenement, purge après Snapshot).
- e2e : partie solo contre le bot → jouer un tour avec des mouvements → laisser résoudre → recentrer via clic journal → « Rejouer la résolution » → vérifier visuellement les positions avant/après. **Captures avant/après dans `dev-logs/captures-replay/`** (validation locale avec captures AVANT tout commit — règle d'Erik).
- Typecheck + suite complète verts. Ne rien déployer toi-même : la CI déploie au push après validation d'Erik.

### L5 — Rapport
- `REPORT-REPLAY-RESOLUTION.md` (racine puis Erik/pilot l'archiveront) : ce qui est livré, décisions appliquées, écarts, liste de ce qu'Erik doit vérifier en ligne avec son login, 🔶 de calibrage (durées par type si retouches, emplacement/look du bouton, comportement du clic journal quand la carte est déjà centrée).

## 5. Critères d'acceptation

1. Clic sur « #20 u2 se déplace vers (-2,13) » → la carte se centre sur (-2,13), zoom inchangé, en < 200 ms.
2. Bouton « Rejouer la résolution » → la carte montre les unités À LEUR POSITION D'ORIGINE, puis les mouvements/combats se rejouent événement par événement ; pendant ce temps pan/zoom libres.
3. À la fin de la relecture, la carte coïncide avec l'état réel ; Échap/Quitter y ramène immédiatement à tout moment.
4. Après reconnexion (Snapshot), le bouton est indisponible avec tooltip explicatif ; aucune erreur console.
5. Zéro changement réseau/serveur/moteur ; zéro migration ; suite de tests verte ; fog respecté en relecture.

## 6. Périmètre interdit (reporté)

- Historique multi-tours de relecture et relecture depuis le serveur (trace admin) ;
- La trace granulaire (phases/décisions R-xx/rolls) en UI joueur — c'est l'outil `#/debug` ;
- RELECTURE-3D (dort avec le pivot) ;
- Toute retouche de `packages/rules`, `apps/server`, `schemaVersion`, assets ;
- Raccourcis clavier supplémentaires au-delà d'Échap (éviter les conflits avec la coquille Electron).
