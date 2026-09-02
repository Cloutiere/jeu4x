# Génération procédurale des cartes (Phase 6b)

Module **pur, déterministe, sans IO** (R-80) qui produit des cartes au format
exact des cartes préfabriquées (`MapData`) et passe la même validation
(`parseMap`) : le loader, l'admin et les migrations d'entités se réutilisent
tels quels.

Base documentaire : `Génération Procédurale Cartes Civilization.pdf` (Erik,
02/09) — le pipeline officiel de la franchise (CivFanatics, guide Civ VII),
mis à l'échelle pour du 1v1 sur 40×40. Principe directeur du document fait foi :
**la couche d'équilibrage prime sur la couche géophysique**.

## Architecture

```
generateProceduralMap(seed, settings?)
├── noise.ts     Bruit Perlin fBm seedé (implémentation maison)
├── geo.ts       L0 GÉOPHYSIQUE : altitude → rifts → seuil percentile (ratio
│                terre exact) → climat latitudinal → montagnes/collines/forêts
├── mirror.ts    L1/L2 STRATÉGIE injectable StartPlacementStrategy :
│                ressources → meilleur site (fertilité 3 anneaux) →
│                normalisation → rotation 180° → villages/huttes reflétés
│                → classification des eaux (côte/océan, R-107)
├── fertility.ts Score de fertilité (anneaux [1.0, 0.6, 0.3], food×2 +
│                prod×1.5 + commerce×1, pénalité montagne)
├── content.ts   Pose pondérée des ressources (spawnWeights) + villages/huttes
├── counting.ts  Comptage ressources × terrain (outil de labo, Phase 6c)
└── index.ts     Orchestration : tentatives par sous-graines dérivées →
                 MapData → parseMap → BFS de connexité → rapport ProgenReport
```

Séparation garantie par le handoff 6b : **la couche géophysique ne connaît
RIEN du miroir** — elle génère une grille `width × height` complète ; c'est la
stratégie qui demande les dimensions (le miroir demande une demi-carte 40×20 à
bord bas ouvert), découpe, place et reflète.

## Le miroir 1v1 (équité par construction)

La demi-carte (40×20) est reflétée par **rotation 180°** (`rows[r][c] ===
rows[39-r][39-c]`, comme la carte variée-40) : c'est la seule isométrie hex
exacte — les distances entre toutes les paires de cases sont préservées, donc
les quartiers des deux joueurs sont strictement identiques en gameplay
(terrains, ressources, villages, huttes, distances). Le checksum d'équité
(fertilité P1 vs P2, consigné dans `meta.progen`) tombe à 0 par construction.

Ordre des opérations (handoff L1/L2) :

1. L0 génère la demi-carte ;
2. les ressources sont posées AVANT le choix du site (la fertilité les compte) ;
3. le meilleur site de capitale est choisi parmi les cases praticables
   respectant : ≥ 6 des bords de carte, ≥ T-09 de l'axe de miroir,
   distance au site image ≥ 12, ≥ 1 voisin libre pour le Guerrier ;
4. normalisation (PDF §NormalizeStartLocation) : si le site est sous le seuil
   (moyenne des N meilleurs × 0.8 🔶), injection de bétail/blé dans les
   anneaux 1-2 jusqu'au seuil (échec explicite sinon → tentative suivante) ;
5. rotation 180° des terrains et du contenu ; retrait des ressources sous les
   deux capitales (validation parseMap) ;
6. 3 villages (≥ 6 des DEUX spawns — leçon de calibrage 7d) et 2 huttes (≥ 3)
   posés sur la demi-carte puis reflétés → **6 villages / 4 huttes** par carte
   procédurale, chaque joueur recevant exactement le même contenu.

Les scores de fertilité sont mesurés avec une demi-carte « étendue au miroir »
(`halfMapLookup`) : les anneaux qui débordent de la demi sont résolus sur leur
image — le score calculé avant miroir est donc exactement le score final.

## Ajouter le support 2-5 joueurs (regionalMulti — futur)

