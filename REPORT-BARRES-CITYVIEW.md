# REPORT-BARRES-CITYVIEW — Des vraies barres de progression à côté des compteurs de la vue ville

**Statut : livré, en attente de validation locale par Erik (aucun commit — règle établie).**

## 1. Diagnostic

Le balisage des barres existait déjà dans `CityView.svelte` (piste `.bar` + remplissage `.fill`, jauges pures `lib/jauges.ts` déjà testées). Le bug était **purement CSS** : `.bar` est un `div` dans un conteneur flex (`.gauge`) **sans largeur propre ni `flex`** — il se repliait à la largeur de son contenu (0), ne laissant visibles que ses 2 bordures verticales de 8 px de haut : c'est le résidu « | » constaté par Erik. Le remplissage en `width: x%` n'avait de son côté rien à remplir (parent de largeur nulle).

## 2. Correctif

**Un seul fichier touché : `apps/web/src/components/CityView.svelte`** (style `.bar` uniquement) :

- `.bar { flex: 1 1 auto; min-width: 5rem; … }` — la piste prend tout l'espace à côté du compteur « X / Y » ;
- couleurs inchangées et déjà correctes : vert `#81c784` (nourriture), violet `#ba68c8` (culture), ocre `#f0c419` (production — `.fill` par défaut) ;
- zéro balisage, zéro lib, zéro gameplay, zéro 3D, `schemaVersion` 23 intacte.

## 3. États limites

- **0/Y** : barre vide sur piste sombre visible (capturé live : nourriture 0/30, production 0/10 — capture 02) ;
- **Plafond** : couvert par les tests purs — `jaugeCroissance(31, …)` → `plafond: true`, ratio 1 (jauge pleine) ; `jaugeFrontiereCulturelle` au-delà du 5e anneau → ratio 1, `prochainSeuil: null` (branche « (plafond) » du libellé) ; `jaugeProduction` coût `Infinity`/0 → 0 (jauge vide honnête). Non capturé live (inatteignable en partie neuve : plafond pop 31, 5 anneaux = 10 000 culture).
- **Item sans file** : la carte Production n'affiche **aucune** barre quand il n'y a pas d'item (capture 01 — « Aucune production en file. », aucun résidu).

## 4. Vérification

1. **Suite verte forcée** : 818 (rules) + 75 (server) + 276 (web) = **1169 tests**, dont les ratios 0 / partiel / plein / plafond déjà couverts par `apps/web/tests/fusion-menu-ville.test.ts` (jaugeCroissance, jaugeCulture, jaugeProduction, jaugeFrontiereCulturelle) ;
2. **Typecheck 4/4** (svelte-check 0 erreur) ;
3. **e2e live** (partie solo Rome vs bot V774VD, fondation de ville, vue ville au double-clic via hook dev `__game`) — captures `dev-logs/captures-barres-cityview/` :
   - `01-vue-ville-aucune-file.png` : nourriture 4/20 (~20 %) verte, culture 2/10 (~20 %) violette, production **sans barre** (aucune file) — plus aucun « | » ;
   - `02-vue-ville-tour6-anneau-franchi.png` : nourriture 0/30 (vide), culture 11/100 (~11 %) après franchissement du 1er anneau, production 0/10 (vide, item Guerrier à l'arrêt — 0 marteau/tour) ;
   - remplissages proportionnels et plafonnés vérifiés visuellement (20 % ≙ 4/20, 11 % ≙ 11/100) ; les ratios nourriture/culture coïncident dans une ville neuve (seuils 10×pop vs 10, rythmes 4 vs 2 — proportionnels), la diversité des états vient des captures 01/02 + tests purs.

## 5. Fin de session

Aucun commit/push (validation locale d'Erik d'abord, règle établie). Serveurs de dev laissés ouverts : vite sur <http://localhost:5174> (déjà actif avant la session), wrangler sur 127.0.0.1:8788 — partie de vérification **V774VD** ouverte dans l'onglet navigateur pour inspection. Arrêt, remise de la main.
