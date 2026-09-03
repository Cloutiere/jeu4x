# HANDOFF PHASE 7f — Culture (tranche 1)

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~464 tests), **la spécification rédigée par Erik : [Culture dans Civilization Revolution.md](Culture%20dans%20Civilization%20Revolution.md)** — elle fait foi pour les mécaniques — et `RULES.md` §8 (bâtiments à effets, R-109..R-112). `schemaVersion` actuel : **9**.

Contexte : Phases 0→7e complétées — l'arbre complet (46 techs), les bâtiments à effets, R-59 (unités à distance), le Premier découvreur, l'obsolescence et les remplacements sont en production. Les **Temples** (Inhumation cérémonielle) et **Cathédrales** (Religion, remplace le Temple) existent en données avec leurs effets culturels décrits (`implemented:false`) — **cette phase les active et construit la victoire culturelle**.

**Décisions de tranche prises par le pilotage (veto possible, à confirmer au lancement) :**
1. **Culture = rendements + Personnages Illustres de culture + 20 jalons + Nations Unies.**
2. **La conversion culturelle passive est REPORTÉE** : elle exige un concept de territoire/frontières qui n'existe pas encore (proposé pour la suite — voir « reportés » en fin de handoff). L'Artiste conserve son installation en ville ; sa consommation pour convertir une ville ennemie attend la mécanique de territoire.
3. **Trois merveilles à effets simples sont activées** (sinon les 20 jalons seraient inatteignables avec seulement les GP) : **Stonehenge** (Temples +50 % de culture), **Colosse de Rhodes** (commerce de la ville ×2), **Jardins suspendus** (+50 % population immédiat). Les autres merveilles restent en données (7h : leurs effets touchent gouvernements/combat/découvertes).
4. **Personnages Illustres de cette tranche** : ceux issus de la **culture** (Artiste, Penseur — alternance déterministe ou tirage seedé 🔶). Les GP issus de l'or/science/production/combat viendront avec 7g/7h.

## Mission — livrables dans l'ordre

### L0 — Règles écrites (transcription dans RULES.md §8.5 « Culture », test-first)

Transcrire puis implémenter :
- **R-113 · Rendement culturel.** Par ville et par tour : **Palais** (capitale uniquement, base 🔶 1/tour) + **Temple** +1 **par citoyen** + **Cathédrale** +2 **par citoyen** (remplace le Temple) + **Stonehenge** (Temples ×1,5) — la culture est **scalaire sur la démographie** (doc d'Erik §Architecture). Accumulée **par ville** (`city.cultureStored`).
- **R-114 · Personnages Illustres.** Quand la culture accumulée d'une ville atteint le **seuil** 🔶 (`T-27` : base 20, croissant ×2 à chaque GP obtenu **par l'empire** — doc : « le seuil augmente à chaque nouveau personnage ») : un **GP de culture** apparaît sur la case de la ville (unité pacifique 0/0/2, type Artiste ou Penseur — tirage seedé), événement `GreatPersonSpawned`, jauge remise à zéro, compteur empire `greatPersonsObtained` incrémenté.
- **R-115 · Installation et jalons.** Un GP peut **s'installer définitivement** dans une ville (ordre `InstallPerson`, consomme l'unité) → **+1 jalon culturel** au joueur (`player.cultureMilestones`). **Merveille contrôlée = 1 jalon** (dynamique : acquis à la construction/capture, perdu si la ville hôte est prise). Jalons visibles dans l'UI (X/20).
- **R-116 · Nations Unies et victoire culturelle.** À **20 jalons** : la merveille **Nations Unies** devient constructible (coût 🔶 300, unique à l'empire, **non accélérable** par GP) ; **si les jalons retombent sous 20** (capture d'une ville hôte de merveille), la construction est **suspendue** (hameçons conservés 🔶). Complétion → **`Victory(reason:'culture')`**.
- Constantes : `T-27` seuil GP (20 🔶), croissance ×2 🔶, `T-28` coût UN (300 🔶) — data-driven.
- Migration **`schemaVersion` 9→10** : `city.cultureStored`, `player.cultureMilestones`, `greatPersonsObtained`, GP = unité de type spécial (pacifique).

