# HANDOFF-VILLAGES-5SIEGES — Le placeur glouton manque le plancher de 15 villages sur 3 seeds à 5 sièges

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4, `REPORT-CI-FLAKY.md` (le mécanisme de correctif à REUTILISER : relances déterministes au RNG dérivé, cartes existantes bit-identiques) et le 🔴 du `REPORT-CI-FLAKY-2.md` : le banc élargi (100 seeds × 3 sièges, `devtmp/banc-ci-flaky.mjs`) a trouvé **seeds 110867, 649359, 760225** en 5 sièges avec 13-14 villages au lieu du plancher 15 (0/200 en 3 et 4 sièges). Même famille que le bug CI-FLAKY : `placeEntities` glouton à court de cases sous contraintes. **Zéro changement de valeur/règle** — seul le mécanisme de placement est corrigé, sur le modèle éprouvé.

## 1. Objectif

Faire respecter le plancher de villages en 5 sièges sur ces seeds (et toutes) **sans changer aucune carte qui passe déjà** — le précédent CI-FLAKY a prouvé la technique.

## 2. Mission

### L0 — Reproduction et diagnostic
- Reproduire les 3 seeds (banc dev) ; diagnostiquer la séquence d'épuisement (quelle contrainte sature : camps-ressources, artefacts, spawns, espacement ?) ; vérifier par backtracking (comme CI-FLAKY : `diag-faisabilite.mjs`) qu'une configuration complète à 15 existe pour chacune — si NON pour une seed, **STOP** : conflit de règles → Erik décide.

### L1 — Correctif (modèle CI-FLAKY)
- Relances déterministes au RNG dérivé dans `placeEntities` quand le plancher villages n'est pas atteint ; **bit-identité exigée** pour toutes les seeds qui passent déjà (comparaison banc avant/après sur 200 seeds × 3/4/5 sièges) ; les 3 seeds fautives deviennent des tests de non-régression.
- Si le simple mécanisme de relances ne suffit pas (ex. saturation réelle des cases sur certaines cartes), **STOP** avec options chiffrées — pas de relâchement de contrainte improvisé.

### L2 — Vérification
- Banc élargi 100 seeds × 3/4/5 sièges : 100 % aux planchers ; suites moteur + serveur vertes ; typecheck ; 5 rejeux identiques.

### L3 — ARRÊT POUR APPROBATION D'ERIK puis rapport
- `REPORT-VILLAGES-5SIEGES.md` : diagnostic, mécanisme, preuves de bit-identité, les 3 seeds corrigées, coût.

## 3. Critères d'acceptation
1. 100 % des seeds du banc (3/4/5 sièges) respectent les planchers de villages.
2. Toutes les cartes existantes bit-identiques hors seeds fautives.
3. Zéro changement de valeur/règle/protocole ; suites vertes ; zéro secret.

## 4. Périmètre interdit
- Toute valeur de règle, toute contrainte relâchée, le protocole, la coquille, la sableuse, l'UI.
