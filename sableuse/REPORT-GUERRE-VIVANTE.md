# REPORT-GUERRE-VIVANTE — Des guerres qui se battent ou se terminent

**Livré (commit de ce push).** HANDOFF-GUERRE-VIVANTE (Erik 02/11). Les trois volets votés : D-A conduite de guerre du bot (jugement de guerre stérile), D-B Jev en guerre modifie son jeu, D-C symétrie/anti-boucle. Un diagnostic L1 a PRÉCÉDÉ le code et a produit deux découvertes chiffrées — dont un bug harnais qui faussait TOUTE la lecture des guerres.

## 1. L1 — Diagnostic (journaux de `bancs/joueur-croissance-2026-11-02`, gratuit)

**La boucle paix morte était TRIPLE** (575 `PeaceRefused` en partie 1, un par tour de t45 à t332) :

1. **La question paix de Jev était VERROUILLÉE par sa propre finPartie** : dès t13 le LLM choisit `viserMaVictoire:domination` (319 fois) → mode domination + rapport ≥ 1 → la règle JEV-CALIBRAGE-OFFENSIF D-C (« paix interdite en domination ») ferme la question paix pour TOUTE la partie — Jev ne propose la paix qu'une fois (t13) ;
2. **Les sondes `ProposePeace` du plan de base du SIÈGE Jev** (artefact botPolicy — Jev ne les a jamais décidées) étaient traitées par le harnais avec `accepte=false` codé en dur → ~288 refus attribués à Jev, chaque tour ;
3. **Les propositions du bot** (canon PAIX-RYTHME, chaque tour après `dureeMin`) exigent un choix « paix » de Jev LE MÊME tour — impossible, la question étant verrouillée (1).

**L'armée du bot campait** : campagne active et objectifs `rallier` corrects dès t12, mais 0 progression nette des membres en 300+ tours (oscillation locale 27-29,20-23), `auRayon=0` à jamais → `assautAutorise=false` → 0 bataille. Cause fine non élucidée (recalcul de chemin / brouillon garnison / parité hex) — consignée, NON contournée par une mécanique nouvelle (conformément au cadrage).

**Bug harnais découvert au passage** : `dureeEtBatailles` (sableuse/joueur.mjs + port TS) lisait `warsDepuis` avec la clé `p1|p2` (join pipe) alors que le moteur écrit `p1,p2` (`cleDepuis`) → **`toursDeGuerre = 0` pour tout ennemi, tout tour**. Corrigé (miroir `cleDepuis`).

## 2. L2 — Implémentation (tests FIRST)

- **D-A bot** (`botPolicy.ts`, data `bot.json guerreSterile {tours:30, cooldown:10}`) : `guerreSterileDe` (enGuerre ≥ 30 tours, 0 bataille) — **perdant (rapport < 1)** → `ProposePeace` LUI-MÊME, CADENCÉ (durée % 10 — déterministe, zéro état caché) ; **gagnant** → les membres de l'armée passent en marche DIRECTE (`offensiver` existant) au lieu de camper sur l'anneau — la porte d'assaut juge au rayon comme toujours. Le videTerme canon (proposition chaque tour) est suspendu pour les guerres stériles — plus jamais 320 tours de propositions-refusées chaque tour.
- **D-B Jev** (`joueur.mjs` + port TS bit-à-bit, data `seuils.guerreSterileTours 30 / guerrePoidsMilitaire / confianceGuerreSterile 0.3`, questions v10 + copie serveur) :
  (a) poids militaires en guerre — les combattantes passent en tête de `productionCapitale` (canon v2 : data-driven, en paix ordre inchangé) ;
  (b) `protegerCapitale` ouverte par la GUERRE elle-même (pas seulement les menaces rayon 5) — Fortify des combattantes non fortifiées près de la capitale ;
  (c) question `guerreSterile` (gate 30 tours / 0 bataille, révision cadencée `opportuniteCooldown` 15) — choix `paix` (intention diplomatie canon, la grille du bot décide) / `assauts` (memo.finPartie = pousserCapitale + poussée militaire, miroir exact du bloc finPartie) / `continuer` (persisté) ; formes invalides ignorées ; le choix « paix » persisté est réémis chaque tour (boucle BORNÉE : la grille du bot accepte à dureeMin).
- **D-C anti-boucle** : harnais — les sondes du siège Jev sont ignorées (fini les refus fantômes) ; la paix du bot est acceptée si le jugement persisté de Jev est « paix » ; cadence bot côté `botPolicy` ; garde test : `delaiRedeclaration` verrouille la re-déclaration immédiate (canon intact).
- Tests : `sableuse/tests/guerre-vivante.test.mjs` 16 verts + `apps/server/tests/bot-guerre-vivante.test.ts` 8 verts + 4 tests croisés jev-port (40). Suites : rules **1129** / server **409** (1 flocon workerd chat-socle re-vert) / sableuse **219** / jev-port **40** / web **712** / svelte-check 0 / typechecks verts. schemaVersion **28** inchangée.

