# HANDOFF — Briefing de session (jeu 4X multijoueur asynchrone)

Tu reprends le pilotage du développement de ce projet. Ce document est ton point de départ. **Lis intégralement `DESIGN.md` et `RULES.md` avant toute ligne de code.** `RULES.md` est la spécification normative : ses identifiants `R-xx` / `T-xx` font foi, et tes tests doivent les citer. L'utilisateur parle français, pilote par jalons et veut être consulté à la fin de chaque phase.

## 1. Contexte en 30 secondes

Jeu de stratégie 4X multijoueur (référentiel Civilization Revolution) : **1v1, tours simultanés résolus en fin de tour (« we-go »), principalement asynchrone**, grille hexagonale 40×40, client Svelte + PixiJS, backend Cloudflare Workers + Durable Objects (WebSockets hibernation, budget 5 $/mois). Développement agentique sans échéance : **la spécification écrite et testée est le livrable n°1**.

- Architecture, décisions verrouillées, plan d'exécution (phases 0→7) : `DESIGN.md`
- Règles du jeu (normatif) : `RULES.md`
- Journal des angles morts couverts : `DESIGN.md` §7

## 2. État du dépôt

```
C:\Users\Erik\ZCodeProject
├── DESIGN.md          Architecture, décisions, plan d'exécution
├── RULES.md           Règles normatives — R-xx / T-xx tranchées, aucune question ouverte
├── HANDOFF.md         Ce fichier
└── packages/rules/    Moteur de règles PUR — Phase 0 en cours, 23 tests verts
    ├── src/rng.ts        RNG mulberry32 seedé (R-80)
    ├── src/combat.ts     Combat : force effective, round, échange, fightToDeath (R-51/52/55)
    ├── src/army.ts       Fusion d'armée 3 même type (R-31)
    ├── src/constants.ts  Constantes T-01..T-13
    ├── src/types.ts      UnitTypeData, TerrainData, Combatant
    ├── src/data/units.json    Guerrier 1/1/1, Colon 0/0/2 (v1)
    ├── src/data/terrain.json  6 terrains avec bonus défensifs et rendements
    └── tests/            combat.test.ts, data.test.ts — `pnpm test` vert
```

Pas encore de monorepo complet (`apps/web`, `apps/server` arrivent en Phase 1). Pas de dépôt git : **proposer un `git init` + commit initial en début de session** pour la traçabilité.

## 3. Environnement

- Windows, shell Git Bash, workspace `C:\Users\Erik\ZCodeProject`
- Node v24, **pnpm 10**
- Tests : `cd packages/rules && pnpm test` (vitest)

## 4. Conventions de travail

- Documents en **français**, code et identifiants en anglais.
- **Test-first** : chaque règle `R-xx` applicable a au moins un test qui la cite dans son nom ou son commentaire.
- **Déterminisme absolu** dans `packages/rules` (R-80/R-82) : pas de `Math.random()`, pas de `Date.now()`, tri explicite avant tout parcours de Map/objet.
- Moteur **pur** : aucune dépendance réseau/IO/DOM, aucune mutation de l'état en entrée (immuabilité).
- Les constantes marquées 🔶 sont des cibles de calibrage : **ne pas les modifier sans validation de l'utilisateur**.
- Ambiguïté bloquante : choisir l'interprétation la plus simple et déterministe, la documenter dans le code **et** la signaler dans le rapport final.

## 5. Mission de la session — compléter la Phase 0

Objectif : `resolveTurn` complet, testé, **sans serveur ni UI**. Livrables dans l'ordre :

### L1 — Coordonnées hexagonales (`src/hex.ts`)
- Coordonnées axiales `(q, r)`, orientation **pointy-top** (verrouillée pour l'implémentation ; le rendu s'y conformera).
- Fonctions : clé de case `"q,r"` (+ décodage), 6 voisins, distance, cases dans un rayon `n`, ligne entre deux cases, conversion pixel.
- Tests : invariants sur un disque (chaque case a exactement 6 voisins ; distance symétrique), continuité de ligne, aller-retour pixel→axial.

