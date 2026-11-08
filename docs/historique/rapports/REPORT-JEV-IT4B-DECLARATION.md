# REPORT-JEV-IT4B-DECLARATION — Levier A : la déclaration DANS `finPartie`

**Mission exécutée 31/10** (handoff `HANDOFF-JEV-IT4B-DECLARATION.md`, suite directe de JEV-IT4-FIN-PARTIE `d06fa56`). Discipline tenue : tests FIRST (harnais v6b), port TS bit-à-bit, bancs réels plafonnés, zéro changement moteur/bots/Zii/client, `schemaVersion` 28 inchangée.

## 1. Ce qui a été livré (D-A / D-B / D-C)

- **D-A — choix `guerreTotale:<id>` dans `finPartie`** (`sableuse/src/joueur.mjs` + copie bit-à-bit `apps/server/src/jev/joueur.ts`) : offert quand le MODE COURANT est `domination`/`pousserCapitale` (memo.finPartie), rapport de forces ≥ **1,2** (data `seuils.guerreTotaleRapportMin` v6), pas déjà en guerre avec la cible. Cible pré-qualifiée (`cibleGuerreTotale`) : leader en villes, capitale connue (distance < 99), tri villes ↓ / rapport ↓ / id. Traduction = intention de guerre EXISTANTE (`{genre:'guerre'}` → `DeclareWar` côté harnais, `partie.mjs` NON TOUCHÉ), **acte PONCTUEL** : le memo n'est jamais réécrit, la question retrouve ses choix habituels.
- **D-B — gate amendé du 5e signal « domination mécanique »** (`signalDominationMechanique`) : `monde.puissance.rapport ≥ 2` ET `mes villes ≥ leader + 3`. Les 4 signaux it4 inchangés et toujours actifs (test de non-régression).
- **D-C** : bloc `victoire`, `productionVictoire`, `protegerCapitale`, replis, budget, client, moteur : intacts. `questions-joueur.json` v6 (copie serveur identique, test de copie vert).
- **Amendement « aveugle » (verdict Erik 31/10, voir §3)** : quand le signal D-B est actif, un rival JAMAIS rencontré devient cible valable (la nation est publique au lobby — canon T2). C'est le seul écart au handoff, décidé par Erik en cours de mission.

## 2. Tests (FIRST, tout vert)

- Harnais `sableuse/tests/v6b.test.mjs` : **21 verts** (proposition dans les bonnes conditions, refus si mode absent / déjà en guerre / rapport insuffisant ; traduction ⇒ intention guerre + memo inchangé ; acte ponctuel (tour suivant en guerre ⇒ `pousserCapitale`, plus de `guerreTotale`) ; forme invalide ignorée sans panne ; gate D-B et non-régression des 4 signaux ; aveugle on/off).
- Port serveur : `tests-jev/jev-port.test.ts` **26 verts** (2 tests IT4B : questions bit-à-bit harnais ⇄ serveur, décision `guerreTotale` ⇒ mêmes intentions/mémos, cas aveugle inclus).
- Suites AVANT push : **sableuse 116 / server 388 / jev-port 26 / rules 1101 / web 712 / svelte-check 0 / typecheck server OK**.

## 3. Bancs réels — le banc UNIQUE a révélé un blocage, Erik a tranché

### Banc v1 (`sableuse/bancs/joueur-it4b-2026-10-31`, 10 seeds corpus identiques bit-à-bit à l'it4)

