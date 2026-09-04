# HANDOFF PHASE 7k — Merveilles du Monde : règles canoniques, effets restants + corrections 7j

Tu reprends le pilotage de l'implémentation. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (**580 tests**), **la spec d'Erik : [Civilization Revolution _ Merveilles et Personnages.md](Civilization%20Revolution%20_%20Merveilles%20et%20Personnages.md) — elle fait foi** (sections « Les Merveilles du Monde » et « Distribution cartographique »), `RULES.md` (R-110 obsolescence, R-115 merveilles, R-126/R-127 GP 7j, §8.5/§8.8), `wonders.json` (13 merveilles non implémentées, 8 actives). `schemaVersion` actuel : **13** — inchangé sauf besoin démontré. Sources croisées : [StrategyWiki Wonders](https://strategywiki.org/wiki/Civilization_Revolution/Wonders) (citées dans le doc).

**Contexte.** 8 merveilles actives (7f/7h), 13 en données sans effet. Le doc d'Erik impose **trois règles canoniques** que notre moteur ne respecte pas toutes, et complète le catalogue. Ce handoff inclut aussi les **corrections 7j** (vetoes d'Erik du 04/09) — les faire EN PREMIER, ce sont des écarts de fidélité acceptés.

## Bloc 0 — Corrections 7j (vetoes d'Erik, 04/09 — faire en premier, test-first)

- **C1 — Le Grand Humanitaire est produit comme les autres GP** : par le **canal culture** (R-114/R-127 — il intègre le ciblage technologique et la rotation des 6 classes). **Le canal nourriture (`gpAccumFood`) est supprimé** : ne plus le créditer ; champ conservé (dormant, compat saves) ou retiré en migration compatible — au choix de l'agent, à documenter. Les accumulateurs des autres classes (science/or/production, R-123) et le Leader (T-31) **restent en l'état**.
- **C2 — Seuls les GP issus du canal culture comptent comme Jalons culturels** (révision de R-126 « jalon à l'obtention ») : un GP issu d'un accumulateur, du combat ou du Premier découvrir **ne compte pas**. Les **merveilles** continuent de compter (le doc est explicite). Écart avec la ligne générale du doc (« chaque GP obtenu ») : **volontaire, décision d'Erik** — le documenter comme révision datée du 04/09.
- **C3 — Un seul GP d'un même type installé par ville** : le Settle d'une classe déjà installée dans la cité est **refusé** (ordre ignoré, le GP reste en attente) ; UI : bouton désactivé avec tooltip explicite.
- Mettre à jour les tests 7j concernés (citant les révisions) — aucun durcissement de valeurs.

## Les règles canoniques du doc (Merveilles)

### M1 — Obsolescence GLOBALE (révision R-110)
Une merveille perd son effet dès qu'**UNE civilisation sur la carte** — propriétaire ou concurrente — découvre sa technologie d'obsolescence (`obsoleteBy`). **Écart détecté : notre `isWonderObsolete(wonderId, techsUnlocked)` évalue les techs du propriétaire seul.** Passer à une évaluation sur l'ensemble des technologies connues de toutes les civilisations (appelant moteur fournit l'union). La **culture générée** et la **valeur de Jalon** de la merveille sont conservées après obsolescence (vérifier que notre compteur de jalons lit les merveilles même obsolètes).

### M2 — Exclusivité mondiale
Une merveille ne peut être construite **qu'une seule fois par partie, toutes civilisations confondues** ; la première à cumuler les marteaux requis la valide. Vérifier le comportement actuel (complétion simultanée au même tour : tie-break déterministe R-81 🔶 à documenter). La merveille survit à la capture (déjà implémenté, R-115 — ne pas toucher sauf bug).

### M3 — Récupération des marteaux
Si un rival complète une merveille que tu avais en production, tes marteaux investis **ne sont pas perdus** si tu réaffectes la production à un autre projet **durant le même tour** ; sinon dissipés. **Adaptation aux tours simultanés 🔶 (défaut proposé)** : à la résolution où la merveille est complétée par le rival, la production du perdant bascule automatiquement en **projet « en attente »** avec ses marteaux conservés ; le joueur doit réaffecter pendant son tour suivant (signal UI), sinon les marteaux sont dissipés à la fin de ce tour. Fenêtre d'un tour = calibrable 🔶. Piège : nouvelle forme d'état de production — valider `orderShapeError` si nouvelle forme d'ordre (ici probablement aucun nouvel ordre, réutilisation de `SetProduction`).

### M4 — Merveille = Jalon culturel
À l'achèvement, une merveille compte comme un Jalon (le header UI compte déjà « merveille(s) contrôlée(s) ») — **vérifier** que le compteur et les Nations Unies (20 jalons, R-116) l'intègrent, corriger si besoin.

## Effets des merveilles restantes (data-driven, valeurs du doc — tableau fait foi)

