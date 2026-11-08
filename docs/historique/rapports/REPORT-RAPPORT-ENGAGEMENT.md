# REPORT-RAPPORT-ENGAGEMENT — Sommaire de combat au clic sur une case

**Statut : IMPLÉMENTÉ, NON COMMITTÉ — arrêt pour approbation d'Erik** (§4 L4 : ne committer qu'après feu vert). Suites vertes (web 416/416 dont 11 nouveaux, svelte-check 0 erreur, typecheck monorepo 0 erreur). Captures dans `dev-logs/captures-rapport-engagement/`. **Verdict visuel Erik reçu en session : « le visuel est parfait »** (capture mêlée 3 nations montrée à l'écran).

## 1. Ce qui est livré

Clic gauche sur une case portant un événement de combat du tour → popover ancré « sommaire de case », après résolution ET pendant la relecture (le rapport PRIME sur l'accélération pendant la relecture ; après résolution, il s'OUVRE EN PLUS de la sélection existante — D1, 🔶 à l'œil).

Contenu (D2/D4) :
- en-tête serif or « Case (q,r) · N participants » (tokens app.css : `--or`, `--serif-or`… identiques au lobby), apparition scale+fade 150 ms, pointeur vers la case ;
- ligne « Mêlée d'instabilité (R-180) » quand `MeleeResolved` porte sur la case ;
- par participant, trié vainqueur → milieu → perdant en mêlée (ordre de première mention sinon) :
  - **logo or de nation** (table `nations.ts`, `logoEchelle` respecté) + bandeau de couleur de faction (bord gauche, couleur `playerColor`) ;
  - **rôle** en badge : VAINQUEUR (or) / MILIEU (gris) / PERDANT (rouge) ;
  - **barre de PV avant→après** en compartiments (style barre 3 vies) : cellules perdues en rouge, delta texte `3→2 (−1)` ;
  - **sort** : reste en place / détruit ☠ / expulsé → (q,r) / repli / capturé ;
- bouton **« ⟲ Rejouer ce combat »** (D3) : recentre sur la case (zoom préservé) + lance la relecture ; si relecture déjà active : recentrage seul ; grisé avec tooltip si `replayPair` indisponible (reconnexion/Snapshot) ;
- fermeture : clic ailleurs, Échap, × — toutes vérifiées e2e.

## 2. Architecture (zéro changement moteur/serveur/protocole)

- **`apps/web/src/lib/rapport.ts` (nouveau, pur, testé)** — `resumesDeCase(events, hex, preEtat?, etatApres?)` et `casesDeCombat(events)`. Tout se déduit des `GameEvent` filtrés fog (Attack, CombatExchange, MeleeResolved, UnitDestroyed, Captured, UnitExpelled/UnitDispersed, Retreat). PV avant seedés depuis `replayPair.statePre` (une unité absente du pré-état : `pvAvant` null, owner/type replisés sur l'état post). Agrégation calculée à l'ouverture, **cache par tour** (D7), purgé à chaque nouveau `TurnResult` (popover fermé en même temps).
- **`RapportCombat.svelte` (nouveau)** — le popover ; reçoit résumé + infos d'affichage (nom d'unité via `unitType().name`, faction via civId/`civName`, logo via `nationDe`, couleur via `playerColor`, hpMax). Fermetures internes (svelte:window).
- **`GameCanvas.svelte`** — props `casesRapport` / `onRapport` ; branchement dans `onPointerUp` (clic gauche réel) ; api `onReady` étendue de `hexEcran(hex)` (projection hex→écran, pose courante) ; hook dev `clickHex` miroite le chemin rapport (tests GUI).
- **`Game.svelte`** — dérivés `casesRapport`/`resumeRapport`/`infosRapport`/`posRapport` (bornage viewport, flip au bas 🔶 estimation 320 px), `ouvrirRapport` (bascule), `rejouerCombat` (D3). Hook dev `__rapport.inject/purge` (DEV uniquement, miroir des hooks `__game`) pour les vérifications GUI.
- **Assets (L0b)** — `barbare_logo.svg` d'Erik : copie `assets-src/interface/logos-reserve/barbare.svg` + version web `apps/web/public/interface/logos/barbare.svg` (métadonnées C2PA retirées ; **1,8 Mo, bien plus lourd que les autres logos ~65 Ko — 🔶 à compresser si ça pèse le bundle**). Entrée `barbare` dans `nations.json` (logo seul, pas de banderole, jamais en réserve). Les 16 logos existants et leurs `logoEchelle` sont repris tels quels.

## 3. Cas couverts par les tests (L1 — `apps/web/tests/rapport.test.ts`, 11)

cas null · échange simple (PV avant depuis pré-état) · chaîne d'échanges · mêlée 3 participants (tri des rôles R-180) · destruction (owner repris de l'événement) · expulsion avec destination · capture `detained`/`destroyed` · plusieurs combats même case même tour · unité hors pré-état (pvAvant null, repli état après) · filtrage par case · `casesDeCombat`.

## 4. Captures (`dev-logs/captures-rapport-engagement/`)

- `popover-melee-3-nations.png` — mêlée R-180 : Guerrier Aztèques VAINQUEUR / Milice Barbare MILIEU (expulsé → (6,11)) / Guerrier Zoulous PERDANT, logos or, barres PV. **Erik : « le visuel est parfait ».**
- `popover-destruction-barbare.png` — Guerrier Jaguar vs Guerrier barbare détruit ☠ (3→0).
- `popover-pendant-relecture.png` — bandeau « Relecture du tour », popover ouvert pendant la relecture (le rapport prime sur l'accélération).

**Réserve honnête sur les captures** : la partie 2D réelle n'a pas pu être pilotée en local (voir §5) — les captures viennent de fixtures **injectées** via le hook dev `__rapport.inject` (événements + pré-état forgés, même schéma que les tests). Le pipeline est identique à un vrai `TurnResult` (même store `replayPair`, même agrégation) ; ce que ça ne prouve PAS : le rendu sur des combats réels (fog partiel, unités réellement visibles à l'écran). C'est exactement ce qu'Erik validera en jouant (§6).

## 5. 🔴 Découverte hors périmètre — hang local à la résolution du tour 6

En local (wrangler dev 8787, workerd), **toute partie solo pangee-40 bloque à la résolution du tour 5 → 6**, même SANS aucun ordre (EndTurn acquitté, `TurnResult` jamais émis, aucune erreur dans le log wrangler). Reproduit sur 5 parties fraîches dont 2 sans ordre du tout. Le banc et la CI (919 tests rules, dont barbares/engagement) sont verts, et la mission ne touche pas le serveur — mais ce hang rend le jeu local injouable au-delà du tour 5 et a forcé le recours aux fixtures pour les captures. **À cadrer dans une mission serveur dédiée.**

Au passage : deux vieux serveurs/processus résiduels tournaient (ports 5174/8787-8790) — nettoyés pendant la session ; le piège « port 5174 figé » de la mémoire est reconfirmé.

## 6. Ce qu'Erik valide en ligne (L4)

1. Combat réel en solo/multi : ouverture du popover au clic case, PV et sorts exacts, fog respecté.
2. Mêlée R-180 réelle (3+ participants) : rôles et tri.
3. « Rejouer ce combat » depuis une vraie résolution : recentre + rejoue ; bouton grisé après reconnexion.
4. Cohérence du look avec le lobby (déjà « parfait » sur fixture — à confirmer sur vraie partie).

## 7. 🔶 Ouverts (à l'œil, vetoables)

- **Priorité de clic après résolution** : le rapport s'ouvre EN PLUS de la sélection (le panneau unité reste accessible). Alternative : le rapport prime et la sélection ne bouge pas.
- **Flip bas du popover** : estimation de hauteur 320 px — si le popover déborde en bas dans un cas réel, affiner.
- **Pointeur** : centré en haut du popover ; pas de flip du pointeur quand le popover s'affiche au-dessus de la case.
- **Position figée à l'ouverture** : un pan/zoom caméra pendant que le popover est ouvert ne le suit pas (reclic pour le repositionner).
- **Ligne « ⚔ n combats ce tour » dans le journal** (D5 option) : non faite.
- **`barbare_logo.svg` à 1,8 Mo** : à optimiser si le poids pose problème.
- **libellé « Milice Barbare »** : le nom de type puis la faction — ordre/fusion à l'œil (« Milice barbare » ?).

## 8. Fichiers touchés

`apps/web/src/lib/rapport.ts` (nouveau), `apps/web/tests/rapport.test.ts` (nouveau), `apps/web/src/components/RapportCombat.svelte` (nouveau), `apps/web/src/lib/render/GameCanvas.svelte`, `apps/web/src/pages/Game.svelte`, `apps/web/src/lib/nations.json` (+barbare), `apps/web/public/interface/logos/barbare.svg` (nouveau), `assets-src/interface/logos-reserve/barbare.svg` (nouveau), captures. Zéro changement `packages/`, serveur, protocole, données.
