# PROPO-BATIMENT-CULTURE — Diagnostic + proposition d'UN bâtiment de culture précoce (zéro code, mission d'analyse)

**Statut : mission d'ANALYSE livrée — zéro modification de code, zéro banc.** Erik tranche un chiffre/une variante ; le pilot cadre ensuite la mission d'implémentation.
Baseline au moment de l'analyse : rules 1214 / server 503 / web 793 verts, `schemaVersion` 28.

---

## 1. Comment les points de culture se génèrent-ils aujourd'hui ? (exhaustif, chiffré)

Toute la génération passe par **une seule formule** : `cultureGains()` (`packages/rules/src/culture.ts:283-338`), appelée chaque tour par ville dans `packages/rules/src/turn.ts:4657-4664`, qui additionne :

```
gainCulture = round( ( cultureGains(ville, bonusEmpire.culture, allTechs, gov)
                     + directCulture )                    // ressources travaillées
                   × settledGpMultiplier(ville,'artiste_penseur') )  // GP installé ×1,5
city.cultureCumulee += gainCulture    // cumul JAMAIS soustrait (turn.ts:4664)
```

### Les sources, une à une

| # | Source | Valeur | Localisation exacte | Condition d'accès |
|---|--------|--------|--------------------|-------------------|
| 1 | **Palais** (capitale) | `+1 × min(pop, 5)` /tour (plafond 5) | `buildings.json` `palais.culturePerCitizenCap {1, cap 5}` → `culture.ts:298-300` | d'office (capitale) |
| 2 | **Temple** | `+1 × pop` /tour | `buildings.json` `culturePerCitizen: 1` → `culture.ts:301` | tech `rites_funeraires` (40 marteaux) |
| 3 | **Cathédrale** | `+2 × pop` /tour, remplace le Temple | `buildings.json` `culturePerCitizen: 2` → `culture.ts:301` | tech `religion` (150 beakers, ère médiévale), requiert Temple |
| 4 | **Stonehenge** (merveille) | ×1,5 la part `culturePerCitizen` (Temple/Cathédrale SEULE — pas le Palais) | `wonders.json` `templeCultureMult: 1.5` → `culture.ts:321-327` | 50 marteaux, **sans tech** ; obsolète à `litteratie` |
| 5 | **Magna Carta** (merveille) | Tribunal `+1 × pop` /tour | `wonders.json` `tribunalCulturePerCitizen: 1` → `culture.ts:308-317` | tech `democratie` (150 marteaux) |
| 6 | **Théâtre de Shakespeare** | ×2 la culture TOTALE de la ville hôte | `wonders.json` `cityCultureMult: 2` → `culture.ts:329-336` | tech `litteratie` (150 marteaux) |
| 7 | **Premier découvrir** — Religion et Imprimerie | `perCity.culture: +1` /tour, empire entier | `techs.json` `firstToDiscover.perCity` → `firstDiscovery.ts:54-65`, appliqué `turn.ts:4660` | être PREMIER à compléter la tech |
| 8 | **Ressources culturelles travaillées** | Encens `+2`, Soie `+3` /tour (canal générique `culture > 0`) | `resources.json` → `resources.ts:91-104` (`cultureRessourcesTravaillees`), injecté `turn.ts:4661` (`directCulture`) | la case doit être TRAVAILLÉE et la ressource accessible |
| 9 | **GP Artiste/Penseur installé** (Settle) | ×1,5 la culture de la ville hôte | `settledGpMultiplier` `culture.ts:448-451`, appliqué `turn.ts:4662` | obtenir un GP (palier/or/tech…) et l'installer (plafond 1 instance, C6) |
| 10 | **Monarchie** (gouvernement) | part Palais ×2 | `culture.ts:305` (`palaceCultureMult`) | gouvernement Monarchie |
| 11 | **Communisme** (gouvernement) | part Temple/Cathédrale = 0 (le Palais reste) | `culture.ts:320` (`zeroTempleCulture`) | gouvernement Communisme |
| 12 | **Anarchie** | tout à 0 ce tour | `turn.ts:4657` | transition de gouvernement |

Il n'existe **PAS d'autre canal** : les accumulateurs GP à rendement sont ABROGÉS (`culture.ts:473-481`), aucun événement ne donne de culture, aucune tech ne donne de culture directe hors Premier découvrir.

### La formule du jalon et le seuil de victoire

