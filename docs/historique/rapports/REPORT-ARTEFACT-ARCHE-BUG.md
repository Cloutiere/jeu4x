# REPORT-ARTEFACT-ARCHE-BUG — Activer les artefacts pour toute unité posée dessus

**Commit** `cbd29ac` poussé sur `main` (03/10) — CI en cours, Deploy suit.

## Cause racine (confirmée)

`activateArtefactAt` (artefacts.ts, R-153) n'était appelée qu'aux **4 sites de pas de
mouvement** de `turn.ts` (miroir `openHutAt`). Toute pose d'unité **sans pas de
mouvement** échappait donc à l'activation :

- **dépose programmée** (`tenterDepose`, EMBARQUEMENT-PROGRAMME) — suspect n°1 confirmé :
  les artefacts sont en îlots, Erik y accède par bateau ;
- **régularisation des arrivantes** (`regulariserArrivantes`, SUR-OCCUPATION-POSE) ;
- tout autre déplacement synthétique (repli R-54, rally FormArmy…) ;
- **résidu ancien** : une unité déjà debout sur la case sans y être entrée ce tour-là.

L'effet Arche lui-même était correct (Temples gratuits / Temples → Cathédrales,
événements `BuildingCompleted` + `ArtifactActivated`).

## Correctif (D1 + D2 + D3 du handoff, appliqués)

- **D1 — balayage de tête de Phase A** : nouvelle fonction `balayerArtefacts(board)`
  (turn.ts ~685), appelée juste avant `applyFortifyOrders` : toute unité des
  civilisations **debout** (hors embarquée) sur la case d'un artefact l'active,
  ordre unitId croissant (R-81). Idempotent par nature (l'artefact est retiré à
  l'activation). Couvre tous les cas listés et non listés, et **rattrape la partie
  en cours d'Erik** à sa prochaine résolution.
- **D2 — câblage des poses non-step** (miroir de la discipline `openHutAt`) :
  `activateArtefactAt` appelée aussi dans `tenterDepose` (après `Disembark`) et dans
  `regulariserArrivantes` (après `ArrivanteRegularisee`) — l'événement porte le bon
  tour et la bonne unité ; le balayage D1 reste en redondance de sécurité.
- **D3** : barbares exclus (R-95, déjà filtré par `activateArtefactAt`) ;
  Atlantide navale adjacente inchangée (couverte par `activateArtefactAt` elle-même).

Périmètre interdit respecté : effets, tirage/placement, huttes/villages, Angkor,
fog, `schemaVersion` 27, protocole — intouchés. Moteur seul (client déjà alimenté
par les événements, Sept Cités le prouve en jeu).

## Tests (test-first)

`packages/rules/tests/artefact-activation.test.ts` — 6 cas, tous verts :

1. dépose programmée sur l'Arche (galère → îlot) → activation **au tour de la
   dépose** : `Disembark` + `ArtifactActivated` (byUnitId du guerrier) + Temple
   gratuit + `BuildingCompleted` ;
2. unité posée par régularisation d'arrivante sur un artefact (île isolée,
   seule case terrestre adjacente) → activation à la résolution suivante ;
3. balayage D1 : unité **déjà debout** sur un artefact sans y être entrée →
   activation au tour suivant (rattrapage) ;
4. barbare debout dessus → jamais d'activation (R-95) ;
5. Angkor Wat debout dessous → droit de merveille en attente
   (`pendingArtefactChoices`) — miroir du pas de mouvement ;
6. deux unités dessus → **une seule** activation, la première au tri unitId
   croissant (R-81).

Suites : **rules 975** (969 + 6) / **web 495** / **server 120** — vertes.

## RULES.md

R-153 amendée (addendum ARTEFACT-ARCHE) : l'activation vaut pour toute **POSE**
sur la case — dépose programmée, régularisation des arrivantes, balayage de début
de résolution — pas seulement les pas de mouvement.

## 🔶 Défauts / restes à l'œil ou à exécuter

- **e2e solo réel non exécuté** (tranché avec Erik 03/10 : commit sans e2e, le fix
  est prouvé par les tests moteur + suites). Le script
  `devtmp/artefact-arche-e2e.mjs` est prêt et a déjà passé la production du
  galion (chaîne Navigation ← écriture + mathématiques, conversion science R-90)
  et l'embarquement ; il bute encore sur des règles réelles en chaîne à armer
  dans le script : prérequis de tech, blocage fin de tour (production/recherche),
  pile amie bloquant la pose, **lac fermé d'une case** comme seule « côte » de la
  capitale (sélection de partie à durcir : eau de la capitale connectée à celle
  de l'Arche — le filtre est écrit, relancer). Captures attendues dans
  `dev-logs/captures-artefact-arche/`.

## À vérifier en ligne par Erik

- **La partie en cours** : l'unité déjà sur l'Arche activera l'effet à la
  **prochaine résolution** (balayage D1) — Temples/Cathédrales + entrée dans
  l'Historique.
- Une future dépose de bateau sur l'Arche active **au tour de la dépose**.
- Atlantis et les autres artefacts : comportement inchangé au pas de mouvement.
