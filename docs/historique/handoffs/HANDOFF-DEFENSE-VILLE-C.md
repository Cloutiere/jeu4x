# HANDOFF-DEFENSE-VILLE-C — Donner les yeux à Jev : condensé localisé + question défense (+ sonde ping-pong isolée)

**Canon Erik validé le 13/11 (ordre C avant B — les chutes résiduelles sont dominées par le fog ; sans l'info localisée, le veto production L3 tournerait à l'aveugle).** Base : tranche A close (`4e72dbd`, garnison d=0 + rappel hystérésis + cooldown 5t + hygiène de fondation, chutes 14 → 5). Le diagnostic DÉFENSE-DE-VILLE (`DIAG-DEFENSE-VILLE.md`) a prouvé : la menace était **toujours visible 2-13 tours à l'avance** mais **non localisée** (`menaces` sans ville cible, `villes[].def` null, aucune question défense) — Jev ne peut pas choisir ce qu'on ne lui montre pas.

## 1. Préalables

- Docs : `DIAG-DEFENSE-VILLE.md` (leviers L4/L5 + razes-fog résiduelles ≈ moitié des 5 chutes), tranche A (`REPORT-DEFENSE-VILLE-A3.md` — priorités garnison > rappel > escort > exploration, cooldown), tarification Jev (canon Erik 13/11 : **coût en INPUT seulement, output gratuit** — la croissance du condensé est le SEUL surcoût de cette mission, à chiffrer au rapport ; poser la question L5 est quasi gratuit).
- Baseline : rules **1214** / server **474** / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `4dbfa3b`, prod 200. Journaux `sableuse/bancs/{joueur-escorte,joueur-defense-*}/` (mêmes seeds).
- ⚠ Chaque commit porte ses symboles (`git show` + grep — leçon `704ec5b`) ; rejouer les suites complètes avant tout push.

## 2. Le canon validé (3 volets, une tranche)

1. **L4 — Condensé localisé** (la croissance d'input mesurée) : chaque `menace` porte **sa ville cible** (`villeId`) et **sa distance à CETTE ville** (BFS portée de marche réelle — réutilise `menacesVille` de la tranche A) ; chaque `empire.villes[]` porte **sa garnison** (`def` : nb combattants d=0, force totale, colon exclu — leçon p08). C'est de l'info DÉJÀ calculée par `defenseVille.ts` — zéro nouveau calcul moteur, uniquement le passage au condensé.
2. **L5 — Question défense dédiée** : posée quand menaces d ≤ 2 sur une ville (seuil `bot.json`, défaut du diagnostic) — choix explicite Jev : `rappeler` / `produireGuerrier` / `tenir` / `abandonner` (énumération fermée typesafe, seuil de confiance dédié 0,25 miroir des autres questions, repli = la mécanique tranche A décide seule). Les réponses sont auditées au journal (comme `tactique`). La réponse Jev influe l'ORDRE de priorité des rappels et le pivot production — jamais en contradiction avec L1 (garnison d=0 obligatoire reste mécanique).
3. **Sonde ping-pong isolée** : le rappel défensif porte un marqueur dans le journal (`genre: 'rappel'`) — la sonde compte alors les oscillations IMPUTABLES au rappel (séparées du bruit de fond 136-177 consigné en A3). Mesure d'information, pas un critère de refus.

## 3. Mission L0→L5

- **L0 — Tests FIRST** (`apps/server/tests/` + harnais) : menace à d ≤ 2 d'une ville → condensé porte `villeId` + distance À CETTE ville + garnison de la ville (rouge avant fix) ; ville sans combattant d=0 → `def` porte le déficit ; question `defense` posée au bon tour et PAS posée sans menace ; réponse hors énumération → repli mécanique ; `rappeler` Jev + garnison d=0 → les deux se composent ; jev-port miroir EXACT (port TS + harnais mjs — `vitest.jev.config.ts`) ; 30 seeds.
- **L1 — Condensé + question** (port `jev/joueur.ts` + harnais `partie.mjs`/`joueur.mjs` miroir) : L4 puis L5, tables `bot.json defense` étendues (seuil question, rien d'autre).
- **L2 — Banc Jev 10 seeds MÊMES seeds** (`sableuse/bancs/joueur-defense-c/`, ≤ **0,60 $**) + sonde étendue — critères : **razes barbares résiduelles (fog) réduites** (les razeurs visibles 2-13 tours à l'avance doivent maintenant être vus par Jev — cible : moitié des 5 chutes fermées, verdict chiffré au rapport) · chutes totales ≤ 5 · élims ≤ 1 · fondations ≥ 5,0 (le coût A3 est déjà accepté, on ne creuse pas) · **ping-pong imputable au rappel : chiffré et isolé** (information, pas verdict) · zéro suicide D3UUQJ re-testé · coût condensé : **croissance d'input par tour consignée en tokens et en $** (le chiffre du tarif input-only). Banc bot 40×3 non requis si le memo bit-à-bit est re-prouvé (témoins 3/3).
- **L3 — Suites + déploiement** : suites complètes, captures locales, push, vérifier Deploy SUCCESS + prod 200. Si un critère majeur échoue (chutes en hausse, fondations < 5,0) → **arrêt-pour-approbation**, pas d'itération solo.

## 4. Critères d'acceptation

Condensé localisé prouvé en tests (rouge avant fix) · question défense posée/auditable au journal · razes-fog réduites (chiffre au rapport) · chutes ≤ 5 · fondations ≥ 5,0 · croissance d'input chiffrée · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

Mécanique de la tranche A (`defenseVille.ts` — garnison, hystérésis, cooldown : L4 n'ajoute que le PASSAGE au condensé), escortColon, gate R-190, gainSite, questions Jev existantes et leurs seuils, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`. **L3 (veto production) = tranche B, PAS cette mission.**

## 6. Fin de session

Rapport `REPORT-DEFENSE-VILLE-C.md` à la racine : chiffrage de la croissance d'input, tableau AVANT/C, razes-fog fermées une à une, ping-pong isolé, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main — la tranche B (L3) sera cadrée ensuite.

**Pièges** : cache vitest RACINE avant re-mesure ; banc via `tsx` ; UN SEUL worker 8787 ; alias `@game/rules` apps/server only ; jev-port via `vitest.jev.config.ts` ; ids recyclés dans les journaux ; chaque commit porte ses symboles ; ne jamais committer les secrets ni les fichiers personnels d'Erik.
