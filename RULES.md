# RULES.md — Règles du jeu (spécification exécutable)

**Version :** v1 (prototype J1) · **Référentiel :** Civilization Revolution
**Statut :** document normatif. Chaque règle est numérotée (`R-xx`), chaque constante (`T-xx`), chaque point d'interprétation à confirmer (`I-xx`). Les tests de `/packages/rules` citent ces identifiants.

**Principe cardinal :** la résolution de tour est une **fonction pure et déterministe** `resolveTurn(state, orders) → (newState, events)`. Aucun `Math.random()` : tout aléa passe par le RNG seedé (§10). Aucun gain lié à l'ordre de déclaration : l'ordre de traitement est imposé par des tris déterministes, jamais par l'arrivée des messages.

---

## 1. Portée du prototype (J1)

- 1v1, tours simultanés, principalement asynchrone, timer configurable par partie.
- Carte **préfabriquée** 40×40, type pangée : l'eau est **infranchissable** en v1 (T-11).
- Unités v1 : **Guerrier** et **Colon** uniquement (§3).
- Victoire : **capture de la capitale adverse**. Défaite par forfait après `T-06` timers manqués.
- v1 : **guerre permanente** entre les deux joueurs (pas de diplomatie jouable). Les règles diplomatiques (§7.7) sont écrites dès maintenant comme points d'accroche pour la Phase 7.
- Aucune unité à distance en v1 ; leurs règles sont fixées en §7.8 (Catapulte, Canon, Artillerie en Phase 7).
- Hors v1 (Phase 7) : arbre technologique, autres unités, naval, barbares, merveilles, grandes personnes.

## 2. Terrains (révision économique du 30/08 — décision d'Erik, modèle Civ Revolution)

| Terrain | Passable (unités) | Bonus défensif | Rendement de base (N/P/C) | Bâtiment d'amélioration | Bonus du bâtiment |
|---|---|---|---|---|---|
| Prairie | oui | 0 % | **2/0/0** | — | — |
| Plaine | oui | 0 % | **1/0/0** | Grenier | +1 Nourriture |
| Forêt | oui | **+50 %** (revu : était 25 %) | **0/2/0** | — | +50 % défense aux unités occupantes (déjà le rôle du bonus) |
| Colline | oui | +50 % | **0/1/0** | Atelier | +2 Production |
| Montagne | **non** (mais **travaillable par les villes**) | — | **0/1/0** | Mine de fer | +4 Production |
| Désert *(nouveau)* | oui | 0 % | **0/0/1** | Comptoir commercial | +2 Commerce |
| Mer *(l'ex-« eau », désormais productive)* | **non** (naval en Phase 7) | — | **0/0/2** | Port | +1 Nourriture |
| Case de ville | oui | +50 % (T-02) | 2/1/1 | — | — |

- **C** = commerce : la matière première répartie entre **or** et **science** par le curseur global (R-61). Le champ `gold` des données reste le support du commerce.
- **Montagne et Mer sont travaillables par les villes** bien qu'infranchissables pour les unités (un citoyen exploite la case, il n'y marche pas).
- Les bonus défensifs s'appliquent au **défenseur** uniquement ; le bonus défensif de la forêt passe de 25 % à **50 %** (table du 30/08).
- Les coûts de production des bâtiments : voir R-66. Les valeurs restantes marquées 🔶 sont des cibles de calibrage.

## 3. Unités, PV, armées

### 3.1 Caractéristiques

Chaque type d'unité : `attaque (A)`, `défense (D)`, `mouvement (M)`, `PV max`, `coût`, `rayon de vision`, capacités (`peutAttaquer`, `peutFonderVille`, `àDistance`). Est **pacifique** toute unité qui ne peut pas attaquer.

| Unité | A | D | M | PV max | Coût | Vision | Capacités | Tech |
|---|---|---|---|---|---|---|---|---|
| Guerrier | 1 | 1 | 1 | 3 | 10 | 2 | peutAttaquer | — |
| Colon | 0 | 0 | 2 | 3 | 20 | 2 | peutFonderVille, **non-combattant** | — |
| Archer *(7a)* | 1 | 2 | 1 | 3 | 15 | 2 | peutAttaquer | Travail du bronze |
| Cavalier *(7a)* | 2 | 1 | 2 | 3 | 20 | 2 | peutAttaquer | Équitation |
| Légion *(7a)* | 2 | 1 | 1 | 3 | 10 | 2 | peutAttaquer | Travail du fer |

*(Données du PDF officiel, ajoutées en 7a ; Espion et Galère existent dans `units.json` mais ne sont pas constructibles en v1 terrestre — mécaniques Phase 7.)*

### 3.2 R-30 · Non-empilement

Une case contient **au plus une entité amie** (unité ou armée). Exception : la case d'une ville héberge la ville **plus un défenseur** (unité ou armée).
*Conséquence assumée : pas d'escorte possible pour les Colons en v1 ; le passage transitoire de plusieurs unités sur une case pendant la résolution est interne au moteur et jamais visible dans l'état final.*

### 3.3 R-31 · Armées

