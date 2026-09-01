# PROPOSITION-RESSOURCES.md — Modèle de données éditable pour les ressources (Phase 7c L2)

Date : 01/09/2026. Base : [`RECHERCHE-RESSOURCES.md`](RECHERCHE-RESSOURCES.md) (L1, sources citées). **Aucune implémentation dans ce document** — conception soumise à l'approbation d'Erik, puis arrêt (le handoff d'implémentation suivra la décision).

Contrainte structurante (mission 7c) : **rien de codé en dur**. Le scénario étalon : « le diamant apparaît aujourd'hui sur montagne et demain sur colline » doit se résoudre en éditant un tableau ; la tech qui débloque et le bonus doivent pouvoir changer en éditant le JSON.

---

## 1. `resources.json` — schéma normalisé

Nouveau fichier `packages/rules/src/data/resources.json`, miroir de `terrain.json`/`techs.json` (base relationnelle embarquée, même philosophie que R-86) :

```json
{
  "gemmes": {
    "id": "gemmes",
    "name": "Gemmes",
    "terrains": ["montagne"],
    "yields": { "food": 0, "production": 0, "commerce": 2 },
    "revealedByTech": null,
    "officialTech": null,
    "culture": null,
    "hiddenUntilRevealed": true,
    "spawnWeight": null
  },
  "fer": {
    "id": "fer",
    "name": "Fer",
    "terrains": ["colline"],
    "yields": { "food": 0, "production": 2, "commerce": 0 },
    "revealedByTech": "travail_du_fer",
    "officialTech": "Iron Working",
    "culture": null,
    "hiddenUntilRevealed": true,
    "spawnWeight": null
  }
}
```

| Champ | Type | Éditable = | Rôle |
|---|---|---|---|
| `id`, `name` | string | identité | id français (convention `techs.json`/`terrain.json`), nom affiché |
| `terrains` | `TerrainId[]` | **le scénario diamant : `["montagne"]` → `["montagne","colline"]`, rien d'autre à toucher** | terrains d'apparition autorisés (validation à la pose et au chargement de carte) |
| `yields` | `Yields` (N/P/C) | bonus libre | bonus de rendement ajouté au rendement du terrain quand la case est travaillée par une ville dont le propriétaire a accès à la ressource |
| `revealedByTech` | `string \| null` | id de `techs.json` ou null | la ressource exige cette technologie (accès au bonus et, selon D1, visibilité) |
| `officialTech` | `string \| null` | documentaire | nom officiel anglais de la tech CivRev quand notre base ne l'a pas encore (ex. `Irrigation`) — jamais lu par le moteur ; quand la phase suivante ajoutera la tech, l'édition = déplacer la valeur vers `revealedByTech` |
| `culture` | `number \| null` | valeur officielle (Encens 2, Soie 3) | **réservé** — non lu par le moteur tant que la décision culture D2 n'est pas actée (même statut que `wonders.json` en 7a : données sans effet) |
| `hiddenUntilRevealed` | `boolean` | true/false | D1 : si true et `revealedByTech` non null, l'icône est masquée au joueur tant que la tech manque ; si false, affichage CivRev-fidèle (visible, bonus verrouillé) |
| `spawnWeight` | `number \| null` | poids relatif | **champ prévu dès maintenant** pour la future génération procédurale (6b+) : poids de pose par case de terrain compatible ; null = ressource réservée aux placements explicites |

Contenu initial : **22 ressources** = table complète de la recherche L1 §2 (ids : `aluminium`, `betail`, `ble`, `baleine`, `boeufs`, `caoutchouc`, `charbon`, `chene`, `encens`, `epices`, `fer`, `gemmes`, `or`, `marbre`, `petrole`, `poisson`, `soie`, `soufre`, `teinture`, `vin`).

### Portée initiale de `revealedByTech` (décision D4)

Notre base technologique (7a) couvre l'Antiquité seulement. Sur les 20 ressources à tech officielle, **7 ont leur tech dans `techs.json`** : Poisson→`travail_du_bronze`, Fer→`travail_du_fer`, Soie→`lettres`, Baleine→`navigation`, Bœufs→`equitation`, Bétail→`code_des_lois`, Vin→`poterie`. Les **13 autres** (Blé/Irrigation, Chêne/Construction, Gibier/Feudalism, Encens/Ceremonial Burial, Teinture/Monarchy, Or/Currency, Marbre/Masonry, Charbon/Steam Power, Soufre/Gunpowder, Pétrole/Combustion, Caoutchouc/Automobile, Uranium/Nuclear Power, Aluminium/Mass Production) n'ont pas encore leur tech chez nous.

**Recommandation D4** : pour ces 13, `revealedByTech: null` (ressource visible et active dès le départ en v1) + `officialTech` renseigné. Ajouter les techs manquantes dès maintenant reviendrait à créer 13 technologies sans effets de production — c'est un choix de roadmap (étendre l'arbre), pas un choix de données ; quand chacune arrivera, l'activation de la ressource = une édition JSON. Alternative : ne pose sur les cartes, en v1, que les ressources « vivantes » (7 à tech + Gemmes/Épices sans tech), les 13 modernes restant en données pour les phases suivantes.

