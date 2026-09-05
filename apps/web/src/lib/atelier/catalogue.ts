/**
 * catalogue — INDEX CENTRAL des assets visuels de l'atelier (page #/atelier).
 *
 * Généré depuis les SOURCES DE VÉRITÉ du projet (aucune liste dupliquée à la
 * main) : `visuel3d.json` via `spec3d.ts` (terrains 3D, structures 3D,
 * cartes-ressources), les registres du moteur `@game/rules` (terrains,
 * unités, bâtiments, ressources, artefacts — noms des sprites 2D) et le
 * nommage de `generate.py`/`sync-art` (`public/art/<stem>.png`).
 *
 * L'atelier EXPOSE les assets, il ne les définit pas : tout nouvel asset doit
 * d'abord exister dans sa source (cf. ATELIER-ASSETS.md § État du répertoire).
 */
import {
  TERRAINS3D,
  STRUCTURES3D,
} from '../render3d/spec3d.js';
import {
  TERRAINS,
  UNIT_TYPES,
  BUILDINGS,
  RESOURCES,
  ARTEFACTS,
  RESOURCE_UNKNOWN,
} from '@game/rules';

/** Catégories de l'atelier (ordre de la barre). */
export const CATEGORIES = ['terrains3d', 'structures3d', 'cartes', 'sprites', 'overlays'] as const;
export type CategorieAtelier = (typeof CATEGORIES)[number];

export const NOM_CATEGORIE: Record<CategorieAtelier, string> = {
  terrains3d: 'Terrains 3D',
  structures3d: 'Structures 3D',
  cartes: 'Cartes-ressources',
  sprites: 'Sprites 2D',
  overlays: 'Overlays',
};

/** Comment l'asset s'affiche en vue d'isolement. */
export type SorteAsset =
  | 'terrain3d'   // tuile 3D seule (TerrainWorld)
  | 'structure3d' // structure 3D posée sur une tuile prairie (StructuresWorld)
  | 'carte3d'     // carte-ressource sur son slot (tuile prairie + ressource)
  | 'sprite'      // PNG 2D (base + accent teinté par joueur)
  | 'overlay';    // effet programmatique (aucun fichier) — fiche seule

export interface AssetAtelier {
  /** Identifiant EXACT (copiable — c'est ce qu'Erik dicte en session). */
  id: string;
  categorie: CategorieAtelier;
  /** Nom FR courant. */
  nom: string;
  /** Source de vérité (entrée JSON / fonction générateur). */
  source: string;
  sorte: SorteAsset;
  /** Sprites : stem du PNG (`public/art/<stem>.png`, `#` = suffixe `_accent`). */
  sprite?: string;
}

const SRC_JSON = (chemin: string): string => `visuel3d.json §${chemin}`;
const SRC_MOTEUR = (fichier: string): string => `packages/rules/src/data/${fichier}`;
const SRC_GENERATEUR = (nom: string): string => `assets-src/tools/generate.py (${nom})`;

function spriteAsset(id: string, nom: string, source: string, accent: boolean): AssetAtelier {
  return { id, categorie: 'sprites', nom, source, sorte: 'sprite', sprite: accent ? `${id}#` : id };
}

// --- Terrains 3D (miroir exact de visuel3d.json §terrains) ------------------
function terrains3d(): AssetAtelier[] {
  return Object.entries(TERRAINS3D).map(([id, spec]) => ({
    id,
    categorie: 'terrains3d' as const,
    nom: spec.nom,
    source: `${SRC_JSON(`terrains.${id}`)} (miroir moteur : ${SRC_MOTEUR('terrain.json')})`,
    sorte: 'terrain3d' as const,
  }));
}

