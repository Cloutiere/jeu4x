# HANDOFF-TUTO-ENGAGEMENT — Le catalogue de scénarios illustrant chaque règle et subtilité

**Chantier tutoriel du chapitre 2D.** Objectif d'Erik : le jeu prend un aspect tactique non anticipé — avant d'aller plus loin, **illustrer le plus de règles possible** par des **agencements d'unités concrets** (SANS barbares), chaque situation expliquant un point de règle et ses subtilités. Livrable : une **bibliothèque de scénarios préconfigurés dans `#/labo-combat`** qu'Erik parcourt, rejoue et déclenche variante par variante.

## 1. Préalables

1. **Lire intégralement** : `RULES.md` §8bis (R-173..R-183), R-176a (coup en passant), R-178 rév. A (report de mêlée), §5 R-159 rév. B / R-159-b / R-159-c / R-159-d, R-179-b (dispersion), R-160/161, et les rapports `docs/historique/rapports/REPORT-ENGAGEMENT.md` + `REPORT-ENGAGEMENT-R159B.md` (arbitrages Q/P/H — les subtilités y sont souvent dans les arbitrages) ;
2. Le labo `#/labo-combat` dans son état actuel (5 nations, poses libres, résolution seedée, journal) ;
3. Baseline : suite verte (**1214 tests**), typecheck 4/4, `schemaVersion` **25**, `git status` propre.
4. **Zéro gameplay** : le chantier OBSERVE et ILLUSTRE — toute règle floue ou bug découvert va au rapport (pilotage), jamais corrigé en cachette.

## 2. Mission

### M1 — Le catalogue exhaustif des points de règle (d'abord, sur papier)
1. Balayer les règles ci-dessus et produire la **liste de chaque point de règle ET subtilité** illustrable par un agencement d'unités sans barbares. Grille minimale (non exhaustive — l'agent complète) :
   - **Stabilité** : case stable, case instable (2+ amies, ennemies mixtes), case vide ; prérogatives du stabilisé (défense en valeurs de défense, l'instable attaqué en valeurs d'ATTAQUE) ;
   - **Dispersion R-179-b** : pile amie sans attaque → l'excédent dispersé (qui part — la mieux fondée reste : fortifiée > PV > R-81) ; pile persistée sans case libre ; dispersion NON suspendée par un tir (H2) ; dispersion suspendue par l'entrée ennemie (H3) ;
   - **Dispute de destination R-159 rév. B** : co-destination légale avec ennemi possible ; sinon première programmée garde, l'autre avance au maximum et s'arrête avant ; l'ennemi qui part retire le droit d'entrée ;
   - **Entrée conditionnelle R-159-b** : ≥ 2 attaquants amis retenus, séquence R-177 (entre PUIS attaque) ; mort du défenseur → les suivants n'entrent pas sauf ennemis demeurés ; ennemis jamais retenus ;
   - **Renfort défensive R-159-c** : entre après l'échange si l'ennemi est entré ; cohabite avec le vainqueur ; n'entre pas sans attaque ;
   - **Tir sur pile R-159-d** : cible la mieux fondée, défense en valeurs d'attaque, pas de suspension de dispersion ;
   - **Mêlée R-178** : une mêlée par tour, entrants qui se joignent, sortir = échapper, étau T-54/T-55, gagnant 0 / perdant −2 / intermédiaires −1, morts à 0 ; report de mêlée (R-178 rév. A) ;
   - **Expulsion / cohabitation amie D2/Q2-P2** ;
   - **Coup en passant R-176a** (incl. l'échange de cases) ; **attaques planifiées à l'entrée** (R-42/ENGAGEMENT) ; **R-177** ordre d'attaque (PM → attaque → défense → PV → seed) ;
   - **Fortification durable R-175** (conservée en mêlée, perdue au déplacement) ; **prérogatives R-174** ; **pacifiques R-182** (capturées à la stabilisation, fuite) ; **camps barbares R-183** — HORS périmètre (Erik a dit sans barbares) ;
   - **Frontières avec l'existant** : MultiStep/fondation (R-158), fog désactivé au labo.
2. Chaque point = un id de scénario (ex. `SC-DISPERSION-01`) + la règle qui le détermine, citée.
3. **Trou ambigu ou bug suspecté** → consigné dans le rapport avec la reproduction au labo, PAS corrigé.

### M2 — Les scénarios dans le labo
1. Un **bouton « Scénarios »** dans `#/labo-combat` : liste catégorisée (une catégorie par famille de règles), chaque scénario préconfigure la carte et les unités en un clic ;
2. Chaque scénario affiche : **l'énoncé** (la situation), **la règle déterminante** citée (R-xx), **les variantes à jouer** (ex. Erik : a) non attaqué → dispersion, b) attaque de mêlée → les deux demeurent en mêlée, c) attaque à distance → le mieux fondé encaisse, l'autre bouge sans dégât) et **le résultat attendu** par variante ;
3. Les textes sont **pédagogiques et courts** (ton RULES, français), stockés data-driven (un fichier de scénarios, pas du code dupliqué) ;
4. Aucune modification du moteur ni du rendu (le labo hôte seul s'étend).

### M3 — Vérification
1. **Chaque scénario est exécuté** en e2e au labo : le résultat observé DOIT correspondre au texte attendu — tout écart = bug ou règle mal écrite → consigné au rapport avec seed et reproduction ;
2. Tests purs sur la structure des scénarios (ids uniques, règle citée, variantes complètes) ;
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 25, zéro diff 3D et serveur.

## 3. Périmètre interdit

- Les barbares (Erik : sans) ; toute modification moteur/RULES ; le 3D ; les règles de victoire.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-TUTO-ENGAGEMENT.md` (y compris : la table du catalogue, les écarts constatés le cas échéant), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
