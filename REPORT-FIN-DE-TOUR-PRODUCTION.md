# REPORT-FIN-DE-TOUR-PRODUCTION

**Chantier : impossible de terminer le tour sans production ni recherche sélectionnée (points résiduels compris) — spécification d'Erik du 18/09 + modification en séance.**

## 1. Livré

### M1 — Moteur (packages/rules)
- **Nouveau module `finDeTour.ts`** : prédicat pur `blocagesFinDeTour(state, playerId, orders)` —
  - ville avec production/tour > 0 **ou** réserve C7 (`pendingSalvage`) > 0 **et** sans production sélectionnée → blocage (libellé « VilleX : sélectionnez une production (N marteaux/tour | N marteaux en réserve) ») ;
  - joueur avec science/tour > 0 **ou** résiduel `scienceStored` > 0 sans recherche sélectionnée → blocage (« Recherche : sélectionnez une technologie (+N points en attente) ») ;
  - **exceptions** : ville à 0 marteau sans réserve (jamais bloquée), arbre de recherche épuisé (`arbreRechercheEpuise` — plus rien de disponible → blocage recherche levé) ;
  - **paramètre `orders`** (ajout crucial en cours d'implémentation) : `SetProduction`/`SetWorkedTile` sont des **brouillons** appliqués seulement à la résolution — un `SetProduction` en file débloque déjà sa ville (miroir de l'aperçu UI). Sans ce paramètre, un joueur ayant sélectionné sa production serait resté bloqué jusqu'à la résolution.
  - `libelleBlocageFinDeTour` / `formatBlocagesFinDeTour` : libellés pédagogiques partagés UI + rejet serveur (même texte).
- **Refactorisation `cityEconomyInputs` (turn.ts)** : signature `(st, city, allTechs)` (au lieu de `board`), et **nouvelle sortie `science`** — la science FINALE créditée par ville (conversion R-90 × Settle Savant + Temples R-149 + bonus empire), **bit à bit** ce que la Phase C verse à `creditScience`. La Phase C lit désormais `inputs.science`/`inputs.rawGold` (source unique — aucun double calcul, suite verte inchangée : zéro écart de comportement).
- **Validation serveur (apps/server/src/game.ts)** : `handleEndTurn` rejette le verrouillage avec `formatBlocagesFinDeTour(...)` si le prédicat n'est pas vide (brouillons du joueur compris). Le joueur n'est PAS verrouillé et peut encore passer des ordres.

### Modification d'Erik en séance — R-134 CONFIRMÉE
> « Le surplus de recherche est bien converti en or. Un tour peut toutefois bien se terminer avec des points de recherche non utilisés, lorsque le joueur découvre une hutte dont le bonus est les points de recherche. »

Conséquences (écart au handoff initial M1.2/M1.4) :
- **R-134 (surplus de complétion → or 1:1) est MAINTENUE** — la révision « conversion supprimée au profit du résiduel » est abandonnée ;
- le **résiduel de fin de tour est le champ existant `scienceStored`** (réserve R-85 — hutte recherche sans sélection, science produite sans choix) ;
- **PAS de migration `schemaVersion` 25 → 26** : aucun champ nouveau (le champ `rechercheResiduelle` prévu au handoff devient inutile). `schemaVersion` reste **25** ; les tests de migration existants (v4→v25) passent inchangés.

### Bot
`botPolicy` était déjà conforme (recherche dès qu'aucune tech en cours, `SetProduction` pour chaque ville sans file) — ajout d'un **test de conformité** : après application des actions immédiates du plan et avec ses brouillons, `blocagesFinDeTour` est vide (aucun blocage laissé par le bot, résiduel de hutte compris).

### M2 — UI (apps/web)
- Bouton **« Fin de tour »** : désactivé quand `blocagesFinDeTour` n'est pas vide, libellé **« Fin de tour bloquée (N) »**, tooltip = liste des libellés ; garde dans `requestEndTurn` (toasts) en miroir du serveur.
- **Vue ville (CityView)** : avertissement « ⚠ Fin de tour bloquée — sélectionnez une production (N marteaux/tour | N en réserve C7) » sur la ville bloquée.
- **ResearchPanel** : « ⚠ Fin de tour bloquée — choisissez une recherche : N point(s) en attente ».
- Tona habituel, aucune régression 3D (aucun fichier rendu touché).

### M3 — Vérification
- **Tests** : packages/rules 864 ✅ (+13 : prédicat, exceptions, brouillon, libellés, R-134 confirmée), apps/server 81 ✅ (+3 : refus EndTurn bout en bout avec villes fondées, pas de régression partie fraîche, bot conforme), apps/web 308 ✅ — **1 253 tests, typecheck 4/4**.
- **e2e solo avec captures** (`dev-logs/driver-fin-de-tour.mjs` → `dev-logs/captures-fin-de-tour/`) :
  - `01-fin-de-tour-bloquee-bouton.png` — bouton désactivé « Fin de tour bloquée (1) » + tooltip « Ville1 : sélectionnez une production (1 marteaux/tour) » ;
  - `02-vue-ville-avertissement-production.png` — avertissement dans la vue ville ;
  - `03-fin-de-tour-libre-apres-selection.png` — sélection Guerrier DEPUIS LE NAVIGATEUR → bouton débloqué ;
  - `04-fin-de-tour-acceptee-resolution.png` — recherche sélectionnée, EndTurn accepté, résolution normale ;
  - constat serveur : refus « fin de tour bloquée — Ville1 : sélectionnez une production (1 marteaux/tour) » vérifié avant déblocage.
- **Cas hutte recherche** (+20 science sans sélection) : couvert par tests moteur (blocage + libellé « +20 points en attente ») et test bot ; la capture e2e du cas hutte n'est pas rejouée (bonus de hutte non forçable sur carte procédurale sans graine dédiée) 🔶.
- Transitoire : un échec isolé de test serveur au premier `pnpm test` sous charge parallèle (turbo), vert aux deux runs suivants — à surveiller, pas reproductible.

## 2. Notes d'implémentation
- **Recherche sélectionnée mais arbre vide ensuite** : le blocage porte sur le PRÉ-résolution uniquement ; une tech complétée pendant la résolution laisse `researching = null` au tour suivant → le joueur devra re-sélectionner (comportement voulu).
- La science/tour du prédicat lit les `workedTiles` persistés (les brouillons `SetWorkedTile` du tour ne sont PAS projetés dans le calcul de production/science — seul le brouillon `SetProduction` débloque la ville). Simplification assumée 🔶 : la désassignation totale des cases productives sans changer de projet est un cas marginal.
- Libellé du rejet serveur et tooltip UI : **même fonction** (`formatBlocagesFinDeTour`), zéro duplication.

## 3. Périmètre respecté
Pas de toucher au calibrage, aux files, à la résolution Phase C (le blocage est pré-résolution), au 3D, ni à `assets-src`.

## 4. État
- `git status` : modifications non commitées — **commit/push sur demande explicite d'Erik** (règle établie).
- RULES.md : **R-184** ajoutée (blocages de fin de tour, R-134 confirmée, pas de migration).
- Handoff consommé : `HANDOFF-FIN-DE-TOUR-PRODUCTION.md` (M1/M2/M3 complets, aux modifications d'Erik près consignées ci-dessus).
