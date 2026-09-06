# **Rapport d'Analyse Technico-Économique et Calibrage Reverse-Engineered des Mécaniques de Civilization Revolution (Console, 2008\)**

La reconstitution fidèle de *Sid Meier's Civilization Revolution* (version console parue en 2008\) nécessite une rétro-ingénierie rigoureuse de ses constantes de jeu, de ses règles d'attribution de bonus et de ses algorithmes de progression1. Ce rapport rassemble les données canoniques extraites du code source, de la Civilopedia intégrée, ainsi que les analyses de la communauté spécialisée (notamment CivFanatics, StrategyWiki et TrueAchievements) pour fournir les paramètres exacts nécessaires à la modélisation d'un moteur de jeu identique à l'original1.

## **Trésorerie Initiale et Avantage Pécuniaire des Aztèques**

Dans la matrice de départ de *Civilization Revolution*, la constante de trésorerie par défaut attribuée à l'ensemble des civilisations est rigoureusement fixée à 0 pièce d'or au premier tour (4000 av. J.-C.)1. La civilisation Aztèque, dirigée par Montezuma, possède un bonus d'ère initiale intitulé dans la version originale *« Wealth of Gold »* (Trésor d'or)1.

### **Valeur Numérique Canonique et Impact Économique**

La valeur canonique accordée aux Aztèques dès le lancement de la partie est exactement de 25 pièces d'or1. Il s'agit d'un montant fixe absolu et non d'un modificateur de flux financier par tour. Comme la baseline des autres civilisations est de 0 pièce d'or, le bonus de départ aztèque correspond mathématiquement à un solde net de \+25 pièces d'or1.

| Civilisation | Trésorerie au Tour 1 (4000 av. J.-C.) | Modificateur Relatif |
| :---- | :---- | :---- |
| **Aztèques (Montezuma)** | 25 Or | \+25 Or |
| **Toutes les autres civilisations (15)** | 0 Or | Baseline |

