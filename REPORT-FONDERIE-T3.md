# REPORT-FONDERIE-T3 — Intégration des 22 .glb au jeu (06/09/2026)

Mission exécutée d'après `HANDOFF-FONDERIE-T3-INTEGRATION.md`. **Aucun commit** (demande explicite d'Erik requise). `schemaVersion` **19 inchangée**, `packages/rules` et serveur **intouchés** (vérifié au `git status` : seuls render3d, atelier, tests et `fonderie/viewer.js` modifiés).

## M1 — Réglages de rendu réconciliés (le point signalé par le rapport fonderie)

Vraies valeurs du jeu relevées dans `apps/web/src/lib/render3d/stage3d.ts` et **copiées (pas importées)** dans `fonderie/viewer.js` (en-tête + valeurs appliquées) :

| Réglage | Fonderie T1 (consigné, à confirmer) | **Jeu (fait foi)** | Appliqué au viewer |
|---|---|---|---|
| Bloom (UnrealBloomPass) | 0.9 / 0.6 / 0.25 (puis 0.45/0.35/1.0 en pratique) | **0.55 / 0.4 / 0.62**, ÉTEINT par défaut (bascule en partie, décision Erik 4.1) | oui (activé dans l'atelier comme avant) |
| Tone mapping | ACESFilmic ×1.3 | **AUCUN** (NoToneMapping, exposition 1.0) | oui — ⚠️ le look fonderie change (plus pâle, moins contrasté) : **attendu et voulu** |
| Éclairage | hémisphère 1.1 + clé 1.5 + contre 0.4 | Hemisphere(0x2c4a5a, 0x0a1420, **0.95**) + Directional(0xe8fff6, **0.85**, pos −5,9,3) + PointLight néon(**0.45**, portée 18, decay 2, pos 0,4,0) | oui |
| Fond | 0x0a1218 | **0x070b18** | oui |

**Prévenir Erik** : les modèles validés en fonderie sous ACESFilmic ×1.3 paraîtront différents dans le visualiseur (et le look fonderie = désormais le look jeu). C'est le réalignement demandé.

## M2 — Promotion des assets

- `assets-src/modeles/` créé : les **22 .glb copiés** (source de vérité du jeu ; `fonderie/modeles/` reste l'atelier de fabrication — la copie est le seul point de contact).
- Copie servie au jeu : `apps/web/public/modeles/` (miroir de la convention `assets-src/exports` → `public/art`).
- **Taille totale : 6,8 Mo** (< seuil ~15 Mo du handoff) — **aucune optimisation faite**, rien à signaler. En prod Cloudflare Pages, ~230 ko/fichier, chargés une fois par fichier au premier besoin.

## M3 — Chargement GLTF dans le jeu

Nouveau module `apps/web/src/lib/render3d/unitesglb.ts` :

- **`ChargeurModelesGLB`** : GLTFLoader (`three/examples/jsm`), **une requête et une parse par fichier** (cache de promesses), préchargés au montage du monde 3D. Erreur **explicite** si un fichier manque ou est invalide (message avec nom de fichier) — pas de fallback silencieux.
- **`parserModeleGLB`** : les primitives TRIANGLES du .glb sont **fusionnées par matériau** au chargement. Point important mesuré en cours de session : les .glb de la fonderie portent ~60 primitives pour 3 matériaux (l'exporteur cuisait une primitive par pièce) ; une première version « 1 pool par primitive » donnait **125 pools pour 2 unités** — corrigé : **~3 parties par modèle** (corps translucide, néon, accent), **6 pools + 2 clones de lignes pour 2 unités** (vs 4 draw calls pour l'ancienne armée instanciée ; le coût ne croît qu'avec types × owners + 1 clone de lignes par unité visible).
- **Teinte joueur** : le matériau `accent_joueur` est **cloné par propriétaire** (couleur = `couleurDe(owner)`, J1/J2/barbare — même sémantique que les accents des sprites 2D) ; le néon #3DFFCE est un autre matériau du .glb, **jamais touché**. L'instanceColor ne porte que l'atténuation de fog.
- **Échelle data-driven par type** (`visuel3d.json`, défaut conservateur 1.0 — modèles ~2,74 unités de haut vérifiés par parse des accessors ; l'ancien gabarit accepté par Erik était ≈ 2,6 équivalents) : Erik calibre à l'œil en éditant le JSON.
- **Playback/sélection/barres PV/picking** : identiques — les entrées passent par le même assembleur `unites3d.ts` (état FILTRÉ, R-117 embarquées non rendues, fog 3 états, interpolation position + élévation), le picking reste la logique de tuile. **Vérifié en jeu** : sélection du Guerrier au clic, ordre de déplacement, tour résolu, journal « u2 se déplace vers (5,7) ».
- **LINES** (arcs, traînées, projections au sol) : fusionnées par modèle, rendues par clone par unité avec atténuation de fog. Unité hors vision = absente (miroir 2D, inchangé).

## M4 — Mapping data-driven

- `visuel3d.json` §`structures.unites3d` : une entrée est soit `"guerrier" | "archer"` (gabarit procédural atelier — **toujours supporté**, rendu inchangé), soit **`{ "glb": "fichier.glb", "echelle": 1.0 }`**. Un type SANS entrée garde son sprite billboard : **régression impossible par construction**. Activer/désactiver un type = une ligne de JSON, sans code.
- **Mapping complet des 22 .glb** → ids réels du moteur (`packages/rules/src/data/units.json`, lecture seule autorisée) : `glace.glb`→`legion`, `veloce.glb`→`cavalier`, `fusiller.glb`→`fusilier`, `char.glb`→`char_d_assaut`, `infanterie.glb`→`infanterie_moderne`, `gallion.glb`→`galion`, `sousmarin.glb`→`sous_marin`, les 15 autres à nom identique. **Aucun .glb orphelin** (testé). Les types à .glb remplacent les deux gabarits procéduraux (`guerrier`, `archer`) qui restent disponibles dans le code + atelier.
- **Types sans modèle (inchangés, sprite 2D)** : caravane, milice, GP (artiste/savant/explorateur/bâtisseur/humanitaire/leader) et les 24 uniques de civ + renforts d'ère (trebuchet, obusier, etc.). 🔶 à arbitrer par Erik : les uniques pourraient réutiliser le .glb du type de base (ex. `guerrier_jaguar` → `guerrier.glb`) — pas forcé, une ligne de JSON chacun le moment venu.
- **Atelier** (`#/atelier`) : les 22 .glb sont exposés dans « Structures 3D » (33 = 11 + 22), id copiable `uniteglb:<fichier>`, isolement sur tuile prairie avec orbite/bloom/A-B (cadrage caméra reculé pour les unités ~2,7 unités) ; le gabarit procédural `structures:uniteGuerrier` reste isolable (non cassé). `atelier-catalogue.test.ts` vert et étendu (22 fichiers servis présents).

## M5 — Vérification

- **Tests : 974 verts** (rules 746, server 70 — inchangés, zéro gameplay ; web 145→152 : nouveaux tests mapping/fichiers/validation/calque .glb). **Typecheck 4/4.**
- **Chargeur de mapping** : entrée invalide (gabarit inconnu, nom de fichier, échelle hors bornes) = erreur explicite (`parseEntreeUnite3D`, testé) ; fichier manquant = erreur du chargeur + `stats.manquants` exposé (testé, jamais de rendu muet).
- **Bench 40×40 re-joué** (`#/lab3d`, « Mesurer la carte entière », seed 20260904) :

| Mesure | Bloom ON | Bloom OFF | Référence L4 (terrain seul) |
|---|---|---|---|
| FPS moyen (180 frames) | **60** | **60** | 60 |
| CPU/frame (min) | 1,7 ms | 1,7 ms | 0,3 ms |
| Draw calls | 197 | 183 | 33-41 |
| Triangles | 161 928 | 161 914 | — |
| Rebuild 40×40 | 3,5 ms | 3,5 ms | 4,1 ms |

  Le bench carte entière ne contient pas d'unités (miroir du protocole L4) — le calque .glb y ajoute **0 draw call**. L'écart 33-41 → 183/197 est **antérieur à cette session** (structures V2 + passes bloom, par pool de cartes-ressources). En partie avec unités .glb : **60 FPS**, 2 unités = **8 draw calls .glb** (6 pools + 2 lignes), `0 manquants`. Gros plan dans le rapport : en fin de partie (~30 unités visibles), attendre ≈ 35-40 draw calls .glb additionnels — marge confortable.
- **Captures** dans `dev-logs/captures-fonderie-t3/` : bench 40×40, référence fonderie, atelier (isolement guerrier .glb), partie 2D, partie 3D (unités .glb en scène), sélection, ordre + tour résolu. ⚠️ Piège rAF respecté : captures d'écran, aucune assertion de rendu.
- **e2e existants** : suite serveur verte (70, dont bot-solo/artefacts/fortification inchangés) ; vérification GUI sur vraie partie solo (lobby → bot → 3D) faite en direct (captures ci-dessus).

## 🔶 Ouverts (à arbitrer par Erik, rien d'bloquant)

1. **Uniques de civ / GP sans .glb** : réutiliser le .glb du type de base ? (JSON uniquement, décision à l'œil).
2. **Échelles par type** : défaut 1.0 partout — calibrage à l'œil attendu (édition `visuel3d.json` + push).
3. **Orientation** : les modèles font face −Z (convention STYLE-3D) ; si Erik préfère les voir de face caméra (comme les huttes +Z), c'est un `lacet` data-driven à ajouter.
4. **Draw calls des structures V2** (183 sur 40×40, antérieur à la session) : piste de fusion par matériau comme ci-dessus, chantier séparé si Erik le souhaite.
5. Le visualiseur fonderie change de look (tone mapping réaligné) — les prochaines validations à l'œil se feront sous le look réel du jeu.

## Fichiers modifiés

- `apps/web/src/lib/render3d/unitesglb.ts` (nouveau), `unites3d.ts`, `spec3d.ts`, `visuel3d.json`
- `apps/web/src/lib/render/GameCanvas.svelte`, `apps/web/src/pages/Lab3d.svelte`, `apps/web/src/pages/Atelier.svelte`, `apps/web/src/lib/atelier/catalogue.ts`
- `apps/web/tests/unites3d.test.ts`, `apps/web/tests/atelier-catalogue.test.ts`
- `fonderie/viewer.js` (réglages M1)
- Nouveaux répertoires : `assets-src/modeles/` (22 .glb), `apps/web/public/modeles/` (copie servie)
- **Non touchés (vérifié)** : `packages/rules`, serveur, RULES/DESIGN/PROJET/PILOT-HANDOFF. Non committés non plus : `image_ref/plaine.jpg`, `prairie.jpg`, `prairie.txt` (apportés par Erik hors session — non inclus).

## Fin de session

Arrêt. **Commit/push sur demande explicite d'Erik uniquement.** Handoff non archivé, PROJET.md/PILOT-HANDOFF.md non édités (pilot).
