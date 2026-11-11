# HANDOFF-BOT-ESCARMOUCHE-GATE — Le gate remplace le ban structurel (suite de PRESSION-CAMPAGNE)

**Mission de SUIVI pour l'agent des deux arrêts K-GUERRE/PRESSION (ton commit local `704ec5b`, non poussé — c'est la base). Canon Erik validé le 11/11 : « escarmouche au gate ».**

## 1. Préalables

- Constat de tes deux arrêts (23c4a07, 704ec5b) : la stérilité est **insensible au k** (3 mesures : 0,97-1,00 / 0,97-0,98 / 0,96-0,99 sur le même corpus) — elle est **structurelle** : `attaquePermise = !armee.has(unit.id) || campagne === null || enSiege` interdit aux armées toute attaque hors siège complet, donc aucune occasion de contact n'existe entre déclaration et siège.
- **Le canon Erik** : ce ban est un héritage d'avant le gate — il existait pour empêcher les suicides qu'interdit désormais le calcul. **Le gate REMPLACE le ban** : en guerre déclarée, une unité de l'armée en campagne peut attaquer un ennemi adjacent SI l'espérance passe le gate (courbe de pression conservée). L'escarmouche est une opportunité, jamais un objectif : le rassemblement et le siège restent prioritaires.

## 2. Le canon détaillé (veto possible avant lancement)

1. `attaquePermise` ne exclut PLUS `armee.has(unit.id)` — la liste devient `campagne !== null || enSiege` (l'unité doit toujours être en campagne ou en siège pour attaquer, pas en patrouille/exploration) ;
2. La cible reste **adjacente** uniquement (pas de chasse délibérée à travers la carte) ;
3. Le gate décide avec la **courbe de pression** existante (k = max(1,1 ; 2 − 0,1×durée), plancher 1,1) — rien à changer côté gate ;
4. Hors guerre déclarée et pour les barbares : RIEN ne change (k=2, D3UUQJ vert obligatoire) ;
5. La priorité rassemblement/siège de botPolicy n'est pas réordonnée — l'escarmouche n'est évaluée que là où la branche attaque adjacente est déjà consultée (branches ②/④), jamais au prix du rendez-vous de siège.

## 3. Mission L0→L4

- **L0 — Tests FIRST** : armée en campagne en guerre longue (t ≥ 9) AVEC ennemi adjacent à p passant → attaque émise (rouge avant fix) ; armée en campagne en guerre fraîche (t < 5), même position → marche/rassemblement inchangé (courbe) ; suicide p 0,4525 symétrique fermé à toute durée ; D3UUQJ (barbares, hors guerre) vert ; unité hors campagne (patrouille) n'attaque pas ; le rendez-vous de siège non dégradé quand un ennemi adjacent passe le gate en guerre fraîche (le rassemblement prime) ; 30 seeds.
- **L1 — botPolicy** : la relaxation du ban (§2.1-2.5), tables `bot.json` inchangées côté gate.
- **L2 — Banc horloge 40×3×150 AVANT (= `33d8379`) / APRÈS** (`devtmp/banc-horloge-{AVANT,APRES}-escarmouche.json`) — critères : **stérilité normal/difficile < 0,90** · **captures ≥ 6/4/5 (critère DUR — si les escarmouches mangent les sièges, arrêt-pour-approbation, PAS d'assouplissement solo)** · fréquence de guerre dans les marges AVANT (3,20/1,75/2,58).
- **L3 — Banc bot 40×3 AVANT/APRÈS** — zéro collapse. Suites complètes, captures locales AVANT tout commit, push, vérifier Deploy SUCCESS + prod 200.

## 4. Critères d'acceptation

Stérilité < 0,90 (normal/difficile) · captures ≥ 6/4/5 · D3UUQJ vert · suicide fermé · rendez-vous de siège non dégradé (tests) · zéro collapse · suites vertes · `schemaVersion` 28.

## 5. Périmètre interdit

Inchangé : valeur tactique, sécurité locale, question tactique Jev, gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, gainSite, `schemaVersion`. La courbe de pression et le gate ne bougent PAS.

## 6. Fin de session

Rapport `REPORT-BOT-ESCARMOUCHE-GATE.md` à la racine : tableaux AVANT/APRÈS, verdict par critère, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` RACINE avant re-mesure ; bancs via config dédiée ; UN SEUL worker 8787 ; timeout banc sableuse 600 s ; ne jamais committer les fichiers personnels d'Erik ni les secrets.
