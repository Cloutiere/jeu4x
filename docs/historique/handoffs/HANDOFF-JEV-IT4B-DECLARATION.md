# HANDOFF-JEV-IT4B-DECLARATION — Levier A : la déclaration de guerre DANS `finPartie`

**Statut : prêt — NON LANCÉ.** Micro-itération (suite directe de JEV-IT4-FIN-PARTIE, acceptée `d06fa56`). Verdict Erik : le compromis it4 (4 guerres/4 gagnantes au lieu de la fourchette 20-35) est ACCEPTÉ tel quel — tu ne « repaires » PAS les guerres v4 ; la seule cible est les **3 parties stériles** (Jev domine 10-40× en score et en forces, ne déclare JAMAIS en 151 tours, aucune victoire).

## 0. Préalables

1. `REPORT-JEV-IT4-FIN-PARTIE.md` (§3 transcripts, §5 le problème) + `HANDOFF-JEV-IT4-FIN-PARTIE.md` (D1-D5 toujours en vigueur) ;
2. Code : `sableuse/src/joueur.mjs` (la question `finPartie` et sa traduction, `memo.finPartie`), `sableuse/src/condense.mjs` (bloc `victoire`), copie serveur `apps/server/src/jev/joueur.ts` + `condense.ts` + `questions-joueur.json` (v5 — bit-à-bit harnais ⇄ serveur, test de copie) ;
3. ⚠ Même discipline que l'it4 : harnais d'abord, port TS bit-à-bit, tests FIRST, **UN SEUL banc réel ≤ 0,25 $** (le banc it4 a coûté 0,1566 $ — budget large).
4. ⚠ Pièges consignés (mémoire it4) : fog moteur ZÉRIFIE la trésorerie adverse (R-134 — `tresorerieApprox` porte 0, ne pas tenter de l'utiliser comme signal) ; banc via tsx ; suite jev-port via `vitest.jev.config.ts` (exclue du filtre vitest par défaut de apps/server) ; createInitialState ne pose pas de villes (fixtures synthétiques).

## 1. Décision de tranche (une seule, veto Erik possible)

- **D-A — Nouveau choix dans `finPartie` : `guerreTotale:<id>`** — proposé quand le mode courant est `viserMaVictoire:domination` (ou `pousserCapitale`) ET que le rapport de forces est favorable (≥ 1,2 — même famille que les seuils existants, valeur data ou constante du harnais, consignée) ET qu'il n'est PAS déjà en guerre avec la cible. Traduction : ordre **`DeclareWar` EXISTANT** du moteur vers la cible (id pré-qualifiée : leader en villes ou capitale connue). Une fois déclarée, la question `finPartie` retrouve ses choix habituels (`pousserCapitale` etc.) — `guerreTotale` est un acte PONCTUEL, jamais un mode persisté.
- **D-B — Gate inchangée (D3 de l'it4)** : la question `finPartie` reste silencieuse en partie calme. Le choix `guerreTotale` ne peut apparaître que dans les parties où la question est déjà posée (guerre en cours OU signal de fin de partie) — donc les 3 parties stériles, qui satisfont déjà le gate par leur domination… vérifie au banc : si les 3 stériles n'atteignent AUCUN critère du gate D3 (jalons ≥ 10, ≥ 2 composants, chantier, guerre contre moi), alors AMENDE le gate d'un 5e signal **« domination mécanique »** : rapport de forces ≥ 2 ET ≥ 3 villes de plus que le leader — consigne ce choix dans le rapport (c'est le seul changement de gate permis).
- **D-C — Zéro autre changement** : bloc `victoire`, `productionVictoire`, `protegerCapitale`, replis, budget, client, moteur, Zii, bots : INTACTS. `questions-joueur.json` → v6 (nouveau choix documenté), copie serveur réalignée.

## 2. Mission L0→L4

- **L0** : lis les préalables, suites vertes en local (server 388, jev-port 24 via la config dédiée).
- **L1 — Tests FIRST (harnais v6, FAUX LLM)** : `guerreTotale` proposé dans les bonnes conditions (mode domination + rapport ≥ 1,2 + pas déjà en guerre) ; refusé si déjà en guerre / rapport insuffisant / autre mode ; traduction ⇒ `DeclareWar` vers le bon id ; acte ponctuel (le tour suivant, la question propose `pousserCapitale`, pas `guerreTotale` une seconde fois) ; forme invalide ⇒ ignorée sans panne ; gate D3 inchangée (ou amendée D-B, testé).
- **L2 — Port serveur bit-à-bit** + tests croisés jev-port (décision `guerreTotale` ⇒ mêmes ordres harnais ⇄ serveur). questions-joueur.json v6, test de copie vert.
- **L3 — Banc UNIQUE ≤ 0,25 $** : les 10 seeds corpus (les 3 stériles : 3947827986, 4033602994, 786078703 — ils doivent rester dans le corpus). Comparaison it4 vs it4b : victoires (non-régression ≥ 4/10), **parties stériles sans déclaration (LE critère : 3 → ≤ 1)**, guerres totales (consigné, sans fourchette dure — Erik a tranché le compromis), guerres avant rencontre (= 0, non-régression absolue), fondations ≥ 2,5, coût. Sortie `sableuse/bancs/joueur-it4b-<date>/` + tableau au rapport.
- **L4 — Suites complètes, commit + push, rapport `REPORT-JEV-IT4B-DECLARATION.md`** (tableau, transcripts des parties stériles avant/après, affirmations vérifiables).

## 3. Critères d'acceptation

1. **Parties stériles sans déclaration : ≤ 1/10** (vs 3/10 it4) ;
2. Victoires ≥ 4/10 ; guerres avant rencontre = 0 ; fondations ≥ 2,5 ;
3. Prompt des parties calmes inchangé (gate D3 prouvée) ; suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,25 $ ;
4. Toute nouvelle déclaration est ATTRIBUABLE au transcript (choix `guerreTotale` visible, id correct).

## 4. Périmètre interdit

Moteur, bots classiques, Zii, client : INTERDITS. Pas de nouvel ordre moteur (`DeclareWar` existe). Pas d'autre changement de gate que le 5e signal D-B (à consigner si utilisé). Le banc réel est UNIQUE. Jamais de secret/clé dans les logs ; jamais les fichiers non trackés d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation du pilot : T-B (bots défendent), puis calibrage offensif post-T2, puis T3.
