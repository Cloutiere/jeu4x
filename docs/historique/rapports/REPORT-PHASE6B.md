# RAPPORT PHASE 6b — Génération procédurale des cartes

*Session du 02/09/2026 · commit `9d31cdf` · base documentaire : [`Génération Procédurale Cartes Civilization.pdf`](Génération%20Procédurale%20Cartes%20Civilization.pdf) (Erik, 02/09)*

## 1. Livrables (tous les L0→L5 du handoff)

### L0 — Couche géophysique (`packages/rules/src/progen/geo.ts`)
Bruit Perlin fBm seedé (implémentation maison, `noise.ts`) → altitude 0..100 ; lignes de rift abaissant l'altitude **avant** seuillage ; **ratio terre calé au percentile** (cible 🔶 55 % — exact, pas borné approximativement) ; climat latitudinal (bande équatoriale sèche → désert, températures humides → prairie/forêt, gradient temp × altitude) ; montagnes/collines/forêts par masques de bruit secondaires. La couche **ne connaît rien du miroir** : elle génère une grille complète de la dimension demandée.

### L1 — Équilibrage miroir 1v1 (`mirror.ts`)
Demi-carte 40×20 → contenu → meilleur site de capitale (fertilité 3 anneaux pondérés 🔶 [1.0, 0.6, 0.3], food×2 + prod×1.5 + commerce×1, pénalité montagne 🔶, ressources incluses) → **normalisation** PDF §NormalizeStartLocation (injection bétail/blé anneaux 1-2 jusqu'au seuil = moyenne des 5 meilleurs × 0.8 🔶) → **rotation 180°** → carte complète. Contraintes de site : praticable, ≥ 6 des bords, ≥ T-09 de l'axe, distance au site image ≥ 12, ≥ 1 voisin libre pour le Guerrier. **Checksum d'équité consigné** : fertilité P1/P2 (delta = 0 par miroir) + score vs seuil → `meta.progen` → dump admin (`#/debug/<code>`).

### L2 — Contenu procédural (`content.ts`)
Ressources tirées des **`spawnWeights` de `resources.json`** (champ réservé 7c, rempli 🔶) par terrain, densité cible 🔶 ~1/12 cases de terre (marines ~1/48) ; villages (3/demi, ≥ 6 des **deux** spawns — leçon calibrage 7d) et huttes (2/demi, ≥ 3 🔶) posés **avant** le miroir puis reflétés ; retrait des ressources sous les capitales ; **toutes les validations `parseMap` passent** (le générateur appelle la validation elle-même).

### L3 — Intégration serveur
`MapId` étendu de `'procedural-40'` (+ `playerCount?` dans `GameCreationSettings`, propagé lobby → GameDO → meta) ; whitelist `lobby.ts` ; `GameDO.handleJoin` génère la carte via `generateProceduralMap(meta.seed)` **au lieu de** `loadBuiltinMap` ; le **réveil à froid** (`ensureLoaded`) régénère la carte depuis `meta.seed` — partie procédurale rejouable par conception ; dump admin : section « génération procédurale » dans la page debug.

### L4 — Labo de calibration `#/progen` (`apps/web/src/pages/Progen.svelte`)
Génération **client-side** (le générateur est pur — aucune partie, aucune connexion ; accessible **sans session**) : seed saisissable + « seed aléatoire » ; **tous les réglages 🔶 en curseurs** (ratio terre, continents, rifts, montagnes, collines, forêts, humidité, densité ressources, villages, huttes, distance de spawn, distance villages) avec **régénération à la volée** ; rendu **sans fog** via le `GameCanvas` du jeu sur un état synthétique tout-visible (terrains, ressources, villages/huttes, capitales, guerriers) ; calques de calibrage : **heatmap de fertilité** (nouvelle prop optionnelle de `GameCanvas` — absente du jeu réel), rendements N/P/C, masquage des entités ; **checksum d'équité** affiché (P1, P2, Δ, seuil, normalisée, ratio terre, connexité, tentatives, comptes) ; **export JSON** du `MapData` (téléchargement + copie presse-papiers).

### L5 — Vérification & livraison
- **fast-check 60 seeds** (`progen-properties.test.ts`) : carte valide (parseMap), spawns symétriques (l'un est l'image exacte de l'autre), connexion terrestre (BFS), delta de fertilité = 0, score ≥ seuil, villages/huttes/ressources posés, reflétés, uniques, à distance réglementaire.
- **17 tests unitaires** `progen.test.ts` : déterminisme bit à bit (R-100), ratio terre borné, symétrie, comptes, densité `resourceDensity`, contraintes de bord, normalisation unitaire, `continents=2` à isthme, `playerCount ≠ 2` rejeté (R-106).
- **2 tests DO** (`procedural.test.ts`) : createGame procedural-40 → join → dump admin complet et symétrique ; le rapport re-généré depuis `meta.seed` est identique.
- **e2e réel** : partie `TYPJAC` créée dans le navigateur sur carte aléatoire, adversaire bot, **15 tours joués** : exploration vers un village barbare, citoyens assignés, **pop 1 → 5**, or 15, **2 combats** (`Attack → CombatExchange → Retreat`, barbare touché), 12 barbares spawnés des 6 villages, huttes/ressources visibles.
- Captures dans `docs/` : `progen-seed20260902.png`, `progen-seed42.png`, `progen-seed987654321.png` (labo, heatmap + rendements) et `progen-partie-TYPJAC-tour13.png` (partie réelle, tour 13).
- **Déploiement prod via CI** : commit `9d31cdf` poussé sur `main` → pipeline (install/build/test/typecheck/wrangler) → vérifié en ligne : `/api/health` 200 et le bundle déployé contient l'option « Carte aléatoire (seed de partie) » + `procedural-40`.

## 2. Suites & critères d'acceptation

**407 tests verts** (328 moteur dont 18 progen, 50 web, 29 serveur dont 2 procedural), typecheck propre, build propre. Critères du handoff : ✅ générateur pur/déterministe/sans IO (R-80) ; ✅ 60 seeds : zéro carte invalide, équité parfaite, connexité garantie ; ✅ format `MapData` inchangé, loader/admin/migrations réutilisés tels quels ; ✅ partie « Carte aléatoire » créée et jouée 15 tours de bout en bout + labo complet (curseurs → régénération → rendu sans fog → export) ; ✅ `StartPlacementStrategy` en place (2-5 joueurs = stratégie `regionalMulti` seule, guide dans le README du module) ; ✅ suites vertes, typecheck, déployé prod.

## 3. Ambiguïtés & interprétations (à lire)

1. **« Miroir géométrique » = rotation 180°** (comme la symétrie de variée-40 : `rows[r][c] === rows[39-r][39-c]`). Le miroir colonne-à-colonne (axe vertical) n'est **pas** une isométrie hex (l'offset axial des rangées impaires fausse les distances) ; la rotation préserve exactement les distances → équité réelle, pas seulement visuelle.
2. **6 villages / 4 huttes sur la carte procédurale** (3 + 2 par demi-carte, reflétés) — le handoff L2.2 dit « posés sur la demi-carte puis reflétés » ; refléter 3 villages exige un total pair. R-96/R-98 (« 3 villages / 2 huttes par carte 40×40 ») sont amendés **pour les cartes générées** (R-104) : 3 villages non reflétés rompraient l'équité, cœur de la phase. 🔶 À valider/ajuster (le curseur du labo et `settings.ts` permettent 2 villages/demi → 4/carte si Erik préfère la densité des préfabriquées).
3. **2 continents en 1v1 miroir** : un vrai rift séparateur rendrait la connexité terrestre impossible (la rotation échange les deux moitiés — spawns séparés, or pas de naval en v1). Implémentation : rift traversant **avec isthme garanti** (2 cases de demi-carte forcées praticables + images → pont invariant, adjacences hex vérifiées). La connexité reste testée par BFS + tentatives.
4. **Fertilité : commerce ×1** (le pseudocode du PDF ne compte que food/prod) — chez nous le commerce devient or/science (R-90), il compte. Pénalité montagne 🔶 **−2** (le PDF : −10 sur tuiles non exploitables ; nos montagnes sont travaillables R-60). Bon d'aucun bonus « eau douce » (pas de rivières — hors périmètre confirmé).
5. **Climat symétrique par moitié** : le climat est calculé sur la grille générée (équateur au centre de la demi-carte) — après miroir, la carte a deux bandes sèches symétriques (une par moitié) et des pôles froids aux extrémités. La bande équatoriale unique « physique » exigerait que la géo connaisse le miroir (contrainte architecturale d'Erik) — l'équité prime.
6. **Ombre pluviométrique 🔶 optionnelle non implémentée** : bruit d'humidité secondaire retenu (suffisant, symétrique après miroir, plus simple — le curseur humidité permet le calibrage).
7. **Données 🔶** : `spawnWeight` des 22 ressources remplis (tuning par rareté gameplay) ; « Blé » élargi aux **plaines** (R-91 : pose de normalisation possible hors prairie, cohérent CivRev). Les deux sont calibrables au labo/à la main.
8. **Epsilon flottant** : le checksum delta annule les différences < 1e-9 (ordre d'addition flottant P1/P2) — équité exacte au sens du gameplay.
9. **Défaut du lobby = « Carte aléatoire »** (la mission L3.2 suggérait le changement, à confirmer). Les préfabriquées restent disponibles (4 choix au total).
10. **Labo visible en prod** : la page `#/progen` est accessible hors dev (outil inoffensif, 100 % client-side, sans session) — choix noté, facile à inverser (un `import.meta.env.DEV` dans `App.svelte`).

## 4. Ce qui reste à Erik

1. **Vérification en ligne avec login OAuth** : créer une partie « Carte aléatoire » sur https://game-4x-server-prod.erik-ai-studio.workers.dev (le login Google exige vos identifiants ; tout le reste est vérifié — le bundle déployé contient bien la fonctionnalité). Vérifier au passage : la partie se joue de bout en bout, le dump admin (`#/debug/<code>` en dev ou `GET /admin/game/:code`) affiche la section « génération procédurale ».
2. **Calibrage 🔶** : passer le labo `#/progen` en revue (curseurs) et trancher les valeurs — en particulier le nombre de villages/huttes par demi-carte (interprétation n° 2), la densité des ressources et les pondérations de fertilité.
3. **R-96/R-98** : confirmer l'amendement R-104 (6 villages / 4 huttes pour les cartes procédurales) ou demander une autre répartition.
4. Le labo est accessible en prod (interprétation n° 10) — dire si vous le voulez réservé au dev.

## 5. Fin de phase

Après 6b, les phases en attente sont : **4.5** (personnalisation visuelle — les validations du BACKLOG sont actives) et la **suite de la Phase 7** (merveilles, naval, ressources culture — décision D2). Le PDF servira pour les rivières le jour où la mécanique d'eau douce entrera au programme.
