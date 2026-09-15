# REPORT-ALIGNEMENT-CROISSANCE — Réalignement sur le vrai CivRev (13/09)

Mission exécutée d'après `HANDOFF-ALIGNEMENT-CROISSANCE.md` : consommation des citoyens supprimée, seuils 10 × population actuelle, case de ville 0/0/0. **Suite verte complète, typecheck 4/4, `schemaVersion` 20 inchangée, zéro diff 3D.** Pas de commit (validation locale d'abord — règle établie).

## 1. Ce qui a changé

### Données (M1)
- `packages/rules/src/data/terrain.json` : rendements du terrain `ville` **1/1/1 → 0/0/0**. C'était la moitié cachée du socle : POLISSAGE-1 C1 avait posé 1/1/1 en base de terrain ET R-66 un plancher par-dessus — neutraliser le plancher seul n'aurait pas suffi.
- `packages/rules/src/data/growth.json` : `growthThresholds` recalé **10 × pop actuelle** (« 2 »: 20, « 3 »: 30, …, « 31 »: 310) ; le bloc `cityCenter.floor` est **supprimé** (forme retenue : suppression pure, pas de mise à 0 — la donnée morte disparaît, le type `GrowthData` aussi). `founderPopByEra`, `interiorCitizens`, `populationCap` inchangés.
- **Choix consigné** : la table contient aussi **« 1 »: 10** (absente du handoff, qui listait à partir de « 2 »). Raison : la formule « 10 × pop actuelle » donne 10 pour 1→2, et des villes pop 1 existent (hutte Mongols `villagesVilles`, pompe à colons République) — sans cette clé, `growthThresholdFor(1)` retournerait `null` et une ville pop 1 ne pousserait jamais. Le test « ancres Erik » verrouille `t(1) = 10`.

