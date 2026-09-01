# Jeu 4X multijoueur asynchrone — Document de Conception & Plan d'Exécution

**Version :** v1 — consolidation de la phase de découverte
**Statut des décisions :** ✅ verrouillée · 🔶 décision par défaut (à confirmer/véto) · ⬜ ouverte

---

## 1. Vision & contraintes

| Contrainte | Valeur |
|---|---|
| Format de partie | 1v1, tours simultanés (« we-go »), **principalement asynchrone** |
| Parties simultanées visées | ~10 au pic |
| Carte | 40×40 hexagones (1 600 cases) |
| Durée d'une partie | ~3 h de jeu effectif, étalée sur plusieurs jours |
| Budget infra | ≤ 5 $/mois (Cloudflare Workers Paid) |
| Plateforme | Navigateur desktop uniquement (pas de mobile) |
| Référentiel de règles | Civilization Revolution (version console) — économie, arbre technologique |
| Mode de développement | Agentique, sans limite de temps — la spécification écrite est le livrable n°1 |
| Contenu v1 | Prototype minimal ; arbre tech Civ Rev ensuite |
| Spectateurs / replay | Pas de spectateurs ; replay gratuit via le journal d'événements (plus tard) |

**Pilier architectural n°1 :** le moteur est une **fonction pure et déterministe**. Les déplacements sont des *intentions* (ordres) déclarées pendant le tour ; la résolution `resolveTurn(state, orders) → (newState, events)` s'exécute entre les tours, sans intervention possible. Elle émet un **journal d'événements** qui alimente l'animation client, les notifications et (plus tard) le replay.

**Pilier architectural n°2 :** serveur autoritaire. Le client n'envoie que des intentions ; le brouillard de guerre est filtré côté serveur ; aucune donnée cachée ne quitte jamais le Durable Object.

---

## 2. Décisions verrouillées

| # | Décision |
|---|---|
| ✅ | Ordres annulables/modifiables jusqu'à la validation (« Fin de tour ») ; verrouillage définitif ensuite |
| ✅ | Résolution uniquement entre les tours : aucune intervention pendant la résolution |
| ✅ | Résultats de collision paramétrables à l'avance (règles déterministes, ex. repoussage selon PV + provenance) |
| ✅ | Timer par partie, configuré à la création |
| ✅ | Brouillard de guerre à **3 états** : inexploré / exploré-masqué / visible |
| ✅ | Vision par **distance uniquement** (rayon des unités et villes), pas de blocage par terrain |
| ✅ | Ordres pré-programmés (chemins multi-tours) qui s'interrompent selon le brouillard (ennemi visible → halte) |
| ✅ | Économie de villes : modèle Civ Revolution (micro-gestion minimale, une case travaillée, répartition auto or/science) |
| ✅ | Victoire prototype : domination (capture de la capitale) ; autres conditions plus tard |
| ✅ | Pas de spectateurs |
| ✅ | Sync réseau robuste : snapshot complet au (re)connect + diffs séquencés + resync par snapshot au moindre écart |
| ✅ | Desktop only ; JSON compacté (gzip) ; unités/villes/terrains en spritesheets |
| ✅ | Génération procédurale = chantier dédié (Phase 6) ; prototypes sur cartes préfabriquées |
| ✅ | Phase 0 complétée (29/08) : 119 tests verts. Interprétations d'implémentation validées en bloc + **R-56 en allocation globale deux-passes** + constantes économie T-14/T-15/T-16 → RULES.md §7.5, §8, §11, §12.1 |
| ✅ | Phase 1 complétée (29/08) : socle infra — monorepo pnpm+turbo, `GameDO`/`LobbyDO` (WS hibernation, persistance SQLite + migrations, résolution idempotente **testée bit à bit**), OAuth Google/Discord + stub local, client Svelte 5 minimal. 147 tests verts (moteur 132 + DO 15) |

---

## 3. Architecture

### 3.1 Monorepo (pnpm + turborepo)

```
/apps/web        Svelte + PixiJS v8  → Cloudflare Pages
/apps/server     Worker + Durable Objects → Wrangler
/packages/shared Types & contrats : actions, ordres, événements, messages WS, GameState
/packages/rules  Moteur de règles PUR (zéro dépendance réseau/IO) + ses tests ← cœur du projet
/assets-src      Sources des sprites, tilesets, palette
```

`/packages/rules` est isolé pour pouvoir tourner dans Node/Vitest sans Wrangler. Les agents y travaillent test-d'abord.

