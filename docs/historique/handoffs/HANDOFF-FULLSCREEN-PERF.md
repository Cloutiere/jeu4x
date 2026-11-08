# HANDOFF-FULLSCREEN-PERF — Lag en plein écran F11 : mesurer, isoler, puis corriger (diagnostic d'abord)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `PROJET.md` (notamment PLEIN-ECRAN-NET 16b6e33 : le canvas se re-rend à la résolution exacte de l'écran en F11 — c'est le fix de netteté validé par Erik, à NE PAS casser aveuglément), FENETRE-GRANDE (9b5b417), UI-JEU-T3 (minimap T3, 44e857a), ASSETS-4K (vague fraîchement déployée). Signalement : **lag important en plein écran F11** (fenêtré fluide). **2D uniquement, client seul** — zéro changement moteur/serveur/protocole. Règle d'or : **mesurer avant de corriger** — le correctif dépend du coupable, et le compromis final netteté/fluidité appartient à Erik.

## 1. Objectif (demande d'Erik du 02/10)

Identifier la cause du lag en F11 et le régler, avec un compromis explicite validé par Erik si le correctif touche à la netteté.

## 2. Suspects (hypothèses pilot — à prouver ou disculper par la mesure)

- **S1 — Résolution de rendu** (suspect principal) : en F11, le canvas se rend à la résolution du moniteur (≈ 4× les pixels du fenêtré 1920×1080 sur un écran 4K). Le fix PLEIN-ECRAN-NET (`suivreDpr`, borne 4) suit le DPR effectif — voulu pour la netteté, mais la charge GPU monte d'autant.
- **S2 — Minimap T3** : invalidations plus fréquentes que prévu (redraw par frame ?) — l'écran plus grand expose le coût.
- **S3 — Surcouche UI en résolution native** : barre T1/panneau T2/minimap T3 rendus à la résolution plein écran (DOM/CSS coûteux à 4K ?).
- **S4 — Textures ASSETS-4K** : les cuissons doivent être aux MÊMES tailles qu'avant (224×256 tuiles, 512×640 unités) — vérifier qu'aucune n'a été cuite plus grande (mémoire GPU, uploads) ; la variane brume ajoute 8 textures (négligeable en principe).
- **S5 — Overlays redessinés au resize** : le passage F11 déclenche resize + DPR change → rebuilds (tuiles/entités/overlay) — le lag est-il au MOMENT du basculement (ponctuel) ou permanent en plein écran ? (question Erik à préciser par la mesure.)

## 3. Mission

### L0 — Mesure (AVANT tout correctif)
- Mesurer en fenêtré vs F11 (même partie, même état) : FPS et frame time (Pixi ticker), **résolution réellement rendue** (taille du canvas backing store), GPU vs CPU bound (timings renderer), nombre de draw calls, mémoire textures. Outils : instrumentation légère (compteur de frames exposé au calque dev T1 — lisible dans le jeu, idéalement persistant : un mini HUD perf dans le calque dev serait un plus durable, à l'œil).
- Isoler S2/S3 : rejouer F11 avec minimap repliée, puis filtres off, puis calque dev on — l'effet de chacun chiffré.
- Vérifier S4 : tailles des PNG cuits avant/après ASSETS-4K (git — les exports sont committés).
- Consigner TOUT dans un tableau avant/après (`dev-logs/perf-fullscreen/`).

### L1 — Verdict de coupable (un ou plusieurs)
- Classement des causes par coût mesuré, mécanisme précis (ex. « F11 = 3840×2160 backing store → frame time ×2,8 »). Si le lag n'est PAS reproductible : le documenter honnêtement (conditions, écran d'Erik), instrumentation livrée, **pas de correctif spéculatif**.

### L2 — Correctif(s) selon le verdict
- **Si S1** : proposer à Erik le compromis (arrêt L4) — options type : (a) plafond de résolution de rendu en plein écran (ex. 1920×1080 → upscale CSS ; rappel : ça réintroduit du flou relatif — c'est LE trade-off qu'Erik avait tranché dans l'autre sens en 20/09, il doit re-trancher en connaissance de cause) ; (b) plafond plus élevé (2560) ; (c) réglage data-driven dans le calque dev (curseur/bascule « Qualité de rendu ») — (c) probablement la meilleure : Erik ajuste en jeu.
- **Si S2** : corriger les invalidations (throttle, redraw sur événement seulement) — pure perf, pas de compromis visuel, correction directe.
- **Si S3** : optimiser les styles (contain CSS, éviter repaints massifs).
- **Si S4** : re-cuire aux tailles standard.
- **Si ponctuel au basculement (S5)** : étaler/defer les rebuilds post-resize (précédent VUE-VILLE-PERF).

### L3 — Vérification
- FPS plein écran mesuré avant/après (même protocole L0) ; netteté vérifiée visuellement (captures aux deux résolutions) si un plafond est introduit ; toutes les non-régressions : minimap, RAPPORT-ENGAGEMENT, relecture, vue ville, calque dev.
- **Captures `dev-logs/captures-fullscreen-perf/`** : HUD perf fenêtré/F11 avant/après, captures netteté si plafond.

### L4 — ARRÊT POUR APPROBATION D'ERIK (obligatoire si compromis visuel)
Présenter mesures + options avec leur coût en netteté. Erik choisit. Correction pure (S2/S3/S4/S5 sans perte visuelle) : commit après validation standard.

### L5 — Rapport
- `REPORT-FULLSCREEN-PERF.md` : mesures, verdict, correctif, compromis choisi, captures, 🔶, ce qu'Erik valide en ligne (F11 chez lui).

## 4. Critères d'acceptation
1. Le lag F11 est mesuré, la cause nommée avec chiffres — pas de correctif sans diagnostic.
2. Après correctif : FPS plein écran fluide (cible ≥ 55-60) OU compromis explicite accepté par Erik.
3. Aucune perte de netteté non approuvée ; PLEIN-ECRAN-NET non cassé (le DPR reste suivi dans les limites choisies).
4. Suites vertes ; zéro changement moteur/serveur/protocole ; captures et chiffres fournis.

## 5. Périmètre interdit
- Moteur/serveur/protocole, la coquille Electron (sauf lecture), 3D, la sableuse ;
- Tout plafond de résolution ou toute réduction de qualité SANS l'arrêt d'approbation d'Erik ;
- Désactiver des fonctionnalités (minimap, filtres) pour « passer » le bench.
