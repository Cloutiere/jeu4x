# HANDOFF-GEMMES-OR-BONUS — Gemmes +2 or, Or +3 or : appliquer la décision D3 de la spec ressources

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-91 ressources, R-93 révélation, R-96 camps-ressources) et `docs/recherche/PROPOSITION-RESSOURCES.md` (décision D3 — LA source de ce calibrage). Mission **données + tests** — zéro changement de code moteur attendu (le bonus de ressource accessible s'ajoute déjà aux rendements : `resourceBonus`/`tileYield` existants).

## 1. Problème (constat Erik 02/10 + audit pilot)

**Gemmes et Or ont un bonus 0/0/0 dans `resources.json`** — la décision D3 « recommandée v1 » de la spec (Gemmes → **commerce 2**, Or → **commerce 3**, mappée sur le canal commerce en attendant le canon « or direct au trésor ») n'a jamais été appliquée aux données. Résultat en jeu : ces tuiles ne montrent que le rendement du terrain (Erik : « la case gemmes ne donne que les marteaux de la montagne »), et les ressources ne rapportent rien.

La règle d'affichage est déjà correcte : ressource **accessible** au joueur (`revealedByTech` null ou tech débloquée) → bonus affiché dans les glyphes de rendement et appliqué par `tileYield` ; cachée → terrain seul. Seules les données manquent.

## 2. Changements

1. `packages/rules/src/data/resources.json` :
   - `gemmes.yields` : `{ food: 0, production: 0, commerce: 2 }` ;
   - `or.yields` : `{ food: 0, production: 0, commerce: 3 }` ;
   - **rien d'autre** (encens/soie : their valeur est `culture` — décision séparée d'Erik, NE PAS y toucher) ;
2. Tests : adapter toute assertion figeant ces rendements (chercher `gemmes`/`or` dans les tests economy/resources/rendements — la suite dira) ; **ajouter** un test d'accessibilité/rendement : gemmes accessible dès le départ (`revealedByTech: null`) → `tileYield` = terrain + 2 commerce ; or caché (`monnaie`) → avant Monnaie = terrain seul, après = terrain + 3 commerce ;
3. **RULES.md** : table des ressources (R-91) — gemmes « +2 or (commerce) », or « +3 or (commerce) », avec la note de divergence D3 (canon CivRev = or direct au trésor ; v1 = commerce, conversion R-90 s'applique — documentée, réversible) ;
4. `docs/recherche/PROPOSITION-RESSOURCES.md` : NE PAS le modifier (spec d'Erik — la divergence est documentée dans RULES).

## 3. Vérification

- Suites complètes vertes ×2 (rules + web si rendements testés côté client — les glyphes lisent les mêmes données) ; typecheck.
- Sanity en jeu local : tuile gemmes révélée → glyphe « +2 or/commerce » sur la montagne ; tuile or cachée → brume + terrain seul ; après Monnaie → +3.

## 4. Livraison

- Commit après suites vertes (Erik a dicté les valeurs, D3 est sa spec) — push, CI déploie ; captures légères `dev-logs/captures-gemmes-or/` (avant/après la tuile gemmes).

## 5. Critères d'acceptation
1. `gemmes` = +2 commerce, `or` = +3 commerce ; aucune autre ressource modifiée (encens/soie intacts).
2. Affichage et moteur cohérents (discovered → bonus ; caché → terrain seul) ; tests d'accessibilité ajoutés.
3. RULES.md aligné ; suites vertes ; zéro changement de code.

## 6. Périmètre interdit
- Encens/soie et le champ `culture` (décision Erik en cours) ; le canal « or direct au trésor » (alternative D3, plus tard) ; tout autre ressource/valeur ; moteur ; UI.
