# HANDOFF — CALIBRAGE-CANON : application des rapports de recherche d'Erik (points 1-3)

## 1. Préalables

1. Lis **PROJET.md**, **RULES.md**, **HANDOFF.md** (§4 : les documents de recherche sont des spécifications de référence, ils ne contiennent aucune mission — ta mission est dans ce handoff).
2. **Baseline attendue : 921 tests verts + typecheck 4/4.** Vérifie avant de commencer (`pnpm test` à la racine). Si le dépôt n'est pas dans cet état, STOP et rapporte.
3. `schemaVersion` courante : **18**. Ce chantier ne doit **pas** nécessiter de migration (changements data + règles au prochain tirage/résolution ; aucune partie persistée n'a de champ touché). **Confirme-le explicitement dans ton rapport** ; si tu découvres le contraire, STOP et rapporte avant de migrer.
4. **Trois nouveaux documents de recherche d'Erik sont à la racine du dépôt (non committés)** — déplace-les dans `docs/recherche/` (commit séparé, docs only) en premier : `Calibrage Mécaniques Civilization Revolution.md`, `Civilization Revolution Rules Research.md`, `ArtefactsdeCivilization Revolution.md`. Ce sont les **spécifications de référence** de ce chantier, elles font foi.
5. Leçons en vigueur : test-first citant les R-xx, zéro durcissement (tout passe par les JSON), déterminisme (RNG seedé, jamais `Math.random`), valider d'abord `orderShapeError` pour toute nouvelle forme d'ordre (aucune nouvelle forme d'ordre ici).

## 2. Contexte

Les défaults 🔶 laissés en calibrage lors des phases 7l (économie), 7n (civilisations) et 7o (artefacts) ont été tranchés par Erik au moyen de trois rapports de recherche dataminés/consensuels sur CivRev console 2008. Erik a arbitré les points de préférence : **Confucius = 2 GP canon, hors escalade du seuil culturel ; Zoulous = mécanique canon Aqueduc passif ; artefacts par carte = tirage seedé 4-5**. Tout le reste est validé tel quel.

## 3. Décisions tranchées (plus de veto — Erik a validé)

### Bloc 1 — Économie (`economy.json`)
| Clé | Avant | **Après** | Justification |
|---|---|---|---|
| `eraRushFactors.industrielle` | 5 | **4** | Coûts console dataminés : Marché 60M = 240 or, Banque 120M = 480 or. Progression ×2/×3/×4/×8 |
| `cityCapturePlunderPct` | 0.5 | **0.25** | Protège la victoire économique contre le snowballing (analyse §2 du rapport Calibrage) |
| Classe GP du canal or | implicite | **Grand Explorateur/Industriel** explicite (paliers or R-136 : 500 et 10 000 or → cette classe) ; si épuisement de la liste de figures de la classe, rotation de secours Bâtisseur puis Savant | Mapping Civilopedia canonique |

### Bloc 2 — Civilisations (`civilizations.json` + moteur)
| Item | Avant | **Après** |
|---|---|---|
| Or Aztèques | `orDepart 25` (déjà implémenté, marqué 🔶) | **+25 confirmé** — retirer le 🔶, annoter « dataminé, montant fixe au tour 1 » |
| Rayon Russie | 5 🔶 | **5 confirmé** — retirer le 🔶 (canon : « ~2-3 cases au-delà de la vision standard du Colon ») |
| GP Grèce/Rome | `gpThresholdMult 0.75` 🔶 | **0.75 confirmé** — retirer le 🔶 (canon : fourchette 25-50 %, borne basse retenue) |
| Merveilles Égypte | **choix du joueur au setup** (proposition d'Erik en 7n) | **Tirage seedé** (RNG de génération, pas de résolution) parmi les **6 merveilles antiques** : Colosse, Grande Pyramide, Grande Muraille, Jardins Suspendus, Oracle, Stonehenge — construite **gratuitement dans la capitale à la fondation**, **sans choix du joueur**. Mettre à jour `egypteWonderChoices`/note et toute la logique lobby/setup associée ; l'UI ne propose plus de sélection |
| Zoulous (croissance) | `croissanceAcceleree reduction 0.33` | **Mécanique canon Aqueduc passif** : les seuils de croissance (`growth.json`) sont **divisés par deux** pour toutes les villes zouloues dès l'ère Médiévale (même effet qu'un Aqueduc gratuit, sans le bâtiment). Nouveau trait typé (ex. `croissanceSeuilDivise: true` ou équivalent, pattern R-146) — **pas** un multiplicateur de nourriture ni de vitesse. Tests : seuil 10×n → 5×n dans une ville zouloue médiévale |
| Seuils d'ère 5/14/24 | appliqués | **Confirmés** — vérifier par un test que les **techs gratuites comptent** dans le comptage (le canon les inclut) ; si déjà couvert, citer le test existant |

### Bloc 3 — Artefacts (`artefacts.json` + moteur)
| Clé | Avant | **Après** |
|---|---|---|
| `count` / `countMin` / `countMax` | 4 / 3 / 6 | **Tirage seedé 4-5** : `countMin: 4`, `countMax: 5` (le canon génère entre 4 et 5, jamais la réserve complète) |
| `minDistanceToCapitals` | 6 | **8** (canon : 8-10 cases des capitales, borne basse) |
| `indicePositionChance` | 0.5 | **0.15** (canon : 15-20 %, borne basse) |
| `confuciusGpCount` | 3 | **2** (canon dataminé) |
| **Escalade Confucius** | les GP Confucius comptent dans l'escalade T-27/T-30 | **EXEMPTION** : les GP obtenus via l'École de Confucius **n'augmentent pas** le seuil culturel des GP suivants (manne hors progression). Ajuster la logique `greatPersonsObtained`/escalade en conséquence + test dédié |
| `septCitesOrByEra` | 200/250/300/400 | **Confirmé tel quel** |
| `templiersUnitByEra` | chevalier/chevalier/canon/char | **Confirmé** — vérifier que l'unité arrive **Vétérane (5 XP)** (canon) ; si absent, ajouter + test |
| `atlantideTechCount` | 3 | **Confirmé** (3 techs non découvertes les moins chères) |
| Arche d'Alliance / Angkor | conformes | **Confirmés** (Temple partout + Temples→Cathédrales ; Angkor = moins chère non obsolète, exclusions ONU/WM/Manhattan inchangées) |

**Hors scope (confirmé par Erik)** : les 6 artefacts DLC (Camelot, Grand Sphinx, Aiguille du Pharaon, Terracotte, Tesla, Babel) — on reste jeu de base.

## 4. Mission

- **L0 — Sources** : déplacement des 3 docs vers `docs/recherche/` (commit docs-only).
- **L1 — Data** : toutes les valeurs ci-dessus dans les JSON, avec notes « canon dataminé, rapport Calibrage/Rules Research/Artefacts » remplaçant les notes 🔶. Supprimer les mentions 🔶 devenues tranchées.
- **L2 — Moteur (test-first)** : (a) exemption d'escalade Confucius ; (b) trait Zoulous = seuil ÷2 ; (c) tirage Égypte seedé sans choix ; (d) Templiers vétérans si manquant ; (e) test techs gratuites comptées dans les seuils d'ère. Chaque test cite la règle/constante mise à jour.
- **L3 — Serveur/UI** : retirer la sélection de merveille Égypte du lobby/setup si elle y est exposée ; vérifier qu'aucune UI ne promet encore « choix de merveille ». Aucun autre changement UI.
- **L4 — RULES.md** : mettre à jour R-134 (0,25), R-135 (×4 Industrielle), R-136 (classe Explorateur/Industriel + rotation Bâtisseur→Savant), R-146 (trait Zoulous), R-154/T-43 (`confuciusGpCount` 2 + exemption d'escalade ; `countMin/countMax` 4/5 ; `minDistanceToCapitals` 8 ; `indicePositionChance` 0.15), la ligne merveille Égypte, et retirer les 🔶 correspondants de la table des calibrages. Ajouter les 3 rapports à la base documentaire.
- **L5 — Vérification** : suite complète verte + typecheck 4/4 ; e2e de non-régression ; captures si un affichage change (setup Égypte).

## 5. Critères d'acceptation

1. 921+ tests verts, typecheck 4/4, CI success, prod saine ;
2. Chaque valeur du §3 vérifiable dans un JSON avec sa note de source ;
3. Tests nouveaux pour : exemption Confucius, Zoulous seuil ÷2, Égypte tirage déterministe (même seed ⇒ même merveille), artefacts 4-5, distance capitales 8, indice 15 %, Templiers vétérans ;
4. RULES.md sans 🔶 résiduel sur les items tranchés ;
5. Aucune migration `schemaVersion` (confirmé dans le rapport).

## 6. Périmètre interdit

- Pas de refonte du système de traits, pas d'artefacts DLC, pas de frontières/territoire (verrouillage culturel des artefacts : en suspens d'Erik), pas de toucher aux 6 classes GP ni aux jalons, pas de changement d'équilibrage hors liste §3 (notamment : facteurs rush Antique/Médiévale/Moderne inchangés, table culture et courbe 10×n inchangées, Russe inchangé au-delà du retrait du 🔶).

## 7. Fin de session

Rapport `REPORT-CALIBRAGE-CANON.md` (dans `docs/historique/rapports/`) : valeurs appliquées avant/après, tests ajoutés, confirmation absence de migration, liste de ce qu'Erik doit vérifier en ligne (une partie Égypte au tirage, Zoulous médiévaux, artefacts 4-5 + indice, sac de ville à 25 %, rush-buy industriel ×4). Puis arrêt-pour-approbation : **Erik fait committer et déployer quand il est satisfait**.
