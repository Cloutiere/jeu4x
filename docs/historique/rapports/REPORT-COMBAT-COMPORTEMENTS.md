# REPORT-COMBAT-COMPORTEMENTS — Ce qui est codifié lors des attaques

**Rapport de référence pour le pilotage du labo `#/labo-combat`** — extrait de `RULES.md`
(spécification) et du moteur pur `packages/rules/src/turn.ts` (implémentation, suite 818
tests). Le labo OBSERVE ce comportement ; rien de listé ici n'a été modifié.

---

## 1. Cadre de résolution

- Chaque tour = `resolveTurn(état, ordresParJoueur, seed)` : **pur et déterministe**
  (clone de l'état, RNG mulberry32 seedé — R-80 ; même seed = même résultat bit à bit).
- Phases : **A Mouvements → B Combats & replis → C Économie → D Vision/soins/PM**.
- Les ordres barbares sont générés en tête de résolution par `barbarianOrders(state)` (pur)
  et suivent les mêmes phases (R-95/R-97).
- Toute action illégale est rejetée **individuellement** (ordre tronqué/annulé), sans bloquer
  le tour.

## 2. Comment un combat se déclenche

| Déclencheur | Règle | Mécanique |
|---|---|---|
| Ordre `Attack` explicite | R-46 | Cible adjacente obligatoire. Attaque en Phase B. |
| **Entrée sur case** d'un ennemi stationnaire | R-42 | La marche s'exécute pas à pas (R-40/R-41) ; entrer sur la case d'un ennemi **qui n'a pas bougé ce tour** = **combat d'attaque** planifié. Le dernier pas « SUR » l'ennemi déclenche donc le combat même avec un simple `Move`/`MultiStep`. |
| Case visée simultanément par un mover ennemi | R-42/R-53 | **Collision** planifiée (voir §6) — pas un combat d'attaque. |
| Entrée sur une **ville ennemie défendue** | R-57 | = attaque du défenseur (stationnaire). |
| Entrée sur un **camp barbare défendu** | R-96 rév. | = **assaut de la pile** (voir §8). |

Ordre de résolution des combats (R-50) : tri par case `(q, r)` croissante puis `unitId`
d'attaquant croissant. Tous les combats planifiés sont systématiquement résolus.

**Halte de brouillard (X-2)** : hors labo, seuls les ennemis *devenus visibles ce tour*
gèlent un chemin (bloqué = gelé, repris plus tard). Dans le labo le fog est désactivé :
jamais de halte.

## 3. Qui se défend ? (choix du défenseur — R-52 rév. DÉFENSE-DE-PILE, 15/09)

Sur une case à **plusieurs unités** (pile de camp barbare, toute future co-location) :
1. **plus grande force de défense** (stat de base du type : guerrier 1, archer 2, piquier 3,
   legion 1, catapulte 1 déf., cavalier 1, fusilier 5, infanterie 8, cuirassé 18…) ;
2. à défense égale → **plus de PV courants** ;
3. dernier tie-break → **`unitId` croissant** (R-81).

Chaque unité tuée est **remplacée par la suivante** : assaut **un par un** tant que
l'attaquant est vivant. C'est le journal « ATTAQUE → échange → ATTAQUE → … » observé dans
le labo.

## 4. L'échange (R-51 + formule §7.4)

Une attaque = **T-03 échange(s)** (défaut **1 round**). Chaque round, un seul camp perd
**1 PV** — le perdant du round est tiré à la formule :

```
S_att = A × (1 + 0.50 si vétéran) [+ soutien naval R-118]
S_def = D × (1 + 0.50 si vétéran) × (1 + bonus terrain + 0.25 si fortifiée + bâtiments de ville)
p (l'attaquant touche) = S_att² / (S_att² + S_def²)
roll = rng(seed) → roll < p : le défenseur perd 1 PV, sinon l'attaquant perd 1 PV
```

- S = 0 d'un camp → touché à chaque round (p = 1 ou 0).
- Un combat **ne va jamais à mort en un échange** : la mort n'arrive que par attaques
  répétées (R-55) ou si les PV étaient déjà bas.
- **Bonus défensifs de terrain** (terrain.json) : forêt **+50 %**, colline **+50 %**,
  case de ville **+50 %** (T-02), prairie/plaine/désert 0 %, montagne et eau : infranchissables
  (bonus 0 pour l'eau, combats navals possibles en mer).
- **Bâtiments de ville** (défenseur en garnison de SA ville) : Palais **+50 %**, Remparts
  **+100 %** — cumulés au bonus de la case.
- **Fortification** (`Fortify`, R-33) : **+25 %** (T-17), permanent tant qu'aucun autre ordre
  n'est donné. Les barbares ne se fortifient jamais.
- **Soutien naval (R-118)** : un combat terrestre adjacent à la côte reçoit le MEILLEUR
  `navalSupport` d'un navire ami sur case d'eau adjacente (Galion 15, Croiseur 35,
  Cuirassé 65) — un seul navire compte, pas de cumul ; ne s'applique pas aux attaques de camps.
- **Vétérans (R-32)** : l'unité qui inflige le **coup fatal** devient vétéran (+50 % A/D).
  Une Caserne produit des vétérans (hors colons).

## 5. Issue d'une attaque et occupation de l'espace (R-52)

| Issue | Conséquence spatiale |
|---|---|
| **Défenseur à 0 PV** | Mort ; l'attaquant **avance systématiquement** sur la case libérée (I-2 : l'attaque suppose des PM disponibles). |
| **Attaquant à 0 PV** | Mort ; le défenseur **conserve sa case**. |
| **Survie mutuelle** (cas normal, 1 échange) | Le défenseur stationnaire **conserve sa case** ; l'attaquant est en **repli** (R-54). |

**Exception unités à distance (R-59 — catapulte, canon, artillerie ; portée T-13 = 1)** :
- attaque **depuis sa case**, **n'avance jamais**, même victorieuse ;
- **aucun dégât en retour** d'une cible de mêlée (pas de riposte ; X-5 : chaque round retire
  directement 1 PV au défenseur) ;
