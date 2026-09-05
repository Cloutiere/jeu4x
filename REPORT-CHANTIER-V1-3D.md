# REPORT CHANTIER V1 — Rendu du jeu en vraie 3D (L1a → L4)

**Date :** 04/09/2026 · **Statut :** ✅ **L1a, L1b, L2, L3, L4 livrés — en attente de l'acceptation visuelle d'Erik (session en ligne).**
**Préalables tenus :** baseline 796 tests verts, typecheck 4/4, `schemaVersion` 18 **inchangée** (chantier de rendu pur — aucune migration, aucun changement de `packages/rules`, même seed → même partie).
**Décision d'architecture (L0) :** Option B hybride validée par Erik — terrain Three.js + entités/surcouche PixiJS projetés par la caméra partagée. Rapport L0 : REPORT-CHANTIER-V1-3D-L0.md.

---

## 1. Ce qui a été livré, dans l'ordre du handoff

| Étape | Contenu | Commit |
|---|---|---|
| **L1a** | Labo `#/lab3d` synchronisé sur le calibrage commité du prototype (68f6f5a) | `78ac2b4` |
| **L1b** | Spec visuelle data-driven `visuel3d.json` + chargeur validé (`spec3d.ts`) | `77a4aef` |
| **L2** | Lueur des glyphes = rendement RÉEL (miroir exact de `tileYield`) | `977abb6` |
| **L3** | Rendu 3D dans le JEU, derrière flag de repli (défaut : 2D) | `a2321bf` + `e21f4bb`/suivants |
| **L4** | Tests, e2e, GUI vs bot, captures, CI, prod health, ce rapport | — |

### L1a — Synchronisation visuelle (miroir du calibrage d'Erik)
- Désert « sable délavé » `#8B8166/#4C4738` avec substrat **mat quasi non émissif** (`materiau` : emissive 0.12, roughness 0.95, metalness 0) ; les autres terrains gardent la « légère lueur » du prototype (0.45/0.6/0.12 — désormais réellement appliquée via `emissiveMap`, comme `tuiles3d.js`) ;
- Puce CPU à **cœur vert doux** `0x58C79A` (allumé 0.5, plus 0x9FFFE8/0.95), dimensions calibrées (socle 0.26, die 0.15, broches ±0.146) + jitter/rotation déterministes du prototype ;
- Quincunx écarté à **±0.30** ; parois teintées par terrain (`foncer(haut, 0.45)` — plus de parois blanches) ; respiration par famille (bus 1.0±0.22 @2.6, die 0.5±0.10 @2.2, ram 0.75±0.18 @2.9) ; textures substrat 512 px.
- Comparaison terrain par terrain faite contre la vitrine d'Erik (http://127.0.0.1:8391/) : désert, eau (2 RAM allumées, bus pâle sans Port), prairies, montagnes/quincunx conformes.

