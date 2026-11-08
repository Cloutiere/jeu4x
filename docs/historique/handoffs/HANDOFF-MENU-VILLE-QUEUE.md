# HANDOFF-MENU-VILLE-QUEUE — File d'attente de production (moteur+serveur) + panneau de ville à gauche, abandon de la vue ville zoomée

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-88..R-90 menu de ville, R-130 récupération de marteaux, R-135 rush-buy, FIN-DE-TOUR-PRODUCTION R-184), `HANDOFF.md` §4, `PROJET.md`, `REPORT-MENU-VILLE.md` (la vue ville zoomée à abandonner — le menu CityView y est décrit), `REPORT-UI-JEU-T2.md` (standards visuels AAA). Baseline : suites vertes (rules ~919, web ~447, server 116), typecheck, prod 200. **2D uniquement.** **Cette mission touche le moteur et le protocole** (la file d'attente est un changement de forme d'ordre) — test-first, **valider `orderShapeError` AVANT tout handler** (piège qui a coûté une phase), migration `schemaVersion` idempotente, déterminisme, parties existantes reprises en test.

## 1. Objectif (demande d'Erik du 02/10)

1. **File d'attente de production** par ville : programmer jusqu'à 4 items, gérer et réordonner ;
2. **Panneau de ville à GAUCHE** au clic sur une ville : visuel AAA, avec toutes les infos du menu actuel (nourriture/croissance, production + file, sciences/or, bâtiments, nom) ;
3. **Abandon de la vue ville zoomée** (double-clic MENU-VILLE) : plus de changement de vue ; à la place, à l'ouverture du panneau : **délimitations de la zone cultivable** et **rendements des tuiles travaillées** affichés sur la carte (si pas déjà affichés) ;
4. Le panneau de droite reste inchangé (T2).

## 2. Décisions tranchées (réponses Erik 02/09 + défauts pilot — vetoables)

