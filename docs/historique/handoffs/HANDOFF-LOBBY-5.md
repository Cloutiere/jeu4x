# HANDOFF-LOBBY-5 — Écran de création de partie à 5 sièges (humains/bots, couleurs, civs, topographie)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (clone CivRev). Lis `RULES.md`, `HANDOFF.md` §4, `PROJET.md` (état — notamment CARTE-MULTI `d1aa3db`, GUERRIER-4TONS 9f6846b), `REPORT-CARTE-MULTI.md`. Baseline : `schemaVersion` courant, suites vertes, prod 200. **2D uniquement.** Les parties à 5 sièges et le remplissage par bots existent déjà côté serveur (CARTE-MULTI) — cette mission est **l'expérience de création**, pas un chantier moteur.

## 1. Objectif (demande d'Erik du 24/09)

Refondre la **création de partie** autour d'un lobby où il y a **systématiquement 5 joueurs** :

1. Le créateur configure chaque siège : **humain ou bot** ;
2. Le créateur choisit des paramètres de partie — **seulement la topographie pour l'instant** (extensible) ;
3. **Civs** : un toggle global « civilisations aléatoires » ; si désactivé, chaque humain choisit sa civ et le créateur choisit celles des bots ;
4. **Couleurs** : chaque joueur choisit sa couleur ; deux joueurs ne peuvent pas prendre la même.

## 2. Décisions tranchées (réponses d'Erik du 24/09 + défauts pilot, vetoables)