- Formation : **3 unités du même type** via l'ordre `FormArmy` (case de rendez-vous). À la résolution, si les 3 membres atteignent le rendez-vous → fusion en une entité unique.
- L'armée est **définitive** : pas de scission (conforme Civ Rev).
- Statistiques : A et D = **somme** des membres (3 Guerriers → A3 D3) ; PV = somme des PV courants, plafonnée à `3 × PV max` (= 9). M = celle du type (les membres sont du même type).
- Vétéran 🔶 : l'armée est vétéran si **au moins 2 membres** le sont.

### 3.4 R-32 · Vétérans

Une unité qui survit à un combat où elle inflige le coup fatal devient vétéran (gain +50 % A et D, T-01). 🔶 règle de promotion simplifiée, à caler sur Civ Rev.

## 4. Ordres

| Ordre | Paramètres | Notes |
|---|---|---|
| `Move` | chemin `[(q,r), …]` | Exécution pas à pas à chaque résolution, dans la limite des PM. Multi-tours autorisé. **Halte** si un ennemi devient visible ; le reste du chemin est gelé. |
| `Attack` | case cible adjacente | Attaque explicite d'une case où un ennemi est visible. |
| `FoundCity` | — | Consomme le Colon (exécuté en Phase C si survivant et valide : distance ≥ `T-09` de toute ville). |
| `FormArmy` | membres `[id, id, id]`, case RDV | Voir R-31. |
| `Hold` | — | Ne rien faire (l'unité reste « stationnaire »). |
| `Fortify` | — | **R-33** (ajouté le 30/08) : fortification permanente — voir ci-dessous. |
| `SetProduction` | ville, item | File de production à un élément, remplaçable (progression conservée). Items : unités **et bâtiments** (R-66). |
| `SetWorkedTile` | ville, case | **R-60** (30/08) : assigne un citoyen à la case (dans le rayon de travail, libre) ; désassigner = cibler `null` ou une autre case déjà travaillée par la même ville (échange). |

**R-33 · Fortification.** L'ordre `Fortify` place l'unité en position fortifiée **permanente** :
- bonus défensif `T-17` tant que l'unité est fortifiée (multiplie `S_def`, §7.4) ;
- l'état persiste d'un tour à l'autre — l'ordre n'est **pas consommé** à la résolution ;
- **tout autre ordre** (`Move`, `Attack`, `Hold`, `FoundCity`, `FormArmy`) **annule la fortification** ; la réactiver est manuel ;
- une unité fortifiée ne bouge pas et bénéficie des soins R-71 normaux.
UI : bouton « Fortifier » sur le panneau d'unité + marqueur écu sur le sprite. *(implémenté en Phase 5 L0 — moteur + UI + bot ; `schemaVersion` 2→3 : champ additif `fortified`, migration d'initialisation à false)*

Les ordres sont **modifiables/annulables jusqu'au verrouillage** (« Fin de tour »). Après verrouillage : irrévocable. Les ordres vivent côté serveur (persistés à chaque modification).

## 5. Structure de la résolution (entre deux tours)

Déclenchée quand **les deux joueurs ont verrouillé** ou à l'**échéance du timer** (auto-verrouillage des ordres courants).

1. **Phase A — Mouvements** (§6)
2. **Phase B — Combats & replis** (§7)
3. **Phase C — Économie** : fondations, production, croissance, science, or (§8)
4. **Phase D — Vision, soins, régénération PM** (§9)
5. Persistance versionnée + diffusion des événements filtrés par brouillard.

À tout moment, une action illégale est rejetée individuellement sans bloquer la partie.

## 6. Phase A — Mouvements

**R-40 · Garantie de mouvement.** Un déplacement vers une case vide (ou restée vide au moment du traitement) **s'exécute toujours**. Aucun effet en chaîne (combat, repli) ne peut annuler ou expulser un mouvement déjà exécuté.

**R-41 · Ordre de traitement.** Les unités à mouvement sont traitées dans l'ordre croissant de `unitId` (déterministe, indépendant des joueurs). Chaque unité exécute **la totalité** de son déplacement (étape par étape, dans la limite des PM) avant le traitement de la suivante.

