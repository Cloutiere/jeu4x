# REPORT-ICONES-UNITES — Icônes d'unités (bannière, terrain, garnison compacte)

Mission exécutée le 11/10 d'après HANDOFF-ICONES-UNITES.md (décisions Erik 07/10, D1-D5). Client seul, `schemaVersion` 27 inchangé, moteur/serveur/3D intouchés.

## Livré

- **Module pur `apps/web/src/lib/render/icones-unites.ts`** (testé, sans PixiJS) :
  - mapping D4 data-driven `nomIconeUnite(type)` → `icone_unite_<type>.png` ;
  - table des alias d'uniques R-148 DÉPLACÉE ici depuis textures.ts (source partagée sprites/icônes — l'icône de la base dessert ses uniques : `guerrier_jaguar` → icône guerrier) ;
  - `iconeBannierePour` (D1 : unités seules, art chargée sinon `null` = initiale en repli) ;
  - `geometrieBarre` (D2 : carré −40→−20, gap 2, barre 58 à x −18 — empreinte totale 80 INVARIANTE ; sans icône : géométrie historique exacte 80/76) ;
  - `modeGarnison` (D3 : case de ville visible + pas d'anim + pas 3D/fondation → sprite masqué, `index 0` visible avec badge `×N`, suivantes masquées).
- **Pipeline** : profil `icone-unite-guerrier` (mode « icône » 64×64, source `new_icones/units/guerrier_icone_trsp.png` — JAMAIS commitée, déjà ignorée par git) → `assets-src/exports/` → `apps/web/public/art/icone_unite_guerrier.png`. Les icônes suivantes = un profil + un PNG, zéro code.
- **textures.ts** : champ `iconesUnites: Record<string, Texture|null>` — chargement optionnel par type (absent = repli), alias résolus, jamais de trou.
- **GameCanvas** :
  - D1 — sprite `prodIcone` dans le cercle production de la bannière (même position que l'initiale) ; bâtiment/unité sans art → initiale ; ennemi → rien (D3 bande) ;
  - D2 — carré sombre à liseré blanc teinté à l'accent du propriétaire (même mécanique que les barres de PV) À GAUCHE de la barre, icône posée dedans, barre réduite proportionnellement ;
  - D3 — garnison compacte : toute unité sur une case de VILLE visible (amie ou ennemie — l'état filtré ne contient que du visible, D5 respecté) affiche icône+barre seules, centrée (pas de décalage de mêlée), pile = badge `×N` sur la première unité, les suivantes masquées ; jamais pendant un déplacement (anim), ni 3D, ni fondation.
- **Tests** : `icones-unites.test.ts` (18) + bande-ville.test.ts mis à jour (`iconeItem` dans les segments). Web : **639/639** ; svelte-check 0 erreur.

## Vérification GUI (devtmp/icones-unites-gui.mjs, captures `dev-logs/captures-icones-unites/`)

6 captures relues par le juge visuel : t1 garnison compacte, t2 campagne (carré+barre côte à côte), t3 pile ×2 (2e unité masquée), t4 bannière guerrier (icône), t5 bannière grenier (« G »), t6 colon repli sans carré (barre 80 historique). Un chevauchement barre/icône détecté à la 1re passe a été corrigé (la barre démarre maintenant APRÈS le carré).

## 🔶 À l'œil d'Erik

1. **Calibres** constants 🔶 dans `icones-unites.ts` (`ICONES_UNITES`) : carré 20, icône 16, gap 2, liseré 2 — éditables à l'œil sans code.
2. **Icône dans le cercle** : échelle `rayonProd × 1,6` (≈16 px) — calibrable.
3. **Style du carré** : fond sombre + liseré accent (choix fait faute de référence) — Erik peut vouloir un fond plein à l'accent.
4. **Z-order sprite/bannière** (relevé par le juge visuel sur t4-t6) : préexistant et voulu (bannière à zIndex −94, SOUS les unités — retour Erik 08/10), pas une régression de cette mission.
5. **Badges 😴/✚/écu/espion** : inchangés (D2), positions relatives au sprite — en garnison ils restent à la hauteur du sommet du sprite masqué 🔶 (arrangement final à l'œil).

## Icônes attendues pour les autres unités (pipeline prêt)

Déposer `new_icones/units/<type>_icone_trsp.png` + profil `icone-unite-<type>` (mode icône 64×64) → `public/art/icone_unite_<type>.png`. Priorités suggérées : colon, archer, piquier, cavalier, catapule/catapulte, galère — l'ordre n'importe pas, le repli initiale couvre tout intervalle. Les uniques suivent automatiquement l'icône de leur base (alias).

## Vague 2 — 28 icônes supplémentaires (livrées 12/10, Erik)

29 sources `new_icones/units/*_icone_trsp.png` cuites en 64×64 (mode « icône »), toutes RGBA transparentes vérifiées au pixel :

- **Directes** : archer, artillerie, bombardier, canon, caravane, catapulte, cavalier, chevalier, colon, croiseur, chasseur, fusilier, galère, galion, guerrier (recuite — source Erik mise à jour), infanterie_moderne, légion, milice, sous-marin, espion, char_d_assaut (tank), cuirasse (battleship), caravane.
- **Grandes personnalités** : artiste_penseur (great_artist), bâtisseur (great_builder), humanitaire (great_humanitarian), leader (great_leader), savant (great_scientist).
- **icbm** : seule source en JPEG — cuite et vérifiée transparente (RGBA).
- **🔴 piquier EXCLUE puis RÉTABLIE** : la source v1 ne contenait que la lance verticale (2 % du cadre — illisible aux tailles du jeu, Erik informé avec aperçu aux calibres réels) ; **Erik a refait la source v2 (hoplite complet, 46 % du cadre)** — cuite 13/10.
- **explorateur** : `great_industrial_icone_trsp.png` EST l'explorateur (précision Erik 13/10) — cuite comme telle.
- **val** (bombardier lourd du Japon, non implémenté) : alias ajouté vers le bombardier (icône + sprite).
- **Couverture COMPLÈTE** : 30 icônes cuites, les 31 types de base du moteur ont leur icône (les 24 uniques suivent leur base par alias). Style Erik = l'objet-symbole (arc, lance, canon…), assumé.

Juge visuel sur planche-contact (`devtmp/planche-icones-unites.png`) : **28/29 pass** (le fail = piquier v1, remplacée depuis). Aucun halo d'arrière-plan, aucune coupure, aucune déformation.
