# REPORT-FULLSCREEN-PERF — Lag en plein écran F11 : mesures, verdict, option (c) livrée

Mission : `HANDOFF-FULLSCREEN-PERF.md` (demande Erik 02/10). Client seul, zéro changement moteur/serveur/protocole. Diagnostic livré en arrêt L4 ; **Erik a choisi l'option (c) — livrée le 01/10**.

## 1. Ce qui est livré (instrumentation L0, pur ajout, commitée)

- **HUD perf dans le calque dev** (`HudPerf.svelte`, affiché dans la barre DEV via Ctrl+Alt+D) : FPS, frame time moyenne/max (1 s), **résolution réellement rendue** (backing store = CSS × DPR). Lisible en jeu, durable.
- **API de mesure** `window.__game.perfResume()` (GameCanvas, dev uniquement) : mêmes chiffres, consommable par scripts — c'est elle qui a alimenté les mesures ci-dessous.
- Script de campagne : `devtmp/perf-fullscreen.mjs` ; journal : `dev-logs/perf-fullscreen/` (`mesures.json`, `BISECTION.md`) ; captures `dev-logs/captures-fullscreen-perf/`.

Suites : web 461/461, svelte-check 0 erreur. Aucune régression (HUD monté uniquement dans le calque dev).

## 2. Environnement mesuré

Machine d'Erik (cette station) : **GTX 1060 3GB**, écran **3840×2160 à ~160 %** (logique 2394×1347, DPR OS 1,604). Scène : partie solo pangée tour 12, caméra dézoomée au maximum (toute la carte dessinée), Edge réel headful (GPU matériel), protocole : on fige `devicePixelRatio` à N — `suivreDpr()` (PLEIN-ECRAN-NET) s'aligne et rend au backing store CSS×N, exactement la variable que F11 change.

## 3. Mesures (3 s de rAF par point)

| Palier | Backing store | Mpx | FPS | Frame CPU moy. |
|---|---|---|---|---|
| dpr 1 (fenêtré) | 1530×940 | 1,4 | 60 | 0,03 ms |
| dpr 2 | 3059×1880 | 5,7 | 60 | 0,02 ms |
| dpr 2,51 (**= 4K exact**) | 3839×2359 | 9,1 | 60 (1er passage) puis 46 | 0,02 ms |
| dpr 3 | 4589×2820 | 12,9 | 60 (1er passage) puis **11** | 0,02 ms |
| dpr 4 (borne actuelle) | 6118×3760 | 23,0 | 4–8 | 0,03 ms |

Détail complet : `dev-logs/perf-fullscreen/` (campagne 1 + bissectrice, avec les effets d'historique).

## 4. Verdict

- **S1 (résolution de rendu) CONFIRMÉ comme mécanisme, avec une nuance importante** : le frame time CPU est constant (~0,02 ms) à tous les paliers — le coût est 100 % GPU. La GTX 1060 3GB décroche au-delà de ~9–13 Mpx de backing store (avec antialias MSAA ×4), et le décrochage **s'aggrave avec l'historique** (12,9 Mpx passe à 60 fps au premier passage, tombe à 11 fps après des pointes à 23 Mpx ; récupération incomplète, 42–46 fps résiduels même revenu en fenêtré).
- **Ce que F11 fait réellement dans la coquille** (lecture `desktop/src/main.ts` + `config/prod.json`, résolution base 1920×1080, DPR forcé 1) : fenêtré ≈ 3080×1733 (5,3 Mpx) ; F11 = letterbox, backing = **physiques de l'écran = 3840×2160 (8,3 Mpx)**, DPR effectif ≈ 1,25–2,0 — la borne 4 n'est jamais atteinte, PLEIN-ECRAN-NET fonctionne comme prévu. Soit **×1,56 le fenêtré** — théoriquement sous la falaise, mais les points 4K/bis (60 → 46 fps) montrent que sur cette carte le décrochage peut frapper dès ~9 Mpx selon l'historique GPU et l'état réel de la partie (plus chargée que la scène de mesure).
- **S2 minimap disculpé** : redessine sur événement d'état, pas par frame ; masquée au palier dpr4, aucun effet net (8→31 fps = bruit d'un GPU déjà écroulé).
- **S3 UI DOM disculpé** : frame CPU constant, UI masquée sans effet.
- **S4 ASSETS-4K disculpé** : toutes les cuissons aux tailles standard (tuiles 224×256, unités ≤ 512×640, brume comprise) — vérifié par lecture IHDR des PNG committés.
- **S5 (hitch au basculement)** : le changement de DPR pose `tilesDirty`, mais le budget 1 rebuild/frame (précédent VUE-VILLE-PERF) l'étale — ponctuel, pas le « lag important » permanent signalé.

