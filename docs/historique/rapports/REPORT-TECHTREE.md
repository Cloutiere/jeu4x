# REPORT-TECHTREE — Arbre technologique d'Erik (écran plein)

**Mission** : HANDOFF-TECHTREE (décisions Erik 05/10) — refonte de l'écran de
recherche en arbre technologique plein écran selon `Techtree/civ_tree.jpeg`.
Client seul, zéro changement moteur/serveur, `schemaVersion` 27 inchangée.

## Rév. 05/10 (retour visuel d'Erik) — flot strict gauche → droite

**Règle** : jamais une flèche ne revient en arrière — la colonne d'une tech
est STRICTEMENT à droite de tous ses prérequis (`col = max(col prereqs) + 1`,
racines en col 0 ; l'exemple d'Erik Alphabet → Écriture en col 1).

- **Colonnes CALCULÉES** depuis les prérequis (`colonneDe()` dans
  `lib/techtree.ts`, surcharges manuelles possibles mais l'invariant « aucune
  flèche vers la gauche » est testé) : **11 colonnes** au total.
- **Rangées** : séquentielles par colonne dans un ordre de préférence hérité
  du placement initial (`ORDRE_PREFERENCE`, réajustable sans code).
- **Bandes d'ère = plages contiguës de colonnes à répartition équitable**
  (choix d'Erik : « pas d'exactitude historique ») : ancienne cols 0-2 (13
  techs), médiévale 3-5 (14), industrielle 6-7 (11), moderne 8-10 (8) —
  bornes data-driven (`derniereCol`), titres renommables sans code. Une tech
  peut être REPORTÉE sous une bande ultérieure (affichage ≠ ère moteur
  assumé ; le test prouve qu'il y a des reportés).
- **Fonds d'ère 16:9** (nouveaux `*_16_9.png` d'Erik) recuits 1920 px
  (total fonds 1,1 Mo), ancrés à GAUCHE sans déformation, **fondu sombre sur
  les bords** au-delà de l'image (choix d'Erik 3).
- **Barre de défilement horizontale TOUJOURS VISIBLE** : barre personnalisée
  (piste sombre + pouce or, déplaçable au pointeur, clic piste = saut) — les
  scrollbars natives sont masquées par défaut dans Chromium.

Vérification GUI re-faite (partie solo légale, danse SetWorkedTile eau) :
blocage→arbre, sélection, 46/46 visuels, Échap, réouverture en cours ;
captures `dev-logs/captures-techtree/C1 gauche / C2 milieu / C3 droite / A
blocage` — relecture visuelle PASS (flot gauche→droite vérifié carte par
carte sur les longs connecteurs, pouce de scrollbar cohérent avec le
défilement). Suites : web **559** (+3 rév.) / rules 993 / server 120,
svelte-check 0.

## Livré (initial 131d639)

- **D1 — Écran plein** : `TechTree.svelte` (z-index 50, au-dessus du HUD
  barre AAA 30-40) — 4 bandes d'ère verticales aux fonds d'Erik
  (`era_ancienne/medievale/industrielle/moderne.jpg`), titres + sous-titres,
  timeline bas (ère du JOUEUR en or via `eraOfPlayer`, ères passées ocre),
  citation en pied. `ResearchPanel.svelte` supprimé (aucune autre référence) ;
  Game.svelte route `showResearch` vers TechTree — mêmes portes (bouton
  recherche, BLOCAGE-NAVIGATION, badge).
- **D2 — États** : `etatTech/etatsTechs` dans `lib/techtree.ts` (purs) —
  acquise / en cours (badge + barre %) / disponible (surbrillance or,
  cliquable → `SetResearch`, mêmes règles moteur R-85/R-86) / verrouillée
  (grisée + prérequis NOMMÉS dans la carte + tooltip, non cliquable).
