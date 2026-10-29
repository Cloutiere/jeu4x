# HANDOFF-CULTURE-RESSOURCES — Canal culture des ressources travaillées : Encens +2, Soie +3

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `RULES.md` (R-114 canal culture, R-122 anarchie gèle la culture, R-66 Palais, T-27 paliers, R-60 worked tiles, R-91 ressources), `docs/recherche/PROPOSITION-RESSOURCES.md` (§culture : Encens +2, Soie +3, PAS de fusion culture/commerce — décision Erik documentée), `HANDOFF.md` §4. Baseline : suites vertes. **2D uniquement.** Chantier moteur (un terme de formule) + affichage — **les décisions d'Erik sont DÉJÀ PRISES** (02/10), ne les re-ouvre pas :
- **Culture seulement si la tuile est TRAVAILLÉE** par une ville (cohérence des rendements) ;
- **Guerre/occupation** : la ville capturée conserve le bonus (cohérence des rendements — celui qui travaille reçoit) ;
- **Anarchie** : pas de culture de ressource (la ville ne travaille pas — et R-122 gèle de toute façon le canal) ;
- **Pas de banc Jev** dans cette mission.

## 1. Objectif

Les ressources à valeur culturelle (données déjà en place : `encens.culture: 2`, `soie.culture: 3` — champ ignoré par le moteur à ce jour) deviennent **actives** : une ville qui travaille une tuile portant une ressource culturelle gagne ce bonus en culture par tour, qui coule dans le réservoir existant (`cultureCumulee` → paliers T-27 → jalons → GP). Zéro nouveau mécanisme en aval.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Générique et data-driven** : toute ressource avec `culture > 0` ET accessible au joueur (`revealedByTech` null ou tech débloquée — soie cachée jusqu'à Lettres, encens active dès le départ, décision D4 de la spec) apporte sa culture ; zéro durcissement.
- **D2 — Icône culture dans les glyphes** : une tuile travaillée à ressource culturelle affiche le glyphe **+N avec l'icône culture** (l'icône des jalons 0/20, déjà dans les textures). Règles d'affichage identiques aux autres rendements (filtre Rendements, rayon de ville, fog).
- **D3 — Panneau de ville** : culture/tour de la ville désormais significative → l'afficher (ligne culture, décomposition simple si l'existant s'y prête) ; 🔶 à l'œil.
- **D4 — Cas couverts par tests** : travaillée → bonus ; non travaillée → rien ; cachée (soie pré-Lettres) → rien ; anarchie → rien (gèle) ; ville capturée qui travaille → bonus au nouveau propriétaire ; reprise de partie existante (schemaVersion inchangée si le champ culture existe déjà dans les données — vérifier, migration a priori inutile).

## 3. Mission

### L0 — Préalables
- Baseline : suites vertes. Lis la formule de culture de ville (turn.ts — Palais R-66, merveilles) et le rendu des glyphes (GameCanvas — miroir tileYield).

### L1 — Moteur (test-first)
- La culture par tour d'une ville additionne les `culture` des ressources **accessibles sur ses tuiles travaillées effectives** (même définition de « travaillée » que les rendements). Coule dans `cultureCumulee` (aucun changement T-27/jalons).
- Tests (D4, exhaustifs) ; invariance des parties existantes (les villes sans ressource culturelle : culture inchangée — test bit-identité si le flux RNG n'est pas touché).

### L2 — Affichage
- Glyphe culture (D2) dans le miroir des rendements (carte du monde ET vue ville/panneau — respecter la conversion R-90 pour commerce, la culture n'a pas de conversion) ; panneau de ville (D3).
- **ADDENDUM (verdict Erik 02/10 — « or gem »)** : afficher aussi le **`directGold`** des ressources gemmes (+2) et or (+3) sur la tuile — glyphe **or** « +N » (même boucle de glyphes), conditions d'affichage = celles des autres rendements (ressource accessible, or caché avant Monnaie = brume + terrain seul, comme aujourd'hui). **Subtilité à documenter au rapport** : le glyphe or de gemmes/or ne suit PAS la conversion R-90 (l'or direct va à la trésorerie même si la ville convertit en science) — contrairement au commerce des autres tuiles, qui bascule or/science dans le rayon d'une ville convertie. Client seul, aucun changement data/moteur (R-134 est déjà implémenté : agent « or gem », commit `c0adb96`).

### L3 — Vérification
- Suites complètes ×2 ; e2e solo : ville fondée près d'encens → travaille la tuile → culture/tour augmente → palier T-27 accéléré visible (jauge 0/20) ; soie cachée avant Lettres → rien → révélée + travaillée → +3.
- **Captures `dev-logs/captures-culture-ressources/`** avant tout commit : glyphe +2 culture sur encens travaillé, panneau avec culture/tour, soie cachée (rien) vs révélée (+3).

### L4 — ARRÊT POUR APPROBATION D'ERIK
Captures + chiffres (culture/tour avant/après). 🔶 à l'œil (style du glyphe, panneau). NE COMMITTER QU'APRÈS FEU VERT.

### L5 — Rapport
- `REPORT-CULTURE-RESSOURCES.md` : formule, cas D4, captures, RULES.md à réaligner (le pilot s'en charge), 🔶, ce qu'Erik valide en ligne.

## 4. Critères d'acceptation
1. Encens travaillé = +2 culture/tour à la ville ; soie révélée et travaillée = +3 ; cachée/non travaillée = 0 ; anarchie = 0 ; capture = bonus au nouveau propriétaire.
2. Aucun effet sur les villes sans ressource culturelle travaillée (invariance).
3. Glyphe culture + panneau ; suites vertes ; zéro changement protocole ; migration inutile (vérifié au rapport).

## 5. Périmètre interdit
- Toute valeur (2/3 figées par la spec) ; le canal commerce (gemmes/or = mission séparée GEMMES-OR-BONUS, en cours) ; T-27/jalons/GP ; anarchie R-122 ; 3D ; la sableuse ; JEV.
