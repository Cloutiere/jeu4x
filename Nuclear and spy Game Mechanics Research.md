# **Spécifications Techniques des Armes Nucléaires et de l'Espionnage dans Sid Meier's Civilization Revolution**

Ce rapport établit les spécifications mécaniques et algorithmiques des armes nucléaires, des systèmes de défense antimissile (SDI), de l'espionnage et du contre-espionnage dans *Sid Meier's Civilization Revolution* (version console 2008 Xbox 360/PS3 et version mobile)1. Il fournit les paramètres fonctionnels nécessaires à la conception d'un moteur de jeu 1v1 asynchrone strictement conforme aux règles d'origine1.

## **1\. Armes Nucléaires et Projet Manhattan**

### **1.1 Obtention, Production et Règle d'Exclusivité**

Le développement de la capacité nucléaire repose sur la réalisation du Projet Manhattan, une Merveille majeure de l'ère moderne5. Son coût de construction s'élève exactement à 750 marteaux de production8. Sa réalisation nécessite la technologie préalable Théorie Atomique (*Atomic Theory*)8, elle-même dépendante des technologies Électricité, Université et Invention11.  
Contrairement aux opus de la branche principale PC tels que *Civilization IV*, dans lesquels le Projet Manhattan débloque la fabrication industrielle illimitée de missiles pour l'ensemble des civilisations3, *Civilization Revolution* applique une règle d'exclusivité absolue : **un seul et unique missile ICBM existe par partie**1. Le missile est attribué directement et exclusivement à la civilisation qui achève la construction du Projet Manhattan1. Les autres joueurs ne peuvent plus fabriquer de Merveille similaire ni produire d'armes nucléaires par la suite1.  
L'acquisition de la Merveille peut être accélérée de deux manières7. Le joueur peut utiliser l'achat immédiat (*rush-buy*) en dépensant une quantité d'or proportionnelle au nombre de marteaux restants15, ou consommer un Personnage Illustre de type Grand Bâtisseur (*Great Builder*) pour achever instantanément la Merveille7. Il est impossible d'acheter l'unité ICBM indépendamment, car elle n'apparaît pas comme une unité ordinaire dans la file de production d'une ville8 ; elle est instanciée directement dans la ville constructrice dès la finalisation du Projet Manhattan8.

### **1.2 Unité ICBM, Déplacement et Restrictions de Lancement**

L'ICBM est matérialisé sur le plateau sous la forme d'une unité mobile bénéficiant de 40 points de déplacement5. Compte tenu des dimensions réduites des cartes de *Civilization Revolution* par rapport aux versions PC, cette valeur de déplacement octroie dans la pratique une portée globale illimitée1. L'ICBM n'a besoin d'aucun vecteur de transport militaire (tel qu'un sous-marin ou un porte-avions) et peut être tiré directement depuis la case où il stationne vers n'importe quelle cible visible sur la carte4.  
L'exécution du tir nucléaire est soumise à des restrictions politiques strictes :

> 1. **Restriction sous Démocratie** : Si le joueur est sous le régime de la Démocratie, le moteur de jeu interdit formellement le lancement de l'ICBM5. Pour pouvoir tirer, le joueur doit obligatoirement déclencher une Révolution et adopter une autre forme de gouvernement (Despotisme, Monarchie, République, Communisme ou Fundamentalisme)5.  
> 2. **Pénalité Culturelle et Despotisme** : L'utilisation de l'arme nucléaire entraîne une pénalité culturelle ou diplomatique immédiate pour l'attaquant7. Toutefois, le régime du Despotisme possède une règle spécifique annulant la perte de culture subie lors d'une frappe nucléaire7.

### **1.3 Analyse des Impacts et Effets de Frappe**

L'impact d'une frappe nucléaire obéit à deux logiques distinctes selon le type de cible atteinte :

#### **Villes Ordinaires (Non-Capitales)**

Si la cible est une ville ordinaire, la frappe provoque sa destruction totale et définitive1. La cité est rayée de la carte, sa population est ramenée à zéro, et l'ensemble de ses bâtiments, Merveilles et unités en garnison sont intégralement détruits1. La case occupée par la ville devient un cratère noir stérilisé5.

