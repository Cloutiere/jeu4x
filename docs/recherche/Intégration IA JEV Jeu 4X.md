# **Architecture Décisionnelle de Jev et Intégration pour Agents de Jeux 4X**

## **Genèse et Paradigme des Modèles Système 1**

L'écosystème de l'intelligence artificielle appliquée à la logique logicielle a connu une évolution majeure le 15 septembre 2026 avec le lancement en accès anticipé de Jev par la startup californienne TypeSafe AI1. Fondée à San Francisco en 2024 par Diogo Almeida — ancien chercheur d'OpenAI et contributeur direct aux travaux de recherche sur InstructGPT et ChatGPT — aux côtés de Sasha Sheng et Erik Gafni, l'entreprise s'est structurée autour d'un constat d'impasse concernant l'usage exclusif des grands modèles de langage (LLM) pour la logique métier1. Soutenue par une levée de fonds en amorçage de 40 millions de dollars menée par DCVC, valorisant la société à 200 millions de dollars, TypeSafe AI propose un modèle d'IA non génératif orienté vers la prise de décision structurée1.  
Le nom du modèle rend hommage à l'économiste britannique du XIXe siècle William Stanley Jevons, formalisateur du paradoxe de Jevons1. Ce paradoxe stipule que l'accroissement de l'efficacité dans l'utilisation d'une ressource en augmente dramatiquement la consommation globale1. L'architecture de Jev repose sur le principe qu'une réduction drastique des coûts et des temps de latence de la décision probabiliste permettra d'insérer l'intelligence artificielle au niveau atomique des logiciels et des moteurs de jeux, là où les coûts des LLM traditionnels s'avéraient prohibitifs1.  
Jev constitue la première implémentation commerciale de la classe des modèles dits « Système 1 » (*System One models*)1. Cette désignation s'inspire de la cartographie cognitive établie par le psychologue Daniel Kahneman1. Alors que les LLM autorégressifs simulent le « Système 2 » (une pensée lente, séquentielle, délibérative et coûteuse en calcul), Jev est conçu pour exécuter le « Système 1 » : une évaluation rapide, intuitive, parallèle et automatique de l'état d'un système1.  
Contrairement aux LLM génératifs qui produisent du texte libre mot à mot, Jev ne génère aucune syntaxe textuelle1. L'inférence s'effectue en une passe parallèle unique (*single parallel pass*) évaluant l'état complet transmis par rapport à un ensemble de questions préformatées1. Il en résulte une absence totale d'hallucination textuelle ou d'erreurs de typage syntaxique, le modèle renvoyant exclusivement des structures de données strictement typées et accompagnées de probabilités calibrées1.  
Sur le plan de l'apprentissage, Jev s'affranchit du réglage par renforcement à partir de préférences humaines (RLHF), couramment sujet au phénomène de collapse de mode (*mode dropping*)5. À la place, TypeSafe AI utilise l'apprentissage par renforcement pour décisions calibrées (*Reinforcement Learning for Calibrated Decisions* ou RLCD)1. Cette méthode optimise directement les probabilités prédites en les confrontant aux résultats objectifs mesurés, assurant qu'une probabilité renvoyée de ![][image1] corresponde statistiquement à un taux de réussite exact de 80 % sur un grand volume d'exécutions1.

## **Spécifications Techniques et Primitives Structurées**

L'espace de réponse de Jev est strictement borné par un schéma défini au moment de la requête1. Il est impossible pour le modèle d'émettre des clés non déclarées, du texte explicatif ou du code malformé1. L'interface de programmation s'articule autour de trois primitives fondamentales1.

### **Primitive Choice**

La primitive Choice effectue une sélection catégorielle parmi une liste fermée d'options textuelles (prenant en charge jusqu'à 255 options)4. Elle est privilégiée pour le routage d'actions, la sélection de tactiques ou le choix de comportements4. Le retour fournit la clé de l'option choisie (.choice), une mesure de confiance statistique globale (.confidence), ainsi que la distribution complète des probabilités attribuées à l'ensemble des choix possibles (.probabilities)7.

### **Primitive Score**

