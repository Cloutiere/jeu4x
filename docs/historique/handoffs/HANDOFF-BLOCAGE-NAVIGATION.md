# HANDOFF-BLOCAGE-NAVIGATION — Clic « bloqué » ouvre le menu fautif + flèches entre villes

**Décisions Erik 05/10 (tranchées avec le pilot, votées).** Client seul — les listes de blocages et de villes existent déjà.

## 1. Préalables

- État (à re-vérifier) : `blocagesFinDeTour` (moteur, déjà importé côté web) + `apps/web/src/lib/blocages.ts` (`villeDuPremierBlocageProduction` — tri R-81) ; HANG-LOCAL UX option 2 dans `Game.svelte` (~124-140 : à l'apparition d'un blocage production, sélection + centrage de la ville, SANS ouverture de panneau) ; bouton fin de tour avec motif « Fin de tour bloquée (n) » ; `ResearchPanel.svelte` ; `PanneauVille.svelte` (panneau de gauche, file de production) ; `ui.set` sélection ; `centerOnHex`.
- Baseline : suites vertes (rules 993 + web 530 + server 120), svelte-check 0, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions Erik (votées — non négociables)

- **D1 — Clic sur le bouton « Fin de tour bloquée (n) »** : ouvre le menu qui bloque — `ResearchPanel` si blocage recherche, `PanneauVille` de la première ville fautive si blocage production. **Les deux → Recherche d'abord.**
- **D2 — Plusieurs villes sans production** : le panneau s'ouvre sur la première au tri R-81.
- **D3 — Flèches ⟵ ⟶ dans l'en-tête de `PanneauVille`** (à côté du nom), présentes dès ≥ 2 villes : ville suivante/précédente de l'empire (ordre R-81, cyclique), **recentrage caméra** sur elle + panneau mis à jour. Utilisable en permanence, blocage ou non.
- **D4 — À la résolution** : comportement actuel CONSERVÉ (sélection + centrage, pas d'auto-ouverture de panneau).
- **D5 — « Menu de la ville » = `PanneauVille`** (la vue ville zoomée reste dormante).

## 3. Mission

- **L1 — test-first (client)** : suite `blocage-navigation.test.ts` : décision d'ouverture à partir d'un lot de blocages (recherche seule → recherche ; production seule → ville au tri R-81 ; les deux → recherche) ; cycle des flèches (ordre R-81, cyclique, n=1 → flèches absentes ou inertes) ; aucun changement moteur.
- **L2 — UI** : D1 (le gestionnaire de clic du bouton bloqué — le motif/toast actuel reste en complément) ; D3 dans l'en-tête de `PanneauVille` (même langage AAA or-sur-sombre, état survol, accessibilité clavier gratuite si triviale) ; cohérence : si le joueur ouvre le panneau d'une AUTRE ville en cliquant la carte, les flèches suivent depuis cette ville.
- **L3 — vérification GUI locale avec captures AVANT commit** (règle Erik) : partie solo légale — tour avec recherche non choisie (clic → ResearchPanel), ville sans production (clic → PanneauVille sur la bonne ville), les deux ensemble (→ Recherche), flèches entre ≥ 3 villes avec recentrage. Captures `dev-logs/captures-blocage-navigation/`.
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push (CI déploie), rapport `REPORT-BLOCAGE-NAVIGATION.md`.

## 4. Critères d'acceptation

1. Clic « bloqué » : le bon menu s'ouvre, Recherche prioritaire en cas de double blocage ;
2. Flèches de ville : cycliques, avec recentrage caméra, depuis n'importe quelle ville ;
3. Aucune auto-ouverture à la résolution (D4 inchangé) ;
4. Suites vertes, captures avant/après.

## 5. Périmètre interdit

Moteur/serveur/protocole (aucune nouvelle donnée — les blocages et villes sont déjà calculés) ; vue ville zoomée ; le badge « unités en attente d'ordres » (inchangé) ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Mini-rapport (🔶 libellés/visuel à l'œil), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
