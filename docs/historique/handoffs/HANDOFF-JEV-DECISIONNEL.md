# HANDOFF-JEV-DECISIONNEL — Le dernier maillon : faire de Jev un conquérant qui DÉCLARE

**Statut : prêt — NON LANCÉ.** Suite directe de BATAILLE-COMPLETE (`11b285b`, acceptée). Le constat : **la mécanique de conquête est prête et décisive** (siège qui cède à 99,4 %, première capture de capitale de l'histoire des bancs Jev, percée 40 %) — mais **7/10 parties sans UNE déclaration de Jev**. Le dernier maillon est décisionnel.

## 0. Préalables

1. `REPORT-BATAILLE-COMPLETE.md` (§6 diagnostic) + `REPORT-JEV-IT4B-DECLARATION.md` (le choix `guerreTotale` et l'amendement aveugle) + `HANDOFF-JEV-IT4B-DECLARATION.md` (D-A/D-B en vigueur) ; `RULES.md` R-188 (diplomatie bot), R-51 réécrite (bataille complète — le contexte qui rend chaque guerre décisive) ;
2. Code : `sableuse/src/joueur.mjs` (question `finPartie`, choix `guerreTotale`, gate `signalDominationMechanique`, `cibleGuerreTotale`, `memo.finPartie`), `condense.mjs` (bloc `victoire`, théâtre), copie serveur bit-à-bit `apps/server/src/jev/*`, `questions-joueur.json` (v7) ;
3. ⚠ Pièges établis : harnais d'abord + port TS bit-à-bit + tests croisés jev-port (config dédiée `vitest.jev.config.ts`) ; banc via tsx ; fog zérifie la trésorerie adverse ; `CityRazed` ≠ `CityCaptured` ; banc Jev UNIQUE ≤ 0,50 $ (les 10 seeds) ; **vérifier la variance avant de conclure** (le mètre a oscillé 26→4→8→7 déclarations selon les missions — un seul banc ne prouve qu'avec les transcripts).
4. ⚠ Entrelacement : personne d'autre sur `sableuse/`, `apps/server/src/jev/`.

## 1. Le diagnostic à confirmer d'abord (gratuit, local)

Relis les journaux du banc bataille (`bancs/joueur-bataille-2026-10-31`) : dans les 7 parties muettes, la question `finPartie` est-elle posée (gate ouverte) ? Le choix `guerreTotale` est-il OFFERT (conditions remplies) mais jamais CHOISI par le LLM ? Ou jamais offert (gate/seuil/conditions ratés) ? Les trois cas n'ont pas le même remède — consigne le décompte exact (X parties gate ouvert, Y offres `guerreTotale`, Z refus LLM avec probabilities).

## 2. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — La déclaration devient un ACTE MÉCANIQUE du harnais** (le cœur) : quand le signal `signalDominationMechanique` est actif ET rapport de forces ≥ `guerreTotaleRapportMin` ET pas déjà en guerre ET cible qualifiée (les conditions EXACTES du choix `guerreTotale` actuel, inchangées), le harnais **déclare directement** (`DeclareWar` existant) — sans dépendre du choix LLM. Justification : déclarer la guerre au leader en mode domination n'est pas une décision de personnalité, c'est la CONSÉQUENCE mécanique du mode (déjà voté par Erik au levier A) ; le LLM garde les décisions qui demandent du jugement (quand pousser, où produire, quand faire la paix).
- **D2 — Le choix LLM `guerreTotale` disparaît de la question** `finPartie` (devenu redondant) — remplacé par rien : la mécanique déclare, la question garde `pousserCapitale`/`contrerCourse`/`viserMaVictoire`/`continuer`. La question `guerre` classique (hors finPartie) reste INTACTE pour les guerres ordinaires.
- **D3 — Canon CONTACT-GUERRE respecté** : la déclaration mécanique obéit aux mêmes portes que `guerreTotale` aujourd'hui — contact réel + délai (`delaiGuerreApresRencontre`), OU le cas aveugle voté (nation publique au lobby quand le signal domination est actif). **0 guerre avant rencontre reste un critère non négociable.**
- **D4 — Débit borné** : au plus UNE déclaration mécanique toutes les `seuils.guerreTotaleCooldown` tours (data, défaut 8) — pas de cascade de déclarations au même tour. Après déclaration, `memo.finPartie` bascule en mode `pousserCapitale` (la suite est déjà mécanique depuis le calibrage offensif : marche + siège + rassemblement).
- **D5 — Intouchés** : bloc `victoire`, théâtre, marche D-E2, CANON-SIEGE, bataille complète, bots classiques, Zii, client, `schemaVersion` 28. questions-joueur.json → v8 si le format change (copie serveur réalignée, test de copie).

## 3. Mission L0→L4

- **L0** : préalables, suites vertes (rules 1114, server 401, sableuse 140, jev-port 30).
- **L1 — Diagnostic L1 consigné** (les chiffres X/Y/Z ci-dessus) dans le rapport.
- **L2 — Tests FIRST (harnais v8)** : déclaration mécanique dans les bonnes conditions (signal + rapport + pas en guerre + contact/aveugle + cooldown écoulé) ; refus si un seul manque ; acte ponctuel (pas de re-déclaration pendant le cooldown, bascule memo `pousserCapitale`) ; plus aucun choix `guerreTotale` dans la question (test de forme) ; question `guerre` classique intacte ; formes invalides ignorées ; port TS bit-à-bit + tests croisés jev-port.
- **L3 — Banc UNIQUE ≤ 0,50 $** (10 seeds, mètre `analyse-tbsiege.py`) : tableau vs bataille : **stériles sans déclaration (LE critère : 7/10 → ≤ 2/10)**, **victoires ≥ 4/10**, percée ≥ 40 % (non-régression), captures ≥ 1 (non-régression), 0 guerre avant rencontre, fondations consignées (🔶 1,9 — sans seuil dur), coût. Chaque déclaration attribuable au transcript (événement mécanique horodaté + conditions). Suites complètes, commit + push, rapport `REPORT-JEV-DECISIONNEL.md` (diagnostic, tableau, transcripts, verdict).

## 4. Critères d'acceptation

1. Stériles sans déclaration ≤ 2/10 ET victoires ≥ 4/10 — ou diagnostic chiffré montrant que le verrou restant est ailleurs (variance ? fondations ? économie ?) et Erik tranche ;
2. 0 guerre avant rencontre (absolu) ; percée ≥ 40 % ; captures ≥ 1 ;
3. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,50 $ ; chaque changement attribuable au transcript.

## 5. Périmètre interdit

Moteur (bataille complète, siège, capture) : INTACT. Bots classiques, Zii, client : INTACTS. Le condensé et les questions existantes hors `finPartie` : INTACTS. Pas de mini-rebanc hors verdict Erik en session. Jamais de secret ni de fichier non tracké d'Erik.

## 6. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : si les critères sont atteints, **la chaîne conquête est complète** → PROJET.md passe le chapitre « fin de partie » au réalisé, et la file reprend : T3 (ONU victoire immédiate — à cadrer avec Erik), puis atelier voix de Zii et les vieux 🔶.