La primitive Score évalue l'état fourni en le positionnant sur une grille ordonnée composée de 2 à 10 niveaux décrits en langage naturel7. Le modèle calcule une valeur numérique continue (.score) capable d'interpoler entre deux échelons discrets (par exemple ![][image2] sur un intervalle de ![][image3] à ![][image4])7. Cette primitive permet d'estimer des échelles de risque, d'urgence ou d'agressivité avec une grande finesse7.

### **Primitive Noul**

La primitive Noul (empruntant son nom à la racine binaire de l'affirmation) évalue la probabilité qu'une affirmation spécifique concernant l'état soit vraie1. Elle renvoie un nombre flottant (.noul) compris dans l'intervalle ![][image5]1. Contrairement aux primitives Choice et Score, Noul ne comporte pas de champ .confidence séparé, la valeur numérique représentant directement la certitude calibrée du modèle7.  
Le tableau ci-dessous résume les divergences architecturales, opérationnelles et économiques entre les grands modèles de langage génératifs de frontière et le modèle Système 1 Jev1.

| Dimension Technique | Modèles LLM Génératifs (ex. Claude Opus 5, GPT-5.6) | Modèle Système 1 (TypeSafe Jev) |
| :---- | :---- | :---- |
| **Format des sorties** | Chaîne de texte non contrainte générée jeton par jeton1 | Objets typés stricts (Choice, Score, Noul)1 |
| **Garantie de schéma** | Nécessite du parsing JSON, du filtrage et des retentatives3 | Garantie native : aucune sortie hors schéma possible1 |
| **Latence d'inférence** | 3,0 à 37,8 secondes par appel3 | 70 à 500 millisecondes (médiane \~130 ms)2 |
| **Structure tarifaire** | \~\$10,00 par million de jetons en entrée \+ surcoût en sortie2 | \$0,042 par million de jetons en entrée (sorties gratuites)2 |
| **Passes d'inférence** | Autorégressive séquentielle (latence liée à la longueur)3 | Évaluation parallèle d'une seule passe sur l'état1 |
| **Mesure d'incertitude** | Non mesurée quantitativement dans le texte généré2 | Probabilités et indices de confiance calibrés1 |

## **Paradigme de Modélisation pour la Logique de Jeu 4X**

Les jeux de stratégie 4X (Explore, Expand, Exploit, Exterminate) présentent des espaces d'états d'une grande complexité combinatoire. L'implémentation d'une IA au sein d'un moteur 4X au moyen d'un LLM traditionnel échoue généralement en raison d'une latence qui interrompt le rythme du jeu, de coûts financiers accumulés à chaque tour et de l'incertitude sur la validité des ordres générés.  
L'utilisation de Jev pour piloter un bot 4X repose sur une séparation stricte des responsabilités : le code classique déterministe conserve l'exclusivité du calcul des règles, de l'arithmétique exacte, du calcul de trajectoire (algorithmes A\*), de la légalité des actions et de la simulation des combats3. Jev intervient exclusivement en tant que moteur de décision stratégique, résolvant les arbitrages probabilistes flous que la programmation impérative éprouve des difficultés à formaliser3.

### **Assemblage de l'État : *Fetch Precisely, Judge Cheaply***

La performance décisionnelle de Jev dépend directement de la qualité du contexte transmis7. Le modèle n'a accès à aucune information extérieure à l'état fourni dans la requête7. L'intégration dans un jeu 4X doit respecter la règle « Extraire précisément, juger à bas coût » (*Fetch precisely, judge cheaply*)7. Transmettre la matrice brute de la carte du jeu provoquerait un phénomène de « pourrissement du contexte » (*context rot*), dégradant la précision du modèle7. Inversement, omettre une variable géopolitique majeure amènerait Jev à produire un jugement parfaitement calibré mais appuyé sur une vision tronquée7.  
La fenêtre de contexte globale accepte jusqu'à 64 000 jetons (ou 32 000 jetons pour l'état cumulé avec la question la plus longue)7. Pour un bot 4X, l'état doit être sérialisé sous forme d'un objet JSON condensé et structuré comprenant :

