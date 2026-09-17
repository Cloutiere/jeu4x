# REPORT-LABO-ENGAGEMENT — Scories réglées + labo d'engagement ouvert à 5 nations + barbares

**Chantier outil + nettoyage (chapitre 2D, `HANDOFF-LABO-ENGAGEMENT.md`).** Trois volets
livrés : M1 scories d'ENGAGEMENT (nettoyage mort, zéro comportement), M2 rendu labo des
règles R-173..R-183, M3 extension du labo à **5 nations + barbares** (labo uniquement).
Zéro diff serveur, zéro diff 3D. **Aucun commit** (sur demande explicite d'Erik uniquement).

## 1. M1 — Les scories d'ENGAGEMENT (`packages/rules/src/turn.ts`)

1. **`applyRetreat` supprimée** (fonction morte, plus aucun appelant depuis ENGAGEMENT).
   Le type d'événement `Retreat` et sa lecture UI/labos sont **conservés** (journaux
   anciens — dégradation gracieuse voulue).
2. **Commentaires périmés remplacés** par le contrat ENGAGEMENT (R-173..R-183) :
   - en-tête « Phase B — combats & replis » → combats planifiés R-176/R-177 ;
   - bloc « RÉV. DÉFENSE-DE-PILE » (choix du défenseur de pile) → R-174 (défenseur
     stabilisé, déjà correct dans la seconde moitié du commentaire, doublon supprimé) ;
   - « repli unifié (R-54) » de `resolveAttack` → survie mutuelle = cohabitation (Phase E) ;
   - « Combat contre la PILE d'un camp barbare / BARBARES-PILES » (captureCamp,
     `resolveVillageAttack` « combats un par un, repli R-54 applicable, mort du DERNIER
     barbare ») → R-183 (gardien unique, un combat, capture à sa mort) ;
   - `processVillages` « pile — co-location barbare, le camp n'est plus une cible » →
     R-183 (rengendrement : gardien sur la case, sinon satellite adjacent) ;
   - références mortes R-53/R-54/R-55 des champs `origin`/`moved`/`steps` → R-175/R-176a/R-177.
3. **Aucun changement de comportement** : rules 831/831 verts AVANT et APRÈS (si un test
   était tombé, un comportement vivait encore — rien tombé).

## 2. M2 — Le laboratoire d'engagement, prêt pour les tests

Le rendu des règles était déjà en place depuis la session ENGAGEMENT (journal
`MÊLÉE`/`EXPULSION`, gardien/satellites, MÊLÉE avant MORT). Complété :

- **Badge 🔶 « Instable » sur la carte** (`LaboCombat.svelte`) : toute case à ≥ 2 unités
  porte un 🔶 en haut-gauche (infobulle « Case instable (R-173) — mêlée Phase E ») —
  ce qui va se battre se lit d'un coup d'œil ;
