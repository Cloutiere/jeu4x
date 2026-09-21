# PROJET — État du jeu 4X (clone Cyber Revolution)

**Tenue par le pilot, mise à jour à chaque acceptation de phase.** Erik ouvre ce document pour savoir où on en est ; tout agent neuf le lit pour le contexte en 2 minutes. Vision et architecture : [DESIGN.md](DESIGN.md). Spécification normative : [RULES.md](RULES.md). File d'attente détaillée et mémoire de pilotage : [PILOT-HANDOFF.md](PILOT-HANDOFF.md). Index de tous les documents : [docs/index.md](docs/index.md).

**Production** : [game-4x-server-prod.erik-ai-studio.workers.dev](https://game-4x-server-prod.erik-ai-studio.workers.dev) · **1141 tests verts** · `schemaVersion` **23** · budget Cloudflare tenu (~5 $/mois).

---

## 🔄 Pivot du 11/09 — le 3D est mis de côté (reprisable)

**Décision d'Erik** : le projet pivote vers **la jouabilité 2D, les règles, le visuel 2D et les menus**. Tout le travail 3D (chantiers V1/V2/UNITES-3D/FONDERIE/T5/ECLAIRAGE/RELECTURE-3D) est **mis de côté, pas supprimé** : le code reste dans le dépôt, documenté pour une reprise éventuelle, mais **inaccessible en production**.

- **Drapeau unique** : `rendu3d: false` dans `apps/web/src/lib/config.ts` — le bouton « 3D » n'est plus rendu, la préférence locale (localStorage) est ignorée, la bascule 2D↔3D est inerte. Le jeu est 2D en toutes circonstances. À `true` : tout le comportement 3D historique est intact (verrouillé par tests `apps/web/tests/rendu3d-flag.test.ts`).
- **Reste accessible** : le rendu 2D (seul chemin de production), les outils d'atelier `#/lab3d`, `#/atelier`, `#/progen` (outils de reprise d'Erik, sans lien depuis l'UI de jeu) et la fonderie (`fonderie/`, hors app).
- **Accepté en l'état** : le code Three.js reste dans le bundle même inutilisé ; le labo/atelier restent joignables par URL en prod.
- **État à la reprise** : voir BACKLOG.md, entrée « REPRISE 3D (mise en sommeil le 11/09) ».

---

## ✅ Réalisé (dans l'ordre)

| Phase / chantier | Contenu |
|---|---|
| 0→6c | Moteur déterministe, réseau DO/WS/OAuth, rendu PixiJS, **1re partie 1v1 en ligne**, durcissement + CI/CD, économie des terrains, génération procédurale miroir + labo `#/progen` |
| 7a→7e | Technologies (46 techs, arbre complet), refonte du menu de ville, 22 ressources, barbares & huttes, unités terrestres + R-59 + Colon 2 pop |
| 7f→7i | **Culture** (GP, jalons, victoire culturelle), **naval & espionnage**, **gouvernements** (+ victoire scientifique), **alignement du moteur de ville** sur CivRev (consommation, seuils, fondation par ère) |
| 7j | **Personnages Illustres** : 6 classes canoniques, choix Consume/Settle, Grand Humanitaire, ciblage technologique |
| 7k | **Merveilles** : obsolescence globale, exclusivité, récupération de marteaux, effets restants + audit des actives |
| 7l | **Or & trésorerie** : rush-buy, paliers économiques, **victoire économique** (4 victoires jouables), Explorateur consume |
| 7m | **Nucléaire & espionnage de base** : Manhattan→ICBM unique, SDI, espion (6 actions, duels), garnison |
| 7n | **16 civilisations** (bonus de départ + d'ère cumulatifs, unités uniques), ères par comptage 5/14/24 |
| 7o | **Artefacts** (6 reliques, tirage seedé, placement insulaire, Atlantide) |
| Chantier V1 | **Rendu du jeu en vraie 3D** (Three.js, Option B hybride — terrain 3D + surcouche sprites) — ✅ accepté par Erik |
| Chantier V2 | **Structures 3D** : cartes-ressources en slots (état neutre avant tech), ville = Nœud Serveur, cratère, huttes/camps — ✅ accepté |
| Bot solo | **Partie solo contre le bot** (bot interne du GameDO, case au lobby) — ✅ accepté, 1re partie solo jouée en ligne |
| Atelier | **Page `#/atelier`** + rituel [ATELIER-ASSETS.md](ATELIER-ASSETS.md) — Erik y retouche ses assets en sessions libres |
| Socle desktop | **Coquille Electron de distribution Windows** (tranche 1, zéro Steam) — ✅ accepté le 19/09 : `desktop/` autonome (option A : la fenêtre charge la prod, session cookie + OAuth inchangés), sécurité durcie (sandbox, allowlist navigation, CSP), raccourcis neutralisés (F11 plein écran, confirmation de sortie en partie), session persistante, installeur NSIS + CI artifact ; bench 60 FPS = navigateur. Rapport : `docs/historique/rapports/REPORT-ELECTRON-SOCLE.md`. Tranche 2 (Steam) au backlog après approbation fiscale Steamworks |

## 🚧 En cours / prêts à lancer

1. **INTERACTION-3D** — déplacements refusés à tort (ville, case amie libérable) + re-clic des worked tiles (`HANDOFF-INTERACTION-3D.md`) ;
2. **SPAWN-START** — voisinage du Colon garanti (2 forêts, 2 prairies, 1 eau) + 0 ressource au rayon 2 (`HANDOFF-SPAWN-START.md`) — ✅ livré (voir `REPORT-SPAWN-START.md`) ;
3. **CENTREVILLE** — socle garanti 1N/1P/1C (`HANDOFF-CENTREVILLE.md`) — ✅ livré (voir `REPORT-CENTREVILLE.md`) ;
4. **UNITES-3D** — brancher les créatures 3D d'Erik (Script de Base, Sentinelle Réseau) au monde de jeu (`HANDOFF-CHANTIER-V2-UNITES3D.md`) ;
5. **ATELIER** — sessions de retouche en cours (Erik + agent, rituel `ATELIER-ASSETS.md`) ;
6. **INTERACTION-3D** ✅ — déplacements vers villes/cases alliées libérables + worked tiles en file d'ordres (livré 06/09) ;
7. **SPAWN-START** ✅ — voisinage du Colon garanti (2 forêts, 2 prairies, 1 eau) + 0 ressource au rayon 2, cartes préfabriquées ajustées (livré 06/09) ;
8. **CENTREVILLE** ✅ — socle garanti 1N/1P/1C sur tout terrain, tranche démographique au-dessus (livré 06/09) ;
9. **CALIBRAGE-CANON** ✅ — calibrage canon 06/09 appliqué (rapports d'Erik) : rush industriel ×4, sac de ville 25 %, GP or = Explorateur/Industriel, Confucius 2 GP **hors escalade**, Templiers toujours Vétérane, Égypte = **tirage seedé** sans choix (UI/protocole nettoyés), Zoulous = Aqueduc passif (seuils ÷2), artefacts 4-5 / distance 8 / indice 15 % (livré 06/09, `REPORT-CALIBRAGE-CANON.md`) ;

**1024 tests verts** · `schemaVersion` 19 · CI et prod saines. **Les chantiers 3D ci-dessus (V1, V2, UNITES-3D, INTERACTION-3D, T5, ECLAIRAGE…) sont mis de côté depuis le 11/09** (voir « Pivot du 11/09 »).

## 📋 File d'attente

**Chapitre actuel (post-pivot du 11/09) : jouabilité 2D, règles, visuel 2D, menus.**

- **FLECHE-MOUVEMENT** ✅ — livré et accepté le 12/09 (commit `5fbd6ba`, `docs/historique/rapports/REPORT-FLECHE-MOUVEMENT.md`) : survol = anneau sur la tuile visée ; **clic droit maintenu = préview multi-tours style Civ 7** (flèche + pointes par case + badges de tours, relâcher = confirmer) ; à la confirmation l'unité s'affiche à sa case d'arrêt de la prochaine résolution, flèche persistante avec badges tant que le mouvement vit ; aperçu = prochaine résolution seulement (moteur intact, `previewPrograms` conservé) ; 🔶 calibrage à l'œil : badges, pointes, anneau ;
- **ARRIVEE-ENNEMIE** ✅ — livré et accepté le 12/09 (commit `10203e6`, `docs/historique/rapports/REPORT-ARRIVEE-ENNEMIE.md`) : arrivée programmée sur tuile à ennemi **visible** = ennemi intact + **fantôme translucide réduit** de l'unité programmée décalé vers le bord d'arrivée + **anneau rouge** (survol, ordre posé, chemin gelé) ; badge ×N si plusieurs unités vers la même case ; fog = rien d'affiché ; investigation consignée : arrivée sur ennemi resté en place = combat R-52 (survie mutuelle → repli R-54) ; 🔶 calibrage à l'œil : alpha/ratio/décalage du fantôme, rouge ;
- **ZONE-CULTIVEE** ✅ — livré et accepté le 13/09 (commit `be3d2c5`, `docs/historique/rapports/REPORT-ZONE-CULTIVEE.md`) : zone des tuiles cultivées au style CivRev — liseré accent joueur + dégradé vers l'intérieur (3 couches 60/40/22 px, alphas 0,10/0,17/0,28) autour des worked tiles **effectifs**, temps réel au clic ; rayon cultivable en liseré pointillé discret (2,5 px/0,55) à la sélection seulement ; marqueurs worked tiles conservés ; `contourUnion` pur dans `contours.ts` (3D bit-identique) ; 🔶 calibrage : bloc `ZONE_CULTIVEE` en tête du rendu ;
- **EXPANSION-CULTURELLE (phase 1)** ✅ — livré et accepté le 13/09 (commit `83b248c`, `docs/historique/rapports/REPORT-EXPANSION-CULTURELLE.md`, R-113 rév. + R-162, migration **19→20**) : **Palais révisé** (min(pop, 5)/tour, Monarchie ×2 sur le Palais seul — `culturePerCitizenCap` data-driven) ; **anneaux culturels visual-only** — `city.cultureCumulee` (jamais consommée, gelée en anarchie), seuils 10/100/1 000/10 000 (T-51) plafond 5 anneaux (T-52), bande d'extension = disque moins zone cultivée, liseré+dégradé sur la frontière extérieure seule, temps réel au clic, fog clippé, zéro gameplay (workRadius intouché) ; visuel final validé par Erik en session ; 🔶 pacing GP (seuils T-27) à surveiller en jeu ;
- **GP-CULTURE-EVENEMENTS** ✅ — livré le 13/09 (commit `e9b4742`, `REPORT-GP-CULTURE-EVENEMENTS.md`, migration **21→22**) : le canal GP lit le **cumul EMPIRE** (Σ `city.cultureCumulee`) contre la table T-27 **indexée par les paliers franchis** (`player.culturePaliers`, jamais soustraite — D1/D4) ; **le palier EST l'événement** : +1 jalon (`reason 'cultureLevel'`) PUIS 1 GP dans la ville la plus cultivée (D6) ; **classe = tirage seedé** (pool de figures qui s'épuise, repli rotation — R-127 abrogée, D2) ; **R-126 abrogée** (D7) : les GP n'émettent plus AUCUN jalon (obtention/installation/vol), suspension ONU par perte de merveille seulement ; `cultureStored` **supprimé** (D5) ; UI : jauge empire « Palier N : X / seuil », compteur X/20 = paliers + merveilles ; validé en solo (captures `dev-logs/captures-gp-culture/`) ; zéro diff 3D ;
- **MENU-VILLE** ✅ — livré le 13/09 (`REPORT-MENU-VILLE.md`, migration **20→21**) : **vue ville au double-clic** — zoom À PLAT animé cadrant TOUTES les tuiles cultivables (6/18 Tribunal), ville centrée (pose recalculée au redimensionnement), unités et surcouche de guerre masquées, contour du rayon en accent joueur + pointillés sombres, rendements automatiques sur le rayon seul, tuiles cliquables (même file SetWorkedTile, temps réel) ; **menu dédié `CityView.svelte`** (nom VilleN, nourriture + tours avant croissance, production item+ETA, sciences et or de la ville, trésorerie d'empire, bâtiments, onglets production NE montrant que le constructible) ; **noms des villes VilleN par joueur** (`City.name` additif + table `NOMS_PAR_CIVILISATION` en réserve) ; `CityPanel` de la carte du monde en l'état ; zéro gameplay, zéro diff 3D ; 🔶 calibrages : zoom/marges (`poseVueVillePour`), durée d'animation 450 ms, alphas du rayon, épaisseur du contour ;
- **ATELIER-STYLE-ENRICHI** ✅ — session du 14/09 avec Erik (commits `5327892`, `6930bec`, `4237ba1`, `docs/historique/rapports/REPORT-ATELIER-STYLE-ENRICHI.md`) : vocabulaire de dessin enrichi dans `generate.py` (courbes Catmull-Rom, membres fuselés, dégradés `vgrad`, modelés `radial`, composite masqué `soft_clip`) + **9 assets redessinés** en style board-game enrichi — guerrier (visage dur, référence de style), colon, guerrier barbare (reconstruit en silhouette en V, rouge cuit sans accent), tuiles prairie/plaine/forêt/colline (crête basse)/montagne/désert/eau/ocean, ville capitale (accent inchangé, bug créneaux corrigé) et hutte bonus (accent toit conservé) ; dimensions et ids inchangés, zéro gameplay ; déployé en prod et validé par Erik à l'écran ; 🔶 restent en réserve : `tile_ville_sol`, archer barbare, GAP `tile_cratere` ;
- **REPLAY-RESOLUTION** ✅ — livré et accepté le 20/09 (commit `a4c85df`, `REPORT-REPLAY-RESOLUTION.md`) : relecture du dernier tour en conditions réelles (bouton « ⟲ Rejouer la résolution » — carte remise au pré-état capturé côté client, événements rejoués au fil de l'eau, unités qui disparaissent à leur événement, pan/zoom libres, Échap = retour immédiat) + journal cliquable (clic sur une entrée à case = centrage SANS changement de zoom) ; reconnexion = relecture indisponible (tooltip) ; zéro changement moteur/serveur ; relecture indisponible aussi après alt-tab resync (défaut sûr, vetoable) ;
- **PLACEMENT-MELEE** (handoff prêt : `HANDOFF-PLACEMENT-MELEE.md`, 20/09) — placement des unités en mêlée par **côté d'entrée** (dernier côté connu mémorisé, repli ancienne logique) + **7e position centrale pour l'unité stabilisée** à la création (centre vide si elle meurt), empilement en escalier existant avec les nouvelles derrière, sections mixtes multi-nations, cohabitation amie inchangée, placement actif aussi en relecture ; client seul (dérivable des `Move` + pré-état déjà capturé) ;
- Irritants de jouabilité + règles : liste en cours par Erik (à affiner en tranches) ;
- Menus : chantier à cadrer sur papier ;
- Visuel 2D : sessions d'atelier (sprites, lisibilité) — première session style enrichi livrée (voir ATELIER-STYLE-ENRICHI ci-dessus), suite en réserve ;
- **3D en sommeil** (voir BACKLOG.md « REPRISE 3D ») : RELECTURE-3D, tuiles forêt/désert/eau, distinction capitale, V3 visuel ;
- Espionnage avancé (BACKLOG idée 5) : toujours en DERNIER, rapport de recherche 4X attendu.



- **NOUVEAUX AXES (pivot du 11/09) — à cadrer par Erik** : jouabilité 2D, règles, visuel 2D, menus (prochains handoffs, Erik les cadrera) ;
- **REPRISE 3D (mise en sommeil le 11/09)** : voir BACKLOG.md — RELECTURE-3D, tuiles forêt/désert/eau, distinction capitale, V3 visuel, état des outils ;

- **V3 — Renommage thématique** : libellés FR nanotech (ids code inchangés) ;
- **Espionnage avancé** (BACKLOG idée 5) : infiltration, XP, points d'espionnage, menu de renseignement, fenêtre d'annulation — rapport de recherche 4X commandé par Erik ;
- En suspens : territoire/frontières (flip culturel, Hollywood), sauts technologiques ; docs de recherche attendus : XP & promotions, territoire ;
- Arbitrages 🔶 restants (3D/visuel bloc 4, divers 5.1-5.9) : liste consolidée dans [PILOT-HANDOFF.md](PILOT-HANDOFF.md) §dernier item.

## 📚 Où est quoi (règles d'emplacement)

- **Racine** : documents vivants uniquement (cette page, DESIGN, RULES, BACKLOG, HANDOFF, PILOT-HANDOFF, ATELIER-ASSETS, handoffs actifs) ;
- `docs/recherche/` : **les specs d'Erik** — recherches CivRev, elles font foi sur toute valeur ;
- `docs/historique/handoffs|rapports/` : archives des phases terminées ;
- **Conventions agent** : [HANDOFF.md](HANDOFF.md) §4 — notamment : *les documents de recherche sont des spécifications de référence, ils ne contiennent aucune mission ; ta mission est dans ton handoff.*
