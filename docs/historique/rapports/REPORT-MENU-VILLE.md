# REPORT-MENU-VILLE — La vue ville (double-clic : zoom incliné + tuiles + menu dédié)

**Mission exécutée intégralement (M1+M2+M3+M4), zéro gameplay.** Décisions d'Erik du 13/09 appliquées au pied de la lettre (HANDOFF-MENU-VILLE.md). Validation locale en partie solo AVANT tout commit (règle établie) — captures dans `dev-logs/captures-menu-ville/`. **Pas de commit** (sur demande explicite d'Erik).

## État final

- **Tests : 1 083 verts** (rules 777 — dont 6 nouveaux `menu-ville.test.ts` ; web 234 — dont 7 nouveaux `menu-ville.test.ts` ; server 72).
- **Typecheck 4/4.** `schemaVersion` **21** (migration 20→21 additive — voir M1).
- Zéro diff 3D (`render3d/` intact — la vue ville est 2D pure), `orderShapeError` intouché, aucun ordre nouveau, aucune règle modifiée (affichage seul).

## M1 — État de vue + noms de villes

1. **`vueVille: CityId | null`** — store client dédié (`createVueVille()` dans `ui.ts`, JAMAIS dans l'état du GameDO). Double-clic sur une ville du joueur = entrée ; le simple clic garde toute sa sémantique (sélection/alternance/worked tiles inchangés hors vue ville).
2. **Noms des villes** : champ additif **`City.name?: string`** (il n'existait pas — optionnel pour ne pas casser les 141 fichiers/fixtures qui construisent des villes ; l'UI retombe sur l'id via `nomDeVille`). **Migration 20→21** : backfill « VilleN » déterministe, **compteur PAR JOUEUR** (villes de chaque propriétaire par id croissant — le Ville1 d'Erik et le Ville1 du bot coexistent), nom déjà porté = intact, idempotent. Table data-driven **`NOMS_PAR_CIVILISATION`** (vide, en réserve — `noms.ts` : Erik remplira sans code ; premier nom libre de la liste, puis fallback VilleN). Nom attribué à la **fondation** (R-64, `processFoundCity`) ET à la ville Mongole issue de hutte ; les **capitales préfabriquées** reçoivent aussi leur VilleN à la création de carte (vérifié en solo Pangée). Les villes **capturées gardent leur nom** (rien à faire — le champ suit la ville).

## M2 — La vue ville (le rendu)

- **Fausse perspective** (pas de perspective plugin) : conteneur `world` compressé verticalement **×0,75** et zoomé **×2** sur la ville (`poseVueVillePour`, constantes 🔶 `VUE_VILLE_COMPRESSION_Y`/`VUE_VILLE_ZOOM` en tête de `hexView.ts`). Entrée **animée** (450 ms, ease-in-out), sortie **animée** vers la caméra 2D exacte ; hors animation, la pose est **statique — aucun recalcul par frame** (le tick n'écrit la transform que pendant l'animation).
- **Picking par la transform inverse** (jamais les maths écran brutes) : `mondeSousEcranVueVille`/`hexSousEcranVueVille` (purs, testés — « clic en vue inclinée = la même tuile qu'à plat », prouvé par la double comparaison plat/incliné). Vérifié en jeu : `pickAt` sous le curseur de la ville inclinée renvoie bien (5,15).
- **Tuiles du rayon affichées** : en vue ville, les cases cultivables du rayon `workRadiusOf` (**6 cases, 18 avec Tribunal — vérifié en solo avec la Grèce**, capture 06) s'illuminent (remplissage discret accent joueur, plus présent sur les non-travaillées) + **rendements automatiques** (bloc showYields forcé — icônes sur tout le rayon, même hors assignation). Les marqueurs worked tiles + zone (ZONE-CULTIVEE/anneaux) vivent dans le conteneur et suivent le clic en temps réel.
- **Culling** : le rect de rebuild suit la pose de vue ville (compression Y comprise).
- **Vue modale** : pendant la vue — pan/préview clic droit/molette/survol/flèches désactivés, clic gauche = uniquement `clickActionVueVille` (pur : assigne/désassigne dans le rayon, miroir exact de la règle 1 de `clickAction`, état EFFECTIF), les menus de carte disparaissent (header réduit + panneaux masqués dans `Game.svelte`). **Sortie par les 3 voies** (bouton Fermer, Échap, double-clic hors de la ville) → retour animé, UI de carte intacte (capture 05).

## M3 — Le menu (CityView.svelte — nouveau composant, NE remplace PAS CityPanel)

Contenu EXACT des 7 éléments, rien d'autre : ① nom (VilleN, + capitale/civ/pop/rayon) ; ② nourriture +X/tour **et tours avant prochaine population** (`toursAvantCroissance` réutilisé tel quel — capture : « Prochaine population dans 4 tours », « Plafond » au cap) ; ③ marteaux/tour, **item courant (nom + icône) et tours restants** (jauge ; « changement en attente » reflète la file d'ordres) ; ④ **sciences ET or produits par cette ville** (conversion R-90, miroir CityPanel : conversionGains × Troyes/Internet × Settle) ; ⑤ **trésorerie totale de la civilisation** (R-134) ; ⑥ liste des bâtiments (+ merveilles avec obsolescence) ; ⑦ **choix de production à onglets unités / bâtiments / merveilles** — mêmes sources que CityPanel (`optionsUnites`/`optionsBatiments`/`wonderProductionIssue`) : garde-fous affichés à l'identique (tech requise, accès mer, exclusivité mondiale, jalons ONU, uniques de civ — vérifié : tout l'onglet Bâtiments grisé au tour 1 sans techs, unités débloquées actives).

