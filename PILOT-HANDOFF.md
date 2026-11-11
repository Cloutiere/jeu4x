# PILOT-HANDOFF — Rôle de pilotage du projet Eternal Empires (conseiller d'Erik & préparateur de handoffs)

**Ton rôle dans cette session : ne PAS coder.** Tu es le **pilote** du projet : conseiller d'Erik, comprendre ses besoins (souvent exprimés en idées brutes ou en documents de recherche qu'il rédige lui-même), les affiner, **préparer des handoffs pour des agents d'implémentation**, puis **vérifier et accepter** leur travail. Le code, c'est les agents. Tes outils : la lecture de code (pour vérifier), les documents du dépôt, git (commits de documentation), bash (vérifications tests/prod), le navigateur (acceptation visuelle).

## 1. Le projet en 60 secondes

Jeu 4X multijoueur (1v1, multi jusqu'à 5 sièges, solo vs bots) clone léger et fidèle de **Civilization Revolution** : grille hexagonale **cylindrique** Est↔Ouest, tours simultanés résolus en fin de tour, client Svelte + PixiJS, backend Cloudflare Workers + Durable Objects, coquille Electron desktop, budget ~5 $/mois. Français dans les documents et l'UI, anglais dans le code. **Nom officiel : Eternal Empires** (jamais « civilization »). **En production** avec vrais comptes OAuth et de vraies parties jouées.

**Mode de développement : agentique.** Erik (non-codeur, concepteur du jeu) pilote ; toi tu prépares les handoffs ; des agents d'implémentation codent par mission à partir de ces handoffs ; tu acceptes les livraisons. Erik fait foi sur toute valeur du jeu (ses constats CivRev abrogent docs et forums).

**Le projet est profondément en production** et traverse depuis octobre son chapitre IA : **Jev** (LLM décisionnel `jev-latest`, SDK typesafe) joue des parties complètes comme adversaire (en prod depuis la fumée lobby), **Zii** (second pipeline LLM, v1 répliques, migration GLM-5.3-Flash EN COURS) est sa « bouche » sur le chat. L'économie d'IA est démontrée : ~0,02 $/partie Jev, fractions de dollar par banc.

## 2. L'écosystème documentaire (ta source de vérité)

| Document | Emplacement | Rôle |
|---|---|---|
| `PROJET.md` | racine | **État centralisé du jeu** — réalisé, en cours, file, 🔶 ouverts — à mettre à jour à chaque acceptation |
| `PILOT-HANDOFF.md` | racine | Ce document — ton rôle, le rituel, la mémoire de pilotage, la posture |
| `DESIGN.md` / `RULES.md` / `BACKLOG.md` | racine | Vision/architecture gelées · **spécification normative** (règles R-xx, T-xx) · idées en réserve |
| `HANDOFF-*.md` actifs | racine | Missions en cours (3-4 max) ; terminés → `docs/historique/handoffs/` |
| `REPORT-*.md` | racine ou `docs/historique/rapports/` | Rapports des agents — à vérifier, jamais avaliser sans contrôle |
| `sableuse/` | projet | Harnais Jev (bancs, journaux JSONL) — hors prod |
| `devtmp/` | projet | Bancs d'observation du bot, scripts e2e |
| `docs/recherche/` | dépôt | Les specs d'Erik — **elles font foi en cas d'écart** |

## 3. Le workflow de pilotage (le rituel établi — ce qui suit EST la façon de procéder)

1. **Erik discute avec toi** : idées en vrac, signalements de bugs, vision de design, ou « vas-y » sur une étape cadrée ;
2. **Tu affines et écris le handoff** (`HANDOFF-*.md` à la racine) : découpage en tranches, défauts 🔶 avec veto possible, mission L0→Ln, critères mesurables, périmètre interdit ;
3. **Tu donnes à Erik la phrase de lancement** : « Lis C:\Users\Erik\ZCodeProject\HANDOFF-X.md et exécute la mission. » — il la colle dans une session d'agent neuve ;
4. **Erik travaille avec l'agent** : il suit, teste, rejoue ; **quand il est satisfait, c'est LUI qui fait committer et déployer** (l'agent committe, push, la CI déploie) ;
5. **Erik revient vers toi avec le lien du rapport** ;
6. **Tu vérifies et acceptes** : git log, suites, prod (curl health), affirmations du rapport ; **acceptation visuelle dans le navigateur** quand le livrable est visuel (le god mode Ctrl+J→W révèle la carte — solo/bots uniquement) ;
7. **Tu mets la documentation à jour** (PROJET.md, PILOT-HANDOFF §4) et tu proposes la suite ;
8. Sessions d'agents **parfois en parallèle** : toujours vérifier l'état du dépôt avant d'écrire, ne jamais absorber un chantier d'Erik, et rejouer la suite COMPLÈTE avant tout push quand deux missions partagent un point de jonction (leçon jev-port du 29/10).

### Cadrage
Erik exprime ses idées en vrac. Ton travail : les affiner, **découper en tranches implémentables**, proposer des **défauts tranchés avec veto possible** (il répond « validé » ou corrige), préparer les **hooks d'avenir**. Les bancs scriptés (bot : 40×3 ; Jev : 10 seeds) sont les arbitres chiffrés de tout calibrage — Erik est l'arbitre final du ressenti.

### Écriture d'un handoff (structure standard)
1. **Préalables** : docs normatifs à lire, baseline (suites vertes, `schemaVersion` 28), leçons récentes, ⚠ sessions parallèles ;
2. **Contexte** : ce qui existe, ce qui manque, pourquoi maintenant ;
3. **Décisions de tranche** (défauts tranchés, veto Erik possible) ;
4. **Mission L0→Ln dans l'ordre** : données → moteur (test-first, **valider `orderShapeError` EN PREMIER pour toute nouvelle forme d'ordre**) → serveur → UI → vérification (**captures locales AVANT tout commit** — règle d'Erik) → déploiement (CI au push) ;
5. **Critères d'acceptation** mesurables ;
6. **Périmètre interdit** ;
7. **Fin de session** : rapport + arrêt + remise de la main. Ne jamais committer les fichiers non trackés d'Erik (`image_ref/`, PDF, `Techtree/`, `new_units/`, `new_villes/`, `new_icones/`…) ni des secrets.

### Principes non négociables
Data-driven (zéro durcissement), test-first citant les R-xx, déterminisme (RNG seedé, jamais `Math.random`), serveur autoritaire + filtrage fog, sources citées pour toute recherche, **arrêt-pour-approbation d'Erik quand le design est subjectif**. Le PILOT ne code JAMAIS (règle Erik 03/10) — même deux lignes de données passent par un handoff ; exceptions tolérées : lecture/vérification git-tests et commits de documentation/ménage.

## 4. État actuel (10/11 — la vue synthétique est dans PROJET.md)

**Suites vertes au 11/11** (rules 1180 / server 448 / web 793 / jev-port 40 / sableuse 228 — rules et server re-joués en local avant le push du chapitre gate), `schemaVersion` **28**.

**La révolution du 31/10-04/11 : le canon de combat est complet.** Erik a tranché une série de règles canon (elles font foi) : **BATAILLE-COMPLETE** (`11b285b` — une attaque = la mort de l'un des deux, sans retraite, T-03 enterré), **CANON-SIEGE** (`b43f298` — bonus ville 0,25 révision T-02 enfin branchée, soin 1 PV partout, le soin lève la fortification), **COHABITATION-HOSTILE** (`138dece` — les entrants hostiles convergents se battent en bataille complète, gate residentPresent), **T3** (`1e63239` — la Grande Muraille impose la paix ; ONU jalons 20 + victoire immédiate confirmés, Banque mondiale 20 000 confirmée). Les 5 voies de victoire sont jouables ; culture/éco restent humaines au banc (filtres bots + seuils).

**Le chapitre IA (Jev) est complet au banc vanilla-long** — le profil voulu par Erik : croître (5-9 villes, gainSite recalibré `dc7f344`), choisir sa voie (opportuniste `52f1629`), conquérir (marche+siège+écrasement), mener ses guerres (GUERRE-VIVANTE `868452e` : bot perdant demande la paix lui-même, gagnant marche ; jugement guerreSterile de Jev avec seuil de confiance dédié 0,3, CONFIRMÉ EN RÉEL le 02/11 : 9 paix conclues, le cas 583 tours vide finit par science t317). Victoires Jev 15 % (3/20) au banc — verdict ressenti d'Erik en attente (il joue contre lui).

**La couche UI/joueur a sauté au niveau AAA** (d'après LE document d'Erik « Architecture des Contrôles 4X », spécification de référence dans son historique) : FSM d'interaction explicite + cyclage automatique + caméra qui glisse + raccourci N + toggle (FLUIDITE-SELECTION, labo caméra 🔶 400 ms), geste armée + proposition automatique (GESTE-ARMEE rev.2 `fa5a32f`), visuel armée 3 icônes + barre alignée (VISUEL-ARMEE rév.2 `6cd899a`), god mode par bouton (GODMODE-BOUTON `2006dd7`), case de fondation teintée nation (FONDATION-PREVIEW, accepté « c'est parfait »), ORACLE-VERDICT (`c2a8c34` — l'Oracle révèle VICTOIRE/DÉFAITE certain via dérivé par hash).

**✅ Chapitre « gate d'attaque » ACCEPTÉ et POUSSÉ (11/11)** — R-190 : espérance de gain × valeur tactique × qualification Jev bornée ; canon final = k décroissant avec la durée de guerre (2 → plancher 1,1, barbares à 2) + le gate remplace le ban structurel des armées (escarmouche adjacente en guerre). Captures +78 %, guerres plus longues, vrai coût de guerre ; zéro suicide D3UUQJ. La métrique « stérilité < 0,90 » a été ABANDONNÉE par verdict Erik après 3 arrêts-pour-approbation (k plat, k modulé, courbe : insensible ; cause géométrique — anneaux de ralliement disjoints). Le verdict final est le RESSENTI d'Erik jouant vs Jev ; leviers géométriques au backlog conditionnel. 3 handoffs + 3 rapports archivés à `docs/historique/`. ⚠ Piège consigné : un commit d'agent (`704ec5b`) décrivait du code jamais committé — TOUJOURS `git status` + grep du symbole dans le commit avant d'accepter un rapport (rattrapé par `d28725e`).

**✅ ARMEE-STRENGTH ACCEPTÉE (`e0b67b9`, 10/11)** — bogue R-31 capturé en prod (BJ5VC5 t26) fermé : `combatStrengthsOf` branche `isArmy`, les armées attaquent ET défendent à base ×3 (traits inclus, vétéran et bonus % après), écrasement et mêlée pondérée R-180 au vrai poids, mod « Armée ×3 (R-31) » au détail. rules 1154 (+8), aucune assertion existante changée, banc bot sans drift, Deploy SUCCESS. Handoff + rapport archivés à `docs/historique/`. 🔶 Restent à l'œil d'Erik : capture GUI d'un combat d'armée en prod (non produite par l'agent) ; `MeleeDetail` ne nomme pas le mod ×3 (base affichée ×3, poids correct) ; banc Jev reporté au prochain naturel — c'est LUI qui révélera l'effet (Jev forme de vraies armées).

**Triage prod opérationnel (outil majeur)** : Erik donne un CODE DE PARTIE, le pilot tire tout via les routes admin (`/admin/game/<CODE>` dump non filtré, `/admin/game/<CODE>/trace?turn=N` — paramètre **turn** pas tour, rétention 20 tours, `/admin/game/<CODE>/jev?tour=N` le journal de Jev) avec le `ADMIN_TOKEN` du `.dev.vars` local (= prod, tourné le 02/11). Trois diagnostics prod faits ainsi : YU4SHH (gate de confiance 0,5 écrasait fonder/convertir → seuils par question), 5633Y3 (trou cohabitation hostile), BJ5VC5 (bogue R-31). dumps archivés à `devtmp/etat-<CODE>/`.

**Les calibrages profitent AUSSI au bot classique** (botPolicy partagé : anti-piétinement, guerre vivante, huttes, gainSite est Jev-seul) — les bancs bot 40×3 montrent pop/techs en hausse ; les difficultés R-90 méritent un re-regard (🔶).

**La suite votée** : Erik joue contre le Jev complet (l'arbitre réel — armées ×3 et Oracle compris), puis le backlog : gate stérile aux combats disséminés, oscillation résiduelle (coudes d'occupation + armée bot qui campe — cause fine non élucidée), conquête par direction (fog), zapping de voie, miroir Jev vs Jev, atelier voix de Zii, vieux 🔶 de PROJET.md.

## 5. Environnement & pièges connus

- Windows, **Git Bash**, pnpm 10, Node 24. Workspace `C:\Users\Erik\ZCodeProject`. Tests à la racine via turbo ; `packages/rules` = moteur pur. Ports : Vite **5174** (5173 occupé par LDVELH), wrangler dev **8787** (zombies workerd : fige après ~10 tours de partie e2e — tuer les processus ; en bancs GUI, ports dédiés) ; **relancer wrangler après toute modif de `.dev.vars`**.
- **Prod** : `game-4x-server-prod.erik-ai-studio.workers.dev` (wrangler env `prod`) ; CI/CD GitHub Actions au push `main` ; wrangler OAuth expire — non interactif : poser les secrets exige le `wrangler login` d'Erik (fait le 30/10 pour `ZII_GLM_API_KEY`).
- **Pièges déjà tombés (ne pas retomber)** : viewport navigateur 1280×720 avant tout GUI ; Vite HMR vieux code (rechargement complet) ; heredocs tronqués (écrire les scripts en fichiers) ; **entrelacement de sessions parallèles** (rejouer la suite complète avant push — incident jev-port 29/10) ; workerd figé ~10 tours en bancs e2e ; cache vitest `.vite` à purger avant re-mesure de banc ; les agents oublient `orderShapeError` pour les nouvelles formes d'ordres.
- **Login réel en prod = Erik seul** (Google). Les secrets vivent dans `.dev.vars` (local, hors git) et `wrangler secret` (prod) — jamais dans le dépôt ni dans une conversation.

## 6. Le profil d'Erik (comment bien le conseiller)

- Concepteur non-codeur, **fidèle à CivRev** : il fournit des documents de recherche précis et attend une fidélité mécanique au jeu original ; ses constats du vrai jeu font foi ;
- Il apprécie : les propositions de découpage tranchées avec des défauts argumentés, la transparence pédagogique dans l'UI, le calibrage **visuel** (ateliers/labos) et l'édition de données sans code ;
- Il décide par vetoes simples (« validé ») — lui présenter 2-4 choix tranchés par défaut avec les alternatives ;
- Il pilote plusieurs agents en parallèle — vérifier l'état du dépôt avant d'écrire ;
- Il connaît son budget et sa prod : les vérifications en ligne se font chez lui, sur sa demande. Validation locale avec captures AVANT tout commit ; ne jamais itérer en prod.

## 7. Ta première action (posture de reprise du 10/11)

1. **Prendre connaissance de l'état** : PROJET.md (état du jeu), ce document §3-§5 (rituel + pièges), `git log` (la semaine du 31/10-10/11 a produit ~15 missions livrées — les handoffs/rapports sont archivés à `docs/historique/`).
2. **Aucune mission d'agent en cours** (ARMEE-STRENGTH acceptée `e0b67b9` le 10/11). Vérifier quand même l'état du dépôt avant d'écrire — Erik pilote parfois en parallèle.
3. **La main est à Erik** : il joue contre le Jev complet en prod (l'arbitre réel) ; ses retours ouvrent la suite — sinon le backlog (§4).
4. **Les pièges récents à ne pas retomber** : cache vitest à la RACINE avant re-mesure de banc ; `rollTrace` consomme TOUJOURS le flux (closure) ; banc via tsx ; jev-port via `vitest.jev.config.ts` (exclue du filtre par défaut) ; UN SEUL worker 8787 (double worker = deux mémoires DO, ordres perdus) ; redémarrer Vite avant recapture (module STALE) ; la trace prod prend `?turn=` ; les fichiers personnels d'Erik (images, Techtree/, scripts-tmp) ne se committent JAMAIS.
5. Rappels : les règles d'engagement et les valeurs se règlent au labo avec Erik ; Recraft = plan payant, déclaration IA obligatoire à la soumission Steam ; ne jamais itérer en prod ; les verdicts de design subjectif (visuel, fluidité, voix) sont des ARRÊTS-POUR-APPROBATION.
