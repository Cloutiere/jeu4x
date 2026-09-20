# HANDOFF-IMPORT-SVG — Le pipeline d'import d'assets SVG fournis par Erik (Recraft → catalogue → jeu)

**Chantier d'outil du chapitre 2D.** Contexte : Erik produit désormais des assets vectoriels de grande qualité via Recraft (premier validé : le guerrier bronze — calque d'accent blanc pur vérifié, détails sombres, pas de trou). Ce handoff construit **la porte d'entrée** qui transforme un SVG fourni en asset de jeu, dans la même chaîne que `generate.py` (catalogue, sync-art, atelier). Politique hybride assumée : le painter reste source pour terrains/icônes/unités mécaniques ; les fournitures d'Erik prennent les assets à personnalité.

## 1. Préalables

1. Lire `ATELIER-ASSETS.md` (le catalogue et ses tests), `generate.py` (sorties attendues : PNG + accents + palette, dimensions), `docs/historique/rapports/REPORT-ATELIER-STYLE-ENRICHI.md` ;
2. Baseline : suite verte, typecheck 4/4, `git status` propre (les SVG d'Erik restent à la racine/`image_ref/`, NON committés sans sa demande — le pipeline les lit, ne les versionne pas) ;
3. **Zéro gameplay** : `assets-src` + outillage seulement ; aucun changement moteur/serveur ; 3D intouché.

## 2. Mission

### M1 — Le convertisseur (outillage build, hors ligne)
1. Un outil (emplacement libre : `assets-src/tools/import_svg.*` — Python ou Node, l'agent choisit le plus propre ; **aucune dépendance réseau**) qui prend un SVG + un profil et produit :
   - **Rastérisation multi-résolutions** (les tailles du catalogue : unités 64×64, grands formats 256×256, au profil de choisir) avec anti-aliasing propre ;
   - **Le calque d'accent** : détection de la zone blanche → production du `_accent` PNG (mécanique runtime existante : calque blanc teinté joueur) ;
   - **Les contrôles automatiques (gates)** : zone d'accent = blanc **pur** (255,255,255,255 — tolérance anti-aliasing de bord uniquement ; le contrôle au pixel démontré par le pilotage le 18/09 sert de spéc), aucun pixel transparent DANS la zone d'accent (pas de trou), dimensions/ratio du profil respectés, poids du fichier raisonnable. Un échec = refus avec message précis (et le rendu de diagnostic) ;
2. **Les tuiles de terrain (variante hexagone)** : le SVG fourni = le décor intérieur SANS bordure ; le pipeline le **clipe dans la géométrie hexagonale exacte du jeu** (`hex_points` de `generate.py`) et trace le contour `#2B2620` en code — géométrie garantie, bordure cohérente entre toutes les tuiles ;
3. Sortie : exactement là où `sync-art` attend (mêmes noms de fichiers que les assets peintre) — l'aval est inchangé.

### M2 — Premier asset : le guerrier (validation de bout en bout)
1. Importer le SVG validé d'Erik (`full-body-game-sprite-of-an-ancient-bronze-age-war.svg` — blanc pur déjà corrigé) comme **nouveau sprite du guerrier** : l'ancien painter reste dans `generate.py` (retrait du remplacement en un commit si Erik veut revenir) ;
2. Le guerrier importé doit apparaître **dans le jeu** (carte, sélection, accent joueur correct — vérifier menthe J1, orange J2, rouge barbare via les accents des barbares si applicable) et **dans l'atelier** (fiche catégorie Sprites 2D avec mention « import ») ;
3. Comparaison A/B atelier ancien/nouveau disponible pour le verdict d'Erik.

### M3 — Vérification
1. Tests : gates (blanc impur rejeté, trou rejeté, ratio faux rejeté), résolutions produites, clip hexagone, idempotence du pipeline ;
2. e2e + captures `dev-logs/captures-import-svg/` : guerrier en partie avec accents de deux joueurs, atelier A/B ;
3. Suite verte forcée (y compris le test de complétude du catalogue), typecheck 4/4, zéro gameplay, zéro diff 3D.

## 3. Périmètre interdit

- Le moteur, le serveur, l'UI de jeu (au-delà du sprite lui-même) ; le 3D ; les fichiers d'Erik à la racine (lecture seule — jamais commités ni déplacés sans sa demande) ; la licence : Erik fournit, le pipeline n'importe QUE des fichiers qu'Erik désigne explicitement.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-IMPORT-SVG.md` (y compris : le choix d'outil de rastérisation, le profil de guerrier, la procédure pour les prochains assets — mode d'emploi d'Erik en 5 lignes), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
