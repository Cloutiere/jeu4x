# REPORT-GP-ART — Personnages Illustres (6 classes, SVG d'Erik) + icône sciences v2

**Mission tenue (handoff GP-ART, 27-28/09).** Les 6 classes de GP = les SVG peints d'Erik ; icône de sciences v2 cuisinée. Deux correctifs de rendu minimaux (GameCanvas) suite aux retours d'Erik en direct : **GP jamais teintés** et **barbare = le sprite noir dédié** (régression cuites ×6). **NON COMMITÉ** — feu vert d'Erik attendu (règle établie).

## 1. Cuisson GP (D1-D3)

- **Mapping D1 appliqué tel quel** : `artist.svg → unite_artiste_penseur`, `builder.svg → unite_batisseur`, `humanitaire.svg → unite_humanitaire`, `industrial.svg → unite_explorateur` (« Explorateur = industriel »), `leader.svg → unite_leader`, `scientist.svg → unite_savant`. **`general.svg` = EN RÉERVE** (copié nulle part, non intégré — consigné ici pour le jour où la classe Général existera).
- SVG copiés en `assets-src/modeles/gp/` (originaux `new_units/great people/` NON commités, comme toujours). 6 profils `gp-*` dans `import_svg.profiles.json` — mode unité 512×640 (export ×2), `sansAccent` (SVG entièrement peints, **0 forme blanche** — vérifié), marges 28/12/20.
- **Calibre** : hauteur de contenu = celle du guerrier livré, **456 px mesurés au pixel** sur les 6 PNG comme sur le guerrier (révélation Erik 28/09 : la première cuisson était à 365 px — erreur de facteur dans la mesure de référence, resize 2048² non uniforme ; les GP paraissaient 80 % du guerrier. Échelles recalées ×1,2476). `echelle` par profil : 0,7501 (artiste/bâtisseur/explorateur/savant), 0,8176 (humanitaire), 0,8672 (leader — personnage plus large).
- **Zéro code de résolution** : la chaîne générique (textures.ts `optionalEntity('unite_<id>')` sur les clés de units.json) les prend telles quelles.

**Sort des `_accent` GP (🔶 D2)** : les 6 vieux `_accent` painter sont RETIRÉS de `exports/` et `public/art/` — `optionalEntity` retombe sur `accent = base`, et le rendu ne teinte que si un vrai calque existe (cf. §3). Les fiches atelier des 6 GP passent sans variante d'accent (comme guerrier/archer/colon peints). `generate.py` : les 6 lignes painter sont commentées (retour arrière : décommenter + `python generate.py`). La ligne `unite_artiste` (7j) reste — clé « artiste » inexistante dans units.json, sans effet.

## 2. Icône sciences v2 (D4)

Profil `icone-sciences` → `new_icones/icone_sciences2.svg` (même stem `icone_science`, 64×64). A/B : `icone_science_avant.png` (v1 extraite du HEAD) + fiche atelier. Consommateurs inchangés (topbar Game.svelte, vue ville CityView.svelte chargent `yieldIcons.science` — même fichier, zéro code).

## 3. Correctifs de rendu (retours Erik en direct — 2 petites toucheries GameCanvas.svelte)

1. **« Les personnages illustres ne doivent pas être colorés par la couleur du joueur »** : sans variante cuite, `buildUnitContainer` créait TOUJOURS le calque accent teinté — et accent absent = repli base → tout le sprite d'Erik était teinté. Correctif : calque accent (et teinte) seulement si `tex.accent !== tex.base` — c'est la règle déjà documentée dans textures.ts (`entityOrFallback`), appliquée au rendu. Les GP s'affichent maintenant neutres, sous TOUTES les nations (vérifié labo : barres PV aux couleurs des 6 joueurs, sprites neutres).
2. **« Ce n'est pas le barbare noir qui apparait »** : régression des variantes cuites ×6 (LOBBY-5/ASSETS-6COULEURS) — `paletteDe('barbarien')` = rouge-royal et `cuites['guerrier@rouge-royal']` existe désormais → le lookup cuite écrasait le sprite barbare dédié (R-95) par la guerrière rouge J2. Correctif : lookup cuite court-circuité pour `BARBARIAN_ID` (le barbare garde ses sprites dédiés, rouge cuit dans la base). **Le PNG barbare n'a jamais été en cause** (vérifié : 257 552 o servis en dev comme en prod — le vieux sprite vu par Erik = ce bug de lookup + son cache de coquille, cf. §5).

