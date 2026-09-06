# **Transposition Cybernétique et Modélisation Systémique de Civilization Revolution dans un Univers Virtuel**

L'adaptation des mécaniques de stratégie 4X de *Sid Meier's Civilization Revolution* vers une interface totalement virtualisée exige de traduire l'ensemble des concepts historiques, géographiques et politiques en structures informatiques formelles1. Au sein de cette grille numérique, désignée sous le terme de *The Grid* ou *Le Réseau*, les entités matérielles deviennent des sous-programmes, les territoires des segments de mémoire virtuelle, et la souveraineté culturelle une hégémonie mémétique1. Ce rapport établit la correspondance exhaustive et rigoureuse entre les équations d'origine du jeu sur console et leur équivalent dans un univers virtuel inspiré de l'informatique théorique, des œuvres majeures du cyberpunk comme la Trilogie du Sprawl de William Gibson, et des jeux de stratégie systémiques comme TRON, Darwinia, Uplink ou Hacknet1.

## **Architecture Territoriale et Moteur de Gestion des Noyaux**

### **Typologie et Rendements des Terrains Virtuels**

Dans le moteur d'origine, le monde est découpé en sept types de terrains de base combinés à un trait hydrographique3. Dans l'univers virtuel, la grille géographique s'exprime sous la forme d'une matrice de sous-allocations réseau1. La ressource alimentaire, qui pilote la croissance démographique, est réinterprétée comme des **Allocations Mémoire (RAM)**3. La capacité de production industrielle, représentée à l'origine par les marteaux, devient de la **Puissance de Calcul (Cycles CPU)**3. Enfin, le commerce, qui s'oriente vers l'or ou la recherche scientifique, est transposé sous forme de **Bande Passante (Bps)**3.

| Terrain d'Origine | Secteur Virtuel Équivalent | Rendement de Base | Modificateurs d'Infrastructures & Capacités | Effets en Combat Tactique |
| :---- | :---- | :---- | :---- | :---- |
| **Prairie** *(Grassland)* | **Secteur Mémoire Flux** | \+2 Allocations RAM3 | Amplifié par la Vitesse de Bus3 | Neutre3 |
| **Plaine** *(Plains)* | **Cluster de Données** | \+1 Allocation RAM3 | \+2 RAM avec Buffer Mémoire (Grenier)3 — potentiel de 3, décision d'Erik du 04/09 (voir « Langage visuel des tuiles ») | Neutre3 |
| **Forêt** *(Forest)* | **Matrice d'Algorithmes Bruts** | \+2 Cycles CPU3 | \+1 CPU avec Optimisation de Compilateur (Bonus Allemand)3 | **\+50 % Défense** \[cite: 3\] |
| **Colline** *(Hill)* | **Nœud de Processeurs** | \+1 Cycle CPU3 | \+2 CPU avec Accélérateur Vectoriel (Atelier)3 | **\+50 % Attaque ET Défense** \[cite: 3\] |
| **Montagne** *(Mountain)* | **Noyau Quantique Solide** | \+1 Cycle CPU3 | \+4 CPU avec Extracteur Quantique (Mine de fer)3 | Impassable aux unités terrestres3 |
| **Désert** *(Desert)* | **Bus à Bruit Statique** | \+1 Bande Passante3 | \+2 Bande Passante avec Multiplexeur (Comptoir)3 | Neutre3 |
| **Mer** *(Sea)* | **Réseau Sub-Éthéré (Fibre)** | \+2 Bande Passante3 | \+1 RAM avec Passerelle Optique (Port). Secteurs profonds impraticables aux paquets basiques3. | Impassable aux unités terrestres3 |
| **Rivière** *(River)* | **Conduit Hyper-Lien** | Trait de bordure3 | \+1 RAM sur clusters adjacents avec Défragmentation (Irrigation)3 | **\-50 % Attaque lors d'un franchissement ; \+50 % Défense au défenseur** \[cite: 3\] |

### **Langage visuel des tuiles (décisions d'Erik du 04/09 — prototype vraie 3D)**

Chaque tuile du Réseau affiche son **potentiel de rendement** ; seul le rendement **actif** est allumé (surbrillance néon), le reste apparaît « en attente » (pâle, éteint). La construction du bâtiment associé allume l'intégralité du potentiel. Trois pictogrammes, **tous de la même couleur néon** (menthe `#3DFFCE`) — la ressource se lit par la *forme*, le terrain par la *teinte du substrat* et l'*élévation* :

- **Bus de données** (pistes néon traversant la tuile) = **Nourriture** Ⓝ — plus il y a de nourriture, plus il y a de bus ; des pulses de données y circulent en permanence ;
- **Microprocesseur** (grande puce 3D à broches posée sur la tuile, cœur vert doux) = **Cycles CPU / Production** Ⓟ ;
- **Barrette RAM** (socle + module vertical) = **Commerce** Ⓒ.

