# REPORT-BANDE-VILLE — bannière de ville style Civ VI, livré 08/10 (décisions Erik 07/10, D1-D7)

## Livré

- `apps/web/src/lib/render/bande-ville.ts` (NOUVEAU, pur, testé) : `BANDE_VILLE` (constantes 🔶 de calibrage — tailles/couleurs/positions, miroir de l'ancien badge-population.ts), `construireBanniere` (données → segments), `initialeDe` (premier GRAPHEME, accents sûrs), `rendementsVille` / `toursCroissanceBanniere` / `etaProductionBanniere` (MIROIRS EXACTS des formules d'affichage de PanneauVille : yields, prodPerTurn = ⌊brut × productionMult × (1+0,25×(pop−1))⌋, growthEta, etas[0]), `rectBanniereLocale` (géométrie partagée dessin + picking D6).
- `GameCanvas.svelte` : `buildCityContainer` pose la bande AAA or-sur-sombre (fond #1b1b22 α0,85, liseré #e8c96a) : rangée 1 = logo de nation (SVG or du lobby, `nations.ts`, préchargés au setup via `Assets.load` — `logosNation()` nouveau) + nom (ramené par échelle si long) + étoile capitale (D2) + cercle pop ; rangée 2 = `🌾 n` (tours avant croissance) + cercle production (INITIALE du `nomItem` — structure prête pour l'art d'Erik) + `n tour(s)`. Textes DURABLES par conteneur (créés une fois, mis à jour AVEC GARDE) : zéro allocation par frame et zéro création par rebuild (leçon VUE-VILLE-PERF — le pool n'apportait rien ici, conteneurs déjà durables). D5 : le badge pop actuel est SUPPRIMÉ (badge-population.ts supprimé, plus de doublon) ; la bannière est enfant du conteneur ville (zIndex −100 inchangé) : au-dessus du sprite, SOUS les unités. D3 : `getFilteredState` garde les villes ennemies visibles ENTIÈRES (production/foodStored inclus) — le masquage croissance/production/ETA est un contrat d'AFFICHAGE (`construireBanniere` re-masque par sûreté + les candidats ne sont même pas calculés pour l'ennemi). D4 : file vide → cercle production + ETA masqués (pas d'« Infinity » ni de zéro). La tête de production lit `fileEffective` (miroir MENU-VILLE-QUEUE : un SetProduction posé ce tour s'affiche immédiatement, pas l'état en retard d'une résolution).
- D6 — clic bannière = clic ville : `hexCibleSousEcran` substitue le hex de la ville AVANT `clickAction` quand le point tombe dans le rect bannière (même géométrie que le dessin) — l'alternance R-2, PanneauVille et le double-clic vue ville inchangés. `banniereSousEcranConteneur` lit la transform GLOBALE : correct en 2D (caméra/vue ville sur `world`), en vue ville et en 3D (world en identité, position écran posée par `projeterCalques3d`) — zéro calcul 3D nouveau. Les COPIES couture sont incluses.
- CARTE-RONDE T2 : les copies couture reflètent la bannière (enfants en ordre fixe, `syncCopie` transfère désormais aussi la TEXTURE des Sprites par identité — le logo arrive après la création des copies, chargement async).
- `syncCopie` : extension texture (une ligne sûre, comparaison d'identité).
- `nations.ts` : `logosNation()` exporté (URLs des logos non-réserve).
- `badge-population.ts` SUPPRIMÉ ; le test MENU-VILLE-RETOUCHES qui verrouillait sa pose est réécrit pour la bannière (rangée 1 entièrement au-dessus du sommet du sprite, jamais sur la tuile NE — le motif d'origine est conservé).

## L1 — test-first

`apps/web/tests/bande-ville.test.ts` ×22 (rouge : module absent) : segments complets à moi, D3 ennemie masquée même avec candidats (nom/pop/capitale publics), D4 file vide, item sans ETA mesurable, initiale (accents É, repli vide), croissance (miroir : ceil, surplus 0 → null, réserve au seuil → null, plafond 31 → null, Aqueduc), ETA (miroir : ppt 0 → null, item inconnu → null, ceil((coût−progression)/ppt)), rendements (nourriture, marteaux intérieur + Usine ×2, case ville 0/0/0), géométrie partagée (rect = deux rangées, rangée 1 au-dessus du sommet −64). Suites : **web 610 (+22 net) / rules 1057 / server 123 vertes, tsc 0 erreur, svelte-check 0 erreur** (17 warnings connus).

## L3 — vérification GUI réelle (PASS, captures relues)

`devtmp/bande-ville-gui.mjs` (phase A) + `devtmp/bande-ville-t5.mjs` / `devtmp/bande-ville-t8.mjs` (scénarios couture/clic isolés). Solo légal, civId france (logo), fondation au bord Est de la couture (col 38-39), wrangler dédié 8787. Captures `dev-logs/captures-bande-ville/` :
- **t1** capitale file vide : bande logo+nom+étoile+pop, rangée 2 = croissance seule, cercle production masqué (D4) — `popBg` absent (critère 4) ;
- **t2** item UNITÉ : initiale **G**, ETA « 9 tours » / « 3 tours » selon parties, croissance 🌾 (D1) ;
- **t3** item BÂTIMENT : Bibliothèque initiale **B** + ETA (le Temple est ÉVITÉ : la Cathédrale du bonus « premier découvrir » le REMPLACE — R-111 —, SetProduction temple refusé en silence, découvert en GUI) ;
- **t4** ville ENNEMIE visible : nom + pop + étoile seuls, AUCUNE rangée 2 — preuve anti-fuite au dump : la production ennemie EXISTE dans l'état (ex. `{kind:'wonder',id:'compagnie_des_indes'}`) → masquée à l'écran (D3) ;
- **t5** capitale au bord Est : rendu copié au-delà de la couture, minimap à deux cadres (même ville des deux côtés) — couture propre ;
- **t6/t7** zoom avant/arrière : bannière lisible et proportionnée (D5) ;
- **t8** clic bannière RÉEL (souris playwright) : PanneauVille ouvert (« File de production 0/4 ») — le cycle R-2 est respecté : une ville DÉFENDUE sélectionne la garnison au 1er clic, la ville vient après le dernier occupant (le clic bannière suit EXACTEMENT la sémantique du clic case, D6).

## 🔶 Calibrages à l'œil d'Erik

Tailles/alpha/positions dans `BANDE_VILLE` (bande 140×26 à y −86, rangée 2 132×18 à y −58, polices 11-13). La bannière passe SOUS les unités (D5 tranché) : dans un siège, les sprites assiégeants la recouvrent partiellement — conforme, à l'œil. ETA « 0 tour » affiché quand l'item finit à la prochaine résolution (progress ≥ coût) : honnête, à l'œil.

## D7 (choix de l'agent, consignés)

- Vue ville zoomée : bannière RESTE visible (miroir de l'ancien badge ; Civ VI garde la sienne) — le clic bannière y est inerté (le clic gauche en vue ville ne gère que les worked tiles).
- Relecture : la bannière lit `scene.state` comme tout le rendu → suit automatiquement l'état pré-résolution rejoué, rien à coder.
- 3D : la bannière est un enfant du conteneur ville projeté — s'affiche sur le rendu 3D comme le badge pop avant elle ; zéro ligne de 3D modifiée.

## Pièges consignés (GUI, ~15 runs)

- `handleOrder` ne broadcast PAS le snapshot de l'ordre : un ordre posé par un WS script est invisible de la PAGE avant la résolution suivante — les asserts d'affichage attendent l'état résolu, et `finirTour` RE-POSE production/recherche à chaque tour (ordres perdus pendant le verrou de résolution).
- Fin de tour bloquée (BLOCAGE-NAVIGATION) : file vide = EndTurn refusé nommé — après une complétion, la production suivante est reposée à chaque tour jusqu'à l'application.
- R-184 : une recherche COMPLÉTÉE re-posée est refusée → EndTurn refusé en boucle ; le repli pose une tech ÉLIGIBLE (prereqs validés).
- R-90 : la science ne coule qu'en conversion science (défaut or) — `SetConversion` est un message TOP-LEVEL (pas un SubmitOrder : « type d'ordre inconnu » sinon).
- Les colonnes de carte sont en q axial brut (peut être négatif) : col couture = `(q + ⌊r/2⌋) mod W`, JAMAIS q brut (miroir wrap.ts).
- Les bâtiments exigent tous une tech (champ `tech`, pas `prereq`) : Bibliothèque←alphabet ; et le bonus « premier découvrir » peut doter un REMPLAÇANT (Cathédrale) qui rend le remplaçé non constructible (R-111) — item de test choisi sans remplaçant.
- Les barbares rasent une capitale sans garnison (CityRazed) et tuent les marcheurs isolés : défense fortifiée immédiate + chemins évitant les camps + relèves.
- Victoire du bot : la partie peut se terminer (status finished) pendant les scénarios — détectée, tentative suivante.
- `Assets.cache.get` émet un warning par URL absente : `logosCharges` (vidé au setup — les textures meurent avec le renderer à la bascule 2D↔3D).
- Migrations SetWorkedTile : appliquées à la résolution, parfois visibles un tour plus tard — les asserts attendent leur présence dans l'état.
- Le clamp caméra (demi-fenêtre − ~33 px) rend la double visibilité base+copie géométriquement impossible à 1600 px : t5 prouve le wrap par le rendu copié + minimap à deux cadres ; les CONTENEURS copie existent et se synchronisent (D6 les prend en compte pour le picking).
- Exception console préexistante observée pendant les préviews de longs chemins (`badgeTour`/`avecCopies`, badges de tours multi-tours) : hors périmètre, à cadrer séparément.

## Périmètre respecté

Moteur/serveur/protocole/schemaVersion 27 intouchés ; PanneauVille inchangé (l'affichage du panneau et le clic case restent les seuls points d'entrée — D6 est une substitution de hex, pas une nouvelle action) ; données de ville inchangées ; 3D intouchée.
