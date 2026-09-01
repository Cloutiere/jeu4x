# REPORT-PHASE7C-IMPL.md — Système de ressources livré (R-91 à R-94)

Date : 01/09/2026. Exécution de [`HANDOFF-PHASE7C-IMPL.md`](HANDOFF-PHASE7C-IMPL.md) — le modèle approuvé (`PROPOSITION-RESSOURCES.md` §7, décisions D1–D6 d'Erik) a été implémenté **sans nouvelle décision de règles**. Commit `b9341a3`, CI verte, production vérifiée. La **Phase 7d (barbares/huttes)** peut être cadrée.

> **Addendum (01/09, soir) — R-92 révisée par Erik.** Le masquage complet des ressources non débloquées est remplacé par le **marqueur « ressource inconnue »** : la présence reste visible sur les cases explorées, seule l'identité est masquée (état filtré diffuse `inconnue` au lieu de l'id réel ; le bonus reste verrouillé). Détaillé en §7.

## 1. Résultats

- **`pnpm test` : 334 tests verts** (260 rules / 50 web / 24 server — baseline 300, +34). `pnpm typecheck` vert partout, `pnpm build` OK.
- **Déploiement** (convention 7b) : push → CI `Deploy` **success** → prod `https://game-4x-server-prod.erik-ai-studio.workers.dev` répond 200 et sert les nouveaux assets (`/art/res_fer.png`, `/art/res_uranium.png` → 200).
- **Vérification en partie réelle (D1)** — partie `AZZ9JX` carte Variée, Alice vs bot, 50 tours :
  - case (-2,20) colline **avec Fer** explorée dès le tour 0 (état serveur admin : `"resource": "fer"`) ;
  - **tours 0–49** (tech absente) : *aucun* sprite de ressource rendu pour cette case — le client ne recevait que Blé (-4,22) et Encens (-6,19) (sans tech, donc visibles) : le masquage R-92 fonctionne de bout en bout ;
  - **tour 50** : `travail_du_fer` débloqué (Bronze 20 + Fer 30, conversion science ville 1 C/tour) → le 3ᵉ sprite apparaît exactement à la position (-2,20) et l'état brut du client montre `"resource": "fer"`. Capture : `docs/captures-7c/fer-revele-apres-travail-du-fer.png`.

## 2. Livrables (détail PROPOSITION §6, A–L)