- Accumulation **par ville** dans `city.cultureCumulee` (jamais consommée) ; culture de civilisation = **Σ des cumuls empire** (`cultureEmpireOf`, `culture.ts:227-237`).
- **Palier T-27** (`processCulturePaliers`, `turn.ts:4784-4809`) : tant que `cumulEmpire ≥ greatPersonThresholdFor(culturePaliers)`, le joueur franchit un palier = **(a) +1 jalon culturel ET (b) 1 GP** apparaît dans sa ville la plus cultivée. Table canon d'Erik `culture.json` `greatPersonCultureThresholds` : **150, 267, 417, 600, 817, 1067, 1350, 1667, 2017, 2400, …, 15ᵉ = 4817, 20ᵉ = 8067** (écart +33,33/pas, 64 entrées, extrapolation au-delà). Seuil du 20ᵉ palier : **8 067 points de culture cumulés empire**.
- **Jalons supplémentaires** : chaque **merveille contrôlée = 1 jalon** (construction/capture +1, ville hôte prise/rasée −1 — `turn.ts:4090`, `turn.ts:3775`) ; ville ennemie convertie/capturée = +1 au capteur (`turn.ts:3775`).
- **Victoire culturelle (R-116)** : **20 jalons** déverrouillent les **Nations Unies** (500 marteaux, verrouillée en dessous, progression gelée si les jalons retombent) → achèvement = `Victory('culture')`.

## 2. Inventaire des générateurs construits — et le trou temporel

### Générateurs accessibles, dans l'ordre chronologique d'accès

| Générateur | Coût | Tech | Effet culture réel | Remarque |
|---|---|---|---|---|
| **Palais** | gratuit | aucune | `min(pop,5)` /tour, capitale SEULE | le seul générateur du début de partie |
| **Stonehenge** | 50 marteaux | **aucune** | ×1,5 Temples — **effet NUL sans Temple** | multiplie une part qui n'existe pas encore : un multiplicateur sans multiplicande |
| **Temple** | 40 marteaux | `rites_funeraires` (chaîne poterie 20 + rites 30 = **50 beakers**) | +1 × pop /tour | **LE premier générateur effectif** |
| Théâtre de Shakespeare | 150 marteaux | `litteratie` (60 beakers) | ×2 ville hôte | multiplicateur, encore rien à multiplier dans une ville sans Temple |
| Cathédrale | 160 marteaux | `religion` (150 beakers, **ère médiévale**) | +2 × pop /tour | remplace le Temple |
| Magna Carta / Premier découvrir Religion | 150 / — | `democratie` / `religion` | +1 × pop /tour | très tardifs |

### Le trou temporel (la constatation clé)

- **Tour 1 → tech `rites_funeraires` complétée** : la seule source de culture est le Palais, **capitale uniquement**, plafonné à 5/tour. Toute ville secondaire produit **0 culture**.
- La capitale « type » (pop 3-5 aux tours 10-30) produit **3-5 culture/tour** → le **1ᵉʳ palier (150)** n'arrive pas avant **~t35-t50**, et uniquement par la capitale.
- Le **20ᵉ palier (8 067)** est hors de portée au rythme Palais-seul ; il exige des Temples partout × des populations hautes, c'est-à-dire l'ère médiévale au minimum.
- **Au banc**, le constat est brutal : le bot ne monte presque jamais la lignée Temple/religion (priorité science/éco), donc culture empire ≈ Palais seul ≈ quelques centaines en 400+ tours → **0-2 paliers, 20 jalons inatteignables, victoire culturelle jamais tirée**. C'est exactement le verrou que le handoff vise.
- **Stonehenge est un piège de conception** : c'est le seul item « sans tech » du menu, mais son effet est un multiplicateur de Temples — tant que le Temple n'est pas bâti, il rapporte **0**. Le premier générateur EFFECTIF reste le Temple (50 beakers de chaîne tech), généralement atteint vers t15-t30.

**Le trou à combler** : entre t1 et l'arrivée du Temple (~t15-t30), il n'existe **aucun** moyen de produire de la culture hors capitale ; et même après, une ville non-capitale sans Temple reste à 0.

## 3. Proposition : UN bâtiment — le **Sanctuaire**

### Nom & effet

**Sanctuaire** (canon plausible : l'ancêtre pré-Temple du sanctuaire/shrine des Civilization ; CivRev n'en a pas, mais rien dans les docs d'Erik ne l'interdit — il comble un trou que CivRev comblait par le Temple lui-même, disponible plus tôt chez eux via le rythme de recherche).

