#!/usr/bin/env python3
"""
Générateur procédural d'assets P0 — conforme à SPEC-ART.md.

Usage :
    python tools/generate.py            # génère exports/ + palette.txt + LICENSES.md
    python tools/generate.py --check    # vérifie dimensions/ratio des fichiers existants

Style : A. Flat « board-game ». Aucune dépendance externe (Pillow uniquement).
Antialiasing par supersampling x4 (les coordonnées du code sont en pixels "2×"
de la spec ; tout est multiplié par SS au dessin puis réduit).
"""

import math
import sys
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
EXPORTS = ROOT / "exports"
SS = 4  # supersampling

# ---------------------------------------------------------------- palette (§4)
INK = "#2B2620"          # contour / bordure hexagonale

PRAIRIE_1 = "#A8C86A"    # vert clair-jaune
PRAIRIE_2 = "#8FB35A"
PRAIRIE_3 = "#C4DA82"
PLAINE_1 = "#B5B36A"     # vert-jaune terne
PLAINE_2 = "#C2A85E"     # ocre
FORET_1 = "#4E7A3A"      # vert profond
FORET_2 = "#6E9C4A"      # vert medium
COLLINE_1 = "#93AC58"
COLLINE_2 = "#8A6F4A"    # brun pente
MONTAGNE_1 = "#8D8D95"   # gris
MONTAGNE_2 = "#6E6E78"   # gris sombre
NEIGE = "#F2F2F0"
EAU_1 = "#3E6E9E"        # fond
EAU_2 = "#7FA9CC"        # vague claire
OCEAN_1 = "#2A4C74"      # fond océan profond (Phase 6c : côte vs océan)
OCEAN_2 = "#5E86AE"      # vague océan, plus discrète que la côte
SOL_CHEMIN = "#A98F63"   # brun chemin
SOL_TERRE = "#8F7B57"    # terre
OR = "#D9A93F"
OR_SOMBRE = "#A87E28"
SCIENCE = "#6FA3B8"
NOURRITURE = "#8FA84E"
PRODUCTION = "#9C7A4E"
PV = "#C25B5B"
PM = "#D9C04A"
SABLE = "#C8B08A"        # peaux/tissus neutres
DESERT_1 = "#E3D19A"     # sable clair (Phase 6)
DESERT_2 = "#CDB478"     # dune
COMMERCE = "#C08A3E"     # commerce (Phase 6)
BOIS = "#7A5C3A"
BOIS_CLAIR = "#A3835A"
GRIS_ARMURE = "#9A9AA0"
GRIS_NEUTRE = "#B8B4AC"
ROUGE_JOUEUR = "#D64545"  # référence (les accents sont livrés blancs)
BLEU_JOUEUR = "#3B6FD6"

# ---------------------------------------------------------------- helpers


