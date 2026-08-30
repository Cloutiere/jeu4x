# HANDOFF PHASE 5.5 — Polish visuel de la résolution (micro-jalon)

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~198 tests). Contexte : Phases 0→5 complétées, le jeu est **en production** ([workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev), OAuth réels, déploiement autorisé). Phases suivantes prévues : 6 (génération procédurale) et 4.5 (personnalisation visuelle — `BACKLOG.md`).

**Périmètre de ce micro-jalon : deux demandes explicites d'Erik (30/08, `BACKLOG.md` idées 3 et 4), presque exclusivement côté client `apps/web`.** `packages/rules` : **lecture seule** (aucun changement de règles).

## L1 — Flèches de chemin persistantes

Aujourd'hui la ligne de déplacement disparaît à la soumission de l'ordre. Elle doit :
- **demeurer visible tant que l'ordre est actif**, rendue en **flèche** (tête de flèche sur la case de destination — le sens doit se lire d'un coup d'œil) ;
- pour les chemins multi-tours, rester affichée d'un tour à l'autre (elle est recvue à chaque `Snapshot` via les ordres du joueur) ;
- être **effacée à la résolution** du tour (l'ordre est consommé ou gelé — un chemin gelé s'affiche en variante atténuée/pointillée, l'état « gelé » étant déjà modélisé côté panneau) ;
- disparaître à l'annulation de l'ordre (`CancelOrder`, Échap, clic droit).

Le tracé à la souris (gauche pas-à-pas, droit BFS) reste inchangé — seul le **rendu persistant** change. Tests : helpers purs de rendu de flèche (points d'ancre par segment, orientation de la tête).

## L2 — Relecture cinématique de la résolution (idée 3)

Améliorer la file de playback existante (`render/playback.ts`) pour rendre la résolution **transparente**, dans cet ordre :
1. **Phase annonce** (~1 s) : afficher les lignes de déplacement prévues de **tous** les movers du tour — y compris ennemis — déduites des événements `Move` du `TurnResult` (de → to) ; lignes ennemies dans la couleur accent adverse, lignes du joueur dans la sienne.
2. **Phase mouvements** : animer chaque unité le long de sa ligne (séquentiellement ou en parallèle par côté, au choix — mais toujours lisible) ; si un `Move` est suivi d'un combat sur la case d'arrivée, y ancrer les effets.
3. **Phase effets** : replis (`Retreat` — ligne de repli + déplacement), attaques répétées (`CombatExchange` successifs sur la même case — flashs rapprochés avec PV qui descendent), `Captured`/`BootyGold`/`CityFounded`/`CityCaptured` (toasts + effets), `Victory` (écran de fin).
4. Comportements conservés : skippable d'un clic, état affiché toujours autoritaire, ordres désactivés pendant la relecture.

Contrainte de données : **ne rien inventer** — seuls les événements reçus (filtrés par fog) alimentent l'annonce ; les mouvements ennemis hors de vue n'existent simplement pas à l'écran. Tests : construction du plan d'animation (séquencement événements → étapes) en pur.

## L3 — Vérification & livraison

1. Partie solo vs bot en local : soumettre des ordres (flèches persistantes visibles), fin de tour → **annonce des lignes ennemies puis mouvements puis effets** ; reconnexion → même relecture depuis `missedEvents`.
2. Suites vertes, `tsc` propre, `pnpm --filter @game/web build`, **déploiement prod** + vérification rapide en ligne.
3. README web mis à jour (contrôles + comportement du playback) ; capture d'écran d'une flèche persistante et d'une annonce de résolution dans le rapport.

## Périmètre interdit

Aucune modification de `packages/rules`, du protocole, du serveur (hors rien), des règles, des constantes ; pas de génération procédurale ni de personnalisation visuelle (phases suivantes) ; annotations DESIGN/RULES limitées à « implémenté en Lx » si pertinent.

## Fin de session

Rapport habituel (livrables, tests, captures, ambiguïtés + interprétations), puis arrêt et remise de la main. Les phases suivantes (6 : génération procédurale ; 4.5 : personnalisation visuelle) seront cadrées avec Erik — ses validations `BACKLOG.md` sont actives.
