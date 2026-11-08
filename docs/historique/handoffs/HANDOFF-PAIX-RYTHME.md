# HANDOFF-PAIX-RYTHME — Armées de siège (canon R-31), cible cohérente, paix du gagnant

**Décisions Erik 27/10** (validées — lecture canon : la ville tombe aux ARMÉES R-31, pas au nerf de régénération, qui reste en RÉERVE). Suite directe de BOT-ARMEE : les cibles de conquête (percée ≥ 40 %, captures ≥ 10 %) étaient hors de portée du périmètre précédent ; cette tranche les prend par les trois leviers canoniques.

## 1. Préalables

- Lire `REPORT-BOT-ARMEE.md` (les 3 causes chiffrées : horloge de paix, régénération vs assauts solitaires, cible de guerre ≠ cible de campagne), **R-31 (armées : FormArmy, A/D somme — jamais utilisée par le bot)**, BOT-ARMEE (armée/campagne/BFS), la paix T-C (`deciderPaix`, `toursPaixMin`, `chanceAccepteFaible` jamais déclenchée), le banc P7 (artefacts, civs réelles).
- Baseline : suites vertes à jour (rules 1101 / server 274 / web 700), `schemaVersion` 28. Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 27/10 — non négociables)

- **D1 — Armées de siège (levier principal, CANON)** : quand une campagne atteint la ville cible avec sa masse critique, le bot **FORME L'ARMÉE** (`FormArmy` — 3 membres mêmes type, A/D somme R-31) au point de ralliement, puis l'armée assiège et frappe — la conquête passe par la mécanique canon, pas par l'affaiblissement des villes. Types mixtes = groupes homogènes (R-31 exige le même type) — l'agent répartit l'armée en sous-groupes par type (donnée : taille de groupe).
- **D2 — Cible de guerre cohérente** : le plus faible **PARMI LES PROCHES** (distance pondérée — donnée) au lieu du plus faible absolu souvent lointain ; la cible de campagne = la cible de guerre (fin de la marche qui mangeait la durée).
- **D3 — Paix du gagnant (P5/P6)** : un côté accepte la paix **au-delà de 2× `toursPaixMin`** (donnée) ; une guerre **jamais bataillée** se ferme à `toursPaixMin` (paix administrative conservée pour ces seules guerres vides) ; `chanceAccepteFaible` est **abrogée** (jamais déclenchée en 1581 occasions) remplacée par la règle ci-dessus ; les propositions répétées du perdant n'usent pas le gagnant (réponse déterministe, pas de re-tirage par proposition).
- **D4 — Régénération en RÉERVE** : R-71 (+1 PV/tour, +2 en ville) INCHANGÉE — on n'y touche pas sauf échec démontré au banc (consigné : si D1-D3 ratent les cibles, le rapport le prouve et Erik rouvrira le nerf).
- **D5 — Cibles du banc (arbitre, inchangées)** : ≥ 40 % guerres avec percée ; ≥ 10 % avec capture ; 0 écrasement avant t30 ; parties moyennes > 100 tours ; défense du joueur viable (test scripté existant) ; ρ agressivité ≥ 0,4 conservé.
- **D6 — Le joueur inchangé** : FormArmy reste disponible pour lui tel quel ; les valeurs de combat et villes ne bougent PAS (canon).

## 3. Mission

- **L1 — test-first** : formation d'armée de siège (masse critique → FormArmy → assaut d'armée → capture sur fixture), groupes homogènes par type, cible pondérée proche, paix du gagnant (> 2× min acceptée ; guerre vide à min ; `chanceAccepteFaible` retiré), persistance de campagne, déterminisme.
- **L2 — bot + paix** (D1-D3 ; serveur).
- **L3 — banc d'arbitrage** (40×3, civs réelles P7) : tableau D5 avant/après ; captures god mode `dev-logs/captures-paix-rythme/` (armée formée au ralliement, siège d'armée, **capture de ville observée**).
- **L4 — commit + push (CI déploie)** par livrable vérifié ; rapport `REPORT-PAIX-RYTHME.md` (valeurs, tableaux, verdict D4 : armées suffisent-elles ? 🔶, liste « à juger en jouant par Erik »).

## 4. Critères d'acceptation

1. En god mode : le bot FORME des armées au siège et prend des villes ;
2. Cibles du banc D5 atteintes (ou échec PROUVÉ et documenté → dossier nerf à Erik) ;
3. Canon intact (R-31/R-71 inchangées) ; déterminisme, suites vertes.

## 5. Périmètre interdit

R-71 et toute valeur de ville/combat ; le joueur (aucun comportement nouveau) ; T2/T3, Jev ; le fog du bot ; `schemaVersion`.

## 6. Fin de session

Rapport (verdict sur D4), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
