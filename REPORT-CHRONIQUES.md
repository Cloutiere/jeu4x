# REPORT-CHRONIQUES — Journal joueur unifié (tranche 1)

Mission exécutée d'après HANDOFF-CHRONIQUES.md (décisions Erik D1-D8, 03/10).
Client seul — moteur, serveur, protocole, fog, REPLAY-RESOLUTION et schemaVersion 27 intouchés.

## Livré

- **`apps/web/src/lib/chronique.ts`** — mapping data-driven UNIQUE événements → Chronique
  (`entreesChronique`, pur et testé) + store persistant par partie
  (`chargerChronique/pousserEntrees/pousserInfo/resetChronique`, localStorage `chronique:<code>`,
  plafond FIFO 500 — D7). Les ids d'entrées sont dérivés du **seq moteur** et le pousser
  dédoublonne : le rechargement de page rejoue les `missedEvents` sans dupliquer la Chronique.
- **`apps/web/src/components/Chroniques.svelte`** — panneau de la colonne droite : 7 chips de
  filtres à icônes avec compteurs (D2), sections par tour repliables ouvertes par défaut (D7),
  clic = ouverture du rapport (combat, D5) ou recentrage zoom préservé (case connue ET visible
  seulement, D3), habillage AAA or-sur-sombre (D8).
- **`apps/web/src/pages/Game.svelte`** — `Historique` + `Journal` remplacés par `Chroniques` ;
  alimentation par le mapping sur les événements frais (même garde `lastReplayedSeq` que le
  playback — chaque événement une fois) ; les toasts UTILES hors événements (refus d'ordre,
  avertissements du conseiller, réseau) alimentent aussi la Chronique via `pousserInfo` (D1) ;
  bouton **☰ Paramètres** dans la barre + modale hébergeant le journal de débogue (`Journal.svelte`
  migré TEL QUEL, coordonnées et ligne ⚔ conservées — D6) ; hook dev `__chroniques.inject`
  (miroir `__rapport.inject`, dev uniquement, jamais en prod) pour les vérifications GUI.
- **Supprimés** : `Historique.svelte`, `eventHistory.ts`, `tests/event-history.test.ts` (remplacés).
- **`apps/web/tests/chronique.test.ts`** — 13 tests (L1 test-first) : exclusions §3, table des
  catégories D2, zéro coordonnée D3 (regex négative), rumeur artefact adverse sans lieu D4,
  merveille adverse masquée à la nation D4, agrégation des combats D5 (1 attaque + n échanges +
  destruction = 1 entrée ; 2 cases = 2 entrées), persistance/rechargement D7, plafond 500 D7,
  régression « missedEvents rejoués = mêmes ids, zéro doublon ».
