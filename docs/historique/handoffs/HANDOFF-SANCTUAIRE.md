# HANDOFF-SANCTUAIRE — Bâtiment « Sanctuaire » : +1 Culture flat/tour, 20 marteaux, sans tech

**Mission d'implémentation — V1 ACTÉE par Erik (rév. 14/11).** Spec de référence : `PROPO-BATIMENT-CULTURE.md` (racine) — lis-le en entier AVANT de coder ; sa §3 « Implémentation data-driven » EST le plan, ce handoff l'ordonnance et fixe les critères. Les chiffres ci-dessous sont des DÉCISIONS, pas des propositions : ne pas re-négocier le coût ni l'effet (toute envie de changer une valeur = arrêt-pour-approbation, pas une initiative).

## 0. Préalables

- Docs à lire : `PROPO-BATIMENT-CULTURE.md` (§1 le canal culture, §3 la proposition) ; `RULES.md` R-113 (Palais/Temple/Cathédrale), R-115/R-131 (jalons), R-116 (victoire culturelle).
- Baseline attendue : rules **1214** / server 544 / web 793 / jev-port 52 verts, `schemaVersion` **28**. Vérifie au `git log` que `main` est bien sur la passation du 15/11 (`f5e0560` ou après) — **`git status` avant de commencer** (Erik pilote parfois en parallèle ; ne touche JAMAIS à ses fichiers non trackés : `Techtree/`, PDF, images, `devtmp/` perso).
- ⚠ Pièges actifs : cache vitest `.vite` à la RACINE à purger avant toute re-mesure de banc ; bancs lourds en contention = flaky (re-passer isolé) ; `TOUTE distance est wrappée` (sans objet ici — zéro distance dans cette mission) ; captures locales AVANT tout commit.
- Aucune nouvelle forme d'ordre → `orderShapeError` non concerné.

## 1. Contexte (en 60 secondes)

La culture se génère par `cultureGains()` (`packages/rules/src/culture.ts:283-338`, appelée `turn.ts:4657-4664`). Avant le Temple (`rites_funeraires`, 40 marteaux, ~t15-t30), la SEULE source est le Palais (capitale, plafond 5) : villes secondaires à 0, 1ᵉʳ palier culturel (150) pas avant ~t35-t50. Le Sanctuaire comble le trou : **20 marteaux, +1 culture flat/tour, sans tech** — strictement dominé par le Temple (échelle lisible 20 → 40 → 160). Au banc, la voie culturelle est aujourd'hui morte (0-2 paliers en 400+ tours).

## 2. Décisions tranchées (défauts fixés par Erik — veto possible, sinon tu codes)

| # | Décision | Valeur |
|---|---|---|
| D1 | Effet | `cultureFlat: 1` — champ NOUVEAU, hors part `culturePerCitizen` |
| D2 | Coût | **20 marteaux** — nouveau palier de prix, sous la table existante (40) |
| D3 | Tech | `tech: null` — disponible d'office au menu de production (comme la Galère) |
| D4 | Stonehenge | NE multiplie PAS le flat (il reste fidèle à la lignée Temple/Cathédrale `culturePerCitizen`) |
| D5 | Monarchie | N'affecte pas le flat (part Palais seule, inchangée) |
| D6 | Communisme | N'annule PAS le flat (bâtiment civil, pas religieux) |
| D7 | Théâtre de Shakespeare | ×2 S'APPLIQUE (il multiplie la culture TOTALE de la ville — le flat en fait partie, c'est le comportement existant du multiplicateur) |
| D8 | Anarchie | Gèle tout (déjà le cas `turn.ts:4657` — rien à faire) |
| D9 | 🔶 Icône | AUCUN asset n'existe (`icone_batiment_sanctuaire.png`) — le repli initiale est accepté, la mission n'en produit PAS ; verdict visuel à l'œil par Erik, asset ensuite (décision Erik, hors périmètre) |
| D10 | `schemaVersion` | INCHANGÉE (champ optionnel en données, zéro migration) |

## 3. Mission

