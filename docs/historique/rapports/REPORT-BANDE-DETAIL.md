# REPORT-BANDE-DETAIL — Infobulles « pourquoi tant de tours » sur la bannière de ville

**Mission** : HANDOFF-BANDE-DETAIL (décisions Erik 07/10, D1-D6). Survol des deux
chiffres de la bande-ville = tooltip explicatif (référence Civ VII simplifiée).
**Statut** : livrée — suites vertes, GUI 6/6 captures PASS, commit prêt.

## Ce qui a été livré

### L1/L2 — Helper partagé moteur/UI (D4)
- **`packages/rules/src/economie-ville.ts`** (nouveau, exporté par l'index) :
  `economieVilleDetail(state, city, workedTiles, allTechs)` → composantes
  NOMMÉES : `recolte` / `consommation` (0 — 7i D1 abrogée, champ gardé pour la
  ligne de calcul) / `gainNet`, et `prodBrut` / `bonusBatimentsMult` +
  `bonusBatimentsNom` (Usine ×2, data-driven) / `bonusPopMult` (1 + 0,25×(pop−1),
  R-63) / `prodPerTurn` = ⌊brut × mult × pop⌋. Pur, miroir d'affichage des
  formules PanneauVille/bannière — la ville du moteur reste `cityEconomyInputs`
  (Phase C : Anarchie, bonus empire, gouvernements), inchangée (périmètre
  interdit respecté).
- **Test-first** `packages/rules/tests/economie-ville.test.ts` ×5 : propriétés
  « récolte − consommation = gainNet » et « ⌊brut×mult×pop⌋ = prodPerTurn »
  (somme = total), miroir moteur (`cityEconomyInputs` sur ville simple : food
  et production égaux), détail nommé Usine, cas sans bonus.

### L1 — Constructeurs d'infobulles (pur, FR sans coordonnées)
Dans `apps/web/src/lib/render/bande-ville.ts` :
- `lignesTooltipCroissance` (D1) : « Croissance : 10 / 29 fioles » + ligne de
  calcul nommée « Récolte 8 − Consommation 0 = +8 fioles/tour » (±0/−N signés
  FR) + « Nouveau citoyen dans N tours » (pluriel) ; cas plafond (plus jamais),
  surplus ≤ 0 (« Jamais tant que les citoyens ne nourrissent pas »), réserve au
  seuil (« à la prochaine résolution »).
- `lignesTooltipProduction` (D2) : nom de l'item, « Coût : 55 marteaux (déjà
  12) », « Marteaux : 18/tour (base 6 × Usine ×2 × pop ×1,5) » — le bonus
  bâtiments n'apparaît QUE s'il existe (le cas échéant), décimales FR (virgule) ;
  « Achèvement dans N tours » / 0 → « à la prochaine résolution » / ∞ → « Jamais
  (aucun marteau par tour) ». File suivante jamais affichée.
- `seuilCroissanceVille` (Aqueduc inclus, `null` au plafond) + rects LOCAUX des
  zones de survol `rectZoneCroissanceLocale` / `rectZoneProductionLocale` —
  même source de géométrie BANDE_VILLE que le dessin et le picking D6.
- `rendementsVille` DÉLÈGUE désormais à `economieVilleDetail` (une seule
  formule, zéro duplication — le corps précédent a disparu).
- Tests : `bande-ville.test.ts` 24 → 31 (+7 D1/D2/D6).

### L3 — Branchement client (D3/D5/D6)
`GameCanvas.svelte` :
- Cache `detailsBandes` (Map ville → DetailTooltip) rempli au REBUILD (jamais
  par frame) par `economieVilleDetail` + tête effective de file (`coutItem`,
  progression) + `seuilCroissanceVille` ; purgé aux villes ennemies (D3) et
  disparues.
- `zoneBanniereSousEcran` : détection de survol sur les DEUX zones (drapeau
  croissance ; cercle item OU drapeau tours → même infobulle D2), bannières
  ET copies couture, uniquement si le chiffre est visible (D4). Réutilise la
  transform globale du picking D6 (correct 2D comme 3D) — **aucun handler de
  clic ajouté : la bannière reste cliquable** (D5, prouvé en GUI t5).