- **`devtmp/chroniques-e2e.mjs`** — e2e GUI complet (partie solo RÉELLE 22 tours joués par WS :
  production, recherche, conversions, attaques à l'adjacence ; puis vérifications navigateur).

## Table de mapping finale (§3)

| Catégorie | Types |
|---|---|
| Exclus (bruit) | `Move`, `TurnResolved`, `CombatExchange` (agrégé D5), `PopulationGrew` |
| ⚔ Combats | `Attack`/`UnitDestroyed`(causes combat)/`Retreat`/`Captured`/`MeleeResolved` (agrégés : UNE entrée par case), `CityCaptured`, `VillageDestroyed`, `VillageLooted`, `NukeLaunched` (détonée/interceptée/bloquée), `CityNuked` |
| 🏛 Empire (miennes) | `CityFounded`, `UnitProduced`, `BuildingCompleted`, `RushBuy`, `HammerSalvage`, `Embark`, `Disembark`, `ArrivanteRegularisee`, `UnitsUpgraded`, `ArmyFormed`, `PopulationConsumed` |
| 🔬 Découvertes | `TechResearched` (mienne + « X découvre Y »), `FirstDiscovered`, `EraChanged`, `GreatPersonSpawned/Consumed/Stolen/Kidnapped`, `InstallPerson`, `CultureMilestone` (miennes), `EconomyMilestone` (mienne ; worldBank adverse signalée), `Launch` 🔶 |
| 👑 Merveilles | `WonderCompleted` (toutes nations — adverse : nation seule, sans lieu, non cliquable D4) |
| 🗿 Artefacts | `ArtifactActivated` (mien : effet + « près de VilleN » cliquable ; autre : rumeur « Les X ont trouvé une relique… » SANS lieu D4) |
| 💥 Menaces | `BarbarianSpawned`, `CityRazed` 🔶, `SpyMission`, `SpyAction`, `SpyDuel` 🔶, `GoldStolen`, `SpyBuildingDestroyed` 🔶, `ResourceDestroyed` (mienne), `UnitExpelled`/`UnitDispersed` (miennes) ; **double entrée** Menaces quand ma ville est prise ou nukée (§3) |
| 🕊 Monde | `PlayerDefeated`, `GovernmentChanged`, `DiplomaticIncident`, `Victory`, `HutOpened`/`BootyGold` (miens) ; toasts utiles (refus d'ordre, conseiller) en entrées Monde 🔶 |

🔶 tranchages de l'agent (à calibrer à l'œil par Erik) : `Launch` en Découvertes ;
`CityRazed`/`SpyDuel`/`SpyBuildingDestroyed` en Menaces ; `VillageLooted` en Combats (récompense
visible) ; accord grammatical peuple/nation (« Les Zoulous ont… » vs nom de joueur au singulier)
via table `PEUPLES` (16 civs) ; localisation « près de VilleN » = ville connue (mienne ou visible)
la plus proche dans un rayon de 4, sinon pas de lieu ; entrée horodatée au tour d'ARRIVÉE des
événements côté client (les événements rejoués d'un Snapshot ressortent au tour courant) ;
libellés des unités résolus via le pré-état (les détruites restent nommées), id brut si inconnu.

## Vérifications

- Suites : **web 506** (495 + 13 chronique − 2 event-history), **rules 975**, **server 120** — toutes
  vertes ; **svelte-check 0 erreur** (16 warnings préexistants).
- e2e GUI (`devtmp/chroniques-e2e.mjs`, partie solo réelle `3JPPY3` + injections forgées) :
  D3 zéro coordonnée, D2 filtres actifs, D4 nation adverse + rumeur sans lieu, D5 clic combat →
  popover RAPPORT-ENGAGEMENT (« Rejouer ce combat »), D7 Chronique conservée au rechargement,
  D6 journal de débogue dans Paramètres. Captures `dev-logs/captures-chroniques/` (6).

## À vérifier en ligne par Erik

1. Densité/libellés des entrées à l'œil (🔶 listés ci-dessus) — notamment « près de VilleN »
   (rayon 4) et l'horodatage de tour des événements rejoués (Snapshot/reconnexion).
2. Gestes : filtres, repli de sections par tour, clic combat → rapport, clicrecentrage,
   rechargement de page, Paramètres (☰) → journal de débogue.
3. Le volume : plafond 500 FIFO — sentir si c'est trop peu sur une longue partie.

## Notes / incidents

- Piège connu rejoué : watcher Vite mort (modules servis périmés) — tué/relancé en cours de mission.
- Deux bugs trouvés par l'e2e et corrigés : ids d'entrées stables par seq + dédoublonnage
  (le rechargement dupliquait la Chronique → crash `each_key_duplicate`) ; branches nation
  sans `else` (double entrée par événement TechResearched/WonderCompleted/ArtifactActivated…).
- La partie solo réelle ne produit des entrées que lentement (production ~1 marteau/tour,
  recherche bloquée sans SetConversion science — R-90 défaut Or, cf. OR-RUSHBUY) : les catégories
  combat/merveille/artefact sont validées par injection forgée (hook dev, même pipeline que les
  tours réels) + tests unitaires ; à confirmer sur une vraie partie longue.
