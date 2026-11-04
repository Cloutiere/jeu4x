# REPORT-GESTE-ARMEE — Le geste joueur : former une armée de 3 unités depuis l'UI

**Livrée 04/11, RÉV. 2 (retour d'Erik le jour même) — le geste demandé n'est pas un
geste manuel mais une PROPOSITION AUTOMATIQUE.** Quand ≥ 3 unités amies du même type
sont programmées pour finir la prochaine résolution sur la MÊME case (ou y sont déjà
co-localisées — production empilée, garnison), le jeu DEMANDE la formation ; le joueur
peut refuser (objectif tactique sans fusion). Au-delà de 3, il sélectionne les unités
en cliquant chacune (chips, exactement 3). Les Move déjà programmés persistent (le
FormArmy n'est pas leur sujet) : la fusion se produit à la résolution quand les trois
sont réunies — échec propre R-44 sinon. Le geste manuel par bouton (b3fca04) reste
disponible pour les convergences lointaines. **Zéro changement moteur/serveur** ;
`schemaVersion` 28 intacte.

## 0. Rév. 2 — ce qui est livré

- **Helper pur `propositionsArmees(view)`** (geste-armee.ts) : groupes de ≥ 3 unités
  amies du même type par ARRÊT de la prochaine résolution (`arretProchaineResolution`
  sur l'ordre frais du jour OU le chemin gelé R-158, sinon la case courante) ;
  exclusions : armées, membres d'un FormArmy en cours, à bord, navales, ennemies.
  Déterministe (membres triés par id, propositions par type puis case).
- **Carte `PropositionArmee.svelte`** au-dessus de la carte : « N Guerriers sont
  réunis en (q,r) — les convertir en armée ? » ; boutons « ⚔ Former l'armée » /
  « Non, pas maintenant » ; au-delà de 3, chips cliquables avec compteur (x/3),
  confirmation à exactement 3. Ignorance par clé tour|type|case (expire au tour).
- **Confirmation → ordre canon `FormArmy` seul** : les Move programmés restent, la
  fusion moteur (processFormArmy) fait le reste à la résolution.

## 1. Ce qui était livré en rév. 1 (b3fca04, conservé)

### D1 — Le geste en 3 temps
- **Helper pur `apps/web/src/lib/geste-armee.ts`** : `peutFormerArmee` (éligibilité du
  bouton : terrestre non-navire, non-armée, non-membre d'un FormArmy, ≥ 2 candidats),
  `candidatsArmee` (amies du même type, hors embarquement/armée/FormArmy en cours,
  praticables — BFS client `pathTo`), `rallyValide` (case connue praticable, atteignable
  par les TROIS, jamais une case à ennemi visible — le serveur tranche en dernier
  ressort), `mouvementsVersRally`, `libelleFormation` (compteur n/3).
- **Bouton « ⚔ Former une armée… »** dans `UnitPanel.svelte` (+ « ✕ Annuler la
  formation » pendant le geste). Candidats cliquables sur la carte ET en chips dans le
  panneau (les chips couvrent le cas empilé : deux unités du même type sur la même case,
  où le re-clic carte toggle le premier choisi).
- **Mode formation** dans l'UiState (`armyDraft {chef, coequipiers}` — miroir du motif
  éprouvé `nukeArmed`) ; `clickAction` intercepte : clic candidat → `armyPick` (toggle),
  2 coéquipiers choisis + case pré-vérifiée → `armyRally`. Clic droit inerte en mode
  formation (pas d'annulation parasite).
- **Pose du rendez-vous** (`Game.svelte handleArmyRally`) : soumet l'ordre canon
  `FormArmy {members:[3], rally}` **et les `Move` de chaque membre vers le rendez-vous** —
  découverte capitale : le moteur n'auto-déplace PAS les membres (miroir exact de
  botPolicy `converger`, où le bot émet Move + FormArmy séparément) ; l'exemption R-44
  (co-location au rendez-vous) fait le reste à la résolution.

### D2 — Suivi visible
- `currentOrder` du panneau matche désormais les ordres **portés par les membres**
  (un `FormArmy` n'a pas de `unitId`) — le libellé « Formation d'armée — en route vers le
  rendez-vous (n/3) (q,r) » s'affiche chez chaque membre, n = membres déjà sur place
  (compteur honnête sur l'état filtré, pas prédictif).

### D3 — Armée définitive jouable
- Vérifié en GUI : l'armée formée se sélectionne, s'affiche « Guerrier (armée) », PV 9/3
  (somme plafonnée R-31), et reçoit des ordres comme toute unité. Aucun cas `isArmy`
  manquant au panneau ; aucun bouton de scission (canon : définitive).

## 2. Tests FIRST (web) — 27 verts geste-armee, suites 751/751

`tests/geste-armee.test.ts` (18) : bouton visible/absent, candidats, rendez-vous,
mode formation via `clickAction`, `mouvementsVersRally`, `libelleFormation`.
`tests/geste-armee-propositions.test.ts` (9, rév. 2) : co-localisées sans mouvement,
Move programmés (arrêt ≠ destination), convergence même case, chemin multi-tours
(l'arrêt compte), exclusions (armée/FormArmy/à bord/ennemi/navire), plus de 3 (toutes
listées), deux groupes distincts, déterminisme. Suites AVANT commit :
**web 751/751**, **svelte-check 0 erreur**.

## 3. Captures GUI locales AVANT commit (1280×720, solo vs bots, partie Z55C3M)

`dev-logs/captures-geste-armee/` — script `devtmp/geste-armee-gui.mjs` (croissance +
convergence vers la ville pilotées headless par WS, la page n'ouvre que pour le geste) :
1. `1-proposition-automatique.png` — la carte propose sans AUCUN clic de geste ;
2. `2-proposition-confirmee.png` — confirmée ;
3. `5-armee-formee-jouable.png` — « Guerrier (armée) » sélectionné, chronique
   « Armée formée près de Ville1 » (tour 15 — fusion 1 tour après confirmation).

## 4. Pièges consignés (exécutions 04/11, rév. 1 + 2)

1. **LE PIÈGE MAJEUR — double worker et proxy Vite figé 8787** : la page (5174) parle au
   worker **8787** via le proxy Vite ; un second worker sur 8798 (ws headless + admin)
   partage le même sqlite mais pas la mémoire DO → ordres acceptés côté page puis
   « perdus » côté admin/résolution, rejets invisibles, diagnostics fous. TOUT (page,
   ws headless, admin) doit partager LE MÊME worker. Diagnostics qui ont mené là :
   socket headless resté connecté évine la page ; socket à demi-mort avale les EndTurn
   sans erreur ; rejet OrderAck INVISIBLE (FormArmy ne toast pas) ; résolution locale
   figée tant qu'un navigateur tient un socket → croissance/convergence headless par WS
   (`TurnResult` porte l'état résolu, PAS un nouveau Snapshot).
2. **Le moteur ne déplace pas les membres d'un FormArmy** — l'émetteur fournit les Move
   (bots : botPolicy `converger` ; geste manuel : `mouvementsVersRally` ; proposition
   automatique : les Move SONT déjà programmés par le joueur — c'est son scénario).
3. **Troncature R-159** : deux amies co-destinataires d'une case ordinaire sans menace
   ennemie sont tronquées (l'une s'arrête avant) — le scénario de convergence vers une
   case quelconque ne « réussit » pas sans le FormArmy ; la garnison de ville accepte la
   co-location (et le FormArmy soumis exempte tout le groupe, R-44). La détection
   client, elle, lit les arrêts PROGRAMMÉS — la carte apparaît avant la résolution,
   exactement le flux demandé par Erik.
4. **FIN-DE-TOUR-PRODUCTION** : après la 3e unité produite, la ville à marteaux sans
   production bloque le EndTurn (« sélectionnez une production ») — réarmer Guerrier.
5. Monde cylindrique : q négatif est VALIDE (E↔O) — un filtrage de bornes `[0, W)` sur
   q casse toute l'adjacence à l'Ouest de la couture (2 exécutions perdues).
6. Le polling admin trop serré étrangle le DO local (mémoire e2e-tours-long, confirmée).

## 5. Intouchés respectés

Moteur, serveur, bots, Jev, Zii, `schemaVersion` 28 — aucun fichier hors `apps/web`
(+ script devtmp et captures hors git tracké). Fusion navale : au backlog (D4).