### Décision D3 — le bonus « Or » (Gemmes +2, Or +3)

CivRev donne à Gemmes/Or un bonus **direct au trésor**, hors conversion. Notre moteur n'a qu'un canal (N/P/C → commerce → conversion R-90 par ville). Options :
- **Recommandée (v1)** : mapper Or → **commerce** (`commerce: 2` / `3`). Zéro changement moteur, calibrage équivalent en rythme, une divergence documentée (une ville en conversion science convertirait ce commerce en science). Editable plus tard.
- Alternative (fidélité stricte) : champ optionnel `gold?: number` dans `ResourceData`, ajouté au trésor après la conversion (précédent R-88 qui ajoute de la science hors conversion). ~15 lignes moteur en plus à l'implémentation + un canal de rendement de plus à documenter dans RULES §2.

---

## 2. Placement des ressources sur les cartes

### Cartes préfabriquées — placements explicites dans le JSON de carte

```json
{
  "id": "variee-40",
  "...": "...",
  "resources": [
    { "id": "fer", "q": -2, "r": 21 },
    { "id": "gemmes", "q": -9, "r": 24 }
  ]
}
```

- `resources` : tableau optionnel de `MapData` (absent = carte sans ressource — les deux cartes existantes peuvent en rester dépourvues ou en recevoir ; à décider à l'implémentation).
- Déplacer le diamant = déplacer son entrée ; changer son terrain d'apparition = éditer `resources.json`. Deux fichiers, deux gestes, zéro code.
- Validation au chargement (voir §4) : id connu, terrain de la case ∈ `terrains`, au plus une ressource par case, jamais sur une case de capitale.

### Génération procédurale (future, 6b+) — préparée sans l'implémenter

`spawnWeight` (poids relatif par case de terrain compatible) est le seul champ prévu dès maintenant ; la 6b décidera de la distribution (nombre par carte, répartition par distance aux spawns) quand elle sera cadrée. La recherche L1 n'a trouvé **aucune donnée officielle de densité** — le calibrage sera un choix d'Erik de toute façon.

---

## 3. Visibilité — interaction brouillard/technologie (précisée)

Point d'accroche exact : `getFilteredState` (`packages/rules/src/fog.ts`), qui est déjà « la dernière opération avant diffusion ».

1. **Case inexplorée** : déjà absente de l'état filtré (ressource comprise) — rien à ajouter.
2. **Case explorée (visible ou exploré-masqué)** : le terrain est déjà diffusé tel quel ; la ressource suit la règle :
   - `revealedByTech === null`, ou tech ∈ `player.techsUnlocked` → la ressource est diffusée (icône affichée, bonus actif) ;
   - `revealedByTech` non débloquée :
     - `hiddenUntilRevealed: true` (défaut, consigne L2.3) → la ressource est **retirée** du tile diffusé (`resource: null`) — le joueur ne la voit pas ;
     - `hiddenUntilRevealed: false` (option CivRev-fidèle) → la ressource est diffusée **affichée mais inactive** : l'UI l'affiche grisée, le moteur n'applique pas le bonus (le filtrage du bonus se fait dans `tileYield`, côté moteur, pas côté client — l'état diffusé ne porte que l'information, jamais le calcul).
3. **Aucune fuite** : le masquage s'applique au tile exploré aussi bien que visible ; l'état du joueur ne contient jamais une ressource qu'il ne doit pas voir. Les JSON de cartes (placements) restent des données commises, comme `techs.json` — ce n'est pas de l'information de partie.
4. **Choix exploré-masqué vs visible** : une ressource révélée sur une case explorée-masquée reste affichée (le terrain y est déjà mémorisé ; la ressource est du décor persistant, comme dans CivRev).
5. **Aucun événement** : la révélation est passive (aucun `GameEvent` nouveau) ; le client redessine au snapshot suivant, comme pour les débloquages R-85 (« visibles dans les menus au tour suivant au plus tard »).

---

## 4. Intégrité — tests (miroir exact des techs, R-86)

Nouveau `packages/rules/tests/resources.test.ts` (le calibrage = éditer les JSON, le CI vérifie) :

1. **Table fermée** : exactement les 22 ids attendus (liste épinglée, comme les 9 techs).
2. **Terrains connus** : chaque entrée de `terrains` existe dans `terrain.json` (et ≠ `ville`).
3. **Bonus cohérent** : `yields` ≥ 0, au moins un rendement > 0 ; `culture` null ou > 0 ; `spawnWeight` null ou > 0.
4. **Références techs** : tout `revealedByTech` non null existe dans `techs.json`.
5. **Cohérence visibilité** : `hiddenUntilRevealed: true` ⇒ `revealedByTech` non null.
6. **Index inverse** : requête `resourcesRevealedBy(techId)` pure et testée (tri R-81) — chaque ressource à tech est retournée par sa tech, réciprocité vérifiée comme `tech.unlocks`.
7. **Culture résiduelle** : seules `encens` (2) et `soie` (3) portent un `culture` non null (épingle l'intention D2 ; le test évoluera avec la décision).
8. **Validation de carte** (dans `map.test.ts`) : toute ressource placée sur une carte commise est connue, sur un terrain autorisé, en un exemplaire par case, jamais sur une case de capitale ; test de symétrie des placements de `variee-40` (miroir ponctuel, comme le terrain).
9. **Moteur** : brouillard — l'état filtré ne contient jamais une ressource non révélée (et la contient après déblocage de la tech) ; économie — le bonus n'entre dans `tileYield` que si la ressource est accessible au propriétaire de la ville (l'auto-assignation R-60 valorise alors naturellement les cases à ressource, déterminisme conservé) ; e2e — déblocage de tech → bonus visible dans les rendements de ville au tour suivant.

`schemaVersion` : **6 → 7** à l'implémentation. Migration **triviale** : `Tile.resource` existe déjà (toujours `null` aujourd'hui) et `null` est une valeur valide du type élargi — aucun changement de forme, la chaîne v1→v7 reste testée idempotente.

---

## 5. Décision culture (L2.5 — go/no-go)

**Recommandation : NO-GO pour 7c, GO pour les données.** Argumentation complète en [`RECHERCHE-RESSOURCES.md` §4.4](RECHERCHE-RESSOURCES.md) : la culture CivRev est un système à consommateurs (grandes personnes, flip de villes, victoire culturelle) qui n'existent pas chez nous ; son seul déclencheur actuel est deux ressources. Concrètement :

- `resources.json` porte les valeurs officielles (`encens.culture = 2`, `soie.culture = 3`) **dès maintenant**, ignorées par le moteur (test n°7 épingle l'état) ;
- le jour où la culture est actée (phase grandes personnes/temples), le contour recommandé est : compteur **par ville** (`cultureStored`, miroir de `foodStored`) alimenté par les ressources travaillées + futurs bâtiments/merveilles, seuil 🔶 par grande personne, pas de flip ni de victoire culturelle en 1v1 ;
- si Erik préfère un **GO minimal** : un compteur inerte dès 7c (+1 livrable moteur de peu de poids) — possible mais sans effet de jeu, donc non recommandé ;
- si **report complet** : retirer le champ `culture` du schéma (il reviendrait avec la phase culture) — perte de fidélité des données initiale, coût nul.

---

## 6. Impacts moteur chiffrés (livrables de la session d'implémentation)

| # | Livrable | Fichier(s) | Volume estimé |
|---|---|---|---|
| A | Types : `ResourceData`, `ResourceId`, `Tile.resource: ResourceId \| null` | `types.ts`, `state.ts` | ~20 lignes |
| B | Données : `resources.json` (22 ressources) + décision D4 appliquée | `data/resources.json` | données |
| C | Chargement : `RESOURCES` + accesseur `resource()` | `data.ts` | ~10 lignes |
| D | Couche de requête : accès (tech débloquée ?), `resourcesRevealedBy` (index inverse) | `resources.ts` (nouveau) | ~40 lignes |
| E | Bonus de rendement : `tileYield` ajoute le bonus de la ressource si accessible au propriétaire (contexte ville/technologies passé à l'appel) ; auto-assignation R-60 en profite telle quelle | `economy.ts` (+ appels `turn.ts`) | ~40 lignes |
| F | Filtrage : `getFilteredState` masque/neutralise les ressources non révélées (§3) | `fog.ts` | ~15 lignes |
| G | Placement : `MapData.resources` + validations `parseMap` + `createInitialState` (recopie des ressources dans l'état) | `map.ts` | ~40 lignes |
| H | Version : `schemaVersion` 6→7 (migration no-op) + chaîne testée | `state.ts`, tests | ~10 lignes |
| I | Serveur/protocole : **zéro changement** (l'état traverse ; aucune action nouvelle) | — | 0 |
| J | UI : 22 sprites via `assets-src/tools/generate.py`, rendu sur les cases (grisées si révélée-inactive), tooltip rendements, mode rendements | `apps/web`, pipeline art | ~1 j |
| K | Bot : zéro | — | 0 |
| L | Tests : `resources.test.ts` (intégrité), extensions `map/fog/economy/e2e` | `packages/rules/tests` | ~1 session |

Ordre de grandeur : **une session d'implémentation** (moteur + serveur passif + UI/art), test-first, sans toucher aux règles existantes hors les points listés (aucun changement de RULES.md requis sauf l'ajout d'une section R-9x « Ressources » à rédiger avec Erik).

---

## 7. Décisions d'Erik (01/09/2026 — toutes tranchées)

| # | Question | Décision |
|---|---|---|
| **D1** | Visibilité d'une ressource non débloquée | ✅ **Révélation avec la technologie** — nouvelle adaptation assumée, **diffère du jeu original** (CivRev affiche les icônes dès l'exploration, cf. recherche §3) : une ressource `revealedByTech` non débloquée est **invisible** pour le joueur. `hiddenUntilRevealed: true` par défaut en données. |
| **D2** | Culture | ✅ **No-go moteur, données prêtes** — `resources.json` porte `culture` (Encens 2, Soie 3), ignoré par le moteur tant que le système (grandes personnes/temples) n'est pas acté. |
| **D3** | Bonus « Or » de Gemmes/Or | ✅ **Mappé sur le commerce en v1** — `gemmes.commerce: 2`, `or.commerce: 3` (divergence avec CivRev documentée : chez CivRev, or direct au trésor). |
| **D4** | 13 ressources à tech absente de notre base | ✅ **Oui** — `revealedByTech: null` (actives en v1) + `officialTech` documentaire ; activation future = édition JSON quand la tech rejoindra `techs.json`. |
| **D5** | Placement | ✅ **Inline** — tableau `resources` dans chaque carte JSON. |
| **D6** | Périmètre de pose | ✅ **Les 3 cartes** dotées de ressources à l'implémentation (pédagogique : quelques-unes ; pangée et variee : jeu complet, placements symétriques pour variee-40). |

Après décisions : handoff d'implémentation (`HANDOFF-PHASE7C-IMPL.md`), puis cadrage 7d (barbares/huttes — la recherche a d'ailleurs noté que les villages barbares CivRev apparaissent « always on top of a resource », un point d'équilibre à garder pour 7d).
