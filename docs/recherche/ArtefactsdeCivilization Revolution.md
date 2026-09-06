# **Spécifications Techniques et Équilibrage Système des Artefacts de Civilization Revolution (2008)**

Dans *Sid Meier's Civilization Revolution* (2008, Xbox 360, PlayStation 3 et Nintendo DS), les artefacts représentent des reliques d'exploration réparties sur la carte1. Conçus pour dynamiser le début de partie sur console, ces objets procurent des récompenses directes sans équivalent dans les opus principaux de la franchise1. Ce rapport fournit une déconstruction technique complète des artefacts du jeu de base et de ses extensions téléchargeables (*Eternal*, *Iconic*, et *Mythic Wonder & Artifact Packs*)4, destinée à servir de spécification canonique pour le développement d'un clone fidèle.

## **Architecture Générale, Moteur de Spawn et Rôles Économiques**

### **Règles de Génération et Configuration des Cartes**

À la création d'un monde, l'algorithme de génération de carte place un sous-ensemble restreint d'artefacts. Les analyses d'extraction et les expérimentations de la communauté établies sur *CivFanatics* confirment que chaque carte contient rigoureusement entre quatre et cinq artefacts5. Le jeu ne génère jamais la totalité de la réserve disponible sur une seule carte6.  
Les artefacts sont placés selon des contraintes géographiques et topologiques strictes :

* **Distance des Capitales** : Aucun artefact ne peut apparaître à proximité immédiate des positions de départ. Le moteur applique une distance minimale estimée par la communauté entre 8 et 10 cases de toute capitale5. Ils sont relégués dans des zones isolées, des îles lointaines ou des culs-de-sac terrestres1.  
* **Artefacts Terrestres** : Onze des douze artefacts apparaissent sur des cases terrestres libres de toute ville ou campement barbare1.  
* **Spécificité d'Atlantide** : La *Cité Perdue d'Atlantide* possède une règle d'apparition exclusive. Elle apparaît impérativement sur une case d'océan profond (eau sombre), inaccessible par une simple galée en début de partie sans longer les côtes ou sans obtenir la technologie *Navigation*1.

Le pool de tirage dépend directement de la présence des contenus téléchargeables :