Coupé au plafond 0,25 $ après **7 parties** (3 non jouées, convention D2) — **0,1556 $**. Résultat clé : le gate D-B FONCTIONNE (`finPartie` s'ouvre dans les stériles : 119 tours posés sur 3947827986 vs **0 en it4**), mais **`guerreTotale` n'a jamais pu être offert** : dans les 3 parties stériles, Jev n'y a JAMAIS rencontré le rival (fog intact, `distanceCapitale: 99`) — la pré-qualification « capitale connue » du handoff rendait le levier inoffrable exactement sur le profil cible. Diagnostics vérifiés aux journaux ; verdict Erik demandé en session : **« Amender + mini-rebanc 3 seeds »**.

### Mini-rebanc stériles (`sableuse/bancs/joueur-it4b-steriles-2026-10-31`, seeds 3947827986 / 4033602994 / 786078703)

**0,0852 $** (total mission : **0,2408 $ ≤ 0,25 $**).

| Seed | it4 : guerres | it4b+amende : guerres | choix `guerreTotale` | finPartie posée | Verdict |
|---|---|---|---|---|---|
| 3947827986 | 0 | **2 ok (t33, t76)** | 5 | 119 | DÉCLARE ✅ |
| 4033602994 | 1 | **2 ok (t85, t127)** | 26 | 92 | DÉCLARE ✅ |
| 786078703 | 0 | 0 | 0 | 39 | muet — écart de villes 2 < 3 → signal D-B inactif |

**Critère « parties stériles sans déclaration : 3 → ≤ 1 » : ATTEINT (1/3).** Les déclarations sont ATTRIBUABLES au transcript (choix + id corrects, transcript t33 seed 3947827986 :

> critère offert : « DÉCLARER la guerre TOTALE à amerique (p2), le rival en lice (JAMAIS rencontré — sa position est inconnue, mais sa nation est publique au lobby) : nos forces 4 vs les siennes visibles 0 (rapport 4×)… »
> réponse : `{"choice":"guerreTotale:p2","confidence":0.56,"probabilities":{"guerreTotale:p2":0.62,"viserMaVictoire:domination":0.29,...}}`

### Non-régression (7 parties communes it4 ⇄ it4b)

Victoires Jev 2/7 (it4 : 3/7 sur ces mêmes seeds — 2121991107 et 3538506724 gagnées it4 ; it4b gagne 2121991107, perd 3538506724 malgré 3 guerres ok ; stochastique LLM). Guerres avant rencontre = **0** (non-régression absolue tenue) ; fondations 1-8 villes/partie ; erreurs API 0 ; les 6 déclarations v1 (question `guerre` classique) et toutes les déclarations mini-rebanc sont `ok: true` côté moteur.

## 4. 🔶 Ouvert — verdict Erik

1. **Le verrou a CHANGÉ de main** : la déclaration est résolue (2/3 stériles déclarent, à l'aveugle et correctement) ; ce qui bloque maintenant la victoire en domination est l'**exécution offensive** — après déclaration, 33 combats, 0 capture de capitale en 151 tours (armée qui ne marche/siège pas jusqu'à la cible, connue sous fog seulement après contact) : c'est précisément **T-B (bots défendent) + calibrage offensif**, l'étape suivante convenue.
2. **786078703 reste muet** : domination réelle (984 vs 78) mais écart de villes 2 < 3 → signal D-B inactif, et rival jamais rencontré. Levier possible : seuil d'écart 3 → 2 (une constante du harnais, une ligne) — non fait (le banc du handoff est consommé).
3. **Victoires ≥ 4/10 non re-mesurables** dans le budget : le corpus complet n'a pas été rejoué après l'amendement (7 parties v1 sans aveugle + 3 stériles). Les 10 parties complètes devront être rejouées au prochain banc de calibrage offensif.
4. Les guerres déclarées retombent souvent en boucles de propositions de paix refusées par le bot (13 refus seed 3947827986) — Jev offre `paix` en guerre alors que le mode est domination : candidat calibrage (p.ex. paix interdite en mode domination sauf rapport < 1).

## 5. Commit & fin

- Commits : harnais (`joueur.mjs`, `questions-joueur.json` v6, `tests/v6b.test.mjs`) + port serveur (`apps/server/src/jev/*`, `tests-jev/jev-port.test.ts`) + ce rapport. Les artefacts de banc (`sableuse/bancs/joueur-it4b-*/`) restent LOCALS (convention `bancs/` gitignoré). Jamais de clés.
- Suites rejouées AVANT push. Arrêt. Remise de la main — à l'acceptation du pilot : T-B (bots défendent), puis calibrage offensif post-T2, puis T3.