> 1. **La situation socio-économique** : Stocks de ressources, revenus nets par tour, équilibre énergétique, taux de contentement des colonies et capacités de production.  
> 2. **La posture militaire et frontalière** : Ratio de puissance militaire globale, forces ennemies détectées dans le rayon d'influence, score de fortification des cités frontalières.  
> 3. **Le contexte diplomatique** : Traités actifs, tensions accumulées avec les factions rivales et proximité des victoires concurrentes (scientifique, militaire, culturelle).  
> 4. **Les opportunités d'expansion** : Liste pré-filtrée par le moteur des cibles de colonisation ou d'exploitation les plus viables.

### **Le Motif de la Dispersion Spéculative (*Speculative Fan-Out*)**

Dans un modèle autorégressif classique, multiplier les questions augmente le nombre de jetons générés et démultiplie le temps de réponse. Avec Jev, l'évaluation de toutes les questions soumises dans le dictionnaire s'effectue en une unique passe parallèle1.  
Cette propriété autorise l'utilisation du motif de dispersion spéculative (*speculative fan-out*) : au lieu de fractionner la prise de décision en plusieurs requêtes successives, l'agent 4X soumet au début du tour l'intégralité des questions stratégiques, tactiques et économiques potentielles en un seul appel d'API3. Le code du bot lit ensuite localement les réponses nécessaires selon les branches de comportement sélectionnées, sans subir de pénalité de latence réseau7.

## **Configuration Pratique et Implémentation du Bot 4X**

La configuration de l'environnement requiert Python 3.10+ (ou Node.js 20+) ainsi que l'installation du package officiel typesafe-sdk7. La clé d'accès à l'API est transmise via la variable d'environnement TYPESAFE\_API\_KEY7. Par défaut, le client interroge l'alias jev-latest sur l'endpoint https://api.typesafe.ai/v1/systemone7.

### **Code Python de Contrôle du Bot 4X**

Le script ci-dessous illustre l'implémentation complète d'un contrôleur d'agent pour jeu 4X. Le programme assemble l'état JSON, soumet simultanément des primitives Choice, Score et Noul, puis applique un filtrage par seuil de confiance (*confidence-gated routing*) pour exécuter les décisions en toute sécurité7.

Python  
import os  
import json  
from typesafe\_sdk import TypeSafeClient, Choice, Score, Noul

\# Initialisation du client (lecture automatique de TYPESAFE\_API\_KEY)  
client \= TypeSafeClient()

