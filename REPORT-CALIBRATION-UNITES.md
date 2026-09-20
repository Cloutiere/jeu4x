# REPORT-CALIBRATION-UNITES — Hauteur des unités seules + cohabitations groupées par nation

**Mission tenue (handoff CALIBRATION-UNITES).** Zéro gameplay, zéro 3D, `assets-src` intact : seuls la pose des sprites 2D et le placement de cohabitation changent. **Rien n'est committé** — validation locale avec captures d'abord (règle établie) ; Erik calibre les constantes à l'œil en session.

## 1. M1 — La hauteur de référence (data-driven)

**Constat de départ** : les sprites étaient déjà ancrés aux pieds (`anchor.set(0.5, 1)` dans `buildUnitContainer`) mais à **échelle fixe 0.5**, donc la hauteur écran dépendait du ratio du PNG (guerrier Recraft 320 px → 160 px écran = 1,25× la hauteur d'hex — trop grand ; les painter varient).

**Nouveau module `apps/web/src/lib/render/calibration-unites.ts`** (constantes 🔶 éditables par Erik sans code, miroir de `badge-population.ts`) :
- `HAUTEUR_UNITE = 1.25` — **retour d'Erik du 20/09 (validation à l'œil)** : en vue normale l'unité SEULE reprend la taille PRÉCÉDENTE (painter 320 px × échelle 0.5 = 160 px écran) ; ratio de la hauteur de l'hexagone (2×HEX_SIZE = 128 px) ;
- `HAUTEUR_UNITE_PILE = 0.55` — la taille VALIDÉE par Erik (capture du guerrier) pour les unités EN COHABITATION ; l'échelle de pile en dérive (`HAUTEUR_UNITE_PILE / HAUTEUR_UNITE` = 0.44) : retoucher la taille des unités seules ne change pas celle des paquets ;
- `AJUST_HAUTEUR` — ajustement INDIVIDUEL par type (`guerrier: 1.0` = LE calibre ; un type absent = calibre guerrier) ; archer, colon… se règlent ici s'ils semblent géants/nains à côté ;
- `echelleUnite(type, hauteurTexture, hexSize)` — échelle par type telle que `hauteurTexture × échelle = hauteurUnitePx × ajust`, quel que soit le ratio du PNG (Recraft, painter, futur art) ; garde-fou texture dégénérée → repli 0.5 (esprit 7j) ;
- `PIEDS_Y = 32` — **pieds au QUART BAS de la tuile** (même retour d'Erik : « posée au milieu » était trop haut ; bord bas de l'hex à +64, quart bas → +32).

**Câblage GameCanvas (`buildUnitContainer`)** : base/accent/cuite/fondation à l'échelle par type ; **barre de PV, écu de fortification, cargo, badge espion repositionnés relativement au sommet du sprite** (`sommet = PIEDS_Y − hauteur`) — l'ancien −158/−178 en dur supposait le painter 320 px. L'échelle reste au niveau SPRITE, celle du CONTENEUR reste libre pour la cohabitation (héritage PILE-AFFICHÉE).

**Vérifié en partie solo (capture `partie-guerrier-seul.png`)** : le guerrier Recraft occupe ~55 % de la hauteur d'hex, pieds posés, barre de PV juste au-dessus, anneau de sélection praticable ; le colon painter à côté est proportionné.

## 2. M2 — Cohabitations GROUPÉES PAR NATION

**`interaction.ts`** (pur, testé) :
- `dispositionCohabitationParNation(unites)` — les occupants AU SENS DESSINÉ d'une case : nations TRIÉES (R-81, lexicographique), unités d'une même nation dans l'ordre d'insertion (miroir du rendu ET du cycle de clic) ; chaque nation forme un **paquet compact** (éventail serré, `ECART_UNITE = 0.16`), paquets répartis de façon DÉTERMINISTE : **2 nations = gauche/droite** (`ECART_NATIONS = 0.22`), **3+ = radiale** démarrant au sommet (`RAYON_RADIAL = 0.26`) ; échelle de cohabitation 0.66 (héritée de PILE-AFFICHÉE). Calibrage 🔶 en fractions de HEX_SIZE, à l'œil par Erik ;
- `dispositionsCohabitation(state, positions)` — miroir `pilesAffichees` : une pose par unité pour toutes les cases dessinées d'un coup.

