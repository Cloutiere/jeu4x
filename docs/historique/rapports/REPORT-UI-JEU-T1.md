# REPORT-UI-JEU-T1 — Écran de jeu, tranche 1 (01/10/2026)

Mission exécutée selon `HANDOFF-UI-JEU-T1.md` — **client seul, zéro changement moteur/serveur/protocole**. Rien de committé : **arrêt pour approbation d'Erik (L5)** — le look est 🔶 à l'œil.

## 1. Livré

1. **Calque dev (D1/D2)** — `apps/web/src/lib/calqueDev.ts` : store Svelte `calqueDev` (caché par défaut), mémorisé par machine (localStorage `calque-dev`), bascule par **Ctrl+Alt+D** (global, `svelte:window`) ET **bouton engrenage ⚙** à droite de la barre (liseré or, état actif illuminé). Les éléments dev migrent dans une rangée secondaire « DEV » sous la barre : lien Lobby, code de partie, puce Ordres/Résolution, statut réseau (open/connecting/closed), Verrouillé, Resync, Rendements, 3D (si drapeau), Debug. L'**état brut (debug)** de la colonne de droite est aussi dans le calque. Tous gardent leur fonction quand affichés.
2. **Barre supérieure AAA (D3)** — Game.svelte restructuré en 3 zones (tokens LOBBY-PREMIUM : fond dégradé sombre chaud, liseré or, serif) :
   - **gauche** : chips Or (trésorerie + GPT, icône), Palier d'or « 100 or : 0 % », Jalons culturels 0/20 (icône culture), Recherche (icône science + minibar de progression), Gouvernement (icône) ;
   - **centre** : **Tour bien visible** (puce serif, chiffre or) + badge civ/ère + adversaires (bouton → panneau gouvernement, inchangé) ;
   - **droite** : « Vous jouez : X » (discret — migré de la colonne de droite, D2) + engrenage.
3. **Portrait de dirigeant (D4)** — `apps/web/src/lib/dirigeants.ts` : médaillon circulaire en haut à droite de la carte (façon Civ VI), liseré or double anneau. France→`dirigeant_napoleon.png`, Grèce→`dirigeant_alexandre.png`, Égypte→`dirigeant_cleopatre.png` ; **fallback logo or de la nation** (`nations.ts`, `logoEchelle` respecté) ; **dernier recours : initiale or** (civ neutre/inconnue) — jamais de trou. Tooltip = nom du dirigeant.
4. **Bouton de fin de tour circulaire (D5)** — bas-droite de la carte, 5,4 rem, icône `icone_fin_tour.png`, anneau or + halo :
   - **normal** (or) · **blocage** (ambre, CLIQUABLE — `requestEndTurn` toast le motif, comportement ad7afda intact et retesté) + libellé « Fin de tour bloquée (N) » au-dessus · **résolution/relecture** (désactivé + animation pulsation) ;
   - **badge « Unités en attente d'ordres (N) »** au-dessus (même prédicat R-81 que le menu, masqué si blocage) ;
   - **Entrée inchangée** (raccourci existant), dialogue « unités sans ordre » inchangé.

## 2. Tableau dev/joueur (inventaire D2 — constaté)

