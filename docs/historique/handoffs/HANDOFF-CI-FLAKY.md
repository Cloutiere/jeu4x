# HANDOFF-CI-FLAKY — Éradiquer les échecs CI intermittents : procedural-40 et progen-properties

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (règles de génération : villages, barbares, ressources — identifiants T-xx/R-xx), `HANDOFF.md` §4, `PROJET.md`, et le contexte : deux échecs CI intermittents documentés — `procedural-40` (p≈5 %, « −3 barbares ») et `progen-properties` (« villages 10 < 12 », 3 échecs le 30/09 + 1 le 01/10 sur le commit 0283252, relances vertes). **Soupçon sérieux du pilot à vérifier** : la mission CARTE-50/CAMPS-RESSOURCES (`f2b095f`) a ajouté la contrainte « villages/huttes posés à distance minimale des ressources » — elle peut rendre les garanties de NOMBRE inatteignables sur certaines seeds → ce serait une vraie violation de génération, pas un test capricieux. **2D uniquement.** Toute correction de valeur/règle passe par l'arrêt d'approbation d'Erik.

## 1. Objectif (demande d'Erik du 01/10)

Rendre la CI **fiable** : plus jamais de rouge intermittent sur ces deux tests. La CI verte doit signifier « le dépôt est sain » — aujourd'hui elle nécessite des relances manuelles, et le workflow Deploy (qui déploie la prod au push main) est bloqué par un faux rouge.

## 2. Mission

### L0 — Quantifier (la preuve avant tout)
- Faire tourner les deux tests concernés sur un corpus large (500-1000 seeds) ; produire : taux d'échec, LISTE des seeds fautives, distributions complètes (villages/carte, barbares/carte — histogrammes dans le rapport).
- Déterminer QUAND les violations ont commencé : `git log`/bisect ciblé sur les deux tests (les échecs sont documentés depuis ~le 30/09 ; croiser avec `f2b095f` CARTE-50/CAMPS-RESSOURCES et les missions voisines). Si le bisect désigne un commit précis, le rapport le nomme avec le mécanisme.

### L1 — Diagnostic par cause
Pour chaque test, conclure dans UNE des cases (preuves à l'appui) :
- **Bug de générateur** : la règle est atteignable mais le générateur la viole sur certaines seeds → correctif moteur minimal, test-first (seed fautive ajoutée comme test de non-régression), aucune valeur touchée ;
- **Conflit de règles** : deux garanties (ex. nombre de villages vs distance aux ressources) sont incompatibles sur certaines configurations → **STOP ARRÊT POUR APPROBATION** : présenter à Erik les options chiffrées (ex. « prioriser le nombre en relâchant la distance sur k seeds », « réduire la garantie », « augmenter les tentatives de placement ») avec le taux de seeds concerné — Erik décide, JAMAIS l'agent ;
- **Test trop strict/mal construit** : la règle est statistique ou tolérante par nature mais le test l'assert rigidement → corriger le TEST (citer la règle exacte de RULES.md, Erik valide la reformulation au même arrêt).

### L2 — Durcissement CI
- Les deux tests deviennent **déterministes** : corpus FIXE de seeds (les fautives découvertes y entrent comme non-régressions), zéro RNG non seedé — un échec CI futur = un vrai bug reproductible.
- Le banc exhaustif (500+ seeds) devient un script dev (hors CI, comme `devtmp/banc-carte-50.mjs` — précédent CARTE-50).
- Vérifier qu'aucun AUTRE test de la suite ne consomme de RNG non contrôlé (audit rapide, liste au rapport).

### L3 — Vérification
- Suites vertes LOCALEMENT plusieurs fois de suite (le corpus corrigé rejoué ×5) ; typecheck ; les seeds historiquement fautives passent ; un push de vérification n'est PAS nécessaire (la CI relancera au prochain push réel — Erik en juge).

### L4 — Rapport
- `REPORT-CI-FLAKY.md` : taux et seeds (avant/après), cause par test (L1), corrections, la nouvelle architecture de tests (corpus fixe + banc dev), 🔶, ce qu'Erik valide en ligne (prochain push : CI verte du premier coup).

## 3. Critères d'acceptation
1. Les deux tests passent de façon déterministe sur leur corpus (rejeux ×5 locaux sans variation).
2. Chaque seed historiquement fautive est couverte par un test.
3. Cause racine documentée par test (bug/conflit/test) — tout conflit de règles est remonté à Erik, jamais arbitré par l'agent.
4. Aucune valeur de règle modifiée sans feu vert ; suites complètes vertes ; zéro changement protocole/jeu distribué.

## 4. Périmètre interdit
- Modifier une garantie de RULES.md ou une valeur de génération sans l'arrêt d'approbation ;
- Toucher à la prod, aux autres tests, à la sableuse/JEV, à la coquille Electron ;
- « Réparer » en relançant, en désactivant un test, ou en ignorant un warning (interdit absolu).
