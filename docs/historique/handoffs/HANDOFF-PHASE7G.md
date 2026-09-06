# HANDOFF PHASE 7g — Naval & Espionnage

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**492 tests** : rules 410, server 32, web 50), `RULES.md` §8.5 (culture R-113..R-116, freshly livrée), et les documents d'Erik : « Civilization Révolution Technologies et Déblocages.md » (source de l'arbre) + « Culture dans Civilization Revolution.md » (§Conversion culturelle et Espionnage). `schemaVersion` actuel : **10**.

Contexte 7f (livré) : culture, GP Artiste/Penseur en alternance, jalons (GP installés + merveilles contrôlées), 3 merveilles actives + ONU (verrou 20 jalons, suspension, victoire culturelle), migration v10. Le volet culture de l'espionnage est attendu ici : **le vol de GP par Espions retire des jalons** — prévoir l'interaction avec `CultureMilestone.reason` (nouvelle raison `'gpStolen'` à ajouter) et le **seuil GP de l'adversaire** (`greatPersonsObtained` NE diminue PAS au vol — la règle CivRev sur ce point est à trancher avec Erik 🔶).

## Décisions de tranche proposées (veto possible, à confirmer au lancement)

1. **Naval** : déblocage des unités navales en données (`galere` implémentée — tech retirée 7e, `navalAccess: 'coast'` ; `galion` → `ocean` ; puis Croiseur/Cuirassé/Sous-marin), classification côte/océan **déjà en place** (R-107, `navalAccess` des terrains), soutien naval aux combats côtiers (`navalSupport` — données 7e), transport de terrestres 🔶 (à trancher : Galère/Galion = capacité de cargaison ?).
2. **Espionnage** : l'Espion (25, Écriture, `implemented: false` → activer) entre dans les villes ennemies et **vole un GP installé** (priorité Artiste/Penseur — le vol crédite le voleur d'un GP posé sur sa ville, la victime perd le jalon) ; missions simples d'abord (vol de GP, éventuellement contre-espionnage minimal 🔶).
3. **Remparts/Hollywood** : l'immunité de conversion (Remparts, champ déjà en données) s'appliquera à la conversion culturelle passive — reportée encore si le territoire n'est pas tranché (voir « en suspens »).
4. **GP restants** (or/science/production/combat) : décalés en 7h avec les gouvernements — sauf si Erik les veut en 7g (l'alternance `GREAT_PERSON_TYPES` s'étend par simple édition de la table).

## Mission — livrables dans l'ordre

### L0 — Règles écrites (RULES.md, test-first)
- **R-117 · Mouvement naval** : eau praticable pour les unités `aquatic` selon `navalAccess` (côte vs océan, R-107) ; entrée/sortie de ville portuaire ; PAS de capture d'eau, combats en mer possibles (mêlée et `navalSupport`).
- **R-118 · Soutien naval** : un combat terrestre adjacent à la côte avec une unité navale amie en mer reçoit `navalSupport` en force d'attaque (données : Galion 15, Croiseur 35, Cuirassé 65) — formule d'addition 🔶 à trancher (s'ajoute à S_att ?).
- **R-119 · Espionnage** : ordre(s) d'infiltration, vol de GP installé (cible : ville ennemie VISIBILE), transfert de jalon (`CultureMilestone` reason `'gpStolen'`), détection 🔶 (Remparts ? espion adverse ?).
- **R-120 · Victoires restantes hors périmètre** : rappel — Banque mondiale (20 000 or, 7h+), domination, culture (livrée), scientifique (7h).
- Migration **schemaVersion 10→11** selon les champs retenus (ex. `spyMission`, GP volés…).

### L1 — Moteur (test-first, pur, déterministe R-80..R-82)
1. Phase A : franchissement de l'eau (terrains `navalAccess`), terrestres toujours bloqués, Galère → côte seule, Galion → océan ; interactions huttes/villages maritimes (aucun — huttes terrestres uniquement).
2. Phase B : `navalSupport` (7e, données) appliqué aux combats terrestres côtiers ; combats navals (mêlée unité à unité en mer, villes portuaires défendues).
3. Phase C : production navale (population/production normales), Espion activé, missions (vol de GP), jalons interactifs avec 7f (−1 victime / +1 voleur via un GP posé, seuils T-27 inchangés).
4. Tests citant R-117..R-119 + e2e : transport/invasion côtière, soutien naval décisif, vol de GP → jalons.

### L2 — Serveur
Contrats (`Move` naval inchangé, ordre de mission espion), validation GameDO (étendre `orderShapeError` — leçon 7f : **toute nouvelle forme d'ordre/item passe d'abord par là**), admin dump (flottes, missions), bot : produit une Galère quand le littoral s'y prête, débarque, utilise l'Espion dès qu'un GP ennemi est visible.

### L3 — UI
Sprites navals + Espion via `generate.py` (+`sync-art`, LICENSES) ; indicateur « naval » sur les cases d'eau (portée), panneaux de mission espion, toasts vol de GP (jalon perdu/gagné), filtre brouillard : navale ennemie visible seulement en vue (déjà générique).

### L4 — Vérification & livraison
1. e2e moteur naval (invasion côtière avec soutien naval) + espionnage (vol → jalons).
2. GUI locale vs bot : combat naval, débarquement, vol de GP ; captures (`dev-logs/captures-7g/`).
3. Déploiement prod via CI ; vérifications en ligne pour Erik.

## Critères d'acceptation

1. R-117..R-119 dans `RULES.md`, couvertes par tests citant leur identifiant ; migration v10→11 testée ; suites vertes (≥ 492).
2. Le scénario e2e naval + espionnage complet passe.
3. Galère/Galion/Croiseur/Cuirassé/Sous-marin actifs selon la tranche retenue ; Espion actif avec vol de GP fonctionnel.
4. Déployé en prod, vérifié.

## Périmètre interdit (cette session)

Conversion culturelle passive (territoire — toujours en suspens, D2 culture-ressources idem), GP or/science/production/combat (7h sauf veto), gouvernements (7h), merveilles à effets complexes restantes (Grande Bibliothèque, Oracle, Grande Muraille, Himeji, Magna Carta, Hollywood — 7h), ICBM/SDI (7h+), procédurale (6b livrée). Toute interprétation : documenter + signaler.

## En suspens (à proposer à Erik en fin de 7g)

- **Territoire/frontières** (prérequis de la conversion culturelle passive) — proposition d'implémentation attendue.
- **D2 culture-ressources** (Encens +2, Soie +3 — champ `culture` déjà en données, ignoré).
- **Sauts technologiques** (majorité des prérequis + finissable ≤ 10 tours — différé depuis 7e).

## Fin de session

Rapport habituel (`REPORT-PHASE7G.md`) + captures + handoff 7h. Suite prévue : **7h — Gouvernements, Civilisations & merveilles** (mods culturels Monarchie/Communisme déjà anticipés en données), puis points en suspens d'Erik.
