# HANDOFF-ZONE-CULTURELLE-DEGRADE — Dégradé continu de la zone d'influence culturelle

**Décisions Erik 07/10** (compréhension validée par Erik). Le dégradé de la zone culturelle devient CONTINU (fini les paliers visibles), avec voile léger sur tout l'intérieur et bordure qui s'intensifie vers l'extérieur de la tuile.

## 1. Préalables

- Lire le rendu ZONE-CULTIVEE / EXPANSION-CULTURELLE / CULTURE-FRONTIERES (liseré accent + dégradé 3 couches 60/40/22 px, alphas 0,10/0,17/0,28 — bloc `ZONE_CULTIVEE` + bloc frontière, `contours.ts`, `frontierRadius` R-162), les copies couture (`wrap.ts`), les blocs data-driven de style.
- Baseline : suites vertes à jour, `schemaVersion` 27, **client seul** (rendu 2D ; le 3D dort). Vérifier `git status` (sessions parallèles possibles).

## 2. Décisions (Erik 07/10 — validées)

- **D1 — Progression continue** : plus AUCUNE bande d'alpha constant — une pente douce (smoothstep) de la bordure extérieure vers l'intérieur de la zone ; les transitions inter-tuiles ne montrent aucune marche. La pente traverse toute la TUILE de bordure : alpha maximal au bord extérieur de la tuile (au liseré), décroissant graduellement vers son intérieur, puis vers le voile de fond.
- **D2 — Voile de fond** : TOUTE tuile à l'intérieur de la zone reçoit un voile translucide faible et constant (même accent) — la zone se lit comme un bloc.
- **D3 — Liseré inchangé** : le contour net (accent joueur) reste, sur la frontière extérieure seule, clippé au fog.
- **D4 — Data-driven** : alphas (extérieur, voile de fond), portée de la pente, bloc de style existant — calibrage à l'œil sans code.
- **D5 — Implémentation** : le dégradé continu exigera probablement des TEXTURES de dégradé/masques par tuile (générées une fois, mises en cache) plutôt que des traits — la technique est au choix de l'agent ; contraintes : zéro allocation par frame (leçon VUE-VILLE-PERF), copies couture à cheval, fog clippé, 60 FPS.
- **D6 — Forme inchangée** : paliers culturels R-162 / `frontierRadius` intouchés ; les ZONES CULTIVÉES (worked tiles) gardent leur liseré propre, la pente s'applique au-delà (bande d'extension + voile).

## 3. Mission

- **L1 — test-first (client)** : profil d'alpha PUR : continuité (propriété : pas de saut > epsilon entre pas voisins), monotone de la bordure vers l'intérieur, voile = valeur de fond exacte, dictionnaire de calibrage respecté.
- **L2 — rendu** : textures/masques dégradés en cache, pose par tuile (bordure + intérieur), intégration wrap + fog, blocs de calibrage.
- **L3 — vérification GUI locale avec captures AVANT commit** : partie solo légale — capitale palier 1 (zone cultivée seule), palier 2+ (bande d'extension), zone à cheval sur la couture, zooms. Captures `dev-logs/captures-zone-culturelle-degrade/` (à l'œil : AUCUNE barre visible).
- **L4** : suites vertes (web ; rules/server intouchés), svelte-check 0, commit, push, rapport `REPORT-ZONE-CULTURELLE-DEGRADE.md` (blocs de calibrage, 🔶 à l'œil).

## 4. Critères d'acceptation

1. Aucun palier visible — progression douce de la bordure vers l'intérieur (captures relues) ;
2. Voile constant sur tout l'intérieur de la zone ;
3. Bordure plus foncée vers l'extérieur de la tuile de bordure ;
4. Liseré, fog, couture, 60 FPS inchangés ; suite web verte.

## 5. Périmètre interdit

Moteur/serveur (les paliers R-162 et le gameplay) ; la forme de la frontière ; ZONE-CULTIVEE (worked tiles — liseré et marqueurs) ; tout le 3D ; `schemaVersion`.

## 6. Fin de session

Rapport (technique retenue, blocs de calibrage), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