- cible elle-même à distance → échange standard, dégâts mutuels ;
- **en défense, rôles inversés** : une unité à distance attaquée qui ne vainc pas son
  attaquant **se replie systématiquement** (c'est le défenseur qui cède la case). À 0 PV, détruite.

## 6. Collision de mouvements (R-53)

Deux movers ennemis visant la **même case** : **aucun dégât**.
- Demeure celle qui a le **plus de PV courants** ; l'autre est en repli (R-54).
- Égalité de PV → demeure celle qui a parcouru **le moins de cases** ce tour ; seconde
  égalité → `unitId` le plus faible.
- Le perdant **sans case de repli** → attaques répétées (R-55) jusqu'à élimination d'une des deux.
- Exception R-43 : si l'une est **pacifique**, elle est **capturée** — pas de comparaison de PV.

## 7. Repli (R-54/R-56 + X-1)

**Choix de la case de repli, dans l'ordre :**
1. la **case d'origine** de l'unité perdante (position en **début de tour**, X-1) si libre —
   un attaquant sans mouvement dont l'origine est libre se replie **sur place** ;
2. sinon une **case adjacente libre** à la case de combat, choisie par **proximité à la case
   d'origine** (distance hexagonale), puis `(q, r)` croissant ;
3. sinon **pas de repli** → attaques répétées (R-55).

**Allocation concurrente (R-56, deux passes)** — l'allocation est **globale, pas
séquentielle** :
1. tous les combats de la phase se résolvent d'abord ; les perdants à replier sont collectés ;
2. les cases de repli libres sont allouées **par perdant à PV décroissants** (tie : `unitId`
   croissant), chacun reçoit sa meilleure case selon R-54 ;
3. un perdant **sans case attribuée** **reprend le combat** (attaque supplémentaire contre le
   vainqueur de son propre combat) jusqu'à élimination — les vainqueurs ne quittent jamais la
   case, donc la boucle est terminale.

**Attaques répétées (R-55)** : sans repli possible, les échanges se répètent (toujours
T-03 round(s) par itération) **jusqu'à élimination d'une des deux unités**. Mécanisme assumé
de « blocage » : encercler un attaquant force l'usure.

## 8. Barbares (R-95..R-99 + BARBARES-PILES 15/09)

- **Camp sans PV** : le camp n'est pas une cible ; la cible = les **barbares de la pile** sur
  sa case. Entrer sur un camp défendu = **assaut un par un** (meilleur défenseur d'abord,
  §3) tant que l'attaquant est vivant ; chaque échange est un combat complet (R-51, overrun,
  vétérans R-32 applicables) ; **survie mutuelle contre une garde → repli de l'attaquant**
  (R-52/R-54) ; la mort de l'attaquant arrête la séquence. Un camp **sans défenseur** est
  capturé à l'entrée (aucun combat) → **récompense hutte tirée au seed** (`VillageLooted`),
  camp détruit quand le DERNIER barbare meurt.
- **Garde minimale T-49 = 2** : les `gardeMinimale` PREMIERS barbares vivants dans l'ordre
  d'engendrement (`spawnedUnits`) **ne sortent jamais** (pas de `Move`) — le plus ancien
  garde, le dernier arrivé sort (au plus 1 avec cap T-22 = 3). Une pile de 1 ou 2 ne sort
  **personne**. **La garde contraint les SORTIES, pas le combat défensif** : une garde
  attaque toujours un ennemi adjacent.
