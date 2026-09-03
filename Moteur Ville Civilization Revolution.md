# **Analyse Systémique des Mécaniques de Population, de Nourriture et de Gestion Urbaine dans Civilization Revolution**

Dans la déclinaison console de *Sid Meier's Civilization Revolution*, la gestion micro-économique des cités repose sur des équations d'accumulation et d'allocation de la main-d'œuvre spécifiquement structurées pour maintenir un rythme de jeu fluide sans sacrifier la profondeur stratégique1. La compréhension des fonctions de production agricole, des paliers de croissance démographique, des coûts d'opportunité liés à l'expansion territoriale et du rôle des citoyens non affectés permet de maximiser l'efficacité globale d'un empire à travers les différentes ères3.

## **Dynamique de la Nourriture et Croissance Démographique**

La nourriture, symbolisée par les icônes de pommes, constitue la ressource exclusive permettant de nourrir les citoyens et de provoquer l'expansion démographique d'une cité2. Chaque habitant présent dans une ville consomme une unité de nourriture par tour pour assurer sa subsistance3. Lorsque la récolte totale sur les tuiles travaillées dépasse ce seuil d'entretien de base, le surplus alimentaire est automatiquement transféré dans la réserve de croissance de la ville4. L'augmentation de la population survient dès que cette réserve accumulée atteint le seuil requis pour le niveau démographique supérieur7.  
L'accès aux niveaux démographiques supérieurs obéit à une logique exponentielle non linéaire plutôt qu'à une progression constante4. La quantité de nourriture cumulée exigée pour passer d'une population ![][image1] à ![][image2] augmente significativement à chaque palier4. Franchir les premiers niveaux (par exemple de la population 1 à la population 2\) exige un apport très faible, tandis que le développement des métropoles de grande taille demande un investissement agricole massif4. Dans tous les cas, la population d'une cité est physiquement plafonnée à un maximum absolu de 31 habitants9.  
Pour accélérer cette dynamique, le rendement du territoire peut être amplifié par des infrastructures spécialisées et des leviers exogènes7. Le Grenier élève le rendement des plaines basiques de une à trois unités de nourriture, agissant comme un multiplicateur agricole indispensable sur les terrains fertiles3. Le Port améliore la rentabilité des tuiles maritimes, permettant aux cités littorales de soutenir un essor rapide sans surcharger l'arrière-pays3. De son côté, l'Aqueduc réduit directement le volume de nourriture cumulée requis pour déclencher chaque naissance, raccourcissant le nombre de tours séparant les augmentations de population7.  
Certains événements et merveilles permettent d'outrepasser totalement les contraintes de l'accumulation alimentaire9. L'achèvement de la merveille des Jardins Suspendus de Babylone accorde immédiatement un gain de 50 % de population à la ville qui la bâtit9. De plus, le déclenchement d'un Grand Humanitaire offre le choix stratégique entre ajouter immédiatement \+1 habitant à l'ensemble des villes de l'empire ou l'implanter définitivement dans une cité pour augmenter sa vitesse de croissance démographique de 50 %12.

## **Impact Économique et Stratégique de la Production de Colons**

La création d'unités de colons représente le principal vecteur d'expansion géographique, mais elle impose un coût direct sur la capacité productive de la cité mère1. La formation d'un colon nécessite un investissement initial de 20 marteaux de production et ampute la population de la ville d'origine au moment où l'unité est achevée9.  
Le prélèvement démographique appliqué lors de la finalisation d'un colon varie selon le régime politique en vigueur dans l'empire4.

| Régime Politique | Coût en Production | Coût en Population |
| :---- | :---- | :---- |
| Despotisme / Autocratie / Feodalisme / Monarchie / Démocratie | 20 Marteaux | \-2 Population |
| République | 20 Marteaux | \-1 Population |

