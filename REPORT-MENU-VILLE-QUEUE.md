# REPORT-MENU-VILLE-QUEUE — File d'attente de production + panneau de ville à gauche, abandon de la vue ville zoomée

Mission exécutée le 01/10 d'après `HANDOFF-MENU-VILLE-QUEUE.md` (demande d'Erik du 02/10). **Arrêt pour approbation (L5) — rien de committé.** ⚠️ Le push emportera la **migration `schemaVersion` 26 → 27 en prod** (parties existantes reprises à l'identique — voir §3) : à valider en conscience.

## 1. Forme d'ordre retenue (D2)

Trois ordres ADDITIFS (pas de dédoublonnage par sujet — miroir `SetWorkedTile`), appliqués à la résolution **dans l'ordre de soumission**, chaque opération voyant le résultat de la précédente (sémantique de commandes, miroir exact de l'aperçu du panneau) :

| Ordre | Forme | Effet moteur |
|---|---|---|
| `QueueProduction` | `{ cityId, item }` | Ajoute en queue (profondeur `FILE_PRODUCTION_PROFONDEUR = 4`, **tête comprise**, data-driven — au-delà ignoré) ; ville sans production → devient la tête (progression 0). Éligibilité re-vérifiée (R-87/R-117/R-116 — même porte que `SetProduction`, factorisée `itemProductionRefuse`). |
| `RemoveFromQueue` | `{ cityId, index }` | Indice sur la file **affichée** (0 = tête). Retirer la tête entamée rend ses marteaux à la réserve permanente **R-130** (`pendingSalvage`) et fait remonter l'item suivant. |
| `ReorderQueue` | `{ cityId, from, to }` | Indices dans la file d'**attente uniquement** (0 = premier item d'attente) : la tête, entamée, ne se réordonne pas (la progression appartient au projet en cours — décision documentée). Hors bornes/identiques : ignoré. |

