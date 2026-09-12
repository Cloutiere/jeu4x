# REPORT-ARRIVEE-ENNEMIE — Visualiser une arrivée programmée sur une tuile à unité ennemie

**Chantier HANDOFF-ARRIVEE-ENNEMIE.md · livré le 12/09/2026 · NON COMMITÉ (règle : validation locale par Erik avant tout commit — commit/push sur sa demande explicite).**

Démo en direct (partie solo neuve **7HXKYH** sur le dev local, captures dans `dev-logs/captures-arrivee-ennemie/`) : guerrier programmé sur la case d'un barbare visible → survol = anneau ROUGE seul ; ordre posé = anneau rouge + **fantôme translucide réduit du guerrier, décalé vers le bord d'où il arrive**, l'ennemi restant en grandeur normale à sa place ; annulation = tout disparaît ; résolution = repli R-52/R-54 (survie mutuelle), marqueurs disparus, miroir du moteur.

## 1. Ce que fait le moteur quand le mouvement résout sur un ennemi resté en place (investigation demandée par le handoff §3)

Consigné depuis `packages/rules/src/turn.ts` (~ligne 1411) — **l'affichage reste un aperçu d'arrivée, jamais une promesse de combat** :

- **Unité militaire** (R-42 cas 2) : elle **entre** sur la case (1 PM consommé) et un **combat d'attaque** est planifié (Phase B, R-50..R-52). Issue (R-52) : défenseur mort → l'attaquant avance ; attaquant mort → le défenseur garde ; **survie mutuelle (cas normal, 1 échange T-03) → le défenseur garde la case, l'attaquant est en REPLI** (R-54 : case d'origine d'abord).
- **Unité pacifique** (Colon…) : **capturée** — v1 guerre : détruite + butin (R-43). Jamais de combat.
- **Ennemi ayant bougé ce tour** : collision R-53 (aucun dégât, plus de PV demeure) — c'est l'incertitude Diplomacy assumée : l'aperçu montre l'arrivée, pas l'issue.
- Vérifié en jeu (partie 7HXKYH, tour 5→6) : événements `Move`, `Attack`, `CombatExchange`, `Retreat` — le guerrier est revenu à sa case d'origine à 2/3 PV, le barbare intact 3/3, ordre consommé (aucune flèche résiduelle).

## 2. M1 — Détection et état (livré)

`apps/web/src/lib/render/interaction.ts` — deux fonctions pures testées :

- **`arriveeSurEnnemi(state, visible, arret, origine, myId)`** : entrée = la case d'ARRÊT de la prochaine résolution (`arretProchaineResolution` — cohérent avec l'aperçu v2 d'Erik), la case d'où l'unité arrive, l'état FILTRÉ et l'ensemble des cases visibles ; sortie = `{ ennemi, dirX, dirY }` (direction d'arrivée unitaire, px moteur) ou null. **Fog R-161 prime** : case non visible → null, rien d'affiché (garde explicite en plus du filtrage de l'état).
- **`arriveesPartagees(previews, mpDe)`** : compteur « pile » par case d'arrêt (langage ×N de DEPLACEMENT-PLANIFIÉ) — alimente le badge ×N.

## 3. M2 — Rendu 2D (livré)

`apps/web/src/lib/render/GameCanvas.svelte` (bloc ARRIVEE-ENNEMIE) :