#### **Capitales Adverses**

Les capitales disposent d'un statut d'invulnérabilité à l'anéantissement total1. Lors d'un tir direct sur une capitale :

* La ville survit impérativement mais voit sa population chutermost à **1**1.  
* Tous les bâtiments de production, de science, de culture et de défense de la ville sont détruits1.  
* Toutes les unités militaires présentes sur la case de la capitale sont exterminées1.  
* Les Personnages Illustres (*Great People*) installés ou stationnés dans la capitale survivent à l'explosion5.

#### **Unités et Cases Adjacentes**

Les unités situées sur la case ciblée sont détruites instantanément1. Si le missile est tiré sur une case adjacente à un regroupement de troupes, la frappe inflige des dégâts de zone massifs, détruisant entre 80 % et 90 % des unités présentes sur le périmètre18. Frapper une case d'océan transforme celle-ci en case de production18.

### **1.4 Conséquences Victorielles et Contamination**

L'anéantissement ou la neutralisation d'une capitale adverse par un ICBM ne transfère pas la propriété de la case au joueur tireur5. Par conséquent, **la frappe nucléaire ne valide pas automatiquement une capture pour la Victoire par Domination**5. La partie continue5. Pour valider la capture d'une capitale ramenée à une population de 1 et dépourvue de garnison, le joueur doit déplacer une unité terrestre ou navale sur la case affectée lors d'un tour ultérieur5.  
Concernant les effets secondaires sur le terrain, la destruction d'une ville ordinaire laisse un cratère stérile et impraticable5. Il convient de noter que la documentation historique présente une mutisme partiel sur la durée exacte de blocage de la case et sur l'éventuelle réautorisation de fonder une nouvelle ville sur ce cratère à très long terme5. Cependant, contrairement aux éditions PC de *Civilization*, il n'existe pas d'unité d'Ouvrier mobile sur la carte permettant de nettoyer les retombées radioactives (*fallout*), la gestion de la population et du travail des cases s'effectuant exclusivement à l'intérieur de l'écran de ville dans *Civilization Revolution*7.

| Élément / Paramètre | Valeur / Règle Fonctionnelle | Source |
| :---- | :---- | :---- |
| **Coût du Projet Manhattan** | 750 Marteaux | 8 |
| **Technologie Requise** | Théorie Atomique (*Atomic Theory*) | 8 |
| **Quota d'ICBM** | Stricte unicités (1 seul missile par partie, attribué au constructeur) | 1 |
| **Portée et Déplacement** | 40 Cases (Considérée comme portée globale sans véhicule de transport) | 4 |
| **Condition de Lancement** | Interdit sous Démocratie ; Perte de culture annulée sous Despotisme | 5 |
| **Impact Ville Ordinaire** | Destruction totale, effacement de la carte, case convertie en cratère | 1 |
| **Impact Capitale** | Population réduite à 1, tous bâtiments et unités détruits, GP préservés | 1 |
| **Prise de Capitale** | La frappe ne compte pas comme une capture ; une unité physique doit occuper la case | 5 |

## **2\. Défense Antimissile (SDI)**

### **2.1 Spécifications du Bâtiment**

Le système SDI (*Strategic Defense Initiative*) constitue le seul moyen de protection contre une attaque par missile balistique19.

* **Nom exact du bâtiment** : Défense SDI (*SDI Defense*)19.  
* **Catégorie** : Bâtiment de ville (*Building*)19.  
* **Coût de construction** : 200 marteaux19.  
* **Technologie requise** : Superconducteurs (*Superconductor*)19.  
* **Bonus de découverte** : Le premier joueur qui recherche la technologie Superconducteurs obtient immédiatement **un bâtiment Défense SDI gratuit** implanté automatiquement dans l'une de ses villes21.

### **2.2 Mécanique d'Interception et Portée**