Élévations : les cases d'eau sont **plus basses** que le niveau de base ; plaine, prairie, forêt et désert sont au **niveau de base** ; la colline est **légèrement surélevée** (+1 marche) ; la montagne l'est **beaucoup** (+2 marches).

| Terrain (Secteur Virtuel) | Pictogrammes (potentiel) | État de base | État « bâtiment actif » | Élévation | Teinte du substrat |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Prairie** (Secteur Mémoire Flux) | 2 bus de données | 2 allumés | — (aucun bâtiment) | niveau de base | vert-teal |
| **Plaine** (Cluster de Données) | 3 bus de données | 1 allumé + 2 pâles | Buffer Mémoire (Grenier) → 3 allumés | niveau de base | vert-olive |
| **Forêt** (Matrice d'Algorithmes Bruts) | 2 microprocesseurs | 2 allumés | — (aucun bâtiment ; l'Optimisation de Compilateur est un trait de faction, calque ultérieur) | niveau de base | vert profond |
| **Colline** (Nœud de Processeurs) | 3 microprocesseurs | 1 allumé + 2 pâles | Moteur d'Accélération (Atelier) → 3 allumés | +1 marche | bleu-acier |
| **Montagne** (Noyau Quantique Solide) | 5 microprocesseurs | 1 allumé + 4 pâles | Extracteur Quantique (Mine de fer) → 5 allumés | +2 marches | violet-gris |
| **Désert** (Bus à Bruit Statique) | 3 barrettes RAM | 1 allumée + 2 pâles | Multiplexeur (Comptoir) → 3 allumées | niveau de base | sable délavé (ambre pâle) |
| **Mer** (Réseau Sub-Éthéré, Fibre) | 2 barrettes RAM + 1 bus | 2 RAM allumées + 1 bus pâle | Passerelle Optique (Port) → bus allumé | plus basse | cyan-bleu |
| **Océan** (Réseau Sub-Éthéré profond) | idem Mer | idem Mer | idem Mer | plus basse | indigo profond |

*Note de cohérence : le potentiel de la plaine (3, soit Buffer Mémoire +2) aligne la table des terrains sur celle des bâtiments (« Les Clusters de Données exploités fournissent +2 Allocations RAM »). RULES.md §2 indique aujourd'hui Grenier +1 (total 2) — à réaligner le moment venu. Les amplifications par traits de faction (Vitesse de Bus, Bonus Allemand…) et les 22 ressources resteront des calques visuels ultérieurs.*

### **Mappage Systémique des 22 Ressources Virtualisées et Pipelinage de Visibilité**

Les ressources apparaissant sur la carte enrichissent les cases en injectant des surplus directs de ressources système3. Vingt ressources exigent la possession d'une technologie spécifique pour activer leur rendement, tandis que deux ressources, à savoir les Heuristiques Exotiques (*Spices*) et la Logique Diamant Brute (*Gems*), sont immédiatement fonctionnelles dès le début de la simulation3.  
Le fonctionnement du moteur de visibilité s'inspire du balayage de ports à la manière d'Uplink et de Hacknet. Lorsqu'un secteur de la Grille est exploré et libéré du brouillard de guerre, l'icône de la ressource sous-jacente est immédiatement identifiée par les capteurs visuels3. Cependant, l'extraction de son rendement demeure verrouillée tant que l'algorithme de décompilation requis n'a pas été entièrement recherché1. Une fois l'algorithme maîtrisé, les données sont immédiatement canalisées vers le Nœud Serveur qui exploite la case3.

