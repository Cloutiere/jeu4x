# REPORT-DIPLOMATIE-T2 — La négociation : paix avec compensation, échanges de technologies

Mission exécutée (HANDOFF-DIPLOMATIE-T2, décisions Erik 28/10) — moteurs, serveur, client, banc, captures.

## 1. Livré

### Moteur (packages/rules — pur, `diplomatie.ts` + `events.ts` + `fog.ts`)
- **D2 · Paix avec compensation** : `applyProposePeace(state, proposer, target, accepte, goldOffer?)` — `goldOffer` optionnel validé (entier ≥ 0, trésorerie du proposeur) AVANT toute application. Acceptation : or transféré ATOMIQUEMENT avec la purge de la guerre, `PeaceAccepted` (PUBLIC, sans montant — le FAIT de la paix reste une annonce CivRev) + `PeaceCompensated { gold }` (PRIVÉ). Refus : **rien ne bouge**, `PeaceOfferRefused { gold }` PRIVÉ. Sans `goldOffer` : comportement T1 **bit à bit** (`PeaceRefused` public).
- **D3 · `applyTradeTechs(state, proposer, target, offre, accepte)`** — échange 1:1 (`techDemandee`) OU tech contre or (`goldDemande`, exactement UNE contrepartie — refus de forme). Validations métier : nations actives, **jamais en guerre** (canon), jamais en anarchie (des deux côtés), techs existantes et connues de leurs donneurs, tech reçue INCONNUE du receveur, trésorerie suffisante. Acceptation : échange ATOMIQUE (techs + or ; ère recomptée `eraOfTechCount` ; le tirage Premier découvrir ne se rejoue pas), événement PRIVÉ `TechTraded { techRecue, techDonnee?, gold }` ; refus : rien ne bouge, `TechTradeRefused` PRIVÉ.
- **D1 · Privacité** : les 4 événements de négociation sont dans `PRIVATE_EVENTS` (`fog.ts`) — miroir exact des `PUBLIC_EVENTS` : un événement privé ne passe `filterEventsForPlayer` QUE s'il touche le lecteur (`eventRefs` from/on). **Preuve L1** : le tiers ne reçoit RIEN (`tests/diplomatie-t2.test.ts` — privacité TechTraded et PeaceCompensated).
- **D6 · Zéro état persisté** : offres résolues À LA RÉCEPTION ; aucun champ GameState, **schemaVersion 28 inchangée**, aucune migration.