Les sources historiques révèlent une différence majeure de conception entre la série principale sur PC et *Civilization Revolution* :  
Dans *Civilization III* et *Civilization IV*, le SDI offrait une probabilité d'interception comprise entre 70 % et 75 %13. Dans *Civilization Revolution*, la mécanique d'interception est **100 % déterministe** : la présence d'une Défense SDI dans une ville garantit l'interception et l'annulation totale de tout ICBM ciblant directement cette cité19.  
Concernant le périmètre de protection, la Défense SDI **ne protège strictement que la ville au sein de laquelle elle a été construite**19. Elle n'offre aucun bouclier passif aux autres villes de l'empire ni aux cases adjacentes19. Pour protéger l'ensemble de son territoire, un joueur doit édifier une Défense SDI séparée dans chacune de ses villes20. Plusieurs bâtiments SDI ne se cumulent pas au niveau de leurs effets statistiques, chaque structure opérant de manière autonome pour la défense de sa zone urbaine19.

### **2.3 Faiblesses et Exploits Tactiques**

En raison de la couverture strictement ponctuelle du SDI, un joueur attaquant peut exploiter une faille dans le système d'interception : en ciblant avec son ICBM une case adjacente à une ville protégée par le SDI (au lieu de cibler le centre-ville lui-même), le missile n'est pas intercepté18. La déflagration détruit alors 80 % à 90 % des unités stationnées autour de la ville sans déclencher le bouclier antimissile de la cité18.

| Propriété SDI | Spécification Technique | Source |
| :---- | :---- | :---- |
| **Nom Officiel** | Défense SDI (*SDI Defense*) | 19 |
| **Coût en Marteaux** | 200 Marteaux | 19 |
| **Technologie Requise** | Superconducteurs (Octroie 1 SDI gratuit au premier chercheur) | 19 |
| **Taux d'Interception** | 100 % (Garantie absolue si la ville est ciblée) | 19 |
| **Couverture** | Locale (Protège uniquement la ville hôte, pas l'empire) | 19 |

## **3\. Système d'Espionnage**

### **3.1 Obtention, Coûts et Furtivité de l'Espion**

L'espionnage dans *Civilization Revolution* est géré à travers l'utilisation d'une unité spécialisée évoluant directement sur la carte :

* **Mode d'obtention** : L'unité Espion est produite dans les villes après la recherche de la technologie **Écriture** (*Writing*)14.  
* **Bonus de recherche** : La première civilisation à découvrir la technologie Écriture reçoit **un Espion gratuit**14.  
* **Coût de production** : 25 marteaux27.  
* **Caractéristiques** : Attaque : 0, Défense : 0, Points de déplacement : 2 cases27.  
* **Furtivité et Détection** : L'Espion est une unité visible sur le plateau de jeu29. Il ne bénéficie d'aucun camouflage passif en terrain découvert29. Si une unité militaire ennemie entre sur la case occupée par un espion isolé hors d'une ville, cet espion est éliminé ou capturé sans qu'un combat s'engage29.  
* **Formation de Réseaux (Spy Rings)** : À l'instar des unités militaires qui peuvent se regrouper en armées, trois unités Espions présentes sur la même case peuvent fusionner pour former un **Réseau d'Espions** (*Spy Ring*)29. Cette formation augmente significativement leur efficacité et leur puissance lors des duels d'espionnage contre les unités défensives29.

### **3.2 Catalogue des Actions d'Espionnage**

Lorsqu'un Espion (ou un Réseau d'Espions) entre dans une ville adverse, une interface d'action s'affiche14. La liste complète des opérations réalisables comprend :

* **Voler de l'Or (*Steal Gold*)** : L'espion dérobe une somme prélevée sur le trésor global de la victime29. La formule exacte dépend d'un pourcentage du trésor total accumulé par l'adversaire32.  
* **Enlever un Personnage Illustre (*Kidnap a Great Person*)** : Si un Personnage Illustre non encore installé ou activé est présent dans la ville ciblée, l'espion le capture et le transfert sous le contrôle du joueur attaquant14.  
* **Saboter la Production / Détruire un Bâtiment (*Sabotage Production / Destroy Building*)** : Si la ville est en train de fabriquer une unité, un bâtiment ou une Merveille, la totalité des marteaux investis dans la file de production est réinitialisée à zéro14. Si des bâtiments sont déjà achevés, l'espion détruit une structure existante (telle que des Murailles, une Cathédrale ou un Palais de Justice)29.  
* **Détruire les Fortifications (*Destroy Unit Fortifications*)** : L'espion annule immédiatement le bonus de retranchement (+100 % de défense) de la meilleure unité défensive de la ville, divisant par deux sa puissance effective avant un assaut militaire29.  
* **Partir Discrètement (*Leave Quietly*)** : Permet à l'espion d'annuler son infiltration sans exécuter d'action subversive, se repositionnant sur une case adjacente à la ville sans être consommé29.

