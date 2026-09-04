# **Analyse mécanique, spatiale et stratégique des artefacts dans Sid Meier's Civilization Revolution**

Dans l'architecture de jeu de *Sid Meier's Civilization Revolution*, les artefacts — également désignés sous le terme de reliques — représentent une mécanique d'exploration à fort impact1. Conçus pour dynamiser la phase initiale de découverte cartographique, ces éléments disséminés à travers le monde procurent d'importants avantages asymétriques à la première civilisation qui parvient à les revendiquer2. L'évaluation approfondie de leur moteur de génération, de leurs règles de placement topologique et de leurs effets fonctionnels permet de comprendre précisément leur rôle dans la dynamique des parties1.

## **Génération, sélection et règles d'exploration**

Les artefacts ne sont pas répartis de manière déterministe ou uniforme d'une partie à l'autre. Le moteur du jeu applique un algorithme de tirage aléatoire conditionné par la taille du monde et les extensions actives lors de la création de la carte1.

### **Sélection par partie et composition du pool**

Le répertoire global comprend jusqu'à 12 artefacts distincts si l'on inclut le jeu de base et l'ensemble des contenus téléchargeables (DLC) ou versions ultérieures comme *Civilization Revolution 2*3. Dans la version originale sans extension, ce pool est restreint à 6 reliques fondamentales1.  
Il est techniquement impossible d'observer l'intégralité du répertoire sur une seule et même carte1. Au moment du chargement initial, le système effectue un tirage au sort afin de sélectionner un nombre fixe d'artefacts — généralement compris entre 3 et 6 selon les paramètres de la carte — qui seront physiquement instanciés1. Chaque artefact retenu est unique et disparaît définitivement dès qu'un joueur en active le bonus5.

| Paramètre de génération | Spécification mécanique |
| :---- | :---- |
| **Volume par carte** | 3 à 6 artefacts générés par partie1. |
| **Méthode d'attribution** | Échantillonnage aléatoire sans remise au chargement de la carte1. |
| **Taille du pool d'origine** | 6 artefacts dans le jeu standard ; 12 artefacts avec les DLC et *CivRev 2*1. |
| **Condition d'unicité** | Instance unique sur la carte, détruite dès son premier déclenchement5. |

### **Mécanismes de détection sous le brouillard de guerre**

Bien que les artefacts soient générés dès le premier tour sous le brouillard de guerre, les joueurs disposent de plusieurs leviers pour localiser ces structures avant même de les révéler visuellement7. D'une part, le survol d'une case masquée contenant un artefact produit un bourdonnement acoustique distinctif via l'interface utilisateur7. D'autre part, la visite de villages indigènes offre fréquemment des renseignements stratégiques : les villageois peuvent transmettre des indices signalant le nombre d'artefacts encore non découverts ou afficher brièvement la position d'un "temple caché" à l'écran via le conseiller aux affaires étrangères6. Enfin, l'obtention de la technologie Vol Spatial débloque la vision globale sur l'intégralité de la carte, révélant automatiquement la position de tous les artefacts subsistants7.

## **Topologie de placement : distribution insulaire et continentale**

La répartition géographique des artefacts obéit à des priorités algorithmiques strictes, conçues pour valoriser le développement des compétences navales tout en conservant une part de variabilité spatiale6.

### **Dominance insulaire et exception continentale**

L'algorithme de placement privilégie très largement la génération d'artefacts sur des îles isolées ou des atolls d'une seule case, distants des masses continentales principales6. Cette configuration impose aux civilisations d'investir rapidement dans la navigation et de transporter des troupes à bord de navires pour aller revendiquer les reliques6.  
Néanmoins, les artefacts ne sont pas exclusivement confinés aux îles11. Il arrive que l'algorithme positionne un ou deux artefacts directement sur le continent principal11. Ce phénomène survient notamment sur des cartes présentant de vastes supercontinents ou via des ensembles de cartes DLC spécifiques tels que *Chokepoint* ou *Donutworld*15. Dans ces configurations terrestres, les unités d'exploration terrestre traditionnelles peuvent s'emparer des reliques dès les premiers tours sans nécessiter de soutien naval13.

### **Fonctionnement hydrographique de la Cité Perdue d'Atlantide**

Parmi les artefacts du jeu, la Cité Perdue d'Atlantide occupe une place singulière sur le plan topologique et interactif7. Contrairement aux autres reliques qui nécessitent qu'une unité terrestre débarque et foule la case, l'Atlantide est générée directement dans les eaux profondes de l'océan, très à l'écart des côtes6. Son activation ne requiert aucun débarquement : le simple fait d'amener une unité navale (telle qu'une Galère dotée de la capacité de haute mer, un Galion ou un Navire à vapeur) sur une case adjacente suffit à déclencher ses effets technologiques7. En raison de sa position océanique, cet artefact fait presque systématiquement partie du sous-ensemble sélectionné par le moteur de carte6.

## **Catalogue exhaustif des artefacts et leurs propriétés**

Le tableau ci-dessous répertorie l'ensemble des 12 artefacts disponibles dans l'écosystème *Civilization Revolution*, en détaillant leur condition d'accès (jeu d'origine ou contenu téléchargeable) ainsi que leurs effets mécaniques directs au moment de leur découverte3.

