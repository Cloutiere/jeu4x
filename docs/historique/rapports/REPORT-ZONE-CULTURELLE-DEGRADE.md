# REPORT-ZONE-CULTURELLE-DEGRADE

Mission exécutée le 14/10 (handoff `HANDOFF-ZONE-CULTURELLE-DEGRADE.md`, décisions Erik 07/10). **Client seul** — moteur/serveur, paliers R-162, `frontierRadius`, forme de la frontière, ZONE-CULTIVEE, 3D et `schemaVersion` (27) intouchés.

## Technique retenue (D5)

- **Profil pur testé** — `apps/web/src/lib/render/zone-culturelle.ts` : `profilAlpha(t)` = voile constant sous la pente, puis **smoothstep** (3t² − 2t³, dérivée nulle aux deux raccords : aucune marche) jusqu'à l'alpha extérieur. Les arrêts canvas du dégradé radial sont échantillonnés depuis ce même profil.
- **Texture radiale en cache module** — `textures.ts :: textureDegradeCulturel()` : canvas 2D 512×512 construit UNE FOIS au premier rendu (blanc + canal alpha = profil ; teinté accent joueur par le sprite). Zéro génération par frame ; comme tout l'overlay, les sprites ne vivent que dans les rebuilds (leçon VUE-VILLE-PERF respectée).
- **Pose par ville** (GameCanvas, palier 2+) : la pente + le voile sont portés par des `Sprite` (un par copie wrap visible, `avecCopies`) centrés sur la ville, **masqués par les boucles EXTERIEURES** de la bande (`contourUnion` inchangé). Le remplissage d'un polygone extérieur couvrant ses trous, le voile (D2) teinte TOUT l'intérieur — zone cultivée comprise, marqueurs/liseré cultivés posés par-dessus (D6). Le liseré net (D3) reste tracé tel quel, fog compris (la bande n'inclut que du exploré, rien n'est inventé).
- **Couture** : un sprite par copie → chaque point de la bande est éclairé par le centre le plus proche (distance wrap minimale) — alpha continu À TRAVERS la couture par construction.

## Bloc de calibrage D4 (`CALIBRAGE_ZONE_CULTURELLE`, zone-culturelle.ts — à l'œil sans code)

| Champ | Valeur | Rôle |
|---|---|---|
| `alphaExt` | 0.30 | alpha au bord extérieur (au liseré) |
| `alphaVoile` | 0.09 | voile de fond constant (intérieur) |
| `porteePente` | 0.5 | fraction du rayon occupée par la pente (depuis le bord) |
| `resolutionTexture` | 512 | texture radiale en cache |

L'ancien dictionnaire `ANNEAUX_CULTURELS.couchesDegrade` (3 couches 60/40/22 px) est supprimé ; `epaisseurLisere`/`alphaLisere` inchangés.

## L1 — tests (7 nouveaux, `tests/zone-culturelle.test.ts`)

Dictionnaire dans ses bornes ; voile = valeur de fond EXACTE sous la pente ; alphaExt exact à t=1 ; monotonie centre→bord ; continuité (|Δ| < 0.001 par pas de 0.001) ; dérivée nulle aux raccords ; arrêts canvas fidèles au profil.

## L3 — GUI local (captures AVANT commit, `dev-logs/captures-zone-culturelle-degrade/`)

Partie solo légale (procedural-40, wrangler local 8787 + Vite 5174), palier 1 forcé par tours réels (culture 11, tour 5) puis palier 2 (culture 111, tour 28) :

- `*-01-palier1-lisere.png` — palier 1 INCHANGÉ (liseré seul, aucun remplissage) ;
- `2026-10-14-palier2-02..04` — palier 2 zoom défaut / avant / arrière : voile continu, intensification vers le bord extérieur, **aucune barre visible** ;
- `*-06-zoom-contraste.png` — même crop autocontrasté : la pente apparaît monotone et continue (aucune marche aux frontières de tuiles) ;
- FPS mesuré : **60** (frame moyenne 0.03 ms).

Pièges rencontrés (consignés pour les prochaines missions e2e longues) :

1. **« Fin de tour bloquée — production »** : un script WS qui pousse des EndTours DOIT poser une `SetProduction` (guerrier) avant chaque fin de tour — sinon refus silencieux ressemblant à un freeze.
2. **Freeze workerd ~10 tours** confirmé ; contournement : `taskkill /F /IM workerd` + relance wrangler (état DO persisté) + rebranchage ws + renvoi de l'ordre.
3. **Polling admin trop fréquent** (dump carte entière toutes les 2 s) étrangle le DO : préférer le broadcast `TurnResult` du ws.
4. Les spawns procedural-40 s'arrêtent à **col ≥ 6** (20/20 tirages) : la zone d'une capitale (rayon culturel 2) ne peut JAMAIS atteindre la couture.

## 🔶 Restant à l'œil / limites

- **Calibrage D4** (`alphaExt`/`alphaVoile`/`porteePente`) à valider par Erik en jeu.
- **Capture couture non exécutable en partie légale** : spawn col ≥ 6 > portée 2, et une 2e ville (sans palais) ne monte pas au palier 2 en temps raisonnable. Le chemin wrap (masque `contourUnion`/`hexesCopies`) est celui des contours, déjà prouvé par CARTE-RONDE T2 ; la continuité d'alpha à travers la couture est garantie par construction (min des distances aux copies).
- Palier 1 volontairement inchangé (décision antérieure : aucun remplissage, liseré seul).

## Vérifications

- Web : **647/647** vertes (7 nouvelles), `svelte-check` **0 erreur** (17 warnings préexistants), `tsc apps/server` OK (code serveur intouché).
- 60 FPS mesuré en jeu (zone palier 2 affichée).