## M4 — Vérification

- **Tests nouveaux** : `packages/rules/tests/menu-ville.test.ts` (compteur par joueur, table en réserve, fondation nommée via `resolveTurn`, migration 21 déterministe/idempotente/nom préservé) ; `apps/web/tests/menu-ville.test.ts` (pose de vue, **picking incliné = plat**, `clickActionVueVille` : assigner/désassigner/hors rayon/case occupée/ville pleine/résolution).
- **Assertions schemaVersion 20 → 21 mises à jour** dans les tests qui verrouillaient la version (forfeit, state, conversion, culture, deplacement-planifie, expansion-culturelle, phase7g/h/j/l/n/o, research, economy, phase7o, server/barbares) — commentaires « la chaîne continue (MENU-VILLE) ».
- **e2e solo** (captures `dev-logs/captures-menu-ville/`) : ① entrée double-clic (zoom incliné + tuiles + menu) ; ② clic tuile occupée = refus honnête ; ③ désassignation temps réel (+4 → +2 nourriture au clic, zone/anneaux suivent) puis réassignation (+4) ; ④ production Guerrier depuis le menu (file d'ordres, ETA) ; ⑤ sortie Fermer → carte à plat, UI intacte ; ⑥ Grèce Tribunal = 18 cases. Échap et double-clic hors ville également exercés en jeu.
- **Bench** : la pose est posée une seule fois à la fin de l'animation ; aucun coût par frame en vue stable (aucun code de la vue dans la boucle hors animation). Dev hook étendu (`__game.vueVille/doubleClickAt`, `screenOf`/`hexToPage` compatibles compression).

## Arbitrages 🔶 (calibrage à l'œil par Erik)

- Compression Y 0,75, zoom 2,0, durée 450 ms — constantes en tête de `hexView.ts`/`GameCanvas.svelte`.
- Style de l'illuminage du rayon (alphas 0,08/0,16 + liseré 0,35) — bloc `MENU-VILLE` de `rebuildOverlay`.
- Placement du menu (panneau droit 430 px au-dessus de la carte) et du chip d'aide dans le header.
- Pendant la vue ville, les rendements s'affichent sur toute la carte explorée (seules les tuiles du rayon sont surlignées/utiles à l'écran).

## Révision v2 — retours d'Erik du 13/09 (validée en solo, captures 07-08)

1. **Plus d'inclinaison** : la compression verticale (×0,75) est SUPPRIMÉE — la vue ville est un zoom À PLAT (aucun effet d'angle). `PoseVueVille` réduite à {x, y, scale}.
2. **Zoom calculé pour cadrer TOUTES les tuiles cultivables, ENTIÈRES** : `poseVueVillePour` calcule l'échelle qui fait tenir tout le rayon de travail (6 cases, 18 avec Tribunal), sommets compris, dans l'espace LIBRE à gauche du panneau de ville — rayon 2 ≈ ×1,99 sur 1832×1078 (aller-retour Erik : d'abord renforcé ×2,12 puis ajusté — le haut/bas des tuiles extrêmes était coupé ; la demi-hauteur réservée est maintenant un hexagone complet), rayon 1 → jusqu'au zoom max. Test par propriété : chaque tuile du rayon 2, sommets compris, tient dans l'espace libre.
   **Ville CENTRÉE + suivi du redimensionnement** (retour Erik) : la pose est recalculée quand la fenêtre change pendant la vue (ResizeObserver) — la tuile de ville occupe le centre de l'espace libre et les autres tuiles se répartissent équitablement, quel que soit le moment du resize.
3. **Rendements limités au rayon** : en vue ville (sans le bouton Rendements), les icônes ne s'affichent QUE sur les tuiles cultivables par la ville affichée — vérifié en jeu (les 18 paires icône+nombre confinées au disque ; la carte à plat n'affiche rien).
4. **Colonne de droite supprimée pendant la vue ville** (retour d'Erik : le panneau vide était inutile) — la carte prend toute la largeur, le panneau de ville flottant EST l'interface ; à la sortie, la colonne et ses panneaux reviennent exactement (capture 08).
5. **Unités masquées en vue ville** (retour d'Erik) — concentration sur la gestion de la ville : les sprites d'unités disparaissent (villes/huttes/villages restent), ainsi que toute la surcouche de guerre (flèches, croix d'attaque, cases disputées, fantômes d'arrivée, chemins gelés, badges de tours, anneau de sélection) ; elles réapparaissent au retour en vue carte (captures 11-12).
6. **Contour de la zone cultivable** (retour d'Erik + image de référence) : le rayon entier (centre + 6/18 cases) est ceinturé d'un liseré ACCENT JOUEUR (5 px, plus épais qu'en vue monde) avec les pointillés sombres par-dessus (3 px, style ZONE-CULTIVEE épaissi) — géométrie pure `contourUnion` (contours.ts, fog filtré), captures 11.

## Deux parties solo créées pour la validation (à abandonner depuis le lobby si inutiles)

`AQVV7F` (Amérique vs bot Chine — colon → Ville1 fondée) et `BWRYEU` (Grèce vs bot Zoulous — Tribunal, Pangée).

## Écart mineur signalé

Pendant la vue ville, le bouton « Fermer » est nommé « ✕ Fermer » (title : « Fermer la vue ville (Échap) ») — Échap et double-clic hors ville font la même sortie.