| Nom de l'artefact | Extension requise | Effet mécanique à la découverte |
| :---- | :---- | :---- |
| **Angkor Wat** | Jeu de base | Construit immédiatement une Merveille gratuite dans l'une des villes du découvreur2. |
| **L'Arche d'Alliance** | Jeu de base | Érige un Temple gratuit dans chaque ville qui en est dépourvue ; transforme les Temples existants en Cathédrales1. |
| **Les Sept Cités d'Or** | Jeu de base | Injecte une quantité massive d'or directement dans le trésor national (200 à 400 pièces d'or selon l'ère)2. |
| **L'École de Confucius** | Jeu de base | Accorde immédiatement plusieurs Personnages Illustres à la civilisation2. |
| **Les Chevaliers Templiers** | Jeu de base | Rejoint le joueur en lui fournissant une unité militaire avancée (Chevalier, Canon ou Char d'assaut selon l'ère)2. |
| **La Cité Perdue d'Atlantide** | Jeu de base | Complète immédiatement la recherche des trois technologies les moins coûteuses disponibles dans l'arbre d'apprentissage2. |
| **La Cour de Camelot** | Contenu DLC / *CivRev 2* | Convertit instantanément l'ensemble des unités de Cavaliers en Chevaliers3. |
| **Le Grand Sphinx** | Contenu DLC / *CivRev 2* | Autorise la transition immédiate vers n'importe quel régime politique sans prérequis technologique ni anarchie3. |
| **L'Aiguille du Pharaon** | Contenu DLC / *CivRev 2* | Débloque instantanément une technologie de pointe3. |
| **L'Armée de Terracotte** | Contenu DLC / *CivRev 2* | Confère gratuitement la promotion "Éclaireur" (*Scout*) à l'ensemble des unités militaires de l'empire3. |
| **Le Rayon de la Paix de Tesla** | Contenu DLC / *CivRev 2* | Déclenche un armistice mondial immédiat en mettant fin à toutes les guerres actives3. |
| **La Tour de Babel** | Contenu DLC / *CivRev 2* | Établit automatiquement le contact diplomatique avec toutes les civilisations présentes sur la carte3. |

## **Incidences stratégiques et optimisation du timing**

L'intégration des artefacts dans une trajectoire de victoire repose sur l'évaluation du moment opportun pour les déclencher4. Les gains apportés par ces structures varient considérablement en fonction de l'état de développement de la civilisation découvreuse4.  
L'obtention précoce des **Sept Cités d'Or** modifie profondément la phase d'expansion initiale16. L'apport immédiat de 200 à 250 pièces d'or permet de franchir le premier palier économique majeur, accordant l'accès gratuit à des technologies comme la Monnaie ou la Banque tout en offrant le capital nécessaire pour précipiter la production de Colonisateurs ou de bâtiments d'infrastructure16.  
À l'inverse, l'activation de **L'Arche d'Alliance** gagne en efficacité lorsqu'elle est différée4. Si un joueur découvre cet artefact tôt dans la partie, la stratégie optimale consiste à sécuriser militairement la zone sans capturer la relique immédiate4. En développant un réseau urbain dense et en construisant préalablement des Temples dans chaque cité, la capture ultérieure de l'artefact transforme simultanément ces édifices en Cathédrales4. Ce bond culturel massif génère un afflux de Personnages Illustres et accélère la progression vers une Victoire Culturelle4.  
Concernant **La Cité Perdue d'Atlantide**, la mécanique d'attribution technologique cible par priorité les recherches les moins coûteuses de l'arbre du joueur4. Un pilotage stratégique averti consiste à effectuer manuellement les recherches mineures à bas coût juste avant de s'approcher de l'artefact4. Cette manipulation force le système à accorder gratuitement des technologies médiévales ou industrielles beaucoup plus lourdes en points de recherche4.  
Enfin, l'avantage militaire conféré par les **Chevaliers Templiers** dépend directement de l'ère de découverte4. Débloquer cette unité à l'Ère Ancienne fournit une force de frappe disproportionnée capable de raser ou de capturer les capitales adverses avant que ces dernières ne disposent de remparts défensifs solides4. Pour empêcher les civilisations rivales d'accéder à ces leviers stratégiques, le joueur peut installer une garnison à proximité de la relique ou étendre ses frontières culturelles pour l'englober, neutralisant ainsi toute tentative de capture ennemie sans déclaration de guerre préalable4.

## **Conclusion**

