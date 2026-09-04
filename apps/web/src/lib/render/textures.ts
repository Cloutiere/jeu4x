/**
 * Textures placeholder générées à l'exécution (L2) — AUCUN fichier d'art.
 *
 * Contrat SPEC-ART (assets-src/SPEC-ART.md) respecté pour que le remplacement
 * par le vrai art soit un simple changement de textures :
 *  - pointy-top, ratio √3/2, tuiles rendues en 2× (canvas 224×256) ;
 *  - unités 2× (256×320), ancrage bas-centre, ~65 % de la largeur de case ;
 *  - villes 2× (224×256), centrées ;
 *  - deux calques par entité : `base` (neutre) + `accent` (blanc, teinté par
 *    la couleur du joueur au rendu) ;
 *  - nommage aligné sur les ids des données JSON (tile_prairie, unite_guerrier…).
 * Le fog, la sélection, les chemins et les effets sont programmatiques (v1).
 */
import { Assets, Graphics, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { RESOURCES, RESOURCE_UNKNOWN } from '@game/rules';
import type { TerrainId } from '@game/rules';

/** Couleurs d'accent joueurs — SPEC-ART §3.3/§4 (extensible à 8). */
export const PLAYER_COLORS: Record<string, number> = {
  p1: 0xd64545, // rouge vif
  p2: 0x3b6fd6, // bleu vif
  // R-95 (Phase 7d) : accent dédié des barbares — gris-brun, ni rouge ni bleu.
  barbarien: 0x8a7a66,
};
export function playerColor(engineId: string): number {
  return PLAYER_COLORS[engineId] ?? 0x8a5ad6;
}

const OUTLINE = 0x2b2620; // gris-brun très sombre (SPEC-ART §4)

export interface EntityTexture {
  base: Texture;
  accent: Texture;
}

export interface GameTextures {
  /** Clé = id terrain des données JSON (tile_prairie…). */
  tiles: Record<TerrainId, Texture>;
  /** Clé = id type d'unité des données JSON (unite_guerrier…) + variantes
   *  barbares `barbare_<type>` (Phase 7d, R-95). */
  units: Record<string, EntityTexture>;
  cities: { settlement: EntityTexture; capital: EntityTexture };
  /** R-96 (Phase 7d) : village barbare (tente/camp). */
  villageBarbare: EntityTexture;
  /** R-98 (Phase 7d) : hutte bonus. */
  hutte: EntityTexture;
  /** Icônes de rendement pour l'overlay N/P/C (null si asset absent). */
  yieldIcons: { food: Texture | null; production: Texture | null; commerce: Texture | null; gold: Texture | null; science: Texture | null };
  /** R-91 : sprites des ressources (clé = id de resources.json, null si asset absent). */
  resources: Record<string, Texture | null>;
  /** Pixel blanc (barres de PV/progression, flashs). */
  px: Texture;
}

/** Sommets d'un hexagone pointy-top de rayon R centré en (cx, cy). */
function hexPoints(cx: number, cy: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((60 * i + 30) * Math.PI) / 180;
    pts.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  return pts;
}

function g(): Graphics {
  return new Graphics();
}

// ---------------------------------------------------------------------------
// Tuiles (canvas 2× : 224 × 256, hexagone inscrit R = 128)
// ---------------------------------------------------------------------------

const TILE_W = 224;
const TILE_H = 256;
const TILE_R = 128;
const TILE_CX = TILE_W / 2;
const TILE_CY = TILE_H / 2;

function tileBase(gr: Graphics, color: number): void {
  const pts = hexPoints(TILE_CX, TILE_CY, TILE_R - 2);
  gr.poly(pts).fill({ color });
  // Relief discret : liseré interne sombre (profondeur).
  gr.poly(hexPoints(TILE_CX, TILE_CY, TILE_R - 12)).stroke({ width: 14, color: 0x000000, alpha: 0.12 });
  gr.poly(pts).closePath().stroke({ width: 5, color: OUTLINE });
}

function tree(gr: Graphics, x: number, y: number, s: number, foliage: number): void {
  gr.rect(x - s * 0.12, y, s * 0.24, s * 0.42).fill({ color: 0x5b4632 });
  gr.poly([x, y - s * 0.75, x - s * 0.42, y + s * 0.05, x + s * 0.42, y + s * 0.05]).fill({ color: foliage });
}

function tuft(gr: Graphics, x: number, y: number, s: number, color: number): void {
  gr.circle(x, y, s).fill({ color });
  gr.circle(x + s * 1.6, y + s * 0.4, s * 0.7).fill({ color });
  gr.circle(x - s * 1.5, y + s * 0.5, s * 0.6).fill({ color });
}

function buildTileGraphics(): Record<TerrainId, Graphics> {
  const out = {} as Record<TerrainId, Graphics>;

  // Prairie — herbe claire-jaune, touffes discrètes.
  {
    const gr = g();
    tileBase(gr, 0x9bc95b);
    tuft(gr, TILE_CX - 40, TILE_CY + 10, 9, 0xb2d97a);
    tuft(gr, TILE_CX + 34, TILE_CY - 30, 7, 0x8ab84e);
    out.prairie = gr;
  }
  // Plaine — herbe terne/jaunie, relief plat.
  {
    const gr = g();
    tileBase(gr, 0xc2bc6b);
    gr.ellipse(TILE_CX - 30, TILE_CY + 26, 34, 10).fill({ color: 0xb0a95a });
    gr.ellipse(TILE_CX + 36, TILE_CY - 14, 28, 8).fill({ color: 0xd0c97e });
    out.plaine = gr;
  }
  // Forêt — fond vert profond, 3 arbres au feuillage distinct.
  {
    const gr = g();
    tileBase(gr, 0x578a45);
    tree(gr, TILE_CX - 46, TILE_CY + 22, 66, 0x2f5d34);
    tree(gr, TILE_CX + 40, TILE_CY + 30, 58, 0x477c3f);
    tree(gr, TILE_CX + 2, TILE_CY - 34, 74, 0x356b39);
    out.foret = gr;
  }
  // Colline — pente nette à sommet arrondi + brun de pente.
  {
    const gr = g();
    tileBase(gr, 0x7fa351);
    gr.poly([TILE_CX - 84, TILE_CY + 56, TILE_CX - 8, TILE_CY - 38, TILE_CX + 64, TILE_CY + 56]).fill({ color: 0x8a6b46 });
    gr.ellipse(TILE_CX - 8, TILE_CY - 38, 30, 14).fill({ color: 0x95a95c });
    gr
      .poly([TILE_CX - 84, TILE_CY + 56, TILE_CX - 8, TILE_CY - 38, TILE_CX + 64, TILE_CY + 56])
      .stroke({ width: 5, color: 0x6b5236, alpha: 0.7 });
    out.colline = gr;
  }
  // Montagne — pics rocheux, sommet neigeux (infranchissable, RULES.md §2).
  {
    const gr = g();
    tileBase(gr, 0x8d8c87);
    gr.poly([TILE_CX - 78, TILE_CY + 62, TILE_CX - 20, TILE_CY - 52, TILE_CX + 30, TILE_CY + 62]).fill({ color: 0x6e6d68 });
    gr.poly([TILE_CX - 20, TILE_CY - 52, TILE_CX - 40, TILE_CY - 18, TILE_CX - 2, TILE_CY - 16]).fill({ color: 0xe8e6e0 });
    gr.poly([TILE_CX + 34, TILE_CY + 62, TILE_CX + 66, TILE_CY - 16, TILE_CX + 98, TILE_CY + 62]).fill({ color: 0x77766f });
    gr.poly([TILE_CX + 66, TILE_CY - 16, TILE_CX + 54, TILE_CY + 2, TILE_CX + 80, TILE_CY]).fill({ color: 0xdcdad2 });
    out.montagne = gr;
  }
  // Désert — sable clair, dunes discrètes (Phase 6, RULES.md §2).
  {
    const gr = g();
    tileBase(gr, 0xe0cd8f);
    gr.ellipse(TILE_CX - 28, TILE_CY + 22, 40, 11).fill({ color: 0xd2bc78 });
    gr.ellipse(TILE_CX + 34, TILE_CY - 18, 30, 9).fill({ color: 0xeadfae });
    gr.ellipse(TILE_CX + 6, TILE_CY + 44, 26, 8).fill({ color: 0xc9b26e });
    out.desert = gr;
  }
  // Eau — bleu profond, lignes de vagues claires (T-11 : infranchissable v1).
  {
    const gr = g();
    tileBase(gr, 0x3e6fa3);
    gr.moveTo(TILE_CX - 62, TILE_CY - 18);
    gr.quadraticCurveTo(TILE_CX - 30, TILE_CY - 34, TILE_CX + 2, TILE_CY - 18);
    gr.quadraticCurveTo(TILE_CX + 34, TILE_CY - 2, TILE_CX + 66, TILE_CY - 18);
    gr.stroke({ width: 8, color: 0x7fa8cc, alpha: 0.9, cap: 'round' });
    gr.moveTo(TILE_CX - 44, TILE_CY + 34);
    gr.quadraticCurveTo(TILE_CX - 12, TILE_CY + 18, TILE_CX + 20, TILE_CY + 34);
    gr.stroke({ width: 8, color: 0x7fa8cc, alpha: 0.7, cap: 'round' });
    out.eau = gr;
  }
  // Océan — bleu plus profond, vagues rares (Phase 6c : côte vs océan).
  {
    const gr = g();
    tileBase(gr, 0x2a4c74);
    gr.moveTo(TILE_CX - 50, TILE_CY - 6);
    gr.quadraticCurveTo(TILE_CX - 22, TILE_CY - 20, TILE_CX + 6, TILE_CY - 6);
    gr.quadraticCurveTo(TILE_CX + 34, TILE_CY + 8, TILE_CX + 62, TILE_CY - 6);
    gr.stroke({ width: 7, color: 0x5e86ae, alpha: 0.85, cap: 'round' });
    gr.moveTo(TILE_CX - 34, TILE_CY + 38);
    gr.quadraticCurveTo(TILE_CX - 8, TILE_CY + 26, TILE_CX + 18, TILE_CY + 38);
    gr.stroke({ width: 7, color: 0x5e86ae, alpha: 0.6, cap: 'round' });
    out.ocean = gr;
  }
  // Case de ville — sol bâti (terre + chemin), le bâtiment est une entité.
  {
    const gr = g();
    tileBase(gr, 0xa08561);
    gr.circle(TILE_CX, TILE_CY, 62).fill({ color: 0x8f6f4f });
    gr.circle(TILE_CX, TILE_CY, 62).stroke({ width: 4, color: 0x6b5236, alpha: 0.6 });
    out.ville = gr;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unités (canvas 2× : 256 × 320, ancrage bas-centre — SPEC-ART §3.2)
// ---------------------------------------------------------------------------

const UNIT_W = 256;
const UNIT_H = 320;

function buildUnitGraphics(): Record<string, { base: Graphics; accent: Graphics }> {
  const out: Record<string, { base: Graphics; accent: Graphics }> = {};

  // Guerrier — silhouette trapue, massue ; bouclier + épaulettes = accent.
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 62, 20).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 34, feet - 96, 22, 60).fill({ color: 0x5b5148 }); // jambes
    base.rect(cx + 12, feet - 96, 22, 60).fill({ color: 0x5b5148 });
    base.roundRect(cx - 46, feet - 190, 92, 104, 18).fill({ color: 0xa89a8c }); // torse
    base.rect(cx - 46, feet - 122, 92, 16).fill({ color: 0x6e655c }); // ceinture
    base.circle(cx, feet - 218, 30).fill({ color: 0xc7bbae }); // tête
    base.circle(cx - 10, feet - 222, 4).fill({ color: 0x2b2620 }); // yeux
    base.circle(cx + 10, feet - 222, 4).fill({ color: 0x2b2620 });
    base.rect(cx + 52, feet - 240, 10, 150).fill({ color: 0x6e655c }); // manche
    base.circle(cx + 57, feet - 252, 24).fill({ color: 0x7d746a }); // massue
    base.circle(cx + 57, feet - 252, 24).stroke({ width: 5, color: OUTLINE });
    base.roundRect(cx - 46, feet - 190, 92, 104, 18).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 218, 30).stroke({ width: 5, color: OUTLINE });
    base.rect(cx + 52, feet - 240, 10, 150).stroke({ width: 3, color: OUTLINE });

    const acc = g();
    acc.circle(cx - 66, feet - 150, 40).fill({ color: 0xffffff }); // bouclier
    acc.circle(cx - 66, feet - 150, 40).stroke({ width: 6, color: OUTLINE });
    acc.roundRect(cx - 40, feet - 184, 80, 40, 12).fill({ color: 0xffffff }); // épaulettes

    out.guerrier = { base, accent: acc };
  }
  // Colon — silhouette fine, bâton de pèlerin ; capuche + sac = accents.
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 50, 16).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 22, feet - 78, 18, 50).fill({ color: 0x5b5148 }); // jambes
    base.rect(cx + 6, feet - 78, 18, 50).fill({ color: 0x5b5148 });
    base.poly([cx, feet - 220, cx - 40, feet - 90, cx + 40, feet - 90]).fill({ color: 0xb0a79a }); // cape
    base.circle(cx, feet - 226, 24).fill({ color: 0xc7bbae }); // visage
    base.circle(cx - 8, feet - 230, 3.5).fill({ color: 0x2b2620 });
    base.circle(cx + 8, feet - 230, 3.5).fill({ color: 0x2b2620 });
    base.rect(cx + 44, feet - 250, 8, 220).fill({ color: 0x7a6f62 }); // bâton
    base.poly([cx, feet - 220, cx - 40, feet - 90, cx + 40, feet - 90]).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 226, 24).stroke({ width: 5, color: OUTLINE });
    base.rect(cx + 44, feet - 250, 8, 220).stroke({ width: 3, color: OUTLINE });

    const acc = g();
    acc.poly([cx, feet - 258, cx - 30, feet - 214, cx + 30, feet - 214]).fill({ color: 0xffffff }); // capuche
    acc.circle(cx - 30, feet - 130, 22).fill({ color: 0xffffff }); // sac de voyage

    out.colon = { base, accent: acc };
  }
  // 7f · R-114 : Personnages illustres de culture — Artiste (palette + pinceau)
  // et Penseur (livre), silhouettes élancées distinctes des combattants.
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 50, 16).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 20, feet - 76, 16, 50).fill({ color: 0x5b5148 }); // jambes
    base.rect(cx + 6, feet - 76, 16, 50).fill({ color: 0x5b5148 });
    base.poly([cx, feet - 200, cx - 36, feet - 84, cx + 36, feet - 84]).fill({ color: 0xc4a4d6 }); // tunique violette
    base.circle(cx, feet - 208, 24).fill({ color: 0xc7bbae }); // tête
    base.circle(cx - 8, feet - 212, 3.5).fill({ color: 0x2b2620 });
    base.circle(cx + 8, feet - 212, 3.5).fill({ color: 0x2b2620 });
    base.ellipse(cx + 46, feet - 130, 26, 20).fill({ color: 0xa8794f }); // palette
    base.circle(cx + 52, feet - 250, 6).fill({ color: 0x8a6f4a }); // pinceau (poignée)
    base.rect(cx + 50, feet - 246, 4, 60).fill({ color: 0x7a6f62 });
    base.poly([cx, feet - 200, cx - 36, feet - 84, cx + 36, feet - 84]).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 208, 24).stroke({ width: 5, color: OUTLINE });
    base.ellipse(cx + 46, feet - 130, 26, 20).stroke({ width: 4, color: OUTLINE });

    const acc = g();
    acc.circle(cx + 38, feet - 136, 6).fill({ color: 0xffffff }); // taches de peinture
    acc.circle(cx + 52, feet - 122, 6).fill({ color: 0xffffff });
    acc.circle(cx + 44, feet - 112, 5).fill({ color: 0xffffff });
    acc.poly([cx - 18, feet - 232, cx + 18, feet - 232, cx + 10, feet - 210, cx - 10, feet - 210]).fill({ color: 0xffffff }); // béret

    out.artiste = { base, accent: acc };
  }
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 50, 16).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 20, feet - 76, 16, 50).fill({ color: 0x5b5148 }); // jambes
    base.rect(cx + 6, feet - 76, 16, 50).fill({ color: 0x5b5148 });
    base.poly([cx, feet - 200, cx - 36, feet - 84, cx + 36, feet - 84]).fill({ color: 0x7f9ec7 }); // robe bleu-gris
    base.circle(cx, feet - 208, 24).fill({ color: 0xc7bbae }); // tête
    base.circle(cx - 8, feet - 212, 3.5).fill({ color: 0x2b2620 });
    base.circle(cx + 8, feet - 212, 3.5).fill({ color: 0x2b2620 });
    base.rect(cx - 44, feet - 150, 34, 44).fill({ color: 0x8a5a3a }); // livre
    base.rect(cx - 44, feet - 150, 34, 44).stroke({ width: 4, color: OUTLINE });
    base.poly([cx, feet - 200, cx - 36, feet - 84, cx + 36, feet - 84]).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 208, 24).stroke({ width: 5, color: OUTLINE });

    const acc = g();
    acc.rect(cx - 44, feet - 132, 34, 6).fill({ color: 0xffffff }); // tranche du livre
    acc.poly([cx - 18, feet - 236, cx + 18, feet - 236, cx, feet - 258]).fill({ color: 0xffffff }); // couronne de laurier
    acc.rect(cx - 34, feet - 144, 4, 32).fill({ color: 0xffffff }); // pages

    out.penseur = { base, accent: acc };
  }
  // 7j · R-126 : les 6 classes canoniques — artiste/penseur fusionnés,
  // renommages D2 + humanitaire. 7k : des sprites DÉDIÉS existent désormais
  // (unite_artiste_penseur/savant/batisseur/explorateur/humanitaire/leader.png,
  // générés par assets-src/tools/generate.py) — ces alias ne servent que de
  // FALLBACK si un PNG manque.
  out.artiste_penseur = out.artiste!;
  out.savant = out.penseur!;
  out.batisseur = out.guerrier!;
  out.explorateur = out.colon!;
  out.humanitaire = out.penseur!;
  out.leader = out.guerrier!;
  return out;
}