* **Jeu de Base** : Le pool initial compte six artefacts canoniques (Angkor Wat, Arche d'Alliance, Chevaliers Templiers, Cité Perdue d'Atlantide, École de Confucius, Sept Cités d'Or)2.  
* **Impact des DLCs** : L'installation des trois extensions (*Eternal*, *Iconic*, *Mythic*) ajoute six artefacts supplémentaires (deux par pack)4. L'activation des DLCs n'augmente pas le nombre d'artefacts générés sur la carte (qui reste fixe à 4 ou 5\)6 ; elle dilue le pool de tirage en portant la réserve globale à douze artefacts possibles4.

### **Mécaniques de Détection, Indices Audio et Intégration des Huttes**

Les artefacts sont masqués par le brouillard de guerre mais peuvent être identifiés ou révélés par plusieurs mécanismes :

* **Détection Audio (Anomalie du Bourdonnement)** : Sur les versions Xbox 360 et PlayStation 3, lorsque le joueur déplace son curseur de sélection sur une case cachée par le brouillard de guerre contenant un artefact, le moteur audio émet un léger bourdonnement (*humming sound*)1. Cette anomalie d'implémentation est exploitée par les joueurs experts pour cartographier les artefacts dès le premier tour de jeu1.  
* **Indices des Villages Indigènes et Camps Barbares** : Lors de la visite d'une hutte ou de la destruction d'un camp barbare, un événement peut se déclencher via le Conseiller Étranger (*Foreign Advisor*)1. Le message indique que les villageois croient à la présence d'artefacts cachés ou révèle temporairement la position exacte d'un temple caché sur la carte1. La probabilité d'obtenir cet indice dans une hutte est estimée par la communauté entre 15 % et 20 %1.  
* **Verrouillage par les Frontières Culturelles** : Si l'expansion culturelle d'une ville englobe la case d'un artefact, celui-ci est verrouillé6. Il ne s'active pas automatiquement et ne peut pas être réclamé par une civilisation rivale, sauf si celle-ci déclenche une guerre et pénètre physiquement sur la case avec une unité6.

## **Matrice Comparative Canonique des 12 Artefacts**

Le tableau ci-dessous récapitule l'ensemble des douze artefacts, leurs effets implémentés, leurs conditions d'activation, la certitude de leurs valeurs chiffrées ainsi que leurs équivalents fonctionnels dans *Civilization IV* et *Civilization V*.

| Artefact | Contenu d'Origine | Effet Implémenté & Valeurs Chiffrées Exactes | Conditions d'Activation & Terrain | Évolution selon l'Ère / Formule | Niveau de Certitude | Équivalent Civ IV / Civ V |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **Angkor Wat** | Jeu de Base12 | Construit immédiatement la Merveille disponible la moins chère et non obsolète dans une ville12. | Case terrestre. Unité terrestre franchissant la case1. | S'adapte à l'arbre technologique et aux Merveilles encore disponibles12. | Canonique12. | Civ IV/V : Merveille classique à construire14. |
| **Arche d'Alliance** | Jeu de Base1 | Construit un Temple gratuitement dans toutes les villes. Les villes avec Temple reçoivent une Cathédrale1. | Case terrestre. Unité terrestre franchissant la case1. | S'applique instantanément à l'ensemble du réseau urbain existant1. | Canonique1. | Civ V : Bâtiments culturels gratuits via politiques. |
| **Chevaliers Templiers** | Jeu de Base1 | Accorde une unité militaire puissante et expérimentée1. | Case terrestre. Unité terrestre franchissant la case1. | **Antique** : 1 Chevalier Vétéran6. **Médiéval** : 1 Canon6. **Industriel/Moderne** : 1 Char (*Tank*)6. | Canonique. L'unité commence toujours Vétérane (5 XP)6. | Civ III : Merveille *Knights Templar* (génère des Croisés)15. |
| **Cité Perdue d'Atlantide** | Jeu de Base1 | Accorde immédiatement 3 technologies gratuites5. | **Case océanique profonde**. Déclenché par **adjacence navale**1. | Recherche automatiquement les **3 technologies non découvertes les moins chères**6. | Canonique6. | Civ IV/V : Technologies gratuites des huttes/ruines. |
| **École de Confucius** | Jeu de Base1 | Accorde immédiatement **2 Personnages Illustres** (*Great People*) gratuits6. | Case terrestre. Unité terrestre franchissant la case1. | Tirage aléatoire parmi les classes de Personnages Illustres16. | Canonique. Valeur exacte de 2 Personnages Illustres6. | Civ IV : Merveille personnalisée dans le mod Thomas' War17. |
| **Sept Cités d'Or** | Jeu de Base1 | Injection d'or immédiate dans le trésor national1. | Case terrestre. Unité terrestre franchissant la case1. | **Antique** : \+200 Or6. **Médiéval** : \+250 Or6. **Industriel** : \+300 Or6. **Moderne** : \+400 Or6. | Canonique6. | Civ V : Bonus d'or de l'Espagne à la découverte de Merveilles14. |
| **Cour de Camelot** | DLC Mythic Pack4 | Transforme **tous les Cavaliers** (*Horsemen*) possédés en **Chevaliers** (*Knights*)1. | Case terrestre. Unité terrestre franchissant la case1. | Amélioration globale instantanée sans coût en or1. | Canonique1. | Civ IV/V : Amélioration de masse des unités. |
| **Grand Sphinx** | DLC Iconic Pack4 | Permet de basculer vers **n'importe quel gouvernement** sans prérequis1. | Case terrestre. Unité terrestre franchissant la case1. | Accès direct à la Démocratie, République ou Fundamentalisme dès l'Antiquité1. | Canonique1. | Civ IV : Merveille des Pyramides (débloque toutes les civiques). |
| **Aiguille du Pharaon** | DLC Eternal Pack4 | Accorde immédiatement **1 technologie avancée** gratuite1. | Case terrestre. Unité terrestre franchissant la case1. | Débloque la technologie la plus avancée accessible dans l'arbre16. | Canonique20. | Civ IV/V : Technologie gratuite de l'Université d'Oxford. |
| **Armée de Terracotte** | DLC Iconic Pack4 | Attribue la promotion **Éclaireur** (*Scout*) à **toutes les unités** militaires1. | Case terrestre. Unité terrestre franchissant la case1. | Augmente la mobilité et la vision des unités actuelles et futures13. | Canonique20. | Civ V : Merveille Armée de Terre Cuite (duplique les unités). |
| **Rayon de la Paix de Tesla** | DLC Eternal Pack4 | **Mets fin immédiatement à toutes les guerres** en cours dans le monde1. | Case terrestre. Unité terrestre franchissant la case1. | Force une paix globale unilatérale à l'instant du déclenchement20. | Canonique13. Événement ponctuel. | Civ IV : Résolution de paix du Palais Apostolique. |
| **Tour de Babel** | DLC Mythic Pack4 | Établit le **contact diplomatique** avec toutes les autres civilisations13. | Case terrestre. Unité terrestre franchissant la case1. | Révèle tous les dirigeants dans l'écran diplomatique sans lever le brouillard19. | Canonique19. | Civ V : Rencontre globale via le Congrès Mondial. |

## **Modélisation Approfondie des Mécanismes In-Game et Métriques**

### **Analyse des Artefacts du Jeu de Base**

#### **Angkor Wat**

Lors du déclenchement d'Angkor Wat, le système vérifie la liste des Merveilles non encore construites et non rendues obsolètes par la progression technologique globale12. L'artefact construit automatiquement la Merveille dont le coût en production est le plus bas au moment de l'activation12. Les joueurs expérimentés optimisent cet artefact en construisant manuellement les Merveilles peu coûteuses (comme les *Jardins Suspendus*) avant de valider Angkor Wat, forçant ainsi le jeu à leur attribuer une Merveille majeure comme la *Compagnie des Indes Orientales* ou l'*ONU*6.

#### **Arche d'Alliance**

L'Arche d'Alliance évalue l'ensemble du réseau urbain du joueur au tour exact de sa découverte1. Elle construit un Temple dans chaque ville qui en est dépourvue, et transforme les Temples existants en Cathédrales1. La valeur économique de cet artefact croît de manière exponentielle avec le nombre de villes possédées6. Associée à la civilisation Aztèque, elle permet de franchir plusieurs jalons culturels successifs en un seul tour6.

#### **Chevaliers Templiers**

Cet artefact injecte directement dans l'armée du joueur une unité militaire de pointe dotée du statut Vétéran (environ 5 points d'expérience)6. Le type d'unité généré est déterminé par l'ère technologique en cours6 :

