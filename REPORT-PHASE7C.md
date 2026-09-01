# RAPPORT PHASE 7c (L0–L2) — Carte variée, démarrage modifié, recherche ressources, proposition de modèle

Date : 01/09/2026. Handoff : `HANDOFF-PHASE7C.md`. Session livrée jusqu'à l'**arrêt pour approbation** (l'implémentation des ressources est volontairement non commencée).

## 1. L0 — Carte de test variée + nouveau démarrage ✅ (commit `d1ce37d`)

1. **Carte `variee-40`** (`packages/rules/src/data/maps/variee-40.json`) : 40×40 préfabriquée, **symétrique par miroir ponctuel exact** (équité : terrain identique en (c,r) et (39−c,39−r)), spawns à distance 30 (≥ 12). Les **7 terrains en quantités significatives** : mer 282, prairie 346, plaine 472, forêt 104, colline 130, montagne 116, désert 150 — la pangée ne comportait ni désert ni économie exploitable, c'est corrigé (mers intérieures + littoral, déserts jumeaux, deux épines montagneuses). Re-validation complète par le loader (tests dédiés : 1600 cases, comptages, symétrie).
2. **Démarrage modifié (décision d'Erik du 01/09)** : plus de Colon au départ — **1 Guerrier sur une case adjacente praticable de la capitale**, appliqué aux **3 cartes**. Le **loader refuse désormais** toute carte non conforme : exactement 1 unité, type Guerrier, distance exactement 1 de la capitale, case praticable (messages d'erreur explicites, tests dédiés : 2 unités → rejet ; Colon → rejet ; sur/distance 2 de la capitale → rejet). `createInitialState` : 2 unités au total, Guerrier adjacent vérifié par test.
3. **`variee-40` par défaut des parties de test** : `MapId` (shared), validation lobby (serveur), lobby web — 3 options proposées, « Variée 40×40 (défaut) » présélectionnée. Bot : aucun changement nécessaire (lit l'état filtré).
4. Tests recalés (positions/itérations de spawn devenues obsolètes) : `game.test.ts`, `lobby.test.ts`, `idempotence.test.ts`, `missedEvents.test.ts`, `fortify.test.ts`, `map.test.ts`. **Tous verts : 300 tests (226 rules / 50 web / 24 server), typecheck vert.** ⚠️ Total passé de ~297 à 300 (3 nouveaux tests loader/carte).

## 2. L1 — Recherche exhaustive ✅

**[`RECHERCHE-RESSOURCES.md`](RECHERCHE-RESSOURCES.md)** (recherche documentaire déléguée et exécutée par l'agent, avec sources URL par affirmation) :

- **Terrains** : liste fermée CivRev (7 terrains + la **rivière**, trait de case ; **ni oasis ni glace**). Nos rendements §2 et bonus défensifs sont conformes ; écart assumé relevé (colline officielle : +50 % attaque **et** défense). Rivière = candidat d'extension future noté.
- **Ressources** : **22 ressources exhaustives** (tableau complet) — terrain officiel, bonus exact, technologie officielle, présence dans le PDF officiel, tech équivalente dans notre `techs.json`. Vérification croisée **20/20 des pages technologiques individuelles** : aucune divergence avec la table. Le « diamant » d'Erik = Gems (+2 or, montagne, sans tech). Aucun bonus de combat dans CivRev. Densité par carte : non documentée officiellement.
- **Visibilité** : **découverte contre-intuitive** — CivRev affiche les icônes de ressources dès l'exploration ; la tech verrouille le **bonus**, pas l'affichage (sources : guides GameFAQs + absence totale de vocabulaire de masquage). Consigne L2.3 d'Erik = masqué jusqu'à tech → soumis en décision D1 avec un champ par ressource qui permet les deux.
- **Culture** : instruite avec chiffres (Temple +1/citoyen, Cathédrale +2/citoyen, Encens +2, Soie +3, Shakespeare ×2, GP Artist/Thinker +50 %, Communisme stoppe les temples) et mécanique (seuils de culture → GP aléatoires, flip de villes, victoire culturelle ONU) ; seuils numériques [non tranchés] (aucune source).

## 3. L2 — Proposition de modèle éditable ✅ (SANS implémentation)

**[`PROPOSITION-RESSOURCES.md`](PROPOSITION-RESSOURCES.md)** — `resources.json` normalisé (22 champs/ressource : `terrains[]` éditable = scénario diamant en une ligne, `yields`, `revealedByTech`, `officialTech` documentaire, `culture` réservé, `hiddenUntilRevealed`, `spawnWeight` pré-posé pour la 6b) ; placement par tableau `resources` inline dans chaque carte ; interaction brouillard/tech précisée (hook exact : `getFilteredState`, aucun événement nouveau) ; tests d'intégrité en miroir des techs (table fermée, références, index inverse, validation de carte, symétrie) ; `schemaVersion` 6→7 à migration triviale (champ `Tile.resource` déjà présent à null).

**6 décisions D1–D6 soumises à Erik** (visibilité, culture no-go + données prêtes, Or→commerce, 13 ressources à tech absente, placement inline, périmètre de pose) et impacts moteur chiffrés en 12 livrables (moteur ~175 lignes, serveur/protocole zéro, UI/art une session).

## 4. Critères d'acceptation de la session

1. ✅ Carte `variee-40` valide, sélectionnable, par défaut ; démarrage sans Colon conforme sur toutes les cartes ; 300 tests verts.
2. ✅ `RECHERCHE-RESSOURCES.md` : recherche exhaustive sourcée ; culture instruite avec recommandation argumentée.
3. ✅ Proposition `resources.json` + plan d'implémentation présentés.
4. ✅ Aucun changement de règles ni de moteur hors L0 ; tout commité (CI verte).

## 5. Arrêt

**La main est rendue à Erik** : décisions D1–D6 (§7 de la proposition), puis handoff d'implémentation ; cadrage 7d (barbares/huttes) possible en parallèle — la recherche a noté que les villages barbares CivRev apparaissent « always on top of a resource », utile pour l'équilibrage.
