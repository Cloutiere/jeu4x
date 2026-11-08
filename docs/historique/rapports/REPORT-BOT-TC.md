# REPORT-BOT-TC — Le bot déclare la guerre (agressivité par civ) + la paix minimale

**Mission** : HANDOFF-BOT-TC.md (décisions Erik 25/10) — D1 agressivité par civilisation, D2 ciblage + offensive capitale, D3 paix minimale, D4 rien d'autre, D5 bancs recadrés. T2 (négociation), T3 (ONU/Grande Muraille), Jev, valeurs de combat, fog du bot et `schemaVersion` : **hors périmètre, intouchés**.

## L1/L2 — Données + règles pures (tests-first : `bot-tc.test.ts`, 23 verts)

- **D1 · `civilizations.json`** : champ `agressivite` (0-1) sur les 16 civs + `params.agressiviteDefaut` 0,5 — canon CivRev :
  | Très agressives | Agressives | Intermédiaires | Paisibles |
  |---|---|---|---|
  | Aztèques 0,9 · Mongols 0,9 · Zoulous 0,85 | France 0,8 · Grèce 0,75 · Rome 0,7 · Germanie 0,7 | Russie 0,6 · Espagne 0,55 · Chine/Arabie/Angleterre 0,5 · Égypte 0,45 | Japon 0,4 · Amérique 0,35 · Inde 0,25 |
  Helper pur `agressiviteDe(civId)` (civilizations.ts).
- **D1 · `bot.json`** : bloc diplomatie ×3 profils — `tourMinGuerre` 15/10/8, `seuilRatioGuerre` 1,0/**0,7**/0,5, `facteurAgressivite` 0,6/1,0/1,5, `delaiEntreGuerres` 30/20/12, `seuilRatioPaix` 0,5/0,6/0,7, `chanceAccepteFaible` 0,6/0,75/0,85, `toursPaixMin` 20/12/8.
- **État** : champs OPTIONNELS `diplomacy.warsDepuis` (clé « a,b » → tour de début) et `dernieresGuerres` (fin de la dernière guerre par joueur) — **zéro migration, schemaVersion 28 inchangée**.
- **`ProposePeace { player }`** : miroir `DeclareWar` — forme validée EN PREMIER (`orderShapeError`, leçon 7f), moteur pur `applyProposePeace` (diplomatie.ts) : purge de `war` + `warsDepuis`, `dernieresGuerres` posée, événements PUBLICS `PeaceAccepted`/`PeaceRefused` (fog.ts PUBLIC_EVENTS, labels, Chroniques, playback).
- **Décisions pures (botPolicy.ts)** : `forcesDe` (Σ attaque+défense déployés, vétérans ×1,5), `cibleGuerre` (voisin le plus faible : forces ↑, distance wrap capitales ↑, id ↑ — R-81), `deciderGuerre` (tour min → délai → rapport ≥ seuil → tirage < agressivité × facteur), `deciderPaix` (accepte si écrasé + tirage, ou durée ≥ `toursPaixMin`), `cibleOffensive` (capitale ennemie la plus proche).
- **Déterminisme** : RNG bot dédié inchangé (R-80) ; la décision de paix d'une cible utilise une dérivation seedée dédiée `botTurnSeed(seed, tour, "paix:<cible>")` — reproductible au rejeu (verrouillé par test témoin dans le banc).

## Ajustements de calibrage 🔶 (proposés par l'agent — verdict Erik attendu)

