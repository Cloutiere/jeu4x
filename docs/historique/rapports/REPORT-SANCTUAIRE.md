# REPORT-SANCTUAIRE — Bâtiment « Sanctuaire » (+1 Culture flat/tour, 20 marteaux, sans tech)

**Mission livrée — ARRÊT-POUR-APPROBATION.** Zéro valeur re-négociée : D1-D10 appliqués tels quels
(HANDOFF-SANCTUAIRE.md). **Rien n'est poussé** — commit LOCAL, c'est Erik qui valide à l'œil et
fait pousser (§6 du handoff).

## 1. Ce qui a été codé (7 fichiers, +62/−2)

| Fichier | Contenu |
|---|---|
| `packages/rules/src/data/buildings.json` | Entrée `sanctuaire` (cost 20, `tech: null`, `cultureFlat: 1`, effect) insérée après `temple` (lisibilité de l'échelle 20 → 40 → 160) |
| `packages/rules/src/types.ts` | Champ `cultureFlat?: number` à côté de `culturePerCitizenCap`, commentaire citant les décisions D4-D7 |
| `packages/rules/src/culture.ts` | `cultureGains` : accumulateur `civilFlat` séparé — **ajouté au flat APRÈS le ×2 Monarchie** (D5 : la Monarchie ne l'affecte pas), en amont du multiplicateur Théâtre ×2 (D7 ✓), hors portée de Stonehenge (D4 ✓, multiplie `perCitizen` seule) et du Communisme (D6 ✓, n'annule que `perCitizen`) |
| `packages/rules/tests/culture.test.ts` | 1 test « SANCTUAIRE » : 7 assertions (flat indépendant pop 1/3, Communisme, Stonehenge, Théâtre ×2, capitale = Palais-part + 1, Monarchie = 2×Palais + 1) |
| `packages/rules/tests/data.test.ts` | Énumération des bâtiments 22 → 23 + `sanctuaire` (cost 20, tech null, cultureFlat 1, PAS de `culturePerCitizen`) |
| `packages/rules/tests/techs.test.ts` | R-87 : exception `sanctuaire` — disponible au DÉPART (D3, comme la Galère) ; les autres bâtiments restent verrouillés |
| `apps/web/src/lib/render3d/visuel3d.json` | `"sanctuaire": "culture"` dans `categorieBatiment` (test d'intégrité 3D « couvre tous les bâtiments » — data seule, aucun code UI) |

⚠ Écart mineur consigné : le handoff annonçait « zéro modif UI » — en pratique le test d'intégrité
3D du web (`structures3d.test.ts`) exige une entrée `categorieBatiment` par bâtiment ; ajout d'UNE
ligne data (catégorie `culture`), zéro code, dans l'esprit L2 (vérifier, ne pas construire).

Anarchie (D8) : rien à faire (turn.ts gèle tout en amont). `schemaVersion` : inchangée (D10).
Pression culturelle / asset d'icône / retouche bot : NON touchés (périmètre interdit respecté).

## 2. Suites (L4) — vertes

- **rules 1215 verts** (baseline 1214 + 1 nouveau test ; aucune assertion existante changée —
  R-87 et l'énumération data.test.ts EXTENDUS, pas affaiblis)
- **server 544 verts** · **web 793 verts** · **jev-port 52 verts**
- `tsc` : couvert par les suites (vitest transform + typecheck turbo non re-passé seul ; suites complètes vertes)

## 3. L2 — Capture locale (menu de production)

Partie solo locale (726MC2, worker 8787 + Vite 5174) : ville fondée t1, **Sanctuaire visible dans
le menu d'onglet Bâtiments dès t1** (`tech: null` ✓), libellé « Sanctuaire (20) +1 Culture par
tour, indépendant de la population » ✓, programmable en tête de file (bannière « S » sur la
bannière de ville ✓), repli d'icône propre (initiale « S », aucune erreur console). Captures :
`devtmp/captures-sanctuaire/menu-production-sanctuaire.png` et `ville1-fondee.png`.

## 4. Banc bot 40×3 AVANT/APRÈS (L3 — l'arbitre chiffré)

Harness : boucle canon de `bancBotTd` + mesures culture (`apps/server/devtmp/banc-sanctuaire.ts`,
même corpus `corpusBanc(40)`, cache `.vite` purgé, AVANT mesuré sur code d'origine via stash
temporaire). Données brutes : `devtmp/banc-sanctuaire-AVANT.json` / `-APRES.json` (120 parties,
~55-61 min par passe).

| Métrique (moyennes) | AVANT f/n/d | APRÈS f/n/d |
|---|---|---|
| Victoires p1 | 1 / 0 / 3 | 1 / 0 / 4 (variance) |
| Culture cumulée empire t100 | 941 / 885 / 731 | 957 / 919 / 772 |
| Culture cumulée empire FIN | 1524 / 1462 / 1199 | 1582 / 1541 / 1280 (**+3,8 % / +5,4 % / +6,7 %**) |
| Tour du 1ᵉʳ palier | 41,7 / 43,6 / 47,0 | 41,7 / 43,6 / 46,9 (inchangé) |
| Paliers à t100 | 5,98 / 5,45 / 4,45 | 6,03 / 5,68 / 4,70 |
| Paliers fin | 8,25 / 8,10 / 6,73 | 8,63 / 8,50 / 7,23 |
| Jalons fin | 9,28 / 9,13 / 7,80 | 9,65 / 9,50 / 8,28 |
| Chutes | 0,03 / 0 / 0,08 | 0,03 / 0 / 0,10 (**≤ 2 ✓**) |
| Fondations | 2 / 2 / 2 | 2 / 2 / 2 (≥ 5 sur seeds défense Jev — inchangé ici) |
| **Sanctuaires bâtis** | 0 / 0 / 0 | **0,63 / 0,75 / 0,85 — 17/21/25 parties sur 40** |

### Lecture honnête

1. **Le bot DÉCOUVRE le bâtiment** avec ses arbitrages actuels (43-63 % des parties en bâtissent
   au moins un) — pas de retouche bot, conformément au périmètre interdit. Zéro collapse :
   victoires/chutes/fondations dans le bruit de la variance.
2. **Le canal culture bouge mais reste mince** : +4-7 % de culture cumulée fin de partie,
   +0,3-0,5 palier. C'est l'effet attendu de +1 flat quand le bot n'a que 1-2 villes.
3. **Le critère banc du handoff (1ᵉʳ palier avant t60-t80 dans ≥ 2/3) est NON DISCRIMINANT** :
   il est déjà vrai AVANT (Palais seul ~t42-47). L'estimation « ~t100+ » de la propo ne tenait pas
   compte du plafond Palais à 5/tour sur pop 3-5. **Assouplissement pré-autorisé activé**
   (critère #3) : l'évaluation bascule À L'ŒIL EN PROD — N'ITÈRE PAS sur le coût/effet.
   Le gain réel du Sanctuaire est dans les VILLES SECONDAIRES (0 → 1 culture/tour avant le
   Temple), que le banc bot à 2 fondations ne montre presque pas.
4. Piège évité : cache vitest racine purgé entre les deux passes ; AVANT mesuré sur le code
   d'origine (stash temporaire des 3 fichiers moteur, reposés ensuite — suites re-verdies après).

## 5. Écarts & pièges consignés

- `cultureGains` multipliait TOUT le flat par `palaceCultureMult` — le champ a dû vivre dans un
  accumulateur séparé ajouté APRÈS cette ligne, sinon la Monarchie (D5) aurait ×2 le Sanctuaire.
- Vite d'Erik tournait avec une erreur d'overlay HMR préexistante (UnitPanel `$predictionsBataille`)
  et un socket 5174 zombie → redémarré ; un seul worker wrangler 8787 (piège connu des 2 mémoires DO).
- Fichiers non trackés d'Erik : JAMAIS touchés (vérifier `git status` à la remise de main).

## 6. Arrêt-pour-approbation

C'est Erik qui : (a) rejoue/valide à l'œil en prod le menu + l'effet (le critère banc étant non
discriminant, §4.3) ; (b) fait pousser le commit LOCAL s'il est satisfait ; (c) vérifie CI/Deploy +
prod 200 (L4) après push.

**Reste (sérialisé, NE PAS commencer)** : pression culturelle défensive (handoff SUIVANT —
Sanctuaire V1 acté + tranchés validés) ; tranche B ; Erik vs Jev arbitre réel en prod.
Asset d'icône `icone_batiment_sanctuaire.png` : décision Erik hors périmètre (D9).
