# HANDOFF-ALIGNEMENT-CROISSANCE — Réalignement sur le vrai CivRev (consommation 0, seuils 10×pop, case de ville 0/0/0)

**Chantier gameplay prioritaire du chapitre 2D** — AVANT MENU-VILLE (les chiffres du futur menu de ville dépendent de ces règles). Source : partie réelle de CivRev jouée par Erik le 13/09, trois écarts constatés contre le moteur (7i/CENTREVILLE). **Les valeurs d'Erik font foi** — les phases antérieures qui les contredisent sont révisées.

## 1. Préalables

1. Lire `RULES.md` (R-63 croissance et ses révisions, R-64 fondation, R-66 socle centre-ville, R-88 citoyens intérieurs, R-113 culture), `PROJET.md` (§pivot), `PILOT-HANDOFF.md` §3-§4.
2. Baseline : suite verte (**1069 tests**), typecheck 4/4, `schemaVersion` **20** (aucune migration attendue — voir M4), `git status` propre.
3. **Test-first** : chaque révision de règle est d'abord écrite en tests citant la règle révisée, puis le moteur. Déterminisme R-80/R-81 inchangé.

## 2. Contexte — les trois écarts (valeurs d'Erik, faites foi)

1. **Les citoyens ne consomment AUCUNE nourriture** — le moteur (7i · D1 : chaque citoyen consomme 1/tour) est CONTREDIT et révisé : surplus alimentaire = nourriture produite, point.
2. **Seuils de croissance = 10 × population actuelle** — vérifié par Erik en jeu : 2→3 = 20 (10 tours à 2/tour), 3→4 = 30 (15 tours à 2/tour), « et ainsi de suite ». La table actuelle (`growth.json` `growthThresholds` : « 2 »: 10, « 3 »: 20, « 4 »: 30…) est décalée de 10 : la nouvelle table = `10 × pop actuelle` (« 2 »: 20, « 3 »: 30, …, « 31 »: 310 🔶).
3. **La case de ville ne génère RIEN** — 0 nourriture, 0 production, 0 commerce. Le socle CENTREVILLE (R-66 rév. : plancher 1N/1P/1C sur tout terrain) est **abrogé**. Une ville fraîchement fondée (pop 2) ne produit donc que par ses **citoyens intérieurs** et ses tuiles travaillées.

## 3. Mission

### M1 — Données (zéro durcissement)
1. `growth.json` : `growthThresholds` recalée (10×pop actuelle) ; `cityCenter.floor` supprimé ou mis à 0/0/0 (l'agent choisit la forme la plus propre, le plancher non plafonnant disparaît) ; tout le reste (`founderPopByEra`, `interiorCitizens`, `populationCap`) INCHANGÉ — y compris les citoyens intérieurs (R-88 : jamais contestés par Erik).
2. Libellés `effect`/tooltips data mis à jour.

### M2 — Moteur (test-first)
1. `growth.ts` / `turn.ts` : la consommation par citoyen est supprimée (surplus = production) ; les tests 7i qui incarnent la consommation sont RÉÉCRITS (l'ancien comportement est contredit par la réalité du jeu — précédent DEPLACEMENT-PLANIFIÉ R-41) ; les seuils sont contrôlés contre les ancres d'Erik (2→3 = 20, 3→4 = 30 ; exemple 10 tours à 2/tour vérifié).
2. `tileYield` (R-66/`economy.ts`) : la case de ville rapporte 0/0/0 — plus de plancher ; les tests CENTREVILLE (Égypte-désert dépasse, etc.) sont réécrits pour le nouveau contrat (la ville ne produit que par worked tiles + citoyens intérieurs).
3. Effets induits à VERROUILLER par tests, sans les changer : GP Humanitaire (canal `gpAccumFood` = surplus alimentaire — fonctionne avec surplus non consommé, vérifier le pacing 🔶 et consigner) ; Colon R-112 (2 pop à la production — inchangé) ; paliers or R-136 (inchangés) ; le bot (aucune hypothèse de consommation attendue — vérifier ses villes en e2e).

### M3 — UI
1. `CityPanel.svelte` et tout tooltip « récolte − population » : la ligne de consommation disparaît ; l'affichage montre **production** et **tours avant croissance** calculés sur la nouvelle table (le futur MENU-VILLE réutilisera ces helpers purs — les exposer proprement, ex. `toursAvantCroissance(city)`).
2. Tooltips de la case de ville : 0/0/0 (aucun rendement), cohérent avec les glyphes (la case de ville n'affiche plus de glyphes de rendement si c'est le cas).

### M4 — Vérification
1. Suite verte complète forcée ; `schemaVersion` **20 inchangée** (aucun changement de forme d'état attendu — si l'agent en trouve un besoin, STOP et consigner dans le rapport avant de continuer).
2. e2e + partie solo (captures `dev-logs/captures-alignement-croissance/`) : fondation pop 2 → surplus = nourriture des tuiles travaillées ; croissance 2→3 en 20 nourriture ; case de ville sans rendement ; partie existante reprise sans erreur.
3. Relecture croisée des révisions : `RULES.md` reste intouché (le pilotage le met à jour à l'acceptation).

## 4. Critères d'acceptation

- Aucun citoyen ne consomme de nourriture ; les seuils valent 10×pop actuelle (table data-driven) ; la case de ville rapporte 0/0/0.
- `founderPopByEra`, `interiorCitizens`, R-112 Colon, R-136, le bot et la culture (R-113) inchangés et verts.
- Suite verte forcée, typecheck 4/4, `schemaVersion` 20, zéro diff 3D.

## 5. Périmètre interdit

- MENU-VILLE (chantier suivant — aucun composant de menu modifié au-delà des tooltips alimentaires M3) ;
- Les citoyens intérieurs R-88, la fondation par ère, le workRadius (6/18, Tribunal), l'économie or R-134..R-136, la culture R-113/R-162 ;
- Le 3D (contrainte dure, même règle que ZONE-CULTIVEE) ; les seuils GP T-27.

## 6. Fin de session

**Validation locale avec captures AVANT tout commit** (règle établie). Rapport `REPORT-ALIGNEMENT-CROISSANCE.md` (y compris : pacing GP Humanitaire post-révision 🔶, choix de forme pour le plancher supprimé), commit/push sur demande explicite d'Erik, arrêt, remise de la main.
