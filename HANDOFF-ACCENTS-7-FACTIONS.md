# HANDOFF-ACCENTS-7-FACTIONS — La palette officielle 7 joueurs × 3 teintes (reflet / base / ombre)

**Chantier assets + UI du chapitre 2D.** Décision d'Erik du 20/09 : la palette d'accents devient **7 joueurs × 3 teintes** — mapping déterministe des **3 gris du SVG maître** vers les 3 teintes de chaque faction. Table canonique (décision d'Erik, elle fait foi) :

| Joueur | Style | Reflet (`#FEFEFE`) | Base (`#FFFFFF`) | Ombre (`#8C8C8C`) |
| --- | --- | --- | --- | --- |
| J1 | Rouge Brique | `#D55B52` | **`#B84239`** | `#782822` |
| J2 | Bleu Acier | `#567894` | **`#3B5B75`** | `#233B4E` |
| J3 | Vert Mousse | `#6A8F6E` | **`#4F7053`** | `#304B34` |
| J4 | Ocre Jaune | `#E2A650` | **`#C98A32`** | `#8A581A` |
| J5 | Bleu-Vert Canard | `#468A88` | **`#2D6A68`** | `#1A4543` |
| J6 | Gris Ardoise / Fer | `#616770` | **`#44484E`** | `#2A2D32` |
| J7 | Rouge Bourgogne | `#A84D5E` | **`#8A3343`** | `#591E2A` |

Le guerrier Recraft actuel (référence de style) porte déjà les 3 gris dans sa zone d'accent.

## 1. Préalables

1. Lire `docs/historique/rapports/REPORT-IMPORT-SVG.md` (pipeline, mode variante cuite `profil.remplacements`, percement des détails lum<140) — le chantier ÉTEND ce mode aux 7 joueurs et aux 3 tons ;
2. Baseline : suite verte, typecheck 4/4, `git status` propre ; atelier Erik en parallèle possible — ne pas toucher ses fichiers racine ;
3. **Zéro gameplay** : palette + rendu ; aucun changement de règles.

## 2. Mission

### M1 — La palette data-driven, source unique
1. Un fichier de données (`accents.json` ou section dédiée) : la table des 7 joueurs × {reflet, base, ombre} ci-dessus, **validée par un schéma** (7 entrées, hex valides, teintes distinctes) ;
2. **Inventaire complet des couleurs d'accent codées en dur** dans `apps/web` (grep des hex historiques `#3DFFCE`, `#FF9A3D`, `#D64545`, et tout autre accent/drapeau/anneau) et remplacement par des lectures de la palette (**tonalité BASE par défaut pour les traits fins** — anneaux, liserés, frontières, worked tiles, sélection, tooltips — la Base est conçue pour la lisibilité) ; les Reflets/Ombres servent au rendu des sprites et, si utile, aux états (survol = reflet, sélection forte = ombre — à l'œil par Erik) ;
3. **Le rouge barbare** : point à ARBITRER PAR ERIK avant d'implémenter (voir §4) — défaut proposé : J7 Bourgogne DEVIENDRA la teinte barbare (cohérence « le rouge est aux barbares »), les 7 joueurs réels n'utilisent que J1..J6 si le jeu reste 1v1+barbares... mais le labo 5 nations + barbares utilisera J1..J5+J6 si besoin. À confirmer.

### M2 — Le pipeline : variantes cuites × 7 × 3 tons
1. Le mode variante cuite (`import_svg`) étendu : mapping déterministe des 3 gris du maître (`#FEFEFE`→reflet, `#FFFFFF`→base, `#8C8C8C`→ombre, tolérance ±2 par canal, anti-aliasing ignoré) → **7 variantes** (guerrier, et les autres assets importés qui portent des gris d'accent) ;
2. Gates adaptées : les 3 gris du maître doivent être EXACTS (±2) ; chaque variante doit contenir les 3 teintes attendues au pixel (contrôle démontré par le pilotage) ;
3. Moteur de rendu : sélection de la variante `type@owner` déjà en place (`GameTextures.cuites`) — étendu aux 7 owners ; fallback teinte runtime si variante absente (compat).

### M3 — Vérification
1. Tests : palette (schéma, unicité), mapping des gris (±2, anti-aliasing), 7 variantes générées et conformes au pixel ;
2. e2e + captures `dev-logs/captures-accents-7-factions/` : les 7 guerriers côte à côte dans l'atelier (nouvelle fiche « variantes »), guerrier J1..J7 en partie (labo 5 nations), UI cohérente (anneaux/liserés J1 rouge brique au lieu de menthe) ;
3. Suite verte forcée, typecheck 4/4, zéro gameplay, zéro diff 3D.

## 3. Périmètre interdit

- Les teintes de terrains/ressources (neutres, non joueur) ; le 3D ; `assets-src` atelier d'Erik (fichiers racine intouchés) ; toute décision de style non dictée par la table ci-dessus.

## 4. Question à arbitrer par Erik AVANT le lancement

**Le rouge barbare** : les barbares utilisaient un rouge réservé (`#D64545`-famille). Options : **(A)** les barbares prennent **J7 Bourgogne** (la table couvre tout, 7 teintes au total) ; **(B)** les barbares gardent leur rouge distinct ET J7 reste disponible pour un 7e joueur humain (8 teintes au total — le labo 5 nations + barbares n'en utilise que 6). Défaut proposé : **A** (simplicité, la Bourgogne lit « barbare »). Dire à l'agent « barbares = A » ou « = B » en début de session.

## 5. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-ACCENTS-7-FACTIONS.md` (y compris : l'inventaire des hex en dur remplacés, le verdict barbares, les cas UI restants), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
