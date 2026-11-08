# HANDOFF-JEV-BANC-SUIVI — Banc ciblé : confirmer l'écrasement de la Grèce, départager civ vs siège, re-calibrer la maturité

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/recherche/Intégration IA JEV Jeu 4X.md`, `REPORT-JEV-V4.md` (état V4 : règle de conversion, gainNet maturité 0,5 — ratio 0,57× conservateur, score de fin, banc 3 40/40, 🔶 §5 — notamment **`siegeJev` du plan jamais consommé** : Jev a toujours joué le siège p2). La `sableuse/` est en place (banc résumable, 35/35 tests). **Outil HORS LIGNE** — zéro changement moteur/serveur/jeu. **Garde-fou porté à 5 $ par Erik** (consommé à date ≈ 1,43 $ — viser ≤ 2,2 $ cumulés pour cette mission ; STOP et rapport avant dépassement).

## 1. Objectif (feu vert Erik du 29/09)

Le banc 3 a produit un premier classement avec **une candidate écrasante (grèce, +97 % vs médiane, dominante dans les DEUX bras)** et des écarts Jev/contrôle suspects (espagne/zoulous forts en contrôle seulement ; arabie/inde sauvées par Jev). Deux explications possibles aux écarts : la civ elle-même, ou **l'effet de siège** (qui croise qui — et le fait que Jev ait toujours joué p2 fausse potentiellement la lecture). Mission : **confirmer ou infirmer par le chiffre**, et au passage re-calibrer le facteur de maturité. **Aucune valeur de règle ne bouge dans cette mission** — on produit le verdict, Erik décidera des ajustements.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Brancher `siegeJev`** : le harnais consomme enfin la rotation des sièges du plan (`engineJev: 'p'+p.siegeJev` — le rapport V4 §5 donne la ligne). Test : sur un plan fixture, chaque siège est bien piloté par Jev quand demandé.
- **D2 — Banc ciblé « grèce »** : parties où LA GRÈCE est toujours présente (les 4 autres civs tournées), Jev ET contrôle entremêlés, ~16 parties grèce + ~6 contrôle de rappel. Verdict attendu : la grèce reste-t-elle > +50 % vs médiane avec des sièges variés ? (critère de confirmation chiffré dans le rapport : écart vs médiane du banc ciblé, intervalle naïf assumé).
- **D3 — Banc ciblé « siège vs civ »** : arabie et inde (les « sauvées par Jev ») jouées avec Jev sur CHAQUE siège (au moins 2 sièges différents chacune) + leurs mêmes seeds en contrôle — si le score suit le siège plutôt que la civ, l'effet-siège est démontré. ~12 parties.
- **D4 — Re-calibrage du facteur de maturité** : tester 0,5 (actuel) vs 0,65 sur 2-3 seeds communes avec table prédiction/réel (comme V4) → retenir la valeur la mieux centrée, **la geler**, la documenter (formule inchangée, un seul paramètre).
- **D5 — Rien d'autre ne bouge** : questions, seuil fonder, score, règle de conversion — gelés tels quels (comparabilité avec le banc 3). Le plan reste sans remise par partie.
- **D6 — Rapport = verdicts** : trois sections de conclusion claires (grèce confirmée/infirée + chiffre ; siège vs civ départagé + chiffre ; maturité retenue + ratio), caveats statistiques en tête (n petit = détecteur, pas verdict — c'est le format établi).

## 3. Mission

### L0 — Préalables
- Baseline : tests sableuse verts, budget à date (journaux). Vérifie le point §5 V4 sur `siegeJev` (plan.json l'a toujours généré ?).

### L1 — Branchement siège + tests
- D1 + test fixture ; vérifier qu'aucun comportement existant ne change quand `siegeJev` = 2 (rétro-compat bancs précédents).

### L2 — Bancs ciblés (D2, D3)
- Plans dédiés (fichiers séparés, jamais écraser les bancs précédents), exécution résumable, garde-fou.
- Ordre : d'abord le mini A/B maturité (D4, 2-3 seeds × 2 valeurs ≈ 0,05 $), gel, PUIS les bancs ciblés (D2 ~0,20 $, D3 ~0,15 $ — estimations).

### L3 — Analyse + ARRÊT POUR APPROBATION D'ERIK
- Rapport ciblé (`sableuse/bancs/banc-suivi-<date>/RAPPORT.md`) : les trois verdicts (D6), comparaison avec le banc 3, extraits qualitatifs si utile (une partie grèce dominante — QUE fait-elle : techs ? pop ?).
- Si la grèce est confirmée : **proposer 1-3 options d'ajustement** (ex. réduire le trait de science, coûts de ses techs candidates) — SANS les appliquer, avec les valeurs actuelles citées ; Erik tranchera avec son Guide Civilisations.
- NE COMMITTER QU'APRÈS FEU VERT.

### L4 — Rapport de mission
- `REPORT-JEV-BANC-SUIVI.md` : branchement siège, A/B maturité, bancs ciblés, les trois verdicts, options d'ajustement grèce (si confirmée), 🔶, coût.

## 4. Critères d'acceptation
1. `siegeJev` branché et testé ; la rotation des sièges fonctionne (test fixture).
2. Les trois verdicts chiffrés existent (grèce, siège-vs-civ, maturité retenue gelée).
3. Aucune valeur de règle modifiée ; suites vertes ; zéro changement moteur/serveur/jeu ; zéro secret.
4. Coût cumulé ≤ 2,2 $ ; résumable ; journaux gitignés.

## 5. Périmètre interdit
- Toute retouche de trait/civ/valeur (le rapport PROPOSE, Erik dispose) ; questions/seuils/score (gelés) ; moteur/serveur/jeu distribué ; question `convertir` (parkée) ; commit de secrets/journaux bruts.
