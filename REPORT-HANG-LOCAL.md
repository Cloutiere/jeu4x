# REPORT-HANG-LOCAL — Diagnostiquer le « hang » à la résolution du tour 6 en local

> Mission `HANDOFF-HANG-LOCAL.md` (demande d'Erik du 01/10). **Verdict : il n'y a AUCUN hang — ni moteur, ni serveur, ni wrangler.** Le jeu est arrêté au tour 6 par la règle FIN-DE-TOUR-PRODUCTION (18/09) : la capitale atteint 3 marteaux/tour à la fin du tour 5 et, sans production sélectionnée, le serveur refuse le fin de tour. Le client le signalait uniquement par le bouton désactivé « Fin de tour bloquée (1) » + info-bulle au survol — un clic sur un bouton désactivé n'affichait jamais le toast prévu, d'où l'impression d'un jeu figé. **Rien à corriger côté moteur/serveur/protocole ; la prod n'a jamais été concernée.** Livraison (feu vert Erik, §6) : UX des options 1+2 côté web uniquement.

## 1. Reproduction (L0)

- Sonde headless (WS, miroir du parcours d'Erik) : partie solo pangee-40, zéro ordre — tours 1→5 résolus en ~10 ms, la 6e demande de fin de tour **ne produit jamais de TurnResult** (timeout 60 s). Reproduit à chaque essai.
- État exporté au moment du blocage (`dev-logs/hang-local/dump-HYKHM4-HANG-tour6.json`) : `turn=5`, `phase="orders"`, `resolving=null`, `locked` tout false — **aucun motif de résolution persisté** : la résolution n'a jamais démarré. `cities.c1` : pop 3 (deux `PopulationGrew` dans la résolution du tour 5), production null, 3 marteaux/tour.
- CPU du processus workerd pendant l'attente : **idle** (pas de boucle) ; le DO répond instantanément (fetch admin 26-33 ms, OrderAck WS reçu).

## 2. Verdict de couche (L1, D1)

| Suspect | Test | Verdict |
|---|---|---|
| Moteur (`packages/rules`) | 200 parties Node pur × 30 tours (100 seeds bots des deux côtés + 100 seeds humain inactif+bot) **et** rejeu de la seed exacte du dump (330125638, pangee-40, 6 tours) | **Hors de cause** — 0 hang, 0 tour > 2 s, seed fautive résolue en 15 ms |
| Serveur (GameDO) | CPU idle + DO vivant + `resolving` jamais persisté | Pas d'attente bloquante : le serveur **refuse** le fin de tour (comportement voulu) |
| Wrangler/workerd 4.127.1 | Résolutions 1→5 instantanées ; blocage côté métier | Hors de cause |

Le message réel envoyé au client au 6e fin de tour : `OrderAck(accepted:false, reason="fin de tour bloquée — Ville1 : sélectionnez une production (3 marteaux/tour)")`.

## 3. Mécanisme précis (pourquoi « au-delà du tour 5 »)

- Tours 1→5 : la capitale est pop 1 → **0 marteau/tour** → la règle FIN-DE-TOUR-PRODUCTION ne bloque jamais → les fins de tour passent sans production (impression que « ça marche sans ordre »).
- Résolution du tour 5 : deux seuils de nourriture franchis d'un coup (`PopulationGrew` ×2) → pop 3 → **3 marteaux/tour**.
- 6e fin de tour : `blocagesFinDeTour` (rules/finDeTour.ts) retourne le blocage production → rejet serveur. C'est la règle R-« fin de tour production » du 18/09, conforme à la spécification.

## 4. Chaîne UX qui crée l'illusion de hang (seul vrai constat)

- `Game.svelte` désactive le bouton quand `myBlocages.length > 0` (libellé « Fin de tour bloquée (1) », motif en info-bulle au survol uniquement).
- `requestEndTurn()` — qui afficherait un **toast** explicite avec le même libellé — n'est jamais appelée : un clic sur un bouton `disabled` ne déclenche rien. Le chemin toast est donc **inaccessible par construction**.
- La vue ville affiche bien « ⚠ Fin de tour bloquée — sélectionnez une production » + le choix de production, mais rien n'invite à l'ouvrir (pas de toast, pas de clignotement, le HUD ne dit pas QUOI faire, seulement que c'est bloqué).

## 5. Vérification (L3)

- Même partie solo, production « Guerrier » sélectionnée en vue ville → enchaînement **tour 5 → 26** sans aucune anomalie (re-sélection de production à chaque achèvement, menu « unités sans ordre » normal). Captures : `dev-logs/hang-local/*.png`, preuves : `dev-logs/hang-local/preuves.md`.
- Suites : aucune ligne de code produit/modifiée — moteur, serveur, protocole, cartes : intouchés par construction (les harnais de diagnostic sont hors workspace ou dans `devtmp/`/`sableuse/src/hang-*.mjs`, non destinés au commit).

## 6. Livraison UX (feu vert Erik du 01/10 — options 1 ET 2, web seul)

Implémenté dans `apps/web` (zéro moteur/serveur/protocole) :

- **Option 1 — bouton cliquable** : `Game.svelte`, la clause `myBlocages.length > 0` sort de `disabled` (le bouton garde son style `.blocage`, son libellé « Fin de tour bloquée (N) » et son info-bulle). Le clic passe désormais dans `requestEndTurn()` qui affichait déjà le toast du motif — chemin rendu accessible. Un bouton désactivé n'expliquait rien : c'est toute la cause de l'illusion de hang.
- **Option 2 — orientation à l'apparition** : au `TurnResult` qui fait apparaître un blocage, orientation vers la ville fautive, miroir du menu « unités sans ordre » (REGLAGES-CALIBRAGE D3) : sélection de la ville (`ui.set`, miroir `voirUniteSansOrdre`) + `canvasApi.centerOnHex` (zoom préservé). Helper pur `villeDuPremierBlocageProduction` (`apps/web/src/lib/blocages.ts`, ordre déterministe du tableau `blocagesFinDeTour` — R-81). Pas d'orientation si la vue ville est ouverte (déjà sur place) ni à la reconnexion (Snapshot, pas d'apparition nouvelle).

Vérification : tests `apps/web/tests/fin-de-tour-blocage-ux.test.ts` (4 — partie pure + câblage, convention reglages-calibrage) ; suites web 420/420, svelte-check 0 erreur, typecheck monorepo 0. e2e GUI (partie solo locale PMWTBX, Vite 5174 + wrangler 8787) :
- blocage actif → bouton « Fin de tour bloquée (1) » **actif** (`disabled:false`), clic → toast « Ville1 : sélectionnez une production (3 marteaux/tour) » ;
- caméra décalée hors écran (`screenOf(-4,20)` = -1872 px) → complétion du Guerrier au tour 9 → le TurnResult qui fait apparaître le blocage recentre la ville (455 px, pose canonique) — capture `dev-logs/hang-local/ux-blocage-option1-2.png`.

## 6bis. Options non retenues / 🔶

- 🔶 L'orientation ne s'applique qu'à l'apparition (transition) : rouvrir une partie déjà bloquée montre le bouton cliquable + toast au clic, sans saut de caméra à l'ouverture.
- 🔶 Non traité (hors feu vert) : le lobby post-LOBBY-5 ne crée plus de parties `solo:true` pangee-40 ; l'affichage croisé entre parties au changement de route (store non réinitialisé).

## 7. Environnement

wrangler 4.127.1 (workspace), workerd local, Node 24, Vite 5174. Partie de preuve : HYKHM4 (local, tour 26). Serveurs laissés en marche pour ta session.
