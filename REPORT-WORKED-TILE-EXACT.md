# REPORT-WORKED-TILE-EXACT — Désélection exacte de la tuile cliquée (R-60 rév.)

**Chantier gameplay de correction (chapitre 2D) — livré le 14/09/2026.** Constat d'Erik : cliquer une tuile cultivée ne libérait pas TOUJOURS CETTE tuile. Nouvelle règle : **cliquer une tuile cultivée = CETTE tuile précise sort des terrains cultivés**, le citoyen libéré redevient un **ouvrier intérieur disponible** (R-60bis). La clause « échange » de R-60 (30/08) est **ABROGÉE**.

## 1. Forme d'ordre : CONSERVÉE

`orderShapeError` vérifié AVANT le moteur (piège §1.3 du handoff) : l'ordre garde sa forme `(ville, case)` — `SetWorkedTile { cityId, tile: "q,r" | null }` (apps/server/src/game.ts:209). **Aucune migration** : la liste `workedTiles` ne change pas de forme, `schemaVersion` **23 inchangée**. Sémantique nouvelle :
- `tile` = case **déjà travaillée par la même ville** → **désélection exacte** de CETTE case (avant : no-op) ;
- `tile` = case libre du rayon → assignation (inchangé ; ville pleine = ignoré, inchangé) ;
- `tile: null` → désassignation déterministe du dernier assigné (inchangé).

## 2. Moteur (packages/rules/src/turn.ts · `applySetWorkedTile`)

- La branche « déjà travaillée par cette ville : no-op » est remplacée par le **retrait exact** (`splice` de la case ciblée).
- **Cause racine du « moteur suit l'ordre d'attribution »** : le test `takenByOthers` (calculé avec `null` = TOUTES les villes, la sienne comprise) passait AVANT le test « déjà travaillée par cette ville » — toute désélection par la case elle-même était avalée par le `continue` ; seul `tile: null` (dernier assigné) fonctionnait, d'où l'impression d'un retrait « dans l'ordre d'attribution ». Le test exact passe désormais AVANT le test `takenByOthers` (commenté dans le code).
- Le citoyen libéré redevient **intérieur** (R-60bis, tranche commerce appliquée automatiquement en économie) et reste disponible : PAS de re-remplissage automatique (`pendingFill` réservé aux villes fondées/capturées/croissées — inchangé). La ré-affectation = second ordre explicite, possible **au même tour** (file d'ordres).
- Assignation automatique, rayon (6/18), cap de citoyens, autorités (autre ville) : intouchés (tests dédiés).

## 3. Client (apps/web) — source unique `effectiveWorkedTiles`

- `interaction.ts` · `effectiveWorkedTiles` (miroir de la file d'ordres pour prédicat de clic + marqueurs 2D/3D) : ordre sur case déjà travaillée = retrait de CETTE case ; plus fidélité au `takenByOthers` stale du moteur (une tuile initialement travaillée puis retirée dans la file ne peut pas être re-pushée par un ordre ultérieur).
- Prédicats de clic **carte** (`clickAction` règle 1) et **vue ville** (`clickActionVueVille`, MENU-VILLE) : le clic sur une case cultivée émet désormais `{ tile: case }` (plus de `tile: null`) — même règle aux deux endroits.
- **Bug trouvé et corrigé au passage** : `CityPanel.svelte` portait son PROPRE miroir local (pré-INTERACTION-3D) qui ignorait les ordres ciblant une case travaillée — les ordres partaient au serveur mais le panneau n'affichait jamais l'état en attente (c'est ce qui masquait le bug côté GUI pendant la vérification). Le panneau est maintenant branché sur `effectiveWorkedTiles` (source unique).
- Puces « Citoyens » du panneau ville : clic = désélection exacte de CETTE case (avant : `tile: null` = dernière assignée, incohérent avec le libellé).

## 4. RULES.md

R-60 révisée (14/09 WORKED-TILE-EXACT) : table des ordres + règle — clause « échange » marquée ABROGÉE, désélection exacte documentée (y compris `tile: null` inchangé et la sémantique temps réel/vue ville). Entrée PILOT-HANDOFF §3 n° 13 (« RULES §4 SetWorkedTile : échange à réaligner ») : réaligné.

## 5. Vérification

- **Tests : 1133 verts** (rules 804 — 6 nouveaux WORKED-TILE-EXACT : désélection exacte, échange abrogé, réaffectation même tour, ville pleine inchangée, `null` inchangé, autorités ; web 254 — 1 nouveau + 2 réécrits à l'ancien contrat ; server 75). **Typecheck 4/4.** `schemaVersion` 23. **Zéro fichier 3D/fonderie touché.**
- **e2e solo sur wrangler dev** (`botSolo-e2e.mjs`) : TOUS LES CONTRÔLES PASSÉS — victoire par domination au tour 74, bot jouant chaque tour, parties 2 joueurs inchangées.
- **Partie solo GUI** (partie 9TDSTK, Rome vs bot, wrangler dev + vite) — captures dans `dev-logs/captures-worked-tile-exact/` :
  - `01-avant-3-tuiles-A25-14-B26-12-C27-13.png` : ville pop 3, tuiles A(25,14)/B(26,12)/C(27,13), +6 nourriture ;
  - `02-apres-clic-B-26-12-deselection-exacte.png` : clic sur B → son hexagone disparaît, A et C restent ; panneau « 2 assignés · 1 à assigner », « 1 citoyen intérieur : Ouvrier (+1 P) », valeurs projetées 4 N / 1 P ;
  - `03-reaffectation-explicite-26-14.png` : second clic sur la tuile libre (26,14) → 3 tuiles à nouveau (A, C, nouvelle) ;
  - `04-tour9-resolu-B-libre-26-14-travaillee.png` : après résolution, l'état exact est conservé (+4 nourriture, B libre, PAS de re-remplissage) ;
  - `05`/`06`/`07` : vue ville — entrée (double-clic), désélection exacte de (27,13) DANS la vue ville (+4 → +2 N, 3 → 4 marteaux, liseré de l'hexagone retiré), sortie sans surprise (Échap/Fermer, unités restaurées).

## 6. Notes / restes

- **Travail parallèle détecté dans git status** (non touché par cette mission) : `assets-src/tools/generate.py` (+136/−33), régénération des PNG `art/` et `exports/` — probablement le chantier fonderie signalé en §3 du handoff ; à ne pas mélanger avec le commit de ce chantier.
- Une partie solo locale (9TDSTK) reste ouverte sur le wrangler dev local, neutre (aucun ordre en attente).
- Le timer 60 min par défaut en local auto-verrouille les ordres après échéance (comportement §4.6 inchangé, non lié à ce chantier).
- **Pas de commit** : validation locale avec captures faite AVANT tout commit (règle établie) — commit/push sur demande explicite d'Erik.
