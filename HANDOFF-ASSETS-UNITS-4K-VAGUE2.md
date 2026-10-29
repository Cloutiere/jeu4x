# HANDOFF-ASSETS-UNITS-4K-VAGUE2 — Archer, Croiseur, Cuirassé : sprites 4K d'Erik

**Décisions Erik 03/10.** Suite de la vague ASSETS-4K et du motif SPRITES-GUERRIER-COLON : remplacement des SOURCES des sprites par les PNG 4K transparents fournis par Erik, recuisson pipeline, validation à l'œil AVANT commit.

## 1. Préalables

- Lire `ATELIER-ASSETS.md` (rituel), la politique assets hybride (Recraft/gate) et le commit ASSETS-4K (pipeline : sources PNG 4K acceptées, cuisson, variantes accent/barbare).
- Baseline : suites vertes (rules 969 + web 495 + server 120), svelte-check 0. Vérifier `git status` (les répertoires `new_units/` sont les fichiers d'Erik — ne jamais les committer tels quels ; on COPIE vers les sources du pipeline).

## 2. Correspondances (noms historiques CivRev — coûts identiques)

| Répertoire d'Erik | Fichiers à utiliser | Unité du jeu |
|---|---|---|
| `new_units/new_archer/` | `archer_<couleur>_trsp.png` (PNG RGBA 4096) | **Archer** |
| `new_units/new_battleship/` | `battleship_<couleur>_trsp.png` (PNG RGBA 4096) | **Cuirassé** |
| `new_units/new_cuirasse/` | `cuirasse_<couleur>_4K_trsp.png` (PNG RGBA 4096) | **Croiseur** |

- Les 6 couleurs (ardoise/bleu/jaune/orange/rouge/vert) mappent sur les palettes d'accent existantes (même convention que la vague précédente ; variante barbare cuite comme pour les autres unités).
- Les `.jpeg` (petits ou 4K) sont des aperçus — ne pas les utiliser comme sources.
- **HORS PÉRIMÈTRE (fichiers attendus d'Erik plus tard)** : `new_galere` (pas de transparence — Erik fournira), Galion (Erik fournira), toute autre unité des répertoires `new_units/`.

## 3. Mission

- **L0** : identifier dans le pipeline les sources actuelles des 3 unités (profils « variantes fournies ») et le rituel de cuisson (`assets-src/tools/generate.py` + `sync-art` ou l'équivalent de la vague 4K) ; archiver les anciennes sources (motif `assets-src/archives/`, README) plutôt que les écraser sans trace.
- **L1** : copier les 18 `_trsp` vers les sources pipeline avec la nomenclature en vigueur ; recuire ; vérifier les 6 teintes + barbare par unité (pas de teinte écrasée — teinte multiplicative).
- **L2** : **validation locale à l'œil avec captures AVANT tout commit** (règle Erik) : le jeu en partie solo légale (ou labo si couvert) avec les 3 unités visibles en plusieurs teintes ; vérifier le CALIBRE (taille relative vs les autres unités — ajuster le curseur `echelle` data-driven de l'unité si nécessaire, consigner) et l'orientation. Captures `dev-logs/captures-assets-units-4k-vague2/` (avant/après par unité).
- **L3** : suites vertes (aucun test moteur ne devrait bouger — si un test fige un asset, le mettre à jour en le consignant), svelte-check 0, commit, push (la CI déploie), rapport `REPORT-ASSETS-UNITS-4K-VAGUE2.md`.

## 4. Critères d'acceptation

- Archer, Croiseur, Cuirassé affichent les nouveaux sprites 4K en jeu, dans les 6 palettes + barbare, au bon calibre ;
- Les autres unités sont intactes (aucune régression de cuisson) ;
- Galère et Galion inchangées (en attente des fichiers d'Erik) ;
- Captures avant/après dans le rapport.

## 5. Périmètre interdit

Galère et Galion ; tout autre répertoire `new_units/` (artillerie, bombardier, canon… — réserve future) ; calibrage de génération de carte ; moteur/serveur/protocole ; `schemaVersion`.

## 6. Fin de session

Rapport `REPORT-ASSETS-UNITS-4K-VAGUE2.md` (calibres ajustés 🔶, liste « à vérifier en ligne par Erik »), arrêt, remise de la main. Ne jamais committer `new_units/` ni les autres fichiers non trackés d'Erik.