* **Ère Antique** : Un Chevalier Vétéran (Attaque 6, 8 sur colline)6. Découvert avant 2000 av. J.-C., il permet de capturer des capitales ennemies défendues par de simples Archers non fortifiés6.  
* **Ère Médiévale** : Un Canon (Attaque 16\)6.  
* **Ère Industrielle et Moderne** : Un Char (*Tank*, Attaque 18, Défense 10\)6.

#### **Cité Perdue d'Atlantide**

Atlantide est considérée comme l'artefact scientifique le plus puissant du jeu de base5. Elle accorde immédiatement trois technologies gratuites en sélectionnant systématiquement les trois technologies non découvertes les moins chères en points de recherche5. Pour maximiser cet effet, la stratégie consiste à rechercher d'abord toutes les petites technologies antiques de base (Alphabet, Poterie, Travail du Bronze), afin de forcer Atlantide à offrir des technologies médiévales ou industrielles très coûteuses comme *Ingénierie* ou *Navigation*6. Son activation ne nécessite pas d'unité terrestre : le simple passage d'un navire sur une case adjacente déclenche le bonus1.

#### **École de Confucius**

L'École de Confucius génère exactement deux Personnages Illustres (*Great People*) dans la capitale du joueur6. Le type de chaque personnage est tiré aléatoirement parmi les catégories disponibles (Savant, Bâtisseur, Artiste, Marchand, Humanitaire, Leader)16. Cet octroi n'augmente pas le coût culturel requis pour obtenir les Personnages Illustres suivants via le système de progression standard6.

