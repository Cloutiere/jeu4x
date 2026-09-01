# RAPPORT-PROPOSITION — Phase 7b : refonte du menu de ville

Date : 01/09/2026. Handoff : `HANDOFF-PHASE7B.md` (temps A uniquement — **étude et proposition, rien d'implémenté**). Maquette visualisable : [docs/proposition-7b/maquette.html](docs/proposition-7b/maquette.html) (ouvrir dans le navigateur).

**TL;DR** — L'anomalie « le clic sur la capitale ne sélectionne pas la ville » est **reproduite et diagnostiquée** : ce n'est pas un problème de clic, c'est un **crash du rendu de `CityPanel`** (régression 7a : `tileEffectLabel` lit `tileBonus.food` de la Bibliothèque/Caserne qui n'ont pas de `tileBonus`). La proposition de refonte recommande de **garder le panneau latéral** (restructuré en tableau de bord, avec durées en tours et file triée) plutôt qu'un écran plein à la Civ Rev. Trois propositions de règles (R-88 Bibliothèque, R-89 Caserne, R-90 calibrage science) sont formulées **pour validation**.

---

## 1. État des lieux

### 1.1 Ce qui existe (CityPanel.svelte, 334 lignes, rendu par Game.svelte dans une colonne latérale de 350 px)

| Bloc | Contenu | Verdict |
|---|---|---|
| Identité | id de ville, capitale, pop, citoyens assignés, rayon, « ennemie » | Correct mais l'id moteur (`c1`) est montré, pas un nom |
| Rendements | N/P/C cumulés + répartition or/science, version « projetée » si réassignation en attente | Bonne idée, mais deux lignes redondantes et aucune **durée en tours** |
| Croissance | jauge `foodStored / 10×pop` (R-63) | Bien, mais sans projection « +X tours » |
| Citoyens | liste des cases travaillées, clic = désassigner, « + n à assigner » | Le vrai levier d'interaction est la **carte** (R-60) — le panneau ne fait qu'inventorier |
| Bâtiments | pastilles | OK |
| Production | item courant + barre, puis **tous** les items en boutons à plat (verrouillés grisés « Requiert : … ») | Le point le plus mal organisé : ~10 boutons au même niveau, pas de tri unités/bâtiments, pas de durée restante, coût seul comme repère |
| Ennemie | lecture seule | OK |