// ---------------------------------------------------------------------------
// Villes (canvas 2× : 224 × 256, bâtiment centré — SPEC-ART §3.2)
// ---------------------------------------------------------------------------

function buildSettlementGraphics(): { base: Graphics; accent: Graphics } {
  const cx = 112;
  const ground = 202;

  // Settlement — 2 huttes groupées, toits + bannière = accent.
  const base = g();
  base.ellipse(cx, ground, 86, 22).fill({ color: 0x000000, alpha: 0.2 });
  base.rect(cx - 58, ground - 66, 52, 66).fill({ color: 0xc2b49f });
  base.rect(cx - 2, ground - 56, 44, 56).fill({ color: 0xb5a692 });
  base.rect(cx - 58, ground - 66, 52, 66).stroke({ width: 5, color: OUTLINE });
  base.rect(cx - 2, ground - 56, 44, 56).stroke({ width: 5, color: OUTLINE });
  base.rect(cx - 44, ground - 34, 16, 34).fill({ color: 0x6e655c }); // portes
  base.rect(cx + 12, ground - 28, 14, 28).fill({ color: 0x6e655c });

  const acc = g();
  acc.poly([cx - 72, ground - 62, cx - 32, ground - 62, cx - 52, ground - 108]).fill({ color: 0xffffff });
  acc.poly([cx - 14, ground - 52, cx + 30, ground - 52, cx + 8, ground - 94]).fill({ color: 0xffffff });
  acc.rect(cx + 52, ground - 120, 6, 66).fill({ color: 0xffffff }); // mât
  acc.poly([cx + 58, ground - 120, cx + 96, ground - 108, cx + 58, ground - 96]).fill({ color: 0xffffff });

  return { base, accent: acc };
}

