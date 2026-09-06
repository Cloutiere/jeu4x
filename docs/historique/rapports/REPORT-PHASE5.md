# RAPPORT PHASE 5 — Durcissement, polish UX & mise en production

**Date :** 30/08 · **Préalables tenus :** DESIGN.md, RULES.md, HANDOFF.md §4, REPORT-PHASE3.md, HANDOFF-PHASE5.md lus ; baseline verte vérifiée avant toute modification.

---

## 1. Livrables

### L0 — Fortification R-33/T-17 (commit dédié)
- **`packages/shared`** : aucun changement nécessaire — les ordres sont ré-exportés du moteur (source unique).
- **`packages/rules`** (test-first) :
  - ordre `Fortify` dans l'union `Order` ; champ `fortified: boolean` sur `Unit` ;
  - `applyFortifyOrders` (Phase A, avant les mouvements) : Fortify → `fortified = true` + chemin gelé effacé (une unité fortifiée ne bouge pas) ; **tout autre ordre** (Move, Attack, Hold, FoundCity, FormArmy via ses membres) annule ; interprétation déterministe documentée (annulations d'abord, fortification ensuite — impossible via le serveur qui remplace par sujet) ;
  - T-17 (`FORTIFY_DEFENSE_BONUS` = 0.25) appliqué sur `S_def` dans `performExchange` (s'additionne au bonus de terrain, RULES.md §7.4) ; ordre **non consommé** ; soins R-71 normaux ;
  - **`schemaVersion` 2 → 3** : migration v3 additive (`fortified` absent des états v2 → `false`). Décision : bump requis (nouveau champ d'unité manquant dans les états persistés), pas de reformat — documenté dans `MIGRATIONS[3]` et RULES.md §4.
  - Tests `tests/fortify.test.ts` (7) : bonus discriminant à graine fixe, persistance inter-tours, annulation par Move/Hold, chemin gelé effacé, repli R-54 du fortifié, soins, refus ennemi/inconnu. Migrations couvertes (state/forfeit tests mis à jour v3).
- **UI** : bouton « Fortifier » / « Ne plus fortifier » (soumet un Hold — R-33 : tout autre ordre annule), badge 🛡 dans le panneau, **marqueur écu bleu** sur le sprite (rebuild par état, caché par défaut).
- **Bot** : fortifie aléatoirement (15 %) parmi ses ordres valides ; une unité déjà fortifiée est laissée telle quelle.

### L1 — Polish UX (retours de la 1re partie en ligne, commit dédié)
1. **Re-clic = désélection** — sur une unité (sans ville dessous) et sur une ville sélectionnée. Sur une **capitale défendue**, l'alternance déterministe est préservée : unité → ville → désélection (sinon la ville deviendrait inatteignable).
2. **Clic droit = déplacement** — `pathTo` (BFS déterministe à travers les cases connues praticables, voisinage trié (q,r)) + `rightClickAction` : chemin complet construit et **soumis automatiquement** ; cas invalide (inconnue, infranchissable, arrivée alliée) → annule le brouillon. Le tracé gauche pas à pas subsiste et **chaque extension/troncature re-soumet** le chemin complet ; le bouton « Valider le déplacement » a disparu.
3. **Unités sans ordre** — « Fin de tour » ouvre un dialogue listant les unités sans brouillon, sans chemin gelé et non fortifiées (« Finir le tour quand même » possible).
4. **Polish reportés** — « Fonder une ville » désactivé + info-bulle si une ville connue est à distance < T-09 ; étape de chemin sur une case **alliée** refusée côté client (le clic retombe sur la sélection de l'allié — régression détectée en vérif GUI, corrigée et testée) ; case ennemie toujours traçable (entrée = combat R-42, comportement Phase 3) ; **toast « ordre non exécuté »** (`feedback.ts` : compare les ordres soumis aux événements du TurnResult — fondation/attaque/déplacement écartés par le moteur).
5. **Calibration T-15 = 25** (10 → 25) notée « calibration 30/08 » dans RULES.md §11 + test de non-croissance sous le seuil.

Tests web : `tests/phase5.test.ts` (pathTo, rightClickAction, unitsWithoutOrders, unexecutedOrders, re-clic/désélection) + `interaction.test.ts` mis à jour.

### L2 — Correctifs en attente
- **`pnpm bot -- <CODE>`** : le `--` transmis littéralement par pnpm est filtré dans `botArgs.mjs` (module dédié + `botArgs.test.ts`, 4 tests). Vérifié **en live** : le bot a rejoint la partie avec `pnpm bot -- 8ZHSUV`.
- **Cycle complet Fortify** : test GameDO `tests/fortify.test.ts` (ordre accepté → persiste au tour suivant → un Move l'annule ; Fortify sur unité non possédée refusé) + vérification **en conditions réelles** (voir §3).

### L3 — Observabilité & exploitation
README serveur §« Exploitation & observabilité » : `npx wrangler tail --env prod`, endpoint admin prod (`Authorization: Bearer $ADMIN_TOKEN`), **décision purge** (T-12/DESIGN §4.6, 30 jours) : **purge manuelle différée, pas d'automatisme** — volume minuscule, stockage DO négligeable, une alarme de purge LobbyDO ajouterait une réplication inter-DO non triviale ; la voie simple future sera un endpoint admin `DELETE` (Phase 6/7 si demandé). Où lire le coût : dash Cloudflare → Workers & Pages → `game-4x-server-prod` → Metrics (requests, durée CPU, DO duration — hibernation ⇒ ≈ nulle entre messages).

### L4 — CI/CD
`.github/workflows/deploy.yml` : push `main` → pnpm install → build web → tests → typecheck → `wrangler deploy --env prod` (`CLOUDFLARE_API_TOKEN` en secret GitHub). Pas de Pages : le Worker sert le frontend (Static Assets). **Le repo GitHub n'existant pas**, les étapes restantes (côté Erik) sont documentées dans le README serveur : créer le repo, pousser, poser le secret.

### L5 — Mise en production
- `wrangler deploy --env prod` : **zéro warning** (versions `e8386e62` puis finale `3a81508d`, build web inclus).
- Vérifications en ligne (curl) : `/api/health` OK, app servie même origine, `/auth/google` et `/auth/discord` → 302 vers les bons fournisseurs avec `redirect_uri` corrects, stub `/auth/dev` **coupé** (403), admin sans token **401**.
- READMEs web + serveur mis à jour (contrôles, fortification, exploitation, CI/CD).

## 2. Tests

| Suite | Résultat |
|---|---|
| `packages/rules` | **140** verts (132 + 7 fortify + 1 croissance T-15 ; tests migrations mis à jour v3) |
| `apps/server` (DO) | **22** verts (20 + cycle Fortify + refus Fortify ennemi) |
| `apps/web` | **36** verts (31 + Phase 5) |
| `pnpm typecheck` | 0 erreur (1 warning svelte-check préexistant, noté en Phase 3) |
| `pnpm build` + `wrangler deploy --env prod` | OK, zéro warning |

## 3. Vérification manuelle — GUI locale (Vite + wrangler dev + bot)

Partie réelle créée dans le navigateur (login stub Alice), bot rejoint par script :

| Critère L1 | Résultat |
|---|---|
| Sélection + panneau (bouton « Fortifier » présent) | ✅ |
| Re-clic sur l'unité sélectionnée = désélection | ✅ (colon en case simple) |
| Alternance capitale défendue : unité → ville → désélection | ✅ (la ville reste accessible) |
| Clic droit → chemin soumis automatiquement (« Ordre : Déplacement (1 case) », plus de bouton Valider) | ✅ |
| Bouton Fortifier → « Ordre : Fortifier » | ✅ |
| « Fin de tour » → dialogue listant u2 — colon (-3,20), contournement possible | ✅ |
| Après résolution : état fortifié persistant + **écu bleu visible sur le sprite** (capture) | ✅ |
| `pnpm bot -- <CODE>` (avec le `--` littéral) | ✅ (bot rejoint et fortifie) |

### Cycle complet Fortify en conditions réelles (`fortify-e2e.mjs`, conservé comme outil)
Deux clients stub sur `wrangler dev`, marche d'approche des guerriers, Alice fortifie, Bob attaque, **tir discriminant observé** : roll 0.4709 ∈ [0.390, 0.5) — sans T-17 le défenseur aurait perdu 1 PV ; le fortifié n'a **pas** été touché (PV réels = prédiction fortifiée), fortification persistée. Complété par le test DO (annulation par Move) et les tests moteur (repli R-54, soins).

## 4. Ambiguïtés et interprétations choisies

1. **Alternance vs désélection** — « re-clic = désélection » appliqué strictement sauf sur capitale défendue (le re-clic de l'unité y sélectionne la ville) : sinon la ville deviendrait inatteignable à la souris. Cycle déterministe unité → ville → désélection.
2. **« Ne plus fortifier »** = soumission d'un `Hold` (R-33 : tout autre ordre annule) — pas d'ordre « Unfortify » ajouté (le périmètre interdit les nouvelles règles hors R-33).
3. **schemaVersion 3** — bump car champ d'unité absent des états v2 ; migration purement additive, documentée.
4. **Étapes de chemin sur case alliée** — refusées comme étapes mais le clic sélectionne l'allié (comportement Phase 3 préservé, trouvé en vérif GUI).
5. **Case ennemie au clic droit** — admise comme destination (entrée = combat R-42 / capture ville vide R-57) ; les étapes intermédiaires occupées par qui que ce soit sont exclues du BFS.
6. **Toast « ordre non exécuté »** — détection client (ordres soumis vs événements reçus) : Move sans événement Move ni chemin gelé, Attack sans événement Attack, FoundCity sans CityFounded (unité vivante). Unité morte = sort connu, pas de toast.
7. **Purge 30 j** — manuelle différée (décision motivée en L3) ; réversible si Erik préfère l'alarme.
8. **Prédiction T-17 dans l'outil e2e** — ré-implémentation locale du tir §7.4 (premier tir du RNG) plutôt qu'import du moteur (moteur TS non exécutable directement par Node dans ce contexte) ; la graine étant celle de la partie, la boucle répète les attaques jusqu'à un tir discriminant.

## 5. État de la production & coût

- **Déployé** : `https://game-4x-server-prod.erik-ai-studio.workers.dev` (version `3a81508d`), Worker + assets, zéro warning wrangler.
- Vérifié en ligne : health, app, redirections OAuth Google **et** Discord correctes, stub coupé, admin protégé. **En attente d'Erik** : compléter un login OAuth réel (Google + Discord) et un tour joué en ligne — nécessite vos identifiants, non automatisable de mon côté ; la mécanique complète (y compris fortification) est vérifiée en local en conditions réelles.
- **Coût** : non relevable via l'API/CLI (wrangler n'expose pas les métriques d'usage) — à lire dans le dash (Workers & Pages → Metrics) ; chemin documenté en README. L'essai local (3 parties complètes + ~20 tours de marche + échanges) reste à l'échelle du bruit ; la cible ≪ 5 $/mois est confortée par l'hibernation (DO duration ≈ 0 entre messages), mais **le chiffre exact est à consigner par Erik** après capture du dashboard.

## 6. Restes et propositions

1. Erik : repo GitHub + secret `CLOUDFLARE_API_TOKEN` → le workflow passera vert au premier push (procédure README serveur).
2. Erik : rejouer un login Google + Discord en prod et un tour à deux (la Phase 4 l'avait fait ; rien n'a changé côté auth).
3. Backlog (hors périmètre) : endpoint admin `DELETE` pour la purge, suppression du warning svelte-check préexistant.
4. Prochaines phases : 4.5 (personnalisation visuelle) et 6 (génération procédurale) — les 4 points de veto d'Erik restent en attente dans BACKLOG.md.

**Périmètre respecté** : pas de génération procédurale, pas de personnalisation visuelle, pas d'engagements multi-participants, pas de règles hors R-33 ; BACKLOG.md non modifié ; RULES.md/DESIGN.md annotés uniquement.

**Phase 5 terminée — arrêt et remise de la main.**
