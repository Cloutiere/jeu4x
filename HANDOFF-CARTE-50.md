# HANDOFF-CARTE-50 — Carte 50×40 : élargir la génération multi et vérifier TOUTES les règles de placement

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (règles de placement : R-157/T-44/T-45 spawn, artefacts placement insulaire + distance capitales, barbares camps, ressources `spawnWeight`), `HANDOFF.md` §4, `PROJET.md`, `REPORT-CARTE-MULTI.md` (génération libre multi), `REPORT-SPAWN-START.md` (machinerie de conformité). Baseline : suites vertes, prod 200. **2D uniquement.**

## 1. Objectif (demande d'Erik du 27/09)

**Élargir la carte : largeur 50, hauteur 40 (50×40)** — une expérience pilotée par Erik : « voir si on est capable de générer la carte en respectant toutes les règles de placement ». La conformité est LE livrable : 100 % des seeds doivent satisfaire chaque règle, preuve chiffrée à l'appui.

## 2. Décisions tranchées (réponses Erik du 27/09 — à appliquer telles quelles)

- **D1 — 50×40** (hauteur inchangée).
- **D2 — Portée : les parties créées depuis le lobby (multi 5 sièges, toute topographie).** Les cartes préfabriquées 1v1 restent 40×40, intouchées. La taille est **data-driven** (config génération, ex. `progen/settings.ts` : `largeur: 50, hauteur: 40` pour le mode multi ; rien codé en dur).
- **D3 — Labo d'abord : le mode 50×40 est validé au labo `#/progen` (100 % de seeds conformes) AVANT d'être activé en jeu.** Si une règle échoue sur des seeds, le rapport le documente précisément (taux, seeds d'échec, règle en faute) — c'est un résultat d'expérience, pas un échec de mission. Activation en jeu seulement si conforme.
- **D4 — Toutes les règles de placement s'appliquent telles quelles**, aucune n'est relâchée pour « faire tenir » la taille : R-157 par spawn (2F/2P/1E, purge rayon 2, 0 ressource), équidistance des 5 spawns (critère/métrique existants), artefacts placement insulaire équidistant + distance capitales, camps barbares (composition gardien+satellites), placement des ressources (`spawnWeight`, terrains, cachées), fondation/distance. 🔶 attendu : certains réglages calibrés pour 40 (rayon du ring de spawn, tolérances d'équidistance, densités) peuvent devoir être **recalibrés data-driven** pour 50 de large — ajuster les paramètres, jamais les règles ; toute valeur retouchée est listée au rapport.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Inventorie chaque règle de placement et SON test/vérificateur actuel (fichier:ligne) — la liste des règles à prouver.
- Vérifie où la dimension 40 est supposée (config, tests, labo, affichages, perf) — liste des points de contact.

### L1 — Config 50×40 (data-driven)
- Taille du mode multi : 50×40 (D2). Le labo `#/progen` expose la taille (et permet de comparer 40×40 / 50×40 à will — curseur ou présets).
- Le 1v1 préfabriqué refuse proprement toute autre taille (message clair).

### L2 — Génération conforme (test-first)
- Adaptation de la génération libre multi à 50×40 : ring/spacing des spawns à l'échelle de la nouvelle largeur, artefacts insulaires équidistants des 5 spawns, barbares, ressources (densités recalibrées 🔶 si nécessaire, proportionnelles).
- **La preuve de conformité** : étendre la machinerie SPAWN-START (déjà « 100 % de seeds conformes ») en un **banc de conformité exhaustif** : pour N seeds (ex. 500), vérifier CHAQUE règle et produire le tableau de taux. Tests : chaque règle a son assertion sur 50×40 ; le banc tourne en CI (temps borné, seeds fixes).

### L3 — Vérification
- Banc de conformité 50×40 : taux 100 % par règle OU liste précise des manquements (D3).
- Perf rapide : génération (temps seed), rendu 2000 cases (bench existant), mémoire — pas de régression choquante.
- e2e : partie 1 humain + 4 bots sur 50×40 jouable de bout en bout.
- **Captures `dev-logs/captures-carte-50/`** : plusieurs seeds 50×40 au labo (vue entière, spawns, artefacts, barbares), comparaison 40×40/50×40, tableau de conformité.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter le tableau de conformité + captures (allure des cartes, densités). Verdict : activer en jeu (D3) ou itérer sur les densités. NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-CARTE-50.md` : points de contact de la dimension, règles × taux (le tableau EST le résultat de l'expérience), recalibrages 🔶 listés, captures, ce qu'Erik valide en ligne, recommandation (tenir 50×40 en jeu ? taille max réaliste ?).

## 4. Critères d'acceptation
1. Le mode multi génère en **50×40**, data-driven ; 1v1 préfabriqué intact.
2. **Tableau de conformité par règle** sur N seeds (l'objectif de l'expérience), preuve chiffrée.
3. Si conforme : activé en jeu et partie 1+4 bots complète en e2e ; si non : manquements documentés précisément, pas activé.
4. Recalibrages limités aux paramètres (règles intactes), listés ; suites vertes ; zéro changement protocole.

## 5. Périmètre interdit
- Modifier une RÈGLE de placement (relâchement interdit — c'est le sujet de l'expérience) ; le 1v1 préfabriqué ; 3D ; tout autre chantier.
