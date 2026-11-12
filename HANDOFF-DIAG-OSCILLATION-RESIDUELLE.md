# HANDOFF-DIAG-OSCILLATION-RESIDUELLE — La cause fine du guerrier planté (diagnostic, zéro code)

**Mission de DIAGNOSTIC — pas une livraison de fonctionnalité. Zéro modification de code moteur, zéro partie nouvelle.** Le verrou vient de la prod : partie **NP8JEE** (aujourd'hui, tour courant 14) — le guerrier de Jev u4 piétine en (24,5) avec ses PM intactes depuis le t11 (t11-14 : aucun pas, ordre `null`, mp 1), après une marche (25,4)→(24,4)→(24,5). C'est le **meilleur spécimen depuis YU4SHH** de la poche jamais élucidée consignée au backlog : « oscillation résiduelle (coudes d'occupation) — cause fine non élucidée » (CONFIANCE-EXPLORATION avait ramené le piétinement de 86 % à 3-14 %, pas 0). Dump et traces archivés : `devtmp/etat-NP8JEE/` (dump t14, traces 9-13, jev t10).

## 1. Préalables

- Canon : doctrine « jamais inactif » (CONFIANCE-EXPLORATION `3f71087` — explorer/rappeler/éclaireur, JAMAIS inactif ; seuils par question), OSCILLATION-MARCHE (`ffa73c8` — anti-recul/anti-piétinement, 4 mécanismes), CONFIANCE-EXPLORATION (patrouille/explorer → BFS routier, « poche u4 = coudes de route résiduel »).
- Le cas : u4 guerrier p2 (Jev, couche bot — la question Jev t10 ne porte QUE `produire`), capitale c2 (27,10), seul ennemi connu = gardien barbare fortifié u16 (21,5) à 3 cases (camp), pas de hutte, pas de ville à couvrir à (24,5). Le guerrier n'est ni garnison, ni patrouille bouclante, ni garde.
- Baseline : rules 1200 / server 453 / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` 28, Deploy SUCCESS `2094d10`. RIEN à pousser sauf le rapport + scripts d'analyse.

## 2. La question unique du rapport

**Pourquoi le BFS routier + anti-recul laissent-ils un guerrier avec mp intact SANS ordre pendant 4+ tours à (24,5) — et quel mécanisme minimal lèverait le gel sans rouvrir l'oscillation ?**

Pistes à forer (dans l'ordre de probabilité, à confirmer/infirmer par le code et la re-simulation) :
1. **L'anti-recul juge les pas disponibles non-améliorants** : l'objectif courant est-il le camp barbare (21,5) ou un tile de patrouille ? Si oui, chaque pas vers l'objectif est-il refusé (gardien fortifié → gate ? anti-recul → refus de « pas latéral non-améliorant » ?) et la re-planification retombe-t-elle sur le même état ?
2. **Coudes de route résiduel** : la route BFS calculée passe-t-elle par (24,5) comme coude, avec le prochain tile bloqué (terrain, unité, anti-recul) et le mécanisme de dégel manquant ?
3. **Le rappel D3 n'est pas déclenché** : pourquoi la doctrine « rappeler/éclaireur » ne réoriente-t-elle pas l'unité (condition d'entrée du rappel jamais remplie ?) ?
4. **La patrouille en boucle** : la position (24,5) est-elle un point de boucle où le « prochain objectif » est calculé égal à la position courante (objectif atteint mais non consommé) ?

**Méthode** : lecture du code (`botPolicy.ts` — exploration/patrouille/anti-recul ; `escortColon.ts` non concerné), re-simulation LOCALE du cas (determinisme : le dump t14 + seed permettent de rejouer les tours 11-14 hors prod via `tsx` et d'instrumenter la décision de l'anti-recul pas par pas), pas de partie nouvelle, pas de banc.

## 3. Livrable

`DIAG-OSCILLATION-RESIDUELLE.md` à la racine : la cause identifiée (mécanisme précis, fichier:ligne), la preuve par re-simulation (trace de la décision refusée tour par tour), les autres pistes infirmées, et **une section « leviers candidats pour le cadrage »** — pour chaque levier : ce qu'il change, son risque de rouvrir l'oscillation (le verrou OSCILLATION-MARCHE ne doit PAS revenir), le test qui le verrouillerait, quel canon Erik il suppose (jamais inactif / anti-recul). Puis arrêt, remise de la main — le pilot cadre.

## 4. Périmètre

Zéro modification de `packages/rules`, `apps/server/src`, `sableuse/src` ; scripts d'analyse/re-simulation en `devtmp/` uniquement ; zéro partie nouvelle, zéro banc ; ne jamais committer les secrets ni les fichiers personnels d'Erik. ⚠ Ne pas toucher au périmètre du diagnostic parallèle DÉFENSE-DE-VILLE (journaux sableuse joueur-escorte) — périmètres disjoints.

**Pièges** : workerd figé ~10 tours en e2e local (re-simulation via `tsx`, PAS via un serveur) ; cache vitest racine ; `order null` est une LECTURE PIÈGE (l'ordre est recalculé chaque tour par la couche bot — « pas d'ordre » ≠ « pas d'intention ») ; la prod prend `?turn=` rétention 20 tours (déjà téléchargé dans `devtmp/etat-NP8JEE/`).
