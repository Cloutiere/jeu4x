# REPORT-EMBARQUEMENT — Embarquement naval cassé : diagnostic, correctif, verrouillage

**Mission** : HANDOFF-EMBARQUEMENT-BUG (signalement Erik 02/10 — « il ne peut pas embarquer d'unité sur les navires »).
**Statut** : correctif livré, suites vertes, captures réelles — **ARRÊT L4 : rien n'est committé, feu vert d'Erik requis.**

## 1. Verdict (L0) — la panne est 100 % CLIENT, le moteur est sain

Reproduction sur les deux couches avec les MÊMES états (galère + guerrier côtés) :

| Couche | Résultat | Preuve |
|---|---|---|
| **Moteur pur** (`resolveTurn`, Node) | ✅ embarquement OK **en mer ET à quai**, `Embark` émis | repro avant correctif — 2 tests verts du premier coup |
| **Client** (`pathTo` → clic droit) | ❌ `pathTo` retourne `null` → `rightClickAction` produit `cancelOrder` | repro avant correctif — 2 tests rouges |

### Mécanisme précis

- `apps/web/src/lib/render/interaction.ts` — `pathTo`, ligne 537 (avant correctif) :
  la case de DESTINATION doit être `enterableKnown(mover, to)`. Or `canEnterTerrain`
  (packages/rules/src/naval.ts:29) refuse l'eau pour une unité terrestre — donc
  **toute programmation vers la case d'eau du transport était impossible**, même
  adjacente. Le clic droit tombait dans le rejet unifié `cancelOrder` (le geste
  d'Erik « ne faisait rien »).
- Le correctif d'époque `boardableTransport` (interaction.ts:318, introduit 7g
  `4542efb`) est devenu du **code mort** : le commit `3958f8e` (interaction-3d,
  06/09) a retiré ses DEUX usages (destination `pathTo` + branche `extend`) en
  généralisant « toute case adjacente entrable est traçable » — sans réintégrer
  le cas transport, alors que la destination d'embarquement n'est justement PAS
  entrable (eau). PLACEMENT-MELEE (`3b41785`) n'est pas en cause (le suspect du
  pilot est disculpé : la mêlée ne touche que les cohabitations terrestres).
- Le validateur (`orderShapeError`, apps/server/src/game.ts:237) ne contrôle que
  la forme — rien à y faire. Le moteur applique R-117 AVANT `canEnter`
  (packages/rules/src/turn.ts:1208-1232) — intouché.

## 2. Correctif (L1) — minimal, client seul

`apps/web/src/lib/render/interaction.ts`, `pathTo` uniquement (+12 lignes) :

1. `toBoardable` : la destination est admise si l'occupant est un **transport
   ami à cargaison libre** pour une unité terrestre (`boardableTransport`,
   réutilisé — plus de code mort) ;
2. `toBoardable` rejoint `toUnknown` dans les DEUX portes de `pathTo`
   (destination en tête + voisinage BFS final) — **le transit ne passe toujours
   que par les cases vides**, le transport n'est jamais une étape intermédiaire.

Zéro changement : moteur, serveur, protocole, validateur, mêlée, fog, 3D.

## 3. Verrouillage (L2) — `apps/web/tests/embarquement.test.ts` (14 tests)

Client : chemin vers transport en mer / **à quai (ville portuaire)** ;
clic droit = `moveDraft` ; **cargaison pleine = refus propre** (null +
cancelOrder) ; transport ennemi refusé ; case d'eau vide toujours refusée ;
cohabitation terrestre inchangée ; unité navale inchangée ; transit refusé.
Moteur pur : embarquement mer + quai (`Embark`), cargaison pleine (arrêt case
précédente), **débarquement** (`Disembark`), **chemin gelé repris** (T1 approche,
T2 embarque, T3 débarque), **transversal post-PLACEMENT-MELEE** : même tour,
case amie terrestre traçable (refus moteur R-159 rév. B, arrêt propre) ET case
transport embarquable — les deux coexistent sans conflit.

## 4. Vérification (L3)

- Suites vertes **×2** : web **481/481** (43 fichiers), rules **936/936**,
  `svelte-check` 0 erreur.
- **E2e GUI en partie RÉELLE** (solo vs bot Zoulous, wrangler local, galère
  produite légalement — cost 30, tech null — tour ~15) : le geste complet
  d'Erik joué au hook `__game` (miroir exact clic gauche/clic droit) :
  embarquement (tour 16), navigation galère + passager (tour 17),
  débarquement via le panneau naval (tour 18) — états serveur vérifiés par
  dump admin à chaque étape.
- **Captures `dev-logs/captures-embarquement/`** : 1-programmation-vers-le-navire
  (ordre « Déplacement (1 case) » vers le navire), 2b-embarque-cargaison-1sur1
  (toast « u1 embarqué à bord de u6 », panneau « Charge : guerrier (u1) » +
  boutons Débarquer), 3a/3b navigation, 4a/4b/4c débarquement
  (toast « u1 débarque en (-4,19) », passager à terre, galère vide).
- Scripts réutilisables : `devtmp/embarquement-e2e.mjs` (préparation + e2e,
  mode `--code <CODE>` pour reprendre une partie prête).

## 5. Ce qu'Erik valide en ligne

1. **Le geste** : sélectionner une unité terrestre adjacente à un transport ami
   (mer OU port), clic droit SUR le navire → flèche + résolution = embarqué.
2. La cargaison 1/1 dans le panneau naval, boutons « Débarquer en (q,r) ».
3. Navigation avec passager, puis débarquement, le tout en vraie partie.
4. 🔶 Observation (non bloquant, à l'œil) : un toast rouge « Ordre non exécuté
   (u1) : Déplacement impossible » est apparu lors des résolutions de l'e2e —
   les traces montrent que TOUS les ordres d'embarquement/navigation/débarquement
   ont exécuté ; ce toast semble venir d'un autre ordre (bot/barbare ou ordre
   figé du harnais). Si Erik le reproduit en partie réelle sur l'embarquement
   lui-même, ouvrir un incident dédié.
5. 🔶 Ouvert (déjà au handoff) : capacités de cargaison par navire — valeurs
   canon doc CivRev (Galère/Galion 1) à re-trancher par Erik si besoin.

## 6. Non-reproduit / périmètre respecté

- Le moteur, le validateur, les valeurs navales, le fog, la mêlée : non touchés
  (tests transversaux verts).
- Suspect initial PLACEMENT-MELEE (`3b41785`) : disculpé — la régression date de
  `3958f8e` (interaction-3d), qui a supprimé les derniers usages de
  `boardableTransport` ; depuis, l'embarquement était improgrammable au clic.
