# REPORT-FUSION-MENU-VILLE — CityPanel supprimé, ses bons éléments migrent dans la vue ville

**Mission exécutée intégralement.** Décisions d'Erik du 14/09 appliquées au pied de la lettre (HANDOFF-FUSION-MENU-VILLE.md). Validation locale en partie solo **AVANT tout commit** (règle établie) — captures dans `dev-logs/captures-fusion-menu-ville/`. **Pas de commit** (sur demande explicite d'Erik).

## État final

- **Tests : 1 152 verts** (rules 812 · web 265 — dont 11 nouveaux `fusion-menu-ville.test.ts` · server 75).
- **Typecheck 4/4.** `schemaVersion` **23 inchangée** (zéro migration — UI seule).
- Zéro gameplay : la sémantique R-90 (choix binaire or OU science par ville), le moteur, `orderShapeError`, le choix de production à onglets et le 3D sont intacts. Aucune règle modifiée, aucun ordre nouveau.

## M1 — Barres et contrôle de conversion dans CityView.svelte

Sources de vérité existantes uniquement — aucun calcul moteur nouveau. Les jauges sont des **fonctions pures** extraites dans `apps/web/src/lib/jauges.ts` (testables) :

1. **Nourriture — barre VERTE** (style de l'ancien panneau) : `city.foodStored / seuil` avec seuil = `growthThresholdFor(pop, réduction)` (R-63 : 10 × pop **actuelle** ; Aqueduc/Zoulous appliqués), remplissage plafonné [0, 1] ; plafond pop 31 → jauge pleine + libellé « Plafond de population atteint » (inchangé). Le tooltip porte le rappel ALIGNEMENT (aucune consommation) et le tooltip « Case de ville : aucun rendement » est porté.
2. **Culture — nouveau bloc « Culture de la civilisation »**, barre VIOLETTE : cumul **EMPIRE** (Σ `city.cultureCumulee`, jamais soustrait) vers le **prochain palier T-27** (`greatPersonThresholdFor(culturePaliers)`) + « N culture/tour (cette ville) » (`cultureGains` × `empirePerCityBonus` × effets de régime — miroir exact de l'ancien panneau, R-113).
3. **Construction — barre dans la carte Production** (existante, maintenant via `jaugeProduction`) : marteaux investis / coût de l'item en file + tours restants ; **état vide honnête** (« Aucune production en file. ») à zéro marteaux.
4. **Conversion R-90 INTERACTIVE (portage obligatoire)** : bouton « Convertit le commerce en : Or ⇄ / Science ⇄ » dans le bloc Sciences & or — même ordre `SetConversion`, même sémantique (action immédiate, modifiable en phase ordres même verrouillé), même formule d'affichage (`conversionGains` × Troyes/Internet × GP installés). Vérifié en jeu : la bascule reflète immédiatement les chiffres (captures 03/04).
5. **Flux portés « pas perdus »** (ils n'existaient QUE dans CityPanel) :
   - **RushBuy** (R-135) : bouton « ⚡ Acheter maintenant » dans la carte Production — coût `rushBuyCostOf`, interdits ONU/Banque mondiale, trésorerie, case de ville occupée (unités) — grisés avec raison honnête ;
   - **Réserve de marteaux** (R-130 rév. C7) : note ⚒ `pendingSalvage` dans Bâtiments ;
   - **GP installés** : chips avec effet (`settleEffectLabel`) ;
   - **Or direct Gemmes/Or** (R-134) dans le bloc Sciences & or.
6. **Non portés (décision d'Erik)** : les chips « (1,8) (2,6) » de citoyens — la carte et la vue ville font le travail.

## M2 — CityPanel supprimé, clic simple = sélection muette

- `CityPanel.svelte` **supprimé** (fichier + montage dans `Game.svelte`) ; plus aucune référence code (les mentions restantes sont des commentaires d'historique).
- **Clic simple sur une ville = `selectCity` (sélection muette)** — `clickAction` intouché : la sémantique utile est conservée (état sélectionné pour les worked tiles à la carte R-60, alternances unité/ville, re-clic = désélection).
- **Double-clic = vue ville** : inchangé (miroir `doubleClickAt` intact).
- **Aucun flux mort** : worked tiles à la carte (règle 1 de `clickAction` + `clickActionVueVille`) et tooltips ALIGNEMENT portés (M1.1) ; test qui verrouille l'absence de remontage (`fusion-menu-ville.test.ts` : ni `<CityPanel` ni l'import dans `Game.svelte`).

## M3 — Intacts (vérifié)

Les 3 sorties de vue ville (bouton Fermer exercé en jeu ; Échap et double-clic hors ville inchangés), la vue modale (menus masqués, clic = `clickActionVueVille`), le cadrage du rayon (`poseVueVillePour` et ses tests), le choix de production à onglets (aucune retouche).

## M4 — Tests nouveaux (`apps/web/tests/fusion-menu-ville.test.ts`, 11)

- **Barres** : seuil 10 × n (pop 2 → 20, pop 3 → 30), réduction de seuil, ratio plafonné [0, 1], plafond pop 31 (jauge pleine, `plafond: true`) ; culture = `greatPersonThresholdFor(paliers)` avec seuils croissants et plafond de remplissage ; production : progression partielle, plafond, coût infini/nul → jauge vide.
- **Clic simple sans panneau** : `clickAction` renvoie `selectCity` (et worked tiles/désélection inchangés avec la ville sélectionnée).
- **Double-clic inchangé** : `clickActionVueVille` assigne toujours dans le rayon.
- **Aucun flux mort** : `Game.svelte` sans CityPanel monté/importé ; `CityView.svelte` porte bien le SetConversion.

## M5 — e2e solo + captures (`dev-logs/captures-fusion-menu-ville/`)

Partie solo **BKZEYM** (FusionA vs bot, créée via `dev-logs/scripts/fusion-menu-ville-setup.mjs` — script conservé pour reproduction) ; citoyen réaffecté sur une case d'EAU (commerce 2) via la file d'ordres R-60 (`fusion-menu-ville-commerce.mjs`) pour rendre la bascule visible :

1. **01-clic-simple-sans-panneau.png** — clic simple sur Ville1 : sélection (worked tiles allumés), colonne de droite SANS aucun panneau de ville (seuls Unité/Journal/Vaisseau) ;
2. **02-vue-ville-trois-barres.png** — double-clic : vue ville avec la barre nourriture **12/20** (verte), culture **Palier 1 : 6/150** (violette), production **Guerrier 0/10** + bouton ⚡ porté ;
3. **03-conversion-or.png** — conversion **Or** : 0 sciences · **2 or/tour** ;
4. **04-conversion-basquee-science.png** — après clic ⇄ : « Convertit le commerce en : Science », chiffres permutés **2 sciences · 0 or/tour** (miroir exact du moteur) ;
5. **05-retour-carte.png** — sortie Fermer : carte à plat, UI de carte intacte, aucun panneau de ville.

## Révision v2 — retours d'Erik du 15/09

1. **Plaquettes empilées sur UNE colonne** (retour d'Erik : plus de 2 colonnes × 2 lignes) — nourriture, frontière culturelle, production, sciences & or se suivent verticalement (`.grid` 1 colonne).
2. **La barre de culture de la VILLE ne montre PLUS le palier T-27** (civilisation) : elle montre la progression de la **FRONTIÈRE CULTURELLE de la ville** (R-162) — culture cumulée de la ville vers le **prochain anneau** (seuils 10/100/1 000/10 000, plafond 5 anneaux, `rayonCulturelDe`/`frontierRadius` — sources moteur). Nouvelle jauge pure `jaugeFrontiereCulturelle` (jauges.ts) : anneaux courants, prochain seuil, ratio entre seuils consécutifs, plafond honnête. Libellé : « Anneau N : X / seuil » + « N anneau(s) — prochain seuil S · C culture/tour (cette ville) ».
3. **La barre du PALIER T-27 migre au menu d'empire** (GovernmentPanel, section « Culture de la civilisation » sous la liste des régimes) : cumul EMPIRE / `greatPersonThresholdFor(paliers)` — inchangé sémantiquement (GP-CULTURE-EVENEMENTS D1).

**Tests v2 : 1 155 verts** (web 268 — +3 `jaugeFrontiereCulturelle` : progression inter-seuils, miroir `rayonCulturelDe`, plafond). Typecheck 4/4. Captures `dev-logs/captures-fusion-menu-ville/06-vue-ville-une-colonne-frontiere.png` (une colonne + « Anneau 1 : 8/10 ») et `07-menu-empire-palier-t27.png` (palier 8/150 au menu Gouvernement). Validation solo BKZEYM avant commit (règle établie).

## Révision v3 — retours d'Erik du 15/09 (après compréhension validée avec lui)

**Concept visuel de la plaquette Nourriture étendu à Culture et Production** — chaque plaquette = 3 éléments dans le même ordre :
1. **logo + production/tour** (Nourriture +X/tour · Culture +N culture/tour · Production N marteaux/tour) ;
2. **prochain seuil en X tours** (population · anneau culturel · item en file — ETA via la nouvelle jauge pure `toursAvantSeuil`, ceil du reste au rythme courant, null → libellé honnête « à l'arrêt ») ;
3. **logo + avancement / total** avec la barre (réserve/seuil · cumul/anneau · marteaux/coût).

Sciences & or reste tel quel (validé avec Erik). Capture `08-concept-trois-lignes.png` (Vue1 pop 3 : +4/tour → 8 tours → 0/30 ; +3 culture/tour → 29 tours → 13/100 ; 3 marteaux/tour → Guerrier dans 3 tours → 2/10). **Tests : 1 157 verts** (web 272 — +2 `toursAvantSeuil`). Typecheck 4/4, zéro gameplay.

## Arbitrages 🔶 (à l'œil par Erik)

- Placement : jauge nourriture SOUS la ligne « Prochaine population », culture en bloc distinct à droite de Nourriture, conversion en bouton pleine largeur sous les chiffres or/science, RushBuy sous la carte Production.
- Les barres reprennent les couleurs de l'ancien panneau (vert croissance, violet culture, jaune production).

## Reste à vérifier en ligne par Erik

- Le style des 3 barres et le placement des blocs (🔶 à l'œil) ;
- le bouton RushBuy sur une vraie partie avec trésorerie (grisé « trésorerie insuffisante » dans la capture 02 — 0 or) ;
- réserve de marteaux et GP installés sur une partie plus avancée.

## Notes d'environnement

- Vite servait déjà le code à jour sur le port 5174 (instance préexistante) ; le worker wrangler lancé pour la validation a été arrêté en fin de session.
- Clics UI dans le navigateur intégré : le clic Playwright n'atteignait pas les boutons au-dessus du canvas (calque) — passés par `evaluate` (uniquement pour la validation, aucun code produit touché).
