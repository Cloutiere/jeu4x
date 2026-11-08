# HANDOFF-TUILE-OCCUPEE — Cultiver une tuile occupée par une unité

**Décisions Erik 02/10 (signalement en vivo) — mission client seul, zéro moteur.**

---

## 1. Préalables

- Lire `RULES.md` R-60 (rév. WORKED-TILE-EXACT) et R-60bis.
- Baseline : suites vertes (rules 952 + web 481 + server 120), `schemaVersion` **27** — **elle ne bouge pas** (aucune donnée, aucun protocole).
- Vérifier `git status` avant d'écrire (sessions parallèles possibles).

## 2. Contexte — diagnostic établi par le pilot (à re-vérifier, pas à refaire)

Signalement d'Erik : *« quand j'ai une unité positionnée sur une tuile cultivable, je ne suis pas capable de sélectionner cette tuile pour la cultiver — quand je sélectionne la tuile, elle sélectionne l'unité au lieu d'affecter la tuile à la cultivation. »*

- **Moteur SAIN** : `applySetWorkedTile` (`packages/rules/src/turn.ts:2160`) ne vérifie JAMAIS l'absence d'unité — ses seules validations : ville possédée, tuile travaillable, distance ≤ rayon (bâtiments compris), pas une case de ville, pas travaillée par une autre ville, plafond pop. Le serveur accepte donc déjà l'ordre sur tuile occupée.
- **Client carte** : `clickAction` (`apps/web/src/lib/render/interaction.ts:353`) — la règle 1 (culture, ville amie sélectionnée) est gardée par `if (!unit && !city)` (ligne ~400). Toute unité sur la tuile (amie ou ennemie, réelle ou affichée) fait tomber le clic en règle 2 = **sélection de l'unité**. Cela bloque aussi le re-clic « désélection exacte » d'une tuile DÉJÀ travaillée mais occupée.
- **Client vue ville** : `clickActionVueVille` (même fichier, ligne ~452) — `!unitAtHex(state, hex)` dans le prédicat `free` (ligne ~468) refuse la tuile occupée. Or la vue ville ne sélectionne JAMAIS d'unité : le clic y est perdu sans aucun contre-bénéfice. (La désélection d'une tuile travaillée occupée fonctionne déjà en vue ville — ligne ~464, avant le prédicat.)

## 3. Décisions de tranche (défaut appliqué — veto Erik possible)

- **D1 — La tuile prime sur l'unité quand une ville amie est sélectionnée** (carte, ordres modifiables, pas de draft) : dans le rayon de travail, une tuile **déjà travaillée** (→ désélection exacte) ou **cultivable libre** (→ affectation) reçoit le clic **même occupée** — unité amie ou ennemie, réelle ou affichée (positions dessinées, sens `unitesSurHex`). La garde de la règle 1 passe de `!unit && !city` à `!city` (la case ville reste hors culture : règle 0b re-clic = désélection, règle 2 = sélection).
- **D1bis — Repli sélection** : si la culture est **impossible** sur une tuile occupée (ville pleine, tuile prise par une autre ville), le clic retombe sur la **sélection de l'unité** plutôt que sur « rien » — le geste historique ne se perd que là où la culture est de toute façon refusée. Une tuile occupée et **non cultivable** (terrain sans rendement) reste sélectionnable d'un clic (la règle 1 ne s'y applique pas).
- **D2 — L'échappatoire de sélection reste la règle 0** (inchangée, au-dessus de la règle 1) : re-clic sur l'unité **déjà sélectionnée** = cycle cohabitantes / ville / désélection. Conséquence assumée : pour saisir une unité NON sélectionnée posée sur une tuile cultivable du rayon, il faut d'abord désélectionner la ville (re-clic ville ou clic vide), puis cliquer l'unité — 2 clics. 🔶 Erik peut vetoer ce coût ; l'alternative est le statu quo (unité d'abord), qu'il signale justement comme le problème.
- **D3 — Vue ville alignée** : retirer `!unitAtHex(state, hex)` du prédicat `free` de `clickActionVueVille` — miroir exact du moteur, qui ne bloque pas. Zéro ambiguïté de sélection dans cette vue.
- **D4 — Zéro changement moteur/serveur/protocole**, `schemaVersion` 27 inchangée, pas de migration.

## 4. Mission

- **L0** : relire `RULES.md` R-60 et les tests existants (`apps/web/tests/interaction.test.ts`, `menu-ville.test.ts`, `fusion-menu-ville.test.ts`, `pile-affichee.test.ts`) ; repérer ceux qui incarnent la priorité unité actuelle. Vérifier le diagnostic §2 (lignes citées).
- **L1 — test-first** : réécrire/ajouter les tests `clickAction`/`clickActionVueVille` : ville sélectionnée + unité amie sur tuile libre du rayon → `setWorkedTile` ; tuile déjà travaillée occupée → désélection exacte ; unité ennemie visible sur tuile du rayon → `setWorkedTile` ; tuile occupée + ville pleine → repli `selectUnit` (D1bis) ; tuile non cultivable occupée → `selectUnit` ; case ville occupée → `selectUnit` (inchangé) ; règle 0 cycle inchangée ; vue ville tuile occupée → `setWorkedTile`.
- **L2** : implémentation des deux fonctions pures (`interaction.ts` — client seul). Vérifier qu'aucune autre porte de clic ne duplique cet arbitrage ; vérifier que `UnitPanel.svelte` (mention SetWorkedTile) n'est pas affecté.
- **L3 — vérification GUI en vraie partie solo légale** (scripts `devtmp/`, cf. missions précédentes) : sélectionner la ville, cliquer la tuile occupée par une unité → marqueur worked tile visible, re-clic → retiré ; désélectionner la ville puis sélectionner l'unité (2 clics) ; double-clic vue ville, tuile occupée cliquable. Captures dans `dev-logs/captures-tuile-occupee/`. **Validation locale avec captures AVANT tout commit.**
- **L4** : suites vertes (rules/server intouchées — web + svelte-check 0), commit, push (la CI déploie), rapport `REPORT-TUILE-OCCUPEE.md`.

## 5. Critères d'acceptation

- Ville sélectionnée + guerrier sur prairie libre du rayon : clic = citoyen affecté ; re-clic = retiré.
- Tuile déjà travaillée avec unité dessus : re-clic = désélection exacte de CETTE tuile.
- Unité ennemie visible sur tuile du rayon : clic = culture.
- Vue ville (double-clic) : tuile occupée cliquable.
- Re-clic sur l'unité déjà sélectionnée : comportement cycle inchangé.
- Suites : web vertes, rules + server inchangées et vertes, svelte-check 0.

## 6. Périmètre interdit

Moteur, protocole, serveur, migration ; clic droit et programmation de mouvement ; règle 0 (cycle) ; rendu ZONE-CULTIVEE et marqueurs ; animation/vue ville zoomée ; tout le 3D ; `schemaVersion`.

## 7. Fin de session

Rapport `REPORT-TUILE-OCCUPEE.md` (défauts 🔶 éventuels, liste « reste à vérifier en ligne par Erik »), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik (`image_ref/`, PDF, etc.).