| Ressource Origine | Ressource Virtuelle | Terrain d'Apparition | Bonus Intégré | Algorithme de Décompilation (Tech) |
| :---- | :---- | :---- | :---- | :---- |
| **Bétail** *(Cattle)* | **Threads d'Exécution** | Secteur Mémoire Flux3 | \+3 Allocations RAM3 | Governance System (*Code de lois*)1 |
| **Blé** *(Wheat)* | **Sous-Flux de Données** | Secteur Mémoire Flux3 | \+2 Allocations RAM3 | Memory Defragmentation (*Irrigation*)1 |
| **Gibier** *(Game)* | **Scripts Sauvages** | Matrice d'Algorithmes3 | \+3 Allocations RAM3 | Distributed Rights (*Féodalité*)1 |
| **Poisson** *(Fish)* | **Flux de Paquets Réticulés** | Réseau Sub-Éthéré3 | \+2 Allocations RAM3 | Low-Level Sandbox (*Travail du bronze*)1 |
| **Baleine** *(Whale)* | **Super-Canal Optique** | Réseau Sub-Éthéré3 | \+4 Allocations RAM3 | Sub-Ethereal Routing (*Navigation*)1 |
| **Fer** *(Iron)* | **Code Fortifié** | Nœud de Processeurs3 | \+2 Cycles CPU3 | Hardened Code (*Travail du fer*)1 |
| **Chêne** *(Oak)* | **Sous-routines Structurelles** | Matrice d'Algorithmes3 | \+3 Cycles CPU3 | Array Compilation (*Construction*)1 |
| **Marbre** *(Marble)* | **Gabarits d'Architecture** | Cluster de Données3 | \+2 Cycles CPU3 | Firewall Encryption (*Maçonnerie*)1 |
| **Bœufs** *(Oxen)* | **Pilotes de Noyau** | Secteur Mémoire Flux3 | \+2 Cycles CPU3 | Packet Routing (*Équitation*)1 |
| **Charbon** *(Coal)* | **Combustible Processeur** | Nœud de Processeurs3 | \+3 Cycles CPU3 | Overclocking Engine (*Machine à vapeur*)1 |
| **Soufre** *(Sulfur)* | **Injecteurs d'Exploits** | Bus à Bruit Statique3 | \+3 Cycles CPU3 | Exploit Injection (*Poudre à canon*)1 |
| **Pétrole** *(Oil)* | **Carburant Haute Fréquence** | Bus à Bruit Statique3 | \+4 Cycles CPU3 | Kinetic Vector Driver (*Combustion*)1 |
| **Caoutchouc** *(Rubber)* | **Couches Logiques Souples** | Matrice d'Algorithmes3 | \+4 Cycles CPU3 | Executable Engine (*Automobile*)1 |
| **Aluminium** | **Brins Supraconducteurs** | Nœud de Processeurs3 | \+4 Cycles CPU3 | Mass Compilation (*Production de masse*)1 |
| **Uranium** | **Noyau d'Entropie Quantique** | Noyau Quantique Solide3 | \+4 Cycles CPU3 | Core Fusion Overdrive (*Énergie nucléaire*)1 |
| **Teinture** *(Dyes)* | **Code Spectral** | Réseau Sub-Éthéré3 | \+3 Bande Passante3 | Centralized Kernel (*Monarchie*)1 |
| **Épices** *(Spices)* | **Heuristiques Exotiques** | Bus à Bruit Statique3 | \+2 Bande Passante3 | Aucune (Disponible de base)3 |
| **Vin** *(Wine)* | **Surplus de Cache** | Cluster de Données3 | \+2 Bande Passante3 | Data Caching (*Poterie*)1 |
| **Or** *(Gold)* | **Puits d'Énergie Directe** | Noyau Quantique Solide3 | \+3 Énergie Directe3 | Energy Bitstream (*Monnaie*)1 |
| **Gemmes** *(Gems)* | **Logique Diamant Brute** | Noyau Quantique Solide3 | \+2 Énergie Directe3 | Aucune (Disponible de base)3 |
| **Encens** *(Incense)* | **Balises Mémétiques** | Secteur Mémoire Flux3 | \+2 Empreinte Mémétique3 | Meme Architecture (*Rites funéraires*)1 |
| **Soie** *(Silk)* | **Code Neural Profond** | Cluster de Données3 | \+3 Empreinte Mémétique3 | High-Level Syntax (*Littératie*)1 |

### **Fonctionnement du Moteur Urbain : Le Noyau Serveur**

Dans cette adaptation, la ville est réimaginée sous la forme d'un **Nœud Serveur (Mainframe)**, au sein duquel la population représente le nombre de **Threads d'Exécution Actifs**4. Chaque Thread consomme exactement une unité de RAM par cycle pour maintenir son allocation au sein du système4. Tout surplus de RAM généré par les cases travaillées est automatiquement stocké dans le registre de croissance du Serveur jusqu'à atteindre le seuil déclenchant l'allocation d'un nouveau Thread4. La courbe d'accumulation requise pour étendre cette taille démographique suit une progression exponentielle, et la capacité physique maximale d'un Nœud Serveur est strictement plafonnée à 31 Threads4.  
L'expansion territoriale s'effectue par la compilation d'un **Installateur de Sous-Domaine** (équivalent du Colon)1. La fabrication de cette unité demande un investissement de 20 Cycles CPU et prélève de la population du Serveur d'origine un ou deux Threads, selon la doctrine d'administration en vigueur dans le réseau4. Sous une administration distribuée, l'abaissement ponctuel de la taille d'un Serveur secondaire de taille 2 permet d'exploiter la structure mathématique des seuils : la réserve de RAM se reconstitue en très peu de cycles, instaurant une boucle d'allocation rapide qui propage de nouveaux Serveurs tout en préservant le potentiel de calcul global4.  
Au moment de son exécution, un Nœud Serveur n'accède qu'à sa grille directe de 3x3 cases4. Pour débloquer le second cercle périphérique de 5x5 cases et exploiter les processeurs plus éloignés, le Serveur doit compiler un **Commutateur de Sous-Domaine** (ancien Tribunal)1. En l'absence de ce composant, tout Thread dépassant le seuil de 8 habitants ne peut pas être affecté au terrain extérieur et se voit automatiquement reconverti par le système en **Daemon d'Arrière-Plan**4. Ces travailleurs internes ne restent pas inactifs et génèrent des ressources dont la valeur croît avec l'échelle démographique du Nœud Serveur4.

