# HANDOFF-JEV-V4 — Science débloquée, gainNet honnête, score de fin : le banc 3 et le premier classement des 16 civs

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/recherche/Intégration IA JEV Jeu 4X.md`, `REPORT-JEV-QUESTIONS-V2.md`, `REPORT-JEV-BANC.md`, `REPORT-JEV-V3-BANC2.md` (l'état exact : pilote v3.1 — expansion chiffrée 5,33 villes/partie, menace/attaque exercées, 2 % de replis ; défauts à traiter : science bloquée R-90 pour TOUT le monde, gainNet surestimé ~×2 en ville jeune, parties non convergentes 1/40 ; v3.1 liste noire fog corrigée non re-banchée). La `sableuse/` est en place (banc résumable, 26/26 tests). **Outil HORS LIGNE** — interdit au serveur/prod/jeu distribué. **Zéro changement moteur** (`packages/rules` en consommation — SetConversion existe déjà, R-90 : action immédiate par ville, défaut Or). Budget Erik : garde-fou global **2 $** (0,82 $ consommés à date — viser ≤ 1,6 $ cumulés ; si le mini-banc + banc 3 menacent le plafond, STOP et rapport AVANT de dépasser).

## 1. Objectif (décision d'Erik du 29/09 : « le pilote est assez bon pour mesurer — passe-le au calibrage »)

Transformer le pilote v3.1 en **instrument de mesure impartial** et produire le **premier classement chiffré des 16 civilisations** : V4 régle les trois biais connus (science morte, prédictions gonflées, pas de métrique de fin), valide en mini-banc, puis lance le banc 3 (30 parties + 10 contrôle) dont le rapport classe les civs **par score à horizon fixe** — pas par victoire (les parties 5-nations ne convergent pas, c'est un fait du jeu assumé).

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Science débloquée par RÈGLE de harnais** (pas une question Jev, pour l'instant) : politique déterministe appliquée par le harnais à la place du défaut — **une ville qui a (ou termine) sa Bibliothèque passe en science ; la capitale passe en science après son premier colon produit** (règle éditable dans la config sableuse, appliquée comme le plan bot, journalisée `regle:conversion`). La question `rechercher` de Jev garde le choix de la tech. La question `convertir` (arbitrage or/science par Jev) reste UNE ITÉRATION FUTURE — le condensé montre désormais l'orientation courante de chaque ville (prêt pour cet avenir).
- **D2 — GainNet pondéré par la maturité** : la formule v3 (`gainSite` dans la config) gagne un facteur de maturité (rendement pondéré par la pop attendue à court terme — les journaux du banc 2 chiffrent l'écart ×2 ; cible : prédiction vs réel dans le rapport à ±50 %). Formule éditable, gelée AVANT le banc 3.
- **D3 — Score de fin à horizon fixe** (la métrique du classement) : à la fin de chaque partie (plafond 150 tours ou victoire), score d'empire = **villes×W1 + population×W2 + techs complétées×W3 + merveilles×W4 + trésorerie/W5** (pondérations data-driven dans la config sableuse, défauts simples : 10/2/30/100/10 — ordre de grandeur : une ville ≈ une tech, une merveille pèse lourd, l'or en seconde classe). **Le score ne remplace PAS les victoires** : si une partie se décide, le vainqueur est consigné comme aujourd'hui ; le score sert de classement pour les non-décidées. Affiché par civ et par bras (Jev/contrôle).
- **D4 — Scénarios de faisabilité par victoire (les 4, quasi gratuits)** : 4 scénarios de harnais à injections locales (comme le test de menace V2) — économique (trésorerie proche de 20 000 + Banque mondiale posable), scientifique (conversion active + arbre court), culturelle (accumulation forcée), domination (capitale voisine). Objectif : prouver que pilote/journal/rapport captent chaque type de victoire de bout en bout. Étiquetés `scenario:victoire`, jamais mélangés au banc.
- **D5 — Banc 3** : 40 parties (30 Jev + 10 contrôle, gratuit), 150 tours, civs sans remise par partie, rotation équilibrée, résumable, **adaptateur/questions/formules GELÉS après le mini-banc** (comparabilité). Journaux complets locaux ; RAPPORT.md committable.
- **D6 — Statistique honnête** : 30 parties = détection d'anomalies, pas verdict définitif — le rapport l'affirme en tête ; toute anomalie candidate (civ écrasante/fantôme) est **confirmable par un banc de suivi ciblé** (chantier suivant, pas celui-ci).

## 3. Mission

### L0 — Préalables
- Baseline : tests sableuse verts (26/26), budget à date (journaux), dépôt intact (ne PAS toucher `CadreLobby.svelte`/`config.ts` ni les chantiers d'Erik en cours).

### L1 — V4 pilote
- D1 : règle de conversion (config + application harnais + journal) ; condensé : orientation des villes visible.
- D2 : facteur de maturité dans `gainSite` (config éditable) ; A/B rapide sur 3-4 seeds v3.1-vs-v4 : prédiction vs rendements réels mesurés (cible ±50 %), fondations toujours motivées, pas de replis massifs.
- D3 : score de fin (calcul pur + testé), ajouté aux métriques de partie.
- Faux client enrichi ; tests (règle de conversion, score, maturité).

### L2 — Faisabilité par victoire (D4)
- Les 4 scénarios : chaque type de victoire atteint en simulation, détecté, journalisé, affiché dans un mini-rapport. Coût API ≈ nul (injections) — si un scénario exige des tours joués, le borner (≤ 20 tours).

### L3 — Mini-banc de validation (v3.1+V4)
- 5-8 parties (~0,10-0,15 $) : la v3.1 liste noire élimine les rejets FoundCity (cible : ~0 rejet fog), la conversion produit des techs en quantité visible (≥ 2-3 techs/empire à 150 tours), le score apparaît et est plausible (ordre de grandeur cohérent entre bras).
- **Critère d'arrêt** : si les rejets fog persistent OU la science reste morte OU le score est absurde → STOP, rapport, pas de banc 3.

### L4 — Banc 3 (D5)
- Lancer les 40 parties, suivre le budget ; échecs documentés ; métriques complètes + score.

### L5 — Analyse + ARRÊT POUR APPROBATION D'ERIK
- **Le classement** : table des 16 civs par score moyen (bras Jev et contrôle séparés + toutes parties), distribution par composante (villes/techs/merveilles/or) pour dire COMMENT chaque civ marque, anomalies en tête (civ écrasante, civ fantôme, voie morte), lecture qualitative (2-3 extraits : une partie science débloquée, une fondation maturité-corrigée, une victoire de faisabilité).
- Réponse honnête à « Jev est-il un instrument fiable ? » : biais restants connus (ex. la règle de conversion est la même pour tous — mesure-t-on la civ ou la règle ? le contrôle all-bot répond à ça).
- NE COMMITTER QU'APRÈS FEU VERT (jamais `journaux/`, `bancs/` complets, `.env.local`).

### L6 — Rapport
- `REPORT-JEV-V4.md` : règles/formules (textes complets), mini-banc, banc 3, le classement, biais connus, 🔶 (pondérations du score, facteur de maturité, seuil fonder), recommandation (banc de suivi ciblé sur les anomalies ? rituel de calibrage à chaque retouche de règle ?).

## 4. Critères d'acceptation
1. La science fonctionne dans les simulations : ≥ 2-3 techs/empire à 150 tours (vs ~0 au banc 2) ; les civs orientées science marquent des points de tech.
2. Prédictions gainNet vs réel à ±50 % (tableau dans le rapport) ; ~0 rejet fog FoundCity.
3. Les 4 types de victoire captés en scénario (journal + rapport).
4. Le classement des 16 civs par score existe, lisible, avec anomalies signalées et caveats statistiques.
5. Coût cumulé ≤ 1,6 $ ; 0 ordre illégal hors scénarios étiquetés ; zéro changement moteur/serveur/jeu ; tests verts ; zéro secret.

## 5. Périmètre interdit
- Moteur/serveur/protocole/jeu distribué (règles, valeurs, R-90 — tout est côté sableuse) ; la question `convertir` (itération future) ; l'initiative offensive Jev (parqué) ; le bot solo en prod ; toute retouche de règles de croissance ou de victoires ; commit de secrets/journaux bruts.
