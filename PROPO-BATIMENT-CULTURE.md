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

**Effet proposé : `culturePerCitizen: 1`** — « +1 Culture par citoyen et par tour ». Réutilise le champ existant : **zéro ligne de moteur**, cohérent avec le Temple (même scalaire démographique, exemple canon : 20 pop × Cathédrale = 40 🔶).

- Interactions héritées gratuitement et **cohérentes** : Stonehenge ×1,5 s'applique (lignée Temple — le Sanctuaire rejoint cette lignée), Monarchie ne l'affecte pas (part Palais seule), Communisme l'annule (part `culturePerCitizen` — même logique religieuse 🔶 à confirmer par Erik), Théâtre ×2 s'applique.
- **Ne dupe aucune merveille** : Stonehenge reste un multiplicateur (il devient même plus intéressant), Magna Carta/Théâtre jouent d'autres parts. Aucune merveille existante n'a d'effet « culture flat précoce » à dupe.

### Coût en marteaux calibré

Les bâtiments de début sont tous à **40** (Grenier/poterie, Caserne/travail_du_bronze, Bibliothèque/alphabet, Temple/rites_funeraires). **Proposition : 40 marteaux, sans tech.**

À ~4-5 marteaux/tour (ville type t10, pop 3 sur tuiles normales), 40 marteaux ≈ **8-10 tours de production** ≈ renoncer à ~2 guerriers ou à un Grenier. C'est le même ticket d'entrée que tout bâtiment de début : la balance naturelle reste le coût d'opportunité des marteaux.

### Argument d'équilibre (pourquoi ça ne casse pas science/domination)

- **Coût d'opportunité chiffré** : 40 marteaux = 2 guerriers (40) ou 1 Grenier. Au banc, un bot qui bâtit un Sanctuaire dans chaque ville paie ~40 × nVilles marteaux étalés sur les tours 10-60 — soit concrètement **2-3 unités militaires ou 1-2 bâtiments éco en moins par ville** sur la fenêtre critique d'expansion/défense (t10-t60). La voie domination n'est pas affaiblie en soi : c'est le joueur qui choisit de payer.
- **Le rendement reste modeste** : +1 × pop ≈ +3 culture/tour à pop 3 — comparable au Palais. Ça double la vitesse vers le 1ᵉʳ palier dans une ville dédiée, ça ne l'explose pas (seuil 2ᵉ palier = 267, 3ᵉ = 417, croissance +33 %).
- **La victoire culturelle reste un parcours complet** : 20 jalons = paliers (cumul 8 067) + merveilles + conversions ; le Sanctuaire rapproche le DÉBUT du parcours, pas la fin (ONU 500 marteaux, inchangée).
- **Symétrie défensive** : un adversaire qui investit dans la culture a moins d'armée — c'est le même arbitrage que CivRev, fidélité canon.

### Implémentation data-driven (ampleur : MINEURE)

1. **`packages/rules/src/data/buildings.json`** : 1 entrée `{ id: 'sanctuaire', name: 'Sanctuaire', cost: 40, workRadiusBonus: 0, tileBonus: null, tech: null, culturePerCitizen: 1, effect: '+1 Culture par citoyen et par tour' }`. `tech: null` → disponible d'office au menu (comme la Galère).
2. **Moteur : AUCUNE modification** — `cultureGains` lit déjà `culturePerCitizen` pour tout bâtiment (`culture.ts:301`) ; production/HTTP/UI/web remontent les bâtiments par la table existante.
3. **Tests** : compléter l'intégrité de table de `data.test.ts` (ids uniques, coût > 0) — automatique ; +1 test de calcul (`culture.test.ts` : ville pop 3 + Sanctuaire = Palais-part + 3).
4. **Piège à trancher avant impl** : le Communisme annulera le Sanctuaire avec les Temples (même champ). Si Erik le veut immunisé (bâtiment civil, pas religieux), il faudrait un champ séparé (~5 lignes moteur) — recommandation : **NON**, garder la lignée religieuse unique (cohérence canon Communisme = anti-culture).
5. Estimation : **~30 minutes de code et tests**, zéro migration (`schemaVersion` inchangé — données pures).