### L2 — GameState & événements (`src/state.ts`, `src/events.ts`)
- Types du GameState complet (esquisse en `DESIGN.md` §4.2) avec `schemaVersion` (voir §3.8 de `DESIGN.md` : les parties durent des jours, le code sera redéployé pendant — la chaîne de migration commence au premier commit).
- Union typée d'événements séquencés (R-73) : au minimum `Move`, `Attack`, `CombatExchange`, `UnitDestroyed`, `Retreat`, `Captured`, `BootyGold`, `ArmyFormed`, `CityFounded`, `CityCaptured`, `DiplomaticIncident`, `TurnResolved`.
- Helpers de fixtures pour construire des états de test.

### L3 — Cartes préfabriquées (`src/data/maps/*.json` + loader)
- Définir un format JSON simple : dimensions, terrain par case (dense ou par runs), spawns des 2 joueurs symétriques, position des capitales.
- 2 fixtures 40×40 : une pédagogique (terrains simples), une pangée (eau en bordure, T-11).
- Loader avec validation testée (terrains connus, spawns valides et à distance ≥ 12).

### L4 — `resolveTurn` (`src/turn.ts`) — le cœur
Signature : `resolveTurn(state, ordersByPlayer, rngSeed) → { newState, events }`.
Implémenter les phases de `RULES.md` §5-9 :
- **Phase A — Mouvements** : R-40 (garantie), R-41 (ordre par `unitId` croissant), R-42 (fin de chemin : vide/stationnaire/mover/amie), R-43 (unités pacifiques), R-44 (fusions).
- **Phase B — Combats** : R-50 à R-59 — attaques, collisions, repli unifié (origine → adjacente par proximité → attaques répétées), allocation du dernier repli au perdant le plus haut PV, capture des unités pacifiques + butin `T-12`, unités à distance (règles R-59 dès maintenant, même si aucune unité v1 ne les utilise), diplomatie R-58 (points d'accroche, inactifs en v1).
- **Phase C — Économie** : R-60 à R-65 — une case travaillée, répartition science/or, files de production, croissance, fondation de ville, capture de ville. Valeurs 🔶 littérales du document.
- **Phase D — Vision/soins/PM** : R-70 à R-73, rayons `T-07`/`T-08`.
- Idempotence : même `(state, orders, seed)` → même `(newState, events)` bit à bit (crash-recovery, §3.5 de `DESIGN.md`).
- Le timer/auto-verrouillage est géré côté serveur (Phase 1) : ici, la fonction reçoit des ordres déjà verrouillés.

### L5 — Brouillard (`src/fog.ts`)
- `getFilteredState(state, player)` : 3 états (inexploré / exploré-masqué / visible, R-70), **aucune** entité ennemie hors `visible`, cases inexplorées absentes (pas juste nulles).
- **Filtrer aussi le journal d'événements** : un joueur ne doit rien apprendre d'une zone qu'il ne voit pas.
- Tests dédiés : l'état filtré ne contient jamais l'unité ennemie hors vision, y compris après un combat loin de la vue.

### L6 — Propriétés transversales (fast-check)
- Déterminisme/idempotence de `resolveTurn` sur des états aléatoires valides.
- Invariant R-30 (non-empilement) après chaque tour : au plus une entité amie par case.
- Conservation : aucune unité ne disparaît sans événement correspondant.

## 6. Critères d'acceptation

1. `pnpm test` vert, chaque règle `R-xx` applicable couverte par au moins un test.
2. Scénario de bout en bout testé : depuis une fixture, simuler plusieurs tours (ordres → résolution ×N) incluant un combat, une fondation de ville et une capture de colon.
3. Aucune dépendance runtime dans `packages/rules` (devDeps uniquement : vitest, fast-check, typescript).
4. `README.md` dans `packages/rules` : structure, commandes, traçabilité R-xx.

## 7. Périmètre interdit (cette session)

- Ne pas créer `apps/web`, `apps/server`, ni le monorepo turborepo (Phase 1).
- Ne pas modifier `RULES.md`/`DESIGN.md` (hors annotation « implémenté en Lx ») — tout changement de règle attend l'utilisateur.
- Pas de déploiement, pas de push distant.

## 8. Fin de session

Rapport attendu : livrables, résultats de tests, ambiguïtés rencontrées et interprétations choisies, propositions pour la Phase 1 (monorepo, GameDO/LobbyDO, hibernation WebSocket, OAuth). **S'arrêter après la Phase 0** et rendre la main à l'utilisateur — il pilote les jalons.