| # | Livrable | Fait |
|---|---|---|
| A | Types `ResourceData`/`ResourceId` (22 ids), `Tile.resource: ResourceId \| null` — `types.ts`, `state.ts` | ✅ |
| B | `data/resources.json` : table fermée de **22 ressources**, valeurs officielles (recherche §2), D3 (Gemmes +2 C, Or +3 C), D4 (13 × `revealedByTech: null` + `officialTech`), D2 (`culture` encens 2 / soie 3), `spawnWeight: null` partout | ✅ |
| C | `data.ts` : `RESOURCES` + `resource(id)` | ✅ |
| D | `resources.ts` (nouveau) : `resourceAccessible`, `resourceVisible`, `resourceBonus`, `resourcesRevealedBy` (index inverse trié R-81) | ✅ |
| E | `economy.ts` `tileYield(..., techsUnlocked)` : bonus ressource si accessible (R-93) ; `turn.ts` `fillWorkedTiles`/`processEconomy` passent les techs du propriétaire → l'auto-assignation R-60 valorise les cases à ressource (déterminisme conservé, testé) | ✅ |
| F | `fog.ts` `getFilteredState` : ressource non révélée retirée des tiles explorés (`resource: null` diffusé) — R-92 | ✅ |
| G | `map.ts` : `MapData.resources`, validations `parseMap` (id connu, terrain ∈ `terrains`, unicité par case, jamais sur capitale, hors carte), `createInitialState` recopie dans l'état | ✅ |
| H | `schemaVersion` **6 → 7**, migration **no-op** (MIGRATIONS[7] identité), chaîne v1→v7 testée (épingles mises à jour : state/economy/conversion/research/forfeit) | ✅ |
| I | Serveur/protocole : **zéro changement** (l'état filtré traverse ; `game.ts` inchangé) | ✅ (0) |
| J | UI/art : **22 sprites** `res_<id>.png` via `assets-src/tools/generate.py` (64×64, style flat, `--check` conforme), sync vers `public/art` ; couche `resourceLayer` dans `GameCanvas` (rendu sur cases explorées, teinte brouillard exploré-masqué, culling) ; **mode rendements** intégrant le bonus (via `resourceBonus`) ; **tooltip** citoyens : nom de la ressource dans le title des cases travaillées (`CityPanel`) ; `CityPanel` passe les techs du propriétaire à `tileYield` (rendements de ville intègrent le bonus) | ✅ |
| K | Bot : zéro | ✅ (0) |
| L | Tests : `resources.test.ts` (21 tests — intégrité R-91, index inverse, accès/visibilité R-92, bonus R-93, e2e déblocage), `fog.test.ts` +4 (aucune fuite / révélation / D4 / non-mutation), `map.test.ts` +7 (validations R-94, recopie, 3 cartes dotées, symétrie miroir variee) | ✅ |

**Règles** : `RULES.md` §8.3 « Ressources » écrit avec R-91 (table fermée 22 entrées), R-92 (D1, divergence CivRev documentée avec renvoi recherche §3), R-93 (bonus conditionné à l'accès ; D3), R-94 (D5/D6).

## 3. Placements des cartes (calibrage par édition, D6)

- **pédagogique-40** (7, didactique — aucune eau sur la carte) : bétail (-3,21), encens (-5,18), épices (-3,19), gemmes (1,2), fer (18,22), vin (21,19), bœufs (22,18) — une vivante par terrain exploitable, près des capitales.
- **pangee-40** (26, jeu complet, placements libres) : les 9 « vivantes » **des deux côtés** (bétail, encens, blé, fer, gemmes, poisson, chêne, soie, or, marbre, aluminium, caoutchouc / bœufs, vin, soie, fer, charbon, gemmes, or, uranium, baleine, teinture, épices, soufre, gibier, blé), maritimes dans la mer de bordure.
- **variee-40** (28 = **14 paires en miroir ponctuel**, équité parfaite) : 9 vivantes (bétail, encens, épices, fer, gemmes, poisson, baleine, vin, soie, bœufs) + 5 modernes (or, teinture, blé, uranium) — le test vérifie que chaque placement a son jumeau `(39−c, 39−r)` du même id.

Chaque placement est une entrée `resources` inline dans le JSON de carte (D5) ; les déplacer = éditer le tableau ; changer le terrain d'apparition = éditer `resources.json`. Aucune ressource moderne n'a été posée sans raison : 13 modernes disponibles, 5 posées (or/teinture/blé/uranium + encens/blé côté actif) — calibrage libre à l'édition.

## 4. Ambiguïtés et interprétations (à valider par Erik)

1. **22 annonces, 20 ids listés dans le handoff.** R-91 disait « 22 ressources » en listant 20 ids — la recherche L1 (table fermée de 22) et D4 (7 + 13 à tech + 2 sans tech = 22) confirmaient qu'il manquait **`gibier`** (Forêt +3 N, Feudalism) et **`uranium`** (Montagne +4 P, Nuclear Power). Interprétation : table à 22, les deux ids ajoutés ; `RULES.md` R-91 porte la liste complète et cohérente.
2. **Test « au moins un rendement > 0 » vs Encens/Soie.** Ces deux ressources n'ont officiellement *aucun* rendement N/P/C (leur bonus est la culture, ignorée du moteur — D2). Enforcing littéral aurait rendu les données officielles illégales. Interprétation (documentée dans le test) : **un rendement > 0 OU culture > 0** — toute ressource apporte un bonus de l'un des deux canaux.
3. **`tileYield(..., techsUnlocked = [])`** : paramètre à défaut vide pour ne pas casser les appels sans ressource ; tous les appels moteur (`turn.ts`) et UI (`CityPanel`) passent explicitement les techs du propriétaire. Un appel omettant les techs sous-estimerait les bonus à tech (jamais le cas des chemins de production).
4. **Overlay rendements et ressources « affichées mais inactives »** (`hiddenUntilRevealed: false` à tech verrouillée) : aucun cas en v1 ; l'UI n'ajoute le bonus que si `resourceAccessible` (même fonction moteur), donc l'affichage resterait correct pour ce cas futur.
5. **Case travaillée d'une ville ennemie** : la ressource masquée pour moi ne montre pas de bonus dans l'overlay, même si l'ennemi (avec la tech) le perçoit — cohérent avec le brouillard (je n'ai pas l'information).
6. **Pédagogique sans ressources maritimes** : la carte n'a pas d'eau (T-11), poisson/baleine/teinture ne peuvent y figurer — le test l'épingle.

## 5. Limites connues / notes

- Les sprites `res_*` sont validés programmatiquement (dimensions/alpha/conformité `--check`) ; revue visuelle finale d'Erik bienvenue (`assets-src/exports/`).
- Le délai « révélation au snapshot suivant » (comme R-85) signifie qu'après le déblocage, l'icône apparaît à la mise à jour d'état suivante — vérifié en partie réelle (apparue au tour de complétion).
- `spawnWeight` reste inutilisé (réservé 6b — périmètre interdit respecté). Culture ignorée du moteur (D2). Barbares/huttes, génération procédurale, naval, merveilles, techs nouvelles : non touchés.

## 6. Suite — cadrage Phase 7d (proposition)

Barbares/huttes : la recherche note que les villages barbares CivRev apparaissent « **always on top of a resource** » (point d'équilibre à reprendre — nos placements sont prêts à servir d'ancrage) et que les cases de **mer sombre** sont impraticables pour la Galère (utile au naval, Phase suivante). Le schéma 7 (Tile.resource) et la couche `resources.ts` sont les fondations naturelles pour 7d.

## 7. Addendum (01/09, soir) — R-92 révisée : marqueur « ressource inconnue »

**Décision d'Erik** : une ressource dont la tech n'est pas débloquée ne doit pas être invisible — le joueur voit **qu'il y a une ressource particulière** (comme une civilisation qui repère du pétrole sans savoir l'exploiter) ; au déblocage de la technologie, il en découvre la **nature** (l'icône réelle remplace le marqueur).

**Implémentation** (commit `feat(7c-impl)` suivi) :
- `types.ts` : `RESOURCE_UNKNOWN = 'inconnue'` + type `TileResource = ResourceId | 'inconnue'` — **jamais persisté** : produit uniquement par `getFilteredState`, l'état serveur garde l'id réel (pas de bump de schéma).
- `resources.ts` : `resourceVisible` → **`resourceIdentified`** (l'identité réelle est-elle connue ?) + `filteredResource(res, techs)` qui retourne l'id réel ou le marqueur. `resourceAccessible`/`resourceBonus` inchangés — une ressource « inconnue » n'apporte **aucun bonus** (absente de `RESOURCES`, et de toute façon sans accès).
- `fog.ts` : diffuse `inconnue` au lieu de retirer la ressource (R-92).
- UI : sprite **`res_inconnue.png`** (stèle grise + « ? » doré) généré par le pipeline ; rendu sur les cases explorées comme toute ressource ; aucun bonus dans l'overlay/panneau tant que l'identité est masquée ; tooltip « Ressource inconnue » (`CityPanel`).
- `RULES.md` : R-92 réécrite (D1 révisée) + puce `hiddenUntilRevealed` de R-91 (true = marqueur, false = icône réelle avant la tech, CivRev-fidèle).
- Tests : **336 verts** (262 rules — fog R-92 réécrit : marqueur diffusé, jamais persisté, identité réelle après déblocage, bonus nul du marqueur).

**Vérification en partie réelle** (partie `P3UUET`, carte Variée, tour 0, tech absente) : l'état filtré du client montre `"resource": "inconnue"` sur la case du Fer (-2,20) ; 4 sprites rendus sur les cases explorées — Encens + Blé (identité réelle, sans tech) et Fer + Bétail (marqueur). Capture : `docs/captures-7c/marqueur-inconnue-tour0.png`.
