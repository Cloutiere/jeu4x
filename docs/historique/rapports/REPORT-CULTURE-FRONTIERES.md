# REPORT-CULTURE-FRONTIERES

**Chantier correctif du chapitre 2D (handoff du 14/09).** Mission exécutée intégralement (M1 + M2 + M3). Validation locale en partie solo AVANT tout commit (règle établie) — captures dans `dev-logs/captures-culture-frontieres/`. **Pas de commit** (sur demande explicite d'Erik). Le zoom vue ville reste mis de côté (décision Erik, backlog CORRECTIFS-VUE-VILLE).

## 1. M1 — La frontière progresse palier après palier (rendu 2D, testé)

- **Forme pure** : `frontierRadius(workRadius, paliers) = workRadius + max(0, paliers − 1)` (`packages/rules/src/culture.ts`). Le décalage d'un palier est centralisé dans la fonction, pas dans le dessin. Tests (`tests/expansion-culturelle.test.ts`) : paliers 0/1/2/3/5, **Tribunal (rayon 2) au palier 1 = frontière à rayon 2 = sa zone, pas plus**, entrées défensives.
- **Rendu 2D** (`GameCanvas.svelte`, calque anneaux culturels réécrit) :
  - **Palier 0** (cumul < 10) : aucun liseré — hexagones des tuiles cultivées seuls (inchangé).
  - **Palier 1** (10 ≤ cumul < 100) : **liseré accent joueur autour de la ZONE CULTIVÉE seule** — `contourUnion` des worked tiles effectifs (centre inclus), liseré 4 px sur les boucles extérieures, **aucune bande au-delà, aucun remplissage** (la zone cultivée ne reçoit que ses hexagones — décision du 13/09 conservée). La frontière suit le clic worked tile en temps réel (état effectif).
  - **Palier 2 et plus** : bande d'extension = disque de rayon `frontierRadius(workRadius, paliers)` MOINS zone cultivée — chaque palier supplémentaire pousse la frontière d'UNE case ; liseré + dégradé sur la frontière extérieure seule (calibrage du 13/09 inchangé), masque non-zéro, fog respecté.
- **Zéro gameplay** : `workRadiusOf`/`tileWorkable`/worked tiles intouchés (garde-fou de tests toujours vert). Pas d'UI/tooltip représentant la frontière (rien à mettre à jour — vérifié).

## 2. M2 — Diagnostic du GP tour 18 : VERDICT = canal PRODUCTION (comportement canon, aucun bug moteur)

- **Reproduction** : simulation moteur (18 tours, une ville, pédagogique et pangée) **et** partie solo jouée dans le navigateur (NWVRZD — Grèce vs bot Chine, 40 tours). **Le GP sort au tour ~12-16 alors que la culture empire est à ~32/150 et `culturePaliers` = 0** — impossible que ce soit le canal culture.
- **Source exacte** : l'**accumulateur de rendement PRODUCTION (R-123, seuil T-30 = 20)** — le Grand Bâtisseur apparaît dès qu'une ville a accumulé 20 production, ce qui arrive vers le tour 12-16 en solo. **Le canal production n'était pas listé dans les hypothèses du handoff** (culture / Premier découvrir / palier d'or) — c'est pourtant celui-là. Corroboré par le rapport GP-CULTURE-EVENEMENTS (« Deux Grands Bâtisseurs d'accumulateurs, tours ~10 et ~22 » dans leur propre e2e).
- **Ni bug de cumul culturel, ni palier mal indexé** : `cultureCumulee` progresse normalement (~1 à 5/tour selon pop), la jauge empire est cohérente, aucun correctif moteur requis (M2.3 non déclenché — **zéro gameplay confirmé**).
- **Correctif M2.2 (source explicite dans le journal)** : nouveau champ **`canal`** sur `GreatPersonSpawned` (`'culture' | 'science' | 'or' | 'production' | 'combat' | 'artefact'` — optionnel, aucune migration), renseigné par les 5 sites d'émission (`spawnGreatPerson` : accumulateurs savant/explorateur/bâtisseur, Leader T-31, palier culture T-27, palier or R-136 ; artefacts : Confucius). Journal : **« Grand Bâtisseur apparaît dans c1 — GP de production »** ; les GP du Premier découvrir (événement `FirstDiscovered`) sont libellés **« GP de technologie »**. Tests : un GP par canal (5 cas) dans `tests/culture.test.ts`.
- **Au passage** : doublon préexistant de `case 'FirstDiscovered'` dans `labels.ts` (le second, mort, écrasait l'étiquette riche jamais affichée) — supprimé, libellé riche + « GP de technologie » sur le cas actif.
- Preuves en jeu : `dev-logs/captures-culture-frontieres/03-journal-gp-source-explicite.txt` (deux « GP de production » aux tours ~16 et ~21) ; jauge empire et jalons cohérents (1/20 au tour 40).

## 3. Vérification

- **Tests : 1126 verts** (rules 798 — dont 3 nouveaux `frontierRadius` + 5 nouveaux canaux ; web 253 ; server 75). **Typecheck 4/4.** `schemaVersion` **22 inchangée** (aucune migration — champ d'événement optionnel). **Zéro gameplay** ; zéro diff 3D (aucun fichier fonderie/3D touché).
- **e2e solo** (NWVRZD, Grèce — Tribunal, rayon de travail 2, le cas le plus exigeant) :
  - Tours 1-9 (palier 0) : aucun liseré — hexagones seuls ;
  - **Tour 10 (palier 1) : `01-palier1-tour10-lisere-zone-cultivee.png`** — le liseré entoure EXACTEMENT les tuiles cultivées (contour irrégulier de la zone pop 4, PAS un disque rayon 2 malgré le Tribunal) — une seule ville, la frontière ne dépasse jamais rayon 1 au-delà de la zone ;
  - **Tour 40 (palier 2) : `02-tour40-bande-verif.png`** — bande à UNE case au-delà de la zone cultivée (liseré + dégradé sur la frontière extérieure seule).
- RULES.md mis à jour : révision CULTURE-FRONTIERES sur R-162 (progression palier après palier, `frontierRadius`) et note `canal` sur R-114.

## 4. Points d'attention / suites

- Le calibrage fin des seuils T-51 (10/100/1 000/10 000) reste à l'œil par Erik (inchangé).
- Les GP de production (T-30 = 20) sortent TRÈS tôt en solo (~tour 12-16) — si Erik les trouve trop fréquents, le levier est `culture.json` `greatPersonYieldThresholdBase` (data-driven, séparé de la culture).
- Le champ `canal` est optionnel : les événements antérieurs rejoués s'affichent sans mention de source (dégradation gracieuse).
