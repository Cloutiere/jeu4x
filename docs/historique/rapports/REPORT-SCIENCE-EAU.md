# REPORT-SCIENCE-EAU — Tuiles d'eau : 3 commerce au lieu de 2

**Mission HANDOFF-SCIENCE-EAU — décision Erik 03/10. Exécutée le 03/10.**

## Changements

- `packages/rules/src/data/terrain.json` — `eau` (Mer) et `ocean` (Océan) : `yields.commerce` 2 → **3**. Seul champ touché ; aucun champ `science` ajouté (le COMMERCE sort en sciences via la conversion R-90, inchangée).
- `RULES.md` — §2 table des terrains : lignes Mer et Océan « 0/0/2 » → « **0/0/3** » (les deux seules lignes de tableau touchées) + addendum marqué sur R-107 (§historique) qui répétait « 0/0/2 » pour l'océan et aurait contredit la table — texte de révision daté (03/10), fond inchangé.

## Tests (L1, test-first puis données)

Réécrits vers 0/0/3 :
- `data.test.ts` — 3 tests figeant les rendements Mer/Océan (titres + valeurs mis à jour) ;
- `phase7l.test.ts` — Cie des Indes : côte/océan 3 → **4** avec la merveille, **3** sans (prouve que Port/Cie des Indes S'ADDITIONNENT, ne remplacent pas — critère d'acceptation §4) ;
- `phase7k.test.ts` — e2e ville côtière sur océan : trésor 4 or avec merveille, 3 or sans ;
- `turn.test.ts` — R-90 : mer travaillée → 3 or par défaut, **3 science** en conversion (le « +3 affiché en sciences » vérifié de bout en bout) ;
- commentaires de contexte réalignés (`economy.test.ts`, `phase7h.test.ts`, `progen.test.ts`).

## Vérifications

- Suites **vertes** : rules **969/969**, web **495/495**, server **120/120** ; `svelte-check` 0 erreur (14 warnings préexistants).
- Fertilité de génération : score miroir (delta = 0) et seuils — aucun chiffre figé ; l'océan plus productif ne peut qu'augmenter la fertilité absolue. Aucun test de génération n'a bougé.
- Glyphe de rendement / panneaux : lisent les données — couvert par `tileYield` (phase7l) et la conversion R-90 (turn.test) ; aucune retouche UI (pas de capture labo nécessaire, le critère §3 est rempli par tests).
- `schemaVersion` 27 inchangée (donnée pure). Périmètre interdit respecté : autres terrains, R-90, ressources marines, Port, moteur de ville, protocole — intacts.

## Déploiement

Commit + push (la CI déploie).
