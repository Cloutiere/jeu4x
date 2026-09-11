# REPORT-ECLAIRAGE — Calibrage du rig d'éclairage (assets externes fade en jeu)

**Livrable en attente de TA validation visuelle, Erik — aucun commit fait.**

## La cause du « fade » (diagnostic confirmé en comparant avec ta capture Tripo)

1. **Pas de courbe filmique** : le jeu rend en linéaire sans tone mapping. Un corps noir-bleu ressort en gris laiteux ; Tripo rend avec une courbe filmique (ACES) qui creuse les noirs et roule les hautes lumières.
2. **Hémisphérique trop forte (0.95) et bleutée** : une lumière ambiante baignait tout l'objet et « levait » les noirs — d'où le voile grisâtre.
3. **Lumière clé trop faible (0.85)** : pas de modelé.

## Le rig candidat (data-driven, `visuel3d.json` §`eclairage`)

| Levier | Rig actuel | **Candidat proposé** |
|---|---|---|
| Tone mapping | aucun (linéaire écrêté) | **ACES filmique** |
| Exposition | 1.0 | **1.3** |
| Hémisphérique | 0.95 | **0.35** |
| Directionnelle | 0.85, pos (-5, 9, 3) | **1.3**, pos (-4, 10, 2) |
| Halo néon | 0.45 / 18 / 2 | **inchangé** (langage du jeu conservé) |
| IBL RoomEnvironment | 0 | **0.3** |

**Le levier décisif est le tone mapping ACES** — sans lui, aucune combinaison de lumières ne reproduit le look Tripo (testé : ça lave ou ça sature). L'IBL sans ACES lave tout ; avec ACES elle donne le sheen « studio ».

## Le comparatif A/B (c'est là-dessus que tu tranches)

**Bouton « A/B éclairage » dans la fonderie** (http://localhost:5178 — serveur déjà lancé) : le modèle sélectionné est rendu DEUX FOIS, rig actuel à gauche / rig candidat à droite, même caméra, bloom désactivé. Tu navigues dans la liste des .glb et tu juges à l'œil.

Captures archivées dans `dev-logs/captures-eclairage/` :
- `ab-rig-montagne_v1.png` — le plus frappant : gauche grisâtre, droite noire profonde + néon qui crève (ton « jour et nuit »)
- `ab-rig-ville_v1.png` — texture de la ville relumée, modelé net
- `ab-rig-chevalier_v3.png` — cas limite : le corps cuit TRÈS clair des v3 remonte vers le blanc (les hautes lumières roulent grâce à ACES, mais c'est le plus exposé des assets)
- `lab3d-rig-candidat-fenetre.png` — la vraie carte en jeu avec le rig candidat

## Vérification

- Suite complète verte (194 tests web dont 6 nouveaux sur `§eclairage` : entrées invalides refusées, section absente = rig historique exact), typecheck 4/4.
- **Bench 40×40 : 60 FPS avant ET après** (0.6-0.7 ms CPU/frame, ~197 draw calls) — le coût de l'IBL est non mesurable. `schemaVersion` 19 inchangée, zéro gameplay.
- Fonderie synchronisée (rig candidat en mode normal, rigs copiés jamais importés) ; labo et jeu partagent `stage3d.ts` — mêmes réglages partout.

## Périmètre respecté

Aucun asset modifié (aucune texture, aucun facteur cuit), bloom inchangé (la bascule en partie existe), pas de commit.

## Si tu valides (ou après ajustement)

Le rig est 100 % data-driven : réajuster = éditer §`eclairage` du JSON sans code (ex. `ibl.intensite`, `hemispherique.intensite`, `toneMapping: "none"|"linear"|"aces"`). Un hook de calibrage live existe aussi en fonderie : `__fonderie.rigCandidat({ expo, tone, hemi, dir, ibl })` dans la console.
