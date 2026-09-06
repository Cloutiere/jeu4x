# HANDOFF — Correctifs d'interaction 3D : déplacements refusés à tort + cases de production

Tu reprends le pilotage pour une mission **correctif d'interaction**, test-first. **Préalables :** `HANDOFF.md` §4, baseline **868+ tests** + typecheck, contexte V1/V2 : `GameCanvas.svelte` (fonctions pures `clickAction`/`rightClickAction` de `render/interaction.ts` —inchangées depuis le 2D—, picking 3D `pickHex3D`, worked tiles), `RULES.md` §3 (R-2 empilement : ville + 1 défenseur excepté ; R-51+ résolution simultanée des ordres). `schemaVersion` 18 inchangée. Contexte : constats d'Erik **en partie solo, vue 3D**.

## Correctif 1 — Déplacements : cases refusées à tort

**Constats d'Erik** : en 3D, il ne peut pas déplacer une unité **sur sa propre ville**, ni sur **une case où une unité amie se trouve actuellement mais pour laquelle il a prévu le départ**.

**Analyse attendue (à vérifier)** : en résolution **simultanée**, les ordres sont posés avant d'être résolus — une case amie occupée **au moment du clic** doit être **ciblable** si (a) l'occupant a un ordre de départ prévu, ou (b) la résolution valide (collision R-53/55 gérée). Le refus vient probablement du **prédictat d'interaction** (`enterableKnown`/`clickAction` 2D hérité en 3D) qui refuse « case amie occupée » statiquement — ou du picking 3D qui renvoie la mauvaise entité/case au-dessus d'une ville (la structure Mainframe intercepte le rayon ?). Même symptôme sur la ville : entrer dans sa propre ville = garnison (légal) — si le clic sur le Mainframe sélectionne la ville au lieu de l'unité (alternance R-2), le mouvement vers la case doit rester possible (brouillon de chemin).

**Correctif** : les règles de ciblage autorisent (i) l'entrée dans sa propre ville, (ii) le ciblage d'une case amie occupée **dont l'occupant a un ordre** (et, 🔶 à trancher : sans ordre aussi — le moteur gère la collision, l'ordre peut être « ignoré individuellement » à la résolution ; défaut : autorisé, le moteur tranche) ; le chemin 3D s'affiche vers ces cases comme vers les cases libres. **Tests** : les deux cas par les fonctions pures (2D ET 3D — le prédicat est partagé) + un cas de non-régression (case ennemie occupée reste refusée selon R-2/R-51).

## Correctif 2 — Cases de production : re-clic impossible

**Constat d'Erik** : la sélection des cases de production des villes fonctionne, mais **après avoir décoché/sélectionné une zone, impossible de cliquer sur une autre zone**.

**Analyse attendue** : les worked tiles sont des marqueurs superposés en 3D — après désélection, soit le marqueur consomme le clic (rayon intercepté par un mesh non-retiré), soit l'état de sélection reste verrouillé (mode « assignation » non nettoyé), soit le picking renvoie la vieille case. Reproduire en e2e : ville → panneau → mode assignation → sélection A → désélection → sélection B.

**Correctif** : le re-clic sur une autre case doit fonctionner en 3D comme en 2D (test des deux modes) ; aucun marqueur résiduel.

## Mission
Correctifs test-first (fonctions pures d'abord, puis integration 3D), e2e sur vraie partie solo (mouvement vers ville, vers case libérable, worked tiles aller-retour), captures, CI, prod saine, rapport court `REPORT-INTERACTION-3D.md`. Baseline 868+ verts, schemaVersion 18. **Ne pas toucher** : moteur/serveur sauf si le prédicat partagé l'exige (alors tests 2D d'abord) ; atelier d'Erik (inspecter le répertoire avant commit) ; unités 3D (chantier parallèle).

## Fin de session
Rapport, arrêt, remise de la main au pilot.
