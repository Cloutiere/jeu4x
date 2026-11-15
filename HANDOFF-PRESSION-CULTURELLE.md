# HANDOFF-PRESSION-CULTURELLE — Pression culturelle défensive : bonus déf +10/+20/+30 % par paliers de pression

**Mission d'implémentation — TRANCHE 1 du volet culture (les 7 tranchés VALIDÉS par Erik le 14/11).** Spec de référence : `PROPO-PRESSION-CULTURELLE-DEFENSIVE.md` (racine) — lis-le en entier AVANT de coder ; sa §2 (formule + table de chiffrage) et §4 (plan d'implémentation) font foi. Les 7 🔶 de sa §3 sont DÉJÀ TRANCHÉS ci-dessous (défauts Erik) : ne pas re-négocier, toute envie de changer une valeur = arrêt-pour-approbation.

## 0. Préalables

- Docs à lire : `PROPO-PRESSION-CULTURELLE-DEFENSIVE.md` (tout), `RULES.md` T-02 (terrain), R-121 (Monarchie/Fondamentalisme), R-122 (anarchie), R-162 (rayon culturel VISUEL — ne pas confondre, voir D1), R-66 (capture de ville — bâtiments perdus, merveilles survivent).
- Baseline attendue : rules **1215** / server 544 / web 793 / jev-port 52 verts, `schemaVersion` **28**, `main` sur `4d0657f` ou après (SANCTUAIRE `29b0c17` acceptée — la culture flat existe déjà). **`git status` avant de commencer** (fichiers d'Erik non trackés : jamais touchés).
- Pièges actifs : cache vitest `.vite` à la RACINE avant re-mesure de banc ; bancs lourds en contention = flaky (re-passer isolé) ; **TOUTE distance est wrappée (`hexDistanceW`)** — la pression est un calcul de distance, une mesure non-wrappée fausse tout ; captures locales AVANT tout commit ; UN SEUL worker 8787.
- Aucune nouvelle forme d'ordre → `orderShapeError` non concerné.

## 1. Contexte (en 60 secondes)

La force défensive = `effectiveStrength(defense, veteran, Σ bonus%)` où les bonus sont des `CombatMod` additifs (`bonusDefPct` — terrain/fortification/bâtiments). La pression culturelle devient **un mod de plus**, calculé par une fonction **pure** `pressionCulturelle` (Σ culture/tour des villes ≤ 3 anneaux, atténuation ×1/×0,5/×0,25) → paliers 5/10/20 → +10/+20/+30 % **défensif pur**. Effet recherché : rendre rentables les bâtiments culturels (Sanctuaire vient d'être livré — le levier s'enchaîne). L'affichage est GRATUIT (le mod apparaît au détail de combat et à la préview Oracle).

## 2. Les 7 tranchés — DÉCISIONS (validées Erik 14/11, défauts fixés)

| # | Décision | Valeur |
|---|---|---|
| D1 | Portée | **R = 3 anneaux FIXES** (pas `frontierRadius` — les anneaux visuels R-162 restent visuels) |
| D2 | Atténuation | **×1 à d≤1, ×0,5 à d=2, ×0,25 à d=3**, au-delà 0 (`hexDistanceW` obligatoire) |
| D3 | Paliers | pression **5-9 → +10 %, 10-19 → +20 %, ≥20 → +30 %** ; 0-4 → +0 % |
| D4 | Plafond | **+30 %** (sous le terrain/fortification — le culturel n'écrase pas le terrain) |
| D5 | Ennemis sur la case | **aucun malus en V1** (pression ennemie offensive = tranche 3, backlog) |
| D6 | Villes capturées | bâtiments perdus (R-66) MAIS **merveilles survivantes pressent pour le NOUVEAU propriétaire** (la culture résiduelle suit le propriétaire, pas la ville d'origine) |
| D7 | Anarchie | culture à 0 ce tour (R-122) → **pression 0 ce tour** |

**Sens : défensif PUR** — l'unité doit défendre (être l'attaqué) sur une case sous pression de SA nation. Symétrie offensive : NON (recommandation tenue).

## 3. Mission

### L0 — Données : les tables dans `culture.json`
`packages/rules/src/data/culture.json` (le fichier existe — seuils GP) :
```json
"pressionDefensive": {
  "attenuationParAnneau": [1, 0.5, 0.25],
  "defenseTiers": [5, 10, 20],
  "defenseBonus": [0.1, 0.2, 0.3]
}
```
Data-driven intégral : changer un calibrage = éditer le JSON, zéro code.

### L1 — Moteur : la fonction pure (~40-60 lignes)
1. `packages/rules/src/culture.ts` : `pressionCulturelle(...)` — **fonction pure, tri R-81, aucun RNG, aucun fog** (elle ne lit que les villes PROPRES de la nation : pas de lecture d'état ennemi). Signature au choix de l'agent mais OBLIGATOIREMENT pure et testable hors Board : passe-lui les villes (position + culture/tour calculée via `cultureGains` par ville — même formule que le tour réel, donc D6 merveilles capturées et D7 anarchie gratuits si l'appelant fournit les gains du tour) + la case cible + la nation. Retour : la pression (nombre), et un second export `bonusDefenseCulturel(pression)` → `{valeur, label}` ou 0.
2. Table data-driven (L0), paliers bornes INCLUSIVES vérifiées en tests : 4 → 0 %, 5 → 10 %, 9 → 10 %, 10 → 20 %, 19 → 20 %, 20 → 30 %, 40 → 30 % (plafond).
3. `turn.ts` — **factorisation obligatoire** : les sites qui poussent les mods défensifs sont au moins au nombre de DEUX (bloc défenseur principal ~`turn.ts:1152-1160`, participants de mêlée ~`turn.ts:5270-5281` — repère-les TOUS par le triplet terrain/fortification/`cityBuildingDefenseBonus`, y compris le site de prévision `PredictBattle` s'il recalcule la défense). Crée UN helper (ex. `modsDefenseCase(board, tile, owner, fortified, demeure)`) qui pousse terrain/fortification/bâtiments **+ le mod pression culturelle** `{ label: 'Pression culturelle (T-xx)', valeur }` et remplace chaque site par l'appel. Le mod pression s'applique **aux mêmes conditions que le bloc existant** (même gate `demeure`/garnison que terrain-fortification) — pas de nouveau gate.
4. Numéro de règle : réserve T-xx dans `RULES.md` (demande le numéro à Erik si la table T est verrouillée — défaut : consigne `T-28` si libre et signale-le dans le rapport).

### L2 — Tests (test-first)
1. **Purs** (`culture.test.ts`) : atténuation par anneau (1/0,5/0,25, 0 au-delà de 3 — avec wrap Est↔Ouest), superposition de deux villes (le cœur dense atteint les paliers hauts, cf. table de chiffrage §2 de la propo), bordures de paliers (liste §3.2), plafond 30 %, D6 (ville capturée : merveille seule presse pour le nouveau propriétaire), D7 (anarchie → gains 0 → pression 0), D5 (la pression ne touche jamais l'ATTAQUANT), **zéro bonus au démarrage** (capitale pop 3 = pression 3 < 5).
2. **Intégration** (`turn`/combat) : un combat où le défenseur sous pression ≥ 5 porte le mod « Pression culturelle » au `CombatDetail` (et l'attaquant jamais) ; la préview/Oracle (`PredictBattle`) affiche le même mod — c'est gratuit SI le site de prévision passe par le helper (vérifie-le explicitement, piège classique d'un site oublié).
3. **Bit-à-bit à pression nulle** : une partie de référence sans culture (aucune ville ≥ palier) doit rester identique — le mod à 0 n'est jamais poussé (pas de bruit dans le détail de combat).

### L3 — Banc bot 40×3 AVANT/APRÈS (l'arbitre chiffré)
Harness canon `bancBotTd` (cf. technique SANCTUAIRE : `devtmp/banc-sanctuaire.ts`, AVANT mesurable par stash temporaire des fichiers moteur ; cache `.vite` purgé entre passes ; JSON dans `devtmp/`).
- **Non-régression (critères DURS)** : chutes ≤ 2, fondations ≥ 5, élims ≤ 1, zéro collapse, victoires dans le bruit. ⚠ Le bonus défensif peut durcir les chutes au banc — le plan défense-ville (chutes 14→2) ne doit PAS régresser ; si les chutes tombent à 0 partout, consigne-le (c'est l'effet voulu, pas un bug) MAIS tout effondrement offensif (victoires/captures en chute libre) = arrêt-pour-approbation.
- **Mesure d'usage** : nombre de combats portant le mod, distribution +10/+20/+30 (le bonus doit être RARE au démarrage et appaître en milieu de partie — si le +30 % domine dès t20, c'est un signal de calibrage à consigner, sans itérer les chiffres toi-même).

### L4 — Déploiement
Suites complètes vertes (turbo racine) → captures locales (détail de combat avec le mod visible — god mode Ctrl+J→G si besoin) → commit (message citant PRESSION-CULTURELLE + les D1-D7) → push → **vérifier CI/Deploy via API** (re-run si flocon wrangler/Tests) → prod `curl` 200.

## 4. Critères d'acceptation (mesurables)

1. Suites vertes : rules (1215 + nouveaux), server 544, web 793, jev-port 52 — aucune assertion existante changée (hors extensions explicitement justifiées).
2. Bit-à-bit à pression nulle (L2.3) prouvé.
3. Banc : chutes ≤ 2, fondations ≥ 5, élims ≤ 1, zéro collapse ; mesure d'usage consignée (fréquence + distribution des paliers).
4. Le mod « Pression culturelle » visible dans le détail de combat ET la préview/Oracle (capture).
5. Calibrage 100 % dans `culture.json` (flip de table = changement de comportement, prouvé par un test qui lit le JSON).
6. `schemaVersion` inchangée (calcul dérivé, aucun état nouveau). `git status` propre. Deploy SUCCESS vérifié via API + prod 200.
7. Rapport `REPORT-PRESSION-CULTURELLE.md` à la racine : chiffres banc AVANT/APRÈS, distribution des paliers, écarts, arrêt-pour-approbation final.

## 5. Périmètre interdit

- **Tranche 2** (affichage de la pression par case à l'infobulle) et **tranche 3** (pression offensive/conversion, `Territoire_culturel.md`) : BACKLOG, ne pas commencer.
- Aucun malus aux ennemis (D5), aucune symétrie offensive, aucun changement aux anneaux visuels R-162, au vétéran, au Fondamentalisme, au terrain, aux bâtiments de ville, à `frontierRadius`.
- Aucune retouche au bot/Jev (priorités, gate R-190, production) — les IA découvrent l'effet avec leurs arbitrages actuels ; si le gate R-190 sous-estime les sièges devenus plus durs, consigne-le (levier de cadrage ultérieur), ne touche pas.
- Aucun asset d'art, aucune modif du condensé Jev.
- Fichiers d'Erik non trackés : ne JAMAIS les committer ni les déplacer.

## 6. Fin de session

Rapport `REPORT-PRESSION-CULTURELLE.md` (racine) → **arrêt-pour-approbation** : Erik rejoue/valide à l'œil en prod (Erik vs Jev : les sièges doivent être sensiblement plus durs près du cœur culturel) et fait pousser s'il est satisfait. Ne pousse jamais sans son feu vert explicite. Remise de la main : lister ce qui reste (tranches 2/3 backlog ; Erik vs Jev arbitre réel ; verdict Sanctuaire à l'œil également en attente).