**Effet proposé (rév. 14/11) : `cultureFlat: 1`** — « **+1 Culture par tour**, indépendant de la population » : strictement ≤ Temple (`+1 × pop`) dès pop 1, moitié dès pop 2 — moins puissant ET moins cher (20 vs 40), conforme au retour d'Erik. Nouveau champ data-driven (~10 lignes moteur).

- Interactions **cohérentes et canon-friendly** : Stonehenge ne le multiplie PAS (champ flat, hors lignée Temple/Cathédrale — le Temple reste l'achat qui profite de la merveille), Monarchie ne l'affecte pas (part Palais seule), **Communisme ne l'annule pas** (bâtiment civil, pas religieux), Théâtre ×2 s'applique (part totale de la ville).
- **Ne dupe aucune merveille** : Stonehenge reste le multiplicateur de la lignée Temple, Magna Carta/Théâtre jouent d'autres parts. Aucune merveille existante n'a d'effet « culture flat précoce » à dupe.

### Coût en marteaux calibré

> **Rév. 14/11 (retour Erik)** : le premier placement proposé (40 marteaux, +1 × pop — le même ticket que le Temple) a été REFUSÉ : Erik veut un bâtiment **moins puissant ET moins cher** que le Temple. La proposition est révisée ci-dessous.

Les bâtiments de début sont tous à **40** (Grenier/poterie, Caserne/travail_du_bronze, Bibliothèque/alphabet, Temple/rites_funeraires). **Proposition révisée : 20 marteaux, sans tech** — un nouveau palier de prix, volontairement sous la table existante (moitié du ticket standard, ~4-5 tours de production à ~4-5 marteaux/tour, soit renoncer à **1 guerrier**).

### Argument d'équilibre (pourquoi ça ne casse pas science/domination)

- **Strictement dominé par le Temple** : `+1 flat` ≤ Temple dès pop 1, moitié du Temple dès pop 2, tiers dès pop 3. Le Temple reste l'achat culture de référence ; le Sanctuaire est le premier cran, pas un doublon.
- **Coût d'opportunité chiffré** : 20 marteaux = **1 guerrier** ou la moitié d'un Grenier. Un bot qui en bâtit un par ville paie 20 × nVilles marteaux sur t10-t60 — visible mais léger ; la voie domination n'est pas affaiblie en soi : c'est le joueur qui choisit de payer.
- **Le rendement reste modeste** : +1/tour par ville. Une capitale pop 3 passe de 3 à 4/tour (+33 %) ; le 1ᵉʳ palier (150) gagne quelques tours, il n'explose pas (seuil 2ᵉ = 267, croissance +33 %). Avec n villes Sanctuarisées, l'empire gagne +n/tour — c'est LÀ que l'effet se voit (3 villes = +3/tour, ~la moitié d'un Palais), et c'est le vrai arbitrage : **étendre pour Sanctuariser vs s'armer**.
- **La victoire culturelle reste un parcours complet** : 20 jalons = paliers (cumul 8 067) + merveilles + conversions ; le Sanctuaire rapproche le DÉBUT du parcours, pas la fin (ONU 500 marteaux, inchangée).
- **Symétrie défensive** : un adversaire qui investit dans la culture a moins d'armée — le même arbitrage que CivRev, fidélité canon.

### Implémentation data-driven (ampleur : MINEURE — un cran au-dessus de la rév. 1)

1. **`packages/rules/src/data/buildings.json`** : 1 entrée `{ id: 'sanctuaire', name: 'Sanctuaire', cost: 20, workRadiusBonus: 0, tileBonus: null, tech: null, cultureFlat: 1, effect: '+1 Culture par tour' }`. `tech: null` → disponible d'office au menu (comme la Galère).
2. **Moteur : ~10 lignes** — nouveau champ `cultureFlat?: number` sur l'interface Building (`types.ts`, à côté de `culturePerCitizen` culture.ts:136) + `flat += b.cultureFlat ?? 0` dans `cultureGains` (`culture.ts:291-301`). C'est le champ FLAT de la formule (pas la part `culturePerCitizen`) : **Stonehenge ne le multiplie PAS** (il reste fidèle à la lignée Temple), le Théâtre ×2 s'applique (part totale).
3. **Tests** : intégrité de table (`data.test.ts` — automatique) ; +1 test de calcul (`culture.test.ts` : ville pop 3 + Sanctuaire = Palais-part + 1, indépendant de pop).
4. **Interactions government** : le flat n'étant PAS dans la part `culturePerCitizen`, **le Communisme ne l'annule PAS** et la Monarchie ne l'affecte pas — cohérent (bâtiment civil, pas religieux) et obtenu gratuitement par le choix du champ. Anarchie gèle tout (déjà le cas, `turn.ts:4657`).
5. Estimation : **~30-45 minutes de code et tests**, zéro migration (`schemaVersion` inchangé — champ optionnel en données).

### Plan de banc

- **Banc existant** : le banc bot 40×3 (même harnais que les bancs défense, budget ≤ 0,60 $) mesure par partie : culture cumulée empire par ère, **tour du 1ᵉʳ palier** (`CultureMilestone reason 'cultureLevel'` dans la trace), nombre de paliers/jalons à t100 et fin de partie.
- **Critère proposé pour Erik** : le 1ᵉʳ palier culturel tombe **avant t60** (contre ~t100+ sans le bâtiment) dans ≥ 2 parties/3, sans régression des métriques défense (chutes ≤ 2, fondations ≥ 5) ni victoire science.
- ⚠ **Rappel du handoff** : au banc, la victoire culturelle reste **humaine seulement** (filtres bots + seuils 20 jalons — T3-ONU) ; le banc ne mesure donc PAS de victoires culturelles, seulement la **progression du canal** (paliers, culture/tour, tour du 1ᵉʳ GP). L'arbitrage final « est-ce que la voie s'ouvre » se fera à l'œil en prod (Erik vs Jev).
- 🔶 **Risque honnête** : à +1 flat, l'effet au banc peut être invisible (le bot n'a que 1-2 villes t10-t40). C'est le prix de l'équilibre demandé ; le critère banc ci-dessus peut devoir être assoupli (1ᵉʳ palier avant t80) ou l'évaluation basculer à l'œil en prod.

### 3 variantes de calibrage — Erik tranche UN chiffre

| Variante | Coût | Effet | Profil | Recommandation |
|---|---|---|---|---|
| **V1 — mince (recommandée)** | **20 marteaux** | **+1 culture flat /tour** | Nouveau palier de prix sous la table, moitié du Temple à pop 2+ ; 1 guerrier d'arbitrage | ✅ **RECOMMANDÉE** : exactement « moins puissant ET moins cher que le Temple », échelle de progression lisible (Sanctuaire 20 → Temple 40 → Cathédrale 160) |
| **V2 — intermédiaire** | **30 marteaux** | **+1 culture flat /tour** | Entre guerrier (20) et bâtiments standard (40) ; lisible aussi, mais crée un 3ᵉ palier de prix | 🔶 si V1 paraît trop gratuit à l'œil |
| **V3 — mince citoyen** | **20 marteaux** | **+0,5 × pop /tour** (arrondi au plus proche, pop 2-3 = +1) | Croît avec la pop mais reste ≤ Temple ; moins lisible en UI (arrondi) | à réserver si le flat paraît trop rigide |

**Recommandation argumentée : V1 (20 marteaux, +1 flat).** Raison : elle répond exactement à la contrainte d'Erik (dominée par le Temple sur les deux axes : prix 20 < 40, effet +1 ≤ +pop dès pop 1), elle crée une **échelle de prix lisible** (20 → 40 → 160) qui matérialise la progression culturelle, et le champ flat laisse le Communisme/Stonehenge intouchés (cohérence canon). Manettes de calibrage suivantes si le banc est invisible : le COÛT (30) ou l'EFFET (V3), jamais les deux.

---

## Écarts document/code consignés

- Les docs d'Erik (`docs/recherche/Culture dans Civilization Revolution.md`, `Territoire_culturel.md`) décrivent la culture comme le moteur du **statut de frontière** (ratio culture/pop : Disgusting → Sophisticated) et des **conversions** ; dans le code, tout ce volet est **visual-only** (R-162 phase 1, `rayonCulturelDe`) — la seule progression « réelle » est le canal paliers/GP/jalons. LE DOCUMENT GAGNE sur la direction (le bâtiment précoce doit aussi servir, à terme, la pression territoriale) — le champ `culturePerCitizen` alimentera les deux, d'où le choix de ce champ plutôt qu'un flat isolé.
- Piège vérifié : **46 techs** (table complète recomptée, pas 44) ; merveilles à obsolescence/exclusivité mondiale (R-128/R-129) — le Sanctuaire n'étant pas une merveille, il n'y est pas soumis.
