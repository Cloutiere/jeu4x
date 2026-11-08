# HANDOFF-GUERRE-VIVANTE — Des guerres qui se battent ou se terminent : conduite du bot + jugement de Jev

**Statut : prêt — NON LANCÉ.** Cadrage voté par Erik le 02/11. Le constat fondateur (banc croissance `dc7f344`, §4 du rapport) : le bot déclare t11-18, puis **320+ tours de guerre nominale avec 0 échange de combat** (4 parties sur 5) — et Jev, en guerre toute la partie, ne modifie ni sa production ni son jeu. Trois objets votés : (1) la guerre stérile se tranche « les deux » — paix OU assauts **selon le rapport de forces** ; (2) être en guerre pousse Jev à monter sa production militaire et se fortifier en prévision ; (3) le bot doit pouvoir **demander la paix lui-même après avoir déclaré** — la situation change, le jugement suit. Canon confirmé : `razedCapital` (dernier survivant réel) INTACT.

## 0. Préalables

1. `sableuse/REPORT-JEV-CROISSANCE.md` (§4 : le chiffre, les leviers non appliqués) + `HANDOFF-JEV-CROISSANCE.md` ; `RULES.md` R-188 (diplomatie bot : agressivité, paix minimale, paix du gagnant R-188-d), R-189 (négociation à la réception), R-187 (Paix/Guerre public) ;
2. Code : `apps/server/src/botPolicy.ts` (déclaration T-C, `deciderPaix`, `paixDuGagnant`, horloge de paix, production armée A1 — la mécanique offensive EXISTE : `assignerArmee`, marche, porte d'assaut) ; `sableuse/src/joueur.mjs` (questions v9, `memo.finPartie`, `protegerCapitale`) ; `packages/rules/src/diplomatie.ts` (`applyProposePeace` — le bot PEUT-il proposer ? vérifier le chemin serveur bot→opposant, c'est L1) ;
3. ⚠ **Diagnostic L1 AVANT tout code (gratuit, journaux de `bancs/joueur-croissance-2026-11-02`)** : pourquoi la guerre du bot est vide ? (le bot ne désigne pas d'objectif ? la porte d'assaut ne s'ouvre jamais ? l'armée ne se forme pas ? l'horloge de paix ne s'applique pas ? `ProposePeace` bot→Jev n'existe pas côté serveur ?) — chaque constat oriente le levier ; le rapport l'affiche.
4. ⚠ Discipline : harnais d'abord + port TS bit-à-bit, tests FIRST, banc vanilla long via tsx, mètre `analyse-vanilla.py` (étendre : tours de guerre sans combat — le mètre de stérilité), sonde crédits, banc réel UNIQUE ≤ 1,00 $ (5 parties complètes, les 5 seeds croissance).

## 1. Décisions de tranche (votées — ne rien étendre)

- **D-A — Conduite de guerre du bot (correction, pas nouvelle règle)** : après SA déclaration, le bot poursuit — (a) il désigne un objectif offensif (sa mécanique existante : armée + marche + porte d'assaut, orientée vers la capitale/le territoire du déclaré) ; (b) **jugement de guerre stérile** : si `enGuerre` depuis `seuils.guerreSterileTours` (data, défaut 30) avec **0 bataille** : rapport de forces < 1 → il **propose la paix lui-même** (`ProposePeace` bot→adversaire, résolu à la réception R-189 — la grille/jugement existant décide côté receveur) ; rapport ≥ 1 → il **assaille** (convertir la guerre nominale en campagne). Plus jamais 320 tours de rien. ⚠ Si L1 montre que le blocage est ailleurs (ex. pas de chemin, armée impossible), le consigner et cadrer avec Erik AVANT de coder une mécanique nouvelle.
- **D-B — Jev en guerre modifie son jeu** : quand `enGuerre` — (a) **production militaire accrue** : poids militaires relevés dans l'arbitrage de production (data `seuils.guerrePoidsMilitaire`, défaut à calibrer — mesuré : unités produites/tour en guerre vs paix) ; (b) **fortification en prévision** : la question `protegerCapitale` existante s'ouvre aussi sur la guerre elle-même (pas seulement les menaces à rayon 5) — les unités de combat non affectées fortifient la capitale et la ville la plus proche du front ; (c) **le jugement de guerre stérile de Jev** : question `guerreSterile` (gate : `enGuerre` ≥ 30 tours data + 0 bataille) — le LLM choisit `paix` (ProposePeace existant, grille T2 du bot décide) / `assauts` (bascule `memo.finPartie = {mode:'pousserCapitale', cible}` — la chaîne marche+siège existante) / `continuer` (persisté, révisé au cooldown existant). **Zéro mécanique nouvelle côté Jev** : c'est le premier vrai jugement de situation, la frontière votée (mécanique = bot, jugement = LLM).
- **D-C — Symétrie et fin de boucle** : le couple peut se répondre (bot propose la paix → Jev décide ; Jev propose → grille bot) — surveiller qu'aucune boucle paix/refus infinie ne se crée (le spam de paix est déjà borné côté moteur — vérifier le compteur, consigner). L'horloge de paix existante (R-188) reste : une vraie guerre qui se bat suit son cours canon.
- **D-D — Intouchés** : moteur (diplomatie, combat), CANON-SIEGE/BATAILLE-COMPLETE, gainSite (fraîchement calibré), déclarations mécaniques (écrasement/espace/domination), razedCapital (canon confirmé), Zii, client (sauf si un toast existe déjà pour ProposePeace reçu — sinon rien), `schemaVersion` 28. questions-joueur.json → v10 si `guerreSterile` ajoutée (copie serveur, test de copie).

## 2. Mission L0→L4

- **L0** : préalables, sonde crédits, suites vertes (sableuse 203, jev-port 36).
- **L1 — Diagnostic consigné** (la cause de la guerre vide, la disponibilité de ProposePeace bot→adversaire, le compteur anti-spam paix) — dans le rapport.
- **L2 — Tests FIRST** : D-A (bot : objectif désigné après déclaration, paix proposée à sterile+perdant, assaut à sterile+gagnant, rien avant 30 tours) ; D-B (poids militaires en guerre, fortification ouverte en guerre, `guerreSterile` gate + 3 choix + traductions existantes, formes invalides ignorées) ; D-C (pas de boucle infinie — test dédié). Port TS bit-à-bit + tests croisés jev-port.
- **L3 — Banc UNIQUE ≤ 1,00 $** : 5 parties vanilla longues (seeds croissance) — tableau : **tours de guerre sans combat** (LE critère : 320+ → ≤ 30), **guerres qui finissent** (paix conclue OU combats OU capture), production militaire de Jev en guerre (unités/tour en guerre vs paix — consigné), victoires (non-régression 5/5 finies — idéalement encore accélérées par des guerres qui comptent), expansion ≥ 4 (non-régression). Suites complètes, commit + push, rapport `REPORT-GUERRE-VIVANTE.md` (diagnostic, tableau, transcripts des jugements de guerre).
- **L4 — Remise de la main** : rapport + arrêt. Erik lit — si les guerres vivent, le profil complet est atteint (croître, choisir, conquérir, et mener ses guerres).

## 3. Critères d'acceptation

1. Stérilité : **zéro guerre nominale > 30 tours sans bataille** dans les 5 parties (ou consignée avec cause chiffrée) ;
2. Chaque guerre finit par paix conclue, combats, ou capture — au transcript ;
3. Jev en guerre : production militaire visiblement supérieure + fortification posée (transcript) ; le jugement `guerreSterile` documenté au moins une fois ;
4. Non-régression : 5/5 parties finies, victoires Jev, expansion ≥ 4 villes/partie ; suites vertes ; `schemaVersion` 28 ; budget ≤ 1,00 $.

## 4. Périmètre interdit

Moteur (diplomatie, combat, paix : tout existe) ; les déclarations mécaniques existantes (on traite la conduite APRÈS déclaration) ; gainSite et le calibrage croissance ; T3/Muraille ; bots hors conduite de guerre (menu, économie, expansion) ; Zii ; jamais de secret ni de fichier non tracké d'Erik ; pas de mini-rebanc hors verdict Erik en session.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : reste au backlog — conquête par direction (fog), zapping de voie, miroir JvJ, atelier voix de Zii, vieux 🔶 ; et surtout : Erik joue contre le Jev complet.
