# HANDOFF-DIPLOMATIE-T1 — L'état de guerre : Paix / Guerre entre nations

**Décisions Erik 19/10** (tranchés votés). Fondation de la diplomatie : un état PUBLIC **Paix/Guerre par paire de nations** ; attaquer exige la Guerre ; l'espionnage reste libre ; la caravane fonctionne en guerre. T2 (négociation) et T3 (ONU victoire, Grande Muraille paix) suivront — HORS PÉRIMÈTRE.

## 1. Préalables

- Lire R-52/R-44 (attaques/capture de ville), R-118 (soutien naval), §8.11 (espionnage), R-139 (nucléaire), la Caravane (livraison en guerre — freshly delivered), R-73 (filtrage fog), `pastilles.ts` (adversaires), Chroniques.
- Baseline : suites vertes à jour (rules ~1060 / web ~590 / server 123), `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions Erik (votées — non négociables)

- **D1 — État public** : `wars` par paire de joueurs (défaut ABSENT = Paix) ; champ additif sérialisé, **migration uniquement si nécessaire** (défaut absent = Paix rend la lecture compatible — justifier au rapport si migration quand même) ; état PUBLIC (pas de fog sur les guerres).
- **D2 — Attaquer exige la Guerre** : mêlée, attaque à distance, bombardement/soutien naval hostile, capture de ville et ICBM = refus nets en Paix (ordre individuel ignoré avec raison nommée — miroir `ProductionRefused`, événement/raison + libellé journal). NE S'APPLIQUE PAS à : l'espionnage (missions, duels, vol — **libre en Paix, ne déclenche JAMAIS de guerre**) ; la **caravane** (livraison en guerre AUTORISÉE) ; la capture passive R-43 d'un colon sur case disputée ? — TRANCHÉ DÉFAUT : la capture R-43 normale exige aussi la guerre sauf DÉFENSE de sa propre case (un colon qui marche sur TA case occupée se fait capturer par toi même en Paix — défense territoriale, consignée 🔶).
- **D3 — Déclarer la guerre** : nouvelle ACTION immédiate `DeclareWar { player }` (même contrat que SetGovernment — valider `orderShapeError` EN PREMIER) : publique, événement `WarDeclared` + Chroniques TOUS (canon CivRev), badge ⚔ sur la pastille de nation (et détail survol). Re-déclaration immédiate après paix : permise (défaut — l'IA refusera la paix trop tôt en T2, crédibilité).
- **D4 — Bots (T1 minimal)** : les bots NE déclarent PAS de guerre (initiative = T2/T3) ; leurs attaques subissent la même gate (en Paix, elles sont refusées — la Paix a un sens) ; un bot ATTAQUÉ répond normalement (défense, mêlée de riposte — toute attaque lui ouvre... NON : la guerre ne devient mutuelle que par `DeclareWar` du joueur ; les ripostes défensives du bot sur SES cases sont couvertes par l'exception défense de D2 🔶 à l'œil).
- **D5 — Intouchés** : ONU (jalons actuels — victoire immédiate = T3), Grande Muraille (blocage actuel — imposition de paix = T3), caravane (fonctionne en guerre, inchangée), espionnage (libre), victoires existantes.

## 3. Mission

- **L1 — test-first** : gate d'attaque en Paix (chaque vecteur : mêlée, distance, naval, ICBM — refus nommé), exception défense territoriale, espionnage libre en Paix (mission + duel), caravane livrée en guerre, `DeclareWar` (ordre, validité, publicité, re-déclaration), bots gate (attaque bot refusée en Paix, défense OK), reprise de partie (absent = Paix).
- **L2 — moteur + serveur** : état, gate (les points d'attaque listés), action `DeclareWar`, événements, labels, `orderShapeError`.
- **L3 — client** : bouton/entrée « Déclarer la guerre » (pastille adversaire — modale de confirmation : « La guerre est publique et mutuelle »), badge ⚔ pastille + survol, Chroniques, refus d'attaque affichés proprement.
- **L4 — captures GUI avant commit** (`dev-logs/captures-diplomatie-t1/`) : attaque refusée en Paix (raison affichée), déclaration de guerre, attaque acceptée ensuite, caravane livrée en guerre, badge ⚔.
- **L5** : suites vertes complètes, RULES.md (nouvelle règle Diplomatie T1 + renvois), commit, push, rapport `REPORT-DIPLOMATIE-T1.md` (🔶 D2 défense territoriale, D4 ripostes).

## 4. Critères d'acceptation

1. Aucune attaque possible en Paix, refus nommé dans le journal ;
2. `DeclareWar` publique et mutuelle, badge ⚔, Chroniques de tous ;
3. Espionnage et caravane intacts ; reprise d'anciennes parties = Paix partout ;
4. Suites et bancs verts.

## 5. Périmètre interdit

Négociation/échanges (T2), ONU/Grande Muraille (T3), initiative de guerre des bots, alliances, toute valeur de combat, `schemaVersion` sauf nécessité démontrée.

## 6. Fin de session

Rapport (🔶 consignés), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
