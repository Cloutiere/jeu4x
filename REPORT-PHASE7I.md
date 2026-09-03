# REPORT PHASE 7i — Alignement du moteur de ville sur Civ Revolution

Date : 03/09/2026. Spec de référence : [Moteur Ville Civilization Revolution.md](Moteur%20Ville%20Civilization%20Revolution.md) (fait foi) + CivFanatics Info Center. Suites : **556 tests verts** (rules 472, web 50, server 34), typecheck propre (TSC + svelte-check 0 erreur), build web OK.

## 1. Les cinq divergences — toutes corrigées

| # | Divergence | Implémentation | Tests |
|---|---|---|---|
| D1 | La nourriture se **consomme** : `surplus = récolte − population` (l'ancienne R-63 accumulait 100 %) | `turn.ts/processEconomy` : `foodStored = max(0, foodStored + récolte − pop)` ; en déficit la réserve se vide, à 0 la croissance s'arrête, **pas de famine** 🔶 | `phase7i.test.ts` (2 tests D1), `turn.test.ts`, `economy.test.ts` |
| D2 | Seuils de croissance **non linéaires** + plafond **31** | Nouvelle table data-driven **`growth.json`** : `growthThresholds` indexée par la population **CIBLE** (courbe proposée `round(5 × 1,25^(n−2))` : 5 → 3231, **toute la table 🔶**) ; `growthThresholdFor(pop, réduction)` retourne `null` au plafond → croissance bloquée à 31. `GROWTH_BASE` (10 × pop) obsolète, plus lu par le moteur | `phase7i.test.ts` (2 tests D2), `phase7e` Aqueduc adapté |
| D3 | Villes fondées à **pop par ÈRE** (2/3/4/5) | `growth.json → founderPopByEra` ; ère de l'empire = la **plus avancée** des techs débloquées (`techEraOf`, champ `era` de `techs.json`) ; citoyens auto-assignés dès la fondation (R-60). **Capitales préfabriquées passées à pop 2** 🔶 (proposal du handoff, appliquée) avec assignation initiale dans `map.ts`. Clés civilisations (Chine +1, Rome 6, Mongols pop 1) : **reportées 7j** comme convenu | `phase7i.test.ts` (2 tests D3), `map.test.ts`, `e2e.test.ts`, `turn.test.ts` |
| D4 | **Citoyens intérieurs** (table des tranches) | Nouvelle règle **R-60bis** : tout citoyen non affecté au terrain produit au centre-ville selon la tranche démographique de la ville (Ouvrier → Exportateur, table `growth.json → interiorCitizens`) ; **priorité au terrain** : réintégration dès qu'une case est disponible (croissance, fondation, **Tribunal posé → remplissage immédiat** — le `pendingFill` était propre à la résolution, corrigé) | `phase7i.test.ts` (2 tests D4), `turn.test.ts` |
| D5 | Fonder sur une ressource la **détruit** | La destruction existait déjà (case → terrain `ville`) ; ajout de l'événement **`ResourceDestroyed`** 🔶 (journal, refs, durée playback) + **avertissement UI** avant de fonder sur une case à ressource visible | `phase7i.test.ts` (2 tests D5), vérifié e2e GUI (§4) |

**R-66 révisé (centre-ville)** : production du centre garantie **≥ 1** quel que soit le terrain ; commerce du centre = **valeur de la tranche démographique** (interprétation 🔶 retenue : 0 pour pop ≤ 6 → jusqu'à +5 à pop 31). Conséquence assumée : les petites villes ne génèrent plus l'or de centre (1 C → 0), plusieurs tests recalibrés.

## 2. Audit complet demandé (au-delà des cinq points)

- **Grenier** : notre `tileBonus` = **+2 N par plaine** travaillée (amendement 7e) — conforme au doc (« plaine 1 → 3 »). Aucun écart.
- **Port** : +1 N par mer travaillée (buildings.json) — conforme (« améliore la rentabilité des tuiles maritimes »). Aucun écart chiffré dans les sources ; inchangé.
- **Aqueduc** : seuil −33 % appliqué à la NOUVELLE table (`round(seuil × 0,67)` 🔶) — conforme (« réduit le volume de nourriture cumulée requis »).
- **Jardins suspendus** : +50 % pop immédiat (7f, `populationGainPct`) — conforme.
- **Grand Humanitaire** : capacité GP (+1 pop empire / +50 % croissance installée) — **reportée 7j** avec les capacités GP (périmètre interdit de la session). Rien à faire en 7i.
- **Croissance après perte de pop (pompe à colons)** : le doc dit « reconstituera sa réserve ». **Tranché 🔶** : la réserve est **conservée** (jamais recalée à la perte de pop — cohérent avec la logique CivRev de seuil par population cible : à pop inférieure le seuil suivant est plus petit, la ville repousse vite). Testé : ville République pop 2 → colon (−1 pop) → pop 2 retrouvée en ≤ 3 tours (`phase7i.test.ts` « pompe à colons »).
- **Tribunal / rayon 2 au-delà de 8 hab.** : déjà conforme (R-60/R-66 : sans Tribunal, les citoyens excédentaires deviennent des intérieurs — D4 complète la mécanique).

## 3. Interprétations 🔶 et arbitrages (à valider par Erik)

1. **Courbe de croissance** : `round(5 × 1,25^(n−2))` (seuil 5 vers pop 2 → 3231 vers pop 31). Exponentielle « très bas au début, massif à la fin », calibrable dans `growth.json` sans code.
2. **Déficit alimentaire** : réserve vidée, croissance stoppée à 0, **aucune famine/décès** (le doc ne couvre pas la famine).
3. **Commerce du centre-ville = valeur de la tranche** (0 à pop ≤ 6) — impact équilibrage : moins d'or/science en début de partie qu'avant 7i.
4. **Capitales préfabriquées à pop 2** (era Antique) avec 2 citoyens assignés.
5. **Réserve conservée** après perte de population (pompe à colons).
6. **Libellé `ResourceDestroyed`** et présentation UI à calibrer (noms de tranche = traduction du doc : Ouvrier/Vendeur/Commerçant/Marchand/Importateur/Exportateur).
7. **Migration `schemaVersion` : PAS de bump 12→13** — tout est recalculé à la résolution, aucun champ persisté nouveau ni sémantique modifiée (décision documentée dans RULES.md §8.4).

## 4. Vérification GUI locale (wrangler dev + session Erik7i vs Bot7i, partie procédurale JQG84P)

- **Avertissement de fondation** : colon sur une case à ressource → « ⚠ Fonder ici détruirait DÉFINITIVEMENT une ressource… » dans le panneau d'unité. Capture : `dev-logs/captures-7i/avertissement-fondation-ressource.png`.
- **Ligne nourriture** : panneau de ville → « Nourriture : 6 récoltée − 2 citoyens = +4 /tour » (en rouge en déficit). Jauge de croissance sur la table (population cible affichée en tooltip). Capture : `panneau-ville-ligne-nourriture.png`.
- **Citoyens intérieurs** : après désassignation → « 1 citoyen intérieur au centre-ville : **Ouvrier** (+1 P chacun) ». Capture : `panneau-ville-citoyen-interieur.png`.
- **D5 en conditions réelles** : fondation sur la ressource `vin` → événement `ResourceDestroyed` (seq 8, ressource « vin », tile `4,6` → `resource: null`) vérifié au dump admin.
- Pilote réutilisable : `dev-logs/driver7i.mjs` (crée une partie procédurale, amène le colon sur la ressource la plus proche, puis pause pour captures).

## 5. Livrables

- **L0** : `RULES.md` — R-63 réécrite (D1+D2), R-64 réécrite (D3+D5), **R-60bis** nouvelle (D4), R-66 révisé (centre-ville), T-15 marquée OBSOLÈTE, décision migration §8.4.
- **L1** : `packages/rules/src/growth.ts` (nouveau — GROWTH, `growthThresholdFor`, `foundingPopFor`, `techEraOf`, `interiorCitizenFor`, `interiorCountOf`, cap 31), `src/data/growth.json` (nouveau), `turn.ts` (consommation, seuils, fondation par ère, intérieurs, centre-ville, ResourceDestroyed, remplissage Tribunal), `map.ts` (capitales pop 2 + assignation initiale), `events.ts` (ResourceDestroyed).
- **L2** : aucun nouveau contrat serveur (tout est calcul moteur) — `SetWorkedTile`/fondation/admin vérifiés ; le bot ne change pas (il ne s'étrangle pas : la croissance est plafonnée par le surplus, et le coût pop du colon est revalidé par le moteur).
- **L3** : `CityPanel.svelte` (ligne nourriture pédagogique, jauge sur la table + plafond « 31 », bloc citoyens intérieurs avec libellé de tranche, miroirs production/commerce incluant les intérieurs), `UnitPanel.svelte` (avertissement de fondation sur ressource), `playback.ts` (durée ResourceDestroyed).
- **L4** : e2e couverts dans `tests/phase7i.test.ts` (13 tests D1-D5 + pompe) + scénario économique `e2e.test.ts` recalibré (fondation pop 2 → surplus → croissance → Grenier → Tribunal → rayon 2). Déploiement : push sur `main` → CI (vérifications en ligne listées au §6).

## 6. Vérifications en ligne (pour Erik, après déploiement CI)

1. Créer une partie (carte aléatoire) : la capitale procédurale démarre à **pop 2**, 2 citoyens assignés.
2. Panneau de ville : la ligne « Nourriture : X récoltée − Y citoyens = ±Z /tour » est visible ; en déficit elle passe en rouge et la croissance s'arrête.
3. Jauge de croissance : seuils non linéaires (5 → pop 2, 6 → pop 3…) ; au plafond 31, affichage « Plafond (31) ».
4. Désassigner un citoyen (clic sur la case dans le panneau) : le libellé de tranche apparaît (Ouvrier… puis Vendeur à pop 7).
5. Sélectionner un colon posé sur une ressource : l'avertissement de destruction s'affiche ; fonder détruit la ressource (journal `ResourceDestroyed`).
6. Sous République, un colon produit ne retire qu'**1 population** et la ville repousse en quelques tours (pompe à colons).
7. Parties existantes (schemaVersion 12) : chargées **sans migration** ; la nouvelle économie s'applique dès le premier tour résolu.

## 7. Périmètre reporté (inchangé)

Capacités des GP (Grand Humanitaire, 7j), civilisations/traits (clés prévues, 7j), conversion culturelle/territoire, D2 (7j), sauts technologiques, 3D/isométrique (Phase 8). **Suite : 7j — civilisations & traits, capacités GP, rush-buy, contre-espionnage, ICBM/SDI, Grande Muraille**, puis Phase 8 polish/équilibre.