### L0 — Données : l'entrée `buildings.json`
`packages/rules/src/data/buildings.json`, insérée après `temple` (lisibilité de l'échelle) :
```json
"sanctuaire": {
  "id": "sanctuaire",
  "name": "Sanctuaire",
  "cost": 20,
  "workRadiusBonus": 0,
  "tileBonus": null,
  "tech": null,
  "cultureFlat": 1,
  "effect": "+1 Culture par tour, indépendant de la population"
}
```
Test-first : le test d'intégrité de table (`data.test.ts`) doit rester vert tel quel (si il énumère les champs requis, étends-le pour couvrir `sanctuaire`).

### L1 — Moteur : le champ + la formule (~10 lignes)
1. `packages/rules/src/types.ts` (~ligne 136, à côté de `culturePerCitizen`) : `cultureFlat?: number;` avec un commentaire citant la décision (bâtiment civil pré-Temple, hors lignée Temple — Stonehenge/Communisme intouchés).
2. `packages/rules/src/culture.ts` dans `cultureGains` (bloc ~291-301) : `flat += b.cultureFlat ?? 0;` — dans la part FLAT de la formule (à côté du `culturePerCitizenCap` du Palais), PAS dans `perCitizen`. C'est ce placement qui obtient D4/D5/D6 gratuitement ; vérifie en lisant que le Théâtre (D7) et l'anarchie (D8) opèrent en amont/aval sans toucher au nouveau champ.
3. Tests (`culture.test.ts`, test-first) : ville pop 3 non-capitale + Sanctuaire = 1 (flat indépendant de pop) ; même ville sous Communisme = 1 toujours ; Stonehenge + Sanctuaire sans Temple = 1 (non multiplié) ; Théâtre + Sanctuaire = 2 ; capitale pop 3 + Sanctuaire = Palais-part + 1.

### L2 — UI : vérifier, ne pas construire
Le menu de production, la bannière de tête de file et les textures dérivent tous de `Object.keys(BUILDINGS)` (`productionMenu.ts`, `bande-ville.ts`, `textures.ts:676/921/1030`, `icones-unites.ts:66` `nomIconeBatiment`) — le Sanctuaire doit donc apparaître SEUL, zéro modif UI attendue. Vérifie par capture locale : le bâtiment visible dans le menu d'une ville dès t1 (tech null), tooltip avec l'`effect`, repli d'icône propre (D9) sans erreur console.

### L3 — Banc bot 40×3 AVANT/APRÈS (l'arbitre chiffré)
Harness canon : `apps/server/src/bancBotTd.ts` / `tests-banc/banc-bot-td.test.ts` (résultats JSON dans `devtmp/`, cf. `banc-bot-td-APRES-*.json`). **Banc AVANT** (main actuelle) puis **banc APRÈS**, mêmes seeds, cache `.vite` purgé entre les deux. Mesures : culture cumulée empire, **tour du 1ᵉʳ palier** (événement `CultureMilestone` reason `cultureLevel`), paliers/jalons à t100 et fin, + les métriques défense usuels (chutes, fondations) et victoires.
- ⚠ Risque honnête consigné dans la propo : à +1 flat, l'effet peut être peu visible au banc (bot à 1-2 villes t10-t40).

### L4 — Déploiement
Suites complètes vertes (turbo racine) → captures locales → commit (message citant SANCTUAIRE + les décisions D1-D3) → push → **vérifier CI/Deploy** (re-run API si flocon wrangler/Tests) → prod `curl` 200. Purge le cache vitest racine avant le banc final.

## 4. Critères d'acceptation (mesurables)

1. Suites vertes : rules (1214 + nouveaux), server 544, web 793, jev-port 52 — aucune assertion existante changée.
2. Banc bot 40×3 : **zéro collapse**, victoires/pertes dans le bruit de la variance (pas de régression structurelle).
3. **Critère culture** : 1ᵉʳ palier culturel avant t60-t80 dans ≥ 2 parties/3 (contre ~t100+ avant). Assouplissement pré-autorisé : si invisible au banc (risque consigné), consigne-le dans le rapport et bascule l'évaluation à l'œil en prod — N'ITÈRE PAS sur le coût ou l'effet pour « faire bouger le banc ».
4. **Critère défense inchangé** : chutes ≤ 2, fondations ≥ 5 sur les seeds défense (le Sanctuaire ne doit pas dégrader le plan défense-ville).
5. Captures locales : menu de production avec Sanctuaire + tooltip + repli d'icône propre.
6. `git status` propre à la fin (aucun fichier d'Erik commité), Deploy SUCCESS vérifié via API, prod 200.
7. Rapport `REPORT-SANCTUAIRE.md` à la racine : chiffres banc AVANT/APRÈS, écarts éventuels, arrêt-pour-approbation final.

## 5. Périmètre interdit

- **Zéro modif** à Stonehenge/templeCultureMult, Monarchie, Communisme, Théâtre, anarchie, `cultureEmpireOf`, paliers/seuils (`culture.json`), ONU/victoire culturelle.
- Pas d'asset d'art (D9), pas d'affichage de pression culturelle, pas de tranches 2/3 (backlog).
- Pas de retouche du bot (priorités de production) — le bot doit découvrir le bâtiment avec ses arbitrages actuels ; s'il ne le bâtit jamais au banc, consigne-le, ne force pas.
- Ne pas toucher au condensé Jev ni aux questions LLM (coût input intouché).
- Fichiers d'Erik non trackés : ne JAMAIS les committer ni les déplacer.

## 6. Fin de session

Rapport `REPORT-SANCTUAIRE.md` (racine) → **arrêt-pour-approbation** : c'est Erik qui rejoue, valide à l'œil et fait committer/pousser s'il est satisfait. Ne pousse jamais sans son feu vert explicite. Remise de la main : lister ce qui reste (pression culturelle = handoff SUIVANT, sérialisé — ne pas la commencer).
