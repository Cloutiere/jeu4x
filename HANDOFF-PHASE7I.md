# HANDOFF PHASE 7i — Alignement du moteur de ville sur Civ Revolution

Tu reprends le pilotage. **Préalables :** `HANDOFF.md` §4 (conventions), baseline `pnpm test` + `pnpm typecheck` verts (~543 tests), **la spec rédigée par Erik : [Moteur Ville Civilization Revolution.md](Moteur%20Ville%20Civilization%20Revolution.md) — elle fait foi**, `RULES.md` (§2 rendements, R-60 cases travaillées, R-63 croissance, R-66 bâtiments, R-112 Colon, R-113..R-116 culture, R-121..R-125 gouvernements). `schemaVersion` actuel : **12**. Sources croisées : CivFanatics [Info Center](https://civfanatics.com/civrev/infocenter/) et [Population](https://civilization.fandom.com/wiki/Population_(CivRev)) (citées dans le doc).

**Contexte : Erik a constaté que notre gestion des Colons/villes n'est pas alignée sur le jeu original — les villes fondées démarrent à population 2 (pas 1).** Le document révèle **cinq divergences majeures** à corriger, et te charge de **vérifier TOUS les éléments du moteur de ville** contre le doc (rendements, croissance, plafond, centre-ville, citoyens intérieurs) — liste les écarts, corrige ceux tranchés, signale les ambiguïtés.

## Les cinq divergences à corriger (valeurs du doc d'Erik)

### D1 — La nourriture se CONSOMME (refonte R-63)
Chaque citoyen consomme **1 nourriture par tour** ; seul le **surplus** (récolte − population) alimente la réserve de croissance. Notre R-63 actuelle accumule 100 % de la nourriture (v1 simplifiée) — **faux**. Conséquences : une ville pop 5 récoltant 4 N ne grandit plus (déficit −1) ; la « pompe à colons » du doc (§Impact Économique) devient possible.

### D2 — Seuils de croissance NON LINÉAIRES (refonte R-63)
Le doc décrit une progression **exponentielle non linéaire** (très bas aux premiers paliers, massifs aux grands paliers) **sans donner de chiffres**. À implémenter en **table data-driven** (`growth.json` : seuil par population cible 🔶 — propose une courbe exponentielle plausible, ex. doublante, et marque tout 🔶 pour le calibrage d'Erik). La ligne `10 × pop` actuelle disparaît. **Plafond absolu : population 31.**

### D3 — Villes fondées à pop 2, croissant avec l'ÈRE (refonte R-64)
Population initiale à la fondation : **Ère Antique 2, Médiévale 3, Industrielle 4, Moderne 5** — l'ère de l'empire = l'**ère la plus avancée des technologies débloquées** (champ `era` de `techs.json`, 7e). La ville fondée démarre avec **2 citoyens travaillant 2 cases** (auto-assignation R-60). Les capitales initiales des cartes : conformer au doc 🔶 (proposition : pop 2 aussi — à confirmer, les capitales préfabriquées le sont au chargement). **Chine +1, Rome Moderne 6, Mongols villages→villes pop 1** : champs de données `civilizations.json` (7j) — prévoir la clé, ignorer en 1v1 sans civils.

### D4 — Citoyens intérieurs : la table des tranches (nouvelle règle R-60bis)
Quand la population dépasse les cases exploitables (avant Tribunal, ou saturation), les citoyens non affectés deviennent **ouvriers intérieurs** au centre-ville avec un rendement **par tranche démographique** :

| Tranche de pop | Rendement par citoyen intérieur |
|---|---|
| 1-6 | +1 Production |
| 7-12 | +1 Production, +1 Commerce |
| 13-18 | +1 Production, +2 Commerce |
| 19-24 | +1 Production, +3 Commerce |
| 25-30 | +1 Production, +4 Commerce |
| 31 | +1 Production, +5 Commerce |

Les modificateurs de gouvernement (Fondamentalisme/Communisme, R-121) s'appliquent selon leur nature. **Réassignation** : un citoyen intérieur redevient travailleur de terrain dès qu'une case est disponible (Tribunal) — priorité à l'affectation extérieure, les intérieurs comblent le reste (ordre déterministe R-81).

### D5 — Fonder sur une ressource la DÉTRUIT (nouvelle règle)
Fonder une ville sur une case à ressource **détruit la ressource définitivement** (évenement `ResourceDestroyed` 🔶 libellé). UI : avertissement dans le panneau avant de fonder sur une case à ressource (l'info est connue du joueur si la case est visible).

### Corrections complémentaires du centre-ville (R-66 révisé)
- Le centre-ville garantit **au minimum 1 Production**, quel que soit le terrain ;
- Son **commerce évolue avec le palier démographique** (même table que D4 🔶 — proposer : le commerce du centre = valeur de la tranche) ;
- Plafond population **31** partout (croissance bloquée au-delà).

## Audit complet demandé

Au-delà des cinq points : **compare chaque élément du moteur de ville au doc d'Erik et à CivFanatics Info Center** — Grenier (le doc dit plaine 1→3, soit **+2 N** : vérifier notre valeur), Port, Aqueduc (seuil −33 % ✓ 7e), Jardins (+50 % pop ✓ 7f), Grand Humanitaire (capacité GP — **reportée 7j** avec les capacités GP), croissance après perte de pop (la réserve alimentaire est-elle conservée ou recalée ? le doc suggère « reconstituera » — trancher 🔶 et documenter). Liste les écarts trouvés dans le rapport : corrigés si tranchés par le doc, propositions 🔶 sinon.

## Mission — livrables dans l'ordre

### L0 — Règles réécrites (RULES.md, test-first)
R-63 révisée (D1+D2), R-64 révisée (D3+D5), R-60bis (D4), R-66 révisée (centre-ville), constantes et tables data-driven (`growth.json` 🔶, tranche-table 🔶).

### L1 — Moteur (test-first)
1. **Consommation** : `surplus = récolte − pop` (peut être négatif → 🔶 que fait-on en déficit ? Le doc ne couvre pas la famine — proposition : la réserve se vide, à 0 la croissance s'arrête, **pas de famine/décès** 🔶 documenté) ;
2. **Seuils** table `growth.json` ; cap 31 ;
3. **Fondation** : pop par ère (ère = max des ères des techs débloquées), 2 citoyens auto-assignés, destruction de ressource ;
4. **Citoyens intérieurs** : allocation déterministe (extérieur d'abord, intérieurs au centre, table par tranche) ; réintégration au Tribunal ;
5. Centre-ville : min 1 P, commerce par tranche ;
6. **Migration `schemaVersion` 12→13** si des champs persistent (probablement aucune : tout est calculé — documenter la décision) ;
7. **Settler pump testée** : ville pop 2 République → colon (−1 pop) → repousse en quelques tours (le doc §pompe).

### L2 — Serveur
Aucun nouveau contrat (tout est calcul moteur) ; vérifier `SetWorkedTile`/fondation/admin ; **bot** : sa stratégie de croissance s'adapte (la pompe à colons est optionnelle 🔶 — au minimum il ne doit pas s'étrangler avec la consommation).

### L3 — UI
1. **Panneau de ville** : ligne « Nourriture : récolte − population = surplus » (visible ! c'est le cœur pédagogique de l'alignement) ; jauge de croissance sur la nouvelle table ; **citoyens intérieurs affichés** (libellé de tranche : Ouvrier/Vendeur/Commerçant…) ;
2. **Avertissement de fondation** sur case à ressource ;
3. Centre-ville : rendements dynamiques dans le tooltip/panneau ;
4. Assets : rien de nouveau (icônes existantes) sauf éventuellement l'icône du travailleur intérieur.

### L4 — Vérification & livraison

1. **e2e moteur** : fondation pop 2 (2 citoyens assignés) → déficit alimentaire démontré (ville sans surplus ne grandit pas) → surplus → croissance → pop 7 avec Tribunal absent → citoyen intérieur Vendeur (+1 P +1 C) → Tribunal → retour au terrain → fondation sur ressource → ressource détruite → pompe à colons sous République.
2. **GUI locale vs bot** : la ligne récolte−pop visible, citoyen intérieur affiché, avertissement de fondation ; captures.
3. Déploiement prod via CI ; lister pour Erik les vérifications en ligne.

## Critères d'acceptation

1. Les cinq divergences corrigées et couvertes par tests citant D1-D5 (ou les R-xx renumérotées) ; l'audit complet des écarts consigné au rapport.
2. Tables data-driven (`growth.json`, tranches) — calibrage sans code ; cap 31.
3. Suites vertes (~543+), typecheck propre, migration documentée.
4. Déployé en prod, vérifié.

## Périmètre interdit (cette session)

Capacités des GP (Grand Humanitaire etc. — 7j), civilisations/traits (Chine/Rome/Mongols : clés préparées, 7j), conversion culturelle/territoire (en suspens), D2 (en suspens), sauts technologiques (en suspens), naval/espionnage (livrés — ne pas toucher sauf bug d'alignement documenté). Toute interprétation : documenter + signaler.

## Fin de session

Rapport habituel + arrêt et remise de la main. Suite prévue : **7j — Civilisations & traits, capacités des GP, rush-buy, contre-espionnage, ICBM/SDI, Grande Muraille**, puis **Phase 8 — polish/équilibre** (et les chantiers 3D/isométrique qu'Erik arbitrera).
