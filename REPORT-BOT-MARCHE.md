# REPORT-BOT-MARCHE — que l'armée se constitue et MARCHE vers la cible

**Décisions Erik 28/10** (handoff `HANDOFF-BOT-MARCHE.md`). Mission focalisée sur la circulation militaire du bot + verrou des re-déclarations. Status : **D1-D4 appliqués**, suites vertes (rules 1101 / server 314 / typecheck 4/4), banc 40×3 rejoué (avant conservé), god mode exécuté.

## 1. L1 — diagnostic CONFIRMÉ (sonde `tests-banc/sonde-marche.test.ts`, seed 2896796234, difficile)

Les hypothèses du handoff §2 étaient PARTIELLEMENT fausses — la sonde montre que **l'armée se constitue et les ordres de marche sont émis** (pool 0→16, `rallier:Move` chaque tour). Les vraies causes racines :

1. **Cible de ralliement instable (D1)** — l'hex d'anneau était assigné par RANG trié par distance AU TOUR COURANT (`bot-armee` A) : le rang permute à chaque pas, les membres changent de case cible et OSCILLENT (sonde : u30 d18→19→21→20, u50 d18→22→20, `distMin` figée 18-19 pendant 60 tours — le symptôme exact du god mode HORLOGE-DISTANCE).
2. **Verrou d'effectif jamais levé (cercle vicieux §2-d confirmé)** — `effectif ≥ requis (8)` au rayon 2 n'arrive JAMAIS : les membres qui arrivent engagent le siège UN PAR UN (l'objectif ② attaquer préempte le campement) et meurent en détail au mur ; 0 `FormArmy`, 0 `offensiver`.
3. **La garnison mange la campagne (§2-a confirmé)** — en guerre, `urgence` (BOT-EXPLORATION) était toujours vraie → quota plein partout → les renforts partaient en garnison au lieu du pool (armée complète seulement à t75 sur une guerre ouverte à t45).

## 2. D1-D4 appliqué (défauts du handoff — veto Erik possible)

- **D1 — marche coordonnée** : nouveau `hexRalliementMembre` (pur, R-81) — chaque membre reçoit UN hex de l'anneau par rang STABLE (tri par id), l'anneau étant géométrique (stable). Plus d'oscillation ; et un membre d'armée dont la campagne est incomplète NE DÉCLENCHE plus l'attaque (il campe — canon BOT-ARMEE « campement Fortify dans l'anneau ») : fini le siège en détail. Le pas `offensiver` ne part que s'il réduit la distance (inchangé).
- **D2 — armée permanente en paix** : `cibleProjetee` (miroir exact de la future déclaration : cible pondérée D2 PAIX-RYTHME parmi les candidats en paix) + `guerreProbable` (ratio de forces ≥ seuil effectif du profil, sans le tirage). Au seuil, le pool excédentaire se rassemble vers l'anneau de la cible projetée — la guerre éclate avec l'armée campée au bord ennemi (vérifié sonde : u36 déjà au ring à la déclaration t82).
- **D3 — la garnison ne mange plus la campagne** : en guerre civile SANS menace capitale, plus AUCUN recrutement (capitale comprise — l'ancienne convention « scout jamais défenseur » laissait un déficit fantôme qui rappelait les marcheurs). La menace à ≤ `rayonMenace` de la capitale restaure l'urgence complète (BOT-EXPLORATION D3 intact — test (b) recalé, un test (b-bis) documente le nouveau canon).
- **D4 — verrou de re-déclaration** : donnée `delaiRedeclaration` 30 ×3 profils ; la déclaration est consignée par paire dans `diplomacy.dernieresCibles` (champ OPTIONNEL — schemaVersion 28 inchangée, posée à `applyDeclareWar`, conservée après la paix, helper `derniereDeclarationCible`). `deciderGuerre` EXCLUT les cibles verrouillées et prend la meilleure restante (null si toutes verrouillées).

Canon, spawns, valeurs de combat (R-31/R-71), le joueur : intouchés. Jev, T2/T3, schemaVersion : intouchés.

## 3. L2 — tests

- `tests/bot-marche.test.ts` **14 verts** (test-first) : stabilité de l'hex de ralliement (indépendante de la position), hex distincts par membre, offensiver = pas qui réduit la distance, `cibleProjetee`, préparation au seuil (et non-préparation sous le seuil), D3 (guerre calme sans brouillon / urgence menace = rappel), D4 (consigne rules, refus dans le délai, ré-acceptation après), déterminisme bit à bit.
- Recalages sémantique D3 (7 tests) : `bot-armee` ×2 (tout le pool part en guerre calme — le défenseur en place ne part jamais, le scout est mobilisable), `bot-ta` ×2 + `bot-td` ×1 (la conscription de garnison exige désormais l'urgence — menace ajoutée aux fixtures), `bot-exploration` (b) recalé + (b-bis) ajouté. `data` non touché (aucune valeur de combat).
- Suites : rules **1101** verts, server **314** verts (+6 skip), turbo typecheck **4/4**.

## 4. L3 — banc 40×3×150 (civs réelles P7, corpus identique — avant conservé `devtmp/banc-horloge-AVANT-marche.json`)

Comparateur `devtmp/banc-marche-analyse.mjs` :

| Banc | Guerres | Percées | Captures | Durée moy. | Écras. <t30 | Tours moy. |
|---|---|---|---|---|---|---|
| AVANT (horloge-distance) | 318 | 38 (11,9 %) | 5 (1,6 %) | 37,4 | 0 | 146 |
| **APRÈS (bot-marche)** | 307 | **53 (17,3 %)** | **10 (3,3 %)** | 36,9 | 0 ✓ | 139 ✓ |

**Cibles D5 : écrasement 0 ✓, parties > 100 tours ✓ — percée 17,3 % (cible 40 %) et captures 3,3 % (cible 10 %) NON atteintes.** Ère Médiévale+ : toujours 0 percée sur 20 guerres.

**Sonde de marche** (`tests-banc/banc-bot-marche.test.ts` → `devtmp/banc-bot-marche.json`) :

| Diff | Guerres | ArmyFormed | FormArmy émis | effectif/requis | distMin moy | régressions/guerre | captures déclarant |
|---|---|---|---|---|---|---|---|
| facile | 47 | 1 | 6 | 12 % | 8,2 | 0,74 | 2 |
| normal | 55 | 2 | 4 | 8 % | 8,6 | 0,55 | 4 |
| difficile | 52 | 2 | 3 | 6 % | 8,7 | 0,31 | 1 |

- **La marche est monotone** : régressions de `distMin` quasi éteintes (0,3-0,7/guerre — résiduel = mort du membre le plus proche puis recomposition) contre l'oscillation permanente du diagnostic. `distMin` moyenne 8-9 (elle plafonnait à 18-19).
- **La fusion existe enfin** : `ArmyFormed` observés au banc (0 avant) ; captures par les déclarants ×2 à l'échelle du banc (5 → 10).
- **Le prochain verrou est LOCALISÉ (D5-bis)** : l'effectif au rayon n'atteint `requis` que 6-12 % du temps. La marche converge (distMin 8-9), mais l'armée de 6-8 (difficile 8) s'assemble plus vite qu'elle n'est PRODUITE : le pool excédentaire met 40+ tours à naître, l'horloge (durée 37 en moyenne) ferme avant, et les arrivants précoces usent leurs PV aux assauts d'attente. Leviers candidats (Erik décide) : `tailleArmee` plus petite (assauts de trios R-31 dès 3-4), production offensive renforcée en guerre (poids marteaux/ordre de file), ou effectif requis dégradé par tierce partie. PÉRIMÈTRE INTACT (production/spawns = non touchés ici).

## 5. God mode (`devtmp/bot-marche-gui.mjs` → `dev-logs/captures-bot-marche/`)

Run 90 tours (log `devtmp/bot-marche-gui-run.log`, trace `trace-tours.json`) : guerre déclarée ✓, marche observée, captures d'écran aux moments forts (armée formée / siège / rassemblement / assaut). Verdicts consignés en fin de log — 🔶 à vérifier par Erik (le seed god mode donne une économie lente : bot à 1-2 unités jusqu'à t30, comme au run horloge).

## 6. À juger en jouant par Erik

1. **Le campement** : une armée incomplète campe au bord ennemi sans attaquer (canon « se former PUIS assiéger ») — le ressenti est-il bon, ou tolérer l'attaque d'opportunité sur ville vide ?
2. **La préparation en paix (D2)** : l'IA campe une armée à votre frontière AVANT de déclarer — voulu (miroir du joueur) et lisible ?
3. **`delaiRedeclaration` 30** : les re-déclarations contre la même cible sont gelées 30 tours — le rythme des guerres en boucle a-t-il assez tari ?
4. **Le prochain levier** : production offensive (tailleArmee / poids marteaux de guerre / effectif dégradé) — voir §4.

## 7. Fichiers

- rules : `types.ts` (`delaiRedeclaration`), `state.ts` (`diplomacy.dernieresCibles` optionnel), `diplomatie.ts` (consigne à DeclareWar + `derniereDeclarationCible`), `data/bot.json` (30 ×3).
- server : `botPolicy.ts` (`hexRalliementMembre`, `cibleProjetee`, `guerreProbable`, campement avant assaut, urgence D3 miroir planGarnison/assignerObjectifs, exclusions D4 dans `deciderGuerre`).
- tests : `tests/bot-marche.test.ts` (14) ; recalages bot-armee/bot-ta/bot-td/bot-exploration. Bancs : `tests-banc/banc-bot-marche.test.ts` (sonde, gate BANC_BOT_TD), `tests-banc/sonde-marche.test.ts` (L1, gate).
- devtmp (non suivi) : `banc-bot-marche.json`, `banc-horloge-AVANT-marche.json`, `banc-marche-analyse.mjs`, `bot-marche-gui.mjs`, `bot-marche-gui-run.log`, captures `dev-logs/captures-bot-marche/`.

## 8. Arrêt

Commit poussé (CI déploie). Les fichiers non trackés d'Erik ne sont pas touchés.
