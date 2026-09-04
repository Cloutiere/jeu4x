# HANDOFF PHASE 7l — Or & trésorerie : rush-buy, paliers économiques, Banque mondiale + corrections de calibrage

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**613 tests**), **les deux specs d'Erik qui font foi : [Économie d'or Civ Revolution.md](Économie%20d'or%20Civ%20Revolution.md) (trésorerie/rush-buy/paliers) et [Civilization Revolution _ Merveilles et Personnages.md](Civilization%20Revolution%20_%20Merveilles%20et%20Personnages.md) (§GP — paliers d'or)**, `RULES.md` (R-90 conversion binaire, R-62/R-63 croissance, R-126/R-127 GP, R-130 récupération, §8.9), décisions d'Erik du 05/09 (Bloc 0). `schemaVersion` actuel : **14**. Pièges connus : `orderShapeError` avant toute nouvelle forme d'ordre, serveurs dev périmés, HMR.

**Contexte.** Aucune trésorerie n'existe : le commerce converti en or (R-90) s'évapore. La spec d'Erik fournit tout : focus binaire par ville **confirmé fidèle** (R-90 inchangée), trésorerie d'empire, zéro entretien, rush-buy à formule, paliers économiques, Banque mondiale. Le Bloc 0 applique d'abord les décisions d'Erik du 05/09 (calibrages 7i/7k tranchés).

## Bloc 0 — Corrections d'Erik du 05/09 (faire en premier, test-first)

- **C4 — Courbe de croissance = 10 × n (révision R-63/D2)** : canon confirmé **linéaire** — la nourriture requise pour passer de la pop n à n+1 vaut **10 × n** (n = population ACTUELLE) : 2→3 coûte 20, 5→6 coûte 50, 10→11 coûte 100. La table exponentielle 5×1,25^(n−2) 🔶 de 7i est **remplacée** (`growth.json` : `10 × n`, plafond 31 et Aqueduc −33 % inchangés). Déficit alimentaire : **pas de famine, validation d'Erik** (R-63/D1 inchangée, 🔶 levé).
- **C5 — Seuil culturel des GP (révision T-27/R-114)** : table canon d'Erik — 1er GP à **150** points de culture, puis l'écart entre paliers croît d'environ +33,33 à chaque GP (valeurs d'ancrage d'Erik : 150, 267, 417, 600, 817, 1067, 1350, 1667, 2017, 2400, …, 15e = 4817, 20e = 8067). Implémenter en **table data-driven** (`culture.json`) générée par la formule (écart initial 117, croissance +33,33 par pas, arrondi) **contrôlée contre les 12 valeurs d'ancrage** du doc. Le « 20 ×2 » de 7f est obsolète. Les seuils d'accumulateurs (T-30) et Leader (T-31) restent en l'état (aucune source contraire).
- **C6 — Un seul GP d'un même type par ville = aucun effet cumulé** (décision d'Erik — renforce C3) : les multiplicateurs Settle ne peuvent jamais se cumuler au-delà d'une instance par classe. Documenter ; les tests « additifs » 7j sont réécrits vers « une instance max » (le modèle additif reste le code de base pour l'UI, il n'est simplement jamais multiplié).
- **C7 — Récupération des marteaux = réserve PERMANENTE (révision R-130, T-32 abrogé)** : plus de dissipation. La réserve (`pendingSalvage`) subsiste jusqu'à épuisement ; **à chaque fin de tour où une réserve existe, le joueur DOIT choisir un projet** (dialogue UI forcé comme « unités sans ordre »). Un projet **non répétable** dont le coût ≤ réserve est **complété immédiatement** et le **surplus RESTE en réserve** (ex. 200 récupérés, bâtiment 80 → produit ce tour, 120 restent) ; un projet **répétable (unité)** est **produit autant de fois que la réserve le permet** ; si le coût dépasse la réserve, accumulation normale tour par tour. Événement `HammerSalvage outcome:'dissipated'` supprimé (l'événement devient inutile — champ conservé pour compat ou retiré en migration, au choix documenté).
- **C8 — Tie-break de complétion simultanée (révision R-129)** : en cas de complétion au même tour, gagne le chantier avec le **plus de marteaux en surplus** (investi − coût) ; **le perdant récupère l'entièreté de ses marteaux** (bascule R-130/C7) ; égalité de surplus → ordre `cityId` croissant (R-81).
- **C9 — Cie des Indes : toutes les cases d'eau, côte incluse** (révision R-132) : bonus +1 Commerce sur `ocean` **et** `coast`.
- **C10 — Foire de Troyes / Internet : cumul ×4 (révision R-132)** : multiplicatif (Troyes ×2 × Internet ×2 = ×4), remplace la convention MAX.
- **C11 — ONU à 500 marteaux** (décision du 04/09, `T-28`/`nations_unies.cost` 300→500).
- **C12 — Programme Apollo : 46 entrées de journal conservées** (arbitrage pilot validé par Erik : « le bruit ne me dérange pas » — rien à faire, consigné).

