# REPORT — ZONE-CULTIVEE : la zone des tuiles cultivées au style CivRev

Mission `HANDOFF-ZONE-CULTIVEE.md` (décisions d'Erik du 13/09). **1052 tests verts** (753 moteur / 72 serveur / 227 web — +8 nouveaux), `pnpm typecheck` 4/4, `schemaVersion` **19 inchangée**, **zéro gameplay** (`packages/rules` src et serveur non touchés), **zéro diff 3D** (§5 respecté — voir M1). Non commité : validation locale d'abord, commit/push sur demande explicite d'Erik.

## M1 — Géométrie (purs, testés)

`apps/web/src/lib/render3d/contours.ts` : le corps de `contourRegion` (collecte des arêtes de frontière + chaînage wall-follower) est extrait tel quel dans une fonction privée `contourDUneRegion(tuiles, dansRegion, size, elevationDe)`. `contourRegion` délègue avec son test de rayon — **comportement 3D bit-identique** (les 5 tests `contours3d.test.ts` existants passent sans modification, y compris le compte exact de 19/31 sommets) ; aucun nouvel appel 3D vers les nouvelles fonctions.

Nouvelle fonction exportée **`contourUnion(cases, size, elevationDe)`** : contour extérieur de l'UNION des cases passées (worked tiles effectifs d'une ville) — gère formes non convexes, cases détachées (boucle propre par composante), trous intérieurs (boucle inversée), zéro case (pas de zone).

Tests : `apps/web/tests/zone-cultivee.test.ts` (8 cas : vide, pop 1, contiguës, L concave à sommet de pincement, anneau à trou = 2 boucles, case détachée, élévations portées, non-régression `contourRegion`).

## M2 — Rendu 2D (`GameCanvas.svelte`)

- **Zone par ville visible** (2D, vue normale, sans sélection requise) : `contourUnion` du centre (toujours cultivé, R-60) + des worked tiles effectifs explorés (`effectiveWorkedTiles` — miroir de la file d'ordres). Liseré extérieur en accent joueur + **dégradé vers l'intérieur** : 3 couches de contour concentriques à alphas croissants vers le bord (30/20/11 px), **masquées par le polygone de la zone** (le dégradé ne déborde pas à l'extérieur). Constantes 🔶 `ZONE_CULTIVEE` en tête de bloc (épaisseur liseré 4, alpha 0,95, paliers du dégradé) — calibrage à l'œil par édition.
- **Temps réel** : la zone est calculée dans `rebuildOverlay` depuis l'état effectif — elle s'étend/se rétracte au clic worked tile avant toute résolution (même flux d'invalidation que les marqueurs existants). **Calcul au rebuild seulement, jamais par frame** (bench M3.3 : `tickInner` → `rebuildOverlay` sous flag `overlayDirty`).
- **Rayon cultivable** : la coloration pleine a disparu de la vue normale ; reste un **liseré pointillé discret** (2,5 px, alpha 0,55, sans remplissage) **à la sélection de la ville seulement** — géométrie `contourRegion` réutilisée à l'identique ; le 3D garde son trait plein (`mettreAJourMarqueurs3d` inchangé).
- Les marqueurs de worked tiles existants (doubles cadres hexagonaux) : brièvement supprimés puis **REMETTUS à la demande d'Erik en session** — ils cohabitent avec la zone (marqueur précis par case + habillage de zone). État effectif : apparaissent/disparaissent toujours immédiatement au clic.

## M3 — Vérification e2e solo (captures `dev-logs/captures-zone-cultivee/`)

Partie solo réelle en dev (UU33AY, Amérique vs bot Japon, capitale fondée tour 1, pop 2) :

1. `1-ville-au-depart-zone-cultivee.png` — ville non sélectionnée : zone autour des tuiles cultivées par défaut (centre + 2 cases auto-assignées) ;
2. `2-ville-selectionnee-lisere-rayon.png` — ville sélectionnée : liseré pointillé discret du rayon 1 visible autour de la zone ;
3. `3-declic-zone-retractee.png` — dé-clic de la tuile cultivée NO : la zone se rétracte immédiatement (ordre en attente, pas de résolution) ;
4. `4-clic-cultivable-zone-etendue.png` — clic sur une prairie libre : la zone s'étend immédiatement ;
5. `5-deselectionnee-zone-sans-lisere.png` — désélection : le pointillé du rayon disparaît, la zone reste.

Ajustement en cours de session : le pointillé à 2 px / alpha 0,40 était invisible à l'œil — réglé à 2,5 px / alpha 0,55 (défaut 🔶, calibrable).

## Signalements

- Le liseré de la zone partage sa couleur avec le contour de possession de la case de ville et les marqueurs worked tiles (tout est `accent_joueur`) — sur une ville dont la zone est réduite, les trois se superposent ; si Erik veut hiérarchiser visuellement, c'est un calibrage de palette à l'atelier, pas ce chantier.
- La partie solo créée pour l'e2e (UU33AY) et les parties tour 0 préexistantes du lobby restent dans « Mes parties » (observation déjà connue, non traitée ici).
- `image_ref/plaine.jpg` apparaît supprimé dans `git status` — dépôt d'Erik, non touché par ce chantier.
