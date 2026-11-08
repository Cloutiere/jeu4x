# HANDOFF-JEV-CALIBRAGE-OFFENSIF — De la déclaration à la capture : lever le verrou de l'exécution offensive

**Statut : prêt — NON LANCÉ.** Suite directe de JEV-IT4B-DECLARATION (acceptée `829dc05`). Le constat qui justifie cette mission : après les déclarations `guerreTotale` de l'IT4B — **33 combats, 0 capture de capitale en 151 tours**. Jev déclare maintenant correctement ; son armée ne marche/siège pas jusqu'à la cible. Deux micro-leviers récoltés en route sont dans ta poche (D-B et D-C).

## 0. Préalables

1. `REPORT-JEV-IT4B-DECLARATION.md` (§4 : le verrou, les leviers, les boucles de paix) + `REPORT-JEV-IT4-FIN-PARTIE.md` ; `HANDOFF-JEV-IT4-FIN-PARTIE.md` (D1-D5 en vigueur) ;
2. Artefacts de banc LOCAUX (gratuits à relire — commence LÀ) : `sableuse/bancs/joueur-it4b-2026-10-31/` et `joueur-it4b-steriles-2026-10-31/` (journaux JSONL : ordres posés, combats, positions) ;
3. Code : `sableuse/src/joueur.mjs`, `condense.mjs`, `questions-joueur.json` (v6) ; copie serveur bit-à-bit `apps/server/src/jev/*` ; côté harnais `sableuse/src/partie.mjs` (exécution des ordres) — touchable SEULEMENT si un verrou d'exécution s'y trouve, à consigner ;
4. ⚠ Discipline établie : tests FIRST, port TS bit-à-bit, suites jev-port via `vitest.jev.config.ts` (exclue du filtre par défaut), fog zérifie la trésorerie adverse (R-134), createInitialState ne pose pas de villes. **Banc réel : UN SEUL, plafond 0,50 $** (les 10 seeds complets d'un coup, aucun mini-rebanc sauf verdict Erik en session — le précédent en a coûté 2).
5. ⚠ Entrelacement : personne d'autre ne touche à `sableuse/`, `apps/server/src/jev/`, `questions-joueur.json`.

## 1. Diagnostic d'abord (gratuit, local)

Avant TOUT code : relis les journaux des 3 stériles + les 2 parties perdues malgré des guerres (it4b : 3538506724, 3 guerres ok, perdue) et réponds par écrit (dans le rapport) :
- **D-O** : où meurt l'offensive ? (l'armée se forme-t-elle ? marche-t-elle VERS la capitale déclarée ? combats défensifs éternels ? le chemin n'existe pas au condensé ? les unités restent fortifiées ?) — chiffres : forces, distances parcourues, combats par tour, distance finale à la capitale.
- C'est ce diagnostic qui choisit les leviers. SI le verrou est « Jev ne voit pas la capitale à atteindre » (cible connue seulement après contact — canon fog), le remède est déjà voté (l'amendement aveugle du lobby rend la NATION publique : étendre ce principe au **cadre du théâtre** — exposer « capitale en territory approx » ou « direction du leader » SANS positions exactes, à calibrer dans la liste blanche). SI le verrou est production (pas d'unités offensives), le levier est `productionCapitale`. SI c'est les ordres (unités fortifiées en guerre totale), c'est la traduction des choix en mouvements.

## 2. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D-B — Seuil d'écart de villes 3 → 2** dans `signalDominationMechanique` (une constante data, test mis à jour) — le seed 786078703 doit alors déclencher le signal ;
- **D-C — Paix interdite en mode domination** : quand `memo.finPartie` est en mode domination/pousserCapitale et que le rapport de forces ≥ 1, la question `paix` n'est PAS posée (fin des boucles 13 refus) ; rapport < 1 → paix à nouveau possible (sauve-qui-peut légitime) ;
- **D-D — Non-régression absolue** : gate des parties calmes inchangé, victoires avant rencontre = 0, `schemaVersion` 28, zéro ordre moteur nouveau, bots/Zii/client intacts ;
- **D-E — Les leviers découverts au diagnostic (D-O)** sont data-driven et consignés un par un (constante + justification) — pas de refonte du prompt : on AJOUTE des signaux/choix ciblés, la structure v6 tient.

## 3. Mission L0→L4

- **L0** : préalables, suites vertes en local (sableuse 116, server 388, jev-port 26) ;
- **L1 — Diagnostic D-O** écrit (journaux locaux, zéro API) ;
- **L2 — Tests FIRST (harnais v6c)** : D-B, D-C, + chaque levier du diagnostic (forme invalide ignorée, actes ponctuels, non-régression des tests v6/v6b existants — ils doivent rester verts SAUF ceux qui verrouillent explicitement le seuil 3, à mettre à jour) ;
- **L3 — Port serveur bit-à-bit** + tests croisés jev-port ; questions-joueur.json v7 si le format change (test de copie vert) ;
- **L4 — Banc UNIQUE ≤ 0,50 $** : les 10 seeds complets. Tableau it4b vs calibrage : **percée** (% de guerres où la capitale adverse est ATTEINTE/assiégée — cible ≥ 40 %), **captures de capitales** (≥ 10 % des guerres), **victoires re-mesurées ≥ 4/10**, stériles sans déclaration ≤ 1, guerres avant rencontre = 0, fondations ≥ 2,5, coût. Suites complètes, commit + push, rapport `REPORT-JEV-CALIBRAGE-OFFENSIF.md` (diagnostic D-O, tableau, transcripts avant/après).

## 4. Critères d'acceptation

1. Percée ≥ 40 % et captures ≥ 10 % (cibles du cycle guerre votées) — ou, si le diagnostic D-O prouve un verrou structurel (ex. chemin impossible au fog), le rapport le démontre chiffré et Erik tranche la suite ;
2. Victoires ≥ 4/10 re-mesurées sur le corpus complet ; stériles sans déclaration ≤ 1 (786078703 doit sortir de son silence via D-B) ;
3. Non-régression : 0 guerre avant rencontre, gate calme inchangé, fondations ≥ 2,5 ;
4. Suites toutes vertes ; `schemaVersion` 28 ; budget ≤ 0,50 $ ; chaque changement de comportement attribuable au transcript.

## 5. Périmètre interdit

Moteur (seuils, combats, chemins), bots classiques, Zii, client : INTERDITS. Pas de positions exactes adverses au condensé (liste blanche — l'amendement aveugle s'arrête à la nation publique au lobby ; toute extension passe par Erik). Pas de mini-rebanc hors verdict Erik. Jamais de secret ni de fichier non tracké d'Erik.

## 6. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : T-B (bots défendent), puis T3.
