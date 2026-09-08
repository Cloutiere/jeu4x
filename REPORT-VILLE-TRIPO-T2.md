# REPORT-VILLE-TRIPO-T2 — Intégration au jeu (08/09/2026)

## Livré (commit unique, poussé sur main → déploiement Cloudflare)

**La ville affiche désormais `ville_v1.glb` pour TOUTES les tailles de population**, par le même
pipeline que les unités (fonderie T3) : chargement en cache, fusion par matériau, instancing,
**teinte accent_joueur MULTIPLICATIVE par propriétaire** (J1 `#3DFFCE`, J2 `#FF9A3D` — décision
consignée en T1), atténuation de fog. Anneaux teintés + corps Tripo intact + lueur émissive,
exactement comme validé par Erik en T1.

## Changements

1. **`visuel3d.json` §`structures.ville3d`** (nouveau) : `{ glb: "ville_v1.glb", echelle: 1.0, rotation: 0 }`
   + commentaire de spec. **Data-driven** : supprimer cette clé = retour au Mainframe procédural
   (fallback conservé, aucune suppression sauvage). `echelle`/`rotation` calibrables sans code.
2. **`spec3d.ts`** : export `VILLE3D` (entrée .glb parsée, null si absente du JSON).
3. **`GameCanvas.svelte`** : quand `VILLE3D` est définie, les villes ne passent PLUS au
   planificateur de structures (le Mainframe, ses modules de bâtiments, la merveille dorée et le
   cœur ne sont plus rendus — **décision Erik : les retirer**) ; elles sont rendues par un monde
   dédié `villesGlb: UnitesGLBWorld` (même classe que les unités → cache, teinte, fog, instancing
   gratuits). Filtres identiques au rendu 2D : villes visibles seulement.
4. **`apps/web/public/modeles/ville_v1.glb`** : copie de l'asset promu (servi par Vite/Cloudflare Pages).

## Délibérément conservé (obsolète, non supprimé)

- `visuel3d.json` §`structures.mainframe` (socle, paliers popMax 6/18/31, cœur, nervures,
  modules, merveille, capitale) : données intactes, plus consommées par le rendu de la ville
  tant que `ville3d` est défini.
- Le planificateur Mainframe de `structures3d.ts` et ses pools : servent encore le fallback et
  l'atelier (tests L1 `structures3d.test.ts` inchangés et verts).

## Vérifications

- Suite complète **14 fichiers / 184 tests verts** (dont 2 nouveaux : spec `ville3d` pointe
  l'asset validé + fallback Mainframe planifiable ; tests catalogue mis à jour : 24 .glb servis
  tous mappés, `ville_v1.glb` branché via `ville3d`, hors catalogue unités).
- **`svelte-check` : 0 erreur** (11 warnings préexistants).
- Modèle servi : `GET /modeles/ville_v1.glb` → 200, 515 956 octets.
- Zéro gameplay : `packages/rules` et serveur INTACTS ; `schemaVersion` inchangée.
- ⚠️ **Vérification à l'œil en ligne par Erik** (stack local injoignable pendant la session —
  `/api/me` en timeout à travers le proxy Vite) : ville fondée/capturée, teinte J1/J2, croissance
  de pop SANS changement visuel (attendu). Captures `dev-logs/captures-ville-tripo/` 🔶 à prendre
  sur l'URL de production.

## Périmètre respecté

- Modules de bâtiments / merveille dorée / cœur : RETIRÉS du visuel (décision d'Erik), données
  moteur intactes. Paliers popMax : obsolètes pour le visuel. Capitale : reportée (T1). Unités v3,
  aqueduc, renommage V3 : non touchés.
