# REPORT-PHASE7L — Or & trésorerie : rush-buy, paliers économiques, Banque mondiale + corrections Bloc 0

**Phase 7l livrée le 05/09/2026.** Baseline 613 tests → **659 tests verts** (570 rules + 36 server + 53 web), typecheck vert (rules/server/web), **CI deploy success**, prod saine (`{"ok":true}`). `schemaVersion` **14 → 15**. Commits `9f7ac1d`-à-`f21961f` (fenêtre du jour, push `f83ba9f..f21961f`).

## 1. Livrables

### Bloc 0 — corrections d'Erik du 05/09 (test-first)
- **C4 — Croissance 10 × n (R-63/D2 rév., T-15 obsol.)** : `growth.json` régénéré — `seuil(cible) = 10 × (cible − 1)` (2→3 = 20, 5→6 = 50, 10→11 = 100) ; plafond 31 et Aqueduc −⅓ inchangés. Déficit alimentaire : pas de famine (validation Erik consignée, 🔶 levé).
- **C5 — Table canon des seuils culturels (R-114 rév., T-27 obsol.)** : `culture.json` `greatPersonCultureThresholds` — 64 entrées générées par la formule (écart initial 117, `+33,33/k` arrondi par défaut), **contrôlées en tests contre les 12 ancres d'Erik** (150, 267, 417, 600, 817, 1067, 1350, 1667, 2017, 2400, 15e = 4817, 20e = 8067) ; extrapolation de la formule au-delà de la table. Le « 20 ×2 » de 7f est retiré. T-30/T-31 inchangés.
- **C6 — Un seul GP par classe et par ville** : `settledGpMultiplier`/`settledGpCostFactor` plafonnés à **une instance par classe** (garde-fou dur, C3 reste la porte d'entrée) ; tests « additifs » 7j réécrits.
- **C7 — Réserve de marteaux PERMANENTE (R-130 rév., T-32 abrogé)** : plus de dissipation (`dissipateUnsalvagedHammers` supprimé, `hammerSalvageWindow` retiré des données, littéral `'dissipated'` retiré de l'union d'événements — choix documenté : le journal n'en dépend pas). Financement en Phase C : non répétable = complété si réserve ≥ coût, **surplus RESTE en réserve** (200/80 → 120 reproduit en test avec un Temple 40 → 160) ; répétable = unités produites en série (case de ville puis cases adjacentes libres, série stoppée si saturation — la réserve subsiste) ; reliquat < coût versé dans la progression. `SetProduction` n'absorbe plus la réserve (progression conservée R-62 seule). Capture : la réserve est perdue. Dialogue UI forcé (miroir « unités sans ordre ») tant qu'une réserve n'est pas engagée dans un projet.
- **C8 — Tie-break surplus (R-129 rév.)** : pré-passage AVANT toute complétion — gagne le chantier au **plus grand surplus (investi − coût)** ; le perdant récupère **l'entièreté** (progress + production du tour + réserve) en réserve C7 ; égalité → `cityId` croissant. Le « investi » inclut la production du tour (test : perdant récupère 52 sur progress 50).
- **C9 — Cie des Indes : toutes les eaux** : `tileYield` conditionné à `isWaterTerrain` (côte `eau` + océan `ocean`) — data-driven, un terrain naval ajouté demain serait couvert.
- **C10 — Troyes × Internet multiplicatifs** : `×4` (miroir moteur ET UI `CityPanel.gainsFor`).
- **C11 — ONU 500** : `wonders.json` + T-28 (R-116, R-133 corrigé).
- **C12 — Apollo 46 entrées** : rien à faire, consigné (R-132).

### Bloc 1 — R-134 Trésorerie
- Champ joueur **`treasury`** : créditée en Phase C (villes focus Or R-90 + bonus empire + or direct des ressources) ; **zéro entretien** (test négatif : bâtiments + unités + pop 5 → trésorerie strictement égale aux gains).
- **Migration 14→15** : `gold` → `treasury` en **report de valeur** (l'or n'était jamais dépensé — un seul champ, zéro perte) + `economyMilestonesClaimed: 0`. Écart assumé avec le « `treasury: 0` additif » du handoff (voir §3).
- **Surplus de recherche → or 1:1** (révision R-85/R-86 demandée) : `creditScience` convertit le débordement en trésorerie au lieu de le reporter ; `scienceStored` reste la science sans tech choisie.
- **Camp barbare +50 or** : `barbares.json` `villageDestructionGold` 25 → 50 (canon).
- **Sac de ville** : champ `plunder` dans `CityCaptured` — `round(trésorerie_perdant × 0.5 🔶)` transféré au captreur.
- **Gemmes/Or au canal canon** : correction du D3 de 7c — champ `directGold` (Gemmes 2, Or 3 condition Monnaie), crédité **directement à la trésorerie** quand la case est travaillée ; leur bonus commerce est retiré. Les 20 autres ressources inchangées.
- **Intérêts 2 %** : `treasuryInterestOf` (pur) branché en fin de Phase C, **désactivé sans trait** (hook `playerHasTrait` toujours false avant 7n, clé `interets`).
- **Fog** : trésorerie et paliers adverses **filtrés à 0** (canon : non publics — hook 7m espionnage).
- **Caravane** : unité en données `implemented: false` → **reporté** avec note (paiement forfaitaire, hôte ~40 % 🔶).

### Bloc 2 — R-135 Rush-buy
- Nouvel ordre **`RushBuy { cityId }`** — `orderShapeError` validé **en premier** (test serveur dédié), `sameSubject` par ville (1 rush/ville/tour), `orderOwnerError` ville possédée.
- Coût **`rushBuyCostOf`** (pur, source unique moteur/UI — `economyOr.ts`) : `round(max(0, coût_effectif − progression) × facteur_ère × hook_trait)`. Facteurs `economy.json` 🔶 : Antique 2, Médiévale 3, **Industrielle 5 (proposé)**, Moderne 8.
- Le **Complexe −20 %** passe par le coût effectif en marteaux (pas de double remise) → « coût d'achat −20 % » comme le canon ; hook 7n « rush moitié prix » (clé `rushHalfPrice`, ×0,5 sur l'OR) inactif sans civils.
- **Interdits** : Banque mondiale + ONU (`isRushForbidden`, test moteur + UI grisée).
- Validations avant débit : production en cours, trésorerie suffisante, **case de ville libre** (unité) + coût pop R-112, merveille non bâtie ailleurs. Sinon ordre ignoré (aucun débit).
- **Hammer banking proscrit** : bascule merveille → merveille de victoire = marteaux remis à 0 ; autres basculements : conservation R-62 inchangée (écart éventuel signalé §3).
- Interaction C7 : un projet payé depuis la réserve ne touche pas la trésorerie (test).

### Bloc 3 — R-136 Paliers économiques
- Ladder **data-driven** (`economy.json` `milestones` avec champs `unit`/`building`) : 100 Colon (capitale, sans coût pop), 250 tech (Monnaie→Banque, octroi direct), 500 + 10 000 GP (capitale, ciblage R-127 🔶, **sans jalon** — miroir C2), 1 000 Grenier + 5 000 Aqueduc (toutes villes, R-66/R-111 via `grantBuildingToCity`), 2 000 +1 pop partout (plafond 31 🔶 respecté, citoyens auto-assignés), 20 000 Banque mondiale (événement seul — condition dynamique R-137).
- Compteur `economyMilestonesClaimed` : un seul déclenchement chacun, **ordre des seuils**, plusieurs paliers possibles le même tour (test grand saut 25 000 → 8 événements dans l'ordre).
- Événement `EconomyMilestone {player, threshold, reward, label}` (libellés FR) + événements d'effet concrets ; toast UI annoncée.

### Bloc 4 — R-137 Banque mondiale & victoire économique
- `wonders.json` : `implemented: true`, `economicVictory: true`, `treasuryRequired: 20000` 🔶 (coût 500 déjà présent).
- Condition **dynamique** : `wonderProductionIssue` (contexte `treasury` — moteur + UI) verrouille le menu sous 20 000 ; chantier **gelé** (miroir ONU R-116) tant que la trésorerie repasse dessous.
- **L'or n'est PAS débité** (test explicite : trésorerie 20 000 intacte après complétion).
- Complétion → `Victory(reason:'economique')` — quatrième victoire : libellés UI/journal, motif méta serveur `economique`, écran de victoire.
- Non achetable (R-135, test live + test moteur).

### Bloc 5 — Explorateur consume or
- `GreatPersonAction consume` classe `explorateur` **activée** : injection fixe par ère `economy.json` (50/100/200/400), versée à la trésorerie, événement `GreatPersonConsumed`.
- UI : bouton dégrisé avec le **montant exact** de l'ère (« +X or à la trésorerie ») ; l'Artiste/Penseur (flip) reste grisé.

### L2 Serveur / L3 UI
- `orderShapeError` + `sameSubject` + `orderOwnerError` pour `RushBuy` ; `finishedReason` étendu ; dump admin enrichi (`economie` : trésorerie, paliers, prochain palier, Banque mondiale dispo, focus Or par joueur, réserves de marteaux, rush en brouillon).
- **Barre supérieure** : trésorerie + **GPT net** (miroir exact du moteur : tranche démographique du centre R-60bis, Troyes/Internet ×4, Settle Explorateur) + **progression vers le prochain palier** (chip « Palier X or : N% »).
- **CityPanel** : bouton « ⚡ Acheter maintenant pour X or » (grisé + motif si trésorerie insuffisante / interdit / case occupée), note réserve C7 réécrite (permanente), contexte `treasury` pour la Banque mondiale, or direct Gemmes/Or affiché dans les rendements.
- **UnitPanel** : Consume Explorateur dégrisé avec montant ; **Game** : dialogue forcé C7, toasts palier/Banque mondiale adverse, libellé victoire économique ; bot : rush-buy déterministe simple 🔶 (achète si trésorerie ≥ coût × 1,3).

## 2. Vérification

- **659 tests verts** : la suite `phase7l.test.ts` (42 tests) cite R-134..R-137/C4-C11 ; réécritures 7i/7j/7k ciblées (salvage C7, tie-break C8, table C5, ONU 500, Troyes ×4, Gemmes/Or, débordement or, migrations).
- **Live (dev 5174 + bot, 48 tours)** : trésorerie 0 → 3 → 6 après assignation d'un désert à épices (+3 C → GPT 3) ; **palier 100 déclenché une fois** (« Colon gratuit à la capitale », colon produit, `claimed: 1`) ; **rush-buy exécuté** : 12 or = (10 − 4 investis) × 2 Antique, débit, guerrier produit, file vidée ; refus de rush corrects (case de ville occupée par un GP/produit) ; journal FR (« p1 achète guerrier dans c1 pour 12 or (rush-buy) ») ; brouillard (ville adverse absente de l'état brut) ; `schemaVersion` 15 en dump admin.
- **Captures** : `dev-logs/captures-7l/` (barre supérieure, journal). ⚠ dans l'environnement de test automatisé le canvas Pixi est resté noir (constaté **identique avant/après 7l** via `git stash` — limitation de l'environnement, pas une régression) ; le canvas est à valider visuellement chez Erik.
- **CI/CD** : push `main` → run 33867489064 **success** ; prod `{"ok":true}`.