// --- Structures 3D (visuel3d.json §structures, hors cartes) ------------------
function structures3d(): AssetAtelier[] {
  const s = STRUCTURES3D;
  return [
    {
      id: 'structures:slot',
      categorie: 'structures3d',
      nom: 'Slot de carte-ressource (standard)',
      source: SRC_JSON('structures.slot'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:carteNeutre',
      categorie: 'structures3d',
      nom: `Carte neutre « inconnue » (marqueur ${RESOURCE_UNKNOWN}, R-92)`,
      source: SRC_JSON('structures.carteNeutre'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframe',
      categorie: 'structures3d',
      nom: 'Mainframe des villes (socle, corps, paliers, antenne, modules, merveille)',
      source: SRC_JSON('structures.mainframe'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:cratere',
      categorie: 'structures3d',
      nom: 'Cratère (déclinaison stérile 7m C15)',
      source: `${SRC_JSON('structures.cratere')} + terrain « cratere »`,
      sorte: 'terrain3d',
    },
    {
      id: 'structures:hutte',
      categorie: 'structures3d',
      nom: 'Hutte bonus barbare',
      source: SRC_JSON('structures.hutte'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:village',
      categorie: 'structures3d',
      nom: 'Village barbare (tente/camp + mur)',
      source: SRC_JSON('structures.village'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframePalier',
      categorie: 'structures3d',
      nom: `Paliers du Mainframe (pop max ${s.mainframe.paliers.map((p) => p.popMax).join(' / ')})`,
      source: SRC_JSON('structures.mainframe.paliers'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframeCapitale',
      categorie: 'structures3d',
      nom: 'Capitale (couronne, antenne longue, accent large)',
      source: SRC_JSON('structures.mainframe.capitale'),
      sorte: 'structure3d',
    },
    {
      id: 'structures:mainframeMerveille',
      categorie: 'structures3d',
      nom: 'Module doré des merveilles',
      source: SRC_JSON('structures.mainframe.merveille'),
      sorte: 'structure3d',
    },
  ];
}

// --- Cartes-ressources (visuel3d.json §structures.cartes × resources.json) --
function cartesRessources(): AssetAtelier[] {
  return Object.keys(RESOURCES).map((id) => ({
    id: `carte:${id}`,
    categorie: 'cartes' as const,
    nom: `Carte ${RESOURCES[id]!.name}`,
    source: `${SRC_JSON(`structures.cartes.${id}`)} (ressource : ${SRC_MOTEUR('resources.json')})`,
    sorte: 'carte3d' as const,
  }));
}

// --- Sprites 2D (registre generate.py — noms consommés par textures.ts) -----
/** Icônes de rendement/jeton : liste fixe du peintre (aucun registre moteur). */
const ICONES = [
  'or', 'commerce', 'science', 'nourriture', 'production',
  'pv', 'pm', 'fin_tour', 'reseau', 'culture', 'gouvernement',
] as const;

function sprites2d(): AssetAtelier[] {
  const out: AssetAtelier[] = [];
  for (const id of Object.keys(TERRAINS)) {
    const stem = id === 'ville' ? 'tile_ville_sol' : `tile_${id}`;
    out.push(spriteAsset(stem, `Tuile ${id}`, `${SRC_GENERATEUR('render_tile')} — consommé par textures.ts (tiles)` , false));
  }
  for (const [id, u] of Object.entries(UNIT_TYPES)) {
    out.push(spriteAsset(`unite_${id}`, `Unité ${u.name}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (units)`, true));
  }
  out.push(spriteAsset('ville_settlement', 'Ville (settlement)', `${SRC_GENERATEUR('render_entity')} — textures.ts (cities.settlement)`, true));
  out.push(spriteAsset('ville_capitale', 'Ville (capitale)', `${SRC_GENERATEUR('render_entity')} — textures.ts (cities.capital)`, true));
  out.push(spriteAsset('village_barbare', 'Village barbare (sprite 2D)', `${SRC_GENERATEUR('render_entity')} — textures.ts (villageBarbare)`, true));
  out.push(spriteAsset('hutte', 'Hutte bonus (sprite 2D)', `${SRC_GENERATEUR('render_entity')} — textures.ts (hutte)`, true));
  for (const id of Object.keys(BUILDINGS)) {
    out.push(spriteAsset(`batiment_${id}`, `Bâtiment ${BUILDINGS[id]!.name}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (hutte/unites : modules ville 2D)`, true));
  }
  for (const id of Object.keys(ARTEFACTS.pool).filter((k) => !ARTEFACTS.pool[k]!.dlcOnly).sort()) {
    out.push(spriteAsset(`artefact_${id}`, `Artefact ${id}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (artefacts, ARTEFACT_IDS)`, true));
  }
  for (const id of Object.keys(RESOURCES)) {
    out.push(spriteAsset(`res_${id}`, `Ressource ${RESOURCES[id]!.name} (jeton 2D)`, `${SRC_GENERATEUR('render_entity')} — textures.ts (resources, R-91)`, false));
  }
  out.push(spriteAsset('res_inconnue', `Ressource inconnue (marqueur ${RESOURCE_UNKNOWN}, R-92)`, `${SRC_GENERATEUR('render_entity')} — textures.ts (resources)`, false));
  for (const icone of ICONES) {
    out.push(spriteAsset(`icone_${icone}`, `Icône ${icone}`, `${SRC_GENERATEUR('render_entity')} — textures.ts (yieldIcons/overlays)`, false));
  }
  return out;
}

// --- Overlays (effets PROGRAMMATIQUES — aucun fichier, fiche seule) ---------
function overlays(): AssetAtelier[] {
  return [
    { id: 'overlay:selection', categorie: 'overlays', nom: 'Anneau de sélection', source: 'code — render/ (calque PixiJS, v1 programmatique)', sorte: 'overlay' },
    { id: 'overlay:chemin', categorie: 'overlays', nom: 'Flèches de chemin (brouillon d’ordre)', source: 'code — render/interaction.ts + hexView', sorte: 'overlay' },
    { id: 'overlay:workedTile', categorie: 'overlays', nom: 'Marqueur de case travaillée', source: 'code — GameCanvas (workedTiles)', sorte: 'overlay' },
    { id: 'overlay:ping', categorie: 'overlays', nom: 'Ping d’artefact (R-155)', source: 'code — GameCanvas (artifactPings)', sorte: 'overlay' },
    { id: 'overlay:lueurRendement', categorie: 'overlays', nom: 'Lueur « actif allumé » des glyphes (rendement réel)', source: 'code — render3d/rendement.ts + world3d', sorte: 'overlay' },
    { id: 'overlay:brouillard', categorie: 'overlays', nom: 'Brouillard de guerre 3 états (R-70)', source: 'code — world3d (FOG_DIM)', sorte: 'overlay' },
  ];
}

/** Index complet, ordonné par catégorie puis id (ordre stable, testé). */
export function construireCatalogue(): AssetAtelier[] {
  return [
    ...terrains3d(),
    ...structures3d(),
    ...cartesRessources(),
    ...sprites2d(),
    ...overlays(),
  ];
}

export const CATALOGUE: AssetAtelier[] = construireCatalogue();

/** Stems PNG attendus dans `public/art` pour un asset sprite (base + accent). */
export function stemsDe(asset: AssetAtelier): { base: string; accent: string | null } {
  if (!asset.sprite) return { base: '', accent: null };
  const accent = asset.sprite.endsWith('#');
  const stem = accent ? asset.sprite.slice(0, -1) : asset.sprite;
  return { base: stem, accent: accent ? `${stem}_accent` : null };
}

/** Filtre de la grille (barre de catégories + recherche insensible à la casse
 *  sur id exact et nom FR) — pur, testé sans DOM. */
export function filtrerCatalogue(
  catalogue: AssetAtelier[],
  categorie: CategorieAtelier | 'toutes',
  recherche: string,
): AssetAtelier[] {
  const q = recherche.trim().toLowerCase();
  return catalogue.filter(
    (a) =>
      (categorie === 'toutes' || a.categorie === categorie) &&
      (q === '' || a.id.toLowerCase().includes(q) || a.nom.toLowerCase().includes(q)),
  );
}
