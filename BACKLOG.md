# BACKLOG — Idées en réserve (à fusionner dans DESIGN.md/RULES.md à la frontière de phase)

Idées proposées par Erik, affinées le 30/08 pendant la Phase 3. **Rien ici ne bloque la Phase 3.**
Chaque idée sera formalisée normalement (RULES.md / DESIGN.md) au moment de son implémentation.

---

## Idée 1 — Identité visuelle procédurale des armées et villes

### Concept d'origine (Erik)
Lancer le générateur d'assets avec une seed aléatoire pour que chaque joueur ait des unités/villes différentes ; palettes distinctes par joueur ; le joueur génère 2 exemples et retient celui qu'il préfère ; les assets communs (tuiles) ne sont pas régénérés.

### Concept affiné — trois couches distinctes

L'idée mélange deux choses qu'il faut séparer pour bien concevoir :

1. **Identité persistante choisie** (le « il choisit ce qu'il retient ») : chaque compte possède un **style visuel** — il génère une galerie d'aperçus (recommandation : 6, pas 2 — même coût, plus de choix), en fige un. Le choix est stocké **dans son profil** (côté serveur) et s'applique à toutes ses parties.
2. **Saveur par partie** (le « à chaque nouvelle partie, légèrement différentes ») : si le joueur n'a rien figé, le style est **dérivé déterministement du seed de la partie** (`hash(gameSeed, playerId)`) — déjà présent dans le GameState. Chaque partie a ainsi sa « teinte » visuelle, gratuite et sans stockage supplémentaire.
3. **Contrainte absolue de cohérence** : quel que soit le chemin, les deux clients doivent voir **exactement les mêmes sprites** → la génération est déterministe depuis `(styleSeed, typeUnité, couleurAccent)`, jamais aléatoire côté client. Le `styleId` choisi est copié dans `meta.players` à la création de la partie.

### Architecture technique

- **Générateur TypeScript paramétrique** branché sur le chemin de rendu runtime que la Phase 3 met en place (PixiJS `Graphics` → `generateTexture`, avec cache par clé `(type, styleSeed, accent)`). Le portage Python→TS est le vrai travail ; le script Python reste l'outil des **assets partagés** (tuiles, icônes) et la référence visuelle. À terme le script Python peut disparaître ou ne servir qu'au batch.
- Le style est décrit par un **descripteur de données** (seed + paramètres), pas par des PNG cuits : la galerie d'aperçus est instantanée et le stockage est un entier.
- Cohérence « civilisation » : unités et villes dérivent du **même** seed joueur → le motif du bouclier se retrouve sur les toits.

### Ce qui varie / ne varie pas (garde-fou de lisibilité)

| Varie (cosmétique) | Ne varie PAS (lisibilité gameplay) |
|---|---|
| Proportions ±10 %, motifs de décoration (écu, casque, toits), tons de tissu dans la palette du joueur, forme de bannière | **Silhouette et arme** de chaque type d'unité (un guerrier se reconnaît à 25 % de zoom), **couleur d'accent** (= couleur joueur, contraste fort fixe), les deux joueurs doivent rester distinguables instantanément |

Test automatisé du générateur : déterminisme (même seed → même texture), contraste des accents, **stabilité de silhouette** (bounding-box et masque par type constants aux seeds canoniques).

### Emplacement dans le plan

Micro-jalon **après la Phase 4** (J1 jouable d'abord) — « Phase 4.5 : personnalisation visuelle ». Prérequis : la Phase 3 a mis en place le chemin de génération runtime.

### Questions ouvertes
- Variations réservées aux unités ou aussi aux villes ? (reco : les deux, même seed)
- À terme : coupler le style à un choix de « civilisation » avec bonus (pont naturel vers la Phase 7 Civ Rev).

---

## Idée 2 — Engagements multi-participants (3+ unités sur une même case)

### Problème (Erik)
Avec les barbares ou plus de deux joueurs, plusieurs unités convergeront vers la même case. Le modèle actuel (duels séquentiels R-50) crée un **avantage d'ordre** : le premier attaquant encaisse les dégâts du défenseur, les suivants frappent un défenseur usé ; et un unité avec une case de repli serait traitée différemment d'une autre selon sa position dans la file. Il faut un comportement équitable.

### Modèle proposé : l'« engagement » (affinage)

1. **Regroupement** : tous les mouvements/attaques convergeant vers une même case ce tour forment un **engagement** — la liste des participants (côtés implicites = propriétaires en guerre), pas des paires codées en dur.
2. **Rounds simultanés** : chaque round, chaque participant frappe ; ses coups sont **distribués en rotation (round-robin)** sur les ennemis de l'engagement — personne n'« absorbe » par effet d'ordre. La formule p (R-51) s'applique par paire attaquant-cible, inchangée.
3. **Fin d'engagement — possession de la case** : le survivant **revendiquant** (occupant ou attaquant entré) avec le **plus de PV** prend la case (généralisation de R-53) ; les autres se replient selon R-54.
4. **Boucle de repli (idée d'Erik, généralisée)** : si un survivant ne peut pas se replier, on joue un round supplémentaire — et ainsi de suite **jusqu'à ce que tous les survivants puissent se replier, ou qu'il ne reste qu'un côté**. Les morts libèrent des cases, donc les options de repli apparaissent naturellement. **Garde-fou de terminaison** : cap dur (ex. 20 rounds) puis élimination déterministe des plus bas PV — une boucle probabiliste doit toujours avoir une sortie garantie.
5. **Cas dégénéré = règles actuelles** : un engagement à exactement 2 participants suit R-52/R-55 **à la lettre** (mutual survival → attaquant se replie). Aucun test existant ne change.

### Choix de philosophie à trancher (le vrai fork de design)

Erik parle de dégâts **répartis** (« 10 dégâts → 5/5 ») : c'est un modèle **déterministe** (l'issue d'un 3 contre 2 est prévisible). Le modèle hybride proposé ci-dessus garde les **rounds probabilistes** de la convention Civ (un croc-en-jambe du hasard reste possible) tout en garantissant l'équité de distribution. Mon Recommandation : **hybride** — changer de philosophie de combat est une décision bien plus grande que la seule équité, et elle rendrait les sous-doges impossibles.

### Application dès la v1 ? 

Le besoin existe **déjà en 1v1** : deux unités amies (sur cases adjacentes, l'empilement reste interdit) peuvent attaquer la même case ennemie le même tour — le duel séquentiel actuel avantage le second attaquant. Proposition : à la Phase 4, ajouter un **test de durcissement** de ce cas ; l'implémentation complète des engagements est ciblée **Phase 7** (barbares/FFA), avec la structure de données « participants par case » anticipée dès que le moteur y est retouché.

### Questions ouvertes
- Ordre de ciblage du round-robin : neutre par `unitId` (recommandé) ou focus sur les PV les plus bas (plus de kills, moins « équitable » en perception) ?
- Alliés qui co-attaquent (ni en guerre ni même camp) : participation interdite ? (Phase 7 diplomatie — R-58)
- Melee à 3 côtés (FFA triangulaire) : chaque unité distribue sur **tous** les ennemis présents (recommandé — les côtés émergent des propriétaires).

---

## Validations (30/08)

Les 4 défauts proposés sont **validés par Erik** (galeries de 6 variantes · silhouette jamais variée · combat hybride rounds + rotation · ciblage neutre par `unitId`) — ils gouvernent les Phases 4.5 et 7. *(confirmation explicite bienvenue, mais traités comme actifs)*

## Idée 3 — Relecture cinématique de la résolution (Erik, 30/08 — confirmée → Phase 5.5)

Au début de chaque tour, rendre la résolution automatique **maximalement transparente** :
1. afficher d'abord les **lignes de déplacement prévues** par les joueurs adverses (issues des événements `Move` reçus) ;
2. puis animer les mouvements le long de ces lignes ;
3. puis les effets : replis, attaques répétées, captures, combats.

Le journal d'événements (séquences, from/to) porte déjà toutes les données — c'est une fonctionnalité purement client au-dessus du playback existant.

## Idée 4 — Flèches de chemin persistantes (Erik, 30/08 — confirmée → Phase 5.5)

Aujourd'hui la ligne de déplacement disparaît à la validation. Elle doit **demeurer** sous forme de **flèche** (sens de déplacement visible) tant que l'ordre est actif — effacée à la résolution ou à l'annulation de l'ordre.