def process\_4x\_turn(game\_state: dict) \-\> dict:  
    """  
    Évalue l'état du jeu 4X via Jev et retourne des ordres typés  
    destinés à être exécutés par le moteur déterministe.  
    """  
      
    \# Appel à l'API Système 1  
    response \= client.system\_one(  
        state=game\_state,  
        questions={  
            \# Primitive Choice : Détermination de la posture stratégique  
            "macro\_strategy": Choice(  
                instructions="Sélectionner la posture prioritaire pour l'empire ce tour-ci.",  
                criteria={  
                    "military\_expansion": "Prioriser la production d'unités de combat et préparer la guerre.",  
                    "economic\_growth": "Développer les infrastructures, les routes commerciales et les récoltes.",  
                    "technological\_rush": "Maximiser la recherche scientifique et les bâtiments académiques.",  
                    "fortification": "Renforcer la défense des frontières, réparer les cités et sécuriser le territoire."  
                }  
            ),  
              
            \# Primitive Score : Évaluation du niveau de menace militaire (Échelle 0 à 3\)  
            "threat\_assessment": Score(  
                instructions="Évaluer la sévérité du risque militaire imminent sur nos frontières.",  
                criteria=\[  
                    "Aucune menace décelée, frontières sécurisées",           \# Niveau 0  
                    "Présence militaire voisine modérée ou distante",         \# Niveau 1  
                    "Concentration anormale de troupes à la frontière",        \# Niveau 2  
                    "Invasion imminente ou guerre ouverte déclarée"           \# Niveau 3  
                \]  
            ),  
              
            \# Primitive Noul : Pertinence d'une frappe préventive  
            "launch\_preemptive\_strike": Noul(  
                instructions="L'empire rival principal présente-t-il une vulnérabilité tactique majeure exploitable ce tour-ci ?"  
            ),  
              
            \# Primitive Noul : Validation de la fondation d'une nouvelle colonie  
            "authorize\_colonization": Noul(  
                instructions="La stabilité économique et la couverture militaire permettent-elles de fonder une cité sans affaiblir l'empire ?"  
            )  
        }  
    )  
      
    \# Extraction des données typées  
    strategy\_ans \= response.answers\["macro\_strategy"\]  
    threat\_ans \= response.answers\["threat\_assessment"\]  
    strike\_ans \= response.answers\["launch\_preemptive\_strike"\]  
    colony\_ans \= response.answers\["authorize\_colonization"\]  
      
    directives \= {  
        "selected\_posture": strategy\_ans.choice,  
        "posture\_confidence": strategy\_ans.confidence,  
        "threat\_score": threat\_ans.score,  
        "commands": \[\]  
    }  
      
    \# Routage sécurisé basé sur les seuils de confiance (Confidence-Gated Routing)  
      
    \# 1\. Validation de la stratégie globale  
    if strategy\_ans.confidence \< 0.65:  
        \# En cas d'incertitude du modèle, appliquer un comportement économique conservateur  
        directives\["selected\_posture"\] \= "economic\_growth"  
        directives\["fallback\_applied"\] \= True

    \# 2\. Arbitrage militaire (Seuil strict sur Noul et Score)  
    if strike\_ans.noul \>= 0.80 and threat\_ans.score \>= 2.0:  
        directives\["commands"\].append({  
            "action": "ATTACK\_RIVAL",  
            "target": game\_state\["diplomacy"\]\["main\_rival"\]\["id"\],  
            "probability": strike\_ans.noul  
        })  
    else:  
        directives\["commands"\].append({"action": "MAINTAIN\_DEFENSIVE\_STANCE"})  
          
    \# 3\. Arbitrage d'expansion  
    if colony\_ans.noul \>= 0.70:  
        directives\["commands"\].append({  
            "action": "PRODUCE\_SETTLER",  
            "location": game\_state\["expansion\_targets"\]\[0\]\["sector\_id"\]  
        })  
          
    return directives

\# Test d'exécution avec un état factice  
if \_\_name\_\_ \== "\_\_main\_\_":  
    mock\_game\_state \= {  
        "turn": 58,  
        "empire": {  
            "name": "Terran Federation",  
            "credits\_reserve": 2100,  
            "net\_credits\_per\_turn": 180,  
            "research\_points": 140,  
            "fleet\_power": 620  
        },  
        "diplomacy": {  
            "main\_rival": {  
                "id": "Zerg\_Swarm",  
                "relation\_index": \-0.80,  
                "fleet\_power": 910,  
                "border\_force\_count": 18  
            }  
        },  
        "expansion\_targets": \[  
            {"sector\_id": "Vega\_Prime", "fertility\_score": 0.88, "distance\_turns": 3}  
        \]  
    }  
      
    execution\_plan \= process\_4x\_turn(mock\_game\_state)  
    print(json.dumps(execution\_plan, indent=2, ensure\_ascii=False))

## **Applications de Jeux Vidéo et Benchmarks d'Inférence**

L'efficacité de Jev dans les jeux vidéo et les environnements de simulation temps réel fait l'objet de plusieurs projets de référence au sein de la communauté open-source :

* **StarCraft Shareware (phyous/tsai-sc)** : L'agent exécute la première mission de combat (*Strongarm*) du jeu StarCraft original3. La boucle d'environnement met le jeu en pause durant la capture d'état et l'inférence11. Jev réalise l'intégralité de la mission à travers 421 décisions tactiques successives3.  
* **Doom (lukaske/jev-doom-agent)** : Agent opérant à environ 10 requêtes par seconde à partir d'états textuels décrivant le champ de vision du joueur, pour un coût financier estimé à \$7,00 par heure d'exécution4.  
* **Contrôle de Drone MuJoCo (RomanSlack/jev-drone)** : Implémentation d'une architecture de contrôle multi-fréquence3. Le contrôleur de vol géométrique tourne en code pur à 500 Hz, la couche de sécurité à 50 Hz, la vision classique à 15 Hz, tandis que Jev intervient à 2,5 Hz uniquement pour formuler des conseils tactiques (choix de manœuvre, niveau de risque, occlusion de cible)3.