- `bandeTip` ($state) : positionné AU-DESSUS de la bande (rect écran, borné au
  canvas), rendu `.bande-tip` panneau AAA or-sur-sombre compact (#1b1b22 /
  #e8c96a / #ffd54f — même palette que la bande), `pointer-events: none`,
  disparaît à la sortie et prime sur le tooltip de tuile (pas de chevauchement).

### L4 — Vérification GUI réelle (captures `dev-logs/captures-bande-detail/`)
Script `devtmp/bande-detail-gui.mjs` (partie solo légale, capitale fondée sur
place, poterie pour le Grenier) — **tous les asserts passent, 6 captures PASS
6/6 à la relue visuelle** :
- t1 croissance FINIE : « 4 / 20 fioles · Récolte 4 − Consommation 0 = +4
  fioles/tour · Nouveau citoyen dans 4 tours » ;
- t2 croissance STAGNANTE ±0 (citoyens retirés des tuiles : surplus 0 →
  drapeau « ∞ ») : « ±0 fioles/tour · Jamais tant que… » ;
- t3 production UNITÉ : « Guerrier · Coût : 10 (déjà 2) · Marteaux : 2/tour
  (base 2 × pop ×1,25) · Achèvement dans 4 tours » ;
- t4 production BÂTIMENT : « Grenier · Coût : 40 · Achèvement dans 18 tours » ;
- t5 D5 : le CLIC sur la zone de production ouvre le PanneauVille (cycle R-2
  respecté — survol pur, aucun clic intercepté) ;
- t6 lisible au zoom par défaut ; disparition à la sortie vérifiée (t1).

## Critères d'acceptation
1. ✅ Les deux tooltips au survol avec la ligne « pourquoi » (t1-t4) ;
2. ✅ chiffres miroir exact du moteur (tests de propriété, helper partagé unique) ;
3. ✅ clic bannière inchangé (t5) ; rien sur l'ennemi (D3 par le cache —
   `detailsBandes` ne contient que les villes du joueur, unitaires D3 existants) ;
4. ✅ suites vertes : **web 619 / rules 1062 / server 123**, `tsc` 0,
   `svelte-check` 0 erreur (17 warnings préexistants), `schemaVersion` 27
   (aucun champ d'état nouveau — les données existaient).

## Périmètre respecté
Aucune valeur moteur touchée ; PanneauVille inchangé ; file de production,
3D et schemaVersion intacts.

## 🔶 Points à l'œil (Erik)
- Calibrages du panneau AAA (padding 4×10, police 12, liseré 1,5) — ajustables
  dans `.bande-tip` (GameCanvas.svelte).
- Le détail production n'affiche pas le nom des TUILES (seulement « base N ») :
  D2 demandait « base tuiles + bonus bâtiments » — le détail par terrain serait
  possible en passe suivante si souhaité.
- La zone de survol production couvre cercle + drapeau d'un bloc (D2) ; le
  drapeau ETA seul (item sans coût connu) n'ouvre pas d'infobulle.

## Pièges consignés
- Ville fraîche pop 1 : `autoAssignWorkedTiles` pose DÈS LA FONDATION un
  citoyen sur une prairie (surplus 4, JAMAIS 0 naturellement) — le cas
  stagnante se produit en retirant les citoyens (`SetWorkedTile tile:null`
  retire le DERNIER assigné, ×pop).
- « agriculture » n'est pas un id de tech : le Grenier exige `poterie` (40).
- Les asserts GUI lisent le tooltip DOM (`.bande-tip`) APRÈS un `reload` quand
  l'état a changé via le script (le broadcast des ordres scriptés n'est pas
  immédiat — piège déjà consigné).

## RÉVISION Erik 10/10 — R-63 corrigée (bonus sur les citoyens NON AFFECTÉS)

Signalement d'Erik (capture « base 4 × pop ×1,5 ») : l'interprétation d'avant
était fausse. **Les citoyens sont les unités de population non affectées à une
tuile** — c'est EUX qui portent le multiplicateur de production :

- **Moteur (R-63 rév. 10/10)** : production = ⌊marteaux des tuiles travaillées
  × Usine × (1 + 0,25 × citoyens non affectés)⌋. Le facteur « pop − 1 » est
  ABROGÉ ; les intérieurs n'apportent plus AUCUN marteau direct (tranche de
  production R-60bis abrogée — leur tranche de COMMERCE/science est conservée).
- **Tooltip marteaux (format Erik)** : « Marteaux : 5/tour (4 des tuiles ×
  1 citoyen non affecté ×1,25) » — avec « × Usine ×2 » le cas échéant, « 0
  citoyen non affecté ×1 » sinon. Son exemple pop 7 / 6 tuiles → ×1,25.
- **Libellés croissance** : « fioles » → « nourriture » (demande Erik) :
  « Croissance : 10 / 29 nourriture », « Récolte 8 − Consommation 0 = +8
  nourriture/tour ».
- **RULES.md** : R-63 (rév. 10/10) et R-60bis (tranche de production abrogée)
  documentées.
- **Suites** : rules 1064 / web 619 / server 123 vertes (≈32 tests moteurs et
  2 e2e serveur recalés : fixtures alimentées par des tuiles productives —
  colline/forêt — puisque les intérieurs ne produisent plus) ; GUI re-capturée
  (t2b : réaffectation des citoyens sur des tuiles productives avant l'ETA),
  relue PASS 5/5.
- Note : le message du commit précédent (76c2f6d) est arrivé en texte dégradé
  (problème d'encodage de mon canal shell) — le CONTENU du commit est sain ;
  amender un commit poussé demanderait un force-push, non fait.
