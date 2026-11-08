# REPORT-PLACEMENT-MELEE — Placement des unités en mêlée par côté d'entrée + stabilisée au centre

> Mission du 20/09 (HANDOFF-PLACEMENT-MELEE, décisions D1..D7 vetoées par Erik). 100 % côté client — zéro changement `packages/rules` / `apps/server` / protocole. **Non committé : en attente de ta validation à l'œil** (captures + labo prêts).

## Livrable

Nouveau placement des tuiles EN MÊLÉE (≥ 2 nations) :

1. **Stabilisée à la création de la mêlée AU CENTRE** — plein calibre, premier plan absolu (`z = +1`, au-dessus de toutes les sections). C'est la référence visuelle pendant toute la mêlée (elle conserve ses bonus de fortification R-173).
2. **Chaque autre unité est posée sur le côté par lequel elle a pénétré la tuile** (côté FACE au voisin d'où elle vient — entrer par l'ouest = posée à l'ouest). Les 6 côtés du pointy-top ont leur offset, miroir des anciennes zones : O/E à ±0.62, NO/NE/SO/SE à (±0.31, ±0.54) · HEX_SIZE.
3. **Empilement intra-section** : même escalier diagonal qu'avant (+0.09, −0.09) ; **ordre d'arrivée** (seq des événements `Move`) — le premier entré reste au bord au premier plan (`z = 0`), chaque nouvelle arrivante se place DERRIÈRE (`z` décroissant). Les nations se mélangent dans une section (barbares compris, D4/D7).
4. **Sans mouvement connu** (en mêlée depuis un tour précédent) : dernier côté mémorisé, persistant tant que l'unité vit (D1). Vraiment inconnu (démarrage, reconnexion) : **repli sur l'ancien remplissage par zones** (paquets par nation triée R-81) — donc l'ancien rendu.
5. **Centre vide si la stabilisée meurt** (D3) : personne ne le prend.
6. **Cohabitation amie inchangée** (D4) : une nation seule garde le côte à côte centré historique — routage : `dispositionsCohabitation` ne bascule vers `dispositionMelee` que si ≥ 2 nations.
7. **Relecture** (D6) : le placement s'applique identiquement pendant « ⟲ Rejouer la résolution » — GameCanvas consomme le même contexte (capturé au TurnResult) quel que soit l'état rendu (réel ou relecture).

## Fichiers

| Fichier | Contenu |
|---|---|
| `apps/web/src/lib/melee.ts` (NOUVEAU) | `Cote`, `coteDepuisMouvement` (table axiale → côté), `ContexteMelee`, store `contexteMelee`, réducteur pur `reduceContexteMelee` (côtés d'entrée depuis les `Move`/`Retreat`/expulsions, seq = ordre d'arrivée ; stabilisée = unique unité `stabilized` du pré-état sur une case devenue multi-nations ; purges : Snapshot, unités détruites, fin de mêlée) |
| `apps/web/src/lib/render/interaction.ts` | `OFFSETS_COTES` (6 côtés), `dispositionMelee` (pure), routage dans `dispositionsCohabitation(state, positions, contexte?)` — `dispositionCohabitationParNation` intacte (régime ami + repli) |
| `apps/web/src/lib/gameClient.ts` | au `TurnResult` : vue suivante calculée une fois, `contexteMelee` alimenté (pré-état + post-état + événements) ; au `Snapshot` : purge. Même politique de vie que `replayPair` (D5) |
| `apps/web/src/lib/render/GameCanvas.svelte` | 2 sites d'appel passent `get(contexteMelee)` — même contrat `{dx, dy, echelle, z}`, zéro autre changement |
| `apps/web/src/pages/LaboRendu.svelte` | L3 — sélecteur de régime **Mêlée / Amie** ; en mêlée : côté d'entrée par unité (O/E/NO/NE/SO/SE/« ? » repli), radio « centre » par unité + « stabilisée MORTE — centre vide (D3) » |
| `apps/web/tests/melee.test.ts` (NOUVEAU, 20 tests) | les 6 directions d'entrée, stabilisée au centre, persistance D1, centre vide D3, purge Snapshot, pas de stabilisée si case déjà multi-unités, empilement derrière D2, mélange de nations D4/D7, repli zones, routage ami inchangé |

## Vérification (L4)

- **Suite complète : 1314 tests verts** (web 365 — dont 20 mêlée —, server 81, rules 868), **typecheck 0 erreur** (svelte-check compris). `packages/rules` et `apps/server` intacts (aucun diff).
- **e2e labo** : `node dev-logs/driver-placement-melee.mjs` (CDP Edge headless sur `#/labo-rendu`) — 5 captures dans `dev-logs/captures-placement-melee/` :
  - `01-melee-cote-entree-stabilisee-centre.png` — 5 unités / 3 nations, côtés mixtes, stabilisée au centre plein calibre ;
  - `02-melee-stabilisee-morte-centre-vide.png` — centre vide (D3) ;
  - `03-melee-repli-zones-sans-info.png` — tous « ? » → ancien remplissage (D1) ;
  - `04-ami-cote-a-cote-inchange.png` — 1 nation / 3 unités, placement historique (D4) ;
  - `05-melee-empilement-meme-cote.png` — 3 arrivées par l'EST empilées derrière (D2), stabilisée au centre.
- **Régression relecture** : `driver-replay-resolution.mjs` repassé VERT bout en bout (delta sprite −111 px, retour à l'état réel, bouton grisé après rechargement) — le branchement `gameClient` ne casse rien.
- **labo `#/labo-combat`** : non modifié (il rend en SVG, hors GameCanvas) — il reste ton banc pour les RÈGLES de mêlée (R-180, trace) ; le calibrage VISUEL du placement se fait au `#/labo-rendu` régime « Mêlée ». Un vrai match mêlée+relecture en partie solo est possible chez toi : le placement en relecture emprunte exactement le chemin validé par le driver replay.

## 🔶 De calibrage (à l'œil, constantes en tête de `dispositionMelee` / `OFFSETS_COTES` dans `interaction.ts`)

- Offsets de bord : `±0.62` (O/E) et `(±0.31, ±0.54)` (diagonales) — hérités des ZONES_HEX ; les sections E débordent un peu vers la case voisine quand la section est pleine.
- Pas d'escalier : `PAS_ESCALIER = 0.09` (partagé avec l'ancien régime).
- z de la centrale : `+1` (au-dessus de tout) ; échelle centrale : `1` (plein calibre) vs `ECHELLE_PILE` pour les sections.
- Grandes sections (3+) : l'escalier monte vers le haut-droit — limite de lisibilité à tester avec 4-5 arrivées même côté (labo, capture 05 pour 3).

## Liste de vérification en ligne pour Erik

1. `#/labo-rendu` → régime « Mêlée » : bouger côtés/radios — chaque unité sur son côté d'entrée, stabilisée au centre, « MORTE » → centre vide, « ? » → repli zones.
2. `#/labo-rendu` → régime « Amie » : rien n'a changé (côte à côte centré).
3. Vraie partie : provoquer une mêlée (entrée sur ennemi / échange de cases) — vérifier les côtés à l'arrivée, puis « ⟲ Rejouer la résolution » : le placement suit la relecture.
4. Reconnexion (F5) en pleine mêlée : repli zones sans erreur (mémoire purgée au Snapshot, voulu D1/D5).

## Décisions appliquées telles quelles

D1 (dernier côté connu + repli), D2 (ordre d'arrivée, nouvelles derrière), D3 (centre vide), D4 (ami inchangé), D5 (zéro moteur/serveur — tout dérivé client), D6 (relecture incluse), D7 (barbares = nation).

## Rév. 21/09 (retours d'Erik en jeu — appliqués)

1. **Taille intermédiaire pour la centrale** : `HAUTEUR_UNITE_CENTRE = 0.8` hauteur d'hex (`calibration-unites.ts`, calibrage 🔶) → `ECHELLE_CENTRE = 0.64` de la pleine grandeur, entre pile (0.44) et pleine grandeur (1.0). L'unité au centre d'une cohabitation prend ce cran ; seule sur sa tuile, elle reste pleine grandeur.
2. **Mêmes côtés pour TOUTE cohabitation** (mêlée OU pile amie fraîche — décision du 21/09) : le routage par régime est supprimé, `dispositionsCohabitation` passe tout par `dispositionMelee`. L'escalier diagonal centré des piles amies est abrogé (il a existé quelques heures) ; `dispositionCohabitationParNation` a été supprimée (son repli zones vit dans `dispositionMelee`).
3. **Survivantes d'une mêlée** : elles GARDENT leur place de mêlée (centre compris) — la mémoire du centre ne se purge plus à la fin de la mêlée, seulement si l'unité meurt, s'embarque ou quitte la case. Une survivante seule reste à son côté (pleine grandeur) ; l'ex-centrale seule reste au centre.
4. Labo simplifié : plus de sélecteur de régime, les contrôles côtés/centre s'appliquent toujours. Captures régénérées (04 renommée `04-pile-amie-cotes-meme-regime.png`).
5. Suite web 367 tests verts (33 mêlée/calibration), typecheck 0 erreur.

## Cor. 21/09 (bis) — décentrement des unités seules

La règle « survivante garde sa place » était appliquée aussi aux unités SEULES sur leur tuile (posées sur leur côté d'entrée mémorisé → décentrement visible). Correction : une unité seule sur sa case est TOUJOURS centrée, pleine grandeur — la place de mêlée ne vaut que pour les cohabitations (≥ 2 unités). Tests ajustés (33 verts).
