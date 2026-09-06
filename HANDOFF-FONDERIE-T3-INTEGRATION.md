# HANDOFF-FONDERIE-T3-INTEGRATION — Brancher les modèles .glb de la fonderie dans le jeu

**Suite directe de FONDERIE-3D** (commit `e504381` : 22 modèles .glb dans `fonderie/modeles/`, visualiseur isolé, STYLE-3D respecté ~2 500 tris / 3 matériaux). Erik a demandé l'intégration au jeu le 06/09.

## 1. Préalables

1. Lire `PROJET.md`, `PILOT-HANDOFF.md` §3-§4, `STYLE-3D.md`, `fonderie/REPORT-FONDERIE-3D.md` (notamment §« Réglages de rendu à confirmer »), `HANDOFF.md` §4.
2. Baseline : tests verts, typecheck 4/4, `schemaVersion` **19**, `git status` vérifié.
3. **Zéro changement gameplay** : `packages/rules` et le serveur intouchés (à l'exception notable ci-dessous : AUCUN). Visual + data only. `schemaVersion` inchangée.
4. État : les 22 .glb sont **en attente de validation à l'œil par Erik** en fonderie — l'intégration est data-driven pour qu'Erik puisse activer/désactiver n'importe quel type par une ligne de JSON, sans code.

## 2. Mission

### M1 — Réconcilier les réglages de rendu (le point signalé par le rapport fonderie)
1. Comparer les réglages consignés dans `fonderie/viewer.js` (bloom UnrealBloomPass 0.9/0.6/0.25, ACESFilmic ×1.3, lumières 1.6/2.4/0.5) avec les VRAIES valeurs du jeu (`apps/web/src/lib/render3d/`).
2. **Aligner le visualiseur sur le jeu** (le jeu fait foi — c'est lui l'environnement final), consigner l'écart dans le rapport et prévenir Erik : si le look change en fonderie, c'est attendu et voulu.
3. Copier les valeurs réelles en commentaire dans `viewer.js` (la convention « copié, pas importé » du handoff fonderie reste valable — pas de dépendance de code).

### M2 — Promotion des assets validés
1. Créer `assets-src/modeles/` et y **copier** les .glb (source de vérité du jeu ; `fonderie/modeles/` reste l'atelier de fabrication — la copie est le seul point de contact, cf. PILOT-HANDOFF).
2. Les .glb sont versionnés (taille à vérifier : si le total dépasse ~15 Mo, signaler dans le rapport avant d'optimiser quoi que ce soit).

### M3 — Chargement GLTF dans le jeu (visuel only)
1. Intégrer `GLTFLoader` au pipeline de rendu 3D (`apps/web/src/lib/render3d/`) : chargement **une fois par modèle**, géométries/matériaux mis en cache et **partagés entre toutes les instances** (bench V1 : ne pas regresser les 60 FPS / draw calls).
2. **Teinte joueur** : le matériau `accent_joueur` des .glb est cloné par propriétaire (J1/J2/barbare — même sémantique que les variantes d'accent des sprites 2D) ; le néon #3DFFCE n'est JAMAIS teinté.
3. **Échelle** : les modèles font ~2,75 unités de haut — un facteur d'échelle par type, **data-driven**, calibrable sans code (défaut conservateur, Erik ajustera à l'œil).
4. Origine au sol, Y-up, face -Z : vérifier l'alignement avec le playback de déplacement existant (`AnimUnite`), la sélection, les barres PV et le picking (picking = inchangé, logique de tuile).
5. LINES et effets (arcs, traînées, projections au sol) embarqués dans les .glb doivent se rendre correctement en jeu — attention au fog (une unité hors vision est absente, miroir 2D, `unites3d.ts`).

### M4 — Mapping data-driven type moteur → .glb
1. Étendre `visuel3d.json` §`structures.unites3d` : au lieu d'un gabarit procédural, une entrée peut pointer un fichier (`"guerrier": { "glb": "guerrier.glb", "echelle": 1.0 }`). Un type SANS entrée garde son rendu actuel (gabarit procédural ou sprite billboard) — **régression impossible par construction**.
2. Établir le mapping exact des 22 .glb vers les **identifiants réels des types d'unités du moteur** (lire `packages/rules` — autorisé pour cette lecture) ; les noms de fichiers ne correspondent peut-être pas tous (ex. `glace.glb` vs l'id du type légion). **Tout .glb sans type moteur correspondant est signalé dans le rapport, pas forcé.**
3. Le catalogue de l'atelier (`#/atelier`) doit exposer les unités .glb comme les autres structures 3D (isolement, orbitale, bloom, A/B) — le test `atelier-catalogue.test.ts` reste vert.
4. Le gabarit paramétrique `guerrier` existant (décevant, quelques centaines de tris) est **remplacé** par le .glb ; les gabarits `archer` et autres types désormais couverts idem. Les types non couverts ne changent pas.

### M5 — Vérification
1. Tests : chargeur de mapping (entrée .glb invalide/fichier manquant = erreur claire, pas de fallback silencieux) ; suite complète verte ; typecheck 4/4.
2. e2e existants verts (bot-solo, artefacts) — aucune régression.
3. **Bench 40×40 re-joué** : 60 FPS cible avec les unités .glb en scène ; draw calls reportés (comparaison avant/après dans le rapport).
4. Captures en partie (2D et 3D) dans `dev-logs/captures-fonderie-t3/` — attention au piège rAF : captures, pas assertions de rendu.
5. L'atelier doit montrer le modèle .glb ET, si l'ancien gabarit est conservé pour un type non couvert, ne pas le casser.

## 3. Critères d'acceptation

- Les unités à modèle .glb s'affichent en jeu (2D et 3D) avec teinte joueur correcte, playback et sélection intacts ; les autres unités sont inchangées.
- Mapping 100 % data-driven : activer/désactiver un type = éditer `visuel3d.json`, sans code.
- Aucune régression de performances (bench avant/après consigné) ; `schemaVersion` 19 inchangée ; zéro fichier gameplay modifié.
- Réglages de rendu réconciliés (M1) et écart documenté ; visualiseur fonderie aligné.
- Suite complète verte + typecheck 4/4 ; atelier complet (test catalogue vert).

## 4. Périmètre interdit

- `packages/rules`, serveur, ordres, gameplay : intouchés. Toute découverte en needing un changement → 🔶 dans le rapport, pas de improvisation.
- Animations/skeletal des modèles (le jeu joue le déplacement en translation, comme aujourd'hui).
- Nouveaux modèles (fabrication = session fonderie), retouches de .glb existants (retour fonderie).
- V3 renommage, RELECTURE-3D, UNITES-3D (le chantier paramétrique est absorbé/supplanté par cette intégration — le pilot mettra la file à jour).

## 5. Fin de session

Rapport `REPORT-FONDERIE-T3.md`, **commit/push uniquement sur la demande explicite d'Erik**, arrêt, remise de la main. Ne pas archiver le handoff ni éditer PROJET.md/PILOT-HANDOFF.md (le pilot s'en charge après vérification).