**En un mot : le F11 rend en 4K native sur un GPU qui décroche en 4K dans les pires cas ; c'est un compromis netteté/fluidité à re-trancher.**

## 5. Option (c) LIVRÉE (feu vert Erik 01/10) — « Qualité de rendu » dans le calque dev

- **Curseur** dans la barre DEV (Ctrl+Alt+D) : `Auto` (défaut = PLEIN-ECRAN-NET inchangé) / `×1` / `×1.5` / `×2` = plafond du DPR effectif (backing store = CSS × plafond, l'image est agrandie par le navigateur). Mémorisé par machine (localStorage `qualite-rendu`).
- Implémentation : `lib/qualiteRendu.ts` (store + `dprEffectif()` pur, testé) ; les 5 sites `min(4, dpr)` de GameCanvas (init, `suivreDpr`, ResizeObserver, `redimensionnerRenderer`) passent par `dprEffectif(get(qualiteRendu), dpr)` — le changement de curseur est appliqué À CHAUD par le chemin `suivreDpr` existant (resize + re-tuiles, report D4d pendant une animation de vue ville). La borne 4 reste le plafond en `auto`.
- E2e réel : ×1 → backing 2487×1566 → 1550×976 à la volée, retour Auto → résolution réelle ; choix persisté. Captures `dev-logs/captures-fullscreen-perf/08-curseur-qualite-x1.png` / `09-...-auto.png` (locales).
- Suites : web 467/467 (6 nouveaux tests `qualite-rendu.test.ts`), svelte-check 0 erreur.

Les options (a) plafond 1080p, (b) plafond 2560 et (d) MSAA conditionné ne sont PAS implémentées — (c) les englobe fonctionnellement (Erik ajuste en jeu). Un futur chantier « options graphiques » de distribution (menu public + détection de la machine) réutilisera ce mécanisme.

## 6. Ce qu'Erik valide en ligne (F11 chez lui)

1. `pnpm -C apps/web dev` (ou coquille) → partie → **Ctrl+Alt+D** → le HUD perf + le curseur Qualité s'affichent dans la barre DEV.
2. F11 → si le lag apparaît, passer le curseur sur ×1.5 puis ×1 et garder ce qui est fluide À L'ŒIL (le HUD montre la résolution rendue).
3. Ajustements/wording du curseur : me le dire, c'est une ligne.

## 7. 🔶 Ouverts

- Le HUD mesure le FPS rAF côté page ; dans la coquille, si le GPU décroche, la mesure est exacte (rAF ralentit). Mais la coquille n'a pas pu être instrumentée directement (périmètre interdit sauf lecture) — les chiffres coquille restent à confirmer par Erik avec le HUD.
- La scène de mesure (tour 12, dézoom max) est représentative du pire cas de remplissage, pas d'une partie avancée (plus d'unités/overlays) — l'écart fenêtré/F11 mesuré chez Erik fera foi.
- Capture `07-dpr4-sans-ui-dom.png` manquante (script interrompu par le timeout du résolveur avant la dernière étape ; l'isolement S3 a été conclu par le frame time CPU constant, plus robuste).