function buildCapitalGraphics(): { base: Graphics; accent: Graphics } {
  const cx = 112;
  const ground = 202;
  const base = g();
  base.ellipse(cx, ground, 96, 24).fill({ color: 0x000000, alpha: 0.2 });
  base.rect(cx - 84, ground - 58, 168, 58).fill({ color: 0x9b9285 }); // muraille
  base.rect(cx - 84, ground - 58, 168, 58).stroke({ width: 5, color: OUTLINE });
  for (let i = 0; i < 5; i++) {
    base.rect(cx - 84 + i * 36, ground - 76, 20, 20).fill({ color: 0x9b9285 }); // créneaux
  }
  base.rect(cx - 30, ground - 140, 60, 84).fill({ color: 0xb5a692 }); // donjon
  base.rect(cx - 30, ground - 140, 60, 84).stroke({ width: 5, color: OUTLINE });
  base.rect(cx - 12, ground - 46, 24, 46).fill({ color: 0x4d443c }); // porte

  const acc = g();
  acc.poly([cx - 42, ground - 136, cx + 42, ground - 136, cx, ground - 186]).fill({ color: 0xffffff }); // toit donjon
  acc.rect(cx + 62, ground - 190, 8, 80).fill({ color: 0xffffff }); // grand mât
  acc.poly([cx + 70, ground - 190, cx + 118, ground - 172, cx + 70, ground - 154]).fill({ color: 0xffffff });
  return { base, accent: acc };
}

