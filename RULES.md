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
- ~~Aucune unité à distance en v1~~ — **7e : R-59 implémentée réellement** (Catapulte, Canon, Artillerie, §7.8).
- Hors v1 (Phase 7) : ~~arbre technologique~~ (entré en 7a, **complété en 7e** — §8.1), ~~autres unités terrestres~~ (entrées en 7e), naval, espionnage, merveilles, grandes personnes (7f/7g/7h). *(Barbares & huttes : entrés en v1 en Phase 7d — §7.9.)*

## 2. Terrains (révision économique du 30/08 — décision d'Erik, modèle Civ Revolution)

| Terrain | Passable (unités) | Bonus défensif | Rendement de base (N/P/C) | Bâtiment d'amélioration | Bonus du bâtiment |
|---|---|---|---|---|---|
| Prairie | oui | 0 % | **2/0/0** | — | — |
| Plaine | oui | 0 % | **1/0/0** | Grenier | +1 Nourriture |
| Forêt | oui | **+50 %** (revu : était 25 %) | **0/2/0** | — | +50 % défense aux unités occupantes (déjà le rôle du bonus) |
| Colline | oui | +50 % | **0/1/0** | Atelier | +2 Production |
| Montagne | **non** (mais **travaillable par les villes**) | — | **0/1/0** | Mine de fer | +4 Production |
| Désert *(nouveau)* | oui | 0 % | **0/0/1** | Comptoir commercial | +2 Commerce |
| Mer *(côte — l'ex-« eau », productive)* | **non** (naval en Phase 7) | — | **0/0/2** | Port | +1 Nourriture |
| Océan *(nouveau 6c — eau profonde)* | **non** (naval en Phase 7) | — | **0/0/2** | — | — |
| Case de ville | oui | +50 % (T-02) | 2/1/1 | — | — |

- **C** = commerce : la matière première répartie entre **or** et **science** par le curseur global (R-61). Le champ `gold` des données reste le support du commerce.
- **Montagne et Mer sont travaillables par les villes** bien qu'infranchissables pour les unités (un citoyen exploite la case, il n'y marche pas). **L'Océan l'est aussi** (rendements identiques à la côte — décision d'Erik du 02/09 : seule la classe navale et le visuel distinguent les deux eaux).
- **Hook naval (`navalAccess`, Phase 6c — décision d'Erik du 02/09)** : les terrains d'eau portent `navalAccess` — Mer = `"coast"`, Océan = `"ocean"`. En Phase 7, l'unité navale portera le même champ (Galère = `"coast"`, Galion = `"ocean"`) et entrera dans une case d'eau si `terrain.navalAccess === "coast"` **ou** `unité.navalAccess === "ocean"`. Le Port garde son bonus sur la côte uniquement (recalibrage attendu avec le naval).
- Les bonus défensifs s'appliquent au **défenseur** uniquement ; le bonus défensif de la forêt passe de 25 % à **50 %** (table du 30/08).
- Les coûts de production des bâtiments : voir R-66. Les valeurs restantes marquées 🔶 sont des cibles de calibrage.

## 3. Unités, PV, armées

### 3.1 Caractéristiques

Chaque type d'unité : `attaque (A)`, `défense (D)`, `mouvement (M)`, `PV max`, `coût`, `rayon de vision`, capacités (`peutAttaquer`, `peutFonderVille`, `àDistance`). Est **pacifique** toute unité qui ne peut pas attaquer.

| Unité | A | D | M | PV max | Coût | Vision | Capacités | Tech |
|---|---|---|---|---|---|---|---|---|
| Guerrier | 1 | 1 | 1 | 3 | 10 | 2 | peutAttaquer | — (obsolète après Travail du fer, R-110) |
| Colon | 0 | 0 | 2 | 3 | 20 | 2 | peutFonderVille, **non-combattant**, **coût 2 population** (R-112) | — |
| Archer *(7a)* | 1 | 2 | 1 | 3 | **10** *(7e : corrigé 15→10, sources concordantes 🔶)* | 2 | peutAttaquer | Travail du bronze (obsolète après Démocratie) |
| Cavalier *(7a)* | 2 | 1 | 2 | 3 | 20 | 2 | peutAttaquer | Équitation |
| Légion *(7a)* | 2 | 1 | 1 | 3 | 10 | 2 | peutAttaquer | Travail du fer |

*(7e : le roster complet — Piquier, Catapulte 4/1/1 à distance, Chevalier, Fusilier, Canon à distance, Infanterie moderne, Char d'assaut, Artillerie à distance — est en données `units.json` jouable, plus les données seules naval/aérien/spéciales ; source : Appendice A + document « Technologies et Déblocages ». Espion, Caravane, Galère, Galion, Croiseur, Cuirassé, Sous-marin, Chasseur, Bombardier, Milice, ICBM : `implemented:false` — mécaniques 7f/7g.)*

### 3.1bis R-112 · Coût en population du Colon (7e — décision d'Erik du 02/09)

Comportement officiel CivRev adopté : le Colon coûte **20 production + 2 population de la ville** à sa PRODUCTION (la fondation reste la consommation de l'unité elle-même, R-64). Interprétation tranchée : la ville doit avoir `pop ≥ 2` ; à la complétion `pop = max(1, pop − 2)` et les citoyens excédentaires sont retirés (fin de liste, sans re-remplissage). Pop insuffisante à complétion : la file reste **en attente** (progression conservée, comme la case de ville occupée). Événement `PopulationConsumed`.

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
S_def = D × (1 + T-01 si vétéran) × (1 + bonus défensif du terrain + T-17 si fortifiée + bâtiments de ville)
p (l'attaquant touche) = S_att² / (S_att² + S_def²)
roll = rng() ∈ [0,1)  →  roll < p : le défenseur perd 1 PV, sinon l'attaquant perd 1 PV
```

- S = 0 pour un camp → il est touché à chaque round (p = 1 ou 0).
- **7e · Bâtiments de ville** : le défenseur en garnison de SA ville ajoute la somme des `cityDefenseBonus` de ses bâtiments (Palais +50 %, Remparts +100 %, §8.4) au bonus de la case de ville (T-02).
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

**R-59.** Catapulte, Canon, Artillerie (données 7e, **implémentées en 7e**) ; portée `T-13` 🔶 = 1.
- **a.** Une unité à distance attaque **depuis sa case** et **n'avance jamais**, même victorieuse (exception à I-2/R-52).
- **b.** Elle ne subit **aucun dégât en retour** si sa cible n'est pas elle-même une unité à distance (pas de riposte de mêlée).
- **c.** Cible à distance → échange standard, dégâts mutuels possibles (R-59-b s'applique dans les deux sens).
- **d.** En défense, une unité à distance attaquée qui **ne vainc pas** son attaquant (survie mutuelle) se **replie systématiquement** — rôles inversés par rapport à R-52 : c'est le défenseur qui cède la case, repli selon R-54. À 0 PV, elle est simplement détruite.

### 7.9 Barbares & huttes (Phase 7d — ajouté le 01/09/2026, transcription de [`HANDOFF-PHASE7D.md`](HANDOFF-PHASE7D.md))

**Principe directeur : les barbares sont un pseudo-joueur piloté par le moteur.** Aucune décision réseau, aucun verrou de tour : leurs ordres sont **générés à chaque résolution** par une fonction pure du moteur (`barbarianOrders(state)`), déterministe (RNG seedé R-80). Ils subissent les règles de combat, replis, forfait et fog comme tout le monde.

**R-95 · Faction barbare.** Pseudo-joueur `barbarien` (id moteur `barbarien`, constante `BARBARIAN_ID`) :
- n'a **ni ville fondable, ni recherche, ni verrou de tour** — il n'apparaît pas dans `state.players` (aucun trésor, aucun forfait T-06 : la défaite par forfait des joueurs réels n'est **pas affectée**) ;
- **en guerre permanente avec tout le monde** (R-58-a sans objet) ;
- ses unités respectent **toutes** les règles de combat/collision/repli (R-51..R-59) et sont **filtrées par le brouillard comme tout ennemi** (R-70) ;
- **anti-triche** : ses ordres ne sont **jamais envoyés aux clients** — seuls les événements résultants, filtrés par fog, quittent le moteur (les ordres ne sont pas persistés dans l'état) ;
- sa force **monte en gamme** (escalation) : **guerrier** d'abord, **archer** après le tour `T-23` 🔶 — règle d'engendrement commune à tous les spawns barbares (villages R-96 et embuscades R-98) ;
- les barbares soignent selon R-71, peuvent être vétérans (R-32), **ne peuvent pas se fortifier** (aucun ordre `Fortify` n'est jamais généré pour eux) ;
- en tant que capteur d'une unité pacifique (R-43), la destruction s'applique mais **aucun butin n'est crédité** (pas de trésor) ;
- les barbares **n'ouvrent pas les huttes** (R-98) : seules les unités des deux civilisations ouvrent.

**R-96 · Villages barbares.** Entités de carte (`villages: [{q, r}]` dans les JSON de carte) — **3 villages sur chacune des cartes 40×40** (placements symétriques/équitables ; CivRev les pose sur des ressources, nos placements s'y ancrent). Chaque village :
- engendre une unité barbare toutes les `T-18` 🔶 tours (compteur `spawnCountdown` initialisé à `T-18`, décrémenté à chaque résolution ; premier engendrement au **tour 3**) tant que son **cap d'unités vivantes** `T-22` 🔶 (par village, suivi par `spawnedUnits`) n'est pas atteint ; l'unité apparaît sur une **case adjacente libre** du village (tri `(q, r)` — R-81 ; un défenseur ne peut donc pas camper sur le village et le rendre inexpugnable) — si aucune case adjacente n'est libre, l'engendrement est **reporté** au cycle suivant ;
- est **attaquable** (`T-21` PV, défense 🔶 `villageDefense` de `barbares.json`, bonus défensif du terrain de sa case applicable) : entrer sur sa case = attaque (R-57 transposé ; une unité pacifique qui y entre est **capturée** — R-43/I-4) ; le village **subit les rounds R-51** sans jamais riposter (force d'attaque 0) ; survie mutuelle → l'attaquant se replie (R-54) ;
- à **0 PV il est détruit**, le vainqueur touche `T-20` 🔶 or (événements `VillageDestroyed` + `BootyGold`) ; un village détruit **disparaît définitivement** (la ressource éventuelle de sa case reste) ;
- un village **défendu par une de ses unités** se traite comme une ville défendue (R-57) : c'est l'unité qui combat.

**R-97 · IA barbare (déterministe).** `barbarianOrders(state)` — fonction pure, appelée **en tête de `resolveTurn`**, dont les ordres suivent les phases normales (mouvements → combats ; l'économie ne la concerne pas). Ordre de priorité **par unité** (unités triées R-81) :
1. **attaquer** une unité ou ville ennemie **adjacente** (case à défenseur = attaque du défenseur, R-57 ; ordre `Attack`) ;
2. sinon **avancer d'un pas** vers l'entité ennemie la plus proche (unité ou ville) dans un rayon d'aggro `T-19` 🔶 (première case de la ligne hexagonale ; case injoignable/occupée amicalement → tenir) ;
3. sinon **tenir** (`Hold`).
Tie-breaks R-81 partout (distance, puis `(q, r)`). **Les barbares ne subissent pas la halte X-2** : leurs ordres (un pas) sont régénérés à chaque résolution, la halte les figerait. Les barbares **peuvent capturer les villes sans défenseur** (R-57/R-65) : 🔶 **la ville est alors rasée** (événement `CityRazed` — elle disparaît, bâtiments perdus, aucun changement de propriétaire) — **si la capitale d'un joueur est rasée, ce joueur perd** : événement `Victory(reason:'razedCapital')` au profit de l'adversaire réel (les barbares ne gagnent jamais).

**R-98 · Huttes bonus.** Entités de carte (`huts: [{q, r}]`), **2 par carte**. Ouvrir = **entrer sur la case avec n'importe quelle unité des civilisations** (même pacifique), lors d'un pas de mouvement (Phase A) ; **une seule fois** (la hutte disparaît). Récompense tirée au RNG seedé (R-80) dans la table **`huttes.json`** (data-driven, éditable, poids 🔶) :
| Récompense | Effet |
|---|---|
| **or** | `T-25`..`T-26` 🔶 (tir uniforme) au trésor de l'ouvreur |
| **unité gratuite** | un guerrier engendré sur une case adjacente libre (escalade R-95 non appliquée : toujours guerrier) |
| **boost science** | `T-24` 🔶 sur la recherche courante (R-85 : réserve `scienceStored` si aucun choix) |
| **révélation de carte** | rayon 3 autour de la hutte ajouté à `explored` du joueur (pas à `visible`) |
| **embuscade** | 2 barbares engendrés **immédiatement, hors village** (cases adjacentes libres, cap des villages non affecté) |
| **rien** | aucun effet |
Événement `HutOpened(hutId, byPlayer, reward)` dans tous les cas. Tirages d'engendrement impossibles (aucune case adjacente libre) : récompense perdue, événement émis quand même.

**R-99 · Données de calibrage.** Toutes les constantes barbares/huttes vivent dans **`barbares.json`** (`spawnInterval`, `aggroRadius`, `villageDestructionGold`, `villageHP`, `capPerVillage`, `escalationTurn`, `units` d'escalade, `villageDefense`) et **`huttes.json`** (table de récompenses pondérée) — **zéro durcissement de règle dans le code** : calibrer = éditer le JSON + push (CI déploie), même philosophie que R-86/R-91. `constants.ts` ré-exporte les valeurs (source unique des T-18..T-26 côté code). Tests d'intégrité : table de récompenses fermée (kinds connus), poids ≥ 0 et somme > 0, bornes or cohérentes (`min ≤ max`), unités d'escalade existantes.

**Interprétations d'implémentation (signalées au rapport)** : entrer sur une hutte n'ouvre que lors d'un **pas de mouvement** (repli/collision gagnante n'ouvrent pas) ; une hutte sous ennemi s'ouvre à l'entrée (avant le combat planifié) ; le RNG est consommé **dès la Phase A** pour les récompenses (amendement R-80 documenté) ; l'escalade s'applique aux embuscades (guerrier des huttes excepté, table R-98) ; un colon entrant sur un village barbare est capturé (I-4).

## 8. Phase C — Économie (modèle Civ Revolution)

**R-60 · Cases travaillées par ville (révision 30/08 — modèle Civ Revolution).**
- La **case du centre-ville** est exploitée automatiquement et gratuitement : ses rendements s'ajoutent toujours, sans citoyen.
- Chaque point de population = **1 citoyen** = **1 case supplémentaire travaillée**, choisie parmi les cases environnantes dans le rayon de travail `T-08b` (**rayon 1 = 6 cases** ; le **Tribunal** (R-66) porte le rayon à **2 = 18 cases**).
- **Montagne et Mer sont travaillables** bien qu'infranchissables pour les unités.
- **Assignation** : automatique à la fondation/à la croissance (meilleure case libre par priorité nourriture > production > commerce, tie-break déterministe R-81), **re-assignable manuellement** via le nouvel ordre `SetWorkedTile` (ville, case) — dans le rayon, libre (non travaillée par une autre ville).
- La ville affiche ses rendements cumulés (nourriture, production, commerce) — visibles dans le menu de ville et sous forme d'indicateurs sur la carte (affichage masquable).

**R-61 · Répartition du commerce.** ~~Répartie par un curseur global science/or (défaut `T-14` = 50/50)~~ — **remplacée par R-90 le 01/09/2026** (conversion binaire par ville ; le curseur global `player.scienceRatio` est déprécié).

**R-62 · Files de production.** Un seul item à la fois ; la progression est conservée en cas de remplacement. À complétion : l'unité apparaît sur la case de ville (si libre — sinon en attente, 🔶) et la **file est vidée** (validé le 29/08).

**R-63 · Croissance.** La population augmente quand la nourriture cumulée atteint le seuil **`10 × pop`** (règle Civ Revolution confirmée par Erik le 30/08 — la calibration 10→25 du même jour est **annulée** : elle compensait l'ancienne économie sans rendements réels ; avec les vrais rendements §2, le rythme Civ Rev 10×pop redevient la référence). v1 : **pas de consommation de nourriture** (100 % de la nourriture s'accumule, les citoyens ne « mangent » pas) ; à seuil atteint : +1 pop, jauge remise à zéro ; chaque point de population accorde `+T-16` de production et **1 citoyen de plus** (R-60). **7e : l'Aqueduc réduit le seuil d'un tiers** (`round(10 × pop × 2/3)` 🔶 — §8.4) et l'**Usine double la production de la ville** (§8.4).

**R-64 · Fondation.** `FoundCity` consomme le Colon → ville pop 1, **capitale** si première ville du joueur. Distance minimale entre villes : `T-09`.

**R-65 · Capture de ville.** Ville sans défenseur investie : changement de propriétaire, pop −1 (min 1), file de production effacée. **Capturer la capitale adverse = victoire (domination).**

**R-66 · Bâtiments d'amélioration des terrains (ajouté le 30/08).** Construits via la **file de production de la ville** (même mécanique que les unités, `SetProduction`), une fois bâtis ils sont **permanents et propres à la ville** :
- le bonus du bâtiment s'applique à **chaque case travaillée de son terrain** par cette ville (ex. Grenier : +1 N à chaque plaine travaillée par cette ville) ;
- le **Tribunal** est l'exception : il étend le rayon de travail de la ville de **1 à 2** (6 → 18 cases exploitables) ;
- un bâtiment n'est constructible **qu'une fois** par ville ; il est **perdu si la ville est capturée** (le captreur ne le récupère pas — 🔶 simplification) ;
- effets de combat : aucun (le « +50 % combat » de la table §2 est le bonus défensif du terrain colline, déjà en place).

| Bâtiment | Effet | Coût (exacts, 7e) |
|---|---|---|
| Grenier | **+2 N par plaine travaillée** (amendement 7e — résout le point ouvert 6c) | 40 |
| Atelier | +2 P par colline travaillée *(tech : Construction depuis 7e)* | 60 |
| Mine de fer | +4 P par montagne travaillée *(tech : Chemin de fer depuis 7e)* | 80 |
| Comptoir commercial | +2 C par désert travaillé | 60 |
| Port | +1 N par mer travaillée | 100 |
| Tribunal | rayon de travail 1 → 2 (6 → 18 cases) *(tech : Littératie)* | 80 |

**7e · Coûts exacts et effets de ville — voir §8.4.** Les coûts des bâtiments sont désormais les valeurs officielles (civfanatics.com/civrev/civilopedia/buildings) : plus de coûts 🔶 de calibrage sur les bâtiments.

### 8.1 Technologies — Phase 7a (ajouté le 31/08, décisions d'Erik)

**Base : seuls le Guerrier et le Colon sont constructibles sans technologie** — tout autre item de production (unité ou bâtiment) exige la sienne (R-87).

**R-85 · Recherche.** Chaque joueur choisit **une technologie à la fois** via `SetResearch(techId)` — action **immédiate** (hors ordres de tour, validée serveur : tech existante, non débloquée, prérequis satisfaits). La science produite par les villes s'accumule sur la tech courante ; **la progression est conservée par technologie** en cas de changement ; le **débordement est reporté** sur la suivante. À complétion : événement `TechResearched` + débloquages immédiats (visibles dans les menus de production au tour suivant au plus tard).

**R-86 · Arbre relationnel (révisé en 7e — arbre COMPLET).** Les technologies vivent dans `techs.json` : `{id, name, cost 🔶, era, prereqs[], unlocks{units[], buildings[], wonders[]}, firstToDiscover?, obsoleteUnits?, obsoleteWonders?}` — avec **tests d'intégrité référentielle** (toute référence existe ; index inverse ; graphe sans cycle ; seule Guerrier/Colon et les items sans tech sont constructibles au départ — `palais` est `fixed`). **Calibrage = édition du JSON + push** (CI déploie). Les **merveilles sont en données mais non constructibles** (effets : 7f/7h).

**7e · L'arbre compte 46 technologies** (source principale : [`Civilization Révolution Technologies et Déblocages.md`](Civilization%20Révolution%20Technologies%20et%20Déblocages.md), croisée avec [CivFanatics — Technologies CivRev](https://civfanatics.com/civrev/civilopedia/technologies/)) réparties en **4 ères** (ancienne 18, médiévale 6, industrielle 12, moderne 10) avec coûts exacts 20 → 6740 et **prérequis multiples** (2-3). Écarts document/CivFanatics arbitrés en faveur de CivFanatics, marqués 🔶 : Écriture 40, Irrigation 60, Industrialisation 710. Divergence notable : l'**Archer** coûte 10 (15 dans l'ancienne base — corrigé, les deux sources concordent à 10). Les `unlocks` des ressources complètent la R-91 : les 14 ressources « absentes » de 7c ont désormais leur `revealedByTech` (D4 achevé). La table des 4 techs racines reste : Alphabet, Travail du bronze, Équitation, Poterie (20 chacune). Sauts technologiques (majorité des prérequis + finissable ≤ 10 tours) : **documenté, DIFFÉRÉ 7f+**.

**R-109 · Premier découvrir (7e).** Le premier joueur à COMPLÉTER une tech en tire la récompense `firstToDiscover` (données). État : `GameState.firstBy: Record<techId, playerId>` — **migration `schemaVersion` 8→9** (champ additif `firstBy: {}` + Palais posé dans les capitales existantes). Application (moteur, `firstDiscovery.ts`) : or immédiat, **unité gratuite** (case de la première ville — capitale prioritaire — sinon adjacente libre ; ignorée si l'unité n'est pas implémentée), **bâtiment gratuit** (première ville, remplacement appliqué), **population instantanée** (+1 pop dans toutes les villes, citoyens auto-assignés), **bonus perCity par tour** (or/science/production/commerce — cumulés à la Phase C via `empirePerCityBonus`), **remises de coût empire** (Communisme −33 % Usines, Réseautage −50 % Universités, plafond 90 %), **révélation de carte** (Vol spatial). Récompenses décrites mais NON appliquées (documenté) : Personnages illustres (7h), volet culture de `perCity` (7f), unités non implémentées (Espion, Croiseur, Sous-marin, Chasseur, Bombardier, Cuirassé). Événement `FirstDiscovered`.

**R-110 · Obsolescence (7e).** Données `obsoleteUnits[]` par tech : Travail du fer → Guerrier ; Démocratie → Archer ; Navigation → Galère ; Poudre à canon → Piquier ; Production de masse → Fusilier ; Combustion → Chevalier ; Automobile → Canon. Une unité obsolète est **retirée du menu de production** (`isUnitObsolete`) et refusée au `SetProduction` ; les unités existantes sont **conservées**. Surclassement automatique (Atelier de Léonard) : 🔶 différé 7f+. Données `obsoleteWonders[]` (Stonehenge par Littératie, etc.) — effets en 7f/7h.

**R-111 · Remplacement d'infrastructures (7e).** Champs `requiresBuilding` + `replaces` : la **Banque** (120) exige un Marché et le **retire** de la ville ; l'**Université** (160) remplace la Bibliothèque ; la **Cathédrale** (160) remplace le Temple. Validation au `SetProduction` : prérequis de bâtiment manquant = refus. UI : items verrouillés « Requiert : <bâtiment> ».

**R-87 · Débloquage (étendu 7e).** Un item de production est **proposé par l'UI et accepté par le serveur** ssi sa technologie (`tech` de sa donnée) est débloquée ou `null`, **qu'il est implémenté**, **qu'il n'est pas obsolète** (R-110) et, pour un bâtiment, **qu'il n'est pas fixe** (Palais), **pas déjà construit** (R-66) et **sans prérequis de bâtiment manquant** (R-111) — fonctions `isProducible`/`canSetProduction`. Les items verrouillés apparaissent grisés avec leur tech requise. Le joueur sans tech choisie accumule sa science en réserve (`scienceStored`) jusqu'au premier choix.

### 8.2 Économie de la ville — Phase 7b (ajouté le 01/09/2026, décisions d'Erik)

**R-90 (révisée) · Conversion du commerce, par ville.** Chaque ville convertit la **totalité** de son commerce en **or** ou en **science** — choix **binaire, par ville** (amende R-61 : plus de curseur global ; `player.scienceRatio` déprécié, conservé pour compat).
- Choix via `SetConversion(cityId, target)` — **action immédiate** (même contrat que `SetResearch` : traitée à la réception, visible en temps réel, autorisée en phase « orders » même verrouillé, refusée pendant la résolution). Bouton dans le menu de ville.
- **Défaut : or** — pour une ville neuve comme pour une ville capturée (le choix est réinitialisé à la capture, R-65).
- **Répercussion carte** : les cases **travaillées** par une ville (et sa case de ville) affichent l'icône **or ou science** selon sa conversion, au lieu du commerce ; les cases non travaillées gardent l'icône commerce (potentiel du terrain).
- Conséquence : toute ville avec ≥ 1 commerce produit 1 or OU 1 science minimum — le calibrage « science 0/tour » (remonté en 7a) disparaît par construction.

**R-88 · Bibliothèque (40 — coût exact 7e, Alphabet).** Modifie la conversion de sa ville :
| Conversion de la ville | Sans bibliothèque | Avec bibliothèque |
|---|---|---|
| **Or** | `C` or, 0 science | `C` or, `max(1 ; round(C × 0,2))` science |
| **Science** | 0 or, `C` science | 0 or, `round(C × 1,5)` science |

Arrondi **au plus proche** (round half up). Cas limite tranché : même à **0 commerce**, une ville à bibliothèque génère **1 science/tour** (conversion or). Exemples validés par Erik : 5 commerce en or → 5 or + 1 science ; 12 commerce en or → 12 or + 2 science ; 12 commerce en science → 18 science. **7e** : les multiplicateurs sont data-driven (`scienceMult`/`goldMult`) — Marché ×2 or, Banque ×4 or (R-111 : remplace le Marché), Université ×4 science (R-111 : remplace la Bibliothèque, le bonus résiduel disparaît avec elle).

**R-89 · Caserne (40 — coût exact 7e, Travail du bronze).** Les **unités produites** par une ville avec Caserne sortent **vétérans** (+50 % A/D, T-01) — **hors Colons** (pacifiques, pas de combat). Ne se cumule pas avec la promotion par combat (R-32) pour les unités déjà vétérans.

**UI (Phase 7b).** Menu de ville restructuré en tableau de bord (identité / rendements avec durées en tours / citoyens / production à deux niveaux catégorisée). Le clic sur une ville interrompt un brouillon de déplacement en cours (le chemin soumis reste en place). Le bouton « Rendements » de la carte devient un cycle à 3 états : masqué → affiché → affiché **sans villes ni armées** (pour lire les icônes sous les entités).

### 8.3 Ressources — Phase 7c (ajouté le 01/09/2026, décisions D1–D6 d'Erik)

**Base : [`RECHERCHE-RESSOURCES.md`](RECHERCHE-RESSOURCES.md) §2** (données officielles CivRev sourcées) — les valeurs ci-dessous sont la table officielle. Tout est **éditable en données** (`resources.json`, même philosophie relationnelle que R-86) : le scénario étalon « déplacer Gemmes de montagne à colline » = éditer son champ `terrains`, rien d'autre. Champs : `{id, name, terrains[], yields{N/P/C}, revealedByTech, officialTech, culture, hiddenUntilRevealed, spawnWeight}`.

**R-91 · Données ressources.** Table fermée de **22 ressources** (miroir exact de la recherche §2) :

| Ressource | Terrain | Bonus | Tech (notre base) | officialTech |
|---|---|---|---|---|
| Bétail | Prairie | +3 N | Code des lois | Code of Laws |
| Blé | Prairie | +2 N | *(absente)* | Irrigation |
| Gibier | Forêt | +3 N | *(absente)* | Feudalism |
| Poisson | Mer, Océan | +2 N | Travail du bronze | Bronze Working |
| Baleine | Mer, Océan | +4 N | Navigation | Navigation |
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
| Teinture | Mer, Océan | +3 C | *(absente)* | Monarchy |
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

## 8.4 Bâtiments à effets de ville — Phase 7e (ajouté le 02/09/2026)

Les bâtiments portent des effets **data-driven** (`buildings.json`) appliqués par le moteur. Tous les libellés sont visibles en UI ; les effets culturels sont **inertes jusqu'à 7f** (`culturePerCitizen`).

| Bâtiment | Coût | Tech | Effet (champ moteur) | Actif |
|---|---|---|---|---|
| Palais | 0 (`fixed`) | — | +50 % défense de garnison (`cityDefenseBonus: 0.5`) — posé par le moteur dans la capitale (fondation + migration v9) | ✅ |
| Caserne | 40 | Travail du bronze | Unités terrestres produites vétérans (R-89 ; hors pacifiques) | ✅ |
| Temple | 40 | Rites funéraires | +1 Culture/citoyen (`culturePerCitizen`) | 7f |
| Bibliothèque | 40 | Alphabet | Science ×1,5 + science résiduelle en conversion or (R-88, inchangée) | ✅ |
| Comptoir commercial | 60 | Code de lois | +2 C par désert travaillé | ✅ |
| Atelier | 60 | Construction | +2 P par colline travaillée | ✅ |
| Marché | 60 | Monnaie | Or ×2 (`goldMult: 2`) | ✅ |
| Tribunal | 80 | Littératie | Rayon de travail 1 → 2 | ✅ |
| Mine de fer | 80 | Chemin de fer | +4 P par montagne travaillée | ✅ |
| Port | 100 | Navigation | +1 N par mer travaillée (côte seule) | ✅ |
| Remparts | 100 | Maçonnerie | +100 % défense de garnison (`cityDefenseBonus: 1.0`) + immunité conversion culturelle | ✅ (immunité 7f) |
| Aqueduc | 120 | Ingénierie | Seuil de croissance −⅓ (`growthThresholdReduction: 0.33` 🔶) — R-63 | ✅ |
| Banque | 120 | Banque | Or ×4 — R-111 (requiert Marché, le remplace) | ✅ |
| Cathédrale | 160 | Religion | +2 Culture/citoyen — R-111 (requiert Temple, le remplace) | 7f |
| Université | 160 | Université | Science ×4 (`scienceMult: 4`) — R-111 (requiert Bibliothèque, la remplace) | ✅ |
| Usine | 200 | Industrialisation | Production de la ville ×2 (`productionMult`) | ✅ |
| Défense SDI | 200 | Supraconducteur | Protège des ICBM (mécanique 7g+) | données |
| Composants du Vaisseau (×4) | 80/120/200/400 | Vol spatial | Victoire scientifique | 7h |

- **Multiplicateurs** : le meilleur multiplicateur présent gagne (`scienceMultOf`/`goldMultOf`, `conversion.ts` — source unique moteur/UI). L'Université remplace la Bibliothèque : le bonus résiduel R-88 disparaît avec elle. L'Usine multiplie la production brute avant le bonus de population (R-63).
- **Aqueduc** : seuil de croissance `round(10 × pop × (1 − 0.33))` 🔶.
- **Défense** : les `cityDefenseBonus` s'additionnent dans `S_def` (§7.4) pour le défenseur en garnison de SA ville (Palais 0,5 + Remparts 1,0 → bonus total +150 %).
- **Migration v8 → v9** : `firstBy: {}` (R-109) + Palais ajouté aux capitales existantes. Les nouvelles fondations reçoivent le Palais directement (R-64, moteur).

## 9. Phase D — Vision, soins, fin de tour

- **R-70 · Vision** : rayon `T-07` (unité) / `T-08` (ville), **distance uniquement** — aucun blocage par terrain. Recalcul par joueur à chaque résolution ; 3 états (inexploré / exploré-masqué / visible). `getFilteredState(state, player)` ne diffuse jamais d'entité hors du champ visible.
- **R-71 · Soins** 🔶 : +1 PV/tour si l'unité n'a ni bougé ni combattu ; +2 dans une ville amie. Plafonné au PV max.
- **R-72 · PM** : régénérés au maximum à chaque tour.
- **R-73 · Journal d'événements** : chaque mutation émet un événement typé (`Move`, `CombatExchange`, `UnitDestroyed`, `Captured`, `CityFounded`, `CityCaptured`, `ArmyFormed`, `Retreat`, …) séquencé — base de l'animation client, des notifications et du replay.

## 10. Déterminisme

- **R-80.** RNG **mulberry32** ; la graine vit dans le GameState (`rngSeed`) et avance **uniquement en Phase B** — et, depuis la Phase 7d, aux **ouvertures de huttes** (récompense R-98, Phase A). Toute résolution interrompue peut être rejouée à l'identique depuis `{state, orders, seed}` (crash-recovery idempotent).
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
| T-18 | `barbarianSpawnInterval` | 3 🔶 (R-96, Phase 7d — valeur dans `barbares.json`) |
| T-19 | `barbarianAggroRadius` | 6 🔶 (R-97, Phase 7d) |
| T-20 | `villageDestructionGold` | 25 🔶 (R-96, Phase 7d) |
| T-21 | `villageHP` | 3 🔶 (R-96, Phase 7d) |
| T-22 | `capPerVillage` | 2 🔶 (R-96, Phase 7d) |
| T-23 | `escalationTurn` | 15 🔶 (R-95 : archer après ce tour, Phase 7d) |
| T-24 | `hutScienceBoost` | 20 🔶 (R-98, Phase 7d) |
| T-25 | `hutGoldMin` | 15 🔶 (R-98, Phase 7d) |
| T-26 | `hutGoldMax` | 50 🔶 (R-98, Phase 7d) |

*(T-18..T-26 : la source des valeurs est `barbares.json`/`huttes.json` — R-99 ; `constants.ts` les ré-exporte. Le texte de R-96 du handoff citait `T-24` pour le cap par village et la liste des constantes `T-22` : normalisé **T-22**, erratum signalé au rapport.)*

## 11bis. Génération procédurale des cartes — Phase 6b (ajouté le 02/09/2026, transcription de [`HANDOFF-PHASE6B.md`](HANDOFF-PHASE6B.md), base documentaire : [`Génération Procédurale Cartes Civilization.pdf`](Génération%20Procédurale%20Cartes%20Civilization.pdf))

Le générateur vit dans `/packages/rules/src/progen/` — **pur, déterministe (R-80), sans IO**. Il produit un `MapData` au format exact des cartes préfabriquées et passe la même validation `parseMap` (aucun changement du loader). Architecture : couche géophysique (L0) qui **ne connaît rien du miroir**, et **stratégie de placement injectable** (`StartPlacementStrategy`). Détails et guide d'extension multi-joueurs : [`packages/rules/src/progen/README.md`](packages/rules/src/progen/README.md).

- **R-100 · Bruit & géophysique** : altitude = fBm Perlin seedé (implémentation maison) normalisée 0..100 ; lignes de rift simples abaissant l'altitude avant seuillage ; **le ratio terre/eau est calé par seuil au percentile** (cible 🔶 55 %) ; climat latitudinal (bande équatoriale sèche → désert, températures humides → prairie/forêt, gradient modulé par l'altitude) ; reliefs secondaires par masques de bruit (montagnes infranchissables, collines, forêts sur terres humides tempérées/froides). Pas de rivières (hors périmètre moteur). **Phase 6c (demandes d'Erik)** : calibrage 🔶 PAR TYPE de tuile (montagnes, collines, forêts, **déserts**, **prairies↔plaines** — le curseur global d'humidité quitte le labo) et **mosaïque** 🔶 `terrainPatchScale` = 0.3 : la fréquence des masques de relief/climat est multipliée par ~3,3, soit des zones nettement plus diversifiées (l'échelle des continents, elle, ne bouge pas ; l'eau garde « ratio terre » + « largeur des côtes »). Aux extrêmes de ces calibreurs, un terrain porteur peut devenir trop rare pour la garantie R-108 → échec explicite (plage saine ≈ 0.3–0.7). **Pénétration de l'eau** : rifts intérieurs 🔶 2 (au lieu de 1) de profondeur 🔶 `riftDepth` = 48 (au lieu de 32) — des séparations naturelles plus marquées à l'intérieur des continents. **Topographie ARCHIPEL par défaut (Phase 6c, demande d'Erik)** : `continents` = 3 — topographie centrée sur l'eau (CivRev « islands ») : grande étendue d'eau au centre (dépression gaussienne), petits continents et chapelets d'îlots de 1-5 cases (fréquence du bruit d'altitude ×1.6), ratio terre effectif 🔶 `landRatio` × `archipelagoLandScale` = 0.7 (~38 % de terre) ; **la connexité terrestre des spawns n'y est PAS requise** (contact au naval, Phase 7). Pangée et deux continents restent disponibles. **Valeurs de base d'Erik (02/09)** : forêts 36 %, déserts 35 %, prairies 20 %, mosaïque ×0.30.
- **R-101 · Validité** : toute carte générée passe `parseMap` (terrains connus, spawns praticables, capitales ≥ 12, placements R-94/R-96/R-98) et garantit la **connexité terrestre entre les deux spawns** (BFS sur cases praticables). Tentatives par sous-graines dérivées du seed (`maxAttempts` 🔶 10) puis échec explicite.
- **R-102 · Miroir 1v1** (stratégie `mirror1v1`) : demi-carte 40×20 générée par L0 puis reflétée par **rotation 180°** (`rows[r][c] === rows[39-r][39-c]` — isométrie hex exacte, miroir colonne-à-colonne écarté car faussé par l'offset axial). Tout ce qui existe côté joueur 1 existe à l'identique côté joueur 2 : terrain, ressources, villages, huttes. `mirror1v1` exige `playerCount = 2`.
- **R-103 · Fertilité & normalisation** : score = Σ anneaux 1/2/3 pondérés 🔶 [1.0, 0.6, 0.3] × (nourriture ×2 + production ×1.5 + commerce ×1), pénalité 🔶 par montagne (la montagne reste travaillable R-60) ; ressources incluses. Site de capitale = meilleur candidat praticable (≥ 6 des bords, ≥ T-09 de l'axe, distance au site image ≥ 12, ≥ 1 voisin libre pour le Guerrier). **Anneau de départ équilibré (Phase 6c, demande d'Erik)** : les 6 cases entourant le site comptent AU MOINS 🔶 `startMinRingPrairie` = 2 prairies et 🔶 `startMinRingForest` = 2 forêts, et **AUCUNE ressource** — le départ « ne coûte aucun PM », ne doit rien à la chance des poses. **Démarrage COLON + Guerrier sans capitale (Phase 6c, décision d'Erik)** : les cartes procédurales portent `start: "colon"` — le Colon OCCUPE le site réservé (fondation à coût nul via FoundCity R-64, ou déplacement assumé), le Guerrier est adjacent, **aucune ville à l'initialisation** ; la première ville fondée devient capitale (R-64) et la victoire par domination redevient possible après fondation. Les cartes préfabriquées restent en démarrage `capital` (défaut du champ optionnel `MapData.start`). **Normalisation** (PDF §NormalizeStartLocation) : si le site est sous le seuil 🔶 (moyenne des N=5 meilleurs sites × 0.8), injecter bétail/blé (données R-91) — **anneau 2 uniquement** (l'anneau 1 du site reste sans ressource) — jusqu'au seuil, échec explicite sinon ; la garantie de couverture R-108 exclut aussi l'anneau des capitales. Checksum d'équité (delta P1−P2 = 0 par miroir, score ≥ seuil) consigné dans `meta.progen` → dump admin.
- **R-104 · Contenu reflété** : ressources posées sur la demi-carte AVANT le choix du site ; villages 🔶 **6** et huttes 🔶 **6** par demi-carte (Phase 6c, demande d'Erik), reflétés → **12 villages / 12 huttes** par carte procédurale (le miroir exige des effectifs pairs). **Trois distances indépendantes 🔶 (Phase 6c)** : villages entre eux (`villageSpacing` 6), huttes entre elles (`hutSpacing` 3), huttes ↔ villages (`hutVillageSpacing` 2 — une hutte jamais À CÔTÉ d'un village, mais plus près autorisé que d'une autre hutte) ; distances aux départs inchangées (villages ≥ 6, huttes ≥ 3 — leçon calibrage 7d). Les contraintes portent sur la carte COMPLÈTE (images miroir comprises).
- **R-105 · Ressources pondérées** : tirage pondéré par `spawnWeight` de `resources.json` (champ réservé en 7c, rempli 🔶) restreint aux terrains autorisés ; densité cible 🔶 **×1.5** (~1 ressource / 8 cases de terre — Phase 6c, demande d'Erik ; ressources marines ~×1.5/48). « Blé » élargi aux plaines 🔶 (pose de normalisation sur plaine possible — CivRev : blé sur plaine). **La garantie de couverture R-108 passe AVANT le tirage aléatoire** : chaque type a sa case réservée (choix « point le plus éloigné », ordre par rareté du terrain éligible) et le tirage ne peut plus saturer un terrain avant elle. **`extraSpawnScale` (Phase 6c, demande d'Erik)** : tirage supplémentaire FORCÉ par terrain, en multiple de la probabilité de base de la classe — poisson `{ eau: 1.5 }` ≈ **présence ×4 sur les côtes** (données `resources.json`). **RÉVISION du 02/09 (Erik) — océan stérile** : baleine, poisson et teinture reviennent sur la côte seule (`terrains: ["eau"]`) et **aucune ressource ne pose sur l'océan** ; conséquence mécanique : les marines sont posées APRÈS la classification des eaux, sur la grille complète (garantie + tirage, par paires miroir) — le tirage terrestre les exclut (`skipIds`).
- **R-106 · Stratégie injectable** : `StartPlacementStrategy` (`geoSize`/`fullSize`/`build`) ; `mirror1v1` seule implémentation en 6b. Le support 2-5 joueurs exigeront **uniquement** la stratégie `regionalMulti` (partitionnement régional + fertilité multi-anneaux + normalisation relative, PDF §AssignStartingPlots) sans toucher à la couche géophysique ni au loader. `GameCreationSettings.playerCount` est déjà propagé (lobby → GameDO → meta).
- **R-107 · Côte vs océan (Phase 6c, décision d'Erik du 02/09)** : après miroir, les eaux de la carte COMPLÈTE sont classifiées — une case d'eau à ≤ `coastWidth` 🔶 (1) cases hex d'une terre est de la **côte** (`eau`), le reste est de l'**océan** profond (`ocean`). Classifié sur la carte complète (le bord ouvert de la demi-carte rendrait le calcul local faux) ; idempotent et pur (`classifyWaters`). Rendements de l'océan **0/0/2** (identiques à la côte) ; les 3 ressources marines (R-94) spawneront sur les deux eaux, même densité 🔶 ~1/48. Rapport de génération : `coastTiles`/`oceanTiles` (dump admin).
- **R-108 · Équité du contenu (Phase 6c, demandes d'Erik)** : **espacement des ressources** — distance hex minimale 🔶 `minResourceDistance` = 2 (« une case entre deux ») entre TOUTES les paires de ressources de la carte COMPLÈTE (poses aléatoires, injections de normalisation et **images miroir comprises** : jamais deux ressources adjacentes à travers l'axe) ; **garantie de couverture** — au moins 🔶 `minPerResourceType` = 1 pose de CHAQUE ressource (R-91..R-93) **par joueur**, entendu par demi-carte miroir (≥ 2×N sur une carte 1v1 ; pérenne pour `regionalMulti`). La garantie passe APRÈS le retrait des ressources des capitales et comble les manques par paires (pose + image), espacement et cases de capitales respectés — échec explicite sinon (tentative suivante). À densité 0, la garantie seule maintient les 22 types.
- **Couverture des terrains (vérification)** : les terrains générés couvrent les 8 types de terrain.json sur les seeds de référence (testé) — `ville` excepté, qui n'est jamais un terrain de carte mais l'entité posée par `createInitialState` sur les capitales. Pas de garantie forcée par type de terrain (calibrage à la demande).
- **Labo `#/progen`** (client-side, sans partie) : le même module tourne dans le navigateur — seed saisissable + aléatoire, curseurs des réglages 🔶 avec régénération à la volée (dont **largeur des côtes** 1-3, **écart ressources** 1-4, **min par type** 0-2), rendu sans fog via `GameCanvas` (état synthétique tout-visible), **tooltip de survol** (terrain + ressource/ville/unité/village/hutte — source : état filtré, ne révèle rien de caché), heatmap de fertilité, rendements N/P/C, checksum d'équité (+ répartition côte/océan), **panneaux « terrains par type » et « ressources par type et par terrain »** (`countTerrainTypes` / `countResourcesByTerrain` — absences visibles en grisés, inspection d'Erik), export JSON du `MapData` (téléchargement/copie).

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