## 3. Écarts doc/moteur & interprétations 🔶 (à calibrer)

1. **Migration 15 : renommage `gold` → `treasury`** (le handoff proposait `treasury: 0` additif) : l'ancien champ n'était jamais dépensé — report de valeur, champ `gold` supprimé. Zéro perte, pas de double compteur.
2. **Facteur d'ère Industrielle ×5** 🔶 proposé (aucun exemple exact dans le doc — les trois autres sont ancrés).
3. **Sac de ville 0,5** 🔶 de la trésorerie du perdant par ville capturée (sources muettes ; la capitale clôt la partie — le sac s'applique quand même).
4. **Caravane** : reporté (paiement forfaitaire, hôte ~40 % 🔶) — unité non implémentée.
5. **C7** : quand la réserve complète un projet, la production du tour est perdue (miroir « file vide » R-62 — l'exemple 200−80=120 du handoff est reproduit exactement) ; le dialogue forcé apparaît tant que la réserve existe **sans projet engagé** ; série d'unités C7 = case de ville puis adjacentes libres.
6. **Rush-buy** : case de ville libre exigée (sinon ordre ignoré — pas de spawn adjacent, contrairement au Bâtisseur ; le canon ne tranche pas) ; coût rush = marteaux restants **hors réserve** ; SetProduction + RushBuy le même tour autorisé ; pas de rush d'un Colon sous le coût pop (R-112).
7. **C8** : le départage concerne les complétions de FILES ; les complétions immédiates (rush, Bâtisseur) précèdent la boucle (actions explicites du tour — interprétation documentée).
8. **Paliers GP (500/10 000)** : classe par ciblage technologique R-127 🔶 (le doc GP ne spécifie pas la classe du canal or), **sans jalon** (miroir C2), posés à la capitale sinon première ville.
9. **Hammer banking** : reset appliqué à toute bascule vers une merveille de victoire (ONU→Banque mondiale comprise) ; le canon ne documente que le cas classique→victoire.
10. **Vol d'or par espion** : reporté 7m (avec contre-espionnage) — consigné.
11. **Population des paliers** : plafond 31 respecté 🔶 (le doc ne le précise pas).
12. **Bâtiments gratuits** : liste `city.buildings` désormais triée (invariant déterministe — un test e2e ajusté).

## 4. À vérifier en ligne par Erik (login OAuth)

1. **Barre supérieure** : trésorerie + GPT + progression du prochain palier sur une vraie partie.
2. **Bouton « Acheter maintenant pour X or »** dans l'écran de ville (montant, grisés : trésorerie insuffisante / ONU-Banque mondiale / case occupée).
3. **Dialogue forcé « Récupération de marteaux »** (ville avec réserve C7 sans projet) en fin de tour.
4. **Consume Explorateur** : bouton actif avec le montant d'ère, trésorerie crédité.
5. **Banque mondiale** à 20 000 or : apparition/disparition du menu, tooltip « Requiert : 20 000 or », gel si repasse dessous, écran de victoire économique.
6. **Migration 14→15** sur une partie reprise en cours (trésorerie = l'ancien or).
7. Rendements de ville : mention « + X or direct (Gemmes/Or — R-134) » sur les cases à Gemmes/Or travaillées.

## 5. Périmètre respecté

Vol d'or espion + contre-espionnage (7m), ICBM/SDI (7m), civilisations/traits (7n — hooks posés : intérêts 2 %, rush ×0,5, `playerHasTrait`), artefacts, territoire/flip culturel, routes (aucun ouvrier — hors canon 1v1, sans objet), achat de techs en diplomatie (pas de diplomatie) : **non touchés**. Aucun recalibrage au-delà du Bloc 0.

**Arrêt de la session 7l — remise de la main au pilot.**
