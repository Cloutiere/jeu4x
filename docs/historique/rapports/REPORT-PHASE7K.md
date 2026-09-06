# RAPPORT PHASE 7k — Merveilles du Monde : règles canoniques, effets restants + corrections 7j

Date : 04/09/2026. Handoff : `HANDOFF-PHASE7K.md` (source : doc d'Erik « Merveilles et Personnages », sections « Les Merveilles du Monde » et « Distribution cartographique » — elle fait foi ; StrategyWiki Wonders croisé). **Ordre respecté : le Bloc 0 (vetoes d'Erik du 04/09) a été implémenté en premier.**

## Livré

### Bloc 0 — Corrections 7j (vetoes d'Erik du 04/09, test-first)

- **C1 — Le Grand Humanitaire est produit par le CANAL CULTURE** (R-114/R-127 : ciblage technologique — Thomas Becket/Féodalité, Frederick Douglass/Chemin de fer — et rotation des 6 classes compris) : l'accumulateur `gpAccumFood` n'est **plus crédité ni lu**. **Choix d'agent documenté** : champ **conservé DORMANT** en état (compat saves, zéro migration de suppression — les états existants gardent leur valeur, jamais consultée). Les accumulateurs Savant/Explorateur/Bâtisseur (R-123) et le canal combat du Leader (T-31) restent en l'état.
- **C2 — Seuls les GP issus du canal CULTURE comptent comme Jalons culturels** (`reason: 'obtain'`) : un GP d'**accumulateur** (T-30), du **canal combat** (Leader, T-31) ou du **Premier découvrir** (D5.1) **ne compte plus**. Les **merveilles continuent de compter** (R-131 — le doc est explicite). **Écart volontaire avec le doc** (« chaque GP obtenu compte comme un Jalon ») : **révision datée du 04/09, décision d'Erik**, consignée dans RULES.md §8.8. L'escalade T-27/T-30 reste alimentée par **toute** obtention (inchangé).
- **C3 — Un seul GP d'un même type installé par ville** : le Settle d'une classe déjà installée dans la cité est **refusé par le moteur** (ordre ignoré, le GP reste en attente de choix) ; l'UI **désactive le bouton** avec tooltip explicite (« un Grand Savant est déjà installé dans c1… »). Une AUTRE classe reste installable dans la même ville.
- Tests 7j révisés en conséquence (canal CROISSANCE réécrit « gpAccumFood dormant », Premier découvrir sans jalon, tests phase7h « accumulateur sans jalon ») — **aucun durcissement de valeurs**.

### Règles canoniques du doc (nouveau §8.9 de RULES.md, R-128..R-133)