En réduisant le nombre d'habitants d'une ville, la production d'un colon ramène le seuil de croissance de cette cité au niveau correspondant à sa nouvelle taille inférieure4. En raison de la structure exponentielle du coût de la population, une petite ville retombée à la population 1 ou 2 reconstituera sa réserve alimentaire et regagnera son citoyen perdu en seulement quelques tours4.  
Cette particularité mathématique est le fondement de la stratégie dite de la « pompe à colons » (*Settler Pump*)3. En maintenant intentionnellement une ville secondaire à une taille restreinte (population 2 ou 3\) sous le régime de la République et en la faisant travailler sur des tuiles équilibrées en nourriture et en marteaux, le joueur peut générer un flux continu de colons4. Les colons ainsi produits peuvent soit fonder de nouvelles colonies, soit être transférés et réintégrés dans une ville principale pour faire croître rapidement cette dernière jusqu'à sa taille maximale3.

## **Évolution de la Taille Initiale et Expansion Territoriale des Villes**

Contrairement à une idée reçue, la taille de départ d'une ville fondée et son étendue géographique ne restent pas figées au cours de la partie2. Elles évoluent au fil du progrès technologique et des aménagements urbains2.

### **Évolution de la Population Initiale selon les Ères**

Lors de la fondation d'une cité au tout début de la partie (à l'Ère Antique), la ville commence avec une population de 2 et exploite deux tuiles6. Toutefois, à mesure que la civilisation franchit les âges technologiques, le niveau de départ des nouvelles colonies augmente automatiquement6.

| Ère Technologique au Moment de la Fondation | Population Initiale de la Nouvelle Ville |
| :---- | :---- |
| Ère Antique | 2 Population |
| Ère Médiévale | 3 Population |
| Ère Industrielle | 4 Population |
| Ère Moderne | 5 Population |

Certaines civilisations disposent de traits spécifiques modifiant ces valeurs de départ6. La Chine bénéficie d'une capacité passive accordant systématiquement \+1 point de population supplémentaire lors de la fondation de chaque cité6. Rome obtient à l'Ère Moderne un bonus portant la population initiale des nouvelles villes à 66. Inversement, les Mongols convertissent automatiquement les villages barbares capturés en villes de taille 1, quel que soit l'âge technologique en cours19.

### **Extension du Rayon Exploitable et Rôle du Tribunal**

Au moment de sa fondation, le territoire d'une ville est strictement limité à sa grille immédiate de 3x3 tuiles, c'est-à-dire la tuile centrale occupée par la ville et les 8 tuiles directement adjacentes2. Cette zone de collecte ne s'étend pas automatiquement avec l'accumulation de culture ou la simple croissance démographique2.  
Pour débloquer le second cercle de tuiles (le « grand carré ») et étendre la surface agricole et industrielle accessible aux citoyens, la cité doit obligatoirement construire un **Tribunal** (*Courthouse*)2. Sans la présence d'un Tribunal, une ville dont la population dépasse 8 habitants ne pourra pas affecter ses citoyens supplémentaires sur des tuiles de terrain, faute d'espace légalement exploitable dans son rayon2.

## **Rendement de la Tuile de Centre-Ville et Traitement du Terrain**

La tuile sur laquelle le colon fonde une cité subit un traitement mécanique particulier visant à garantir un apport de base minimal pour le développement urbain2.  
Le centre-ville fournit une valeur plancher de production fixée à au moins un marteau par tour, indépendamment de la nature du terrain sous-jacent2. Que la ville soit établie sur une plaine, un désert, une prairie ou une colline, la tuile centrale produit toujours ce marteau de base2. En outre, la tuile occupée par la ville génère un flux de commerce (*Trade*) dont la valeur n'est pas liée au terrain, mais évolue dynamiquement en fonction du palier démographique atteint par la cité2.  
L'emplacement géographique conserve néanmoins un impact stratégique majeur concernant les ressources naturelles15. Si un colon fonde directement une ville sur une tuile abritant une ressource bonus (comme le Bétail, le Blé, le Fer ou l'Or), cette ressource est **définitivement détruite** et effacée du jeu15. La cité perd ainsi tout le bénéfice supplémentaire que cette tuile aurait pu apporter15. Il est donc fondamental de fonder la ville sur une tuile neutre contiguë afin de pouvoir affecter ultérieurement un citoyen sur la tuile de ressource préservée15.