- **Disposition du journal** : chaque unité marque `, INSTABLE` quand non stabilisée
  (la stable n'affiche rien) — la section 1 montre l'état R-173 avant résolution ;
- les événements **mêlée** (rôles + PV), **expulsion**, **coup en passant R-176a** et
  **report de mêlée R-178 rév. A** se lisent dans le journal 4 sections (vérifié en GUI,
  captures ci-dessous ; le report de mêlée se voit en « Poursuivre » → MÊLÉE au tour 2).

## 3. M3 — Cinq nations + barbares (labo seulement)

### Verdict d'investigation : le moteur PUR gère N propriétaires

Vérifié par analyse **et** par test (`apps/web/tests/labo-engagement.test.ts`, état
5 joueurs passé au vrai `resolveTurn`) :

- `PlayerId` est un `string` libre (`state.ts`) — aucune union binaire ;
- `makeState(players: PlayerId[])` accepte une liste arbitraire, guerres par paires
  générées pour toutes les combinaisons (`defaultWarPairs`) ;
- la mêlée pondérée R-180 (`drawWeightedMelee`) tire parmi TOUTES les participantes
    (3 propriétaires → winner/loser/middle, étau par comptes d'alliés) ;
- les victoires (domination/razedCapital/culture/science/économique) itèrent
    villes/joueurs sans hypothèse binaire — aucun `Victory` parasite à 5 joueurs.

**Contour labo-only** : J1/J2 restent le minimum de `creerEtatLabo` (aucun joueur
fantôme quand seules des nations classiques sont posées) ; J3..J5 entrent dans l'état
uniquement si utilisées. **Aucune partie réelle n'est touchée** (1v1 en prod inchangé,
zéro diff serveur).

### Réalisation

- `laboCombat.ts` : `CampLabo = p1..p5 | barbare`, `JOUEURS_LABO`, `nomCamp` → J1..J5,
  journal qui itère toutes les nations, nations présentes dérivées des poses ;
- `LaboCombat.svelte` : sélecteurs de pose/édition à 5 nations, **onglets de
  programmation J1..J5**, ordres passés au moteur pour les 5 côtés, résumé/compteurs
  par nation. **Teintes** (labo uniquement, en attendant la palette définitive des
  assets) : menthe `#3dffce`, bleu `#3b6fd6`, **violet `#a78bfa`, ambre `#f59e0b`,
  rose `#ec4899`** — rouge réservé aux barbares (décision Erik conservée) ;
- barbares inchangés (R-183, indépendant du nombre de nations).

### Tests (`apps/web/tests/labo-engagement.test.ts`, 5 tests)

pose 5 nations (état à 5 joueurs), pas de joueur fantôme, **mêlée à 3 propriétaires**
(rôles winner/loser/middle, reproductibilité R-80, nations tierces indemnes, pas de
`Victory`), **expulsion R-179 pour J4** (l'autre demeure stabilisée), **programmation
d'une nation extension** (attaque de J5 menée au moteur).

## 4. Vérification

- **Suites vertes : rules 831 + web 295 + server 75 = 1201** (baseline 1196 + 5 tests
  labo-engagement). **Typecheck 4/4** (svelte-check 0 erreur).
- **Zéro diff serveur et 3D** (`git diff --stat` : `turn.ts` (commentaires + fonction
  morte), `laboCombat.ts`, `LaboCombat.svelte` uniquement).
- **e2e GUI** (vite `:5199`, captures `dev-logs/captures-labo-engagement/`) :
  - `01-cinq-nations-melee-journal.png` — scénario 5 nations : guerriers J1/J2/J3
    co-posés en (3,3) 🔶, deux guerriers J4 en (5,4) 🔶, archer J5 stable en (7,5) ;
    résolution seed 20260915 : **EXPULSION u5 (J4) → (4,4)** puis **MÊLÉE en (3,3) à 3
    propriétaires** (u1 GAGNANT, u2 PERDANT −2, u3 intermédiaire −1) ;
  - `02-programmation-onglets-J1-J5.png` — les cinq onglets de programmation, les
    teintes distinctes des 5 nations et les badges 🔶 sur la carte.

## 5. Mode d'emploi express du labo (`#/labo-combat`)

1. **Poser** : outil « Poser » → type d'unité, camp (J1..J5/Barbare), PV ; clic sur la
   carte. Villes et camps barbares (gardien + satellites R-183) via les boutons dédiés.
   Une case à ≥ 2 unités porte le badge 🔶 (instable, R-173).
2. **Peindre** les terrains au besoin (forêt/colline = bonus défense, montagne/eau
   infranchissables).
3. **Programmer** : onglet de la nation → clic sur une de ses unités → clics sur la
   carte = chemin (R-158) ; bouton « Attaque adjacente… » puis clic de la cible ;
   « Fonder », « Tenir », « Effacer l'ordre ».
4. **Résoudre le tour** (seed affiché/modifiable, R-80 reproductible) → journal 4
   sections (disposition avec état INSTABLE, ordres, résolution MÊLÉE/EXPULSION/morts,
   fin de tour) + avant/après. « Copier le journal » pour le coller à ZCode.
5. **Poursuivre** enchaîne sur le tour suivant (le report de mêlée R-178 s'y voit) ;
   « Revenir à l'avant-résolution » rejoue une variante d'ordres.

## 6. Fin de session

Validation locale avec captures AVANT tout commit (règle établie) — faite. Rapport remis.
**Aucun commit/push** (sur demande explicite d'Erik). Le vite de la session précédente
sert toujours `:5199` (labo ouvert, scénario 5 nations affiché en mode Programmer).
Arrêt, remise de la main.
