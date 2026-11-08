# REPORT-ASSETS-UNITS-4K-VAGUE3

Suite de la vague 2, exécutée le 03/10 après livraison par Erik des répertoires `new_units/new_galere/` et `new_units/new_galion/` — Galère et Galion passent aux PNG 4K (fin des deux unités « HORS PÉRIMÈTRE » du handoff vague 2).

## Sources et cuisson

- ⚠ La galère, annoncée « sans transparence » dans le handoff vague 2, est arrivée AVEC transparence (`_trsp` RGBA 4096 ×6) — import direct possible, aucun traitement spécial.
- 12 PNG `_trsp` copiés vers `assets-src/modeles/4k/` : `galere_<c>_trsp.png` ← `new_galere/galere_4K_<c>_trsp.png` ; `galion_<c>_trsp.png` ← `new_galion/gallion_<c>_4K_trsp.png` (orthographe « gallion » d'Erik normalisée en `galion`, id moteur).
- 4 profils : `galere-6couleurs`/`galere-base`, `galion-6couleurs`/`galion-base` (mode `variantesFournies`, `sansAccent` pour les bases).
- 14 cuites : `unite_galere_j1..j6` + base, `unite_galion_j1..j6` + base. Gates OK.
- **G4 poids relevé 400 → 450 Ko** (`import_svg.mjs`, consigné) : le galion cuit culmine à 435 Ko (echelle >1, art détaillé).
- **Calibre au pixel** : galère 424 px (= avant 212 @256×320), galion 468 px (= avant 234) pour les 6 variantes.

## Client

- `textures.ts` : variantes cuites `galere@<palette>` / `galion@<palette>` (même mécanique) — plus de teinte runtime.
- `catalogue.ts` : variantes cuites Galère/Galion ajoutées à l'atelier (sprites 2D 162 → 192).

## Validation

- Captures `dev-logs/captures-assets-units-4k-vague3/` (avant/après, planche calibre des 4 navires, atelier).
- Juge visuel : **pass** sur galère ×6, galion ×6 et calibre naval (le seul fail porte sur l'ANCIENNE planche peintre de la galère — rames tronqués au bord, défaut préexistant que la refonte corrige). Transparence certifiée au pixel (bbox de contenu < canvas).
- Suites : 3 paquets vertes (web 495 explicite), svelte-check 0.

## Piège consigné

Le serveur Vite 5174 d'Erik (démarré le 01/10) avait perdu son watcher : le catalogue servait l'ancien module malgré rechargements (Vite répondait l'ancien transformé sans cache-bust). Tué et relancé (`pnpm -C apps/web dev`) — piége connu du rituel, à réappliquer si l'atelier semble inchangé après une édition.

## 🔶 À vérifier en ligne par Erik

1. Calibre galère/galion en partie réelle (recalage 1 ligne par variante si besoin).
2. Orientation des navires en jeu (aucun retournement appliqué).

Les deux unités restantes du handoff vague 2 sont couvertes : plus aucune unité d'Erik en attente.
