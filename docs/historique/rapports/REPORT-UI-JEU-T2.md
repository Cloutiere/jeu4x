# REPORT-UI-JEU-T2 — Colonne de droite restylée (AAA) (01/10/2026)

Mission exécutée selon `HANDOFF-UI-JEU-T2.md` — **2D uniquement, client seul, zéro changement moteur/serveur/protocole**. Rien de committé : **arrêt pour approbation d'Erik (L3)** — le look est 🔶 à l'œil.

## 1. Livré (restyle D1-D3, structure et fonctions inchangées)

1. **Panneau UNITÉ** (`UnitPanel.svelte`) — bloc AAA (fond dégradé chaud #241f16→#1b1712, liseré or doux, ombre, coins 10 px), titre « UNITÉ » serif or sur séparateur dégradé (même trait que RapportCombat) ; **nom de l'unité en serif** ; **PV en barre à compartiments** (même langage que la barre 3 vies du canvas et le popover : cellules or pleines / rouge « perte », texte `PV 3/3` rosé quand blessé) ; PM inchangé ; **ordre courant en encart or** ; boutons au style des chips (or-sur-sombre ; primaire or rempli ; danger rouge brique ; survol halo). Tous les menus (attaque, Oracle, GP, espionnage, ICBM, cargaison) héritent du style, markup intact.
2. **HISTORIQUE** (`Historique.svelte`) — même bloc AAA ; entrées couleur par genre (good vert / bad rouge) ; horodatage « Tour N » en serif or.
3. **JOURNAL** (`Journal.svelte`) — même bloc AAA ; **entrées cliquables INCHANGÉES** (centrage `centerOnHex`, zoom préservé — revérifié e2e) ; numéro `#seq` en or ; survol or-clair.
4. **« ⟲ Rejouer la résolution »** (Game.svelte) — bouton serif or au niveau du reste (état actif : rempli or + halo) ; comportement intact (relecture, indisponibilité reconnexion + tooltip, Échap).
5. **ADVERSAIRES (§1.5, 🔶)** — nouveau panneau compact en **pied de colonne** (option « panneau latéral » du handoff) : une entrée par adversaire avec liseré or, **nom + 🤖 si bot, civilisation — dirigeant, ère** (infos publiques déjà affichées dans le badge). Le badge civ/ère de la barre T1 reste inchangé (résumé). Masqué s'il n'y a pas d'adversaire.
6. **Ligne ⚔ (§1.6, bonus 🔶 RAPPORT-ENGAGEMENT)** — en tête du journal : « ⚔ n combats ce tour » (style chip rouge brique), **cliquable → ouvre le popover RAPPORT-ENGAGEMENT de la DERNIÈRE case de combat du tour** (mécanique 100 % existante : `ouvrirRapport` + nouveau helper pur `derniereCaseDeCombat` dans `lib/rapport.ts`, testé). Absente quand aucun combat ce tour. Vérifiée e2e : le popover s'ouvre, aucun chevauchement avec le bouton circulaire.

**D2 respecté** : largeur 350 px conservée, scroll interne, pas de collapsible. **D1 respecté** : ordre vertical Unité → Vaisseau (si présent, restylé au même langage) → Historique → Rejouer → Journal → Adversaires → (calque dev) État brut. **D4 respecté** : aucun test affaibli ; le calque dev T1 (rangée DEV + état brut) est intact.

## 2. Vérifications

- Suites : **web 432/432** (baseline 431 + 1 nouveau : `derniereCaseDeCombat` — dernière case chronologique / null sans combat), `svelte-check` **0 erreur** (14 warnings préexistants), **typecheck monorepo 4/4**.
- e2e GUI réel (Vite 5174 + wrangler 8787, partie solo `3MQCV3` résolue au tour 4 puis tour 5 avec un Move réel) : sélection d'unité (panneau rempli, barre PV), **journal cliquable** (« u1 se déplace vers (-3,21) » → centrage, zoom préservé), **relecture depuis le bouton** (bandeau « Relecture du tour », bouton → « Quitter la relecture (Échap) », retour auto), **ligne ⚔ → popover Case (0,0)** (PV avant→après, sort « détruit ☠ ») sans chevauchement, **calque dev T1 intact** (Ctrl+Alt+D : rangée DEV + état brut dans la colonne restylée).
- Combats forgés via le hook dev `__rapport.inject` (même pipeline que le clic case) — le driver bot `rapport-e2e.mjs` bloque sur le blocage production fin de tour (comportement FIN-DE-TOUR-PRODUCTION attendu, hors périmètre).
- Contrôle après rechargement sans forge : **aucune erreur d'affichage** (les toasts « Erreur d'affichage » vus pendant la relecture proviennent de l'état forgé minimal du hook, pas du produit).

## 3. Captures (`dev-logs/captures-ui-t2/`)

| Fichier | Contenu |
|---|---|
| `avant-avant-tranche2.png` | AVANT (HEAD d19b6c3, worktree + Vite 5175, partie HX9RXU) — panneau unité rempli, colonne grise |
| `apres-panneau-unite.png` | APRÈS (5174, partie 3MQCV3) — panneau unité rempli (serif, barre PV), Historique, Journal, **Adversaires** (Bot 🤖, Zoulous — Shaka Zulu, Ère Ancienne) |
| `ligne-combats-rapport-popover.png` | ligne « ⚔ 1 combat ce tour » + **popover RAPPORT-ENGAGEMENT** ouvert par son clic (2 participants, barres PV, « détruit ☠ ») |
| `relecture-depuis-bouton.png` | relecture active : bandeau, bouton « Quitter la relecture (Échap) » en état or actif |
| `calque-dev-t1-intact.png` | calque dev T1 affiché dans la colonne restylée (rangée DEV + état brut) |

## 4. 🔶 à l'œil d'Erik

1. **Place des adversaires** : pied de colonne (choisi) vs détail sous le badge civ de la barre — et le niveau de détail (nom, civ+dirigeant, ère ; ajouter trésorerie/tour si voulu) ;
2. **Ligne ⚔** : conservée (elle alourdit peu) — libellé, couleur rouge brique, position en tête de journal ;
3. Largeur de colonne (350 px conservée) et densité des blocs ;
4. Barre PV du panneau unité (compartiments identiques au popover) vs l'ancienne ligne texte.

## 5. Notes & suivis

- `devtmp/wt-ui-t2` (worktree de la capture AVANT) supprimé après captures ; Vite 5175 arrêté.
- **T3 (parké)** : minimap + filtres — migration du bouton Rendements en filtre de minimap.
- Piège récurrent rappelé : Vite zombie sur 5174 (tuer le PID avant relance).
