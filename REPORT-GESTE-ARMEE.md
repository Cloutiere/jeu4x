# REPORT-GESTE-ARMEE — Le geste joueur : former une armée de 3 unités depuis l'UI

**Livrée 04/11 — mission HANDOFF-GESTE-ARMEE exécutée.** La fusion d'armées existait au
moteur (R-44 / `packages/rules/src/army.ts`, `processFormArmy` dans turn.ts) et les bots
l'utilisaient (BOT-ARMEE) ; aucune UI ne créait l'ordre. Le geste CivRev est branché :
bouton → 2 coéquipiers → rendez-vous → fusion à la résolution → armée définitive jouable.
**Zéro changement moteur/serveur** — le contrat `FormArmy` existant est consommé tel quel ;
`schemaVersion` 28 intacte.

## 1. Ce qui est livré (D1-D3)

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

## 2. Tests FIRST (web) — 18 verts, 5 rouges avant implémentation

`tests/geste-armee.test.ts` : bouton visible/absent (même type ×3, navale, armée,
membre FormArmy), candidats (exclusions : type/ennemi/à bord/armée/membre), rendez-vous
(praticable ×3, eau/inconnue, membre manquant), mode formation via `clickAction`
(armyPick/none/armyRally/toggle), `mouvementsVersRally` (membre au rendez-vous exclu, à
bord/mort exclu), `libelleFormation` (0/3, 1/3, coords). Suites AVANT commit :
**web 742/742** (724 + 18), **svelte-check 0 erreur**.

## 3. Captures GUI locales AVANT commit (1280×720, solo vs bots)

`dev-logs/captures-geste-armee/` — script `devtmp/geste-armee-gui.mjs` (partie KPD2KE) :
1. `1-bouton-former-armee.png` — bouton visible sur le guerrier sélectionné ;
2. `2-mode-formation-arme.png` — mode armé ;
3. `3-coequipiers-choisis.png` — chips « guerrier (u6) ✓ / guerrier (u7) ✓ », consigne
   de rendez-vous ;
4. `4-rendez-vous-ordre-n3.png` — « Ordre : Formation d'armée — en route vers le
   rendez-vous (1/3) (-3,20) » ;
5. `5-armee-formee-jouable.png` — « Guerrier (armée) » sélectionné, chronique
   « Armée formée près de Ville1 » (tour 15 — fusion 1 tour après le rendez-vous).

## 4. Pièges consignés (exécutions 04/11)

1. **Le socket headless ÉVINE la page** (piège 2e socket du même joueur, inversé) : le
   ws de croissance resté connecté fait que les soumissions de la page partent dans le
   vide — et l'UI optimiste les affiche quand même (rejet `OrderAck` INVISIBLE :
   `feedback.ts` ne toast pas FormArmy). Fermer tout socket avant d'ouvrir le navigateur.
2. **Un socket à demi-mort avale les EndTurn sans erreur** — recréer la connexion
   inconditionnellement après fermeture de la page.
3. **Résolution locale figée tant qu'un navigateur tient un socket** — la croissance et
   la fusion se pilotent headless (WS, `TurnResult` porte l'état résolu — PAS un nouveau
   Snapshot), le navigateur n'ouvre que pour le geste et la capture.
4. **FIN-DE-TOUR-PRODUCTION** : après la 3e unité produite, la ville à marteaux sans
   production bloque le EndTurn (« sélectionnez une production ») — réarmer Guerrier.
5. **Le moteur ne déplace pas les membres d'un FormArmy** — c'est l'émetteur qui fournit
   les Move (bots : botPolicy `converger` ; joueur : `mouvementsVersRally`).
6. Le polling admin trop serré étrangle le DO local (mémoire e2e-tours-long, confirmée).

## 5. Intouchés respectés

Moteur, serveur, bots, Jev, Zii, `schemaVersion` 28 — aucun fichier hors `apps/web`
(+ script devtmp et captures hors git tracké). Fusion navale : au backlog (D4).
