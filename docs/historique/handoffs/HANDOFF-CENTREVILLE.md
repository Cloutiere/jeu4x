# HANDOFF — Révision R-66 : le centre-ville produit 1 nourriture, 1 production, 1 commerce garantis

Tu reprends le pilotage pour une **révision de règle** (moteur, test-first). **Préalables :** `HANDOFF.md` §4, baseline **868+ tests** verts, `RULES.md` **R-66 (révision 7i — centre-ville : min 1 Production, commerce de tranche R-60bis = 0 sous pop 7)**, R-64/D5 (fondation détruit la ressource), R-63. `schemaVersion` **18 inchangée** (révision de calcul, pas de structure).

## Demande d'Erik (05/09 — fait foi)

**La case de ville doit produire systématiquement 1 nourriture, 1 production et 1 commerce, quel que soit le terrain sur lequel elle est bâtie.** Et elle **détruit toute ressource** qui pouvait s'y trouver.

## État actuel vs cible

- ✅ **Déjà conforme (7i, R-64/D5)** : fonder sur une ressource **la détruit** — ne pas refaire, juste **test de non-régression** ;
- ✅ **Déjà conforme en partie** : min **1 Production** garantie (R-66) ;
- ❌ **À changer** : la **nourriture** du centre suit le terrain (un centre sur colline ne nourrit pas) et le **commerce** suit la tranche démographique (0 sous pop 7) — le centre peut donc produire 0 nourriture et 0 commerce.

## Décisions d'implémentation (défauts 🔶 — veto Erik)

- **Socle garanti 1N / 1P / 1C** : la case de ville produit **au minimum** 1/1/1 quel que soit le terrain 🔶 — sémantique proposée : le socle **remplace le plancher actuel (1 P seul)** et s'applique comme plancher par ressource SUR les rendements calculés du centre (terrain + merveilles + traits de civ — une ville Égypte sur désert peut dépasser 1 N via son trait, le plancher ne plafonne rien) ;
- **Commerce de tranche (R-60bis) inchangé AU-DESSUS** : le commerce démographique (0 sous pop 7, jusqu'à +5 à pop 31) **s'ajoute au socle** — question de calibrage posée à Erik dans le rapport (le socle donne 1 C dès la fondation, la tranche s'empile ensuite) ; **cette décision RÉSOUT le vote de calibrage 7i en suspens** (« commerce du centre-ville par tranche ») ;
- **Interaction travail/assignation** : le plancher s'applique à la case de ville **toujours travaillée d'office** (elle n'est pas assignable) — vérifier l'auto-assignation R-60 ne déplace jamais le citoyen du centre ;
- **UI** : le tooltip/rendements du centre affiche le socle garanti (transparence pédagogique — signature d'Erik) ; le miroir 3D (glyphes allumés) reflète le socle via `tileYield` partagé — **zéro logique dupliquée** ;
- **Bot/équilibrage** : aucun recalibrage ailleurs (le bot consomme `tileYield`).

## Mission — livrables dans l'ordre

- **L0 — RULES.md (test-first)** : R-66 révisée (socle 1N/1P/1C 🔶), note « résout le calibrage 7i », R-64/D5 testé non-régression ;
- **L1 — Moteur (test-first)** : plancher dans `tileYield` (source unique moteur/UI) ; tests : centre sur colline → 1N minimum ; centre sur désert → 1C minimum ; tranche pop ≥ 7 s'ajoute ; Égypte désert dépasse le socle ; ressource détruite à la fondation (non-régression) ; bot/assignation non perturbés ;
- **L2 — UI/3D** : tooltip centre avec socle, miroir 3D (le glyphe commerce du centre devient allumé dès pop 1) ;
- **L3 — Vérification** : e2e partie solo (fondation sur terrains différents, rendements conformes), labo, captures, CI, prod saine ;
- **Livraison** : rapport `REPORT-CENTREVILLE.md`, commit, prod.

## Critères d'acceptation
- Centre-ville : **≥ 1N, ≥ 1P, ≥ 1C sur N'IMPORTE QUEL terrain** (tests multi-terrains) ;
- Ressource détruite à la fondation (non-régression D5) ; tranche démographique s'ajoute au-dessus du socle ;
- Miroir UI 2D + 3D conformes (source unique) ;
- Baseline 868+ verts, typecheck vert, CI deploy vert, schemaVersion 18.

## Périmètre interdit (cette session)
Chantiers parallèles (interaction 3D, spawn, unités 3D, atelier d'Erik — inspecter le répertoire avant commit) ; tout autre recalibrage de rendements ; renommage ; espionnage avancé.

## Fin de session
Rapport, arrêt, remise de la main au pilot.
