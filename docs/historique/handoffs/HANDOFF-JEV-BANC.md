# HANDOFF-JEV-BANC — Banc de calibrage : parties 5 nations pilotées par Jev, métriques d'équilibrage lisibles

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `docs/recherche/Intégration IA JEV Jeu 4X.md` (directives Jev), `REPORT-JEV-POC.md` et `REPORT-JEV-QUESTIONS-V2.md` (l'état du pilote v2 : 1-2 replis/partie, production/recherche/menace/attaque pilotés, `fonder` en repli bot — assumé). La `sableuse/` existe (harnais, condense v2, adapter, faux client, journal, rejouer). **Outil HORS LIGNE** — interdit au serveur/prod/jeu distribué. Zéro changement moteur/serveur (`packages/rules` en consommation). Budget Erik : 5 $, garde-fou global **2 $** maintenu, dev avec le faux client.

## 1. Objectif (le but premier d'Erik, 28/09)

Faire jouer **la sableuse de calibrage** : des séries de parties complètes **5 nations** pilotées par Jev v2, sur la configuration multi actuelle (50×40, cf. CARTE-50 en prod), et produire un **rapport d'équilibrage lisible par Erik** : taux de victoire par civilisation, distribution des types de victoire, longueur des parties, expansions, anomalies. C'est l'outil qui remplace le « à l'œil » par du chiffré.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Premier banc : 40 parties** (30 Jev + 10 contrôle), batch résumable : une partie = un fichier journal complet dans `sableuse/journaux/banc-<date>/` ; si l'exécution s'interrompt (réseau, budget), elle REPREND où elle en était (plan des parties en fichier, état fait/pas fait). Statistiques volontairement **coarse** au premier tour — le rapport doit le dire (intervalles naïfs, pas de conclusions fortes sur 30 parties ; c'est un détecteur d'anomalies, pas un verdict définitif).
- **D2 — Pilote : Jev v2 TEL QUEL** (hybride, `fonder` en repli bot). **Aucune retouche de l'adapter ni des questions pendant le banc** — la comparabilité des parties prime ; tout réglage sera une itération suivante (v3) documentée avec les faits du banc.
- **D3 — Rotation équilibrée des civilisations** : plan des 40 parties généré AVANT l'exécution (fichier `plan.json` : seed, 5 civs par siège, armée) — chaque civ apparaît à peu près autant de fois, positions siège tournantes. Seeds tracées ; re-générer le plan = fichier différent, jamais écraser un banc en cours.
- **D4 — Armée de contrôle all-bot** : 10 parties sans aucun appel Jev (gratuites) → la distribution de référence « bot vs bot » pour interpréter les winrates Jev (distinguer « cette civ est forte » de « Jev exploite cette civ »).
- **D5 — Métriques par partie** (depuis le journal, aucune re-simulation) : vainqueur + type de victoire, nombre de tours, villes fondées par joueur (expansions — surveiller l'effet `fonder`-bot), techs complétées, replis, coût, latence. **Agrégats** : winrate par civ (tous sièges confondus) + par type de victoire, longueur moyenne/écart-type, comparaison Jev vs contrôle, taux de repli moyen, coût total.
- **D6 — Sortie lisible** : `sableuse/bancs/banc-<date>/RAPPORT.md` — tableaux markdown (un par métrique), les anomalies en tête de rapport : civ écrasante (winrate ≫), civ absente des victoires, type de victoire dominant, parties trop courtes/longues, taux d'expansion aberrant. Ton « rapport d'expérience honnête », chiffres bruts accessibles.
- **D7 — Robustesse d'exécution** : exécution séquentielle ou petite concurrence (le pic p95 1,5 s / max 9,8 s interdit un parallélisme agressif) ; une partie qui échoue deux fois (seed) est marquée `échec` et le banc continue ; garde-fou 2 $ global (cumul avec les missions précédentes journalisé).
- **D8 — Zéro changement hors `sableuse/`** ; `journaux/` et `bancs/` gitignés (les RAPPORT.md des bancs peuvent être committés au feu vert — ils ne contiennent aucun secret).

## 3. Mission

### L0 — Préalables
- Baseline : tests sableuse verts (15/15), budget consommé à date (journaux), typecheck dépôt intact.
- Vérifie la config multi courante (50×40, 5 sièges — progen/settings) et que le harnais V2 la consomme telle quelle.

### L1 — Runner de banc
- `src/banc.mjs` : lecture `plan.json` → exécution des parties (réutilise le harnais V2) → métriques par partie (D5) → agrégation (D6) → RAPPORT.md. Reprise sur interruption ; garde-fou budget ; armée de contrôle D4 (même harnais, override Jev désactivé, zéro appel).
- Tests (faux client) : plan respecté, reprise après interruption simulée, agrégats corrects sur fixtures, rapport généré.

### L2 — Fumée
- 3 parties Jev (seeds de test) de bout en bout via le runner : métriques complètes, rapport de fumée lisible, coût mesuré. **Arrêt de contrôle : si le coût/partie dépasse ~0,02 $ ou la latence explose, STOP et rapport.**

### L3 — Le banc (D1)
- Générer `plan.json` (D3), lancer les 40 parties, suivre le budget. Toute partie `échec` documentée (seed, cause).

### L4 — Analyse
- RAPPORT.md (D6) + une **lecture qualitative** : 3 moments saillants du banc (ex. la victoire la plus rapide, la civ écrasée, un comportement de Jev inattendu) avec extraits de journal.

### L5 — ARRÊT POUR APPROBATION D'ERIK
Présenter le RAPPORT.md complet + anomalies + coût cumulé. Verdicts attendus : les anomalies sont-elles réelles ou artefacts du pilote/coarse ? Lance-t-on un 2e banc plus grand / une v3 `fonder` ? NE COMMITTER QU'APRÈS FEU VERT.

### L6 — Rapport de mission
- `REPORT-JEV-BANC.md` : plan, exécution (échecs éventuels), agrégats, anomalies, coût, recommandation (banc 2 plus grand ? v3 fonder avec les faits ? intégration au rituel de calibrage à chaque retouche de règle ?).

## 4. Critères d'acceptation
1. 40 parties exécutées (ou reprises proprement), journaux complets, RAPPORT.md lisible avec les agrégats D5/D6.
2. Coût cumulé ≤ 2 $ ; zéro retouche de l'adapter en cours de banc (D2).
3. Anomalies identifiées et documentées (ou absence d'anomalie constatée).
4. Zéro changement moteur/serveur/jeu ; tests verts ; zéro secret au dépôt ; journaux gitignés.

## 5. Périmètre interdit
- Adapter/questions/condensé (gelés, D2) ; moteur/serveur/protocole ; le bot solo en jeu ; tout correctif de règles découvert par le banc (ils se consignent au rapport — Erik décide) ; v3 `fonder` (itération suivante) ; commit de secrets.
