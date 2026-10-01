# HANDOFF-UI-JEU-T2 — Panneau latéral de jeu restylé (AAA) : unité, historique, journal

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md`, `REPORT-UI-JEU-T1.md` (la référence de livraison : tableau dev/joueur, tokens, niveau de finition) et étudie `RapportCombat.svelte` + la barre supérieure T1 (LES standards visuels à égaler). **2D uniquement, client seul** — zéro changement moteur/serveur/protocole. Toutes les fonctions existantes restent (on restyle et on organise, on ne supprime pas).

## 1. Objectif (tranche 2 du chantier UI, feu vert Erik 01/10)

Restyler la **colonne de droite** de l'écran de jeu dans le langage AAA (or-sur-sombre, serif, ombres douces — mêmes tokens que la barre T1 et le rapport de combat) :

1. **Panneau UNITÉ** : restylé — nom/type de l'unité, PV (barres 3 vies existantes), stats, actions — lisible et hiérarchisé ;
2. **HISTORIQUE** : restylé — les événements du tour regroupés/lisibles (par case quand pertinent) ;
3. **JOURNAL** : restylé — entrées cliquables (comportement centrage REPLAY-RESOLUTION inchangé), typographie or/sombre ;
4. **« ⟲ Rejouer la résolution »** : bouton restylé au niveau du reste (comportement intact — relecture, indisponibilité après reconnexion, tooltip) ;
5. **Adversaires** : les bots/joueurs adverses trouvent une place propre (détail compact sous le badge civ de la barre OU panneau latéral — à l'œil d'Erik, 🔶) ;
6. **Bonus opportuniste ( Demandé en 🔶 au RAPPORT-ENGAGEMENT)** : une ligne récapitulative en tête de journal « ⚔ n combats ce tour » cliquable (ouvre le rapport de la dernière case de combat — mécanique existante). Si elle alourdit : la laisser de côté et le consigner.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Structure inchangée, habillage refait** : mêmes blocs dans le même ordre vertical (Unité, Vaisseau si présent, Historique, Rejouer, Journal), mêmes interactions (clics, sélection, survols) — c'est un RESTYLE, pas une refonte fonctionnelle. Les éléments dev du panneau (état brut) restent dans le calque dev (T1).
- **D2 — Densité maîtrisée** : le panneau ne doit pas cacher la carte — largeur actuelle conservée (ou 🔶 ajustée à l'œil), scroll interne propre, collapsible ? NON pour l'instant (pas de comportement nouveau, sauf verdict Erik).
- **D3 — Hiérarchie visuelle** : titres de blocs en serif or (comme la barre T1), séparateurs discrets, PV en barres 3 vies existantes (déjà AAA), boutons au style des chips. Contraste d'abord.
- **D4 — Zéro régression** : tests existants (journal cliquable, relecture, mêlée, rapport de combat) inchangés ou mis à jour structurellement SANS affaiblissement ; la colonne ne chevauche jamais le popover RAPPORT-ENGAGEMENT ni le bouton circulaire.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts. Lis le composant de colonne (fichier:ligne), les blocs, et le standard `RapportCombat.svelte`.

### L1 — Restyle
- Blocs 1-5 (D1-D3) ; adversaires (5) ; ligne ⚔ (6, si propre).

### L2 — Vérification
- Suites + typecheck verts ; e2e solo : sélection d'unité (panneau rempli), journal cliquable (centrage zoom préservé), relecture depuis le bouton, rapport de combat au clic case (pas de chevauchement), mode dev T1 intact.
- **Captures `dev-logs/captures-ui-t2/`** avant tout commit : panneau complet avant/après, panneau unité remplie, journal avec événements, adversaires, ligne ⚔ si livrée.

### L3 — ARRÊT POUR APPROBATION D'ERIK
Captures vs T1. 🔶 à l'œil : largeur, place des adversaires, ligne ⚔. NE COMMITTER QU'APRÈS FEU VERT.

### L4 — Rapport
- `REPORT-UI-JEU-T2.md` : restyle, écarts, captures, ce qu'Erik valide en ligne, 🔶, rappel T3 (minimap, parkée).

## 4. Critères d'acceptation
1. La colonne de droite est au niveau de finition T1/rapport de combat, fonctions intactes.
2. Aucun chevauchement avec popover/bouton circulaire ; mode dev T1 intact.
3. Suites vertes ; zéro changement moteur/serveur/protocole ; captures fournies.

## 5. Périmètre interdit
- Minimap (T3, parkée), moteur/serveur/protocole, 3D, la sableuse, les autres pages, toute fonction nouvelle (hors ligne ⚔ §1.6).
