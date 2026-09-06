# HANDOFF PHASE 7d — Barbares & huttes bonus

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~334 tests), `RULES.md` (R-85..R-94 en place, §2 terrains/ressources), `RECHERCHE-RESSOURCES.md` (notes de l'agent 7c — les mécaniques barbares/huttes de Civ Revolution y sont documentées), `schemaVersion` actuel : **7**.

Contexte : Phases 0→7c complétées, économie Civ Revolution + technologies + ressources data-driven en production, CI/CD actif. **Cette phase est le dernier prérequis de la génération procédurale (6b)** : des villages barbares et des huttes posés sur les cartes, des barbares qui rôdent et attaquent, des huttes à récompenses seedées.

**Principe directeur : les barbares sont un pseudo-joueur piloté par le moteur.** Aucune décision réseau, aucun verrou de tour : leurs ordres sont **générés à chaque résolution** par une fonction pure du moteur (`barbarianOrders(state)`), déterministe (RNG seedé R-80). Ils subissent les règles de combat, replis, forfait et fog comme tout le monde.

## Mission — livrables dans l'ordre

### L0 — Règles écrites (transcription dans RULES.md §7.9, test-first)

Transcrire les règles suivantes dans `RULES.md` §7.9 « Barbares & huttes », puis implémenter :

- **R-95 · Faction barbare.** Pseudo-joueur `barbarien` : n'a ni ville fondable, ni recherche, ni verrou de tour ; ses unités respectent toutes les règles de combat/collision/repli (R-51..R-59) et sont filtrées par le brouillard comme tout ennemi. Sa force **monte en gamme** : guerrier d'abord, archer après le tour `T-23` 🔶 (escalation).
- **R-96 · Villages barbares.** Entités de carte (`villages: [{q,r}]` dans les JSON de carte) — **3 villages sur chacune des cartes 40×40** (placements symétriques/équitables). Chaque village engendre une unité barbare toutes les `T-18` 🔶 tours tant que son **cap d'unités vivantes** (`T-24` 🔶, par village) n'est pas atteint. Le village est **attaquable** (`T-21` PV) : à 0 PV il est **détruit**, le vainqueur touche `T-20` 🔶 or. Un village détruit disparaît définitivement.
- **R-97 · IA barbare (déterministe).** Ordre de priorité par unité : (1) **attaquer** une unité ou ville ennemie adjacente ; (2) sinon **avancer** d'un pas vers l'entité ennemie la plus proche dans un rayon d'aggro `T-19` 🔶 ; (3) sinon tenir. Les barbares **peuvent capturer les villes sans défenseur** (R-57) : 🔶 **la ville est alors rasée** (disparaît, événement `CityRazed`) — **si la capitale d'un joueur est rasée, ce joueur perd** (défaite). Tie-breaks R-81 partout.
- **R-98 · Huttes bonus.** Entités de carte (`huts`), **2 par carte**. Ouvrir = entrer sur la case avec n'importe quelle unité (même pacifique) ; une seule fois. Récompense tirée au RNG seedé dans la table **`huttes.json`** (data-driven, éditable) : or (`T-25`-`T-26` 🔶), unité gratuite (guerrier), boost science (+20 sur la recherche courante), révélation de carte (rayon 3), **embuscade** (2 barbares engendrés adjacents — issue de la table comme les autres), rien. Événement `HutOpened(reward)`.
- **Constantes nouvelles** : `T-18` spawnInterval (3), `T-19` aggroRadius (6), `T-20` villageDestructionGold (25), `T-21` villageHP (3), `T-22` cap par village (2), `T-23` escalade (tour 15), `T-24` …, récompenses huttes — tout dans `barbares.json`/`huttes.json` (data-driven, calibrable sans code).

### L1 — Moteur (test-first)

1. `barbarianOrders(state)` : fonction pure, déterministe (seed R-80), appelée en tête de `resolveTurn` — les barbares jouent avec les mêmes phases (mouvements → combats → économie leur est inutile).
2. Villages/huttes portées du JSON de carte vers l'état (`schemaVersion` **7→8**, migration : villages/huttes depuis la carte, compteurs à zéro) ; villages attaquables (cible de combat valide, subissent les rounds R-51) ; destruction → or + événement.
3. Huttes : ouverture à l'entrée (Phase A), récompense appliquée (or/production d'unité adjacente/boost science R-85/révélation = ajout au `explored` du joueur/embuscade = spawn barbares adjacents **immédiat, hors village**), événement `HutOpened`.
4. **Rasement** (R-97) : capture barbare d'une ville → `CityRazed` (ville supprimée, bâtiments perdus) ; capitale rasée → événement `Victory(reason:'razedCapital')` pour l'adversaire humain.
5. **Interactions à vérifier par tests** : barbare + joueur convergent vers la même case (R-53 normale) ; barbare fortifié impossible (pas d'ordre Fortify) ; forfait **non affecté** (les barbares n'ont pas de verrou) ; unités barbares **heal** selon R-71 ; les barbares peuvent être vétérans (R-32).
6. **Anti-triche** : les ordres barbares ne sont **jamais envoyés aux clients** — seuls les événements résultants, filtrés par fog.

### L2 — Serveur

Rien de nouveau côté protocole (les barbares vivent dans `resolveTurn`) ; admin dump incluant villages/huttes/compteurs ; snapshots filtrés (barbares = ennemis). Vérifier l'**asynchrone** : une résolution déclenchée par un seul joueur verrouillé + timer fait jouer les barbares normalement.

### L3 — UI

1. Sprites via `generate.py` : **Guerrier/Archer barbares** (accent dédié gris-brun — ni rouge ni bleu), **village barbare** (tente/camp), **hutte** ; `sync-art`.
2. Rendu : barbares/villages/huttes comme entités ennemies (fog appliqué) ; **toasts** (village détruit +or, hutte ouverte +récompense, ville rasée, capitales) ; entrées de journal.
3. Les huttes/villages inexplorés sont invisibles (fog) — une hutte révélée par récompense apparaît explorée.

### L4 — Vérification & livraison

1. **Scénario e2e moteur** (seedées) : village engendre au tour 3 → barbare attaque l'unité adjacente → hutte ouverte avec chacune des 5 récompenses (une partie par graine) → village détruit → or T-20 → ville sans défenseur investie par barbares → rasée → capitale rasée → défaite.
2. **GUI locale vs bot** : voir un barbare apparaître, se faire attaquer, ouvrir une hutte, détruire le village ; captures.
3. README + rapport ; déploiement prod via CI ; vérification en ligne.

## Critères d'acceptation

1. R-95..R-99 dans `RULES.md`, chaque règle couverte par tests citant son identifiant ; migration v7→8 testée ; suites globalement vertes (~334+).
2. Le scénario e2e §L4 passe intégralement ; barbares actifs en asynchrone (résolution à un seul verrou + timer).
3. Tout est calibrable en données (`barbares.json`, `huttes.json`, cartes) — zéro durcissement de règle dans le code.
4. Déployé en prod, vérifié en ligne.

## Périmètre interdit (cette session)

Génération procédurale (6b — prochaine phase), naval (les barbares restent terrestres), merveilles, culture (décision D2 en attente — les huttes ne la touchent pas), engagements multi-participants généralisés (BACKLOG idée 2 — les cas 1v1 barbare se traitent avec les règles existantes), diplomaties. Toute interprétation : documenter + signaler au rapport.

## Fin de session

Rapport habituel + arrêt et remise de la main. **La Phase 6b (génération procédurale) suivra** — elle aura alors tout ce qu'il faut : rendements (6), ressources (7c), barbares/huttes (7d).
