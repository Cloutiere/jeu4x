# HANDOFF-BOT-GATE-K-GUERRE — k modulé par l'état de guerre (calibrage de suivi du gate d'attaque)

**Mission de SUIVI pour l'agent qui a livré BOT-GATE-ATTAQUE (`33d8379`) — le contexte est le tien, ton code est sous tes yeux. Canon Erik validé le 11/11.**

## 1. Préalables

- Ta livraison : `packages/rules/src/gateAttaque.ts`, tables `bot.json gateAttaque` (k=2 global), branchement botPolicy + barbares, question tactique Jev. Rapport : `REPORT-BOT-GATE-ATTAQUE.md` (écarts §2).
- Baseline : rules **1174** / server 443 / web 793 / jev-port 40 / sableuse 228 verts, `schemaVersion` **28** (intacte), Deploy SUCCESS `33d8379`, prod 200.
- Verdict Erik du 11/11 : le nouveau profil (stérilité 0,97-1,00) est **refusé** — les guerres doivent garder des accrochages de contact (canon GUERRE-VIVANTE `868452e`), SANS rouvrir les suicides de type D3UUQJ.

## 2. Le canon validé (rien d'autre ne bouge)

**k modulé par l'état de guerre déclarée :**
- **k = 2 hors guerre** — inchangé. Barbares jamais en guerre déclarée → le refus D3UUQJ (guerrier vs gardien fortifié, p 0,4525) reste vert. NE PAS y toucher.
- **k = 1,3 en guerre déclarée** (tunable `bot.json gateAttaque`, ex. `kHorsGuerre: 2, kEnGuerre: 1,3`) — arithmétique cible : accrochages de contact dès p ≥ 0,57 ; le suicide pur (p < 0,5) reste fermé.
- Le bonus de sécurité locale (50/60, D3) et la valeur tactique restent tels quels. Pas de bypass `effectifAssaut`, pas de bonus de guerre proportionnel (leviers écartés par Erik).

## 3. Mission L0→L4

- **L0 — Tests FIRST** : test rouge/vert — même accrochage à p ≈ 0,6 : REFUS hors guerre, AUTORISÉ en guerre déclarée ; barbares D3UUQJ toujours refusés (non-régression L0 existante) ; table lisible dans `bot.json` ; déterminisme 30 seeds.
- **L1 — Moteur** : `gateAttaque` prend k en paramètre effectif ; le branchement choisit k selon `guerreAvec` (déjà porté par le gate via D3) — une ligne de logique, zéro refonte.
- **L2 — Bancs (l'arbitre demandé par Erik)** :
  - **Banc horloge 40×3×150 AVANT (= `33d8379`) / APRÈS** (`devtmp/banc-horloge-{AVANT,APRES}-kguerre.json`) — critères d'acceptation : **stérilité normal/difficile < 0,90**, **captures APRÈS ≥ captures AVANT-gate (e0b67b9 : 6/4/5)**, fréquence de guerre revenue dans les marges AVANT (3,20/1,75/2,58). Facile peut rester plus stérile si difficulté < 0,90 non atteignable — consigner, ne pas forcer.
  - **Banc bot 40×3 AVANT/APRÈS** — zéro collapse, villes/pop/techs dans les marges.
  - Si les critères ne passent PAS à k=1,3 : consigner les chiffres et t'arrêter (arrêt-pour-approbation — ne pas itérer seul sur k).
- **L3 — Suites + déploiement** : suites complètes, captures locales AVANT tout commit, push, vérifier Deploy SUCCESS + prod 200.

## 4. Critères d'acceptation

Stérilité < 0,90 (normal/difficile) · captures ≥ AVANT-gate · zéro suicide D3UUQJ re-testé vert · zéro collapse banc bot · suites vertes · schemaVersion 28.

## 5. Périmètre interdit

Valeur tactique, sécurité locale, question tactique Jev (L3 de la première mission), barbares gardien Fortify / R-183, `combatStrengthsOf`, dérivé ORACLE-VERDICT, Zii, gainSite, `schemaVersion`.

## 6. Fin de session

Rapport `REPORT-BOT-GATE-K-GUERRE.md` à la racine : les deux tableaux AVANT/APRÈS, verdict par critère, écarts consignés, ⚠ CI/Deploy à vérifier. Puis arrêt, remise de la main.

**Pièges** : cache vitest `.vite` à la RACINE avant re-mesure ; bancs via config dédiée ; UN SEUL worker 8787 ; timeout banc sableuse 600 s (déjà ajusté) ; ne jamais committer les fichiers personnels d'Erik ni les secrets.