Dans l'économie du jeu, l'achat d'urgence (*rush buy*) d'une unité de Guerrier au premier tour coûte exactement 20 pièces d'or7. Ce capital initial permet ainsi au joueur aztèque d'acheter immédiatement un Guerrier supplémentaire dès le Tour 1, laissant un solde de 5 pièces d'or, ce qui accélère la prise de contrôle des villages barbares environnants1.

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Thread de stratégie de CivFanatics (*Aztecs Strategy*, https://forums.civfanatics.com/threads/aztecs-strategy.299781/)5, guide de victoire de CivFanatics (https://forums.civfanatics.com/threads/tips-for-each-civilization-path-to-victory.282247/)9 et guide *One City Challenge* (https://forums.civfanatics.com/threads/one-city-challenge.286889/)1.  
* **Niveau de confiance** : Dataminé / Consensuel1.  
* **Divergences constatées** : Aucune divergence n'existe au sein de la communauté. L'intégralité des analyses de haut niveau et des guides de speedrun confirme la valeur absolue de 25 d'or au départ1.

## **Cartographie et Révélation Radiale du Territoire Russe**

Le bonus de départ de la Russie, dirigée par Catherine la Grande, est rédigé dans la Civilopedia sous la forme *« Russians begin with more of the map visible »*2 et désigné dans l'interface sous le nom de *« Local area map »*10.

### **Analyse Fonctionnelle et Géométrie de la Révélation**

Sur le plan mécanique, la capacité russe ne lève pas le brouillard de guerre sur un pourcentage fixe de la carte globale, ni sur l'intégralité d'un continent ou d'une masse terrestre10. Le moteur de jeu génère un masque d'exploration circulaire (radial) centré sur la case d'apparition initiale du Colon russe10.  
La valeur exacte du rayon exprimée en nombre absolu de cases n'est **pas documentée** explicitement dans la documentation publique ni exposée dans les fichiers d'interface10. Toutefois, les relevés empiriques effectués sur les cartes standards indiquent que la vision de départ s'étend d'environ 2 à 3 cases supplémentaires au-delà du rayon visuel standard du Colon initial, permettant d'identifier immédiatement les reliefs, les ressources spéciales et les villages barbares à proximité immédiate10.

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Discussion technique sur GameFAQs (https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/44291483)10 et guides stratégiques russes de CivFanatics (https://forums.civfanatics.com/threads/russian-strategy.300060/)11.  
* **Niveau de confiance** : Non documenté pour la constante numérique exacte du rayon en cases dans le code source ; Consensuel pour le comportement fonctionnel (révélation circulaire/radiale restreinte à la zone d'apparition)10.  
* **Divergences constatées** : Plusieurs utilisateurs soulignent une distorsion visuelle perçue selon la topographie : si le Colon russe apparaît sur un chokepoint ou une péninsule étroite, le masque radial couvre en grande partie des cases d'eau, donnant l'impression erronée d'un bonus réduit ou inefficace par rapport à une apparition en pleine terre10.

## **Mécanique de Génération des Personnages Illustres (Grèce et Rome)**

La Grèce (dirigée par Alexandre) et Rome (dirigée par Jules César) possèdent un bonus d'ère partageant la même désignation textuelle canonique dans la Civilopedia : *« More Great People »* (Plus de Personnages Illustres)2.

### **Comparaison Structurelle et Équilibrage des Ères**

Bien que l'intitulé et la mécanique interne sous-jacente soient strictement identiques, la Grèce et Rome n'obtiennent pas ce bonus au même moment du jeu2.

| Civilisation | Ère de Déclenchement | Libellé Canonique | Mécanisme Sous-jacent |
| :---- | :---- | :---- | :---- |
| **Grèce (Alexandre)** | Ère Médiévale | *More Great People* | Réduction du seuil de culture pour la génération de Personnages Illustres |
| **Rome (Jules César)** | Ère Industrielle | *More Great People* | Réduction du seuil de culture pour la génération de Personnages Illustres |

Dans *Civilization Revolution*, la génération des Personnages Illustres (*Great People*) repose principalement sur l'atteinte de jalons de culture cumulée à l'échelle de l'empire, ainsi que sur la construction de Merveilles ou certains événements militaires et scientifiques1.  
Le bonus *« More Great People »* agit en réduisant le seuil de points de culture requis pour déclencher l'apparition du Personnage Illustre suivant6. La valeur numérique précise du coefficient de réduction n'est **pas documentée** sous forme de pourcentage explicite dans l'interface du jeu6. Toutefois, le consensus établi par les analyses de gameplay de CivFanatics et TrueAchievements évalue cette réduction de seuil entre 25 % et 50 %, permettant d'engendrer un nombre nettement supérieur de Personnages Illustres au cours d'une partie par rapport aux autres civilisations6.

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Encyclopédie StrategyWiki (https://strategywiki.org/wiki/Civilization\_Revolution/Civilizations)3, Civilopedia de CivFanatics (https://civfanatics.com/civrev/civilopedia/civilizations/)2 et TrueAchievements (https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/5)6.  
* **Niveau de confiance** : Consensuel pour le mécanisme et l'identité parfaite du bonus entre les deux factions ; Estimation pour le pourcentage exact de réduction du seuil2.  
* **Divergences constatées** : Certains joueurs assimilent à tort ce bonus au trait *Philosophical* de *Civilization IV* (+100 % de taux de naissance)15. Or, le système de *CivRev* ne gère pas de points de spécialistes par ville mais des seuils de progression globaux4. De plus, l'impact stratégique diffère fortement entre la Grèce (accès précoce dès l'Ère Médiévale) et Rome (accès tardif à l'Ère Industrielle)12.

## **Attribution et Périmètre de la Merveille Antique Égyptienne**

L'Égypte, dirigée par Cléopâtre, possède le talent spécial d'ère initiale intitulé *« Starts with an Ancient Wonder »* (Commence la partie avec une Merveille Antique)2.

### **Règles d'Instanciation et Algorithme d'Attribution**

> 1. **Procédure de sélection** : Le joueur ne choisit **absolument pas** sa Merveille16. La Merveille attribuée est sélectionnée de façon purement aléatoire par le moteur de jeu lors de la génération de la carte au Tour 116.  
> 2. **Timing et localisation** : La Merveille est construite immédiatement et gratuitement dans la capitale égyptienne dès la fondation de celle-ci au Tour 116.  
> 3. **Périmètre des Merveilles Antiques** : La réserve de sélection inclut l'ensemble des Merveilles débloquées par des technologies appartenant à l'Ère Antique, c'est-à-dire disponibles avant l'atteinte de la 5ᵉ technologie (transition vers l'Ère Médiévale)4.

| Merveille Antique | Technologie Requise | Effet Canonique Majeur dans le Jeu |
| :---- | :---- | :---- |
| **Colosse de Rhodes** (*Colossus of Rhodes*) | Travail du Bronze (*Bronze Working*) | Doubler la production de Commerce dans la ville hôte23 |
| **Grande Pyramide** (*Great Pyramid*) | Sépulture Solennelle (*Ceremonial Burial*) | Débloque immédiatement l'accès à tous les Gouvernements4 |
| **Grande Muraille** (*Great Wall*) | Maçonnerie (*Masonry*) | Force immédiatement toutes les factions rivales à déclarer la paix22 |
| **Jardins Suspendus de Babylone** (*Hanging Gardens*) | Poterie (*Pottery*) | Augmente la population de la ville hôte de \+50 %4 |
| **Oracle de Delphes** (*Oracle of Delphi*) | Alphabet (*Alphabet*) | Révèle à l'avance l'issue exacte de chaque combat16 |
| **Stonehenge** (*Stonehenge*) | Aucune / Sépulture Solennelle | Augmente l'efficacité culturelle des Temples de \+50 %6 |

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Communauté Reddit r/civ (https://www.reddit.com/r/civ/comments/4rpmb1/civrev\_2\_is\_there\_a\_guide\_that\_tells\_you\_the/)18, GameFAQs (https://gamefaqs.gamespot.com/boards/182041-sid-meiers-civilization-revolution-2-plus/73779971)17, CivFanatics (https://forums.civfanatics.com/threads/thoughts-on-civrev-for-ios.444353/)16 et Fandom Wiki (https://civilization.fandom.com/wiki/Category:Wonders\_(CivRev))21.  
* **Niveau de confiance** : Dataminé / Consensuel4.  
* **Divergences constatées** : Les versions remaniées ultérieures ou accompagnées de packs DLC (telles que *CivRev 2* ou les extensions d'artefacts) ont parfois intégré le *Colisée* ou la *Tour de Pise* dans les Merveilles très précoces21. Toutefois, sur la version console originale de 2008, la liste ci-dessus constitue le pool de tirage exact21.

## **Démographie Urbaine et Modélisation de la Croissance Zouloue**

Le bonus accordé aux Zoulous (dirigés par Shaka) lors de leur passage à l'Ère Médiévale est intitulé canoniquement *« Cities grow faster »*2 ou *« Rapid city growth »*3.

### **Mécanisme Réel et Valeur Numérique**

Contrairement aux idées reçues attribuant ce bonus à une multiplication du surplus de nourriture ou à un ajout brut de nourriture sur les cases travaillées, la mécanique sous-jacente consiste en un **effet Aqueduc passif et universel** accordé à toutes les villes de l'empire zoulou6.  
Dans le moteur de jeu de *Civilization Revolution*, l'Aqueduc a pour fonction de diviser par deux la réserve de nourriture nécessaire pour faire passer une ville au niveau de population supérieur6. Le bonus médiéval zoulou applique cette réduction de seuil de 50 % de façon native sans nécessiter la construction du bâtiment6. En termes de vitesse d'expansion démographique, cette réduction du seuil requis équivaut exactement à une **accélération de \+50 % de la croissance urbaine**6.

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Walkthrough TrueAchievements (https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/5)6, fil de discussion *Breaking the Bank* sur CivFanatics (https://forums.civfanatics.com/threads/breaking-the-bank.285733/)14 et la Civilopedia de CivFanatics (https://civfanatics.com/civrev/civilopedia/civilizations/)2.  
* **Niveau de confiance** : Consensuel / Dataminé6.  
* **Divergences constatées** : De nombreux guides non spécialisés affirmaient à tort que les Zoulous gagnaient \+1 nourriture sur les cases de plaine ou de prairie27. Les analyses approfondies des fichiers de jeu ont confirmé que l'effet est strictement structurel (réduction du seuil de croissance par simulation de l'Aqueduc)6.

## **Progression Évolutive et Structure de l'Arbre Technologique par Ères**

Dans *Civilization Revolution*, le changement d'ère d'une civilisation n'est pas lié à la découverte d'une technologie spécifique pivot, mais au **nombre cumulé de technologies découvertes** par cette faction1.

### **Seuils de Transition et Prise en Compte des Technologies Gratuites**

* **Inclusion des technologies gratuites** : **Oui**. Toutes les technologies obtenues sans coût de recherche — que ce soit via les traits initiaux de civilisation (ex. l'Écriture pour la Chine, la Navigation pour l'Espagne, la Démocratie pour la Grèce), les bonus de première découverte, les villages barbares ou l'exploration d'artefacts — sont comptabilisées dans le total cumulé nécessaire pour franchir les seuils d'ère1.

| Transition d'Ère | Nombre Cumulé de Technologies Requises |
| :---- | :---- |
| **Ère Antique ![][image1] Ère Médiévale** | **5 Technologies** \[cite: 19, 25\] |
| **Ère Médiévale ![][image1] Ère Industrielle** | **14 Technologies** |
| **Ère Industrielle ![][image1] Ère Moderne** | **24 Technologies** \[cite: 1\] |

### **Répartition Canonique des 47 Technologies par Ère**

L'arbre technologique complet de *Civilization Revolution* comprend 47 technologies distinctes (auxquelles s'ajoute la *Technologie du Futur*, recherchable indéfiniment)4.

                            ┌───────────────────────────────┐  
                            │    ÈRE ANTIQUE (19 Techs)     │  
                            │  Seuil de transition \= 5 Techs │  
                            └───────────────┬───────────────┘  
                                            │  
                                            ▼  
                            ┌───────────────────────────────┐  
                            │   ÈRE MÉDIÉVALE (8 Techs)     │  
                            │ Seuil de transition \= 14 Techs│  
                            └───────────────┬───────────────┘  
                                            │  
                                            ▼  
                            ┌───────────────────────────────┐  
                            │  ÈRE INDUSTRIELLE (12 Techs)  │  
                            │ Seuil de transition \= 24 Techs│  
                            └───────────────┬───────────────┘  
                                            │  
                                            ▼  
                            ┌───────────────────────────────┐  
                            │    ÈRE MODERNE (8 Techs)      │  
                            │   Recherche finale illimitée  │  
                            └───────────────────────────────┘

#### **1\. Ère Antique (19 Technologies)**

Alphabet, Travail du Bronze (*Bronze Working*), Sépulture Solennelle (*Ceremonial Burial*), Code de Lois (*Code of Laws*), Construction, Devise (*Currency*), Démocratie (*Democracy*), Ingénierie (*Engineering*), Équitation (*Horseback Riding*), Travail du Fer (*Iron Working*), Irrigation, Alphabétisation (*Literacy*), Maçonnerie (*Masonry*), Mathématiques (*Mathematics*), Monarchie (*Monarchy*), Navigation, Poterie (*Pottery*), Religion, Écriture (*Writing*)4.

#### **2\. Ère Médiévale (8 Technologies)**

Mise en Banque (*Banking*), Féodalité (*Feudalism*), Poudre à Canon (*Gunpowder*), Invention, Métallurgie (*Metallurgy*), Imprimerie (*Printing Press*), Machine à Vapeur (*Steam Power*), Université (*University*)4.

#### **3\. Ère Industrielle (12 Technologies)**

Théorie Atomique (*Atomic Theory*), Automobile, Combustion, Communisme (*Communism*), Entreprise (*Corporation*), Électricité (*Electricity*), Aviation (*Flight*), Industrialisation (*Industrialization*), Médias de Masse (*Mass Media*), Production de Masse (*Mass Production*), Chemin de Fer (*Railroad*), Acier (*Steel*)4.

#### **4\. Ère Moderne (8 Technologies \+ Tech Finale)**

Aviation Avancée (*Advanced Flight*), Électronique (*Electronics*), Mondialisation (*Globalization*), Réseaux (*Networking*), Énergie Nucléaire (*Nuclear Power*), Vol Spatial (*Space Flight*), Supraconducteur (*Superconductor*), Technologie du Futur (*Future Technology*)4.

| Ère Canonique | Nombre de Techs | Exemples de Technologies Emblématiques |
| :---- | :---- | :---- |
| **Antique** | 19 | Alphabet, Bronze Working, Code of Laws, Currency, Literacy4 |
| **Médiévale** | 8 | Banking, Feudalism, Gunpowder, Invention, Steam Power4 |
| **Industrielle** | 12 | Automobile, Combustion, Electricity, Industrialization, Railroad4 |
| **Moderne** | 8 (+1) | Advanced Flight, Electronics, Space Flight, Future Technology4 |

### **Source, Niveau de Confiance et Divergences**

* **Source de référence** : Liste officielle des technologies sur la Fandom Wiki (https://civilization.fandom.com/wiki/List\_of\_technologies\_in\_CivRev)4, threads de théorie technologique sur CivFanatics (https://forums.civfanatics.com/threads/zulus-suck.314528/25 et https://forums.civfanatics.com/threads/one-city-challenge.286889/1).  
* **Niveau de confiance** : Dataminé / Consensuel1.  
* **Divergences constatées** : Contrairement aux opus sur PC (tels que *Civ IV* ou *Civ V*), *Civilization Revolution* condense l'arbre technologique en sautant totalement les époques Classique et Renaissance4. Toutes les technologies de type Imprimerie ou Invention sont intégrées directement au bloc Médiéval4.

## **Synthèse Générale des Données de Calibrage pour le Moteur de Jeu**

Le tableau ci-dessous regroupe l'ensemble des valeurs numériques et fonctionnelles canoniques destinées à l'implémentation directe dans le code source du clone.

| Paramètre / Civilisation | Valeur Canonique / Mécanisme Exact | Niveau de Confiance | Source Principale |
| :---- | :---- | :---- | :---- |
| **Trésorerie Aztèques** | 25 Or au Tour 1 (vs 0 Or pour le reste)1 | Dataminé / Consensuel | CivFanatics1 |
| **Révélation carte Russie** | Révélation radiale locale autour du Colon (\~2-3 cases)10 | Non doc. (rayon) / Consensuel | GameFAQs / CivFanatics10 |
| **Grèce / Rome (Great Person)** | Réduction du seuil culturel (\~25-50%), identité stricte2 | Estimation (valeur) / Consensuel | StrategyWiki / CivFanatics2 |
| **Merveille Antique Égypte** | Tirage aléatoire au Tour 1 parmi les 6 Merveilles Antiques16 | Dataminé / Consensuel | Reddit / CivFanatics / Wiki16 |
| **Croissance Zoulous** | Effet Aqueduc passif gratuit (-50 % seuil de nourriture)6 | Consensuel / Dataminé | TrueAchievements / CivFanatics6 |
| **Transition Médiévale** | 5 Technologies cumulées (techs gratuites incluses)19 | Dataminé / Consensuel | CivFanatics19 |
| **Transition Industrielle** | 14 Technologies cumulées (techs gratuites incluses) | Consensuel | Arbre technologique CivRev4 |
| **Transition Moderne** | 24 Technologies cumulées (techs gratuites incluses)1 | Dataminé / Consensuel | CivFanatics1 |
| **Total Technologies** | 47 Technologies réparties en 4 Éras (+ Future Tech)4 | Dataminé / Consensuel | Fandom Wiki CivRev4 |

#### **Sources des citations**

> 1. One City Challenge | CivFanatics Forums, [https://forums.civfanatics.com/threads/one-city-challenge.286889/](https://forums.civfanatics.com/threads/one-city-challenge.286889/)  
> 2. Civilization Revolution: Civilizations \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/civilizations/](https://civfanatics.com/civrev/civilopedia/civilizations/)  
> 3. Civilization Revolution/Civilizations \- StrategyWiki, [https://strategywiki.org/wiki/Civilization\_Revolution/Civilizations](https://strategywiki.org/wiki/Civilization_Revolution/Civilizations)  
> 4. List of technologies in CivRev \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/List\_of\_technologies\_in\_CivRev](https://civilization.fandom.com/wiki/List_of_technologies_in_CivRev)  
> 5. Aztecs Strategy | CivFanatics Forums, [https://forums.civfanatics.com/threads/aztecs-strategy.299781/](https://forums.civfanatics.com/threads/aztecs-strategy.299781/)  
> 6. Guide for Sid Meier's Civilization Revolution \- Cultural Victories, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/5](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/5)  
> 7. Winning as Aztecs | CivFanatics Forums, [https://forums.civfanatics.com/threads/winning-as-aztecs.285761/](https://forums.civfanatics.com/threads/winning-as-aztecs.285761/)  
> 8. The Definitive Civ Revolutions Strategy Guide \- How to beat Deity, [https://forums.civfanatics.com/threads/the-definitive-civ-revolutions-strategy-guide-how-to-beat-deity-ais-every-time.387990/](https://forums.civfanatics.com/threads/the-definitive-civ-revolutions-strategy-guide-how-to-beat-deity-ais-every-time.387990/)  
> 9. Tips for each civilization \*\*Path to victory\*\* | CivFanatics Forums, [https://forums.civfanatics.com/threads/tips-for-each-civilization-path-to-victory.282247/](https://forums.civfanatics.com/threads/tips-for-each-civilization-path-to-victory.282247/)  
> 10. Whats the deal with the russian local area map? \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/44291483](https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/44291483)  
> 11. Russian strategy | CivFanatics Forums, [https://forums.civfanatics.com/threads/russian-strategy.300060/](https://forums.civfanatics.com/threads/russian-strategy.300060/)  
> 12. Guide for Sid Meier's Civilization Revolution \- TrueAchievements, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/4](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/4)  
> 13. Culture Victory on Deity \- What am I missing? \- CivFanatics Forums, [https://forums.civfanatics.com/threads/culture-victory-on-deity-what-am-i-missing.288466/](https://forums.civfanatics.com/threads/culture-victory-on-deity-what-am-i-missing.288466/)  
> 14. Breaking the bank. \- CivFanatics Forums, [https://forums.civfanatics.com/threads/breaking-the-bank.285733/](https://forums.civfanatics.com/threads/breaking-the-bank.285733/)  
> 15. Civilization IV: Frequently Asked Questions \- CivFanatics, [https://civfanatics.com/civ4/faq/](https://civfanatics.com/civ4/faq/)  
> 16. Thoughts on CivRev for iOS | CivFanatics Forums, [https://forums.civfanatics.com/threads/thoughts-on-civrev-for-ios.444353/](https://forums.civfanatics.com/threads/thoughts-on-civrev-for-ios.444353/)  
> 17. Great Pyramid bug? \- Sid Meier's Civilization Revolution 2+, [https://gamefaqs.gamespot.com/boards/182041-sid-meiers-civilization-revolution-2-plus/73779971](https://gamefaqs.gamespot.com/boards/182041-sid-meiers-civilization-revolution-2-plus/73779971)  
> 18. CivRev 2: Is there a guide that tells you the requirements to unlock, [https://www.reddit.com/r/civ/comments/4rpmb1/civrev\_2\_is\_there\_a\_guide\_that\_tells\_you\_the/](https://www.reddit.com/r/civ/comments/4rpmb1/civrev_2_is_there_a_guide_that_tells_you_the/)  
> 19. Tips for each civilization \*\*Path to victory\*\* | Page 3, [https://forums.civfanatics.com/threads/tips-for-each-civilization-path-to-victory.282247/page-3](https://forums.civfanatics.com/threads/tips-for-each-civilization-path-to-victory.282247/page-3)  
> 20. Civ II Leonardo's Workshop, most OP wonder ever? \- Reddit, [https://www.reddit.com/r/civ/comments/5tqex7/civ\_ii\_leonardos\_workshop\_most\_op\_wonder\_ever/](https://www.reddit.com/r/civ/comments/5tqex7/civ_ii_leonardos_workshop_most_op_wonder_ever/)  
> 21. Category:Wonders (CivRev) | Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Category:Wonders\_(CivRev)](https://civilization.fandom.com/wiki/Category:Wonders_\(CivRev\))  
> 22. Great Wall (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Great\_Wall\_(CivRev)](https://civilization.fandom.com/wiki/Great_Wall_\(CivRev\))  
> 23. Colossus of Rhodes (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Colossus\_of\_Rhodes\_(CivRev)](https://civilization.fandom.com/wiki/Colossus_of_Rhodes_\(CivRev\))  
> 24. Oracle of Delphi (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Oracle\_of\_Delphi\_(CivRev)](https://civilization.fandom.com/wiki/Oracle_of_Delphi_\(CivRev\))  
> 25. Zulus Suck\! | CivFanatics Forums, [https://forums.civfanatics.com/threads/zulus-suck.314528/](https://forums.civfanatics.com/threads/zulus-suck.314528/)  
> 26. Cristo Redentor (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Cristo\_Redentor\_(CivRev)](https://civilization.fandom.com/wiki/Cristo_Redentor_\(CivRev\))  
> 27. Curse of the mongols | CivFanatics Forums, [https://forums.civfanatics.com/threads/curse-of-the-mongols.325315/](https://forums.civfanatics.com/threads/curse-of-the-mongols.325315/)  
> 28. Civilization – TOM CLEMENT | GAME PRODUCER, [https://thomasclement.net/tag/civilization/](https://thomasclement.net/tag/civilization/)  
> 29. Future Technology (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Future\_Technology\_(CivRev)](https://civilization.fandom.com/wiki/Future_Technology_\(CivRev\))  
> 30. How would you like civ7 divided into eras? \- CivFanatics Forums, [https://forums.civfanatics.com/threads/how-would-you-like-civ7-divided-into-eras.672987/](https://forums.civfanatics.com/threads/how-would-you-like-civ7-divided-into-eras.672987/)  
> 31. List of technologies in Civ5 \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/List\_of\_technologies\_in\_Civ5](https://civilization.fandom.com/wiki/List_of_technologies_in_Civ5)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAA9klEQVR4Xr2SsRHCMAxFozuoYAU6Ku5oWYAV2IQFmIMFqGmpKFiFOUBObMeSfiyHgnf3Mf76VhIlXScguXWZmzekBnFt7meCxjCUiXo6V0FM3TAGFZE3RcjCPDQDsjDsJsMVyD/m1evg2e5Zz9LAF8FuRg1hwT83VlglTp+CMpn/L1mP0VPdfht+nz/wclEFwZv1+VkkZ5w4sk5NIoprv3+x7qxdaJIpH39yFMmSpStrKxxNGrc8R+gSgQ3rrNMQG7EOs+7Ud+pCNMgweivehHdgUE+Kung0n/Guk0xYjMRaLfJHWu64hnPOKc/DbVZ+Cm64p576AkSvHIjVKjfAAAAAAElFTkSuQmCC>