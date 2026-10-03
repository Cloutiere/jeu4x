# HANDOFF-CHRONIQUES — Journal joueur unifié (tranche 1)

**Décisions Erik 03/10 (cadrage avec le pilot, votées).** Remplacer les DEUX journaux actuels par UNE « **Chroniques** » — unifier, épurer (zéro coordonnée), couvrir les 53 types d'événements du moteur, ajouter ce qui manque (merveilles/artefacts d'autrui, combats liés aux rapports). Le chat visuel (tranche 2) prendra la place libérée — PAS dans ce handoff.

---

## 1. Préalables

- État : `Historique.svelte` (toasts capturés client, FIFO 150, perdus au rechargement — `eventHistory.ts`) et `Journal.svelte` (événements bruts du dernier tour, coordonnées, centrage REPLAY), montés dans la colonne droite de `Game.svelte` (~1277/1295). Événements : `packages/rules/src/events.ts` (53 types). Rapport de combat : popover RAPPORT-ENGAGEMENT (clic case, `rapport.ts`) avec « Rejouer ce combat ». Filtrage fog : les événements déjà filtrés par le serveur.
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions Erik (votées — non négociables)

- **D1 — Un seul journal joueur, « Chroniques »**, alimenté par les événements du serveur (flux déjà consommé par le playback) ET la capture des toasts utiles (refus d'ordre, avertissements du conseiller → entrées « info »).
- **D2 — Catégories à icônes filtrables** : ⚔ Combats / 🏛 Empire / 🔬 Découvertes / 👑 Merveilles / 🗿 Artefacts / 💥 Menaces / 🕊 Monde.
- **D3 — ZÉRO coordonnée** : localisation par noms (« près de VilleN », « ton Guerrier », « Les Zoulous »). Clic = recentrage UNIQUEMENT si la cible est connue/visible, sinon entrée non cliquable.
- **D4 — Fog** : rien sur les événements ennemis non filtrés ; merveilles = publiques ; **artefacts d'autrui = rumeur SANS position** (« Les Espagnols ont trouvé une relique »).
- **D5 — Combats** : UNE entrée par combat (pas par échange) avec issue et pertes, cliquable → ouvre le rapport RAPPORT-ENGAGEMENT correspondant (et « Rejouer » pour ceux du dernier tour).
- **D6 — Journal de débogue** : le `Journal.svelte` actuel migre TEL QUEL dans le menu Paramètres (coordonnées et centrage conservés) — retouche d'accès seulement.
- **D7 — Rétention** : groupé par tour (sections repliables, tour courant ouvert), plafond 500 entrées FIFO. **Persistance locale** par partie (localStorage) — le rechargement ne vide plus la Chronique.
- **D8 — Style** : tokens or-sur-sombre AAA en vigueur (UI-JEU-T2), colonne droite inchangée par ailleurs.

## 3. Cartographie des événements (à implémenter data-driven — un fichier de mapping unique, ex. `chronique.ts`)

- **Exclus (bruit)** : `Move`, `TurnResolved`, `CombatExchange` (aggrégés par combat D5), `PopulationGrew` (visible en ville) ;
- ⚔ Combats : `Attack`, `MeleeResolved`, `Retreat`, `UnitDestroyed`, `CityCaptured`, `VillageDestroyed`, `CityNuked`/`NukeLaunched` ;
- 🏛 Empire (les miennes) : `CityFounded`, `UnitProduced`, `BuildingCompleted`, `RushBuy`, `HammerSalvage`, `Embark`/`Disembark`, `ArrivanteRegularisee`, `UnitsUpgraded`, `ArmyFormed`, `PopulationConsumed` ;
- 🔬 Découvertes : `TechResearched` (miennes + « X découvre Y » public), `FirstDiscovered`, `EraChanged`, `GreatPersonSpawned`/`Consumed`/`Stolen`/`Kidnapped`, `InstallPerson`, `CultureMilestone`, `EconomyMilestone` ;
- 👑 Merveilles : `WonderCompleted` (toutes nations, position de l'adversaire masquée — nom de la nation seulement) ;
- 🗿 Artefacts : `ArtifactActivated` (mien : effet + position connue ; autre : rumeur D4) ;
- 💥 Menaces : `BarbarianSpawned` (si près du territoire connu), attaques sur mes villes (déjà en ⚔ — doubler en Menaces si ville perdue), `SpyMission`/`SpyAction`/`GoldStolen`/`ResourceDestroyed`/`UnitExpelled`/`UnitDispersed` ;
- 🕊 Monde : `PlayerDefeated`, `GovernmentChanged`, `DiplomaticIncident`, `Victory`, `HutOpened`/`BootyGold` (miens) ;
- Toute ambiguïté de libellé : 🔶 défaut tranché par l'agent, listé au rapport (Erik calibre à l'œil).

## 4. Mission

- **L0** : lire les fichiers §1 + `feedback.ts` (source des toasts) + `labels.ts` ; dresser la table de mapping (ci-dessus) avec libellés FR sans coordonnées — réutiliser `labels.ts` et les noms de villes (`City.name`), nations et unités.
- **L1 — test-first (client)** : suite `chronique.test.ts` : mapping (chaque type → catégorie, exclusions), libellés sans aucun pattern de coordonnées (test négatif : regex /(q|r)[=:(]\s*-?\d/ absent), rumeur artefact sans position, merveilles adverses masquées, aggrégation combat, persistance/rechargement (store hydraté), plafond 500.
- **L2 — UI** : composant `Chroniques.svelte` remplace `Historique` + `Journal` dans la colonne droite ; chips de filtres par catégorie ; sections par tour repliables ; clic-recentrage conditionnel (reuse `onCentrerHex`) ; entrées combat → ouverture du rapport ; entrée Paramètres pour le journal de débogue (D6).
- **L3 — vérification GUI** : vraie partie solo légale couvrant plusieurs tours avec combats, production, techs, merveille, artefact si possible — captures `dev-logs/captures-chroniques/` AVANT commit ; vérifier rechargement de page (Chronique conservée) et filtres.
- **L4** : suites vertes (web + rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-CHRONIQUES.md` (table de mapping finale, 🔶 libellés, liste « à vérifier en ligne par Erik »).

## 5. Critères d'acceptation

- Une seule Chronique en colonne droite, 7 filtres, zéro coordonnée visible ;
- Un combat cliqué ouvre son rapport ; une merveille adverse apparaît à la nation près ; un artefact adverse apparaît en rumeur sans lieu ;
- Rechargement de page : la Chronique survit ;
- Le journal de débogue reste accessible depuis Paramètres avec ses coordonnées.

## 6. Périmètre interdit

Moteur/serveur/protocole/filtrage fog ; l'écran de chat (tranche 2 — persistance serveur cadrée à part, décision Erik : historique futur injectable au LLM Jev) ; `schemaVersion` ; REPLAY-RESOLUTION (le mécanisme de relecture reste inchangé, seule sa porte d'entrée journal change) ; tout le 3D.

## 7. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
