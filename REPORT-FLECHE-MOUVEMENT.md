# REPORT-FLECHE-MOUVEMENT — La flèche de déplacement vivante (survol → clic → persistance)

**Chantier HANDOFF-FLECHE-MOUVEMENT.md · livré le 12/09/2026 · NON COMMITÉ (règle : validation locale par Erik avant tout commit — commit/push sur sa demande explicite).**

Démo en direct (partie solo neuve **9HKRXF** sur le dev local, captures dans `dev-logs/captures-fleche-mouvement/`) : sélection → flèche de survol pointillée suivant le curseur → clic = tuile d'arrivée → re-clic ailleurs = re-ciblage immédiat → fin de tour = flèche persistante (chemin gelé) → tour suivant = disparition une fois le mouvement achevé → survol du fog tronqué à 1 pas.

## 1. Corrections au handoff (à lire)

- Le handoff décrivait le schéma de clics actuel comme « clic gauche = programmation, clic droit = sélection » — **inversé**. Le schéma réel (tranché par Erik le 08/09, cf. `docs/historique/rapports/REPORT-CORRECTIFS-SELECTION.md` §tranchage final et le code) est : **clic gauche = sélection uniquement, clic droit = destination/annulation**. La mission a été exécutée sur la base du schéma réel.
- Conséquence assumée pour M2 : « clic sur une case = tuile d'arrivée » est implémenté **au clic gauche quand il n'entre pas en conflit avec la sélection** (voir §3) ; le clic droit garde exactement sa sémantique existante (destination/annulation). Les deux boutons programment désormais, la sélection reste prioritaire.

## 2. M1 — La flèche de survol (livré)

`apps/web/src/lib/render/GameCanvas.svelte` (bloc FLECHE-MOUVEMENT) :

- Unité **amie sélectionnée** + ordres modifiables + hors playback : le curseur montre en permanence le chemin que produirait un clic sur la case visée — **même `pathTo` que le clic** (BFS connu, R-161 : la flèche s'arrête à la première case inconnue, jamais traversée). Apparaît dès le premier `pointermove` (bouton levé — la logique court avant le retour anticipé du pan), disparaît si le curseur quitte la carte, pendant un pan de caméra, pendant la relecture, ou si la sélection change/ne peut plus agir.
- **Style distinct** de la flèche d'ordre : pointillée, plus fine (4 px), ambre clair `0xffe082` à alpha 0.55 (l'ordre posé = trait plein 6 px `0xf0c419` alpha 0.9). 🔶 à calibrer à l'œil par Erik : constantes `COULEUR_SURVOL` / `ALPHA_SURVOL` en tête du bloc.
- **Pas de doublon** : si la case survolée est déjà la destination programmée de l'unité (flèche solide affichée), la flèche de survol se silence.
- **Performance (M1.3)** : cache pur `creeCacheChemins()` (`interaction.ts`) — une entrée BFS par (position, case cible), purgé à chaque nouvelle vue serveur ; le redraw ne se fait que quand la case sous le curseur change. Bench M4 : `apps/web/tests/fleche-survol-bench.test.ts` (BFS à froid 120 cibles négligeable ; réutilisation prouvée par identité du résultat ; purge correcte au fog évoluté).
- 3D : le code reste correct (exigence M4.1) — en mode 3D la flèche de survol passe par `chemin3dDe` → calque Three (`chemins3dHover` dans `mettreAJourMarqueurs3d`), même pipeline que les autres flèches. Non revu en GUI (mode coupé en prod, drapeau `rendu3d: false` intact).

## 3. M2 — Le clic d'arrivée / re-ciblage (livré)

`apps/web/src/lib/render/interaction.ts` — nouvelle règle 3 de `clickAction` (pure, testée) :

- Avec une **unité amie sélectionnée**, ordres modifiables, pas de brouillon : un clic sur une **case vide** (ni unité, ni ville) atteignable retourne `moveDraft` — le chemin complet est soumis, exactement comme le clic droit. **Re-cliquer une autre case re-cible sans étape intermédiaire** (la flèche de survol saute au nouveau chemin dès le survol) ; côté serveur, l'ordre remplace l'ancien **en place, priorité conservée** (R-159/D3, `upsertOrderPreservingPriority` — inchangé, déjà testé).
- **Priorités préservées** (testées) : clic sur une unité (amie/ennemie) = sélection ; clic sur une ville = sélection de ville ; re-clic sur l'unité sélectionnée = désélection ; capitale défendue = alternance ; worked tiles d'une ville sélectionnée (R-60) = inchangés ; case vide inatteignable = désélection (comportement historique) ; verrouillé/hors phase d'ordres = jamais de programmation. Ciblage ICBM armé : inchangé (règle 0, court avant tout).
- Textes d'aide du panneau unité mis à jour (`UnitPanel.svelte`).
- La flèche d'ordre posé (solide) remplace bien la flèche de survol au clic (silencing §2) et demeure ; action finale MultiStep (bouton Colon), annulation unifiée, priorité : intouchés.

## 4. M3 — Persistance entre les tours (déjà en place, confirmé et verrouillé par tests)

