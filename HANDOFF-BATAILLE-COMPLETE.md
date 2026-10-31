# HANDOFF-BATAILLE-COMPLETE — Canon CivRev : une attaque = la mort de l'une ou l'autre

**Statut : prêt — NON LANCÉ.** Canon tranché par Erik le 31/10 : « Dans CivRev, une attaque égale la mort de l'une ou l'autre des unités. » **Pas de retraite.** Le moteur actuel (1 échange par attaque, plafond 1 PV/attaquant/tour, survivance mutuelle en cohabitation) est un écart de canon structurel — T-03 (2-3 échanges) est ABANDONNÉ au profit de la bataille complète. Portée tranchée : **mêlée seulement** ; les tirs à distance gardent leurs règles (1 PV garanti, jamais d'entrée, jamais d'avancée).

## 0. Préalables

1. `RULES.md` : R-51 (math de combat — la formule p = S_att²/(S_att²+S_def²) RESTE, seules les conséquences changent), R-173..R-178 (ENGAGEMENT — R-178 rév. A sera amendée/abrogée), R-59 (distance INTACTE), R-149 (overrun — à réexaminer, voir L1), R-71 (soins : restent, mais ne s'appliquent plus « entre » les échanges d'une même bataille) ; l'audit du siège (garnison immortelle) et le canon d'Erik : 1 garnison/ville, 6 adjacents submergent, attaque décisive.
2. Code : `packages/rules/src/turn.ts` (`resolveAttack` ~l.1182-1341 : boucle `EXCHANGES_PER_ATTACK`, `advanceIfMelee`, refus d'avancée ranged), `combat.ts` (`combatRound`), `constants.ts` (`EXCHANGES_PER_ATTACK`, `CITY_DEFENSE_BONUS` morte), la cohabitation post-attaque (R-178 rév. A, mêlée reportée).
3. ⚠ **Moteur, changement de règle majeur voté par Erik** — périmètre ouvert sur la résolution mêlée SEULEMENT ; tout effet de bord découvert repasse par lui.
4. Discipline : tests FIRST, bancs bot 40×3 gratuits (stash avant/après), banc Jev UNIQUE ≤ 0,50 $ (10 seeds, mètre `analyse-tbsiege.py`), banc via tsx, suites jev-port via `vitest.jev.config.ts`, `CityRazed` ≠ `CityCaptured`.

## 1. La règle cible (défauts tranchés — déjà votés)

- **B1 — Bataille complète** : une attaque mêlée enchaîne des échanges (même formule R-51 par échange, un jet seedé chacun) **jusqu'à la mort d'une des deux unités**. Plus de plafond de dégâts, plus d'arrêt intermédiaire. `EXCHANGES_PER_ATTACK` disparaît ou devient illimité (consigner le choix).
- **B2 — Pas de retraite** : le perdant meurt sur place. L'attaquant perdant meurt sur SA case (il n'entre jamais). Le défenseur perdant meurt sur la sienne ; l'attaquant vainqueur **avance et entre** (logique `advanceIfMelee` existante — capture immédiate si la case était une ville sans autre défenseur, R-57/R-65 inchangées).
- **B3 — Fin de la survivance mutuelle post-attaque** : après un assaut, il n'existe plus de « perdant qui cohabite ». La cohabitation (R-173/174) reste possible par les AUTRES chemins (renfort entré, R-159-c, etc.) — seul le résultat d'attaque la supprime. R-178 rév. A amendée en conséquence.
- **B4 — Séquentiel maintenu** : 6 assiégeants attaquent un par un (R-177) ; dès que le défenseur meurt, les suivants n'attaquent plus (canon : la ville est prise). Chaque bataille complète re-jette la défense contre le défenseur en vie du moment (blessures PERSISTENT entre attaques — c'est le soin à 1 PV/tour qui les cicatrise, le canon siège CANON-SIEGE reste actif).
- **B5 — Distance INTACTE** : R-59 telle quelle (1 PV garanti, sans riposte, jamais d'avancée/capture). La distance reste le moyen d'user une garnison AVANT l'assaut décisif — le duo canon de CivRev.
- **B6 — R-149 (overrun)** : la bataille complète rend l'overrun probablement redondant (la bataille se termine déjà par la mort) — vérifier et, s'il est devenu inatteignable, le consigner SANS le supprimer (décision séparée).
- **B7 — Intouchés** : armées (multi-unités, PV = ×taille), vétérans, barbares, Grande Muraille, gouvernements, R-162 HealRefused, capture/élimination, `schemaVersion` 28 sauf nécessité de migration (justifier sinon).

## 2. Mission L0→L4

- **L0** : préalables, suites vertes (rules 1104, server 401, sableuse 140, jev-port 30).
- **L1 — Tests FIRST (rules)** : guerrier (1 force, 3 PV) vs piquier en ville : la bataille va à la mort (l'un des deux meurt TOUJOURS, aucun PV intermédiaire survivant) ; l'attaquant perdant meurt sur sa case, la sienne inchangée ; le vainqueur mêlée avance (ville sans autre défenseur = capture, ville avec cohabitants entrés = R-159-b « les suivants du même camp n'entrent pas ») ; 3 attaquants successifs vs un défenseur blessé entre-deux : les blessures persistent entre batailles (mais pas intra) ; distance inchangée (tirs = 1 PV, jamais de mort directe d'un tir seul sauf PV déjà bas — re-tester les tests ranged existants) ; déterminisme (même seed → même issue) ; barbares/villes rasées inchangés. Mettre à jour les verrous d'anciennes valeurs (grep EXCHANGES_PER_ATTACK, survivance mutuelle, R-178).
- **L2 — RULES.md** : amender R-51 (bataille complète, mort d'un camp), R-178 (abrogation rév. A : plus de cohabitation post-attaque), B2 « pas de retraite » ; marquer T-03 RÉSOLU PAR LE CANON (bataille complète) dans la mémoire des révisions.
- **L3 — Bancs** : (a) bancs bot 40×3 gratuits avant/après : les guerres bot vs bot devront se conclure (tours moyens en baisse marquée vs 126) ; surveiller l'équilibre (si un profil s'effondre, consigner, ne PAS recalibrer sans Erik) ; (b) banc Jev UNIQUE ≤ 0,50 $ (10 seeds, mètre identique) : victoires (LE critère, cible ≥ 4/10), captures, percée, stériles, 0 guerre avant rencontre, fondations ≥ 2,5. Suites complètes, commit + push, rapport `REPORT-BATAILLE-COMPLETE.md` (règle, maths avant/après du scénario du siège — attendu : le « 173 échanges, 0 chute » devient quelques batailles décisives —, deux bancs, verdicts).

## 3. Critères d'acceptation

1. Toute attaque mêlée se termine par la mort d'un camp (prouvé aux tests, zéro survivant intermédiaire) ; pas de retraite ; distance intacte ;
2. Banc Jev : victoires ≥ 4/10 OU diagnostic chiffré du verrou suivant (alors Erik tranche) ;
3. Bancs bot sans collapse ; suites toutes vertes ; chaque capture/échec attribuable au transcript.

## 4. Périmètre interdit

Toute autre règle (soin 1 PV, exclusivité fortif/soin, bonus ville 0,25 : CANON-SIEGE actif et INTACT) ; Jev/harnais (aucun seuil ne bouge), tactique bot (TB-SIEGE intact), Zii, client (sauf si le décodeur de combat affiche « échanges » — adapter l'AFFICHAGE au nouveau format de combat expliqué, sans rien ajouter). Jamais de secret ni de fichier non tracké d'Erik ; pas de mini-rebanc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : le banc dira si l'IA transforme enfin — sinon, verdict Erik sur l'étage suivant (décisionnel).