- **L'ennemie reste en grandeur normale à sa place** (aucun changement du sprite existant).
- **Fantôme translucide** : copie base+accent du sprite de l'unité programmée, alpha **0.5**, taille **0.7×** du sprite normal, **décalée vers le bord d'où elle arrive** (direction origine→arrivée inversée — cohérent avec la flèche qui y mène), posée dans `overlayLayer` (au-dessus du terrain, SOUS le sprite ennemi). Picking intact (aucun eventMode).
- **Anneau rouge** (`0xe53935`) sur la tuile d'arrivée : au **survol** (l'encadré de la tuile visée passe du ambre au rouge — `dessinerSurvol`) ET à l'**ordre posé** (double liseré rouge comme l'anneau de dispute). Le chemin gelé bénéficie du même traitement : les détections dérivent de `scenePreviews`, qui inclut déjà les chemins gelés — même contrat que la flèche gelée.
- **L'aperçu reflète la réalité d'arrivée, pas une issue** : pendant qu'un ennemi occupe l'arrêt prévu, l'unité programmée n'est PAS affichée optimistement sur sa destination (elle masquerait l'ennemi) — le sprite réel reste à sa position moteur, le fantôme montre l'arrivée. Tooltip pédagogique : « Arrivée sur ennemi : aperçu seulement — l'ennemi peut avoir bougé (résolution simultanée). »
- **3D (M4.4)** : fantôme, anneau et badge sont posés par `poser3d` (reprojection par frame comme les autres surcouches) — mode coupé en prod (`rendu3d: false` intouché), non revu à l'écran.
- **Bench (M4.3)** : la détection est recalculée par REBUILD (état/UI changés) à partir de `scenePreviews` DÉJÀ calculé — aucun nouveau BFS, O(1) par aperçu, jamais par frame.

**Constantes 🔶 à calibrer à l'œil par Erik** (en tête du bloc ARRIVEE-ENNEMIE dans `GameCanvas.svelte`) : `FANTOME_ALPHA` (0.5), `FANTOME_RATIO` (0.7), `FANTOME_DECAL` (0.42 × HEX_SIZE), `COULEUR_ARRIVEE_ENNEMIE` (0xe53935).

## 4. M3 — Plusieurs unités vers la même case

Un seul fantôme est dessiné par tuile (première détection — jamais d'empilement de fantômes) + **badge ×N** (texte, coin supérieur droit de la tuile) dès que ≥ 2 unités programmées y ont leur case d'arrêt (`arriveesPartagees`). Non rejoué en GUI (une seule unité à portée en solo) — couvert par tests purs.

## 5. Vérifications

- **Tests** : suite complète forcée **verte — 1044 tests** (web 219, rules 753, server 72 ; +8 web : 5 `arriveeSurEnnemi` — détection, direction, fog, ami, sans origine — et 3 `arriveesPartagees` — comptage par arrêt selon les PM, ×2, chemin vide).
- **Typecheck 4/4** (svelte-check 0 erreur). **schemaVersion 19 inchangée**, **zéro gameplay** : `packages/rules/src`, serveur, `orderShapeError`, R-158..161 intouchés (aucun test rules modifié).
- **e2e GUI** (partie solo 7HXKYH, souris réelle via navigateur), captures dans `dev-logs/captures-arrivee-ennemie/` :
  - `01-survol-tuile-ennemie-anneau-rouge` — survol de la case du barbare : anneau ROUGE seul, ennemi intact ;
  - `02-ordre-pose-fantome-anneau-rouge` — ordre posé : anneau rouge + fantôme translucide réduit côté d'arrivée + flèche ambre ; l'ennemi reste en grandeur normale ;
  - `03-annulation-marqueurs-disparus` — annulation : fantôme, anneau et flèche disparus (seul l'anneau de sélection ambre demeure) ;
  - `04-apres-resolution-miroir-moteur` — après résolution : repli R-52/R-54 (l'unité est revenue à sa case, 2/3 PV), aucun marqueur résiduel.
- Résultat moteur lu via dump admin (voir §1) : conforme à R-42 cas 2 / R-52.

## 6. Notes de session (transparence)

- Le serveur Vite déjà lancé sur le port 5174 a servi le code à chaud pendant mes éditions : un état mitigé post-HMR a produit une caméra NaN en cours de session (fausse piste d'un bug caméra — un rechargement complet suffit, cf. piège connu « Vite HMR sert du vieux code »). Une fois rechargé proprement, aucun problème.
- Le fantôme est d'abord apparu décalé du MAUVAIS côté (direction d'arrivée au lieu du bord d'arrivée) — corrigé (signe inversé) puis revalidé en capture.

## 7. Reste à vérifier par Erik (en ligne, à l'œil)

1. **Calibrage 🔶 du fantôme** (alpha 0.5, ratio 0.7, décalage 0.42×HEX_SIZE) et du rouge (0xe53935) — 4 constantes en tête du bloc ARRIVEE-ENNEMIE ;
2. Cas multi-tours : programmer vers un ennemi à 2+ cases — le fantôme suit la case d'arrêt de la prochaine résolution (et l'anneau rouge avec), le chemin gelé conserve le traitement tant que l'ordre vit (même code que la flèche gelée, non rejoué en GUI) ;
3. Le cas ×N (deux unités programmées sur le même ennemi) — badge ×2 ;
4. Un Colon programmé sur un ennemi (capture R-43) : même visuel, issue différente à la résolution.

## 8. Fichiers touchés

- `apps/web/src/lib/render/interaction.ts` (`arriveeSurEnnemi`, `arriveesPartagees` — pures, testées) ;
- `apps/web/src/lib/render/GameCanvas.svelte` (bloc ARRIVEE-ENNEMIE : détection dérivée, fantôme, anneau rouge survol/posé, badge ×N, sprite réel conservé en place, tooltip) ;
- `apps/web/tests/interaction.test.ts` (+8 tests) ;
- `dev-logs/captures-arrivee-ennemie/` (4 captures).
