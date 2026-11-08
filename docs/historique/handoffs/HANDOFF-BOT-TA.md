# HANDOFF-BOT-TA — Le bot standard « joue correctement » (objectifs, combat, soin)

**Décisions Erik 21/10** (recommandation pilot, tranchés intégrés). Refonte de `botPolicy.ts` : des OBJECTIFS par unité au lieu du hasard — attaquer ce qui est à portée, défendre ses villes, chasser les barbares, soigner les blessés, explorer avec intention. T-B (économie) et T-C (guerre/diplomatie) suivront — HORS PÉRIMÈTRE. La mise à niveau sert de squelette tactique au futur Jev-joueur.

## 1. Préalables

- Lire `apps/server/src/botPolicy.ts` (449 lignes — le brasseur d'air actuel), son intégration GameDO (`game.ts` — ordres générés à la résolution, `botTurnSeed`), les ordres disponibles (Move/Attack/Heal/Sleep/Pass/Fortify — ORDRES-UNITES), l'état de guerre (DIPLOMATIE-T1 — le bot NE déclare PAS), R-95 (barbares), R-43 (capture des pacifiques), les bancs bot solo existants (e2e victoire par domination au tour 32).
- Baseline : suites vertes à jour, `schemaVersion` 27, **serveur seul** (aucun client/protocole). Vérifier `git status` (sessions parallèles possibles).
- Consigné (inchangé) : le bot voit l'état COMPLET (pas de fog) — le 🔶 documenté reste ; l'attaque ennemie exige l'état de guerre (qui n'arrive que si le JOUEUR déclare).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Objectif par unité, réassigné à chaque tour** (deterministe, ordre R-81) : priorités — ① **soigner** si blessé sous le seuil (donnée) et pas de menace adjacente (ordre `Heal`) ; ② **attaquer** une cible à portée de ce tour (unité ennemie en guerre, **gardien de camp barbare**, ville sans défense) si le rapport de force estimé est favorable (seuil data-driven — forces §7.4 simples, pas de simulation complète) ; ③ **garnisonner** (chaque ville propre a ≥ N défenseurs — donnée ; capitale prioritaire ; ordre Move vers la ville puis Fortify) ; ④ **chasser les barbares** (camps connus, force favorable) ; ⑤ **explorer** : couvrir le territoire (cible déterministe la plus lointaine non couverte par la vision empire — pas d'errance aléatoire) ; ⑥ Vigilance en garnison stable, Passer jamais (le bot n'a pas de badge).
- **D2 — Combats refusés** : si le rapport est défavorable, l'unité tient ou recule d'un pas vers la ville propre la plus proche (repli data-driven). Barbares gardiens = proie légitime même en Paix ; attaques d'unités/villes d'un joueur = seulement si l'état de guerre existe (le bot ne déclare pas — T-C).
- **D3 — Déterminisme intact** : RNG seedé dédié (`botTurnSeed`), tris R-81, aucune décision dépendante d'une Map ; même seed ⇒ mêmes ordres (propriété testée).
- **D4 — Économie minimale touchée** : production par défaut pondérée (unités si en guerre, sinon équilibre existant — le reste de pickProduction inchangé, T-B affinera) ; recherche/gouvernement/rush/worked tiles/GP : INTACTS (T-B).
- **D5 — Hook de difficulté** : les seuils (ratio d'attaque, seuil de soin, garnisons par ville) dans un bloc data-driven `bot.json`/`settings` avec trois profils prévus (facile/normal/difficile) — **seul « normal » est implémenté** (T-D livrera facile/difficile et le banc de calibrage).
- **D6 — Validité d'ordres** : tout ordre émis passe par les mêmes formes que le joueur (`orderShapeError` inchangé) ; un ordre invalide est remplacé par Hold (le bot ne bloque JAMAIS la résolution).

## 3. Mission

- **L1 — test-first (serveur)** : suite `bot-ta.test.ts` : assignation d'objectifs (priorité ①→⑤ sur fixtures), attaque à portée avec rapport favorable / refus et repli si défavorable, garde barbares (camp chassé, gardien pris), soin des blessés (Heal posé, pas de Heal si menacé), garnison (capitale d'abord, N par ville), guerre seule (attaque joueur si `wars`, sinon jamais), déplacement d'exploration non aléatoire (même seed ⇒ même chemin), validité orderShapeError de chaque forme émise, reprise de partie.
- **L2 — implémentation** : D1-D5 dans `botPolicy.ts` (fonctions pures testables — l'assignation d'objectifs séparée de l'émission d'ordres).
- **L3 — banc e2e** : les bancs solo existants restent verts (victoire par domination), + un banc de scénarios scriptés (bot vs barbares, bot attaqué par le joueur) vérifiés au dump serveur ; **captures GUI** d'une partie solo contre le bot « normal » (`dev-logs/captures-bot-ta/`) — Erik jugera le comportement à l'œil.
- **L4** : suites vertes (server + rules intouchés ou quasi), typecheck, commit, push, rapport `REPORT-BOT-TA.md` (seuils du bloc data-driven, 🔶, liste « à juger en jouant par Erik »).

## 4. Critères d'acceptation

1. Le bot ne brasse plus d'air : chaque unité a un objectif visible (captures) ;
2. Il chasse les barbares, défend ses villes, soigne ses blessés, attaque en guerre ce qui est prenable et ne se suicide pas ;
3. Déterminisme verrouillé (même seed ⇒ mêmes ordres) ; bloc data-driven ;
4. Bancs et suites verts, `schemaVersion` 27 inchangée.

## 5. Périmètre interdit

T-B (économie : recherche, worked tiles optimaux, rush intelligent), T-C (déclarations de guerre, diplomatie, JEV), le fog du bot (cheat consigné reste), les valeurs de combat, `schemaVersion`.

## 6. Fin de session

Rapport (blocs de calibrage, scénarios du banc, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
