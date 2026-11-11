# REPORT-BOT-GATE-PRESSION-CAMPAGNE — k décroissant avec la durée de guerre

**Mission exécutée le 11/11 — ARRÊT-POUR-APPROBATION (2e consécutive) : le critère stérilité < 0,90 n'est PAS atteint, ni par le k plat (K-GUERRE) ni par la courbe de pression. Chiffres consignés, AUCUNE itération solo sur pente/plancher, rien poussé ni déployé.**

Handoff : `HANDOFF-BOT-GATE-PRESSION-CAMPAGNE.md` (canon Erik 11/11 — arbitrage « pression de campagne » sur le constat que la stérilité est insensible au k).

## 1. Livré (code conforme au canon, tests verts)

- **L1** — `kEffectif(d, toursDepuisDeclaration, enGuerreDeclaree)` (pur, exporté) : hors guerre déclarée → `kHorsGuerre` (2) ; entre belligérants → `max(kPlancher=1,1 ; kHorsGuerre − kPente=0,1 × tours depuis déclaration)` — k = 1,3 à t=7, 1,1 à t=9, plancher ensuite. **Source unique de la durée : `dureeGuerre` (warsDepuis, GUERRE-VIVANTE)**. Tables : `bot.json gateAttaque` `{ kHorsGuerre: 2, kPente: 0.1, kPlancher: 1.1 }` — la clé plate `kEnGuerre` est supprimée. Barbares (jamais dans `diplomacy.war`) : toujours k=2 — **D3UUQJ protégé**.
- **L0** — 6 tests (26 verts au fichier, 83 avec barbares) : courbe k(t) exacte (2 / 1,3 / 1,1 / plancher / hors guerre) ; le MÊME accrochage p 0,5 REFUSÉ en guerre fraîche (t=2, k≈1,8) / **AUTORISÉ en guerre longue (t=9, plancher)** ; suicide pur p 0,4525 symétrique fermé à t=20 (plancher), contact canon p ≥ 0,524 passe ; D3UUQJ refusée à k=2 ; table lisible ; 30 seeds. Périmètre interdit respecté ; RULES.md R-190 amendée (PRESSION DE CAMPAGNE remplace la modulation plate).

## 2. Banc horloge 40×3×150 AVANT (`33d8379`, k=2) / APRÈS (pression) — `devtmp/banc-horloge-{AVANT,APRES}-pression.json`

| diff | guerres/partie | durée | **stériles** | paix prop./acc. | **captures** | tours |
|---|---|---|---|---|---|---|
| difficile | 2,92→2,83 | 36,1→39,1 | 0,97→**0,96** | 113/82→105/78 | 4→**4** | 139→138 |
| facile | 1,40→1,50 | 45,5→46,3 | 1,00→**0,98** | 94/27→89/28 | 11→**8** | 113→119 |
| normal | 2,08→1,95 | 38,6→39,9 | 0,99→**0,99** | 89/46→81/42 | 7→**9** | 131→126 |

(Références : e0b67b9 AVANT-gate — stériles 0,88/0,77/0,83, captures 6/4/5, guerres 3,20/1,75/2,58.)

## 3. Banc bot 40×3×150 — `devtmp/banc-bot-td-{AVANT,APRES}-pression.json` — **zéro collapse**

| diff | villes | pop | unités | trésorerie | techs | PV mil. |
|---|---|---|---|---|---|---|
| difficile | 2,00→1,95 | 15,8→15,9 | 111,9→103,2 | 503→582 | 0,90→0,90 | 323→298 |
| facile | 1,93→1,88 | 18,2→18,2 | 108,6→106,2 | 998→1090 | 1,05→1,07 | 311→305 |
| normal | 1,93→1,95 | 15,2→15,7 | 100,1→97,6 | 608→660 | 0,95→0,95 | 287→279 |

## 4. Verdict par critère

| Critère | Résultat | Verdict |
|---|---|---|
| **Stérilité normal/difficile < 0,90** | 0,99 / 0,96 | ❌ **NON ATTEINT** (2e échec) |
| Captures ≥ AVANT-gate (6/4/5) | 4 / 8 / 9 | ❌ difficile (4 < 6) / ✅ facile+normal |
| Fréquence ≈ marges AVANT (3,20/1,75/2,58) | 2,83/1,50/1,95 | ❌ |
| Zéro suicide D3UUQJ / p<0,5 fermé à toute durée | tests verts | ✅ |
| Zéro collapse | dans les marges | ✅ |
| Suites / schemaVersion 28 | voir §5 | ✅ |

## 5. Suites (locales, avant commit)

rules **1180/1180** · server 443 · web 793 · jev-port 40 · sableuse 228 · tsc propres · `schemaVersion` 28 intacte.

## 6. Le diagnostic qui s'impose après DEUX échecs du levier k

Trois variantes du seuil ont été testées sur le même corpus déterministe : **k=2 global** (stérilité 0,97-1,00), **k=1,3 plat en guerre** (0,97-0,98), **courbe 2 → 1,1 avec la durée** (0,96-0,99). Le k ne pilote PAS la stérilité : à aucun moment de la campagne deux unités ne se retrouvent adjacentes à p ≈ 0,5. La structure de campagne (BOT-ARMEE) fait camper l'armée à l'**anneau de ralliement** (dist `rayonRalliement` de la ville cible) et n'autorise l'assaut qu'à `effectifAssaut`/`ratioForcesAssaut` — à ce moment l'attaque est déjà à p très élevé (elle passait à k=2 aussi). Entre la déclaration et le siège complet, **aucun accrochage n'existe à créer** : les deux camps évitent la menace (repli D2) et marchent sans se croiser. Le levier vivant est ailleurs — pistes structurelles (toutes HORS périmètre de cette mission, à cadrer par Erik) : (a) attaques de contact AUTORISÉES aux membres de l'armée en campagne pendant le rassemblement (la condition `attaquePermise = !armee.has(unit.id) || enSiege` exclut actuellement les assiégeants de toute attaque hors siège — c'est le verrou apparent) ; (b) anneau de ralliement plus proche de la garnison ; (c) escarmouche délibérée contre la garnison sortie. Les chiffres complets par variante sont dans les trois jeux de JSON `devtmp/banc-horloge-*` committés.

## 7. État du dépôt — ARRÊT POUR APPROBATION (2e)

Commit **local** (non poussé, non déployé) : code pression + tests + bancs JSON + ce rapport. Aucune itération sur pente/plancher (consigne). ⚠ CI/Deploy : non applicable (rien de poussé).

**Fin de session — remise de la main.**
