# REPORT-TRACE-RESOLUTION — La trace complète de résolution (états par phase + décisions du moteur)

**Chantier d'outil du chapitre 2D (handoff HANDOFF-TRACE-RESOLUTION, mission du 18/09).**
Livraison : un **collecteur de trace passif** dans le moteur (`@game/rules`), **deux vues** dans le
labo `#/labo-combat` (journal lisible enrichi + export JSON), **7 tests** verrouillant le zéro
gameplay et le déterminisme. Aucun commit : attente de la demande explicite d'Erik.

---

## 1. M1 — Le collecteur de trace (moteur, passif)

**Nouveau module `packages/rules/src/trace.ts`** — `TraceCollector` / `createTraceCollector(state)` /
`formaterTrace(trace)`. Passage en **4e paramètre optionnel** de `resolveTurn(state, orders, seed,
trace?)` : absent = **zéro coût** (aucun branchement actif, aucun comportement modifié).

Ce que capture le récolteur, sans jamais influencer la résolution :

- **Snapshots par phase** : entrée ET sortie de chaque phase (A mouvements → B combats/entrées
  retenues → C économie → E mêlée/dispersion/stabilité), pour chaque unité : position, PV, PM,
  stabilité (stabilisée/instable), fortification, propriétaire (+ type pour la lisibilité).
- **Les décisions** (chaque choix moteur avec ses ENTRÉES calculées et la règle citée) :
  | Décision | Règle citée | Valeurs rapportées |
  |---|---|---|
  | Entrée retenue (mouvement et ordre Attack explicite) | R-159 rév. B | qui, case, priorité |
  | Activation des retenues : entre PUIS attaque / entre sans combattre / reste devant | R-159-b | séquence, raison |
  | Renfort : entré / refusé (+ pourquoi — H2 : le tir ne compte pas) | R-159 rév. B | ennemi présent/entré |
  | Destination refusée (avance au maximum) et dispute tronquée | R-159 rév. B | perdant, gagnant, priorités |
  | Ordre d'attaque par case | R-177 | séquence + tirages d'égalité seedés |
  | Choix du défenseur / de la cible de tir sur pile | R-174 / R-159-d | défense, fortification, PV, R-81 de chaque candidate |
  | Coup en passant | R-176a | case visée vs case réelle du défenseur |
  | Échange (S_att/S_def/p par round) + Overrun | R-51 / R-149 | forces effectives, PV après, ratio |
  | Report de mêlée | R-178 rév. A | case, défenseur attaqué |
  | Dispersion : restante (mieux fondée) + partantes (candidates triées, choisie) | R-179-b | candidates, destination |
  | Mêlée pondérée : poids (eff², étau ×tau), Σw, tirage w/Σw, rôles, dégâts | R-180 / T-54/T-55 | tout, valeur par valeur |
  | Capture à la stabilisation, marquage `stabilized` | R-182 / R-173 | listes d'unités |
- **Le compte de seed** : chaque roll consommé (index, valeur, usage étiqueté) — le RNG est
  **enveloppé** (`rngTrace`), pas doublé : la suite des tirages est bit à bit identique, les rolls
  sont **rapportés, jamais ajoutés**.

Sortie : structure `ResolutionTrace` **JSON déterministe** (testé — §3).

## 2. M2 — Les deux vues dans le labo `#/labo-combat`

- **Journal lisible enrichi** (nouvelle section « Trace de résolution ») : la trace rendue en
  texte humain groupé par phase (`formaterTrace`) — snapshots d'entrée/sortie, décisions
  `▸ [R-xx] …`, compte de seed.
- **Export JSON** : boutons **Copier le JSON** et **Télécharger le JSON**
  (`trace-resolution-tourN-seedS.json`) — structuré pour l'analyse par IA (unités, phases,
  décisions, formules, rolls).
- **Interrupteur « Trace activée »** (défaut : activé) — le collecteur ne vit que dans le labo ;
  les sessions de jeu normales (serveur/bot) ne passent jamais le 4e paramètre : non touchées.

### M2bis — Le vrai jeu (demande d'Erik du 18/09 : « je le voulais pour le vrai jeu »)

