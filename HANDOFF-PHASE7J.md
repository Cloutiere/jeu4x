# HANDOFF PHASE 7j — Personnages Illustres : classes canoniques, Consume & Settle

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**556 tests**), **la spec rédigée par Erik : [Civilization Revolution _ Merveilles et Personnages.md](Civilization%20Revolution%20_%20Merveilles%20et%20Personnages.md) — elle fait foi** (section « Les Grands Personnages », tableau Consume/Settle), `RULES.md` (R-113..R-116 culture & GP 7f, R-121..R-125 gouvernements & GP 7h, R-109 Premier découvrir). `schemaVersion` actuel : **12**. Sources croisées : CivFanatics [Great People](https://civfanatics.com/civrev/civilopedia/great-people/) et [StrategyWiki Famous People](https://strategywiki.org/wiki/Civilization_Revolution/Famous_People) (citées dans le doc).

**Contexte.** Les GP existent avec deux familles de canaux : culture empire (Artiste/Penseur en alternance 🔶, R-114) et accumulateurs par ville (Scientifique/Mogul/Ingénieur, R-123, plus Leader par victoires de combat T-31). Ils sont **installés automatiquement** — aucun choix de consommation possible. Le doc d'Erik révèle un modèle canonique plus riche que notre implémentation, avec **trois écarts majeurs** (D1–D3) et deux ajouts (D4–D5).

## Les divergences à corriger et les ajouts (valeurs du doc d'Erik)

### D1 — « Artiste / Penseur » est UNE seule classe (fusion, révision R-114)
Le tableau canonique traite **« Grand Artiste / Penseur »** comme une catégorie unique (Consume : conversion culturelle d'une cité ennemie ; Settle : +50 % de Culture dans la cité hôte). Notre alternance déterministe Artiste/Penseur 🔶 (R-114) n'a plus de raison d'être — elle devient obsolète. **Fusionner** en une classe `artiste_penseur` (ou équivalent), migrer les compteurs `greatPersonsByType` (`penseur` → fusion), **migration schemaVersion 12 → 13**. Cette décision répond à la question de calibrage en suspens (« alternance GP Artiste/Penseur ? ») : le doc tranche.

### D2 — Alignement des classes + création du Grand Humanitaire
Six classes canoniques, mapping avec notre moteur :

| Classe canonique (doc) | Notre type actuel | Consume | Settle |
|---|---|---|---|
| Grand Artiste / Penseur | `artiste` + `penseur` (fusion D1) | conversion culturelle — **inactif v1** (territoire en suspens, voir périmètre) | +50 % Culture cité (déjà 7f ? vérifier) |
| Grand Bâtisseur | `ingenieur` (renommé) | achève la production en cours | −50 % marteaux des futurs bâtiments de la cité |
| Grand Savant | `scientifique` (renommé) | achève la recherche en cours | +50 % Science cité |
| Grand Explorateur / Industriel | `mogul` (renommé) | injection d'or (50/100/200/400 selon l'ère) — **inactif v1** (pas de trésorerie, phase 7l) | +50 % Or cité |
| Grand Humanitaire | **NOUVEAU** | +1 pop à **toutes** les cités de l'empire | +50 % croissance de la cité hôte |
| Grand Leader | `leader` | toutes les unités militaires → Vétéran | nouvelles unités +3 XP (effet Caserne) |

**Canal d'obtention du Grand Humanitaire 🔶 (défaut : accumulateur « croissance » par ville** — excédent alimentaire cumulé, seuil T-xx data-driven calibrable, modèle R-123 ; alternative : rotation par le canal culture). Interdits : base 20 ×2 non recalibrée sans accord, aucune valeur durcie.

### D3 — Consume / Settle : le choix du joueur (nouvelle forme d'ordre)
À l'obtention d'un GP, le joueur choisit entre **Consume** (effet massif immédiat, le GP disparaît) et **Settle** (installation permanente dans une cité alliée, multiplicateur de rendement). **Piège connu : valider d'abord le validateur `orderShapeError` du GameDO pour la nouvelle forme d'ordre** (bug déjà coûté une phase). Effets exactement ceux du tableau ci-dessus (le doc fait foi). Les deux options inactives v1 (flip culturel, injection d'or) restent **sélectionnables mais grisées/libellées « reporté »**, ou absentes — au choix de l'agent, à documenter. Le jalon culturel est compté **à l'obtention**, quel que soit l'usage (vérifier le comportement 7f).

### D4 — Canon GP à vérifier/aligner
1. **Chaque GP obtenu compte comme un Jalon Culturel** (vérifier 7f — c'est notre modèle ?) ;
2. **Seuls les GP installés émettent la culture passive** (si nos installés émettent déjà via 7f, vérifier la mécanique ; les GP « en attente de choix » n'émettent rien) ;
3. **L'espionnage (7g) vole les GP installés** — vérifier la compatibilité avec les nouveaux types et l'état « en attente de choix » (un GP non installé ne peut pas être volé 🔶 à documenter) ;
4. **Modèle d'entité** : le doc décrit des unités civiles à 2 PM sur la carte ; notre modèle (compteurs + entités de ville, pas d'unité mobile) est **conservé** — écart documenté dans le rapport, ne pas implémenter d'unité mobile.

### D5 — Canaux d'obtention : extension Premier découvrir + ciblage technologique 🔶
1. **Premier découvrir (R-109)** : étendre le système existant — le doc accorde un GP gratuit au Premier découvreur de l'**Invention** et de la **Monarchie**. Vérifier les identifiants réels de ces techs dans notre `techs.json` et les correspondances manquantes (Féodalité, Chemin de fer, Machine à vapeur, Combustion — les figures du tableau s'y rattachent ; signaler toute tech absente de notre arbre). `firstDiscovery` doit accepter une récompense GP.
2. **Ciblage technologique de l'identité 🔶** : le doc précise que chaque figure historique est rattachée à une tech, et que rechercher cette tech augmente la probabilité d'obtenir cette figure au prochain jalon. **Défaut : pondération déterministe** (la figure de la tech en cours de recherche est priorisée, tie-break déterministe) — pas de nouveau RNG ; alternative : tirage seedé R-80. Table **`figures.json`** data-driven : classe, figures historiques, tech associée (libellés FR du doc).
3. **Canaux or (500 puis 10 000 pièces → GP gratuit) : reportés 7l** (trésorerie inexistante — ne pas implémenter).

## Mission — livrables dans l'ordre

### L0 — Règles réécrites (RULES.md, test-first)
Réécrire R-114 (fusion D1), compléter R-123 (6 classes), nouvelle règle **Consume/Settle** (identifiants R-126+), D5.1 (Premier découvrir GP). Tableau des 6 classes avec effets Consume/Settle exacts du doc, classes inactives v1 marquées. `figures.json` (classes + figures + techs).

### L1 — Moteur (test-first)
Fusion Artiste/Penseur + migration des compteurs ; renommages D2 ; canal Humanitaire 🔶 ; ordre `GreatPersonAction` (consume/settle + cible ville) + effets du tableau ; extension `firstDiscovery` ; ciblage 🔶. **Chaque test cite la R-xx ou la ligne du doc.** Valider `orderShapeError` AVANT le reste de L1.

### L2 — Serveur
Traitement de la nouvelle forme d'ordre, diffusion (événements GP obtenus/consommés/installés), filtrage fog, **migration schemaVersion 13** (fusion `penseur`), admin dump mis à jour.

### L3 — UI
À l'obtention d'un GP : **dialogue Consume/Settle** (libellés des deux effets, classes inactives grisées « reporté »), jauge GP mise à jour pour 6 classes, tooltips des GP installés (multiplicateur), toasts conseiller, bot (choix déterministe simple 🔶).

### L4 — Vérification & livraison
e2e (obtention par chaque canal, consume settle, vol d'installé par espion), GUI vs bot sur 5174 (rechargement complet — piège HMR), captures dans `dev-logs/`, déploiement (CI au push `main`), vérifier prod (curl health).

## Critères d'acceptation
- 6 classes implémentées, seuils data-driven, aucune valeur durcie ;
- Un GP obtenu ouvre le choix Consume/Settle ; les deux effets documentés s'appliquent exactement ;
- Le Grand Savant consume achève la recherche active ; le Bâtisseur consume achève la production ; l'Humanitaire consume fait +1 pop partout ; le Leader consume vétérans partout ;
- Un GP installé Bâtisseur réduit de 50 % les marteaux des futurs bâtiments de sa cité (test) ;
- Migration 12→13 sans perte (`penseur` fusionné) ; e2e jointure OK sur save migrée ;
- Baseline : tous les tests verts (≥ 556 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Merveilles** (effets restants, obsolescence GLOBALE, exclusivité, récupération de marteaux — phase 7k, doc §Merveilles) ; **trésorerie/or** (rush-buy, Banque mondiale, canaux GP par or, injection d'or Explorateur — 7l) ; **conversion culturelle/territoire** (flip Artiste consume, Hollywood — en suspens d'Erik) ; **civilisations & traits** (7n — clés préparées 7i ignorées) ; **ICBM/SDI, contre-espionnage** (7m) ; **artefacts** (Angkor Wat etc.) ; **SETI/DLC** (exclus v1) ; ne pas recalibrer les seuils existants sans accord d'Erik.

## Fin de session
Rapport `REPORT-PHASE7J.md` (décisions, écarts doc/moteur restants, valeurs 🔶 à calibrer, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