**Câblage** : `rebuildEntities` et l'anneau de sélection unité utilisent les poses groupées (l'anneau suit le décalage/échelle du paquet) ; `pilesAffichees`/`dispositionPile` restent exportés (sonde debug `sondePile` et tests PILE-AFFICHÉE intacts) mais ne servent plus à la pose. **Le cycle de sélection au clic est inchangé** (ordre d'insertion — l'unité dans un paquet reste sélectionnable clic après clic ; l'unité la plus haute du paquet est dessinée en dernier = picking naturel).

**Labo `#/labo-combat`** : l'éventail de jetons est trié **par nation (R-81)** au sein de chaque case — les cohabitants d'un même camp sont adjacents (l'échelle/le radial complets restent propres au rendu sprite de la carte).

## 3. M3 — Vérification

- **Tests** : nouveau `apps/web/tests/calibration-unites.test.ts` — **10/10 verts** (hauteur cible × ajustement individuel, adaptation au ratio du PNG, garde-fou, paquets gauche/droite + radial déterministe, ordre d'insertion, positions dessinées) ;
- **Suite web : 329/319+10 verts** (28 fichiers, dont `pile-affichee.test.ts` inchangé) ;
- **Typecheck : 4/4** (svelte-check 0 erreur, 13 warnings préexistants) ;
- **Zéro gameplay** : `packages/rules`, serveur, 3D intouchés — diff limité à `GameCanvas.svelte` (pose), `interaction.ts` (fonctions pures ajoutées, rien retiré), `LaboCombat.svelte` (tri d'affichage), `calibration-unites.ts` (nouveau), tests. Le 2 préexistant dans GameCanvas au HEAD (commentaires accents) est embarqué.

## 4. Captures (`dev-logs/captures-calibration-unites/`)

- `partie-guerrier-seul.png` — partie solo D6Q7P6 tour 0 : guerrier Recraft sélectionné (hauteur de référence ~0,55 hex, pieds ancrés), colon painter à côté proportionné ;
- `labo-cohabitation-2-et-3-nations.png` — (3,3) 2 nations en paquets gauche/droite, (6,3) 3 nations en répartition radiale (J1/J2/J3), jetons groupés par nation.

**Non capturé, par conception** :
- **Vue ville** : les UNITÉS n'y sont pas rendues (MENU-VILLE, retour d'Erik — `rebuildEntities` les masque) ; rien à calibrer, les poses de carte s'appliquent dès le retour en vue carte ;
- **Mêlée réelle (dispersions R-179-b)** : même chemin de rendu que les cohabitations du labo (`dispositionsCohabitation` lit l'état, peu importe qu'il vienne d'une résolution ou du labo) — à refaire à l'œil par Erik sur une vraie mêlée si souhaité.

## 6. Labo de rendu `#/labo-rendu` (retour d'Erik du 20/09 — « voir la répartition de 1 à 7 unités »)

Nouvelle page client-pure (miroir #/progen, aucune partie ni appel /api) : le rendu RÉEL de GameCanvas sur une case où l'on empile **1 à 7 unités avec 1 à 6 nations** (deux curseurs ; 6 camps max : 5 joueurs + barbares). Nations attribuées en entrelacé (u1→N1, u2→N2…) pour prouver que le groupement réunit chaque nation malgré l'ordre d'insertion. Typecheck 0 erreur, suite 330/330.

**Rév. ZONES-HEX (même jour, décisions d'Erik en session)** — la répartition radiale est REMPLACÉE par **6 zones aux côtés de l'hexagone** (pointy-top) :
- ordre de REMPLISSAGE des zones par les nations (triées R-81) : **gauche, droite, haut-gauche, haut-droite, bas-gauche, bas-droite** ;
- paquets ancrés **au bord du côté** (constante `ZONES_HEX`, fractions de HEX_SIZE : ±0.87 sur l'axe ouest/est, ±0.43/0.75 sur les diagonales) ;
- unités d'une même nation dans leur zone : **escalier diagonal** (chaque unité décalée d'un pas droite+haut, `PAS_ESCALIER = 0.09`) ;
- **UNE seule nation à plusieurs unités : côte à côte, centrées sur la tuile** (`PAS_COTE_A_COTE = 0.22`) ;
- garde-fou déterministe si > 6 nations (impossible en jeu) : retour à la première zone.

Captures : `labo-rendu-7unites-{2,7}nations.png` (avant rév.), `labo-rendu-zones-hex-7unites-3nations.png` (zones hex, escalier visible).

## 5. Calibrage à l'œil (mode d'emploi Erik)

Tout est dans `apps/web/src/lib/render/calibration-unites.ts` (+ 4 constantes 🔶 dans `dispositionCohabitationParNation`, `interaction.ts`) :
1. `HAUTEUR_UNITE` (1.25) — taille des unités SEULES ; `HAUTEUR_UNITE_PILE` (0.55) — taille des paquets en cohabitation (indépendante) ;
2. `AJUST_HAUTEUR[type]` — corrections individuelles (archer, colon…) ;
3. `PIEDS_Y` (32) — hauteur des pieds dans la tuile (32 = quart bas) ;
4. Zones hex (`interaction.ts` · `dispositionCohabitationParNation`) : `ZONES_HEX` (ancres), `PAS_ESCALIER` (empilement intra-zone), `PAS_COTE_A_COTE` (nation seule centrée).

HMR Vite : modifier → la carte se met à jour à chaud.