- **D3 — Ères d'affichage** : `eraAffichageDe()` = ère moteur + table de
  surcharges `SURCHARGE_ERA_AFFICHAGE` (VIDE à l'arrivée) — réajustable sans
  code ; ère moteur intacte (aucune lecture gameplay).
- **D4 — Carte technologie** : image d'Erik + nom FR + coût + tours restants
  estimés (estimation science/tour = miroir UI de la colonne or de
  Game.svelte : `interiorCitizenFor` + `TERRAIN_COMMERCE` + `conversionGains`)
  + débloqués EN NOMS SEULS (`libellesDebloques`, libellés FR
  UNIT_TYPES/BUILDINGS/WONDERS). Flèches de dépendance dorées (SVG bezier,
  têtes triangulaires ; or atténué pour cibles verrouillées).
- **D5 — Placement** : `PLACEMENT` (colonne, rangée) — 7 colonnes (ancienne
  0-1, médiévale 2, industrielle 3-4, moderne 5-6), 9 rangées max ; racines
  en haut, croisements minimaux ; réajustable sans code.
- **D6 — Recuisson** : `devtmp/cuisine-techtree.mjs` (ffmpeg uniquement — pas
  de sharp dans le dépôt) : 43 cartes tech → 448 px q7, 4 fonds d'ère →
  1600 px q6, **total 2,4 Mo** dans `apps/web/public/art/techtree/`. Sources
  d'Erik (`Techtree/`) NON committées.
- **D7 — Sortie** : Échap (svelte:window) + croix ; la recherche en cours
  reste affichée en haut de l'écran de jeu (bouton barre AAA inchangé).

## Table de correspondance images (D6)

43 techs → sources d'Erik, cuites sous `tech_<techId>.jpg`. Particularités :
`potery.jpeg`→poterie, `atomic theory.jpeg`→theorie_atomique (espaces),
`horseback_riding`→equitation, `ceremonial_burial`→rites_funeraires,
`bronze_working`→travail_du_bronze, `iron_working`→travail_du_fer,
`steam_power`→machine_a_vapeur, `mass_media`→medias_de_masse, etc. (table
complète dans `devtmp/cuisine-techtree.mjs` et `TECHS_AVEC_IMAGE` de
`lib/techtree.ts`).

- **Techs SANS image d'Erik (fallback icône science, consigné)** :
  `corporation`, `acier`, `electricite` — le moteur compte **46 techs**
  (le handoff annonçait 44) et Erik a fourni 44 images tech + 4 fonds +
  `civ_tree.jpeg` (49 fichiers) = cohérent à 1 près.
- **Source orpheline consignée** : `future_tech.jpeg` — AUCUNE tech
  correspondante dans `techs.json` (pas de « Technologie future » au moteur).
  Image non cuite, disponible si la tech est ajoutée un jour.

## Vérification GUI réelle (L4) — AVANT commit

Script `devtmp/techtree-gui.mjs` (serveurs dédiés 8791/5177, solo
procedural-40 légal — conversion science via danse `SetWorkedTile` sur case
d'eau, réserve R-85 > 0 → blocage recherche) :

- **A** clic « Fin de tour bloquée (1) » → TechTree ouvert ✓ ;
- **B** clic carte disponible « Alphabet » → `researching=alphabet`,
  réserve versée ✓ ;
- **C** arbre complet : **46 cartes rendues, 46/46 visuels chargés**,
  verrouillées avec prérequis nommés (« Poterie », « Travail du bronze »…) ✓ ;
- **D** Échap → fermé ; réouverture bouton recherche → état en cours
  (« Alphabet (en_cours) ») ✓.

Captures : `dev-logs/captures-techtree/` (A0, A, B, C1 ères 1-2, C2 ères
3-4, D) — validation visuelle par relecture (2 passes : fix z-index HUD +
flèches dorées à la passe 1 ; passe 2 PASS pixels à l'appui).

## Suites

- web **556** (+17 `techtree.test.ts`) / rules **993** / server **120** —
  toutes vertes ; svelte-check **0 erreur** (18 warnings préexistants,
  aucun sur les fichiers nouveaux).
- `schemaVersion` 27 inchangée ; `techs.json` intouché.

## Pièges rencontrés (pour la suite)

- **workerd figé sur 8791** à l'arrivée : un wrangler RÉSIDUEL d'une session
  antérieure (lancé « --port 8793 » avec `--` mal passé) squattait 8791 en
  répondant 000 — `netstat` + PID parent, kill ciblé, relance propre.
- `SetConversion`/`SetResearch` sont des MESSAGES WebSocket directs (actions
  immédiates), pas des ordres `SubmitOrder` — les ordres ne s'appliquent
  qu'à la résolution.
- Le blocage recherche apparaît dès science/tour > 0 SANS recherche choisie
  (pas besoin d'attendre la réserve) ; un créneau de travail LIBRE est
  requis pour `SetWorkedTile` (pop pleine → rejet) — d'où la danse répétée.

## 🔶 À l'œil d'Erik (calibrage attendu)

1. **Calibre des cartes** (238×104, image 76 px) et tailles de texte —
   ajustables par constantes COL_W/ROW_H/CARD_W/CARD_H en tête du composant.
2. **Placement** (D5) : disposition racines-en-haut, 2 sous-colonnes pour
   l'ancienne/industrielle/moderne, 1 pour la médiévale — certains prerequis
   croisent (monarchie ← rites_funeraires, monnaie ← code_des_lois) ;
   réajustable SANS code dans `PLACEMENT`.
3. **Sous-titres d'ère** proposés par moi (« Les premiers pas », « Foi,
   commerce et empires », « La machine change le monde », « Un demain meilleur
   par le savoir ») — à valider/reformuler.
4. **Citation de pied** (option D1) : « Le savoir est le fondement sur lequel
   s'élèvent les civilisations. » — substituer si Erik préfère une autre.
5. **3 techs sans image** (corporation, acier, electricite) = icône science
   en attendant des sources d'Erik ; `future_tech.jpeg` sans tech.
6. **Flèche « or vif »** pour cibles disponibles non exercée en capture
   (toutes les cibles lointaines étaient verrouillées en solo t3) — le rendu
   est le même chemin de code (classe `on`).