// ---------------------------------------------------------------------------
// Barbares & huttes (Phase 7d — R-95..R-98) : placeholders de secours. Les
// assets réels (unite_barbare_*, village_barbare, hutte) sont générés par le
// pipeline generate.py ; ces Graphics ne servent que si le PNG est absent.
// ---------------------------------------------------------------------------

function buildBarbarianUnitGraphics(): Record<string, { base: Graphics; accent: Graphics }> {
  const out: Record<string, { base: Graphics; accent: Graphics }> = {};
  // Guerrier barbare — silhouette trapue, peaux (torse brun) + massue.
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 62, 20).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 34, feet - 96, 22, 60).fill({ color: 0x4e4438 });
    base.rect(cx + 12, feet - 96, 22, 60).fill({ color: 0x4e4438 });
    base.roundRect(cx - 46, feet - 190, 92, 104, 18).fill({ color: 0x7a5c3a }); // tunique de peaux
    base.rect(cx - 46, feet - 122, 92, 16).fill({ color: 0x5e4630 });
    base.circle(cx, feet - 218, 30).fill({ color: 0xa8917a }); // tête
    base.rect(cx - 30, feet - 250, 60, 18).fill({ color: 0x6e655c }); // cheveux sauvages
    base.circle(cx - 10, feet - 222, 4).fill({ color: 0x2b2620 });
    base.circle(cx + 10, feet - 222, 4).fill({ color: 0x2b2620 });
    base.rect(cx + 52, feet - 240, 10, 150).fill({ color: 0x6e655c });
    base.circle(cx + 57, feet - 252, 24).fill({ color: 0x7d746a }); // massue
    base.circle(cx + 57, feet - 252, 24).stroke({ width: 5, color: OUTLINE });
    base.roundRect(cx - 46, feet - 190, 92, 104, 18).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 218, 30).stroke({ width: 5, color: OUTLINE });
    const acc = g();
    acc.roundRect(cx - 40, feet - 184, 80, 40, 12).fill({ color: 0xffffff }); // bandage d'épaules
    acc.rect(cx - 20, feet - 96, 40, 30).fill({ color: 0xffffff }); // ceinture d'os
    out.guerrier = { base, accent: acc };
  }
  // Archer barbare — silhouette élancée, plumes, arc de chasse.
  {
    const cx = UNIT_W / 2;
    const feet = UNIT_H - 10;
    const base = g();
    base.ellipse(cx, feet - 4, 50, 16).fill({ color: 0x000000, alpha: 0.25 });
    base.rect(cx - 20, feet - 60, 16, 50).fill({ color: 0x4e4438 });
    base.rect(cx + 4, feet - 60, 16, 50).fill({ color: 0x4e4438 });
    base.poly([cx, feet - 220, cx - 38, feet - 90, cx + 38, feet - 90]).fill({ color: 0x6e5a42 }); // tunique de peaux
    base.circle(cx, feet - 226, 24).fill({ color: 0xa8917a });
    base.poly([cx - 24, feet - 244, cx, feet - 266, cx + 24, feet - 244]).fill({ color: 0x8a6f4a }); // coiffe à plumes
    base.rect(cx + 44, feet - 250, 8, 200).fill({ color: 0x7a6f62 }); // arc
    base.poly([cx, feet - 220, cx - 38, feet - 90, cx + 38, feet - 90]).stroke({ width: 5, color: OUTLINE });
    base.circle(cx, feet - 226, 24).stroke({ width: 5, color: OUTLINE });
    const acc = g();
    acc.poly([cx - 24, feet - 244, cx, feet - 266, cx + 24, feet - 244]).fill({ color: 0xffffff });
    acc.circle(cx - 30, feet - 130, 20).fill({ color: 0xffffff }); // carquois
    out.archer = { base, accent: acc };
  }
  return out;
}

