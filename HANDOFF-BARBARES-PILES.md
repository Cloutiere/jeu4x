# HANDOFF-BARBARES-PILES — Le camp barbare se défend en pile (2 gardes, 1 explorateur) et meurt en combat un par un

**Chantier gameplay du chapitre 2D.** Spécification d'Erik du 15/09 : le camp barbare tient une **pile de 1 à 3 barbares sur la case même du camp** ; le 1er et le 2e **gardent** (n'en sortent jamais), seul le **3e explore** et part au combat ; les camps **n'ont pas de PV** ; attaquer le camp = combattre les barbares **un par un** ; quand le **dernier** barbare est tué, le **vainqueur occupe la case**, le camp est **détruit** et la récompense est le **bonus aléatoire des huttes** ; un **drapeau d'empilement** marque toute case à plus d'une unité — **rouge pour les barbares**, couleur d'accent du joueur sinon.

## 1. Préalables

1. Lire `RULES.md` (R-99 barbares et constantes T-18..T-26/T-49/T-50, R-52 combats, R-54 repli), `packages/rules/src/data/barbares.json` et `huttes.json`, `PILOT-HANDOFF.md` §3-§4.
2. Baseline : suite verte (**1162 tests**), typecheck 4/4, `schemaVersion` **23** (aucune migration attendue — les barbares sont des unités ; à confirmer à l'audit M1), `git status` propre.
3. **Test-first** citant les révisions R-99. Déterminisme : la récompense de capture = tirage seedé dans la table pondérée des huttes (RNG dédié dérivé du seed — même philosophie que le tirage des artefacts et l'Égypte).

## 2. Mission

### M1 — Le camp en pile (moteur, test-first)
1. **Pile sur la case du camp** : les barbares d'un camp occupent LA CASE DU CAMP (1 à 3 sur la même tuile — régime spécial barbare ; aucune autre unité ne s'empile). Pas de nouveau spawn tant que 3 barbares **de ce camp** sont vivants (`capPerVillage` = 3, inchangé dans son principe).
2. **Rôles** : garde minimale **2** (data-driven, `barbares.json`) — les 2 premiers barbares ne quittent JAMAIS le camp ; seul le **3e** explore/sort (rayon d'aggro inchangé). Si un barbare extérieur meurt, un nouveau spawn peut revenir remplir jusqu'à 3 — l'ordre des rôles est déterministe (tri R-81 ; le plus ancien garde, le dernier arrivé sort — à documenter).
3. **Camps sans PV** : `villageHP` et `villageDefense` SUPPRIMÉS des données et du code — un camp n'est plus une cible en soi ; la cible du combat = les barbares présents.
4. **Attaque de la pile = combats un par un** : attaquer la case du camp enchaîne les combats R-52 contre les barbares de garde **tant que l'attaquant est vivant** (chaque échange est un combat complet ; l'attaquant mort arrête la séquence, repli R-54 applicable). Le camp n'est jamais ciblable tant qu'il est défendu.
5. **Capture** : à la mort du **dernier** barbare du camp, le **vainqueur occupe la case du camp**, le camp est **détruit** (nettoyé de l'état barbares), et le vainqueur reçoit le **bonus aléatoire des huttes** (table pondérée `huttes.json`, tirage seedé — pas l'or fixe 50, qui disparaît si non repris ailleurs ; `villageDestructionGold` supprimé ou requalifié, à consigner). Événements journal : camp détruit, récompense obtenue.
6. **Escalation inchangée** (archer après `escalationTurn` 15), intervalle de spawn inchangé. Audit : tout champ/branche du code barbares mort après ces changements est nettoyé.

### M2 — Le drapeau d'empilement (UI)
1. **Générique** : toute case affichant plus d'une unité porte le drapeau d'empilement — **rouge pour les barbares**, **accent du joueur** pour les unités d'un joueur (mécanisme prêt pour tout empilement futur) ; avec compte ×N si représentable, calibrage 🔶 à l'œil par Erik ;
2. Posé au-dessus du terrain, sous les unités ; lisible en vue carte ET vue ville ; `poser3d` NON utilisé (3D intouchée — contrainte dure).

### M3 — Vérification
1. Tests : pile 1-3 sur la case du camp, gardes immobiles, seul le 3e sort, spawn stoppé à 3 vivants / repris après mort, attaque un par un (attaquant meurt au 1er garde / survit et enchaîne), capture = occupation de case + destruction + récompense hutte seedée (même seed = même récompense), drapeau rouge/accent, camps sans PV.
2. e2e + partie solo (captures `dev-logs/captures-barbares-piles/`) : camp qui monte à 3 (drapeau ×3 rouge), le 3e sort et attaque, purge du camp en combats successifs, capture avec récompense hutte, drapeau sur la case.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 23 (ou 24 si l'audit M1.6 révèle un changement d'état — à signaler AVANT), zéro diff 3D.

## 3. Périmètre interdit

- Les huttes elles-mêmes (goody huts — inchangées) ; l'aggro et l'escalation (valeurs inchangées) ; les combats unités normaux R-52 ; tout empilement de joueur ;
- Le 3D (contrainte dure) ; les chantiers parallèles éventuels (vérifier `git status` avant d'éditer).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-BARBARES-PILES.md` (y compris : ordre des rôles documenté, sort de `villageDestructionGold`, audit des branches mortes), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