### Moteur (M2)
- `turn.ts` (`processEconomy`) : `foodSurplus = food` (l'ancien `food - city.pop` est abrogé). Aucun déficit possible, la réserve reçoit toute la récolte.
- `growth.ts` : `growthThresholdFor(pop)` lit la table par **population actuelle** (l'ancienne lecture « population cible » décalait tout de 10) ; nouveau helper pur **`toursAvantCroissance(pop, foodStored, surplusPerTurn, reduction)`** exposé pour l'UI (CityPanel aujourd'hui, MENU-VILLE demain). Le champ `cityCenter` disparaît de `GrowthData`.
- `economy.ts` (`tileYield`) : la case `ville` retourne `ZERO_YIELDS` — plus de plancher ; les traits de civ, bâtiments et merveilles continuent de s'appliquer aux autres terrains (test Égypte-désert réécrit en ce sens).
- `constants.ts` : commentaire de `GROWTH_BASE` mis à jour (constante toujours dormante).
- `schemaVersion` **20 inchangée** : aucun champ d'état nouveau ni supprimé (le JSON de données n'est pas l'état des parties). Aucune migration.

### UI (M3)
- `CityPanel.svelte` : la ligne « récolte − population » devient **« Nourriture : +X /tour (aucune consommation) »** ; le hint du socle devient **« Case de ville : aucun rendement — la ville vit par ses citoyens »** ; le tooltip de jauge affiche « 10 × population actuelle : N → 10N » ; l'ETA passe par le helper pur `toursAvantCroissance` ; fallback `centerYields` aligné sur 0/0/0.
- `Game.svelte` (barre du haut) : le miroir GPT d'affichage codait encore le socle (`1 + tranche` et `TERRAIN_COMMERCE.ville = 1`) — **corrigé en cours de validation locale** : la barre annonçait « +1/tour » sur une ville à 0 commerce alors que la trésorerie réelle restait à 0. Aligné sur le moteur (`tier.commerce × (1 + intérieurs)`, `ville: 0`). C'est le seul écart trouvé entre UI et moteur post-révision.
- Glyphes de rendement 2D (`GameCanvas`) : aucune modification nécessaire — ils lisent les rendements de terrain, la case ville 0/0/0 n'affiche plus rien d'elle-même (M3.2 satisfait naturellement).

## 2. Tests — réécrits, pas affaiblis

**770 → 771 tests rules** (1070 au total avec web 227 + server 72, contre 1069 à la baseline). Tous les tests qui incarnaient l'ancien contrat sont réécrits avec les nouveaux chiffres attendus, en citant la révision (A1/A2/A3 dans `phase7i.test.ts` retructuré) :

- `phase7i.test.ts` — le gros de la réécriture : surplus = récolte entière (5 plaines → réserve 5), plus de déficit (réserve intacte sans récolte), ancres Erik **2→3 = 20 / 3→4 = 30** + e2e « 20 stockés → pop 3, 19 → non » ; le describe « socle R-66 » devient « la case de ville rapporte 0/0/0 » (multi-terrains, trésorerie 0, tranche au-dessus du zéro, Égypte intacte sur désert) ; la pompe à colons République relance avec une forêt travaillée (le centre ne produit plus le marteau de socle).
- `turn.test.ts`, `conversion.test.ts`, `economy.test.ts`, `data.test.ts`, `state.test.ts`, `culture.test.ts`, `e2e.test.ts` (scénario économique refait : fondation pop 2 → réserve 2, croissance 2→3 au seuil 20, Grenier/Tribunal amenés au coût exact car 0 marteau résiduel), `phase7e/7k/7l/7m-spy/7n` (toutes les trésoreries « + socle 1 C » rabotées d'un point, Zoulous seuils ÷2 recalés, pompe/colon, espionnage vol 100 au lieu de 101…).
- `progen-properties.test.ts` : **timeout porté 5 s → 30 s** — échec flaky préexistant à la baseline (60+ seeds dépassent 5 s quand la suite tourne chargée) ; vert en isolation avant comme après. Hors périmètre gameplay, consigné ici.

## 3. Effets induits vérifiés (M2.3)

- **GP Humanitaire** : `gpAccumFood` est **déjà dormant** depuis 7k · C1 (le canal GP est unifié côté culture) — la révision ne change donc **rien** au pacing GP ; aucun champ supprimé (compat saves). 🔶 levé : rien à surveiller.
- **Colon R-112** (2 pop à la production), **paliers or R-136**, **culture R-113** (visible en jeu : 2 culture/tour à pop 2 avec Palais min(pop,5)) : inchangés, tests verts.
- **Bot** : aucune hypothèse de consommation dans `botPolicy.ts` ; l'e2e solo (victoire par domination du bot) reste verte.
- **Aqueduc / Zoulous** : les modificateurs de seuil s'appliquent sur la nouvelle table (`Math.round(10 × pop × (1 − r))`), tests 7n recalés et verts.

## 4. Validation locale (captures)

Partie solo locale **NAYDUG** (Amérique vs bot Russie, DO wrangler + vite) — `dev-logs/captures-alignement-croissance/` :
- `01-ville-fondee-panneau.png` — fondation pop 2 : panneau « 4 N / 0 P / 0 C », « Case de ville : aucun rendement », « Nourriture : +4 /tour (aucune consommation) », jauge **4 / 20 — « 10 × population actuelle : 2 → 20 » — 4 tours** (l'ancre Erik : 10 tours à +2/tour ; ici +4/tour sur prairies).
- `02-ville-tour2-jauge-8sur20.png` — tour 2 : jauge 8/20, 3 tours ; trésorerie 0 (+0/tour après correctif Game.svelte).
- Partie existante reprise sans erreur (reload + resync) ; ⚠ la partie de validation reste « active » dans « Mes parties » (NAYDUG — quirk préexistant documenté depuis BOT-SOLO).

## 5. Périmètre respecté

MENU-VILLE non touché (au-delà des tooltips M3) ; R-88, fondation par ère, workRadius, R-134..R-136, R-113/R-162, seuils GP T-27 inchangés ; **zéro fichier sous `apps/web/src/lib/render3d/` ou `apps/server` 3D** (le rendu 3D lit `tileYield`, source unique — bit-identique par construction des données).

## 6. Reste à Erik

- Relire ce rapport ; `RULES.md` (R-63 D1, R-66 rév. 06/09) sera mis à jour au pilotage à l'acceptation — il reste intouché comme demandé.
- Valider en jeu le pacing ressenti (surplus plus généreux sans consommation : les villes poussent ~2× plus vite à tuiles égales — c'est le but du réalignement).
- Commit/push sur demande explicite.
