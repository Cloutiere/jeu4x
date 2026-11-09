# HANDOFF-COHABITATION-HOSTILE — Deux ennemis qui convergent vers la même case se battent (canon CivRev)

**Statut : prêt — NON LANCÉ.** Canon validé par Erik (09/11). Constat capturé en prod (partie **5633Y3**, dump admin + trace du tour 22 — `devtmp/etat-5633Y3/`) : l'armée u31 d'Erik (p1, 9 PV) depuis (4,16) et le barbare u22 (3 PV) depuis (6,16) ont **convergé dans le même tour vers la case vide (5,16)** — et cohabitent sans combat (PV intacts, `stabilized: false` chez les deux, phases A→B→C→E exécutées sans un échange). **Cause** : R-176 (« les entrants ne combattent qu'avec le défenseur, jamais entre eux ») + case sans défenseur = aucun combat prévu ; la réforme BATAILLE-COMPLETE (`11b285b`) a supprimé la cohabitation née d'ATTAQUE mais n'a pas couvert les **entrants simultanés hostiles**. Canon CivRev : deux unités ennemies ne partagent jamais une case.

## 0. Préalables

1. `RULES.md` R-176 (entrants ne combattent que le défenseur — à amender), R-173/174 (case instable, mêlée pendante — c'est l'état observé), R-178 rév. B, R-179/180 (mêlée de phase E — la structure existe, c'est le « qui combat qui » qui manque), R-51 réécrite (bataille complète — LA règle de résolution à réutiliser), R-159-b/c (renforts), R-44 (co-location FormArmy — INTACTE) ;
2. Code : `packages/rules/src/turn.ts` (la mêlée de phase E ~l.2000+, l'exemption R-44, le séquencement R-177) ; le dump de référence `devtmp/etat-5633Y3/` (le cas Erik, reproductible au test) ;
3. ⚠ **C'est du MOTEUR** — périmètre ouvert sur CE cas seulement, voté par Erik (il fait foi). Tout effet de bord repasse par lui.
4. Discipline : tests FIRST, bancs bot 40×3 gratuits avant/après, banc Jev de confirmation UNIQUE ≤ 0,40 $ si les bancs montrent un drift, sonde crédits, jev-port via config dédiée, suites complètes avant push.

## 1. La règle (votée — ne rien étendre)

- **D1 — Les entrants hostiles se battent** : quand des unités de camps HOSTILES se retrouvent co-localisées sur une case par leurs entrées du tour (le cas « convergeance sans défenseur »), elles se battent en **bataille complète** (R-51 : assauts jusqu'à la mort de l'un, pas de retraite) ; **ordre de combat déterministe seedé** (le plus faible id d'abord — même discipline que R-177) ; le survivant tient la case (stabilisé au prochain marquage). L'événement canon est émis (`CombatExchange`/mort — les mêmes que la mêlée existante, jamais d'événement nouveau).
- **D2 — Le séquencement** : si plus de deux camps/entités se trouvent mélangés (ex. barbare + armée + renfort amie du même tour), la résolution suit le même ordre déterministe jusqu'à ce qu'IL N'RESTE QUE DES UNITÉS D'UN MÊME CAMP (miroir R-177 : on arrête quand le défenseur meurt ; ici on arrête quand plus d'hostilité sur la case). Les co-locations AMIES restent régies par les règles existantes (R-44 FormArmy, renforts R-159-c) — INTACTES.
- **D3 — Où brancher** : dans la mêlée de phase E existante (R-180) — c'est un EXTENSION du « qui combat qui » : aujourd'hui « entrants vs défenseur » ; ajouter « entrants hostiles entre eux en l'absence de défenseur ». Le moteur gèle à la frontière du connu inchangé ; aucun événement ni champ nouveau ; `schemaVersion` 28.
- **D4 — Le cas partiel** : entrant hostile + défenseur stabilisé = le cas canon existant (l'entrant combat le défenseur, R-176 tel quel pour CE couple) ; la nouvelle règle ne s'applique qu'en ABSENCE de défenseur (l'état exact du bug capturé).

## 2. Mission L0→L4

- **L0** : préalables, suites vertes (rules 1129, server 430, sableuse 228, jev-port 40).
- **L1 — Tests FIRST (moteur)** : le cas Erik reconstitué (deux entrants hostiles depuis des cases opposées vers une case vide → bataille complète, un mort, le survivant tient, PV = somme plafonnée pour l'armée) ; ordre déterministe (même seed → même vainqueur) ; trois entités mêlées → un seul camp reste ; co-location amie intacte (R-44 testé) ; entrant hostile vs défenseur stabilisé = cas canon inchangé (test de non-régression) ; barbares inclus (le cas capturé est barbare/joueur) ; déterminisme global (rejeu bit-à-bit).
- **L2 — RULES.md** : R-176 amendée (« les entrants combattent le défenseur ; À DÉFAUT de défenseur, les entrants de camps hostiles se battent entre eux, bataille complète, ordre seedé ») — court, à la façon du dépôt.
- **L3 — Bancs** : bot 40×3 avant/après (les convergences barbares/joueur deviennent des combats : surveiller PV unités et tours — zéro collapse) ; banc Jev UNIQUE ≤ 0,40 $ SEULEMENT si le banc bot montre un drift notable (sinon reporté au prochain banc naturel — consigné).
- **L4 — Suites complètes** (rules, server, jev-port, sableuse, web, svelte-check, typechecks), commit + push, rapport `REPORT-COHABITATION-HOSTILE.md` (le cas Erik, la règle, les tableaux).

## 3. Critères d'acceptation

1. Le cas Erik reconstitué : l'armée 9 PV tue le barbare 3 PV et tient (5,16) ;
2. Zéro cohabitation hostile survit à une résolution (test verrou : à la fin de la résolution, toute case ne porte qu'UN camp, hors renforts amies canon R-159/R-44) ;
3. Co-location amie (R-44) et entrant-vs-défenseur (R-176) inchangés ; suites vertes ; `schemaVersion` 28 ; bancs bot sans collapse.

## 4. Périmètre interdit

Toute autre règle d'engagement (retraite n'existe pas, soin, fortification) ; les co-locations amies (R-44/R-159) ; la marche (règle anti-recul) ; Jev/harnais (aucun seuil ne bouge) ; bots tactique ; Zii, client ; jamais de secret ni de fichier non tracké d'Erik ; pas de banc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : la réforme bataille complète est complète — plus aucun trou où deux ennemis se croisent sans se voir.