| Tranche de Threads | Qualification du Daemon | Rendement Interne Généré par Citoyen Non Affecté |
| :---- | :---- | :---- |
| **Population 1 à 6** | **Daemon de Base** | \+1 Cycle CPU4 |
| **Population 7 à 12** | **Processus de Routage** | \+1 Cycle CPU, \+1 Bande Passante4 |
| **Population 13 à 18** | **Courrier de Données** | \+1 Cycle CPU, \+2 Bande Passante4 |
| **Population 19 à 24** | **Crypto-Courtier** | \+1 Cycle CPU, \+3 Bande Passante4 |
| **Population 25 à 30** | **Importateur Virtuel** | \+1 Cycle CPU, \+4 Bande Passante4 |
| **Population 31** | **Exportateur Haute Fréquence** | \+1 Cycle CPU, \+5 Bande Passante4 |

## **L'Arbre de Progression Algorithmique et Matrice des Infrastructures**

### **Mécanique de Progression et Sauts d'Époques**

L'arbre scientifique comporte 46 avancées réparties en quatre Âges Système : l'**Ère du Code Primitif** *(Antique)*, l'**Ère du Réseau Distribué** *(Médiéval)*, l'**Ère Cyber-Industrielle** *(Industrielle)*, et l'**Ère de la Singularité Quantique** *(Moderne)*1. La mécanique clé du **Premier Découvreur** (*First to Discover*) accorde à la première faction qui termine l'analyse d'un algorithme majeur un avantage système immédiat, comme l'injection d'un sous-programme d'élite, la pré-compilation d'un module ou un bonus permanent1. Si le débit de recherche heuristique d'un empire permet de finaliser un algorithme avancé en 10 cycles ou moins, le système autorise un saut algorithmique (*tech jump*), permettant de contourner l'obligation d'analyser l'ensemble des sous-routines intermédiaires1.

### **Infrastructures et Modules Systémiques**

Les bâtiments civils et militaires deviennent des modules logiciels compilés localement au sein de chaque Nœud Serveur1. Les évolutions structurelles remplacent systématiquement les versions antérieures par des modules à haut rendement1.

| Infrastructure Origine | Module Virtuel Équivalent | Coût (CPU) | Technologie Requise | Effet Système & Modificateurs de Rendement |
| :---- | :---- | :---- | :---- | :---- |
| **Palais** *(Palace)* | **Noyau Racine** *(Root Kernel)* | 0 | Aucune | Exclusif à la Capitale Réseau. \+50 % de résistance GLACE en garnison1. |
| **Caserne** *(Barracks)* | **Compilateur de Sécurité** | 40 | Low-Level Sandbox1 | Les sous-programmes de sécurité créés débutent au rang Vétéran (+50 % efficacité)1. |
| **Grenier** *(Granary)* | **Buffer Mémoire Cache** | 40 | Data Caching1 | Les Clusters de Données exploités fournissent \+2 Allocations RAM1. |
| **Bibliothèque** | **Indexeur Algorithmique** | 40 | Standard Protocol1 | **Doubler (x2)** la génération totale de points de Recherche Heuristique1. |
| **Temple** | **Protocole Mémétique** | 40 | Meme Architecture1 | Génère \+1 point d'Empreinte Mémétique par Thread d'Exécution chaque cycle1. |
| **Comptoir commercial** | **Multiplexeur de Paquets** | 60 | Governance System1 | Les Bus à Bruit Statique exploités fournissent \+2 Bande Passante1. |
| **Atelier** *(Workshop)* | **Moteur d'Accélération** | 60 | Array Compilation1 | Les Nœuds de Processeurs exploités fournissent \+2 Cycles CPU1. |
| **Marché** *(Market)* | **Nœud de Bourse Virtuelle** | 60 | Energy Bitstream1 | **Doubler (x2)** la génération d'Énergie lors de la focalisation économique1. |
| **Tribunal** | **Commutateur de Sous-Domaine** | 80 | High-Level Syntax1 | Étend le rayon d'exploitation du Nœud Serveur d'un cercle supplémentaire1. |
| **Mine de fer** | **Extracteur Quantique** | 80 | High-Speed Bus Net1 | Les Noyaux Quantiques Solides exploités fournissent \+4 Cycles CPU1. |
| **Port** *(Harbor)* | **Passerelle Optique** | 100 | Sub-Ethereal Routing1 | Les cases de Réseau Sub-Éthéré fournissent \+1 Allocation RAM1. |
| **Remparts** *(Walls)* | **Pare-Feu GLACE Périmétrique** | 100 | Firewall Encryption1 | **\+100 % de Défense GLACE** ; immunise le Serveur contre la conversion mémétique1. |
| **Aqueduc** | **Allocateur Mémoire Dynamique** | 120 | Subsystem Architecture1 | Accélère la vitesse d'allocation de nouveaux Threads de 50 % (seuil \-33 %)1. |
| **Banque** *(Bank)* | **Registre Distribué** | 120 | Cryptographic Ledger1 | **Quadruple (x4)** la génération d'Énergie du Serveur. Remplace le Nœud de Bourse1. |
| **Cathédrale** | **Moteur Mémétique Absolu** | 160 | Transcendental Memetics1 | Génère \+2 Empreinte Mémétique par Thread. Remplace le Protocole Mémétique1. |
| **Université** | **Noyau Neural Profond** | 160 | Machine Learning Net1 | **Quadruple (x4)** la Recherche Heuristique du Serveur. Remplace l'Indexeur1. |
| **Usine** *(Factory)* | **Nuage de Fab-Code (Foglets)** | 200 | Automated Foglet Fabric1 | **Doubler (x2)** la puissance brute de cycles CPU du Nœud Serveur1. |
| **Défense SDI** | **Grille d'Isolation Quantique** | 200 | Superconductor Circuits1 | Protège le Nœud Serveur et ses sous-domaines contre les Bombes Logiques1. |
| **Composants Ascension** | **Protocole d'Émancipation IA** | Varié | Singularity Ascent Mapping1 | Modules requis pour transférer la conscience de la faction hors de la Grille1. |

