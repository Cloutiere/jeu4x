# FONDERIE — Atelier de fabrication des modèles 3D d'unités (.glb)

**La fonderie est l'atelier ISOLÉ où les modèles 3D d'unités du jeu sont fabriqués, vus et validés — sans jamais toucher au code du jeu.** Décidée par Erik le 06/09 après l'échec du gabarit paramétrique (quelques centaines de tris, contexte de l'agent contaminé par la plomberie du jeu).

## Le principe (pourquoi c'est séparé)

- **Zéro dépendance au jeu** : la fonderie ne lit ni n'écrit `apps/`, `packages/`, `visuel3d.json`. Une session d'agent en fonderie charge 3-4 fichiers, pas 15.
- **Un contrat unique avec le jeu** : un fichier `.glb` conforme à [STYLE-3D.md](STYLE-3D.md) — rien de plus. Le mapping type moteur → modèle est data-driven (`visuel3d.json` §`structures.unites3d`) : activer/désactiver une unité = une ligne de JSON.
- **Le même dépôt git** : fabrication dans `fonderie/modeles/`, promotion (copie) dans `assets-src/modeles/` uniquement après validation par Erik — c'est le seul point de contact.

## S'en servir

1. **Lancer** : `fonderie/lancer-fonderie.bat` (ou `node fonderie/serveur.mjs`) → **http://localhost:5178/** — visualiseur autonome, fonctionne hors ligne (Three.js en fichiers locaux, mêmes réglages de rendu que le jeu : bloom 0.55/0.4/0.62, pas de tone mapping, fond 0x070b18 — copiés, jamais importés).
2. **Regarder** : rotation orbitale libre, zoom, bloom on/off, fond clair/sombre, wireframe, grille d'échelle (cercle rayon 1 = la tuile), teintes J1/J2/J3, **compteur de tris honnête**.
3. **Fabriquer** : chaque unité a son script dans `fonderie/outils/fabriquer-<nom>.mjs` (exporteur GLB maison : `outils/glb.mjs`, pur Node). Une image de référence dans `image_ref/` + [STYLE-3D.md](STYLE-3D.md) = la commande de fabrication.
4. **Valider** : Erik décide à l'œil dans le visualiseur. Un modèle validé est **promu** (copié) dans `assets-src/modeles/`, puis intégré au jeu par une session séparée (dernière en date : REPORT-FONDERIE-T3.md — 22 unités en jeu).

## Les règles du rituel (résumé — le détail est dans les handoffs archivés)

- Toute valeur de style est dans [STYLE-3D.md](STYLE-3D.md) : néon **#3DFFCE** jamais teinté, corps translucide teinté joueur, hard-surface facetté, **< 5 000 tris, ≤ 3 matériaux**, origine au sol / Y-up / face -Z.
- La fabrication et l'intégration ne sont **jamais la même session** ; le commit ne part que sur la demande explicite d'Erik.
- Les modèles ~2,5-3 000 tris chacun ; l'échelle d'affichage par type se calibre dans `visuel3d.json` (`echelle`), à l'œil.

## Les deux workflows d'habillage d'assets externes (leçons des sessions des 06-07/09)

- **Mode sculpteur (clay nu sans UV) — à éviter** : testé sur `guerrier_2.2.glb`, résultat rejeté par Erik. Découper des zones matériaux triangle par triangle est laborieux et médiocre.
- **Mode peintre (modèle texturé avec UV, ex. exports Tripo) — le workflow standard** : géométrie et UV conservées telles quelles, on **repeint la texture** dans la palette STYLE (corps neutre-clair, arêtes néon #3DFFCE, glyphes), on dérive la couche émissive, le néon devient un petit second matériau. Exemple réussi : `knight_v3.glb` (rapport `fonderie/REPORT-FONDERIE-HABILLAGE-TRIPO.md`).
- **Conventions du corps teintable (validées par Erik le 07/09)** : le **corps entier est le matériau `accent_joueur`** (le jeu le teinte par propriétaire) — texture **opaque et neutre-claire** pour que la teinte se lise en multiplication ; le fichier cuit la compensation de luminance (facteur élevé) car le loader l'écrête. **Le code de teinte doit MULTIPLIER la couleur, jamais remplacer `material.color`** — exigence d'intégration consignée au rapport.
- **Teintes joueur** : J1 menthe, J2 orange, J3 violet, J4 bleu #3D9AFF, J5 jaune #FFE23D, J6 rose #FF3DB8 — démontrées dans le visualiseur ; le mapping joueur → teinte se tranchera à l'intégration.
- Un générateur externe (Tripo…) produit la FORME et le LOOK ; les conventions du jeu (noms de matériaux, émissif, origine, orientation, échelle) sont TOUJOURS appliquées par une session fonderie locale.

## Historique

- **06/09 — FONDERIE-3D** : création (visualiseur + STYLE-3D + Guerrier, puis 21 autres unités dans la même session) — rapport `fonderie/REPORT-FONDERIE-3D.md`.
- **06/09 — FONDERIE-T3** : intégration au jeu (22 .glb mappés, teinte joueur, fusion par matériau ~3 draw calls/modèle, bench 60 FPS) — rapport `REPORT-FONDERIE-T3.md`.
- **06-07/09 — HABILLAGE externe** : mode sculpteur sur clay rejeté ; **mode peintre validé sur le knight Tripo** (corps opaque teintable, facteur cuit, teintes J4-J6) — rapports dans `fonderie/`.
