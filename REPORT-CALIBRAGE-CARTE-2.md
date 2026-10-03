# REPORT-CALIBRAGE-CARTE-2 — Défauts prairies/ressources + plage Mosaïque élargie

Exécution du handoff `HANDOFF-CALIBRAGE-CARTE-2.md` (décisions Erik 03/10).

## Livré

- **D1 — Défauts** (`packages/rules/src/progen/settings.ts`) :
  - `prairieDensity` 0.25 → **0.10** (curseur labo affiche « 10 % de prairies » au chargement) ;
  - `resourceDensity` 1.5 → **1.2** (curseur affiche « ×1.2 ») ;
  - `forestDensity` inchangé (0.5, ac26354).
- **D2 — Plage Mosaïque élargie** :
  - clamp moteur `settings.ts:252` : min 0.25 → **0.05** (max 1.5 inchangé) ;
  - curseur labo `Progen.svelte:371` : `min="0.05" step="0.01"` (vérifié dans le DOM : min=0.05 step=0.01 max=1.5) ;
  - **défaut inchangé (0.3)** — Erik choisira sa valeur à l'atelier.
- **Tests (test-first, L1)** — `packages/rules/tests/progen.test.ts` :
  - test figé 🔶 mis à jour (0.10 / 1.2) ;
  - nouveau test D2 : `resolveProgenSettings({ terrainPatchScale: 0.01 })` → 0.05 (et 2 → 1.5) ;
  - nouveau test D3 : génération complète à `terrainPatchScale: 0.05` → carte pleine (toutes cases peintes), eau présente, 2 spawns.

## Vérifications

- **Bancs de conformité** : suite `packages/rules` entière **954/954 verte** (500 seeds, villages 5 sièges, spawns garantis, aux NOUVEAUX défauts).
- **svelte-check** : 0 erreur (14 warnings préexistants).
- **GUI labo `#/progen`** (serveur dev 5174 d'Erik, non touché) :
  - au chargement : curseurs à 10 % de prairies et ×1.2 ✔ ;
  - Mosaïque descendue à ×0.05 par pas de 0.01 ✔, carte régénérée, zones très petites mais **toujours peintes et lisibles** (océan/mer/forêt/prairie/plaine), aucun artefact visible ;
  - captures : `dev-logs/captures-calibrage-carte-2/` (defauts-chargement.png, defauts-curseurs-prairies-ressources.png, mosaique-0.05-carte.png, mosaique-0.05-rendu.png).

## D3 — Anomalies en bas de plage (consignées, NON retouchées)

- **Aucun comportement dégénéré à 0.05** : toutes les cases restent peintes, pas de crash, bancs verts. L'algorithme des zones se comporte correctement sur toute la plage ouverte.
- 🔶 **Observation hors périmètre** (préexistante, NON liée à cette mission — vérifié identique aux anciens défauts 0.25/1.5) : aux seeds `20260902` et `606`, la connexité terrestre des 2 spawns est KO (le labo affiche « Connexité KO / Tentatives 5 »). Le miroir garantit l'équité, pas la connexité ; la suite de tests ne couvre la connexité que sur certains seeds (42 ✔). Candidate pour la future retouche d'algorithme annoncée par Erik.

## Reste à vérifier en ligne par Erik

1. Nouvelle partie réelle : carte à 10 % de prairies, ressources ×1.2 (les bancs et le labo le confirment, mais pas de partie e2e dans ce handoff — périmètre règle « rien d'autre »).
2. Choix de la valeur de Mosaïque à l'atelier (plage 0.05–1.5, pas 0.01) → passe de commit suivante pour le défaut.
3. À l'œil : lisibilité des zones très petites à 0.05 en jeu (les captures labo sont favorables).

## Périmètre respecté

Aucune retouche d'algorithme, aucun autre curseur, `schemaVersion` 27 inchangée, zéro serveur/protocole. Fichiers touchés : `settings.ts`, `progen.test.ts`, `Progen.svelte` — rien d'autre.