Le placement des départs ET du contenu est une **stratégie injectable**
(`StartPlacementStrategy`, `mirror.ts`). Pour accueillir les cartes plus
grandes multi-joueurs (comme CivRev 2-5) où le miroir n'est plus possible :

1. implémenter `regionalMulti` derrière la **même interface** (voir le PDF
   §AssignStartingPlots : partitionnement régional Voronoï pondéré par la
   fertilité, scoring multi-anneaux par joueur, normalisation relative entre
   joueurs, distribution des luxes par monopsons) ;
2. l'enregistrer dans `START_PLACEMENT_STRATEGIES` (mirror.ts) ;
3. ouvrir le paramètre `playerCount` des `GameCreationSettings` (déjà
   propagé : lobby → GameDO → `meta.settings`) et lever la contrainte
   « exactement 2 joueurs » de `parseMap` ;
4. **ne pas toucher à la couche géophysique** : `geoSize()` de la nouvelle
   stratégie demande simplement les dimensions voulues (ex. 60×60), et la
   géo les génère telles quelles (le paramètre `openBottom` est générique :
   « ce bord ne doit pas recevoir d'océan de bordure »).

`mirror1v1` rejette explicitement `playerCount !== 2` (testé) pour forcer ce
passage par la future stratégie.

## Déterminisme

- le seed de partie (`meta.seed`, généré par le LobbyDO) est la graine
  maîtresse ; chaque tentative dérive une sous-graine (`deriveSeed`) ;
- même seed → même carte bit à bit (testé) ; les tentatives absorbent les
  rares grilles sans site/connexion éligibles (maxAttempts 🔶 = 10) ;
- zéro `Math.random`, zéro `Date.now`, tris explicites partout (R-81).

## Réglages 🔶 (cibles de calibrage — labo #/progen)

Tous les défauts sont dans `settings.ts` (`DEFAULT_PROGEN_SETTINGS`) et sont
exposés en curseurs dans le labo `#/progen` (régénération à la volée) :
ratio terre 55 %, 1-2 rifts, largeur des côtes 1 (R-107 : une case d'eau à
≤ N cases d'une terre est de la côte `eau`, le reste est de l'océan `ocean`),
mosaïque des zones ×0.30, densités PAR TYPE montagnes/collines 50 %, forêts
36 %, déserts 35 %, prairies 20 % (valeurs de base d'Erik), rifts 2 de
profondeur 48 (mers intérieures pénétrantes), densité ressources
**×1.5** (~1 ressource / 8 cases de terre, marines ×1.5/48 sur Mer ET Océan,
poisson boosté ×1.5 sur les côtes — `extraSpawnScale`),
**écart ressources 2** et **min 1 de chaque type par joueur** (R-108, réservées
AVANT le tirage, ordre par rareté, choix farthest-point), **6 villages + 6
huttes par demi-carte** avec trois distances 🔶 (villages 6, huttes 3,
huttes↔villages 2 ; départs : villages ≥ 6, huttes ≥ 3), distance de spawn 12,
**anneau de départ équilibré** (≥ 2 prairies + ≥ 2 forêts dans les 6 cases du
site, aucune ressource — normalisation en anneau 2 uniquement),
normalisation = moyenne(top 5) × 0.8.

## Intégration

- `createGame` accepte `mapId: 'procedural-40'` (défaut du lobby) ;
- `GameDO` génère la carte au join **et au réveil à froid** depuis
  `meta.seed` — déterministe et rejouable ;
- le rapport de génération (`ProgenReport` : seed, ratio terre, checksum de
  fertilité, comptes) est consigné dans `meta.progen` → visible dans le dump
  admin (`#/debug/<code>` et `GET /admin/game/:code`) ;
- le labo `#/progen` fait tourner ce même module dans le navigateur
  (client-side, sans partie) : rendu sans fog, heatmap de fertilité,
  panneau « ressources par type et par terrain » (`countResourcesByTerrain`),
  export JSON du `MapData`.
