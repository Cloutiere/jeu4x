# HANDOFF-BANDE-DETAIL — Infobulles « pourquoi tant de tours » sur la bannière de ville

**Décisions Erik 07/10** (tranchés D1-D6 présentés — veto possible). Survol des deux chiffres de la bande-ville = tooltip explicatif (référence Civ VII simplifiée).

## 1. Préalables

- Lire `HANDOFF-BANDE-VILLE` livré (bannière, `REPORT-BANDE-VILLE.md`), les économies de ville (gainNourriture/gainProduction — `CityEconomyInputs`, culture-ressources a introduit le pattern **helper partagé moteur/UI**), `PanneauVille.svelte` (les lignes « récolte − population » existantes — la transparence d'Erik), `wrap`/calques bannière.
- Baseline : suites vertes à jour, `schemaVersion` 27, **client + helper partagé** (pas de nouveau champ état — les données existent). Vérifier `git status`.

## 2. Décisions (Erik 07/10 — non négociables)

- **D1 — Tooltip croissance** (survol du chiffre de croissance) : « 10 / 29 fioles » + **ligne de calcul nommée** (+récolte − consommation = gain net/tour) + « Nouveau citoyen dans N tours ». Pas de découpage urbain/rural.
- **D2 — Tooltip production** (survol cercle item OU chiffre de tours) : nom de l'item, coût total, marteaux/tour **avec détail nommé** (base tuiles + bonus bâtiments/merveilles le cas échéant), « Achèvement dans N tours ». File suivante non affichée.
- **D3 — Villes du joueur seulement** (fog).
- **D4 — Helper PARTAGÉ moteur/UI** : une seule source pour gain net de nourriture et marteaux/tour (+ leurs composantes nommées) — miroir exact, zéro duplication (leçon culture-ressources).
- **D5 — Survol pur** : aucun clic intercepté (la bannière reste cliquable), disparaît à la sortie, position au-dessus de la bande, ne coupe pas le HUD.
- **D6 — Style** : panneau AAA or-sur-sombre compact (3 blocs max), texte or — cohérent avec la référence d'Erik.

## 3. Mission

- **L1 — test-first** : helper partagé (gain net nourriture avec composantes, marteaux/tour avec composantes — propriété : somme = total moteur) ; constructeur de tooltip (textes FR sans coordonnées).
- **L2 — moteur** : le helper (export depuis `packages/rules` — composantes déjà calculées dans l'économie de ville, exposer sans dupliquer).
- **L3 — client** : tooltips au survol des deux zones de la bannière ; branchement D5.
- **L4 — vérification GUI locale avec captures AVANT commit** : survol croissance (ville en croissance et ville stagnante ±0), survol production (unité puis bâtiment), lisible au zoom par défaut. Captures `dev-logs/captures-bande-detail/`.
- **L5** : suites vertes, svelte-check 0, commit, push, mini-rapport `REPORT-BANDE-DETAIL.md`.

## 4. Critères d'acceptation

1. Les deux tooltips s'affichent au survol avec la ligne « pourquoi » ;
2. Les chiffres = miroir exact du moteur (tests de propriété) ;
3. Clic bannière inchangé ; rien sur l'ennemi ;
4. Suites vertes, `schemaVersion` 27.

## 5. Périmètre interdit

Valeurs moteur (aucun calibrage) ; PanneauVille (inchangé) ; la file de production ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