class D:
    """Draw avec coordonnées en unités « 2× » de la spec, scalées par SS."""

    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _pts(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def poly(self, pts, fill=None, outline=None, width=0):
        self.d.polygon(self._pts(pts), fill=fill, outline=outline,
                       width=int(width * SS) if width else 0)

    def line(self, pts, fill, width):
        self.d.line(self._pts(pts), fill=fill, width=int(width * SS), joint="curve")

    def ellipse(self, box, fill=None, outline=None, width=0):
        self.d.ellipse([c * SS for c in box], fill=fill, outline=outline,
                       width=int(width * SS) if width else 0)

    def pieslice(self, box, start, end, fill=None, outline=None, width=0):
        self.d.pieslice([c * SS for c in box], start, end, fill=fill,
                        outline=outline, width=int(width * SS) if width else 0)

    def arc(self, box, start, end, fill, width):
        self.d.arc([c * SS for c in box], start, end, fill=fill,
                   width=int(width * SS))

    def rrect(self, box, radius, fill=None, outline=None, width=0):
        self.d.rounded_rectangle([c * SS for c in box], radius=radius * SS,
                                 fill=fill, outline=outline,
                                 width=int(width * SS) if width else 0)


def new_canvas(w, h):
    return Image.new("RGBA", (int(w * SS), int(h * SS)), (0, 0, 0, 0))


def downscale(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def hex_tile_canvas():
    """224×256, hexagone pointy-top inscrit (h=256, w=256·√3/2≈222), centré."""
    return 224, 256, 112.0


def hex_points(cx, cy, w, h):
    return [(cx, cy - h / 2), (cx + w / 2, cy - h / 4), (cx + w / 2, cy + h / 4),
            (cx, cy + h / 2), (cx - w / 2, cy + h / 4), (cx - w / 2, cy - h / 4)]


def hex_mask(w, h, cx):
    m = Image.new("L", (int(w * SS), int(h * SS)), 0)
    dm = ImageDraw.Draw(m)
    hw = h * math.sqrt(3) / 2  # ratio exact √3/2
    dm.polygon([tuple(p * SS for p in pt) for pt in hex_points(cx, h / 2, hw, h)],
               fill=255)
    return m


def render_tile(name, painter):
    """Tuile 224×256 : terrain peint, rogné à l'hexagone, bordure sombre 2.5 px."""
    w, h, cx = hex_tile_canvas()
    img = new_canvas(w, h)

    terrain = new_canvas(w, h)
    painter(D(terrain), terrain, w, h, cx)

    mask = hex_mask(w, h, cx)
    img.paste(terrain, (0, 0), mask)

    d = D(img)
    hw = h * math.sqrt(3) / 2
    pts = hex_points(cx, h / 2, hw - 1.2, h - 2.4)
    d.line(pts + [pts[0]], fill=INK, width=2.5)

    downscale(img, w, h).save(EXPORTS / f"{name}.png")


def soft(img, fn):
    """Dessine fn(D(calque_transparent)) puis composite — ImageDraw ne
    mélange pas les remplis semi-transparents (il remplace l'alpha)."""
    lay = new_canvas(img.width / SS, img.height / SS)
    fn(D(lay))
    img.alpha_composite(lay)


def light_from_topleft(img, w, h, cx, strength=28):
    """Ombrage générique : lumière haut-gauche (§3.4)."""
    def paint(d):
        d.poly([(cx, 0), (cx + w, 0), (cx + w, h / 2), (0, h), (0, 0)],
               fill=(255, 255, 255, strength))
        d.poly([(cx + w / 2, h), (0, h / 2), (0, h)],
               fill=(20, 20, 30, strength))
    soft(img, paint)


def tuft(d, x, y, color, s=1.0):
    d.line([(x, y), (x - 3 * s, y - 8 * s)], fill=color, width=1.6)
    d.line([(x, y), (x, y - 10 * s)], fill=color, width=1.6)
    d.line([(x, y), (x + 3 * s, y - 8 * s)], fill=color, width=1.6)


def flower(d, x, y, color):
    d.ellipse((x - 2.2, y - 2.2, x + 2.2, y + 2.2), fill=color)


# ---------------------------------------------------------------- tuiles


def tile_prairie(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=PRAIRIE_1)
    d.ellipse((20, 60, 110, 150), fill=PRAIRIE_2)
    d.ellipse((120, 140, 210, 230), fill=PRAIRIE_2)
    d.ellipse((100, 30, 200, 110), fill=PRAIRIE_3)
    for x, y in [(52, 170), (70, 185), (150, 120), (168, 132), (104, 200), (128, 90)]:
        tuft(d, x, y, "#6E9440", 1.1)
    for x, y in [(84, 96), (140, 178), (60, 130), (176, 90)]:
        flower(d, x, y, "#E8E4D0")
    light_from_topleft(img, w, h, cx, 22)


def tile_plaine(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=PLAINE_1)
    d.ellipse((30, 80, 140, 190), fill=PLAINE_2)
    d.ellipse((130, 40, 215, 120), fill="#CBBF76")
    for x, y in [(60, 150), (110, 90), (160, 170), (90, 190), (180, 120)]:
        tuft(d, x, y, "#96863E", 1.0)
    light_from_topleft(img, w, h, cx, 18)


def tile_foret(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=FORET_1)
    d.ellipse((30, 90, 200, 230), fill="#5C8A42")

    def tree(x, y, s, foliage):
        d.rrect((x - 3 * s, y - 8 * s, x + 3 * s, y + 4 * s), 1.5, fill=BOIS)
        d.ellipse((x - 16 * s, y - 34 * s, x + 16 * s, y - 2 * s), fill=foliage)
        d.ellipse((x - 16 * s, y - 34 * s, x + 2 * s, y - 18 * s),
                  fill="#82B060")

    tree(70, 170, 1.15, FORET_2)
    tree(135, 195, 1.35, FORET_2)
    tree(160, 120, 0.95, "#7DAA56")
    tree(95, 105, 0.85, "#639744")
    light_from_topleft(img, w, h, cx, 20)


def tile_colline(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=COLLINE_1)
    # pente principale, sommet arrondi
    d.poly([(0, h), (0, 150), (55, 92), (100, 70), (150, 74), (200, 110),
            (cx + w / 2, 170), (cx + w / 2, h)], fill=COLLINE_2)
    d.pieslice((62, 44, 150, 122), 180, 360, fill="#9C8158")
    # lignes de niveau
    for dy, col in [(0, "#7A6240"), (16, "#7A6240"), (32, "#7A6240")]:
        d.arc((30 + dy * 2, 96 + dy, 190 - dy, 230 + dy), 200, 340, fill=col, width=2)
    d.line([(cx - w / 2 + 6, 150), (40, 142), (80, 118), (120, 104)],
           fill="#A5925E", width=2)
    tuft(d, 60, 200, "#77873E", 1.0)
    tuft(d, 170, 195, "#77873E", 1.0)
    light_from_topleft(img, w, h, cx, 16)


def tile_montagne(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=MONTAGNE_1)
    # massif principal
    d.poly([(cx - w / 2, h - 30), (40, 160), (95, 70), (112, 92), (140, 46),
            (172, 96), (cx + w / 2, 150), (cx + w / 2, h - 10), (cx, h)],
           fill=MONTAGNE_2)
    # facettes éclairées (haut-gauche)
    d.poly([(95, 70), (112, 92), (88, 150), (52, 158)], fill=MONTAGNE_1)
    d.poly([(140, 46), (172, 96), (150, 110), (128, 84)], fill="#9A9AA2")
    # neige
    d.poly([(140, 46), (154, 68), (146, 76), (138, 66), (128, 78), (120, 70),
            (128, 58)], fill=NEIGE)
    d.poly([(95, 70), (104, 84), (96, 90), (88, 82), (84, 88), (78, 80), (86, 74)],
           fill=NEIGE)
    # éboulis
    for x, y, r in [(70, 205, 6), (90, 215, 4), (150, 200, 5), (170, 212, 3.5)]:
        d.ellipse((x - r, y - r, x + r, y + r), fill="#7C7C86")
    light_from_topleft(img, w, h, cx, 14)


def tile_desert(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=DESERT_1)
    # dunes (crêtes douces)
    d.ellipse((20, 110, 150, 200), fill=DESERT_2)
    d.ellipse((110, 160, 220, 240), fill="#D8C48C")
    for x, y in [(60, 130), (150, 190), (105, 215)]:
        d.arc((x - 34, y - 8, x + 34, y + 8), 195, 345, fill="#B89B60", width=2.6)
    # cactus discret (flat board-game)
    d.rrect((160, 120, 170, 158), 4, fill="#6E9C4A")
    d.rrect((150, 128, 180, 138), 4, fill="#6E9C4A")
    light_from_topleft(img, w, h, cx, 20)


def tile_eau(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=EAU_1)
    d.ellipse((10, 20, 160, 120), fill="#4A7CAC")
    for y, x0, x1 in [(80, 40, 110), (130, 90, 180), (180, 40, 130)]:
        d.arc((x0, y - 9, x1, y + 9), 195, 345, fill=EAU_2, width=3)
        d.arc((x0 + 18, y + 2, x1 - 10, y + 20), 195, 345, fill="#5E8CB4", width=2.4)
    light_from_topleft(img, w, h, cx, 26)


def tile_ocean(d, img, w, h, cx):
    """Phase 6c : océan profond — teinte plus sombre que la côte (EAU_1),
    vagues rares et courtes (grand large : houle, pas de clapot côtier)."""
    d.poly(hex_points(cx, h / 2, w, h), fill=OCEAN_1)
    d.ellipse((10, 20, 160, 120), fill="#33567F")
    for y, x0, x1 in [(95, 55, 125), (165, 30, 105)]:
        d.arc((x0, y - 8, x1, y + 8), 195, 345, fill=OCEAN_2, width=2.6)
        d.arc((x0 + 20, y + 4, x1 - 12, y + 18), 195, 345, fill="#4A6F97", width=2)
    light_from_topleft(img, w, h, cx, 20)


def tile_ville_sol(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=SOL_TERRE)
    d.ellipse((35, 70, 195, 200), fill=SOL_CHEMIN)
    # place centrale + chemins
    d.ellipse((75, 105, 155, 165), fill="#BDA475")
    d.line([(112, 108), (112, 60)], fill="#BDA475", width=16)
    d.line([(80, 140), (40, 125)], fill="#BDA475", width=13)
    d.line([(146, 140), (186, 128)], fill="#BDA475", width=13)
    d.line([(112, 162), (112, 205)], fill="#BDA475", width=13)
    # pavages discrets
    for x, y, r in [(70, 95, 3), (150, 90, 3), (95, 185, 3), (160, 170, 3), (55, 150, 2.5)]:
        d.ellipse((x - r, y - r, x + r, y + r), fill="#8F7B57")
    light_from_topleft(img, w, h, cx, 16)


# ---------------------------------------------------------------- entités


def render_entity(name, w, h, painter):
    """Dessine base + accent (calque blanc aligné au pixel) en un seul passage."""
    base = new_canvas(w, h)
    accent = new_canvas(w, h)
    painter(D(base), D(accent), w, h)
    downscale(base, w, h).save(EXPORTS / f"{name}.png")
    white = Image.new("RGBA", accent.size, (255, 255, 255, 255))
    accent.paste(white, (0, 0), accent.getchannel("A"))
    downscale(accent, w, h).save(EXPORTS / f"{name}_accent.png")


def shadow(d, cx, y, rx, ry=7):
    d.ellipse((cx - rx, y - ry, cx + rx, y + ry), fill=(0, 0, 0, 60))


def unite_guerrier(db, da, w, h):
    """256×320, massue + bouclier (bouclier = accent), posture trapue."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 52)
    # jambes trapues
    db.rrect((cx - 26, ground - 58, cx - 6, ground), 8, fill="#5E4E3A")
    db.rrect((cx + 6, ground - 58, cx + 26, ground), 8, fill="#5E4E3A")
    db.rrect((cx - 30, ground - 8, cx - 2, ground + 2), 4, fill="#3E342A")
    db.rrect((cx + 2, ground - 8, cx + 30, ground + 2), 4, fill="#3E342A")
    # tunique
    db.poly([(cx - 34, ground - 130), (cx + 34, ground - 130), (cx + 40, ground - 55),
             (cx - 40, ground - 55)], fill=GRIS_NEUTRE)
    db.poly([(cx - 34, ground - 130), (cx - 10, ground - 130), (cx - 22, ground - 55),
             (cx - 40, ground - 55)], fill="#CBC7BE")
    # ceinture
    db.rrect((cx - 38, ground - 80, cx + 38, ground - 70), 3, fill="#6B5230")
    # tête + casque
    db.ellipse((cx - 18, ground - 172, cx + 18, ground - 136), fill="#B99B7E")
    db.pieslice((cx - 20, ground - 178, cx + 20, ground - 142), 180, 360,
                fill=GRIS_ARMURE)
    db.rrect((cx - 20, ground - 162, cx + 20, ground - 156), 2, fill="#7E7E86")
    # bras droit levé (massue)
    db.line([(cx + 26, ground - 118), (cx + 52, ground - 158)], fill=GRIS_NEUTRE, width=13)
    db.line([(cx + 48, ground - 158), (cx + 56, ground - 196)], fill=BOIS, width=12)
    db.ellipse((cx + 42, ground - 222, cx + 74, ground - 190), fill=BOIS)
    db.ellipse((cx + 46, ground - 218, cx + 64, ground - 200), fill=BOIS_CLAIR)
    for x, y in [(50, 200), (58, 188), (46, 186)]:
        db.ellipse((cx + x - 3, ground - y - 3, cx + x + 3, ground - y + 3),
                   fill="#5E4630")
    # bras gauche (bouclier)
    db.line([(cx - 26, ground - 118), (cx - 50, ground - 96)], fill=GRIS_NEUTRE, width=13)
    # bouclier = accent
    shield_box = (cx - 92, ground - 132, cx - 12, ground - 52)
    db.ellipse(shield_box, fill=GRIS_ARMURE, outline=INK, width=3)
    db.ellipse((cx - 68, ground - 108, cx - 36, ground - 76), fill="#7E7E86")
    da.ellipse(shield_box, fill="#FFFFFF")
    da.ellipse((cx - 68, ground - 108, cx - 36, ground - 76), fill="#E0E0E0")


def unite_colon(db, da, w, h):
    """256×320, charrette + bâton (capuche + sac = accent), silhouette distincte."""
    cx, ground = 112, 300
    shadow(db, cx - 8, ground + 4, 46)
    shadow(db, 186, ground + 6, 40)
    # ---- personnage (pousse la charrette, légèrement penché vers la droite)
    db.rrect((cx - 20, ground - 52, cx - 2, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 52, cx + 20, ground), 7, fill="#4E4438")
    # robe longue
    db.poly([(cx - 28, ground - 140), (cx + 26, ground - 140), (cx + 34, ground - 50),
             (cx - 36, ground - 50)], fill="#8E8A80")
    db.poly([(cx - 28, ground - 140), (cx - 6, ground - 140), (cx - 16, ground - 50),
             (cx - 36, ground - 50)], fill="#A5A199")
    # tête + capuche (accent)
    db.ellipse((cx - 14, ground - 176, cx + 14, ground - 148), fill="#B99B7E")
    hood = [(cx - 20, ground - 156), (cx - 18, ground - 186), (cx + 2, ground - 196),
            (cx + 20, ground - 184), (cx + 20, ground - 168), (cx + 6, ground - 176),
            (cx - 6, ground - 172), (cx - 12, ground - 156)]
    db.poly(hood, fill="#6E6A62")
    da.poly(hood, fill="#FFFFFF")
    # bras poussant
    db.line([(cx + 18, ground - 122), (cx + 48, ground - 104)], fill="#8E8A80", width=12)
    # bâton de pèlerin
    db.line([(cx - 34, ground - 190), (cx - 40, ground - 4)], fill=BOIS, width=5)
    db.ellipse((cx - 40, ground - 196, cx - 30, ground - 186), fill=BOIS_CLAIR)
    # sac à l'épaule (accent)
    sack = [(cx - 30, ground - 134), (cx - 8, ground - 128), (cx - 12, ground - 100),
            (cx - 34, ground - 106)]
    db.poly(sack, fill="#9C7A4E")
    db.line([(cx - 22, ground - 132), (cx - 4, ground - 146)], fill="#6B5230", width=4)
    da.poly(sack, fill="#FFFFFF")
    # ---- charrette
    ax, ay = 186, ground - 46
    db.poly([(ax - 52, ay - 30), (ax + 48, ay - 30), (ax + 56, ay - 8),
             (ax - 58, ay - 8)], fill=BOIS)
    db.poly([(ax - 52, ay - 30), (ax - 20, ay - 30), (ax - 26, ay - 8),
             (ax - 58, ay - 8)], fill=BOIS_CLAIR)
    db.line([(ax - 58, ay - 4), (ax + 56, ay - 4)], fill="#5E4630", width=3)
    # manche vers le personnage
    db.line([(ax - 58, ay - 16), (cx + 34, ground - 100)], fill=BOIS, width=7)
    # roue
    db.ellipse((ax + 6, ay - 6, ax + 46, ay + 34), fill="#5E4630")
    db.ellipse((ax + 14, ay + 2, ax + 38, ay + 26), fill="#8A6F4A")
    db.line([(ax + 26, ay + 14), (ax + 26, ay - 2)], fill="#5E4630", width=3)
    db.line([(ax + 26, ay + 14), (ax + 42, ay + 14)], fill="#5E4630", width=3)
    db.line([(ax + 26, ay + 14), (ax + 10, ay + 14)], fill="#5E4630", width=3)
    db.line([(ax + 26, ay + 14), (ax + 26, ay + 30)], fill="#5E4630", width=3)
    # fût/baril dans la charrette (accent)
    baril = (ax - 34, ay - 62, ax + 10, ay - 28)
    db.rrect(baril, 6, fill="#7E6A48")
    db.rrect((ax - 34, ay - 56, ax + 10, ay - 50), 2, fill="#5E4630")
    db.rrect((ax - 34, ay - 42, ax + 10, ay - 36), 2, fill="#5E4630")
    da.rrect(baril, 6, fill="#FFFFFF")


def hut(db, da, x, y, s, wall, roof_col, accent=True, y_top=0):
    """Hutte : murs + toit (toit = accent). (x, y) = centre du sol."""
    w2, h2 = 32 * s, 22 * s + y_top
    db.poly([(x - w2, y), (x - w2, y - h2), (x + w2, y - h2), (x + w2, y)],
            fill=wall)
    roof = [(x - w2 - 8 * s, y - h2), (x, y - h2 - 24 * s), (x + w2 + 8 * s, y - h2)]
    db.poly(roof, fill=roof_col)
    if accent:
        da.poly(roof, fill="#FFFFFF")
    db.rrect((x - 7 * s, y - 14 * s, x + 7 * s, y), 2, fill="#5E4E3A")  # porte


def ville_settlement(db, da, w, h):
    """224×256 : 2-3 huttes groupées (toits = accent) + bannière."""
    shadow(db, 112, 208, 78)
    hut(db, da, 58, 206, 0.85, SABLE, "#8E8A80")
    hut(db, da, 166, 208, 0.9, "#C0B29A", "#7E7A72")
    hut(db, da, 112, 200, 1.2, SABLE, "#A59C92", y_top=6)
    # bannière
    db.line([(112, 130), (112, 52)], fill=BOIS, width=4)
    flag = [(114, 54), (152, 62), (114, 76)]
    db.poly(flag, fill="#8E8A80", outline=INK, width=0)
    da.poly(flag, fill="#FFFFFF")
    db.ellipse((109, 46, 115, 52), fill=OR)


def ville_capitale(db, da, w, h):
    """224×256 : muraille crénelée + donjon + grand drapeau (accent)."""
    shadow(db, 112, 212, 88)
    # muraille
    wall = [(30, 212), (30, 158), (194, 158), (194, 212)]
    db.poly(wall, fill="#B0A390")
    db.poly([(30, 212), (30, 158), (112, 158), (112, 212)], fill="#C2B6A2")
    # créneaux
    for x in range(30, 195, 24):
        db.rrect((x, 146, x + 14, 160), 2, fill="#B0A390")
    for x in (30, 90, 150):
        db.rrect((x, 146, x + 14, 160), 2, fill="#C2B6A2")
        break
    # porte
    db.pieslice((88, 168, 136, 216), 180, 360, fill="#5E4E3A")
    db.rrect((88, 192, 136, 212), 2, fill="#5E4E3A")
    # donjon
    db.rrect((92, 92, 132, 160), 3, fill="#C2B6A2")
    db.poly([(86, 96), (112, 62), (138, 96)], fill="#8E8272")
    da.poly([(86, 96), (112, 62), (138, 96)], fill="#FFFFFF")
    db.rrect((104, 120, 120, 140), 2, fill="#5E4E3A")
    # tours d'angle
    for x in (26, 178):
        db.rrect((x, 120, x + 22, 160), 3, fill="#B0A390")
        db.pieslice((x - 2, 102, x + 24, 128), 180, 360, fill="#8E8272")
        da.pieslice((x - 2, 102, x + 24, 128), 180, 360, fill="#FFFFFF")
    # grand drapeau (accent)
    db.line([(112, 62), (112, 18)], fill=BOIS, width=4)
    flag = [(114, 20), (162, 32), (114, 48)]
    db.poly(flag, fill="#8E8A80", outline=INK, width=0)
    da.poly(flag, fill="#FFFFFF")
    db.ellipse((109, 12, 115, 18), fill=OR)


# ---------------------------------------------------------------- bâtiments (Phase 6, R-66)


def batiment_grenier(db, da, w, h):
    """Grenier : silo à grain sur pilotis, toit = accent."""
    shadow(db, 112, 214, 70)
    for x in (76, 148):
        db.rrect((x - 5, 178, x + 5, 214), 2, fill=BOIS)
    db.rrect((64, 120, 160, 184), 6, fill=SABLE)
    db.rrect((64, 120, 160, 184), 6, outline=INK, width=2.5)
    for y in (136, 156):
        db.line([(68, y), (156, y)], fill="#B39B72", width=3)
    roof = [(56, 124), (112, 84), (168, 124)]
    db.poly(roof, fill="#8E8A80", outline=INK, width=2)
    da.poly(roof, fill="#FFFFFF")
    db.ellipse((104, 138, 120, 154), fill=BOIS_CLAIR, outline=INK, width=2)


def batiment_atelier(db, da, w, h):
    """Atelier : enclume + marteau, tête d'enclume = accent."""
    shadow(db, 112, 214, 70)
    db.rrect((56, 190, 168, 214), 4, fill=BOIS, outline=INK, width=2)
    db.rrect((92, 160, 132, 194), 3, fill="#6E6A62")
    anvil_head = [(64, 130), (160, 130), (150, 162), (74, 162)]
    db.poly(anvil_head, fill=GRIS_ARMURE, outline=INK, width=2)
    db.poly([(160, 130), (186, 138), (160, 146)], fill=GRIS_ARMURE, outline=INK, width=2)
    da.poly(anvil_head, fill="#FFFFFF")
    db.line([(128, 60), (152, 118)], fill=BOIS, width=8)
    db.rrect((120, 46, 168, 66), 5, fill="#6E6A62", outline=INK, width=2)


def batiment_mine_de_fer(db, da, w, h):
    """Mine de fer : entrée de galerie + chariot, pan de montagne = accent."""
    shadow(db, 112, 214, 76)
    db.poly([(40, 214), (40, 120), (112, 66), (184, 120), (184, 214)],
            fill=MONTAGNE_2, outline=INK, width=2.5)
    db.poly([(40, 120), (112, 66), (184, 120)], fill=MONTAGNE_1)
    da.poly([(40, 120), (112, 66), (184, 120)], fill="#FFFFFF")
    db.poly([(84, 214), (84, 158), (140, 158), (140, 214)], fill="#3E342A")
    db.line([(84, 158), (112, 138), (140, 158)], fill=BOIS, width=6)
    db.rrect((96, 182, 128, 214), 3, fill=BOIS, outline=INK, width=2)
    db.ellipse((100, 208, 112, 220), fill="#5E4630")
    db.ellipse((112, 208, 124, 220), fill="#5E4630")


def batiment_comptoir_commercial(db, da, w, h):
    """Comptoir : échoppe à auvent, auvent = accent."""
    shadow(db, 112, 214, 74)
    db.rrect((64, 128, 160, 214), 4, fill=SABLE, outline=INK, width=2.5)
    awning = [(52, 132), (172, 132), (160, 96), (64, 96)]
    db.poly(awning, fill="#8E8A80", outline=INK, width=2)
    da.poly(awning, fill="#FFFFFF")
    for x in (80, 112, 144):
        db.line([(x, 134), (x, 168)], fill=BOIS, width=4)
    db.ellipse((92, 178, 108, 194), fill=OR, outline=INK, width=2)
    db.rrect((126, 176, 150, 196), 3, fill=BOIS_CLAIR, outline=INK, width=2)


def batiment_port(db, da, w, h):
    """Port : quai + mât + coque, voile = accent."""
    shadow(db, 112, 214, 74)
    db.poly([(48, 196), (176, 196), (160, 218), (64, 218)], fill=BOIS, outline=INK, width=2)
    db.line([(76, 196), (76, 120)], fill=BOIS, width=6)
    db.line([(76, 126), (140, 150)], fill=BOIS, width=5)
    sail = [(112, 190), (112, 120), (156, 176)]
    db.poly(sail, fill="#EDE7DA", outline=INK, width=2)
    da.poly(sail, fill="#FFFFFF")
    db.poly([(60, 170), (150, 170), (140, 194), (70, 194)], fill=BOIS_CLAIR, outline=INK, width=2)


def batiment_tribunal(db, da, w, h):
    """Tribunal : façade à fronton + colonnes, fronton = accent."""
    shadow(db, 112, 214, 78)
    db.rrect((48, 180, 176, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    pediment = [(44, 128), (112, 84), (180, 128), (168, 140), (56, 140)]
    db.poly(pediment, fill="#B0A390", outline=INK, width=2)
    da.poly([(44, 128), (112, 84), (180, 128), (168, 140), (56, 140)], fill="#FFFFFF")
    for x in (66, 94, 122, 150):
        db.rrect((x - 7, 144, x + 7, 182), 3, fill=SABLE, outline=INK, width=2)
    db.rrect((56, 150, 168, 156), 2, fill="#A5987F")



def unite_archer(db, da, w, h):
    """256x320, arc bande + carquois (carquois = accent), silhouette elancee."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 46)
    # jambes fines
    db.rrect((cx - 20, ground - 60, cx - 4, ground), 7, fill="#5E4E3A")
    db.rrect((cx + 4, ground - 60, cx + 20, ground), 7, fill="#5E4E3A")
    # tunique courte verte
    db.poly([(cx - 28, ground - 122), (cx + 28, ground - 122), (cx + 34, ground - 58),
             (cx - 34, ground - 58)], fill=FORET_1)
    db.poly([(cx - 28, ground - 122), (cx - 8, ground - 122), (cx - 18, ground - 58),
             (cx - 34, ground - 58)], fill=FORET_2)
    db.rrect((cx - 32, ground - 76, cx + 32, ground - 68), 3, fill="#6B5230")
    # tete + capuche de chasse
    db.ellipse((cx - 16, ground - 158, cx + 16, ground - 126), fill="#B99B7E")
    db.pieslice((cx - 18, ground - 164, cx + 18, ground - 132), 180, 360, fill=FORET_2)
    # bras tendant l'arc (gauche) + arc
    db.line([(cx - 20, ground - 112), (cx - 54, ground - 128)], fill=FORET_1, width=12)
    bow = [(cx - 62, ground - 186), (cx - 74, ground - 150), (cx - 62, ground - 112)]
    db.line(bow, fill=BOIS, width=6)
    db.line([(cx - 62, ground - 186), (cx - 48, ground - 148), (cx - 62, ground - 112)],
            fill=SABLE, width=2)
    db.line([(cx - 70, ground - 148), (cx - 40, ground - 148)], fill=BOIS, width=4)
    # bras tirant la corde (droite)
    db.line([(cx + 20, ground - 112), (cx + 6, ground - 140)], fill=FORET_1, width=12)
    # carquois = accent
    quiver = (cx + 28, ground - 158, cx + 52, ground - 100)
    db.rrect(quiver, 6, fill="#7E6A48", outline=INK, width=2)
    for dx, dy in ((-6, 0), (2, -8), (10, -4)):
        db.line([(cx + 36 + dx, ground - 156 + dy), (cx + 36 + dx, ground - 176 + dy)],
                fill=SABLE, width=3)
    da.rrect(quiver, 6, fill="#FFFFFF")


def unite_cavalier(db, da, w, h):
    """256x320, cheval au pas + cavalier (caparacon = accent), silhouette large."""
    cx, ground = 128, 296
    shadow(db, cx, ground + 6, 84)
    # ---- cheval (corps)
    body = [(48, ground - 118), (200, ground - 118), (212, ground - 78),
            (192, ground - 58), (60, ground - 58), (40, ground - 80)]
    db.poly(body, fill="#8A5A34")
    db.poly([(48, ground - 118), (130, ground - 118), (124, ground - 58),
             (60, ground - 58), (40, ground - 80)], fill="#A06A40")
    # jambes du cheval
    for x in (56, 92, 148, 182):
        db.rrect((x, ground - 62, x + 14, ground), 5, fill="#6E4626")
    # tete + encolure
    db.poly([(184, ground - 128), (226, ground - 100), (232, ground - 74),
             (198, ground - 86)], fill="#8A5A34")
    db.ellipse((214, ground - 112, 240, ground - 88), fill="#8A5A34")
    db.ellipse((224, ground - 106, 232, ground - 98), fill="#2B2620")
    mane = [(178, ground - 132), (196, ground - 116), (188, ground - 88), (172, ground - 104)]
    db.poly(mane, fill="#4E3822")
    # queue
    db.line([(44, ground - 100), (24, ground - 66)], fill="#4E3822", width=7)
    # ---- cavalier
    rider = 92
    db.rrect((rider + 8, ground - 96, rider + 24, ground - 58), 6, fill="#5E4E3A")
    db.poly([(rider - 14, ground - 190), (rider + 22, ground - 190),
             (rider + 30, ground - 120), (rider - 22, ground - 120)], fill=GRIS_ARMURE)
    db.poly([(rider - 14, ground - 190), (rider + 2, ground - 190),
             (rider - 8, ground - 120), (rider - 22, ground - 120)], fill="#B4B4BA")
    db.ellipse((rider - 8, ground - 222, rider + 22, ground - 192), fill="#B99B7E")
    db.pieslice((rider - 10, ground - 228, rider + 24, ground - 196), 180, 360,
                fill=GRIS_ARMURE)
    db.line([(rider + 24, ground - 178), (rider + 58, ground - 160)], fill=GRIS_ARMURE, width=11)
    db.line([(rider + 56, ground - 164), (rider + 58, ground - 232)], fill=BOIS, width=5)
    db.poly([(rider + 52, ground - 232), (rider + 84, ground - 226), (rider + 56, ground - 214)],
            fill=ROUGE_JOUEUR)
    # caparacon sur le flanc = accent
    capar = [(96, ground - 116), (176, ground - 116), (188, ground - 76),
             (160, ground - 58), (100, ground - 58), (84, ground - 84)]
    db.poly(capar, fill=GRIS_NEUTRE, outline=INK, width=2)
    da.poly(capar, fill="#FFFFFF")


def unite_legion(db, da, w, h):
    """256x320, legionnaire romain : glaive + scutum rectangulaire (scutum =
    accent), casque a crete."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 52)
    # jambes en caligae
    db.rrect((cx - 24, ground - 58, cx - 6, ground), 7, fill="#B99B7E")
    db.rrect((cx + 6, ground - 58, cx + 24, ground), 7, fill="#B99B7E")
    # tunique rouge + segmentata
    db.poly([(cx - 30, ground - 128), (cx + 30, ground - 128), (cx + 36, ground - 54),
             (cx - 36, ground - 54)], fill=ROUGE_JOUEUR)
    db.poly([(cx - 30, ground - 128), (cx - 10, ground - 128), (cx - 20, ground - 54),
             (cx - 36, ground - 54)], fill="#C24545")
    for y in (ground - 118, ground - 104, ground - 90):
        db.rrect((cx - 28, y, cx + 28, y + 8), 2, fill=GRIS_ARMURE)
    db.rrect((cx - 32, ground - 84, cx + 32, ground - 76), 3, fill="#6B5230")
    # tete + casque a crete
    db.ellipse((cx - 16, ground - 164, cx + 16, ground - 132), fill="#B99B7E")
    db.pieslice((cx - 19, ground - 170, cx + 19, ground - 138), 180, 360, fill=GRIS_ARMURE)
    crest = [(cx - 3, ground - 172), (cx + 3, ground - 172), (cx + 5, ground - 196),
             (cx - 5, ground - 196)]
    db.poly(crest, fill=ROUGE_JOUEUR, outline=INK, width=1)
    # bras droit : glaive leve
    db.line([(cx + 24, ground - 116), (cx + 48, ground - 150)], fill="#C24545", width=12)
    db.line([(cx + 44, ground - 152), (cx + 52, ground - 196)], fill=GRIS_ARMURE, width=6)
    db.rrect((cx + 42, ground - 156, cx + 56, ground - 148), 2, fill=OR)
    # bras gauche (vers le scutum)
    db.line([(cx - 24, ground - 116), (cx - 44, ground - 100)], fill="#C24545", width=12)
    # scutum rectangulaire = accent
    scut = (cx - 84, ground - 138, cx - 20, ground - 44)
    db.rrect(scut, 10, fill=GRIS_ARMURE, outline=INK, width=3)
    db.rrect((cx - 76, ground - 130, cx - 28, ground - 52), 8, outline=OR, width=3)
    db.ellipse((cx - 58, ground - 104, cx - 46, ground - 92), fill=OR)
# ------------------------------------------------- barbares (Phase 7d, R-95)
# Accent dédié côté rendu : gris-brun (ni rouge ni bleu) — les calques accent
# restent blancs conformément à la SPEC-ART (teinte appliquée au rendu).


def unite_barbare_guerrier(db, da, w, h):
    """256×320 : guerrier barbare — tunique de peaux, casque à cornes, massue
    cloutée ; bande d'épaules + ceinture d'os = accent."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 52)
    # jambes trapues
    db.rrect((cx - 26, ground - 58, cx - 6, ground), 8, fill="#4E4438")
    db.rrect((cx + 6, ground - 58, cx + 26, ground), 8, fill="#4E4438")
    db.rrect((cx - 30, ground - 8, cx - 2, ground + 2), 4, fill="#3E342A")
    db.rrect((cx + 2, ground - 8, cx + 30, ground + 2), 4, fill="#3E342A")
    # tunique de peaux (brun fauve) — plus rugueuse que le guerrier régulier
    db.poly([(cx - 36, ground - 132), (cx + 36, ground - 132), (cx + 42, ground - 54),
             (cx - 42, ground - 54)], fill="#7A5C3A")
    db.poly([(cx - 36, ground - 132), (cx - 8, ground - 132), (cx - 20, ground - 54),
             (cx - 42, ground - 54)], fill="#8A6F4A")
    # ceinture d'os = accent
    db.rrect((cx - 38, ground - 82, cx + 38, ground - 72), 3, fill="#5E4630")
    da.rrect((cx - 34, ground - 80, cx + 34, ground - 74), 2, fill="#FFFFFF")
    # tête + casque à cornes
    db.ellipse((cx - 18, ground - 172, cx + 18, ground - 136), fill="#B99B7E")
    db.pieslice((cx - 20, ground - 178, cx + 20, ground - 142), 180, 360, fill="#6E655C")
    db.line([(cx - 22, ground - 164), (cx - 38, ground - 178)], fill="#C8B08A", width=7)
    db.line([(cx + 22, ground - 164), (cx + 38, ground - 178)], fill="#C8B08A", width=7)
    # bras droit levé (massue cloutée)
    db.line([(cx + 26, ground - 118), (cx + 52, ground - 158)], fill="#7A5C3A", width=13)
    db.line([(cx + 48, ground - 158), (cx + 56, ground - 196)], fill=BOIS, width=12)
    db.ellipse((cx + 42, ground - 224, cx + 74, ground - 190), fill="#6E655C")
    for x, y in [(50, 210), (60, 196), (46, 194)]:
        db.ellipse((cx + x - 3, ground - y - 3, cx + x + 3, ground - y + 3), fill="#4E4438")
    # bras gauche + bande d'épaules = accent
    db.line([(cx - 26, ground - 118), (cx - 50, ground - 96)], fill="#7A5C3A", width=13)
    da.poly([(cx - 34, ground - 132), (cx + 34, ground - 132), (cx + 30, ground - 118),
             (cx - 30, ground - 118)], fill="#FFFFFF")


def unite_barbare_archer(db, da, w, h):
    """256×320 : archer barbare — plumes, arc de chasse ; coiffe + carquois = accent."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 46)
    db.rrect((cx - 20, ground - 60, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 60, cx + 20, ground), 7, fill="#4E4438")
    # tunique de peaux courte
    db.poly([(cx - 28, ground - 122), (cx + 28, ground - 122), (cx + 34, ground - 58),
             (cx - 34, ground - 58)], fill="#7A5C3A")
    db.poly([(cx - 28, ground - 122), (cx - 8, ground - 122), (cx - 18, ground - 58),
             (cx - 34, ground - 58)], fill="#8A6F4A")
    db.rrect((cx - 32, ground - 76, cx + 32, ground - 68), 3, fill="#5E4630")
    # tête + coiffe à plumes = accent
    db.ellipse((cx - 16, ground - 158, cx + 16, ground - 126), fill="#B99B7E")
    hood = [(cx - 20, ground - 156), (cx - 18, ground - 186), (cx + 2, ground - 196),
            (cx + 20, ground - 184), (cx + 20, ground - 168), (cx + 6, ground - 176),
            (cx - 6, ground - 172), (cx - 12, ground - 156)]
    db.poly(hood, fill="#6E655C")
    da.poly(hood, fill="#FFFFFF")
    for dx, dy in ((-10, -6), (2, -10), (14, -4)):
        db.line([(cx + dx, ground - 176 + dy), (cx + dx, ground - 196 + dy)],
                fill="#C8B08A", width=4)
    # bras tendant l'arc + arc de chasse
    db.line([(cx - 20, ground - 112), (cx - 54, ground - 128)], fill="#7A5C3A", width=12)
    bow = [(cx - 62, ground - 186), (cx - 74, ground - 150), (cx - 62, ground - 112)]
    db.line(bow, fill=BOIS, width=6)
    db.line([(cx - 62, ground - 186), (cx - 48, ground - 148), (cx - 62, ground - 112)],
            fill=SABLE, width=2)
    # bras tirant la corde
    db.line([(cx + 20, ground - 112), (cx + 6, ground - 140)], fill="#7A5C3A", width=12)
    # carquois = accent
    quiver = (cx + 28, ground - 158, cx + 52, ground - 100)
    db.rrect(quiver, 6, fill="#7E6A48", outline=INK, width=2)
    da.rrect(quiver, 6, fill="#FFFFFF")


def village_barbare(db, da, w, h):
    """224×256 : camp barbare — tente de peaux + feu de camp + pavois ;
    toit de la tente = accent (gris-brun au rendu)."""
    shadow(db, 112, 210, 80)
    # tente principale (peaux tendues sur piquets)
    db.poly([(112, 84), (44, 210), (180, 210)], fill="#8A6F4A")
    db.poly([(112, 84), (44, 210), (112, 210)], fill="#9C7F5A")
    db.poly([(112, 84), (44, 210), (180, 210)], outline=INK, width=2.5)
    da.poly([(112, 84), (44, 210), (112, 210)], fill="#FFFFFF")
    # ouverture sombre
    db.poly([(100, 160), (124, 160), (132, 210), (92, 210)], fill="#3E342A")
    # piquets
    db.line([(112, 84), (112, 66)], fill=BOIS, width=4)
    db.ellipse((108, 58, 116, 66), fill="#C8B08A")
    # feu de camp
    db.ellipse((168, 200, 204, 214), fill="#5E4630")
    db.poly([(186, 160), (172, 196), (186, 188), (200, 196)], fill="#C25B3A")
    db.poly([(186, 170), (178, 194), (186, 188), (194, 194)], fill="#D9A93F")
    # pavois planté (butin)
    db.line([(40, 210), (40, 140)], fill=BOIS, width=5)
    db.rrect((28, 142, 52, 172), 3, fill="#6E655C", outline=INK, width=2)


def hutte(db, da, w, h):
    """224×256 : hutte bonus — cabane de branchages au toit doré (accent) ;
    ouverte par la première unité qui entre sur sa case (R-98)."""
    shadow(db, 112, 210, 66)
    # murs de pisé / branchages
    db.rrect((70, 146, 154, 210), 4, fill="#9C8A6A", outline=INK, width=2.5)
    db.line([(76, 162), (148, 162)], fill="#8A7A5A", width=2)
    db.line([(76, 186), (148, 186)], fill="#8A7A5A", width=2)
    # toit de chaume = accent (doré au rendu)
    roof = [(58, 150), (112, 96), (166, 150)]
    db.poly(roof, fill="#A3835A", outline=INK, width=2.5)
    da.poly(roof, fill="#FFFFFF")
    # porte + lueur du trésor
    db.rrect((100, 172, 124, 210), 3, fill="#5E4630")
    db.ellipse((106, 184, 118, 196), fill=OR)
    # herbes folles au pied
    db.line([(58, 210), (52, 198)], fill=FORET_2, width=3)
    db.line([(166, 210), (172, 198)], fill=FORET_2, width=3)


def batiment_bibliotheque(db, da, w, h):

    """Bibliotheque : facade a arc + rangees de livres (livres = accent)."""
    shadow(db, 112, 214, 76)
    db.rrect((52, 120, 172, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    db.poly([(46, 124), (112, 82), (178, 124)], fill="#B0A390", outline=INK, width=2)
    da.poly([(46, 124), (112, 82), (178, 124)], fill="#FFFFFF")
    # porte voutee
    db.pieslice((92, 158, 132, 198), 180, 360, fill="#5E4E3A")
    db.rrect((92, 178, 132, 214), 2, fill="#5E4E3A")
    # etageres avec livres = accent
    for x0, y0 in ((60, 132), (150, 132)):
        db.rrect((x0, y0, x0 + 36, y0 + 34), 2, fill="#4E3822", outline=INK, width=2)
        books = []
        for i in range(4):
            bx = x0 + 3 + i * 8
            bh = 24 if i % 2 == 0 else 28
            books.append((bx, y0 + 32 - bh, bx + 7, y0 + 32))
        for r in books:
            db.rrect(r, 1, fill=FORET_1)
        for r in books:
            da.rrect(r, 1, fill="#FFFFFF")


def batiment_caserne(db, da, w, h):
    """Caserne : tente militaire + armures (etendard/porte = accent)."""
    shadow(db, 112, 214, 78)
    # tente
    tent = [(44, 214), (112, 110), (180, 214)]
    db.poly(tent, fill="#8E8A80", outline=INK, width=2.5)
    db.poly([(44, 214), (112, 110), (112, 214)], fill="#A5A199")
    door = [(96, 214), (112, 158), (128, 214)]
    db.poly(door, fill="#3E342A")
    da.poly(door, fill="#FFFFFF")
    # piquet + fanion
    db.line([(112, 110), (112, 84)], fill=BOIS, width=4)
    flag = [(114, 86), (146, 94), (114, 106)]
    db.poly(flag, fill="#8E8A80", outline=INK, width=1)
    da.poly(flag, fill="#FFFFFF")
    # armure posee (casque + bouclier)
    db.pieslice((152, 168, 184, 200), 180, 360, fill=GRIS_ARMURE, outline=INK, width=2)
    db.ellipse((160, 190, 176, 206), fill=GRIS_ARMURE, outline=INK, width=2)
    # lance appuyee
    db.line([(44, 214), (72, 122)], fill=BOIS, width=4)
    db.poly([(72, 122), (66, 106), (78, 106)], fill=GRIS_ARMURE, outline=INK, width=1)



# ------------------------------------------------- Phase 7e — unités terrestres
# Gabarits existants (corps du guerrier/archer/legion, gabarits bâtiments) :
# chaque peintre reprend la grammaire visuelle « flat board-game » (SPEC-ART §4).

def unite_piquier(db, da, w, h):
    """256x320, piquier anti-cavalerie : longue pique + rondache (rondache = accent)."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 24, ground - 60, cx - 6, ground), 7, fill="#5E4E3A")
    db.rrect((cx + 6, ground - 60, cx + 24, ground), 7, fill="#5E4E3A")
    db.poly([(cx - 30, ground - 128), (cx + 30, ground - 128), (cx + 36, ground - 54),
             (cx - 36, ground - 54)], fill="#5B6E8C")
    db.poly([(cx - 30, ground - 128), (cx - 10, ground - 128), (cx - 20, ground - 54),
             (cx - 36, ground - 54)], fill="#6E82A0")
    db.ellipse((cx - 18, ground - 164, cx + 16, ground - 132), fill="#B99B7E")
    db.pieslice((cx - 20, ground - 170, cx + 18, ground - 138), 180, 360, fill=GRIS_ARMURE)
    db.line([(cx + 30, ground - 96), (cx + 84, ground - 230)], fill=BOIS, width=7)
    db.poly([(cx + 80, ground - 238), (cx + 90, ground - 226), (cx + 78, ground - 222)],
            fill=GRIS_ARMURE, outline=INK, width=1)
    db.line([(cx - 24, ground - 116), (cx - 44, ground - 98)], fill="#5B6E8C", width=12)
    buckler = (cx - 86, ground - 136, cx - 22, ground - 66)
    db.ellipse(buckler, fill=GRIS_ARMURE, outline=INK, width=3)
    db.ellipse((cx - 66, ground - 116, cx - 42, ground - 88), outline=OR, width=3)
    da.ellipse(buckler, fill="#FFFFFF")


def unite_catapulte(db, da, w, h):
    """256x320, machine de siège : châssis + flèche de lancer (flèche = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 92)
    for x in (56, 172):
        db.ellipse((x, ground - 52, x + 48, ground - 4), fill="#6E4626", outline=INK, width=2.5)
        db.ellipse((x + 14, ground - 38, x + 34, ground - 18), fill="#8A5A34")
    db.rrect((52, ground - 88, 200, ground - 52), 5, fill=BOIS, outline=INK, width=2.5)
    for x in (70, 100, 130, 160):
        db.line([(x, ground - 84), (x, ground - 56)], fill=BOIS_CLAIR, width=4)
    db.rrect((96, ground - 148, 160, ground - 84), 4, fill=BOIS_CLAIR, outline=INK, width=2)
    db.line([(128, ground - 144), (128, ground - 228)], fill=BOIS, width=10)
    db.ellipse((110, ground - 252, 146, ground - 222), fill=GRIS_ARMURE, outline=INK, width=2)
    da.line([(128, ground - 144), (128, ground - 228)], fill="#FFFFFF", width=10)
    da.ellipse((110, ground - 252, 146, ground - 222), fill="#FFFFFF")
    db.line([(66, ground - 140), (128, ground - 232), (190, ground - 140)], fill=SABLE, width=3)
    db.ellipse((78, ground - 104, 102, ground - 84), fill=MONTAGNE_1, outline=INK, width=1)
    db.ellipse((152, ground - 100, 172, ground - 84), fill=MONTAGNE_1, outline=INK, width=1)


def unite_chevalier(db, da, w, h):
    """256x320, cavalier lourd : destrier caparaçonné (barding = accent)."""
    cx, ground = 128, 296
    shadow(db, cx, ground + 6, 84)
    body = [(48, ground - 118), (200, ground - 118), (212, ground - 78),
            (192, ground - 58), (60, ground - 58), (40, ground - 80)]
    db.poly(body, fill="#6E5A78")
    db.poly([(48, ground - 118), (130, ground - 118), (124, ground - 58),
             (60, ground - 58), (40, ground - 80)], fill="#84709A")
    for x in (56, 92, 148, 182):
        db.rrect((x, ground - 62, x + 14, ground), 5, fill="#4E3E58")
    db.poly([(184, ground - 128), (226, ground - 100), (232, ground - 74),
             (198, ground - 86)], fill="#6E5A78")
    db.ellipse((214, ground - 112, 240, ground - 88), fill="#6E5A78")
    db.ellipse((224, ground - 106, 232, ground - 98), fill="#2B2620")
    db.line([(44, ground - 100), (24, ground - 66)], fill="#4E3822", width=7)
    rider = 92
    db.rrect((rider + 8, ground - 96, rider + 24, ground - 58), 6, fill="#4E3E58")
    db.poly([(rider - 14, ground - 190), (rider + 22, ground - 190),
             (rider + 30, ground - 120), (rider - 22, ground - 120)], fill=GRIS_ARMURE)
    db.ellipse((rider - 8, ground - 222, rider + 22, ground - 192), fill="#B99B7E")
    db.pieslice((rider - 10, ground - 228, rider + 24, ground - 196), 180, 360,
                fill=GRIS_ARMURE)
    db.line([(rider + 24, ground - 176), (rider + 92, ground - 150)], fill=BOIS, width=6)
    db.poly([(rider + 88, ground - 152), (rider + 106, ground - 146), (rider + 90, ground - 138)],
            fill=GRIS_ARMURE, outline=INK, width=1)
    capar = [(96, ground - 116), (176, ground - 116), (188, ground - 76),
             (160, ground - 58), (100, ground - 58), (84, ground - 84)]
    db.poly(capar, fill=GRIS_NEUTRE, outline=INK, width=2)
    da.poly(capar, fill="#FFFFFF")


def unite_fusilier(db, da, w, h):
    """256x320, fusilier de ligne : bicorne + fusil à baïonnette (fusil = accent)."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 48)
    db.rrect((cx - 22, ground - 58, cx - 6, ground), 6, fill="#3E342A")
    db.rrect((cx + 6, ground - 58, cx + 22, ground), 6, fill="#3E342A")
    db.poly([(cx - 28, ground - 126), (cx + 28, ground - 126), (cx + 34, ground - 54),
             (cx - 34, ground - 54)], fill="#3C4A5C")
    db.poly([(cx - 28, ground - 126), (cx - 8, ground - 126), (cx - 18, ground - 54),
             (cx - 34, ground - 54)], fill="#4C5E74")
    db.rrect((cx - 30, ground - 82, cx + 30, ground - 74), 3, fill="#FFFFFF")
    db.ellipse((cx - 16, ground - 160, cx + 16, ground - 130), fill="#B99B7E")
    db.poly([(cx - 30, ground - 152), (cx + 30, ground - 152), (cx + 22, ground - 172),
             (cx - 22, ground - 172)], fill="#2B2620", outline=INK, width=1)
    db.rrect((cx - 30, ground - 158, cx + 30, ground - 152), 2, fill=OR)
    db.line([(cx - 52, ground - 70), (cx + 58, ground - 150)], fill=BOIS, width=7)
    db.line([(cx + 40, ground - 138), (cx + 76, ground - 164)], fill=GRIS_ARMURE, width=4)
    da.line([(cx - 52, ground - 70), (cx + 58, ground - 150)], fill="#FFFFFF", width=7)
    da.line([(cx + 40, ground - 138), (cx + 76, ground - 164)], fill="#FFFFFF", width=4)
    db.rrect((cx - 46, ground - 100, cx - 20, ground - 72), 4, fill="#7E6A48", outline=INK, width=1.5)


def unite_canon(db, da, w, h):
    """256x320, canon de siège : tube de bronze sur affût (tube = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 90)
    for x in (48, 160):
        db.ellipse((x, ground - 60, x + 52, ground - 8), fill="#6E4626", outline=INK, width=2.5)
        for a in range(6):
            ang = a * 3.1416 / 3
            db.line([(x + 26, ground - 34),
                     (x + 26 + 22 * math.cos(ang), ground - 34 + 22 * math.sin(ang))],
                    fill="#8A5A34", width=3)
    db.poly([(64, ground - 92), (192, ground - 92), (176, ground - 48), (80, ground - 48)],
            fill=BOIS_CLAIR, outline=INK, width=2)
    db.rrect((40, ground - 130, 196, ground - 96), 12, fill=OR, outline=INK, width=2.5)
    da.rrect((40, ground - 130, 196, ground - 96), 12, fill="#FFFFFF")
    db.rrect((36, ground - 128, 56, ground - 98), 6, fill=OR_SOMBRE, outline=INK, width=2)


def unite_infanterie_moderne(db, da, w, h):
    """256x320, fantassin moderne : casque + gilet (gilet = accent)."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 48)
    db.rrect((cx - 22, ground - 56, cx - 6, ground), 6, fill="#3E4A3A")
    db.rrect((cx + 6, ground - 56, cx + 22, ground), 6, fill="#3E4A3A")
    db.rrect((cx - 26, ground - 122, cx + 26, ground - 56), 8, fill="#55624E")
    gilet = (cx - 22, ground - 116, cx + 22, ground - 74)
    db.rrect(gilet, 5, fill="#4A563E", outline=INK, width=1.5)
    for x in (cx - 12, cx + 2):
        db.rrect((x, ground - 112, x + 10, ground - 94), 2, fill="#6B5230")
    da.rrect(gilet, 5, fill="#FFFFFF")
    db.ellipse((cx - 16, ground - 158, cx + 16, ground - 128), fill="#B99B7E")
    db.pieslice((cx - 18, ground - 164, cx + 18, ground - 136), 180, 360, fill="#55624E")
    db.line([(cx + 24, ground - 96), (cx + 74, ground - 118)], fill="#3E342A", width=7)
    db.rrect((cx + 58, ground - 126, cx + 84, ground - 112), 2, fill="#2B2620")
    db.rrect((cx + 28, ground - 92, cx + 40, ground - 78), 2, fill="#2B2620")


def unite_char_d_assaut(db, da, w, h):
    """256x320, char lourd : chenilles + tourelle (tourelle/canon = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 104)
    db.rrect((24, ground - 66, 232, ground - 14), 22, fill="#3E342A", outline=INK, width=2.5)
    for x in range(40, 216, 24):
        db.rrect((x, ground - 60, x + 12, ground - 20), 3, fill="#5E544A")
    db.rrect((40, ground - 110, 216, ground - 60), 8, fill="#55624E", outline=INK, width=2.5)
    db.rrect((40, ground - 110, 130, ground - 60), 8, fill="#63705A")
    db.rrect((96, ground - 150, 180, ground - 104), 10, fill="#55624E", outline=INK, width=2.5)
    db.rrect((172, ground - 138, 244, ground - 124), 4, fill="#3E342A", outline=INK, width=1.5)
    da.rrect((96, ground - 150, 180, ground - 104), 10, fill="#FFFFFF")
    da.rrect((172, ground - 138, 244, ground - 124), 4, fill="#FFFFFF")
    db.ellipse((150, ground - 162, 166, ground - 148), fill="#3E4A3A")


def unite_artillerie(db, da, w, h):
    """256x320, artillerie moderne : long tube sur châssis motorisé (tube = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 104)
    db.rrect((36, ground - 74, 212, ground - 36), 8, fill="#55624E", outline=INK, width=2.5)
    for x in (44, 96, 148):
        db.ellipse((x, ground - 60, x + 40, ground - 20), fill="#3E342A", outline=INK, width=2)
        db.ellipse((x + 10, ground - 50, x + 30, ground - 30), fill="#5E544A")
    db.poly([(88, ground - 138), (150, ground - 138), (150, ground - 78), (88, ground - 78)],
            fill="#63705A", outline=INK, width=2)
    db.line([(120, ground - 100), (218, ground - 216)], fill="#3E342A", width=12)
    da.line([(120, ground - 100), (218, ground - 216)], fill="#FFFFFF", width=12)
    db.ellipse((206, ground - 226, 226, ground - 206), fill="#3E342A")


# ------------------------------------------------- Phase 7f — culture (R-113..R-116)

def unite_artiste(db, da, w, h):
    """256x320, Artiste illustre (R-114) : palette et pinceau, béret (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#C4A4D6", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#B18CE0")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    # béret (accent)
    beret = [(cx - 22, ground - 182), (cx + 22, ground - 182), (cx + 14, ground - 200),
             (cx - 14, ground - 200)]
    db.poly(beret, fill="#7A5A96", outline=INK, width=1.5)
    da.poly(beret, fill="#FFFFFF")
    # palette + taches de peinture (accent)
    db.ellipse((cx + 26, ground - 108, cx + 84, ground - 72), fill="#A8794F", outline=INK, width=2)
    for tx, ty in ((cx + 42, ground - 96), (cx + 62, ground - 88), (cx + 54, ground - 78)):
        db.ellipse((tx, ty, tx + 10, ty + 10), fill="#E8D44A")
        da.ellipse((tx, ty, tx + 10, ty + 10), fill="#FFFFFF")
    # pinceau levé
    db.line([(cx + 44, ground - 78), (cx + 58, ground - 160)], fill=BOIS, width=5)
    db.poly([(cx + 54, ground - 160), (cx + 66, ground - 172), (cx + 62, ground - 156)],
            fill="#C25B5B", outline=INK, width=1)
    # bras tenant la palette
    db.line([(cx + 18, ground - 120), (cx + 44, ground - 96)], fill="#C4A4D6", width=10)


def unite_penseur(db, da, w, h):
    """256x320, Penseur illustre (R-114) : gros livre ouvert, laurier (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#7F9EC7", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#93B0D6")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    # couronne de laurier (accent)
    for a in range(-70, 71, 35):
        lx = cx + 20 * math.cos(math.radians(a + 90)) * 0.9
        ly = ground - 186 + 8 * math.sin(math.radians(a))
        db.ellipse((lx - 4, ly - 4, lx + 4, ly + 4), fill=FORET_2, outline=INK, width=1)
        da.ellipse((lx - 4, ly - 4, lx + 4, ly + 4), fill="#FFFFFF")
    # gros livre ouvert (tranche = accent)
    db.poly([(cx - 52, ground - 96), (cx - 6, ground - 110), (cx + 40, ground - 96),
             (cx + 40, ground - 56), (cx - 6, ground - 68), (cx - 52, ground - 56)],
            fill="#8A5A3A", outline=INK, width=2)
    db.poly([(cx - 6, ground - 110), (cx + 40, ground - 96), (cx + 40, ground - 56),
             (cx - 6, ground - 68)], fill="#A3714A", outline=INK, width=1.5)
    db.line([(cx - 6, ground - 110), (cx - 6, ground - 68)], fill="#6B452A", width=2.5)
    db.line([(cx - 42, ground - 84), (cx - 14, ground - 92)], fill="#E3D19A", width=3)
    db.line([(cx + 4, ground - 90), (cx + 30, ground - 82)], fill="#E3D19A", width=3)
    da.line([(cx - 42, ground - 84), (cx - 14, ground - 92)], fill="#FFFFFF", width=3)
    da.line([(cx + 4, ground - 90), (cx + 30, ground - 82)], fill="#FFFFFF", width=3)
    # bras soutenant le livre
    db.line([(cx + 22, ground - 118), (cx + 34, ground - 100)], fill="#7F9EC7", width=10)


def batiment_nations_unies(db, da, w, h):
    """Nations Unies (R-116) : assemblée sous drapeaux, globe terrestre (accent)."""
    shadow(db, 112, 214, 84)
    db.rrect((40, 130, 184, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    db.rrect((40, 122, 184, 138), 2, fill="#B0A390", outline=INK, width=2)
    for x in (58, 112, 166):
        db.rrect((x - 8, 146, x + 8, 214), 2, fill=SABLE, outline=INK, width=1.5)
    # drapeaux de part et d'autre
    for x, flip in ((58, -1), (166, 1)):
        db.line([(x, 60), (x, 130)], fill="#6B5230", width=3)
        db.poly([(x, 62), (x + 22 * flip, 70), (x, 78)], fill="#7FA9CC", outline=INK, width=1.5)
        da.poly([(x, 62), (x + 22 * flip, 70), (x, 78)], fill="#FFFFFF")
    # globe terrestre (accent)
    db.ellipse((92, 76, 132, 116), fill=EAU_1, outline=INK, width=2)
    da.ellipse((92, 76, 132, 116), fill="#FFFFFF")
    db.arc((96, 82, 128, 110), 300, 60, fill=EAU_2, width=2)
    db.ellipse((104, 84, 116, 96), fill="#8FA84E")
    db.rrect((96, 168, 128, 214), 2, fill="#5E4E3A")


# ------------------------------------------------- Phase 7e — bâtiments

def batiment_palais(db, da, w, h):
    """Palais : pavillon à fronton + couronne (couronne = accent)."""
    shadow(db, 112, 214, 80)
    db.rrect((48, 132, 176, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    db.poly([(40, 136), (112, 88), (184, 136)], fill="#B0A390", outline=INK, width=2)
    for x in (68, 112, 156):
        db.rrect((x - 8, 144, x + 8, 214), 2, fill=SABLE, outline=INK, width=1.5)
    db.rrect((100, 170, 124, 214), 2, fill="#5E4E3A")
    crown = [(92, 116), (100, 96), (110, 112), (120, 92), (130, 112), (140, 96), (148, 116)]
    db.poly(crown, fill=OR, outline=INK, width=1.5)
    da.poly(crown, fill="#FFFFFF")


def batiment_temple(db, da, w, h):
    """Temple : sanctuaire à fronton + brasier sacré (flamme = accent)."""
    shadow(db, 112, 214, 76)
    db.rrect((60, 150, 164, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    db.poly([(52, 154), (112, 108), (172, 154)], fill="#B0A390", outline=INK, width=2)
    for x in (78, 112, 146):
        db.rrect((x - 6, 162, x + 6, 214), 2, fill=SABLE, outline=INK, width=1.5)
    db.poly([(100, 144), (124, 144), (118, 162), (106, 162)], fill=GRIS_ARMURE, outline=INK, width=1.5)
    flame = [(112, 92), (126, 118), (120, 136), (104, 136), (98, 118)]
    db.poly(flame, fill=ROUGE_JOUEUR, outline=INK, width=1)
    da.poly(flame, fill="#FFFFFF")


def batiment_marche(db, da, w, h):
    """Marché : étal couvert + pièces de monnaie (pièces = accent)."""
    shadow(db, 112, 214, 78)
    awning = [(44, 128), (180, 128), (164, 96), (60, 96)]
    db.poly(awning, fill="#B0603C", outline=INK, width=2)
    for x in range(64, 164, 20):
        db.poly([(x, 128), (x + 10, 128), (x + 8, 110), (x - 2, 110)], fill="#EDE7DA")
    db.rrect((60, 128, 164, 214), 3, fill=SABLE, outline=INK, width=2.5)
    db.rrect((76, 168, 148, 178), 2, fill=BOIS, outline=INK, width=1.5)
    for x in (86, 108, 128):
        db.ellipse((x, 152, x + 18, 170), fill=OR, outline=INK, width=1.5)
        da.ellipse((x, 152, x + 18, 170), fill="#FFFFFF")
    db.rrect((100, 182, 124, 206), 2, fill=BOIS_CLAIR, outline=INK, width=1.5)


def batiment_remparts(db, da, w, h):
    """Remparts : muraille crénelée (crénage = accent)."""
    shadow(db, 112, 214, 88)
    db.rrect((36, 128, 188, 214), 2, fill="#8D8D95", outline=INK, width=2.5)
    db.rrect((36, 128, 188, 146), 2, fill="#9A9AA0", outline=INK, width=2)
    for x in (40, 72, 104, 136, 168):
        db.rrect((x, 106, x + 20, 132), 2, fill="#9A9AA0", outline=INK, width=2)
        da.rrect((x, 106, x + 20, 132), 2, fill="#FFFFFF")
    for y in (168, 188):
        db.line([(40, y), (184, y)], fill="#7E7E86", width=3)


def batiment_aqueduc(db, da, w, h):
    """Aqueduc : arche + canal d'eau (l'eau = accent)."""
    shadow(db, 112, 214, 84)
    db.rrect((40, 118, 184, 214), 2, fill="#C2B6A2", outline=INK, width=2.5)
    db.rrect((40, 108, 184, 126), 2, fill="#B0A390", outline=INK, width=2)
    db.pieslice((64, 148, 160, 244), 180, 360, fill="#1D242B")
    for x in (52, 168):
        db.pieslice((x - 10, 178, x + 10, 218), 180, 360, fill="#8D8D95")
    water = (48, 112, 176, 122)
    db.rrect(water, 3, fill=EAU_2)
    da.rrect(water, 3, fill="#FFFFFF")


def batiment_banque(db, da, w, h):
    """Banque : colonnade + fronton gravé d'une pièce (pièce = accent)."""
    shadow(db, 112, 214, 80)
    db.rrect((44, 150, 180, 214), 3, fill="#B0A390", outline=INK, width=2.5)
    db.rrect((44, 138, 180, 152), 2, fill="#C2B6A2", outline=INK, width=2)
    db.poly([(38, 142), (112, 100), (186, 142)], fill="#8E8A80", outline=INK, width=2)
    coin = (100, 108, 124, 132)
    db.ellipse(coin, fill=OR, outline=INK, width=1.5)
    da.ellipse(coin, fill="#FFFFFF")
    for x in (62, 90, 134, 162):
        db.rrect((x - 7, 158, x + 7, 214), 2, fill=SABLE, outline=INK, width=1.5)
    db.rrect((56, 162, 168, 168), 2, fill="#A5987F")


def batiment_cathedrale(db, da, w, h):
    """Cathédrale : nef gothique + rosace (rosace = accent)."""
    shadow(db, 112, 214, 82)
    db.rrect((56, 118, 168, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    db.poly([(48, 122), (112, 66), (176, 122)], fill="#B0A390", outline=INK, width=2)
    db.rrect((104, 60, 120, 100), 2, fill="#8E8A80", outline=INK, width=2)
    db.rrect((94, 70, 130, 78), 2, fill="#8E8A80")
    rose = (94, 128, 130, 164)
    db.ellipse(rose, fill="#5B6E8C", outline=INK, width=2)
    da.ellipse(rose, fill="#FFFFFF")
    db.ellipse((106, 140, 118, 152), fill="#C2B6A2")
    db.pieslice((92, 176, 132, 216), 180, 360, fill="#5E4E3A")
    db.rrect((92, 196, 132, 214), 2, fill="#5E4E3A")
    for x in (64, 156):
        db.rrect((x - 4, 140, x + 4, 168), 1, fill="#5B6E8C")


def batiment_universite(db, da, w, h):
    """Université : bâtiment à dôme + livre ouvert (livre = accent)."""
    shadow(db, 112, 214, 82)
    db.rrect((48, 148, 176, 214), 3, fill="#C2B6A2", outline=INK, width=2.5)
    dome = (76, 92, 148, 152)
    db.pieslice(dome, 180, 360, fill="#B0A390", outline=INK, width=2)
    db.rrect((108, 74, 116, 96), 1, fill=OR)
    db.ellipse((104, 70, 120, 84), fill=OR, outline=INK, width=1)
    for x in (66, 96, 128, 158):
        db.rrect((x - 6, 166, x + 6, 214), 2, fill=SABLE, outline=INK, width=1.5)
    book = [(72, 196), (112, 184), (152, 196), (112, 208)]
    db.poly(book, fill="#EDE7DA", outline=INK, width=1.5)
    db.line([(112, 184), (112, 208)], fill="#A5987F", width=2)
    da.poly(book, fill="#FFFFFF")


def batiment_usine(db, da, w, h):
    """Usine : hangar à sheds + cheminée fumante (engrenage = accent)."""
    shadow(db, 112, 214, 84)
    db.rrect((44, 148, 180, 214), 2, fill="#8A5A34", outline=INK, width=2.5)
    for x in (60, 92, 124, 156):
        db.poly([(x, 150), (x + 24, 134), (x + 24, 150)], fill="#6E4626", outline=INK, width=1.5)
    db.rrect((88, 74, 110, 150), 3, fill="#6E6A62", outline=INK, width=2)
    db.ellipse((84, 66, 100, 80), fill="#8D8D95")
    db.ellipse((96, 56, 110, 68), fill="#9A9AA0")
    gear = (132, 108, 168, 144)
    db.ellipse(gear, fill=GRIS_ARMURE, outline=INK, width=2)
    for a in range(8):
        ang = a * 3.1416 / 4
        db.ellipse((150 + 26 * math.cos(ang) - 5, 126 + 26 * math.sin(ang) - 5,
                    150 + 26 * math.cos(ang) + 5, 126 + 26 * math.sin(ang) + 5), fill=GRIS_ARMURE)
    da.ellipse(gear, fill="#FFFFFF")


def batiment_sdi(db, da, w, h):
    """Défense SDI : radar parabolique (coupelle = accent)."""
    shadow(db, 112, 214, 74)
    db.rrect((70, 186, 154, 214), 3, fill="#6E6A62", outline=INK, width=2)
    db.line([(112, 190), (112, 130)], fill="#6E6A62", width=6)
    dish = [(60, 140), (164, 96), (176, 120), (72, 164)]
    db.poly(dish, fill="#9A9AA0", outline=INK, width=2.5)
    da.poly(dish, fill="#FFFFFF")
    db.line([(112, 130), (150, 118)], fill="#3E342A", width=3)
    db.ellipse((146, 112, 158, 124), fill=ROUGE_JOUEUR, outline=INK, width=1)

# ---------------------------------------------------------------- icônes


def render_icon(name, painter):
    img = new_canvas(64, 64)
    painter(D(img))
    downscale(img, 64, 64).save(EXPORTS / f"{name}.png")


def icone_or(d):
    d.ellipse((8, 8, 56, 56), fill=OR, outline=INK, width=3)
    d.ellipse((14, 14, 50, 50), outline=OR_SOMBRE, width=3)
    d.line([(32, 20), (32, 44)], fill=OR_SOMBRE, width=4)
    d.line([(24, 26), (40, 26)], fill=OR_SOMBRE, width=4)


def icone_commerce(d):
    """Commerce (Phase 6) : balance de marchand — répartition or/science."""
    d.line([(32, 10), (32, 44)], fill=BOIS, width=4)
    d.line([(14, 20), (50, 20)], fill=BOIS, width=4)
    for x in (14, 50):
        d.line([(x, 20), (x - 8, 36)], fill=BOIS, width=2.5)
        d.line([(x, 20), (x + 8, 36)], fill=BOIS, width=2.5)
        d.arc((x - 10, 28, x + 10, 44), 0, 180, fill=COMMERCE, width=3.5)
        d.ellipse((x - 5, 38, x + 5, 46), fill=OR, outline=INK, width=1.5)
    d.rrect((22, 44, 42, 52), 3, fill=BOIS_CLAIR, outline=INK, width=2)


def icone_science(d):
    d.poly([(26, 8), (38, 8), (38, 26), (52, 50), (12, 50), (26, 26)], fill=SCIENCE,
           outline=INK, width=2.5)
    d.poly([(20, 38), (44, 38), (52, 50), (12, 50)], fill="#4E8398")
    d.line([(24, 10), (40, 10)], fill=INK, width=4)
    d.ellipse((28, 40, 36, 48), fill="#D8ECF2")


def icone_nourriture(d):
    d.line([(32, 56), (32, 16)], fill="#6E8438", width=4)
    for i, y in enumerate(range(18, 44, 8)):
        s = 1 if i % 2 == 0 else -1
        d.ellipse((32 + (s * 2) - 7, y, 32 + (s * 2) + 7, y + 12),
                  fill=NOURRITURE, outline=INK, width=2)
    d.poly([(32, 4), (38, 14), (26, 14)], fill=NOURRITURE, outline=INK, width=2)


def icone_production(d):
    d.rrect((8, 28, 42, 44), 5, fill=PRODUCTION, outline=INK, width=2.5)
    d.line([(36, 30), (52, 14)], fill=BOIS, width=7)
    d.ellipse((48, 8, 60, 20), fill="#8A8A92", outline=INK, width=2)
    d.line([(16, 44), (16, 54)], fill=INK, width=3)
    d.line([(34, 44), (34, 54)], fill=INK, width=3)


def icone_pv(d):
    d.poly([(32, 56), (10, 34), (10, 20), (20, 12), (32, 20), (44, 12), (54, 20),
            (54, 34)], fill=PV, outline=INK, width=2.5)
    d.ellipse((16, 20, 30, 32), fill="#D98C8C")


def icone_pm(d):
    d.poly([(36, 4), (16, 34), (29, 34), (24, 60), (48, 28), (34, 28)], fill=PM,
           outline=INK, width=2.5)


def icone_fin_tour(d):
    d.line([(18, 6), (46, 6)], fill=INK, width=5)
    d.line([(18, 58), (46, 58)], fill=INK, width=5)
    d.poly([(21, 9), (43, 9), (32, 30)], fill=OR)
    d.poly([(32, 34), (21, 55), (43, 55)], fill="#E8C46A")
    d.ellipse((29, 28, 35, 36), fill="#8FB4CC", outline=INK, width=2)


def icone_reseau(d):
    for i, r in enumerate([10, 19, 28]):
        d.arc((32 - r, 26 - r, 32 + r, 26 + r), 315, 45, fill=SCIENCE, width=6)
    d.ellipse((26, 26, 38, 38), fill=SCIENCE, outline=INK, width=2.5)
    d.line([(18, 44), (46, 44)], fill=INK, width=3)
    d.line([(26, 51), (38, 51)], fill=INK, width=3)


def icone_culture(d):
    """Culture (Phase 7f, R-113) : lyre violette — jalons culturels."""
    d.line([(16, 12), (16, 40)], fill="#7A5A96", width=4)
    d.line([(48, 12), (48, 40)], fill="#7A5A96", width=4)
    d.arc((16, 14, 48, 46), 190, 350, fill="#9C6FD6", width=4)
    d.arc((22, 18, 42, 42), 200, 340, fill="#9C6FD6", width=3)
    d.ellipse((12, 40, 24, 52), fill="#7A5A96", outline=INK, width=2)
    d.ellipse((40, 40, 52, 52), fill="#7A5A96", outline=INK, width=2)
    d.ellipse((26, 20, 38, 32), fill="#C4A4D6", outline=INK, width=2)


# ---------------------------------------------------------------- ressources (Phase 7c, R-91)
# Icônes 64×64 posées sur les cases (nommage res_<id> aligné sur resources.json).


def _shine(d, x, y, r=3, color="#FFFFFF"):
    d.ellipse((x - r, y - r, x + r, y + r), fill=color)


def res_aluminium(d):
    """Lingots d'aluminium : deux barreaux clairs empilés."""
    for x, y in [(10, 36), (20, 36), (16, 24)]:
        d.poly([(x, y), (x + 28, y), (x + 24, y + 11), (x - 4, y + 11)],
               fill="#C9CCD4", outline=INK, width=2)
    d.poly([(10, 36), (38, 36), (36, 40), (8, 40)], fill="#9A9AA0")
    _shine(d, 24, 39, 2.2)


def res_baleine(d):
    """Baleine : corps arqué, queue, jet d'eau."""
    d.ellipse((8, 30, 50, 52), fill="#5E8CB4", outline=INK, width=2)
    d.poly([(46, 32), (60, 24), (58, 40), (50, 44)], fill="#5E8CB4", outline=INK, width=2)
    d.ellipse((12, 34, 30, 44), fill="#7FA9CC")
    d.ellipse((16, 38, 20, 42), fill=INK)
    d.arc((26, 8, 40, 22), 200, 340, fill=EAU_2, width=3)
    d.arc((30, 14, 42, 26), 200, 340, fill=EAU_2, width=2)


def res_betail(d):
    """Bétail : vache blanche à taches brunes."""
    d.ellipse((8, 24, 46, 48), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((16, 30, 30, 42), fill="#8A5A34")
    d.ellipse((10, 50, 18, 60), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((34, 50, 42, 60), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((38, 14, 58, 32), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((48, 24, 58, 32), fill="#E3B8A0")
    d.ellipse((44, 18, 48, 22), fill=INK)
    d.ellipse((38, 8, 52, 16), fill="#8A5A34")


def res_ble(d):
    """Blé : trois épis dorés."""
    for x, lean in [(22, -4), (32, 0), (42, 4)]:
        d.line([(x, 58), (x + lean, 14)], fill="#B8892B", width=3)
        for i, y in enumerate(range(14, 46, 8)):
            s = 1 if i % 2 == 0 else -1
            d.ellipse((x + lean + s * 3 - 4, y, x + lean + s * 3 + 4, y + 9),
                      fill=OR, outline="#8A641C", width=1.5)
    d.poly([(32, 6), (37, 14), (27, 14)], fill=OR, outline="#8A641C", width=1.5)


def res_boeufs(d):
    """Bœufs : tête de taureaux avec cornes."""
    d.ellipse((16, 16, 48, 52), fill="#8A5A34", outline=INK, width=2)
    d.poly([(14, 20), (4, 8), (20, 12)], fill="#F2F0E8", outline=INK, width=2)
    d.poly([(50, 20), (60, 8), (44, 12)], fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((24, 36, 40, 52), fill="#C8A176")
    d.ellipse((28, 40, 31, 43), fill=INK)
    d.ellipse((33, 40, 36, 43), fill=INK)
    d.ellipse((30, 46, 34, 50), fill=INK)


def res_caoutchouc(d):
    """Caoutchouc : pneu noir à jante claire."""
    d.ellipse((8, 14, 56, 62), fill="#3A3A40", outline=INK, width=2)
    d.ellipse((20, 26, 44, 50), fill="#8A8A92")
    d.ellipse((27, 33, 37, 43), fill="#3A3A40")
    for a in range(0, 360, 45):
        d.line([(32 + 22 * math.cos(math.radians(a)), 38 + 22 * math.sin(math.radians(a))),
                (32 + 26 * math.cos(math.radians(a)), 38 + 26 * math.sin(math.radians(a)))],
               fill="#5A5A62", width=3)


def res_charbon(d):
    """Charbon : tas de houille noire aux facettes grises."""
    for x, y, s in [(10, 38, 1.0), (32, 42, 0.9), (22, 24, 0.8)]:
        pts = [(x, y + 14 * s), (x + 6 * s, y), (x + 16 * s, y + 2 * s),
               (x + 20 * s, y + 12 * s), (x + 10 * s, y + 16 * s)]
        d.poly(pts, fill="#2E2E34", outline=INK, width=2)
        d.poly([(x + 6 * s, y), (x + 12 * s, y + 5 * s), (x + 6 * s, y + 9 * s)],
               fill="#4A4A52")


def res_chene(d):
    """Chêne : branches de feuilles lobées + glands."""
    for x, y, flip in [(16, 22, 1), (34, 14, 1), (30, 34, -1)]:
        pts = [(x, y)]
        for i in range(6):
            s = 1 if i % 2 == 0 else -1
            pts.append((x + 5 + i * 4 * flip, y + s * 6))
        pts.append((x + 28 * flip, y))
        d.poly(pts, fill=FORET_2, outline="#33582A", width=1.5)
    for x, y in [(20, 44), (34, 48)]:
        d.ellipse((x, y, x + 8, y + 12), fill="#B98A4E", outline=INK, width=1.5)
        d.rrect((x - 1, y - 4, x + 9, y + 2), 2, fill="#6B5230")


def res_encens(d):
    """Encens : brûle-parfum doré + volutes."""
    d.poly([(22, 56), (42, 56), (38, 46), (26, 46)], fill=BOIS, outline=INK, width=1.5)
    d.pieslice((16, 30, 48, 50), 180, 360, fill=OR, outline=INK, width=2)
    d.ellipse((16, 38, 48, 46), fill="#8A641C")
    for i, (dx, dy) in enumerate([(-6, 0), (2, -4), (8, 2)]):
        d.arc((30 + dx, 8 + dy, 40 + dx, 22 + dy), 120, 330, fill="#B8B4AC", width=3)


def res_epices(d):
    """Épices : deux pots (paprika, curcuma) avec bouchons."""
    for x, fill, lid in [(10, "#C24545", "#6B5230"), (34, "#D9A93F", "#5E4E3A")]:
        d.rrect((x, 24, x + 20, 58), 4, fill=fill, outline=INK, width=2)
        d.rrect((x + 3, 16, x + 17, 26), 3, fill=lid, outline=INK, width=2)
        d.line([(x + 4, 36), (x + 16, 36)], fill="#F2F0E8", width=2)


def res_fer(d):
    """Fer : minerai gris métallique + éclat."""
    for x, y, s in [(10, 34, 1.0), (30, 40, 0.85), (20, 20, 0.7)]:
        pts = [(x, y + 15 * s), (x + 5 * s, y + 4 * s), (x + 15 * s, y),
               (x + 22 * s, y + 8 * s), (x + 16 * s, y + 17 * s)]
        d.poly(pts, fill="#6E6E78", outline=INK, width=2)
        d.poly([(x + 5 * s, y + 4 * s), (x + 11 * s, y + 8 * s), (x + 5 * s, y + 12 * s)],
               fill="#9A9AA2")
    _shine(d, 26, 24, 2)


def res_gemmes(d):
    """Gemmes : deux pierres facettées (cyan, améthyste)."""
    for x, fill, light in [(6, "#58B6C9", "#A8DEE8"), (34, "#9C6FD6", "#CBADEF")]:
        d.poly([(x, 22), (x + 12, 12), (x + 24, 22), (x + 12, 52)],
               fill=fill, outline=INK, width=2)
        d.poly([(x, 22), (x + 12, 30), (x + 24, 22)], fill=light, outline=INK, width=1.2)
        d.line([(x + 12, 12), (x + 12, 30)], fill=INK, width=1.2)


def res_gibier(d):
    """Gibier : cuissot pendue (viande + os)."""
    d.ellipse((16, 22, 50, 52), fill="#8A4A34", outline=INK, width=2)
    d.ellipse((22, 30, 36, 44), fill="#A86046")
    d.rrect((40, 8, 48, 30), 5, fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((36, 4, 46, 14), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((42, 4, 52, 14), fill="#F2F0E8", outline=INK, width=2)


def res_or(d):
    """Or : pépites brillantes."""
    for x, y, s in [(10, 34, 1.0), (30, 40, 0.9), (20, 20, 0.75)]:
        pts = [(x, y + 14 * s), (x + 5 * s, y + 3 * s), (x + 16 * s, y),
               (x + 22 * s, y + 9 * s), (x + 14 * s, y + 16 * s)]
        d.poly(pts, fill=OR, outline="#8A641C", width=2)
        d.poly([(x + 5 * s, y + 3 * s), (x + 11 * s, y + 6 * s), (x + 5 * s, y + 10 * s)],
               fill="#F0D070")
    _shine(d, 30, 22, 2.4)


def res_marbre(d):
    """Marbre : bloc blanc veiné."""
    d.rrect((12, 14, 52, 58), 3, fill="#F2F2F0", outline=INK, width=2)
    d.line([(18, 22), (30, 32), (24, 44)], fill="#C9C4BC", width=2.4)
    d.line([(36, 18), (44, 28), (40, 40), (46, 52)], fill="#C9C4BC", width=2)
    d.rrect((12, 14, 52, 22), 3, fill="#FFFFFF")


def res_petrole(d):
    """Pétrole : derrick sombre + goutte noire."""
    d.poly([(32, 4), (14, 58), (22, 58), (32, 22), (42, 58), (50, 58)],
           fill="#4E4438", outline=INK, width=1.5)
    d.line([(20, 44), (44, 44)], fill="#4E4438", width=3)
    d.line([(24, 30), (40, 30)], fill="#4E4438", width=3)
    d.ellipse((44, 40, 58, 56), fill="#26262C", outline=INK, width=2)
    d.ellipse((48, 44, 53, 49), fill="#4A4A52")


def res_poisson(d):
    """Poisson : corps bleu, nageoire, œil."""
    d.ellipse((6, 24, 46, 48), fill="#7FA9CC", outline=INK, width=2)
    d.poly([(42, 28), (58, 18), (58, 52), (42, 44)], fill="#7FA9CC", outline=INK, width=2)
    d.ellipse((14, 30, 28, 40), fill="#A8C6DE")
    d.ellipse((16, 33, 21, 38), fill=INK)
    d.arc((20, 22, 34, 34), 200, 330, fill="#5E8CB4", width=2.4)


def res_soie(d):
    """Soie : rouleau d'étoffe violet."
    """
    d.rrect((8, 26, 50, 50), 6, fill="#9C6FD6", outline=INK, width=2)
    d.ellipse((8, 26, 24, 50), fill="#8A5AC4", outline=INK, width=2)
    d.ellipse((12, 31, 20, 45), fill="#C6A8EC")
    d.poly([(50, 30), (60, 26), (58, 40), (50, 46)], fill="#B18CE0", outline=INK, width=1.5)


def res_soufre(d):
    """Soufre : cristaux jaunes anguleux."""
    for x, y, s in [(12, 30, 1.0), (30, 38, 0.8), (24, 16, 0.6)]:
        d.poly([(x, y + 20 * s), (x + 6 * s, y + 4 * s), (x + 16 * s, y),
                (x + 20 * s, y + 14 * s), (x + 10 * s, y + 22 * s)],
               fill="#E8D44A", outline="#8A7A1C", width=2)
        d.poly([(x + 6 * s, y + 4 * s), (x + 12 * s, y + 8 * s), (x + 6 * s, y + 13 * s)],
               fill="#F5EC9A")


def res_teinture(d):
    """Teinture : chaudron de teint violette + tissu."""
    d.pieslice((12, 26, 46, 58), 180, 360, fill="#6B4A78", outline=INK, width=2)
    d.ellipse((12, 34, 46, 42), fill="#8E4FA8", outline=INK, width=2)
    d.rrect((40, 12, 56, 32), 2, fill="#E3D19A", outline=INK, width=1.5)
    d.poly([(44, 30), (52, 30), (50, 40), (46, 40)], fill="#B18CE0")
    d.rrect((18, 50, 40, 58), 3, fill="#5E4E3A")


def res_uranium(d):
    """Uranium : pastille verte rayonnante (trèfle)."""
    d.ellipse((8, 14, 56, 62), fill="#7CD65C", outline=INK, width=2.5)
    d.ellipse((13, 19, 51, 57), outline="#4E8A38", width=2)
    for a in (90, 210, 330):
        d.pieslice((22, 28, 42, 48), a - 30, a + 30, fill="#2E4A22")
    d.ellipse((29, 35, 35, 41), fill="#2E4A22")


def res_vin(d):
    """Vin : grappe de raisin + feuille."""
    d.line([(32, 6), (32, 16)], fill="#6B5230", width=3)
    d.poly([(32, 8), (46, 4), (44, 16)], fill=FORET_2, outline="#33582A", width=1.5)
    for x, y in [(20, 24), (32, 22), (44, 24), (14, 36), (26, 36), (38, 36), (50, 36),
                 (20, 48), (32, 48), (44, 48), (32, 58)]:
        d.ellipse((x - 6, y - 6, x + 6, y + 6), fill="#8E4FA8", outline=INK, width=1.5)
    d.ellipse((24, 18, 30, 24), fill="#B18CE0")


def res_inconnue(d):
    """Ressource inconnue (R-92, D1 révisée) : marqueur « ? » sur stèle —
    la présence d'une ressource est visible, pas son identité."""
    d.ellipse((12, 48, 52, 60), fill="#8A8A92", outline=INK, width=2)   # socle
    d.rrect((20, 6, 44, 52), 7, fill="#B8B4AC", outline=INK, width=2)   # stèle
    d.rrect((23, 9, 41, 49), 6, fill="#C9C4BC")
    # « ? » doré : arc, fût, point
    d.arc((25, 14, 39, 32), 130, 410, fill=OR, width=4)
    d.line([(32, 28), (32, 36)], fill=OR, width=4)
    d.ellipse((28, 39, 36, 47), fill=OR, outline="#8A641C", width=1.5)
    _shine(d, 25, 12, 2)


# ---------------------------------------------------------------- génération


def main():
    EXPORTS.mkdir(exist_ok=True)

    tiles = {
        "tile_prairie": tile_prairie,
        "tile_plaine": tile_plaine,
        "tile_foret": tile_foret,
        "tile_colline": tile_colline,
        "tile_montagne": tile_montagne,
        "tile_desert": tile_desert,
        "tile_eau": tile_eau,
        "tile_ocean": tile_ocean,
        "tile_ville_sol": tile_ville_sol,
    }
    entities = {
        "unite_guerrier": (256, 320, unite_guerrier),
        "unite_colon": (256, 320, unite_colon),
        "ville_settlement": (224, 256, ville_settlement),
        "ville_capitale": (224, 256, ville_capitale),
        "batiment_grenier": (224, 256, batiment_grenier),
        "batiment_atelier": (224, 256, batiment_atelier),
        "batiment_mine_de_fer": (224, 256, batiment_mine_de_fer),
        "batiment_comptoir_commercial": (224, 256, batiment_comptoir_commercial),
        "batiment_port": (224, 256, batiment_port),
        "batiment_tribunal": (224, 256, batiment_tribunal),
        # Phase 7a - technologies (R-86)
        "unite_archer": (256, 320, unite_archer),
        "unite_cavalier": (256, 320, unite_cavalier),
        "unite_legion": (256, 320, unite_legion),
        "batiment_bibliotheque": (224, 256, batiment_bibliotheque),
        "batiment_caserne": (224, 256, batiment_caserne),
        # Phase 7d - barbares & huttes (R-95..R-98)
        "unite_barbare_guerrier": (256, 320, unite_barbare_guerrier),
        "unite_barbare_archer": (256, 320, unite_barbare_archer),
        "village_barbare": (224, 256, village_barbare),
        "hutte": (224, 256, hutte),
        # Phase 7e — unités terrestres complémentaires (Appendice A)
        "unite_piquier": (256, 320, unite_piquier),
        "unite_catapulte": (256, 320, unite_catapulte),
        "unite_chevalier": (256, 320, unite_chevalier),
        "unite_fusilier": (256, 320, unite_fusilier),
        "unite_canon": (256, 320, unite_canon),
        "unite_infanterie_moderne": (256, 320, unite_infanterie_moderne),
        "unite_char_d_assaut": (256, 320, unite_char_d_assaut),
        "unite_artillerie": (256, 320, unite_artillerie),
        # Phase 7e — nouveaux bâtiments (emblèmes)
        "batiment_palais": (224, 256, batiment_palais),
        "batiment_temple": (224, 256, batiment_temple),
        "batiment_marche": (224, 256, batiment_marche),
        "batiment_remparts": (224, 256, batiment_remparts),
        "batiment_aqueduc": (224, 256, batiment_aqueduc),
        "batiment_banque": (224, 256, batiment_banque),
        "batiment_cathedrale": (224, 256, batiment_cathedrale),
        "batiment_universite": (224, 256, batiment_universite),
        "batiment_usine": (224, 256, batiment_usine),
        "batiment_sdi": (224, 256, batiment_sdi),
        # Phase 7f — culture (R-113..R-116) : GP de culture + ONU.
        "unite_artiste": (256, 320, unite_artiste),
        "unite_penseur": (256, 320, unite_penseur),
        "batiment_nations_unies": (224, 256, batiment_nations_unies),
    }
    icons = {
        "icone_or": icone_or,
        "icone_commerce": icone_commerce,
        "icone_science": icone_science,
        "icone_nourriture": icone_nourriture,
        "icone_production": icone_production,
        "icone_pv": icone_pv,
        "icone_pm": icone_pm,
        "icone_fin_tour": icone_fin_tour,
        "icone_reseau": icone_reseau,
        "icone_culture": icone_culture,
    }
    # Phase 7c (R-91) : ressources — nommage res_<id> aligné sur resources.json.
    resources = {
        "res_aluminium": res_aluminium,
        "res_baleine": res_baleine,
        "res_betail": res_betail,
        "res_ble": res_ble,
        "res_boeufs": res_boeufs,
        "res_caoutchouc": res_caoutchouc,
        "res_charbon": res_charbon,
        "res_chene": res_chene,
        "res_encens": res_encens,
        "res_epices": res_epices,
        "res_fer": res_fer,
        "res_gemmes": res_gemmes,
        "res_gibier": res_gibier,
        "res_or": res_or,
        "res_marbre": res_marbre,
        "res_petrole": res_petrole,
        "res_poisson": res_poisson,
        "res_soie": res_soie,
        "res_soufre": res_soufre,
        "res_teinture": res_teinture,
        "res_uranium": res_uranium,
        "res_vin": res_vin,
        # R-92 (D1 révisée) : marqueur « ressource inconnue » — diffusion de
        # l'état filtré quand l'identité est masquée (jamais dans resources.json).
        "res_inconnue": res_inconnue,
    }

    for name, painter in tiles.items():
        render_tile(name, painter)
    for name, (w, h, painter) in entities.items():
        render_entity(name, w, h, painter)
    for name, painter in icons.items():
        render_icon(name, painter)
    for name, painter in resources.items():
        render_icon(name, painter)

    write_palette()
    write_licenses(len(tiles), len(entities), len(icons), len(resources))
    print(f"OK — {len(tiles)} tuiles, {len(entities)*2} fichiers entités, "
          f"{len(icons)} icônes, {len(resources)} ressources → {EXPORTS}")


def write_palette():
    lines = [
        "# palette.txt — couleurs figées (SPEC-ART §4)",
        f"contour_ui        {INK}",
        f"prairie_1         {PRAIRIE_1}",
        f"prairie_2         {PRAIRIE_2}",
        f"prairie_3         {PRAIRIE_3}",
        f"plaine_1          {PLAINE_1}",
        f"plaine_2          {PLAINE_2}",
        f"foret_1           {FORET_1}",
        f"foret_2           {FORET_2}",
        f"colline_1         {COLLINE_1}",
        f"colline_2         {COLLINE_2}",
        f"montagne_1        {MONTAGNE_1}",
        f"montagne_2        {MONTAGNE_2}",
        f"neige             {NEIGE}",
        f"desert_1          {DESERT_1}",
        f"desert_2          {DESERT_2}",
        f"commerce          {COMMERCE}",
        f"eau_1             {EAU_1}",
        f"eau_2             {EAU_2}",
        f"sol_chemin        {SOL_CHEMIN}",
        f"sol_terre         {SOL_TERRE}",
        f"or                {OR}",
        f"joueur_1_rouge    {ROUGE_JOUEUR}  (référence — accents livrés blancs)",
        f"joueur_2_bleu     {BLEU_JOUEUR}  (référence — accents livrés blancs)",
    ]
    (ROOT / "palette.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_licenses(n_tiles, n_entities, n_icons, n_resources):
    txt = f"""# LICENSES.md

Tous les fichiers de `exports/` sont générés **procéduralement** par
`tools/generate.py` (dessin vectoriel Pillow, antialiasing supersampling x4).
Aucune ressource tierce, aucune police, aucun texte incorporé.

| Fichiers | Source | Licence |
|---|---|---|
| {n_tiles} tuiles `tile_*.png` | Généré par tools/generate.py | Licence projet |
| {n_entities} entités `unite_*`/`ville_*` (+ `_accent`) | Généré par tools/generate.py | Licence projet |
| {n_icons} icônes `icone_*.png` | Généré par tools/generate.py | Licence projet |
| {n_resources} ressources `res_*.png` (Phase 7c, R-91) | Généré par tools/generate.py | Licence projet |

Annexe palette : voir `palette.txt` (hex figés).

Régénérer après modification : `python tools/generate.py`.
Dernière génération : {date.today().isoformat()}
"""
    (ROOT / "LICENSES.md").write_text(txt, encoding="utf-8")


# ---------------------------------------------------------------- vérification

EXPECTED = {f"tile_{n}.png": (224, 256) for n in
            ["prairie", "plaine", "foret", "colline", "montagne", "eau", "ville_sol"]}
for n in ["guerrier", "colon"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
for n in ["settlement", "capitale"]:
    EXPECTED[f"ville_{n}.png"] = (224, 256)
    EXPECTED[f"ville_{n}_accent.png"] = (224, 256)
# Phase 7d (R-95..R-98) : barbares, village barbare et hutte.
for n in ["barbare_guerrier", "barbare_archer"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
for n in ["village_barbare", "hutte"]:
    EXPECTED[f"{n}.png"] = (224, 256)
    EXPECTED[f"{n}_accent.png"] = (224, 256)
for n in ["grenier", "atelier", "mine_de_fer", "comptoir_commercial", "port", "tribunal",
          "palais", "temple", "marche", "remparts", "aqueduc", "banque", "cathedrale",
          "universite", "usine", "sdi", "nations_unies"]:
    EXPECTED[f"batiment_{n}.png"] = (224, 256)
    EXPECTED[f"batiment_{n}_accent.png"] = (224, 256)
# Phase 7e : unités terrestres complémentaires.
for n in ["piquier", "catapulte", "chevalier", "fusilier", "canon",
          "infanterie_moderne", "char_d_assaut", "artillerie"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
# Phase 7f : GP de culture (Artiste, Penseur).
for n in ["artiste", "penseur"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
for n in ["or", "commerce", "science", "nourriture", "production", "pv", "pm", "fin_tour", "reseau", "culture"]:
    EXPECTED[f"icone_{n}.png"] = (64, 64)
# Phase 7c (R-91) : icônes de ressources 64×64.
for n in ["aluminium", "baleine", "betail", "ble", "boeufs", "caoutchouc", "charbon",
          "chene", "encens", "epices", "fer", "gemmes", "gibier", "or", "marbre",
          "petrole", "poisson", "soie", "soufre", "teinture", "uranium", "vin",
          "inconnue"]:
    EXPECTED[f"res_{n}.png"] = (64, 64)


def check():
    ok = True
    for name, (w, h) in EXPECTED.items():
        p = EXPORTS / name
        if not p.exists():
            print(f"MANQUANT  {name}")
            ok = False
            continue
        img = Image.open(p)
        problems = []
        if img.size != (w, h):
            problems.append(f"taille {img.size} != {(w, h)}")
        if img.mode != "RGBA":
            problems.append(f"mode {img.mode} != RGBA")
        if name.startswith("tile_"):
            hw_expect = h * math.sqrt(3) / 2
            if abs(w - hw_expect) > 3:
                problems.append(f"ratio w/h={w/h:.3f} != 0.866")
        if "_accent" in name:
            colors = img.convert("RGBA").getcolors(100000)
            non_white = [c for c in colors if c[1][3] > 0 and c[1][:3] != (255, 255, 255)]
            if any(c[1][:3] != (224, 224, 224) for c in non_white):
                problems.append("accent contient du non-blanc")
        print(("OK      " if not problems else "ERREUR  ") + name +
              ("  — " + "; ".join(problems) if problems else ""))
        ok = ok and not problems
    print("\nVérification :", "CONFORME" if ok else "NON CONFORME")
    return ok


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(0 if check() else 1)
    main()
