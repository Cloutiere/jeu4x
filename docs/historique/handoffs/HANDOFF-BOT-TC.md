# HANDOFF-BOT-TC — Le bot déclare la guerre (agressivité par civ) + la paix minimale

**Décisions Erik 25/10** (« Prochaine étape ? » — suite de la file). Le bot déclare la guerre selon l'agressivité de SA civilisation et le rapport de forces ; une paix minimale complète la boucle. T2 (négociation complète) et Jev suivront — le reste HORS PÉRIMÈTRE.

## 1. Préalables

- Lire DIPLOMATIE-T1 (`wars`, `DeclareWar`, gate d'attaque — le bot subit la même gate), BOT-TA/TB (objectifs militaires, économie), R-146/R-147 (traits par civ), `bot.json` (3 profils), le banc T-D (baseline « normal » 40 parties) et les deux bancs à recadrer : botSolo 300 tours (échec PRÉEXISTANT consigné — le bot ne gagne plus sans guerre) et carte-multi 400 tours (pas de victoire structurelle, R-187).
- Baseline : suites vertes à jour, `schemaVersion` 27. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Agressivité par civilisation** : un champ data-driven `agressivite` (0-1, défaut 0,5) dans `civilizations.json` par civ (les 16 + ajustement 🔶 proposé par l'agent au rapport : Zoulous/Mongols hauts, Inde basse…) ; le bot essaie de déclarer la guerre à un voisin quand : forces militaires (ratio simple data-driven) ≥ seuil du profil, tour ≥ minimum (donnée), et tirage seedé < agressivite×facteur ; **délai minimal entre deux guerres** (donnée).
- **D2 — Cibles** : voisin le plus faible d'abord (distance wrap, forces) ; l'objectif des armées en guerre = **capitale de la cible** (les objectifs T-A attaquent déjà — la guerre les nourrit de cibles légitimes) ; les bots se déclarent la guerre ENTRE EUX aussi (guerres observables en god mode).
- **D3 — Paix minimale** (boucle complète avant T2) : nouvelle action `ProposePeace { player }` (miroir `DeclareWar`, valider `orderShapeError` EN PREMIER) : le joueur peut proposer la paix depuis la pastille ; le bot **accepte si son rapport de forces est inférieur au seuil** (donnée, tirage seedé) ou après `toursPaixMin` de guerre — sinon refuse (crédibilité, décision T1) ; les bots proposent la paix ENTRE EUX selon la même règle. Paix acceptée = `wars` purgée, événement public + Chroniques.
- **D4 — Rien d'autre** : pas d'échanges de techs/or (T2), pas d'offensive coordonnée multi-front, le fog du bot inchangé (cheat consigné), Grande Muraille/ONU intouchées (T3).
- **D5 — Bancs recadrés** : botSolo 300 tours → **victoire par domination du bot à nouveau attendue** (normal, seuil de tours consigné) ; carte-multi → guerres observées entre bots au banc ; le tableau T-D est re-mesuré en T-C (comparatif avant/après au rapport).

## 3. Mission

- **L1 — test-first (serveur)** : décision de déclaration (agressivité×tirage, seuil de forces, tour minimum, délai entre guerres — fixture par civ), ciblage voisin le plus faible, ProposePeace (accepté si écrasé, refusé sinon, purgation de `wars`, événement public), bots entre eux, determinisme (même seed ⇒ mêmes décisions), reprise.
- **L2 — serveur + données** (`civilizations.json` agressivite, `bot.json` seuils de guerre/paix ×3 profils).
- **L3 — client** : bouton « Proposer la paix » sur la pastille en guerre (confirmation, réponse du bot affichée), Chroniques déclaration/paix/réfus.
- **L4 — bancs + captures** : bancs recadrés (D5), tableau T-C vs baseline T-D ; captures god mode `dev-logs/captures-bot-tc/` (guerre déclarée, offensive capitale, paix acceptée).
- **L5** : suites vertes, typecheck, RULES.md (DIPLOMATIE-T1 : §bots), commit, push, rapport `REPORT-BOT-TC.md` (agressivités proposées par civ, 🔶, liste « à juger en jouant par Erik »).

## 4. Critères d'acceptation

1. En god mode : des guerres éclatent entre bots selon leurs civs, avec offensives vers les capitales ;
2. Tu peux proposer la paix et le bot répond (accepte/refuse) selon le rapport de forces ;
3. Le banc botSolo re-converge vers une victoire du bot (délai consigné) ;
4. Déterminisme verrouillé ; suites et bancs verts.

## 5. Périmètre interdit

T2 (négociation : échanges techs/or, contre-propositions), T3 (ONU victoire, Grande Muraille paix), Jev, les valeurs de combat, le fog du bot, `schemaVersion`.

## 6. Fin de session

Rapport (tableau T-C vs T-D, agressivités, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
