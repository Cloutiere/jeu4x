# HANDOFF-FOND-LOBBY — Fix : l'image de fond du lobby ne s'affiche plus (une ligne)

**Mini-mission de correction (bug visuel, cause fine identifiée par le pilot le 16/11 — diagnostic complet, la mission n'a plus qu'à poser le fix).** Ordre canon respecté : UNE mission d'implémentation à la fois (aucune autre en cours).

## 0. Préalables

- Baseline : suites vertes (rules 1229 / server 544 / web 793 / jev-port 52), `schemaVersion` 28. `git status` avant de commencer.
- ⚠ Le worker 8787 local vient d'être relancé proprement par le pilot (les zombies workerd d'Erik ont été tués — UN SEUL wrangler tourne, laisser tourner).

## 1. Le bogue et sa cause fine (déjà diagnostiquée — ne pas re-diagnostiquer)

**Symptôme** : les images de fond du lobby/salle d'attente (`/interface/up.jpg` panorama de merveilles + `/interface/down.jpg` carte ancienne, `CadreLobby.svelte` `.fond-haut`/`.fond-bas`) ne sont plus visibles — l'écran paraît bleu-noir uni. **La mémoire d'Erik était bonne** : le fond existait (LOBBY-PREMIUM, validé 27/09) et est toujours chargé (vérifié : images 1440×1440 OK, CSS appliqué, prod sert les assets 200).

**Cause fine (prouvée par manipulation DOM en direct)** : `apps/web/src/pages/LaboCulture.svelte:142` contient un style `:global(html, body) { margin: 0; background: #101418; ... }`. Le `App.svelte` importe le labo STATIQUEMENT (`import LaboCulture`, ligne 24) → la règle globale est dans le bundle et s'applique à TOUTES les pages, depuis `7294a1e` (CULTURE-RESSOURCES, 02/10). Le fond du lobby étant `position: fixed; z-index: -1`, il peint derrière le fond opaque du body → invisible. Preuve : en mettant `html/body` en `transparent` dans le navigateur, le panorama s'affiche parfaitement (captures dans la conversation de pilotage).

**Timeline cohérente** : le fond était visible du 27/09 au 02/10 ; invisible depuis CULTURE-RESSOURCES — Erik ne l'a remarqué qu'en revenant au lobby (il jouait en partie).

## 2. Mission (5 minutes)

1. `LaboCulture.svelte` : supprimer le `:global(html, body)` (les `margin: 0` sont déjà garantis par le reset global d'`app.css` — `9b5b417`) et poser le décor du labo sur SON conteneur racine (une `div` plein écran `min-height: 100vh; background: #101418; color: #dde; font-family: system-ui, sans-serif` scopée au composant). Le labo doit rester visuellement IDENTIQUE à lui-même (capture avant/après du labo seul).
2. Test web : un test qui verrouille qu'AUCUNE feuille de style de composant ne contient de `:global(html` ni `:global(body` (balayage des sources `.svelte` — le même anti-pattern pourrait revenir ; le labo Progen/LaboRendu/LaboGP/LaboCombat à vérifier au passage : ils ne l'ont PAS aujourd'hui, le test l'empêche pour demain).
3. Vérification visuelle LOBBY : partie solo locale (UN SEUL worker 8787 + Vite 5174, viewport 1280×720), captures AVANT (fond invisible) / APRÈS (panorama visible derrière les panneaux, salle d'attente comprise) → `devtmp/captures-fond-lobby/`.
4. Suites web complètes vertes + svelte-check. Zéro modif moteur/serveur, `schemaVersion` inchangée.

## 3. Critères d'acceptation

1. Le panorama de merveilles et la carte ancienne re-visibles au lobby ET à la salle d'attente (captures).
2. Le labo culture inchangé visuellement (captures AVANT/APRÈS du labo).
3. Test anti-`:global(html/body)` vert ; suites web vertes, aucune assertion changée ailleurs.
4. `git status` propre, commit citant FOND-LOBBY + la cause (LaboCulture :global depuis 7294a1e), Deploy vérifié via API + prod 200.
5. Rapport `REPORT-FOND-LOBBY.md` (court — cause + captures + suites) → arrêt-pour-approbation Erik (verdict visuel à l'œil).

## 4. Périmètre interdit

- Ne PAS retoucher au voile `.fond::after` ni aux opacités (calibrage LOBBY-PREMIUM 🔶 d'Erik, non réclamé).
- Ne PAS toucher aux autres labos, à l'UI de jeu, au moteur/serveur, ni aux fonds (`public/interface/`).
- Fichiers non trackés d'Erik : jamais touchés.

## 5. Fin de session

Rapport court → arrêt-pour-approbation (Erik regarde le lobby). Ne rien pousser sans son feu vert.