## **Mécanique des Citoyens Non Affectés et Traitement de l'Ouvrier Intérieur**

Dans *Civilization Revolution*, le travail du terrain ne s'effectue pas via des unités d'ouvriers mobiles sur la carte, mais par l'affectation directe de la population de la ville depuis l'écran de gestion urbaine2. Un citoyen devient « non affecté » lorsqu'il n'est pas positionné sur l'une des tuiles du territoire extérieur23.  
Cette situation se produit lorsque le joueur retire manuellement un ouvrier d'une tuile dans le menu de gestion personnalisée, ou de manière forcée quand le nombre de citoyens dépasse la quantité de tuiles accessibles (notamment avant la construction d'un Tribunal ou en cas de blocus du terrain par des troupes ennemies)2. Lorsqu'un citoyen n'est pas assigné à l'extérieur, il est automatiquement rapatrié **au centre-ville** et prend le statut de travailleur intérieur2.  
Un ouvrier non affecté au terrain ne reste pas inactif : il rejoint l'administration urbaine et produit des ressources dont la nature évolue selon la tranche démographique globale de la cité2.

| Tranche de Population | Qualification de l'Ouvrier Intérieur | Rendement par Citoyen Non Affecté au Terrain |
| :---- | :---- | :---- |
| **Population 1 à 6** | Ouvrier (*Laborer*) | \+1 Production (Marteau) |
| **Population 7 à 12** | Vendeur (*Vendor*) | \+1 Production, \+1 Commerce |
| **Population 13 à 18** | Commerçant (*Trader*) | \+1 Production, \+2 Commerce |
| **Population 19 à 24** | Marchand (*Merchant*) | \+1 Production, \+3 Commerce |
| **Population 25 à 30** | Importateur (*Importer*) | \+1 Production, \+4 Commerce |
| **Population 31** | Exportateur (*Exporter*) | \+1 Production, \+5 Commerce |

Grâce à ce barème, les cités très peuplées conservent une puissance économique considérable même lorsqu'elles atteignent la saturation spatiale de leur territoire3. La conversion des citoyens en spécialistes intérieurs transforme les grandes métropoles en centres de génération de commerce, facilement reconvertibles en or ou en points de recherche scientifique2.

## **Directives et Synthèse Stratégique**

L'analyse approfondie des équations de *Civilization Revolution* permet de formaliser plusieurs règles d'optimisation pour la gestion des villes et l'expansion de l'empire3.  
L'expansion territoriale par les colons gagne à être concentrée sous le régime de la République en exploitant des cités secondaires de faible taille4. Du fait de la structure exponentielle des coûts en nourriture, amputer une ville de population 2 d'un habitant ne nécessite que très peu de tours pour reconstituer la réserve alimentaire, alors que la même opération sur une métropole ralentit lourdement son développement4.  
Sur le plan de l'aménagement, la construction du Tribunal doit être planifiée dès que la population d'une cité s'approche de 8 habitants2. Sans ce bâtiment, tout citoyen supplémentaire est automatiquement relégué au travail intérieur2. Bien que le travail intérieur devienne extrêmement rentable en fin de partie avec l'apparition des Importateurs et Exportateurs, il demeure en début de jeu moins efficace que l'exploitation directe de tuiles aménagées par des Greniers ou des Ports2.  
Enfin, la sélection du site de fondation exige d'isoler les ressources bonus sur les tuiles périphériques15. Éviter d'implanter la ville directement sur ces ressources garantit la préservation de leurs rendements cumulés, indispensables pour alimenter la croissance des cités et soutenir l'effort de guerre ou de recherche3.

#### **Sources des citations**