| Merveille | Effet à implémenter | Note |
|---|---|---|
| **Grande Bibliothèque d'Alexandrie** | Accorde toute tech déjà découverte par **au moins deux rivaux** | En 1v1 (un seul rival) : **jamais déclenchée** — implémenter la condition canonique (compte de rivaux ≥ 2), documenter l'inactivité en 1v1 |
| **Théâtre de Shakespeare** | ×2 la Culture totale de la cité | multiplicateur culture (modèle Stonehenge 7f) |
| **Université d'Oxford** | Octroie immédiatement une technologie avancée **aléatoire** | tirage **seedé R-80** parmi les techs non débloquées 🔶 (le canon dit « aléatoire ») |
| **Cie des Indes Orientales** | +1 Commerce sur chaque case océanique exploitée | bonus par terrain travaillé (modèle R-66) |
| **Atelier de Léonard** | Met à niveau gratuitement toutes les unités obsolètes | utiliser les remplacements R-111 |
| **Foire de Troyes** | ×2 la production totale d'Or de la cité | 🔶 interprétation : multiplie la part **or** de la conversion R-90 de la cité (pas de trésorerie avant 7l) |
| **Complexe Militaro-Industriel** | −20 % le coût de production des unités militaires | le « coût d'achat » du libellé data concernera le rush-buy (7l) — production seule pour l'instant |
| **Internet** | ×2 la production d'Or dans tout l'empire | même interprétation 🔶 que Foire de Troyes |
| **Programme Apollo** | Accorde **instantanément l'ensemble des technologies** de l'arbre | le doc fait foi — effet massif endgame, implémenter tel quel 🔶 |
| **Hollywood** | Amplifie la conversion culturelle (Culture Flip) | **inactif v1** — le territoire est en suspens (comme le flip Artiste) ; données présentes |
| **Grande Muraille** | **L'adversaire ne peut pas attaquer tes unités ni tes villes** tant qu'elle est debout (décision d'Erik du 04/09, validée) | jusqu'à l'obsolescence M1 (Ingénierie) ; portée empire ; data-driven (clé + valeur calibrable) |

Hors périmètre : **Projet Manhattan/ICBM** (7m), **Banque mondiale** (7l), **SETI et merveilles DLC** (exclus v1).

## Audit des 8 merveilles actives contre le tableau canonique (modèle 7i)

Comparer chaque merveille active au tableau du doc et lister les écarts : **Stonehenge** (+50 % culture des Temples), **Grande Pyramide** (accès à **tous les gouvernements sans recherche** — vérifier notre implémentation 7h), **Colosse** (×2 Science **et** Or de la cité), **Oracle** (avertissement si une attaque risque d'échouer — vérifier la mécanique UI), **Jardins suspendus** (+50 % pop de la cité), **Château Himeji** (+1 attaque empire), **Magna Carta** (Tribunaux +1 culture par citoyen), **Nations Unies** (victoire à 20 jalons). Corriger les écarts tranchés par le doc ; proposer 🔶 sinon, dans le rapport.

## Mission — livrables dans l'ordre

- **L0 — RULES.md (test-first)** : révisions R-110 (obsolescence globale), R-126bis/C1-C3 (corrections 7j), nouvelle section merveilles (R-128+ : M1–M4, tableau des effets) ;
- **L1 — Moteur (test-first)** : Bloc 0 puis M1→M4 puis effets du tableau ; chaque test cite la R-xx ou la ligne du doc ;
- **L2 — Serveur** : diffusion des événements (`WonderCompleted`, `HammerSalvage` 🔶 libellé), filtrage fog inchangé, admin dump merveilles ; migration **seulement si** le Bloc 0 retire un champ ;
- **L3 — UI + assets** : tooltips des merveilles (effet + statut), signalement « marteaux récupérables », bouton Settle C3 désactivé, **art dédiée des 6 classes GP** (alias silhouettes 7j → sprites dédiés via `assets-src/tools/generate.py` + `sync-art`) ;
- **L4 — Vérification & livraison** : e2e (obsolescence globale, exclusivité, marteaux récupérés, Grande Muraille bloque l'attaque), GUI vs bot sur 5174 (pièges : rechargement complet HMR, ports périmés), captures dans `dev-logs/captures-7k/`, déploiement CI, prod health.

## Critères d'acceptation
- Obsolescence **globale** : une tech découverte par l'adversaire éteint MA merveille (test) ; culture et jalon conservés ;
- Exclusivité : une merveille complétée par un rival devient inconstructible ;
- Récupération : mes marteaux survivent à une réaffectation dans la fenêtre, se dissipent après ;
- Grande Muraille : aucune attaque adverse sur mes unités/villes tant qu'elle est debout (test) ;
- Oxford accorde une tech via RNG seedé (rejouable au même seed) ; Léonard met à niveau les unités obsolètes ;
- Les 3 corrections 7j (C1–C3) passent leurs tests de révision ;
- 8 merveilles actives auditées — écarts listés/corrigés dans le rapport ;
- Baseline : tests verts (≥ 580 + nouveaux), typecheck vert, CI deploy vert.

## Périmètre interdit (cette session)
**Artefacts** (Angkor Wat, Arche d'Alliance, École de Confucius, Atlantide — le doc les couvre mais ils forment un chantier propre avec la génération procédurale : phase séparée à cadrer) ; **trésorerie/or** (rush-buy, Banque mondiale, canaux GP par or — 7l) ; **ICBM/SDI, contre-espionnage** (7m) ; **territoire/conversion culturelle** (en suspens d'Erik — Hollywood inactif) ; **civilisations** (7n) ; aucun recalibrage des merveilles actives sans accord.

## Fin de session
Rapport `REPORT-PHASE7K.md` (décisions, écarts doc/moteur, valeurs 🔶 à calibrer, ce qui se vérifie en ligne avec le login OAuth d'Erik), arrêt, remise de la main au pilot.