## Bloc 1 — Trésorerie (nouvelle règle R-134+, test-first)

- **`player.treasury`** : trésorerie globale d'empire, créditée en fin de tour par la somme des villes **focus Or** (R-90 inchangée — le canon confirme le binaire par ville) ; **zéro entretien** (aucun coût pour bâtiments/unités/population — règle explicite, test négatif). Migration additive **14→15** (`treasury: 0`).
- **Sources d'or exogènes** (chaque ligne data-driven quand possible) :
  - **Surplus de recherche** : l'excédent de fioles au moment où une tech est découverte est converti **1:1 en or** (auditer notre « progression conservée » R-86 — le canon convertit l'excédent, ne le conserve pas 🔶 signaler l'écart appliqué) ;
  - **Camp barbare détruit = +50 or** 🔶 (donnée `barbares.json`) ;
  - **Capture de ville = sac 🔶** (montant data-driven, proposition : part de la trésorerie du perdant — sources muettes, valeur calibrable) ;
  - **Ressources Gemmes/Or** : vérifier `resources.json` (canon : Gemmes +2, Or +3, condition Monnaie — auditer nos valeurs 7c et corriger si écart tranché) ;
  - **Caravane** (si l'unité existe en données — audit) : paiement forfaitaire à l'arrivée dans une ville, l'hôte reçoit ~40 % 🔶 ; sinon reporté avec note ;
  - **Vol d'or par espion** : reporté 7m (avec contre-espionnage), consigné.
- **Intérêts 2 %** : hook data-driven prévu pour les traits de civilisation (7n) — implémenter la mécanique, désactivée sans trait.

## Bloc 2 — Rush-buy (R-135, test-first)

- **Formule** : coût en or = **marteaux restants × facteur d'ère** (linéaire ; 0 marteau = coût total × facteur). Facteurs par ère **data-driven 🔶** ancrés sur les exemples chiffrés du doc : Antique **×2** (Guerrier 10 → ~20-30 ; Pyramides 150 → 300-450), Médiévale **×3** (Marché 60 → 180 ; Banque 120 → 360 ; Pyramides 150 → 450), Moderne **×8** (Bibliothèque 40 → 320 ; Banque 120 → 960), Industrielle **×5 🔶 proposé** (aucun exemple exact dans le doc — signaler). Réductions **cumulables** : Complexe militaro-industriel −20 % sur les unités militaires (multiplie aussi le coût d'ACHAT), futur trait civilisationnel (7n, hook ×0,5).
- **Éligibilité** : unités (militaires ET civiles — Colon compris), bâtiments, merveilles classiques, composants du vaisseau spatial. **Interdits : Banque mondiale et ONU** (test). **Un seul rush par ville et par tour**. Ville fondée ce tour : achat immédiat autorisé.
- **Nouvelle forme d'ordre `RushBuy { cityId }`** (ou extension `SetProduction`) — **valider `orderShapeError` EN PREMIER** (piège 7f).
- **Hammer banking proscrit (canon)** : basculer la production d'une merveille classique vers **ONU ou Banque mondiale** réinitialise les marteaux accumulés à 0 (test). Pour les autres basculements : vérifier le comportement actuel du moteur ; le canon ne documente que le cas victoire — conserver notre comportement sinon et **signaler l'écart éventuel** dans le rapport 🔶.
- **Interaction C7** : un projet payé depuis la réserve permanente ne consomme pas la trésorerie (les marteaux récupérés sont des marteaux, pas de l'or).

## Bloc 3 — Paliers économiques (R-136, data-driven `economy-or.json` ou équivalent)

Ladder canon du doc, chaque palier **une seule fois** quand la trésorerie **franchit** le seuil :

| Seuil | Récompense |
|---|---|
| 100 | **Colon gratuit** à la capitale |
| 250 | **Tech économique gratuite** (Monnaie ou Bancaire — la première non débloquée) |
| 500 | **Grand Personnage gratuit** (canaux GP par or du doc GP — confirmation des 500/10 000) |
| 1 000 | **Grenier gratuit** dans toutes les villes |
| 2 000 | **+1 Population** dans toutes les villes |
| 5 000 | **Aqueduc gratuit** dans toutes les villes |
| 10 000 | **Second Grand Personnage gratuit** |
| 20 000 | **Débloque la Banque mondiale** (voir Bloc 4) |

Les bâtiments gratuits suivent les remplacements R-111 ; les événements correspondants sont diffusés et journalisés (libellés FR).

## Bloc 4 — Banque mondiale & victoire économique (R-137)

- Merveille **500 marteaux** (donnée déjà présente), **verrouillée tant que `treasury < 20 000`** — condition **dynamique** : apparaît/disparaît du menu ; si le joueur repasse sous 20 000 pendant le chantier, la progression est **gelée** (miroir ONU R-116) jusqu'à repasser au-dessus.
- **L'or n'est PAS débité** (condition, pas un prix — test explicite).
- Complétion → **`Victory(reason:'economique')`** — quatrième victoire ; écran de victoire, bot, stats.

## Bloc 5 — Grand Explorateur / Industriel : Consume or activé

Activer le consume Explorateur (inactif depuis 7j) : injection fixe par ère — **50 / 100 / 200 / 400** (données `figures.json` ou `units.json`). Bouton UI dégrisé, libellé avec le montant. (Le flip culturel de l'Artiste reste inactif — territoire en suspens.)

## Mission — livrables dans l'ordre

- **L0 — RULES.md (test-first)** : Bloc 0 (révisions R-63/R-114/R-130/R-129/R-132/T-28, C6/C12), R-134..R-137, table des paliers ;
- **L1 — Moteur (test-first)** : Bloc 0 → Bloc 1 → Bloc 2 (`orderShapeError` d'abord) → Bloc 3 → Bloc 4 → Bloc 5 ; chaque test cite la R-xx ou la ligne du doc ;
- **L2 — Serveur** : diffusion (trésorerie dans le snapshot filtré — l'or de l'ADVERSAIRE est-il public ? canon : non → filtrer, hook pour 7m espionnage 🔶), événements paliers/rush/sac, admin dump économie, migration 14→15 ;
- **L3 — UI** : **barre supérieure** — trésorerie + GPT net + progression vers le prochain palier (canon UI du doc) ; écran de ville : bouton **« Acheter maintenant pour X or »** (coût affiché, grisé si insuffisant ou interdit), réserve de marteaux C7 avec dialogue de choix forcé, Banque mondiale conditionnelle, dégrisement Explorateur ; bot (rush-buy déterministe simple 🔶 : achète si trésorerie > coût + réserve de sécurité) ;
- **L4 — Vérification & livraison** : e2e (rush d'une unité/bâtiment/merveille, interdits, paliers 100/500/20 000, victoire économique complète, réserve C7 avec unités multiples), GUI vs bot sur 5174 (pièges HMR/ports), captures `dev-logs/captures-7l/`, CI, prod health.

## Critères d'acceptation
- La trésorerie grossit des villes focus Or ; zéro entretien (test négatif) ;
- Rush d'un Guerrier à 0 marteau en ère Antique = ×2 du coût (données) ; Complexe −20 % visible ; ONU et Banque mondiale **non** achetables ; 1 rush/ville/tour ;
- Paliers 100/500/10 000/20 000 déclenchent leurs récompenses une seule fois, dans l'ordre des seuils ;
- Banque mondiale : verrouillée sous 20 000, gelée si on repasse dessous, victoire économique à la complétion, or non débité ;
- C4 : seuil pop 2→3 = 20 ; C5 : 1er GP culture à 150 ; C7 : réserve permanente, unités multi-produites ; C8 : surplus départage, perdant remboursé intégralement ; C9 : côte incluse ; C10 : ×4 ; C11 : ONU 500 ;
- Baseline : tests verts (≥ 613 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Vol d'or par espion + contre-espionnage (7m)** ; **ICBM/SDI (7m)** ; **civilisations/traits (7n** — hooks laissés : intérêts 2 %, réduction rush ×0,5**)** ; **artefacts (phase séparée)** ; **territoire/flip culturel (en suspens)** ; routes (pas d'ouvriers chez nous — hors canon 1v1 actuel, signaler si pertinente) ; acheter des techs en diplomatie (pas de diplomatie — consigné) ; aucun recalibrage au-delà du Bloc 0.

## Fin de session
Rapport `REPORT-PHASE7L.md` (décisions, écarts doc/moteur, 🔶 à calibrer — facteur d'ère Industrielle, sac de ville, caravane, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
