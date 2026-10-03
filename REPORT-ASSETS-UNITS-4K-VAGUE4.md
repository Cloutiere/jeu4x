# REPORT-ASSETS-UNITS-4K-VAGUE4

Troisième fournée du 03/10 — Cavalier, Chevalier, Légion, Catapulte passent aux PNG 4K d'Erik (24 `_trsp`).

## Sources et cuisson

- Correspondances : `new_units/new_cavalier/` → `unite_cavalier` ; `new_chevalier/` → `unite_chevalier` ; `new_legion/` → `unite_legion` ; `new_catapult/` → `unite_catapulte` (nom moteur français).
- **Cavalier canvas 4096×3072 (paysage)** : le pipeline suppose du carré (resize `fit:fill`) — sources rembourrées en 4096² transparent centré à la copie, zéro changement pipeline.
- Chevalier : suffixe `_trsp` sans « 4K » (comme l'archer vague 2). Catapulte : `catapult_*_4K_trsp.png` → `catapulte_*_trsp.png`.
- 8 profils (`<unité>-6couleurs` + `<unité>-base`), 36 cuites (6 variantes ×4 + 4 bases). Gates OK.
- **Incident cuisson consigné** : cavalier ardoise déborderait de 1 px (tw 513 > 512 → sharp refuse le composite) — recalée à echelle 1.1228 (hauteur 533 vs 534, négligeable), noté dans le `_doc` du profil.
- **Calibre** : hauteurs de contenu figées sur l'avant au pixel — cavalier 534, chevalier 466, légion 430. **Exception catapulte** 🔶 : art quasi carré — figer la hauteur d'avant (542) aurait donné 545 de large (> 512, rognage 16 px/côté) ; echelle 1 = **largeur** calée sur l'avant (456), hauteur résultante ~454 (−16 %). À l'œil Erik, recalage possible en 1 ligne.

## Client

- `textures.ts` : cuites `cavalier@`/`chevalier@`/`legion@`/`catapulte@` — plus de teinte runtime pour ces 4 unités.
- `catalogue.ts` : variantes cuites ajoutées (sprites 2D 192 → 216).

## Validation

- Captures `dev-logs/captures-assets-units-4k-vague4/` (avant/après ×4, planche calibre terrestre 7 unités J1, atelier ×4).
- Juge visuel : **9/9 pass** (0 pixel de sujet touchant les bords, 6/6 teintes par planche, calibre terrestre cohérent — montures et catapulte plus grandes que l'infanterie à pied, comme voulu). La remarque « alpha opaque » porte sur le fond des PLANCHES de revue ; la transparence des PNG cuits est vérifiée au pixel par bbox < canvas.
- Suites : 3 paquets vertes (web 495), svelte-check 0.

## 🔶 À vérifier en ligne par Erik

1. **Calibre de la catapulte** (largeur-calée, hauteur −16 % vs l'avant — exception consignée).
2. Calibre cavalier/chevalier/légion en partie réelle.
3. Orientation des sprites montés.

Avec les vagues 2-3, **9 unités d'Erik sont passées en 4K** ; restent dans `new_units/` : artillerie, bombardier, canon… (réserve future, jamais désignées).