> 1. Civilization Revolution \- Wikipedia, [https://en.wikipedia.org/wiki/Civilization\_Revolution](https://en.wikipedia.org/wiki/Civilization_Revolution)  
> 2. Civilization Revolution: Info Center \- CivFanatics, [https://civfanatics.com/civrev/infocenter/](https://civfanatics.com/civrev/infocenter/)  
> 3. New City Placement \-- How Much Food is Enough, [https://forums.civfanatics.com/threads/new-city-placement-how-much-food-is-enough.286856/](https://forums.civfanatics.com/threads/new-city-placement-how-much-food-is-enough.286856/)  
> 4. Growth Tactics; Mega-City vs Controlled Growth \- CivFanatics Forums, [https://forums.civfanatics.com/threads/growth-tactics-mega-city-vs-controlled-growth.278716/](https://forums.civfanatics.com/threads/growth-tactics-mega-city-vs-controlled-growth.278716/)  
> 5. City Specialization: A Civilization Revolution Mini Guide, [https://planetcivilization.gamespy.com/Viewc926.html?view=Articles.Detail\&id=37](https://planetcivilization.gamespy.com/Viewc926.html?view=Articles.Detail&id=37)  
> 6. City Spamming \- What's up with that? \- CivFanatics Forums, [https://forums.civfanatics.com/threads/city-spamming-whats-up-with-that.300202/](https://forums.civfanatics.com/threads/city-spamming-whats-up-with-that.300202/)  
> 7. Food (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Food\_(CivRev)](https://civilization.fandom.com/wiki/Food_\(CivRev\))  
> 8. Help with playing Civ1 | Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Help\_with\_playing\_Civ1](https://civilization.fandom.com/wiki/Help_with_playing_Civ1)  
> 9. Population (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Population\_(CivRev)](https://civilization.fandom.com/wiki/Population_\(CivRev\))  
> 10. city growth? \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/46487430](https://gamefaqs.gamespot.com/boards/941683-sid-meiers-civilization-revolution/46487430)  
> 11. If you produce a settler and walk it to another one of your cities you, [https://www.reddit.com/r/CivVI/comments/u4rrzh/if\_you\_produce\_a\_settler\_and\_walk\_it\_to\_another/](https://www.reddit.com/r/CivVI/comments/u4rrzh/if_you_produce_a_settler_and_walk_it_to_another/)  
> 12. One Great Person is missing : r/civ \- Reddit, [https://www.reddit.com/r/civ/comments/1gt1ji/one\_great\_person\_is\_missing/](https://www.reddit.com/r/civ/comments/1gt1ji/one_great_person_is_missing/)  
> 13. Civilization Revolution is "Civ for dummies" and I wish it was more, [https://www.reddit.com/r/patientgamers/comments/1huwyb9/civilization\_revolution\_is\_civ\_for\_dummies\_and\_i/](https://www.reddit.com/r/patientgamers/comments/1huwyb9/civilization_revolution_is_civ_for_dummies_and_i/)  
> 14. How do I grow cities quickly? : r/civrev \- Reddit, [https://www.reddit.com/r/civrev/comments/1iog0ja/how\_do\_i\_grow\_cities\_quickly/](https://www.reddit.com/r/civrev/comments/1iog0ja/how_do_i_grow_cities_quickly/)  
> 15. Guide for Sid Meier's Civilization Revolution \- The Basics, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/3)  
> 16. Quick Settler Production | CivFanatics Forums, [https://forums.civfanatics.com/threads/quick-settler-production.280611/](https://forums.civfanatics.com/threads/quick-settler-production.280611/)  
> 17. Stuck at emperor \- CivFanatics Forums, [https://forums.civfanatics.com/threads/stuck-at-emperor.284327/](https://forums.civfanatics.com/threads/stuck-at-emperor.284327/)  
> 18. Megacity Strategy \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941688-sid-meiers-civilization-revolution/44482192](https://gamefaqs.gamespot.com/boards/941688-sid-meiers-civilization-revolution/44482192)  
> 19. Curse of the mongols | CivFanatics Forums, [https://forums.civfanatics.com/threads/curse-of-the-mongols.325315/](https://forums.civfanatics.com/threads/curse-of-the-mongols.325315/)  
> 20. Guide for Sid Meier's Civilization Revolution \- TrueAchievements, [https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/4](https://www.trueachievements.com/game/Sid-Meiers-Civilization-Revolution/walkthrough/4)  
> 21. A quick guide to the Mongols. \- CivFanatics Forums, [https://forums.civfanatics.com/threads/a-quick-guide-to-the-mongols.289682/](https://forums.civfanatics.com/threads/a-quick-guide-to-the-mongols.289682/)  
> 22. City Placement and Citizens \- Sid Meier's Civilization Revolution, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/43897173](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/43897173)  
> 23. Sid Meier's Civilization Revolution Achievement Guide & Road Map, [https://www.xboxachievements.com/game/sid-meier-civilization-revolution-jp/guide/](https://www.xboxachievements.com/game/sid-meier-civilization-revolution-jp/guide/)  
> 24. Manage workers | CivFanatics Forums, [https://forums.civfanatics.com/threads/manage-workers.282952/](https://forums.civfanatics.com/threads/manage-workers.282952/)  
> 25. How do you get your workers moving where ... \- CivFanatics Forums, [https://forums.civfanatics.com/threads/how-do-you-get-your-workers-moving-where-you-want-how-do-you-get-more-workers.278610/](https://forums.civfanatics.com/threads/how-do-you-get-your-workers-moving-where-you-want-how-do-you-get-more-workers.278610/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAaCAYAAABVX2cEAAABbElEQVR4Xq1TvUoEMRCegIWCjVxhYyWWgvWBJxY2IlhZCL6C+ABWNvcCh5UIlj6B/fU+gJWtFoJWtp7fZJJsZrLZW8/7YDaZ+eZvJwlRC1z2bVa9/SMWj1wOTP0DGO6wRtnStMcVos6xngW5MLwAie+xzDK5hdX+72vGzxD0bfgCU8gbHDng0nCMfXCn1ljDBzoaklT/sSS4B3zWjU2rGZ4ha9T8zoqmPd8L2+SH6iu9kCS78YxL9d9lEZQ9NZYxZCPsd4hnJwkjmBv3ucvclaoKDPkgEDAKOl8F9puLY/LDV4ize0RSnh0PfzWxtbacXImJtZOe3aem6viC7GmTL73rwslifdJ8O/je8Auodc73jRMeea3iRIE5gVwnLXm7uJ2SdFa81zzvAGrz1kQOMz5ik2R2gjmdma327tKWh4Xz9gvs56XgQ9Lh5Cgt7baILi4gFmvD/w/AxlidUdpKSzdaZxVR+QkbUBDa4RfY1DkQ6sWj2QAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADYAAAAaCAYAAAD8K6+QAAACHklEQVR4Xt2WvUoEMRDHJ6CgaHNYiCAWYilYWAkqFjYiWFkI9wpiK1jZ2FqIlQhW4hPYp/cBtLETLQStrhN1ZpPsJrkkm+zFPc4f9+fuZiaTTL52AUYBZhuywQZKPkBTSShDyBci2E5zBuNskoKzsIm60jRvumEMdYQ6QO0LsYX2h5nONeqnECu+L/FbH/cs6rmMEVrV/G0xiTpHTdkOP6IMjnqVxR3qbsk6ak/9SVwxGsy4bYyCwQeYkzptBvioRviOWgPR+Lu0VtxAXVJ/tRx1bBsT6UFSYRUPIJZbzQydLR3yN4XDkApbRHXlhD+CSHBauYvFeNP/J8IxQUuFmdvmDNWR5iWgsyaSKDrooJgGMPpwGMKK0WrJ1SirVWdtQ1q7Mi5wjBTOCA6ZC3P2YsJ2QFwcOuqs3YHIQRfHhBFhITrydsfBKMwbF0IUxuJXjKMuxM9i2yjUWaNnFl25MdCVLh/ihp5Qtw47KYA+AazHHFsxNEWfqBXbiCyDSPSFurd8bvy9cMi6Ff0dKSiI3jx80POMtG07EuHQsDBtiydtxV3UiW3U4KgXTGa/P6bCwVNY/dyXRN2KMyCCdG3pvcif9J7oHFAiHAKXR01x9jiV5vSgSGq6SoezPBNU0miEjRpF4MrrsmUhKXFS8L+hvur6CEFsXDZydpgzlxuth77O+gzxuJq6bC6i4qKCYsiUKFOaFvmrEUfljQoaXX4BG+poSUmS3vsAAAAASUVORK5CYII=>