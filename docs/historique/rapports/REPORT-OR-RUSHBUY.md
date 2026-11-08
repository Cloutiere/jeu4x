# REPORT-OR-RUSHBUY — audit « l'or sert à quoi » : puits d'or vérifiés de bout en bout

> Mission HANDOFF-OR-RUSHBUY (demande d'Erik du 29/09). Audit + polissage,
> **zéro changement moteur/serveur** — uniquement deux correctifs côté client
> (`apps/web/src/components/CityView.svelte`). Baseline : 1 420 tests verts +
> typecheck OK ; état final identique (906 règles + 398 web + 116 serveur,
> typecheck 0 erreur).

## 1. Verdicts puits par puits (L0/L1)

| Puits | Point d'entrée moteur | Point d'entrée UI | Verdict e2e |
|---|---|---|---|
| **Rush-buy R-135** | `rushBuyCostOf` economyOr.ts:143 ; résolution `applyRushBuys` turn.ts:1824 (garde 1/ville/tour :1831, fonds :1843, pose :1845-1853, événement :1855) ; facteurs data `economy.json` (×2/×3/×4/×8) | bouton `⚡ Acheter maintenant pour N or` CityView.svelte (~428), tooltip R-135 | ✅ **15/15 contrôles** e2e serveur réel (`apps/server/src/or-rushbuy-e2e.mjs`, partie solo Aztèques vs bot Zoulous) : coût exact 20 (10 ×2), débit 25→5, production instantanée, doublon → 1 seul achat, fonds insuffisants ignorés proprement, bâtiment (Grenier) rushé au coût = restants ×2, doublon bâtiment |
| **Paliers économiques R-136** | `processTreasury` turn.ts:3959, `applyEconomyMilestone` turn.ts:3990, seuils `economy.json` 100→20 000 | HUD Game.svelte:703-713 « Palier 100 or : x% » + journal | ✅ e2e : palier 100 (tour 61) → Colons gratuit ; palier 250 → tech gratuite ; **palier 500 → GP canal or** (`EconomyMilestone` 500 « Grand Personnage gratuit » + `GreatPersonSpawned` explorateur `canal:"or"`, tour 121) ; séquence ordonnée sans saut |
| **Victoire économique R-137** | turn.ts `checkEconomicVictory` (Banque mondiale, 20 000 or) | n/a (fin de partie) | ✅ couvert par les tests automatiques phase7l — **non testable en vraie partie**, dit explicitement dans la checklist |
| **Vol d'or espion R-143** | turn.ts:2664, `GoldStolen`, taux 50 % data `espionnage.json` | bouton « Voler de l'or (50 %…) » UnitPanel.svelte:516 | ✅ scénario moteur (vitest temporaire de l'audit, 3/3) : 200 or → vol de 100, débit/crédit exacts, événement `GoldStolen` ; relecture des tests committés phase7m-spy |
| **Sac de ville** | turn.ts:2902-2940, 25 % (`cityCapturePlunderPct`) | journal `CityCaptured` (champ plunder) | ✅ scénario moteur : capture → plunder 50 (25 % de 200), trésorerie 100→150 |
| **Trésorerie R-134** | `treasury`, Phase C, zéro entretien (test négatif existant), conversion R-90 défaut Or | HUD Game.svelte:694-701 + section « Trésorerie de la civilisation » CityView | ✅ HUD correct après chaque opération (relevés e2e tour par tour) ; intérêts 2 % **Arabie Moderne seulement** (trait `interets` — scénario moteur : 1 000 → +20, test négatif sans trait = 0) |

Captures : `dev-logs/captures-or-rushbuy/00` à `05` (HUD trésorerie/palier,
bouton d'achat + tooltip ×2, achat GUI avec journal, refus fonds insuffisants,
achat sur production **en attente**, événements palier 500 + GP canal or).

## 2. Accros trouvés et correctifs (L2 — client uniquement)

1. **[Corrigé] Bouton d'achat invisible sur la production en attente.** Le joueur
   programme une production → le bouton n'apparaissait qu'AU TOUR SUIVANT
   (`rush` lisait `city.production`, jamais l'ordre `SetProduction` en attente),
   alors que le moteur résout SetProduction AVANT RushBuy en Phase C — l'achat
   le tour même est légal (prouvé par l'e2e tour 0). Correctif : CityView
   calcule le coût sur l'item en attente à progress 0 (`rushBuyCostOf` sur une
   vue superficielle de la ville). Vérifié en GUI (capture 04).
2. **[Corrigé] Facteur d'ère jamais affiché numériquement.** Le tooltip disait
   « marteaux restants × facteur d'ère » sans la valeur. Correctif : le tooltip
   affiche désormais « × facteur d'ère ×2 » (valeur lue `eraRushFactorForEra`).
3. **[Corrigé] Pas de retour après le 1er achat du tour.** Un 2e clic soumettait
   un doublon rejeté silencieusement par le moteur. Le bouton se désactive
   désormais avec « achat déjà programmé ce tour (1 achat/ville/tour — R-135) »
   dès qu'un `RushBuy` est dans les ordres du tour.
4. **[Déjà correct, vérifié] Achat interdit (ONU/Banque mondiale)** : le bouton
   ne disparaît pas — il s'affiche grisé avec « achat interdit (merveille de
   victoire — R-135) » (chemin CityView vérifié ; situation de fin de partie,
   non joignable en GUI — couvert par tests phase7l « INTERDITS »).
5. **[Accepté, documenté] Vol d'or : la notification de la victime passe par le
   journal seul** (« OR VOLÉ ! » + montant) — suffisant, pas de push dédié.
6. **[Canon, noté pour la checklist] GPT affiché +0/tour au départ** : exact —
   le commerce de départ est minuscule (R-90 défaut Or) ; la science est
   BLOQUÉE à 0 tant que le joueur ne bascule pas la conversion (connu — futur
   chantier JEV R-90, hors périmètre ici ; la checklist S4 documente la manœuvre).

**Aucun bug moteur/serveur trouvé** — le garde « 1 achat/ville/tour », le refus
fonds insuffisants, les interdits et le débit exact se sont tous comportés
conformément à R-135 à la résolution. Zéro changement de règle/valeur.

## 3. Outils livrés (L1)

- `apps/server/src/or-rushbuy-e2e.mjs` — e2e headless réutilisable (partie solo
  réelle sur wrangler dev, 15 contrôles, ~3 min) : `node src/or-rushbuy-e2e.mjs [baseUrl]`.
  Pièges intégrés : unité unique Aztèques (`guerrier_jaguar`, R-148 — produire
  « guerrier » est refusé silencieusement par le moteur), blocage fin de tour
  (toute ville sans production), drainage des unités autour de la capitale
  (le GP du palier 500 est PERDU sans case libre — interprétation documentée).
- Scénarios moteur vol d'or / intérêts / sac : exécutés en vitest temporaire
  (3/3), fichier supprimé après l'audit — les tests committés font foi
  (phase7m-spy, phase7l, phase7n).

## 4. Livrable L4

`CHECKLIST-TEST-OR.md` (racine) — 7 scénarios numérotés S1-S7 pour une session
réelle (~30-45 min, civ Aztèques), chacun avec préparation / geste exact /
résultat attendu à l'écran. Victoire économique explicitement hors checklist
(couverte par tests automatiques).

## 5. Reste 🔶 / suite

- « Rejouer la résolution » n'a pas été mobilisé pour les captures d'or
  (journal suffisant) ; rien à corriger.
- Notification espion dédiée (hors journal) : non souhaitée pour l'instant.
- La science bloquée à 0 par défaut (R-90) reste le vrai frein de découverte du
  rush bâtiment en début de partie — chantier JEV futur, NON touché ici.
- L'e2e créer une partie par exécution dans le stockage local de dev — les
  parties de test s'accumulent dans « Mes parties » du dev local (sans impact
  prod). À purger au besoin.

## 6. Arrêt pour approbation (L4)

Captures + correctifs présentés. **Feu vert de commit demandé à Erik**, puis
Erik teste en vrai avec `CHECKLIST-TEST-OR.md` et revient avec ses constats
(les retouches seront une mission de suite).
