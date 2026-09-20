# REPORT-REPLAY-RESOLUTION — Relecture de la résolution de fin de tour (2D) + journal cliquable

> Mission `HANDOFF-REPLAY-RESOLUTION.md` — livrée le 20/09. **Non committé** :
> captures de validation locale produites (règle d'Erik), en attente de ton
> feu vert en ligne avant commit/push (la CI déploie au push).

## 1. Ce qui est livré

### L1 — Journal cliquable ✅
- `apps/web/src/lib/replay.ts` :: `hexDeLEvenement(ev)` — fonction PURE, depuis
  les **données structurées** de l'événement (jamais le libellé, D5) :
  `Move`/`Retreat`/`UnitExpelled`/`UnitDispersed` → destination ; tout type
  portant `at` (combats, destructions, villes, production, barbares, huttes,
  espionnage…) → `at` ; `NukeLaunched` → cible si détonée, `at` sinon ;
  `null` sinon (tech, fin de tour, victoire…) → entrée non cliquable
  (curseur normal).
- `Journal.svelte` : chaque entrée à case est cliquable (curseur pointeur,
  survol souligné, `title` explicite) → `centerOnHex(hex)` via `canvasApi` —
  **zoom inchangé**. Pendant la vue ville le journal est masqué (comportement
  existant : la colonne de droite disparaît entièrement) — rien à aligner
  avec la touche F.
- **Mesuré e2e** : après clic, la case visée est au centre du canvas à
  **0 × 0 px** d'écart.

### L2 — Capture de l'état pré-résolution ✅
- `apps/web/src/lib/replay.ts` :: `replayPair` (store) + `reducePaireReplay`
  (PUR, testé). Câblé dans `gameClient.ts` :: `apply()` — la paire
  `{ statePrecedente, events, tour }` est mémorisée AVANT l'écrasement de la
  vue (au `TurnResult`, l'état affiché EST le pré-état), **remplacée** à chaque
  tour (pas d'historique, D1), **purgée au `Snapshot`** (chargement,
  reconnexion, resync visibilité) → bouton indisponible + tooltip explicatif
  (défaut sûr, `missedEvents` compris).

### L3 — Mode relecture ✅
- `Playback` : hook public `onEvenement(ev)` appelé AU DÉBUT de chaque
  événement rejoué — les durées/fx/toasts/annonce/accélération par clic
  existants sont réutilisés tels quels.
- `replay.ts` :: `cloneEtatReplay` (structuredClone) + `appliquerEvenement`
  (PUR, testé) : le delta visuel est appliqué AU CLONE — `Move`/repli/
  expulsion/dispersion (position + perte de fortification R-175),
  `CombatExchange`/`MeleeResolved` (PV), `UnitDestroyed` (le sprite disparaît
  À L'ÉVÉNEMENT — LA différence avec le playback cosmétique),
  `Captured` (propriétaire/position ou disparition), `CityCaptured`
  (drapeau), `CityRazed`, `CityFounded`/`UnitProduced` (apparition),
  `Embark`/`Disembark`, population, `CityNuked`. Unité absente du pré-état
  (fog) = ignorée silencieusement (D6). L'état autoritaire du store n'est
  JAMAIS muté (D3).
- `GameCanvas.svelte` : nouveaux props `etatReplay` / `replayActif` /
  `onExitReplay`. Un `$effect` bascule l'état rendu (clone ↔ état de la vue,
  vision/fog recalculés depuis le clone, caches de survol purgés, tout
  marqué dirty) — même pipeline de rendu, pan/zoom pleinement opérationnels
  pendant la relecture. Échap quitte la relecture (prioritaire sur vue ville).
- `Game.svelte` : bouton **« ⟲ Rejouer la résolution »** au-dessus du journal
  (grisé + tooltip tant qu'aucune paire, pendant le playback en cours) ;
  pendant relecture : **« ⏹ Quitter la relecture (Échap) »** ; fin de file →
  retour AUTOMATIQUE à l'état réel ; relançable tant que pas de nouveau
  `TurnResult` (D4). `terminerReplay()` purge playback + état dérivé (appelé
  aussi sur Snapshot/TurnResult).

## 2. Vérification (L4)

- **Tests unitaires** : `apps/web/tests/replay.test.ts` — 15 tests :
  `hexDeLEvenement` (types à case, ICBM, cas null), effets du clone (Move
  sans muter le pré-état, destruction, PV, drapeaux, apparitions,
  embarquement, R-175), **fin de file = état réel** (`etatsCoincident`) +
  détection d'écarts, capture/remplacement/purge de la paire.
- **Suite** : web **345/345** (330 + 15), racine turbo verte, **typecheck
  0 erreur** (14 warnings svelte préexistants, LaboCombat).
- **e2e** (`dev-logs/driver-replay-resolution.mjs`, partie solo contre bot,
  navigateur CDP connecté AVANT la résolution) — **2 passes vertes** :
  1. AVANT : guerrier affiché à destination ;
  2. clic journal « u2 se déplace vers (q,r) » → case centrée, **0 px**
     d'écart, zoom inchangé ;
  3. « Rejouer » : pendant la phase annonce, delta sprite =
     delta projeté origine (**−111 × 0 px**, exact) — le guerrier est À SON
     ORIGINE, playback actif, pan/zoom libres ;
  4. fin de file → retour automatique, sprite identique à AVANT (état réel) ;
  5. relance + **Échap** → arrêt immédiat, état réel réaffiché ;
  6. rechargement (Snapshot) → bouton grisé + tooltip explicatif.
- **Captures** : `dev-logs/captures-replay/01…06` — 03 montre le guerrier à
  l'origine, la ligne d'annonce, le bandeau « Relecture du tour » et le
  bouton « Quitter la relecture ».

## 3. Décisions appliquées / écarts

- D1..D7 appliquées telles quelles. Aucun changement `packages/rules`,
  `apps/server`, `schemaVersion`, réseau (D7) — diff client uniquement
  (`apps/web` + `dev-logs`).
- **Zones grises documentées** :
  - `etatsCoincident` compare le VISIBLE (unités : position/PV/propriétaire/
    transport ; villes : position/propriétaire/pop) — la relecture est un
    rendu, pas une re-simulation : les champs hors rendu (`mp`, `order`,
    `stabilized`, résiduels économiques) ne sont pas reproduits. Aucun écart
    visible attendu en fin de file pour les types couverts par
    `appliquerEvenement` ; les cas non couverts (ex. `ArmyFormed` — fusion
    recréée par le moteur, `UnitsUpgraded`, vols d'espion) n'altèrent que des
    détails hors carte ou rattrapés par d'autres événements du même tour.
  - Ville/unité « minimales » créées sur `CityFounded`/`UnitProduced` :
    suffisantes au rendu carte (les panneaux détaillés restent sur l'état
    réel — les interactions de carte sont coupées pendant la relecture).
  - Le clic journal-centrage est aussi actif pendant le playback cosmétique
    d'une résolution (inoffensif : pur recentrage).
  - Un resync déclenché par le changement de visibilité de l'onglet purge la
    paire (miroir du défait sûr L2) : après un alt-tab, le bouton peut être
    grisé jusqu'au tour suivant — choix délibéré, à vetoer si tu le veux
    plus permissif.

## 4. À vérifier en ligne (login Erik)

1. Look/placement du bouton « ⟲ Rejouer la résolution » (au-dessus du journal
   dans la colonne de droite) — 🔶 déplaçable (bandeau de fin de tour ?).
2. Le rythme de la relecture (durées `DURATIONS` existantes, annonce 1 s) —
   🔶 retouches à l'œil.
3. Comportement du clic journal quand la carte est déjà centrée (recentrage
   à l'identique, sans zoom).
4. Scénarios riches : combats (PV par compartiments), capture de ville
   (drapeau), barbares — valider que la disparition/apparition se produit AU
   BON MOMENT de la relecture.

## 5. Périmètre respecté

Pas d'historique multi-tours, pas de trace admin en UI joueur, pas de 3D,
pas de raccourci au-delà d'Échap. Piège contourné pendant l'e2e : le port
CDP 9229 est occupé par le debugger wrangler (le pilote utilise 9333) ;
le guerrier n'a qu'1 PM — un chemin de 2 cases laisse un chemin gelé
(affichage optimiste) qui faussait les mesures (pilote corrigé : 1 pas).
