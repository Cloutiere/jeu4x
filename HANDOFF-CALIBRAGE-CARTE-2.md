# HANDOFF-CALIBRAGE-CARTE-2 — Défauts prairies/ressources + élargissement de la Mosaïque

**Décisions Erik 03/10 (session de calibrage en cours, suite de `ac26354`).**

## 1. Préalables

- Lire `packages/rules/src/progen/settings.ts` (en-tête : convention des 🔶 curseurs de calibrage) et le test `packages/rules/tests/progen.test.ts` « les valeurs de base d'Erik … sont les défauts 🔶 » (curseur figé, motif déjà rencontré).
- Baseline : rules 952 verts, `schemaVersion` 27. Vérifier `git status` avant d'écrire (sessions parallèles possibles — le serveur dev 5174 d'Erik tourne, ne pas y toucher).

## 2. Contexte

Erik calibre la carte à l'atelier `#/progen` et a arrêté deux nouvelles valeurs de défaut. Par ailleurs il veut pousser la **Mosaïque** (`terrainPatchScale`) **en dessous de 0,25**, ce qui est aujourd'hui impossible : le clamp moteur (`settings.ts:252`, `Math.max(0.25, …)`) ET le curseur du labo (`Progen.svelte:371`, `min="0.25" step="0.05"`) bloquent. La valeur qu'il choisira sera commitée dans une passe suivante — ce handoff ne fait qu'ouvrir la plage.

## 3. Décisions de tranche (défaut appliqué — veto Erik possible)

- **D1 — Défauts** : `prairieDensity` 0.25 → **0.10** ; `resourceDensity` 1.5 → **1.2**. `forestDensity` reste 0.5 (commit ac26354).
- **D2 — Plage Mosaïque élargie** : clamp moteur min 0.25 → **0.05** (max 1.5 inchangé) ; curseur labo `min="0.05" step="0.01"` (le pas 0.05 est trop grossier en bas de plage). **Défaut inchangé (0.3)** — Erik choisira sa valeur à l'atelier après la livraison.
- **D3 — Sérénité en bas de plage** : vérifier par tests + labo que des valeurs très basses (0.05–0.10) ne produisent rien de dégénéré (zones toujours peintes, pas de crash, bancs de conformité verts aux défauts). Si l'algorithme des zones se comporte anormalement sous un certain seuil, le consigner dans le rapport (🔗 future retouche d'algorithme annoncée par Erik — ne PAS la faire dans ce handoff).

## 4. Mission

- **L0** : relire les fichiers cités, confirmer les lignes (clamp `settings.ts:252`, curseur `Progen.svelte:371`, test figé `progen.test.ts` §« valeurs de base »).
- **L1 — test-first** : mettre à jour le test figé (prairieDensity 0.10, resourceDensity 1.2) ; ajouter un test de clamp : `resolveProgenSettings({ terrainPatchScale: 0.01 })` → 0.05 (borne basse respectée), et une génération à `terrainPatchScale: 0.05` qui réussit (carte valide, banc de conformité au moins sur ce cas).
- **L2** : appliquer D1 et D2 (deux fichiers + tests — rien d'autre).
- **L3** : bancs de conformité complets (suite `packages/rules` entière — les 500 seeds, villages 5 sièges et spawns garantis doivent rester verts avec les NOUVEAUX défauts) ; vérification GUI du labo `#/progen` avec captures `dev-logs/captures-calibrage-carte-2/` : curseur Mosaïque descendu à 0.05, rendu de zones très petites lisible et sans artefact ; curseurs affichant 10 % de prairies et ×1.2 au chargement.
- **L4** : suites vertes (rules entière + svelte-check), commit, push (la CI déploie), rapport `REPORT-CALIBRAGE-CARTE-2.md`.

## 5. Critères d'acceptation

- Nouvelle partie : carte à 10 % de prairies, densité de ressources ×1.2.
- Labo : la Mosaïque descend à 0.05 par pas de 0.01, rendu propre (captures).
- Bancs de conformité verts aux nouveaux défauts.

## 6. Périmètre interdit

Toute retouche de l'ALGORITHME de génération (annoncée par Erik pour une passe suivante — uniquement consigner les anomalies éventuelles en bas de plage) ; les autres curseurs et défauts ; le 1v1 miroir 40×40 en dur ; `schemaVersion` (aucune migration) ; protocole/serveur.

## 7. Fin de session

Rapport `REPORT-CALIBRAGE-CARTE-2.md` (valeurs, anomalies bas-de-plage éventuelles, liste « reste à vérifier en ligne par Erik »), arrêt, remise de la main. Ne jamais committer les fichiers non trackés d'Erik.
