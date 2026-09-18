# HANDOFF-TRACE-RESOLUTION — La trace complète de résolution (états par phase + décisions du moteur, journal enrichi + export JSON)

**Chantier d'outil du chapitre 2D.** Objectif d'Erik : **le maximum d'informations** pour analyser en détail les résolutions d'engagement — pourquoi les unités se sont déplacées de telle ou telle façon, quels choix le moteur a faits et avec quelles valeurs. Décision du pilotage du 18/09 : le journal actuel (événements) montre les RÉSULTATS ; il manque les **décisions** et les **états intermédiaires**.

## 1. Préalables

1. Lire `RULES.md` §8bis (R-173..R-183), §5 R-159 rév. B/-b/-c/-d, R-179-b, et `docs/historique/rapports/REPORT-COMBAT-COMPORTEMENTS.md` (la codification — chaque entrée de trace devra citer sa règle) ;
2. Le labo `#/labo-combat` (journal 4 sections existant) et le flux de debug d'Erik ;
3. Baseline : suite verte courante, typecheck 4/4, `schemaVersion` **25**, `git status` propre.
4. **Zéro gameplay, impératif absolu** : la trace est une **instrumentation passive** (un récolteur qui observe la résolution) — AUCUN changement de comportement, de RNG (les rolls consommés sont rapportés, jamais ajoutés), ni d'ordre. Verrouillé par test : la résolution avec trace activée produit **bit à bit** le même état que sans trace.

## 2. Mission

### M1 — Le collecteur de trace (moteur, passif)
1. Un **récolteur** (hook optionnel passé à `resolveTurn`, défaut absent = zéro coût) qui capture, sans influencer :
   - **Snapshots par phase** : à l'entrée ET à la sortie de chaque phase (A mouvements → B combats/entrées retenues → C économie → E mêlée/dispersion/stabilité), pour chaque unité : position, PV, PM, stabilité (stabilisé/instable), fortification, propriétaire ;
   - **Les décisions** : chaque choix moteur avec ses ENTRÉES calculées et la règle citée — mêlée pondérée (poids par unité : attaque effective², étau, tirage w/Σw, roll consommé, dégâts appliqués 0/−1/−2), choix du défenseur/cible (les valeurs comparées : défense, fortification, PV, tie-break R-81), entrées retenues (qui, pourquoi, séquence R-177), renfort (est entré/non, pourquoi), ordre tronqué/arrêté (PM, dispute, condition), dispersion (qui part, les cases candidates, pourquoi celle-là), coup en passant, report de mêlée, stabilisation ;
   - **Le compte de seed** : chaque roll consommé (index, valeur, usage).
2. Sortie : une structure **JSON déterministe** (même résolution + même seed = même trace bit à bit — testé) ;
3. La trace cite la **règle (R-xx)** à chaque décision.

### M2 — Les deux vues dans le labo
1. **Journal lisible enrichi** (pour Erik) : la trace rendue en texte humain groupé par phase — « Phase B : guerrier A retenu devant la case (2 attaquants amis, R-159-b)… Phase E : mêlée — poids A=9,00 (étau 1,25), poids B=4,00, tirage 0,31 → A gagnante ; B −2 PV → 1/3 ; A +0 » ;
2. **Export JSON** (bouton copier/télécharger dans le labo) : la trace complète d'un ou plusieurs tours — structuré pour l'analyse par IA (unités, phases, décisions, formules, rolls) ;
3. La trace est **activable/désactivable** dans le labo (défaut : activée) ; les sessions de jeu normales ne sont pas touchées.

### M3 — Vérification
1. Tests : déterminisme de la trace (avec/sans trace = état identique bit à bit), complétude (chaque phase couverte), une décision mêlée complète vérifiée valeur par valeur (poids, étau, roll, dégâts), JSON valide et auto-consistant ;
2. e2e + captures `dev-logs/captures-trace-resolution/` : un scénario d'ENGAGEMENT joué au labo, trace lisible + JSON exporté correspondant ;
3. Suite verte forcée, typecheck 4/4, `schemaVersion` 25, zéro diff 3D et serveur.

## 3. Périmètre interdit

- Toute modification de comportement, de résolution, de RNG ou d'ordres ; le 3D ; l'UI de jeu (la trace vit dans le labo/debug) ; `assets-src` (atelier parallèle éventuel — vérifier `git status`).

## 4. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-TRACE-RESOLUTION.md` (y compris : un extrait de trace réel annoté), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
