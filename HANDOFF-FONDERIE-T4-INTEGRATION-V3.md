# HANDOFF-FONDERIE-T4-INTEGRATION-V3 — Les 18 assets v3 en jeu, les anciens archivés

**Contexte** : le lot FONDERIE-LOT a livré **18 modèles `_v3.glb` validés par Erik** (mode peintre, conventions du corps teintable — voir `fonderie/REPORT-FONDERIE-LOT.md` : tableau des 18, tris, rotations, hauteurs 0,93→2,60). Erik demande : **utiliser uniquement les nouveaux assets en production**, et **archiver les anciens dans un répertoire dédié**.

## 1. Préalables

1. Lire `fonderie/REPORT-FONDERIE-LOT.md` (LA source : tableau des 18 modèles, décisions en suspens), `fonderie/REPORT-FONDERIE-HABILLAGE-TRIPO.md` (convention corps teintable), `STYLE-3D.md`, `PROJET.md`, `PILOT-HANDOFF.md` §3.
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19**, `git status` propre.
3. **Zéro changement gameplay** : `packages/rules` et serveur intouchés ; `schemaVersion` 19 inchangée. Le périmètre est rendu + données + le point de teinte ci-dessous (M2).

## 2. Mission

### M1 — Promotion des 18 `_v3.glb`
1. Copier les 18 `fonderie/modeles/*_v3.glb` vers **`assets-src/modeles/`** (source de vérité) + copie servie dans `apps/web/public/modeles/` (convention établie en T3).
2. **Archiver les anciens** : déplacer les `.glb` v1 remplacés de `assets-src/modeles/` vers **`assets-src/archives/modeles-v1/`** (nouveau répertoire dédié, avec un mini-README : date, raison — « remplacés par les _v3 du lot FONDERIE-LOT, validés par Erik le 07/09 »). Les fichiers archivés ne sont plus servis au jeu. Le gabarit paramétrique `guerrier`/`archer` du code reste en dernier repli pour les types SANS modèle, inchangé.

### M2 — Le point de teinte (le piège signalé au rapport knight)
Le fichier knight cuit une **compensation de luminance élevée** dans le matériau `accent_joueur` ; elle n'est visible que si le code de teinte du jeu **MULTIPLIE** la couleur joueur, au lieu de remplacer `material.color`. Vérifier `apps/web/src/lib/render3d/unitesglb.ts` (et le visualiseur fonderie qui a déjà le bon comportement) :
1. Corriger si besoin : teinte = multiplication sur la couleur de base ;
2. **Tests** : un modèle v3 (knight/guerrier_v3) teinté J1 vs J2 donne des couleurs distinctes ET la luminance de base est conservée (pas d'écrasement) ;
3. Vérifier à l'œil dans l'atelier/jeu que le corps ne repart pas sombre.

### M3 — Mapping data-driven (visuel3d.json §`structures.unites3d`)
1. Pointer les types sur les `_v3.glb` selon le tableau du rapport de lot (chaque modèle correspond à un type moteur ; `knight_v3` = le type que le visuel représente — le rapport le dit, sinon demander à Erik). Tout modèle sans type clair : **signaler, ne pas forcer**.
2. Mettre à jour les `echelle` par type : les hauteurs v3 vont de 0,93 à 2,60 — poser un défaut calé pour une apparence homogène (cible ~2,5-2,75 à l'écran), Erik ajustera à l'œil.
3. Les types non couverts par le lot gardent leur rendu actuel (v1 ou sprite) — régression impossible.

### M4 — Vérification
1. Suite complète verte + typecheck 4/4 ; tests du chargeur mis à jour (les .glb archivés ne doivent plus être référencés par le mapping).
2. **Bench 40×40** : 60 FPS, draw calls avant/après consignés.
3. Atelier : les fiches des 18 types montrent les v3 ; test catalogue vert.
4. Vraie partie (solo bot) : sélection, playback, teintes J1/J2 correctes sur les v3, fog — captures `dev-logs/captures-fonderie-t4/`.
5. Les `.glb` archivés ne sont plus servis (aucune requête vers eux en jeu).

## 3. Critères d'acceptation

- En jeu, les 18 types du lot affichent **uniquement les v3**, teinte joueur multiplicative correcte (corps lisible, néon constant), playback et sélection intacts.
- `assets-src/modeles/` ne contient plus que les v3 (+ tout modèle v1 NON remplacé et toujours mappé) ; les anciens sont dans `assets-src/archives/modeles-v1/`.
- `visuel3d.json` = la seule table de mapping ; activer/désactiver reste une ligne de JSON.
- Bench sans régression ; suite verte ; `schemaVersion` 19 ; zéro gameplay touché.

## 4. Périmètre interdit

- Modifier les `_v3.glb` validés (retouches → retour fonderie) ; le tranchage joueur→teinte au-delà de J1/J2/barbare existants (les J3-J6 attendent une décision d'Erik — ne pas les brancher sans demande).
- `packages/rules`, serveur, ordres, RELECTURE-3D, V3 renommage.
- Supprimer les v1 (ils sont ARCHIVÉS, pas détruits).

## 5. Fin de session

Rapport `REPORT-FONDERIE-T4.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md.