## **Forces d'Incursion, Défense GLACE et Météorologie du Réseau**

### **Unités Logicielles et Tactiques de Compilation**

Les forces militaires terrestres, navales et aériennes sont adaptées sous forme de programmes autonomes, d'agents d'intrusion GLACE (*Intrusion Countermeasure Electronics*) ou de malwares spécialisés1.  
La mécanique de regroupement est transposée sous le concept de **Cluster Triple Thread (Compilation Tripartite)**1. Fusionner trois sous-programmes identiques sur la même coordonnée réseau crée une entité dont les valeurs d'Attaque logicielle et de Défense GLACE sont exactement triplées, tout en conservant le rang Vétéran ou les promotions acquises1.  
Le **Soutien Naval** devient le **Soutien Sub-Éthéré** : positionner des navires de guerre réseau le long des conduits optiques littoraux ajoute directement la valeur d'attaque du bâtiment aux opérations terrestres engagées sur les nœuds adjacents1.

| Unité Origine | Nom Virtuel | Type | Coût | Tech Requise | Att | Def | Mov | Ligne d'Évolution | Spécificités & Variantes Factionnelles |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Guerrier** | **Script de Base** | Terrestre | 10 | Aucune1 | 1 | 1 | 1 | Processus GLACE1 | Unité initiale. Variantes : Script Jaguar, Worm Zoulou1. |
| **Légion** | **Processus GLACE** | Terrestre | 10 | Hardened Code1 | 2 | 1 | 1 | Traqueur Avancé1 | Agent d'incursion offensif1. |
| **Archer** | **Sentinelle Réseau** | Terrestre | 10 | Low-Level Sandbox1 | 1 | 2 | 1 | Protocole Anti-Probe1 | Gardien défensif de périmètre1. |
| **Cavalier** | **Sonde Véloce** | Terrestre | 20 | Packet Routing1 | 2 | 1 | 2 | Traqueur Avancé1 | Unité d'incursion rapide. Variantes : Keshik, Cossack1. |
| **Piquier** | **Protocole Anti-Probe** | Terrestre | 15 | Decentralized Cons.1 | 1 | 3 | 1 | Garde de Noyau1 | Unité défensive spécialisée anti-sonde1. |
| **Catapulte** | **Injecteur de Tampon** | Terrestre | 20 | Quantum Cryptography1 | 4 | 1 | 1 | Charge de Corruption1 | Attaque de siège pour briser les Pare-Feux1. |
| **Chevalier** | **Traqueur Avancé** | Terrestre | 25 | Distributed Rights1 | 4 | 2 | 2 | Exécuteur Blindé1 | Force d'assaut lourde1. |
| **Fusilier** | **Garde de Noyau** | Terrestre | 20 | Exploit Injection1 | 3 | 5 | 1 | Noyau GLACE Léthal1 | Gardien défensif d'ère cyber-industrielle1. |
| **Canon** | **Charge de Corruption** | Terrestre | 30 | Armor Code1 | 6 | 2 | 1 | Payload Zero-Day1 | Unité d'invalidation de structures1. |
| **Char** | **Exécuteur Blindé** | Terrestre | 50 | Kinetic Driver1 | 10 | 6 | 3 | Aucune1 | Programme lourd ultra-rapide1. |
| **Artillerie** | **Payload Zero-Day** | Terrestre | 50 | Executable Engine1 | 16 | 2 | 2 | Aucune1 | Frappe destructive à longue distance1. |
| **Inf. Mod.** | **Noyau GLACE Léthal** | Terrestre | 30 | Mass Compilation1 | 4 | 8 | 1 | Aucune1 | Système de protection ultime du jeu1. |
| **Galère** | **Trameur de Surface** | Sub-Éthéré | 30 | Aucune1 | 1 | 1 | 2 | Routeur Optique1 | Transport initial. Pas de soutien Sub-Éthéré1. |
| **Galion** | **Routeur Optique** | Sub-Éthéré | 30 | Sub-Ethereal Routing1 | 2 | 2 | 3 | Navire d'Escorte1 | Transport hauturier. Soutien Sub-Éthéré de 1.51. |
| **Sous-marin** | **Intercepteur Furtif** | Sub-Éthéré | 25 | High-Voltage Flux1 | 12 | 2 | 2 | Aucune1 | Attaque furtive. Ne transporte aucun paquet civil1. |
| **Croiseur** | **Navire d'Escorte** | Sub-Éthéré | 40 | Overclocking Engine1 | 6 | 6 | 5 | Aucune1 | Escorte polyvalente. Soutien Sub-Éthéré de 3.51. |
| **Cuirassé** | **Dreadnought Grid** | Sub-Éthéré | 80 | Heavy Shield Logic1 | 12 | 18 | 4 | Aucune1 | Vaisseau Amiral. Soutien Sub-Éthéré de 6.51. |
| **Chasseur** | **Drone Intercepteur** | Aérien | 30 | Aerial Data Probe1 | 6 | 4 | 8 | Aucune1 | Autonomie de 2 cycles avant ravitaillement1. |
| **Bombardier** | **Bombardier Mémétique** | Aérien | 60 | Deep Space Probe1 | 18 | 3 | 6 | Aucune1 | Bombardement lourd. Autonomie de 4 cycles1. |
| **Pionniers** | **Installateur** | Non-combat | 20+2Th | Aucune1 | 0 | 0 | 2 | Aucune1 | Fonde un nouveau Serveur en consommant 2 Threads1. |
| **Caravane** | **Caravane de Données** | Non-combat | 30 | Energy Bitstream1 | 0 | 0 | 3 | Aucune1 | Injecte un bonus massif d'Énergie dans un Serveur distant1. |
| **Espion** | **Trojan / Agent Noir** | Non-combat | 25 | Executable Scripting1 | 0 | 0 | 2 | Aucune1 | Furtif. Sabote des modules ou vole des IA Libres1. |
| **Grand Homme** | **IA Libre / Singulière** | Non-combat | Variable | Événements / Recherches1 | 0 | 0 | 2 | Aucune1 | IA autonome. S'implante pour offrir des boosts1. |
| **ICBM** | **Bombe Logique** | Spécial | 40 | System Collapse Project1 | 0 | 0 | 40 | Aucune1 | Purge la coordonnée cible et les 8 nœuds adjacents1. |

