# HANDOFF-OR-RUSHBUY — Audit « l'or sert à quelque chose » : puits d'or vérifiés de bout en bout + polissage + scénarios de test réel

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-134..R-137, R-88, espionnage vol d'or), `HANDOFF.md` §4, `PROJET.md`. **2D uniquement.** Le rush-buy et les puits d'or sont DÉJÀ implémentés (phase 7l) — cette mission est un **audit de bout en bout + correctifs d'usage**, PAS du développement de règles. **Zéro changement moteur/serveur sauf bug avéré** (tout bug trouvé est documenté avec test avant correctif). Le livrable final inclut une **checklist de scénarios pour la session de test réelle d'Erik**.

## 1. Objectif (demande d'Erik du 29/09)

Erik veut pouvoir **tester l'or en vraie partie** (notamment le rush-buy) avant la suite du chantier JEV. La chaîne existe (7l) mais sa validation en conditions réelles n'a jamais été faite de bout en bout. Mission : vérifier que CHAQUE puits d'or fonctionne et se comprend à l'écran, polir ce qui accroche, et préparer le protocole de test d'Erik.

## 2. Les puits d'or à auditer (implémentés — à vérifier, pas à construire)

1. **Rush-buy R-135** : achat instantané de la production courante (unité ou bâtiment) — coût `rushBuyCostOf` (facteur par ère), **1 achat/ville/tour**, interdit ONU/Banque mondiale, Complexe −20 % sur les unités militaires ;
2. **Paliers économiques R-136** : échelle 100 → 20 000 — chaque palier franchi donne UN GP (canal or → Explorateur/Industriel) ;
3. **Victoire économique R-137** : Banque mondiale, 20 000 or (validation par tests existants — hors checklist d'Erik, impraticable en vraie partie) ;
4. **Vol d'or par espion** (jusqu'à 50 %) et **sac de ville** ;
5. **Trésorerie R-134** : barre trésorerie/GPT, surplus de recherche → or 1:1, intérêts 2 % (Arabie), entretien zéro (test négatif existant).

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts. Inventorie les points d'entrée UI de chaque puits (bouton d'achat dans la vue ville ? affichage du coût et du facteur d'ère ? barre trésorerie/GPT ? compteur de palier ?) — fichier:ligne dans le rapport.

### L1 — Audit e2e local (partie solo headless + GUI)
Pour chaque puits, un scénario joué de bout en bout en local (solo bot) :
- Rush-buy d'une unité ET d'un bâtiment : coût affiché exact (facteur d'ère visible ?), débit correct, production instantanée, événement journal, **second achat même ville même tour refusé proprement** (bouton désactivé + tooltip, pas d'erreur console), fonds insuffisants → message clair, ONU/Banque mondiale non achetables ;
- Palier d'or : injecter une trésorerie proche du palier (état de test local autorisé — outil de vérification, pas en prod) → franchissement → GP attendu + événement nommant le canal or ;
- Vol d'or : espion → action vol → trésoreries débitées/créditées, événement ;
- Affichage permanent : barre trésorerie + GPT corrects après chaque opération (le GPT inclut conversion or + intérêts le cas échéant).
- **Noter chaque accroc** : UX confuse, tooltip manquant, état de bouton faux, coût mal affiché.

### L2 — Correctifs d'usage
- Corriger les accros L1 côté client uniquement si possible ; si un bug touche moteur/serveur : test qui l'épinglé d'abord, correctif minimal, documenté séparément au rapport (Erik aura le détail).
- Interdit : retoucher des valeurs (facteurs d'ère, échelle des paliers), ajouter des puits, changer des règles.

### L3 — Vérification
- Suites vertes + typecheck ; e2e solo rejouée proprement ; **captures `dev-logs/captures-or-rushbuy/`** (achat d'unité, achat de bâtiment, refus 2e achat, fonds insuffisants, palier → GP).

### L4 — Checklist de test réel + ARRÊT POUR APPROBATION D'ERIK
- Livrable clé : **CHECKLIST-TEST-OR.md** (racine) — scénarios numérotés pour la session réelle d'Erik, chacun avec : préparation (quoi construire/produire avant), geste exact, résultat attendu à l'écran. Réaliste (pas de 20 000 or à la main) ; la victoire économique reste couverte par les tests automatiques (dit explicitement dans la checklist).
- Présenter captures + accros corrigés. Feu vert de commit, puis ERIK TESTE EN VRAI et revient avec ses constats (les retouches seront une mission de suite).

### L5 — Rapport
- `REPORT-OR-RUSHBUY.md` : audit puits par puits (verdicts), accros et correctifs, captures, la checklist, ce qui reste 🔶.

## 4. Critères d'acceptation
1. Chaque puits d'or fonctionne de bout en bout en local, vérifié par scénario (captures).
2. La checklist permet à Erik de tester l'essentiel de l'or en UNE session de jeu réaliste.
3. Zéro changement de règle/valeur ; tout bug moteur/serveur épinglé par test avant correctif minimal.
4. Suites vertes ; zéro secret ; zéro impact JEV/sableuse.

## 5. Périmètre interdit
- Nouvelles mécaniques d'or, retouche de valeurs (facteurs, échelle), conversion des villes (R-90 — futur chantier JEV) ;
- Le bot prod et la sableuse (chantiers séparés) ; 3D ; toute refonte UI au-delà du polissage des points d'or.
