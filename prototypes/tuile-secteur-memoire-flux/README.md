# Prototype — Tuiles cybernétiques du Réseau (vraie 3D)

**Statut :** exploration visuelle autonome · **Thème :** *Refonte Cybernétique De Civilization Revolution.md* § « Langage visuel des tuiles » (décisions d'Erik du 04/09) · **Moteur :** Three.js r147 uniquement (le faux 3D isométrique a été abandonné — voir historique en fin de page)

Maquette cliquable montrant **les 8 terrains cybernétiques** sur une carte de démonstration de 37 hexagones (coupe géologique : montagnes à l'arrière, littoral et océan à l'avant), avec le langage visuel « potentiel affiché, actif allumé ».

## Ouvrir

Double-clic sur **`index.html`** — tout est embarqué (Three.js r147 UMD + bloom dans `vendor/`, licence MIT), fonctionne **hors-ligne**. Alternative : `python -m http.server` dans ce dossier puis http://localhost:8000.

Contrôles : glisser = orbiter, molette/pincement = zoom, double-clic = recadrer. Interrupteurs : **Animation**, puis un par bâtiment (Grenier, Atelier, Extracteur Quantique, Multiplexeur, Passerelle Optique) et **Tout allumer**.

## Le langage visuel (validé par Erik le 04/09)

Trois pictogrammes, **une seule couleur néon** (`#3DFFCE`) — la ressource se lit par la forme, le terrain par la teinte et l'élévation :

| Pictogramme | Ressource | Tuiles |
|---|---|---|
| **Bus de données** (pistes néon traversantes + pulses) | Ⓝ Nourriture | Prairie, plaine, eau (via le Port) |
| **Microprocesseur** (grande puce à broches, cœur vert doux) | Ⓟ Cycles CPU | Forêt, colline, montagne |
| **Barrette RAM** (socle + module vertical) | Ⓒ Commerce | Désert, eau |

**Convention d'état :** la tuile montre toujours son potentiel maximal en glyphes *pâles* ; le rendement actif est *allumé* ; cocher le bâtiment associé allume le reste.

| Terrain (Secteur) | Potentiel | État de base | Bâtiment → tout allumé | Élévation | Teinte |
|---|---|---|---|---|---|
| Prairie (Secteur Mémoire Flux) | 2 bus | 2 allumés | — | 0 | vert-teal |
| Plaine (Cluster de Données) | 3 bus | 1 + 2 pâles | Buffer Mémoire (Grenier) | 0 | vert-olive |
| Forêt (Matrice d'Algorithmes Bruts) | 2 CPU | 2 allumés | — | 0 | vert profond |
| Colline (Nœud de Processeurs) | 3 CPU | 1 + 2 pâles | Moteur d'Accélération (Atelier) | +1 | bleu-acier |
| Montagne (Noyau Quantique Solide) | 5 CPU | 1 + 4 pâles | Extracteur Quantique (Mine de fer) | +2 | violet-gris |
| Désert (Bus à Bruit Statique) | 3 RAM | 1 + 2 pâles | Multiplexeur (Comptoir) | 0 | sable délavé |
| Mer (Réseau Sub-Éthéré) | 2 RAM + 1 bus | RAM allumées, bus pâle | Passerelle Optique (Port) | −1 | cyan-bleu |
| Océan (idem) | idem Mer | idem | idem | −1 | indigo profond |

**Décisions tranchées le 04/09** (revalidation demandée par Erik) :
1. **Plaine → 3 bus** (Grenier +2) : déviation assumée par rapport à CivRev et à RULES.md §2 (qui dit +1 → 2). Cela aligne la table des terrains du doc cyber sur sa table des bâtiments (+2). **RULES.md est à réaligner le moment venu.**
2. **Montagne → 5 CPU** (1 + 4 avec l'Extracteur) : conforme à RULES.md.
3. **Eau** : conforme aux règles — 2 RAM (commerce) toujours allumées, 1 bus pâle allumé par la Passerelle Optique (Port +1 nourriture).
4. **Doc** : unités économiques inchangées (RAM/CPU/Bande Passante) ; le langage visuel est documenté en annexe de la table des terrains (colonne pictogramme).

## Structure

```
index.html      page (vue 3D, interrupteurs, légende)
design.js       SPEC déclarative des 8 terrains (teintes, glyphes, élévations,
                bâtiments), carte de démonstration, peintres de substrat,
                placements de glyphes — tout est piloté par cette spec
tuiles3d.js     moteur Three.js : prismes à élévation sémantique, glyphes 3D,
                couples de matériaux allumé/pâle, pulses, bloom, orbite maison
captures/       captures de la vitrine (état de base, bâtiments actifs)
vendor/         three.min.js + passes de bloom (UMD r147, MIT)
```

## Points d'intégration future (non réalisés ici)

- **Pipeline** : adoption vraie 3D = nouvelle dépendance `three` (~600 Ko) dans `apps/web`, overlays UI (sélection, chemins, brouillard, étiquettes) à repenser en 3D ; le contrat SPEC-ART PNG 224×256 reste valable pour une éventuelle variante 2D.
- **Calques ultérieurs** : 22 ressources (icônes posées sur les tuiles), traits de faction (Vitesse de Bus, Bonus Allemand…), ville = structure posée (comme les unités), cratère = déclinaison stérile, rivières = trait de bordure lumineux.
- La spec étant déclarative dans `design.js`, ajouter un terrain = ajouter une entrée `TERRAINS` + une rangée dans `CARTE`.

## Historique

- v1 (même journée) : comparaison faux 3D isométrique (canvas 2D, style Polytopia) vs vraie 3D — Erik a tranché pour la vraie 3D ; le mode iso (`iso.js`) et l'export PNG contractuel ont été retirés.
