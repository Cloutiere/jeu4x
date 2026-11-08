# HANDOFF-LABO-COMBAT — Le laboratoire de programmation et de résolution (placements libres, deux joueurs + barbares)

**Outil de développement du chapitre 2D.** Objectif d'Erik : une **carte de test avec emplacements d'unités libres** où IL contrôle les unités des **deux joueurs ET des barbares**, pour simuler des configurations de **mouvement et d'attaque**, lancer la **résolution automatique** et l'ajuster en la regardant fonctionner. Précédent : le labo `#/progen` (génération procédurale) — même philosophie : **outil client pur, hors production de jeu, accessible par URL seulement**.

## 1. Préalables

1. Lire `RULES.md` (R-40..R-61 déplacements/attaques, R-52 rév. défense de pile, R-96/R-97 barbares, R-158..161 programmation), `PROJET.md` (§pivot), le labo `#/progen` (structure, routes dev, conventions) et `packages/rules` (le moteur est PUR et déterministe — il tourne dans le navigateur sans serveur).
2. Baseline : suite verte (**1169 tests**), typecheck 4/4, `schemaVersion` **24**, `git status` propre.
3. **Zéro impact jeu/production** : aucun changement moteur ni serveur requis ; la route est sans lien depuis l'UI de jeu (comme les autres labos) ; le drapeau `rendu3d` reste intouché.

## 2. Mission

### M1 — La carte de test (pose libre)
1. Nouvelle route dev **`#/labo-combat`** : petite carte hexagonale (taille/type de terrain ajustables — pinceau de terrain simple si utile, défaut prairie avec quelques variantes posables) ;
2. **Placement libre** : cliquer une case pose l'unité choisie dans un sélecteur — **type d'unité** (au moins guerrier, archer, piquier, colon, cavalier…), **camp** (Joueur 1 / Joueur 2 / Barbare), PV courants ajustables (défaut plein) ; clic sur une unité posée = la retirer ou l'éditer ;
3. Villes posables (les deux joueurs, avec le rayon de travail qui va avec) si pertinent pour les tests d'assaut ; barbares : camps posables aussi (pile, gardes, explorateur — le régime BARBARES-PILES s'applique tel quel).

### M2 — Programmer et résoudre (le cœur)
1. **Programmer les ordres des DEUX joueurs indépendamment** : sélectionner « je programme J1 » puis « je programme J2 » (onglets), avec les mécanismes réels : mouvement multi-étapes (R-158), action finale `foundCity`, attaques, priorité de destination (R-159), limite fog **désactivée** (carte entièrement visible) ;
2. **Barbares** : leur comportement automatique existant (garde/explorateur, aggro) se déclenche à la résolution comme en jeu ;
3. **Résoudre un tour** (bouton) : la résolution automatique tourne avec le vrai moteur et son RNG seedé (seed affiché et modifiable — re-résoudre le même tour avec le même seed = même résultat, reproductibilité totale pour ajuster) ;
4. **Observation** : le journal complet de la résolution (événements, combats un par un, replis, défenseur de pile choisi, ordres tronqués) s'affiche à côté de la carte — c'est LUI l'outil d'ajustement d'Erik ; l'état avant/après lisible (positions, PV, unités mortes).
5. Bonus si simple (non bloquant) : revenir à l'état pré-résolution (snapshot) pour rejouer une variante d'ordres sur la même configuration.

### M3 — Vérification
1. Tests : pose/état du labo (purs), reproductibilité seed (même config + même seed = mêmes événements), isolation (aucun appel serveur) ;
2. e2e GUI (captures `dev-logs/captures-labo-combat/`) : configurer un assaut de pile (2 gardes + 1 explorateur vs 2 guerriers J1), programmer les deux côtés, résoudre, lire le journal combats un par un ; scénario de dispute de destination R-159 ;
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 24, zéro diff 3D, zéro diff serveur.

## 3. Périmètre interdit

- Toute modification du moteur, des règles, du serveur, de l'UI de jeu ; le 3D ; les valeurs de calibrage (le labo OBSERVE la résolution, il ne la change pas — l'ajustement se fera au pilotage après les constats d'Erik) ;
- Le multijoueur (le labo est local, hors GameDO).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-LABO-COMBAT.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main. Erik itérera l'outil en sessions suivantes (c'est un labo vivant, comme `#/progen`).