Investigation : **le moteur et l'UI couvrent déjà le contrat** — aucun état UI inventé n'a été ajouté :

- À la résolution, le moteur fige sur l'unité le **chemin restant** (`unit.order`, forme de l'ordre source), le **consomme** quand le mouvement est achevé (`order = null`), et **tronque les perdantes** R-159 (repli, jamais de fantôme). L'UI dessine chaque frame les chemins gelés en pointillés atténués, tronqués fog (`fogTruncate`), et l'aperçu optimiste (`previewPrograms`) reste la source de vérité des positions affichées.
- Nouveaux tests (`packages/rules/tests/deplacement-planifie.test.ts`, describe FLECHE-MOUVEMENT) : inachevé → chemin gelé = reste + aperçu du tour suivant le montre ; achevé → ordre consommé, aperçu vide ; conflit R-159 repli à 0 → `order` null, aucune flèche résiduelle.
- **Vérifié en jeu** (captures 05→07) : ordre 2 cases pour un guerrier 1 PM → tour 1 : flèche pointillée sur le reste (« Chemin gelé : Move » au panneau) → tour 2 : arrivée à terme, flèche disparue.

## 5. Vérifications

- **Tests** : suite complète forcée (sans cache turbo) **verte — 1034 tests** (web 209, rules 753, server 72), +12 par rapport au handoff (nouveau : 5 clics interaction, 3 persistance M3, 3 bench, 1 fog réécrit). Un échec transitoire de `@game/rules` a été observé une fois sur un run turbo parallèle ; deux runs complets forcés successifs sont 100 % verts.
- **Typecheck 4/4** (svelte-check 0 erreur). **schemaVersion 19 inchangée**, zéro gameplay : `packages/rules/src`, serveur, `orderShapeError`, R-158..161 intouchés (seuls des **tests** rules ont été ajoutés).
- **e2e GUI** (partie solo 9HKRXF, souris réelle via navigateur) : séquence complète §en-tête validée, 8 captures dans `dev-logs/captures-fleche-mouvement/` : `01-survol-fleche-pointillee`, `02-clic-ordre-pose`, `03-reciblage-survol`, `04-reciblage-clic`, `05-ordre-long-avant-resolution`, `06-apres-resolution-fleche-persistante`, `07-mouvement-acheve-fleche-disparue`, `08-survol-fog-tronque`.
- **Bench** : aucun bench pathfinding n'existait avant (le handoff le demandait) — `fleche-survol-bench.test.ts` pose la baseline (à froid < 500 ms pour 120 BFS sur carte 24×24 ; hits de cache quasi gratuits).

## 6. Reste à vérifier par Erik (en ligne, à l'œil)

