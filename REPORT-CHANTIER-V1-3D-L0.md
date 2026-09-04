# REPORT CHANTIER V1 — L0 : spike d'architecture « rendu en vraie 3D » (rapport d'arrêt)

**Date :** 04/09/2026 · **Statut :** ⛔ **ARRÊT-POUR-APPROBATION (modèle 7b) — aucune écriture RULES.md/DESIGN.md, aucune migration du rendu existant.**
**Préalable du handoff vérifié :** baseline `pnpm test` **796 verts** (695 rules + 63 web + 38 serveur), typecheck 4/4 — revalidés **après** le spike, zéro régression. `schemaVersion` 18 inchangé (aucune migration — chantier de rendu pur).

---

## 1. Ce qui a été construit (et où le voir)

Un **banc d'essai in-situ** sur le vrai jeu, routé **`#/lab3d`** (client-side pur, comme `#/progen` — aucune partie, aucun serveur, aucun ordre soumis). Il charge **les vraies données du jeu** :

1. carte procédurale réelle 40×40 (`generateProceduralMap`, seed 20260904) ;
2. état initial réel (`createInitialState`) puis **un tour réellement résolu par le moteur** (`resolveTurn` — fondation de la capitale p1 par le Colon, R-64) → une **ville** (capitale, pop 2, 2 citoyens auto-assignés) et une **unité** (Guerrier p1 en (29,7)) ;
3. état **filtré réel** (`getFilteredState(state, 'p1')`) → le **fog 3 états** vient du moteur, rien n'est inventé côté rendu (inexploré = absent, miroir de GameCanvas §4.4) ;
4. tranche ~10×10 autour de la capitale (mode par défaut) + mode **« Carte 40×40 »** pour la mesure de performance (terrain complet de la vraie carte en exploration synthétique — pire cas d'instanciation).

Les **deux architectures candidates** rendent les **mêmes données** (type `Scene3DData`) — preuve d'indépendance renderer. Un commutateur A/B est dans le panneau, les mesures sont affichées en direct. Le rendu 2D actuel (GameCanvas) n'a **pas été touché** — le flag de repli prévu en L3 est donc trivialement satisfait pendant tout le chantier.

**Code nouveau** (`apps/web/src/lib/render3d/`, ~1 800 lignes) :
| Module | Rôle |
|---|---|
| `spec3d.ts` | **Portage de la spec visuelle d'Erik** (prototype `design.js`) sur les ids moteur réels (`eau`≠`mer`…) : teintes par terrain, élévations sémantiques (eau −1, base 0, colline +1, montagne +2), glyphes bus/CPU/RAM une seule couleur néon `#3DFFCE`, peintre de substrat. Déjà **data-driven**, prête à servir de base à L1 |
| `camera3d.ts` | Caméra 3D partagée : pan/zoom ancré curseur, tilt fixe 58°, bornes de zoom **calées sur les zooms 2D** (0.5×→2.25×), clamp bornes carte, projection monde→écran (pour B) |
| `world3d.ts` | Constructeur de terrain Three.js **partagé par les deux options** : prismes instanciés par terrain + glyphes instanciés (bus/CPU/RAM, couples allumé/pâle), pulses des voies, fog par instance (`instanceColor`), picking analytique partagé |
| `stage3d.ts` | Scène commune (renderer, lumières, bloom optionnel, comptage par frame) |
| `optionA.ts` | **Option A — Three.js seul** : ville = structure « Noyau Serveur » en volumes, unité = jeton hexagonal 3D teinté joueur, surcouche 3D (anneau sélection, cases travaillées, chemin, ping artefact) |
| `optionB.ts` | **Option B — hybride** : le même terrain 3D + **sprites PixiJS du jeu actuel** (`loadTextures`) projetés chaque frame par la caméra 3D partagée ; surcouche 2D identique au jeu (Graphics) |

**Page** : `apps/web/src/pages/Lab3d.svelte` + route `#/lab3d` dans `App.svelte` (hors garde de session — client-side pur). Interaction **réutilisée telle quelle** : `clickAction`/`rightClickAction` (fonctions pures de `interaction.ts`) décident, le labo n'applique que sélection/affichage.

**Captures** : `dev-logs/captures-v1-3d/` (7 captures A/B × tranche/zoom/carte entière) + `analyse-captures.mjs` (vérification programmatique des captures — voir §5).

## 2. Méthode de mesure

- Bench intégré (« Mesurer la carte entière ») : warmup 30 frames puis 180 frames mesurées (draw calls & triangles lus depuis `renderer.info` — comptage par frame avec le composer multi-passe), rebuild des instances chronométré, **1000 picks** chronométrés.
- FPS : plafonné par la vsync à 60 en desktop dans tous les cas — l'indicateur de marge est le **temps CPU par frame** (`cpuFrameMs`).
- Objectifs du handoff : FPS ≥ 60 ✓, picking sans régression ✓ (§3), fog ✓ (§4), lisibilité glyphes ✓ (§5), comptage objets & instancing (§6).

## 3. Picking & interaction (le cœur) — validés dans le navigateur réel

Séquence jouée à la souris via automation, sur les deux options (le picking est partagé) :

| Action | Résultat observé |
|---|---|
| Clic sur la capitale (centre écran) | `selectCity c1` (alternance R-2 conservée : re-clic = désélection) |
| Clic sur le Guerrier | `selectUnit u2 (ami)` |
| Clic droit sur une case praticable voisine | `moveDraft` chemin 1 étape (brouillon affiché, non soumis — labo) |
| Clic droit sur case non praticable | `cancelDraft` (les fonctions pures refusent — comportement jeu) |
| Glisser (seuil 5 px) | pan caméra, clamp aux bornes ✓ |
| Molette | zoom ancré sur le curseur, bornes 0.5×→2.25× ✓ |
| Picking 3 points écran éloignés | 3 hex distincts corrects (30,7 / 32,5 / 25,12) |

**Point clé pour les tests d'interaction existants** : `interaction.test.ts`, `hexView.test.ts` etc. testent des fonctions **pures** qui n'ont pas été modifiées — le picking 3D produit une `Hex`, la décision reste `clickAction(view, ui, hex)`. **Aucune réécriture sémantique nécessaire** (critère clé du handoff). Coût du picking mesuré : **2–6 µs** par clic (analytique, indépendant du nombre de tuiles).

## 4. Fog 3 états en 3D

- **Inexploré** : la tuile n'est pas construite (absente du `TileDraw[]` — même contrat que le 2D). Le bord du brouillard est visible sur les captures de tranche.
- **Exploré-masqué** : tuile construite mais atténuée par teinte d'instance (`0x4e4e5c`, miroir du tint 2D `0x70707e`) ; glyphes tous **pâles** (le néon = rendement actif, lisible uniquement sur les cases visibles).
- **Visible** : rendu complet, glyphes selon l'état allumé/pâle (cases travaillées + case de ville « allumées » — miroir R-60 ; le miroir exact `tileYield`/R-93 reste un livrable L2).
- Pings artefact (R-155) : lueur au survol d'une case à ping, identité cachée — implémentée dans les deux options (surcouche).

## 5. Lisibilité des glyphes aux niveaux de zoom

Captures 0.5× / 1× / 2.25× (`A-tranche-zoom050/zoom1/zoom225`, `B-tranche-zoom225`) : les trois familles (bus traversants, microprocesseurs à broches, barrettes RAM) restent identifiables grâce à la **forme** + le néon unique, y compris à 0.5× où les formes deviennent petites (les pulses aident à repérer les voies allumées). À 2.25×, lecture très confortable. Le zoom 2D 0.5× correspondant donne une case d'environ 56 px comme dans le jeu actuel.

⚠️ **Découverte de calibrage** : le bloom du prototype (0.9/0.5/0.52, réglé sur 37 tuiles) **noie les petites entités** sous la lueur des bus néon dès qu'une carte est dense (mesuré : 0 pixel rouge détectable autour de la capitale). Recalibré à **0.55/0.4/0.62** : accent de ville, jeton d'unité et anneau de sélection redeviennent nets tout en gardant la lueur néon. 🔶 à valider par Erik (voir §9).

## 6. Performance 40×40 (mesures finales, desktop, vsync 60)

Terrain **identique partagé** par A et B (même `world3d`) :

| Mesure | Option A (Three.js seul) | Option B (hybride) |
|---|---|---|
| FPS moyen (180 frames, vsync) | **60** | **60** |
| Temps CPU par frame (min) | **0,2 ms** (bloom) / 0,1 ms (sans) | **0,2 ms** (bloom) |
| Draw calls Three.js | **41** (bloom) / 27 (sans) | **33** (bloom) — + le contexte PixiJS séparé |
| Triangles | ~135 000 | ~135 000 |
| Rebuild des 1600 tuiles (fog/état) | **2,8 ms** | 2,8–4,1 ms |
| Picking (moy. 1000) | 6 µs | 2 µs |
| Coût projection B (pan, ~30 entités) | — | **~1,1 ms/frame** |
| Contextes WebGL | 1 | 2 (canvas Pixi superposé, `pointer-events:none`) |

**Comptage d'objets / instancing** : l'approche naïve du prototype (1 `Mesh` par objet, comme `tuiles3d.js`) donnerait **12 304 draw calls** pour 40×40 (1600 tops + 1600 côtés + 9104 glyphes) — hors budget. L'instanciation par (partie × état allumé/pâle) réduit la scène à **18-19 pools instanciés** (≈ 27-41 draw calls réels, bloom compris). L'objectif ≥ 60 FPS desktop est tenu avec une marge énorme (0,1–0,2 ms CPU/frame vs 16 ms de budget).

## 7. Coût de maintenance & risques (comparatif)

| Critère | Option A — Three.js seul | Option B — hybride |
|---|---|---|
| Terrain | identique (world3d partagé) | identique |
| Entités | **tout réécrire en 3D ou billboards** : sprites `/art/` (textures.ts → CanvasTexture), PV, badges (fortification, cargo, espion), villages/huttes/artefacts, playback d'animation, flèches/chemins, worked tiles, overlay rendements… soit ~1 400 lignes de GameCanvas + textures.ts à porter, puis maintenir en double langage | **réutilisation directe** : sprites et surcouche 2D existants (tests GUI, art, teintes joueur), une seule projection à maintenir (`camera3d.project`) |
| Interaction | picking partagé ; surcouche 3D à recalibrer (anneaux, chemins en volume) | picking partagé ; surcouche = celle du jeu, comportement identique prouvé |
| Qualité visuelle des entités | volumes simples ≈ placeholders (l'art 2D existant est abandonné ou re-plaqué en billboards — c'est alors B « en pire ») | **l'art et le style du jeu actuel s'affichent dès L1** |
| Occlusion | correcte en 3D (profondeur) | défaut : un sprite est toujours au-dessus du terrain (une montagne ne cache pas l'unité derrière). Mitigé par le tilt fixe 58° + entités sur cases connues ; jamais gênant sur les captures |
| Risques tests | recouvrement GameCanvas → très gros diff, tests GUI à reprendre | GameCanvas intact (repli 2D trivial), diff confiné à un nouveau module |
| Contextes GPU | 1 | 2 (coût mémoire d'un contexte supplémentaire — mesuré négligeable ici) |

## 8. Découvertes annexes (hors périmètre, à consigner)

0. **Calibrage prototype en cours (non committé, non touché par cette session)** : le répertoire de travail contient des retouches du prototype et du doc d'Erik (désert « sable délavé » `#8B8166`, microprocesseur « cœur vert doux », matière désert quasi non émissive, captures de vitrine retirées). **`spec3d.ts` reste aligné sur l'état committé** — au L1, la spec data-driven sera synchronisée avec la version validée par Erik (une valeur `materiau` par terrain est prévue par ce calibrage).
1. **Bug préexistant (environnement)** : dans le Chromium de test de cette session, `renderer.generateTexture` de PixiJS échoue (`_getLocalBounds` null) — visible aussi sur `#/progen` (l'art réel `/art/*.png` existe, mais `loadTextures` cuit les placeholders **inconditionnellement**). Le jeu accepté tourne sur la machine d'Erik — probablement spécifique à ce navigateur d'automatisation. **Option B a un repli** (textures canvas minimales) et n'a pas été bloquée. Suggestion L2 : ne cuire les placeholders qu'à la demande.
2. **Warning esbuild préexistant** : `labels.ts` contient un `case` dupliqué (branche morte signalée au build) — nettoyage mineur à faire un jour.
3. **Écart documenté connu** : la spec visuelle affiche la plaine à **3 bus** (décision Erik du 04/09, Grenier +2) quand RULES.md §2 dit encore Grenier +1 (=2) — réalignement RULES déjà planifié au chantier V2 (PILOT-HANDOFF §4).
4. **Aucune migration `schemaVersion`** : le spike ne touche ni `packages/rules` ni le serveur.

## 9. 🔶 à calibrer par Erik (en ligne ou au prochain cadrage)

1. **Bloom** : 0.55/0.4/0.62 (calibrage spike, entités lisibles) vs 0.9/0.5/0.52 (prototype vitrine, plus « néon ») ;
2. **Élévations** : −0.40 / 0 / +0.30 / +0.62 — lisibilité du relief au zoom loin ;
3. **Tilt caméra fixe 58°** (choix spike pour préserver pan/zoom 2D) vs orbite libre (prototype) ;
4. **Seuil de dim du fog** 3D (`0x4e4e5c`) vs teinte 2D (`0x70707e`) ;
5. **Lisibilité des glyphes à 0.5×** : accepter les petites formes ou prévoir un LOD/étiquettes (L2) ;
6. **Pulses & respiration néon** : fréquence/intensité (désactivables — coût mesuré faible).

**À vérifier en ligne avec le login d'Erik** : ouvrir `#/lab3d` en prod (client-side pur, fonctionne sans session), commuter A/B, jouer pan/zoom/clic (sélection ville + unité), comparer le fog 3D au fog 2D du vrai jeu, puis **trancher l'architecture** (recommandation §10). Aucun déploiement n'a été fait dans cette session — le banc est en local (`pnpm dev:web`, route `#/lab3d`).

## 10. Recommandation argumentée : **Option B — couche hybride**

1. **Le critère décisif du handoff — l'interaction sans régression — n'est garanti à 100 % que par B** : la décision de clic, l'art des entités, la surcouche (chemins, worked tiles, PV, badges) et le playback restent **exactement ceux du jeu accepté** ; le diff est confiné à un nouveau module + une route de labo.
2. **La performance n'est PAS un différenciateur** : les deux options tiennent 60 FPS avec la même marge (0,1–0,2 ms CPU/frame) car le terrain instancié est partagé. Le seul surcoût mesuré de B (~1,1 ms de projection pendant un pan, 2ᵉ contexte GPU) est négligeable devant le coût de réécriture de A.
3. **A « en pire »** : avec des volumes simples, les entités 3D sont des placeholders qui perdent l'art existant ; avec des billboards, A redevient B (sprites projetés) mais en dupliquant le pipeline Pixi→Three. La qualité d'occlusion de A (profondeur réelle) est réelle mais marginale au tilt 58°.
4. **Trajectoire préservée** : le terrain `world3d` est déjà le code de la L1/L2 — si Erik veut ensuite des structures 3D posées (V2), chaque calque peut basculer de l'overlay Pixi vers la scène 3D **calque par calque**, sans nouvel arrêt d'architecture.

**Plan proposé après approbation** : L1 (spéc data-driven `assets-src`/`visuel.json` à partir de `spec3d.ts`) → L2 (terrain complet 40×40 + rendement réel via `tileYield` + cratère) → L3 (intégration GameCanvas derrière flag `#/debug`/setting, overlays complets) → L4 (vérification : tests interaction verts sans réécriture, e2e, GUI vs bot 5174, captures, CI, prod health, acceptation visuelle d'Erik).

---

**Arrêt ici conformément au handoff (L0).** La main est rendue au pilot pour la présentation à Erik ; aucune étape L1-L4 n'est entamée.
