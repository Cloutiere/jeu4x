# HANDOFF-COMBAT-EXPLIQUE — Le « décodeur de combat » dans le rapport

**Décisions Erik 06/10** (concept pilot, tranchés D1-D5 présentés). Le rapport de combat montre POURQUOI le gagnant gagne : forces de chacun, modificateurs nommés, jets RNG appliqués.

## 1. Préalables

- Lire RULES.md §7.4 (S_att/S_def et leurs modificateurs), R-51..R-55 (échanges), R-118 (soutien naval), R-149 (traits/Overrun), le trace RNG existant (récolteur passif), les événements `CombatExchange`/`MeleeResolved` (`events.ts`), le popover RAPPORT-ENGAGEMENT (`rapport.ts` + composant), la relecture REPLAY-RESOLUTION.
- Baseline : suites vertes à jour, `schemaVersion` 27. ⚠ Session parallèle ORDRES-UNITES en cours (moteur touché) — vérifier `git status` AVANT d'écrire et coordonner les fichiers : ce handoff touche le calcul de combat et les événements (turn.ts combat, events.ts) + le popover client ; si conflit manifeste, le signaler au rapport plutôt que de fusionner de son chef.

## 2. Décisions (votées Erik 06/10 — veto possible)

- **D1 — Le moteur émet le détail** : à chaque combat, détail structuré DÉTERMINISTE joint aux événements (champ additif sur `CombatExchange`/`MeleeResolved` ou événement compagnon, au choix de l'agent — **pas de migration `schemaVersion`**) : par participant, base A/D + liste nommée de modificateurs avec valeur (vétéran T-01, terrain, fortification, soutien naval R-118, Himeji, Fondamentalisme, traits R-146…) + force finale ; par ASSAUT, le jet RNG et les PV retirés ; l'issue (victoire/survie mutuelle/destruction, Overrun déclenché le cas échéant).
- **D2 — Granularité par assaut** : chaque round d'échange a ses forces du moment et son jet.
- **D3 — Tout visible** (fog inclus) : le rapport est rétrospectif — le détail de l'ennemi se montre intégralement.
- **D4 — Rejouer/relecture** : le détail est disponible dans « Rejouer ce combat » et le playback REPLAY-RESOLUTION.
- **D5 — Rétroactivité nulle** : les combats antérieurs au déploiement restent sommaires (pas de reconstruction).

## 3. Mission

- **L1 — test-first (moteur)** : suite `combat-explique.test.ts` : détail complet et EXACT sur un combat à modificateurs multiples (vétéran + terrain + fortification + soutien naval), cohérence forces×jets = dégâts appliqués (propriété), Overrun marqué, mêlée R-180 couverte, aucune régression des suites de combat existantes (checksums).
- **L2 — moteur** : émission du détail (struct type partagé `packages/rules`), calcul réutilisé PAR le calcul de combat lui-même (pas de duplication de formule).
- **L3 — client** : popover — verdict en tête (phrase « Victoire X : force F1 contre F2 — jet(s) … »), section « d'où vient sa force » par participant (base → modificateurs +valeur → force), liste des assauts repliable (jet + dégâts) ; langage AAA or-sur-sombre ; compact par défaut.
- **L4 — vérification GUI locale avec captures AVANT commit** : combat réel solo (guerrier vs barbare fortifié sur colline, bateau en soutien naval si possible) — popover avant/après, relecture avec détail. Captures `dev-logs/captures-combat-explique/`.
- **L5** : suites vertes complètes, RULES.md (§7.4 : le détail émis est documenté — il EST la spécification), commit, push, rapport `REPORT-COMBAT-EXPLIQUE.md`.

## 4. Critères d'acceptation

1. Un combat à plusieurs modificateurs s'explique ligne par ligne, chiffres exacts du moteur ;
2. Les forces affichées × les jets = les dégâts réellement appliqués (vérifié par test de propriété) ;
3. Popover compact par défaut, détail au clic ; « Rejouer » inchangé ;
4. Suites et bancs verts, `schemaVersion` inchangée.

## 5. Périmètre interdit

Toute VALEUR de combat (forces, taux, RNG — le détail n'explique pas, il ne change rien) ; mêlée R-180 hors détail ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Rapport (struct du détail, 🔶), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
