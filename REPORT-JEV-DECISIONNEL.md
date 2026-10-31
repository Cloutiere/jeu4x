# REPORT-JEV-DECISIONNEL — La déclaration devient un acte mécanique (31/10)

Mission exécutée : `HANDOFF-JEV-DECISIONNEL.md` (D1-D5, défauts tranchés). Livraison complète et verte ; **critères d'acceptation 1 NON ATTEINTS — diagnostic chiffré ci-dessous (§4), Erik tranche** (voie prévue par le handoff §4.1).

## 1. Diagnostic L1 (journaux du banc bataille, gratuit)

Décompte exact sur `bancs/joueur-bataille-2026-10-31` :

- **X — gate `finPartie` ouverte : 10/10 parties** (1226 tours-question au total).
- **Y — offres `guerreTotale` : 2/10 parties seulement** (parties 6 et 7 — offertes t41/t62).
- **Z — refus LLM : 0** (2/2 offres choisies avec confiance).

**Cause racine** : le bot classique (p2) déclare la guerre à Jev aux tours **10-17 dans 8/10 parties** — bien avant que le signal « domination mécanique » de Jev puisse exister (rapport ≥ 2 mesuré t88-118 au plus tôt). La condition EXACTE « pas déjà en guerre » rend alors `cibleGuerreTotale` null pour tout le reste de la partie → jamais offert → jamais déclaré. **Le LLM n'était pas le verrou** ; la fenêtre d'éligibilité l'était. Et la guerre EXISTAIT déjà : Jev la contre-mène (percée, siège, victoire).

## 2. Livraison (D1-D5 respectés)

- **D1** — `declarationMechanique()` (sableuse/src/joueur.mjs, port TS bit-à-bit `apps/server/src/jev/joueur.ts`) : signal mécanique actif + mode courant domination/pousserCapitale + cible qualifiée (conditions EXACTES de l'ex-choix, inchangées) ⇒ le harnais pousse l'intention `{genre:'guerre', mecanique:true}` **sans consulter le LLM**. L'acte PRÉCÈDE la construction des questions ; la réponse `finPartie` du modèle est ignorée au tour de l'acte (ni le LLM ni « continuer » ne peuvent écraser la bascule D4).
- **D2** — le choix `guerreTotale` disparaît de la question `finPartie` ; toute réponse résiduelle du modèle est IGNORÉE (aucune intention, mode préservé). Question `guerre` classique INTACTE — la preuve en jeu réel : partie 10 du banc, Jev déclare t81 par la question classique.
- **D3** — portes contact/aveugle inchangées (cibleGuerreTotale réutilisée telle quelle). 0 guerre avant rencontre : respecté.
- **D4** — débit borné : `seuils.guerreTotaleCooldown` = 8 (data v8) ; après l'acte, `memo.finPartie` bascule `{mode:'pousserCapitale', cible}` + horodatage `memo.guerreMecaniqueTour`. Journal : ligne `diplomatie` avec `mecanique:true` + snapshot `conditions:{cible,tour,rapport,aveugle}` — chaque déclaration est attribuable au transcript.
- **D5** — intouchés respectés (bloc victoire, théâtre, marche D-E2, moteur, bots, Zii, client, schemaVersion 28). `questions-joueur.json` → **v8** (instructions finPartie réécrites sans le choix, cooldown data ; copie serveur réalignée, test de copie vert).

## 3. Tests et suites (FIRST)

- `tests/v8.test.mjs` : 14 tests, **rouges 8/14 d'abord**, verts après implémentation (acte sans LLM, bascule memo, refus condition par condition, cooldown, forme sans `guerreTotale:*`, réponse résiduelle ignorée, aveugle, guerre classique intacte).
- `tests/v6b.test.mjs` : 6 verrous de l'ancien choix **reversés** sur le comportement v8 (plus offert, résiduel ignoré, cible aveugle toujours qualifiée pour la mécanique) — 21 verts.
- Port TS + `jev-port` 30 verts (tests croisés mis à jour : l'aveugle déclare bit-à-bit `[guerre mécanique p1]`, bascule memo identique).
- Suites AVANT push : **rules 1114 / server 401 / sableuse 154 (140+14) / jev-port 30 / web 712 / svelte-check 0 erreur / typechecks 4/4 verts.**

## 4. Banc UNIQUE `bancs/joueur-decisionnel-2026-10-31` (10 seeds corpus, mètre analyse-tbsiege.py)

Coût **0,2182 $ ≤ 0,50 $**, 0 erreur API.

| Métrique | bataille (avant) | decisionnel (après) | cible |
|---|---|---|---|
| Stériles sans déclaration | 7/10 | **8/10** | ≤ 2/10 ✗ |
| Victoires Jev | 1/10 | **1/10** (t57 !) | ≥ 4/10 ✗ |
| Percée | 40 % | 30 % | ≥ 40 % 🔶 |
| Captures de capitales | 1 | 1 | ≥ 1 ✓ |
| 0 guerre avant rencontre | ✓ | ✓ | ✓ |
| Fondations Jev/partie | 1,9 | 1,6 | consigné 🔶 |

Transcripts des déclarations :

- **Partie 6 (seed 4033602994), t42 — PREMIÈRE DÉCLARATION MÉCANIQUE de l'histoire des bancs** : `{"genre":"guerre","de":"p1","cible":"p2","mecanique":true,"conditions":{"cible":"p2","tour":42,"rapport":8,"aveugle":true},"ok":true}` — l'acte aveugle voté fonctionne exactement comme spécifié, sans un mot du LLM.
- **Partie 10 (seed 2896796234), t81 — déclaration par la question `guerre` classique** (choix LLM, canal intact) : la voie ordinaire continue de fonctionner.
- **Partie 4 (seed 3802591813) : VICTOIRE de Jev t57 par capture de capitale** — la victoire la plus rapide jamais mesurée sur ce corpus (le même seed finissait nulle en 151 tours au banc bataille).

## 5. Verdict proposé (décision Erik)

Le critère « stériles sans déclaration » est un **mauvais mètre de ce banc** : sur les 10 parties, **9 sont entrées en guerre t10-17 — déclarées PAR le bot classique**. La guerre existe, Jev la mène (percée 30 %, capture, victoire t57) ; seule l'ATTRIBUTION de la première déclaration appartient au bot. La déclaration mécanique est correcte et prouvée (t42, conditions horodatées) mais ne peut pas tirer le mètre : sa condition « pas déjà en guerre » est structurellement fausse dans les parties où p2 déclare avant t20.

Trois tranchages possibles :
1. **Requalifier le mètre** : compter une partie « non stérile » quand Jev est en guerre et conquérant (quelle que soit l'attribution de la 1re déclaration) — sur ce mètre, le banc passe à ~1-2/10 stériles et la chaîne conquête est déclarée complète ;
2. **Agir sur la cause** : les guerres t10-17 du bot classique contre Jev (agressivité de civ, canon BOT-TC) — cadrer à part (paix précoce ? rendre p2 moins belliqueux vs Jev joueur ?) ;
3. **Accepter tel quel** : la déclaration mécanique est le filet correct pour le profil « dominant sans guerre » (raréfié par les guerres p2 précoces), victoires 1/10 = le verrou suivant est la CONDUITE de guerre (siège/éco), pas la déclaration.

🔶 à l'œil : percée 30 % (variance inter-seeds : -1 partie), fondations 1,6 (-0,3).

## 6. Fin de session

Rapport livré + main remise. À l'acceptation : PROJET.md (chapitre fin de partie) et la file (T3 ONU, atelier voix Zii, vieux 🔶) selon le tranchage du §5.