**Ce qui manque** : durées en tours partout (seule unité de temps qui compte dans un jeu asynchrone), distinction visuelle production courante / choix, accessibilité claire du menu (cf. anomalie), cohérence visuelle avec ResearchPanel (ouvert depuis la barre supérieure, alors que la ville s'ouvre par clic carte — deux paradigmes).

**Ce qui est mal organisé** : la hiérarchie « identité → rendements → citoyens → bâtiments → production » entremêle information (lecture) et action (clic) ; la liste de production noie les items réellement constructibles ; la projection de rendements (réassignation en attente) apparaît/disparaît et n'est pas distinguée de la valeur courante.

### 1.2 Anomalie de sélection — reproduite et diagnostiquée (cause racine trouvée)

Reproduction GUI locale (partie vs bot, vraie souris via navigateur, partie `EADSH7`) :

1. **Cause racine : crash du rendu de `CityPanel`.** À la sélection de **n'importe quelle** ville, Svelte lève :
   `TypeError: Cannot read properties of null (reading 'food')` dans `tileEffectLabel` (CityPanel.svelte:144-150), appelée par le dérivé `productionOptions`. `tileEffectLabel` lit `b.tileBonus!.food`, mais **Bibliothèque et Caserne (ajoutées en 7a) ont `tileBonus: null`** (de même que le Tribunal, mais lui est court-circuité par `workRadiusBonus > 0`). Le rendu du panneau échoue et **le DOM reste sur l'ancien état** — le message « Cliquez sur une ville de la carte… » — d'où l'impression qu'« le clic ne fait pas la sélection ». En réalité `ui.selectedCityId` est bien positionné (vérifié via l'état debug du canvas). **Régression introduite en 7a** : en Phase 6 tous les bâtiments constructibles avaient un `tileBonus`.
   *Le correctif est trivial (guard dans `tileEffectLabel` + libellé d'effet pour Biblio/Caserne) mais il est réservé au temps B, avec un test qui l'aurait attrapé (rendu du panneau pour chaque bâtiment).*
2. **Anomalie secondaire confirmée (interaction)** : après une sélection d'unité, le brouillon de déplacement **reste armé** après soumission automatique (`handleAction` « extend » dans Game.svelte). Tant qu'il est armé, la règle 1 de `clickAction` (interaction.ts) donne priorité à l'extension de chemin : **un clic sur une case de ville adjacente à la dernière case du brouillon prolonge le chemin au lieu de sélectionner la ville** (reproduit : clic sur la capitale vide → `draft.path = [(-3,19),(-4,20)]`). La sélection de ville ne redevient possible qu'après clic droit (annulation) ou clic sur une case non adjacente. C'est vraisemblablement la deuxième raison pour laquelle Erik « ne voit plus » le menu.
3. **Points UX relevés au passage** : le dialogue « Unités sans ordre » est modale plein-carte et bloque tout clic carte ; l'alternance unité↔ville sur une capitale défendue (1er clic unité, 2e clic ville) fonctionne, mais rien ne l'indique au joueur.

### 1.3 Questions ouvertes reportées (REPORT-PHASE7A §3) — traitées en §4

- Science à 0/tour quand la ville n'a pas de commerce (floor(0.5 × 1) = 0) → **proposition R-90**.
- Bibliothèque et Caserne constructibles sans effet → **propositions R-88/R-89**.
- Accès au menu → corrigé par le correctif ci-dessus + refonte de l'interaction (§3.4).

## 2. Benchmark du domaine

*Connaissance du domaine de référence (Civ Rev console, Civ VI, Old World) et des jeux web 4X asynchrones (Warzone, Neptune's Pride) — les sources en ligne de type wiki n'étant pas accessibles depuis cette session, les patterns cités sont à valider par Erik qui connaît Civ Rev mieux que quiconque.*

**Civilization Revolution (console)** — l'écran de ville est un **écran plein** : la ville est « un lieu », pas un panneau. Il montre la file de production en grand (choix iconographique unités/bâtiments/merveilles), le surplus de nourriture et le temps avant croissance, les case-travail implicites (Civ Rev ne fait pas glisser les citoyens case par case : la ville « travaille » automatiquement, le joueur arbitre à la marge). Force : lisibilité immédiate de « qu'est-ce que cette ville produit et quand ». Faiblesse pour nous : prend tout l'écran, et le jeu asynchrone y passe quelques secondes seulement.

**Civilization VI** — le choix inverse : la gestion des citoyens est **superposée à la carte** (cases épinglées, glisser-déposer) avec un panneau de ville compact à côté. Force : la réassignation reste spatiale, sur la carte, exactement notre R-60. Le panneau affiche les rendements détaillés par source (centre, cases, bâtiments).

**Old World** — panneau latéral de ville **dense mais hiérarchisé** : en-tête (nom, pop), lignes de rendements avec prévisions, **file de production de plusieurs éléments** réordonnable, chaque item avec coût et tours restants. Force : la colonne de production toujours visible tout en jouant — proche de notre contrainte desktop.

**Jeux web 4X asynchrones (Warzone, Neptune's Pride)** — peu de clics, tout est exprimé en **temps restant**, l'état est glanceable d'un coup d'œil, les actions sont des changements de file visibles immédiatement. C'est le repère pertinent pour nous : nos joueurs reviennent 2 minutes par jour, ils veulent « où j'en suis, quand ça arrive ».

**Patterns retenus pour la proposition** :
- P1. **La carte reste le support de la réassignation** (R-60, comme Civ VI) — ne pas reproduire la gestion de citoyens dans le panneau.
- P2. **Tout s'exprime aussi en « tours restants »** (Old World, jeux web), pas seulement en points.
- P3. **Production = zone à deux niveaux** : item courant (avec barre + ETA) distinct de la liste de choix (triée, catégorisée) — jamais un plat de boutons.
- P4. **Écran plein évité** (contrat asynchrone : visites courtes, la carte doit rester visible) — Civ Rev est l'esthétique de référence, pas la mécanique d'écran.
- P5. **Projection** : montrer l'effet d'une action avant de la valider (rendements projetés, déjà en place, à généraliser : « si je produis X, ready dans N tours »).

## 3. Besoins d'Erik (récapitulatif)

- Phase 6 : menu de ville enrichi — cumuls N/P/C, répartition or/science (R-61), jauge de croissance 10×pop (R-63), réassignation **par clic carte** (R-60 — décision forte : spatial, pas une liste), bâtiments possédés (R-66), overlay de rendements par case.
- Phase 7a : production filtrée par déblocage (R-87), menu de recherche dédié (barre supérieure).
- Questions en attente : calibrage science (villes sans commerce 🔶), effets Bibliothèque/Caserne (Civ Rev : +50 % science ; vétérans), et l'accès au menu (anomalie §1.2 — la frustration initiale de cette phase).
- Style de pilotage : jalons courts, test-first, rien de nouveau sans validation explicite (règles 🔶 gelées par des tests).

## 4. Proposition

### 4.1 Trois options pour le mode d'accès et la structure

**Option A — « Tableau de bord » : panneau latéral restructuré (recommandée).**
Le menu reste le panneau latéral (élargi à ~460 px, repliable), réorganisé en quatre blocs strictement séparés lecture/action : (1) en-tête identité ; (2) rendements + deux jauges avec ETA (« croissance dans 4 tours », « Grenier dans 6 tours ») ; (3) citoyens (inventaire + rappel « clic carte = assigner ») ; (4) production à deux niveaux (courant vs choix triés unités/bâtiments, verrouillés en fin de liste). La ville ennemie garde une version lecture seule. Maquette : `docs/proposition-7b/maquette.html`.
*Pour* : conforme au contrat asynchrone (carte toujours visible, R-60 intact), coût faible (un seul composant), corrige tous les problèmes d'organisation identifiés. *Contre* : moins spectaculaire qu'un écran Civ Rev ; la largeur mange un peu de carte.

**Option B — « Écran de ville Civ Rev » : modale plein écran.**
Clic sur la ville → modale occupant la zone carte : grande en-tête, grille de production iconographique catégorisée (unités / bâtiments / merveilles), jauges géantes, citoyens gérés depuis la modale. *Pour* : fidèle au référentiel, très lisible, réglerait « d'un coup » la place disponible. *Contre* : casse R-60 (la carte n'est plus cliquable sous la modale — il faudrait réinventer la réassignation dans la modale), ajoute un composant entier, et multiplie les clics pour un jeu visité quelques minutes par jour.

**Option C — « Overlay Civ VI » : barre flottante + citoyens épinglés sur la carte.**
Une mini-barre flottante ancrée à la ville sélectionnée (rendements + production courante) et tout le reste sur la carte (cases cliquables avec rendements affichés en permanence). *Pour* : immersion maximale, zéro panneau. *Contre* : sur 40×40 avec zoom variable, les overlays par case deviennent vite illisibles ; demande un travail de rendu PixiJS conséquent (HUD ancré caméra) ; ne répond pas au besoin « liste de production complète ».

**Recommandation : Option A**, avec deux emprunts ciblés : à l'option C le principe « l'essentiel est visible sur/autour de la carte » (l'anneau de sélection et les marqueurs de réassignation existent déjà ; on y ajoute simplement l'ETA de production sur le sprite de ville — petit plus PixiJS optionnel), et à l'option B la **catégorisation de la liste de production**. Justification en une phrase : dans un jeu asynchrone, le menu de ville est un **tableau de bord consulté en 10 secondes**, pas un écran où l'on vit ; A maximise la lisibilité par tour de clic tout en préservant la réassignation spatiale R-60, et son coût est le plus faible des trois.

### 4.2 Structure cible écran par écran (option A — détail de la maquette)

1. **En-tête** : nom de ville (les villes gagnent un nom généré à la fondation — petit plus, optionnel), badge « Capitale », pop, « n citoyens assignés · rayon r ». Ville ennemie : badge rouge, lecture seule.
2. **Rendements** : une seule ligne N/P/C + répartition or/science ; en dessous, deux jauges avec **compte à rebours en tours** (croissance R-63, production courante). Si réassignation en attente : les valeurs projetées remplacent les courantes avec un style distinct (dashed/ambre) et une pastille « en attente » — plus de double ligne redondante.
3. **Citoyens** : inventaire compact (pastilles « case (q,r) » cliquables pour désassigner, « + n à assigner ») + rappel « cliquez une case sur la carte ». Inchangé fonctionnellement, réorganisé.
4. **Production** : item courant (nom + barre + « k tours ») ; puis la liste de choix en **deux sections** (Unités / Bâtiments), chaque option = nom, coût, effet, **tours restants si choisie maintenant** (P5), verrouillés grisés « Requiert : … » en fin de section. Bouton Annuler conservé.
5. **Bâtiments** : pastilles existantes, avec l'effet en tooltip (et une fois R-88/R-89 validés : effets réels de Biblio/Caserne).

### 4.3 Changements de règles — propositions à valider (aucune application sans accord)

- **R-88 · Bibliothèque** — *« +50 % de science produite par cette ville »* (transposition directe de Civ Rev). Formulation déterministe : `science_ville = floor(commerce × ratio × 1.5)`, l'or restant `commerce − science` (conserve le total ; cohérent avec la règle d'attribution du reste à l'or, R-61). Coût 🔶 30 inchangé. Alternative si trop forte : `+1` science plate par tour au lieu de +50 %.
- **R-89 · Caserne** — *« les unités produites par cette ville sortent vétérans »* (Civ Rev : vétérans). Le vétéran existe déjà (+50 % A/D, T-01 🔶, promotion par combat). Formulation : `veteran: true` à la complétion d'une **unité** (non cumulable avec une future promotion — les unités vétérans à la naissance ne re-promotent pas via la Caserne). S'applique-t-elle aux Colons ? **Non** (pacifique, pas de combat) — un colon sorti de la ville avec Caserne n'est pas vétéran. Coût 🔶 20 inchangé.
- **R-90 · Calibrage science des petites villes 🔶** — trois variantes :
  (a) **arrondi au supérieur côté science** : `science = ceil(commerce × ratio)`, or = `commerce − science` (1 commerce → 1 science, 0 or) — ma recommandation : pédagogique (la recherche progresse toujours), conservation respectée, un seul changement de formule ;
  (b) **minimum 1** : `science = max(1, floor(...))` si commerce > 0 — plus généreux, distort le curseur à basse valeur ;
  (c) ne rien changer (villes sans commerce = 0 science, « c'est le jeu ») et jouer le curseur — le plus fidèle à R-61 actuel mais l'écart de progression entre joueurs serait purement topographique.
- **(Correction d'anomalie, pas une règle)** : guard `tileEffectLabel` + libellés d'effet Bibliothèque/Caserne dans `productionOptions` (correspondront à R-88/R-89 une fois validées ; en attendant « Effet à venir »).
- **(Interaction, pas une règle)** : la règle 1 de `clickAction` ne doit plus consommer un clic sur une **case de ville** quand le brouillon est armé mais vide de nouveau choix (proposition : un clic sur une case de ville amie interrompt le brouillon et sélectionne la ville ; le chemin en cours reste soumis). À préciser au temps B.

### 4.4 Estimation en livrables (temps B, après approbation)

| Livrable | Contenu | Taille |
|---|---|---|
| L0 — Règles | R-88/R-89 dans `rules` (effets bâtiments, unités vétérans à la sortie), R-90 au choix, tests citant les R-xx, JSON `buildings.json` (champ `effect`) | S |
| L1 — Moteur | application des effets en Phase C, tests | S |
| L2 — UI | restructuration CityPanel (blocs, ETA, production catégorisée), correctif crash, interaction « clic ville interrompt le brouillon », tooltip bâtiments | M |
| L3 — Polish | (optionnel) ETA sur le sprite de ville PixiJS ; noms de villes | S |
| L4 — Vérif | GUI à la souris (sélection ville, réassignation, production), README + captures, CI, deploy, vérif en ligne | S |

Ordre de grandeur : **une session** (comparable à 7a si R-88/R-89/R-90 tous validés ; moins si Erik tranche plus serré).

## 5. Décisions attendues d'Erik

1. **Option A/B/C** pour le mode d'accès et la structure (recommandation : A).
2. **R-88** Bibliothèque : +50 % science (formule proposée) ? — oui / autre calibrage 🔶.
3. **R-89** Caserne : vétérans à la sortie, hors colons ? — oui / autre.
4. **R-90** : variante (a) ceil / (b) minimum 1 / (c) statu quo.
5. Les petits plus optionnels (ETA sur sprite, noms de villes) : à garder ou couper.

*Après validation (éventuellement amendée), une session temps B implémentera le tout en test-first avec un handoff d'implémentation dérivé de cette proposition. Rien n'a été modifié dans le code produit ni dans RULES.md durant le temps A.*

---

## 6. Décisions d'Erik du 01/09/2026 (validation du temps A — amendements intégrés)

**§4.1 — Option A approuvée** (panneau latéral restructuré), avec les deux emprunts ciblés (catégorisation de la production ; visibilité carte).

**§4.3 — R-89 Caserne validée telle quelle** : les unités produites par une ville avec Caserne sortent **vétérans** (+50 % A/D, T-01), **hors Colons** (pacifiques, pas de combat). Ne se cumule pas avec une future promotion par combat.

**R-88 Bibliothèque — validée sous forme amendée** (remplace la proposition +50 % sur la répartition). La bibliothèque modifie la conversion de la ville (cf. R-90 révisée ci-dessous) :

| Conversion de la ville | Sans bibliothèque | Avec bibliothèque |
|---|---|---|
| **Or** | `C` or, 0 science | `C` or, `max(1 ; round(C × 0,2))` science |
| **Science** | 0 or, `C` science | 0 or, `round(C × 1,5)` science |

Exemples validés par Erik : 5 commerce converti en or avec bibliothèque → **5 or + 1 science** ; 12 commerce converti en or avec bibliothèque → **12 or + 2 science** ; 12 commerce converti en science avec bibliothèque → **18 science, 0 or**. Arrondi : **au plus proche** (round half up — même convention que l'exemple « arrondi(12×20 %) »). Cas limite tranché : **même à 0 commerce**, une ville à bibliothèque génère **1 science/tour** (le `max(1 ; …)` s'applique toujours).

**R-90 (révisée) — Conversion du commerce, par ville** (amende R-61, qui disparaît) :
- Chaque ville convertit la **totalité** de son commerce en **or** ou en **science** — choix binaire, par ville (plus de curseur global 50/50 T-14 ; `player.scienceRatio` devient inutilisé, conservé pour compat comme `player.science`).
- **Bouton dans le panneau de ville** (« Convertit le commerce en : Or ⇄ Science ») — ordre **immediate** à la `SetResearch` (action `SetConversion(cityId, target)`, visible en temps réel, autorisée hors verrouillage des ordres, refusée pendant la résolution) — détail d'implémentation proposé par l'agent.
- **Défaut : Or** — pour une ville neuve comme pour une ville capturée (le choix est réinitialisé à la capture).
- **Répercussion carte** : les cases **travaillées** par une ville n'affichent plus l'icône commerce mais l'icône **or ou science** selon le choix de la ville qui les travaille (case de ville comprise) ; les cases non travaillées gardent l'icône commerce (potentiel du terrain).
- **Conséquence heureuse** : l'anomalie « science 0/tour » (REPORT-PHASE7A §3.1) disparaît **par construction** — plus de `floor()` d'une fraction : toute ville avec ≥ 1 commerce produit 1 or OU 1 science minimum ; une ville à 0 commerce sans bibliothèque produit 0/0 (topographie, assumé).

**Nouvelle exigence UI (carte, mode Rendements)** : ajouter une option pour **masquer villes et armées** pendant l'affichage des rendements (les icônes sont aujourd'hui en arrière-plan des entités). Choix d'implémentation de l'agent : le bouton « Rendements » devient un cycle à 3 états — *masqué → affiché → affiché sans entités* — revenant au premier état par un clic.

**Non tranché (laissé de côté pour l'instant)** : ETA sur le sprite de ville (PixiJS) et noms de villes — petits plus optionnels du §4.2, non retenus sauf demande contraire.

**Périmètre temps B consolidé** (estimation inchangée : une session) : L0 règles (R-88/R-89/R-90, champ `conversion` sur la ville, migration v5→v6 additive) → L1 moteur (Phase C, dépréciation du curseur) → L2 UI (correctif crash CityPanel — cause racine §1.2, panneau restructuré + bouton de conversion, icônes or/science sur cases travaillées, cycle Rendements à 3 états, interaction « clic ville interrompt le brouillon ») → L3 polish optionnel → L4 vérification GUI + README + captures + CI + deploy.