/** R-96 : village barbare (tente/camp) — placeholder de secours. */
function buildVillageBarbareGraphics(): { base: Graphics; accent: Graphics } {
  const cx = 112;
  const ground = 202;
  const base = g();
  base.ellipse(cx, ground, 80, 20).fill({ color: 0x000000, alpha: 0.2 });
  // tente principale
  base.poly([cx, ground - 120, cx - 62, ground, cx + 62, ground]).fill({ color: 0x8a6f4a });
  base.poly([cx, ground - 120, cx - 62, ground, cx, ground]).fill({ color: 0x9c7f5a });
  base.rect(cx - 10, ground - 44, 20, 44).fill({ color: 0x3e342a }); // ouverture
  // feu de camp
  base.circle(cx + 52, ground - 8, 10).fill({ color: 0xc25b3a });
  base.poly([cx, ground - 120, cx - 62, ground, cx + 62, ground]).stroke({ width: 5, color: OUTLINE });
  const acc = g();
  acc.poly([cx, ground - 120, cx - 26, ground - 58, cx + 26, ground - 58]).fill({ color: 0xffffff }); // peau de toit
  return { base, accent: acc };
}

/** R-98 : hutte bonus — placeholder de secours. */
function buildHutGraphics(): { base: Graphics; accent: Graphics } {
  const cx = 112;
  const ground = 202;
  const base = g();
  base.ellipse(cx, ground, 56, 14).fill({ color: 0x000000, alpha: 0.2 });
  base.rect(cx - 30, ground - 52, 60, 52).fill({ color: 0x9c8a6a });
  base.poly([cx - 40, ground - 52, cx, ground - 96, cx + 40, ground - 52]).fill({ color: 0x7d6b4a });
  base.rect(cx - 9, ground - 30, 18, 30).fill({ color: 0x3e342a });
  base.rect(cx - 30, ground - 52, 60, 52).stroke({ width: 5, color: OUTLINE });
  base.poly([cx - 40, ground - 52, cx, ground - 96, cx + 40, ground - 52]).stroke({ width: 5, color: OUTLINE });
  const acc = g();
  acc.poly([cx - 40, ground - 52, cx, ground - 96, cx + 40, ground - 52]).fill({ color: 0xffffff }); // toit doré au rendu
  return { base, accent: acc };
}

