# HANDOFF PHASE 7b — Refonte du menu de ville (étude → approbation → implémentation)

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~271 tests), lire `REPORT-PHASE7A.md` (points remontés) et le code concerné.

**Cette mission a une structure différente des précédentes : deux temps, avec un ARRÊT OBLIGATOIRE entre les deux.** Le temps A est une étude et une **proposition** ; tu t'arrêtes et la présentes à Erik ; **rien n'est implémenté sans son approbation explicite**. Le temps B (implémentation) se fera dans une session suivante, après son accord éventuellement amendé.

## Contexte

- **Le menu de ville existe** : `apps/web/src/components/CityPanel.svelte` (334 lignes), rendu par `Game.svelte` quand une ville est sélectionnée. Il affiche : identité/capitale/rayon, cumuls Nourriture/Production/Commerce avec répartition or/science (y compris projection sur réassignation en attente), jauge de croissance 10×pop (R-63), liste des citoyens et réassignations (R-60), production unités+bâtiments filtrée R-87, bâtiments possédés.
- **Anomalie suspectée** (REPORT-PHASE7A.md) : le clic sur la case d'une **capitale vide ne sélectionne pas la ville** (les cases à unité répondent) — probablement la raison pour laquelle Erik « ne voit plus » le menu. À reproduire et diagnostiquer avec une vraie souris.
- **Trois décisions en attente d'Erik** à intégrer à la proposition : (1) science à 0/tour quand la case de ville ne produit pas de commerce (calibrage arrondi/minimum 🔶) ; (2) **Bibliothèque et Caserne sont constructibles sans aucun effet** — leurs effets doivent être proposés (Civ Rev : Bibliothèque +50 % science ; Caserne : unités produites vétérans) ; (3) accessibilité du menu de ville (l'anomalie ci-dessus).

## Temps A — Étude et proposition (ARRÊT pour approbation)

1. **État des lieux** : lire `CityPanel.svelte`, `Game.svelte`, `UnitPanel.svelte`, `ResearchPanel.svelte` ; documenter ce qui existe, ce qui manque, ce qui est mal organisé ; reproduire l'anomalie de sélection des cases de ville.
2. **Benchmark du domaine** : comment les références présentent leur écran de ville — **Civilization Revolution** (écran de ville console : une ville = un écran plein, production, ressources de la ville), Civ VI (écran citoyens avec cases travaillées superposées à la carte), Old World, et 1-2 jeux web 4X modernes. Extraire les patterns pertinents pour un jeu asynchrone desktop (peu de clics, lisible d'un coup d'œil, réassignation évidente).
3. **Besoins d'Erik** : récapituler ses demandes passées touchant la ville (menu enrichi Phase 6, cumuls, jauge, réassignation par clic, production filtrée, overlay rendements) et les questions ouvertes (effets Bibliothèque/Caserne, calibrage science, accès au menu).
4. **Proposition** : une refonte du menu de ville (et du mode d'accès : panneau latéral, écran plein, modale — à toi de trancher et de le justifier), présentée comme :
   - **maquette** : description écran par écran (ASCII ou page HTML statique visualisable dans le navigateur — pas besoin d'être branchée) ;
   - **2-3 options** différenciées avec une **recommandation argumentée** ;
   - les **changements de règles** éventuels (Bibliothèque/Caserne, calibrage science) formulés comme propositions R-xx à valider ;
   - l'estimation en livrables.
5. **RAPPORT-PROPOSITION.md** + présentation à Erik. **ARRÊT — rendre la main.** Ne rien implémenter.

## Temps B — Implémentation (session suivante, après approbation d'Erik)

Selon la proposition approuvée : implémentation test-first, corrections des anomalies confirmées (sélection de ville, calibrage science, effets validés), README + captures, CI verte, déploiement prod, vérification en jeu. Le handoff d'implémentation sera écrit après l'approbation — ses critères d'acceptation découleront de la proposition validée.

## Périmètre interdit (cette session)

- **Aucun changement de code produit** pendant le temps A (le diagnostic et la maquette statique n'impliquent pas de modifier le jeu) ; tout au plus des commits de documentation (rapport-proposition).
- Pas de règles nouvelles sans approbation ; pas de déploiement.
- L'anomalie de sélection peut être **diagnostiquée** (cause racine identifiée et décrite) mais pas corrigée dans le temps A.

## Fin de session (temps A)

Livrer `RAPPORT-PROPOSITION.md` : état des lieux, benchmark, 2-3 options avec recommandation, maquette, propositions de règles, estimation. S'arrêter et rendre la main à Erik pour décision.
