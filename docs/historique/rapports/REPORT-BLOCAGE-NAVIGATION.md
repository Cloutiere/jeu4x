# REPORT-BLOCAGE-NAVIGATION

**Mission** (HANDOFF-BLOCAGE-NAVIGATION, décisions Erik 05/10) : le clic sur le bouton « Fin de tour bloquée (n) » ouvre le menu fautif (D1 : Recherche prioritaire en cas de double blocage, sinon PanneauVille de la première ville au tri R-81) et les flèches ⟵ ⟶ de l'en-tête de PanneauVille naviguent entre les villes de l'empire avec recentrage caméra (D3). Client seul — zéro moteur/serveur/protocole, `schemaVersion` 27 inchangée.

## Livré

- **D1/D2 — décision d'ouverture** (`apps/web/src/lib/blocages.ts`) : `menuAOuvrir(blocages)` — fonction PURE : tout blocage `recherche` → `{kind:'recherche'}` (priorité D1), sinon premier blocage `production` (l'ordre du tableau `blocagesFinDeTour` est déjà le tri R-81 par id croissant), sinon `null`.
- **D1 — câblage bouton** (`Game.svelte`) : `onclick={myBlocages.length > 0 ? ouvrirMenuBlocage : requestEndTurn}`. `ouvrirMenuBlocage` conserve le motif pédagogique (toasts, option 1 HANG-LOCAL) puis ouvre `ResearchPanel` (`showResearch`) ou sélectionne + centre la ville fautive (`ui.set` + `centerOnHex`, zoom préservé) — la sélection ouvre PanneauVille (D5 : « menu de la ville » = PanneauVille).
- **D3 — flèches ⟵ ⟶** (`PanneauVille.svelte`) : boutons de part et d'autre du nom dans l'en-tête, présents dès ≥ 2 villes de MON empire sur une ville à moi (`navigable`), même langage AAA or-sur-sombre (état survol), `aria-label` + `title`. Le calcul de cycle est la fonction pure `villeVoisine(ids, currentId, delta)` (`blocages.ts` : tri R-81 par id, cyclique). Le branchement `onNaviguer` vit dans `Game.svelte` (`naviguerVille`) : sélection + `centerOnHex` — utilisable en permanence, blocage ou non ; depuis n'importe quelle ville affichée (les flèches suivent la sélection au clic carte — cohérence §L2).
- **D4 inchangé** : le bloc HANG-LOCAL UX à la résolution (sélection + centrage, pas d'ouverture) est intact.
- **L1 — test-first** : `apps/web/tests/blocage-navigation.test.ts` (9 cas : décision d'ouverture — recherche seule / production seule / les deux → recherche / lot vide ; cycle des flèches — suivante, précédente, rebouclage, n=1, no-op). Un ajustement : `tests/ui-jeu-t1.test.ts` D5 assertait l'ancien `onclick={requestEndTurn}` — adapté au nouveau routage (requestEndTurn reste le chemin libre).
- **L2** : voir ci-dessus. **L4** : suites web 539 vertes (+9, `ui-jeu-t1` adapté), rules 993 / server 120 intouchées (aucun fichier moteur modifié), svelte-check 0 erreur.

## Vérification GUI réelle (L3) — `devtmp/blocage-navigation-gui.mjs`, captures `dev-logs/captures-blocage-navigation/`

Partie solo légale (procedural-40) jouée par ordres ws + dumps admin, scénarios atteints par mécaniques de jeu légitimes :
- **Double blocage** : villes vidées par `RemoveFromQueue` (salvage C7 durable) + commerce science (citoyen posé sur une case d'eau R-107 + `SetConversion` science) → **clic → ResearchPanel** (`C-double-blocage-recherche.png` — le lot porte production+recherche, Recherche ouverte, priorité D1 démontrée) ;
- **Recherche prioritaire sur lot mixte restant** : file posée VIA LE PANNEAU (QueueProduction, R-184) → **clic → ResearchPanel** (`A-*.png`) ;
- **Production seule** : `SetResearch` (action immédiate) → **clic → PanneauVille** sur la première ville au tri R-81 (`B-panneau-ville.png` — en-tête avec flèches, alerte production) ;
- **Flèches entre ≥ 3 villes** : clics ⟶ successifs Ville1 → Ville2 → Ville3 → retour Ville1 avec recentrage caméra à chaque pas (`D-fleches-ville1..3.png`, `D-fleches-cycle-retour.png`).

## 🔶 Points à l'œil / réserves

1. **« Recherche seule » pas strictement isolée en GUI** : dans la meilleure partie, le clic A s'est fait avec le lot « production (1 ville) + recherche » — la priorité Recherche est démontrée, mais l'isolat « recherche seule → Recherche » n'est prouvé qu'en unitaires (L1). La couverture GUI complète des deux villes (un clic `.opt` par panneau) a fonctionné sur l'une mais pas les deux.
2. **Clic DOM intercepté sur `.opt`** : `page.click` dépasse le délai d'actionnabilité (élément couvert ?) — contourné par dispatch DOM direct (`$$eval … click()`). À rien pour le jeu réel (clic souris normal), mais si Erik voit un jour un item de production non cliquable sous un autre calque, c'est le même symptôme.
3. **Graines inégales** : il faut une ville côtière (case d'eau dans le rayon) pour du commerce → science. Les parties sans côte ne peuvent pas démontrer le volet recherche en GUI (la science n'existe pas) — le script le signale 🔶.
4. **Libellés/visuel des flèches** (rendu, taille, position dans l'en-tête) à l'œil d'Erik.

## Pièges rencontrés (pour les prochaines sessions)

- `EndTurn`, `SetResearch`, `SetConversion` sont des MESSAGES de premier niveau, pas des `SubmitOrder` ; `SetProduction.item` est un objet `{kind, id}`.
- `EndTurn` est refusé tant qu'un blocage existe : les états « ville sans production » ne s'obtiennent que par complétion à la résolution ou par `RemoveFromQueue` (salvage C7) posé AVANT que la science n'existe.
- Le citoyen désassigné (`SetWorkedTile null`) rend le créneau instable (re-remplissage observé) : danse en 2 tours, parfois 2-3 tentatives.
- `fondable` pour un colon fondateur doit IGNORER le colon lui-même (sinon oscillation éternelle) et une case déjà travaillée par une AUTRE ville est refusée (`takenByOthers`).
- workerd local : gels observés entre ~30 et ~90 tours (pas de borne fixe) — `finirTourOuBlocage` distingue gel et rejet de blocage légitime.