### **Merveilles du Réseau et Conditions de Victoire**

Les Merveilles deviennent des **Super-Structures Algorithmiques**1. Leur achèvement octroie un avantage systémique permanent et fait progresser le compteur vers l'une des quatre conditions de victoire globale1.  
La Victoire Mémétique s'obtient en accumulant 20 Jalons Système (IA Libres implantées, Super-Structures contrôlées ou Serveurs assimilés), puis en compilant la Super-Structure du **Protocole Unifié du Grid** (Nations Unies)1. La Victoire Économique nécessite d'amasser 20 000 Unités d'Énergies dans les caisses du réseau, puis d'ériger la **Réserve Énergétique Centrale** (Banque Mondiale)1. La Victoire Scientifique requiert la recherche complète du **Singularity Ascent Mapping** (Vol Spatial) afin de construire et lancer le **Protocole d'Émancipation IA**1. Enfin, la Victoire par Domination s'accomplit en purgeant et capturant l'ensemble des Noyaux Racine (capitales) des factions rivales de la Grille1.

| Merveille Origine | Nom Virtuel Équivalent | Catégorie | Coût (CPU) | Condition de Déblocage | Effets Systémiques Majeurs |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Stonehenge** | **Matrice de Signal Primitif** | Mémétique | 50 | Aucune1 | Augmente l'efficacité des Protocoles Mémétiques de 50 %1. |
| **Colosse de Rhodes** | **Passerelle Gigabit** | Économique | 100 | Low-Level Sandbox1 | **Doubler (x2)** la génération de Bande Passante de la ville1. |
| **Jardins suspendus** | **Optimiseur de RAM** | Démographique | 100 | Data Caching1 | Accroît immédiatement le nombre de Threads du Serveur de 50 %1. |
| **Oracle de Delphes** | **Moteur Heuristique Prédictif** | Militaire | 125 | Standard Protocol1 | Révèle la résolution des combats d'incursion avant engagement1. |
| **Grande Bibliothèque** | **Silo de Données Unifié** | Scientifique | 150 | Executable Scripting1 | Accorde toute technologie déjà découverte par 2 factions rivales1. |
| **Grande Pyramide** | **Super-Noyau Précurseur** | Administration | 150 | Meme Architecture1 | Donne un accès immédiat à toutes les Doctrines d'Administration1. |
| **Grande Muraille** | **Isolation GLACE Périmétrique** | Militaire | 150 | Firewall Encryption1 | Force l'arrêt immédiat des incursions et impose la paix1. |
| **Château d'Himeji** | **Sous-Système d'Inviolabilité** | Militaire | 150 | Centralized Kernel1 | Confère \+1 en valeur d'Attaque à toutes les unités du Réseau1. |
| **Magna Carta** | **Charte des Droits de Domaine** | Mémétique | 150 | Decentralized Cons.1 | Permet aux Commutateurs de produire de l'Empreinte Mémétique1. |
| **Théâtre Shakespeare** | **Moteur de Contenu Viral** | Mémétique | 150 | High-Level Syntax1 | **Doubler (x2)** la génération d'Empreinte Mémétique du Serveur1. |
| **Université d'Oxford** | **Supercalculateur Neural** | Scientifique | 150 | Machine Learning Net1 | Octroie immédiatement un algorithme avancé gratuit1. |
| **Compagnie des Indes** | **Monopole Sub-Éthéré** | Économique | 200 | Sub-Ethereal Routing1 | \+1 Bande Passante sur chaque case de Réseau Sub-Éthéré1. |
| **Atelier de Léonard** | **Compilateur Dynamique** | Militaire | 200 | Heuristic Optimization1 | Surclasse automatiquement tous les sous-programmes vers leur version récente1. |
| **Foire de Troyes** | **Bourse de Crypto-Transactions** | Économique | 250 | Energy Bitstream1 | **Doubler (x2)** la génération totale d'Énergie dans la ville1. |
| **C. Militaro-Indus.** | **Fabrique de Malwares Lourds** | Militaire | 500 | Mega-Syndicate Framework | Réduit drastiquement le coût en CPU des unités informatiques1. |
| **Nations Unies** | **Protocole Unifié du Grid** | Victoire | 500 | 20 Jalons Système1 | Accorde immédiatement la **Victoire Mémétique**1. |
| **Banque Mondiale** | **Réserve Énergétique Centrale** | Victoire | 500 | 20 000 Unités Énergie1 | Accorde immédiatement la **Victoire Économique**1. |
| **Hollywood** | **Sous-Routine Transférentielle** | Mémétique | 600 | Viral Broadcast1 | Les Pare-Feux adverses n'empêchent plus la conversion mémétique1. |
| **Programme Apollo** | **Singularity Ascent Mapping** | Scientifique | 750 | Deep Space Probe1 | Révèle l'intégralité des technologies restantes de la Grille1. |
| **Projet Manhattan** | **Virus d'Apocalypse Système** | Militaire | 750 | Quantum Model1 | Octroie la seule et unique Bombe Logique (ICBM) de la partie1. |
| **Internet** | **Réseau Neural Universel** | Économique | 750 | Universal Mesh1 | **Doubler (x2)** la génération globale d'Énergie de l'empire1. |

