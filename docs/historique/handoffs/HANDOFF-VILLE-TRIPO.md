# HANDOFF-VILLE-TRIPO — La ville (Nœud Serveur) en asset externe : anneaux accent_joueur, corps intact

**Décision d'Erik du 08/09** : un SEUL visuel de ville, quelle que soit la population (les paliers visuels du Mainframe procédural sont abandonnés au profit de l'asset `image_ref/ville.glb` — 3 664 tris, UV + texture JPEG, origine au sol, hauteur 1,0). Habillage ciblé demandé : **les anneaux en `accent_joueur` + couche émissive ; la texture du corps INTACTE** (ciblage par clonage géométrique des anneaux — la technique validée sur le knight, mode peintre, voir FONDERIE.md §deux workflows).

## 1. Préalables

1. Lire `STYLE-3D.md`, `FONDERIE.md` (§workflows + conventions du corps teintable), `fonderie/REPORT-FONDERIE-HABILLAGE-TRIPO.md` (la méthode knight : clonage de zones, émissive dérivée, facteur cuit).
2. Périmètre : T1 = `fonderie/` uniquement (rituel strict habituel — lecture interdite du jeu) ; T2 = intégration (le jeu fait foi). `git status` vérifié au départ.
3. La ville actuelle en jeu est le **Mainframe procédural** (`visuel3d.json` §`structures.mainframe` : socle, paliers pop 6/18/31, cœur, nervures, modules de bâtiments, merveille dorée, distinction capitale). Ce handoff remplace le VISUEL de la structure de ville, pas la mécanique (population, bâtiments, merveilles restent des données moteur).

## 2. Mission T1 — Habillage en fonderie (validation Erik d'abord)

1. **Analyse** : parser `image_ref/ville.glb` (tris/UV/texture/origine — déjà établi : 3 664 tris, 1 matériau Tripo, hauteur 1,0) ; **déterminer la direction « avant »** et la corriger vers -Z si besoin ; **identifier les anneaux** géométriquement (forme/position) et montrer à Erik la sélection en « zones brutes » (couleurs plat) AVANT tout habillage.
2. **Ciblage des anneaux** : cloner les triangles des anneaux en un second mesh portant le matériau **`accent_joueur`** (teinté par le jeu, multiplication) ; générer leur **couche émissive** (les anneaux brillent, avec ou sans le bloom au choix d'Erik à l'œil). La texture du CORPS reste **octet pour octet celle de Tripo** — aucune repeinte.
3. **Couche émissive du reste** (option à montrer à Erik) : dériver une petite couche émissive pour les fenêtres/éléments lumineux apparents du corps (sans modifier sa texture de base) — Erik tranche à l'œil : oui/non.
4. Échelle : porter le modèle à ~2,5-2,75 unités de haut (échelle cuite dans le fichier, convention §5 du STYLE) ; ≤ 3 matériaux (`accent_joueur` corps/anneaux ou corps intact + `neon` anneaux — selon la variante choisie par Erik, cf. ci-dessous) ; exporter `fonderie/modeles/ville_v1.glb`.
5. **Deux variantes à montrer dans le visualiseur** (choix esthétique d'Erik, A/B) :
   - **A** : seuls les ANNEAUX teintés `accent_joueur`, corps 100 % Tripo intact ;
   - **B** : anneaux teintés + corps passé en `accent_joueur` neutre-clair (teinte sur toute la ville) — comme le knight.
   Avec les teintes J1-J6 sur chacune. Erik tranche, consigné au rapport.
6. **Point à trancher avec Erik** : la distinction **capitale** (aujourd'hui couronne + cœur surélevé). Défaut proposé : même visuel pour toutes les villes en T2, la distinction capitale est REPORTÉE (revenirs possibles : couronne LINES ajoutée, ou accent plus intense). Consigner la décision.

## 3. Mission T2 — Intégration au jeu (après validation T1 par Erik)

1. **Remplacer le visuel du Mainframe** par `ville_v1.glb` pour TOUTES les tailles de population : le rendu de la structure de ville passe par le pipeline .glb (même calque/technique que les unités : cache, fusion par matériau, teinte multiplicative, fog) ; le `echelle`/`rotation` restent data-driven dans `visuel3d.json`.
2. **Les données de paliers** (`popMax` 6/18/31) et la distinction capitale restent dans les données mais ne pilotent PLUS le visuel (pas de suppression sauvage : marquer obsolète/conserver — le moteur n'y touche pas).
3. **Les modules de bâtiments, la merveille dorée et le cœur** : ⚠️ point de cadrage avec Erik AVANT de coder — les garder (ils s'accumulent autour du socle ville, indicateur de bâtiments précieux) ou les retirer (ville = uniquement l'asset) ? Défaut proposé : **les garder**, ils rendent la ville informative ; Erik tranche.
4. L'**atelier** expose la fiche ville .glb (isolement, teintes, A/B contre le Mainframe procédural conservé en fiche séparée tant qu'il existe dans le code) ; test catalogue vert.
5. Vérifications : suite complète + typecheck verts ; bench 40×40 sans régression ; vraie partie solo : villes fondées/capturées affichent l'asset avec teinte joueur, selection, croissance de pop SANS changement visuel (attendu), captures `dev-logs/captures-ville-tripo/` ; `schemaVersion` 19 inchangée ; zéro gameplay (`packages/rules`/serveur intouchés).

## 4. Critères d'acceptation

- T1 : Erik valide à l'œil dans le visualiseur (variante A ou B choisie, anneaux teintés, corps intact si A, teintes J1-J6 propres) ; ≤ 5 500 tris ; origine au sol, face -Z, ~2,5-2,75 unités.
- T2 : en jeu, toutes les villes affichent l'asset, teinte joueur correcte (multiplicative), zéro régression perf ou gameplay, mapping data-driven, `schemaVersion` 19.
- Commits atome par atome sur demande explicite d'Erik (T1 puis T2 séparément).

## 5. Périmètre interdit

- La mécanique de population/bâtiments/merveilles (`packages/rules`, serveur) ; les 20 unités v3 ; la distinction capitale (reportée sauf demande contraire d'Erik) ; l'aqueduc et son rayon étendu ; V3 renommage, RELECTURE-3D.

## 6. Fin de session

Rapport `fonderie/REPORT-VILLE-TRIPO.md` (T1) puis `REPORT-VILLE-TRIPO-T2.md` (racine, T2), arrêt, remise de la main. Le pilot archive.