### 3.2 Durable Objects

- **`GameDO`** — un par partie, adressé par `idFromName(codeDePartie)` (code de 6 caractères = identité ; le code EST le lien d'invitation).
- **`LobbyDO`** — singleton (`idFromName("lobby")`) : parties publiques en attente, index `playerId → parties actives`, création/abandon de parties. Suffisant à l'échelle de 10 parties ; pas de D1 ni KV au lancement.

### 3.3 Cycle WebSocket & hibernation

- `state.acceptWebSocket(ws)` + **WebSocket Hibernation API** : le DO se décharge de la mémoire entre les messages (durée facturée : 0 $) tout en gardant les connexions ouvertes. Chaque socket porte `playerId` + `sessionToken` (attachés via `serializeAttachment`).
- Reconnexion : re-auth par token → snapshot filtré + `lastEventSeq` → reprise. Le joueur déconnecté conserve son état serveur (ordres brouillon inclus).
- Le DO ne fait **jamais confiance à sa mémoire au réveil** : lazy-load du GameState depuis le stockage, piloté par `schemaVersion`.

### 3.4 Protocole de synchronisation (robuste)

1. Au connect/reconnect : `snapshot` complet filtré par fog + `seq` courant.
2. Ensuite : `delta` (diff d'état + événements du tour résolu) avec numéro de séquence.
3. Si un client détecte un trou de séquence : il demande `resync` → nouveau snapshot. Jamais de rattrapage par diffs approximatifs.
4. À chaque résolution de tour, le client **rejoue les événements** reçus (animation du tour manqué).

### 3.5 Persistance & crash-recovery

- Résolution **idempotente** : on persiste `{phase:"resolving", turn, orders, rngSeed}` puis `{phase:"orders", turn+1, newState, events}` ; une résolution interrompue est rejouée à l'identique par l'alarme (même entrée → même sortie).
- `processAction` en try/catch global : une action invalide est rejetée pour un joueur, jamais fatale pour la partie.
- Brouillons d'ordres persistés à **chaque modification** (multi-appareil gratuit, coût négligeable).
- Endpoint admin (protégé) : dump d'état d'une partie pour debug ; logs via Tail.

### 3.6 Authentification (robuste) 🔶

- **OAuth Google + Discord** (deux fournisseurs, pas de mot de passe à gérer), session = cookie signé (JWT) + `sessionToken` par WebSocket.
- Pas d'email/magic-link au lancement (évite un fournisseur SMTP).
- Compte invité local pour le dev uniquement.

### 3.7 Déterminisme & RNG ⚠️ (angle mort critique identifié)

`resolveTurn` doit être rejouable à l'identique (crash-recovery) ⇒ **interdiction absolue de `Math.random()` dans le moteur**. Tout aléa (variance de combat, placement) passe par un PRNG seedé (ex. mulberry32) dont la graine vit dans le GameState et avance pendant la résolution. Les tie-breaks sont tous déterministes (règle explicite + ID d'unité en dernier recours).

### 3.8 Versionnage du schéma ⚠️ (angle mort critique identifié)

Les parties durent des jours ; le code sera redéployé pendant. Toute structure persistée porte `schemaVersion`, et `/packages/rules` exporte une chaîne de migrations `v1→v2→…` exécutée au chargement. À écrire dès le premier commit, pas après coup.

---

## 4. Modèle de jeu

### 4.1 Hexagones

Coordonnées axiales `(q, r)` ; clé de case `"q,r"` ; fonctions : distance, 6 voisins, anneau/rayon (vision), ligne (déplacements visuels), conversion pixel (pointy-top ou flat-top — 🔶 par défaut : **pointy-top**, à figer au premier rendu).

### 4.2 GameState (persisté, versionné)

```
schemaVersion, turn, phase ("orders" | "resolving"), rngSeed
map: Record<"q,r", Tile>          // terrain, ressource, owner
players: { id, or, science, techs, vision: { explored, visible }, stats… }
units: Record<unitId, { type, owner, q, r, hp, mp, order }>       // order = intention courante
cities: Record<cityId, { q, r, owner, pop, workedTile, production, buildings, hp }>
settings: { turnTimerMinutes, collisionPolicy, … }                 // fixés à la création
```

Contenu **data-driven** : stats d'unités, terrains, techs dans des JSON de `/packages/rules` — ajouter du contenu ne touche pas au code moteur.

### 4.3 Ordres & résolution

Types d'ordres v1 : `Move (chemin)`, `FoundCity`, `Attack (cible)`, `Hold`, `SetProduction (ville)`.

Modèle d'interprétation :
- Déplacer sur case **vide** → mouvement.
- Déplacer sur case où un **ennemi est visible** → ordre d'attaque explicite.
- Déplacer sur case vide *à la connaissance du joueur* mais où l'ennemi était masqué → révélé à la résolution → **collision**.
- Ordre `Move` multi-tours : s'exécute pas à pas à chaque résolution ; **halte** si un ennemi devient visible dans le rayon de vision ; le reste du chemin est conservé mais gelé jusqu'à nouvel ordre (🔶 règle par défaut, ajustable).

**Collision et combat (spécification complète : RULES.md §6-7, verrouillée le 29/08) :**
- Mouvements garantis vers les cases vides, traités par `unitId` croissant (R-40/R-41) ;
- Collision de movers convergents : aucun dégât, la plus haute PV demeure, l'autre en repli (R-53) ;
- Attaque d'un défenseur stationnaire : 1 échange ; le défenseur survivant garde sa case, l'attaquant se replie (R-52) ;
- Repli unifié : case d'origine → case adjacente libre (proximité d'origine, puis `(q,r)`) → **attaques répétées jusqu'à élimination** si aucun repli — le blocage est une stratégie d'usure assumée (R-54/R-55) ;
- Deux perdants pour un seul repli : le plus haut PV l'obtient, l'autre combat jusqu'à la mort (R-56) ;
- Armée = 3 unités du même type fusionnées, définitive, stats sommées, PV ≤ 9 (R-31) ;
- Colon non-combattant, capturé s'il est vaincu (R-43, I-3) ;
- Formule de round : `p = S_att² / (S_att² + S_def²)`, RNG seedé (§7.4, R-80).