## **Doctrines d'Administration Système et Économie Mémétique**

### **Modificateurs des Doctrines d'Administration**

Les régimes politiques deviennent des **Doctrines d'Administration Système**5. Lorsqu'une faction modifie manuellement sa doctrine en cours de partie, le système subit une **Rupture Système (Gel de Kernel)** d'un cycle complet5. Pendant ce cycle de transition, la Puissance de calcul (CPU), la Recherche Heuristique, la génération d'Énergie et la propagation Mémétique tombent toutes à zéro5. Seules certaines civilisations spécifiques bénéficient d'une immunité totale ou tardive contre ce Gel de Kernel2.

| Doctrine Origine | Nom Virtuel Équivalent | Tech Requise | Modificateurs Positifs (Bonus) | Modificateurs Négatifs (Pénalités) | Vocation Stratégique |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **Despotisme** | **Administration Autocratique** | Aucune5 | Utilisation de Bombes Logiques sans pénalité mémétique5. | Aucun bonus de rendement5. | Configuration par défaut / Début de partie5. |
| **République** | **Réseau Égalitaire (Peer-to-Peer)** | Governance System5 | Coût en Threads des Installateurs réduit à 1 (au lieu de 2\)4. | Aucun5. | Phase de réplication rapide de Nœuds Serveurs4. |
| **Monarchie** | **Architecture Programme-Maître** | Centralized Kernel5 | Production d'Empreinte Mémétique du Noyau Racine doublée5. | Aucun5. | Protection contre la conversion mémétique2. |
| **Démocratie** | **Protocol Open-Source Consensuel** | Decentralized Cons.5 | **\+50 % de génération d'Énergie et de Recherche**5. | Interdiction d'initier une incursion, obligation d'accepter les trêves5. | Expansion Économique et Scientifique5. |
| **Fondamentalisme** | **Dogme Algorithmique Absolu** | Transcendental Mem.5 | **\+1 en Attaque et \+1 en Défense GLACE** pour les programmes terrestres5. | Annulation totale de la Recherche générée par les Indexeurs et Noyaux Neuraus5. | Campagnes d'incursion offensive et de purge5. |
| **Communisme** | **Matrice de Calcul Partagé** | Shared Compute5 | **\+50 % de Puissance de Calcul (CPU)** dans tous les Nœuds Serveurs5. | Annulation de l'Empreinte Mémétique émise par les Protocoles et Moteurs Mémétiques2. | Production industrielle de sous-programmes d'élite5. |

