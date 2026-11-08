# HANDOFF-TECHTREE — Arbre technologique d'Erik (écran plein)

**Décisions Erik 05/10** : refonte de l'écran de recherche en **arbre technologique plein écran** selon sa référence `Techtree/civ_tree.jpeg` — ses 4 fonds d'ère, ses 44 images de technologies, débloqués en noms seuls. Sources : répertoire `Techtree/` d'Erik (NE JAMAIS le committer tel quel).

## 1. Préalables

- Lire `apps/web/src/components/ResearchPanel.svelte` (recherche actuelle — remplacée), `packages/rules/src/data/techs.json` (44 techs, prérequis, coûts, ère moteur), `labels.ts` (libellés FR), le langage AAA or-sur-sombre (UI-JEU-T2), et la porte BLOCAGE-NAVIGATION (clic « bloqué » ouvre la recherche — même destination).
- Baseline : suites vertes (rules 993 + web 530 + server 120), svelte-check 0, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (votées Erik 05/10 — veto possible)

- **D1 — Écran plein** style `civ_tree.jpeg` : bannières d'ère verticales dont le fond = ses 4 images (`ancient/medieval/industrial/modern.jpeg`), titres d'ère + sous-titre, barre de timeline d'ère en bas, citation en pied (optionnel 🔶). Remplace `ResearchPanel` (l'ancien est retiré des montages ; le composant peut rester si un autre écran s'en sert — vérifier).
- **D2 — Choisir sa recherche** : clic sur une tech disponible = sélection (mêmes règles moteur qu'aujourd'hui — aucun changement de validation) ; états : **acquise** / **en cours** (badge progression %/tours) / **disponible** (cliquable, surbrillance) / **verrouillée** (grisée + prérequis nommés, non cliquable).
- **D3 — Ères d'AFFICHAGE uniquement** : mapping data-driven `tech → colonne d'ère` (fichier dédié, ex. `techtree.ts`) ; point de départ = l'ère moteur de chaque tech ; l'ère MOTEUR (T-36, comptage, transitions, techs gratuites de palier) reste INTACTE — zéro gameplay.
- **D4 — Carte technologie** : image d'Erik + nom FR + coût (tours restants estimés à la science courante) + prérequis + **débloqués EN NOMS SEULS** (unités, bâtiments, merveilles, gouvernements que la tech débloque — libellés FR existants). Flèches de dépendance entre cartes (or, traversant les colonnes).
- **D5 — Placement data-driven** : positions (colonne, rangée) des 44 cartes dans le même fichier de mapping ; l'agent propose une disposition rangées-à-croisements-minimaux ; réajustable sans code.
- **D6 — Recuisson des images** : les 44 JPEG (4-6 Mo) sont redimensionnés/compressés à la taille de carte (cible ~384-512 px de large, qualité lisible, poids total < 8 Mo) ; copies traitées dans les assets du pipeline ; mapping `techId → fichier` (particularités : `potery.jpeg` = Pottery, `atomic theory.jpeg` = espaces) ; toute tech sans image = fallback icône existante + consigné. Sources d'Erik : jamais commitées.
- **D7 — Sortie** : Échap / croix ; la recherche en cours reste visible en haut de l'écran de jeu ; ouverture = mêmes portes qu'aujourd'hui (bouton recherche, BLOCAGE-NAVIGATION, badge).

## 3. Mission

- **L1 — test-first (client)** : suite `techtree.test.ts` : mapping complet (44/44 techs mappées, aucune inconnue), ère d'affichage vs ère moteur (indépendance), états (acquise/en cours/disponible/verrouillée) sur fixtures, liste des débloqués en noms, fallback image manquante.
- **L2 — données/pipeline** : D3/D5 (fichier de mapping + placement), D6 (recuisson, table de correspondance).
- **L3 — UI** : `TechTree.svelte` plein écran (scroll horizontal fluide, 4 bandes d'ère, cartes + flèches, barre de timeline bas = ère courante du JOUEUR mise en évidence), remplacement de ResearchPanel (D1/D7).
- **L4 — vérification GUI locale avec captures AVANT commit** (règle Erik) : partie solo légale — arbre complet 4 ères, sélection d'une tech disponible, état verrouillé avec prérequis, ouverture par blocage fin de tour, sortie Échap. Captures `dev-logs/captures-techtree/`.
- **L5** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push (CI déploie), rapport `REPORT-TECHTREE.md` (table de correspondance, placement proposé, 🔶).

## 4. Critères d'acceptation

1. L'arbre s'ouvre par toutes les portes, cherche une tech et fonctionne (mêmes règles moteur) ;
2. 44 cartes avec images d'Erik, noms FR, débloqués en noms, flèches de dépendance lisibles ;
3. 4 bandes d'ère aux fonds fournis, timeline bas cohérente avec l'ère du joueur ;
4. Zéro changement moteur/serveur, `schemaVersion` 27, poids des images cuites maîtrisé.

## 5. Périmètre interdit

Moteur/serveur/protocole ; l'ère moteur et les valeurs de `techs.json` (prérequis, coûts) ; `schemaVersion` ; tout le 3D. Les répertoires d'Erik (`Techtree/`, `new_units/`…) ne se committent JAMAIS tels quels.

## 6. Fin de session

Rapport (correspondances images, placement, 🔶 visuels pour calibrage à l'œil d'Erik), arrêt, remise de la main.