- **Comportement par unité (R-97)**, dans l'ordre : 1) attaquer un ennemi/ville **adjacente** ;
  2) sinon avancer d'un pas vers l'ennemi le plus proche dans le rayon d'aggro **T-19**
  (constante actuelle : 6 — le labo a montré l'aggro à distance 2) ; 3) sinon tenir.
  Tie-breaks R-81 (distance puis `(q, r)`). Les barbares ne subissent pas la halte X-2.
- **Barbares et villes** : ils peuvent capturer une ville **sans défenseur** → la ville est
  **rasée** (`CityRazed`, bâtiments perdus, aucun changement de propriétaire). **Si la
  capitale d'un joueur est rasée, ce joueur perd** (`Victory` reason `razedCapital` au profit
  de l'adversaire réel — les barbares ne gagnent jamais). Capteur d'une unité pacifique :
  destruction mais **aucun butin** (pas de trésor).
- Les barbares **ne se fortifient pas**, soignent selon R-71, peuvent devenir vétérans.

## 9. Unités pacifiques (R-43) — colon, espion, caravane

- N'attaquent jamais, n'entrent pas dans un combat : aboutir sur une case ennemie = **capture**.
- **En guerre** : destruction + **butin en or T-12 = 10** au vainqueur (pas de conversion).
- **En paix** : détention ; au tour suivant le capteur choisit restitution ou butin +
  déclaration de guerre automatique.
- **Exceptions espion (7m)** : espion sur case d'ennemi **hors ville** → capturé (sans butin) ;
  espion entrant dans une ville → **infiltration** (ni attaque ni capture) ; une unité
  militaire qui entre sur la case d'un espion hors ville l'élimine **sans combat ni butin**.

## 10. Villes dans les combats (R-57 + §8.4)

- Ville **défendue** : entrer = attaque du défenseur (stationnaire, bonus case de ville +50 %
  + Palais +50 % / Remparts +100 % s'il s'agit de SA ville).
- Ville **sans défenseur** : **capture** à l'entrée — la ville change de propriétaire, les
  bâtiments sont **perdus**, les **merveilles survivent** (elles changent de mains), la case
  reste terrain `ville`, `wasCaptured` marqué (trait Mongol).
- Une unité pacifique vaincue dans une ville : destruction + butin, pas de changement de
  propriétaire.
- Par les **barbares** : razzia (voir §8).

## 11. Cas particulier — Grande Muraille (merveille, R-128)

Tant qu'elle est debout, l'adversaire **ne peut pas attaquer** les unités/villes de son
propriétaire (barbares compris) : ordre `Attack` → fizzle avant consommation de PM ; entrée
de case R-42 → **arrêt devant le défenseur**, chemin conservé. La **continuation forcée**
R-55/R-56-3 n'est pas bloquée (terminaison garantie). Obsolete à Ingénierie (union des techs).

## 12. Constantes de calibrage en vigueur (§11 RULES.md — NE PAS modifier depuis le labo)

| ID | Constante | Valeur |
|---|---|---|
| T-01 | `veteranBonus` | 0.50 |
| T-02 | `cityDefenseBonus` (case de ville) | 0.50 |
| T-03 | `exchangesPerAttack` | 1 |
| T-12 | `settlerBootyGold` | 10 |
| T-13 | `rangedRange` | 1 🔶 |
| T-17 | `fortifyDefenseBonus` | 0.25 |
| T-19 | `barbarianAggroRadius` | 6 🔶 (données : aggroRadius = 2 dans barbares.json — **écart à trancher au pilotage**) |
| T-49 | `gardeMinimale` | 2 |
| T-22 | cap de pile par camp | 3 |

## 13. Lecture du journal dans le labo (événements → règles)

| Événement | Sens |
|---|---|
| `Move` | Un pas de mouvement exécuté (un par case traversée, R-42). |
| `Attack` | Une attaque engagée — y compris CHAQUE itération d'attaques répétées (R-55) et chaque assaut de pile (un par un). |
| `CombatExchange` | Résultat d'un échange : PV des deux camps après l'échange (formule §7.4). |
| `UnitDestroyed` | Mort (+ auteur). L'attaquant vainqueur avance ; le défenseur vaincu reste sur place (nettoyé). |
| `Retreat` | Repli R-54 (origine ou case adjacente) — y compris les replis de collision R-53 et le repli systématique du défenseur à distance R-59-d. |
| `Captured` | Capture d'une unité pacifique (R-43) — outcome `destroyed` en guerre. |
| `BootyGold` | Butin T-12 (capture de colon). |
| `VillageLooted` / `VillageDestroyed` | Camp barbare pillé (récompense hutte seedée) / détruit à la mort du dernier barbare. |
| `CityCaptured` / `CityRazed` | Ville prise par un joueur / rasée par des barbares. |
| `Victory` | Fin de partie (domination `razedCapital`, etc.). |

## 14. Constats déjà observés dans le labo (e2e 15-16/09)

- Assaut de pile (2 gardes + explorateur vs 2 guerriers J1) : les gardes **ripostent depuis la
  pile** (la garde contraint les sorties, pas la défense), les perdants faibles **se replient**
  (R-54/R-56) — un repli de garde est donc possible sans qu'elle ait « sorti ».
- Dispute de destination (R-159/R-53) : la première programmée (priorité d'ordre) entre,
  l'ordre de l'autre est **tronqué sans dégât**.
- MultiStep + fondation (R-158) : sans PM restants au terme du chemin, la fondation est
  **annulée, le mouvement conservé**.

---

*Source : RULES.md §6-§7-§7.9/§7.8/§11 (R-30..R-61, R-95..R-99, R-149, T-01..T-49),
`packages/rules/src/turn.ts` (moteur pur, 818 tests verts), terrain.json/barbares.json
(données). Rapport généré pour la session d'ajustement d'Erik via `#/labo-combat`.*
