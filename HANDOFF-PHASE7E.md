# HANDOFF PHASE 7e — Arbre technologique complet & contenu terrestre

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~435 tests), `RULES.md` (§2, §3, R-85..R-108), `packages/rules/src/data/` (techs.json 9 techs, units.json, buildings.json, resources.json), le **PDF [CivRevTechTree_Official.pdf](CivRevTechTree_Official.pdf)** (l'arbre officiel complet) et **[CivFanatics — Buildings CivRev](https://civfanatics.com/civrev/civilopedia/buildings/)** (effets des bâtiments — déjà citée dans `Culture dans Civilization Revolution.md`). `schemaVersion` actuel : **8**.

**Mission d'Erik (02/09) : compléter l'arbre — toutes les unités, bâtiments et merveilles manquantes, associés à leurs technologies.** Décision de découpage du pilotage : cette phase couvre **l'arbre complet en données + tout le contenu TERRESTRE jouable** (unités terrestres y compris à distance R-59, bâtiments terrestres avec effets). Le **naval** (mécanique), **l'espionnage**, les **effets des merveilles** et la **culture moteur** (spec : `Culture dans Civilization Revolution.md`, tranche 7f suivante) sont hors périmètre — leurs **données** s'ajoutent dès maintenant (marquées non-constructibles / `implemented:false`), comme en 7a.

**La recherche documentaire est déléguée à toi** : PDF officiel + pages CivFanatics (units/buildings déjà référencées) — croise les sources, cite-les, marque 🔶 tout ce qui se calibre.

## AMENDEMENT 02/09 — Erik apporte la source principale : « Civilization Révolution Technologies et Déblocages.md »

**Ce document devient LA source principale de L0** — il remplace les hypothèses du handoff original :
- **46 technologies avec coûts EXACTS** (20 → 5860) et **prérequis multiples** (2-3 par tech, pas les chaînes simples proposées initialement) — ton travail = saisir fidèlement + marquer 🔶 les doutes, plus « inventer » ;
- **Bâtiments avec coûts exacts, effets exacts et PRÉREQUIS DE BÂTIMENT** (Banque ← Marché, Université ← Bibliothèque, Cathédrale ← Temple) — nouveau champ `requiresBuilding` + sémantique de **remplacement** : la Banque **retire** le Marché de la ville (idem Université/Bibliothèque, Cathédrale/Temple) ;
- **Quatre mécaniques révélées par le document** — défauts proposés :
  1. **Premier découvreur** (récompense gratuite au premier qui complète la tech : unité, bâtiment gratuit, bonus d'empire) → **INCLUS** : champ `firstToDiscover` par tech ; état `firstBy: Record<techId, playerId>` — **migration `schemaVersion` 8→9** ;
  2. **Obsolescence** (Guerrier obsolète après Travail du fer, Archer après Démocratie, etc.) → **INCLUS en données** (`obsoleteUnits[]` par tech) : retirés du menu de production, unités existantes conservées ; auto-surclassement 🔶 différé ;
  3. **Sauts technologiques** (majorité des prérequis + finissable ≤ 10 tours = accès direct) → **DIFFÉRÉ** (documenté dans RULES.md, implémentation 7f+) ;
  4. **Soutien naval** (un navire allié adjacent à un combat côtier ajoute son attaque : Galion 15, Croiseur 35, Cuirassé 65) → **7g** (données dès maintenant : `navalSupport` sur les unités navales).
- ⚠️ **Piège de lecture du document** : les chiffres sont collés aux numéros de citation — « 105 » = 10 [5], « 45 15 15 » = 4/1/1. Croise systématiquement avec CivFanatics ; les écarts (ex. coût d'Archer 10 ici vs 15 sur CivFanatics) se marquent 🔶.
- **Corrections immédiates de données existantes** : **Grenier = +2 N** (résout le point ouvert de la 6c), coûts de bâtiments exacts (Temple 40, Comptoir 60, Atelier 60, Tribunal 80, Mine de fer 80, Port 100, Remparts 100, Aqueduc 120…), **Remparts** = +100 % défense + immunité conversion (7f), **Aqueduc** = seuil de croissance −33 %.
- **Ères** (Ancienne/Médiévale/Industrielle/Moderne) : champ `era` sur les techs (utile à l'UI de l'arbre).
- **Question à poser à Erik** : les **Pionniers** CivRev coûtent 20 production et consomment **2 population** — notre Colon actuel est auto-consommé sans pop. Garder notre simplification ou adopter le comportement officiel ? (demander, ne pas trancher).

## Mission — livrables dans l'ordre

### L0 — Données de l'arbre complet (source principale : AMENDEMENT ci-dessus)

1. **`techs.json`** : les **46 technologies** du document avec coûts et prérequis exacts, `era`, `firstToDiscover`, `obsoleteUnits[]` — test-first sur l'intégrité (prérequis existants, sans cycle, coûts croissants par ère globalement).
2. **`units.json`** : toutes les unités restantes du tableau CivFanatics (déjà en appendice A de RULES.md) — **terrestres jouables** : Piquier (1/3/1, 15), Catapulte (4/1/1, 20, **à distance** R-59), Chevalier (4/2/2, 25), Fusilier (3/5/1, 20), Canon (6/2/1, 30, à distance), Infanterie moderne (4/8/1, 30), Char d'assaut (10/6/3, 50), Artillerie (16/2/2, 50, à distance) — **données seules** : Galère/Galion/Croiseur/Cuirassé/Sous-marin (naval — `aquatic`, 7g), Espion/Caravane (mécaniques 7g), Chasseur/Bombardier (aérien, 7g+), ICBM.
3. **`buildings.json`** : tous les bâtiments terrestres du CivFanatics avec **leur effet exact** (recherche + citation) — au minimum : Temple (Inhumation cérémonielle), Cathédrale (Religion), **Remparts** (Maçonnerie : +100 % défense de ville + immunité conversion — effet utile dès maintenant), **Aqueduc** (réduction du seuil de croissance 🔶), **Marché** (Curseur monétaire ? +% or 🔶), **Banque**, **Université** (+% science 🔶)… Les effets **culturels** (Temple/Cathédrale +1/+2 par pop) sont **décrits en données (`effect`) mais actifs en 7f** — libellés visibles, moteur « implemented: false ».
4. **`wonders.json`** : compléter les merveilles manquantes du PDF en données (effets décrits, `implemented:false` — leurs effets réels viendront en 7h avec la culture).
5. **Tests d'intégrité** : l'arbre complet sans cycles, tout débloquage référencé existe, cohérence des coûts > 0 ; **gel d'Erik respecté : Guerrier/Colon seuls au départ**.

### L1 — Moteur (test-first)

1. **Unités à distance (R-59)** — première implémentation réelle : attaque **depuis sa case** sans avancée (exception à R-52), aucun dégât en retour contre du mêlée, échange standard contre une autre unité à distance, repli systématique du défenseur à distance qui ne vainc pas. Portée `T-13` = 1 (adjacente) en v1.
2. **Effets de bâtiments** : Remparts (défense de ville : ajoute au `T-02` dans `S_def`, §7.4) ; Aqueduc (réduction du seuil de croissance R-63 🔶) ; +% or/science des bâtiments économiques (s'appliquent aux cumuls de ville avant répartition R-61) ; effets culturels `implemented:false` visibles dans les libellés.
3. Migration `schemaVersion` si nécessaire (probablement **aucune** : tout est donnée — documenter la décision).

### L2 — Serveur & bot

Rien de nouveau au protocole (tout est donnée + règles) ; vérifier `SetProduction` sur les items étendus ; **bot** : produit les nouvelles unités/bâtiments aléatoirement (filtrage R-87 inchangé).

### L3 — UI

1. **Production enrichie** : toutes les catégories (terrestre, bâtiments), libellés d'effets, items verrouillés avec leur tech.
2. **Unités à distance** : bouton Attaque sans déplacement (cible adjacente), indicateur « à distance » sur le panneau.
3. 🔶 **Vue de l'arbre technologique** dans le panneau de recherche : colonnes d'ères avec prérequis tracés (simple, statique) — proposer si tu juges utile, implémenter si trivial.
4. Assets via `generate.py` : ~8 sprites d'unités terrestres + emblèmes des nouveaux bâtiments (gabarits existants).

### L4 — Vérification & livraison

1. **e2e moteur** : recherche d'une ère complète → Piquier/Catapulte produits → Catapulte attaque **sans avancer ni subir de riposte** (R-59) → Remparts construits → défense de ville augmentée (PV d'un attaquant comparés avant/après, même seed).
2. GUI locale vs bot : produire et jouer une Catapulte, construire Remparts, parcourir l'arbre complet au menu de recherche.
3. Déploiement prod via CI ; lister pour Erik les points à vérifier en ligne.

## Critères d'acceptation

1. Arbre complet en données, intégrité verte, zéro cycle, calibrable sans code.
2. R-59 implémentée réellement (tests citant la règle : sans avancée, sans riposte mêlée, repli du défenseur à distance).
3. Effets de bâtiments terrestres actifs et testés (Remparts, Aqueduc, +% économiques) ; effets culturels en données, actifs en 7f.
4. Suites vertes (~435+), typecheck propre, déployé en prod.

## Périmètre interdit (cette session)

Naval jouable (7g), espionnage (7g), culture moteur + merveilles (7f — spec d'Erik prête), gouvernements (7h), civilisations/traits (7h), génération procédurale (6b livrée — ne pas la modifier sauf bug). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel + arrêt et remise de la main. Suite prévue au plan : **7f — Culture** (spec d'Erik), **7g — Naval & Espionnage**, **7h — Gouvernements & Civilisations + effets des merveilles**.