// ---------------------------------------------------------------------------
// Cuisson des textures via le renderer (les Graphics sont détruits après).
// ---------------------------------------------------------------------------

function bake(renderer: Renderer, graphics: Graphics): Texture {
  const tex = renderer.generateTexture({ target: graphics, resolution: 1, antialias: true });
  graphics.destroy();
  return tex;
}

function bakeEntity(renderer: Renderer, e: { base: Graphics; accent: Graphics }): EntityTexture {
  const base = bake(renderer, e.base);
  const accent = bake(renderer, e.accent);
  return { base, accent };
}

/** Génère TOUTES les textures placeholder (à appeler après `app.init`). */
export function createTextures(renderer: Renderer): GameTextures {
  const tileGraphics = buildTileGraphics();
  const tiles = {} as Record<TerrainId, Texture>;
  for (const [id, gr] of Object.entries(tileGraphics)) {
    tiles[id as TerrainId] = bake(renderer, gr);
  }

  const unitGraphics = buildUnitGraphics();
  const units: Record<string, EntityTexture> = {};
  for (const [id, e] of Object.entries(unitGraphics)) {
    units[id] = bakeEntity(renderer, e);
  }

  const px = Texture.WHITE;
  const yieldIcons = {
    food: null,
    production: null,
    commerce: null,
  } as GameTextures['yieldIcons'];

  const barbarianUnits = buildBarbarianUnitGraphics();

  return {
    tiles,
    units: {
      ...units,
      // R-95 (Phase 7d) : variantes barbares — accent gris-brun au rendu
      // (playerColor('barbarien')), silhouettes distinctes des joueurs.
      barbare_guerrier: bakeEntity(renderer, barbarianUnits.guerrier!),
      barbare_archer: bakeEntity(renderer, barbarianUnits.archer!),
    },
    cities: {
      settlement: bakeEntity(renderer, buildSettlementGraphics()),
      capital: bakeEntity(renderer, buildCapitalGraphics()),
    },
    // R-96/R-98 : village barbare et hutte bonus (placeholders cuisés ; les
    // assets réels remplacent via loadTextures).
    villageBarbare: bakeEntity(renderer, buildVillageBarbareGraphics()),
    hutte: bakeEntity(renderer, buildHutGraphics()),
    yieldIcons,
    resources: {},
    px,
  };
}

