# @game/rules — Moteur de règles pur

Moteur de règles du jeu 4X multijoueur asynchrone (référentiel Civilization
Revolution). **Fonction pure et déterministe** : zéro dépendance réseau/IO/DOM,
aucune mutation de l'état en entrée, aucun `Math.random()`/`Date.now()`
(R-80/R-82). Spécification normative : [`RULES.md`](../../RULES.md) —
architecture : [`DESIGN.md`](../../DESIGN.md).

## Commandes

```bash
pnpm test        # vitest run — 132 tests (unitaires + propriétés fast-check)
pnpm test:watch  # mode watch
npx tsc --noEmit # vérification de types (strict, NodeNext)
```

Dépendances : **aucune au runtime** ; devDeps uniquement (`vitest`,
`fast-check`, `typescript`).

## Structure

```
src/
├── hex.ts            Coordonnées axiales (q,r) pointy-top : clé, voisins,
│                     distance, disque, ligne, pixel, rectangle (L1)
├── state.ts          GameState versionné (schemaVersion + chaîne de migrations),
│                     ordres, tri déterministe des ids (R-81) (L2)
├── events.ts         Journal d'événements typé et séquencé (R-73) (L2)
├── data.ts           Tables data-driven : units.json, terrain.json
├── constants.ts      Constantes T-01..T-13 + 🔶 défauts d'économie
├── rng.ts            RNG mulberry32 seedé (R-80)
├── combat.ts         Force effective, round p = S_att²/(S_att²+S_def²),
│                     échange, combat à mort (R-51/52/55)
├── army.ts           Fusion d'armée 3 même type (R-31)
├── map.ts            Format JSON des cartes + loader validé + état initial (L3)
├── fog.ts            Brouillard 3 états : vision, getFilteredState,
│                     filtrage du journal (R-70) (L5)
├── turn.ts           resolveTurn — phases A/B/C/D (R-40..R-72) (L4)
├── forfeit.ts        checkForfeit — défaite au-delà de T-06 timers manqués (L0-P1)
├── fixtures.ts       Constructeurs d'états de test (L2)
└── data/
    ├── units.json        Guerrier 1/1/1, Colon 0/0/2 (v1)
    ├── terrain.json      6 terrains + case de ville (2/1/1, +50 %)
    └── maps/             pedagogique-40.json, pangee-40.json (L3)
tests/                 combat, data, hex, state, map, fog, turn, e2e, properties
```

## Traçabilité R-xx / T-xx