L'implémentation des artefacts dans *Sid Meier's Civilization Revolution* repose sur un équilibre entre génération aléatoire et opportunisme stratégique1. En sélectionnant un sous-ensemble restreint au sein d'un pool d'artefacts et en les positionnant principalement sur des îles isolées — mais parfois sur le continent principal —, le jeu force les joueurs à adapter leurs priorités d'exploration navale et terrestre1. La compréhension fine de leurs conditions d'apparition et de leurs effets permet d'en faire des catalyseurs décisifs pour l'obtention des victoires militaire, culturelle, économique ou scientifique4.

#### **Sources des citations**

> 1. Civilization Revolution: Relics \- CivFanatics, [https://civfanatics.com/civrev/civilopedia/relics/](https://civfanatics.com/civrev/civilopedia/relics/)  
> 2. Relics in Civilization Revolution | CivFanatics Forums, [https://forums.civfanatics.com/threads/relics-in-civilization-revolution.269382/](https://forums.civfanatics.com/threads/relics-in-civilization-revolution.269382/)  
> 3. Artifacts (CivRev2) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Artifacts\_(CivRev2)](https://civilization.fandom.com/wiki/Artifacts_\(CivRev2\))  
> 4. When to get artifacts \- CivFanatics Forums, [https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/](https://forums.civfanatics.com/threads/when-to-get-artifacts.298994/)  
> 5. 1 ancient artifact still undiscovered? \- CivFanatics Forums, [https://forums.civfanatics.com/threads/1-ancient-artifact-still-undiscovered.290155/](https://forums.civfanatics.com/threads/1-ancient-artifact-still-undiscovered.290155/)  
> 6. Good Afternoon, Doctor Jones. achievement in Sid Meier's, [https://www.trueachievements.com/a21910/good-afternoon-doctor-jones-achievement](https://www.trueachievements.com/a21910/good-afternoon-doctor-jones-achievement)  
> 7. Artifacts (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Artifacts\_(CivRev)](https://civilization.fandom.com/wiki/Artifacts_\(CivRev\))  
> 8. Civilization Revolution \- Wikipedia, [https://en.wikipedia.org/wiki/Civilization\_Revolution](https://en.wikipedia.org/wiki/Civilization_Revolution)  
> 9. Ancient Artifact \- Sid Meier's Civilization Revolution, [https://www.xboxachievements.com/forum/topic/62788-ancient-artifact/](https://www.xboxachievements.com/forum/topic/62788-ancient-artifact/)  
> 10. Sid Meier's Civilization Revolution Achievement Guide & Road Map, [https://www.xboxachievements.com/game/sid-meiers-civilization-revolution/guide/](https://www.xboxachievements.com/game/sid-meiers-civilization-revolution/guide/)  
> 11. Artifact on mainland : r/civrev \- Reddit, [https://www.reddit.com/r/civrev/comments/1vdrwim/artifact\_on\_mainland/](https://www.reddit.com/r/civrev/comments/1vdrwim/artifact_on_mainland/)  
> 12. How do you win by year 1000 AD? \- Sid Meier's Civilization Revolution, [https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44720387](https://gamefaqs.gamespot.com/boards/941684-sid-meiers-civilization-revolution/44720387)  
> 13. 2 LAND ARTIFACTS AND A BANGER TO BOOT GREEK DEITY, [https://www.youtube.com/watch?v=bitG7JBUzXk](https://www.youtube.com/watch?v=bitG7JBUzXk)  
> 14. Crazy map : First time seeing 2 artefacts on the main land \- Reddit, [https://www.reddit.com/r/civrev/comments/1tf1k6c/crazy\_map\_first\_time\_seeing\_2\_artefacts\_on\_the/](https://www.reddit.com/r/civrev/comments/1tf1k6c/crazy_map_first_time_seeing_2_artefacts_on_the/)  
> 15. Brave New Worlds Map Pack (CivRev) \- Civilization Wiki \- Fandom, [https://civilization.fandom.com/wiki/Brave\_New\_Worlds\_Map\_Pack\_(CivRev)](https://civilization.fandom.com/wiki/Brave_New_Worlds_Map_Pack_\(CivRev\))  
> 16. Rate-an-artifact \- Sid Meier's Civilization Revolution \- GameFAQs, [https://gamefaqs.gamespot.com/boards/941688-sid-meiers-civilization-revolution/47729660](https://gamefaqs.gamespot.com/boards/941688-sid-meiers-civilization-revolution/47729660)  
> 17. What is the best Artifact in Civ Rev? : r/civrev \- Reddit, [https://www.reddit.com/r/civrev/comments/1dfujnb/civ\_rev\_poll\_what\_is\_the\_best\_artifact\_in\_civ\_rev/](https://www.reddit.com/r/civrev/comments/1dfujnb/civ_rev_poll_what_is_the_best_artifact_in_civ_rev/)