# HANDOFF CHANTIER V1-bis — Correctif : projection des entités hors champ en 3D

Tu reprends le pilotage de l'implémentation pour un **correctif bloquant** avant toute acceptation du chantier V1 et avant V2. **Préalables :** `HANDOFF.md` §4, baseline **826 tests** verts + typecheck, ta propre session V1 (REPORT-CHANTIER-V1-3D.md) et le code concerné (`apps/web/src/lib/render/GameCanvas.svelte` : `poser3d`, `projeterCalques3d`, les sites d'estampillage ; `optionB.ts`).

**Le bug (constat d'Erik du 04/09, captures 2D/3D de la même situation de jeu) :** après bascule 2D → 3D, **les deux unités de départ apparaissent complètement hors du terrain**, en haut à gauche de l'écran, alors que la promesse de l'Option B est que chaque sprite est projeté sur sa case par la caméra 3D partagée. Le terrain, lui, est validé visuellement par Erik (« le visuel est ce à quoi je m'attendais »).

**Pourquoi ce n'est pas « inhérent au mélange 2D/3D »** : ta session L4 a PROUVÉ la projection (sélection de la capitale au clic réel, sprites art réel projetés, anneaux, cases travaillées). Donc la projection **fonctionne dans l'état que tu as testé** et **casse dans celui d'Erik** — typiquement un chemin de code non testé : bascule à chaud depuis un état déjà rendu, entités préservées au teardown/remontage dont les tampons `__wx/__wy/__ws` sont absents ou périmés, ou une couche recréée sans `poser3d`. Rappel du contrat de `projeterCalques3d` : les enfants de la couche `entitiesLayer` (incrémentale) DOIVENT avoir été estampillés par `poser3d` — un enfant non estampillé est **ignoré** (`continue`) et reste alors à ses coordonnées 2D brutes = hors champ. **C'est la piste n°1 : à la bascule, des enfants existants n'ont jamais vu `poser3d` ou ont des tampons en coordonnées 2D écran.**

## Mission

1. **Reproduire** : partir d'une partie rendue en 2D (état quelconque, unités visibles), basculer en 3D à chaud — reproduire le constat d'Erik (unités hors champ) ; vérifier aussi le cas inverse (3D → 2D → 3D) et après une résolution de tour en 3D (playback) ;
2. **Corriger à la racine** : garantir qu'au moment de la bascule et à chaque `rebuildEntities`/`onNewView`, **tout enfant projetable porte un tampon monde valide** — soit estampillage systématique au montage/rebuild, soit traitement « non estampillé en couche incrémentale » comme un rebuild complet ; les tampons doivent toujours être en **coordonnées monde**, jamais des restes d'écran 2D ;
3. **Verrouiller par test** : un test d'interaction qui reproduit la séquence (2D rendu → bascule 3D → position écran de chaque unité ≈ projection de sa case — via les hooks `screenOf`/`pickAt` existants), plus les bascules aller-retour ;
4. **Vérifier en conditions réelles** : la situation exacte d'Erik (unités de départ, bascule), un tour complet en 3D avec playback, pan/zoom, bascules répétées ; e2e existants verts ;
5. **Livrer** : commit + push (CI), prod saine, captures `dev-logs/captures-v1-3d/`, rapport court `REPORT-CHANTIER-V1-FIX.md`.

## Critères d'acceptation
- Après bascule 2D→3D à chaud, **chaque unité/ville est affichée SUR sa case** à tout zoom et tout pan (test) ;
- Bascules répétées 2D↔3D sans régression (ni carte noire, ni décalage, ni crash) ;
- Aucune régression : 826 tests verts minimum, e2e artefacts/fortification verts, typecheck vert, CI deploy vert ;
- schemaVersion 18 inchangée, `packages/rules` non touché.

## Périmètre interdit
Aucune nouvelle fonctionnalité ; pas de V2 (structures 3D — phase suivante, autorisée par Erik APRÈS ce correctif) ; pas de renommage ; aucun changement moteur/serveur.

## Fin de session
Rapport court (cause racine, correctif, tests), arrêt, remise de la main au pilot.