- **D1 — File : profondeur 4 data-driven.** Cliquer un item de production l'ajoute EN QUEUE ; **croix = retirer n'importe quel item** (un item entamé rend ses marteaux à la réserve — règle R-130 existante, réutilisée telle quelle) ; **flèches ↑↓ = réordonner**. Le rush-buy s'applique à l'item EN TÊTE (comportement actuel inchangé). La production consomme la tête de file ; à complétion, l'item suivant remonte (événement/ordre existants).
- **D2 — Protocole : évolution de `SetProduction` en opération de file.** Forme à trancher par l'agent (ex. `SetProduction {cityId, items[]}` ou ordres additifs `QueueProduction/RemoveProduction/ReorderProduction`) — **contraintes** : `orderShapeError` validé AVANT les handlers ; le **bot existant** (qui émet `SetProduction` simple) continue de fonctionner sans modification de son comportement (compat assurée — soit l'ancienne forme reste acceptée, soit le bot est mis à jour mécaniquement) ; journal/trace nominatifs ; migration `schemaVersion` idempotente (les villes existantes : leur production courante devient une file à 1 élément, parties pré-migration reprises en test). Relance/OR-RUSHBUY : `rushBuyCostOf` s'applique à la tête (inchangé) ; FIN-DE-TOUR-PRODUCTION (R-184) bloque s'il n'y a AUCUN item dans la file (et non plus aucune production courante — même sémantique, à réexiger par test).
- **D3 — Panneau de ville à gauche** : apparaît au **clic simple sur une ville** (sélection inchangée côté droit — le panneau de droite reste T2 tel quel) ; se ferme par clic ailleurs / Échap / ×. Contenu = celui de l'ancien CityView (nom, nourriture + tours avant croissance, production + **file avec ETA par item**, sciences/or de la ville, bâtiments, onglets de production filtrés au constructible) restylé AAA (tokens T1/T2/rapport de combat). Largeur ~350 px miroir de la droite.
- **D4 — Vue ville zoomée : retirée de l'UI, code dormant.** Le double-clic n'ouvre plus la vue zoomée (le double-clic sur une ville = même chose qu'un clic simple, ou sélection uniquement). Le code MENU-VILLE/CityView reste dans le dépôt, débranché, documenté dormant (réactivable). Les comportements qui en dépendaient (masquage de colonne, pose recalculée) sont retirés du flux actif.
- **D5 — Délimitations + rendements à l'ouverture** : quand le panneau de ville est ouvert, la carte affiche **le contour de la zone cultivable** (zone ZONE-CULTIVEE existante : liseré accent + dégradé des worked tiles effectifs, rayon cultivable en pointillé) et **les rendements des tuiles travaillées** (glyphes) — réutilisant les composants ZONE-CULTIVEE/MENU-VILLE existants ; si déjà affichés (bouton Rendements), pas de doublon. À la fermeture du panneau : retour à l'état d'affichage précédent.
- **D6 — Clics de worked tiles** : la sélection de tuiles travaillées (file SetWorkedTile) reste possible **avec le panneau ouvert** (clic sur tuile cultivable — comme l'ancienne vue ville) ; c'est le seul héritage d'interaction conservé.
- **D7 — Zéro régression** : journaux, relecture REPLAY-RESOLUTION (villes « minimales » : leur file ne perturbe pas le rendu), mêlée, RAPPORT-ENGAGEMENT, minimap T3, calque dev T1. Le badge/blocage FIN-DE-TOUR (ad7afda) fonctionne avec la file (blocage si file vide).

## 3. Mission

### L0 — Préalables
- Baseline : suites + typecheck verts, `schemaVersion` courant noté. Lis `RULES.md` menu de ville, `turn.ts` (production, salvage, rush-buy), `orderShape`/validateur, GameDO handlers, CityView.svelte, UnitPanel.

### L1 — Moteur (test-first)
- File de production dans `City` (items[] avec marteaux engagés sur la tête), consommation en tête à la résolution, retraits avec salvage R-130, réordonnancement déterministe. `orderShapeError` d'abord. Migration (file à 1 élément). Tests : complétion en chaîne, retrait/reordre, salvage, rush tête, R-184 file vide, bot inchangé (compat formes), 200-seed invariance si le flux RNG est touché.

### L2 — Serveur
- Handlers (formes validées L1), diffusion temps réel (action immédiate ? la file se programme comme production actuelle — même contrat), parties reprises, journal.

### L3 — UI : panneau gauche + abandon vue zoomée
- Composant `PanneauVille` (D3) avec file (D1 : ajouter/croix/flèches/ETA), onglets constructible, AAA. Clic ville → panneau + D5 ; fermetures ; worked tiles (D6) ; retrait du double-clic zoom (D4, code dormant documenté).
- Tests : file (ajout/retrait/reordre/ETA), ouvertures/fermetures, D5 affichage, pas de régression T1/T2/rapport.

### L4 — Vérification
- Suites complètes + typecheck verts ; migration testée (partie pré-migration rejouée) ; e2e solo : queue de 4 items qui se consument sur plusieurs tours, retrait d'un item entamé (marteaux rendus), rush-buy tête, blocage file vide (toast/orientation), panneau gauche complet, worked tiles, double-clic sans zoom.
- **Captures `dev-logs/captures-menu-ville-queue/`** AVANT tout commit : panneau ouvert + zone cultivée, file avec 4 items + ETA, retrait/flèches, rush tête, blocage R-184, avant/après abandon vue zoomée.

### L5 — ARRÊT POUR APPROBATION D'ERIK
Captures + le parcours complet. 🔶 à l'œil (largeur du panneau, styles de la file, wording). NE COMMITTER QU'APRÈS FEU VERT (la migration partira en prod avec le push — le dire explicitement).

### L6 — Rapport
- `REPORT-MENU-VILLE-QUEUE.md` : forme d'ordre retenue, migration, file (règles), panneau, écarts, RULES.md à réaligner (le pilot s'en charge après acceptation), ce qu'Erik valide en ligne, 🔶, code dormant documenté.

## 4. Critères d'acceptation
1. File de 4 items fonctionnelle de bout en bout (consommation en chaîne, retrait+salvage, réordre, rush tête), data-driven, bot et parties existantes intacts.
2. Panneau de ville à gauche AAA au clic, zone cultivable + rendements affichés, fermeture propre ; plus aucun changement de vue.
3. Migration idempotente testée ; `orderShapeError` validé avant handlers ; R-184 = file vide.
4. Suites vertes ; zéro régression T1/T2/relecture/rapport/minimap ; captures fournies.

## 5. Périmètre interdit
- Toute autre retouche de règles (rendements, croissance, salvage) ; la question `convertir`/conversion ; 3D ; la sableuse ; la coquille ; le double-clic-qui-fait-autre-chose (aucune fonction de remplacement au double-clic) ; supprimer le code MENU-VILLE (dormant, pas supprimé).
