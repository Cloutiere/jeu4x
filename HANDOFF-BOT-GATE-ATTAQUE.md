# HANDOFF-BOT-GATE-ATTAQUE — Le bot (et les barbares) n'attaquent plus sans calcul d'espérance

**Canon Erik validé le 10/11.** Le bogue déclencheur : partie prod **D3UUQJ** — au tour 5, le guerrier de Jev (u4, force 1, 3 PV) a attaqué le gardien barbare FORTIFIÉ du camp v7 (12,27) : p ≈ 0,48, mort du guerrier, gardien intact. Jev est resté sans escorte, production verrouillée sur colon, colon sorti t19 seul. Dumps et reconstitution : `devtmp/etat-D3UUQJ/` (trace-5 = le suicide ; jev-5 = la preuve que JEV n'a PAS décidé : seule question posée = « produire » — l'attaque vient de la couche tactique bot, qui attaque sans évaluer les chances ni la valeur de l'unité).

## 1. Préalables

- Docs : RULES.md (R-51 rév. ORACLE-VERDICT — jets mêlée dérivés, `PredictBattle`/`predireBataille` calculable au planning ; R-97 attaque satellite barbare ; T-17 fortification), PROJET.md §IA.
- Baseline : rules **1154** / server 443 / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` **28** (ne PAS changer — aucune donnée persistée nouvelle), Deploy SUCCESS `e0b67b9`.
- ARMEE-STRENGTH (`e0b67b9`) : les forces de combat ×3 armée sont branchées — `combatStrengthsOf` est le socle, **ne pas retoucher**.
- ⚠ Sessions parallèles : vérifier l'état du dépôt avant d'écrire ; rejouer la suite complète avant tout push.

## 2. Contexte

La couche tactique bot (botPolicy) et les ordres barbares attaquent sur des règles positionnelles (adjacent, aggro, hutte) **sans jamais évaluer l'issue**. Depuis ORACLE-VERDICT, l'issue d'une bataille mêlée est **calculable au planning** (dérivé par hash, indépendant du flux) et `predireBataille` simule la résolution complète d'un tour. Le matériel existe : il manque la **décision**. Erik a tranché le cadre : une attaque se décide à l'**espérance de gain**, pondérée par la **valeur tactique** des unités — pas par un seuil de probabilité nu.

## 3. Décisions de tranche (validées Erik 10/11 — veto possible avant lancement)

1. **Règle de décision** : `P(victoire) × valeur(gain) ≥ k × P(défaite) × valeur(perte)` — avec **k = 2** (aversion au risque, tunable `botPolicy.json`).
2. **Valeur tactique = base par rôle + modificateurs**, toute table éditable (data-driven) :
   - base par rôle : colon sans site de fondation en réserve = très élevé ; dernière(s) unité(s) combattante(s) = multiplicateur fort (portion de l'armée nationale — 1 unité sur 1 vaut plus que 1 sur 4) ; unité d'ère dépassée = faible ; gardien de capitale = élevé ;
   - modificateurs : vétéran +50 % ; position critique (seule unité entre un ennemi et une ville, escorte effective d'un colon) = bonus ; PV blessés = réduction proportionnelle.
3. **Côté gain** : la cible est évaluée par la même monnaie — gardien de camp = valeur du butin + sécurité locale ; ennemi écrasant = gain quasi nul. Une attaque à p 0,48 pour un gain faible ne passe jamais k=2.
4. **Jev qualifie, le moteur calcule** : à la question tactique existante, Jev peut rendre une **catégorie** (`jeGarde` / `sacrifiable` / `positionDecisive`) → multiplicateur **borné ×0,5 à ×2** sur la valeur calculée. Jamais un float libre. SDK typesafe, défaut = neutre (×1).
5. **Barbares** : le gate s'applique à leurs attaques **hors convergence défensive** — un satellite n'attaque un civil que si l'espérance passe (sinon il tient/patrouille) ; les attaques **vers un camp** (R-183, civil entrant) ne changent PAS : le camp se défend toujours. Le gardien Fortify (BARBARES-GARDE-FORTIFIE `412d7d0`) reste intact.

## 4. Mission L0→Ln

- **L0 — Tests FIRST** (`packages/rules/tests/bot-gate-attaque.test.ts`) : le cas D3UUQJ reconstitué (guerrier 3 PV vs gardien fortifié ~1,1, gain = butin 21 or, k=2 → **refus d'attaque**) ; une armée 9 PV vs satellite 3 PV (p ≈ 0,94, gain fort → **attaque autorisée**) ; colon seul (valeur très élevée → refus même à p correct) ; 4 guerriers dont un sacrifiable → attaque du plus fort ; catégorie Jev `jeGarde` bascule une attaque autorisée en refus (et `sacrifiable` l'inverse dans les limites du bornage ×0,5-×2) ; déterminisme bit à bit (30 seeds) ; non-régression R-183 et gardien Fortify.
- **L1 — Moteur** : fonction pure `valeurTactique(unite, etat)` + `gateAttaque(p, gain, perte, k)` dans `packages/rules` (ou module botPolicy moteur) — tables dans un JSON de config, zéro durcissement. L'évaluation des chances passe par le simulateur existant (`predireBataille`/mêmes forces que `combatStrengthsOf`) — jamais une formule parallèle.
- **L2 — botPolicy** : brancher le gate sur le choix d'attaque du bot standard ET sur les ordres offensifs barbares (R-97 phase 1-3) ; en cas de refus → comportement de repli (fortifier/patrouille/attendre), jamais l'inertie (doctrine « jamais inactif »).
- **L3 — Jev** : étendre la question tactique du journal (schéma typesafe : énumération `jeGarde|sacrifiable|positionDecisive`) + câblage du multiplicateur borné ; repli si la réponse est absente/illisible (×1).
- **L4 — Bancs** : bot 40×3 AVANT/APRÈS (`devtmp/banc-bot-td-{AVANT,APRES}-gate.json`) — zéro collapse, guerres vivantes maintenues ; banc Jev 10 seeds — 0 suicide de type D3UUQJ (un guerrier isolé n'attaque plus un gardien fortifié), captures et conquêtes non effondrées.
- **L5 — Vérification + déploiement** : suites complètes, captures locales AVANT tout commit, CI au push, vérifier Deploy SUCCESS.

## 5. Critères d'acceptation

- Cas D3UUQJ reconstitué : le gate REFUSE l'attaque du t5 (rouge avant fix) ;
- Banc bot : guerres vivantes (fréquence et intensité dans les marges AVANT/APRÈS), zéro collapse villes/pop/unités ;
- Banc Jev : 0 attaque à espérance négative par une dernière unité combattante ; conquêtes maintenues ;
- Determinisme bit à bit (le dérivé décide toujours l'issue — le gate ne fait que choisir d'attaquer ou non) ;
- `schemaVersion` 28 intacte, zéro changement client requis (le détail de combat existant suffit).

## 6. Périmètre interdit

`combatStrengthsOf` / `processFormArmy` / décodeur de combat client / PV armée / dérivé de jets ORACLE-VERDICT / gardien Fortify (R-183, `412d7d0`) / Zii / gainSite / `schemaVersion`. Ne pas créer de nouvelle forme d'ordre (aucun `orderShapeError` à craindre — mais si une forme devait émerger, `orderShapeError` d'abord).

## 7. Fin de session

Rapport `REPORT-BOT-GATE-ATTAQUE.md` à la racine : résultats des bancs AVANT/APRÈS, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt et remise de la main — pas d'acceptation par l'agent lui-même.

## Pièges à ne pas retomber

Cache vitest `.vite` **à la RACINE** à purger avant re-mesure de banc ; bancs via `tsx` ; **UN SEUL** worker 8787 (2 mémoires DO = ordres perdus) ; la trace prod prend `?turn=` (rétention 20 tours — agir vite après une partie) ; jev-port via `vitest.jev.config.ts` (exclu du filtre par défaut) ; fixture `makeState` : `spawnedUnits[0]` est un ID ; jamais committer les fichiers personnels d'Erik ni les secrets.
