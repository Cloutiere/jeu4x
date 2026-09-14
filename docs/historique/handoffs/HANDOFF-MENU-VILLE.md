# HANDOFF-MENU-VILLE — La vue ville (double-clic : zoom incliné + tuiles + menu dédié)

**Chantier majeur du chapitre « menus » (post-pivot du 11/09).** Décisions d'Erik tranchées le 13/09. Le menu de ville CivRev : **double-clic sur une ville** = l'écran zoome sur la ville, le plan s'incline, les tuiles cultivables s'affichent avec leurs rendements, et **un menu entièrement nouveau** apparaît — les menus actuels disparaissent. Le panneau de ville actuel de la carte du monde (`CityPanel`, simple clic) **reste tel quel** : il sera retravaillé éventuellement plus tard, ce chantier le touche au minimum (tooltips déjà alignés par ALIGNEMENT-CROISSANCE).

## 1. Préalables

1. Lire `RULES.md` (R-60 worked tiles, R-62/R-66 production, R-63 croissance rév. 13/09, R-88 citoyens intérieurs, R-90 conversion commerce→science, R-134 trésorerie, R-66 rayon de travail 6/18 Tribunal), `PROJET.md` (§pivot), `PILOT-HANDOFF.md` §3-§4, `docs/historique/rapports/REPORT-ALIGNEMENT-CROISSANCE.md` (helper pur `toursAvantCroissance` — à réutiliser tel quel).
2. Baseline : suite verte (**1070 tests**), typecheck 4/4, `schemaVersion` **20**, `git status` propre. Rendu 2D = seul chemin actif (`rendu3d: false`).
3. **Zéro gameplay** : aucune règle, aucun ordre (`orderShapeError` intouché), aucun effet de production modifié — c'est de la vue + de l'affichage sur des helpers purs existants.

## 2. Décisions tranchées (validées par Erik le 13/09)