### Décision du bot (apps/server — `botPolicy.ts`, données `bot.json` bloc `negociation`)
- **D4 · Grille data-driven** (partagée par profils) : `prixPaixBase` **15** (calibrée au banc e2e — voir §3), `zoneGrise` 0,6, `margeTech` 0,25, `facteurFierte` 1,0, `plancherRapportForces` 0,5, `plafondRapportForces` 2, `seuilContreTirage` 0,5.
- **Prix de la paix** = `prixPaixBase` × fierté (`1 + facteurFierte × (2×agressivite − 1)` — une civ fière exige plus) × rapport de forces borné [0,5 – 2].
- **Réponses** (`deciderPaixNegociee` / `deciderEchangeTechs`) : `deciderPaix` (administrative/gagnant) vrai → **accepte** (l'or passe quand même) ; `goldOffer ≥ prix` → **accepte** ; `< prix × zoneGrise` → **refuse** (insulte) ; zone grise → tirage seedé : **contre-proposition** (le prix exigé) ou refus. Échange : valeur reçue (coût R-135 de la tech) ≥ valeur donnée × (1 + marge) → accepte ; sous × zoneGrise → refuse ; zone grise → contre-proposition **uniquement en forme « tech contre or »** 🔶 (l'or maximal que le bot paierait ; en 1:1 la contrepartie est une tech, pas d'or à négocier — refus).
- **Tirage seedé DÉDIÉ** (miroir R-154) : `createRng(botTurnSeed(seed, tour, 'negoc-paix|negoc-tech-<proposer>-<cible>'))` — jamais le RNG de résolution ; une offre identique reçoit TOUJOURS la même réponse (test « aucune usure »). **Une seule itération** de contre-proposition.
- **Bots entre eux : JAMAIS** (D5 — le joueur est le seul initiateur ; le handler n'applique la grille que si la cible est un bot).

### Serveur (GameDO)
- `orderShapeError` : formes `ProposePeace { player, goldOffer? }` et `TradeTechs` validées **EN PREMIER** (leçon 7f) — cible/tech obligatoires, exactement une contrepartie, or entier ≥ 0.
- Handlers immédiats (miroir DeclareWar/ProposePeace) : décision du bot si la cible est un bot (grille ci-dessus), sinon acceptation par défaut 🔶 (miroir T1 : la négociation entre humains se joue entre eux), application moteur pur, événements privés au journal (filtrés par partie), réponse **OrderAck** au proposeur (« paix acceptée (N or versés) » / « paix refusée » / « contre-proposition : X exige N or »), Snapshot diffusé (chaque client reçoit son état filtré).
- Protocole : `ProposePeace` étendu (`goldOffer?`), nouveau message `TradeTechs` — `packages/shared`.

### Client (apps/web)
- **D5 · Modale `NegociationModale.svelte`** : ouverte par le bouton **🤝 « Négocier »** de la pastille de nation (en paix ET en guerre). Paix compensée : curseur d'or (plafond = trésorerie). Échange : sélecteur « vous offrez » (mes techs inconnues du bot), contrepartie radio tech/or. Canon respecté dans l'UI : échange désactivé avec l'explication « aucun échange avec une nation EN GUERRE ». Styles `.parametres-*` recopiés (scoped Svelte).
- **Toasts en direct** (Game.svelte) pour `PeaceCompensated`, `PeaceOfferRefused`, `TechTraded`, `TechTradeRefused` ; **Chroniques privées** (`chronique.ts`) — entrées « monde »/« découvertes » nommées (« Rome accepte ta paix contre 50 or »).
- `gameClient.ts` : `proposePeace(playerId, goldOffer?)`, `tradeTechs(...)` ; `playback.ts` : durées des 4 événements.

## 2. Vérifications (L1)

- `apps/server/tests/diplomatie-t2.test.ts` — **18 verts** : formes (en premier), paix compensée (or transféré/purgée ; refus immuable), TradeTechs (1:1 atomique, tech+or, refus immuable, validations guerre/anarchie/déjà-connue), privacité (tiers ne reçoit RIEN, PeaceAccepted public sans montant), grille du bot (fierté ↑ prix, forces ↑ prix, généreux→accepte, insulte→refuse, zone grise→contre-proposition, déterminisme par graine, aucune usure).
- Suites : **rules 1101 verts · server 332 verts · web 700 verts · turbo typecheck 4/4**.

## 3. Captures GUI (L4) — `dev-logs/captures-diplomatie-t2/` — **PASS ✓**

Deux scénarios e2e (`devtmp/diplomatie-t2-gui.mjs`, solo 1v1 god mode + partie 5 sièges 3 humains) :

- **modale-negociation.png** — la modale 🤝 « Négocier — Bot » (paix compensée + échange de techs, propositions PRIVÉES affichées).
- **Paix compensée avec un bot** (guerre déclarée par le bot pendant l'éco — l'UI désactive l'échange « aucun échange avec une nation EN GUERRE », canon) :
  - `paix-compensee-proposition-basse.png` / `paix-compensee-refusee.png` — offre à 1 or → **REFUS** (verdict ✓ guerre intacte, or intact) ;
  - `paix-compensee-proposition-max-t0.png` → **ACCEPTATION à 51 or** : Chroniques « Bot (Arabie) ACCEPTE la paix contre 51 or — la guerre est finie. » + « Arabie REFUSE votre paix compensée (1 or) » (`paix-compensee-reponse-t0.png`) ; wars purgées, or transféré (verdict ✓) ;
  - `modale-declaration.png` — déclaration de guerre par l'UI.
- **Échange de technologies** : `echange-refuse-proposition.png` / `echange-refuse.png` (poterie 20 contre 150 or → **REFUS net**, rien ne bouge ✓) puis `echange-proposition.png` / `echange-accepte.png` (poterie contre 1 or → **ACCEPTÉ**, le bot connaît la tech ✓).
- **PRIVACITÉ (partie à 3 humains + 2 bots)** : J1 négocie (paix compensée refusée avec le bot p4) — `priva-j1.png` (Chronique privée « REFUSE votre paix compensée »), `priva-j2.png`, **`priva-j3.png` : l'écran du tiers ne montre AUCUNE trace** (seule la guerre PUBLIQUE bot↔bot apparaît). Verdicts ✓.

Le scénario e2e a exigé de contourner l'économie réelle d'ouverture (§5-1) : commerce = eau/désert uniquement — le script fonde la capitale en côte, travaille une case d'eau et lève l'or par ventes de guerriers (SellUnit).

## 4. Banc post-T2 (L5)

Banc 40×3×150 (civs réelles P7) re-exécuté après T2 (`tests-banc/banc-horloge-distance.test.ts`, gate BANC_BOT_TD → `devtmp/banc-horloge-distance.json`) ; l'AVANT est conservé (`devtmp/banc-horloge-AVANT-diplomatie-t2.json`) ; comparateur `devtmp/banc-diplomatie-t2-analyse.mjs`.

**Résultat : bit à bit identique à l'AVANT** (toutes métriques égales : guerres/partie 1,77/2,67/3,23 ; durées 45,0/35,9/33,4 ; paix acceptées 219 = 219 ; captures 10 ; écrasement 0) — **zéro régression, déterminisme intégral préservé**. C'était le but : la négociation vit sur le chemin JOUEUR→bot, que le banc (bot vs bot) n'emprunte jamais. **Paix compensées au banc : 0 — structurel** (R-189-d : les bots ne négocient jamais entre eux ; Jev apportera l'initiative). **Pas de cible de conquête** à ce banc (D5 du handoff : le calibrage offensif se fera APRÈS, sur ce nouveau système).

## 5. 🔶 Ouverts (verdict Erik)

1. **Calibrage `prixPaixBase` 50 → 15** : mesuré en e2e — l'économie d'ouverture ne produit QUASI AUCUN or (commerce = eau/désert uniquement ; une capitale intérieure → 0 or, 0 science tant que la conversion n'est pas mise sur science). À 50, la paix compensée est inatteignable avant l'ère Médiévale ; à 15 (× rapport × fierté ≈ 7–30), elle est jouable dès la première guerre. À l'œil.
2. **Contre-proposition techs en 1:1** : refus (pas de forme composite tech+or). Une forme composite `techOfferte + goldOffer` rendrait la contre-proposition possible dans les deux sens — proposé pour T2bis/Jev.
3. **Négociation entre humains** : le cible-humain accepte par défaut (pas d'écran de négociation joueur↔joueur — miroir du choix T1 🔶). Jev/défi humain apporteront la réponse côté cible.
4. **Techs de la cible visibles dans la modale** : les `techsUnlocked` adverses restent dans l'état filtré (pré-existant) — traité comme information publique 🔶 (l'ère est publique R-147). Si Erik veut le masquer : filtre `getFilteredState` + liste des techs échangeables côté serveur.
5. **Vol Spatial reçu par échange** ne re-révèle pas la carte du receveur (marginal 🔶).
6. **Captures e2e** : §3.

## 6. Périmètre respecté

Guerres/attaques (T1), horloge de paix (HORLOGE-DISTANCE), cycle bot offensif (calibrage post-T2), T3, fog du bot, alliances, bots initiateurs : intouchés. Fichiers non trackés d'Erik jamais commités.