Certaines mécaniques d'espionnage présentes dans d'autres opus de la franchise sont **absentes de *Civilization Revolution*** : l'espion ne peut ni voler de technologies (les échanges d'avancées se font via la diplomatie)29, ni assassiner des unités militaires de terrain29, ni fomenter des révoltes pour provoquer un changement d'allégeance (le basculement culturel *Culture Flip* étant un processus purement passif)8, ni exécuter une mission de révélation de carte11.

### **3.3 Cycle de Vie et Consommation de l'Unité**

Lorsqu'un Espion valide une action hostile (Vol d'or, Kidnapping, Sabotage ou Destruction de fortifications), **l'unité est consommée et disparaît définitivement du jeu**29. La seule option préservant l'unité est la commande *Partir Discrètement*29. Si la ville ciblée contient un Espion défenseur, un duel d'espionnage est automatiquement déclenché ; si l'attaquant perd ce duel, l'unité est détruite sans avoir pu exécuter sa mission29.

| Action d'Espionnage | Effet Fonctionnel | Consommation Unité |
| :---- | :---- | :---- |
| **Voler de l'Or** | Dérobe un pourcentage du trésor adverse | Oui29 |
| **Enlever Personnage Illustre** | Transfère un Personnage Illustre présent dans la ville | Oui29 |
| **Saboter Production** | Réinitialise les marteaux de la production en cours | Oui29 |
| **Détruire Bâtiment** | Supprime un bâtiment déjà construit dans la ville | Oui29 |
| **Détruire Fortifications** | Annule le bonus de retranchement de la meilleure garnison | Oui29 |
| **Partir Discrètement** | Repositionne l'espion à l'extérieur de la cité | Non (Réutilisable)29 |

## **4\. Contre-Espionnage et Alertes**

### **4.1 Mécaniques Défensives et Duels d'Espions**

La défense contre les opérations d'espionnage dans *Civilization Revolution* repose sur une mécanique de garnison active :