1. **`seuilRatioGuerre` « normal » à 0,7** (et difficile 0,5, facile 1,0) : en paix perpétuelle le bot n'investit PAS le militaire (`arbitrerProduction` ① ne s'applique qu'en guerre/menace) — un seuil strict (1,25 testé) verrouille la paix éternelle contre un joueur passif (banc botSolo : 0 guerre en 300 tours).
2. **Proposition de paix uniquement en position PERDANTE** : la clause de durée (`toursPaixMin`) reste du côté ACCEPTATION. Testé et écarté : « proposer dès 12 tours » faisait signer le bot GAGNANT (l'auto-décision de la cible accepte après `toursPaixMin`) — ses offensives mouraient au bout de 12 tours.
3. **Décision de paix d'un bot face à un proposeur HUMAIN** : même formule (écrasé/longue guerre ⇒ accepte) — la négociation réelle est T2 🔶.

## L3 — Client

- Pastille adverse en guerre : bouton **🕊 « Proposer la paix »** (décalé à gauche du badge ⚔, palette verte) → modale de confirmation (miroir de la déclaration) → `ProposePeace`.
- **Réponse affichée en direct** : toasts « X ACCEPTE la paix », « X REFUSE votre proposition de paix », « X vous déclare la GUERRE ! » ; Chroniques de tous (événements publics).

## L4 — Bancs

- **Banc T-D réutilisé (bancBotTd)** : les actions de diplomatie du bot sont appliquées par le banc (miroir exact du DO) ; mesures `guerres`/`paix` ajoutées ; sortie ré-ancrée sur le dépôt (piège `process.cwd()`).
- **Tableau T-C vs baseline T-D** (40 parties bot vs bot × 3 difficultés × 150 tours, corpus fixe, témoin de rejeu bit à bit ✓) :

| Difficulté | Tours T-D → T-C | Guerres/partie (T-C) | Paix acceptées (T-C) | Unités T-D → T-C | PV mil. T-D → T-C |
|---|---|---|---|---|---|
| facile | 134,5 → 147,8 | **1,58** | 0,68 | 59,9 → 123,4 | 137,5 → 348,8 |
| normal | 139,9 → 144,7 | **2,75** | 1,98 | 69,2 → 100,9 | 170,4 → 276,4 |
| difficile | 142,3 → 147,4 | **5,20** | 4,68 | 61,4 → 88,7 | 176,2 → 235,4 |

  Gradation mesurée : difficile déclare **2× plus** que normal et **3× plus** que facile (facteur d'agressivité du profil ✓) ; les guerres doublent l'armement des empires (production militaire ① en guerre). 6 parties sur 120 se terminent par conqueste avant t150 (tours moyens 82) — les capitales tombent : offensives R-188-b prouvées entre bots.

- **banc e2e GUI (`devtmp/bot-tc-gui.mjs`)** : partie solo légale + GOD-MODE — guerre déclarée PAR L'UI (modale pastille), guerre tenue, puis paix proposée PAR L'UI (bouton 🕊) et **acceptée par le bot** (durée ≥ `toursPaixMin`). Captures `dev-logs/captures-bot-tc/` (modale-déclaration, guerre-déclarée, modale-paix, après-proposition) — la pastille « Bot 🤖 · Normal — ⚔ En guerre » et les combats du bot figurent aux Chroniques.

## Verdict — critères d'acceptation

1. **Guerres entre bots + offensives capitales** : ✓ au banc (2,75 guerres/partie « normal », 5,20 « difficile » ; 6 conquestes avant t150). En god mode solo, la guerre joueur↔bot + combats du bot sont capturés ; 🔶 la MARCHE longue d'une armée bot vers une capitale humaine reste lente (voir limites).
2. **Proposer la paix + réponse du bot** : ✓ (UI pastille → modale → `PeaceAccepted`/`PeaceRefused` publics, toast + Chroniques ; le bot a accepté après `toursPaixMin` — capture).
3. **Banc botSolo re-converge** : 🔶 **NON CONVERGÉ** — la guerre éclate (t50-79 sur 3 runs) et le bot construit une armée (129 impis), mais la capture de la capitale d'Alice passive échoue à 300 tours. Causes consignées : (a) mur de 7 guerriers sur les 7 cases autour de la capitale (Hold Alice) — chaque assaut est 1v1 contre du frais ; (b) **verrou de circulation** : les excédents engendrés SUR la capitale ne sortent plus (anneau saturé, `pasVers` glouton à un pas) ; (c) stagnation macro PRÉEXISTANTE du bot solo (pop 1, 0 techs à t300 lors du premier run — consignée depuis BOT-FONDATION). À cadrer en tranche tactique dédiée.
4. **Déterminisme + suites** : ✓ — témoin bit à bit du banc ✓ ; rules **1101** / server **230 +1 skip** (dont `bot-tc.test.ts` 23 verts) / web **700** ; tsc 0 (rules/shared/server/web), svelte-check 0.

## Limites honnêtes

- L'e2e carte-multi long (400 tours) n'a pas été rejoué — la preuve « guerres entre bots » vient du banc bot-vs-bot (même moteur, guerres mesurées).
- La réponse d'un bot à une paix proposée par un HUMAIN utilise la formule (écrasé ou longue guerre ⇒ accepte) — pas de personnalité par civ côté ACCEPTATION 🔶 (seule la DÉCLARATION est agressivité-dépendante).

## Pièges consignés

- **Cache vitest périmé** (`apps/server/node_modules/.vite`) : deux bancs complets ont tourné sur des versions intermédiaires de `bancBotTd.ts` (mtime/hash non invalidés) — purger `.vite` avant toute re-mesure.
- **Sortie du banc hors dépôt** : `resolve(process.cwd(), '../../../devtmp')` dépend du worker vitest — deux bancs ont été écrits dans `~/devtmp` ! Corrigé (ancrage sur `import.meta.url`) ; les chiffres T-C authentiques venaient de `C:/Users/Erik/devtmp/banc-bot-td.json` (copiés en `devtmp/banc-bot-tc.json`).
- Le blocage fin de tour force Alice à produire (marteaux > 0) : sa posture passive passe par des BÂTIMENTS (repli guerrier les premières tours).
- La décision de paix du DO est symétrique (cible humaine ou bot) — T2 la remplacera par la négociation.
- PIÈGE préexistant rappelé : routeur hash ne re-monte pas `<Game>` au changement de code (relancer Vite).

## À juger en jouant par Erik

- Les agressivités par civ (tableau ci-dessus) — l'échelle « qui attaque qui en vrai ».
- Le seuil `seuilRatioGuerre` 0,7 (normal) : un bot un peu plus faible attaque-t-il trop tôt ?
- Le libellé/feel du bouton 🕊 et des toasts de réponse.
- Les valeurs `toursPaixMin` 12 (normal) : les guerres durent-elles assez longtemps à son goût ?
