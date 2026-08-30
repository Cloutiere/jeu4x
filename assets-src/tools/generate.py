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


def tile_eau(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=EAU_1)
    d.ellipse((10, 20, 160, 120), fill="#4A7CAC")
    for y, x0, x1 in [(80, 40, 110), (130, 90, 180), (180, 40, 130)]:
        d.arc((x0, y - 9, x1, y + 9), 195, 345, fill=EAU_2, width=3)
        d.arc((x0 + 18, y + 2, x1 - 10, y + 20), 195, 345, fill="#5E8CB4", width=2.4)
    light_from_topleft(img, w, h, cx, 26)


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


# ---------------------------------------------------------------- génération


def main():
    EXPORTS.mkdir(exist_ok=True)

    tiles = {
        "tile_prairie": tile_prairie,
        "tile_plaine": tile_plaine,
        "tile_foret": tile_foret,
        "tile_colline": tile_colline,
        "tile_montagne": tile_montagne,
        "tile_eau": tile_eau,
        "tile_ville_sol": tile_ville_sol,
    }
    entities = {
        "unite_guerrier": (256, 320, unite_guerrier),
        "unite_colon": (256, 320, unite_colon),
        "ville_settlement": (224, 256, ville_settlement),
        "ville_capitale": (224, 256, ville_capitale),
    }
    icons = {
        "icone_or": icone_or,
        "icone_science": icone_science,
        "icone_nourriture": icone_nourriture,
        "icone_production": icone_production,
        "icone_pv": icone_pv,
        "icone_pm": icone_pm,
        "icone_fin_tour": icone_fin_tour,
        "icone_reseau": icone_reseau,
    }

    for name, painter in tiles.items():
        render_tile(name, painter)
    for name, (w, h, painter) in entities.items():
        render_entity(name, w, h, painter)
    for name, painter in icons.items():
        render_icon(name, painter)

    write_palette()
    write_licenses(len(tiles), len(entities), len(icons))
    print(f"OK — {len(tiles)} tuiles, {len(entities)*2} fichiers entités, "
          f"{len(icons)} icônes → {EXPORTS}")


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
        f"eau_1             {EAU_1}",
        f"eau_2             {EAU_2}",
        f"sol_chemin        {SOL_CHEMIN}",
        f"sol_terre         {SOL_TERRE}",
        f"or                {OR}",
        f"joueur_1_rouge    {ROUGE_JOUEUR}  (référence — accents livrés blancs)",
        f"joueur_2_bleu     {BLEU_JOUEUR}  (référence — accents livrés blancs)",
    ]
    (ROOT / "palette.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_licenses(n_tiles, n_entities, n_icons):
    txt = f"""# LICENSES.md

Tous les fichiers de `exports/` sont générés **procéduralement** par
`tools/generate.py` (dessin vectoriel Pillow, antialiasing supersampling x4).
Aucune ressource tierce, aucune police, aucun texte incorporé.

| Fichiers | Source | Licence |
|---|---|---|
| {n_tiles} tuiles `tile_*.png` | Généré par tools/generate.py | Licence projet |
| {n_entities} entités `unite_*`/`ville_*` (+ `_accent`) | Généré par tools/generate.py | Licence projet |
| {n_icons} icônes `icone_*.png` | Généré par tools/generate.py | Licence projet |

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
for n in ["or", "science", "nourriture", "production", "pv", "pm", "fin_tour", "reseau"]:
    EXPECTED[f"icone_{n}.png"] = (64, 64)


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
