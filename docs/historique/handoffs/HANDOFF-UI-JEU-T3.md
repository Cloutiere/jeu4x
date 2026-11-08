# HANDOFF-UI-JEU-T3 — Minimap + filtres façon Civ VI (dernière tranche de la disposition de jeu)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md`, `REPORT-UI-JEU-T1.md` et `REPORT-UI-JEU-T2.md` (les standards livrés — tokens AAA, tableau dev/joueur, calque dev) et l'image Civ VI d'Erik (minimap bas-gauche, panneau filtres/décorations au-dessus). **2D uniquement, client seul** — zéro changement moteur/serveur/protocole. L'état filtré fog (`view`) est la seule source de vérité — la minimap ne montre QUE ce que le joueur voit.

## 1. Objectif (feu vert Erik du 01/10 — la pièce parkée de la disposition Civ VI)

1. **Minimap en bas à gauche** : vue miniature de TOUTE la carte visible (fog compris — terrain révélé seulement), avec **rectangle de position de la caméra** ; clic (et drag) sur la minimap déplace la caméra, **zoom préservé** ;
2. **Panneau filtres/décorations** au-dessus de la minimap (repliable, style Civ VI) : bascules visuelles — **Rendements** (migration du bouton « Rendements » à 3 états du calque dev en bascules lisibles), **Ressources** (masquer/afficher l'art des ressources révélées — la tuile redevient terrain nu), et place pour de futurs filtres ;
3. Cohérence AAA T1/T2 (tokens or-sur-sombre, serif, ombres douces).

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Perf avant tout** : la minimap se redessine sur **invalide** (carte/fog/villes changent, au TurnResult et aux événements visibles), PAS par frame ; le rectangle de caméra se met à jour au mouvement caméra (léger — un rect dans un canvas persistant). Redraw complet budgeté (< 8 ms pour 50×40 — testé). Aucun impact sur le FPS de la carte principale (le bench 60 FPS reste la référence).
- **D2 — Contenu de la minimap** : terrains (tuiles résumées basse résolution, pas les PNG des tuiles — un rendu plat par couleur/type suffit et reste net), ressources révélées (point/pastille selon le filtre), villes (points accent joueur), unités (points accent), fog = fond sombre. Barre de PV et détails : JAMAIS (lisibilité).
- **D3 — Interaction** : clic = centrer la caméra sur la case (zoom inchangé), drag = suivi continu ; rectangle de caméra draguable ? NON (le clic-drag caméra suffit — un seul geste, moins de bugs) ; survol : tooltip case optionnel 🔶 à l'œil.
- **D4 — Filtres** : bascules persistées (localStorage, comme le calque dev) — `rendements` (off/faible/fort : reprend les 3 états existants du bouton, qui DISPARAÎT du calque dev et migre ici), `ressources` (on/off — off = tuiles-ressources remplacées par tuiles de base à l'affichage, gameplay/fog intouchés). D'autres filtres futurs s'ajouteront à la liste (structure data-driven).
- **D5 — Placement et repli** : bloc bas-gauche (minimap + panneau au-dessus), repliable (chevron — mémorisé), ne chevauche JAMAIS le bouton circulaire de fin de tour ni le panneau latéral ; en fenêtre étroite, la minimap se réduit (tailles data-driven).
- **D6 — Zéro régression** : RAPPORT-ENGAGEMENT, relecture, vue ville (la minimap se MASQUE en vue ville, comme la colonne), calque dev T1, panneau T2 — tout intact ; tests existants non affaiblis.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts ; bench FPS carte (référence existante). Lis le pipeline de rendu (textures tuiles, événements de changement), le bouton Rendements actuel, la projection hex↔écran.

### L1 — Rendu minimap (test-first sur les parties pures)
- Fonction pure `rendreMinimap(view, options)` → image basse résolution (couleur/type par case, fog, ressources selon filtre) — testée sur fixtures (fog, ressources off, villes/unités). Canvas persistant + invalidations (carte, fog, filtres).
- Rect de caméra : projection viewport → cases, maj au mouvement caméra.

### L2 — Panneau filtres + migration Rendements
- Bascules persistées (D4) ; le bouton « Rendements » quitte le calque dev (sa fonction migre — le tableau dev/joueur de T1 se met à jour au rapport) ; bascule Ressources branchée au rendu (affichage seul).

### L3 — Vérification
- Suites + typecheck verts ; bench FPS carte inchangé (60 FPS) ; e2e solo : minimap fog (l'exploration l'éclaire), clic/drag caméra zoom préservé, rect de caméra suit, filtres effectifs (rendements, ressources off), repli/mémorisation, vue ville la masque, relecture/RAPPORT-ENGAGEMENT intacts.
- **Captures `dev-logs/captures-ui-t3/`** avant tout commit : minimap fog partielle, plein écran avec filtres ouverts/fermés/repliés, ressources off, rect de caméra, comparaison Civ VI.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Captures vs Civ VI + FPS. 🔶 à l'œil : taille de la minimap, palette des terrains en miniature, tooltip survol, place du panneau filtres. NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-UI-JEU-T3.md` : rendu/invalidations, filtres, FPS avant/après, captures, ce qu'Erik valide en ligne, 🔶, bilan du chantier UI (T1+T2+T3).

## 4. Critères d'acceptation
1. Minimap fidèle à la vision (fog compris), rect de caméra vivant, clic/drag centrage zoom préservé.
2. Filtres Rendements (3 états migrés) et Ressources effectifs et persistés ; le bouton calque dev a migré.
3. FPS carte inchangé (60) ; invalidations seulement — pas de redraw par frame.
4. Zéro chevauchement/confirmation des non-régressions D6 ; suites vertes ; zéro changement moteur/serveur/protocole.

## 5. Périmètre interdit
- Moteur/serveur/protocole, 3D, la sableuse, les autres pages, tout nouveau filtre au-delà de Rendements/Ressources (structure prête, contenu futur), minimap cliquable vers des entités (clic = case, point).