### Plan de banc

- **Banc existant** : le banc bot 40×3 (même harnais que les bancs défense, budget ≤ 0,60 $) mesure par partie : culture cumulée empire par ère, **tour du 1ᵉʳ palier** (`CultureMilestone reason 'cultureLevel'` dans la trace), nombre de paliers/jalons à t100 et fin de partie.
- **Critère proposé pour Erik** : le 1ᵉʳ palier culturel tombe **avant t60** (contre ~t100+ sans le bâtiment) dans ≥ 2 parties/3, sans régression des métriques défense (chutes ≤ 2, fondations ≥ 5) ni victoire science.
- ⚠ **Rappel du handoff** : au banc, la victoire culturelle reste **humaine seulement** (filtres bots + seuils 20 jalons — T3-ONU) ; le banc ne mesure donc PAS de victoires culturelles, seulement la **progression du canal** (paliers, culture/tour, tour du 1ᵉʳ GP). L'arbitrage final « est-ce que la voie s'ouvre » se fera à l'œil en prod (Erik vs Jev).

### 3 variantes de calibrage — Erik tranche UN chiffre

| Variante | Coût | Effet | Profil | Recommandation |
|---|---|---|---|---|
| **V1 — faible/coût bas** | **30 marteaux** | +1 × pop /tour | Entrée quasi gratuite, visible t10 ; le plus sûr pour la praticabilité bot (le bot l'achète sans casser son éco) | 🔶 bonne si Erik veut voir l'effet AU BANC dès les premières parties |
| **V2 — moyenne (recommandée)** | **40 marteaux** | +1 × pop /tour | Aligné sur Grenier/Temple/Bibliothèque — le placement canon des bâtiments de début ; arbitrage marteaux réel | ✅ **RECOMMANDÉE** : même ticket que la table existante, équilibre prouvé par la structure du jeu |
| **V3 — forte/coût élevé** | 60 marteaux | +1 × pop /tour **mais** aussi +2 culture flat /tour (champ `cultureFlat` nouveau, ~10 lignes moteur) | Vraie accélération du 1ᵉʳ palier (pop 3 : 3→5+/tour) ; ouvre le flat-culture pour de futurs bâtiments/merveilles | la plus puissante, coût d'impl plus élevé ; à réserver si V2 s'avère invisible au banc |

**Recommandation argumentée : V2 (40 marteaux, +1/citoyen).** Raison : c'est le seul placement qui ne crée pas un nouveau palier de prix (tous les bâtiments précoces sont à 40) et qui réutilise le champ moteur existant — zéro code, équilibre garanti par la symétrie avec le Temple. Si le banc montre que le bot n'achète jamais (le veto production défensive montre qu'il arbitre déjà), la manette de calibrage suivante est le COÛT (30) — pas l'effet.

---

## Écarts document/code consignés

- Les docs d'Erik (`docs/recherche/Culture dans Civilization Revolution.md`, `Territoire_culturel.md`) décrivent la culture comme le moteur du **statut de frontière** (ratio culture/pop : Disgusting → Sophisticated) et des **conversions** ; dans le code, tout ce volet est **visual-only** (R-162 phase 1, `rayonCulturelDe`) — la seule progression « réelle » est le canal paliers/GP/jalons. LE DOCUMENT GAGNE sur la direction (le bâtiment précoce doit aussi servir, à terme, la pression territoriale) — le champ `culturePerCitizen` alimentera les deux, d'où le choix de ce champ plutôt qu'un flat isolé.
- Piège vérifié : **46 techs** (table complète recomptée, pas 44) ; merveilles à obsolescence/exclusivité mondiale (R-128/R-129) — le Sanctuaire n'étant pas une merveille, il n'y est pas soumis.
