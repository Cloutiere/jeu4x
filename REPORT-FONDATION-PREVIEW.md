# REPORT-FONDATION-PREVIEW — La case de fondation teintée à la nation (ACCEPTÉE Erik 08/11)

**Statut : ACCEPTÉE à l'œil par Erik (08/11 — « c'est parfait »), opacité 0.5 validée, commit+push.** Suites : web **785/785** (775 + 10 nouveaux), svelte-check **0 erreur**. Captures 1280×720 dans `dev-logs/captures-fondation-preview/` (solo vs bots, UN SEUL worker 8787, Vite relancé à neuf — piège STALE évité).

## 1. Ce qui est livré (rendu client pur, zéro serveur/moteur)

- **`fondation-preview.ts` (nouveau, PUR)** : `casesApercuFondation({ previews, orders, uniteDe })` dérive les cases à teinter de l'aperçu DÉJÀ calculé — (a) ordre `FoundCity` direct → case COURANTE du colon, (b) action finale `foundCity` en fin de chemin (MultiStep R-158, ordre posé ET chemin gelé, TOUS propriétaires) → DESTINATION. Seul un COLON teinte (D2) ; case visée par plusieurs colons = UNE teinte (gagnant = plus petit unitId, même arbitrage que R-159). Tout dérive de l'état : annulation, vente, mort, fondation effacent la teinte sans état caché (D3). Jev/bots en profitent automatiquement (rendu de la case).
- **`arretsCanvasApercu`** : le profil smoothstep du dégradé culturel (`profilAlpha`, ZONE-CULTURELLE-DEGRADE) lu **EN MIROIR** — le territoire culturel est maximal au liseré (bord) ; pour UNE case d'aperçu la teinte est maximale au CENTRE et décroît vers l'extérieur du halo. Réutilisation du profil pur, aucune nouvelle forme.
- **`textures.ts`** : `textureApercuFondation()` — texture radiale en cache module (même discipline D5 que `textureDegradeCulturel`), construite UNE fois depuis `arretsCanvasApercu`.
- **`GameCanvas.svelte`** (bloc avant la boucle des aperçus — flèches/⌂/chemin gelé se dessinent PAR-DESSUS, D1) : sprite teinté `playerColor(owner)` + **liseré hexagonal** (couleur nation, alpha 0.85 — même langage que la possession de ville), copies wrap comprises ; 2D et hors vue ville seulement.
- **Calibrage `APERCU_FONDATION`** (data-driven, LE levier du labo) : `fondationPreviewAlpha: 0.5` (opacité — À TRANCHER À L'ŒIL), `haloTuiles: 1.0` (case seule, ne déborde pas), `alphaLisere: 0.85`.

## 2. Ce que montrent les captures

1. `1-colon-sur-place-fondation.png` — colon en terrain ouvert, `B` (FoundCity direct) : liseré + voile bleus (nation P1) autour de sa case ;
2. `2-colon-en-chemin-fondation.png` — chemin posé au clic droit + bouton « → 2. Fonder » (panneau : « Ordre : Multi-étapes ») : teinte sur la DESTINATION, contour du chemin cohabitant ;
3. `3-colon-annule-sans-teinte.png` — « Annuler l'ordre » : plus de teinte ni liseré (previews `[]` prouvé par sonde).

## 3. Pièges consignés au passage

- **Le colon démarre EN GARNISON dans la capitale** : la teinte « sur place » se dessine SOUS le sprite de la ville — illisible. Le scénario de capture SORT le colon d'un vrai tour résolu (Move clic droit + Pass au guerrier + bouton fin de tour) avant les captures.
- **Position optimiste** : le colon sous chemin est AFFICHÉ à sa destination — le clic de re-sélection vise la case DESSINÉE, pas sa case moteur ; après « → 2. Fonder » la sélection RESTE (re-clic = désélection, alternance).
- **Cyclage auto (FLUIDITE-SELECTION)** : `B` est un ordre passif → la sélection saute à l'unité suivante (comportement voulu, la teinte reste).
- **CLIC DROIT = destination** (le clic gauche ne sélectionne que) ; la destination d'essai doit exclure unités ET cases de ville.
- Fenêtres : `deux nations côte à côte` NON capturable en solo (les bots ne gelent jamais de chemin foundCity ; les brouillons ennemis ne sont pas diffusés) — la couleur propriétaire est data-driven (`playerColor`, la palette du drapeau), prouvée par tests purs.

## 4. Décisions tranchées d'office (veto Erik possible)

- Le liseré hexagonal (D1 ne parlait que du dégradé) : sans lui, la teinte sous le sprite du colon se lisait mal — le liseré reprend le langage visuel existant (possession de ville). Retirable en un chiffre (`alphaLisere: 0`).
- Profil en miroir (max au centre) plutôt qu'à l'identique (max au bord) : à l'identique, le halo montrait un anneau carré clair aux limites du sprite — artefact visible à la première recapture.

## 5. Acceptation et déploiement

- Erik valide l'opacité 0.5 à l'œil (08/11) ;
- commit + push effectués (fichiers : `fondation-preview.ts`, `textures.ts`, `GameCanvas.svelte`, test, script `devtmp/fondation-preview-gui.mjs`) ;
- Deploy prod : suivre le run GitHub (vérification prod non faite localement).
