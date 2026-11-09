# REPORT-COHABITATION-HOSTILE — les entrants convergents hostiles se battent (canon CivRev)

**Commit `138dece` poussé sur `main` (09/11).** Mission exécutée d'après `HANDOFF-COHABITATION-HOSTILE.md` (canon Erik 09/11). ⚠ CI/Deploy à vérifier sur GitHub.

## 1. Le cas Erik (5633Y3, tour 22) — reconstitué et verrouillé

Le dump `devtmp/etat-5633Y3/` cité au handoff n'existe plus dans le dépôt — le cas a été
reconstitué à partir de sa description (armée p1 9 PV depuis (4,16), barbare 3 PV depuis
(6,16), convergence sur la case vide (5,16) — miroir aux petites coordonnées du test).

**Cause confirmée par sonde** : les deux entrants convergent, la mêlée de Phase E R-180
s'exécute… mais elle ne fait que **−2 PV au perdant** (armée 9→7 PV, barbare 3 PV INTACT,
`stabilized: false` chez les deux) — exactement l'état capturé en prod. La réforme
BATAILLE-COMPLETE (`11b285b`) a supprimé la cohabitation née d'ATTAQUE mais laissait la
cohabitation née de CONVERGENCE survivre tour après tour.

## 2. La règle livrée (R-176 amendée, D1–D4 respectés)

Dans la mêlée de Phase E existante (`packages/rules/src/turn.ts`, section 2) — extension du
« qui combat qui », aucun événement ni champ nouveau, `schemaVersion` 28 intacte :

- **Gate (D1/D4)** : la bataille complète ne vise que la convergence SANS RÉSIDENT —
  `residentPresent = participants.some(u => !board.moved.has(u.id))`. Si un résident demeure
  (pile amie résiduelle R-159-b, défenseur stabilisé R-181, R-44), l'ancienne mêlée pondérée
  R-180 s'applique **inchangée**. Le report R-178 rév. A (défenseur stabilisé attaqué) reste
  servi AVANT la gate.
- **Bataille complète (D1)** : boucle `performExchange` (le R-51 de la Phase B réutilisé tel
  quel — assauts jusqu'à la mort de l'un, pas de retraite, `CombatExchange` + mort, coup
  fatal R-32 vétéran + `recordCombatVictory` à l'identique du bloc mêlée existant).
- **Ordre déterministe (D1/D2)** : plus faible `unitId` d'abord (discipline R-177), boucle
  jusqu'à ce qu'il ne reste QUE des unités d'un même camp (miroir R-177). Le survivant
  stabilise au marquage final existant.
- **Traçabilité** : décision `cohabitation-hostile` (R-176 rév. COHABITATION-HOSTILE).

## 3. Tests (FIRST — 8 nouveaux, `cohabitation-hostile.test.ts`)

| Test | Verrou |
|---|---|
| Cas Erik reconstitué (30 seeds) | bataille complète : UN mort, le survivant SEUL et stabilisé sur la case |
| Acceptation canon | il existe une issue où l'armée 9 PV tue le barbare et tient (critère 1) |
| Déterminisme | même seed → mêmes vainqueurs/PV/échanges bit à bit |
| Barbares inclus | le chemin passe par `CombatExchange` (R-51), JAMAIS `MeleeResolved` |
| 3 camps mêlés | il ne reste que des unités d'UN camp (critère 2/D2) |
| Verrou zéro cohabitation hostile | 2 scénarios × 20 seeds : aucune case à camps hostiles cohabitants |
| R-44 intact | rendez-vous FormArmy à 3 amies : `ArmyFormed`, zéro combat |
| Non-régression R-176 | entrant vs défenseur stabilisé : cas canon inchangé (Phase B, bataille complète) |

## 4. Tests amendés au nouveau canon (effets de bord — pour verdict Erik)

| Test | Avant | Après |
|---|---|---|
| `engagement.test.ts` « R-178 rév. A #2 : entrée simultanée case vide » | mêlée pondérée immédiate (`MeleeResolved`) | **bataille complète immédiate** (un mort, `CombatExchange`) — c'est LE cas 5633Y3 |

Un seul test amendé. Les autres scénarios R-180 (pile amie + entrant, cohabitation avec
défenseur, mêlée à 2/3 sans entrée du tour, gardien barbare survie mutuelle → capture tour 2)
passent **inchangés** grâce à la gate « résident ». Fix accessoire préexistant :
`barbares.test.ts` appelait `neighbors(hex, width)` (TS2554, tsc bloqué) → `neighborsW`.

## 5. Suites (toutes vertes)

| Suite | Résultat |
|---|---|
| rules (`packages/rules`) | **1138/1138** (1130 baseline + 8) |
| serveur (`apps/server`) | **436/436** |
| jev-port | **40/40** |
| sableuse | **228/228** |
| web | **785/785** |
| svelte-check | 0 erreur (26 warnings préexistants) |
| tsc (rules + server) | propre |

## 6. Bancs bot 40×3 avant/après (150 tours, `banc-bot-td`)

| Difficulté | Villes | Unités | PV mil. | Tours | Δ |
|---|---|---|---|---|---|
| difficile | 2,0 → 1,9 | 85,9 → 84,0 | 241 → 235 | 137 → 142 | unités −2 % |
| facile | 1,9 → 1,9 | 91,5 → 88,0 | 260 → 250 | 123 → 130 | unités −4 % |
| normal | 2,0 → 2,0 | 90,4 → 87,7 | 255 → 246 | 134 → 136 | unités −3 % |

**Verdict : pas de collapse** — villes/population stables, tours dans la norme. La baisse
d'unités (~−3 %) est l'effet ATTENDU de la réforme : les convergences barbares/joueur sont
devenues des batailles, des unités meurent. Drift non notable → **banc Jev reporté** au
prochain banc naturel (consigné, ≤ 0,40 $ à ce moment-là). JSON :
`devtmp/banc-bot-td-{AVANT,APRES}-cohabitation.json`.

## 7. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation d'Erik : la réforme bataille complète
est complète — plus aucun trou où deux ennemis se croisent sans se voir.
