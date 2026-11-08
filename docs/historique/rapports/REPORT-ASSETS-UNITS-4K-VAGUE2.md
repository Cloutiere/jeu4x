# REPORT-ASSETS-UNITS-4K-VAGUE2

Mission exécutée le 03/10 — Archer, Croiseur, Cuirassé : sprites 4K d'Erik (HANDOFF-ASSETS-UNITS-4K-VAGUE2).

## L0 — Sources et archivage

- Pipeline identifié : `assets-src/tools/import_svg.profiles.json` (profils) + `import_svg.mjs` (cuisson, mode « variantes fournies » raster PNG accepté depuis ASSETS-4K) + `sync-art` (exports → `apps/web/public/art`).
- Sources actuelles avant remplacement : archer = SVG ×6 (`new_units/archer/`, profil `archer-6couleurs` + `archer-base`) ; croiseur/cuirassé = planches peintre de `generate.py` (512×640 non — 256×320 d'origine, calque accent teinté au runtime).
- **Archivage** : les 6 SVG archer copiés vers `assets-src/archives/archer-svg-6couleurs/` (+ README) — le profil pointe désormais sur les PNG 4K. Les planches peintre croiseur/cuirassé vivent dans `generate.py` (code intact, seuls les PNG de catalogue sont remplacés — réversible en recuisant via generate.py).

## L1 — Copie, profils, cuisson

- 18 PNG `_trsp` copiés vers `assets-src/modeles/4k/` (gitignoré, comme la vague 1) ; nomenclature par unité du jeu :
  - `archer_<c>_trsp.png` ← `new_units/new_archer/` ;
  - `croiseur_<c>_trsp.png` ← `new_units/new_cuirasse/` (⚠ nom historique inversé, cf. handoff §2 : le répertoire « cuirasse » d'Erik = **Croiseur** du jeu) ;
  - `cuirasse_<c>_trsp.png` ← `new_units/new_battleship/` (= **Cuirassé** du jeu).
- Profils nouveaux/modifiés : `archer-6couleurs` (sources remplacées), `archer-base` (PNG bleu), **`croiseur-6couleurs`, `croiseur-base`, `cuirasse-6couleurs`, `cuirasse-base`** (nouveaux — stem `unite_croiseur`/`unite_cuirasse`, mode `variantesFournies`, `sansAccent` pour les bases).
- 21 cuites : 6 variantes joueur ×3 unités (`unite_<t>_j1..j6`) + 3 bases (`unite_archer`, `unite_croiseur`, `unite_cuirasse`). Gates G1–G4 OK partout (rendu direct, aucune teinte écrasée — art pré-peint par Erik, zéro recoloriage).
- **Calibre (echelleParVariante)** : hauteur de contenu calée sur l'avant, variante par variante (les 4K changent de proportions par couleur) — vérifié au pixel après cuisson :
  - archer : 456 px pour les 6 variantes (avant : 456) ✓
  - croiseur : 330 px (avant : 165 @256×320 ≡ 330 @512×640) ✓
  - cuirassé : 366 px (avant : 183 ≡ 366) ✓
  - Largeurs variables (l'art d'Erik a d'autres proportions que les anciens sprites — ex. archer presque carré vs ancien élancé) ; seules les hauteurs sont figées par la convention « calibre = hauteur de contenu » de la vague 1.

## L2 — Validation visuelle (AVANT commit)

- Captures `dev-logs/captures-assets-units-4k-vague2/` : `avant/` (exports git HEAD), `apres/`, planches A/B par unité (`ab_*.png`), planche de calibre (`calibre_j1.png` : guerrier/archer/colon/croiseur/cuirassé J1 côte à côte), captures atelier (`atelier-*.png`).
- Atelier `#/atelier` : les 3 unités + variantes cuites affichées (catalogue étendu aux variantes croiseur/cuirassé/colon — `catalogue.ts`). Rendu vérifié à l'œil numérique : sprites complets, transparence propre, 6 teintes distinctes.
- **Juge visuel indépendant : pass sur les 7 fichiers** (planche calibre incluse — navires « d'encombrement comparable aux unités terrestres, ni minuscules ni géants »). Remarque non bloquante consignée : le cuirassé d'Erik est en style low-poly facetté, contrastant avec le croiseur peint — c'est l'art source fourni, aucune retouche faite.
- Client : `textures.ts` charge les variantes cuites `croiseur@<palette>` / `cuirasse@<palette>` (même mécanique que guerrier/archer/colon) — plus de teinte runtime pour ces deux navires.

## L3 — Suites

- Tests : **3 paquets verts** (rules + web 495 + server 120) — aucun test asset bougé.
- `svelte-check` : 0 erreur (14 warnings préexistants).
- sync-art : 240 PNG dans `public/art` (21 nouveaux/modifiés committés ; sources 4K hors git).

## 🔶 À vérifier en ligne par Erik

1. Le calibre des 3 unités en partie réelle (hauteurs figées sur l'avant, mais les proportions nouvelles rendent l'archer plus trapu, les navires plus « carrés ») — recalage possible en 1 ligne par variante (`echelleParVariante`).
2. Le style du cuirassé (low-poly facetté vs croiseur peint) — voulu par l'art source.
3. L'orientation des navires en jeu (les deux ont la proue vers le haut-droit ; aucun retournement appliqué).

## Hors périmètre (respecté)

Galère et Galion inchangées (en attente des fichiers d'Erik) ; aucun autre répertoire `new_units/` touché ; moteur/serveur/schemaVersion intacts ; `new_units/` jamais committé.