| Règle | Sujet | Implémentation | Tests |
|---|---|---|---|
| R-30 | Non-empilement | `turn.ts` (blocages, replis, éparpillement) | `turn`, `properties` (P2) |
| R-31/R-32 | Armées, vétérans | `army.ts`, `turn.ts` (fusion, coup fatal) | `combat`, `turn` |
| R-40..R-44 | Phase A — mouvements | `turn.ts` (`executeMoveOrder`, `processFormArmy`) | `turn` |
| R-50..R-59 | Phase B — combats & replis | `turn.ts` (`resolveAttack`, `resolveCollision`, `allocateRetreats` — R-56 deux passes), `combat.ts` | `combat`, `turn` |
| R-58 | Diplomatie (points d'accroche) | `state.ts` (`areAtWar`), `turn.ts` (rejet, repli mutuel, détention) | `state`, `turn` |
| R-60..R-65 | Phase C — économie | `turn.ts` (`processEconomy`, `processCityCaptures`, `processFoundCity`) | `turn` |
| R-70..R-73 | Phase D — vision, soins, PM, journal | `fog.ts`, `turn.ts`, `events.ts` | `fog`, `turn` |
| T-06 | Forfait (missedTurns, v2) | `forfeit.ts` (`checkForfeit`), migration v1→v2 | `forfeit` |
| R-80/R-82 | Déterminisme, interdits | `rng.ts`, tris explicites partout | `combat`, `turn`, `properties` (P1) |
| R-81 | Tris déterministes | `state.ts` (`compareIds`), `hex.ts` (`compareHex`) | `state`, `hex` |
| T-01..T-13 | Constantes | `constants.ts` | `data`, `turn` |

Chaque règle applicable est citée dans le nom ou le commentaire d'au moins un
test (convention §4 du HANDOFF).

## Format des cartes (L3)

```jsonc
{
  "id": "pangee-40", "width": 40, "height": 40,
  "legend": { "g": "prairie", "p": "plaine", "f": "foret",
              "h": "colline", "m": "montagne", "w": "eau" },
  "rows": ["40 caractères", "…"],   // rangée r, colonne c ⇔ case (q = c − ⌊r/2⌋, r)
  "players": [                       // exactement 2 en v1
    { "id": "p1", "capital": {"q": -4, "r": 20},
      "units": [{"type": "guerrier", "q": -4, "r": 20},
                {"type": "colon",   "q": -3, "r": 20}] },
    …
  ]
}
```

Validation (`parseMap`) : dimensions, terrains connus, spawns dans la carte et
praticables, capitales à distance ≥ 12, types d'unités connus, au plus une
unité par case. `createInitialState(map, seed)` produit un état v1 complet
(capitales fondées, vision initiale, guerre permanente R-58).

## Interprétations tranchées (🔶 — à valider)

Documentées dans le code et le rapport de session ; les principales :

1. **Repli R-54** : la « case d'origine » est la position en début de tour ;
   si l'unité s'y trouve encore et libre, le repli est un repli sur place
   (`stay`), sauf pour le défenseur à distance (R-59-d) qui doit céder la case.
2. **R-56 (allocation des replis, deux passes)** : passe 1 — tous les combats
   se résolvent (un échange chacun, R-50..R-52) et les perdants devant replier
   sont collectés ; passe 2 — les cases de repli libres sont allouées
   GLOBALEMENT par perdant à PV décroissants (tie : `unitId` croissant),
   chacun recevant sa meilleure case R-54 évaluée après tous les combats ;
   passe 3 — les perdants sans case reprennent le combat avec une attaque
   supplémentaire contre le vainqueur de leur propre combat (qui n'a jamais
   quitté la case), jusqu'à élimination (R-55). Refonte du 29/08, remplace
   l'implémentation Phase 0 « premier résolu, premier servi ».
3. **R-59-b (pas de riposte)** : chaque round retire directement 1 PV au
   défenseur non-à-distance (p = 1 côté attaquant) — garantit la terminaison
   de R-55.
4. **Halte (R-42)** : un ennemi visible **en début de tour** est « connu » et
   ne déclenche pas de halte ; seules les sightings nouvelles gèlent le chemin.
   L'ennemi situé sur la case visée ne bloque jamais (I-1).
5. **Chemin invalide** (hors carte/infranchissable) : le reste du chemin est
   **effacé** ; blocage amical ou halte : le chemin restant est **gelé**.
6. **FormArmy (R-44)** : ordre consommé chaque tour ; si la fusion échoue, les
   membres co-localisés sont éparpillés (le plus petit unitId reste) pour
   préserver R-30.
7. **Brouillard (L5)** : ville ennemie visible uniquement quand la case est
   visible (lecture stricte de R-70) ; événements : passent s'ils sont publics
   (`TurnResolved`, `Victory`, `DiplomaticIncident`), impliquent une entité du
   joueur, ou toutes leurs références sont explorées/visibles ; `rngSeed` est
   masqué dans l'état diffusé.
8. **Économie 🔶** : `scienceRatio` 0.5 (reste entier à l'or), seuil de
   croissance `10 × pop`, production `+25 %/pop` au-delà de la 1ʳᵉ population,
   file vidée après complétion, unité en attente si case de ville occupée.
9. **Case de ville** : terrain `'ville'` (2/1/1, +50 %) posé à la fondation.
10. **Forfait T-06** : le seuil est atteint dès que `missedTurns` vaut
   `FORFEIT_MISSED_TURNS` (« défaite après T-06 timers manqués », RULES.md §1).
   Le compteur est tenu par le serveur (GameDO) ; si les deux joueurs
   atteignent le seuil simultanément, le plus petit `playerId` perd (R-81).

## Migrations de schéma (§3.8)

`CURRENT_SCHEMA_VERSION = 2` ; `MIGRATIONS` :
`MIGRATIONS[2]` ajoute `missedTurns: 0` aux joueurs des états v1 (forfait
T-06). `migrateState()` applique la chaîne au chargement côté serveur — toute
future évolution ajoute `MIGRATIONS[n] = (state) => newState`.
