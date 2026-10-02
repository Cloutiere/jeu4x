# REPORT-SUR-OCCUPATION-POSE

**Mission** : pose d'une unité produite sur la case de ville occupée par une unité amie — sur-occupation temporaire régularisée à la résolution suivante (décisions D1–D7 d'Erik du 02/10, handoff `HANDOFF-SUR-OCCUPATION-POSE.md`).

**Statut : IMPLÉMENTÉ — ARRÊT POUR APPROBATION (L4). RIEN DE COMMITTÉ.** Feu vert d'Erik requis avant commit/poussée.

---

## 1. Mécanisme livré

### D1 — Pose sur case de ville occupée par une AMIE
- `produceUnitFromReserve` (turn.ts) : si la case de ville porte **exactement une** unité amie, l'unité produite est **posée sur la case même**, marquée `arrivanteSurCase: true` (complétion normale **et** série C7 ; en série, les suivantes reprennent le repli adjacent historique). Fini le plafonnement silencieux 20/20 (D5).
- **Rush-buy inclus** (léger dépassement du libellé D1, même parcours de production) : la garde `occupiedByUnit` de `applyRushBuys` ne refuse plus que l'occupation **ennemie** ; `completeProductionNow` pose avec le flag arrivante si une amie occupe la case. 🔶 à vetoer (§5).
- Cas **2+ amies déjà en pile** (résidu de dispersion) ou **ennemi** présent : repli historique (adjacente libre en série C7 / refus en standard) — choix conservatif, pas d'empilement à 3 depuis la production.