- **Collecte côté serveur** : `GameDO.finishResolution` crée un récolteur à CHAQUE résolution de
  vraie partie (solo, multijoueur, barbares compris) et **persiste** la trace dans le stockage du
  DO (clé `trace:<tour>`, rétention 20 tours — les isolats d'un DO sont éphémères, une map mémoire
  ne suffit pas — écart constaté et corrigé en e2e). La persistance vit HORS du GameState :
  `schemaVersion` 25 inchangé, aucune fuite vers les clients (anti-triche R-95 : la trace ne sort
  que par l'endpoint admin).
- **Endpoint** `GET /admin/game/:code/trace` (même protection ADMIN_TOKEN que le dump) :
  sans `?turn=` — liste des tours tracés ; avec `?turn=N` — la trace complète (JSON déterministe)
  + son rendu lisible. Vérifié par 3 tests serveur (`tests/trace-resolution.test.ts`) : index après
  résolution, 404 tour inconnu / index vide avant résolution, 401 sans token.
- **Vue debug** : la page `#/debug/<code>` (mode reveal, dev uniquement) affiche les tours tracés,
  le journal lisible de la trace choisie et un bouton « Télécharger le JSON ». e2e réel joué
  (partie solo 67G3UW, tour 2 résolu contre le bot, 40 unités/barbares — capture
  `debug-vrai-jeu-trace-tour2.png`).

## 3. M3 — Vérification

- **Tests** (`packages/rules/tests/trace-resolution.test.ts`, 7 tests) + **3 tests serveur**
  (`apps/server/tests/trace-resolution.test.ts`) — suite complète **851 règles + 308 web + 78
  serveur, tous verts** :
  - **Zéro gameplay bit à bit** : même (état, ordres, seed) résolu avec et sans trace →
    `newState` ET `events` identiques bit à bit, graine sortante égale ;
  - **Déterminisme** : même entrée → même trace JSON bit à bit (deux collecteurs indépendants) ;
  - **Complétude** : phases A/B/C/E toutes présentes avec snapshots d'entrée ET de sortie ;
  - **Mêlée vérifiée valeur par valeur** : eff=1, étau=1, poids=1, Σw=2, w/Σw=0,50, gagnante 0 PV,
    perdante −2 (3→1) ; étau T-54 vérifié (+0,25/allié, 1,25 vs 1,50) ;
  - **JSON valide et auto-consistant** : chaque décision cite sa règle (`R-xx`/`X-xx`).
- **e2e + captures** (`dev-logs/captures-trace-resolution/`) : scénario d'ENGAGEMENT joué au labo
  (seed 20260915 → −1243410425, deux guerriers J1 co-attaquent un guerrier J2 en (3,3)) :
  - `labo-trace-tour2-melea.png` + `labo-trace-tour2-melea-detail.png` : la vue lisible dans le labo ;
  - `trace-lisible-tour2.txt` : le journal enrichi exporté ;
  - `trace-resolution-tour2.json` : l'export JSON correspondant (exactement celui du bouton).
- **Typecheck 4/4**, `schemaVersion` **25 inchangé** (aucune migration — la trace n'est pas
  persistée), **zéro diff 3D et serveur** (`apps/server` et le rendu 3D non touchés).

## 4. Extrait de trace réel annoté (labo, tour 2 — mêlée R-180)

```
▸ [R-180] Mêlée (3,3) — poids u1=1.25 (eff² 1.00, étau ×1.25),          ← 2 alliés J1 : étau T-54 +0,25
          poids u2=1.25 (eff² 1.00, étau ×1.25),
          poids u3=1.00 (eff² 1.00, étau ×1.00) ; Σw=3.50 ;
          tirage 0.328… puis 0.054… → GAGNANTE u1 (w/Σw=0.36) ;        ← les 2 rolls seedés rapportés
          perdante −2 PV, intermédiaires −1 PV                          ← u2 3→1, u3 1→0 : morte
— Rolls consommés (2) —
  #0 = 0.328256 — mêlée tirage gagnant/perdant (R-180)
  #1 = 0.054473 — mêlée tirage gagnant/perdant (R-180)
```

Tour 1 du même scénario : `u1/u2 RETENU devant (3,3) — case défendue visée par ≥ 2 attaquants du
même camp (R-159 rév. B)` → `séquence d'attaque u1 → u2 (R-177)` → deux échanges R-51 →
`mêlée REPORTÉE au tour suivant (R-178 rév. A)` — exactement le comportement codifié
(REPORT-COMBAT-COMPORTEMENTS), désormais lisible décision par décision.

## 4bis. Rév. X-2 abrogée (décision d'Erik du 18/09, constat faite GRÂCE à la trace)

Constat en vraie partie (PANP4U) : `u2` révèle un camp barbare en bougeant → `u41`/`u42` gèlent
leur chemin gelé partout sur la carte (`▸ [X-2] u41 HALTE — un ennemi est devenu visible`,
lu directement dans la trace). Erik tranche : **la halte X-2 est abrogée** — la découverte d'un
ennemi (par l'unité qui marche ou par une autre) n'arrête PLUS aucun chemin ; l'exécution ne
dépend plus que des PM, des blocages et du fog R-161.

- Moteur : `haltedByNewSighting` supprimée (plus de comparaison de vision en début de tour) ;
  le champ `initialVisible` du Board (qui ne servait qu'à la halte) est retiré.
- RULES.md : table X-2 marquée **ABROGÉE (18/09)** ; mentions R-158 et T-49 (garde barbare)
  harmonisées.
- Test révisé : `turn.test.ts` verrouille désormais le NOUVEAU contrat (le colon qui révèle
  l'ennemi en cours de route poursuit jusqu'à épuisement de ses PM). Suite complète verte
  (851 règles + 308 web + 78 serveur), typecheck 4/4.

## 5. Périmètre respecté

- **Zéro gameplay** : verrouillé par test bit à bit ; aucun RNG ajouté, aucun ordre changé.
- Non touchés : le 3D, l'UI de jeu, `apps/server`, `assets-src` (le `git status` y montrait déjà
  avant mission un `.pyc` modifié et des fichiers non suivis — faits d'Erik, non concernés).

## 6. Fin de session

Validation locale complète (captures ci-dessus) AVANT tout commit, règle établie. **Aucun
commit/push** — sur demande explicite d'Erik. Arrêt, remise de la main.