// ---------------------------------------------------------------------------
// Chargement des assets réels (HANDOFF-PHASE3 L2 — commit 29723ed) avec
// FALLBACK placeholder : un seul chemin de rendu, chaque nom d'asset vise le
// PNG de public/art/ (copies de assets-src/exports, SPEC-ART §3.5) et retombe
// sur la texture générée si le fichier est absent (unités P2 futures…).
// ---------------------------------------------------------------------------

/** Nom d'asset PNG (SPEC-ART §3.5) par id des données JSON. */
const TILE_ASSETS: Record<TerrainId, string> = {
  prairie: 'tile_prairie',
  plaine: 'tile_plaine',
  foret: 'tile_foret',
  colline: 'tile_colline',
  montagne: 'tile_montagne',
  desert: 'tile_desert',
  eau: 'tile_eau',
  ocean: 'tile_ocean',
  ville: 'tile_ville_sol',
};

// 7j · R-126 : les 6 classes canoniques (art unite_<id>.png optionnelle).
// 7m : espion (art existant, jamais chargé) et icbm (nouveau sprite) ajoutés.
const UNIT_IDS = ['guerrier', 'colon', 'artiste', 'penseur', 'artiste_penseur', 'batisseur', 'savant', 'explorateur', 'humanitaire', 'leader', 'espion', 'icbm'];