- **M1 — Obsolescence GLOBALE (R-128, révision R-110)** : `isWonderObsolete` est désormais évaluée sur l'**union des technologies connues de toutes les civilisations** — nouveau helper pur `allKnownTechs(state)` ; tous les sites moteur (effets de merveilles, menus de production, bonus Himeji, Grande Muraille) et les miroirs UI (tooltips, culture/tour, Oracle) passent l'union. **La culture générée et le jalon sont conservés après obsolescence** (testé). Prérequis de production : la tech exigée reste évaluée sur les seules techs du JOUEUR (contexte `allTechsUnlocked` séparé).
- **M2 — Exclusivité mondiale (R-129, révision R-116)** : `wonderProductionIssue` refuse une merveille **déjà bâtie n'importe où** (`worldWondersBuilt`, libellé « déjà construite quelque part (exclusivité mondiale) ») ; le chantier concurrent chez le rival reste légal. **Complétion simultanée au même tour : tie-break R-81** — les villes sont traitées en `cityId` croissant, la première valide, la seconde est un no-op qui **bascule en récupération (R-130)** — documenté 🔶.
- **M3 — Récupération des marteaux (R-130)** : à la résolution où un rival complète une merveille, **tout chantier concurrent** (toutes civilisations) bascule automatiquement en récupération : nouveau champ de ville **`city.pendingSalvage`** (marteaux conservés, production vidée), événement **`HammerSalvage { cityId, owner, wonder, amount, outcome: 'available' | 'dissipated' }`** 🔶. Réaffectation par un **`SetProduction` ordinaire** (aucune nouvelle forme d'ordre — `orderShapeError` inchangé, cf. piège du handoff) : le nouveau projet **démarre à `pendingSalvage`** (conservation intégrale 🔶, miroir de R-62). **Fenêtre d'un tour** (T-32 🔶, `culture.json` `hammerSalvageWindow`) : sans réaffectation, dissipation en tête de la résolution suivante (`outcome: 'dissipated'`), APRÈS service des `SetProduction` soumis (ordre de passage dans `resolveTurn` garantit la fenêtre pleine). La capture de la ville dissipe la récupération (les marteaux ne passent pas au captreur).
- **M4 — Merveille = Jalon (R-131)** : vérifié — la complétion accorde +1 (`wonderBuilt`), le compteur de jalons et les Nations Unies (20) l'intègrent, le header UI compte « merveille(s) contrôlée(s) », le jalon survit à l'obsolescence.

### Effets des merveilles restantes (R-132, data-driven `wonders.json` — valeurs du doc)

| Merveille | Implémentation |
|---|---|
| **Grande Bibliothèque** | Effet continu à chaque résolution : accorde toute tech découverte par **≥ 2 rivaux** (condition canonique ; octroi direct sans `firstBy`/Premier découvrir, événement `TechResearched`). **En 1v1 : jamais déclenchée — documenté** ; testé sur un état synthétique 3 joueurs (condition réellement implémentée, pas simplement morte) |
| **Théâtre de Shakespeare** | `cityCultureMult: 2` — ×2 la **Culture totale** de la cité (dans `cultureGains`, après Palais/Temples/Stonehenge, avant multiplicateur Settle Artiste/Penseur) |
| **Université d'Oxford** | `randomTechOnComplete` — une tech **aléatoire seedée R-80** parmi les non débloquées (table triée par id 🔶) ; **rejouable au même seed** (critère d'acceptation testé). Amendement R-80 documenté : RNG consulté en Phase C (précédent : huttes en Phase A) |
| **Cie des Indes** | `oceanCommerceBonus: 1` — +1 Commerce par case **`ocean`** travaillée (modèle R-66, intégré à `tileYield` avec paramètre merveilles : auto-assignation comprise, bonus UI miroir) |
| **Atelier de Léonard** | `upgradeObsoleteUnits` — à la complétion, toutes les unités obsolètes de l'empire suivent la chaîne **`upgradeTo` (R-111)** tant que le type reste obsolète pour le PROPRIÉTAIRE (R-110 unités = périmètre joueur, contrairement aux merveilles M1) ; armées comprises, vétérans/PV conservés ; événement `UnitsUpgraded` (filtré fog par unitId). **Une fois, à la complétion** 🔶 |
| **Foire de Troyes** | `cityGoldMult: 2` — ×2 la part **or** de la conversion R-90 de la cité (interprétation 🔶 du handoff) |
| **Complexe militaro-industriel** | `militaryCostMult: 0.8` — −20 % le coût de production des unités **militaires** (production seule ; le « coût d'achat » concernera le rush-buy 7l). Colon exclu (pacifique) |
| **Internet** | `empireGoldMult: 2` — ×2 la part or de la conversion R-90 de **toutes** les villes. Cumul Troyes/Internet : **MAX** (convention R-88 🔶) |
| **Programme Apollo** | `allTechsOnComplete` — accorde **instantanément l'ensemble de l'arbre** (le doc fait foi 🔶) ; conséquence canonique vérifiée : l'obsolescence GLOBALE frappe les merveilles concernées |
| **Hollywood** | **Inactif v1** — `implemented: false` conservé (territoire en suspens), données présentes |
| **Grande Muraille** | `blocksEnemyAttacks: true` — **l'adversaire ne peut pas attaquer les unités ni les villes du propriétaire tant qu'elle est debout** (décision d'Erik du 04/09, validée). Ordre `Attack` : fizzle **sans consommation de PM** ; entrée de case R-42 : arrêt devant le défenseur, chemin gelé ; capture d'une ville protégée bloquée à l'entrée. Portée empire, vaut contre les barbares ; **levée dès que QUI QUE CE SOIT découvre l'Ingénierie** (M1 — union des techs, testé) |

Interprétations 🔶 de la tranche (documentées en R-130/R-132) : la continuation forcée de combat (R-55/R-56-3) n'est **pas** bloquée par la Grande Muraille (terminaison garantie) ; collisions R-53 non bloquées (pas une attaque) ; « case océanique » = terrain `ocean` seul (le doc dit « maritime », le handoff « océanique ») ; récupération sans plafond au coût du nouveau projet ; octrois de tech d'Oxford/Apollo/Grande Bibliothèque émettent `TechResearched` (libellé « complétée » — réutilisé) et n'écrivent pas `firstBy`.

### Audit des 8 merveilles actives (R-133, modèle 7i)

Stonehenge, Grande Pyramide, Colosse, Oracle, Jardins suspendus, Himeji : **conformes** (détail dans RULES.md §8.9 — le Colosse « ×2 Science et Or » est couvert en substance par `commerceMult` avant conversion binaire R-90). **Magna Carta : ÉCORRIGÉE** — le doc dit « Tribunaux **+1 culture par citoyen** » ; le modèle 7h « +1/tour à plat 🔶 » est révisé en `tribunalCulturePerCitizen: 1` × population (champ renommé, moteur + data). **Nations Unies : écart de coût 🔶 signalé, non corrigé** — catalogue du doc 500 marteaux vs notre `T-28` 300 🔶 (calibrage 7f ; règle « aucun recalibrage des merveilles actives sans accord »). Coûts des merveilles nouvellement activées alignés sur le doc là où ils divergeaient (Léonard 200 → 150 ; Complexe 500 → 600, borne basse de la fourchette 600-750).

### L2 — Serveur

Événements `WonderCompleted`/`HammerSalvage`/`UnitsUpgraded` diffusés par le canal existant (filtrage fog via `eventRefs` enrichi — HammerSalvage réfère ville+propriétaire, UnitsUpgraded le joueur + ses unités). Dump admin : nouvelle section **`merveilles`** (union des techs mondiales, liste d'obsolescence calculée, par joueur : merveilles contrôlées / chantiers / jalons, récupérations de marteaux en attente). **Migration `schemaVersion` 13 → 14** : champ additif `pendingSalvage: 0` (R-130) ; `gpAccumFood` conservé dormant (C1) — idempotente, testée.

### L3 — UI + art

- **CityPanel** : signal **« ⚒ N marteaux récupérables — réaffectez la production ce tour, sinon ils seront dissipés ! »** (`pendingSalvage > 0`), badge **« · obsolète »** sur les merveilles possédées (union des techs — jalon conservé précisé au tooltip), menu de production des merveilles avec les mêmes validations que le moteur (exclusivité mondiale, obsolescence globale via `allKnownTechs` sur l'état filtré), **jauge `gpAccumFood` retirée** (C1), miroirs de rendements mis à jour (Cie des Indes dans `tileYield`, Troyes/Internet dans les gains or, Théâtre dans culture/tour).
- **UnitPanel** : bouton **Settle désactivé** quand la classe est déjà installée dans la ville cible (C3) avec tooltip ; Oracle et aperçus de combat évalués sur l'union des techs.
- **Game.svelte** : tooltip du compteur de jalons mis à jour vers la sémantique C2/R-131.
- **Toasts/journal** : `HammerSalvage` (« …30 marteaux récupérés… réaffectez-les ce tour » / « dissipés » — toast good/bad selon l'issue) et `UnitsUpgraded` (paires from → to) ; durées de playback ajoutées.
- **Art dédié des 6 classes GP** : fin des alias 7j — **10 nouveaux PNG** (`unite_artiste_penseur`, `unite_savant`, `unite_batisseur`, `unite_explorateur`, `unite_humanitaire` + accents ; `unite_leader` 7h conservé) dessinés dans `assets-src/tools/generate.py` (fusion palette+livre+béret pour Artiste/Penseur ; fiole+lunettes pour Savant ; tablier+marteau+plans pour Bâtisseur ; chapeau+besace+lunette pour Explorateur ; corbeille de pain pour Humanitaire), générés et synchronisés (`sync-art`, 153 fichiers). `LICENSES.md` à jour. Les alias runtime restent en fallback dans `textures.ts`.

## Tests

**613 verts** (rules 525 — dont **29 nouveaux** `phase7k.test.ts` citant R-128..R-133/C1-C3 : obsolescence globale + conservation culture/jalon, exclusivité mondiale + tie-break R-81, récupération (disponibilité, réaffectation, dissipation), Oxford seedé rejouable, Cie des Indes, Léonard (empire du propriétaire, vétéran conservé), Troyes/Internet/MAX, Complexe (+contrôle négatif Colon), Apollo (+obsolescence en cascade), Grande Bibliothèque (1v1 inerte + condition ≥2 rivaux), Grande Muraille (attaque/entrée ville/pas de mouvement/obsolescence/pas de blocage symétrique), Magna Carta par citoyen, C3, migration v14 —, web 53 dont 3 nouveaux libellés 7k, server 35), typecheck + build verts. ~35 tests préexistants mis à jour (schemaVersion 14, révisions C1/C2, liste des 18 merveilles actives).

## Session live (GUI vs bot sur 5174, partie 3AQAPU)

- Aucun serveur périmé (piège 7j vérifié d'abord) ; wrangler 8787 + vite 5174 relancés avec le code courant.
- **Partie réelle jouée 3 tours vs bot** (carte procédurale) : join du bot, fondation de ville, croissance (« c1 grandit — population 3 »), production, résolutions via le bouton « Fin de tour » de l'UI (avec le dialogue « unités sans ordre ») — **aucun crash, aucun écran mort**. Dump admin : **schemaVersion 14**, section **`merveilles`** complète (obsoletes, chantiers, récupérations), champ `pendingSalvage` présent, `gpAccumFood` dormant. Header : nouveau tooltip jalons C2. Captures : `dev-logs/captures-7k/` (3 captures).
- **Limite d'automatisation (identique à 7j, confirmée)** : les clics sur la carte ne répondent pas dans l'environnement d'automatisation — testés successivement clic CUA (input navigateur trusted), événements `pointerdown/up` dispatchés sur le canvas (reçus par l'élément, vérifié par espion) et balayage complet de la grille : **aucune sélection ne se produit**, y compris sur des cases ordinaires. Le dialogue Consume/Settle, le menu de production des merveilles (tooltips « exclusivité mondiale »/« obsolète »), le signal « marteaux récupérables » et les nouveaux sprites GP **en jeu** restent donc **à vérifier en ligne avec le login OAuth d'Erik**. Tous ces comportements sont couverts par les 613 tests (moteur pour les règles, libellés purs pour le journal ; les miroirs UI sont calqués sur les helpers moteur partagés `cultureGains`/`tileYield`/`wonderProductionIssue`/`allKnownTechs`).

## Valeurs 🔶 à calibrer (aucune recalibrée sans accord)

- `T-32 hammerSalvageWindow` = 1 tour (fenêtre de réaffectation R-130) ;
- Fenêtre R-130 : conservation **sans plafond** au coût du projet de réaffectation ;
- Tie-break de complétion simultanée : ordre `cityId` croissant (R-81) ;
- Oxford : pool = toutes les techs non débloquées (prérequis ignorés), table triée par id, RNG R-80 consulté en Phase C ;
- « Case océanique » = `ocean` seul (côte exclue) — libellé doc (« maritime ») vs handoff (« océanique ») ;
- Léonard : effet **une fois** à la complétion, chaîne `upgradeTo` complète, périmètre R-110 joueur (pas l'union) ;
- Grande Muraille : continuation forcée R-55/R-56-3 et collisions non bloquées (terminaison) ;
- Cumul Troyes/Internet : MAX (R-88) ;
- Coût ONU : doc 500 vs `T-28` 300 🔶 (7f) — **à trancher par Erik** ;
- Octrois de tech (Oxford/Apollo/Grande Bibliothèque) émettent `TechResearched` (46 événements pour Apollo — bruyant mais informatif 🔶).

## Reste (phases suivantes)

7l trésorerie (rush-buy — le « coût d'achat » du Complexe, Banque mondiale, canaux GP par or, injection d'or Explorateur) ; **Artefacts** (Angkor Wat, Arche d'Alliance, École de Confucius, Atlantide — phase séparée avec la génération procédurale, cf. périmètre interdit) ; 7m ICBM/SDI/contre-espionnage ; 7n civilisations ; Hollywood + flip culturel (territoire, en suspens d'Erik) ; rapports de recherche en attente : XP & promotions, territoire/conversion culturelle.

## Fin de session

Dev servers locaux et bot arrêtés. Rapport remis : main rendue au pilot. À vérifier en ligne par Erik : interactions de carte (sélection ville/GP, menu de production des merveilles, signal marteaux récupérables, Settle désactivé C3, sprites GP dédiés).