#### **Sept Cités d'Or**

Cet artefact verse une somme d'or directement dans le trésor national, calibrée selon l'ère lors de la découverte : 200 Or à l'Ère Antique, 250 Or à l'Ère Médiévale, 300 Or à l'Ère Industrielle et 400 Or à l'Ère Moderne6. À l'Ère Antique, 100 Or permettent d'acheter immédiatement un Colon5. Obtenir 200 Or en début de partie permet de financer deux Colons ou de franchir instantanément le jalon économique des 100 Or (Colon gratuit) et d'approcher celui des 250 Or (Marché gratuit avec la technologie *Monnaie*)8.

### **Analyse des Artefacts des Extensions DLC**

#### **Cour de Camelot (Mythic Pack)**

Lors de l'activation, la Cour de Camelot parcourt l'ensemble des unités du joueur et transforme tous les Cavaliers (*Horsemen*, Attaque 2\) existants en Chevaliers (*Knights*, Attaque 6\) sans aucun coût financier1. Découvert en début de partie après avoir produit plusieurs Cavaliers, cet artefact permet de constituer immédiatement une armée offensive capable d'éliminer les civilisations voisines avant l'apparition des Piquiers16.

#### **Grand Sphinx (Iconic Pack)**

Le Grand Sphinx offre une option de dialogue permettant de changer immédiatement de régime politique pour n'importe quel gouvernement du jeu, sans aucun prérequis technologique1. Il permet d'adopter la Démocratie (+50 % de Science et d'Or) ou la République dès l'Antiquité, contournant la nécessité de rechercher *Code de Lois* ou *Monarchie*5.

#### **Aiguille du Pharaon (Eternal Pack)**

À l'inverse d'Atlantide qui offre les technologies les moins chères, l'Aiguille du Pharaon débloque la technologie la plus avancée immédiatement accessible dans l'arbre de recherche16. Par exemple, si le joueur possède *Équitation*, l'artefact peut lui accorder directement *Féodalisme*, lui faisant économiser un temps de recherche considérable21.

#### **Armée de Terracotte (Iconic Pack)**

Cet artefact attribue la capacité passive *Éclaireur* (*Scout*) à toutes les unités militaires1. Les unités bénéficient d'une mobilité accrue en ignorant les pénalités de déplacement liées au relief (collines, forêts) et d'un champ de vision étendu20. L'effet s'applique aux unités existantes ainsi qu'à toutes celles produites ultérieurement20.

#### **Rayon de la Paix de Tesla (Eternal Pack)**

Le Rayon de Tesla réinitialise immédiatement l'état diplomatique de toutes les guerres en cours pour imposer la paix globale1. Il s'agit d'un événement ponctuel qui ne verrouille pas les déclarations de guerre futures : une IA agressive peut redéclarer la guerre dès les tours suivants20.

#### **Tour de Babel (Mythic Pack)**

La Tour de Babel établit instantanément le contact diplomatique avec l'ensemble des civilisations présentes sur la carte13. Dans les niveaux de difficulté élevés (notamment en *Divinité*), cet effet peut s'avérer désavantageux : établir le contact active les algorithmes d'agression de l'IA, déclenchant des demandes de tributs et des déclarations de guerre précoces16.

## **Analyse Meta-Game, Équilibrage Système et Prescriptions pour la Calibration du Clone**

### **Hiérarchie Compétitive et Tier List Communautaire**

Les analyses de la communauté sur *CivFanatics* et *Reddit* classent les artefacts selon leur impact sur la vitesse d'obtention des conditions de victoire5 :

* **Rang S (Dominants / Game-Breakers)** : *Sept Cités d'Or* (en début de partie pour le financement de la phase d'expansion)5, *Atlantide* (bond scientifique majeur)5, *Cour de Camelot* (potentiel de conquête militaire immédiat)5 et *Arche d'Alliance* (gain massif d'infrastructures culturelles)6.  
* **Rang A (Tranche Haute)** : *École de Confucius*, *Aiguille du Pharaon*, *Armée de Terracotte* et *Grand Sphinx*16.  
* **Rang B (Situationnels)** : *Angkor Wat* (très dépendant des Merveilles encore disponibles)6 et *Chevaliers Templiers* (très fort au tour 10, déclinant plus tard)6.  
* **Rang C / Défavorables** : *Rayon de Paix de Tesla* (impact à court terme très faible)16 et *Tour de Babel* (risque d'agression diplomatique accrue)16.

Dans les parties multijoueurs à tours simultanés, la présence d'artefacts très puissants comme les *Sept Cités d'Or* ou *Atlantide* introduit une variance élevée liée au hasard de l'exploration5. Dans le mode *Game of the Week* (GotW), où la carte est identique pour tous les participants, le jeu se transforme en une course d'optimisation d'itinéraire pour ramasser les artefacts clés le plus rapidement possible5.

### **Prescriptions de Calibration et Équilibrage pour un Clone Moderne**

Dans le cadre du développement d'un clone fidèle mais équilibré, plusieurs adaptations du système original sont recommandées :

* **Correction du Bug Audio** : La détection audio sous le brouillard de guerre doit être supprimée pour empêcher la cartographie passive des artefacts dès le premier tour1.  
* **Refonte d'Atlantide** : Pour éviter la stratégie de temporisation (*Tech Cleansing*), la récompense peut être convertie en une quantité fixe de points de recherche (par exemple 500 % de la production scientifique du tour) plutôt qu'en trois technologies brutes6.  
* **Ajustement de la Cour de Camelot** : Afin d'éviter des attaques militaires inarrêtables en début de partie, la transformation des Cavaliers en Chevaliers peut être plafonnée à un maximum de trois unités (soit l'équivalent d'une armée) au lieu de s'appliquer à l'intégralité des troupes de l'empire13.  
* **Lissage des Sept Cités d'Or** : Le gain d'or initial peut être ajusté dynamiquement selon le revenu par tour de la civilisation plutôt qu'octroyer un montant fixe brutal de 200 Or, afin de réduire la variance au premier tour6.

#### **Sources des citations**

> 1. Artifacts (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Artifacts\_(CivRev)](https://civilization.fandom.com/wiki/Artifacts_\(CivRev\))  
> 2. Civilization Revolution: Relics \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/relics/](https://civfanatics.com/civrev/civilopedia/relics/)  
> 3. Civilization Revolution Info Center | CivFanatics Forums, [https://forums.civfanatics.com/threads/civilization-revolution-info-center.244297/](https://forums.civfanatics.com/threads/civilization-revolution-info-center.244297/)  
> 4. DLC (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/DLC\_(CivRev)](https://civilization.fandom.com/wiki/DLC_\(CivRev\))  
> 5. The Definitive Civ Revolutions Strategy Guide \- How to beat Deity, [https://forums.civfanatics.com/threads/the-definitive-civ-revolutions-strategy-guide-how-to-beat-deity-ais-every-time.387990/](https://forums.civfanatics.com/threads/the-definitive-civ-revolutions-strategy-guide-how-to-beat-deity-ais-every-time.387990/)  
> 6. When to get artifacts \- CivFanatics Forums, [https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/](https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/)  
> 7. Info needed about starting maps \- Sid Meier's Civilization Revolution, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/73763008](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/73763008)  
> 8. My Deity Strategy, Any Civ \- CivFanatics Forums, [https://forums.civfanatics.com/threads/my-deity-strategy-any-civ.633567/](https://forums.civfanatics.com/threads/my-deity-strategy-any-civ.633567/)  
> 9. Relics in Civilization Revolution | CivFanatics Forums, [https://forums.civfanatics.com/threads/relics-in-civilization-revolution.269382/](https://forums.civfanatics.com/threads/relics-in-civilization-revolution.269382/)  
> 10. MostWonderfulSound / Video Games By Genre \- TV Tropes, [https://tvtropes.org/pmwiki/pmwiki.php/MostWonderfulSound/VideoGamesByGenre](https://tvtropes.org/pmwiki/pmwiki.php/MostWonderfulSound/VideoGamesByGenre)  
> 11. Advisor (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Advisor\_(CivRev)](https://civilization.fandom.com/wiki/Advisor_\(CivRev\))  
> 12. Angkor Wat (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Angkor\_Wat\_(CivRev)](https://civilization.fandom.com/wiki/Angkor_Wat_\(CivRev\))  
> 13. Artifacts (CivRev2) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Artifacts\_(CivRev2)](https://civilization.fandom.com/wiki/Artifacts_\(CivRev2\))  
> 14. Civilization V \- CivFanatics, [https://civfanatics.com/civ5/info/civilizations/](https://civfanatics.com/civ5/info/civilizations/)  
> 15. Civilization III: Units: Conquests \- CivFanatics, [https://civfanatics.com/civ3/civilopedia/conquests-units/](https://civfanatics.com/civ3/civilopedia/conquests-units/)  
> 16. What is the best Artifact in Civ Rev? : r/civrev \- Reddit, [https://www.reddit.com/r/civrev/comments/1dfujnb/civ\_rev\_poll\_what\_is\_the\_best\_artifact\_in\_civ\_rev/](https://www.reddit.com/r/civrev/comments/1dfujnb/civ_rev_poll_what_is_the_best_artifact_in_civ_rev/)  
> 17. Tsentom1 Python Wonders | CivFanatics Forums, [https://forums.civfanatics.com/threads/tsentom1-python-wonders.284188/](https://forums.civfanatics.com/threads/tsentom1-python-wonders.284188/)  
> 18. \[BTS Total Mod\] Thomas' War | CivFanatics Forums, [https://forums.civfanatics.com/threads/bts-total-mod-thomas-war.281603/](https://forums.civfanatics.com/threads/bts-total-mod-thomas-war.281603/)  
> 19. Tower of Babel (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Tower\_of\_Babel\_(CivRev)](https://civilization.fandom.com/wiki/Tower_of_Babel_\(CivRev\))  
> 20. DLC Wonders/Relics | CivFanatics Forums, [https://forums.civfanatics.com/threads/dlc-wonders-relics.285899/](https://forums.civfanatics.com/threads/dlc-wonders-relics.285899/)  
> 21. When to get artifacts | Page 2 \- CivFanatics Forums, [https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/page-2](https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/page-2)  
> 22. Pharaoh's Needle (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Pharaoh%27s\_Needle\_(CivRev)](https://civilization.fandom.com/wiki/Pharaoh%27s_Needle_\(CivRev\))  
> 23. Guide for Sid Meier's Civilization Revolution \- The Basics, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3)  
> 24. Terracotta Army (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Terracotta\_Army\_(CivRev)](https://civilization.fandom.com/wiki/Terracotta_Army_\(CivRev\))  
> 25. Best approach for a domination victory | CivFanatics Forums, [https://forums.civfanatics.com/threads/best-approach-for-a-domination-victory.346626/](https://forums.civfanatics.com/threads/best-approach-for-a-domination-victory.346626/)  
> 26. School of Confucius \- How many GPs? | CivFanatics Forums, [https://forums.civfanatics.com/threads/school-of-confucius-how-many-gps.288982/](https://forums.civfanatics.com/threads/school-of-confucius-how-many-gps.288982/)  
> 27. Grayson's Spanish Strategies \- CivFanatics Forums, [https://forums.civfanatics.com/threads/graysons-spanish-strategies.317037/](https://forums.civfanatics.com/threads/graysons-spanish-strategies.317037/)  
> 28. A Guide to Economic Victories | CivFanatics Forums, [https://forums.civfanatics.com/threads/a-guide-to-economic-victories.335748/](https://forums.civfanatics.com/threads/a-guide-to-economic-victories.335748/)  
> 29. CivRev \- Strategy & Tips | CivFanatics Forums, [https://forums.civfanatics.com/forums/civrev-strategy-tips.298/](https://forums.civfanatics.com/forums/civrev-strategy-tips.298/)  
> 30. Civilization Revolution: Info Center \- CivFanatics, [https://civfanatics.com/civrev/infocenter/](https://civfanatics.com/civrev/infocenter/)