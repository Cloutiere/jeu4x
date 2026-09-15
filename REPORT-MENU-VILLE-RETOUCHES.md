# REPORT-MENU-VILLE-RETOUCHES — Badge de population sur la case de ville + icône de conversion en vue ville

Exécution de `HANDOFF-MENU-VILLE-RETOUCHES.md` (constats d'Erik du 14/09). Zéro gameplay, zéro diff 3D, `schemaVersion` 23 inchangée. **Non commité — validation locale d'abord (règle établie), commit/push sur demande explicite.**

## Retouche 1 — Le badge de population est posé SUR la case de la ville

- `apps/web/src/lib/render/badge-population.ts` (nouveau) : constantes 🔶 du badge (centre `x=0, y=-36`, rayon 14, remplissage sombre `0x1b1b22` α 0.85, **liseré clair** `0xe8e4d8` 2 px α 0.9 pour la lisibilité sur tous les terrains, police 18). L'ancienne position codée en dur `(52, -66)` — qui retombait sur la tuile NE — est supprimée.
- `GameCanvas.svelte` `buildCityContainer()` : disque + texte du badge posés via `BADGE_POPULATION` (coordonnées locales du conteneur ville, 0,0 = centre de l'hex).
- La tuile voisine (NE) et son icône de rendement sont libérées. Position/échelle/contraste 🔶 à calibrer à l'œil : tout est dans le module, un seul endroit à retoucher.

## Retouche 2 — L'icône de commerce reflète la conversion, en vue ville seulement

- `apps/web/src/lib/render/rendements.ts` (nouveau) : `iconeCommerceRendement(conversion|null)` — décision pure de rendu (`'science'→sciences`, `'gold'→or`, `null→commerce`). Aucun calcul moteur nouveau : la source de vérité reste `city.conversion` (R-90), exactement celle du bouton ⇄ de `CityView`.
- `GameCanvas.svelte`, bloc rendements : le rayon cultivable de la ville affichée (`rayonVilleVue`) est calculé dès l'entrée en vue ville et sert aux deux usages — limitation des icônes au rayon (comportement MENU-VILLE inchangé) **et** choix de l'icône commerce : en vue ville, **toutes** les tuiles du rayon (travaillées ou non) reflètent la conversion, en temps réel avec le bouton ; hors vue ville, icône **commerce** partout.
- ⚠️ **Point de décision à valider par Erik** : l'ancien comportement Phase 7b affichait or/science sur les tuiles *travaillées* même en vue carte (bouton Rendements). Le handoff étant explicite (« Vue carte du monde : les tuiles affichent **toujours** l'icône commerce », et le critère de test « vue carte → commerce »), la vue carte affiche désormais commerce partout, conversion ou non. Si Erik voulait garder la conversion visible sur les tuiles travaillées en vue carte, c'est une ligne à revenir dans le bloc rendements.

## Tests

- `apps/web/tests/menu-ville-retouches.test.ts` (nouveau, 5 tests) : le disque du badge (contour compris) tient entièrement dans l'hex de la ville (échantillon de 72 points du cercle, point-dans-hex pointy-top) et n'est plus décalé sur la tuile voisine ; choix d'icône (science → sciences, or → or, null/vue carte → commerce).
- Suite complète verte : **1162 tests** (rules 812 + web 275 + server 75, dont 5 nouveaux), `pnpm typecheck` 4/4 (0 erreur), exit 0.

## Validation GUI (partie XDEJD9, ville côtière fondée tour 1 — pilote `dev-logs/driver-menu-ville-retouches.mjs`)

Captures dans `dev-logs/captures-menu-ville-retouches/` :

1. `01-vue-carte-badge-sur-la-ville.png` — badge « 2 » sur la case de la ville, tuile maritime NE dégagée.
2. `02-vue-ville-conversion-or.png` — vue ville, conversion **Or** : la tuile maritime affiche l'icône **or**.
3. `03-bascule-conversion-science-temps-reel.png` — après clic sur le bouton ⇄ : icône devenue **sciences** immédiatement, sans quitter la vue.
4. `04-retour-carte-commerce-icone.png` — retour carte, ville en conversion science : aucune icône (rendements masqués), badge en place.
5. `05-vue-carte-rendements-commerce.png` — carte avec bouton Rendements ✓ : **toutes** les tuiles maritimes affichent l'icône **commerce** malgré la conversion science de la ville.

Serveurs utilisés pour la validation : wrangler :8787 et vite :5175 (lancés pour la session, arrêtés après ; le vite préexistant sur :5174 n'a pas été touché).

## Périmètre respecté

Aucune touche au moteur, à la sémantique R-90, au 3D, aux autres badges/icônes ni à `assets-src`. Fichiers touchés : les deux nouveaux modules purs, `GameCanvas.svelte` (badge + bloc rendements), le nouveau fichier de tests, le pilote e2e et les captures.
