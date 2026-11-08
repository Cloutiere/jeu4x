# HANDOFF-EMBARQUEMENT-BUG — Embarquement naval cassé : diagnostiquer, corriger, verrouiller

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` **R-117** (mouvement naval : embarquement = une unité terrestre dont le pas de mouvement cible un transport AMI à cargaison libre — coût 1 PM, événement `Embark`, transport en mer ou en ville portuaire ; chemin gelé repris au tour suivant ; débarquement inverse) et R-118 (soutien naval — hors périmètre), `HANDOFF.md` §4, `PROJET.md`. Signalement d'Erik (02/10) : **il ne peut pas embarquer d'unité sur les navires**. **Suspect principal du pilot** : PLACEMENT-MELEE (`3b41785`) a retravaillé la programmation des mouvements vers cases amies occupées — le cas particulier « occupant ami = transport à cargaison libre → embarquer » a pu être perdu côté client ou moteur. **2D uniquement.** Règle d'or : **diagnostiquer avant de corriger** (où ça casse ?), correctif minimal testé.

## 1. Objectif

Rendre l'embarquement fonctionnel (et vérifié) : un joueur doit pouvoir embarquer une unité terrestre sur un transport ami, en mer comme à quai, puis débarquer.

## 2. Mission

### L0 — Reproduction (e2e GUI + moteur)
- Partie solo locale (ou driver headless WS) : se donner une galère + une unité terrestre côtière (fixtures d'état local acceptés — outil de diagnostic). Tenter le geste exact d'Erik : programmer le déplacement de l'unité SUR la case du transport.
- Déterminer OÙ ça casse, en séparant les couches :
  - **Client/interaction** : le clic-programmation sur la case du navire est-il refusé/ignoré (pathTo, contrôles ARRIVEE-ENNEMIE/disputes/PLACEMENT-MELEE) ? Le fantôme/flèche apparaît-il ?
  - **Validateur** : `orderShapeError`/erreurs d'ordre au submit ?
  - **Moteur** : l'ordre part-il et la résolution produit-elle `Embark` ? (`resolveTurn` Node pur sur l'état capturé — le moteur est pur, sépare tout soupçon wrangler).
  - **Cas quai vs mer** : les deux chemins (transport dans une ville portuaire / en mer côtière) testés séparément.
- Consigner le mécanisme précis (fichier:ligne) dans le rapport. Si tout fonctionne dans ton repro : le rapport le dit honnêtement avec les conditions EXACTES qui échouent chez Erik (capacité de cargaison ? type de navire ? position ?) — vérifier chaque condition de R-117 une par une (cargaison pleine ? navire non-transport ? unité non terrestre ? PM insuffisant ?) avant de conclure « non reproduit ».

### L1 — Correctif selon le verdict
- **Si client** (programmation refusée) : rouvrir le cas transport dans les contrôles de programmation (le clic sur un transport ami à cargaison libre par une unité terrestre adjacente-programmable doit produire un ordre de mouvement aboutissant à l'embarquement) — en préservant PLACEMENT-MELEE pour les VRAIES cohabitations terrestres ;
- **Si moteur** (embarquement ignoré à la résolution) : rétablir le cas particulier R-117 dans le traitement des pas de mouvement (ordre des vérifications : transport ami à cargaison libre AVANT le traitement cohabitation/arrivée occupée) — test-first avec la seed/état reproduit ;
- **Si validateur** : étendre `orderShapeError` proprement ;
- Correctif minimal : aucune autre retouche de PLACEMENT-MELEE, mêlée, fog.

### L2 — Verrouillage (le transport mérite sa non-régression)
- Tests moteur : embarquement en mer, embarquement à quai, débarquement, cargaison pleine (refus propre), chemin gelé repris au tour suivant, événement `Embark`/`Disembark` + filtrage fog ;
- Test transversal **post-PLACEMENT-MELEE** : mouvement vers case amie terrestre occupée = cohabitation (côtés/centre), mouvement vers transport = embarquement — les deux coexistent sans conflit ;
- E2e GUI : le geste complet d'Erik joué au clavier/souris.

### L3 — Vérification
- Suites complètes vertes ×2 ; e2e solo : embarquer → naviguer (transport + passager, combat naval possible) → débarquer ; non-régressions : mêlée, PLACEMENT-MELEE, relecture (les `Embark` existent déjà au playback), RAPPORT-ENGAGEMENT.
- **Captures `dev-logs/captures-embarquement/`** avant tout commit : programmation vers le navire, embarqué (passager), navigation, débarquement.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter : mécanisme de la panne, correctif, captures. NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-EMBARQUEMENT.md` : reproduction, couche fautive, correctif, tests de non-régression, ce qu'Erik valide en ligne, 🔶 (capacités de cargaison par navire — valeurs canon si à revoir, d'après doc CivRev).

## 3. Critères d'acceptation
1. Embarquement fonctionnel (mer ET quai), débarquement inclus, geste = mouvement sur la case du transport.
2. Cause nommée avec preuves ; PLACEMENT-MELEE et mêlée intacts (test transversal).
3. Non-régression verrouillée par tests ; suites vertes ; zéro changement protocole inutile (si une forme d'ordre doit évoluer : `orderShapeError` d'abord + Erik informé à l'arrêt).

## 4. Périmètre interdit
- Retoucher les valeurs navales (capacités, stats) sans verdict d'Erik ; fog/rendements/fin de tour ; 3D ; la sableuse ; tout correctif sans diagnostic (L0 obligatoire).
