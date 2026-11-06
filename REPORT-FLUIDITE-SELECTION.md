# REPORT-FLUIDITE-SELECTION — Tranche 1 : FSM, cyclage automatique, caméra qui glisse

**Mission du handoff `HANDOFF-FLUIDITE-SELECTION.md` (Erik 05/11) — LIVRÉE, L3 labo en attente de l'œil d'Erik.**

## Ce qui est livré

### D-A — La machine à états explicite (le socle)

Nouveau module pur **`apps/web/src/lib/render/fsm-interaction.ts`** :

- **États documentés** (`ETATS_INTERACTION`) : `inactif`, `uniteSelectionnee`, `previsualisation`, `formationArmee`, `nukeArmed` ;
- **`etatInteraction(ui)`** : lecture pure de l'état d'après l'UiState — miroir EXACT de l'ordre des guards historiques de `clickAction` (nukeArmed écrase tout, puis armyDraft, puis draft, puis selectedUnitId). Une VILLE sélectionnée reste `inactif` (aucune unité pilotée — le document d'Erik ne décrit pas d'état ville ; consigné) ;
- **`transitionValide(de, vers)`** : table des transitions nommées — tout état se vide vers `inactif` ; les sauts entre modes distincts sans repasser par la sélection (prévisualisation → nukeArmed…) sont documentés comme illégaux ;
- **Ré-attachement** : `clickAction` (interaction.ts) ouvre désormais sur `switch (etatInteraction(ui))` — les branches `nukeArmed`/`formationArmee` sont les cas nommés, le corps historique (sélection, cycle de pile, worked tiles) s'applique inchangé au `default`. **Zéro changement de comportement** : les 774 tests web (dont interaction, correctifs-selection, geste-armee, ui-jeu-t1/t3) restent verts.

### D-B — Le cyclage automatique + caméra qui glisse

- **`unitesDisponibles(view)`** : candidats = à moi, PM > 0, ni ordre (soumis ni chemin gelé), ni fortifiée, pas à bord — miroir exact de `unitsWithoutOrders` + le critère PM. Ordre stable par id.
- **`prochaineUniteDisponible(view, courante, { boucler })`** : la SUIVANTE après la courante par id ; courante hors liste = première candidate d'id supérieur ; `boucler: false` (auto) → `null` en fin de file (retour à l'inactif, pas de rebouclage vertigineux) ; `boucler: true` (N) → rebouclage.
- **Déclencheurs** (Game.svelte, data-driven — couvrent raccourcis clavier ET boutons du panneau) :
  1. `OrderAck` accepté d'ordre PASSIF (Fortify / Sleep / Heal / Pass / FoundCity) sur l'unité sélectionnée ;
  2. `TurnResult` : l'unité sélectionnée avait un Move/MultiStep désormais entièrement consommé (plus d'ordre soumis, pas de chemin gelé, pas de fortification) = **PM épuisées à la résolution**.
- **La caméra GLISSE** : `centerOnHexAnime(hex, dureeMs)` dans GameCanvas — interpolation `easingGlissement` (easeInOutCubic, §2 du document d'Erik), avance à chaque tick Pixi, vise la copie la plus proche sur le cylindre (CARTE-RONDE — delta X le plus court), `wrapClamp` à l'arrivée. Toute prise de main utilisateur (pan, zoom, centrage direct) COUPE le glissement (`couperLerp`). Repli instantané historique en 3D et hors montage.
- **Seuil data-driven** : `SEUILS_FLUIDITE.cameraLerpMs = 400` (un seul endroit à re-calibrer au labo).

### D-C — Le cyclage manuel `N`

`raccourciCyclage` (Game.svelte, gestionnaire central `svelte:window`) : gardes identiques aux raccourcis d'ordre (saisie texte, modales, relecture, vue ville, tour éditable) ; rebouclage. **F/H/S/Z/Espace/B INTACTS** (test verrou dans fluidite-selection.test.ts).

### D-D — Le toggle

Bouton **« Cyclage auto »** dans la barre DEV, à côté de God mode, `active-toggle`, **ACTIVÉ par défaut** (`$state(true)`), réversible. Le cyclage manuel N n'est jamais touché par le toggle.

## Preuves

- Tests FIRST : `apps/web/tests/fluidite-selection.test.ts` — 15 tests (états, priorités, transitions, non-régression clickAction, cyclage auto/manuel, exclusions, easing, câblage). Suites AVANT commit : **web 774/774** (759 + 15), **svelte-check 0 erreur**.
- Captures GUI 1280×720 AVANT commit (solo vs bots SPWV6E, script `devtmp/fluidite-selection-gui.mjs`, worker 8787 unique) : `dev-logs/captures-fluidite-selection/` —
  1. `1-toggle-actif-defaut.png` (toggle ACTIVÉ par défaut) ; `2-toggle-desactive.png` (réversible) ;
  2. `3-cyclage-N-unite-suivante.png` — **glissement prouvé par sonde `__game.camera()`** : y −3019,6 (départ) → −3029,6 (+150 ms) → −3063,9 (arrivée) : progression monotone, jamais un saut sec ;
  3. `4-ordre-passif-cyclage-auto.png` — S (Sommeil) → sélection basculée seule sur la suivante (panneau peuplé) ;
  4. `5-fin-de-file-inactif.png` — S sur la dernière unité → désélection (retour inactif).

## Pièges consignés

- **TS narrowing** : le switch sur `etatInteraction(ui)` ne narrow pas `ui.armyDraft` — locale `brouillonArmee` + garde explicite (consigné : c'est le « re-cal d'accès à l'état » prévu au handoff L1) ;
- **Admin dump** : la racine est `{ meta, state, … }` — le tour est `dump.state.turn` (piège mémoire « turn≠tour ») ;
- **Garnison cyclable** : la production guerrier apparaît DANS la capitale — ne pas exclure les unités sur case de ville du cyclage (le script GUI a été corrigé sur ce point) ;
- **Assertions caméra** : échantillonner à +0 ms / +150 ms / +850 ms — la progression monotone est le critère, pas la position absolue (départ = arrivée quand la cible est déjà centrée) ;
- Le glissement AUTO n'a pas pu montrer de mouvement dans la capture 4 : la caméra était DÉJÀ centrée sur la cible (le N précédent l'y avait menée) — le mouvement est prouvé par la sonde du N (capture 3) ; même easing sur les deux chemins.

## Hors périmètre (respecté)

Tactile (tranche 2 — backlog Steam), Undo général, moteur/serveur, Jev/bots, `schemaVersion` 28 (intact — zéro code serveur), surimpressions existantes (préview vivante, décodeur de combat, minimap).

## Restant — L3 labo (arrêt-pour-approbation)

**Erik tranche la VITESSE de caméra en jouant en local.** Le seul levier est `SEUILS_FLUIDITE.cameraLerpMs` (`fsm-interaction.ts:88` — 400 ms par défaut). Si veto : un chiffre, un commit data. La fluidité est subjective — c'est l'œil qui valide.
