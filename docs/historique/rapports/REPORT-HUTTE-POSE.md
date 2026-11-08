# REPORT-HUTTE-POSE — L'ouverture des huttes vaut pour toute pose sur la case

**Commit** `e5fcf19` poussé sur `main` (04/10) — CI + Deploy en cours.

## Verdict sur les deux questions d'Erik

### 1. Huttes — MÊME BOGUE, corrigé
`openHutAt` (R-98) était câblée aux **4 mêmes sites de pas de mouvement** que
l'ancien code artefact : débarquer directement sur une hutte (dépose
programmée du bateau) n'ouvrait rien. Exactement le bogue ARTEFACT-ARCHE
(`cbd29ac`), transposé :

- **D1 — balayage** : `balayerHuttes(board)` en tête de Phase A (juste après le
  balayage artefacts) — toute unité des civilisations debout sur une hutte
  l'ouvre, ordre unitId croissant (R-81), idempotent (hutte retirée à
  l'ouverture). **Rattrape la partie en cours d'Erik** à la prochaine
  résolution.
- **D2 — câblage des poses** : `openHutAt` appelée dans `tenterDepose` (après
  `Disembark`) et `regulariserArrivantes` (après `ArrivanteRegularisee`) —
  l'événement `HutOpened` porte le bon tour et la bonne unité.
- **R-95 inchangée** : les barbares n'ouvrent jamais (déjà filtré par
  `openHutAt`, testé).
- La récompense reste tirée au RNG seedé de résolution (R-80) — déterminisme
  intact (même seed → même partie).

### 2. Villes ennemies — PAS touchées (aucun correctif nécessaire)
La capture R-65 (`processCityCaptures`) ne dépend PAS des pas de mouvement :
elle balaye l'occupation de **toutes** les villes en Phase C. Toute unité
posée (débarquée incluse) sur une ville ennemie **sans défenseur** est donc
capturée le tour même de la pose — sac de trésorerie, perte des bâtiments,
rasement barbare (R-97) et victoire par capitale originale suivent le même
chemin. La dépose exige de plus une case **sans occupant** : on ne peut pas
débarquer sur une ville défendue (inchangé ; la prise d'une ville défendue
passe par le combat, hors sujet).

## Tests (test-first)

`packages/rules/tests/hutte-pose.test.ts` — 5 cas verts :
1. dépose programmée sur une hutte (galère → guerrier) → `HutOpened` **au tour
   de la dépose**, hutte retirée ;
2. régularisation d'arrivante sur une hutte (île isolée) → ouverture à la
   résolution suivante ;
3. balayage : unité déjà debout sur une hutte sans y être entrée → ouverture
   au tour suivant (rattrapage) ;
4. barbare debout dessus → jamais (R-95) ;
5. deux unités dessus → une seule ouverture, première au tri unitId (R-81).

Suites : **rules 980** (975 + 5) / **web 506** / **server 120** — vertes.
(Note : web est passé de 495 à 506 tests entre les deux missions — sessions
parallèles, rien de lié à ce correctif.)

## RULES.md

R-98 amendée (addendum HUTTE-POSE) : l'ouverture vaut pour toute **POSE** sur
la case — dépose programmée, régularisation, balayage de début de résolution —
pas seulement les pas de mouvement (miroir R-153).

## 🔶 Observations (hors périmètre, non corrigées)

- **Dépose sur une case de village barbare** : `tenterDepose` exige une case
  sans occupant, mais ne vérifie pas la présence d'un VILLAGE sur la cible —
  une dépose sur la case d'un village (vide) y poserait l'unité sans combat,
  là où un pas de mouvement déclencherait l'attaque (R-52). Cas limite peu
  probable (village souvent gardé), à trancher si Erik le souhaite : refuser
  la dépose sur village, ou déclencher l'attaque planifiée.
- Les camps barbares ne sont pas concernés : leur capture passe par la MORT
  du gardien (R-183/`captureCamp`), jamais par une simple pose.

## À vérifier en ligne par Erik

- **La partie en cours** : l'unité débarquée sur la hutte ouvrira celle-ci à
  la **prochaine résolution** (balayage D1) — récompense + entrée Historique.
- Toute future dépose de bateau sur une hutte ouvre au tour même de l'arrivée.
- Prise d'une ville ennemie vide par débarquement : capture le tour même
  (comportement existant, non régressé).