### L1 — Moteur (test-first)

1. Yields culturels en Phase C (R-113, incluant Stonehenge et les futurs mods gouvernementaux en données 🔶) ; accumulation par ville.
2. Spawn de GP au seuil (R-114) ; GP = unité pacifique déplaçable ; **installation** (R-115) : ordre `InstallPerson` sur une ville → jalon ; **une merveille construite/capturée/perdue** ajuste les jalons (R-115) — construction via `SetProduction` (les 3 merveilles activées deviennent constructibles, uniques à l'empire).
3. **Nations Unies** : verrouillée à < 20 jalons, constructible à 20, **suspendue** si < 20 pendant la construction, victoire à l'achèvement (R-116).
4. Tests citant R-113..R-116 : yields scalaires (20 pop × Cathédrale = 40 🔶 du doc d'Erik), seuils croissants, jalons dynamiques, suspension UN, victoire culturelle.

### L2 — Serveur

Contrats (`InstallPerson`, `cultureMilestones` dans le snapshot, événements `GreatPersonSpawned`/`InstallPerson`/`CultureMilestone`) ; validation GameDO ; admin dump ; **bot** : installe ses GP dès que possible, construit les 3 merveilles quand il peut, vise l'UN à 20 jalons (comportement simple).

### L3 — UI

1. **Panneau de ville** : jauge de culture (accumulé/seuil) + rendement culturel de la ville.
2. **Compteur de jalons empire** dans la barre supérieure (X/20 + détail au survol : GP installés, merveilles).
3. **GP sur la carte** (sprites distincts Artiste/Penseur, accent joueur), bouton « S'installer dans cette ville » quand le GP est sélectionné et la ville adjacente/sa case.
4. **Production** : les 3 merveilles actives + UN (verrouillée avec le compte restant de jalons) ; **toasts** : GP apparu, jalon gagné/perdu, UN disponible/suspendue, victoire culturelle.
5. Assets via `generate.py` : emblèmes Temple/Cathédrale/UN + sprites GP Artiste/Penseur (gabarits unités) ; `sync-art`, LICENSES.

### L4 — Vérification & livraison

1. **e2e moteur** : capitale pop élevée + Temple → culture accumulée → GP spawn au seuil → installation → jalon 1 → 3 merveilles construites → jalons 4 → UN débloquée à 20 (accélérer par fixtures de culture) → victoire culturelle ; capture d'une ville hôte de merveille → jalon perdu → UN suspendue.
2. **GUI locale vs bot** : jauge de culture visible, GP apparu et installé à la souris, jalons dans la barre, merveilles construites ; captures.
3. Déploiement prod via CI ; lister pour Erik les vérifications en ligne (login OAuth).

## Critères d'acceptation

1. R-113..R-116 dans `RULES.md`, couvertes par tests citant leur identifiant ; migration v9→10 testée ; suites vertes (~464+).
2. Le scénario e2e culturel complet passe (GP → jalons → UN → victoire).
3. Stonehenge/Colosse/Jardins suspendus actifs et testés ; autres merveilles toujours en données.
4. Déployé en prod, vérifié.

## Périmètre interdit (cette session)

**Conversion culturelle passive** (concept de territoire — sera proposé en 7g/7h), Artiste consommé pour convertir, autres types de GP (or/science/production/combat — 7g/7h), interplay espionnage (vol de GP — 7g), mods gouvernementaux (7h), merveilles à effets complexes (Grande Bibliothèque, Oracle, Grande Muraille, Himeji, Magna Carta — 7h), naval (7g), procédurale (6b livrée). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel + arrêt et remise de la main. Suite prévue : **7g — Naval & Espionnage** (le vol de GP par espions rejoindra les jalons — prévoir l'interaction), puis **7h — Gouvernements, Civilisations & merveilles**, et les **points en suspens d'Erik** (conversion/territoire, D2 culture-ressources).
