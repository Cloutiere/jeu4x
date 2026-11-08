# HANDOFF-GODMODE-BOUTON — God mode activable par bouton (et raccourci qui ne ferme pas l'onglet)

**Statut : prêt — NON LANCÉ.** Micro-mission UI. Signalement d'Erik (04/11) : en **navigateur** (pas la coquille Electron), activer le god mode par `Ctrl+J → W` **ferme la fenêtre** — le navigateur s'approprie `Ctrl+W` (fermeture d'onglet, non interceptable de façon fiable). La coquille Electron ne montrait jamais le problème. Volonté d'Erik : **un bouton god mode** activable sans combinaison de touches.

## 0. Préalables

1. `REPORT-GOD-MODE.md` + `REPORT-GOD-MODE-PRODUCTION.md` (le god mode existant : révélation de carte solo/bots, bannières IA complètes, garde : jamais en multi humain) ; le client : `apps/web/src/pages/Game.svelte` (raccourcis clavier existants F/H/S/Z/B/Espace — et le gestionnaire `Ctrl+J` du god mode), `apps/web/src/pages/Debug.svelte` ou `#/debug/<code>` si le mode reveal s'y trouve déjà ;
2. ⚠ Le god mode reste un outil **d'Erik en solo/bots** (jamais en multi humain — la garde existante reste) ;
3. Discipline : capture locale avant commit (règle d'Erik), suites web + svelte-check verts.

## 1. Décisions de tranche (défauts tranchés — veto Erik possible)

- **D1 — Bouton god mode** : un bouton dans la barre de dev existante (le bandeau qui porte déjà `Lobby / Partie / Ordres / Resync` — visible sur les captures d'Erik), libellé `God mode` à état (actif/inactif, style cohérent avec le bandeau DEV). Clic = la MÊME bascule que le raccourci (révélation de carte solo/bots) — zéro logique nouvelle, le bouton appelle la fonction existante ;
- **D2 — Le raccourci change de seconde touche** : `Ctrl+J → W` devient `Ctrl+J → G` (G = god ; pas de réservation navigateur, pas de conflit avec F/H/S/Z/B/Espace). L'ancien `W` est retiré (il ferme l'onglet, il ne doit jamais être écouté). Consigné dans les docs/trucs & astuces si le raccourci y figure ;
- **D3 — Visibilité du bouton** : visible uniquement dans les mêmes conditions que le god mode actuel (solo/bots — la garde multi humain reste) ; en coquille Electron le bouton existe aussi (homogénéité), le raccourci y reste fonctionnel ;
- **D4 — Intouchés** : la logique de révélation, la garde anti-multi, le reste des raccourcis, le moteur, `schemaVersion` 28.

## 2. Mission L0→L2

- **L0** : suites web 712 + svelte-check verts en local.
- **L1 — Tests** : web (vitest) — le bouton bascule le même état que le raccourci ; gardes : invisible en multi humain ; `Ctrl+J → G` bascule ; `Ctrl+J → W` ne ferme plus rien (le handler ne capte plus W) ; re-cal des tests du god mode si le raccourci y est verrouillé (consigné).
- **L2 — Captures locales AVANT commit** (navigateur 1280×720 — piège connu) : bouton actif/inactif, révélation de carte au clic, en solo vs bots. Suites complètes web + svelte-check, commit + push, rapport court `REPORT-GODMODE-BOUTON.md` (captures, où est le bouton, le nouveau raccourci).

## 3. Critères d'acceptation

1. En navigateur, activer le god mode ne ferme JAMAIS l'onglet (bouton ET nouveau raccourci) ;
2. La garde multi humain intacte ; zéro changement de logique de révélation ;
3. Suites web + svelte-check verts ; captures locales avant commit.

## 4. Périmètre interdit

Toute autre UI que la barre de dev + le handler de raccourcis ; le moteur ; jamais de fichier non tracké d'Erik.

## 5. Fin de session

Rapport court + arrêt. À l'acceptation : Erik joue en navigateur sans frayeur — et le god mode s'active d'un clic.
