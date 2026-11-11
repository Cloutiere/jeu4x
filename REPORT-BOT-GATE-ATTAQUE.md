# REPORT-BOT-GATE-ATTAQUE — le bot (et les barbares) n'attaquent plus sans calcul d'espérance

**Mission exécutée le 10/11 — pas d'acceptation par l'agent : verdict Erik requis.**
Handoff : `HANDOFF-BOT-GATE-ATTAQUE.md` (canon Erik 10/11, bogue déclencheur prod D3UUQJ t5).

## 1. Livré (L0→L5)

### L0 — Tests FIRST (`packages/rules/tests/bot-gate-attaque.test.ts`, 20 tests)
Le cas D3UUQJ reconstitué est ROUGE avant fix : guerrier Jev 3 PV vs gardien fortifié → forcesProspectives donne sAtt 1 / sDef **1,1** (la force « ~1,1 » du diagnostic — fortification T-17 0,1 × demeure R-175), p = 0,4525 (le « p ≈ 0,48 » du handoff), k = 2 → **REFUS**. Armée 9 PV ×3 vs satellite plein (p 0,9) → **AUTORISÉ**. Colon sans site → refus même à p 0,9. Catégories Jev bornées ×0,5–×2 (jeGarde bascule une autorisation en refus, sacrificable l'inverse, catégorie inconnue = neutre). Déterminisme 30 seeds (le gate ne tire JAMAIS le dé). Non-régression : gardien Fortify (412d7d0) intact, satellite refusé tient (Hold), armée barbare attaque.

### L1 — Moteur (`packages/rules/src/gateAttaque.ts`, tables `bot.json gateAttaque`)
- `gateAttaque(p, gain, perte, k)` — pur, k = 2.
- `valeurTactique(state, unit, joueur, categorie?)` — base par rôle (colon sans site 200 / avec site 40 / gardien de capitale 60 / standard 25 / ère dépassée 5), dernière combattante ×(1+2/n) (1 sur 1 = ×3, 1 sur 4 = ×1,5), vétéran +50 %, PV proportionnels, position critique ×1,5 (seule combattante entre un ennemi et une ville, escorte de colon), catégorie Jev BORNÉE ×0,5–×2.
- `deciderAttaqueUnitaire` — p = `combatOdds` (R-125, la formule du dérivé) sur les forces de **`combatStrengthsOf`** via le nouveau wrapper exporté **`forcesProspectives`** (turn.ts — Board de planification, `moved` vide ; approximation consignée : R-175 demeure supposée). Côté gain : valeur cible + butin de camp (21) ; ennemi écrasant (sDef ≥ 2×sAtt) → gain ×0,25 ; **sécurité locale** (D3) : +50 si ennemi en guerre DÉCLARÉE, +60 s'il menace une de mes villes (dist ≤ 2) — les barbares n'étant jamais en guerre déclarée, D3UUQJ reste refusé.
- Zéro formule parallèle, `schemaVersion` 28 intacte, zéro changement client.

### L2 — Branchement
- **botPolicy** (`assignerObjectifs`) : branches ② attaque adjacente et ④ chasse passent le gate (après le filtre ratio historique) ; refus → priorités suivantes (repli/garnison/explorer — doctrine « jamais inactif »). Villes sans défenseur : entrée, pas de gate.
- **barbares** (`barbarianOrders`) : le satellite n'attaque un civil que si l'espérance passe, sinon **Hold** (tient — ni suicide ni marche d'aggro vers la cible) ; gardien Fortify et R-183 (camp se défend) intacts.

### L3 — Jev qualifie, le moteur calcule
- Question `tactique` (port TS + harnais mjs miroir EXACT — jev-port 40/40) : posée quand des combattantes sontAdjacentes à un ennemi visible en guerre (max 4, tri id) ; réponse `<catégorie>:<unitId>` validée (énumération fermée + liste posée), seuil dédié 0,25 (`confianceParQuestion`), repli « aucun » = ×1.
- Circuit complet : `DecisionJev.categoriesTactiques` → `etat.memo.categoriesTactiques` (persisté) → `botPolicy(..., opts)` du siège Jev (game.ts).

### L4 — Bancs (AVANT = e0b67b9, copié avant fix ; APRÈS = gate v3)
**Banc bot 40×3×150** (`devtmp/banc-bot-td-{AVANT,APRES}-gate.json`) — **zéro collapse, tout en hausse** :

| diff | villes | pop | unités | techs | PV mil. | tours |
|---|---|---|---|---|---|---|
| difficile | 1,80→2,00 | 11,8→15,8 | 72,7→111,9 | 0,70→0,90 | 206→323 | 126→147 |
| facile | 1,88→1,93 | 16,7→18,2 | 89,2→108,6 | 1,02→1,05 | 257→311 | 129→129 |
| normal | 1,95→1,93 | 14,3→15,2 | 78,8→100,1 | 0,78→0,95 | 223→287 | 121→131 |

**Banc horloge 40×3×150** (`devtmp/banc-horloge-{AVANT,APRES}-gate.json`) — ⚠ écarts consignés :

| diff | guerres/partie | stériles | paix prop. | captures | tours |
|---|---|---|---|---|---|
| difficile | 3,20→2,92 | 88 %→**97 %** | 96→113 | 6→4 | 129→139 |
| facile | 1,75→1,40 | 77 %→**100 %** | 50→94 | 4→**11** | 137→113 |
| normal | 2,58→2,08 | 83 %→**99 %** | 68→89 | 5→7 | 136→131 |

**Banc Jev 10 seeds, LLM RÉEL** (`sableuse/bancs/joueur-gate/`, coût ≈ **0,32 $** ≤ garde 1 $) :
- **0 suicide de type D3UUQJ** — sonde des journaux : 0 échange d'une unité à force de base 1 contre un défenseur fortifié (10 parties × 151 tours).
- Question tactique posée **689 fois**, Jev a rendu **≈115 catégories réelles** (jeGarde ≈ 68, sacrificable ≈ 47, « aucun » 574) — le circuit L3 est vivant bout en bout.
- 1 victoire / 10 (domination 66 tours, seed 214915776) ; 9 parties non tranchées à 151 tours. À comparer par Erik au banc joueur précédent (config différente — vanilla-long était 3/4).

### L5 — Suites
rules **1174/1174** (+20) · serveur **443/443** · web **793/793** (zéro modif client) · jev-port **40/40** · sableuse **228/228** (après coup infra, voir écarts) · `tsc` propres (rules, server) · schemaVersion **28** intacte.

## 2. Écarts consignés (verdict Erik)

1. **⚠ Stérilité des guerres bot-vs-bot ↑** (0,83-0,88 → 0,97-1,00) : le gate k=2 refuse les accrochages À FORCES ÉGALES — une guerre déclarée ne produit plus de premières batailles de contact. Deux calibrages de la sécurité locale testés (**25/40** puis **50/60**) sans retournement (l'espérance symétrique reste sous le seuil k=2 jusqu'à p ≈ 0,4). **Contrepoids** : captures totales 15→22, PV militaires +40 %, zéro collapse. Leviers possibles (au choix d'Erik) : bonus de guerre proportionnel au rapport, bypass gate à `effectifAssaut` atteint, ou accepter (les guerres se jouent désormais en sièges armés, pas en grignotage).
2. **Fréquence de guerre ↓ légère** (−9 % à −20 %) : même cause, même arbitrage.
3. **5 tests re-verrouillés sur le NOUVEAU canon** (assertions changées, documentées) : `tests/barbares.test.ts` ×2 (« ATTAQUE toujours » → « attaque à espérance passante », scénarios asymétriques armée ×3) ; `apps/server/tests/bot-ta.test.ts` ×3 (R-95 barbare proie légitime / gardien de camp / guerre seule — scénarios rendus espérance-passante). Les refus à forces égales sont prouvés côté rules (20 tests).
4. **Infra de test** : timeout du faux banc sableuse 300 s → **600 s** (les bots survivent mieux → parties plus longues → le banc dépassait 300 s ; 5m42 mesurées).
5. Banc bot v1 (bonus sécurité 25/40) archivé dans l'historique de session ; les JSON APRES au dépôt sont la v3 (50/60).

## 3. Périmètre interdit — respecté
`combatStrengthsOf` (seulement `export` du wrapper, zéro modif), `processFormArmy`, décodeur client, PV armée, dérivé de jets ORACLE-VERDICT, gardien Fortify, Zii, gainSite, `schemaVersion` 28. Aucune nouvelle forme d'ordre.

## 4. ⚠ CI / Deploy à vérifier après push (rapport écrit avant push).

**Fin de session — remise de la main.** Pièges respectés : cache vitest racine purgé avant re-mesures, bancs via config dédiée, un seul worker, banques JSON copiées AVANT modification.
