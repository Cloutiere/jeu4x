# HANDOFF-RAPPORT-ENGAGEMENT — Rapport de combat au clic sur une case (sommaire vainqueur/PV/sorts, popover ancré)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `RULES.md` (chapitre ENGAGEMENT R-173..R-183 — rôles de mêlée R-180 vainqueur/perdant/milieu, expulsion R-179), `REPORT-REPLAY-RESOLUTION.md` (événements côté client, paire pré-état, `centerOnHex`), `packages/rules/src/events.ts` (les événements de combat et leurs champs). **2D uniquement. Zéro changement moteur/serveur/protocole** — tout se déduit des `GameEvent` et de l'état déjà reçus par le client.

## 1. Objectif (demande d'Erik du 30/09)

Dans la résolution d'engagement, le replay existe mais n'est « pas très limpide » : Erik veut **cliquer sur une case et voir un sommaire de ce qui s'y est passé** — ex. « Guerrier Amérique : vainqueur · Guerrier Inde : −1 PV · Barbare : perdant, −2 PV, détruit ». Décisions prises avec Erik : **popover ancré près de la case** (fermeture clic ailleurs / Échap), disponible **après la résolution ET pendant la relecture**.

## 2. Données disponibles (vérifiées pilot — à réutiliser, rien à demander au serveur)