Périmètre des correctifs : `GameCanvas.svelte` uniquement (rendu web), zéro moteur/serveur/protocole. Suites : **web 391/391, rules 897/897, serveur vert (turbo 3/3), svelte-check 0 erreur** (14 warnings préexistants). Pipeline import_svg : 14/15 (1 échec préexistant documenté : test remplacementsPalette4 attend 8 variantes, accents.json en a 6).

3. **Superposition des tuiles (retour Erik 28/09)** : l'ordre de dessin entre tuiles suivait l'ordre d'insertion — une unité posée sur une tuile du HAUT passait devant celle d'une tuile du BAS (pied du barbare sur la tête de l'Artiste). Correctif : `zIndex = p.y × 10 + disp.z` — la position verticale des pieds domine (règle du dessin isométrique : tout ce qui est plus bas se dessine par-dessus), `disp.z` ne départage plus que les unités du même paquet (cohabitation/mêlée, inchangé).
4. **Structures sur la couche tuile (retour Erik 28/09)** : villes, capitales, hutte bonus et artefacts passent de `zIndex 50` (au-dessus des unités) à **-100, la couche du village barbare** — ce sont des décors de tuile : tout ce qui est posé sur leur tuile ou sur une tuile inférieure se superpose à eux. Vérifié au labo-rendu (guerriers devant les villes, artefacts derrière les unités).

## 4. Labo GP (`#/labo-gp`, nouveau)

Nouvelle page labo client-side pur (miroir labo-rendu, route ajoutée à App.svelte) : rangée guerrier (calibre de référence) + les 6 GP seuls sur leurs tuiles, barbare + camp en haut à gauche. Piège corrigé dans le labo lui-même : la vision complète doit être posée APRÈS `recomputeVision` (sinon brouillard sur les non-p1).

**Captures `dev-logs/captures-gp-art/`** :
- `fiche-6-classes-avant-apres.png` — les 6 classes, painter (HEAD) vs SVG d'Erik ;
- `labo-gp-vue-ensemble.png` / `labo-gp-gros-plan.png` — rendu réel en carte, calibre vs guerrier, lisibles au zoom, tooltip « Grand Explorateur / Industriel » ;
- `icone-sciences-ab.png` — v1 → v2 à 64 px (taille HUD) et ×4.

## 5. Cache-busting (note Steam) + consigne de nettoyage pour Erik

- **Steam** : les assets de `public/art/` sont servis sans versionnage d'URL — après chaque déploiement, la coquille Electron peut resservir les VIEUX PNG depuis son cache disque. Un cache-busting des assets (hash dans l'URL ou header no-cache sur /art) serait souhaitable — tranche future, pas dans cette mission.
- **Erik** : dans ta coquille installée, vide le cache (Ctrl+Shift+R dans la fenêtre du jeu, ou vider le cache Chromium du profil) puis relance — le barbare noir et les GP d'Erik y apparaîtront. En prod web le bundle est vérifié (le PNG barbare servi = le bon, 257 552 o).

## 6. Ce qu'Erik valide en ligne

1. Les 6 GP en partie (neutres, calibre guerrier, lisible au dézoom) — labo `#/labo-gp` ou vraie partie ;
2. Icône sciences v2 en topbar et en vue ville ;
3. Le barbare noir sur son camp (après vidage de cache) ;
4. Les fiches A/B à l'atelier (`#/atelier`, catégorie sprites : fiches « AVANT import GP-ART »).

**Commit** : sur feu vert uniquement (fichiers d'Erik exclus : `new_units/`, `new_icones/` — copies en `assets-src/`).