| Élément | Classe | Destination T1 |
|---|---|---|
| Lien « ← Lobby » | dev | calque dev (barre) |
| Code de partie | dev | calque dev (barre) |
| Puce Ordres/Résolution | dev | calque dev (barre) |
| Statut réseau (open…) | dev | calque dev (barre) |
| Resync | dev | calque dev (barre) |
| Rendements (cycle 3 états) | dev | calque dev (barre) — futur filtre minimap T3 |
| 3D (drapeau config.rendu3d) | dev | calque dev (barre) |
| Lien Debug (#/debug) | dev | calque dev (barre, dev uniquement) |
| État brut (debug) | dev | calque dev (colonne droite) |
| Tour | **joueur** | barre centre (puce serif or) |
| Civ + ère + adversaires | **joueur** | barre centre (badge) |
| Trésorerie/GPT, palier d'or | **joueur** | barre gauche |
| Jalons culturels 0/20 | **joueur** | barre gauche |
| Recherche (tech + progression) | **joueur** | barre gauche (bouton) |
| Gouvernement | **joueur** | barre gauche (bouton) |
| « Vous jouez : X » | **joueur** | barre droite (discret) |
| Bouton Fin de tour | **joueur** | bouton circulaire bas-droite |
| Verrouillé | joueur (signal) | calque dev (affiché quand verrouillé — utile surtout en dev) 🔶 à l'œil |

**Restés en place** : colonne de droite (Unité, Vaisseau, Historique, Rejouer la résolution, Journal — restyle T2), vue ville, popover RAPPORT-ENGAGEMENT (intouché), toasts, modales (ICBM, Angkor, victoire).

## 3. Vérifications

- Suites : **web 431/431** (baseline 420 + 11 nouvelles `tests/ui-jeu-t1.test.ts` : calque dev défaut/persistance/raccourci, portraits+fallbacks, câblage Game.svelte), `svelte-check` **0 erreur** (14 warnings préexistants), typecheck monorepo **0 erreur**.
- Tests existants non affaiblis : `fin-de-tour-blocage-ux` (options 1+2 HANG-LOCAL) et `reglages-calibrage` passent **inchangés** — le bouton garde `disabled`/`title={myBlocages…}`/`onclick={requestEndTurn}` dans le même ordre.
- **e2e GUI réel** (Vite 5174 + wrangler 8787, deux parties solo créées via WS puis via le vrai lobby) : parcours sélection/badge attente, fin de tour avec blocage tour 5 (EndTurn refusé tour 6 — reproduit le scénario HANG) → **toast « Ville1 : sélectionnez une production (3 marteaux/tour) » + libellé ambre + orientation Ville1 (option 2)**, relecture « ⟲ Rejouer la résolution » accessible, bascule engrenage **et** Ctrl+Alt+D, **persistance localStorage vérifiée après reload**.

## 4. Captures (`dev-logs/captures-ui-t1/`)

| Fichier | Contenu |
|---|---|
| `avant-avant-tranche1.png` | AVANT (HEAD fab4963, worktree, Vite 5175) — barre historique tout mélangé |
| `mode-joueur-1920.png` | APRÈS mode joueur — partie sans civ (fallback initiale or « S ») |
| `mode-joueur-portrait-napoleon.png` | APRÈS mode joueur, civ France — **portrait Napoléon**, badge attente (2), bouton rond |
| `mode-dev-affiche.png` | même écran, calque dev affiché (rangée DEV + état brut) |
| `bouton-blocage-toast.png` | état **blocage** : bouton ambre, « Fin de tour bloquée (1) », toast du motif, Ville1 sélectionnée |
| `bouton-resolution.png` | bandeau « Relecture du tour » pendant la relecture (bouton désactivé/animé sous le badge) |

## 5. Ce qu'Erik valide en ligne (🔶 à l'œil)

1. Position/densité des chips de la barre (ordre actuel : Or, Palier, Jalons, Recherche, Gouvernement) ;
2. Taille du médaillon (5,6 rem) et sa position (haut-droite de la carte) ;
3. Diamètre du bouton circulaire (5,4 rem) et la place du badge d'attente ;
4. Le raccourci **Ctrl+Alt+D** (consigné, modifiable) ;
5. Le badge « Unités en attente d'ordres » au-dessus du bouton (vs intégré dans le bouton) ;
6. La puce « Verrouillé » rangée dans le calque dev.

## 6. Notes & suivis

- La partie « SQWFRP » créée par WS avec `settings.civId:'france'` est restée « Sans civilisation » — la civ de l'hôte ne passe pas par ce chemin de création WS direct (le vrai lobby l'applique correctement, cf. capture Napoléon). **Const client seul, non approfondi** (hors périmètre ; à recouper si Erik le voit en jeu).
- **T2 (parké)** : restyle du panneau latéral (unité/historique/journal), adversaires en panneau.
- **T3 (parké)** : minimap + filtres — migration du bouton Rendements en filtre de minimap.
- Piège récurrent rappelé : Vite zombie sur 5174 (tuer le PID avant relance).
