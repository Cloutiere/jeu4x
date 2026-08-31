# RAPPORT PHASE 6 — Économie des terrains & bâtiments

**Statut : livrée.** Moteur, serveur, UI, assets, tests et déploiement. Baseline
`pnpm test` 140 tests verts → **172 tests verts** (packages/rules : 123, web : 49
inchangés, server : 22 inchangés) + typecheck global 0 erreur.

## Livrables

### L0 — Données (source unique)
- `terrain.json` : rendements §2 révisés (plaine 1/0/0, forêt 0/2/0, colline 0/1/0),
  champ `gold` → **`commerce`** (données, pas de migration), **désert** 0/0/1,
  **eau** garde son id mais devient la **Mer** productive 0/0/2, forêt **+50 %**,
  **montagne** 0/1/0 (travaillable), case de ville inchangée 2/1/1.
- `buildings.json` (nouveau, data-driven) : les 6 bâtiments R-66 aux coûts
  20/30/40/30/30/40 🔶 ; effet = terrain ciblé + bonus ; Tribunal `workRadiusBonus: 1`.
- Cartes 40×40 : légende `d` + tuiles de désert autour des 2 spawns (Comptoir
  testable) ; **re-validation** complète (11 tests de carte verts).

### L1 — Moteur (test-first)
- `economy.ts` (nouveau) : `tileYield` (base §2 + bonus bâtiments par terrain
  travaillé), `workRadiusOf` (T-08b = 1, **2 avec Tribunal**), `autoAssignWorkedTiles`
  (priorité nourriture > production > commerce, tie-break (q, r) — R-81).
- **R-60 révisé** : `City.workedTiles` (≤ pop, centre-ville automatique et gratuit,
  jamais assigné) ; montagne/mer travaillables ; une case travaillée l'est par
  exactement une ville (propriété testée + testée par fast-check existant).
- **Ordre `SetWorkedTile`** : validations (rayon avec bâtiments, libre, travaillable,
  non-ville) ; désassignation par `null` ; assigner une case libre quand tous les
  citoyens sont occupés = **échange** avec la case la moins intéressante.
- **R-63** : seuil `10 × pop` (T-15 = 10, calibration 25 annulée), +1 pop = +1
  citoyen auto-assigné, +T-16 production par pop conservé ; événements
  `PopulationGrew` / `BuildingCompleted` ajoutés au journal (R-73).
