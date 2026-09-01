# RECHERCHE-RESSOURCES.md — Terrains, ressources et culture dans Civilization Revolution (référent officiel)

Date : 01/09/2026 · Phase 7c L1 (recherche documentaire déléguée, aucune implémentation).
Référentiel : **Sid Meier's Civilization Revolution** (2008, console/DS). La référence locale [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf) (arbre technologique officiel, ci-après « le PDF ») est croisée avec le wiki Civilization Fandom (via web.archive.org — fetch direct bloqué 403) et les guides GameFAQs (via Wayback). Chaque affirmation porte sa source ; ce qui n'a pas pu être établi est marqué **[non tranché]**.

---

## 1. Terrains de Civ Revolution — liste exhaustive

Source principale : [Terrain (CivRev)](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Terrain_(CivRev)). La liste est **fermée : 7 terrains + 1 trait (rivière)**. **Il n'existe ni oasis ni glace/toundra dans CivRev** (aucune occurrence sur la page Terrain ni dans les listes de ressources/bâtiments).

| Terrain | Rendement officiel | Modificateurs (bâtiments/bonus de nation) | Combat |
|---|---|---|---|
| Prairie (Grassland) | +2 Nourriture | — | — |
| Plaine (Plains) | +1 Nourriture | +1 N avec Grenier | — |
| Forêt (Forest) | +2 Production | +1 P bonus allemand (ère médiévale) | **+50 % défense** |
| Colline (Hill) | +1 Production | +2 P avec Atelier (Workshop) | **+50 % attaque ET défense** |
| Montagne (Mountain) | +1 Production | +4 P avec Mine de fer | — (impassable, sauf unités aériennes Fighter/Bomber) |
| Désert (Desert) | +1 Commerce | +2 C avec Comptoir (Trading Post) | — |
| Mer (Sea) | +2 Commerce | +1 N avec Port (Harbor) ; **les cases de mer sombres (deep sea) sont impraticables pour la Galère** | — (impassable en terrestre) |
| Rivière (River) — trait, pas un terrain de case | — | +1 N aux prairies/plaines adjacentes avec Irrigation ; +1 N aux mers adjacentes avec Port | **−50 % attaque de l'attaquant qui traverse ; +50 % défense du défenseur** |

