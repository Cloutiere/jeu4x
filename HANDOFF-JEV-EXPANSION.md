# HANDOFF-JEV-EXPANSION — Jev v3 : la fondation (l'expansion, compétence 4X fondamentale)

**Décisions Erik 28/10** (« go » — itération 3). Verrou résiduel : Jev ne fonde JAMAIS de deuxième ville (1 ville en 1v1, 3 parties sur 10 finissent 1v1 à t151). Même méthode que v2 (reformulation de questions, zéro moteur), re-banc de comparaison v2/v3. Budget plafond **0,50 $** (garde-fou campagne 10 $ intact).

## 1. Préalables

- Lire `REPORT-JEV-CALIBRAGE-DECISIONS.md` (v2 : 2 victoires par conquête, 37 guerres, le verrou fondation) et le harnais (`sableuse/src/joueur.mjs`, `questions-joueur.json`, `partie.mjs` — mémo partagé), R-158 (MultiStep : déplacement + action finale `foundCity` — LA forme canon pour envoyer un colon fonder), les helpers de site (fertilité/spawns — scoring de site existant), R-112 (Colon 2 pop), R-87 (légalité de fondation).
- Baseline : suites sableuse 58 verts, `schemaVersion` 28. Vérifier `git status`. Clés en env uniquement.

## 2. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Question « fonder »** : une décision dédiée par tour (quand Jev a un colon disponible OU peut en produire) : JUSQU'À 3 sites candidats pré-triés par le harnais (score moteur : fertilité + eau + distance à la capitale — helpers existants, PAS de nouvelle formule), décision OUI/NON par cible ou « le meilleur des trois » — choix argumenté (miroir v2 guerre : rapport de forces explicite ; ici le site avec son score).
- **D2 — Exécution canon** : si Jev choisit un site → production du colon si absent (question produire déjà branchée) puis l'ordre **`MultiStep` (marche + foundCity)** est émis pour le colon — le moteur fait le reste (fog R-161, annulation propre). Le bot tactique ne re-tourne PAS le colon (même discipline que la suppression des déclarations v1).
- **D3 — Cadence** : pas plus d'UNE fondation programmée à la fois ; la question ne revient que quand la ville est fondée ou le colon perdu (pas de spam de sites).
- **D4 — Rien d'autre** : guerre/conversion/paix v2 inchangées, moteur/serveur/web/bot standard intouchés, `schemaVersion` 28, même corpus (10 seeds, civs P7).

## 3. Mission

- **L1 — tests-first harnais** : candidats de sites (score moteur réutilisé, jamais inventé), question fonder (fixtures : 3 candidats → le choix traduit en MultiStep ; refus → rien), cadence D3, fausse LLM, déterminisme.
- **L2 — re-banc v3** : 10 seeds identiques, plafond 0,50 $, artefacts `sableuse/bancs/joueur-v3-<date>/`.
- **L3 — comparaison v2/v3** : villes JEV par partie (v2 : 1 partout — LA métrique), victoires, score, guerres, coût/partie ; anecdotes (expansion réussie vs refus multiples) ; verdict « Jev s'étend-il maintenant ? ».
- **L4** : rapport `REPORT-JEV-EXPANSION.md` (tableau v2/v3, verdict, recommandation : branchement lobby fumée ou itération 4), commit du harnais (jamais de clés), arrêt, remise de la main.

## 4. Critères d'acceptation

1. Jev fonde 2-4 villes dans la MAJORITÉ des parties (v2 : 1 partout) ;
2. La progression guerre/économie/conversions de v2 NE régresse PAS ;
3. Coûts documentés, zéro impact prod, zéro secret.

## 5. Périmètre interdit

Moteur/serveur/web, le bot standard, le lobby, T2, `schemaVersion`.

## 6. Fin de session

Rapport + verdict, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik ni des secrets.
