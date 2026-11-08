# HANDOFF-ANNUL-CHEMIN — Bouton « Annuler l'ordre » pour les chemins gelés

**Observation Erik 24/10 (captures)** : une unité avec un chemin gelé d'un tour précédent (« Chemin gelé : Move ») n'a AUCUN moyen de l'annuler depuis le panneau unité — il faut lui donner un nouvel ordre pour ensuite pouvoir annuler. Ajustement : un bouton d'annulation pour les ordres persistants.

## 1. Préalables

- Lire `UnitPanel.svelte` (boutons d'ordres, leurs gardes), le mécanisme d'annulation des ordres du jour (côté client → message), l'état `unit.order` (chemins gelés R-158, Heal/Sleep persistants ORDRES-UNITES), R-33 (Fortify efface tout chemin — précédent).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status`.

## 2. Décisions (Erik 24/10 — défaut appliqué, veto possible)

- **D1 — Bouton « Annuler l'ordre »** : visible SI ET SEULEMENT SI l'unité sélectionnée porte un ordre persistant (`unit.order` non nul — chemin gelé, Heal, Sleep) ; libellé contextuel (« Annuler le chemin » / « Annuler le soin » / « Annuler la vigilance ») ; langage AAA or-sur-sombre, même rangée que les autres.
- **D2 — Effet** : l'ordre est annulé côté serveur ; l'unité redevient libre (PM actuels conservés, flèche/préview disparaissent immédiatement côté client).
- **D3 — Mécanisme** : réutiliser le mécanisme d'annulation existant des ordres du jour (préféré — zéro moteur/protocole) ; si une forme d'ordre dédiée est nécessaire (`CancelOrder`), `orderShapeError` EN PREMIER + garde propriétaire.
- **D4 — Le reste inchangé** : Tenir/Fortifier/Soigner/Vigilance/Passer/Vendre, la programmation clic droit, la règle R-33.

## 3. Mission

- **L1 — test-first** : bouton visible avec `unit.order` (3 formes : chemin, Heal, Sleep) / absent sinon ; l'annulation rend l'unité libre (test du message émis ou du moteur si D3-dédiée) ; relecture/god mode non régressés.
- **L2 — client (ou client+serveur si D3-dédiée)**.
- **L3 — captures GUI** (`dev-logs/captures-annul-chemin/`) : guerrier avec chemin gelé → bouton → annulation → flèche disparue, unité libre.
- **L4** : suites vertes, svelte-check 0, commit, push, mini-rapport `REPORT-ANNUL-CHEMIN.md`.

## 4. Critères d'acceptation

Le scénario d'Erik : un chemin gelé au tour précédent s'annule d'un clic, sans passer par un nouvel ordre.

## 5. Périmètre interdit

Toute autre mécanique d'ordre ; le bot ; `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
