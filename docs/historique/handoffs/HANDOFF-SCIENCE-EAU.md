# HANDOFF-SCIENCE-EAU — Tuiles d'eau : 3 au lieu de 2

**Décision Erik 03/10.** Mission ciblée : ses tuiles d'eau doivent produire **3** (commerce, affiché en sciences après conversion R-90) au lieu de 2.

## 1. Préalables

Baseline : suites vertes (rules 969 + web 495 + server 120), `schemaVersion` 27 — elle ne bouge pas (donnée pure). Vérifier `git status` (sessions parallèles — Erik travaille ses assets 4K dans une autre session, ne pas toucher aux sources d'assets).

## 2. Champ exact (repéré par le pilot — à re-vérifier)

`packages/rules/src/data/terrain.json` :
- `eau` (Mer) — `yields.commerce` 2 → **3** (ligne ~78) ;
- `ocean` (Océan) — `yields.commerce` 2 → **3** (ligne ~90).

C'est le COMMERCE qui est visé (la science affichée en sort par la conversion R-90) — ne pas ajouter un champ `science` aux terrains.

## 3. Mission

- **L1 — test-first** : réécrire les tests qui figent 0/0/2 pour les eaux (les chercher : rendements de tuiles, économie de ville, fertilité de génération — citation R-93/§2 RULES) vers 0/0/3.
- **L2** : les deux valeurs de `terrain.json` + **RULES.md §2** (table des terrains, lignes Mer/Océan « 0/0/2 » → « 0/0/3 ») — SEULEMENT ces deux lignes de tableau.
- **L3** : suites vertes (rules + web + server), svelte-check 0 ; le glyphe de rendement et les panneaux lisent les données — aucune retouche UI attendue, le vérifier par un test/capture labo ou partie solo légale (une tuile d'eau travaillée affiche +3).
- **L4** : commit, push (la CI déploie), mini-rapport `REPORT-SCIENCE-EAU.md`.

## 4. Critères d'acceptation

- Mer ET Océan = 0 nourriture / 0 production / 3 commerce ; tout le reste inchangé (y compris les bonus Port/ressources marines qui se SUPERPOSENT — vérifier qu'aucun test ne « remplace » le rendement au lieu de l'additionner).

## 5. Périmètre interdit

Autres terrains, conversion R-90, ressources marines, Port, moteur de ville, protocole, `schemaVersion`.

## 6. Fin de session

Mini-rapport, arrêt, remise de la main.
