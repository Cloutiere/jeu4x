# PROPO-PRESSION-CULTURELLE-DEFENSIVE — La culture comme bonus défensif modulé par la pression sur la case

**Statut : proposition de cadrage — Erik tranche les points 🔶, puis le pilot écrit le HANDOFF.** Suite directe à PROPO-BATIMENT-CULTURE (V1 Sanctuaire actée) : objectif Erik — la culture génère une **pression par case**, décroissante avec la distance aux villes qui la produisent, qui donne un **bonus défensif** aux unités de la nation sous son influence. Effet recherché : rendre rentables les bâtiments culturels dans les villes neuves.

---

## 1. Où ça se branche (constat code, zéro surprise)

- La force défensive = `effectiveStrength(defense, veteran, Σ bonus%)` ; les bonus sont une **liste additive de `CombatMod`** (`bonusDefPct` — terrain, fortification, bâtiments de ville : [turn.ts:1152-1160](packages/rules/src/turn.ts)) → la pression culturelle s'ajoute comme **un mod de plus** (« Pression culturelle — T-xx »), affiché gratuitement dans le détail de combat et la préview.
- La culture par tour existe déjà centralisée : `cultureGains` (`culture.ts:283`). Le rayon d'influence visuel existe : `rayonCulturelDe` (anneaux 10/100/1000/10000, R-162) et `frontierRadius`.
- Points de calcul à modifier : le bloc de défense de `turn.ts` (3 sites : ~969, ~1155, ~5273 — factoriser dans une fonction pure).

## 2. Le modèle proposé (formule canon candidate)

### Pression d'une case

```
pression(case, nation) = Σ (villes v de la nation, dist(v, case) ≤ R)
                           cultureParTour(v) × F(dist)
```