> 1. **Inexistence de Bâtiments Spécifiques** : Aucun bâtiment de ville (tel qu'une Agence de Renseignement ou un Bureau de Sécurité) n'existe pour accroître passivement la sécurité contre les espions22.  
> 2. **Espion en Défense** : La protection d'une ville nécessite le stationnement direct d'un Espion (ou d'un Réseau d'Espions) à l'intérieur de la cité7.  
> 3. **Résolution des Infiltrations** : Lorsqu'un espion ennemi tente de pénétrer dans une ville défendue par un espion stationné, un combat automatique ("Duel d'Espions") est engagé29. L'attaquant doit obligatoirement remporter ce duel pour accéder au menu d'actions subversives29. Les chances de victoire dépendent de la formation des unités (un Réseau d'Espions l'emportant quasi systématiquement sur un Espion isolé)29.  
> 4. **Vulnérabilité Totale sans Défenseur** : Si une ville ne contient aucun espion en garnison, la probabilité d'interception passive est de **0 %**29. L'espion attaquant exécute son action sans risque d'échec29.

### **4.2 Système de Notifications**

Lorsqu'une ville est victime d'une action d'espionnage réussie, le joueur lésé est immédiatement notifié par une alerte système dans son journal d'événements :

* Un message indique le vol de trésorerie et précise le montant prélevé.  
* Une alerte signale la destruction d'un bâtiment ou l'annulation de la production en cours dans la ville affectée.  
* Un rapport confirme l'enlèvement d'un Personnage Illustre en identifiant la cité ciblée.

## **5\. Synthèse des Mécaniques pour le Développement 1v1 Asynchrone**

Pour faciliter l'implémentation algorithmique d'un clone 1v1 asynchrone conforme aux règles d'origine, le tableau ci-dessous récapitule l'ensemble des constantes et des comportements système :

| Composant | Variable / Règle Moteur | Valeur / Comportement Attendu | Source |
| :---- | :---- | :---- | :---- |
| **Manhattan** | Coût de Production | 750 Marteaux | 8 |
| **Manhattan** | Condition d'Exclusivité | 1 seul ICBM généré pour toute la partie (attribué au constructeur) | 1 |
| **ICBM** | Portée & Déplacement | 40 cases ; lancement possible depuis n'importe quelle position | 4 |
| **ICBM** | Restriction Politique | Blocage strict du tir si le gouvernement est la Démocratie | 5 |
| **ICBM** | Résolution Cible Standard | Suppression de la ville, libération de la case sous forme de cratère | 1 |
| **ICBM** | Résolution Capitale | Pop \= 1, destruction des bâtiments/garnisons, préservation des GP | 1 |
| **SDI** | Coût & Prérequis | 200 Marteaux ; Technologie Superconducteurs | 19 |
| **SDI** | Taux d'Interception | 100 % (Uniquement si le missile vise le centre-ville protégé) | 19 |
| **SDI** | Portée de Protection | Locale à la ville hôte (aucune protection d'empire) | 19 |
| **Espion** | Coût & Prérequis | 25 Marteaux ; Technologie Écriture | 14 |
| **Espion** | Déplacement & Furtivité | 2 cases ; unité visible, détruite si traversée par une armée ennemie | 27 |
| **Espion** | Fusion d'Unités | 3 Espions \= 1 Réseau d'Espions (*Spy Ring*) | 29 |
| **Défense** | Protection Anti-Espion | Présence obligatoire d'un Espion en garnison dans la ville | 7 |
| **Défense** | Probabilité Sans Garnison | 0 % de chance de capture (succès automatique de l'attaquant) | 29 |

#### **Sources des citations**

> 1. Atomic bombs \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/43296590](https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/43296590)  
> 2. The ICBM \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/43391529](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/43391529)  
> 3. Is it possible to be nuked by AI? \- Sid Meier's Civilization Revolution, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44083880?page=1](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44083880?page=1)  
> 4. Too Awesome to Use \- TV Tropes, [https://tvtropes.org/pmwiki/pmwiki.php/Main/TooAwesomeToUse](https://tvtropes.org/pmwiki/pmwiki.php/Main/TooAwesomeToUse)  
> 5. Icbm?/Atomic Theory \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/47279890](https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/47279890)  
> 6. only one nuke? \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44388827](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44388827)  
> 7. Civilization Revolution: Info Center \- CivFanatics, [https://civfanatics.com/civrev/infocenter/](https://civfanatics.com/civrev/infocenter/)  
> 8. Civilization Revolution/Wonders \- StrategyWiki, [https://strategywiki.org/wiki/Civilization\_Revolution/Wonders](https://strategywiki.org/wiki/Civilization_Revolution/Wonders)  
> 9. Civilization Revolution: Wonders \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/wonders/](https://civfanatics.com/civrev/civilopedia/wonders/)  
> 10. Atomic Theory (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Atomic\_Theory\_(CivRev)](https://civilization.fandom.com/wiki/Atomic_Theory_\(CivRev\))  
> 11. Guide part 4 \- Civilization Revolution Guide \- IGN, [https://www.ign.com/wikis/sid-meiers-civilization-revolution/Guide\_part\_4](https://www.ign.com/wikis/sid-meiers-civilization-revolution/Guide_part_4)  
> 12. Nuclear Weapons in Civilization IV \- CivFanatics, [https://civfanatics.com/civ4/nuclear-weapons-in-civilization-iv/](https://civfanatics.com/civ4/nuclear-weapons-in-civilization-iv/)  
> 13. ICBM (Civ4) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/ICBM\_(Civ4)](https://civilization.fandom.com/wiki/ICBM_\(Civ4\))  
> 14. Sid Meier's Civilization Revolution Hands-On \- Civ Comes to the, [https://www.gamespot.com/articles/sid-meiers-civilization-revolution-hands-on-civ-comes-to-the-consoles/1100-6181133/](https://www.gamespot.com/articles/sid-meiers-civilization-revolution-hands-on-civ-comes-to-the-consoles/1100-6181133/)  
> 15. Guide for Sid Meier's Civilization Revolution \- The Basics, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3)  
> 16. Too Awesome to Use \- All The Tropes, [https://allthetropes.org/wiki/Too\_Awesome\_to\_Use](https://allthetropes.org/wiki/Too_Awesome_to_Use)  
> 17. Problem with Homer(Great Person) \- Sid Meier's Civilization, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/48944044](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/48944044)  
> 18. Civ Rev fun facts please add you have. Some from me too of course., [https://www.reddit.com/r/civrev/comments/1mkep6x/civ\_rev\_fun\_facts\_please\_add\_you\_have\_some\_from/](https://www.reddit.com/r/civrev/comments/1mkep6x/civ_rev_fun_facts_please_add_you_have_some_from/)  
> 19. SDI (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/SDI\_(CivRev)](https://civilization.fandom.com/wiki/SDI_\(CivRev\))  
> 20. SDI Defense (Civ1) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/SDI\_Defense\_(Civ1)](https://civilization.fandom.com/wiki/SDI_Defense_\(Civ1\))  
> 21. Civilization Revolution: Technologies \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/technologies/](https://civfanatics.com/civrev/civilopedia/technologies/)  
> 22. Civilization Revolution/Buildings \- StrategyWiki, [https://strategywiki.org/wiki/Civilization\_Revolution/Buildings](https://strategywiki.org/wiki/Civilization_Revolution/Buildings)  
> 23. Civilization Revolution/Technologies \- StrategyWiki, [https://strategywiki.org/wiki/Civilization\_Revolution/Technologies](https://strategywiki.org/wiki/Civilization_Revolution/Technologies)  
> 24. Civilization III: Info Center \- CivFanatics, [https://civfanatics.com/civ3/infocenter/](https://civfanatics.com/civ3/infocenter/)  
> 25. Civilization III: Small Wonders \- CivFanatics, [https://civfanatics.com/civ3/civilopedia/small-wonders/](https://civfanatics.com/civ3/civilopedia/small-wonders/)  
> 26. Guide for Sid Meier's Civilization Revolution \- Domination Victories, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/6](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/6)  
> 27. Civilization Revolution: Units \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/units/](https://civfanatics.com/civrev/civilopedia/units/)  
> 28. Kadazzle's Deity Victory Guide\! \- CivFanatics Forums, [https://forums.civfanatics.com/threads/kadazzles-deity-victory-guide.295588/](https://forums.civfanatics.com/threads/kadazzles-deity-victory-guide.295588/)  
> 29. Spy Usage Guide | CivFanatics Forums, [https://forums.civfanatics.com/threads/spy-usage-guide.300464/](https://forums.civfanatics.com/threads/spy-usage-guide.300464/)  
> 30. Russian Strategy | CivFanatics Forums, [https://forums.civfanatics.com/threads/russian-strategy.317038/](https://forums.civfanatics.com/threads/russian-strategy.317038/)  
> 31. What is the worst Civ? \- Sid Meier's Civilization Revolution, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44994676?page=3](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44994676?page=3)  
> 32. Civ Rev XboX 360 Manual inteRioR veRsion 14 5/27/08, [http://epix.xbox.com/shaXam/0201/c0/8c/c08ccaa5-b593-4e4c-88ff-3ab4d5150773.PDF](http://epix.xbox.com/shaXam/0201/c0/8c/c08ccaa5-b593-4e4c-88ff-3ab4d5150773.PDF)  
> 33. honest thoughts on this one.. do any real civ players like it too? or is, [https://www.reddit.com/r/civ/comments/z5erdd/honest\_thoughts\_on\_this\_one\_do\_any\_real\_civ/](https://www.reddit.com/r/civ/comments/z5erdd/honest_thoughts_on_this_one_do_any_real_civ/)  
> 34. Civilization Revolution 2 – Cheats \- GameFAQs \- GameSpot, [https://gamefaqs.gamespot.com/iphone/814459-civilization-revolution-2/cheats](https://gamefaqs.gamespot.com/iphone/814459-civilization-revolution-2/cheats)  
> 35. List of unit actions in Civ7 \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/List\_of\_unit\_actions\_in\_Civ7](https://civilization.fandom.com/wiki/List_of_unit_actions_in_Civ7)