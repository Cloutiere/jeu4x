# REPORT-BOT-ESCARMOUCHE-GATE — le gate remplace le ban structurel

**Mission exécutée le 11/11 — ARRÊT-POUR-APPROBATION (3ᵉ consécutive) : le critère stérilité < 0,90 n'est PAS atteint — mais pour la première fois le levier structurel produit des effets visibles (captures +78 %, guerres plus longues, pertes réelles). Chiffres consignés, aucun assouplissement solo, rien poussé ni déployé.**

Handoff : `HANDOFF-BOT-ESCARMOUCHE-GATE.md` (canon Erik 11/11 — « escarmouche au gate » : le ban hérité d'avant le gate est remplacé par le calcul).

## 1. Livré

- **L1** — `botPolicy.assignerObjectifs` : `attaquePermise = campagne !== null || enSiege` (l'exclusion `!armee.has(unit.id)` est SUPPRIMÉE — les assiégeants en campagne peuvent escarmoucher un ennemi ADJACENT si la courbe de pression passe). La chasse aux barbares reste la porte ④ en paix ; le rassemblement et le siège ne sont pas réordonnés (le refus du gate tombe aux priorités suivantes) ; tables `bot.json` et gate inchangés (courbe 2→1,1 conservée) ; périmètre interdit respecté ; `schemaVersion` 28.
- **L0** — 5 tests nouveaux + 4 tests re-verrouillés (`apps/server/tests/bot-ta.test.ts`, 23 verts) : ROUGE avant fix (armée en campagne guerre longue t=9 attaque l'adjacent qui passe) ; fraîche + ennemi fort (p bas, refus partout) → rassemblement inchangé (Move/Fortify, jamais Attack) ; hors campagne (paix, patrouille) personne n'attaque via ② (canon §2.1 — R-95 conservé en campagne, la chasse ④ reste la porte en paix) ; D3UUQJ vert (double protection : hors campagne ET k=2) ; déterminisme 30 seeds. Re-verrouillage : 4 tests BOT-GATE-ATTAQUE nécessitent désormais une campagne (une ville p1 dans le fixture — la ② exige `campagne !== null`), assertions annotées BOT-ESCARMOUCHE.

## 2. Banc horloge 40×3×150 AVANT (`33d8379`) / APRÈS — `devtmp/banc-horloge-{AVANT,APRES}-escarmouche.json`

| diff | guerres/partie | durée | **stériles** | paix prop./acc. | **captures** | tours |
|---|---|---|---|---|---|---|
| difficile | 2,92→2,40 | 36,1→**42,6** | 0,97→**0,98** | 113/82→79/61 | 4→**9** | 139→127 |
| facile | 1,40→1,38 | 45,5→47,6 | 1,00→**0,98** | 94/27→69/26 | 11→**6** | 113→115 |
| normal | 2,08→1,90 | 38,6→**46,4** | 0,99→**1,00** | 89/46→65/41 | 7→**12** | 131→118 |

(Référence e0b67b9 AVANT-gate : stériles 0,88/0,77/0,83, captures 6/4/5, guerres 3,20/1,75/2,58.)

## 3. Banc bot 40×3×150 — `devtmp/banc-bot-td-{AVANT,APRES}-escarmouche.json`

| diff | villes | pop | unités | trésorerie | techs | PV mil. |
|---|---|---|---|---|---|---|
| difficile | 2,00→1,90 | 15,8→**13,6** | 111,9→**87,9** | 503→559 | 0,90→**0,68** | 323→251 |
| facile | 1,93→1,90 | 18,2→18,9 | 108,6→102,4 | 998→1096 | 1,05→1,30 | 311→295 |
| normal | 1,93→1,85 | 15,2→15,9 | 100,1→93,5 | 608→818 | 0,95→1,05 | 287→268 |

⚠ Le difficile SAIGNE (pop −13 %, unités −21 %, PV −22 % vs `33d8379`) : les escarmouches tuent vraiment. Toujours au-dessus du AVANT-gate e0b67b9 (pop 11,8 / unités 72,7) — pas un collapse, mais un vrai coût de guerre à arbitrer.

## 4. Verdict par critère

| Critère | Résultat | Verdict |
|---|---|---|
| **Stérilité normal/difficile < 0,90** | 1,00 / 0,98 | ❌ **NON ATTEINT** (3e levier k-family échoué) |
| **Captures ≥ 6/4/5** | **9 / 6 / 12** (total 27 vs 15 AVANT-gate, +78 %) | ✅ |
| Fréquence ≈ marges AVANT (3,20/1,75/2,58) | 2,40/1,38/1,90 | ❌ |
| D3UUQJ vert / suicide fermé | tests verts | ✅ |
| Rendez-vous de siège non dégradé | test dédié vert (fraîche + refus → rallier) | ✅ |
| Zéro collapse | difficile saigne mais > e0b67b9 | 🔶 à l'arbitrage |
| Suites / schemaVersion 28 | voir §5 | ✅ |

## 5. Suites (locales, avant commit)

rules **1180/1180** · server **448** (+5) · web 793 · jev-port 40 · sableuse 228 · tsc propres · `schemaVersion` 28.

## 6. Lecture pour l'arbitrage

Le levier structurel BOUGE enfin les indicateurs de vivacité : **captures 15 → 27 (+78 %)**, guerres nettement plus longues (durée +4 à +8 tours — elles se battent au lieu de se clore administrativement), paix proposées en baisse (les guerres ne sont plus « vides »). Mais la STÉRILITÉ (part de guerres closes sans AUCUNE bataille) reste 0,98-1,00 : l'escarmouche exige une ADJACENCE, et l'anneau de ralliement (`rayonRalliement` ≈ 3 cases de la ville) ne met personne au contact — les armées campent, escarmouchent quand la garnison sort, mais ne croisent jamais l'armée ennemie qui campe à SON anneau. Deux guerres qui s'assiègent mutuellement ne se touchent jamais. Tant que les deux anneaux ne se chevauchent pas, aucun levier de seuil ni de permission n' créera le contact. Leviers suivants possibles (à cadrer par Erik, hors mission) : (a) anneau de ralliement à dist 1 (au contact de la garnison — l'escarmouche devient systématique au siège) ; (b) chasse de l'armée ennemie VISIBLE adjacente à l'anneau (attaquer le campement adverse) ; (c) réduire `rayonRalliement` data-driven.

## 7. État du dépôt — ARRÊT POUR APPROBATION (3e)

Commit **local** (non poussé, non déployé) : relaxation + tests + bancs JSON + ce rapport. ⚠ CI/Deploy : non applicable (rien de poussé). Les commits `23c4a07` (K-GUERRE), `704ec5b` (PRESSION) et celui-ci restent en attente d'un arbitrage Erik global sur le chapitre « guerres vivantes vs gate ».

**Fin de session — remise de la main.** Pièges respectés : cache vitest racine purgé, bancs via config dédiée, AVANT copiés avant modification, aucun secret commis.
