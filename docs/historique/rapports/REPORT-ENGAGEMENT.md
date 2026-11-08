# REPORT-ENGAGEMENT — Les règles d'engagement revues : stabilité/instabilité, fin des replis, mêlée pondérée

**Chantier gameplay majeur du chapitre 2D — spécification DICTÉE par Erik en session (16/09,
`HANDOFF-ENGAGEMENT.md`), reformulée en R-173..R-183, arrêt-pour-approbation respecté
(3 allers-retours d'arbitrage Q1–Q10 / D1–D4), implémentation test-first, validation dans
`#/labo-combat`. Zéro diff 3D. Aucun commit (sur demande explicite d'Erik uniquement).**

## 1. Les règles dictées, reformulées et signées (RULES.md §8bis — R-173..R-183)

| Règle | Contenu (synthèse — texte complet en RULES.md §8bis) |
|---|---|
| **R-173** | **Stabilité de case** : fin de tour, exactement 1 unité = case stable, unité `stabilized` ; ≥ 2 ou 0 = instable. Migration **`schemaVersion` 24 → 25** (champ additif, unités migrées stabilisées, idempotent). |
| **R-174** | **Prérogatives du stabilisé** : se défend avec ses VALEURS DE DÉFENSE ; toute autre unité attaquée utilise ses VALEURS D'ATTAQUE (#4) ; seule éligible à Fortify ; une case instable n'a AUCUN défenseur (les entrants se joignent à l'instabilité). |
| **R-175** | **Fortification durable** : acquise au stabilisé, conservée tant que l'unité demeure sur sa case (même en mêlée), perdue au déplacement ; bonus de terrain et de ville idem. Ancien R-33 abrogé. |
| **R-176** | **Engagement (#1)** : les entrants ne combattent QUE le défenseur stabilisé ; l'attaquant de mêlée prend place sur la case attaquée. |
| **R-177** | **Ordre d'attaque (#5)** : PM restants → attaque → défense croissante → PV → tirage seedé ; séquence arrêtée à la mort du défenseur. |
| **R-178** | **Mêlée d'instabilité (#2/#6/#9)** : case à ≥ 2 militaires de 2 propriétaires → UNE mêlée par tour en Phase E ; les entrants se joignent ; sortir = échapper. |
| **R-179** | **Expulsion de cohabitation** : ≥ 2 amies → la mieux fondée reste (fortifiée > PV > R-81), les autres relogées à l'adjacent libre (ordre unitId, tie (q,r)) — événement `UnitExpelled` ; sans case libre, punition douce. |
| **R-180** | **Mêlée pondérée + étau (#7/#8)** : poids = attaque effective² × étau ; gagnante tirée à `w/Σw`, perdante au même mécanisme, autres intermédiaires ; gagnant **0**, perdant **−2**, intermédiaires **−1** ; morts à 0 ; étau `1 + 0,25 × (alliées − 1)` plafonné à 0,50 (**T-54/T-55**, 🔶 data-driven constants.ts). |
| **R-181** | **Cohabitation avec défenseur (D4)** : la mêlée s'applique aussi aux ennemis cohabitants d'un défenseur vivant — pas de ré-attaque séquentielle. |
| **R-182** | **Pacifiques** : hors tirages, fuite possible, capturées à la stabilisation sous ennemi (R-43) ; espion infiltré en ville à l'abri (7m conservé). |
| **R-183** | **Camps barbares (D1)** : le GARDIEN (plus ancien SUR la case) demeure et n'attaque que DEPUIS sa case ; satellites dans le rayon d'une case ; dotation T-50 = 3 (barbares.json `initialUnits`), T-49 = 1 ; spawn sur camp libre sinon adjacent ; capture = attaque normale du gardien → `VillageDestroyed` + `VillageLooted` seedé. |

**Arbitrages d'Erik en session** : Q1 fin des replis/collisions ; Q2 camps spatialisés ;
Q3 cohabitation amie sans mêlée + obligation de sortir ; Q4 fuite = échapper ; Q5 séquence
arrêtée à la mort du défenseur ; Q6 fortification durable y compris en mêlée ; Q7 R-59
conservé, fragilité à distance assumée ; Q8 bonus de ville maintenus à l'occupation ;
Q9 une mêlée par tour ; Q10 pacifiques capturées à la stabilisation ; D2 expulsion
automatique déterministe ; D3 fortification « à vie ET sur la case » ; **D4 mêlée générale**
(la ré-attaque séquentielle proposée initialement a été abandonnée sur remarque d'Erik :
le renfort ami au défenseur casse le modèle — mêlée partout). **Numérotation** : les
propositions R-162..R-172 du chantier ont été renumérotées **R-173..R-183** (R-162 et
T-52/T-53 étaient déjà pris par les anneaux culturels) ; l'étau est T-54 (bonus 0,25) /
T-55 (plafond 0,50).

## 2. Abrogations (ancien contrat — tests réécrits ou supprimés avec justification)

- **R-52 rév. DÉFENSE-DE-PILE** — retour au défenseur unique (le stabilisé, R-174).
- **R-53 (collisions), R-54 (replis), R-55 (attaques répétées), R-56 (allocation)** —
  tout mover entre dans sa case ; survie mutuelle = cohabitation ; plus aucun événement
  `Retreat` émis (type conservé pour les journaux anciens).
- **R-59-d** — le défenseur à distance cohabite comme les autres.
- **R-96 rév. / clause « pile » de R-97** — pile de camp et assaut un par un abrogés (R-183).
- **R-30 amendée / R-44 spécial** — co-location amie légale partout (expulsion en Phase E) ;
  R-159 (dispute de destination amie) CONSERVÉE : la première programmée garde la case.
- **Drapeau d'empilement (BARBARES-PILES M2)** — retiré du rendu (`GameCanvas.svelte`),
  durée de lecture conservée dans `playback.ts`.
- **R-33 (annulation par tout ordre)** — remplacée par R-175 ; l'UI `UnitPanel` reflète le
  nouveau contrat (bouton Fortifier réservé au stabilisé, mention « Instable » sinon,
  libellé « Fortification durable »).

- **R-176a · Coup en passant** (ajout du 17/09, décision d'Erik) : une attaque planifiée
  à l'entrée se résout même si le défenseur a quitté la case visée, tant qu'il reste à
  portée — il se défend en valeurs d'attaque (il a bougé). Deux unités qui échangent leurs
  cases se croisent et échangent un échange R-51 au passage ; survie mutuelle = pas de
  mêlée, les deux cases se stabilisent. Verrouillé par le test de reproduction du labo
  (seed 20260915, `engagement.test.ts` R-176a — scénario joué par Erik au labo).

- **R-178 rév. A · Report de mêlée** (ajout du 17/09, constat d'Erik au labo — scénario
  barbare attaqué par deux guerriers) : sur une case où un défenseur STABILISÉ a été
  attaqué ce tour (qu'il survive ou non), la mêlée est **reportée au tour suivant** —
  les entrants se contentent de leurs attaques ; si tous demeurent, mêlée en Phase E du
  tour suivant, et le défenseur qui demeure **conserve ses bonus** (R-175, verrouillé par
  un test fortifié+forêt). L'entrée simultanée sur une case SANS défenseur garde sa mêlée
  immédiate (#2). Corrige aussi : un satellite barbare visant un ennemi posé sur son camp
  ne déclenche plus de « villageAttack » (il se joint à l'instabilité) ; le journal émet
  désormais **MÊLÉE avant les MORT** qu'elle cause.

- **Correctif labo (17/09, constat d'Erik)** : après « Poursuivre », résoudre le tour
  suivant échouait (« structuredClone … could not be cloned ») — l'état reporté vit dans un
  Proxy Svelte 5 que `structuredClone` refuse. `resoudre()` passe désormais par
  `$state.snapshot()` avant clonage. Vérifié en GUI (tour 1 → Poursuivre → tour 2 : mêlée
  différée résolue, barbare intermédiaire mort à 0) — capture
  `dev-logs/captures-engagement/05-melee-reportee-tour2.png`.

**Restés inchangés** : camps sans PV, capture = récompense hutte seedée, escalation,
aggro T-19, R-59 (à distance), R-128 Grande Muraille, R-43/R-57, R-149 Overrun, R-32/T-31.

## 3. Migration & état

- **`schemaVersion` 24 → 25** : champ additif `stabilized: boolean` par unité ; les parties
  migrées naissent stabilisées (R-173), idempotent. **Signalé AVANT de coder**, conforme.
- Unités de départ des cartes (`map.ts`) et fixture `makeState` : stabilisées si seules sur
  leur case (sémantique du premier tour).
- Nouveaux événements : `MeleeResolved` (rôles + PV par participante) et `UnitExpelled`,
  filtrés par le fog comme les autres ; durées d'animation ajoutées.

## 4. Fichiers principaux

- `packages/rules/src/` : `turn.ts` (Phase B réécrite : entrée libre, défenseur stabilisé
  R-174, ordre R-177, fin des replis ; **Phase E** `processStability` : expulsions → mêlées →
  captures → marquage), `melee.ts` (NOUVEAU — `drawWeightedMelee`, `meleeTauMultiplier`),
  `state.ts` (champ + migration 25), `barbares.ts` (gardien/satellites R-183),
  `constants.ts` (T-54/T-55, dégâts de mêlée), `events.ts`, `map.ts`, `fixtures.ts`
  (`stabilized` posable, défaut « seule occupante »).
- `apps/web/src/` : `GameCanvas.svelte` (drapeau retiré), `UnitPanel.svelte` (Fortify
  conditionnel), `laboCombat.ts` (pose spatiale des camps, journal MÊLÉE/EXPULSION,
  disposition « gardien/satellites »), `LaboCombat.svelte` (libellé satellites),
  `playback.ts`.
- `RULES.md` §8bis (R-173..R-183 + abrogations + table T-54/T-55), `barbares.json`
  (`gardeMinimale: 1`, `initialUnits: 3`).

## 5. Vérification

- **Suites vertes : rules 831/831 (26 tests engagement, R-176a et R-178 rév. A inclus), web 290/290, server 75/75 — total 1192.**
  Nouveau contrat : `packages/rules/tests/engagement.test.ts` (**22 tests**, R-173..R-183
  cités). Ancien contrat : tests de repli/collision/pile supprimés ou réécrits avec
  justification en commentaire ; graines recalées où le tirage R-177 consomme le RNG plus
  tôt (phase7e graine 16, phase7g graine 5) ; lecture sur l'ÉCHANGE (Phase B) quand la
  mêlée de Phase E masque l'issue de l'échange.
- **Typecheck 4/4** (svelte-check 0 erreur).
- **Labo `#/labo-combat` — captures `dev-logs/captures-engagement/`** (GUI réelle,
  vite `:5199`) :
  - `01-melee-disposition.png` / `02-melee-resolution-journal.png` — guerrier J1 (3,3) +
    guerrier J2 (4,3), attaque programmée J2, seed 20260915 : journal
    « ATTAQUE u2 → u1 en (3,3) » puis **« MÊLÉE en (3,3) — u1 GAGNANT PV 2 ; u2 PERDANT −2 PV, PV 1 »**
    (R-176/R-178/R-180/R-181) ;
  - `03-expulsion-cohabitation.png` — deux guerriers J1 posés en (5,4) :
    **« EXPULSION (cohabitation amie, R-179) u2 : (5,4) → (4,4) »**, l'autre stabilisée (R-179) ;
  - `04-camp-spatialise.png` / `04-camp-spatialise-resolution.png` — camp posé en (4,3) :
    disposition **« gardien 1, satellites 3 »** — u1 SUR le camp (4,3), u2 (3,3), u3 (3,4),
    u4 explorateur (4,2) (R-183).
- **Partie solo réelle** : non rejouée cette session (aucun serveur modifié côté
  comportement hors combat ; le dump admin serveur est couvert par les 75 tests server,
  dotation 9 barbares sur 3 camps vérifiée). À rejouer si le pilotage le souhaite.

## 6. Angles découverts en implémentation (signalés, tranchés dans le respect des règles)

- Un gardien qui contre-attaque un voisin **reste dans son camp** (attaque depuis sa case,
  comme une unité à distance — R-183) : sinon sa contre-attaque le faisait sortir du camp.
- Une attaque explicite contre un navire en mer depuis la rive : l'attaquant ne peut pas
  ENTRER — il attaque depuis sa case, pas de cohabitation possible (interprétation R-176).
- L'espion infiltré en ville est exempté de la capture à la stabilisation (7m/R-142 conservé).
- L'expulsion peut reloger un pacifique ami (aucune exception dictée — comportement uniforme,
  journalisé).
- RNG : chaque plan d'attaque consomme un tir de graine en tête de Phase B (tie R-177-e) —
  les graines de calibrage antérieures se décalent d'autant (documenté aux tests concernés).

## 7. Fin de session

Rapport remis. **Aucun commit/push** — sur demande explicite d'Erik uniquement. Suite
complète verte + typecheck 4/4 AVANT tout commit (règle établie). Vite dev laissé tournant
sur `:5199` (journal `dev-logs/vite-engagement.log`). Arrêt, remise de la main.