Le tableau ci-dessous modélise le coût financier et la latence cumulée pour une partie de jeu 4X de 200 tours impliquant 4 factions contrôlées par l'IA, comparant un bot basé sur un LLM de frontière à un bot fondé sur Jev2.

| Métrique de Simulation (Partie 4X) | Agent LLM Génératif (ex. Claude Opus 5\) | Agent Système 1 (TypeSafe Jev) |
| :---- | :---- | :---- |
| **Requêtes par tour par faction** | 5 appels séquentiels | 1 appel parallèle (Speculative Fan-out)6 |
| **Volume de jetons par tour** | 1 500 entrée / 150 sortie par appel | 1 200 jetons entrée / 0 sortie4 |
| **Coût d'inférence (Entrée / Sortie)** | \$10,00 / \$30,00 par million de jetons2 | \$0,042 / \$0,00 par million de jetons2 |
| **Coût financier total de la partie** | \~\$48,00 | \~\$0,1612 |
| **Temps d'attente cumulé du moteur** | \~133 minutes d'inférence | \~1,7 minute d'inférence2 |

## **Recommandations Stratégiques et Directives d'Optimisation**

Pour maximiser les performances de votre bot 4X propulsé par Jev, trois directives formulées par l'équipe de TypeSafe AI et les premiers développeurs doivent être appliquées :

> 1. **Rédiger avec un sens littéral strict** : Jev interprète les instructions au pied de la lettre sans inférer les conditions implicites7. Évitez les propositions négatives ou les conditions imbriquées dans les instructions des primitives7. Si une erreur de décision survient, l'explication que vous donneriez à un humain constitue exactement le texte manquant dans votre instruction7.  
> 2. **Exclure l'arithmétique du modèle** : Jev traite les dates, les coordonnées et les nombres comme des représentations textuelles et non comme des grandeurs ordonnées7. Les comparaisons de distances, les calculs de rentabilité et les tris de listes doivent obligatoirement être exécutés en amont par votre code déterministe7.  
> 3. **Surveiller la platitude des distributions** : Lors de l'utilisation de Choice, si la distribution des probabilités brutes (.probabilities) s'avère uniforme entre toutes les options, le modèle signale que l'état fourni ne contient pas les éléments permettant de les départager7. Cela indique qu'il faut enrichir la préparation de l'état ou réviser la clarté des critères fournis7.

En intégrant Jev en tant que moteur de décision Système 1 au sein d'une architecture logicielle déterministe, vous doterez votre jeu 4X d'agents autonomes extrêmement rapides, économiquement viables et totalement exempts d'erreurs de syntaxe ou d'hallucinations textuelles.

#### **Sources des citations**

