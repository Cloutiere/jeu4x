# REPORT-BANC-VANILLA — 5 parties complètes jusqu'à une victoire quelconque (01/11)

**Question d'Erik : « si on laissait aller les parties jusqu'à une victoire quelconque, Jev gagnerait-il ? »**

## Protocole exécuté

- 5 parties 1v1 Jev (p1) vs bot standard, **mode VANILLA** : civs neutre/neutre (P2 — zéro unique, zéro trait, agressivité au défaut canon 0,5 ; data-driven, le moteur est INTACT, la variante vit dans le plan du banc SEULEMENT — test négatif : aucun « vanilla » dans apps/server).
- Plafond de sécurité 600 tours ; bataille complète, canon siège, déclaration mécanique actifs (P3 — c'est le Jev d'aujourd'hui).
- Banc `bancs/joueur-vanilla-2026-11-01` (`--vanilla --plafond 600`), suites sableuse 165 verts avant le run, sonde crédits OK (0 erreur API sur les 5 parties).
- Coût total **0,7057 $ ≤ 0,80 $** ; journées JSONL complètes ; journaux non committés (62 Mo — plan/état seuls dans git, comme les bancs précédents).

## Résultats (mètre `sableuse/devtmp/analyse-vanilla.py`)

| # | Seed | Gagnant | Type (`reason`) | Tour | Villes J/b | Forces J/b | Techs J/b | Déclarations |
|---|---|---|---|---|---|---|---|---|
| 1 | 3538506724 | **personne** | — | 601 (plafond 600) | 1/1 | **2 941**/284 | 47/3 | AUCUNE, des deux côtés |
| 2 | 3947827986 | **Jev** | **science** | 499 | 2/1 | 3 464/238 | 46/2 | AUCUNE |
| 3 | 2121991107 | **Jev** | **science** | 473 | 2/1 | 3 305/131 | 46/3 | AUCUNE |
| 4 | 3802591813 | **Jev** | **domination** | **59** | 3/0 | 11/5 | 4/0 | bot déclare t10 (canal bot classique, agressivité neutre 0,5 reste probabiliste) ; Jev contre-attaque, capture de la capitale t59 |
| 5 | 214915776 | *coupée* | — | 290 | 5/1 | 1 550/7 | 36/1 | AUCUNE |

⚠ Partie 5 : **coupée par budget** (coupeParBudget=true — il restait 0,19 $ du global, insuffisant pour finir une partie longue), PAS « indécise à 600 ». Partie 1, elle, est une vraie indécise au plafond.

## Réponse à la question d'Erik

**OUI — Jev gagne quand on laisse aller : 3 victoires / 4 parties terminées** (la 5e coupée par budget, pas perdue) :

1. **2 victoires par SCIENCE (t473 et t499)** — la première de l'histoire des bancs Jev : laissé sans l'agressivité de civ qui déclenche les guerres t10-17, Jev développe tranquillement, creuse l'écart technologique (46-47 techs vs 2-3) et la fin de partie science finit par tomber. C'est la vraie découverte de l'expérience : **Jev a une fin de partie propre par la voie scientifique, elle demande juste 470-500 tours**.
2. **1 victoire par DOMINATION (t59)** — la plus rapide jamais mesurée : un bot déclare t10, Jev contre-attaque et capture la capitale en 59 tours. Le canon « attaque = mort de l'un des deux » + la déclaration adverse suffisent à Jev pour finir.
3. **0 défaite** ; les 2 parties sans victoire sont une indécise (partie 1 : paix totale 600 tours, Jev 10× les forces mais ne tente rien) et une coupe budget (partie 5 : Jev 5 villes, 36 techs, forces 220× le bot — la victoire science était vraisemblablement proche).

## Lecture pour la suite

- **Le verrou n'est plus la fin de partie, c'est le TEMPS** : 473-499 tours pour gagner par science au banc, contre 150 tours au plafond standard. Les bancs courts (150) ne peuvent structurellement pas voir Jev gagner par science.
- **Sans agressivité de civ, la guerre ne vient pas de Jev** (0 déclaration en 4 parties complètes) — le décisionnel mécanique (rapport ≥ seuil) reste rarement déclenché en vanilla ; les victoires Jev viennent de la science ou des guerres DÉCLARÉES CONTRE lui.
- Parties 1 et 5 confirment la passivité conquérante déjà consignée (1-5 villes, forces massives, jamais de campagne) — mais elle n'empêche plus de gagner.

## Suites vertes / tests

- `sableuse/tests/vanilla.test.mjs` 9 verts (vanilla = neutre/neutre, zéro trait/unique, agressivité 0,5, raison de victoire au journal, test négatif prod).
- Suites sableuse complètes : **165 verts**. Moteur, schemaVersion 28, bots en prod, Zii, client : INTACTS.
