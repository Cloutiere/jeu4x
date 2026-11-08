# REPORT-COMBAT-EXPLIQUE — le décodeur de combat dans le rapport

**Livrée le 06/10** (handoff du même jour, décisions Erik D1-D5). Le rapport de combat montre POURQUOI le gagnant gagne : forces de chacun, modificateurs nommés, jets RNG par assaut, issue.

## Struct du détail (source unique : `packages/rules/src/combat.ts`)

- `CombatDetail` (joint à chaque `CombatExchange`) :
  - `attaquant` / `defenseur` : `CombatForceDetail` = `{ unitId, role, base, modsBase[], veteran, bonusDefPct[], modsPost[], force }` — décomposition complète de la force §7.4 : stat de base (défense si le défenseur est stabilisé R-174, attaque sinon), traits nationaux R-149, vétéran T-01 (×1,5), bonus défensifs % (terrain T-02 nommé, fortification T-17, bâtiments de ville), points post-multiplication (soutien naval R-118, merveille d'attaque R-125, Fondamentalisme R-121), force finale.
  - `rounds[]` : `{ round, jet, pTouche, touche, pvPerdus }` — jet RNG brut de CHAQUE assaut (D2) ; `jet: null` = tir sans riposte R-59-b.
  - `issue` : `victoire-attaquant` | `victoire-defenseur` | `survie-mutuelle` | `ecrasement` ; `overrun` + `ecrasement: { sAttBase, sDef, ratio }` quand l'ÉCRASEMENT R-149 a court-circuité les rounds.
  - `sansRiposte` : consigne R-59-b.
- `MeleeDetail` (joint à chaque `MeleeResolved`) : poids `force² × étau` de chaque participante (avec la même décomposition de la force de demeure) + tirages bruts.

## Points clés

- **L2 — zéro duplication** : le détail est produit PAR `combatStrengthsOf` (turn.ts), le même appel qui calcule S_att/S_def pour R-51 et R-149. Les forces du détail sont littéralement les forces utilisées (posées au retour, jamais recomposées). Les jets consignés sont les jets réellement consommés.
- **Champ ADDITIF** : `detail?:` optionnel sur les deux événements — `schemaVersion` 27 INCHANGÉE, anciens journaux sommaires (D5), pas de migration.
- **D3** : le détail voyage sur l'événement (filtrage fog standard inchangé) — le rapport rétrospectif montre tout de l'ennemi.
- **D4 gratuit** : la relecture rejoue les vrais événements — le détail est donc disponible dans « Rejouer ce combat » et le playback REPLAY-RESOLUTION sans code supplémentaire.
- **L3 client** (`RapportCombat.svelte` + `rapport.ts`) : phrase VERDICT en tête (« Survie mutuelle : force 1,00 contre 1,50 — jet 0,59 »), sections repliables `<details>` « D'où vient sa force » (base → mods +valeur → force, libellés moteur en clair) et « Assauts (n) » (jet, p touche, cible des dégâts) ; « Poids de mêlée » quand une mêlée R-180 a eu lieu. Compact par défaut, AAA or-sur-sombre, « Rejouer » inchangé.
- **Mêlée** : capture des tirages par habillage réversible de `rng.next` autour de `drawWeightedMelee` (mêmes valeurs, bit à bit — indépendant de la présence du trace).

## Tests

- `packages/rules/tests/combat-explique.test.ts` : 9 cas, test-first (rouge 8/9) :
  - modificateurs multiples nommés et EXACTS (vétéran + soutien naval galion +15 / colline +50 % + fortification +25 %) ;
  - **propriété** sur 24 seeds : forces recomposées du détail = forces du moteur ; chaque jet re-joué dans §7.4 redonne la cible consignée ; PV = 3 − dégâts des rounds ;
  - écrasement R-149 marqué (`char_d_assaut` vs guerrier : sAttBase 10 ≥ 6×1, rounds vides) ; Overrun false en combat ordinaire ;
  - mêlée R-180 : poids = force²×étau par participante, 2 tirages consignés, rôles couverts ;
  - R-59 sans riposte (jets null) ;
  - rétroactivité nulle (un événement sans `detail` reste typable).
- Suites complètes : **rules 1028** (+9) / **web 582** / **server 123** vertes, `tsc` 0 erreur ×3, `svelte-check` 0 erreur / 17 warnings (préexistants).

## GUI réelle (L4) — devtmp/combat-explique-gui.mjs, wrangler+Vite locaux

Solo `procedural-40` : marche du guerrier (9 pas, 8 tours) vers le camp barbare v3, ordre Attack, résolution réelle. Combat guerrier vs gardien **en forêt** : détail moteur exact (`Terrain — foret (T-02) +0,50`, force 1,50, jet 0,588, p 0,308, touche attaquant, survie mutuelle). Popover réel : verdict, forces, assaut — **et relecture** (« ⟲ Rejouer » puis re-clic : verdict identique). Captures `dev-logs/captures-combat-explique/` (A compact, B explication ouverte, C relecture) **relues PASS 3/3** par le juge visuel.

## 🔶 Réserves

- **Soutien naval et écrasement non rejoués en GUI** (galère = ville côtière + tours de production ; Overrun = écart de tech) — prouvés en unitaires avec les structs exacts émis.
- Le combat GUI de capture n'avait qu'UN modificateur (forêt) ; le cas multi-modificateurs est couvert par la suite de propriété moteur.
- Libellés des mods en français canon (« Soutien naval (R-118) », « Terrain — colline (T-02) »…) : ajustables à l'œil d'Erik sans toucher au struct.

## Pièges rencontrés (consignés)

- 15 instances wrangler/workerd empilées par les sessions précédentes se battaient pour le port 8787 → crashs workerd en cascade ; ménage complet puis UNE instance (le script réutilise une instance saine existante et redémarre au gel — miroir d'ordres-unites-gui.mjs).
- Le dump admin porte les événements du tour dans `state.lastEvents` (pas `events`).
- Le popover n'existe que si la page est ouverte PENDANT la résolution (paire pré-état/événements constituée au TurnResult) — le script ouvre le navigateur avant la marche.