- **R-66** : items de production étendus `{kind:'unit'|'building'}` ; bâtiment
  achevé → `city.buildings` (permanent, non duplicable, **perdu à la capture**) ;
  le commerce n'est jamais crédité directement — réparti or/science par le
  curseur R-61 (reste entier à l'or).
- **Migration `schemaVersion` 3→4** : `workedTile` supprimé → `workedTiles`
  (auto-assignation déterministe de l'état chargé), `buildings: []`,
  item de production string → `{kind:'unit', id}`. Idempotence testée.

### L2 — Serveur
- `GameDO` : validation structurelle des nouveaux ordres (`SetWorkedTile`, item
  étendu), propriétaire, sujets de remplacement (un brouillon par ville et par
  type), `CancelOrder` sur ville efface production **et** réassignation.
- Admin dump inclut `workedTiles`/`buildings` (champs de l'état, déjà diffusés).
- Bot : réassignation aléatoire valide de temps en temps (~20 % des villes/tour).

### L3 — UI
- **Surbrillance des cases travaillées** : cadre de la couleur du propriétaire sur
  chaque case travaillée d'une ville visible (positions vérifiées au pixel via les
  sprites d'overlay).
- **Overlay N/P/C masquable** : bouton « Rendements » de la barre supérieure ;
  indicateur `n/p/c` sur chaque case explorée à rendements.
- **Menu de ville enrichi** : cumuls N/P/C + répartition or/science (R-61),
  jauge de croissance `foodStored / 10 × pop` (R-63), liste des citoyens
  (désassignation au clic), bâtiments possédés, rayon de travail courant,
  **clic sur une case = réassignation** (R-60), menu de production **unités +
  bâtiments** (nom, coût, effet en info-bulle).
- Icône commerce utilisée dans les cumuls ; playback des nouveaux événements
  (toasts « grandit » / « achevé », effets `good`).

### L4 — Assets (générateur)
`tools/generate.py` étendu : `tile_desert.png` (sable, dunes, cactus), **12 fichiers
d'emblèmes** des 6 bâtiments (`batiment_*.png` + `_accent`), `icone_commerce.png`
(balance de marchand). `--check` CONFORME (dimensions, ratio √3/2, accents blancs),
`sync-art` → 37 fichiers, `palette.txt` + `LICENSES.md` régénérés.

## Vérification (L5)

### Scénario e2e moteur (nouveau test `e2e.test.ts`)
fondation → croissance pop 2 par les vrais rendements (4 N/tour, événement
`PopulationGrew`, +1 citoyen auto-assigné) → assignation à la plaine → Grenier
construit (progression + `BuildingCompleted`) → **+1 N vérifié dans le gain de
nourriture du tour** (rendements effectifs, Grenier compris) → Tribunal construit →
**case de montagne à distance 2 assignée** (refusée sans Tribunal, testé) →
propriété d'unicité des cases travaillées.

### Vérification GUI locale (vs bot, navigateur)
Partie `3CPW9X` locale (pédagogique 40×40, bot) jouée à la souris sur 49 tours :
- déplacement du Colon (T-09 respected : « Fonder une ville » désactivé à distance 1),
  fondation de ville ;
- menu de ville : cumuls **N 4 / P 1 / C 1**, répartition **or 1 / science 0**,
  jauge **4/10**, citoyen affiché, 8 items de production ;
- **Grenier en file → construit** (journal « grenier achevé dans c3 », badge
  « Grenier » dans les bâtiments) ;
- **réassignation par clic carte** vérifiée (`workedTiles` mis à jour à la
  résolution) ;
- croissance pop 2 → 11 (croissances dans le journal), citoyens auto-assignés ;
- **Tribunal construit → rayon 2** : 11 citoyens dont 5 cases à distance 2,
  assignation manuelle d'une case à distance 2 acceptée ;
- overlay « Rendements » activé (65 éléments d'overlay) et cadres de couleur sur
  les cases travaillées (vérifiés aux positions monde exactes).
Captures : `docs/capture-phase6-pop2-overlay.png`,
`docs/capture-phase6-tribunal-rayon2.png`.

## Interprétations (documentées dans le code, 🔶 à confirmer si besoin)
1. **Re-remplissage** : l'auto-assignation ne joue que si des cases deviennent
   indisponibles (ou ville neuve/colonisation d'un citoyen de croissance). Une
   **désassignation manuelle** (`SetWorkedTile null`) laisse le citoyen au repos
   — elle n'est pas écrasée au tour suivant.
2. **Échange (R-60)** : assigner une case libre quand tous les citoyens sont
   occupés remplace la case **la moins intéressante** de la ville (même priorité
   nourriture > production > commerce, tie-break (q, r)) — interprétation du
   « re-assignation par échange » du handoff.
3. **Désassignation** : `pop()` — le citoyen assigné **en dernier** est retiré
   (déterministe, pas de choix de la « meilleure » case qui réintéresserait le
   joueur).
4. **Migration v4** : `workedTiles` par défaut = auto-assignation recalculée de
   l'état chargé (l'ancienne `workedTile` unique était produite par le même
   algorithme — recalculer est plus robuste que reporter une valeur périmérée).
5. **Case de ville travaillable ?** Une ville ne travaille jamais la case d'une
   autre ville (y compris son propre centre) — cohérent avec R-60 « parmi les
   cases environnantes ».
6. Le scénario GUI du handoff dit « assigner le citoyen à une **plaine** » : sur
   la carte pédagogique, la ville testée n'a pas de plaine dans son rayon —
   l'assignation a été faite sur une prairie (même mécanique), et l'effet
   **+1 N par plaine du Grenier est couvert par le test e2e moteur** (où la
   plaine est travaillée).

## Périmètre respecté
Pas de génération procédurale (6b), pas de personnalisation visuelle (4.5),
pas de techs/unités nouvelles (Phase 7 — les bâtiments ne nécessitent aucune
tech en v1), pas de spécialistes.

## Déploiement
Push de `main` (651330f → 1441c7a) → workflow **Deploy : success** sur 1441c7a
(tests + typecheck puis deploy worker/pages). Vérifications en ligne :
- `GET /api/health` → 200 ;
- le bundle servi (`/assets/index-CLr3LL3K.js`) est **celui de ce commit** (hash
  identique au build local) et contient le nouveau code (`SetWorkedTile`,
  bouton « Rendements », bâtiments) ;
- `/auth/dev` correctement **désactivé** en prod (403).

**Partie complète en ligne non jouée** : la prod n'accepte que l'OAuth
Google/Discord réel (aucun identifiant disponible pour la session agent). Le
même scénario (création de partie, tours, production de bâtiment) a été joué
intégralement **en local à la souris vs bot** (§Vérification GUI). Erik peut
rejouer le scénario en ligne en ~2 minutes avec son compte ; le moteur et le
serveur sont identiques (mêmes contrats, même bundle).
