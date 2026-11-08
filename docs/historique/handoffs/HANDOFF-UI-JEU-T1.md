# HANDOFF-UI-JEU-T1 — Écran de jeu, tranche 1 : mode dev à la demande, barre supérieure AAA, portrait dirigeant, bouton de fin de tour façon Civ VI

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md` (état), `REPORT-LOBBY-PREMIUM.md` et `REPORT-RAPPORT-ENGAGEMENT.md` (LES références de style AAA attendues — mêmes tokens or-sur-sombre), et étudie `Game.svelte` (topbar + colonne de droite), le composant `RapportCombat.svelte` (le standard visuel à égaler). Vision d'Erik : la disposition **Civ VI** (image fournie en session : barre supérieure de ressources, portrait de dirigeant à droite, gros bouton de fin de tour circulaire en bas à droite avec compteur d'unités en attente). **2D uniquement, client seul** — zéro changement moteur/serveur/protocole. Toutes les fonctions existantes restent accessibles (rien ne se supprime, on cache ou on déplace).

## 1. Objectif (demande d'Erik du 01/10)

Graduellement migrer l'écran de jeu vers la vraie UI du jeu. **Tranche 1** :
1. **Mode dev à la demande** : les éléments liés à l'interface de développement disparaissent du jeu, réaffichables à la demande ;
2. **Barre supérieure AAA** façon Civ VI (ressources, tour, civ/ère, gouvernement, recherche, timer) ;
3. **Portrait de dirigeant** en médaillon à droite (assets dirigeants existants, fallback logo or de nation) ;
4. **Bouton de fin de tour circulaire** en bas à droite (façon Civ VI), avec compteur d'unités en attente d'ordres.

**Parké (tranches suivantes)** : minimap + filtres (Erik l'activera), panneau latéral contextuel restylé (unité/historique/journal — tranche 2), migration des boutons Rendements en filtres de minimap.

## 2. Décisions tranchées (réponses Erik du 01/10 + défauts pilot — vetoables)

- **D1 — Mode dev : caché par défaut, raccourci + engrenage.** Un **raccourci clavier** (ex. Ctrl+Alt+D — à consigner) ET un **petit bouton engrenage discret** (coin de l'écran, liseré or) basculent l'affichage du calque dev ; l'état est mémorisé (localStorage, par joueur ? par machine — défaut machine). Les éléments dev identifiés en L1 disparaissent/réapparaissent SANS changer de layout au point de casser la barre AAA (réservés ou masqués proprement).
- **D2 — Inventaire dev (à confirmer en L1, défaut pilot)** : lien **Lobby**, **Ordres**, **Resync**, **Rendements** (le cycle 3 états — devient plus tard un filtre de minimap ; en T1 il part dans le calque dev), **Debug**, **état brut (debug)**, statut **open**, code de partie dans la barre. **Restent joueur** : tour, civ/ère, trésorerie/GPT, palier d'or, jalons culturels (0/20), gouvernement, recherche, timer, « Vous jouez : X » (intègre la barre AAA élégamment), adversaires (en T2 pour le panneau latéral — en T1, version compacte barre ou masqué 🔶).
- **D3 — Barre supérieure AAA** : bandeau sombre plein écran (tokens LOBBY-PREMIUM/RAPPORT-ENGAGEMENT : or, serif, ombres douces) — à gauche les **chips de ressources** avec les icônes vectorielles existantes (or +GPT, science, palier d'or « 100 or : 0 % », jalons 0/20 avec icône culture) ; ensuite civ + ère (bannière compacte) ; à droite gouvernement + recherche + timer (si défini) + « Vous jouez : X » discret. Tour bien visible. Lisibilité d'abord.
- **D4 — Portrait dirigeant** : médaillon à droite sous la barre (comme Civ VI) avec l'asset dirigeant de la civ du joueur (**Napoléon, Alexandre, Cléopâtre** — DIRIGEANTS livrés 14/09) ; **fallback : logo or de la nation** (`nations.ts`) pour les civs sans dirigeant dessiné ; tooltip nom du dirigeant. Jamais de trou ni de déformation (les `logoEchelle` existants font foi pour les logos).
- **D5 — Bouton de fin de tour circulaire** : en bas à droite, gros bouton rond AAA — états : **normal** (or), **blocage production** (ambre, cliquable, toast du motif — comportement `ad7afda` intouché et réexigé), **résolution en cours** (désactivé/animé), **unités en attente** : badge compteur + libellé « Unités en attente d'ordres » au-dessus. Le clic conserve TOUT le comportement existant (toast motif, orientation ville fautive incluse). Raccourci Entrée existant inchangé.
- **D6 — Zéro régression fonctionnelle** : sélection, mêlée, RAPPORT-ENGAGEMENT (popover intouché), relecture REPLAY-RESOLUTION (bouton « ⟲ Rejouer » reste accessible — il migre proprement avec le journal, la géométrie exacte est 🔶 à l'œil), vue ville, worked tiles, zone cultivée. Les tests existants qui assertent le DOM de la topbar sont mis à jour vers la nouvelle structure (le comportement testé ne change pas).
- **D7 — Responsive minimal** : cible 1920×1080 (FENETRE-GRANDE) ; en dessous, la barre dégrade sans casser (chips compressées) — pas de travail mobile.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, note l'état. Inventorie la topbar/colonne actuelle (fichier:ligne) et **classe chaque élément dev/joueur** (D2) — le tableau est dans le rapport.
- Regarde Civ VI (l'image d'Erik) et `RapportCombat.svelte` pour le niveau de finition attendu.

### L1 — Calque dev (D1/D2)
- Composant/directive de visibilité dev (contexte Svelte + localStorage), engrenage + raccourci, tableau des éléments dev appliqué. Les éléments dev gardent leur fonction quand affichés.

### L2 — Barre AAA + portrait (D3/D4)
- Nouvelle topbar (chips avec icônes existantes), médaillon dirigeant avec fallback. Tooltip dirigeant.

### L3 — Bouton circulaire (D5)
- Bouton rond bas-droite avec états et compteur d'attente ; intégration stricte des comportements de blocage existants (tests `fin-de-tour-blocage-ux` adaptés, pas affaiblis).

### L4 — Vérification
- Suites + typecheck verts ; e2e solo : parcours complet (sélection, ordres, fin de tour avec blocage → toast + orientation, relecture accessible, mode dev toggle et persistance).
- **Captures `dev-logs/captures-ui-t1/`** avant tout commit : écran complet en mode joueur, même écran en mode dev, états du bouton (normal/blocage/attente/résolution), portrait avec fallback logo, comparaison avant/après.

### L5 — ARRÊT POUR APPROBATION D'ERIK
Présenter captures vs l'image Civ VI + le tableau dev/joueur. Le look est subjectif — 🔶 à l'œil (position des chips, taille du médaillon, diamètre du bouton). NE COMMITTER QU'APRÈS FEU VERT.

### L6 — Rapport
- `REPORT-UI-JEU-T1.md` : tableau des éléments dev/joueur, tokens réutilisés, captures, ce qu'Erik valide en ligne, 🔶 (raccourci, placement, tailles), préparation T2 (panneau latéral) et T3 (minimap).

## 4. Critères d'acceptation
1. En mode joueur, l'écran ne montre AUCUN élément de dev ; le raccourci/engrenage les révèle, mémorisés entre sessions.
2. La barre supérieure AAA présente les infos joueur (ressources, tour, civ/ère, gouvernement, recherche, timer) sans surcharge, au niveau de finition du rapport de combat.
3. Portrait dirigeant avec fallback logo, sans trou.
4. Le bouton circulaire porte tous les états existants (blocage/toast/orientation compris) ; Entrée inchangée.
5. Aucune fonction perdue ; suites vertes ; zéro changement moteur/serveur/protocole ; captures fournies.

## 5. Périmètre interdit
- Minimap/filtres (T3, parké par Erik), panneau latéral restylé (T2), moteur/serveur/protocole, 3D, la sableuse, la coquille ;
- Supprimer un élément (tout se cache ou se déplace) ; toucher aux règles ou aux valeurs ; les autres pages (lobby, ateliers).