- **D1 — UNE SEULE voie de création : 5 sièges, toujours.** Le duel devient « 2 humains + 3 bots » (configuré par le créateur). Les **cartes préfabriquées/miroir 1v1 quittent l'UI de création** : code conservé, accessibles uniquement au labo `#/progen` ; le chargeur refuse proprement (message clair) si on tente de les utiliser hors parties 1v1 historiques. **Les parties 1v1 existantes restent rejouables/joignables** (migration idempotente, test de non-régression).
- **D2 — Couleur = palette d'accent.** Les couleurs choisissables sont les **7 palettes 4 tons** (Bleu Saphir, Rouge Royal, Vert Émeraude, Jaune d'Or, Violet Améthyste, Cuivre Ardent, Cyan Céleste — source unique `accents.json`). 5 joueurs sur 7 palettes : l'unicité est possible et **garantie par le serveur** (premier arrivé servi ; l'UI grise les palettes prises en temps réel avec le nom du preneur). La civ est un choix indépendant de la couleur.
- **D3 — Civs : toggle global du créateur.** Activé → tirage **seedé** à la création (16 civs, toutes distinctes), révélé à tous au démarrage ; désactivé (défaut) → choix manuel : humains à la jointure, créateur pour les bots.
- **D4 — Paramètres du créateur : la topographie** = la liste des variantes de génération **déjà existantes** du mode libre multi (l'agent inventorie `progen/settings.ts` et expose ce qui existe — archipel etc. — zéro nouveau travail de génération, pas de liste codée en dur). Timer et partie publique/privée : conservés tels quels.
- **D5 — La couleur choisie pilote l'accent EN JEU.** ⚠️ Point d'intégration clé : aujourd'hui les variantes cuites 4 tons sont sélectionnées par l'index du siège (p1..p7 → palette fixe). Désormais, la palette de chaque joueur est **celle qu'il a choisie** : le client doit résoudre joueur → paletteId de la partie → variante cuite (unités, anneaux de ville, barres de PV, zone cultivée, frontière culturelle — tout ce qui consomme l'accent). Côté serveur, la config de partie porte `paletteId` par joueur ; le moteur ne change pas (l'accent reste du rendu).
- **D6 — Hôte et verrouillage.** Le créateur est l'hôte (siège 1). Il peut modifier sa config (types de sièges, couleurs, civs de bots, paramètres) tant que la partie n'est pas démarrée ; **au démarrage tout est verrouillé**. Minimum pour lancer : **1 humain** (tout le reste en bots) — Erik peut rejouer seul. Les humains rejoignent par la liste des parties publiques ou un code de partie ; à la jointure ils prennent un siège libre + couleur libre + civ libre (ou tirée).
- **D7 — Steam à garder en tête (contrainte, pas de travail d'auth).** Le nouveau lobby ne doit rien coder de spécifique à Google : pas d'icône/nom de fournisseur dans le flux de création, libellé neutre « connecté en tant que X », et toute logique d'identité passe par l'abstraction existante (id + displayName du joueur). Consigner dans le rapport ce que la tranche Steam (SDK, ticket) devra brancher ici — mais **aucun changement d'auth dans cette mission**.
- **D8 — Zéro changement moteur/protocole de jeu.** Sièges, bots, résolution simultanée, fog : déjà livrés. Ce qui change : la **config de partie** (meta LobbyDO) s'enrichit (5 sièges structurés, paletteId par siège, civMode, topographie) + migration `schemaVersion` si l'état change (additif, idempotent, parties existantes testées).

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts, prod 200 ; note l'état exact.
- Lis le LobbyDO/GameDO actuels, l'UI lobby (`Lobby.svelte` + création), `accents.json`/`accents.ts`, la résolution joueur→palette dans le rendu (GameTextures cuites, `cuites` `<type>@<owner>`), `REPORT-CARTE-MULTI.md` §config.

### L1 — Données : config de partie structurée (test-first)
- Nouvelle forme (ex. `ConfigPartie`) : `{ sieges: 5×{type: 'humain'|'bot', paletteId, civId|null}, civsAleatoires: bool, topographie: id, timer, publique }` — **validateur dédié** (comme `orderShapeError` : toute forme invalide refusée avec message clair) AVANT les handlers (piège qui a coûté une phase).
- Constantes data-driven : liste des palettes (déjà `accents.json`), liste des topographies (progen), nb de sièges (5, réglable en JSON).
- Migration si l'état/meta change : idempotente, parties 1v1 existantes relancées en test.

### L2 — Serveur (LobbyDO/GameDO)
- Création avec `ConfigPartie` ; jointure humaine (siège libre, choix couleur+civ avec **unicité serveur** — collision → refus explicite) ; remplacement d'un humain par bot impossible après le fait — bots remplissent les sièges `bot` AU DÉMARRAGE ; démarrage : verrouillage, tirage civs seedé si `civsAleatoires` (unicité), état initial propagé (paletteId par joueur inclus).
- L'hôte modifie la config avant démarrage (même validateur) ; listes publiques affichent les places libres.
- Tests serveur : collision de couleur entre deux jointures → la 2e refusée ; civs aléatoires uniques ; hôte seul + 4 bots démarre ; duel 2 humains + 3 bots ; modification par l'hôte puis démarrage ; parties 1v1 existantes intactes.

### L3 — Client (lobby + résolution accent)
- **Écran de création** : 5 rangées de sièges (Humain/Bot), sélecteur de couleur par siège (nuancier des 7 palettes 4 tons, prises grisées + nom du preneur), sélecteur de civ par siège (désactivé si toggle aléatoire), toggle « Civilisations aléatoires », liste topographies, timer, publique/privée, bouton créer.
- **Écran de jointure** : liste des parties publiques (places libres visibles) + jointure par code ; à la jointure : choisir couleur (libres uniquement) + civ (si manuel).
- **Salle d'attente** : vue hôte (tout éditable, bouton démarrer) / vue invité (lecture seule + son choix), statut des sièges en temps réel.
- **En jeu** : la palette choisie de chaque joueur pilote ses accents (§D5) — vérifier unités cuites, barres PV, anneaux de ville, zone cultivée/frontière, mêlée multi-nations ; le journal et les panneaux nomment les joueurs (noms OAuth ou « Bot N ») ; bandeau « Adversaire » générique multi (si une trace 2-joueurs subsiste, la généraliser).
- Style : cohérent avec l'UI existante (thème des pages, accent CSS menthe inchangé).

### L4 — Vérification
- Suites vertes (moteur/serveur/web), typecheck.
- e2e local : créer (2 humains simulés via dev stub + 3 bots) → jointure avec collision couleur → démarrage → vérifier accents en jeu = couleurs choisies (captures) ; duel 2+3 ; civs aléatoires uniques ; reconnexion d'un joueur.
- **Captures `dev-logs/captures-lobby-5/`** avant tout commit : écran de création complet, nuancier avec palettes prises, salle d'attente, partie démarrée où les accents correspondent aux couleurs choisies (2-3 joueurs), duel 2+3.

### L5 — ARRÊT POUR APPROBATION D'ERIK
L'écran de création est subjectif : captures complètes + parcours e2e filmé/numeroté avant commit. Verdicts attendus : disposition des 5 sièges, nuancier, libellés, lisibilité des palettes prises. NE COMMITTER QU'APRÈS FEU VERT.

### L6 — Rapport
- `REPORT-LOBBY-5.md` : forme de config + validateur, flux serveur, captures, **note Steam** (ce que la tranche Steam branchera ici), ce qu'Erik valide en ligne (création/jointure avec son login — un 2e humain nécessite un 2e compte, noter pour Steam), 🔶 (ordre des topographies, défauts du formulaire, libellés).

## 4. Critères d'acceptation

1. Toute nouvelle partie créée depuis l'UI a **exactement 5 sièges** ; duel = 2 humains + 3 bots jouable de bout en bout.
2. Deux joueurs ne peuvent JAMAIS partager une couleur (serveur autoritaire, UI temps réel) ; la couleur choisie est visible en jeu (accents).
3. Toggle civs aléatoires : tirage seedé, 16 civs distinctes, révélées au démarrage ; sinon choix humain + créateur-bots.
4. La topographie du créateur est respectée par la génération.
5. Parties 1v1 existantes rejouables ; cartes préfabriquées hors menu, intactes au labo.
6. Aucune dépendance Google dans le flux (D7) ; aucune erreur console ; migration idempotente ; suites vertes.

## 5. Périmètre interdit (reporté)
- Moteur de jeu et règles (R-xx inchangés), nouveaux types d'ordre ;
- Noms de joueur personnalisés (displayName OAuth/Bot N pour l'instant), avatars, invitations, chat ;
- Échange/diplomatie entre joueurs, spectateur, reprise de siège bot par un humain en cours de partie ;
- Toute tranche Steam (SDK/ticket/overlay) — la mission se contente de ne pas la bloquer (D7) ;
- Nouvelles topographies (exposer l'existant) et 3D.
