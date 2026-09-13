# HANDOFF-EXPANSION-CULTURELLE — Phase 1 : Palais révisé + anneaux culturels qui s'étendent (visual-only)

**Chantier du chapitre 2D** (post-pivot du 11/09). Base documentaire : **`docs/recherche/Culture dans Civilization Revolution.md`** (spec d'Erik — lire intégralement ; elle ne contient PAS la math d'expansion, tranchée ci-dessous). Décisions d'Erik tranchées le 13/09 : Palais révisé (1), seuils d'expansion (2), phase 1 **visual-only** (3). Le marqueur « 2 hexagones » des tuiles cultivées (capture d'Erik) est **déjà implémenté** (ZONE-CULTIVEE) : c'est le langage visuel à préserver, pas du travail.

## 1. Préalables

1. Lire `RULES.md` (R-113 rendement culturel, R-115/R-116 merveilles et jalons, R-121 gouvernements, R-60 worked tiles, R-66 socle), `PROJET.md` (§pivot), `PILOT-HANDOFF.md` §3-§4, le doc de recherche ci-dessus et `docs/historique/rapports/REPORT-ZONE-CULTIVEE.md` (langage visuel de la zone : liseré accent joueur + dégradé, `contourUnion` pur).
2. Baseline : suite verte (**1052 tests**), typecheck 4/4, `schemaVersion` **19** → **20** attendue (migration additive, voir M2.1), `git status` propre. Rendu 2D = seul chemin actif (`rendu3d: false`).
3. **Le validateur d'abord** : aucun nouvel ordre n'est créé (aucune `orderShapeError` à valider). **Zéro gameplay au-delà du rendement du Palais** (M1) : l'expansion culturelle est VISUAL-ONLY en phase 1.

## 2. Contexte

Le moteur génère déjà la culture (`cultureGains`, `culture.ts` R-113) et l'accumule par ville (`city.cultureStored`, consommée par le canal GP T-27). Aucun concept de territoire n'existe (reporté au backlog). Erik démarre l'expansion par le **visuel** : en début de partie la zone culturelle = les tuiles cultivées ; quand la ville génère de la culture, la zone **s'étend par anneaux**. Phase 1 : les anneaux s'affichent mais ne donnent **aucun effet gameplay**. Le vrai territoire/conversion/flip viendra plus tard — ce visuel et ses hooks se brancheront dessus.

## 3. Décisions tranchées (validées par Erik le 13/09)

1. **Palais révisé (R-113 rév.)** : **+1 culture par citoyen, plafonné aux 5 premiers niveaux de population** — `min(pop, 5)` culture/tour (à pop 6+, 5 culture/tour), capitale uniquement. **Monarchie ×2 ce bonus** (R-121 inchangé dans son principe). Data-driven : cap dans les données, pas de durcissement.
2. **Seuils d'expansion (T-nouveau)** : la culture **cumulée** de la ville déclenche l'expansion d'un anneau à **10 / 100 / 1 000 / 10 000** (table data-driven `culture.json`, calibrage 🔶), plafond **5 anneaux** (data-driven). Source externe : CivFanatics « Culture expansion » (10/100/1 000/10 000) — les valeurs d'Erik restent maîtresses via calibrage.
3. **Phase 1 visual-only** : les anneaux étendus s'affichent mais **aucun effet gameplay** — pas de tuiles travaillables au-delà du rayon actuel, pas de pression/conversion/flip culturel, pas d'interférence avec le workRadius du Tribunal.
4. **Langage visuel préservé** : la zone worked tiles existante (2 hexagones concentriques + dégradé) est intouchée ; les anneaux culturels utilisent le MÊME langage (liseré accent joueur + dégradé) mais **distinguable** ( proposition : alpha plus léger sur l'anneau étendu — Erik tranche à l'œil).

## 4. Mission

### M1 — Le Palais révisé (test-first, R-113 rév.)
1. `cultureGains` : la part Palais devient `min(pop, cap)` (cap data-driven, défaut 5), **capitale uniquement**. Interactions à verrouiller par tests : Monarchie ×2 s'applique à la part Palais (pas aux Temples) ; Communisme annule Temples/Cathédrales mais PAS le Palais ; Stonehenge multiplie la part Temples/Cathédrales mais PAS le Palais ; Magna Carta (Tribunal) et Théâtre (×2 total) inchangés ; Temple/Cathédrale restent NON plafonnés.
2. Données : `buildings.json` `palais` — `culturePerTurn: 1` remplacé par le modèle par citoyen plafonné (champ `culturePerCitizen: 1` + `culturePerCitizenCap: 5`, ou champ dédié — l'agent choisit la forme la plus propre, les deux moteurs culture.json/buildings.json restent cohérents) ; effet à jour. Migration si l'ordre des bâtiments change (éviter — garder `palais` dans `buildings`).
3. **Impact pacing GP à consigner** : la culture/canal GP s'accélère (capitale pop 2 → 2/tour au lieu de 1). 🔶 contrôle post-calibrage : les seuils T-27 (`greatPersonCultureThresholds`) sont éditables si Erik juge le rythme trop rapide — NE PAS les toucher dans ce chantier.

### M2 — Culture cumulée + rayon culturel (test-first)
1. **Compteur cumulatif séparé** 🔶 décision de tranche technique (veto possible) : nouveau champ `city.cultureCumulee` (additionne `cultureGains` chaque tour, JAMAIS consommé) — indépendant de `cultureStored` (le canal GP consomme le sien ; expansion et GP ne se volent pas de culture). Migration **schemaVersion 19→20** : champ additif, backfill `0` idempotent, parties existantes rejouées inchangées par ailleurs.
2. Fonction pure `rayonCulturelDe(cultureCumulee, table)` : nombre d'anneaux (0 au départ — la zone = worked tiles uniquement, conforme à Erik). Tests : 0/juste sous/à chaque seuil/au-delà, plafond 5, anarchie (culture 0 pendant R-122 — à vérifier : l'accumulation s'arrête-t-elle ? même traitement que cultureStored).
3. **Zéro consommateur gameplay** : `rayonCulturelDe` n'est branchée QUE sur le rendu (M3). Le workable/`tileWorkable`, les worked tiles, les conversions : intouchés.

### M3 — Rendu 2D des anneaux culturels
1. Pour chaque ville **visible** (filtrage fog existant) : contour de l'anneau culturel = union des cases dans le rayon culturel (réutiliser `contourUnion`/géométrie `contours.ts`), liseré accent joueur du propriétaire + dégradé **plus léger** que la zone worked tiles (les deux coexistent : le centre reste le style worked tiles, les anneaux étendus plus discrets). Recalcul au rebuild, jamais par frame.
2. Chevauchement de deux zones culturelles : hors périmètre (une ville seule, comme ZONE-CULTIVEE — session de jonction à venir). Dessiner les anneaux de chaque ville indépendamment, sans tenter de fusion.
3. **3D intouché** (contrainte dure, même règle que ZONE-CULTIVEE §5 : aucun diff dans les fichiers/calques 3D, tests 3D existants verts).

### M4 — Vérification
1. Tests : M1 (interactions Palais × gouvernements × merveilles), M2 (seuils/plafond/migration), rendu 2D.
2. e2e + partie solo (captures `dev-logs/captures-expansion-culturelle/`) : départ = worked tiles seulement ; accumulation → premier anneau à 10 culture (avec le Palais révisé, quelques tours) ; anneaux visibles sans sélection ; worked tiles intouchés au clic ; parties existantes reprises (migration 20) sans erreur.
3. Bench sans régression ; `schemaVersion` 20 ; suite verte ; typecheck 4/4.

## 5. Critères d'acceptation

- Capitale pop n génère `min(n, 5)` culture/tour (×2 sous Monarchie) — tests R-113 rév. verts, UI (jauge culture de ville si présente) cohérente.
- La zone culturelle d'une ville visible s'étend d'un anneau aux seuils 10/100/1 000/10 000, plafond 5, **sans aucun effet gameplay** en phase 1.
- Le visuel worked tiles (2 hexagones + dégradé) est inchangé ; anneaux culturels distinguables, calibrables à l'œil (constantes 🔶).
- Suite verte, typecheck 4/4, `schemaVersion` 20, migration idempotent, zéro diff 3D.

## 6. Périmètre interdit

- Conversion culturelle passive, flip, pression entre villes, Remparts immunité, Artiste Consume (territoire réel — backlog) ;
- Tuiles travaillables au-delà du rayon actuel / extension du workRadius (le Tribunal garde le sien) ;
- Les seuils GP T-27 (contrôle de pacing séparé) ; les menus ; le 3D (§M3.3) ; `orderShapeError` (aucun ordre nouveau).

## 7. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-EXPANSION-CULTURELLE.md` (y compris : consigne pacing GP post-calibrage, choix de forme de données du Palais, comportement anarchie), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
