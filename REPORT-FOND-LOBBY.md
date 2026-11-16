# REPORT-FOND-LOBBY — Fix : image de fond du lobby re-visible

## Cause (déjà diagnostiquée par le pilot, confirmée)

`apps/web/src/pages/LaboCulture.svelte` portait un `:global(html, body) { background: #101418; ... }`. Le labo étant importé statiquement par `App.svelte`, la règle s'appliquait à TOUTES les pages depuis CULTURE-RESSOURCES (7294a1e, 02/10). Le fond du lobby (`position: fixed; z-index: -1` dans `CadreLobby`) peignait derrière le body opaque → invisible.

## Fix

1. **LaboCulture.svelte** : `:global(html, body)` supprimé ; le décor (`background: #101418`, `color`, police) est posé sur le conteneur racine `main.labo-culture` (scopé au composant). `margin: 0` reste garanti par le reset global d'`app.css` (9b5b417).
2. **Test anti-récidive** : `apps/web/tests/pas-global-html-body.test.ts` balaye tous les `.svelte` de `src/` et échoue si une feuille de style de composant contient `:global(html` ou `:global(body` (les autres labos Progen/Rendu/GP/Combat sont propres aujourd'hui — le test l'empêche pour demain).

## Vérification visuelle (captures → `devtmp/captures-fond-lobby/`)

Local (UN SEUL worker 8787 + Vite 5174, viewport 1280×720), AVANT obtenu par stash temporaire du fix :

| Capture | Résultat |
|---|---|
| `avant-lobby.png` | fond bleu-noir uni, aucun panorama (bogue) |
| `apres-lobby.png` | **panorama de merveilles + carte ancienne re-visibles derrière les panneaux** |
| `apres-salle-attente.png` | fond visible en salle d'attente (`#/attente/N2KT9G`) |
| `avant-labo-culture.png` / `apres-labo-culture.png` | labo visuellement IDENTIQUE (titre, hint, canvas, PanneauVille) |

## Suites

- Web : **794 verts / 68 fichiers** (dont le nouveau test), aucune assertion changée ailleurs.
- `svelte-check` : 0 erreur (26 warnings préexistants).
- Zéro modif moteur/serveur, `schemaVersion` 28 inchangée.

## Périmètre respecté

`.fond::after` et opacités (calibrage LOBBY-PREMIUM) non touchés ; autres labos, UI de jeu, moteur/serveur, `public/interface/` inchangés ; fichiers non trackés d'Erik non touchés.

## Arrêt-pour-approbation

Verdict visuel à l'œil par Erik (lobby + salle d'attente en prod).
