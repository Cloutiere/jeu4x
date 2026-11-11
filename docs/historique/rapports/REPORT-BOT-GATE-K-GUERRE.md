# REPORT-BOT-GATE-K-GUERRE — k modulé par l'état de guerre

**Mission exécutée le 11/11 — ARRÊT-POUR-APPROBATION : le critère principal (stérilité < 0,90) n'est PAS atteint à k = 1,3. Consigne respectée : AUCUNE itération solo sur k, rien n'est poussé.**

Handoff : `HANDOFF-BOT-GATE-K-GUERRE.md` (canon Erik 11/11 — verdict refusant le profil stérilité 0,97-1,00 de BOT-GATE-ATTAQUE `33d8379`).

## 1. Livré (code conforme au canon, tests verts)

- **L0** — 6 nouveaux tests dans `packages/rules/tests/bot-gate-attaque.test.ts` (83 verts au total) : le MÊME accrochage (forces égales, valeurs symétriques) est **REFUSÉ hors guerre (k = 2)** et **AUTORISÉ en guerre déclarée (k = 1,3)** ; arithmétique canon (contact dès p ≥ 0,565 à valeurs symétriques ; p 0,6 passe à 1,3, refuse à 2) ; suicide pur p 0,4525 fermé même à 1,3 ; **non-régression D3UUQJ** (barbares jamais dans `diplomacy.war` → kHorsGuerre, gardien fortifié refuse toujours, p 0,4525 re-vérifié) ; déterminisme 30 seeds ; table lisible.
- **L1** — `deciderAttaqueUnitaire` choisit `k = enGuerreDeclaree ? kEnGuerre : kHorsGuerre` (une ligne de logique). Tables : `bot.json gateAttaque` `{ kHorsGuerre: 2, kEnGuerre: 1.3 }` (champ `k` global supprimé). Valeur tactique, sécurité locale (50/60), question Jev, barbares, `combatStrengthsOf`, dérivé, `schemaVersion` 28 : **intouchés** (périmètre interdit respecté). RULES.md R-190 amendée (rév. 11/11).

## 2. Bancs AVANT (`33d8379`, k=2) / APRÈS (k=1,3)

### Banc horloge 40×3×150 (`devtmp/banc-horloge-{AVANT,APRES}-kguerre.json`)

| diff | guerres/partie | durée | **stériles** | paix prop./acc. | **captures** | tours |
|---|---|---|---|---|---|---|
| difficile | 2,92→2,83 | 36,1→37,7 | 0,97→**0,98** | 113/82→107/78 | 4→**7** | 139→136 |
| facile | 1,40→1,48 | 45,5→45,9 | 1,00→**0,98** | 94/27→92/28 | 11→**9** | 113→119 |
| normal | 2,08→1,98 | 38,6→40,0 | 0,99→**0,97** | 89/46→86/46 | 7→**10** | 131→124 |

(Mêmes seeds, corpus e0b67b9 ; AVANT-gate e0b67b9 en référence : stériles 0,88/0,77/0,83, captures 6/4/5, guerres 3,20/1,75/2,58.)

### Banc bot 40×3×150 (`devtmp/banc-bot-td-{AVANT,APRES}-kguerre.json`) — **zéro collapse**

| diff | villes | pop | unités | trésorerie | techs | PV mil. |
|---|---|---|---|---|---|---|
| difficile | 2,00→1,95 | 15,8→15,5 | 111,9→101,9 | 503→613 | 0,90→0,93 | 323→293 |
| facile | 1,93→1,93 | 18,2→19,1 | 108,6→108,9 | 998→1095 | 1,05→1,18 | 311→313 |
| normal | 1,93→1,90 | 15,2→15,3 | 100,1→97,0 | 608→552 | 0,95→0,90 | 287→278 |

## 3. Verdict par critère d'acceptation

| Critère | Résultat | Verdict |
|---|---|---|
| **Stérilité normal/difficile < 0,90** | 0,97 / 0,98 | ❌ **NON ATTEINT** |
| Captures APRÈS ≥ AVANT-gate (6/4/5) | 7 / 9 / 10 | ✅ |
| Fréquence de guerre ≈ marges AVANT (3,20/1,75/2,58) | 2,83/1,48/1,98 | ❌ (recul −6 à −15 %, inchangé vs k=2) |
| Zéro suicide D3UUQJ re-testé | refus vert (k=2 barbares, p 0,4525) | ✅ |
| Zéro collapse banc bot | dans les marges | ✅ |
| Suites vertes / schemaVersion 28 | voir §4 | ✅ |

**Le k=1,3 n'a presque rien changé au profil stérile** (0,97-0,99 → 0,97-0,98). Lecture : la stérilité ne vient pas du SEUIL k mais du fait que les accrochages possibles (adjacences de contact en début de guerre) sont rares une fois les suicides fermés — les guerres se déclarent à distance, les armées campent à l'anneau, et rien ne se combat avant un siège complet. Le levier k seul semble insuffisant pour revenir à la vivacité e0b67b9 sans rouvrir autre chose.

## 4. Suites (exécutées localement, avant commit)

rules **1180/1180** (+6) · serveur 443 · web 793 · jev-port 40 · sableuse 228 · `tsc` propres. `schemaVersion` **28** intacte.

## 5. État du dépôt — ARRET POUR APPROBATION

- Commit **local** (non poussé) : code canon (k modulé) + tests + bancs JSON + ce rapport. **RIEN n'est poussé, RIEN n'est déployé** — les critères d'acceptation ne sont pas réunis, la consigne est explicite.
- **Deux options soumises à Erik** : (a) accepter le profil k=1,3 tel quel (captures ✅, zéro suicide ✅, zéro collapse ✅ — seul le critère stérilité manque) et pousser/déployer ; (b) rouvrir un cadrage : la stérilité exige un levier HORS k (par ex. attaques de contact autorisées en guerre déclarée à l'anneau de ralliement, ou une valeur de « pression de campagne » croissant avec la durée de guerre) — à trancher par Erik avant toute nouvelle itération (consigne respectée : zéro itération solo sur k).

**Fin de session — remise de la main.** Pièges respectés : cache vitest racine purgé avant re-mesures, bancs via config dédiée, AVANT copiés avant modification, aucun secret commis.