**R-42 · Fin de chemin.** Pour chaque étape :
- case **vide** → l'unité avance ;
- case occupée par une entité **ennemie stationnaire** (n'ayant pas bougé ce tour) → l'unité **entre** sur la case, un **combat d'attaque** est planifié (§7.2) ;
- case visée simultanément par un **mover ennemi** déjà arrivé ce tour (le premier occupant a bougé ce tour) → **collision** planifiée (§7.3) ;
- case occupée par une entité **amie** → l'unité s'arrête sur la case précédente (R-30) ;
- étape hors carte / terrain infranchissable → chemin invalide, l'unité s'arrête.

**R-43 · Unités pacifiques (Colon ; plus tard Espion, Caravane).** Non-combattantes : elles n'attaquent jamais et n'entrent pas dans un combat. Si leur déplacement aboutit sur une case qui sera occupée par un ennemi (déjà prise ou contestée par un mover adverse), elles sont **capturées** — jamais de combat, jamais de comparaison de PV :
- nations **en guerre** (cas v1) : l'unité est **détruite** et le vainqueur touche un **butin en or** (`T-12`) — décision du 29/08 : pas de conversion d'un colon adverse, trop fort ;
- nations **en paix** : l'unité est **détenue** ; au tour suivant, le capteur choisit : **restitution** dans la ville la plus proche du propriétaire, ou **butin + déclaration de guerre automatique** (§7.7-c).

**R-44 · Fusion.** Les cases de rendez-vous `FormArmy` sont traitées en fin de Phase A ; la co-location transitoire n'est légale que pour les 3 membres désignés.

## 7. Phase B — Combats & replis

### 7.1 Généralités

**R-50.** Tous les combats planifiés sont **systématiquement résolus**. Ordre de résolution : tri par case `(q, r)` croissante, puis `unitId` de l'attaquant croissant.

**R-51 · Échange.** Une **attaque** = un échange de `T-03` round(s) (défaut : 1). Chaque round : le camp perdant du round perd **1 PV** (formule §7.4). Un combat ne va à mort que par **attaques répétées** (R-55).

### 7.2 Combat d'attaque (défenseur stationnaire)

**R-52.** Issue d'une attaque :
- défenseur à 0 PV → mort ; l'attaquant **avance systématiquement** sur la case libérée — l'attaque suppose des PM disponibles (I-2 confirmé le 29/08 ; exception : unités à distance, §7.8) ;
- attaquant à 0 PV → mort ; le défenseur conserve la case ;
- **survie mutuelle** (cas normal, 1 échange) → le défenseur stationnaire **conserve sa case** ; l'attaquant est en **repli** (R-54).

### 7.3 Collision (mouvements convergents)

**R-53.** Deux movers ennemis visant la même case : **aucun dégât**. Celle qui a le **plus de PV courants** demeure ; l'autre est en repli (R-54). Égalité de PV : demeure celle qui a parcouru **le moins de cases** ce tour ; seconde égalité : `unitId` le plus faible. Si le perdant n'a **aucune case de repli** → attaques répétées (R-55) jusqu'à élimination d'une des deux. **Exception (R-43)** : si l'une des deux unités est pacifique, elle est capturée — pas de comparaison de PV.

### 7.4 Formule de round

```
S_att = A × (1 + T-01 si vétéran)
S_def = D × (1 + T-01 si vétéran) × (1 + bonus défensif du terrain + T-17 si fortifiée)
p (l'attaquant touche) = S_att² / (S_att² + S_def²)
roll = rng() ∈ [0,1)  →  roll < p : le défenseur perd 1 PV, sinon l'attaquant perd 1 PV
```

- S = 0 pour un camp → il est touché à chaque round (p = 1 ou 0).
- Structure calquée sur la convention Civilization (A/D + modificateurs + rounds probabilistes, ancêtre direct de Civ Rev) ; les constantes exactes de Civ Rev n'étant pas publiées, `T-01` et les bonus de terrain sont des cibles de calibrage (§11).

### 7.5 Repli (règle unifiée)

**R-54 · Options de repli, dans l'ordre :**
1. la **case d'origine** de l'unité perdante (sa position avant mouvement ce tour) si elle est libre ;
2. sinon une **case adjacente libre** à la case de combat, choisie par **proximité à la case d'origine** (distance hexagonale), puis `(q, r)` croissant ;
3. sinon **pas de repli** → attaques répétées.

**R-55 · Attaques répétées.** Sans case de repli, les échanges se répètent (toujours `T-03` round(s) par attaque) **jusqu'à l'élimination d'une des deux unités**. C'est le mécanisme assumé de « blocage » : encercler un attaquant force l'usure. La boucle est garantie terminale (chaque itération retire ≥ 1 PV).

**R-56 · Allocation concurrente des replis (deux passes — validé le 29/08).** L'allocation des cases de repli est **globale, pas séquentielle** : (1) tous les combats de la phase se résolvent d'abord (R-50 → R-55) et les perdants devant se replier sont collectés ; (2) les cases de repli libres sont alors alluées **par perdant à PV décroissants** (tie : `unitId` croissant), chacun recevant sa meilleure case selon R-54 ; (3) les perdants sans case attribuée reprennent le combat avec une attaque supplémentaire contre le vainqueur de leur propre combat, jusqu'à élimination — les vainqueurs ne quittent jamais la case, donc l'adversaire est toujours présent. Corrige la première implémentation « premier résolu, premier servi » de la Phase 0.

### 7.6 Villes et Colons dans les combats

**R-57.** Entrer sur une case de ville ennemie **défendue** = attaque du défenseur (stationnaire). Entrer sur une ville **sans défenseur** = capture (§8.4). Une unité pacifique vaincue est détruite + butin (R-43) — pas de changement de propriétaire.

### 7.7 Diplomatie (points d'accroche — pleinement jouable en Phase 7)

**R-58.** v1 = guerre permanente (1v1) : ces règles ne s'activent pas, mais le moteur les porte dès maintenant.
- **a.** Attaquer une nation en paix est impossible sans déclaration de guerre préalable : les ordres `Attack` contre elle sont refusés 🔶.
- **b.** Collision involontaire entre nations en paix (R-53 alors possible) : si les **deux** unités ont une case de repli → **repli mutuel** (chacune selon R-54 depuis son origine), aucune autre conséquence. À défaut, l'échange se déroule selon les règles normales **sans rompre la paix** : c'est un **incident diplomatique** (événement `DiplomaticIncident`, impact 🔶 en Phase 7) — pas une déclaration de guerre.
- **c.** Capture d'une unité pacifique en temps de paix : détention puis choix du capteur au tour suivant (R-43).

### 7.8 Unités à distance

**R-59.** Catapulte, Canon, Artillerie (Phase 7) ; portée 1 🔶. Aucune en v1, mais les règles sont normatives dès maintenant.
- **a.** Une unité à distance attaque **depuis sa case** et **n'avance jamais**, même victorieuse (exception à I-2/R-52).
- **b.** Elle ne subit **aucun dégât en retour** si sa cible n'est pas elle-même une unité à distance (pas de riposte de mêlée).
- **c.** Cible à distance → échange standard, dégâts mutuels possibles (R-59-b s'applique dans les deux sens).
- **d.** En défense, une unité à distance attaquée qui **ne vainc pas** son attaquant (survie mutuelle) se **replie systématiquement** — rôles inversés par rapport à R-52 : c'est le défenseur qui cède la case, repli selon R-54. À 0 PV, elle est simplement détruite.

## 8. Phase C — Économie (modèle Civ Revolution)

**R-60 · Cases travaillées par ville (révision 30/08 — modèle Civ Revolution).**
- La **case du centre-ville** est exploitée automatiquement et gratuitement : ses rendements s'ajoutent toujours, sans citoyen.
- Chaque point de population = **1 citoyen** = **1 case supplémentaire travaillée**, choisie parmi les cases environnantes dans le rayon de travail `T-08b` (**rayon 1 = 6 cases** ; le **Tribunal** (R-66) porte le rayon à **2 = 18 cases**).
- **Montagne et Mer sont travaillables** bien qu'infranchissables pour les unités.
- **Assignation** : automatique à la fondation/à la croissance (meilleure case libre par priorité nourriture > production > commerce, tie-break déterministe R-81), **re-assignable manuellement** via le nouvel ordre `SetWorkedTile` (ville, case) — dans le rayon, libre (non travaillée par une autre ville).
- La ville affiche ses rendements cumulés (nourriture, production, commerce) — visibles dans le menu de ville et sous forme d'indicateurs sur la carte (affichage masquable).

**R-61 · Répartition du commerce.** ~~Répartie par un curseur global science/or (défaut `T-14` = 50/50)~~ — **remplacée par R-90 le 01/09/2026** (conversion binaire par ville ; le curseur global `player.scienceRatio` est déprécié).

**R-62 · Files de production.** Un seul item à la fois ; la progression est conservée en cas de remplacement. À complétion : l'unité apparaît sur la case de ville (si libre — sinon en attente, 🔶) et la **file est vidée** (validé le 29/08).

**R-63 · Croissance.** La population augmente quand la nourriture cumulée atteint le seuil **`10 × pop`** (règle Civ Revolution confirmée par Erik le 30/08 — la calibration 10→25 du même jour est **annulée** : elle compensait l'ancienne économie sans rendements réels ; avec les vrais rendements §2, le rythme Civ Rev 10×pop redevient la référence). v1 : **pas de consommation de nourriture** (100 % de la nourriture s'accumule, les citoyens ne « mangent » pas) ; à seuil atteint : +1 pop, jauge remise à zéro ; chaque point de population accorde `+T-16` de production et **1 citoyen de plus** (R-60).

**R-64 · Fondation.** `FoundCity` consomme le Colon → ville pop 1, **capitale** si première ville du joueur. Distance minimale entre villes : `T-09`.

**R-65 · Capture de ville.** Ville sans défenseur investie : changement de propriétaire, pop −1 (min 1), file de production effacée. **Capturer la capitale adverse = victoire (domination).**

**R-66 · Bâtiments d'amélioration des terrains (ajouté le 30/08).** Construits via la **file de production de la ville** (même mécanique que les unités, `SetProduction`), une fois bâtis ils sont **permanents et propres à la ville** :
- le bonus du bâtiment s'applique à **chaque case travaillée de son terrain** par cette ville (ex. Grenier : +1 N à chaque plaine travaillée par cette ville) ;
- le **Tribunal** est l'exception : il étend le rayon de travail de la ville de **1 à 2** (6 → 18 cases exploitables) ;
- un bâtiment n'est constructible **qu'une fois** par ville ; il est **perdu si la ville est capturée** (le captreur ne le récupère pas — 🔶 simplification) ;
- effets de combat : aucun (le « +50 % combat » de la table §2 est le bonus défensif du terrain colline, déjà en place).

| Bâtiment | Effet | Coût 🔶 |
|---|---|---|
| Grenier | +1 N par plaine travaillée | 20 |
| Atelier | +2 P par colline travaillée | 30 |
| Mine de fer | +4 P par montagne travaillée | 40 |
| Comptoir commercial | +2 C par désert travaillé | 30 |
| Port | +1 N par mer travaillée | 30 |
| Tribunal | rayon de travail 1 → 2 (6 → 18 cases) | 40 |

### 8.1 Technologies — Phase 7a (ajouté le 31/08, décisions d'Erik)

**Base : seuls le Guerrier et le Colon sont constructibles sans technologie** — tout autre item de production (unité ou bâtiment) exige la sienne (R-87).

**R-85 · Recherche.** Chaque joueur choisit **une technologie à la fois** via `SetResearch(techId)` — action **immédiate** (hors ordres de tour, validée serveur : tech existante, non débloquée, prérequis satisfaits). La science produite par les villes s'accumule sur la tech courante ; **la progression est conservée par technologie** en cas de changement ; le **débordement est reporté** sur la suivante. À complétion : événement `TechResearched` + débloquages immédiats (visibles dans les menus de production au tour suivant au plus tard).

**R-86 · Arbre relationnel.** Les technologies vivent dans `techs.json` : `{id, name, cost 🔶, prereqs[], unlocks{units[], buildings[], wonders[]}}` — avec **tests d'intégrité référentielle** (toute référence existe ; index inverse ; seule Guerrier/Colon et les items sans tech sont constructibles au départ). **Calibrage = édition du JSON + push** (CI déploie). Les **merveilles sont en données mais non constructibles** (effets : Phase 7 suite).

| Tech | Coût 🔶 | Prérequis 🔶 | Débloque |
|---|---|---|---|
| Alphabet | 20 | — | Bibliothèque ; merveille Oracle de Delphes |
| Travail du bronze | 20 | — | Archer (15) ; Caserne ; merveille Colosse de Rhodes |
| Poterie | 20 | — | Grenier ; merveille Jardins suspendus |
| Équitation | 20 | — | Cavalier (2/1/2, 20) |
| Travail du fer | 30 | Travail du bronze | Légion (2/1/1, 10) ; Atelier |
| Écriture | 30 | Alphabet | Espion *(données — mécaniques en Phase 7)* |
| Lettres | 40 | Écriture | Tribunal |
| Code des lois | 40 | Lettres | Comptoir commercial |
| Navigation | 50 | Poterie | Port ; Galère *(données — naval en Phase 7)* |

*Prérequis proposés d'après [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf) (extraction du 31/08) et marqués 🔶 — à calibrer librement, c'est le rôle de la base.*

**R-87 · Débloquage.** Un item de production est **proposé par l'UI et accepté par le serveur** ssi sa technologie (`tech` de sa donnée) est débloquée ou `null`. Les items verrouillés apparaissent grisés avec leur tech requise. Le joueur sans tech choisie accumule sa science en réserve (`scienceStored`) jusqu'au premier choix.

### 8.2 Économie de la ville — Phase 7b (ajouté le 01/09/2026, décisions d'Erik)

**R-90 (révisée) · Conversion du commerce, par ville.** Chaque ville convertit la **totalité** de son commerce en **or** ou en **science** — choix **binaire, par ville** (amende R-61 : plus de curseur global ; `player.scienceRatio` déprécié, conservé pour compat).
- Choix via `SetConversion(cityId, target)` — **action immédiate** (même contrat que `SetResearch` : traitée à la réception, visible en temps réel, autorisée en phase « orders » même verrouillé, refusée pendant la résolution). Bouton dans le menu de ville.
- **Défaut : or** — pour une ville neuve comme pour une ville capturée (le choix est réinitialisé à la capture, R-65).
- **Répercussion carte** : les cases **travaillées** par une ville (et sa case de ville) affichent l'icône **or ou science** selon sa conversion, au lieu du commerce ; les cases non travaillées gardent l'icône commerce (potentiel du terrain).
- Conséquence : toute ville avec ≥ 1 commerce produit 1 or OU 1 science minimum — le calibrage « science 0/tour » (remonté en 7a) disparaît par construction.

**R-88 · Bibliothèque (30 🔶, Alphabet).** Modifie la conversion de sa ville :
| Conversion de la ville | Sans bibliothèque | Avec bibliothèque |
|---|---|---|
| **Or** | `C` or, 0 science | `C` or, `max(1 ; round(C × 0,2))` science |
| **Science** | 0 or, `C` science | 0 or, `round(C × 1,5)` science |

Arrondi **au plus proche** (round half up). Cas limite tranché : même à **0 commerce**, une ville à bibliothèque génère **1 science/tour** (conversion or). Exemples validés par Erik : 5 commerce en or → 5 or + 1 science ; 12 commerce en or → 12 or + 2 science ; 12 commerce en science → 18 science.

**R-89 · Caserne (20 🔶, Travail du bronze).** Les **unités produites** par une ville avec Caserne sortent **vétérans** (+50 % A/D, T-01) — **hors Colons** (pacifiques, pas de combat). Ne se cumule pas avec la promotion par combat (R-32) pour les unités déjà vétérans.

**UI (Phase 7b).** Menu de ville restructuré en tableau de bord (identité / rendements avec durées en tours / citoyens / production à deux niveaux catégorisée). Le clic sur une ville interrompt un brouillon de déplacement en cours (le chemin soumis reste en place). Le bouton « Rendements » de la carte devient un cycle à 3 états : masqué → affiché → affiché **sans villes ni armées** (pour lire les icônes sous les entités).

### 8.3 Ressources — Phase 7c (ajouté le 01/09/2026, décisions D1–D6 d'Erik)

**Base : [`RECHERCHE-RESSOURCES.md`](RECHERCHE-RESSOURCES.md) §2** (données officielles CivRev sourcées) — les valeurs ci-dessous sont la table officielle. Tout est **éditable en données** (`resources.json`, même philosophie relationnelle que R-86) : le scénario étalon « déplacer Gemmes de montagne à colline » = éditer son champ `terrains`, rien d'autre. Champs : `{id, name, terrains[], yields{N/P/C}, revealedByTech, officialTech, culture, hiddenUntilRevealed, spawnWeight}`.

**R-91 · Données ressources.** Table fermée de **22 ressources** (miroir exact de la recherche §2) :

| Ressource | Terrain | Bonus | Tech (notre base) | officialTech |
|---|---|---|---|---|
| Bétail | Prairie | +3 N | Code des lois | Code of Laws |
| Blé | Prairie | +2 N | *(absente)* | Irrigation |
| Gibier | Forêt | +3 N | *(absente)* | Feudalism |
| Poisson | Mer | +2 N | Travail du bronze | Bronze Working |
| Baleine | Mer | +4 N | Navigation | Navigation |
| Fer | Colline | +2 P | Travail du fer | Iron Working |
| Chêne | Forêt | +3 P | *(absente)* | Construction |
| Marbre | Plaine | +2 P | *(absente)* | Masonry |
| Bœufs | Prairie | +2 P | Équitation | Horseback Riding |
| Charbon | Colline | +3 P | *(absente)* | Steam Power |
| Soufre | Désert | +3 P | *(absente)* | Gunpowder |
| Pétrole | Désert | +4 P | *(absente)* | Combustion |
| Caoutchouc | Forêt | +4 P | *(absente)* | Automobile |
| Aluminium | Colline | +4 P | *(absente)* | Mass Production |
| Uranium | Montagne | +4 P | *(absente)* | Nuclear Power |
| Teinture | Mer | +3 C | *(absente)* | Monarchy |
| Épices | Désert | +2 C | **aucune** | — |
| Vin | Plaine | +2 C | Poterie | Pottery |
| Or | Montagne | **+3 commerce** *(D3)* | *(absente)* | Currency |
| Gemmes | Montagne | **+2 commerce** *(D3)* | **aucune** | — |
| Encens | Prairie | **+2 culture** | *(absente)* | Ceremonial Burial |
| Soie | Plaine | **+3 culture** | Lettres | Literacy |

- **D4** : les 13 ressources dont la tech n'existe pas encore dans `techs.json` ont `revealedByTech: null` (visibles et actives en v1) + `officialTech` documentaire (jamais lu par le moteur) ; leur activation future = édition JSON quand la tech rejoindra l'arbre.
- **D2** : `culture` (Encens 2, Soie 3) est **porté en données, ignoré par le moteur** tant que le système culturel (grandes personnes/temples) n'est pas acté — même statut que `wonders.json` en 7a.
- `spawnWeight` est **réservé** à la génération procédurale (Phase 6b) — null = ressource posée uniquement par placement explicite.
- `hiddenUntilRevealed` (R-92) : `true` (défaut) = identité masquée par le marqueur « inconnue » tant que la tech manque ; `false` = icône réelle affichée d'office, bonus verrouillé (CivRev-fidèle).
- Tests d'intégrité en miroir des techs (R-86) : table fermée, terrains connus (≠ ville), `yields` ≥ 0 avec au moins un > 0 (ou `culture` > 0 — Encens/Soie), `revealedByTech` existant, `hiddenUntilRevealed: true` ⇒ tech non null, index inverse réciproque.

**R-92 · Ressource inconnue (D1 — révisée le 01/09/2026, décision d'Erik).** Sur une case explorée, la **présence** d'une ressource est toujours visible ; son **identité** dépend de la technologie : tant que `revealedByTech` n'est pas débloquée, l'état filtré diffuse le **marqueur `inconnue`** (icône « ? ») à la place de l'id réel — la civilisation voit bien qu'il y a une ressource particulière (ex. du pétrole), mais n'en connaît ni la nature ni l'usage. Au déblocage de la technologie, la ressource est diffusée sous son **identité réelle** (révélation passive, au snapshot suivant, comme R-85 — aucun événement). Divergence CivRev documentée (recherche §3) : le jeu original affiche l'icône réelle dès l'exploration ; chez nous l'identité est masquée jusqu'à la tech. Le marqueur n'est **jamais persisté** : il n'existe que dans l'état filtré (le serveur conserve l'id réel). Le **bonus**, lui, reste conditionné par l'accès à la tech, indépendamment de l'affichage : une ressource inconnue n'apporte rien (R-93). Variante data-driven : `hiddenUntilRevealed: false` diffuse l'icône **réelle** avant la tech (comportement CivRev-fidèle — visible, bonus verrouillé) ; aucune ressource v1 n'utilise ce cas.

**R-93 · Bonus de rendement.** Le rendement d'une case travaillée par une ville s'ajoute les `yields` de sa ressource **si le propriétaire de la ville y a accès** (tech débloquée ou `revealedByTech: null`) — R-60/R-66 : centre + Σ rendements effectifs des cases travaillées ; l'auto-assignation (priorité N > P > C, tie-break R-81) valorise alors naturellement les cases à ressource, déterminisme conservé. **D3 — divergence CivRev documentée** : Gemmes/Or donnent un bonus **direct au trésor** chez CivRev ; chez nous, un seul canal (N/P/C) → mappés **commerce** (`gemmes.commerce: 2`, `or.commerce: 3`), convertis or/science par la ville (R-90). Éditable en données.

**R-94 · Placement sur les cartes.** Tableau optionnel `resources: [{id, q, r}]` **inline dans chaque carte JSON** (D5) — données commises, calibrage par édition. Validations du loader : id connu, terrain de la case ∈ `terrains` de la ressource, au plus une ressource par case, jamais sur une case de capitale. **D6** : les 3 cartes sont dotées (pédagogique : quelques-unes, didactique ; pangée et variée : jeu complet — placements symétriques par miroir ponctuel pour variée-40, comme son terrain).

## 9. Phase D — Vision, soins, fin de tour

- **R-70 · Vision** : rayon `T-07` (unité) / `T-08` (ville), **distance uniquement** — aucun blocage par terrain. Recalcul par joueur à chaque résolution ; 3 états (inexploré / exploré-masqué / visible). `getFilteredState(state, player)` ne diffuse jamais d'entité hors du champ visible.
- **R-71 · Soins** 🔶 : +1 PV/tour si l'unité n'a ni bougé ni combattu ; +2 dans une ville amie. Plafonné au PV max.
- **R-72 · PM** : régénérés au maximum à chaque tour.
- **R-73 · Journal d'événements** : chaque mutation émet un événement typé (`Move`, `CombatExchange`, `UnitDestroyed`, `Captured`, `CityFounded`, `CityCaptured`, `ArmyFormed`, `Retreat`, …) séquencé — base de l'animation client, des notifications et du replay.

## 10. Déterminisme

- **R-80.** RNG **mulberry32** ; la graine vit dans le GameState (`rngSeed`) et avance **uniquement en Phase B**. Toute résolution interrompue peut être rejouée à l'identique depuis `{state, orders, seed}` (crash-recovery idempotent).
- **R-81.** Tous les tris sont déterministes et indépendants des joueurs : `unitId` croissant, `(q, r)` croissant, puis critères métier (PV décroissant, cases parcourues croissant).
- **R-82.** Interdits dans `/packages/rules` : `Math.random()`, `Date.now()`, itération dépendante de l'ordre d'insertion des Maps (toujours trier avant de parcourir).

## 11. Constantes réglables (source unique : `/packages/rules/src/constants.ts`)

| ID | Constante | Valeur v1 🔶 |
|---|---|---|
| T-01 | `veteranBonus` | 0.5 |
| T-02 | `cityDefenseBonus` | 0.5 |
| T-03 | `exchangesPerAttack` | 1 |
| T-06 | `forfeitMissedTurns` | 3 |
| T-07 | `visionRadiusUnit` | 2 |
| T-08 | `visionRadiusCity` | 3 |
| T-08b | `cityWorkRadius` | 1 (6 cases) — **2 (18 cases) avec Tribunal** (R-60/R-66) |
| T-09 | `minCityDistance` | 2 |
| T-10 | `armySize` | 3 |
| T-11 | `waterPassable` | false (v1) |
| T-12 | `settlerBootyGold` | 10 (moitié du coût) 🔶 |
| T-13 | `rangedRange` | 1 🔶 |
| T-14 | `scienceRatioDefault` | ~~0.5~~ **déprécié le 01/09/2026** — remplacé par R-90 (conversion binaire par ville) |
| T-15 | `growthBase` | **10 (seuil = 10 × pop)** — règle Civ Rev confirmée par Erik le 30/08 ; la calibration 10→25 du même jour est annulée (elle compensait l'absence de rendements réels) |
| T-16 | `popProductionBonus` | 0.25 🔶 |
| T-17 | `fortifyDefenseBonus` | 0.25 🔶 (R-33, ajouté le 30/08) |

## 12. Décisions d'interprétation (toutes tranchées — 29/08)

| ID | Question | Décision |
|---|---|---|
| I-1 | Mover bloqué par un ennemi ayant bougé ce tour | ✅ Combat d'attaque normal, même involontaire. Variante paix : repli mutuel si possible, sinon incident diplomatique sans rupture de paix (§7.7-b) |
| I-2 | Avancée de l'attaquant victorieux | ✅ Avancée systématique (l'attaque suppose des PM). Exception : unités à distance, jamais (§7.8) |
| I-3 | Sort du Colon vaincu | ✅ **Révisé** : destruction + butin en or au vainqueur (R-43, T-12) — pas de conversion |
| I-4 | Unités pacifiques vers une case ennemie | ✅ **Révisé** : capture systématique — destruction + butin en guerre ; détention + restitution ou butin + guerre auto en paix (R-43, §7.7-c) |
| I-5 | Bonus de fortification | ✅ **Révisé le 30/08** (demande d'Erik) : la fortification entre au v1 comme ordre `Fortify` — R-33, bonus T-17, permanent jusqu'à réactivation manuelle |

### 12.1 Interprétations d'implémentation validées en bloc (29/08, post-Phase 0)

| ID | Sujet | Règle validée |
|---|---|---|
| X-1 | Case d'origine (R-54) | Position **en début de tour** ; un attaquant sans mouvement dont l'origine est libre se replie sur place — sauf R-59-d : le défenseur à distance cède toujours la case |
| X-2 | Halte (R-42) | Seuls les ennemis **devenus visibles** ce tour (absents de la vision en début de tour) gèlent le chemin. Chemin invalide = effacé ; blocage/halte = gelé (repris plus tard) |
| X-3 | FormArmy | Ordre **consommé chaque tour** (à redonner si échec) ; des co-localisés sans fusion possible → **éparpillement déterministe** (le plus petit `unitId` reste sur place) |
| X-4 | Brouillard (R-70/R-73) | Ville ennemie visible seulement si sa **case** l'est ; journal filtré = événements publics, ou impliquant une entité du joueur, ou toutes références explorées/visibles ; `rngSeed` **masqué** dans l'état filtré |
| X-5 | Rounds sans riposte (R-59-b) | Chaque round retire directement 1 PV au défenseur (p = 1 côté attaquant) — garantit la terminaison de R-55 |

---

## Appendice A — Table des unités Civ Revolution (référence Phase 7)

Source : [CivFanatics — CivRev Units](https://civfanatics.com/civrev/civilopedia/units/). A.D.M = Attaque.Défense.Mouvement.

| Unité | Coût | Tech | A.D.M | Évolue en |
|---|---|---|---|---|
| Guerrier | 10 | — | 1.1.1 | Légion |
| Légion | 10 | Travail du fer | 2.1.1 | Chevalier |
| Archer | 10 | Travail du bronze | 1.2.1 | Piquier |
| Cavalier | 20 | Équitation | 2.1.2 | Chevalier |
| Piquier | 15 | Démocratie | 1.3.1 | Fusilier |
| Catapulte | 20 | Mathématiques | 4.1.1 | Canon |
| Chevalier | 25 | Féodalité | 4.2.2 | Char d'assaut |
| Fusilier | 20 | Poudre à canon | 3.5.1 | Infanterie moderne |
| Canon | 30 | Métallurgie | 6.2.1 | Artillerie |
| Infanterie moderne | 30 | Production de masse | 4.8.1 | — |
| Char d'assaut | 50 | Combustion | 10.6.3 | — |
| Artillerie | 50 | Automobile | 16.2.2 | — |
| Galère | 30 | — | 1.1.2 | Galion |
| Galion | 30 | Navigation | 2.2.3 | Croiseur |
| Croiseur | 40 | Machine à vapeur | 6.6.5 | — |
| Cuirassé | 80 | Acier | 12.18.4 | — |
| Sous-marin | 25 | Électricité | 12.2.2 | — |
| Chasseur | 30 | Flight | 6.4.8 | — |
| Bombardier | 60 | Vol avancé | 18.3.6* | — |
| Colon | 20 | — | 0.0.2 | — |
| Caravane | 30 | Monnaie | 0.0.3 | — |
| Espion | 25 | Écriture | 0.0.2 | — |
| Milice (défense de ville gratuite) | — | — | 0.1.1 | — |

\* Le bombardier doit se poser dans une ville toutes les 4 unités de mouvement.

**Unités à distance** (règles §7.8) : Catapulte, Canon, Artillerie — plus le bombardement naval/aérien en Phase 7.

## Appendice B — Sources

- [CivFanatics — Unités CivRev](https://civfanatics.com/civrev/civilopedia/units/) — table A.D.M complète.
- [Civilization Wiki — Army (CivRev)](https://civilization.fandom.com/wiki/Army_(CivRev)) — armée = 3 unités du même type, agit comme une entité unique.
- [GameFAQs — bonuses défense/attaque](https://gamefaqs.gamespot.com/boards/941688-sid-meiers-civilization-revolution/45581041) — existence des modificateurs (terrain, rivière, vétéran).
- [StrategyWiki — CivRev Units](https://strategywiki.org/wiki/Civilization_Revolution/Units) — règles de fusion en armée.