1. **Style de la flèche de survol** 🔶 (couleur/épaisseur/alpha — 2 constantes dans `GameCanvas.svelte`, bloc FLECHE-MOUVEMENT) ;
2. Le clic gauche = arrivée sur case vide lui convient-il (alternative possible : réserver la programmation au clic droit, le survol seul étant conservé) ;
3. La flèche de survol part de la case MOTEUR de l'unité (pas de sa position optimiste) quand un ordre existe déjà — cohérent avec ce que le clic produira, à valider visuellement ;
4. En partie : survol au bord du fog, unité avec chemin gelé, dispute de destination (la survol-flèche ne tient pas compte des disputes — seul l'aperçu posé les marque).

## 7. Fichiers touchés

- `apps/web/src/lib/render/GameCanvas.svelte` (flèche de survol 2D+3D, câblage pointermove/leave, invalidations) ;
- `apps/web/src/lib/render/interaction.ts` (règle de clic M2, `creeCacheChemins`) ;
- `apps/web/src/components/UnitPanel.svelte` (textes d'aide) ;
- `apps/web/tests/interaction.test.ts` (nouveaux + 1 réécrit), `apps/web/tests/fleche-survol-bench.test.ts` (nouveau), `packages/rules/tests/deplacement-planifie.test.ts` (3 tests M3).

---

# RAFFINEMENT-MOUVEMENT — affiné avec Erik le 12/09 (décisions tranchées, livré)

Retour d'Erik sur la version du matin + capture Civ 7 d'appui. Décisions posées via clarifications : **retour au clic droit seul** pour programmer (l'essai « clic gauche = tuile d'arrivée » du matin est RETIRÉ) ; **relâcher le clic droit maintenu = confirmer** ; badges **aussi sur la flèche posée** ; calcul des tours par **PM (1 case = 1 PM)** — pas de coût par terrain (hors périmètre, zéro gameplay).

## Livré

1. **Encadré de la tuile cible au survol** : la case visée par la flèche de survol s'entoure (double liseré ambre) — « un clic droit ici = destination ». Capture `09-raffinement-survol-encadre.png`.
2. **Pointes de flèches sur CHAQUE case traversée** : petites pointes intermédiaires sur la flèche de survol, la flèche d'ordre posée et le chemin gelé (sens de lecture tuile par tuile), + la grande pointe d'arrivée.
3. **Clic droit MAINTENU = préview multi-tours (style Civ 7)** : le chemin se dessine en direct sous le curseur, badges ronds numérotés (1), (2)… sur les cases étapes — un badge par groupe de `movement` PM de l'unité, la case d'ARRIVÉE multi-tours porte aussi son badge, un chemin plus court qu'un tour n'en porte pas. Relâchement SUR une case = ordre confirmé (`moveDraft`) ; ailleurs = sémantique `rightClickAction` (annulation de l'ordre courant). Échap coupe la préview ; relâcher hors carte annule sans confirmer ; le `contextmenu` qui suit un vrai clic droit maintenu est neutralisé (les clics synthétiques des tests/hooks `rightClickHex` gardent le chemin historique). Captures `10-clic-droit-maintenu-preview-tours.png` (badges 1→4, cible « Inexploré » = 1 pas dans le fog), `11-ordre-confirme-relachement.png`.
4. **Badges sur la flèche posée et le chemin gelé** : après confirmation et tour après tour tant que le mouvement vit (`jalonsDeTours` pur + `badgeTour` dessin, estampillés `poser3d` pour la reprojection 3D). Capture `12-chemin-gele-badges.png` (tour 3 : reste 3 cases, badges (1)(2)(3), « Chemin gelé : Move »).

## Code

- `interaction.ts` : `jalonsDeTours(path, mpParTour)` (pur, testé) ; règle « clic gauche = tuile d'arrivée » retirée (`clickAction` retrouver son comportement sélection-du-08/09, test réécrit).
- `GameCanvas.svelte` : `drawArrow(..., pointesIntermediaires)` ; `badgeTour` (cercle + numéro) ; bloc survol réécrit (anneau cible, pointes, état `droitMaintenu`/`droitTraite`, `survolALa`) ; `onPointerDown/Up` bouton droit, `onContextMenu` neutralisé après maintien, badges posés/gelés dans `rebuildOverlay`.
- `UnitPanel.svelte` : textes d'aide mis à jour (clic droit seul + préview maintenue).

## Vérifications

- Suite complète forcée verte : **1033 tests** (web 208, rules 753, server 72 — ±1 vs matin : tests clic gauche remplacés par clic droit/jalons), typecheck 4/4, zéro gameplay, schemaVersion 19.
- GUI en partie solo 9HKRXF (souris réelle + événements pointeur pour le maintien) : survol+encadré ✓, préview maintenue avec badges ✓, relâcher=confirmer ✓, clic gauche=désélection sans toucher l'ordre ✓, fin de tour=chemin gelé avec badges et pointes ✓.
- 🔶 à calibrer à l'œil par Erik : taille/couleur des badges (`badgeTour`), taille des pointes intermédiaires (16 px), l'anneau de cible.
- Note : en 3D (coupé en prod), les badges suivent la reprojection via `poser3d` — non revu à l'écran.

---

# RAFFINEMENT-MOUVEMENT v2 — retour d'Erik du 12/09 (après prise en main de la v1)

Trois changements demandés (« plus aucune flèche tant que je n'ai pas cliqué la case de destination ; l'unité ne doit pas se déplacer jusqu'au chemin final quand je confirme ; l'aperçu = la prochaine résolution seulement »), clarifiés avec Erik : bouton = **clic droit** (sa phrase « clic gauche » était une erreur), et l'**encadré de la tuile visée reste** au simple survol.

## Livré

1. **Plus aucune flèche au simple survol** — la flèche de survol qui suivait le curseur est supprimée ; seule la **tuile visée reste entourée** (indicateur « un clic droit ici = destination »). La flèche pointillée + pointes par case + badges de tours n'apparaissent plus que pendant le **CLIC DROIT MAINTENU** ; le relâchement confirme (inchangé). Capture `13-survol-anneau-seul.png`.
2. **L'unité ne « saute » plus à l'arrivée finale** — à la confirmation de l'ordre, l'unité reste affichée sur sa **case d'arrêt de la prochaine résolution** (case 1, selon ses PM le long du chemin), anneau de sélection compris. La flèche demeure dessinée **jusqu'à la destination finale** avec ses badges (2)(3)(4)… Capture `15-confirme-unite-case-1.png` (guerrier affiché à mi-chemin, flèche et badges jusqu'au bout).
3. **Aperçu = prochaine résolution seulement** — `positionAfficheeDe` (UI) affiche désormais `arretProchaineResolution(path, mp)` (nouveau helper pur, testé) au lieu de la destination finale de `previewPrograms` : le fantôme montre ce qui se passera au **prochain tour**, pas les tours subséquents. `previewPrograms` (moteur pur, R-160) est **intact** — c'est un choix d'affichage UI, documenté ici.

## Vérifications

- Suite complète forcée verte : **1036 tests** (web 211, rules 753, server 72), typecheck 4/4, zéro gameplay, schemaVersion 19.
- GUI en partie solo 9HKRXF : survol = anneau seul ✓ ; maintien = flèche + badges ✓ ; relâcher = ordre confirmé, unité à la case 1, flèche complète avec badges ✓ (captures 13-15).
