# HANDOFF-BOT-MARCHE — Que l'armée se constitue et MARCHE vers la cible

**Décisions Erik 28/10** (rapport HORLOGE-DISTANCE : la guerre vit enfin, mais l'armée ne se forme pas et ne marche pas — `distMin` figée 18-19 pendant 60 tours, 0 `FormArmy`). Mission focalisée sur la circulation militaire du bot, plus le nettoyage des re-déclarations stériles.

## 1. Préalables

- Lire `REPORT-HORLOGE-DISTANCE.md` §4 (god mode : guerre vive, marche morte) et §5, `REPORT-BOT-ARMEE.md` §5 (leviers 2 « armée permanente hors guerre » / 3 « marche coordonnée »), `botPolicy.ts` (armée/campagne, ralliement, BFS `pasVersRoutier`), BOT-EXPLORATION (rappel capitale), les notes BOT-ARMEE (« le quota de garnison en guerre absorbe d'abord »).
- Baseline : suites vertes à jour (rules 1101 / server 298 / web 700), `schemaVersion` 28. Vérifier `git status` (sessions parallèles possibles).

## 2. Diagnostic attendu (l'agent CONFIRME d'abord, corrige ensuite)

Pourquoi les unités ne convergent pas — hypothèses à trancher par le code et les sondes : (a) l'assignation campagne détache-t-elle vraiment les unités de la garnison/patrouille (priorités) ? (b) le ralliement est-il émis (`Fortify` au point de ralliement) mais la marche reste gloutonne/absente ? (c) `pasVersRoutier` est-il appelé pour les campagnes ou seulement parfois ? (d) la condition d'armée (« effectif au rayon ») est-elle jamais remplie si personne ne marche — cercle vicieux ?

## 3. Décisions (défaut appliqué — veto Erik possible)

- **D1 — Marche coordonnée** : les unités assignées à la campagne MARCHENT chaque tour vers le point de ralliement (BFS, couture comprise) — `distMin` doit diminuer de façon monotone jusqu'au contact (propriété testée et prouvée au banc).
- **D2 — Armée permanente en temps de paix** : le bot peut assembler son armée (ralliement, campement) AVANT la déclaration — quand son ratio de forces et son agressivité annoncent une guerre probable (données) — pour que la guerre éclate avec l'armée déjà en marche (miroir du joueur qui prépare).
- **D3 — Les garnisons ne mangent plus la campagne** : en guerre avec campagne active, le détachement prime sur le recrutement de nouveaux garnisons (hors urgence capitale — BOT-EXPLORATION D3 reste au-dessus de tout).
- **D4 — Re-déclarations stériles verrouillées** : pas de re-déclaration contre la MÊME cible avant `delaiRedeclaration` (donnée, ex. 30 tours) — les guerres médiévales en boucle (95 % stériles) se tarissent.
- **D5 — Cibles du banc (inchangées, évaluées Médiévale+)** : percée ≥ 40 %, captures ≥ 10 %, 0 écrasement, parties > 100 tours, ρ ≥ 0,4, défense joueur viable. Si l'échec persiste APRÈS marche fonctionnelle, le rapport le localise (prochain verrou) et Erik décide : continuer ou clore le cycle bot.

## 4. Mission

- **L1 — diagnostic consigné** (D2 §2 : cause racine confirmée par le code + une sonde).
- **L2 — test-first** : convergence monotone vers le ralliement, armée formée au contact puis assaut (`FormArmy` enfin émis), D3 priorités, D4 verrou de re-déclaration, armée de paix (D2), déterminisme, reprise.
- **L3 — banc 40×3 civs réelles** : tableau D5 avant/après + sonde marche (distMin décroissante) ; captures god mode `dev-logs/captures-bot-marche/` (armée qui MARCHE, se forme, assiège).
- **L4 — commit + push (CI déploie)**, rapport `REPORT-BOT-MARCHE.md` (diagnostic, valeurs, tableaux, verdict sur les cibles, 🔶, liste « à juger en jouant par Erik »).

## 5. Critères d'acceptation

1. En god mode : une armée qui MARCHE (distMin décroissante), se FORME, et assiège ;
2. Les cibles D5 atteintes — ou le prochain verrou localisé et documenté ;
3. Canon, spawns, valeurs de combat intacts ; déterminisme, suites vertes.

## 6. Périmètre interdit

Valeurs de combat/villes, spawns, R-31/R-71, le joueur, T2/T3, Jev, `schemaVersion`.

## 7. Fin de session

Rapport, arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
