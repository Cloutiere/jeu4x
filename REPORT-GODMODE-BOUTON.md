# REPORT-GODMODE-BOUTON — God mode activable par bouton (et Ctrl+J→G)

**Mission livrée (04/11).** Signalement d'Erik : en navigateur, `Ctrl+J→W` ferme l'onglet (réservation navigateur de `Ctrl+W`, non interceptable). Livré : un **bouton `God mode`** dans la barre DEV + le chord **`Ctrl+J→G`** ; l'ancien `W` n'est plus écouté.

## Ce qui a changé

- **D1 — bouton** : `God mode` dans la barre DEV (après `Resync`, Game.svelte ~1330), à état (classe `active-toggle` — nouvelle règle CSS `.bar-dev .active-toggle`, miroir de l'engrenage actif ; le bouton 3D du calque en profite). Clic = la MÊME bascule que le chord : fonction unique `basculerGodMode()` (partie active requise, `client.toggleGodMode` — le serveur confirme par le Snapshot, zéro logique nouvelle).
- **D2 — raccourci** : `Ctrl+J→G` (G = god). Le chord est reconnu par `actionGodMode` (lib/godmode.ts) — `W` n'y figure plus, jamais écouté.
- **D3 — visibilité** : bouton visible solo/bots uniquement (`!autreHumainPresent($view.players, $view.playerId)`, miroir exact du refus serveur `aAutreHumain` — le serveur tranche en dernier ressort, garde INTACTE). Tooltip du bandeau GOD MODE mis à jour.
- **D4 — intouchés** : logique de révélation, garde anti-multi serveur, autres raccourcis (F/H/S/Z/B/Espace, test verrou), moteur, schemaVersion 28.

## Tests (FIRST — écrits avec la mission, 12 verts)

`apps/web/tests/godmode-bouton.test.ts` : helpers purs (`autreHumainPresent` : solo/bots/multi/null ; `actionGodMode` : arme Ctrl+J, bascule G dans la fenêtre 1 500 ms, **W sans effet**, Alt/Meta n'arment pas) + câblage Game.svelte (canon ui-jeu-t3 : bouton dans la barre DEV, même fonction que le chord, garde D3, état actif, handler sans `'w'`, F/H/S/Z/B intacts).

## Suites AVANT commit

- web vitest : **724/724 verts** (712 existants + 12 nouveaux, zéro re-cal)
- svelte-check : **0 erreur** (26 warnings préexistants)

## Captures locales AVANT commit (navigateur 1280×720, partie solo/bots RFM47Q, script `devtmp/godmode-bouton-gui.mjs`, worker 8787 — piège proxy Vite figé)

`dev-logs/captures-godmode-bouton/` :
1. `1-bouton-inactif.png` — bouton neutre dans la barre DEV, minimap sous brume ;
2. `2-bouton-actif-carte-revelee.png` — clic : bouton liseré or + bandeau GOD MODE + carte/minimap révélée ;
3. `3-bouton-reclic-inactif.png` — re-clic : révélation retirée (réversible) ;
4. `4-chord-ctrlj-g-actif.png` — `Ctrl+J→G` : actif ;
5. preuve sans capture : `Ctrl+J→W` → état inchangé, page toujours vivante (onglet non fermé).

## Pièges rencontrés

- `window.__game` n'expose pas `view` → sonde DOM (bandeau `.godmode` + `.bar-dev .active-toggle`), pilotés par le Snapshot.
- Proxy Vite figé sur 8787 (connu) : worker sur 8787 obligatoire, pas 8797.

## docs

PROJET.md ligne 15 : « god mode Ctrl+J→G + bouton DEV ».