## 3. L3 — Banc UNIQUE `bancs/joueur-guerre-vivante-2026-11-02` (vanilla, plafond 600, les 5 seeds croissance)

**0,6997 $ ≤ 1,00 $ — 4/5 victoires Jev (science t296/t387/t424 + razedCapital t47 barbares, canon intact), partie 2 indécise au plafond ⚠ (voir §4), 58 erreurs API partie 4 (400 max_tokens_exceeded — repli v1, le piège connu).**

| partie | seed | fin | guerres (début, durée) | combats inter-nations | tours de guerre SANS combat | paix acceptées | prod militaire Jev guerre/paix |
|---|---|---|---|---|---|---|---|
| 1 | 3538506724 | **science t424** | **11 guerres** (écrasement mécanique ×10, motif au transcript) | 4 | 398 | **11** | 654/35 |
| 2 | 3947827986 | indécise ⚠ | 1 guerre (583 tours) | 0 | 583 ⚠ | 0 | 668/11 |
| 3 | 2121991107 | razedCapital t47 (barbares, canon) | 1 (37) | 0 | 37 | 0 | 51/9 |
| 4 | 3802591813 | **science t387** | 1 (377) | **129** | 303 | 0 | 1049/9 |
| 5 | 214915776 | **science t296** | 1 (286) | **142** | 191 | 0 | 718/9 |

Expansion **6,0 fondations/partie** (vs 5,4 — non-régression ✓). Production militaire Jev en guerre **1,86 unités/tour vs 0,99 en paix** (D-B(a) visible). Avant/après (mème mètre sur les journaux croissance) : combats inter-nations **0 → 275** (parties 4+5), guerres qui FINISSENT **0 → 11** (partie 1), refus de paix 575 → 447 (partie 4/5 : le bot perdant propose cadencé, Jev maintient la guerre COMBATTOYE — la guerre vit, elle n'est plus muette).

## 4. La cause chiffrée restante (fix livré, prouvé en tests, PAS de re-banc — §4)

**Partie 2 (583 tours sans combat, 0 paix)** : le LLM a choisi `paix:p2` **512 fois** (confidence mesurée 0,35-0,48) — mais la gate de confiance v3 (`decisionMin` 0,5) a écrasé CHAQUE choix : le jugement voté était structurellement muet. **Fix livré dans la même session** : `seuils.confianceGuerreSterile = 0,3` (canon v2 « chaque question porte son propre seuil ») + test de traduction sous-confiante (16/16). Sans re-banc (discipline §4 — le correctif est prouvé en tests, précédent D-B bis du banc stratege). Partie 5 (3 choix à 0,35+) aurait été couverte ; un choix à 0,28 le serait encore moins — consigné.

Résiduels consignés : (a) l'oscillation de l'armée bot (§1) — la marche directe stérile-gagnant passe par le même canal de chemin, parties 4/5 montrent 129/142 échanges mais 303/191 tours encore sans combat ; (b) partie 3 : raze barbare = canon confirmé INTACT ; (c) les 58 erreurs 400 max_tokens (piège connu glm) — repli v1, partie malgré tout gagnante.

## 5. Verdict demandé à Erik

1. **Les guerres VIVENT** : 11 guerres avec paix conclue (partie 1), 271 échanges de combat (parties 4+5, 0 avant), production militaire en guerre ×1,9, le cycle guerre→paix→re-déclaration mécanique tourne — le profil complet (croître, choisir, conquérir, mener ses guerres) est à l'œil ;
2. **Le critère strict « zéro guerre > 30 tours sans bataille » n'est PAS atteint** (1512 tours cumulés sans combat) — cause principale chiffrée et FIXÉE (seuil de confiance, §4) ; le résiduel est l'oscillation de marche du bot (§1) — à cadrer si tu veux la trancher ;
3. Non-régression : 4/5 finies, victoires Jev, expansion 6,0 ≥ 4 — mais partie 2 indécise au plafond (vs science t369 au banc croissance) : la même gate muette a tenu Jev 583 tours dans une guerre vide — le fix seuil s'applique exactement à ce cas.

Fin de session : rapport + arrêt + remise de la main. Reste au backlog : conquête par direction (fog), zapping de voie, miroir JvJ, atelier voix de Zii, vieux 🔶 — et surtout : Erik joue contre le Jev complet.
