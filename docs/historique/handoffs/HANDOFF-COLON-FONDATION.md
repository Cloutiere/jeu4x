# HANDOFF-COLON-FONDATION — Le Colon affiche son état « en train de fonder » dès l'ordre posé

**Petit chantier du chapitre 2D.** Décisions d'Erik du 13/09 : le Colon programmé pour fonder une ville change de **visuel dès que l'ordre est posé** (tranché 2 = A) ; l'art est **fourni par Erik** (tranché 1 = B) — le chantier branche un **emplacement data-driven** avec **badge provisoire** en attendant l'asset. C'est une action programmée : elle doit être lisible à l'écran, même philosophie que l'aperçu de déplacement.

## 1. Préalables

1. Lire `RULES.md` (R-158 MultiStep et son action finale `foundCity`, R-64 fondation, R-159 priorité), `PROJET.md` (§pivot), `PILOT-HANDOFF.md` §3-§4, `docs/historique/rapports/REPORT-DEPLACEMENT-PLANIFIE.md` (flèches/fantômes, annulation).
2. Baseline : suite verte (**1091 tests**), typecheck 4/4, `schemaVersion` **22**, `git status` propre. Rendu 2D = seul chemin actif.
3. **Zéro gameplay** : aucune règle, aucun ordre (`orderShapeError` intouché), aucune résolution modifiée — la ville apparaît à la résolution comme aujourd'hui.

## 2. Mission

### M1 — Détection (pur, testé)
Fonction pure : unité amie + ses ordres → `fondeAFinDuChemin : true` si l'ordre courant (composite MultiStep, y compris **chemin gelé**) porte une action finale `foundCity` vivante. Dérivée de l'état/aperçu existants (`scenePreviews`), jamais recalculée par frame.

### M2 — Rendu 2D
1. **État fondation** : quand M1 est vrai, le sprite du Colon affiche l'état « en train de fonder » — **emplacement data-driven** (clé `colonFondation` dans le catalogue de sprites/unités) teinté accent joueur comme le sprite de base. **Tant qu'Erik n'a pas fourni l'art** (PNG absent du catalogue — même mécanique que les « PNG absents » de l'atelier) : **badge provisoire** au-dessus du Colon (marqueur de fondation, constantes 🔶 à l'œil). Dès que l'asset arrive, il s'affiche **sans changement de code**.
2. **Timing** : le visuel bascule **dès l'ordre posé**, même si le Colon est encore en route (action finale programmée) ; il **persiste sur le chemin gelé** tant que l'action finale vit (miroir du moteur — jamais d'état UI inventé) ; il **disparaît** à l'annulation (clic droit/Échap, purge existante) et **à la consommation** de l'action (fondation, tombé dans le fog R-158, insuffisance de PM — l'action annulée sans erreur ne laisse aucun état fondation résiduel, testé).
3. Interactions intactes : sélection, flèches, fantôme d'arrêt, zone d'arrivée — le badge/sprite n'affecte pas le picking.

### M3 — Vérification
1. Tests : M1 (ordre avec/sans action finale, chemin gelé, action annulée/consommée), rendu badge provisoire, bascule à l'annulation.
2. e2e + partie solo (captures `dev-logs/captures-colon-fondation/`) : ordre 1 case + fonder → état visible immédiatement ; annulation → disparu ; résolution → ville apparaît, état disparu ; partie existante reprise sans erreur.
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 22 inchangée, zéro diff 3D.

## 3. Périmètre interdit

- Toute règle de fondation (R-64), la résolution, `orderShapeError` ;
- Le 3D (contrainte dure — aucun diff sous `render3d/`) ;
- Les autres unités/états visuels (seul le Colon à action finale `foundCity` change) ;
- **Conflits potentiels avec MENU-VILLE** (chantier parallèle possible) : vérifier `git status` avant d'éditer et ne pas toucher aux composants de la vue ville si elle existe déjà dans l'arbre.

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-COLON-FONDATION.md`, commit/push sur demande explicite d'Erik, arrêt, remise de la main.
