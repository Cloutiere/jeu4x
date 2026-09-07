# HANDOFF-FONDERIE-LOT — Habillage d'un lot d'assets externes (mode peintre)

**Contexte** : le workflow « peintre » a été validé par Erik sur le knight Tripo (`knight_v3.glb` — corps opaque teintable, facteur de luminance cuit, teintes J1-J6). Erik va déposer **plusieurs fichiers `.glb` générés par Tripo** dans `image_ref/` ; ce handoff cadre leur traitement en série, un modèle à la fois, avec validation d'Erik à l'œil pour CHAQUE modèle.

## 1. Préalables

1. **Prérequis bloquant** : le travail de la session précédente doit être COMMITTÉ avant de commencer (notamment le correctif du visualiseur — teinte qui multiplie la couleur du matériau — et `knight_v3.glb`). Vérifier `git status` : si du travail fonderie traite, le signaler à Erik et attendre son commit.
2. Lire **`STYLE-3D.md`**, **`FONDERIE.md`** (§ deux workflows — le mode peintre EST la procédure), et `fonderie/REPORT-FONDERIE-HABILLAGE-TRIPO.md` (les conventions établies : facteur cuit, teinte multiplication, matériau `accent_joueur` = corps entier).
3. Périmètre STRICT : écriture limitée à `fonderie/` (+ lecture de `image_ref/`). Jeu jamais lancé. `git status` vérifié au départ.

## 2. La procédure par modèle (le lot = cette boucle, répétée)

Pour CHAQUE `.glb` déposé par Erik dans `image_ref/` :

### Étape A — Analyse (5 minutes, avant toute chose)
1. Parser : tris, UV, matériau(x), texture, origine (Y min = sol ?), hauteur, **direction « avant »** (visière/arme — les exports regardent souvent +Z ; notre convention est -Z).
2. Présenter le bilan à Erik : conforme / adaptions nécessaires (orientation, échelle ~2,5-2,75 unités, tris < 5 500) / points de vigilance (ex. texture déjà teintée, plusieurs matériaux).
3. Nom de sortie : l'identifiant du type moteur si Erik l'a indiqué, sinon `<nom>_v3.glb` dans `fonderie/modeles/`.

### Étape B — Adaptation (mode peintre, conventions établies)
1. **Géométrie et UV intouchées** (orientation et échelle globale exceptées) ;
2. Texture repaintée dans la palette : corps **opaque neutre-clair** (teintable en multiplication), arêtes de plaques/tranchants **#3DFFCE**, glyphes éparses, + couche émissive dérivée (512 px, 1K si nécessaire avec l'accord d'Erik) ;
3. Matériaux : `accent_joueur` = corps entier, `neon` = éléments saillants (visière, lame, éclats) en petit second mesh/plages de sommets contiguës — **≤ 3 matériaux** ; facteur de luminance cuit et vérifié au rechargement ;
4. S'appuyer sur l'outil de la session knight (`outils/habiller-knight.mjs`) et le visualiseur corrigé — généraliser en `outils/habiller-<nom>.mjs` par modèle.

### Étape C — Validation d'Erik (obligatoire, modèle par modèle)
1. Dans le visualiseur : A/B contre l'unité existante la plus proche, teintes J1-J6 (le corps change, le néon jamais), bloom on/off, wireframe, compteur de tris.
2. **Erik valide, retouche ou rejette AVANT de passer au modèle suivant.** Un modèle rejeté n'est pas itéré plus de 2-3 tours sans faire le point avec lui (éviter l'effort infini — proposer une alternative : re-génération Tripo avec autre consigne, ou abandon).
3. Un modèle validé = un **atome commitable** (Erik dit « commite » quand il veut).

## 3. Règles du lot

- **Un modèle à la fois, du début à la fin** (analyse → adaptation → validation) — jamais un traitement de fond de tous les modèles puis une revue globale : la validation d'Erik est le goulot, elle doit être fraîche.
- Priorité : l'ordre que donne Erik ; sinon l'ordre de dépôt.
- Tout `.glb` hors budget (ex. > 20 000 tris sans option simplify) : le signaler avec le chiffre réel et demander s'il re-génère ou si on décime localement.
- Les images de référence associées (`image_ref/*.jpg`) servent à juger le look visé — les consulter à l'étape B.

## 4. Critères d'acceptation (par modèle)

- Erik valide à l'œil dans le visualiseur ; ≤ 5 500 tris ; ≤ 3 matériaux (`accent_joueur` + `neon` + 1 max) ; origine au sol, Y-up, face -Z ; échelle ~2,5-2,75 ; teinte J1-J6 lisible sur le corps, néon constant.
- Zéro fichier hors `fonderie/` touché ; commits atome par atome sur demande d'Erik.

## 5. Périmètre interdit

- L'intégration au jeu (mapping `visuel3d.json`, promotion `assets-src/modeles/`) : session séparée après le lot.
- Les 22 unités existantes et `knight_v3.glb` (référence validée) ; `STYLE-3D.md` (proposer, Erik décide).
- Mode sculpteur sur clay nu : abandonné, ne pas y revenir sans demande explicite d'Erik.

## 6. Fin de session

Journal par modèle + captures, rapport `fonderie/REPORT-FONDERIE-LOT.md`, arrêt, remise de la main.