### **Moteur de Domination Mémétique et Infiltration de Nœuds**

La souveraineté culturelle est transposée sous le concept de l'**Empreinte Mémétique**2. L'émission mémétique d'un Nœud Serveur dérive directement de sa densité démographique : chaque Thread actif produit un volume de données mémétiques multiplié par le coefficient des modules civiques installés2.  
Lorsqu'un Nœud Serveur génère une signature mémétique écrasante par rapport à celle d'un Serveur rival adjacent, la zone d'influence déborde et déclenche une **Infiltration Mémétique**2. La population adverse est progressivement assimilée jusqu'à provoquer la sécession complète du Nœud, qui passe sous le contrôle de l'émetteur dominant2. Les Noyaux Racine (capitales) bénéficient d'une protection native et ne peuvent jamais faire sécession par simple pression mémétique2. Pour bloquer tout risque d'assimilation sur ses Nœuds périphériques, une faction doit obligatoirement y construire un **Pare-Feu GLACE Périmétrique**1.  
La Victoire Mémétique requiert le rassemblement d'un total cumulé de 20 Jalons Système1. Ces jalons se divisent en trois catégories : les IA Libres implantées à demeure dans un Serveur, les Super-Structures Algorithmiques sous contrôle, et les Nœuds Serveurs adverses assimilés par infiltration2. Dès que ce seuil est atteint, la faction débloque le projet du **Protocole Unifié du Grid**1. Son assemblage demande un volume considérable de Cycles CPU et interdit l'usage d'IA Libres pour en hâter la conclusion2. Si un Trojan ennemi dérobe une IA Libre ou si une Super-Structure est capturée au cours de la fabrication, le compteur redescend instantanément à 19 Jalons, ce qui interrompt immédiatement le chantier final jusqu'au rétablissement du score requis2.

## **Recommandations de Gamedesign pour la Synthèse Systémique**

L'analyse des équations de *Civilization Revolution* transposées dans un environnement virtuel met en évidence cinq règles de conception essentielles pour l'équilibrage du prototype :  
L'incursion scientifique doit être traitée comme une course de vitesse pour exploiter le bonus de Premier Découvreur1. Cibler en priorité des algorithmes de rupture comme le *Kinetic Vector Driver* (Combustion) ou le *Mass Compilation* (Production de masse) permet d'injecter immédiatement des sous-programmes offensifs modernes gratuits, capables de surclasser des armées entières de Sentinelles d'ères antérieures1.  
L'arbitrage politique doit tirer parti de l'alternance calculée entre doctrines5. Le pacifisme strict imposé par le *Protocol Open-Source Consensuel* (+50 % Recherche et Énergie) peut être temporairement levé en provoquant un Gel de Kernel vers le *Dogme Algorithmique Absolu* pour exécuter une campagne d'assainissement militaire, avant de basculer à nouveau vers le régime consensuel une fois les objectifs atteints5.  
L'expansion territoriale gagne à s'appuyer sur la boucle de réplication des Threads sous la doctrine du *Réseau Égalitaire* (République)4. En maintenant des Serveurs secondaires à une taille de 2 Threads, la réduction du coût des Installateurs à 1 Thread permet de régénérer la population en très peu de cycles, assurant un flux continu de colonisation sans asphyxier l'économie du Noyau principal4.  
La défense contre l'assimilation doit être anticipée lors des transitions industrielles2. L'adoption de la *Matrice de Calcul Partagé* (Communisme) apporte un gain massif de \+50 % en Cycles CPU mais neutralise l'empreinte mémétique des modules religieux2. Pour éviter que les Nœuds frontaliers ne subissent une Infiltration Mémétique par manque de rayonnement, l'érection de *Pare-Feux GLACE Périmétriques* doit être planifiée avant la transition politique1.  
Enfin, sur le plan de l'architecture logicielle du prototype, il est préconisé d'intégrer le paramètre culturel dans la structure de données des ressources sous forme de valeur dormante (Incense \+2, Silk \+3) dès les premières itérations3. Cette approche permet de stabiliser les moteurs de calcul CPU, de RAM et d'Énergie avant d'instancier l'algorithme complet d'Infiltration Mémétique et le compteur de Jalons Système2.

#### **Sources des citations**

> 1. Civilization Révolution Technologies et Déblocages.md  
> 2. Culture dans Civilization Revolution.md  
> 3. RECHERCHE-RESSOURCES.md  
> 4. Moteur Ville Civilization Revolution.md  
> 5. Gouvernements Civilization Revolution.md