Contenu **data-driven** : stats d'unités, terrains, techs dans des JSON de `/packages/rules` — ajouter du contenu ne touche pas au code moteur. Le squelette du moteur (`rng.ts`, `combat.ts`, `army.ts`, données, 22 tests) est en place et vert.

### 4.4 Brouillard de guerre (3 états, côté serveur)

- `explored` = mémorisé (terrain figé, unités ennemies cachées) ; `visible` = dans le rayon d'une unité/ville amie ; sinon inexploré.
- `getFilteredState(state, playerId)` recalcule la vision de chaque joueur à chaque diffusion. Rayon par type d'unité/ville ( données JSON).
- Aucune entité ennemie hors `visible` ne quitte le serveur ; les cases inexplorées sont absentes du JSON, pas seulement nulles.

### 4.5 Économie (modèle Civ Revolution)

- La ville travaille **une case** à la fois (choisie semi-automatiquement, re-assignable) ; le commerce est réparti automatiquement or/science selon des curseurs globaux simples.
- File de production à un élément ; la population augmente selon la nourriture de la case travaillée.
- Pas de micro-gestion de citoyens spécialisés. Les détails chiffrés seront calqués sur Civ Rev et consignés dans `RULES.md`.

### 4.6 Conditions de fin & abandons ⚠️

- Victoire prototype : capture de la capitale adverse.
- **Forfait** (angle mort identifié) : joueur absent au-delà de K timers consécutifs (K configurable, 🔶 défaut 3) → défaite automatique. Alarme `GameDO` à chaque échéance de timer : auto-lock des ordres courants puis résolution.
- Parties terminées : état conservé (replay) puis purgé après 30 jours (🔶).

---

## 5. Plan d'exécution révisé

Le développement étant agentique et sans échéance, les « semaines » deviennent des jalons de livrables vérifiables.

