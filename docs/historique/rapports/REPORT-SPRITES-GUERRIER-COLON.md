# REPORT-SPRITES-GUERRIER-COLON — Remplacement des sprites guerrier et colon (nouveaux SVG d'Erik, 6 couleurs)

> Mission exécutée le 30/09 (HANDOFF-SPRITES-GUERRIER-COLON.md). **Non committé — ARRÊT L2 : feu vert d'Erik requis** (c'est lui qui a demandé à voir les nouveaux sprites en jeu).
> Suites : web 405 + serveur 116 VERTES, tsc 0 erreur, svelte-check 0 erreur. Zéro changement moteur/serveur/protocole.

## 1. Ce qui a été fait (D1 — remplacement pur, même pipeline)

- **12 SVG copiés en `assets-src/modeles/`** (`guerrier_v2_{bleu,rouge,vert,jaune,orange,ardoise}.svg`, `colon_v2_*.svg`) — les originaux de `new_units/new_guerrier|new_colon/` ne bougent pas et ne se committent jamais.
- **4 profils repointés** dans `assets-src/tools/import_svg.profiles.json` : `guerrier-6couleurs`, `guerrier-base`, `colon-6couleurs`, `colon-base` → sources v2. Mapping inchangé (bleu→Saphir j1, rouge→Rouge Royal j2, vert→Émeraude j3, jaune→Jaune d'Or j4, orange→Cuivre Ardent j5, ardoise→Ardoise j6). Aucun recoloriage, aucune retouche des SVG (D1/D2).
- **Cuisson 2×7** : `unite_guerrier_j1..j6` + `unite_guerrier.png` (base), `unite_colon_j1..j6` + `unite_colon.png` — toutes 512×640, export ×2, gates OK, idempotence rejouée. `sync-art` : 227 fichiers vers `public/art/`.
- **A/B « avant » (D4)** : `unite_guerrier_avant.png` mis à jour avec le PNG du HEAD ; `unite_colon_avant.png` créé (il n'existait pas — le colon n'avait pas de fiche avant). Les PNG du HEAD sont conservés dans `devtmp/ab-avant/` (non commité).
- **Labo `#/labo-rendu`** : rangée **colon ×6** ajoutée (r=16, terrains prairie→montagne, calibre guerrier) + **cohabitation guerrier+colon même nation** (p2, tuile (2,6)) ; carte passée de 15 à 17 lignes pour la nouvelle rangée. Rien d'autre touché dans le labo.

## 2. Captures (`dev-logs/captures-sprites-guerrier-colon/`, driver `driver-captures-sprites-guerrier-colon.mjs`)

1. `fiche-ab-6couleurs-guerrier.png` — guerrier ×6 AVANT (HEAD) / APRÈS (SVG v2) sur prairie.
2. `fiche-ab-6couleurs-colon.png` — colon ×6 AVANT / APRÈS.
3. `labo-guerrier-6couleurs.png` / `labo-colon-6couleurs.png` — rendu réel GameCanvas, rangées sur tuiles, barres PV 6 couleurs.
4. `labo-melee-3-nations.png` — cohabitation 3 nations (inchangée, contrôle).
5. `labo-cohabitation-guerrier-colon.png` — nouvelle cohabitation guerrier+colon p2 (posée par côtés, règles PLACEMENT-MELEE).
6. `labo-colon-zoom-max.png` — close-up zoom max, netteté export ×2.

## 3. Ce qu'Erik valide en ligne (L2 — à l'œil)

- Guerrier et colon en jeu = bien les NOUVEAUX dessins (silhouettes très différentes de l'ancien peintre : guerrier à la hache, colonne cape/bâton).
- **Calibre** : echelle inchangée (0,8808, calibre guerrier historique). Les nouveaux dessins ont des proportions différentes (silhouettes plus élancées, cheveux/capes amples) — c'est le 🔶 principal : si le rendu paraît petit/grand, on ajuste `echelle` par profil sans toucher au reste.
- Netteté au zoom ×2, lisibilité des 6 couleurs (J6 ardoise vs J3 émeraude distinguishables ?).

## 4. 🔶 ouverts

- **Calibre** (§3) : hauteur de contenu non re-mesurée au pixel — les nouveaux SVG n'ont pas les mêmes marges que les anciens ; verdict à l'œil, ajustement `echelle` trivial si besoin.
- **Teinte SVG vs hex UI** (D2 assumé, comme vague 1) : pas de contrôle des hex, l'UI reste sur accents.json.
- Le trait des nouveaux colons est plus fin que l'ancien — lisibilité au dézoom max à vérifier (capture zoom seul fournie).

## 5. Tests / garde-fous

- `import_svg.mjs` gates OK sur les 14 cuites, `--check` rejoué.
- Suites : web 405/405, serveur 116/116, tsc 0 erreur, svelte-check 0 erreur (14 warnings préexistants).
- Fichiers d'Erik (`new_units/`) NON commités ; seules copies `assets-src/modeles/*_v2_*.svg` + exports + profils + labo + captures entrent au commit (après feu vert).