**Confrontation avec notre `RULES.md` §2** (révision économique d'Erik du 30/08) :

| Point | CivRev officiel | Chez nous | Conforme ? |
|---|---|---|---|
| Prairie 2/0/0, Plaine 1/0/0, Forêt 0/2/0, Colline 0/1/0, Montagne 0/1/0, Désert 0/0/1, Mer 0/0/2 | idem | idem | ✅ |
| Forêt +50 % défense | 50 % | 50 % (revu le 30/08) | ✅ |
| Colline +50 % défense | **+50 % attaque ET défense** | +50 % défense seulement | ⚠️ écart assumé (calibrage v1) — à garder en tête pour le calibrage du combat |
| Montagne/Mer travaillables mais infranchissables | idem (montagne : sauf aériennes) | idem | ✅ |
| Rivière | trait de case à effets de combat/rendement | inexistant | ❌ absent — candidat naturel pour une future extension data-driven (voir §5) |
| Bâtiments d'amélioration | Grenier (+1 N plaine), Atelier (+2 P colline), Mine de fer (+4 P montagne), Comptoir (+2 C désert), Port (+1 N mer) — identiques aux nôtres ; le **Workshop** officiel = notre Atelier ; le Trading Post officiel = notre Comptoir | R-66 | ✅ |

Les terrains « hors prototype » interrogés dans la mission (rivière, oasis, glace) : **seule la rivière existe** dans CivRev, comme trait de décor entre/avec effets ; oasis et glace n'existent pas.

---

## 2. Ressources — liste exhaustive (22)

Sources principales : [List of resources in CivRev](https://web.archive.org/web/20251023030609/https://civilization.fandom.com/wiki/List_of_resources_in_CivRev) (table complète), vérification croisée ressource-par-ressource sur les pages individuelles des 20 technologies concernées (voir §5), et le PDF officiel (les 20 ressources à technologie apparaissent comme nœuds de l'arbre ; les 2 sans technologie n'y figurent pas — cohérence structurelle parfaite).

**Effets** : toute ressource ajoute un bonus de rendement à sa case, perçu par la ville qui la travaille : « All resources add bonus yields to their tile, which they provide to any city that works them ». **Aucune ressource de CivRev ne donne de bonus de combat** (aucune occurrence dans les sources ; les bonus de combat sont portés par les terrains et la fortification). Les types de bonus officiels : Nourriture, Production, **Commerce (Trade)**, **Or (direct au trésor)**, **Culture**.

| # | Ressource (FR / EN officiel) | Terrain officiel | Bonus officiel | Technologie officielle | Présente dans le PDF | Tech équivalente dans notre `techs.json` |
|---|---|---|---|---|---|---|
| 1 | Bétail / Cattle | Prairie | +3 Nourriture | Code of Laws | ✅ (nœud sous Currency/Code of Laws) | `code_des_lois` |
| 2 | Blé / Wheat | Prairie | +2 Nourriture | Irrigation | ✅ | — (tech absente de notre base) |
| 3 | Gibier / Game | Forêt | +3 Nourriture | Feudalism | ✅ | — |
| 4 | Poisson / Fish | Mer | +2 Nourriture | Bronze Working | ✅ | `travail_du_bronze` |
| 5 | Baleine / Whale | Mer | +4 Nourriture | Navigation | ✅ (nœud « Whales ») | `navigation` |
| 6 | Fer / Iron | Colline | +2 Production | Iron Working | ✅ | `travail_du_fer` |
| 7 | Chêne / Oak | Forêt | +3 Production | Construction | ✅ | — |
| 8 | Marbre / Marble | Plaine | +2 Production | Masonry | ✅ | — |
| 9 | Bœufs / Oxen | Prairie | +2 Production | Horseback Riding | ✅ | `equitation` |
| 10 | Charbon / Coal | Colline | +3 Production | Steam Power | ✅ | — |
| 11 | Soufre / Sulfur | Désert | +3 Production | Gunpowder | ✅ | — |
| 12 | Pétrole / Oil | Désert | +4 Production | Combustion | ✅ | — |
| 13 | Caoutchouc / Rubber | Forêt | +4 Production | Automobile | ✅ | — |
| 14 | Aluminium / Aluminum | Colline | +4 Production | Mass Production | ✅ | — |
| 15 | Uranium / Uranium | Montagne | +4 Production | Nuclear Power | ✅ | — |
| 16 | Teinture / Dyes | **Mer** | +3 Commerce | Monarchy | ✅ | — |
| 17 | Épices / Spices | Désert | +2 Commerce | **aucune** | ❌ (cohérent : pas de tech) | — |
| 18 | Vin / Wine | Plaine | +2 Commerce | Pottery | ✅ | `poterie` |
| 19 | Or / Gold | Montagne | **+3 Or (direct)** | Currency | ✅ | — |
| 20 | Gemmes / Gems | Montagne | **+2 Or (direct)** | **aucune** | ❌ (cohérent : pas de tech) | — |
| 21 | Encens / Incense | Prairie | **+2 Culture** | Ceremonial Burial | ✅ | — |
| 22 | Soie / Silk | Plaine | **+3 Culture** | Literacy | ✅ | `lettres` |

Vérifications de cohérence qui ont toutes abouti :
- Les 20 pages technologiques individuelles confirment chacune sa ressource (ex. Bronze Working : « unlocks the Archer, the Barracks, and the Colossus of Rhodes **and reveals Fish resources on the map** » ; Currency : « **reveals Gold on the map** » ; Nuclear Power : « It unlocks the resource **Uranium (+4 production)** »). Aucune divergence.
- Le PDF place chaque ressource-à-tech comme nœud sur sa technologie (ex. Wine sous Pottery, Whales sous Navigation, Coal sous Steam Power, Rubber sous Automobile, Uranium sous Nuclear Power) ; Gems et Spices n'y figurent pas, exactement parce qu'elles n'exigent aucune technologie.
- Répartition par terrain, fermée et symétrique : **Colline** (Aluminium, Charbon, Fer) · **Prairie** (Bétail, Encens, Bœufs, Blé) · **Mer** (Teinture, Poisson, Baleine) · **Forêt** (Gibier, Chêne, Caoutchouc) · **Montagne** (Gemmes, Or, Uranium) · **Plaine** (Marbre, Soie, Vin) · **Désert** (Pétrole, Épices, Soufre).

Remarques :
- **Le « diamant » d'Erik = Gems (+2 or, montagne, aucune tech)** — c'est bien une ressource de montagne dans le jeu de référence ; le scénario « demain sur colline » reste trivial avec le modèle proposé (éditer `terrains`).
- **Bonus « Or » direct** (Gems, Gold) : dans CivRev ce bonus va directement au trésor, **hors** du commerce converti or/science. Notre moteur n'a qu'un canal de rendement (N/P/C → commerce → conversion R-90). Deux options au §2 de la proposition (`PROPOSITION-RESSOURCES.md`) — recommandation : mapper Or → commerce en v1.
- **Ressources maritimes** (Poisson, Baleine, Teinture) : exploitables dès que leur tech est possédée ; le **Port n'est pas requis** (il donne +1 N sur TOUTES les cases de mer, pas sur les ressources) — source : [List of buildings in CivRev](https://web.archive.org/web/2022/https://civilization.fandom.com/wiki/List_of_buildings_in_CivRev) et guide GameFAQs « Harbor ».
- **Densité par carte** : [non tranché] — aucune source chiffrée (cartes « all one size, randomly generated » d'après la FAQ officielle 2K). Indices : « resources scattered throughout the map » (guide Mogri) ; « Delhi is guaranteed to start next to some resource » (portée inconnue) ; les villages barbares sont « always on top of a resource » (utile pour la 7d !).

---

## 3. Visibilité d'une ressource avant sa technologie — ce que fait CivRev

**Conclusion (inférence solide, pas de citation absolue) : dans CivRev, l'icône d'une ressource est VISIBLE dès que la case est explorée ; la technologie ne verrouille que le BONUS, pas l'affichage.**

Sources :
- Guide Mogri (GameFAQs X360, archivé) : « Have you ever seen **those uranium or rubber icons** and wondered what the point of those was? The point, friends, is the Indians. » — les icônes Uranium (Nuclear Power) et Caoutchouc (Automobile) sont donc visibles très tôt alors que leurs techs sont modernes. https://web.archive.org/web/20190428164843/https://gamefaqs.gamespot.com/xbox360/941684-sid-meiers-civilization-revolution/faqs/53957
- Même guide : « try to place them near, but not on, the resource icons (such as Wheat, Whale, Cattle, Gems) » — les icônes servent de repère pour fonder les villes.
- Guide Christapo : les villes barbares prises avec les Mongols sont « always on top of a resource **that you now cannot use** » — on voit la ressource sans pouvoir l'utiliser. https://web.archive.org/web/20190428164842/https://gamefaqs.gamespot.com/xbox360/941684-sid-meiers-civilization-revolution/faqs/53543
- Vocabulaire systématique des sources : « becomes **available** after researching X » / « allows **access** to » — jamais « hidden/revealed/visible » appliqué aux ressources (seule exception : « reveals … on the map » sur 3 pages tech, formule d'infobox et non de mécanique).
- Le passage le plus explicite (Mr_Cynical, Civilization Guide) : « Resources are not used as a prerequisite for any form of construction - they simply add bonuses… For example Gems add XXX to Gold production, **but only once you've researched YYY** ». https://web.archive.org/web/20190428164842/https://gamefaqs.gamespot.com/xbox360/941684-sid-meiers-civilization-revolution/faqs/53519
- Cohérence interne : Gems et Spices n'exigent AUCUNE tech et donnent leur bonus dès le départ pour tous — le défaut est donc « icône visible, bonus actif », la tech venant seulement conditionner le bonus.
- Le seul masquage réel est le **brouillard de guerre** : la zone inexplorée masque tout (ressources comprises) ; une fois la case explorée, la ressource y est affichée (CivFanatics Info Center : https://civfanatics.com/civrev/infocenter/).

**Cas des Indiens** (« access to all resources from the start ») : bonus de nation — leurs villes perçoivent le bonus de toute ressource sans la technologie (équivalent « comme si la tech était possédée »). Preuve par analogie : les Anglais « can access Dyes from the start » parce que leur bonus de départ est « Knowledge of Monarchy » (la tech de Teinture). Ce n'est pas un effet de visibilité. ⚠️ Une page du wiki (Indians_(CivRev)) prétend que le rendement indien démarre partiel puis augmente « somewhat arbitrarily » — analyse isolée d'un rédacteur, contredite par tous les guides ; **[non tranché]**, sans impact pour nous (pas de nations jouables en v1).

**Conséquence pour notre modèle** : la mission (L2.3) spécifie `revealedByTech` → **invisible** tant que la tech n'est pas débloquée. Le jeu officiel fait l'inverse (visible, bonus verrouillé). Les deux comportements sont défendables ; la proposition (`PROPOSITION-RESSOURCES.md`, décision D1) implémente la consigne d'Erik par défaut mais garde le choix **par ressource, en données**.

---

## 4. Le concept de culture

Sources : [Culture (CivRev)](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Culture_(CivRev)), [Temple](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Temple_(CivRev)), [Cathedral](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Cathedral_(CivRev)), [Great Person (CivRev)](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Great_Person_(CivRev)), [List of wonders in CivRev](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/List_of_wonders_in_CivRev), [Victory (CivRev)](https://web.archive.org/web/2023/https://civilization.fandom.com/wiki/Victory_(CivRev)), [Communism (government)](https://web.archive.org/web/2024/https://civilization.fandom.com/wiki/Communism_(government)_(CivRev)).

### 4.1 Ce qui génère de la culture dans CivRev

| Source | Valeur | Condition |
|---|---|---|
| Croissance des villes | automatique : « Culture is automatically generated as cities grow » | toujours (valeur par citoyen non documentée) |
| Temple | **+1 culture par citoyen** (coût 40) | tech Ceremonial Burial |
| Cathédrale | **+2 culture par citoyen** (coût 160, remplace le Temple) | tech Religion |
| Ressource Encens travaillée | **+2 culture** | tech Ceremonial Burial |
| Ressource Soie travaillée | **+3 culture** (le plus gros bonus culturel du jeu) | tech Literacy |
| Merveille Shakespeare's Theatre | **double la culture de sa ville** (coût 150) | — |
| Merveille Stonehenge | +50 % à l'effet du Temple (coût 50) | — |
| Merveille Magna Carta | les Tribunaux produisent de la culture (valeur [non tranchée]) | — |
| Grande Personne Artist/Thinker installée | **+50 % culture de la ville** | — |
| Gouvernement Communiste | **stoppe toute culture des Temples/Cathédrales** (en échange +50 % production) | tech Communism |

### 4.2 À quoi sert la culture

1. **Apparition des Grandes Personnes** : « Great People appear when culture points produced by a civilization reach thresholds. **The type of Great Person received is random.** » Les seuils numériques : **[non tranché]** (aucun chiffre sur le wiki ni dans les guides). Autres sources de GP : paliers d'or accumulé, être premier sur une tech, capturer une ville, voler une GP ennemie (Espion).
2. **Bascule (« flip ») des villes ennemies** : une ville dont la culture est inférieure à celle du voisin peut passer à l'adversaire ; défense : murailles (neutralisées si l'adversaire bâtit Hollywood) ou plus de culture ; **les capitales ne basculent jamais** tant qu'elles sont tenues par leur civilisation d'origine.
3. **Victoire culturelle** : cumuler 20 « événements culturels » (GP, merveilles, villes basculées) puis bâtir l'**United Nations** (coût 500).
4. Pas d'extension de frontières par la culture documentée dans CivRev (mécanique Civ4, absente ici) : **[non tranché]** mais vraisemblablement inexistante.

### 4.3 Les Grandes Personnes (pour l'agent recommandeur)

Unités non combattantes (M2). Six types : Artist/Thinker (settle : +50 % culture ; one-time : convertir une ville voisine), Scientist (+50 % science / finir la tech courante), Builder (−50 % coûts de bâtiments / finir une construction), Explorer/Industrialist (+50 % or / 100–500 or d'un coup), Humanitarian (+50 % croissance / +1 pop partout), Leader (toutes les unités deviennent vétérans). Règles : un seul type de GP par ville ; l'usage one-time consomme la GP ; chaque GP est rattachée à une tech (ex. Bach → Religion, Homère → Alphabet).

### 4.4 Recommandation pour notre prototype (argumentée, SANS implémentation)

**NO-GO pour l'implémentation d'un système de culture en 7c — GO pour préparer les données.** Arguments :

1. **La culture CivRev est un système à consommateurs, pas un rendement isolé.** Ses trois débouchés (grandes personnes, flip de villes, victoire culturelle) sont des systèmes entiers que notre prototype n'a pas : pas de grandes personnes, pas de bascule de villes (guerre permanente 1v1, victoire = capture de capitale — un flip culturel y serait quasi redondant et très lourd : UI, événements, équilibre), pas de Temples/Cathédrales/gouvernements (base technologique limitée à l'Antiquité, 9 techs). Implémenter la culture sans consommateur produirait un compteur sans effet visible — du poids moteur et d'UI sans valeur de jeu.
2. **Le seul déclencheur concret aujourd'hui, ce sont DEUX ressources** (Encens +2, Soie +3). Leur valeur de jeu vient de ce qu'elles alimenteront PLUS TARD. Le modèle de données proposé inclut donc le champ `culture` **dès maintenant** (valeurs officielles dans `resources.json`), ignoré par le moteur tant que la décision n'est pas prise — exactement comme `wonders.json` vit en données sans être constructible (précédent 7a).
3. **Quand la culture arrivera (phase « grandes personnes »), la forme recommandée est** : un compteur **par ville** (`cultureStored`, miroir de `foodStored` — pas de nouveau système transversal), alimenté par les ressources culturelles travaillées, les futurs bâtiments (Temple : +1/citoyen) et merveilles ; un seuil par grande personne (calibrage 🔶) déclenchant un choix/génération de GP dans la ville ; pas de flip ni de victoire culturelle en 1v1 (ou flip désactivé explicitement). Ce contour n'engage rien aujourd'hui ; il fixe juste que `culture` par ressource est la bonne unité de collecte.
4. **Risque de faire porter la culture par le commerce** (fusionner culture et commerce pour éviter un 4e canal de rendement) : rejeté — CivRev les distingue explicitement (Teinture +3 commerce vs Soie +3 culture sur des terrains voisins), et la fusion rendrait les deux ressources interchangeables, détruisant le choix de placement.

Décision demandée à Erik : §D2 de `PROPOSITION-RESSOURCES.md` (no-go maintenant + champ `culture` en données ; ou go minimal avec compteur inerte ; ou report complet).

---

## 5. Rivière — note pour extension future

La rivière est le seul élément de terrain hors prototype existant dans CivRev : trait de case à effets de **combat** (−50 % à l'attaquant qui la traverse, +50 % défense au défenseur) et de **rendement conditionnel** (+1 N prairies/plaines adjacentes avec Irrigation, +1 N mers adjacentes avec Port). Si un jour nous l'ajoutons, elle se modéliserait naturellement en données (champ `river: true` par case ou trait de bord) + deux modificateurs — hors périmètre 7c, noté pour la roadmap.

## 6. Sources

**Référence locale** : [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf) — arbre technologique officiel (extraction texte du 31/08, complétée le 01/09) ; 20 ressources y figurent comme nœuds de techs, Gems/Spices en sont absentes (sans tech).

**Wiki Civilization Fandom** (toutes via web.archive.org, snapshots 2021–2025) :
- https://civilization.fandom.com/wiki/List_of_resources_in_CivRev (table des 22 ressources)
- https://civilization.fandom.com/wiki/Terrain_(CivRev) (terrains, rendements, combat, passabilité)
- https://civilization.fandom.com/wiki/Culture_(CivRev) · Temple_(CivRev) · Cathedral_(CivRev) · Great_Person_(CivRev) · List_of_wonders_in_CivRev · Victory_(CivRev) · United_Nations_(CivRev) · Communism_(government)_(CivRev) · List_of_technologies_in_CivRev (légende Literacy/Silk) · List_of_buildings_in_CivRev
- Pages technologiques individuelles (20) : Pottery, Bronze_Working, Irrigation, Currency, Navigation, Steam_Power, Gunpowder, Combustion, Automobile, Nuclear_Power, Mass_Production, Horseback_Riding, Masonry, Ceremonial_Burial, Feudalism, Literacy, Code_of_Laws, Iron_Working, Construction_(CivRev) ; cas Monarchy : page absente des archives, tranché via Dyes_(CivRev) (« They become available after researching Monarchy and add 3 trade »)
- Pages ressources individuelles : Fish_(CivRev), Whale_(CivRev), Dyes_(CivRev) ; nations : English_(CivRev), Indians_(CivRev)

**Guides GameFAQs (X360, via Wayback)** :
- Mr_Cynical, Civilization Guide — faqs/53519 (bonus après tech, Indiens)
- MattG89, Technology Guide — faqs/53536 (colonne « Resource: What Resource becomes available once researched »)
- _Mogri_ — faqs/53957 (icônes visibles, placement de villes, Indiens)
- Christapo — faqs/53543 (villages barbares sur ressources) · LoughiBoyWonder, Tactics Guide — faqs/53813 · guide Hylian — faqs/53660 (Port)

**Autres** : CivFanatics Info Center (https://civfanatics.com/civrev/infocenter/) et Civilopedia (https://civfanatics.com/civrev/civilopedia/technologies/) ; FAQ officielle 2K archivée (cartes aléatoires) ; manuel officiel X360 scanné (https://www.gamesdatabase.org/Media/SYSTEM/Microsoft_Xbox_360/manual/Formated/Sid_Meier-s_Civilization_Revolution_-_2008_-_2K_Games.pdf — sans couche texte, OCR nécessaire pour trancher les derniers points).

**Reste [non tranché]** : seuils numériques de culture ; culture par tour des villes ; valeur culturelle des Tribunaux sous Magna Carta ; densité de ressources par carte ; rendement indien partiel au départ (source isolée contredite) ; visibilité absolue (inférence solide, le manuel scanné pourrait la confirmer).