### L1b — Spec visuelle data-driven
- `apps/web/src/lib/render3d/visuel3d.json` : couleurs, élévations (clés symboliques), glyphes (famille/total/actifs), matériaux par terrain — **calibrables sans code**, miroir du `design.js` du prototype ;
- `spec3d.ts` = chargeur **validé** (erreurs explicites si couleur/élévation/glyphe corrompus), API exportée inchangée pour `world3d`/`optionA`/`optionB` ;
- Choix 🔶 posé : fichier co-localisé dans `render3d/` — `packages/rules` interdit par le handoff, contrat `assets-src` réservé aux PNG. **Aucun asset 3D nécessaire** (substrats peints à l'exécution) → pipeline `generate.py`/`sync-art` non requis ;
- `tests/visuel3d.test.ts` : couverture des 10 terrains moteur, calibrage 68f6f5a, cohérence glyphes/élévations.

### L2 — Terrain complet et rendement réel
- `TileDraw.lit` (booléen grossier du spike) remplacé par **`allume {bus, cpu, ram}`** : chaque famille s'allume selon la composante du rendement réel de la case, bornée au potentiel affiché (total = base + bonus de bâtiment — la spec visuelle correspond déjà exactement aux données moteur : plaine 3 bus = Grenier +2, montagne 5 CPU = Mine +4, désert 3 RAM = Comptoir +2, eau bus 1 = Port +1 nourriture) ;
- **`render3d/rendement.ts`** (partagé labo + jeu) : cases travaillées → `tileYield` complet (bâtiments R-66, bonus de civ R-146, ressources R-93, merveilles R-132) ; non travaillées → base + ressource identifiée (même règle que l'overlay 2D) ; obsolescence via `allKnownTechs` (R-128) ;
- L'eau reflète la vitrine **de façon générique** : la voie de bus (nourriture) ne s'allume qu'avec le Port, les 2 RAM (commerce de base) restent allumées ;
- Le bonus d'une ressource identifiée allume la famille correspondante. **Ressources = glyphes distincts : reporté V2** (option prévue par le handoff — le rendement réel est déjà représenté par la lueur) ;
- Fog 3 états, pings R-155, cratère (prisme stérile sans glyphes), culling caméra : déjà en place depuis le L0 — inchangés.

### L3 — Intégration au jeu (flag de repli, défaut 2D)
- `GameCanvas` gagne `mode3d` : terrain Three.js (`Stage3D` + `TerrainWorld`) sous le canvas PixiJS **superposé strictement** (`position:absolute/inset:0`) ; entités, surcouche et effets PixiJS **projetés chaque frame** par la caméra 3D partagée (`poser3d` + `projeterCalques3d`) ;
- Flèches d'ordres, chemins gelés, brouillon et annonces de replay : redessinés **in-place, point par point**, chaque point suivant l'élévation de SA case (pas de clip dans les collines) ;
- Pan/zoom/clamp → `Camera3D` ; clic/clic droit/tooltip → `pickHex3D` ; **les décisions restent les fonctions pures du jeu** (`clickAction`/`rightClickAction`) — interaction identique (alternance R-2, seuil pan 5 px, Échap, F) ;
- **Bouton « 3D »** dans la barre de la partie (persistant `localStorage`, **DÉFAUT DÉSACTIVÉ** — le rendu 2D accepté reste le repli jusqu'à l'acceptation d'Erik) ; bascule 2D ↔ 3D = remontage propre du rendu ;
- Hooks GUI étendus : `__game.pickAt` (picking réel 2D/3D), `__game.screenOf` projette en 3D.

### Deux bugs bloquants trouvés et corrigés au passage
1. **Carte noire au chargement du jeu (préexistant, rapport L0 §8.1)** : `createTextures` cuisait les 6 unités « illustres » **aliasées sur les mêmes `Graphics`** déjà détruits par `bake()` → crash `generateTexture` → `loadTextures` rejetait, plus aucun listener, carte noire. Corrigé par cuisson **unique avec cache** (les alias partagent la Texture). C'est la vraie cause racine du « bug d'environnement » documenté au L0 ;
2. **Bascule 2D ↔ 3D** : purge des caches de sprites détruits au teardown (sinon le remontage réutilise des conteneurs détruits → crash du ticker) et recentrage caméra au remontage (sinon caméra 2D à l'origine → carte noire en retour 2D).

## 2. Vérifications L4

- **Tests** : 826 verts (695 rules + 70 web dont 7 nouveaux `visuel3d` + 38 serveur + 23 e2e inclus) ; typecheck 4/4. Les tests d'interaction (`interaction.test.ts`, `hexView.test.ts`) passent **sans réécriture sémantique** — critère clé du handoff tenu ;
- **E2E conditions réelles** (wrangler dev 8787) : artefacts **vert** ; fortification T-17 **vert** (tir discriminant obtenu après relances — le script est conçu pour être relancé, tirages aléatoires) ;
- **GUI vs bot sur 5174** : partie réelle (VEUDFP, Espagne vs Zoulous) ouverte dans le navigateur, bascule 3D→2D→3D à chaud, sélection de la capitale **au clic réel** (picking 3D → `clickAction` → panneau ville réactif : pop 2, 2 citoyens assignés, rendements), anneaux de sélection + worked tiles + sprites art réel projetés. Captures 3D/2D de la même partie : `dev-logs/captures-v1-3d/L3-jeu-reel-3d-ville-selectionnee.png` et `L3-jeu-reel-2d-meme-partie.png` ;
- **Perf (bench labo 40×40, 180 frames, vsync)** : **60 FPS**, 0.3 ms CPU/frame (budget 16 ms), 33-41 draw calls, rebuild 1600 tuiles **4.1 ms avec `tileYield` par tuile** (5.7 ms au commit L2), picking 0.009-0.011 ms. La reprojection par frame des entités/surcouche ne dégrade pas le 60 FPS (coût L0 ~1 ms pendant un pan) ;
- **CI/CD** : push vers `main` → workflow Deploy (tests + typecheck + deploy wrangler si token) — statut à lire sur https://github.com/Cloutiere/jeu4x/actions après push ;
- **Prod health** : `GET https://game-4x-server-prod.erik-ai-studio.workers.dev/api/health` (vérifié après push — voir §5).

## 3. Décisions posées (et pourquoi)

1. **`visuel3d.json` dans `apps/web/src/lib/render3d/`** plutôt que `packages/rules/data/` (interdit par le handoff) ou `assets-src/` (contrat README : PNG seuls) ;
2. **Ressources en glyphes distincts → V2** : le langage bus/CPU/RAM est déjà dense ; le bonus ressource est visible par la lueur ; les 22 glyphes dédiés suivront la réflexion structures posées d'Erik (V2) ;
3. **Bloom éteint dans le jeu** (le 🔶 du L0 : 0.55/0.4/0.62 vs 0.9/0.5/0.52 reste posé) — en partie réelle, les entités doivent rester lisibles sans calibrage ; à allumer selon le jugement d'Erik ;
4. **Variante des substrats reportée L2/V2** : le prototype tire 2 variantes par terrain (détails positionnés différemment) ; le labo/jeu peint une variante unique — invisible au zoom jeu, à décider en V2 ;
5. **Rien dans RULES.md** : le « plaine 3 bus » y est déjà traité comme réalignement V2 (PILOT-HANDOFF §4 item 8).

## 4. 🔶 à calibrer par Erik (en ligne ou au prochain cadrage)

1. **Acceptation visuelle du rendu 3D en partie réelle** (bouton « 3D » de la barre) : teintes, élévations, glyphes, allumé/pâle — la vitrine fait foi pour les terrains ; le jeu ajoute entités/overlays par-dessus ;
2. **Bloom** : éteint par défaut dans le jeu — l'allumer (et à quelles valeurs 0.55/0.4/0.62 vs 0.9/0.5/0.52) ;
3. **Lisibilité des glyphes à 0.5×** : accepter les petites formes ou prévoir un LOD (L0 §9.5) ;
4. **Tilt fixe 58°** vs orbite (L0 §9.3) ;
5. **Seuil de dim du fog 3D** (`0x4e4e5c`) vs teinte 2D (`0x70707e`) — les entités 2D au-dessus du terrain 3D atténué restent claires 🔶 ;
6. **Pulses/respiration** : actuellement toujours actives en 3D (fréquences prototype) — à désactiver/calibrer ;
7. **Relecture (playback) en 3D** : les unités animées sont projetées, mais l'annonce/effets méritent une relecture visuelle d'Erik (jamais rejouée en automatisation).

**À vérifier en ligne avec le login d'Erik** : ouvrir une partie, basculer « 3D », jouer un tour complet (sélection unité/ville, chemin au clic droit, fin de tour, relecture), comparer 2D/3D, vérifier l'alternance R-2 et le tooltip de survol en 3D ; puis le labo `#/lab3d` (bench + commutateur d'architecture conservés).

## 5. État fin de session

- Baseline : **826 tests verts**, typecheck 4/4, `schemaVersion` 18, zéro changement gameplay (`packages/rules` et serveur non touchés) ;
- Commits : `78ac2b4` (L1a), `77a4aef` (L1b), `977abb6` (L2), `a2321bf` + fixes (L3, L4) — poussés sur `main` (CI deploy) ; prod health vérifiée après déploiement ;
- Le flag « 3D » est **désactivé par défaut** : la prod sert le rendu 2D accepté tant qu'Erik n'a pas tranché.

**Arrêt ici conformément au handoff (L4 — acceptation visuelle d'Erik obligatoire).** La main est rendue au pilot.
