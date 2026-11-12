# HANDOFF-JEV-ESCORTE — Le colon ne part jamais seul sur un pari non évalué

**Canon Erik validé le 12/11 (suite du diagnostic D3UUQJ — volet #2, le volet #1 étant le gate d'attaque accepté).** Le fait déclencheur : D3UUQJ — colon en production dès t3, guerrier suicidé t5, production JAMAIS pivotée, colon sorti t19 seul sans escorte (dumps `devtmp/etat-D3UUQJ/`). Verdict Erik : « un colon qui sort seul est un gâchis » — MAIS le colon seul reste acceptable si le déploiement est **peu risqué** (site exploré, ennemis incapables d'atteindre). Le colon seul n'est pas un interdit : c'est un pari, et un pari s'évalue.

## 1. Préalables

- Docs : RULES.md (R-190 gate d'attaque — le socle accepté ; gainSite Jev ; doctrine « jamais inactif » CONFIANCE-EXPLORATION), PROJET.md §IA.
- Baseline : rules **1180** / server **448** / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `1e17892`.
- Le gate a réduit la fréquence des suicides d'escorte en début de partie — le problème sera plus rare ; la règle de pivot reste canon (un colon qui sort seul est du gâchis).
- ⚠ Leçon du chapitre gate : vérifier que chaque commit porte réellement les symboles cités (`git show` + grep) — jamais accepter un rapport sur son message seul.

## 2. Contexte

La production de Jev passe par sa question `produire` (seuil de confiance 0,3) arbitrée par l'économie botPolicy (BOT-TB). Aucune règle ne relie l'état de l'escorte (unités combattantes vivantes) au choix colon : D3UUQJ a montré une production verrouillée sur colon de t3 à t19 après la perte de l'unique guerrier. La règle d'escorte s'applique **au-dessus** du choix de Jev : Jev choisit le *site* (gainSite), le moteur décide si le déploiement est autorisé tel quel, escorté, ou exigera un pivot.

## 3. Décisions de tranche (canon Erik 12/11 — veto possible)

1. **Règle de production** : colon en file/sorti autorisé si risque **faible** OU escorte **en place** ; si risque **élevé** ET 0 combattante → **pivot guerrier** jusqu'à escorte en place (le colon attend en ville — il n'est pas sorti pour se faire tuer).
2. **L'évaluation du risque — déterministe, data-driven** (table `bot.json` escort, rayons tunables), facteurs au **BFS** (portée de marche réelle, pas à vol d'oiseau) :
   - unité ennemie connue (barbare compris) capable d'atteindre le site OU un tile de la route dans ≤ **3 tours** → risque élevé ;
   - camp barbare connu à distance ≤ **3** du site → risque élevé (les satellites sortent — D3UUQJ) ;
   - site jamais exploré (brume) → risque majoré (on ne sait pas ce qui est là) ;
   - route traversant la zone d'influence d'un ennemi connu → risque élevé.
   Risque faible = aucun facteur. C'est un calcul géométrique déterministe : **le moteur décide, pas Jev** (même philosophie que le gate).
3. **Escorte en place** = une combattante dédiée disponible, ou adjacente au colon (réutilise la notion d'« escorte effective » déjà connue de la valeur tactique — position critique).
4. **Colon déjà sorti, risque montant** (nouvel ennemi connu sur sa route) → **rappel/garnison** plutôt qu'aller au devant (doctrine anti-piétinement : le rappel D3 existe déjà à l'exploration — miroir pour le colon).
5. **Jev garde ses questions** : gainSite (choix du site) et `produire` (seuil 0,3) inchangés — la règle s'applique au-dessus, en veto/re-pivot. Zéro nouvelle question LLM.

## 4. Mission L0→Ln

- **L0 — Tests FIRST** (`packages/rules/tests/` + `apps/server/tests/`) : le cas D3UUQJ reconstitué (0 combattante, colon en file, ennemi/camp connu à portée → **pivot guerrier**, rouge avant fix) ; site exploré, aucun ennemi à portée → **colon seul autorisé** (le canon Erik « moins risqué ») ; escorte en place → colon autorisé même à risque élevé ; colon sorti + nouvel ennemi sur route → **rappel** ; site en brume → risque majoré ; déterminisme 30 seeds ; non-régression gainSite et `produire` (Jev fonde toujours — verrou CONFIANCE-EXPLORATION).
- **L1 — Moteur** : fonction pure `risqueDeploiementColon(state, site, route)` + `deciderProductionColon` dans `packages/rules` (ou module botPolicy moteur) — table `bot.json` escort (rayons, seuils), zéro durcissement, BFS existant réutilisé.
- **L2 — botPolicy/serveur** : brancher le veto au-dessus du choix de production de Jev (et du bot classique — botPolicy partagé, les calibrages profitent aux deux) ; le pivot = SetProduction guerrier ; le colon attend en ville (pas de Move risqué) ; rappel si sorté.
- **L3 — Bancs** : banc bot 40×3 AVANT (`1e17892`) / APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-escorte.json`) — zéro collapse, fondations/partie maintenues (cible ≥ niveau actuel) ; banc Jev 10 seeds LLM RÉEL (`sableuse/bancs/joueur-escorte/`, coût ≤ **0,60 $**) — critère : **zéro colon perdu seul sur route risquée** (sonde des journaux, miroir de la sonde « 0 suicide D3UUQJ » du gate) + fondations/partie ≥ baseline.
- **L4 — Vérification + déploiement** : suites complètes, captures locales AVANT tout commit, `git show` + grep des symboles dans CHAQUE commit avant push (leçon `704ec5b`), CI au push, vérifier Deploy SUCCESS + prod 200.

## 5. Critères d'acceptation

- Cas D3UUQJ reconstitué : pivot guerrier émis (rouge avant fix) ;
- Colon seul autorisé sur site exploré sans menace (le canon Erik, pas un interdit aveugle) ;
- Banc Jev : 0 colon perdu seul sur route risquée ; fondations/partie non effondrées ; coût ≤ 0,60 $ ;
- Banc bot : zéro collapse, fondations maintenues ;
- `schemaVersion` 28 intacte, zéro changement client requis.

## 6. Périmètre interdit

Gate d'attaque (R-190, kEffectif, valeur tactique — le socle accepté), gainSite, question `produire`/seuils de confiance, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, `schemaVersion`. Pas de nouvelle forme d'ordre (le rappel réutilise Move existant).

## 7. Fin de session

Rapport `REPORT-JEV-ESCORTE.md` à la racine : bancs AVANT/APRÈS, sonde « 0 colon seul perdu », verdict par critère, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

## Pièges à ne pas retomber

Cache vitest `.vite` **à la RACINE** avant re-mesure de banc ; bancs via `tsx`/config dédiée ; **UN SEUL** worker 8787 ; timeout banc sableuse 600 s ; jev-port via `vitest.jev.config.ts` ; fixture `makeState` : `spawnedUnits[0]` est un ID ; **chaque commit porte ses symboles** (leçon `704ec5b`) ; ne jamais committer les fichiers personnels d'Erik ni les secrets.
