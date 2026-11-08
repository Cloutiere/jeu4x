# HANDOFF-GOD-MODE-PRODUCTION — Voir la production des villes IA en god mode

**Observation Erik 23/10.** En god mode, la bannière des villes IA n'affiche pas leur production — alors que la DONNÉE est déjà présente côté client (l'état filtré garde les villes visibles entières, et god mode ne filtre plus). Le masquage est la règle d'affichage anti-fog de BANDE-VILLE (D3), appliquée sans égard au god mode.

## 1. Préalables

- Lire `apps/web/src/lib/render/bande-ville.ts` (le masquage croissance/production/ETA est un choix d'affichage en tête de fichier, ligne ~15) et le flag god mode de session (GOD-MODE — comment le client le sait : le retour d'état après bascule).
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul**. Vérifier `git status`.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — En god mode, la bannière montre tout** : croissance + production + ETA affichés pour TOUTES les villes visibles (le cercle item/ETA et le drapeau « Tours » sans distinction de propriétaire). Hors god mode : le masquage anti-fog actuel, INTACT (zéro fuite en jeu normal).
- **D2 — Panneau de ville** : double-clic/panneau d'une ville IA — inchangé (hors périmètre ; la bannière suffit à l'observation).

## 3. Mission

- **L1 — test-first** : `construireBanniere` avec flag god mode (production/croissance affichées pour une ville étrangère) et sans flag (masquées — régression verrouillée).
- **L2 — client** : passer le flag god mode au constructeur (déjà disponible côté page), brancher D1.
- **L3 — captures GUI** (`dev-logs/captures-god-mode-production/`) : god mode ON — bannières IA avec production ; OFF — bannières IA masquées.
- **L4** : suites web vertes, svelte-check 0, commit, push, mini-rapport `REPORT-GOD-MODE-PRODUCTION.md`.

## 4. Critères d'acceptation

Le scénario d'Erik : en god mode, chaque ville IA montre ce qu'elle produit et dans combien de tours ; en jeu normal, rien ne fuit.

## 5. Périmètre interdit

Le filtrage fog normal, PanneauVille des ennemis, le serveur, `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