| Phase | Livrable vérifiable | Contenu |
|---|---|---|
| **0 — Spécifications exécutables** *(démarrée : RULES.md v1 + squelette `/packages/rules` avec 22 tests verts)* — ✅ **complétée le 29/08** : hex, GameState versionné + migrations, événements, cartes 40×40, `resolveTurn` (phases A-D), fog 3 états, fast-check — 119 tests verts | Suite de tests verte sans serveur | `RULES.md` (formules chiffrées) ; RNG seedé ; vitest + tests de propriété (fast-check) ; fixtures de cartes préfabriquées (1–2 cartes 40×40) ; implémentation de `resolveTurn` |
| **1 — Socle infra** — ✅ **complétée le 29/08** (HANDOFF-PHASE1.md) : monorepo ; `GameDO` + `LobbyDO` ; WS hibernation ; snapshot/seq + resync ; résolution idempotente ; alarms timer + forfait T-06 ; OAuth + stub ; client minimal. Déploiement Wrangler documenté (non exécuté — sans compte) | Deux navigateurs voient la même partie vide en temps réel ✅ | `apps/server` (Worker + DO, README avec scénario à deux onglets) ; `apps/web` (Svelte 5) ; `packages/shared` (contrats) |
| **2 — Moteur de règles** — ✅ **absorbée par la Phase 0** (29/08) : tout ce contenu est livré et testé | — | — |
| **3 — Rendu & UI** — ✅ **complétée le 30/08** (HANDOFF-PHASE3.md, rapport : REPORT-PHASE3.md) : canvas PixiJS v8 (caméra pan/zoom/culling, boucle rAF+secours), brouillard 3 états, assets réels SPEC-ART (base+accent teinté joueur) avec fallback placeholder, ordres à la souris (Move pas à pas, Attack, Hold, FoundCity, SetProduction), playback des événements skippable, panneaux unité/ville, journal, mode reveal dev `#/debug`, bot aléatoire local (`pnpm bot`). Vérifié en solo complet à la souris vs bot : fondation, production, déplacements, capture de colon, échanges de combat jusqu'à destruction, 2 victoires par domination | On joue à la souris sur une partie locale (bot aléatoire) ✅ | Canvas PixiJS (caméra zoom/pan/culling) ; spritesheets **placeholder géométriques** ; stores Svelte ← messages réseau ; barre sup., panneau d'unité, menu de ville, fin de tour ; playback des événements |
| **4 — Prototype J1 complet** — ✅ **complétée le 30/08** : déploiement réel (Workers + Static Assets même origine, OAuth Google/Discord réels après correction du bug de session Set-Cookie) ; **première partie 1v1 terminée en ligne entre deux comptes réels** — écrans de victoire et de défaite affichés. Cadrage fait en direct avec Erik (pas de handoff Phase 4 : déploiement interactif) | 2 humains finissent une partie 1v1 **en ligne** ✅ | — |
| **5 — Durcissement, polish & mise en production** *(handoff prêt : HANDOFF-PHASE5.md)* — ✅ **L0-L4 implémentées le 30/08** (REPORT-PHASE5.md) : fortification R-33/T-17 (moteur+UI+bot, schemaVersion 3), polish UX de la 1re partie en ligne (re-clic désélection, clic droit auto-soumis, dialogue unités sans ordre, FoundCity T-09, toast ordre non exécuté, calibration T-15=25), fix `pnpm bot --`, observabilité documentée (Tail/admin/purge/coût), workflow CI/CD prêt, **déployé en prod et vérifié** (fortify e2e en conditions réelles). Reste côté Erik : login OAuth réel en ligne + relevé de coût dashboard + création du repo GitHub | Polish UX validé en jeu + fortification + CI/CD | **Polish UX (retours de la première partie, 30/08)** : re-clic sur l'entité sélectionnée = désélection ; clic droit = tracé du chemin (auto-soumis, sans bouton valider) ; confirmation « unités sans ordre » à la fin de tour ; **fortification** (R-33/T-17 : ordre permanent, bonus défensif, bouton + marqueur écu) ; calibration T-15 (croissance pop trop rapide) ; fix bot `pnpm bot --` ; contrats + moteur + tests pour `Fortify` ; observabilité (Tail) ; CI/CD (GitHub Actions — nécessite un repo GitHub, côté Erik) ; validation coût Cloudflare |
| **4.5 — Personnalisation visuelle** *(BACKLOG.md idée 1 — défauts proposés, à valider)* | Galerie de styles, choix persistant par compte, saveur par seed de partie | Portage TS du générateur (silhouette figée, motifs/palette variables), profil + `styleId` dans `meta.players`, tests générateur |
| **6 — Économie des terrains & bâtiments** *(handoff prêt : HANDOFF-PHASE6.md — priorité demandée par Erik le 30/08, avant la procédurale)* | Une ville exploite ses cases visuellement (rayon 6 → 18 avec Tribunal), produit nourriture/production/commerce, construit des bâtiments | Rendements réels (RULES.md §2 révisée) ; citoyens = pop (R-60) ; `SetWorkedTile` ; bâtiments R-66 (Grenier, Atelier, Mine de fer, Comptoir, Port, Tribunal) ; croissance 10×pop (R-63 revue) ; nouveaux terrains désert + mer productive ; UI : cases travaillées en surbrillance, menu de réassignation, cumuls N/P/C, overlay rendements masquable ; sprites via le générateur (désert, 6 bâtiments, icône commerce) |
| **6b — Génération procédurale** *(reportée après 6 — elle s'appuiera sur les rendements pour équilibrer les cartes)* | Cartes aléatoires équitables | Bruit + placement symétrique des spawns, checksum d'équité, seeds rejouables |
| **7a — Technologies, première tranche** *(handoff prêt : HANDOFF-PHASE7A.md — 31/08, demande d'Erik)* | Recherche visible et rentable : choisir une tech, la voir progresser avec la science des villes, débloquer Archer/Cavalier/Légion et Bibliothèque/Caserne | Base relationnelle `techs.json` (9 techs, R-85/R-86/R-87) ; accumulation par ville avec progression conservée par tech ; menu de choix technologique ; filtrage de la production par déblocage ; 3 nouvelles unités ; emblèmes Bibliothèque/Caserne + sprites Archer/Cavalier/Légion via le générateur ; merveilles en données (non constructibles) ; migration `schemaVersion` 5 |
| **7 — Contenu Civ Revolution** | Le vrai jeu | Arbre technologique complet, unités (dont **unités à distance**, R-59), merveilles (effets), grandes personnes, **diplomatie** (paix/guerre, incidents, restitution de colons — R-58), **engagements multi-participants** (BACKLOG.md idée 2, §7.9 à formaliser), **ressources de terrain** (concept d'Erik, non intégré) — data-driven |
| **Parallèle — Atelier sprites** — ✅ **P0 livré et accepté le 30/08** (SPEC-ART.md, pipeline `assets-src/tools/generate.py` reproductible) | Tileset + unités cohérents | P1 polish (variantes, rivage) puis P2 (unités Phase 7) via le générateur |

**Premier livrable jouable = fin de Phase 4** (vertical slice) : carte préfabriquée, 2 unités (Guerrier, Colon), 0–1 tech, victoire par domination.

---

## 6. Décisions ouvertes (à trancher — défauts proposés)

| # | Sujet | Décision | Statut |
|---|---|---|---|
| 1 | Empilement d'unités | **Aucun empilement** : 1 entité amie par case (ville + 1 défenseur excepté). Seule exception : armée = 3 unités du même type fusionnées, définitive (R-30/R-31, RULES.md §3) | ✅ |
| 2 | Combat & collision | Formalisé dans RULES.md §7 : échange à 1 round (R-51), défenseur stationnaire garde sa case, repli unifié origine → adjacente libre → attaques répétées jusqu'à élimination (R-54/R-55), allocation du dernier repli au perdant ayant le plus de PV (R-56), formule p = S_att²/(S_att²+S_def²) calquée sur la convention Civ | ✅ |
| 3 | Collision sans case de repli | Couvert par R-55 (attaques répétées) et R-56 | ✅ |
| 4 | Notifications hors-ligne (email/Web Push quand c'est ton tour) | Différées ; badge + ressaisie à la reconnexion en v1 | 🔶 |
| 5 | Eau/naval dans le prototype | Eau = infranchissable, carte type pangée ; naval en Phase 7 (T-11) | 🔶 |
| 6 | Orientation des hexagones | Pointy-top (verrouillé pour l'implémentation) | ✅ |
| 7 | Unités de départ, distance entre spawns | 1 Colon + 1 Guerrier, spawns symétriques ≥ 12 cases | 🔶 |
| 8 | Langue de l'UI | FR d'abord, chaînes centralisées (i18n plus tard) | 🔶 |
| 9 | Barbares / villages de tribus (Civ Rev) | Hors prototype, Phase 7 | 🔶 |
| 10 | Audio (SFX/musique) | Différé, après Phase 5 | 🔶 |
| 11 | Fournisseurs OAuth finaux | Google + Discord | 🔶 |
| 12 | Purge des parties terminées | Conservation 30 jours puis purge | 🔶 |

## 7. Angles morts couverts (journal de la découverte)

Empilement d'unités · formule d'attaque vs collision · cas limites de repoussage · RNG seedé (déterminisme) · migrations de schéma en cours de partie · victoire par forfait · matchmaking (codes de partie + LobbyDO) · reprise sur crash (résolution idempotente) · protocole de resync (seq + snapshot) · économie des WebSockets (hibernation) · délais de notification · licences des assets · contenu data-driven · langue de l'UI.