- **F(dist) = atténuation par anneau** : ×1 à d≤1 (case de ville + adjacent), ×0,5 à d=2, ×0,25 à d=3 — « la moitié par anneau », intuitif et canon-adjacent (Civ : culture qui rayonne en anneaux).
- **R = 3 anneaux** (plafond de portée), indépendant du statut culturel de la ville au départ 🔶 (variante : R = `frontierRadius` réel de la ville — les anneaux visuels deviendraient gameplay ; plus fidèle, plus coûteux à calibrer).
- **Superposition** : les cases entre deux villes s'additionnent — c'est ce qui rend la densité urbaine défensive (le « cœur de l'empire » se défend mieux que l'avant-poste isolé).
- **Fog : aucun problème** — la pression ne porte que sur les VILLES PROPRES de la nation (toujours connues d'elles-mêmes). Pas de lecture des villes ennemies → aucun contournement du fog (canon).
- **Pur et déterministe** : fonction pure `pressionCulturelle(cities, tile, nation)` dans `culture.ts`, tri R-81, aucun RNG — testable hors Board, même philosophie que `rayonCulturelDe`.

### Pression → bonus défensif (paliers lisibles)

| Pression sur la case | Bonus défensif |
|---|---|
| 0 – 4 | +0 % |
| 5 – 9 | **+10 %** |
| 10 – 19 | **+20 %** |
| ≥ 20 | **+30 %** (plafond) |

Chiffrage avec les valeurs actuelles (V1 Sanctuaire incluse) :

| Ville type | Culture/tour | Case adjacente | d=2 | d=3 |
|---|---|---|---|---|
| Capitale pop 3 (Palais seul) | 3 | 3 → 0 % | 1,5 → 0 % | 0 |
| Capitale pop 3 + Sanctuaire | 4 | 4 → 0 % | 2 → 0 % | 1 → 0 % |
| Capitale pop 5 (Palais cap) + Sanctuaire | 6 | 6 → **+10 %** | 3 → 0 % | 1,5 → 0 % |
| Ville pop 3 + Temple + Sanctuaire | 7 | 7 → **+10 %** | 3,5 → 0 % | 1,75 → 0 % |
| Capitale pop 5 + Temple + Sanctuaire | 10 | 10 → **+20 %** | 5 → +10 % | 2,5 → 0 % |
| Deux villes pop 3 + Temple, adjacentes | 8 | 11,5 → **+20 %** | — | — |

Lecture d'équilibre : le bonus « gratuit » au démarrage est **nul** (capital pop 3 = 3 < 5) ; il faut **investir** (Sanctuaire 20 marteaux, Temple 40) OU **grandir** (pop 5) OU **densifier** (villes proches) pour l'obtenir — exactement le levier voulu (« augmente la valeur des bâtiments culturels dans les nouvelles villes » : une ville neuve + Sanctuaire contribue 4/tour au voisinage, et se définit elle-même +10 % une fois pop 5/Temples posés).

### Sens du bonus

Uniquement **défensif** (unités de la nation DÉFENDANT sur une case sous pression de LEUR nation) 🔶 — variante possible : symétrique en attaque (les unités qui sortent du cœur culturel attaquent mieux) — recommandation : NON, garder défensif pur (identité distincte du vétéran/Fondamentalisme, et pas de spirale offensive).

## 3. Tranchés 🔶 — Erik tranche

1. **Portée R** : (a) plafond fixe **3 anneaux** (proposé — simple, calibrage direct) / (b) R = `frontierRadius` réel de chaque ville (les anneaux visuels R-162 deviennent gameplay — plus fidèle, mais le palier 1 de la frontière ne dépassant pas la zone cultivée, les jeunes villes ne rayonneraient presque pas).
2. **Atténuation** : (a) ×1 / ×0,5 / ×0,25 (moitié par anneau, proposé) / (b) ×1 / 0,66 / 0,33 / 0,25 sur 4 anneaux / (c) décroissance entière culture ÷ dist (plus brutale).
3. **Paliers de bonus** : (a) 5 / 10 / 20 → +10 / +20 / +30 % (proposé) / (b) continu : `min(0,30, pression × 0,02)` (progressif, moins lisible en UI) / (c) deux paliers seulement 10/20 %.
4. **Plafond** : **+30 %** 🔶 (à comparer : terrain colline ~+25-50 %, fortification, Palais +35 %, Remparts +50 % — le culturel ne doit pas écraser le terrain).
5. **Les unités ENNEMIES sur une case sous TA pression** : aucun malus en V1 🔶 (la pénalité/malus d'être en territoire ennemi hostile existe déjà ailleurs ; la pression ennemie offensive = un futur chantier conversion, hors périmètre).
6. **Les villes ennemies capturées** : leurs bâtiments sont perdus (R-66) mais leurs merveilles survivent → la culture de la ville capturée (Palais non — déplacé ; merveilles culturelles oui) continue de presser pour le NOUVEAU propriétaire 🔶 — proposer : oui, cohérent avec « merveilles survivent ».
7. **Anarchie** : culture à 0 ce tour → pression à 0 ce tour 🔶 (proposé : oui, miroir R-122).

## 4. Implémentation estimée

- `culture.ts` : fonction pure `pressionCulturelle` + table des paliers dans `culture.json` (data-driven : `pressureRanges {dist1:1, dist2:0.5, dist3:0.25, maxRings:3}` + `defenseTiers [5,10,20]` + `defenseBonus [0.1,0.2,0.3]`).
- `turn.ts` : 3 sites de calcul de défense factorisés en un appel — **~40-60 lignes de moteur + 20 de données**.
- UI : le `CombatMod` « Pression culturelle » apparaît dans le détail de combat et la préview sans travail dédié ; (option, backlog) afficher la pression d'une case à l'infobulle.
- Tests : pur (`culture.test.ts` — atténuation, superposition, plafond, bordures de paliers) + intégration (combat sous pression).
- Banc : **métrique de non-régression** — chutes ≤ 2, élims, fondations ≥ 5 (le bonus défensif peut durcir les chutes de villes : le critère défense actuel doit rester vert) ; mesure d'usage (combats avec le mod actif, fréquence du +10/+20/+30). À l'œil : Erik vs Jev en prod.
- Estimation : **une demi-journée** (moteur + tests + data), pas de migration (`schemaVersion` inchangé — calcul dérivé, aucun état nouveau).

⚠ **Interaction à surveiller** : ce bonus renforce la défense DES VILLES (garnison) autant que du champ — dans le contexte du plan défense-de-ville récemment clôturé (chutes 14→2), ça peut encore réduire les chutes au banc. Le critère « chutes ≤ 2 » ne peut pas descendre sous 0 ; l'effet réel à arbitrer est à l'œil.

## 5. Ordre de mise en œuvre proposé

1. **Tranche 1 — pression défensive** (ce document) : formule + paliers + mod de combat.
2. **Tranche 2 (backlog)** : affichage de la pression par case à l'infobulle/préview de déplacement.
3. **Tranche 3 (backlog, lié Territoire_culturel.md)** : la pression ennemie comme moteur de conversion/flip (R-162 phase 2) — le même calcul `pressionCulturelle` resservira tel quel.
