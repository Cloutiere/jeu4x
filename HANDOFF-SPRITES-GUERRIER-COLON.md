# HANDOFF-SPRITES-GUERRIER-COLON — Mise à jour des sprites guerrier et colon (nouveaux SVG d'Erik, 6 couleurs)

> **Contexte pour l'agent** : tu es l'agent d'implémentation du projet 4X (Eternal Empires). Lis `HANDOFF.md` §4 et `REPORT-ASSETS-6COULEURS.md` (le mode « variantes fournies » du pipeline : un SVG par couleur, aucun recoloriage). **2D uniquement.** Zéro changement moteur/serveur/protocole. **Les fichiers d'Erik (`new_units/new_colon/`, `new_units/new_guerrier/`) ne se committent JAMAIS** — copies en `assets-src/`.

## 1. Objectif (demande d'Erik du 30/09)

Erik a **revu ses SVG du guerrier et du colon** : `new_units/new_guerrier/guerrier_{bleu,rouge,vert,jaune,orange,ardoise}.svg` et `new_units/new_colon/colon_{...mêmes 6}.svg`. Mission : **remplacer les sprites actuels** de `unite_guerrier` et `unite_colon` par ces nouvelles versions (les 6 couleurs), cuisson et intégration identiques à la vague ASSETS-6COULEURS — Erik veut **les voir en jeu**.

## 2. Décisions tranchées par défaut (vetoables)

- **D1 — Remplacement pur, même pipeline** : mettre à jour les SOURCES des profils existants (mode « variantes fournies », export ×2 512×640, calibre standard) — aucune nouvelle mécanique, aucun recoloriage, aucune retouche des SVG. La variante `_ardoise` → faction Ardoise, mapping inchangé (bleu→Saphir, rouge→Rouge Royal, vert→Émeraude, jaune→Jaune d'Or, orange→Cuivre Ardent).
- **D2 — Approximation de teinte assumée** (comme la vague 1) : pas de contrôle des hex, pas d'alignement UI.
- **D3 — Rien d'autre ne bouge** : archer, barbare, GP, icônes, tuiles — intacts. Le calibre (`echelle`, hauteur écran) et le rendu sont inchangés — seuls les pixels des sprites changent.
- **D4 — A/B « avant »** : fiches `unite_guerrier_avant` / `unite_colon_avant` mises à jour (PNG du HEAD) — l'ancienne version reste récupérable.

## 3. Mission

### L0 — Préalables
- Baseline : tests + typecheck verts. Vérifie que les profils guerrier/colon actuels sont bien en mode « variantes fournies » et liste leurs sources à remplacer.

### L1 — Cuisson
- Copier les 12 SVG en `assets-src/modeles/`, pointer les profils, cuire les 2×6 variantes (`unite_guerrier@p1..p6`, `unite_colon@p1..p6`) + exports. Gates standards (dimensions, poids, cohérence source).
- `sync-art`, suites + typecheck verts.

### L2 — Vérification visuelle AVANT tout commit
- Labo `#/labo-rendu` : guerrier et colon ×6 couleurs posés en jeu (unités seules + cohabitations), calibre inchangé (guerrier et colon même hauteur que les unités existantes), netteté au zoom ×2.
- **Captures `dev-logs/captures-sprites-guerrier-colon/`** : fiches 6 couleurs avant/après pour les deux unités, close-up, vue en jeu.
- **ARRÊT POUR APPROBATION D'ERIK** — c'est lui qui a demandé à les voir ; feu vert avant commit.

### L3 — Rapport
- `REPORT-SPRITES-GUERRIER-COLON.md` : cuisson, A/B, captures, ce qu'Erik valide en ligne, 🔶 (calibre si les nouveaux dessins ont des proportions différentes, poids).

## 4. Critères d'acceptation
1. En jeu, guerrier ET colon = les nouveaux SVG d'Erik, 6 couleurs, calibre constant, nets au zoom.
2. Aucune autre unité/asset touché ; suites vertes ; zéro changement moteur/serveur/protocole ; fichiers d'Erik non commités.

## 5. Périmètre interdit
- Tout autre asset, la sableuse/JEV, le moteur/serveur, les valeurs de règles, 3D, retouche des SVG fournis.
