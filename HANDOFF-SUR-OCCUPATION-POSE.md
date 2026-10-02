# HANDOFF-SUR-OCCUPATION-POSE — Pose d'unité produite sur case de ville occupée : sur-occupation temporaire régularisée le tour suivant

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-30 anti-empilement, R-112 coût pop du colon, R-60/R-66 worked tiles, R-159 placement post-mêlée — le précédent de cohabitation amie temporaire), `HANDOFF.md` §4, et le code : `produceUnitFromReserve` (turn.ts ~2061) + la complétion de production Phase C (~3965-3980). **2D uniquement.** Décisions d'Erik déjà prises (02/10) — ne pas les rouvrir. Diagnostiqué avant le handoff : les colons « 20/20 bloqués » d'Erik étaient la pose refusée (case de ville occupée → progression plafonnée au coût, silencieux).

## 1. Objectif (verdict Erik : « permettre l'occupation multiple en déséquilibre, régularisée le tour suivant »)

Quand une unité produite est prête mais que **la case de la ville est occupée par une unité amie**, l'unité produite **apparaît quand même sur la case de ville** (cohabitation amie temporaire, à la manière des survivantes de mêlée), au lieu d'être bloquée indéfiniment. Si le joueur ne sépare pas les deux pendant son tour, **la résolution suivante déplace automatiquement la nouvelle arrivante** vers une case adjacente libre.

## 2. Décisions tranchées (réponses Erik du 02/10 — à appliquer telles quelles)

- **D1 — Pose sur case occupée autorisée (production uniquement)** : `produceUnitFromReserve` en mode standard (complétion normale ET série C7) pose l'unité sur la case de ville même occupée par une unité amie. Marquage de l'arrivante : un flag transitoire (ex. `arrivanteSurCase: true` ou équivalent — à l'agent) permet de savoir QUI est « le nouveau » pour la régularisation (le flag est consommé à la régularisation ou au premier déplacement de l'unité).
- **D2 — Périmètre : pose en ville SEULEMENT.** Les barbares (pile dédiée R-96), les spawns futurs et les autres situations ne changent pas.
- **D3 — Régularisation à la résolution suivante** : au début de la Phase C (ou phase dédiée, au jugement de l'agent — la même fenêtre que la mécanique existante de régularisation des cohabitations), pour chaque ville dont la case porte **2+ unités amies** dont au moins une marquée arrivante : **déplacement automatique de l'arrivante la plus récente** vers une case adjacente libre (ordre déterministe R-81 sur les cases adjacentes libres ; si AUCUNE case adjacente libre : la pile PERSISTE et on réessaie à la résolution suivante — jamais de destruction, jamais de blocage).
- **D4 — Si le joueur bouge l'une des deux pendant son tour** : la régularisation ne fait rien (il n'y a plus de sur-occupation) — le flag arrivante est simplement nettoyé si l'arrivante a bougé.
- **D5 — Pop/coûts inchangés** : le coût pop R-112 est débité à la pose (comme aujourd'hui), workedTiles tronqués si pop baisse (existant), la progression est consommée normalement — plus jamais de plafonnement silencieux à 20/20 pour cause de case occupée. (Le plafonnement existe-t-il encore ailleurs ? case de ville occupée par une unité ENNEMIE → pose impossible reste tel quel — une ville occupée par l'ennemi est de toute façon capturée ; à vérifier et consigner.)
- **D6 — Événement et journal** : le déplacement automatique de régularisation émet un événement (type `Move` d'auto-déplacement ou dédié — au choix, mais visible au journal et relecture REPLAY-RESOLUTION), filtré fog comme les autres.
- **D7 — Migration** : si le flag est un champ d'état → `schemaVersion` +1 additif idempotent (parties existantes reprises) ; si dérivable sans état (ex. ordre d'arrivée dans `spawnedUnits` ou déduction des événements), préférer sans migration. Au choix de l'agent, justifié au rapport.

## 3. Mission

### L0 — Préalables
- Baseline : suites vertes. Étudie `produceUnitFromReserve`, la complétion Phase C, et la mécanique de placement post-mêlée R-159 (précédent de cohabitation amie).

### L1 — Moteur (test-first)
- D1 (pose sur occupée amie, flag), D3 (régularisation auto arrivante la plus récente, cas sans adjacente libre = persistance), D4 (mouvement manuel nettoie), D5 (pop/coût, plus de plafonnement 20/20 pour case occupée — le scénario exact d'Erik devient un test : ville pop 7, unité sur la case, colon 20/20 → la résolution suivante le pose/régularise), D5bis (case occupée ENNEMIE : verdict consigné), D6 (événement + fog).
- Tests existants adaptés sans affaiblissement (R-30 : l'exception devient encadrée ; pile barbare inchangée).

### L2 — UI
- Aucun travail attendu côté rendu (la pose/régularisation passe par les événements existants) ; vérifier : PLACEMENT-MELEE (la pile temporaire sur la case ville s'affiche comme une mêlée ? côté placement — 🔶 à l'œil), barre d'attente production (le colon sort → toast/glyphe existants), relecture.
- Si un état bloqué « en attente » peut encore exister (ex. pop insuffisante R-112), le signal UX reste le 🔶 de HANG-LOCAL — hors périmètre sauf trivial.

### L3 — Vérification
- Suites complètes ×2 ; e2e solo reproduisant exactement le scénario d'Erik : ville pop 7, guerrier sur la case de ville, file avec colon → la résolution suivante le pose en sur-occupation, puis régularisation auto si rien ne bouge ; cases sans adjacente libre = persistance propre.
- **Captures `dev-logs/captures-sur-occupation/`** avant tout commit : colon posé sur ville occupée, régularisation auto, cas persistant sans adjacente.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Captures + le parcours d'Erik rejoué. NE COMMITTER QU'APRÈS FEU VERT (migration 27→28 éventuelle partira en prod — le dire).

### L5 — Rapport
- `REPORT-SUR-OCCUPATION-POSE.md` : mécanisme (flag ou dérivation), migration éventuelle, tests, RULES.md à réaligner (le pilot s'en charge — R-30 amendée), 🔶, ce qu'Erik valide en ligne.

## 4. Critères d'acceptation
1. Le scénario exact d'Erik ne bloque plus : colon produit malgré l'unité sur la case de ville ; régularisation auto de l'arrivante à la résolution suivante si rien ne bouge ; cas sans adjacente = persistance propre et réessaie.
2. Barbares, mêlées, R-30 hors exception : inchangés (tests non affaiblis) ; événements visibles au journal et en relecture.
3. Suites vertes ; migration additive idempotente si nécessaire ; zéro changement protocole au-delà de l'état/événement.

## 5. Périmètre interdit
- Toute autre situation d'empilement ; les barbares ; la mêlée R-180 ; le placement post-mêlée R-159 (sauf compat vérifiée) ; l'UX des blocages R-112 (pop) ; 3D ; la sableuse.