> 1. Jev (AI model) \- Wikipedia, [https://en.wikipedia.org/wiki/Jev\_(AI\_model)](https://en.wikipedia.org/wiki/Jev_\(AI_model\))  
> 2. TypeSafe launches Jev for AI decisions inside software, [https://www.therundown.ai/news/typesafe-jev-ai-decisions-software](https://www.therundown.ai/news/typesafe-jev-ai-decisions-software)  
> 3. The Ultimate Guide to Jev: The new Frontier AI for faster decisions, [https://medium.com/@unicodeveloper/the-ultimate-guide-to-jev-the-new-frontier-ai-for-faster-decisions-acd78e5f4c56](https://medium.com/@unicodeveloper/the-ultimate-guide-to-jev-the-new-frontier-ai-for-faster-decisions-acd78e5f4c56)  
> 4. 20 Agentic Use Cases of TypeSafe AI's Jev \- MarkTechPost, [https://www.marktechpost.com/2026/09/27/20-agentic-use-cases-of-typesafe-ais-jev/](https://www.marktechpost.com/2026/09/27/20-agentic-use-cases-of-typesafe-ais-jev/)  
> 5. Latent Space: The AI Engineer Podcast \- Jev: System One models, [https://podscripts.co/podcasts/latent-space-the-ai-engineer-podcast/jev-system-one-models-for-prod-not-god-with-diogo-almeida-ceo-typesafe-ai](https://podscripts.co/podcasts/latent-space-the-ai-engineer-podcast/jev-system-one-models-for-prod-not-god-with-diogo-almeida-ceo-typesafe-ai)  
> 6. Jev AI: The Rise of System One Models and a New Interface, [https://medium.com/@danushidk507/jev-ai-the-rise-of-system-one-models-and-a-new-interface-between-ai-and-software-cd38cc18ad8b](https://medium.com/@danushidk507/jev-ai-the-rise-of-system-one-models-and-a-new-interface-between-ai-and-software-cd38cc18ad8b)  
> 7. How to Use Jev: A practical guide to TypeSafe's System One model, [https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e](https://dev.to/valyuai/how-to-use-jev-a-practical-guide-to-typesafes-system-one-model-g5e)  
> 8. Jev by TypeSafe AI | What is a System-1 Decision Model | CampusX, [https://www.youtube.com/watch?v=0zFfcEr1e9U](https://www.youtube.com/watch?v=0zFfcEr1e9U)  
> 9. Awesome Jev Use Cases · Real-World Jev (TypeSafe AI System, [https://anandi1989.github.io/awesome-jev-usecases/](https://anandi1989.github.io/awesome-jev-usecases/)  
> 10. Jev / TypesafeAI is revolutionary as LLM's : r/ArtificialInteligence, [https://www.reddit.com/r/ArtificialInteligence/comments/1wkhsyh/jev\_typesafeai\_is\_revolutionary\_as\_llms/](https://www.reddit.com/r/ArtificialInteligence/comments/1wkhsyh/jev_typesafeai_is_revolutionary_as_llms/)  
> 11. tsai-sc: Games & simulations Jev project \- AionEdge, [https://aionedge.org/p/phyous-tsai-sc.html](https://aionedge.org/p/phyous-tsai-sc.html)  
> 12. OneVOneJev: Games & simulations Jev project \- AionEdge, [https://aionedge.org/p/emrickgarrett-onevonejev.html](https://aionedge.org/p/emrickgarrett-onevonejev.html)  
> 13. TypeSafe AI (Jev) | DeepEval \- The LLM Evaluation Framework, [https://deepeval.com/integrations/models/typesafe-ai](https://deepeval.com/integrations/models/typesafe-ai)  
> 14. Jev SDK for TypeScript and Python (TypeSafe SDK) \- OpenRouter, [https://openrouter.ai/docs/guides/community/typesafe-sdk](https://openrouter.ai/docs/guides/community/typesafe-sdk)  
> 15. Awesome Jev use cases: TypeSafe AI Jev demos, repos, limits and, [https://github.com/walidboulanouar/awesome-jev-use-cases](https://github.com/walidboulanouar/awesome-jev-use-cases)  
> 16. embodied-jev: Games & simulations Jev project \- AionEdge, [https://aionedge.org/p/fbddcz-embodied-jev](https://aionedge.org/p/fbddcz-embodied-jev)  
> 17. jev-drone: Games & simulations Jev project \- AionEdge, [https://aionedge.org/p/romanslack-jev-drone](https://aionedge.org/p/romanslack-jev-drone)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACUAAAAZCAYAAAC2JufVAAACgUlEQVR4XrVWPWtUQRS9g7EQ00WRYKGBpBAEEfEHCCqCWGnnD0jqCApiY2shIoIgNpZioSCCRQorCSrYaGUCCppGgigoGPDjnHdn3szc97HzdsmBs7tzP867c+fjrci2w1lDjeDpjihFgUJBSILO6E5HjdER48MNEh8UbDBJbkRTpWkh2q3F8OllKk4e4fMVeAa8Dn7NA3rxGrwFXsDDtvD90/iJs6K+BeEznPzD9+48JMcp8Fs90mncAZ+CuxJbG5bAE8bGiT1OxtRgEanKYfBPGLTJb4IPjO24qNAVY08xDb4QLSLFLB7yKRnflmb3WAf19xt7DTptUce8/Zmxp9MKRa3XFgVzQx6XaEWaRRHUP2mNAdqRvIeHKruTz5m12eejovkku3sT/Csx8gj4Q/LOBTDnamqorwfXvkyzova2GeZw9VKTPCDcowHsGjW6irIrVIMdGVQUJ+QnxeVhZ7iZ30os7q4PNUXFVvtm9BQ1XqemRB9+T4eOhfHYMy+crAGdyvcGnfeNOWx03kFd4KlijMVe0e7zIOwB34vuqwy+UxetPeCjNE/ZOdGkRWNPgVm6tqKI38Kl1VlyFbjEKVgwc1m0hWMeuxKTKiH3XHhLV+4KQYSc87Z5cAM878cBB8APSde5zMzTi1jBu23kW+Ma+At8CL4DX+buCl9Ei19ObHz2d9G9tCL6+lhL/AF6xej+4yttC7E7ojvdT/neugQ+AW/kCRmmXXMf7BTdX6vgaT8WK44xfW9EJz5jnBOBbd9X/Rr2R6iBybNV4TKY3PD9sv3eAuQCRi4OD8ZRrHQSRIVireLAwRhDOU0ZI70VBToFIYVB24neAnqdEYVho/AfXWB+RB/ROksAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAZCAYAAAChBHccAAACu0lEQVR4XsWWLYhVQRTH/4MYREFMIgi7GgTBIGwQm8FgWYNg0mBUEINBs6BdLCIigk3RYBGD4YJBYZMgWNag+IEaLGpQ/Dj/e2bufNyZd7/erj84u2/OOXPuf86bO/OAdcGkjqyLFNxdjJzWYFol/HBq7QxDSw7NV/Kz8t4uxs36L5SklvwDmVMZModSp8RWpc6bNNDBithDsX1iN8VeRVEV9kDst9gJsTtif60vZMn6U9sZJqUL3S92TWwvVPgQ8aeRigUei12Ff8xBqIgXwZN/WN8RHdb+JROLfia2QeNZomXswDDxh8X+iF1M/MegDz9qx4fsmOb4aMfnAx87H9dKt1M6Dhgqng+mgFT8su0gv03C7lViZ5oM4Bc0hw1wtMU7Zoh2NOJ75JInUAHLiZ+C6H+a+B2L0PjXRJQTf1nsrdhzsU0u2KWpFm/6d75CXrx78dI6zs+tti2Jkd3ggjwbwXyDBVNU7gMi3gTbpjjDUaGP+KBMIIInD3O2Np48rxEvqEhx26RjS4UZ4ju+QZ5InMtTydNucQXN66TfC+vr84VMTwzCxdB/3443i+1B3APubeY4YQtiL8WuNxlKhV7iTU/xHnb4O/yp4qAw7mt3kvAzv4mqyYC5Qp+NEbeYT02KwguwLD5oR2Hb1KMt8J3aFQR5puuerNPqP7y0eHk5eGo8gp4yjg/QWi6Pe595fEkdLMack4GvRelaZlcZc7yHdqreJsECb4t9Fs8t6OLv+VDDKrSmHIHmJ+ob1pxNcsgX6MK+QfPPRdG4q4PhN8DfJ5am3Zeg5z7/+0f4T7yoDkBzbkDfAyUWRP9dMTbieBSZA/wtsj11jkE1T2zlAC6IvUuda8PURbXnLyLnXXPiR04QMGGqpVeFXFLgy4U7GTWJ9JpYSCq4kbmOPX1XOjOYMCR3Euv2oHH8AxaSneyII7LaAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAbCAYAAABFuB6DAAABAklEQVR4XoWSvQ0CMQyFY0EBEhUtHQXbMAoNSDABJRvQXIEYACFRMAADsAMTUB/PsfNv4Alf8PNn5xKdc5aoWErzj5VkFS0vEylg7t/mhariGLFC9IgnYiBESU0U2HJCHvL5pQZviC4kWjo5gUfBZ70Ru9yA9ogeTfN8JjqpBjnnievMIzaW8jeaAYyvxOoBCOiUpW9gMdE/FKQubUIClrfm37meSLz178OQjHnheUwM8a/TQ86S79wZcUUhXS65u5OJw+hpwpfLRdaUc8CHjIkH4GWB5YF1k9dV6Zx2rueoFbzw+Rp9rceT5FJS+xdJIZWbhrrUALaM/jaLKoZmTL35B089K1AFiaOLAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAbCAYAAABFuB6DAAABGElEQVR4XnVTO2oDQQyVSAwO+AIBQ3DlIkU6Vy7TpklKHyKncOMiB0iT86RMFTC4dWcMhrTrPI20Gs3s7DOSRu9Jmg9rIoDFOSwryQzhVRupqEVOv5YSUbCDkgEBqsW5oyXsC3aFfYO6S1LfY/EN8R3xxugPKNKwt9zRwX5g83AUKbwiW3gVZ3ITTncx7jleY6vGE02TcpJC2ItXRVizPGbaBcvboqDCI+m0Y+DCAXLWIb6mdVPWsMLiXOoD8APcITVopfhpWKfwSfUDM63hn0qK6BcmE3vMYDsI9/Ggf2SPHo01xhtwfbuA/vuMibuqq0g9yRvpJ9bcqiQbszNGBYXsU3MGzn83ybIfa+hPwqmzZiN8zPgowT/9PyQIP0tUHwAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEkAAAAZCAYAAAB9/QMrAAADSUlEQVR4Xu2YwatNQRzHfycpLyQpvJWFFRaU7KyUorBQyn9gwU5IWZCdlYWVSJZioVBvYXFKWbCxsKSQFT2yoCSe3/fO+d0z8zu/mTPn3PPu9cqnvu95v5k75zvfMzP3HERdKHRhhWD6NopGaco0HTQrFnm9THp9tNeHlot/ykw2X1g3K82e7AyzO2r2kJvrT9ZR1Rblgy6E9DYzAVO55nvKDamwQiroDP/8zTrNOslaYl0K+sS5z3rBOsS6wvocNmdHsJq1m+CjoAu6MQGGF+/bWW/I9p4fEjVD2sxa4ishKAET/sPa5dUsDrK+qtoN1iPWXG46zDme63n+vYPcDeoS0msKvYOm9yIrJDgeudYhPSGX8rxXW896xiq9msUi666q7SNzonViLdkZn42yhlz/eTWoeF83ruSFNEaFVLylZkgYvCQXgmNsInADgzqkvVUd4fehPaTawhaSkEJKct6xMoVJQhpdpCQ/dXeHMEm0pbAmJFvmo1fDmYGaHXWINWaMw+T6+96BeD/u1QYPCWCFpEMqzAnhrqL+vfpbtgS0STolsMaMgUlbIYl3f5wZhdQ0AnRIXbHGjJEOKfyW/B+Sqg++knDA4fDGISjIwf3Lq1nAyC1Vk4P7parnoieXQs4/3zsoyXnf79UmCukOL8tFlv9NgNWAQdu+od5Rs4/c3VOqnksipMZxjwL6O+91s3jHeejXzJAao9I4pEIasWpwITwECng4Qw0PmgKMo4YncgGrBg9uPgus61RfW8aHNkgnjWdUnyXCMarH8Slp5D2YqvYOoiE5wqj0SgIHCK8TxeiCj1nfWEeCHkRbyQXyVNXxCvCDdY/c0+/zsHnEJ3KPAQjVQs4QS8Jaclsb20hvL7wKleReZPGZ0LubfzSkxEpqABO3K+HfMR7oAnOW9ZB1jbVKtQnYErGQuoCJblQ18f6KdcKVqqmHW7AKqbCTqSliIeWAO4j3uj5cpvEZkXbYArZzg4wRoyvJIhFS66Xwf1F9uEhuK07KNtZVXYwSTmeokFqZ04VMdpK2rEm3OorGO1oXOoWEhzx9KCbIcT9j0hblkQTKDmkg0s4cOX1aGGCIlcFgEw0HGmzYaRI3bbfY1eUjuJ5x8b/N0tVTn9xb/AAAAABJRU5ErkJggg==>