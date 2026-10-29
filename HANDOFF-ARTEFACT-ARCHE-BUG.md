# HANDOFF-ARTEFACT-ARCHE-BUG — Activer les artefacts pour toute unité posée dessus

**Signalement Erik 03/10** : « une unité sur la case Arche d'Alliance depuis 2 tours, rien ne se passe » ; Sept Cités d'Or, elle, active et journalise normalement. Attente d'Erik : **dès qu'une de mes unités est sur la case d'un artefact, le bonus s'applique.**

## 1. Préalables

- Lire RULES.md R-151..R-156 (artefacts) et `packages/rules/src/artefacts.ts` (`activateArtefactAt` ~381, `applyActivation` ~423 — l'effet Arche existe et est correct : Temples gratuits/Cathédrales).
- Baseline : suites vertes (rules 969 + web 495 + server 120), `schemaVersion` 27. Vérifier `git status` (sessions parallèles d'assets possibles).

## 2. Diagnostic du pilot (à confirmer par reproduction)

`activateArtefactAt` n'est appelé qu'aux **pas de mouvement** (4 sites de `turn.ts` ~1383/1392/1480/1550, miroir `openHutAt`). Toute pose d'unité SANS pas de mouvement échappe donc à l'activation :
- **débarquement / dépose programmée** (`tenterDepose`, EMBARQUEMENT-PROGRAMME — suspect n°1 : les artefacts sont en îlots, Erik y accède par bateau) ;
- **régularisation des arrivantes** (`regulariserArrivantes`, SUR-OCCUPATION-POSE) ;
- débarquement historique premier-pas-terrestre (R-117, à vérifier — la branche embarquée de `executeMoveOrder` court AVANT les sites d'appel ?) ;
- repli R-54, rally FormArmy, tout autre déplacement synthétique.

## 3. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Filet principal : balayage de début de résolution** : en tête de Phase A (avant les mouvements), TOUTE unité non-barbare debout sur la case d'un artefact l'active (l'unité est l'activatrice — événements, fog et journal identiques à une activation au pas). Idempotent par nature (l'artefact est retiré à l'activation). Couvre tous les cas passés, présents et futurs, y compris ceux qu'on n'a pas listés — et correspond exactement à l'attente d'Erik.
- **D2 — Câblage des poses non-step** : appeler aussi `activateArtefactAt` (miroir de la discipline `openHutAt`) à la dépose (`tenterDepose`) et à la régularisation des arrivantes, pour que l'événement/journal porte le bon tour et la bonne unité (le balayage D1 reste en redondance de sécurité).
- **D3 — Barbares exclus** (R-95 inchangée), Atlantide navale adjacente inchangée.

## 4. Mission

- **L1 — test-first** : `artefact-activation.test.ts` : (1) dépose programmée sur l'Arche → activation au tour de la dépose (églises : Temple gratuit dans les villes sans Temple, Temples → Cathédrales, événements `BuildingCompleted` + `ArtifactActivated` au journal) ; (2) unité posée par régularisation arrivante sur un artefact → activation ; (3) balayage D1 : fixture d'une unité DEBOUT sur un artefact sans y être entrée par pas → activation au tour suivant ; (4) barbare debout dessus → jamais ; (5) Sept Cités et Angkor non régressés ; (6) activation unique (deux unités dessus, une seule activation, la première au tri R-81).
- **L2** : D1 + D2 (moteur seul — client, protocole et UI déjà alimentés par les événements, Sept Cités le prouve en jeu).
- **L3 — e2e solo légal** reproduisant le scénario d'Erik (galère → dépose sur l'îlot de l'Arche) vérifié au dump serveur + captures `dev-logs/captures-artefact-arche/`.
- **L4** : suites vertes, RULES.md R-153 amendée (une ligne : « l'activation vaut pour toute POSE sur la case — dépose, régularisation, balayage de début de tour — pas seulement les pas de mouvement »), commit, push, rapport `REPORT-ARTEFACT-ARCHE-BUG.md`.

## 5. Critères d'acceptation

- Le scénario d'Erik marche : unité débarquée sur l'Arche → Temples/Cathédrales dans ses villes + entrée dans l'Historique au tour de l'arrivée ;
- Toute pose future (dépose, régularisation) active ; un résidu ancien (unité déjà dessus) est rattrapé au tour suivant par le balayage.

## 6. Périmètre interdit

Effets des artefacts (tous intouchés), tirage/placement, huttes et villages (R-96/R-98), Angkor/`ChooseWonder`, brouillard, `schemaVersion`, protocole.

## 7. Fin de session

Rapport (cause racine confirmée, défauts 🔶, liste « à vérifier en ligne par Erik » — sa partie en cours : la partie d'Erik où l'unité est dessus sera rattrapée par le balayage à la prochaine résolution), arrêt, remise de la main.