1. **Fausse perspective** (pas de vrai perspective plugin) : le plan de jeu est compressé verticalement (~×0,75 🔶) et zoomé sur la ville — l'aspect « caméra inclinée » de CivRev. Zoom avant **animé** à l'ouverture, retour animé à la fermeture. Le picking passe par la transform du conteneur monde (jamais les maths écran brutes) — cliquer doit rester exact dans la vue inclinée.
2. **Tuiles cliquables** : dans la vue ville, les tuiles cultivables (rayon `workRadiusOf` — **6 cases, 18 avec Tribunal**) s'affichent avec leurs **icônes de rendement** ; le clic assigne/désassigne une tuile cultivée — réutilise la file d'ordres worked tiles existante et son temps réel (la zone/hexagones de ZONE-CULTIVEE suivent).
3. **Vue modale** : pendant la vue ville, tous les menus actuels disparaissent et les actions de carte (sélection d'unités, programmation de mouvement, fin de tour) sont inaccessibles. Sortie par **bouton fermer + Échap + double-clic hors de la ville** — retour animé à la vue normale. Hors vue ville, l'UI actuelle est inchangée.
4. **Noms des villes fondées** : « Ville1, Ville2… » — compteur **par joueur** (Ville1 d'Erik et Ville1 du bot coexistent). Table de noms par civilisation data-driven **en réserve** (vide = fallback VilleN) — Erik remplira plus tard sans code.
5. **Or ET sciences** affichés (les deux), plus la trésorerie totale de la civilisation.
6. **Menu entièrement nouveau** — voir §3 M3 pour le contenu exact.

## 3. Mission

### M1 — État de vue + noms de villes
1. État UI de vue ville (`vueVille: cityId | null` — client uniquement, jamais dans l'état du GameDO). Gestionnaire de double-clic sur une case de ville qui n'entre pas en conflit avec le simple clic (sélection, alternance, worked tiles du simple clic inchangés hors vue ville).
2. Noms des villes fondées : compteur par joueur au moment de la fondation (VilleN — vérifier si `city.name` existe déjà ; si un champ d'état est nécessaire, **schemaVersion 20→21** additive + backfill « VilleN » déterministe, à signaler dans le rapport). Les villes préfabriquées des cartes gardent leurs noms. Table data-driven `nomsParCivilisation` (vide pour l'instant).

### M2 — La vue ville (le rendu)
1. Conteneur monde transformé (compression Y + translation/zoom centrés ville), animation d'entrée/sortie douce. Les calques existants (terrain, unités, flèches, zones, anneaux) vivent DANS le conteneur : tout s'incline ensemble, sans redessiner.
2. Picking : toutes les décisions de clic traversent la transform inverse (testé : clic sur une tuile de la vue inclinée = la même tuile qu'à plat).
3. Affichage automatique des tuiles cultivables avec icônes de rendement dans la vue (les glyphes existants s'appliquent à tout le rayon, même hors assignation) ; les tuiles du rayon non travaillées restent visibles comme « cultivables ».
4. Performance : la transform est statique pendant la vue (pas de recalcul par frame) ; le redraw reste piloté par `overlayDirty`.

### M3 — Le menu de ville (le contenu EXACT demandé — rien d'autre à l'écran)
1. **Nom de la ville** (VilleN — M1) ;
2. **Nourriture** : +X/tour et **nombre de tours avant la prochaine population** (`toursAvantCroissance` — ALIGNEMENT-CROISSANCE ; seuils 10×pop actuelle) ;
3. **Production** : marteaux/tour, **item produit actuellement (nom + icône)** et nombre de tours pour le terminer ;
4. **Sciences produites par cette ville** (conversion R-90 ville) ET **or produit par cette ville** (rendements de tuiles) ;
5. **Or total de la civilisation** (trésorerie R-134) ;
6. **Liste des bâtiments existants** de la ville ;
7. **Choix de production par type** : onglets **unités / bâtiments / merveilles** — refonte du catalogue existant (mêmes règles de production du moteur, zéro logique nouvelle ; les garde-fous existants : exclusivité mondiale, jalons ONU, uniques de civ, restent affichés comme aujourd'hui).
8. Le menu est un composant nouveau (`CityView.svelte` ou équivalent) — il NE remplace PAS `CityPanel.svelte` (carte du monde) qui reste en l'état.

### M4 — Vérification
1. Tests : M1 (noms, compteur par joueur, migration éventuelle), picking incliné (fonction pure), helpers d'affichage (marteaux/tours, science/or ville), absence de conflit double-clic/simple-clic.
2. e2e + partie solo (captures `dev-logs/captures-menu-ville/`) : double-clic → zoom incliné + tuiles + menu ; clic sur une tuile cultivable = assignation (zone temps réel) ; production changée depuis le menu → jauge/ETA à jour ; sortie (fermer/Échap/double-clic hors ville) → retour à plat, UI de carte intacte ; ville avec Tribunal = 18 tuiles ; sans = 6.
3. Bench : aucun coût par frame de la vue inclinée ; suite verte forcée ; typecheck 4/4 ; `schemaVersion` 20 (ou 21 si migration M1 — signaler).

## 4. Critères d'acceptation

- Double-clic sur une ville = zoom incliné animé sur la ville et son rayon (6/18 tuiles avec rendements), menus actuels absents, menu de ville présent avec EXACTEMENT les 7 éléments de M3.
- Tuiles cliquables avec temps réel ; sortie par les 3 voies ; retour à l'UI de carte inchangée.
- Villes fondées nommées VilleN par joueur ; préfabriquées inchangées.
- Suite verte, typecheck 4/4, zéro gameplay, zéro diff 3D.

## 5. Périmètre interdit

- Toute règle de production/croissance/conversion (affichage seul) ; `orderShapeError` (aucun ordre nouveau) ;
- Le panneau `CityPanel` de la carte du monde (reste en l'état) ; les autres menus (lobby, recherche, gouvernements, journal) ;
- Le 3D (contrainte dure — la vue ville est 2D ; aucun diff sous `render3d/`) ;
- Les noms de civilisation réels (table vide en réserve).

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Si la tranche est trop large pour une session : livrer M1+M2 d'abord (vue ville complète et validée), M3 pouvant rester sur le panneau existant en attendant — JAMAIS l'inverse (un menu sans vue ne sert pas le design d'Erik). Rapport `REPORT-MENU-VILLE.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
