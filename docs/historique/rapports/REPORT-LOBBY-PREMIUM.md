# REPORT-LOBBY-PREMIUM — Refonte visuelle du lobby « Eternal Empires » (27/09)

**Statut : EN ATTENTE DU FEU VERT D'ERIK — aucun commit** (L5 du handoff). Captures : `dev-logs/captures-lobby-premium/` (rendu 1920×1080 réel, serveurs locaux 5174+8787).

## 1. Ce qui est livré

Refonte PRÉSENTATION seule du lobby (D2/D8 — zéro changement de logique, serveur, protocole ou moteur) :

- **`apps/web/src/pages/Lobby.svelte`** — refait selon `new_interface/gpt_V2.png` : en-tête titre serif or « ETERNAL EMPIRES » + « A Fast-Paced Async 4X » + « EXPLORE · EXPAND · ENDURE » (D1), carte « Connecté : X / Déconnexion » en haut-droite, bandeau LOBBY (icône `lobby.svg` + pastille de statut), carte « Labo de cartes », panneau « Créer une partie — 5 sièges » avec bouton or aux épées (`epees.svg`), note de pied duel. Panneaux « Parties publiques en attente », « Mes parties » et « Rejoindre par code » (+ panneau de jointure nuancier/civ) restylés dans le même langage (D2). Zoom 1.25 (FENETRE-GRANDE) retiré : la mise en page 1920 est pleine largeur ; dégradé simple < 1200 px en colonne (D7).
- **`apps/web/src/components/ConfigPartieEditor.svelte`** — grille du mockup (# / Type avec icône / Couleur / Civilisation avec logo or) + prop `banderoles` (lobby seulement) : banderole de la nation choisie à droite de la rangée, **bandeau neutre sombre hachuré tant qu'aucun choix (D3)**. Logique intacte (maj/resoutConflitsPalettes/prisesPour inchangés). Micro-libellés « humain/bot » sous les pastilles masqués dans le contexte lobby (bruit visuel ; conservés à la salle d'attente où ils portent des noms réels).
- **`apps/web/src/components/Nuancier.svelte`** — theme tokens or (bordures), aucune logique changée.
- **`apps/web/src/components/CadreLobby.svelte`** (nouveau, retour Erik 27/09) — cadre commun lobby + salle d'attente : fonds d'Erik, en-tête Eternal Empires, carte « Connecté / Déconnexion ». Les composantes partagées (panneaux, bandeaux, champs, bouton or, badges) sont dans `app.css` — les deux pages ne déclarent que leur contenu. **La salle d'attente (`Attente.svelte`) utilise le même visuel** : bandeau « Salle d'attente — CODE » + statut sièges, carte « Retour au lobby / Code à partager », config avec banderoles, panneau Joueurs, bouton or « Lancer la partie » (grisé avec motif si un humain manque), « Supprimer/Quitter ». Logique intacte.
- **`apps/web/src/app.css`** — tokens du langage or/sombre (`--or #C9A227`, fond bleu-noir `--encre`) + composantes partagées des deux pages ; reset FENETRE-GRANDE intact (test app-css vert).
- **D1 titres** : `<title>` de `index.html` → « Eternal Empires » ; `desktop/config/{dev,prod}.json` windowTitle → « Eternal Empires » / « Eternal Empires (dev) » (suffixe dev conservé).

## 2. Mapping D5 — table finale

Table data-driven : `apps/web/src/lib/nations.json` + helper `nations.ts` (`nationDe(civId)`, réserve exclue). 16 civs actives vérifiées contre `packages/rules/src/data/civilizations.json` :

| civ | banderole | logo | | civ | banderole | logo |
|---|---|---|---|---|---|---|
| amerique | ✓ | ✓ | | mongolie | ✓ | ✓ |
| arabie | ✓ (`arabian_digit`) | ✓ | | rome | ✓ | ✓ |
| azteques | ✓ (`aztec_digit`) | ✓ | | russie | ✓ | ✓ |
| chine | ✓ | ✓ | | espagne | ✓ | ✓ |
| egypte | ✓ | ✓ | | zoulous | ✓ | ✓ |
| angleterre | ✓ | ✓ (`Angleterre_logo.svg`) | | france | ✓ | ✓ |
| allemagne | ✓ | ✓ | | grece | ✓ | ✓ |
| inde | ✓ | ✓ | | japon | ✓ | ✓ |

**Réserve SANS civ (D5, `reserve: true`, jamais affichées)** : babylone, canada, celtes, danemark, portugal, suede.

**Logos manquants : `babylone` n'a pas de logo dans `new_logos/`** (21 SVG pour 22 nations) — sans conséquence (réserve, non affichée) ; à fournir si la civ entre au jeu un jour.

## 3. Poids avant/après (D6)

| Asset | Avant | Après |
|---|---|---|
| Fonds up/down (4096² JPEG 7,5/5,4 Mo) | 12,9 Mo | **710 Ko** (1440 px q60 : 379 + 331 Ko) |
| 16 banderoles (4096×2336, 4-5 Mo) | ~73 Mo | **2,53 Mo** (896 px q75, 148-192 Ko pièce) |
| Logos or (SVG) | tels quels | **1,9 Mo** (16 civs ; métadonnées C2PA retirées, −33 %) |
| epees.svg + lobby.svg | 175 Ko | 117 Ko (C2PA retiré) |
| **Total `public/interface/`** | ~89 Mo | **4,5 Mo** ; chargement initial (2 fonds + 2 SVG) ≈ 0,73 Mo, < 0,1 s en local — page < 2 s ✓ |

Banderoles en réserve **hors bundle** : `assets-src/interface/banderoles-reserve/` (+ `logos-reserve/` pour canada/celtes/danemark/portugal/suede). Les originaux `new_interface/` (208 Mo) et `new_logos/` (39 Mo) restent NON commités (non staged) ; `assets-src/interface/` ne contient que les vecteurs d'Erik (epees/lobby) — les grosses pièces transformées sont dans `apps/web/public/interface/`.

## 4. Vérification (L4)

- Tests : **web 391 verts · serveur 116 verts · rules 897 verts** (aucun test logique changé ; aucun test n'assertait le DOM du lobby). Typecheck/svelte-check : 0 erreur.
- e2e navigueur (1920×1080, serveurs locaux) : login stub → lobby → sélection Rome au siège 2 (logo or + banderole Colisée affichées) → type Humain → « Créer la partie » → salle d'attente `W3HXBC` avec config 2 humains + 3 bots persistée → retour lobby → « Rejoindre par code GEJB8D » → panneau de jointure (nuancier, grisés, Confirmer actif après choix couleur). Config d'essai remise à l'état par défaut après captures.
- Revue visuelle indépendante (visual-judge) : création ✓, jointure ✓, détail rangée Rome ✓ ; seul biais : un léger **dédoublement de texte sur la capture de la salle d'attente**, prouvé être un artefact du pipeline de capture du navigateur intégré (DOM véré : un seul élément `.ligne`, aucun text-shadow/transform ; le même texte est net au lobby ; persiste après re-rasterisation). Le texte réel de la page est propre — Erik validera à l'œil dans sa coquille.

## 5. Écarts mockup (assumés)

- **Logos or des rangées** : le mockup montre un emblème or par PALETTE (boussole Bleu Saphir, laurier Rouge Royal…). Ces fichiers n'existent pas — `new_logos/` contient des logos par NATION. J'affiche donc le logo de la NATION choisie à côté du sélecteur de civ (D4), rien sans choix. Si Erik veut des emblèmes de palette, il faudra 6 nouveaux SVG.
- **Écran unique** : le mockup ne montre que l'écran de création ; les listes « Parties publiques / Mes parties / Rejoindre par code » (D2) passent sous le panneau de création → léger scroll à 1080.
- **Polices** : le serif or du mockup est approché par la stack Georgia/Palatino (pas de webfont embarquée — coquille Electron offline).
- **Rangée 1 du mockup** : « Bleu Saphir + Amérique » pré-remplis — notre défaut est bien `configPartieDefaut('amerique')`, conforme.
- **Statut** : le mockup affiche « Statut : open » en vert sous le bandeau ; rendu comme pastille + texte à droite du bandeau LOBBY (l'état réel du WebSocket, pas un libellé figé).

## 6. Réserve d'usages logos (D4 — note)

Les 21 logos or par nation servent ici au seul lobby. Usages futurs notés : badge de nation en jeu (panneau d'unité/ville), écran de victoire, drapeaux de frontière, avatars lobby. Les 6 banderoles de réserve + logos (sauf babylone sans logo) sont prêts dans `assets-src/interface/*-reserve/`.

## 7. Ce qu'Erik valide en ligne (L5)

1. La page 1920×1080 (captures `creation-1920x1080.png`, `detail-rangee-rome.png`, `jointure-par-code.png`, `salle-attente.png`) vs `new_interface/gpt_V2.png`.
2. Les tailles de banderoles (896 px) et des fonds (1440 px, opacité 0,85 en bas + voile dégradé) — 🔶 à l'œil sur son écran.
3. Le bandeau neutre hachuré (D3) et la densité des rangées.
4. Le retrait du zoom 1.25 du lobby (pleine largeur désormais).

**Aucun commit tant que feu vert pas donné.**