async function texOrFallback(name: string, fallback: Texture): Promise<Texture> {
  try {
    return (await Assets.load(`/art/${name}.png`)) as Texture;
  } catch {
    return fallback;
  }
}

async function entityOrFallback(base: string, fallback: EntityTexture): Promise<EntityTexture> {
  const [b, a] = await Promise.all([
    texOrFallback(base, fallback.base),
    texOrFallback(`${base}_accent`, fallback.accent),
  ]);
  return { base: b, accent: a };
}

/** Charge les assets réels depuis /art/ — fallback placeholder fichier par fichier. */
export async function loadTextures(renderer: Renderer): Promise<GameTextures> {
  const fallback = createTextures(renderer);

  const tileIds = Object.keys(TILE_ASSETS) as TerrainId[];
  // R-91 : les 22 ressources de resources.json + le marqueur « inconnue »
  // (R-92, diffusion d'identité masquée) — optionnels, id → res_<id>.png.
  const resourceIds = [...Object.keys(RESOURCES).sort(), RESOURCE_UNKNOWN];
  // Phase 7d (R-95) : variantes barbares (accent gris-brun au rendu).
  const barbareIds = ['guerrier', 'archer'];
  const [tiles, units, barbareUnits, settlement, capital, villageBarbare, hutte, foodIcon, productionIcon, commerceIcon, goldIcon, scienceIcon, resourceIcons] = await Promise.all([
    Promise.all(tileIds.map((id) => texOrFallback(TILE_ASSETS[id], fallback.tiles[id]).then((t) => [id, t] as const))),
    Promise.all(
      UNIT_IDS.filter((id) => fallback.units[id]).map((id) =>
        entityOrFallback(`unite_${id}`, fallback.units[id]!).then((t) => [id, t] as const),
      ),
    ),
    Promise.all(
      barbareIds.map((id) =>
        entityOrFallback(`unite_barbare_${id}`, fallback.units[`barbare_${id}`] ?? fallback.units.guerrier!).then((t) => [`barbare_${id}`, t] as const),
      ),
    ),
    entityOrFallback('ville_settlement', fallback.cities.settlement),
    entityOrFallback('ville_capitale', fallback.cities.capital),
    entityOrFallback('village_barbare', fallback.villageBarbare),
    entityOrFallback('hutte', fallback.hutte),
    optionalIcon('icone_nourriture'),
    optionalIcon('icone_production'),
    optionalIcon('icone_commerce'),
    optionalIcon('icone_or'),
    optionalIcon('icone_science'),
    Promise.all(resourceIds.map((id) => optionalIcon(`res_${id}`).then((t) => [id, t] as const))),
  ]);

  return {
    tiles: Object.fromEntries(tiles) as Record<TerrainId, Texture>,
    units: Object.fromEntries([...units, ...barbareUnits]),
    cities: { settlement, capital },
    villageBarbare,
    hutte,
    yieldIcons: { food: foodIcon, production: productionIcon, commerce: commerceIcon, gold: goldIcon, science: scienceIcon },
    resources: Object.fromEntries(resourceIcons),
    px: fallback.px,
  };
}

/** Icône optionnelle : null si l'asset est absent (l'overlay retombe sur le texte). */
async function optionalIcon(name: string): Promise<Texture | null> {
  try {
    return (await Assets.load(`/art/${name}.png`)) as Texture;
  } catch {
    return null;
  }
}
