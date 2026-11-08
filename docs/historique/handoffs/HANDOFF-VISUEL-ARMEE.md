# HANDOFF-VISUEL-ARMEE — Une armée se voit : 3 icônes sur la bannière, barre de vie segmentée

**Statut : prêt — NON LANCÉ.** Retour d'Erik après GESTE-ARMEE (rev. 2, `fa5a32f`) : on ne distingue pas visuellement une armée d'une unité simple. **Décision d'Erik : 3 fois l'icône de l'unité sur une première ligne de la bannière, barre de vie en dessous.** L'asset de l'unité reste INTOUCHÉ — on ne touche qu'à la bannière/panneau. Raffinements endossés par le pilot (à vetoer) : la barre de vie reste segmentée en 3 blocs proportionnels aux 9 PV (chaque bloc ≈ un membre) ; le panneau garde « Guerrier (armée) ».

## 0. Préalables

1. `REPORT-GESTE-ARMEE.md` (l'armée jouable, « Guerrier (armée) », PV 9/3) ; `ICONES-UNITES` (pipeline d'icônes bannière/terrain/garnison — réutiliser les assets existants, AUCUN nouvel asset) ; le composant de bannière de ville/unité dans `apps/web/src/lib/render/` (la bannière qui porte aujourd'hui 1 icône + barre segmentée — l'écran d'Erik la montre : icône or + barre bleue segmentée) ;
2. Le champ moteur : `unit.isArmy` (existe — le dump admin le montre) ; le client le connaît déjà au panneau (« Guerrier (armée) ») ;
3. ⚠ Discipline : c'est du RENDU PUR — zéro logique, zéro serveur, zéro moteur. Labo de calibrage visuel : captures à l'œil d'Erik AVANT commit (règle d'Erik), dans une partie solo vs bots avec une armée formée (le script `devtmp/geste-armee-gui.mjs` produit déjà une armée — le réutiliser). ⚠ PIÈGE MAJEUR consigné au REPORT-GESTE-ARMEE §4 : TOUT (page, ws, admin) sur LE MÊME worker 8787 (proxy figé) — jamais un second worker sur le même sqlite.

## 1. Décisions de tranche (votées — ne rien étendre)

- **D1 — Bannière d'armée : 3 mini-icônes sur la première ligne** : même icône (le type de l'unité), ×3, taille calibrée pour tenir dans la bannière actuelle (la bannière s'élargit/épaissit si nécessaire — au labo à l'œil) ; en dessous, la barre de vie INCHANGÉE (elle est déjà segmentée en 3 — vérifier que la segmentation suit les PV réels : armée pleine = 3 blocs pleins, blessée = proportionnels) ;
- **D2 — Une unité simple reste exactement comme aujourd'hui** (1 icône, même bannière) — le contraste 1 vs 3 est le signal ;
- **D3 — L'armée blessée se lit** : la barre segmentée proportionnelle (5/9 → ~1,7 blocs pleins — arrondi visuel consigné ; si la segmentation actuelle ne suit pas les PV de l'armée, corriger CÔTÉ AFFICHAGE seulement) ;
- **D4 — Intouchés** : l'asset de l'unité (le sprite), le rendu de la tuile, le panneau au-delà du libellé existant « (armée) », le moteur, le serveur, `schemaVersion` 28. Garnisons dans les villes : la même bannière si applicable (consigner ce qui est vu).

## 2. Mission L0→L2

- **L0** : suites web 751 + svelte-check verts ; armée formée en GUI local (script existant).
- **L1 — Tests FIRST (web)** : la bannière rend 3 icônes ssi `isArmy` (1 sinon) ; la segmentation de barre suit les PV de l'armée ; aucune régression des bannières d'unités simples, villes, garnisons (tests existants).
- **L2 — Labo visuel + captures AVANT commit** : captures (1280×720) d'armée pleine / blessée / unité simple côte à côte — ERIK VALIDE LE VISUEL avant commit (arrêt-pour-approbation : le design est subjectif). Suites complètes web + svelte-check, commit + push, rapport court `REPORT-VISUEL-ARMEE.md`.

## 3. Critères d'acceptation

1. Une armée se distingue d'une unité en un coup d'œil sur la carte (3 icônes) ;
2. La vie restante d'une armée blessée se lit sur la barre segmentée ;
3. Zéro changement hors bannière/panneau ; asset unité intact ; suites web vertes ; captures validées par Erik avant commit.

## 4. Périmètre interdit

Le sprite de l'unité (contrainte Erik) ; le rendu de tuile ; le moteur/serveur ; les icônes (pipeline existant — réutilisation) ; jamais de fichier non tracké d'Erik.

## 5. Fin de session

Rapport + arrêt + remise de la main. À l'acceptation : le triangle armée est complet — former (proposition automatique + geste), jouer, et VOIR.
