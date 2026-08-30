# HANDOFF PHASE 5 — Durcissement, polish UX & mise en production

Tu reprends le pilotage. **Préalables :** lire `DESIGN.md`, `RULES.md`, `HANDOFF.md` §4 (conventions en vigueur), le rapport `REPORT-PHASE3.md`, et vérifier la baseline : `pnpm test` + `pnpm typecheck` verts à la racine.

**Nouveau depuis la Phase 3 (contexte clé) :**
- Le jeu est **déployé en production** : `https://game-4x-server-prod.erik-ai-studio.workers.dev` (Worker + Static Assets même origine, OAuth Google/Discord **réels** — secrets posés via `wrangler secret put --env prod`, login stub coupé). `wrangler whoami` est déjà authentifié sur le compte d'Erik ; **le déploiement est maintenant autorisé et attendu** en fin de phase.
- Une **première partie 1v1 en ligne a été jouée et terminée** entre deux comptes réels (victoire + défaite affichées) — Phase 4 close. Les retours de polish d'Erik ci-dessous viennent de cette vraie partie.
- `packages/rules` est de nouveau modifiable (il était gelé en Phase 3).

## Mission — livrables dans l'ordre

### L0 — Fortification (règle nouvelle R-33 — moteur d'abord, test-first)

`RULES.md` §4 R-33 + §7.4 + T-17 (`fortifyDefenseBonus` = 0.25, 🔶) sont **normatifs** :
1. `packages/shared` : type d'ordre `Fortify` ;
2. `packages/rules` : ordre accepté par `processAction` ; l'état fortifié persiste d'un tour à l'autre (non consommé), tout autre ordre l'annule ; `S_def` multiplié par `1 + T-17` en combat (R-52/R-55/R-59-d inclus) ; soins R-71 normaux ; tests (fortifié encaisse moins, annulation par tout autre ordre, repli d'un fortifié suit R-54) ;
3. Schéma : vérifier si `schemaVersion` doit être bumpé (nouvel ordre = données nouvelles, pas de reformat — documenter la décision) ;
4. UI : bouton « Fortifier » / « Ne plus fortifier » au panneau d'unité + marqueur écu sur le sprite fortifié ; `pnpm bot` peut émettre Fortify aléatoirement (parmi ses ordres valides).

**Commit dédié.**

### L1 — Polish UX (retours de la première partie en ligne, 30/08)

1. **Re-clic = désélection** : cliquer l'unité/la ville sélectionnée la désélectionne.
2. **Clic droit = ordre de déplacement** : avec une unité sélectionnée, clic droit sur une case connue praticable construit le chemin vers cette case (pas-à-pas à travers cases connues praticables ; clic droit = annule un brouillon si aucune case cible valable) et le **soumet automatiquement** — le bouton « Valider le déplacement » disparaît (le tracé gauche pas-à-pas reste possible et soumet aussi dès validation implicite : chaque extension re-soumet le brouillon complet).
3. **Unités sans ordre** : au clic « Fin de tour », si des unités du joueur n'ont aucun ordre, dialogue de confirmation listant leurs positions (continuer quand même possible).
4. **Polish reportés de l'acceptation Phase 3** : bouton « Fonder une ville » désactivé (avec info-bulle) si une ville connue est à distance < `T-09` ; case finale du chemin occupée par un allié refusée côté client ; toast « ordre non exécuté » quand le moteur écarte un ordre invalide à la résolution.
5. **Calibration T-15** : croissance de population beaucoup trop rapide observée (pop 2 en 3 tours) — relever `T-15` (proposition : 25) et le noter comme calibration 30/08 dans RULES.md §11.

Tests pour chaque comportement pure ; **commits par groupe cohérent**.

### L2 — Correctifs en attente

- `pnpm bot -- <CODE>` : le `--` est transmis littéralement au script (filtre `args.filter(a => a !== '--')` ou parsing robuste) ; test de régression.
- Vérifier le cycle complet Fortify : fortifier → subir une attaque → bonus visible dans les PV resultants → déplacer (désactive).

### L3 — Observabilité & exploitation

- Documenter (README serveur) : `npx wrangler tail --env prod` (débug live), endpoint admin prod (`Authorization: Bearer $ADMIN_TOKEN`), purge des parties (T-12 DESIGN §4.6 : 30 jours — alarme LobbyDO ou doc manuelle, au choix, documenter la décision).
- Tableau de bord : noter dans le README où lire la consommation (dash Cloudflare → Workers & Pages → métriques) — **validation coût** : après les parties de test, la consommation doit rester ≪ 5 $/mois ; consigner les chiffres relevés dans le rapport.

### L4 — CI/CD (GitHub Actions) — 🔶 partiellement dépendant d'Erik

- Erik doit créer le **repo GitHub** et pousser (`git remote add origin … && git push -u origin main`). Si le repo n'existe pas au moment de L4 : préparer le workflow dans `.github/workflows/deploy.yml` (tests → typecheck → `wrangler deploy --env prod` avec `CLOUDFLARE_API_TOKEN` en secret GitHub) et **documenter les étapes restantes** dans le README — ne pas bloquer.
- L'app étant Workers + assets, **pas de Pages** : le workflow déploie le Worker complet (build web inclus).

### L5 — Mise en production propre

- `pnpm test` + `pnpm typecheck` verts, `wrangler deploy --env prod` final, vérification manuelle en ligne : login Google **et** Discord, création de partie, un tour joué à deux (ou vs bot), fortification visible.
- Mettre à jour les deux README (web + server) si des contrôles/comportements ont changé.

## Critères d'acceptation

1. Toute la liste L1 vérifiée en jeu (local puis prod) ; fortification observée en conditions réelles (bonus visible sur les PV après échange).
2. Suites vertes (moteur enrichi R-33 + T-17), `tsc` propre, zéro warning wrangler.
3. `packages/rules` : chaque règle nouvelle couverte par test citant R-33/T-17.
4. CI/CD : workflow prêt (et vert si le repo existe) ; procédure de déploiement documentée.
5. Coût consigné (capture/mesures dashboard) — cible ≪ 5 $/mois.
6. Déployé en prod et vérifié.

## Périmètre interdit (cette session)

- Pas de génération procédurale (Phase 6), pas de personnalisation visuelle (Phase 4.5), pas d'engagements multi-participants (Phase 7 — sauf le simple **test de durcissement** multi-attaquants documenté au BACKLOG, facultatif ici), pas de nouvelles règles de jeu hors R-33.
- Ne pas modifier `BACKLOG.md` ; `RULES.md`/`DESIGN.md` : annotations « implémenté en Lx » uniquement.

## Fin de session

Rapport habituel (livrables, tests, ambiguïtés + interprétations, état de la prod, coût relevé) puis **arrêt et remise de la main**. Prochaines phases prévues : 4.5 (personnalisation visuelle) et 6 (génération procédurale) — deux décisions d'Erik restent en attente dans `BACKLOG.md` (les 4 points de veto) et seront confirmées avant leurs phases.