- **Compat bot** : `SetProduction {cityId, item}` (forme historique) reste accepté — remplace la tête (progression conservée R-62) **et vide la file**. Le bot (`botPolicy.ts`) est inchangé ; vérifié en jeu réel (le bot de l'e2e continue de produire).
- `orderShapeError` a été étendu et **testé AVANT le câblage des handlers** (leçon 7f respectée) — `apps/server/tests/orderShape.test.ts` : formes valides/invalides des 3 ordres + non-dédoublonnage `upsertOrderPreservingPriority` + `SetProduction` toujours unique par ville.
- `orderOwnerErreur` : les 3 ordres exigent la possession de la ville (comme `SetProduction`).
- Miroir client : `sameSubject`/`removeCancelledOrders` (`gameClient.ts`) traitent les opérations de file comme non-dédoublonnées et annulables par ville.
- Journal : aucun événement moteur nouveau — les complétions restent tracées par les événements existants (`UnitProduced`, `BuildingCompleted`, `HammerSalvage`, `RushBuy`). 🔶 si Erik veut des entrées nominatives « file programmée » au journal, c'est une extension d'événements à part.

## 2. File dans le moteur (L1 — test-first)

- `City.queue?: ProductionItem[]` (`packages/rules/src/state.ts`) — les items APRÈS la tête ; optionnel (états anciens tolérés). Constante `FILE_PRODUCTION_PROFONDEUR = 4`.
- `applyQueueOps` + `promoteQueueSuivante` (`turn.ts`, exportés pour tests) ; appelés dans `resolveTurn` APRÈS `applySetProduction`.
- **Complétion en chaîne** : à chaque complétion (Phase C unité/bâtiment, réserve C7 non répétable, rush R-135, GP Bâtisseur), l'item suivant remonte à progression 0. Garde-fou : après une complétion par la réserve, l'accumulation périmée du tour est sautée (le `cost` local appartient au projet complété).
- Une ville sans tête mais avec une file (ex. tête tombée en réserve R-130 — merveille devancée) fait remonter son item suivant **au début de l'économie** : la file programmée EST le projet choisi.
- Capture de ville : `queue = []` (comme les bâtiments). Espion `sabotageProduction` : ne touche que la tête. Item inconnu : tête ET file purgées.
- **R-184** : le prédicat `blocagesFinDeTour` compte désormais `city.queue` non vide et les brouillons `QueueProduction` comme production sélectionnée — blocage si et seulement si la file est VIDE (marteaux/tour > 0 ou réserve C7). Tests dédiés.

Tests : `packages/rules/tests/file-production.test.ts` (17) — migration, empilement/profondeur, éligibilité, chaîne, rush tête, salvage R-130 au retrait de tête, réordonnancement, compat bot, R-184. Suites : **rules 936/936, server 120/120, web 460/460, typecheck monorepo 4/4, svelte-check 0 erreur.**

## 3. Migration `schemaVersion` 26 → 27

- `MIGRATIONS[27]` : champ ADDITIF `queue: []` sur chaque ville — la production courante devient la tête d'une file à 1 élément. Pure, idempotente (double application = inchangé, testé).
- Parties pré-migration reprises en test : le test GameDO existant (`barbares.test.ts`, état v7 → version courante) passe à 27 ; l'e2e GUI a tourné sur une vraie partie DO locale (`schemaVersion: 27` vérifié à l'écran dans l'état brut).
- **RNG intact** : aucune consultation du RNG ajoutée (aucune invariance 200-seed nécessaire — le flux Phase B est intouché ; le corpus fixe `progen-carte-50` passe inchangé).
- `PROTO_VERSION` inchangé (1) : les ordres nouveaux sont additifs, les vieux clients ne les émettent pas.

## 4. Serveur (L2)

`orderShapeError`/`orderOwnerErreur`/`sameSubject` étendus (§1). Le handler `handleOrder` n'a pas changé (validation générique) ; `EndTurn` consomme toujours `blocagesFinDeTour` (source unique) — le rejet serveur du blocage file-vide fonctionne en jeu réel (toast « Ville1 : sélectionnez une production (1 marteaux/tour) », capture 06).

## 5. UI (L3) — panneau de ville à gauche (D3) + D4/D5/D6

- **`PanneauVille.svelte`** (nouveau) : ancré À GAUCHE (~350 px, miroir de la colonne T2), tokens AAA LOBBY-PREMIUM (or-sur-sombre, serif, chips pill, séparateur border-image). Contenu = celui de l'ancien CityView (nom, capitale/civ/pop/rayon, nourriture + ETA croissance + jauge, frontière culturelle, sciences/or + conversion R-90 interactive, trésorerie, bâtiments/merveilles/GP chips, réserve C7, onglets constructible filtrés) **+ FILE D'ATTENTE** :
  - rangs numérotés (tête cerclée d'or), jauge de marteaux engagés sur la tête, **ETA par rang** (production séquentielle cumulée — vérifié e2e : 9 / 39 / 59 tours) ;
  - **croix** = `RemoveFromQueue` (tête → salvage R-130) ; **flèches ↑↓** = `ReorderQueue` ; clic d'un item des onglets = **ajout EN QUEUE** (plus de remplacement — le libellé du bloc est « Programmer la production ») ;
  - compteur « n / 4 » + « File pleine » ; options désactivées file pleine ;
  - rush-buy sur la TÊTE (R-135 inchangé, coût recalculé avec la progression — 20 → 18 or observé).
- **File effective** (`lib/fileProduction.ts`, pur, testé) : état + brouillons de CE joueur, mêmes règles que `applyQueueOps` — le panneau montre la file telle que la résolution la constituera (miroir d'`effectiveWorkedTiles`).
- **D3 ouvertures/fermetures** : s'ouvre au clic simple sur une ville (`ui.selectedCityId`, colonne de droite T2 intacte) ; fermeture par ×, Échap, clic ailleurs (deselect). L'orientation blocage production (HANG-LOCAL option 2) ouvre désormais ce panneau naturellement.
- **D4 — vue ville zoomée abandonnée** : les props canvas `onEnterVueVille`/`onExitVueVille`/`vueVilleId`/`onVueVillePret` sont DÉBRANCHÉS (commentés dans Game.svelte) ; le double-clic ne fait plus rien de spécial (= alternance de sélection). **Aucun code supprimé** : CityView.svelte, le store `vueVille`, `entrerVueVille/sortirVueVille`, la pose inclinée du canvas et la puce « Vue ville » restent dans le dépôt, dormants et documentés (réactivables). Vérifié e2e : double-clic sur la ville → aucun changement de pose (capture 03).
- **D5 — zone cultivable + rendements à l'ouverture** : nouvelle prop canvas `villeRendementsId` (= ville du panneau) — le contour ACCENT du rayon cultivable (style ZONE-CULTIVEE, liseré + pointillés sombres), les hexagones des tuiles travaillées et les glyphes de rendement du rayon (conversion R-90 reflétée) s'affichent à l'ouverture, sans doublon si le filtre Rendements est déjà actif (`showYields` prioritaire, affichage global) ; retour à l'état précédent à la fermeture (dérivé). Invalidation overlay dédiée (un rebuild, pas par frame).
- **D6 — worked tiles** : le chemin de clic `SetWorkedTile` (ville sélectionnée) est inchangé et le panneau ne le gêne pas (le panneau ne couvre que la gauche). Note e2e : la ville de test avait ses 2 citoyens déjà assignés (pop 2) — le moteur refuse un 3e assignement (R-60, préexistant) ; interaction couverte par les tests `interaction.test.ts` existants.

Tests web : `tests/menu-ville-queue.test.ts` (13) — `fileEffective` (miroir du moteur : empilement, profondeur, tête-qui-promeut, retraits, réordonnancement, ville ennemie), miroir `sameSubject`, câblage Game.svelte/GameCanvas/PanneauVille (D3/D4/D5, CityView non monté mais présent).

## 6. e2e GUI réel (L4) — partie solo `5T2B6W` (Vite 5174 + wrangler 8787, pangée, 4 bots)

Captures dans **`dev-logs/captures-menu-ville-queue/`** :
1. `01-panneau-ouvert-rendements.png` — panneau gauche ouvert au clic, glyphes de rendement + contour sur la carte ;
2. `02-file-4-items.png` — file 4/4 (Guerrier, Guerrier, Colon, Galère) avec croix/flèches, « File pleine », rush grisé (trésorerie 0) ;
3. `03-double-clic-sans-zoom.png` — après double-clic : **pose inchangée**, plus aucune vue ville ;
4. `04-retrait-reordre-file.png` — après croix (retrait du rang 2, la file se tasse) et flèche ↑ (Galère remontée) ;
5. `05-tete-entamee-eta.png` — tour 2 : tête Guerrier 1/10 marteaux (jauge), ETA cumulés 9/39/59 ;
6. `06-blocage-r184-file-vide.png` — file vidée : avertissement dans le panneau + badge « Fin de tour bloquée (1) » + **toast** « Ville1 : sélectionnez une production (1 marteaux/tour) » ;
7. `07-avant-abandon-vue-zoomee.png` — l'ancienne vue ville zoomée (avant, pour comparaison) ;
8. `08-panneau-ouvert-minimap-masquee.png` — retour d'Erik en validation : la minimap s'efface quand le panneau est ouvert (l'un OU l'autre — même position bas-gauche).

Parcours vérifié : fondation → clic ville → panneau → 4 ajouts → 1 retrait (file tassée) → 1 réordonnancement → fin de tour → **la résolution applique exactement la file affichée** (état : tête guerrier progress 1, queue `[galère, colon]`) → réouverture : jauge de tête + ETA cumulés → retrait des 3 items (dont la tête entamée) → réserve C7 = 1 marteau après résolution + blocage R-184 (toast) → reprogrammation (partie débloquée). Bot intact (forme `SetProduction`).

## 7. Écarts et 🔶 à l'œil d'Erik

1. **Minimap OU panneau (retour d'Erik en validation)** : les deux occupent la même position bas-gauche — la minimap s'EFFACE quand le panneau de ville est ouvert (miroir de la vue ville), et revient à la fermeture ; le panneau reprend toute la hauteur (le rembourrage anti-chevauchement provisoire a été retiré). Vérifié de bout en bout dans le navigateur (capture `08-panneau-ouvert-minimap-masquee.png`), test de câblage ajouté (web 461/461, svelte-check 0 erreur).
2. **Réserve « à venir » non anticipée** : retirer la tête entamée n'affiche pas optimistiquement les marteaux en réserve (ils apparaissent à la résolution suivante, section Bâtiments). 🔶 si Erik les veut immédiats.
3. **Rush-buy non cliquable à l'e2e** (trésorerie 0 de la partie de test) : bouton grisé avec motif capturé ; le flux moteur est couvert par les tests (rush tête + promotion du suivant).
4. **Consommation en chaîne GUI longue** (10 tours à 1 marteau/tour) non jouée à la main — couverte par les tests moteur (chaîne + rush + réserve). En jeu réel, la file a été consommée une fois (tête appliquée).
5. **Rendements à l'ouverture** : limités au rayon de la ville (`limiteRendements`), conversion R-90 reflétée — à l'œil (densité des glyphes).
6. **Wording** : « File de production », « Programmer la production », « File pleine (4 — profondeur data-driven) », « Fin de tour bloquée — sélectionnez une production » — à l'œil.
7. **Réordonnancement** : la tête (entamée) n'a pas de flèches — choix documenté (la progression appartient au projet en cours). Erik peut le vetoer.
8. **Double-clic** = 2 alternances de sélection (panneau ouvert puis fermé) — aucun traitement spécial, conformément au périmètre interdit (« aucune fonction de remplacement au double-clic »).
9. **RULES.md à réaligner** (le pilot s'en charge après acceptation) : nouvelle règle FILE-DE-PRODUCTION (profondeur 4, tête comprise ; retrait = salvage R-130 ; réordonnancement attente seule ; R-184 = file vide) + R-62/R-135 (rush = tête) + mention des 3 ordres.
10. **Déploiement** : le push déclenchera CI + Deploy → **migration 27 en prod** (idempotente, parties existantes reprises — testées). Zéro changement 3D, sableuse, coquille.

## 8. Périmètre respecté

Aucune retouche de règles existantes (rendements, croissance, salvage R-130 réutilisés tels quels), pas de 3D, pas de coquille, CityView non supprimé (dormant), aucune autre fonction au double-clic.
