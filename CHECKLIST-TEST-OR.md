# CHECKLIST-TEST-OR — session de test réel d'Erik (or & rush-buy, R-134..R-137)

> **But** : tester l'essentiel de l'or en UNE session de jeu réaliste (30-45 min).
> Configuration : partie **solo** (cocher « Partie solo ») ou 5 sièges avec bots,
> civilisation **Aztèques** (+25 or au départ — trait `orDepart`, idéal : le
> premier rush est possible dès la fondation de la capitale).
> Chaque scénario : préparation → geste exact → résultat attendu à l'écran.
>
> **Hors périmètre volontairement** : la **victoire économique** (Banque mondiale,
> 20 000 or — R-137) n'est PAS testable en vraie partie de façon réaliste ; elle
> reste couverte par les tests automatiques (`packages/rules/tests/phase7l.test.ts`,
> 906 tests moteur verts). Idem pour les paliers au-delà de 250 (5 000/10 000/20 000).

---

## S1 — Fondation + premier rush-buy d'UNITÉ (R-135) — ~5 min

**Préparation** : rien (état de départ). Tu commences avec **25 or** (visible dans
le HUD en haut : icône or `25 (+0/tour)`) et un Colons + un Guerrier Jaguar.

1. Sélectionne le **Colons** → bouton **« Fonder une ville »** → **Fin de tour**
   (le moteur demande confirmation s'il reste des unités sans ordre :
   « Finir le tour quand même »).
2. **Double-clic sur la capitale** → vue ville.
3. Dans **Choix de production**, clique **Guerrier Jaguar (10)**.
4. Regarde la section **Production** : le bouton
   **« ⚡ Acheter maintenant pour 20 or »** apparaît immédiatement
   (10 marteaux × **facteur d'ère Antique ×2** — la valeur ×2 est dans le
   tooltip au survol).
5. Clique le bouton, puis **Fin de tour**.

**Résultat attendu** :
- trésorerie **25 → 5** (HUD) ;
- journal : « **Erik achète guerrier_jaguar dans … pour 20 or (rush-buy)** » puis
  « guerrier_jaguar produit par … » ;
- le Guerrier Jaguar apparaît sur/à côté de la capitale **immédiatement**
  (production instantanée, même à 0 marteau/tour).

## S2 — Refus propre : fonds insuffisants — ~2 min

**Préparation** : juste après S1 (trésorerie 5 or).

1. Vue ville → produis à nouveau un **Guerrier Jaguar** → fin de tour.
2. Rouvre la vue ville : le bouton d'achat est **grisé** avec la mention
   **« — trésorerie insuffisante (5 or) »** (tooltip identique).
3. Tente de cliquer quand même : rien ne se passe, **aucune erreur console**.

**Résultat attendu** : aucun achat, aucun débit, la file de production est intacte.

## S3 — Un seul achat par ville et par tour (R-135) — ~2 min

**Préparation** : accumule un peu d'or (S6 ci-dessous, conversion Or par défaut)
jusqu'à pouvoir payer deux achats (≥ 2 × coût).

1. Vue ville → produis une unité → clique **« Acheter maintenant »** une fois.
2. Le bouton devient **« achat déjà programmé ce tour (1 achat/ville/tour — R-135) »**
   (grisé). Essaie de recliquer : rien.

**Résultat attendu** : un seul achat sera exécuté à la résolution (la résolution
de fin de tour est le moment où le serveur revalide tout — un doublon serait
ignoré sans erreur).

## S4 — Rush-buy de BÂTIMENT — ~10 min

**Préparation** : il faut la tech **Poterie** (Grenier). Défaut R-90 = conversion
**Or** → la science est à 0 tant que tu n'as rien changé :
1. Vue ville → bouton **« Convertit le commerce en : Or ⇄ »** → passe en
   **Science** ; HUD → **Recherche** → choisis **Poterie**. (La trésorerie ne
   monte plus pendant ce temps — c'est normal, R-90 est un exile Or/Science.)
2. Quand Poterie est complétée (quelques tours), rebasculle la conversion en **Or**.
3. Produis un **Grenier (40)** ; laisse la trésorerie monter (ou suits la barre
   HUD « Palier 100 or : x% ») jusqu'à ce que le bouton d'achat redevienne
   cliquable — le coût affiché est **marteaux restants × 2** (diminue si le
   chantier a déjà progressé).
4. Clique **Acheter**, fin de tour.

**Résultat attendu** : journal « Erik achète grenier … (rush-buy) », le Grenier
apparaît dans **Bâtiments** immédiatement, trésorerie débitée du coût affiché.

## S5 — Palier économique 100 or → Colons gratuit (R-136) — ~10 min

**Préparation** : conversion **Or** partout, laisse tourner quelques tours
(produire des Guerriers Jaguars à la chaîne aide : +commerce par citoyen).

1. Suis la barre HUD **« Palier 100 or : x% »** jusqu'à 100 %.
2. Au franchissement (fin de tour) :

**Résultat attendu** :
- journal : « **Palier économique — 100 or : Colon gratuit à la capitale** » ;
- un **Colons gratuit** apparaît à la capitale ;
- le HUD passe à « Palier 250 or : x% ».

*(Le palier 500 donne un **Grand Personnage de canal or** — Explorateur/Industriel
« +50 % Or » — visible dans le journal « GP de or ». En solo lent, c'est un bonus
si tu y arrives ; validé automatiquement sinon.)*

## S6 — Barre trésorerie + GPT (R-134) — continu

À tout moment, survole l'icône **or** du HUD :
- « Trésorerie d'empire (R-134) — zéro entretien ; + GPT net des villes focus Or » ;
- le GPT affiché suit les villes en conversion Or (au début il est à +0/tour —
  canon : le commerce de départ est minuscule ; il monte avec la population).

**Test négatif** : aucune somme d'or n'est jamais perdue en entretien
(zéro entretien — règle explicite).

## S7 — (bonus, si partie à 2+ humains ou plus tard) Vol d'or par espion — R-143

Nécessite la tech d'espionnage et une ville ennemie adjacente : panneau d'unité
espion → **« Voler de l'or (50 % de la trésorerie) »**. Résultat attendu :
la trésorerie adverse est débitée de moitié, la tienne créditée, journal
« **OR VOLÉ !** » des deux côtés (la victime voit le montant, rien d'autre).
En solo contre le bot, c'est le bot qui peut te le faire — le journal t'en informe.

---

**Fin de session** : note tout accroc (texte, tooltip, état de bouton, montant) et
reviens avec tes constats — retouches en mission de suite. Les captures de
référence de l'audit sont dans `dev-logs/captures-or-rushbuy/`.
