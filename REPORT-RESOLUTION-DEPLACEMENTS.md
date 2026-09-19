# REPORT-RESOLUTION-DEPLACEMENTS — Colon fonde là où le guerrier part · message d'échange nommé · historique d'événements

**Statut : terminé, en attente de validation d'Erik (18/09).** Exécution du handoff `HANDOFF-RESOLUTION-DEPLACEMENTS.md` (trois constats d'Erik du 18/09). Baseline respectée : suite verte, typecheck 4/4, `schemaVersion` 25 (inchangée — zéro migration), zéro diff 3D.

## 1. Bug 1 — le colon fonde sur la case que le guerrier quitte ✅

**Diagnostic (confirmé par la trace et la reproduction)** : dans `executeMoveOrder` (`packages/rules/src/turn.ts`), le pas FINAL vers une case portant des amies était refusé (« destination-refusee », R-159 rév. B) dès qu'une amie s'y trouvait **au moment de l'entrée**. Comme les unités sont traitées en `unitId` croissant (R-41), le colon traité AVANT le guerrier voyait la case encore occupée → chemin arrêté → terme du chemin non atteint → action finale de fondation annulée (vérification `terme non atteint` en tête de Phase A). D'où le comportement intermittent d'Erik : tout dépendait de quel `unitId` était traité d'abord.

**Fix (arbitrages d'Erik en session) — R-159 rév. C** :
- **Fix minimal (choisi)** : l'entrée est autorisée quand **toutes** les amies présentes programment de quitter la case ce tour (ordre Move/MultiStep actif dont le premier pas est ailleurs que la case de l'entrant) — cohabitation transitoire de Phase A, décision de trace `entree-cohabitation-transitoire`.
- **L'échange de cases reste interdit** : si l'amie part vers la case de l'entrant (premier pas = case d'origine de l'entrant), le refus s'applique comme avant.
- **Option B (choisie)** : si un départ programmé échoue finalement, la cohabitation ami/ami de fin de tour est résolue par la dispersion existante (R-179, Phase E — l'amie bloquée est éjectée vers une case libre adjacente) et la fondation est **ANNULÉE** si une amie cohabite encore à l'arrivée (`processFoundCity`, décision de trace `fondation-annulee-cohabitation`) ; le colon cohabite et fondera au tour suivant.
- Le mouvement ne s'annule donc plus JAMAIS pour la seule raison « case amie qui part » ; seule la fondation obéit à l'option B.

**Tests** (`packages/rules/tests/resolution-deplacements.test.ts`) : reproduction exacte d'Erik (guerrier part → ville fondée, colon consommé), guerrier reste → refus R-159 rév. B inchangé, départ qui échoue → cohabitation + fondation annulée (option B, décision tracée), échange de cases → refusé au moteur. Suite règles complète : **868 tests verts**.

## 2. Bug 2 — l'échange nomme la cause ✅

Le refus moteur est inchangé (correct). Détection déterministe **côté client** dans `unexecutedOrders` (`apps/web/src/lib/feedback.ts`) : ordre Move de 1 case non exécuté + une autre unité amie dont l'ordre Move de 1 case vise la case de la première, aucune des deux n'ayant bougé → message **« Deux unités ne peuvent pas interchanger de position »** au lieu du générique « chemin bloqué ou invalide ». Tests dédiés (`apps/web/tests/resolution-deplacements.test.ts`), capture e2e `dev-logs/captures-resolution-deplacements/02-echange-message-tour1.png` (toasts + historique, échange programmé depuis l'UI).

## 3. Historique d'événements + Course à l'espace conditionnelle ✅

- **Historique persistant** (`apps/web/src/lib/eventHistory.ts` + `apps/web/src/components/Historique.svelte`) : tous les toasts affichés (événements de résolution via le playback — bonus de hutte compris —, refus d'ordre, avertissements du conseiller) alimentent un historique chronologique plafonné (150 entrées FIFO), affiché dans le menu de droite au-dessus du Journal (style journal, plus récents en tête, horodatage « Tour N »). Zéro gameplay : pure présentation. Une partie = un historique (reset au montage de `Game.svelte`).
- **Course à l'espace** : la section « Vaisseau spatial (R-124) » n'apparaît plus systématiquement — condition data-driven `SHIP_COMPONENTS.some(c => c.built)` : apparition à la **première complétion** d'un composant du vaisseau (bâtiments des villes, source unique moteur).

## 4. Vérification

- Tests : **868 règles + 81 serveur + 312 web = 1261 verts** ; typecheck 4/4 (0 erreur) ; `schemaVersion` 25 inchangée ; zéro diff 3D.
- E2E sur le vrai jeu (wrangler dev + UI navigateur, partie solo **5PYTSY**, ordres soumis via WS même joueur, UI ouverte) :
  - **Scénario exact d'Erik** (tour 1) : guerrier `u2` programmé vers (17,10), colon `u1` MultiStep vers (18,10) + fondation → **ville `c1` fondée en (18,10), capitale**, colon consommé — capture `03-erik-fondation-tour2.png` (l'historique affiche « Ville c1 fondée en (18,10) par p1 — capitale ! ») ;
  - **Échange de cases** (partie solo **S352YG**, ordres programmés à la souris dans l'UI, tour 0 → tour 1) : refus des deux ordres, toasts « Deux unités ne peuvent pas interchanger de position », historique alimenté — capture `02-echange-message-tour1.png` ;
  - **Menu de droite tour 0** : Historique présent, section Course à l'espace ABSENTE — capture `01-menu-droite-tour0.png`. Apparition après premier bâtiment du vaisseau : couverte par la condition data-driven (non jouée en e2e — Vol spatial hors de portée d'une session ; logique d'une ligne, testée implicitement par les dérivés `SHIP_COMPONENTS` existants).
- Pilote e2e conservé : `dev-logs/driver-resolution-deplacements.mjs`.

## 5. Décisions à retenir

- Arbitrages d'Erik du 18/09 : **option B** (fondation annulée si cohabitée) + **fix minimal** (entrée only si toutes les amies partent ailleurs).
- Règle archivée : **R-159 rév. C** (RULES.md) — cohabitation transitoire de départ, échange toujours interdit, option B pour la fondation.
- Découvertes : la cohabitation ami/ami de fin de tour est déjà résolue par la dispersion R-179 (aucun nouveau mécanisme) ; l'échange de cases passe désormais par l'exception « amies partent » SANS l'ouvrir (le premier pas de l'amie vers la case de l'entrant maintient le refus).
- Fin de session : commit/push sur demande explicite d'Erik uniquement.