- **Événements de combat du tour** : le client les reçoit tous (filtrés fog) dans le `TurnResult` — `Attack`, `CombatExchange {attackerId, defenderId, at, attackerHpAfter, defenderHpAfter}`, `MeleeResolved` (rôles R-180), `UnitDestroyed {at}`, `UnitExpelled`, `Captured`, etc. Le playback les consomme déjà ; le module `replay.ts` sait les rejouer.
- **PV avant** : déductibles en rejouant les événements sur le pré-état capturé (`replayPair` de REPLAY-RESOLUTION) ou en lisant les `*HpAfter` en chaîne (le premier échange d'une unité part de son PV du pré-état).
- **Noms/couleurs** : `view.players` + les palettes d'accent existantes (bandeau de couleur du rapport = couleur de faction du sprite).
- **Cases concernées** : toute case portant un événement de combat du tour — un pur `resumesDeCase(events, hex)` peut agréger par case.

## 3. Décisions tranchées par défaut (vetoables)

- **D1 — Déclencheur** : après résolution ET pendant la relecture, un clic sur une case à événement de combat ouvre le popover. Priorité de clic : si la case a à la fois sélection d'unité et rapport, le rapport prime pendant la relecture ; après résolution, le clic droit comportement existant inchangé et le **clic gauche sur case de combat ouvre le rapport** (si l'unité sélectionnable est sur la case, le rapport s'ouvre aussi — le panneau unité reste accessible ; à l'œil à l'acceptation, 🔶).
- **D2 — Contenu du popover** (par participant, trié : vainqueur d'abord, puis milieux, puis perdants) :
  - **logo or de la nation** du participant (les vecteurs `new_logos/`, table `nations.ts` — LOBBY-PREMIUM) à côté du type d'unité (« Guerrier Amérique ») + bandeau de couleur de faction ; **barbare** : le nouveau `new_logos/barbare_logo.svg` — ajouter l'entrée barbare dans `nations.json` (logo seul, pas de banderole, jamais en réserve) ;
  - **rôle** si mêlée : VAINQUEUR / PERDANT / MILIEU (badge) ;
  - **barre de PV avant→après** avec delta (ex. 4→3 (−1), rouge si perte) — style compartiments de la barre 3 vies existante ;
  - **sort** : détruit ☠ / expulsé / repli / reste en place ;
  - en-tête : case + nombre de participants ; ligne « Mêlée d'instabilité (R-180) » si MeleeResolved sur la case.
- **D3 — « ⟲ Rejouer ce combat »** : bouton du popover → lance la relecture du tour (REPLAY-RESOLUTION) centrée sur la case (si la relecture est déjà active : recentrage seul). Si la paire de relecture est indisponible (reconnexion), le bouton est grisé avec tooltip.
- **D4 — Style « AAA » niveau LOBBY-PREMIUM (exigence Erik 30/09)** : panneau sombre or-sur-foncé avec les MÊMES tokens que le lobby (typographie serif titres, liserés or dégradés, ombres douces) ; **logo or de nation par participant** ; micro-animations sobres (apparition en scale+fade ~150 ms, pointeur animé vers la case) ; lisibilité d'abord (contraste, tailles). Pointeur vers la case, positionné pour rester dans le viewport (flip auto si bord), z au-dessus de la carte, sous les modales. Fermeture : clic ailleurs, Échap, ou bouton ×.
- **D5 — Entrées de journal cliquables** : les événements de combat du journal reçoivent le même comportement qu'aujourd'hui (centrage) — SANS ouvrir le popover (le clic case reste le geste du rapport). Option 🔶 à l'œil d'Erik : une ligne « ⚔ n combats ce tour » récapitulative.
- **D6 — Fog et anti-cheat** : seuls les événements reçus par le joueur alimentent le rapport (déjà filtrés serveur). Pendant la relecture, le rapport suit l'état rejoué : un participant détruit PLUS TARD dans la file apparaît quand son événement passe (cohérent avec le delta visuel).
- **D7 — Performance** : l'agrégation est calculée à l'ouverture du popover (pas par frame), mise en cache par tour.

## 4. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts. Lis `events.ts`, `replay.ts`, `playback.ts`, `GameCanvas.svelte` (clic case, popover patterns existants), `Journal.svelte`, le style des panneaux existants.

### L0b — Assets logos
- Ajouter `barbare_logo.svg` à la table nations (copie `assets-src/interface/` + version web optimisée comme LOBBY-PREMIUM) ; vérifier les 16 logos or existants et leurs `logoEchelle`.

### L1 — Agrégation (test-first, pur)
- `resumesDeCase(events, hex, preEtat?)` → liste de participants `{unitId, owner, type, pvAvant, pvApres, role?, sort?}` + méta (mêlée ? n participants ?). Couvrir : échange simple, mêlée 3+ participants (rôles), destruction, expulsion, repli, plusieurs combats sur la même case le même tour, cas null (case sans combat).
- Tests exhaustifs sur ces cas (fixtures d'événements).

### L2 — UI popover
- Composant Svelte ancré case (projection hex→écran existante), style §D2/D4, bouton Rejouer (D3), fermetures, flip viewport. Accessible clavier minimal (Échap).
- Branchement clic (D1) + intégration relecture (D6) + cache par tour (D7).

### L3 — Vérification
- Suites + typecheck verts ; e2e solo : provoquer un combat à 3 participants (labo `#/labo-combat` ou partie), clic case → popover exact (logos nation, PV, rôles, sort), « Rejouer ce combat » recentre et rejoue, reconnexion → bouton grisé.
- **Captures `dev-logs/captures-rapport-engagement/`** AVANT tout commit : popover après résolution, popover pendant relecture, cas mêlée 3 nations, cas destruction.

### L4 — ARRÊT POUR APPROBATION D'ERIK
Présenter captures + le look du popover **comparé au lobby** (cohérence tokens/typographie/logos). Le look est subjectif — 🔶 à l'œil (taille, badges, position, animations). NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-RAPPORT-ENGAGEMENT.md` : agrégation (cas couverts), UI, écarts, ce qu'Erik valide en ligne (combats réels en solo/multi, mêlée R-180), 🔶 (priorité de clic, ligne récapitulative journal, styles).

## 5. Critères d'acceptation
1. Clic sur une case de combat → sommaire exact (participants, rôles R-180, PV avant→après, sorts), fog respecté.
2. Disponible après résolution ET pendant la relecture ; « Rejouer ce combat » recentre et lance la relecture.
3. Aucun changement moteur/serveur/protocole ; suites vertes ; zéro régression sur le clic-sélection existant.
4. Look cohérent avec l'UI (or-sur-sombre), popover toujours lisible (flip viewport).

## 6. Périmètre interdit
- Moteur/serveur/protocole (aucun nouvel événement ni champ — tout est dérivable) ; le contenu de la trace admin (hors UI joueur) ; 3D ; les autres panneaux (unité, ville) ; retouche des règles d'engagement.