### D3 — Régularisation à la résolution suivante
- `regulariserArrivantes` (turn.ts), appelée **en tête de la Phase E** — la même fenêtre que la dispersion de pile amie R-179-b, donc **après les mouvements du joueur** (D4 satisfait naturellement : s'il a séparé les deux pendant son tour, la sur-occupation a déjà disparu au moment de la régularisation).
- Par case portant 2+ amies dont une arrivante : **la plus récente** (unitId max — R-81) rejoint la **première adjacente libre** (tri (q, r), miroir dispersion : entrable, libre, ni camp barbare ni ville ennemie). Fortification/stabilisation perdues (R-175), `board.moved` (pas de bonus de demeure).
- **Aucune adjacente libre** : la pile **persiste**, flag conservé, nouvel essai à chaque résolution suivante — jamais de destruction.
- **Suspension miroir R-179-b (H2/H3)** : entrée ennemie sur la case ou mêlée différée → régularisation reportée (la pile reste pour la mêlée).
- Une arrivante posée **pendant la résolution en cours** attend le tour suivant (`board.arrivantesCeTour`, interne au Board, non sérialisé) : le joueur dispose d'abord de son tour.

### D7 — Migration : AUCUNE
Champ **optionnel** `arrivanteSurCase?: boolean` sur `Unit` (absent = false), miroir du précédent `canal?` de `GreatPersonSpawned` : le moteur tolère `undefined`, les parties existantes sont reprises à l'identique, **`schemaVersion` reste 27**. Justification : le flag est un état transitoire non dérivable sans risque (dérive par unitId max confondrait les résidus de mêlée/dispersion) ; un champ optionnel évite la migration 27→28 et son départ en prod.

### D6 — Événement et journal
Nouvel événement **`ArrivanteRegularisee { unitId, owner, from, to }`** (events.ts, `eventRefs` : filtrage fog standard comme `UnitDispersed`). Câblé client : playback (animation de déplacement + toast info), relecture REPLAY-RESOLUTION (état de relecture mis à jour, case cliquable), libellé journal (« u11 (arrivante) relogée vers (q,r) — la case de ville était occupée par une amie »), labo-combat, contexte mêlée.

### D5bis — Case occupée par un ENNEMI (verdict consigné)
Le cas est **inatteignable en pratique** : une ville sans défenseur investi est **capturée en Phase C** (`processCityCaptures`, production purgée) avant l'économie — test dédié. Le repli « refus de pose » du code reste en sécurité défensive ; `completeProductionNow` ne vérifiait d'ailleurs jamais l'occupation (la garde vivait dans `applyRushBuys`).

## 2. Tests
- **Nouvelle suite** `packages/rules/tests/sur-occupation-pose.test.ts` (8 cas) : scénario exact d'Erik (ville pop 7, guerrier sur la case, colon 20/20 → posé, pop 7→5, file consommée, pile intacte en fin de tour = exemption dispersion), D5bis (ennemi → capture, pas de pose), rush-buy amie, D3 (relogement tri (q, r) + événement), D4 ×2 (bouge l'arrivante / bouge l'occupante → flag nettoyé, aucun relogement), persistance sans adjacente + reprise dès qu'une case se libère, D7 (schemaVersion 27 inchangée).
- **`turn.test.ts`** : l'ancien test « case occupée → en attente, plafonnée (🔶) » réécrit vers le nouveau comportement (pose en arrivante) — aucun affaiblissement ; barbares/mêlées/R-30 : suites inchangées et vertes.
- **Suites complètes vertes (×2 passes)** : rules **952/952**, web **481/481**, server **120/120**, `tsc --noEmit` 0 erreur (4 paquets), `svelte-check` 0 erreur (14 warnings préexistants).

## 3. E2E solo en vraie partie (légal)
`devtmp/sur-occupation-e2e.mjs` (wrangler local **relancé** — piège connu — + Vite 5174) : partie solo pangee-40, guerrier produit tour 9 (occupante), **colon produit tour 15 posé sur la case occupée** (`arrivanteSurCase=true`, 2 unités sur la case), fin de tour sans rien bouger → **`ArrivanteRegularisee`, colon relogé en (-5,20)**, flag consommé. Vérifié au dump serveur.

**Captures `dev-logs/captures-sur-occupation/`** :
1. `1-colon-pose-sur-ville-occupee.png` — la pile sur la case de ville ;
2. `2-regularisation-colon-reloge.png` — le colon relogé (toast + sprite) ;
3. `3-journal-regularisation.png` — journal (entrée #38 « relogée »).

## 4. RULES.md à réaligner (le pilot s'en charge)
- **R-30 amendée** : nouvelle exception encadrée — la pose de production sur case de ville occupée par UNE amie (sur-occupation temporaire flaguée) ; l'exception barbare (pile R-96) et la mêlée R-180 inchangées.
- Nouvelle règle à consigner (suggestion §R-62 ou§7 Phase E) : régularisation des arrivantes en Phase E (relogement R-81, persistance, suspension H2/H3, D4).

## 5. 🔶 Ouverts (à trancher par Erik)
1. **Affichage de la pile** (L2, à l'œil) : sur la capture 1, l'arrivante est peu lisible derrière le sprite de la ville (le placement de mêlée la positionne sur le côté, la ville la masque partiellement). Un ajustement de calque est possible si Erik la juge insuffisante.
2. **Rush-buy inclus** : D1 nommait `produceUnitFromReserve` ; j'ai étendu au rush-buy (même parcours de production, même scénario de blocage). À vetoer sinon je recadre.
3. **Persistance sans capture GUI** : le cas « aucune adjacente libre » n'est pas reproductible légalement en solo (il faudrait 6 unités parkées) — prouvé par 2 tests moteur ; pas de capture jeu.
4. **Pop insuffisante (R-112)** : le plafonnement « en attente » existe toujours pour ce motif (hors périmètre, signal UX HANG-LOCAL non touché).

## 6. Ce qu'Erik valide en ligne
- Le geste : produire un colon alors qu'une unité campe la case de ville → il sort quand même, cohabite, et est relogé au tour suivant si rien ne bouge.
- Les captures 1–3 et le parcours e2e (partie `GJ4XC7` locale, rejouable via `node devtmp/sur-occupation-e2e.mjs`).
- Les 🔶 du §5.
- **Le commit enverra zéro migration** (schemaVersion 27) — rien ne part en prod côté données, seul le code moteur/client sera déployé après feu vert.
