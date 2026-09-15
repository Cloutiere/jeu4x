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

    def rect(self, box, fill=None):
        self.d.rectangle([c * SS for c in box], fill=fill)

    def smooth_poly(self, pts, fill=None, outline=None, width=0, steps=14):
        """Polygone lissé : chaîne Catmull-Rom passant par `pts`."""
        self.poly(bezier(pts, steps), fill=fill, outline=outline,
                  width=int(width * SS) if width else 0)

    def smooth_line(self, pts, fill, width, steps=14):
        self.line(bezier(pts, steps), fill, width)

    def taper(self, pts, w0, w1, fill, steps=16):
        """Membre fuselé : ligne lissée dont l'épaisseur passe de w0 à w1."""
        b = bezier(pts, steps)
        n = len(b)
        for i in range(n - 1):
            t = i / (n - 1)
            self.line([b[i], b[i + 1]], fill,
                      w0 + (w1 - w0) * t)


def bezier(pts, steps=14):
    """Catmull-Rom passant par les points de contrôle (au moins 2 points)."""
    if len(pts) < 3:
        return list(pts)
    p = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(len(p) - 3):
        p0, p1, p2, p3 = p[i], p[i + 1], p[i + 2], p[i + 3]
        for k in range(steps):
            t = k / steps
            t2, t3 = t * t, t * t * t
            f = lambda a, b, c, e: 0.5 * ((2 * b) + (-a + c) * t
                                          + (2 * a - 5 * b + 4 * c - e) * t2
                                          + (-a + 3 * b - 3 * c + e) * t3)
            out.append((f(p0[0], p1[0], p2[0], p3[0]),
                        f(p0[1], p1[1], p2[1], p3[1])))
    out.append(pts[-1])
    return out


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


def soft_clip(img, fn):
    """Comme soft, mais le calque est borné aux pixels déjà peints de img
    (modelés/dégradés sans baver sur le fond transparent)."""
    lay = new_canvas(img.width / SS, img.height / SS)
    fn(D(lay))
    from PIL import ImageChops
    r, g, b, a = lay.split()
    a = ImageChops.multiply(a, img.getchannel("A"))
    img.alpha_composite(Image.merge("RGBA", (r, g, b, a)))


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
    # prés en taches, bords adoucis au modelé radial
    d.ellipse((20, 60, 110, 150), fill=PRAIRIE_2)
    d.ellipse((120, 140, 210, 230), fill=PRAIRIE_2)
    d.ellipse((100, 30, 200, 110), fill=PRAIRIE_3)
    # bandes de fauche courbes, fondues (semi-transparentes)
    def fauche(dd):
        for pts in [[(24, 178), (70, 152), (126, 160), (172, 144)],
                    [(56, 224), (110, 196), (164, 208)]]:
            dd.smooth_line(pts, (207, 224, 154, 110), 7)
    soft_clip(img, fauche)
    radial(img, 66, 76, 42, (255, 255, 255), 24)
    radial(img, 172, 204, 44, (20, 20, 30), 26)
    # touffes variées : deux verts + épis
    for x, y, s, c in [(52, 170, 1.2, "#6E9440"), (74, 188, 0.9, "#7DA24A"),
                       (150, 120, 1.1, "#6E9440"), (172, 134, 0.8, "#7DA24A"),
                       (104, 202, 1.0, "#6E9440"), (128, 88, 1.3, "#5F8A38"),
                       (44, 118, 0.8, "#7DA24A"), (186, 178, 1.0, "#5F8A38")]:
        tuft(d, x, y, c, s)
        if s >= 1.1:
            d.ellipse((x - 1.4, y - 11 * s - 2, x + 1.4, y - 11 * s + 1),
                      fill="#8FB35A")
    # fleurs en grappes : 3 pétales blancs + cœur doré
    for fx, fy in [(84, 96), (140, 178), (60, 130), (176, 90)]:
        for ox, oy in [(-4, 1), (4, 0), (0, -4)]:
            d.ellipse((fx + ox - 2, fy + oy - 2, fx + ox + 2, fy + oy + 2),
                      fill="#E8E4D0")
        d.ellipse((fx - 1.2, fy - 1.2, fx + 1.2, fy + 1.2), fill=OR)
    light_from_topleft(img, w, h, cx, 22)


def tile_plaine(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=PLAINE_1)
    # terres sèches en taches, bords fondus au modelé
    d.ellipse((30, 80, 140, 190), fill=PLAINE_2)
    d.ellipse((130, 40, 215, 120), fill="#CBBF76")
    radial(img, 76, 130, 44, (255, 240, 190), 26)
    radial(img, 170, 210, 44, (30, 24, 12), 28)
    # terres dénudées : plaques ocre fondues (identité sèche de la plaine)
    def nue(dd):
        for bx, by, rx, ry in [(60, 150, 26, 14), (158, 172, 30, 15),
                               (120, 92, 18, 10)]:
            dd.ellipse((bx - rx, by - ry, bx + rx, by + ry),
                       fill=(200, 168, 94, 90))
    soft_clip(img, nue)
    # chaumes courbés : petits brins groupés autour des touffes sèches
    def chaume(dd):
        for gx, gy, s in [(60, 150, 1.0), (110, 90, 1.0), (160, 170, 1.0),
                          (90, 190, 0.9), (180, 120, 1.0)]:
            for ox, lean in [(-6, 0.8), (0, 1.0), (6, 1.2)]:
                dd.smooth_line([(gx + ox, gy), (gx + ox + 6 * s * lean,
                                                gy - 5 * s),
                                (gx + ox + 10 * s * lean, gy - 9 * s)],
                               (150, 132, 70, 190), 2.2)
    soft_clip(img, chaume)
    # touffes sèches en éventail
    for x, y in [(60, 150), (110, 90), (160, 170), (90, 190), (180, 120)]:
        tuft(d, x, y, "#8A7A34", 1.1)
    # cailloux clairs
    for sx, sy, sr in [(84, 130, 4), (150, 200, 3.5), (44, 180, 3)]:
        d.ellipse((sx - sr, sy - sr * 0.7, sx + sr, sy + sr * 0.7),
                  fill="#C2B280")
        d.ellipse((sx - sr * 0.5, sy - sr * 0.5, sx + sr * 0.1, sy),
                  fill="#D8CC9A")
    light_from_topleft(img, w, h, cx, 18)


def tile_foret(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=FORET_1)
    # clairières du sous-bois, bords fondus
    d.ellipse((30, 90, 200, 230), fill="#5C8A42")
    d.ellipse((96, 36, 190, 108), fill="#63934A")
    radial(img, 64, 90, 44, (255, 255, 210), 22)
    radial(img, 168, 212, 46, (10, 26, 8), 30)

    # ombres portées au sol (calque composité, sinon ImageDraw remplace l'alpha)
    trees = [
        # rangée de fond : petits, sombres
        (26, 92, 0.55, "#446A30", "#557C3A"),
        (46, 118, 0.62, "#446A30", "#557C3A"),
        (96, 60, 0.52, "#446A30", "#557C3A"),
        (122, 88, 0.66, "#4A7434", "#5B863E"),
        (178, 104, 0.58, "#446A30", "#557C3A"),
        (204, 142, 0.6, "#446A30", "#557C3A"),
        # sujets principaux
        (70, 176, 1.15, FORET_2, "#82B060"),
        (124, 152, 1.0, "#639744", "#75A952"),
        (150, 196, 1.35, FORET_2, "#82B060"),
        (98, 108, 0.8, "#639744", "#75A952"),
        (176, 140, 0.9, "#7DAA56", "#8FBC6A"),
        (206, 190, 0.85, FORET_2, "#82B060"),
        (58, 230, 0.85, "#7DAA56", "#8FBC6A"),
    ]

    def ombres(dd):
        for x, y, s, _f, _l in trees:
            dd.ellipse((x - 12 * s, y - 1 * s, x + 16 * s, y + 5 * s),
                       fill=(15, 25, 10, 60))
    soft_clip(img, ombres)

    def tree(x, y, s, foliage, lit):
        d.rrect((x - 2.6 * s, y - 8 * s, x + 2.6 * s, y + 3 * s), 1.5,
                fill=BOIS)
        d.rrect((x - 2.6 * s, y - 8 * s, x - 0.4 * s, y + 3 * s), 1.5,
                fill=BOIS_CLAIR)
        # houppier : masses superposées, ombre à droite, lumière en haut-gauche
        d.ellipse((x - 16 * s, y - 30 * s, x + 15 * s, y - 1 * s), fill=foliage)
        d.ellipse((x - 15 * s, y - 34 * s, x + 16 * s, y - 14 * s), fill=foliage)
        d.ellipse((x + 1 * s, y - 26 * s, x + 15 * s, y - 4 * s),
                  fill="#4E7236")
        d.ellipse((x - 14 * s, y - 34 * s, x + 2 * s, y - 18 * s), fill=lit)
        d.ellipse((x - 9 * s, y - 31 * s, x - 1 * s, y - 23 * s), fill=lit)

    for x, y, s, foliage, lit in trees:
        tree(x, y, s, foliage, lit)
    # fougères au sol
    for fx, fy in [(48, 216), (126, 232), (188, 222)]:
        d.line([(fx, fy), (fx - 5, fy - 9)], fill="#5E8A40", width=2)
        d.line([(fx, fy), (fx, fy - 11)], fill="#6E9C4A", width=2)
        d.line([(fx, fy), (fx + 5, fy - 9)], fill="#5E8A40", width=2)
    light_from_topleft(img, w, h, cx, 20)


def tile_colline(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=COLLINE_1)
    # dos de colline bas : crête arrondie à mi-tuile, jamais de pic
    crest = [(0, 196), (0, 172), (36, 152), (74, 138), (112, 134),
             (150, 140), (184, 154), (224, 172), (224, 256), (0, 256)]
    d.smooth_poly(crest, fill=COLLINE_2)
    # flanc éclairé côté lumière (bande claire sous la crête)
    def flanc(dd):
        dd.smooth_poly([(0, 172), (36, 152), (74, 138), (112, 134),
                        (150, 140), (184, 154), (224, 172), (224, 190),
                        (170, 172), (110, 156), (48, 166), (0, 190)],
                       fill=(180, 158, 108, 110))
    soft_clip(img, flanc)
    radial(img, 112, 140, 52, (255, 244, 200), 26)
    # courbes de niveau douces qui suivent la crête
    for dy in (30, 56):
        d.smooth_line([(0, 172 + dy), (36, 152 + dy * 0.8), (74, 138 + dy * 0.7),
                       (112, 134 + dy * 0.65), (150, 140 + dy * 0.7),
                       (184, 154 + dy * 0.8), (224, 172 + dy * 0.8)],
                      "#7E6540", 2)
    # deuxième bosse basse à droite, devant
    d.smooth_poly([(120, 256), (138, 222), (168, 208), (198, 220),
                   (216, 244), (216, 256)], fill="#8A7248")
    d.smooth_line([(138, 222), (168, 208), (198, 220)], "#9C8158", 2.4)
    # buissons et herbes sur les pentes
    for bx, by, s in [(64, 176, 1.0), (146, 186, 0.9)]:
        d.ellipse((bx - 9 * s, by - 6 * s, bx + 9 * s, by + 4 * s),
                  fill="#77873E")
        d.ellipse((bx - 6 * s, by - 5 * s, bx + 2 * s, by + 1 * s),
                  fill="#8A9A4C")
    for x, y in [(40, 150), (96, 158), (170, 200), (60, 216), (196, 232),
                 (130, 168)]:
        tuft(d, x, y, "#6E7C34", 0.9)
    for fx, fy in [(84, 196), (156, 214)]:
        d.ellipse((fx - 2, fy - 2, fx + 2, fy + 2), fill="#D8D2B4")
    radial(img, 60, 236, 40, (20, 20, 30), 22)
    light_from_topleft(img, w, h, cx, 16)


def tile_montagne(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=MONTAGNE_1)
    # massif principal : pics hauts et anguleux, crêtes vives
    d.poly([(0, 226), (34, 140), (62, 96), (80, 118), (100, 64), (116, 88),
            (134, 48), (156, 104), (172, 82), (196, 150), (224, 220),
            (224, 256), (0, 256)], fill=MONTAGNE_2)
    # facettes éclairées (faces gauche, lumière haut-gauche)
    d.poly([(62, 96), (80, 118), (58, 170), (30, 158)], fill=MONTAGNE_1)
    d.poly([(100, 64), (116, 88), (100, 140), (72, 128)], fill="#A2A2AA")
    d.poly([(134, 48), (150, 78), (138, 96), (124, 72)], fill="#9A9AA2")
    # faces ombrées (droite)
    d.poly([(134, 48), (156, 104), (172, 82), (160, 60)], fill="#5A5A64")
    d.poly([(172, 82), (196, 150), (180, 156), (162, 106)], fill="#63636D")
    # neiges déchiquetées, ancrées aux deux principaux pics
    d.poly([(134, 48), (146, 66), (140, 74), (152, 92), (140, 98), (130, 86),
            (122, 96), (116, 80), (122, 62), (128, 52)], fill=NEIGE)
    d.poly([(100, 64), (110, 82), (104, 92), (114, 106), (100, 112), (90, 96),
            (82, 102), (78, 86), (88, 72)], fill=NEIGE)
    d.poly([(62, 96), (72, 112), (64, 122), (56, 110), (52, 100)], fill=NEIGE)
    # névés qui descendent dans les couloirs
    d.poly([(116, 88), (122, 130), (112, 128), (108, 96)], fill=(242, 242, 240, 200))
    d.poly([(156, 104), (162, 140), (152, 138), (150, 112)], fill=(242, 242, 240, 170))
    # éboulis au pied, ombres compositées
    def eboulis(dd):
        for x, y, r in [(56, 218, 9), (82, 230, 6.5), (102, 218, 5),
                        (150, 224, 8), (176, 234, 5.5), (196, 218, 4.5)]:
            dd.ellipse((x - r, y - r * 0.7, x + r, y + r * 0.7),
                       fill=(40, 40, 50, 70))
    soft_clip(img, eboulis)
    for x, y, r in [(54, 216, 8), (80, 228, 6), (100, 216, 4.5),
                    (148, 222, 7), (174, 232, 5), (194, 216, 4)]:
        d.ellipse((x - r, y - r * 0.7, x + r, y + r * 0.7), fill="#7C7C86")
        d.ellipse((x - r * 0.55, y - r * 0.55, x + r * 0.15, y - r * 0.05),
                  fill="#94949E")
    # brume au pied du massif
    radial(img, 112, 244, 70, (235, 238, 235), 40)
    radial(img, 130, 70, 60, (255, 255, 255), 26)
    light_from_topleft(img, w, h, cx, 14)


def tile_desert(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=DESERT_1)
    # dunes lissées : crête éclairée, versant ombré en voile doux
    def dune(pts, crete, sombre):
        d.smooth_poly(pts + [(224, 256), (0, 256)], fill=DESERT_2)
        d.smooth_line(crete, "#E8D9A8", 3)
        def lee(dd):
            dd.smooth_poly([pts[-1], (224, 256), pts[0],
                            (pts[0][0] + 20, pts[0][1] + 24),
                            (112, 236), (pts[-1][0] - 24, pts[-1][1] + 20)],
                           fill=sombre)
        soft_clip(img, lee)
    dune([(0, 176), (36, 148), (84, 138), (140, 156), (224, 186)],
         [(0, 176), (36, 148), (84, 138), (140, 156), (224, 186)],
         (140, 112, 60, 40))
    dune([(0, 226), (56, 204), (128, 202), (196, 218), (224, 234)],
         [(0, 226), (56, 204), (128, 202), (196, 218), (224, 234)],
         (140, 112, 60, 46))
    # sable soufflé par le vent
    def vent(dd):
        for sx, sy, s in [(40, 110, 1.2), (110, 90, 1.0), (170, 120, 1.1),
                          (72, 168, 1.0), (150, 176, 0.9), (100, 236, 1.0)]:
            dd.smooth_line([(sx, sy), (sx + 12 * s, sy - 3 * s),
                            (sx + 24 * s, sy - 2 * s)], (232, 217, 168, 170),
                           2.4)
    soft_clip(img, vent)
    radial(img, 70, 80, 48, (255, 244, 200), 30)
    radial(img, 176, 214, 46, (120, 90, 50), 28)
    # cactus à deux bras + fleur
    d.rrect((158, 116, 170, 162), 5, fill="#6E9C4A")
    d.rrect((150, 124, 178, 136), 5, fill="#6E9C4A")
    d.rrect((148, 106, 158, 130), 4, fill="#6E9C4A")
    d.rrect((170, 118, 180, 140), 4, fill="#6E9C4A")
    d.ellipse((150, 100, 156, 106), fill="#E8A0C0")
    # ossements blanchis
    for bx, by, ang in [(58, 208, -0.5), (66, 212, 0.4)]:
        ex, ey = bx + 16 * math.cos(ang), by + 16 * math.sin(ang)
        d.line([(bx - 8 * math.cos(ang), by - 8 * math.sin(ang)),
                (ex, ey)], fill="#E4DCC8", width=3)
    d.ellipse((50, 200, 60, 210), fill="#E4DCC8")
    light_from_topleft(img, w, h, cx, 20)


def tile_eau(d, img, w, h, cx):
    d.poly(hex_points(cx, h / 2, w, h), fill=EAU_1)
    # hauts-fonds : eaux plus claires, bords fondus
    d.ellipse((10, 20, 160, 120), fill="#4A7CAC")
    d.ellipse((90, 120, 220, 230), fill="#46789F")
    radial(img, 70, 70, 52, (140, 190, 220), 50)
    radial(img, 170, 210, 50, (24, 44, 74), 34)
    # clapot côtier : vagues courtes en paquets, écume aux crêtes
    for x, y, s in [(34, 82, 1.0), (96, 64, 1.2), (150, 96, 0.9),
                    (60, 140, 1.1), (130, 156, 1.0), (184, 170, 0.9),
                    (44, 200, 0.9), (112, 216, 1.1), (170, 224, 0.8)]:
        d.arc((x - 26 * s, y - 8 * s, x + 26 * s, y + 8 * s), 200, 340,
              fill=EAU_2, width=2.8)
        d.arc((x - 14 * s, y + 4 * s, x + 30 * s, y + 18 * s), 200, 340,
              fill="#5E8CB4", width=2)
        d.ellipse((x - 3 * s, y - 10 * s, x + 3 * s, y - 5 * s),
                  fill="#C8DCE8")
    # reflets du soleil : tirets clairs
    for gx, gy in [(80, 90), (60, 120), (140, 130), (100, 180), (160, 200)]:
        d.line([(gx - 7, gy), (gx + 7, gy)], fill=(230, 240, 245, 150), width=2)
    light_from_topleft(img, w, h, cx, 26)


def tile_ocean(d, img, w, h, cx):
    """Phase 6c : océan profond — teinte plus sombre que la côte (EAU_1),
    houle longue et rare (grand large, pas de clapot côtier)."""
    d.poly(hex_points(cx, h / 2, w, h), fill=OCEAN_1)
    # grand large : lentilles de profondeur, fondus discrets
    d.ellipse((10, 20, 160, 120), fill="#33567F")
    d.ellipse((80, 130, 220, 240), fill="#26466A")
    radial(img, 66, 66, 50, (90, 130, 170), 36)
    radial(img, 176, 214, 52, (16, 30, 52), 30)
    # houle longue et rare : ondulations larges, très plates
    for x, y, s in [(64, 96, 1.3), (150, 150, 1.5), (72, 190, 1.2),
                    (164, 222, 1.1)]:
        d.arc((x - 36 * s, y - 6 * s, x + 36 * s, y + 6 * s), 197, 343,
              fill=OCEAN_2, width=2.4)
        d.arc((x - 20 * s, y + 6 * s, x + 40 * s, y + 16 * s), 197, 343,
              fill="#4A6F97", width=1.8)
    # rares scintillements
    for gx, gy in [(96, 110), (140, 170), (70, 226)]:
        d.line([(gx - 5, gy), (gx + 5, gy)], fill=(200, 220, 235, 120),
               width=1.8)
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
    """Dessine base + accent (calque blanc aligné au pixel) en un seul passage.
    Les painters qui acceptent un 5e paramètre reçoivent l'image de base
    (pour les modelés vgrad/radial bornés aux pixels peints)."""
    import inspect
    base = new_canvas(w, h)
    accent = new_canvas(w, h)
    args = [D(base), D(accent), w, h]
    if len(inspect.signature(painter).parameters) >= 5:
        args.append(base)
    painter(*args)
    downscale(base, w, h).save(EXPORTS / f"{name}.png")
    white = Image.new("RGBA", accent.size, (255, 255, 255, 255))
    accent.paste(white, (0, 0), accent.getchannel("A"))
    downscale(accent, w, h).save(EXPORTS / f"{name}_accent.png")


def shadow(d, cx, y, rx, ry=7):
    d.ellipse((cx - rx, y - ry, cx + rx, y + ry), fill=(0, 0, 0, 60))


def vgrad(img, box, color, alpha_top, alpha_bot, steps=20):
    """Voile dégradé vertical dans `box` (x0, y0, x1, y1), borné aux pixels
    peints : couleur unie, alpha fondu de alpha_top (haut) à alpha_bot (bas)."""
    x0, y0, x1, y1 = box
    def paint(d):
        hh = (y1 - y0) / steps
        for i in range(steps):
            a = alpha_top + (alpha_bot - alpha_top) * (i + 0.5) / steps
            d.rect((x0, y0 + i * hh, x1, y0 + (i + 1) * hh),
                   fill=color + (int(a),))
    soft_clip(img, paint)


def radial(img, cx, cy, r, color, alpha, steps=9, power=1.4):
    """Modelé radial doux, borné aux pixels peints : lumière (blanc) ou
    ombre (noir) en disque concentrique fondu."""
    def paint(d):
        for i in range(steps):
            t = i / steps
            rr = r * (1 - t)
            a = alpha * (1 - t) ** power
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr),
                      fill=color + (int(a),))
    soft_clip(img, paint)


def unit_shading(img, cx, top, bottom, strength=34):
    """Ombrage d'unité : lumière haut-gauche, ombre bas-droite, en voiles
    doux bornés au volume de l'unité (colonnes cx±46, de top à bottom)."""
    vgrad(img, (cx - 60, top, cx + 8, bottom), (255, 255, 255),
          strength, 0, steps=16)
    vgrad(img, (cx - 8, top, cx + 60, bottom), (20, 20, 30),
          0, strength, steps=16)


def unite_guerrier(db, da, w, h, img=None):
    """256×320 — référence de style « board-game enrichi » : silhouettes
    lissées (Catmull-Rom), membres fuselés, modelés dégradés et ombrage
    radial, toujours à plat (pas de 3D). Massue + bouclier ; le bouclier
    seul porte le calque accent (blanc, teinte joueur/barbare à la volée)."""
    cx, g = 128, 300
    shadow(db, cx, g + 4, 54)
    CUIR, CUIR_SOMBRE = "#5E4E3A", "#3E342A"

    # jambes fuselées + bottes + rotules
    for sx in (-1, 1):
        hx = cx + sx * 16
        db.taper([(hx, g - 62), (hx + sx * 3, g - 34), (hx + sx * 2, g - 8)],
                 22, 15, CUIR)
        db.rrect((hx - 15, g - 10, hx + 15, g + 2), 4, fill=CUIR_SOMBRE)
        db.ellipse((hx - 8, g - 44, hx + 8, g - 32), fill="#6B5A44")

    # tunique évasée (pan éclairé à gauche) + franges d'ourlet
    db.smooth_poly([(cx - 30, g - 132), (cx + 30, g - 132),
                    (cx + 42, g - 92), (cx + 38, g - 52),
                    (cx - 38, g - 52), (cx - 42, g - 92)],
                   fill=GRIS_NEUTRE)
    db.smooth_poly([(cx - 30, g - 132), (cx - 6, g - 132),
                    (cx - 18, g - 52), (cx - 38, g - 52), (cx - 42, g - 92)],
                   fill="#CBC7BE")
    for fx in (-28, -9, 9, 28):
        db.poly([(cx + fx - 6, g - 52), (cx + fx + 6, g - 52),
                 (cx + fx, g - 42)], fill="#7A766C")
    # bandoulière cuir + ceinture cloutée
    db.smooth_line([(cx - 22, g - 126), (cx + 6, g - 98), (cx + 30, g - 66)],
                   "#6B5230", 7)
    db.rrect((cx - 39, g - 82, cx + 39, g - 70), 3, fill="#6B5230")
    for fx in (-30, -14, 14, 30):
        db.ellipse((cx + fx - 1.6, g - 79, cx + fx + 1.6, g - 73), fill="#4A3A22")
    db.rrect((cx - 8, g - 84, cx + 8, g - 68), 3, fill=OR,
             outline=OR_SOMBRE, width=1.5)

    # tête + casque à nasal
    db.ellipse((cx - 17, g - 170, cx + 17, g - 136), fill="#B99B7E")
    # traits du visage : yeux enfoncés sous un front dur, nez, bouche serrée
    for ex in (-7, 7):
        db.ellipse((cx + ex - 2.2, g - 151, cx + ex + 2.2, g - 147), fill=INK)
        db.line([(cx + ex - 3.4, g - 154), (cx + ex + 3.4, g - 152.5)],
                fill="#6E563E", width=2.6)
    db.line([(cx, g - 151), (cx - 1, g - 144)], fill="#9A7E62", width=2.6)
    db.smooth_line([(cx - 5, g - 138), (cx, g - 139), (cx + 5, g - 138)],
                   "#5E4632", 2.4)
    db.pieslice((cx - 19, g - 176, cx + 19, g - 142), 180, 360, fill=GRIS_ARMURE)
    db.rrect((cx - 19, g - 160, cx + 19, g - 154), 2, fill="#7E7E86")
    db.rrect((cx - 3, g - 160, cx + 3, g - 146), 2, fill=GRIS_ARMURE)

    # bras droit levé vers la massue
    db.taper([(cx + 24, g - 118), (cx + 40, g - 140), (cx + 50, g - 156)],
             16, 12, GRIS_NEUTRE)
    db.ellipse((cx + 42, g - 168, cx + 58, g - 152), fill="#B99B7E")
    # massue : manche fuselé, tête nodale lissée, pointes, reflet
    db.taper([(cx + 50, g - 154), (cx + 55, g - 176), (cx + 58, g - 194)],
             9, 6, BOIS)
    db.smooth_poly([(cx + 42, g - 214), (cx + 56, g - 228), (cx + 74, g - 220),
                    (cx + 78, g - 202), (cx + 64, g - 188), (cx + 46, g - 198)],
                   fill=BOIS)
    db.smooth_poly([(cx + 42, g - 214), (cx + 56, g - 228), (cx + 66, g - 222),
                    (cx + 54, g - 206), (cx + 46, g - 198)], fill=BOIS_CLAIR)
    for tx, ty, ax, ay in [(cx + 44, g - 222, -8, -4), (cx + 78, g - 212, 9, 0),
                           (cx + 62, g - 184, 2, 9), (cx + 40, g - 202, -9, 2)]:
        db.poly([(tx - 4, ty - 3), (tx + 4, ty + 3), (tx + ax, ty + ay)],
                fill="#5E4630")

    # bras gauche (bouclier)
    db.taper([(cx - 24, g - 118), (cx - 40, g - 106), (cx - 52, g - 94)],
             16, 12, GRIS_NEUTRE)

    # bouclier = accent : bord, anneau interne, umbo central
    sb = (cx - 94, g - 136, cx - 14, g - 56)
    db.ellipse(sb, fill=GRIS_ARMURE, outline=INK, width=3)
    db.ellipse((cx - 78, g - 120, cx - 30, g - 72), outline="#7E7E86", width=3)
    db.ellipse((cx - 66, g - 108, cx - 42, g - 84), fill="#7E7E86")
    da.ellipse(sb, fill="#FFFFFF")
    da.ellipse((cx - 78, g - 120, cx - 30, g - 72), outline="#E0E0E0", width=3)
    da.ellipse((cx - 66, g - 108, cx - 42, g - 84), fill="#E0E0E0")

    # ---- modelés (voiles doux bornés aux pixels peints de la base)
    if img is not None:
        radial(img, cx - 8, g - 162, 16, (255, 255, 255), 70)   # casque
        radial(img, cx + 2, g - 102, 26, (255, 255, 255), 38)   # torse
        radial(img, cx + 30, g - 68, 24, (20, 20, 30), 44)      # flanc ombre
        radial(img, cx + 60, g - 212, 16, (255, 255, 255), 60)  # tête de massue
        radial(img, cx - 62, g - 104, 26, (255, 255, 255), 60)  # bouclier lumière
        radial(img, cx - 32, g - 66, 24, (20, 20, 30), 40)      # bouclier ombre
        unit_shading(img, cx, g - 176, g - 40, strength=18)


def unite_colon(db, da, w, h, img=None):
    """256×320, charrette + bâton (capuche + sac + baril = accent), silhouette
    distincte. Même style enrichi que le guerrier : courbes lissées, membres
    fuselés, modelés doux bornés aux pixels peints."""
    cx, g = 112, 300
    shadow(db, cx - 8, g + 4, 46)
    shadow(db, 186, g + 6, 40)
    CUIR_SOMBRE = "#3E342A"

    # ---- personnage (pousse la charrette, penché vers la droite)
    # jambes sous la robe + bottes
    for sx in (-1, 1):
        lx = cx + sx * 12
        db.taper([(lx, g - 56), (lx + sx * 2, g - 30), (lx + sx * 1, g - 10)],
                 16, 13, "#4E4438")
        db.rrect((lx - 12, g - 12, lx + 12, g + 2), 4, fill=CUIR_SOMBRE)
    # robe longue évasée (pan éclairé à gauche, plis courbes à droite)
    db.smooth_poly([(cx - 28, g - 140), (cx + 26, g - 140),
                    (cx + 40, g - 92), (cx + 36, g - 48),
                    (cx - 38, g - 48), (cx - 42, g - 95)],
                   fill="#8E8A80")
    db.smooth_poly([(cx - 28, g - 140), (cx - 4, g - 140),
                    (cx - 16, g - 48), (cx - 38, g - 48), (cx - 42, g - 95)],
                   fill="#A5A199")
    for px, py in [(10, -132), (20, -128), (28, -118)]:
        db.smooth_line([(cx + px, g + py), (cx + px + 6, g + py + 34),
                        (cx + px + 4, g - 56)], "#7A766C", 2.4)
    # tête + capuche (accent)
    db.ellipse((cx - 14, g - 176, cx + 14, g - 148), fill="#B99B7E")
    # traits calmes : yeux, nez, bouche neutre
    for ex in (-6, 6):
        db.ellipse((cx + ex - 1.8, g - 164, cx + ex + 1.8, g - 160.4), fill=INK)
    db.line([(cx, g - 164), (cx - 1, g - 158)], fill="#9A7E62", width=2.2)
    db.line([(cx - 4, g - 154), (cx + 4, g - 154)], fill="#7A5E48", width=2.2)
    hood = [(cx - 20, g - 156), (cx - 18, g - 186), (cx + 2, g - 196),
            (cx + 20, g - 184), (cx + 20, g - 168), (cx + 6, g - 176),
            (cx - 6, g - 172), (cx - 12, g - 156)]
    db.smooth_poly(hood, fill="#6E6A62")
    da.smooth_poly(hood, fill="#FFFFFF")
    # bras poussant + main
    db.taper([(cx + 18, g - 122), (cx + 34, g - 114), (cx + 48, g - 106)],
             14, 11, "#8E8A80")
    db.ellipse((cx + 42, g - 112, cx + 56, g - 98), fill="#B99B7E")
    # bâton de pèlerin (fuselé, nœud de bois)
    db.taper([(cx - 34, g - 188), (cx - 38, g - 100), (cx - 40, g - 6)],
             6, 4.5, BOIS)
    db.ellipse((cx - 40, g - 196, cx - 30, g - 186), fill=BOIS_CLAIR)
    db.ellipse((cx - 39, g - 118, cx - 33, g - 112), fill="#5E4630")
    # sac à l'épaule (accent), lissé + rabat
    sack = [(cx - 30, g - 134), (cx - 8, g - 128), (cx - 12, g - 100),
            (cx - 34, g - 106)]
    db.smooth_poly(sack, fill="#9C7A4E")
    db.smooth_poly([(cx - 30, g - 134), (cx - 8, g - 128), (cx - 14, g - 118),
                    (cx - 30, g - 122)], fill="#8A6F4A")
    db.smooth_line([(cx - 22, g - 132), (cx - 4, g - 146)], "#6B5230", 4)
    da.smooth_poly(sack, fill="#FFFFFF")
    # ---- charrette
    ax, ay = 186, g - 46
    db.smooth_poly([(ax - 52, ay - 30), (ax + 48, ay - 30),
                    (ax + 56, ay - 8), (ax - 58, ay - 8)], fill=BOIS)
    db.smooth_poly([(ax - 52, ay - 30), (ax - 20, ay - 30),
                    (ax - 26, ay - 8), (ax - 58, ay - 8)], fill=BOIS_CLAIR)
    for sx in (-20, 12):
        db.line([(ax + sx, ay - 30), (ax + sx - 4, ay - 8)], fill="#5E4630",
                width=2)
    db.line([(ax - 58, ay - 4), (ax + 56, ay - 4)], fill="#5E4630", width=3)
    # manche vers le personnage
    db.taper([(cx + 48, g - 104), (ax - 58, ay - 16)], 8, 6, BOIS)
    # roue : jante, rayons, moyeu
    db.ellipse((ax + 6, ay - 6, ax + 46, ay + 34), fill="#5E4630")
    db.ellipse((ax + 12, ay, ax + 40, ay + 28), fill="#8A6F4A")
    hub_x, hub_y = ax + 26, ay + 14
    for dx, dy in [(0, -14), (0, 14), (-14, 0), (14, 0),
                   (-10, -10), (10, 10), (-10, 10), (10, -10)]:
        db.line([(hub_x, hub_y), (hub_x + dx, hub_y + dy)],
                fill="#5E4630", width=2.4)
    db.ellipse((hub_x - 4, hub_y - 4, hub_x + 4, hub_y + 4), fill="#3E342A")
    # fût/baril dans la charrette (accent) : douves, cercles, staves
    baril = (ax - 34, ay - 62, ax + 10, ay - 28)
    db.rrect(baril, 6, fill="#7E6A48")
    for sx in (-22, -10, 2):
        db.line([(ax + sx, ay - 60), (ax + sx, ay - 30)], fill="#6A5A3E",
                width=1.6)
    db.rrect((ax - 34, ay - 56, ax + 10, ay - 50), 2, fill="#5E4630")
    db.rrect((ax - 34, ay - 42, ax + 10, ay - 36), 2, fill="#5E4630")
    da.rrect(baril, 6, fill="#FFFFFF")

    # ---- modelés (voiles doux bornés aux pixels peints de la base)
    if img is not None:
        radial(img, cx - 4, g - 186, 14, (255, 255, 255), 55)   # capuche
        radial(img, cx - 16, g - 116, 22, (255, 255, 255), 24)  # robe claire
        radial(img, cx + 30, g - 70, 24, (20, 20, 30), 40)      # robe ombre
        radial(img, ax - 12, ay - 45, 13, (255, 255, 255), 26)  # baril
        radial(img, ax + 34, ay + 12, 16, (20, 20, 30), 30)     # roue ombre
        unit_shading(img, cx, g - 196, g - 40, strength=16)


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
    """224×256 : muraille crénelée + donjon + grand drapeau (accent :
    toit du donjon, toits des tours, drapeau)."""
    shadow(db, 112, 212, 88)
    # esplanade de terre devant la porte
    db.ellipse((58, 196, 166, 220), fill=SOL_CHEMIN)
    # muraille, coins adoucis, pan éclairé à gauche
    db.smooth_poly([(30, 212), (30, 158), (194, 158), (194, 212)],
                   fill="#B0A390")
    db.smooth_poly([(30, 212), (30, 158), (112, 158), (112, 212)],
                   fill="#C2B6A2")
    # assises de pierres (lignes horizontales + joints décalés)
    for yy in (172, 186, 200):
        db.line([(32, yy), (110, yy)], fill="#B4A894", width=1.6)
        db.line([(114, yy), (192, yy)], fill="#A49884", width=1.6)
    for xx, yy in ((58, 165), (84, 179), (66, 193), (140, 165), (166, 179),
                   (150, 193), (176, 200)):
        db.line([(xx, yy), (xx, yy + 10)], fill="#AFA390", width=1.4)
    # créneaux réguliers sur tout le pourtour
    for x in range(30, 194, 24):
        col = "#C2B6A2" if x < 112 else "#B0A390"
        db.rrect((x, 146, x + 14, 160), 2, fill=col)
    # porte en arc, pierre appareillée, bois clouté
    db.pieslice((88, 168, 136, 216), 180, 360, fill="#5E4E3A")
    db.rrect((88, 192, 136, 212), 2, fill="#5E4E3A")
    for vx in (100, 112, 124):
        db.line([(vx, 176), (vx, 210)], fill="#4A3C2C", width=2.4)
    db.ellipse((106, 190, 112, 196), fill="#8A6F4A")
    # donjon avec fenêtres géminées
    db.rrect((92, 92, 132, 160), 3, fill="#C2B6A2")
    db.line([(92, 108), (132, 108)], fill="#B4A894", width=1.6)
    db.line([(92, 130), (132, 130)], fill="#B4A894", width=1.6)
    db.rrect((100, 114, 108, 124), 1.5, fill="#5E4E3A")
    db.rrect((116, 114, 124, 124), 1.5, fill="#5E4E3A")
    db.rrect((104, 138, 120, 152), 2, fill="#5E4E3A")
    db.poly([(86, 96), (112, 62), (138, 96)], fill="#8E8272")
    da.poly([(86, 96), (112, 62), (138, 96)], fill="#FFFFFF")
    # tours d'angle avec fenêtres
    for x in (26, 178):
        db.rrect((x, 120, x + 22, 160), 3, fill="#B0A390")
        db.rrect((x + 7, 134, x + 15, 144), 1.5, fill="#5E4E3A")
        db.pieslice((x - 2, 102, x + 24, 128), 180, 360, fill="#8E8272")
        da.pieslice((x - 2, 102, x + 24, 128), 180, 360, fill="#FFFFFF")
    # grand drapeau (accent) + oriflamme au vent
    db.line([(112, 62), (112, 18)], fill=BOIS, width=4)
    flag = [(114, 20), (162, 32), (114, 48)]
    db.poly(flag, fill="#8E8A80", outline=INK, width=0)
    da.poly(flag, fill="#FFFFFF")
    db.ellipse((109, 12, 115, 18), fill=OR)
    db.line([(114, 34), (138, 30)], fill="#8E8A80", width=2.5)


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
    _gp_yeux(db, cx, ground - 147)
    # bras tendant l'arc (gauche, main sur la poignée) + arc
    _gp_bras(db, [(cx - 20, ground - 118), (cx - 56, ground - 124)], FORET_1)
    bow = [(cx - 62, ground - 160), (cx - 74, ground - 124), (cx - 62, ground - 88)]
    db.line(bow, fill=BOIS, width=6)
    db.line([(cx - 62, ground - 160), (cx - 48, ground - 124), (cx - 62, ground - 88)],
            fill=SABLE, width=2)
    db.line([(cx - 70, ground - 124), (cx - 40, ground - 124)], fill=BOIS, width=4)
    # bras tirant la corde (droite, main sur l'encoche de la flèche)
    _gp_bras(db, [(cx + 20, ground - 112), (cx - 40, ground - 124)], FORET_1)
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
    db.poly([(182, ground - 126), (214, ground - 118), (218, ground - 84),
             (188, ground - 88)], fill="#8A5A34")
    db.ellipse((208, ground - 118, 244, ground - 86), fill="#8A5A34")
    db.poly([(214, ground - 118), (224, ground - 132), (232, ground - 116)],
            fill="#8A5A34")
    db.ellipse((226, ground - 108, 236, ground - 98), fill="#2B2620")
    mane = [(178, ground - 132), (196, ground - 116), (188, ground - 88), (172, ground - 104)]
    db.poly(mane, fill="#4E3822")
    # queue
    db.line([(44, ground - 100), (24, ground - 66)], fill="#4E3822", width=7)
    # ---- cavalier
    rider = 92
    db.rrect((rider + 8, ground - 96, rider + 24, ground - 58), 6, fill="#5E4E3A")
    db.poly([(rider - 14, ground - 190), (rider + 22, ground - 190),
             (rider + 30, ground - 108), (rider - 22, ground - 108)], fill=GRIS_ARMURE)
    db.poly([(rider - 14, ground - 190), (rider + 2, ground - 190),
             (rider - 8, ground - 108), (rider - 22, ground - 108)], fill="#B4B4BA")
    # cou (la tête ne flotte plus)
    db.rrect((rider + 2, ground - 202, rider + 14, ground - 186), 3,
             fill="#B99B7E", outline=INK, width=1.5)
    db.ellipse((rider - 8, ground - 222, rider + 22, ground - 192), fill="#B99B7E", outline=INK, width=1.5)
    db.pieslice((rider - 10, ground - 228, rider + 24, ground - 196), 180, 360,
                fill=GRIS_ARMURE)
    _gp_yeux(db, rider + 7, ground - 208)
    db.line([(rider + 3, ground - 198), (rider + 11, ground - 198)], fill=INK, width=1.5)
    # bras tenant la lance (contourné)
    _gp_bras(db, [(rider + 24, ground - 172), (rider + 56, ground - 158)], GRIS_ARMURE)
    db.line([(rider + 54, ground - 160), (rider + 58, ground - 232)], fill=BOIS, width=5)
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
    _gp_carrure(db, cx, ground - 128, 30, "#C24545")
    for y in (ground - 118, ground - 104, ground - 90):
        db.rrect((cx - 28, y, cx + 28, y + 8), 2, fill=GRIS_ARMURE)
    db.rrect((cx - 32, ground - 84, cx + 32, ground - 76), 3, fill="#6B5230")
    # cou + tete + casque a crete
    db.rrect((cx - 6, ground - 146, cx + 6, ground - 124), 3, fill="#B99B7E",
             outline=INK, width=1.5)
    db.ellipse((cx - 16, ground - 164, cx + 16, ground - 132), fill="#B99B7E")
    db.pieslice((cx - 19, ground - 170, cx + 19, ground - 138), 180, 360, fill=GRIS_ARMURE)
    _gp_yeux(db, cx, ground - 150)
    db.line([(cx - 5, ground - 140), (cx + 5, ground - 140)], fill=INK, width=1.5)
    crest = [(cx - 3, ground - 172), (cx + 3, ground - 172), (cx + 5, ground - 196),
             (cx - 5, ground - 196)]
    db.poly(crest, fill=ROUGE_JOUEUR, outline=INK, width=1)
    # bras droit : glaive levé, poing sur la poignée
    _gp_bras(db, [(cx + 24, ground - 116), (cx + 48, ground - 148)], "#C24545")
    db.line([(cx + 44, ground - 152), (cx + 52, ground - 196)], fill=GRIS_ARMURE, width=6)
    db.rrect((cx + 42, ground - 156, cx + 56, ground - 148), 2, fill=OR)
    db.ellipse((cx + 42, ground - 154, cx + 54, ground - 142), fill="#B99B7E",
               outline=INK, width=1.5)
    # bras gauche (vers le scutum)
    _gp_bras(db, [(cx - 24, ground - 116), (cx - 44, ground - 100)], "#C24545")
    # scutum rectangulaire = accent
    scut = (cx - 84, ground - 138, cx - 20, ground - 44)
    db.rrect(scut, 10, fill=GRIS_ARMURE, outline=INK, width=3)
    db.rrect((cx - 76, ground - 130, cx - 28, ground - 52), 8, outline=OR, width=3)
    db.ellipse((cx - 58, ground - 104, cx - 46, ground - 92), fill=OR)
# ------------------------------------------------- barbares (décision Erik 12/09)
# AUCUNE teinte d'accent pour les barbares : le rouge est CUIT dans la base
# (convention Civ). Les calques accent de ces trois assets restent vides.

ROUGE_BARBARE = "#B32222"     # tente/étoffes rouges des barbares
ROUGE_BARBARE_CLAIR = "#C43A32"  # face éclairée (même hue, +lumière)


def unite_barbare_guerrier(db, da, w, h, img=None):
    """256×320 : guerrier barbare — silhouette en V (épaules larges, taille
    serrée), jupe de peaux rouge déchiquetée, jambes nues bottées, casque à
    cornes, massue cloutée. Rouge cuit sur toute la majeure (aucun accent)."""
    cx, g = 128, 300
    shadow(db, cx, g + 4, 54)

    # jambes nues écartées (tibias peau) + bottes fourrées hautes
    for sx in (-1, 1):
        hx = cx + sx * 15
        db.taper([(hx, g - 56), (hx + sx * 2, g - 30), (hx + sx * 1, g - 12)],
                 13, 9, "#B99B7E")
        db.rrect((hx - 12, g - 24, hx + 12, g - 14), 4, fill="#C8B08A")
        db.rrect((hx - 11, g - 12, hx + 11, g + 2), 4, fill="#3E342A")

    # jupe de peaux rouge, courte, ourlet déchiqueté
    db.smooth_poly([(cx - 17, g - 88), (cx + 17, g - 88),
                    (cx + 30, g - 58), (cx + 26, g - 48),
                    (cx - 26, g - 48), (cx - 30, g - 58)],
                   fill=ROUGE_BARBARE)
    for fx in (-24, -8, 8, 24):
        db.poly([(cx + fx - 5, g - 49), (cx + fx + 5, g - 49),
                 (cx + fx, g - 38)], fill="#9E3A3A")
    # torse en V : épaules larges -> taille serrée (peaux rouges croisées)
    db.smooth_poly([(cx - 28, g - 132), (cx + 28, g - 132),
                    (cx + 17, g - 92), (cx - 17, g - 92)],
                   fill=ROUGE_BARBARE)
    db.smooth_poly([(cx - 28, g - 132), (cx - 6, g - 132),
                    (cx - 9, g - 92), (cx - 17, g - 92)],
                   fill=ROUGE_BARBARE_CLAIR)
    # croisures de peaux (sangles sombres en diagonale)
    db.smooth_line([(cx - 20, g - 128), (cx + 8, g - 96)], "#7E2E2E", 4)
    db.smooth_line([(cx + 20, g - 128), (cx - 4, g - 96)], "#7E2E2E", 4)
    # ceinture de guerre + boucle
    db.rrect((cx - 19, g - 92, cx + 19, g - 82), 3, fill="#6E2A2A")
    for fx in (-12, 0, 12):
        db.ellipse((cx + fx - 1.6, g - 89, cx + fx + 1.6, g - 85),
                   fill="#4A1C1C")
    db.rrect((cx - 6, g - 94, cx + 6, g - 80), 3, fill="#C8B08A",
             outline="#8A7248", width=1.5)

    # tête dure (sourcils froncés, bouche serrée) + casque à cornes
    db.ellipse((cx - 16, g - 168, cx + 16, g - 136), fill="#B99B7E")
    for ex in (-6, 6):
        db.ellipse((cx + ex - 2.2, g - 150, cx + ex + 2.2, g - 146), fill=INK)
        db.line([(cx + ex - 3.4, g - 153), (cx + ex + 3.4, g - 151.5)],
                fill="#6E563E", width=2.6)
    db.line([(cx, g - 150), (cx - 1, g - 143)], fill="#9A7E62", width=2.6)
    db.smooth_line([(cx - 5, g - 137), (cx, g - 138), (cx + 5, g - 137)],
                   "#5E4632", 2.4)
    db.pieslice((cx - 18, g - 174, cx + 18, g - 141), 180, 360, fill="#6E655C")
    db.rrect((cx - 18, g - 159, cx + 18, g - 153), 2, fill="#5A524A")
    # cornes courbes épaisses (fuselées vers la pointe claire)
    for sx in (-1, 1):
        db.taper([(cx + sx * 12, g - 157), (cx + sx * 24, g - 168),
                  (cx + sx * 33, g - 188)], 9, 3, "#C8B08A")
        db.ellipse((cx + sx * 31 - 3, g - 191, cx + sx * 31 + 3, g - 185),
                   fill="#E4D4B4")

    # épaules fourrées (pauldrons clairs) — ancre la largeur du V
    for sx in (-1, 1):
        px = cx + sx * 28
        db.ellipse((px - 11, g - 140, px + 11, g - 122), fill="#C8B08A")
        db.ellipse((px - 8, g - 138, px + 2, g - 128), fill="#E4D4B4")

    # bras droit levé, biceps marqué (deux segments), brassard de cuir
    db.taper([(cx + 26, g - 126), (cx + 38, g - 118), (cx + 42, g - 106)],
             11, 13, "#B99B7E")
    db.taper([(cx + 42, g - 106), (cx + 46, g - 128), (cx + 50, g - 148)],
             12, 9, "#B99B7E")
    db.rrect((cx + 36, g - 136, cx + 52, g - 126), 3, fill="#6E2A2A")
    db.ellipse((cx + 42, g - 160, cx + 58, g - 144), fill="#B99B7E")
    # massue : manche fuselé, tête nodale grise, clous à reflet
    db.taper([(cx + 50, g - 146), (cx + 55, g - 168), (cx + 58, g - 186)],
             9, 6, BOIS)
    db.smooth_poly([(cx + 42, g - 208), (cx + 56, g - 222), (cx + 74, g - 214),
                    (cx + 78, g - 196), (cx + 64, g - 182), (cx + 46, g - 192)],
                   fill="#6E655C")
    db.smooth_poly([(cx + 42, g - 208), (cx + 56, g - 222), (cx + 66, g - 216),
                    (cx + 54, g - 200), (cx + 46, g - 192)], fill="#7E766C")
    for tx, ty in [(cx + 48, g - 216), (cx + 70, g - 220), (cx + 78, g - 202),
                   (cx + 66, g - 180), (cx + 44, g - 198)]:
        db.ellipse((tx - 3, ty - 3, tx + 3, ty + 3), fill="#4E4438")
        db.ellipse((tx - 1.5, ty - 3, tx + 0.5, ty - 1), fill="#8A8278")

    # bras gauche le long du corps, poing serré
    db.taper([(cx - 26, g - 126), (cx - 36, g - 112), (cx - 38, g - 96)],
             11, 9, "#B99B7E")
    db.taper([(cx - 38, g - 96), (cx - 36, g - 84)], 10, 8, "#B99B7E")
    db.ellipse((cx - 43, g - 86, cx - 29, g - 74), fill="#B99B7E")
    db.rrect((cx - 42, g - 118, cx - 30, g - 108), 3, fill="#6E2A2A")

    # modelés (voiles doux bornés aux pixels peints de la base)
    if img is not None:
        radial(img, cx - 8, g - 160, 15, (255, 255, 255), 55)   # casque
        radial(img, cx - 12, g - 112, 18, (255, 255, 255), 34)  # torse clair
        radial(img, cx + 14, g - 66, 20, (30, 10, 10), 40)      # jupe ombre
        radial(img, cx + 60, g - 204, 15, (255, 255, 255), 45)  # massue
        unit_shading(img, cx, g - 174, g - 40, strength=14)


def unite_barbare_archer(db, da, w, h):
    """256×320 : archer barbare — plumes, arc de chasse ; coiffe + carquois
    ROUGES cuits (aucun accent)."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 46)
    db.rrect((cx - 20, ground - 60, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 60, cx + 20, ground), 7, fill="#4E4438")
    # tunique de peaux courte TEINTE ROUGE — la majeure du sprite
    db.poly([(cx - 28, ground - 122), (cx + 28, ground - 122), (cx + 34, ground - 58),
             (cx - 34, ground - 58)], fill=ROUGE_BARBARE)
    db.poly([(cx - 28, ground - 122), (cx - 8, ground - 122), (cx - 18, ground - 58),
             (cx - 34, ground - 58)], fill=ROUGE_BARBARE_CLAIR)
    db.rrect((cx - 32, ground - 76, cx + 32, ground - 68), 3, fill="#5E4630")
    # tête + coiffe à plumes ROUGE (cuite, plus d'accent)
    db.ellipse((cx - 16, ground - 158, cx + 16, ground - 126), fill="#B99B7E")
    hood = [(cx - 20, ground - 156), (cx - 18, ground - 186), (cx + 2, ground - 196),
            (cx + 20, ground - 184), (cx + 20, ground - 168), (cx + 6, ground - 176),
            (cx - 6, ground - 172), (cx - 12, ground - 156)]
    db.poly(hood, fill=ROUGE_BARBARE)
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
    # carquois ROUGE (cuit, plus d'accent)
    quiver = (cx + 28, ground - 158, cx + 52, ground - 100)
    db.rrect(quiver, 6, fill=ROUGE_BARBARE, outline=INK, width=2)


def village_barbare(db, da, w, h):
    """224×256 : camp barbare — palissade de rondins, deux tentes de peaux
    ROUGE (cuite, aucun accent), feu de camp et pavois ; se distingue nettement
    de la hutte dorée."""
    shadow(db, 112, 210, 92)
    # palissade de rondins derrière le camp
    for x in range(18, 210, 16):
        top = 148 + (8 if (x - 18) % 32 == 0 else 0)
        db.rrect((x, top, x + 9, 212), 2, fill="#5E4630", outline=INK, width=1)
        db.poly([(x, top), (x + 9, top), (x + 4.5, top - 8)], fill="#5E4630",
                outline=INK, width=1)
    # grande tente
    db.poly([(96, 84), (28, 210), (164, 210)], fill=ROUGE_BARBARE)
    db.poly([(96, 84), (28, 210), (96, 210)], fill=ROUGE_BARBARE_CLAIR)
    db.poly([(96, 84), (28, 210), (164, 210)], outline=INK, width=2.5)
    db.poly([(85, 160), (108, 160), (115, 210), (78, 210)], fill="#3E342A")
    db.line([(96, 84), (96, 66)], fill=BOIS, width=4)
    db.ellipse((92, 58, 100, 66), fill="#C8B08A")
    # petite tente
    db.poly([(184, 138), (132, 210), (222, 210)], fill=ROUGE_BARBARE_CLAIR)
    db.poly([(184, 138), (132, 210), (178, 210)], fill=ROUGE_BARBARE)
    db.poly([(184, 138), (132, 210), (222, 210)], outline=INK, width=2.5)
    db.poly([(178, 178), (192, 178), (196, 210), (172, 210)], fill="#3E342A")
    # feu de camp
    db.ellipse((58, 198, 96, 214), fill="#5E4630")
    db.poly([(76, 158), (62, 194), (76, 186), (90, 194)], fill="#C25B3A")
    db.poly([(76, 168), (68, 192), (76, 186), (84, 192)], fill="#D9A93F")
    # pavois planté (butin)
    db.line([(22, 210), (22, 138)], fill=BOIS, width=5)
    db.rrect((10, 140, 34, 170), 3, fill="#6E655C", outline=INK, width=2)


def hutte(db, da, w, h, img=None):
    """224×256 : hutte bonus — cabane de branchages au toit doré (accent) ;
    ouverte par la première unité qui entre sur sa case (R-98)."""
    shadow(db, 112, 212, 66)
    # murs de branchage arrondis, lattes verticales
    db.smooth_poly([(70, 210), (68, 148), (112, 142), (156, 148), (154, 210)],
                   fill="#9C8A6A")
    db.smooth_poly([(70, 210), (68, 148), (112, 142), (118, 146), (110, 210)],
                   fill="#AC9A78")
    for vx in (80, 92, 104, 128, 140):
        db.line([(vx, 150), (vx, 208)], fill="#8A7A5A", width=2)
    # toit de chaume débordant = accent (doré au rendu)
    roof = [(56, 152), (112, 92), (168, 152), (156, 158), (112, 112),
            (68, 158)]
    db.poly(roof, fill="#A3835A", outline=INK, width=2.5)
    da.poly(roof, fill="#FFFFFF")
    # stries de paillis sur le toit
    for rx, lean in [(84, -12), (112, 0), (140, 12)]:
        db.line([(rx, 148), (rx + lean, 116)], fill="#8A6F4A", width=2.4)
    # faîte du toit
    db.smooth_line([(92, 104), (112, 96), (132, 104)], "#C4A472", 3)
    # porte ouverte + lueur du trésor qui déborde sur le sol
    db.rrect((100, 170, 124, 210), 3, fill="#5E4630")
    db.rrect((104, 176, 120, 208), 2, fill="#3E342A")
    db.ellipse((106, 182, 118, 194), fill=OR)
    db.poly([(104, 200), (120, 200), (124, 210), (100, 210)],
            fill=(217, 169, 63, 120))
    # pierres et herbes folles au pied
    db.ellipse((60, 204, 74, 212), fill="#8F8A80")
    db.ellipse((150, 204, 164, 212), fill="#8F8A80")
    db.line([(56, 212), (50, 200)], fill=FORET_2, width=3)
    db.line([(168, 212), (174, 200)], fill=FORET_2, width=3)
    db.line([(64, 214), (60, 206)], fill="#6E9C4A", width=2.4)
    if img is not None:
        radial(img, 112, 196, 26, (255, 224, 130), 70)   # halo du trésor
        radial(img, 130, 110, 22, (255, 244, 200), 40)   # chaume éclairé



# ---------------------------------------------------------------------------
# Phase 7o — Artefacts / reliques (RULES.md §7.10, R-151..R-156).
# 224×256 comme les bâtiments ; socle de pierre commun, relique distinctive
# au-dessus, accent blanc (doré au rendu GameCanvas).
# ---------------------------------------------------------------------------

def artefact_socle(db, da, w, h):
    """Socle de pierre commun + ombre (la relique pose par-dessus)."""
    shadow(db, 112, 216, 64)
    db.rrect((64, 196, 160, 216), 5, fill="#8F8A80", outline=INK, width=2.5)
    db.rrect((74, 188, 150, 200), 4, fill="#A09A90", outline=INK, width=2)


def artefact_angkor_wat(db, da, w, h):
    """Angkor Wat — temple khmer à trois tours dorées (merveille au choix)."""
    artefact_socle(db, da, w, h)
    for dx, h_top, wdt in ((-32, 62, 26), (0, 92, 32), (32, 62, 26)):
        x0, y0 = 112 + dx - wdt // 2, 188 - h_top
        db.rrect((x0, y0, x0 + wdt, 190), 3, fill="#B7A98C", outline=INK, width=2)
        db.rrect((x0, y0 + 10, x0 + wdt, y0 + 14), 0, fill="#8A7A5A")
        spire = [(112 + dx, y0 - 18), (x0, y0), (x0 + wdt, y0)]
        da.poly(spire, fill="#FFFFFF")
        db.poly(spire, outline=INK, width=2)
    db.line([(80, 156), (144, 156)], fill=OR, width=2.5)


def artefact_arche_alliance(db, da, w, h):
    """Arche d'Alliance — coffre d'acacia doré porté par deux bâtons."""
    artefact_socle(db, da, w, h)
    db.rrect((66, 122, 72, 190), 0, fill="#6B5433", outline=INK, width=2)
    db.rrect((152, 122, 158, 190), 0, fill="#6B5433", outline=INK, width=2)
    db.rrect((74, 132, 150, 190), 4, fill="#9A7B3C", outline=INK, width=2.5)
    db.rrect((70, 120, 154, 136), 6, fill="#A8862C", outline=INK, width=2.5)
    da.rrect((70, 120, 154, 134), 6, fill="#FFFFFF")
    da.ellipse((104, 150, 120, 166), fill="#FFFFFF")
    db.ellipse((106, 152, 118, 164), fill=OR_SOMBRE)


def artefact_sept_cites_or(db, da, w, h):
    """Sept Cités d'Or — cité dorée aux trois dômes (trésor selon l'ère)."""
    artefact_socle(db, da, w, h)
    for dx, r in ((-28, 17), (0, 25), (28, 17)):
        cx = 112 + dx
        cy = 188 - r
        db.ellipse((cx - r, cy - r, cx + r, cy + r), fill="#C0A050", outline=INK, width=2)
        dome = [(cx - r, cy - 2), (cx, cy - 2 * r - 12), (cx + r, cy - 2)]
        da.poly(dome, fill="#FFFFFF")
        db.rrect((cx - r + 4, cy + r - 6, cx + r - 4, 190), 0, fill="#B7A98C")
    db.poly([(76, 196), (148, 196), (154, 212), (70, 212)], fill="#8A6D35", outline=INK, width=2)


def artefact_ecole_confucius(db, da, w, h):
    """École de Confucius — rouleaux de bambou et tablette des maîtres."""
    artefact_socle(db, da, w, h)
    db.rrect((68, 128, 156, 190), 4, fill="#C4A874", outline=INK, width=2.5)
    for i in range(3):
        y = 142 + i * 14
        db.line([(80, y), (144, y)], fill="#6B5433", width=2.5)
    da.rrect((68, 128, 156, 138), 0, fill="#FFFFFF")
    db.rrect((64, 122, 160, 132), 4, fill="#7A5C3A", outline=INK, width=2)
    db.rrect((64, 184, 160, 194), 4, fill="#7A5C3A", outline=INK, width=2)


def artefact_chevaliers_templiers(db, da, w, h):
    """Chevaliers Templiers — écu de croisé à croix dorée (unité selon l'ère)."""
    artefact_socle(db, da, w, h)
    shield = [(76, 116), (148, 116), (148, 168), (112, 196), (76, 168)]
    db.poly(shield, fill="#8A8A96", outline=INK, width=2.5)
    da.rrect((105, 120, 119, 186), 0, fill="#FFFFFF")
    da.rrect((84, 140, 140, 154), 0, fill="#FFFFFF")
    for x in (84, 112, 140):
        db.ellipse((x - 3, 120, x + 3, 126), fill=GRIS_NEUTRE)


def artefact_atlantide(db, da, w, h):
    """Cité Perdue d'Atlantide — temple englouti, flots sur le flanc (haute mer)."""
    artefact_socle(db, da, w, h)
    db.rrect((86, 110, 138, 186), 0, fill="#6E7A86", outline=INK, width=2.5)
    db.rrect((98, 126, 126, 142), 0, fill="#4E5A66")
    db.rrect((98, 152, 126, 168), 0, fill="#4E5A66")
    spire = [(112, 88), (86, 112), (138, 112)]
    db.poly(spire, fill="#5E6A76", outline=INK, width=2.5)
    da.poly(spire, fill="#FFFFFF")
    # flots montants (l'océan la garde — activation navale adjacente, R-153)
    for y in (168, 182):
        db.line([(70, y), (94, y - 6), (118, y), (142, y - 6), (166, y)], fill=EAU_2, width=4)
    da.ellipse((70, 176, 166, 194), fill="#9CC4E4")


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
    _gp_carrure(db, cx, ground - 128, 30, "#6E82A0")
    db.rrect((cx - 6, ground - 146, cx + 6, ground - 124), 3, fill="#B99B7E",
             outline=INK, width=1.5)
    db.ellipse((cx - 18, ground - 164, cx + 16, ground - 132), fill="#B99B7E")
    db.pieslice((cx - 20, ground - 170, cx + 18, ground - 138), 180, 360, fill=GRIS_ARMURE)
    _gp_yeux(db, cx - 1, ground - 150)
    db.line([(cx - 6, ground - 140), (cx + 4, ground - 140)], fill=INK, width=1.5)
    # bras droit agrippé à la pique
    db.line([(cx + 30, ground - 96), (cx + 84, ground - 230)], fill=BOIS, width=7)
    db.poly([(cx + 80, ground - 238), (cx + 90, ground - 226), (cx + 78, ground - 222)],
            fill=GRIS_ARMURE, outline=INK, width=1)
    _gp_bras(db, [(cx + 24, ground - 116), (cx + 50, ground - 150)], "#5B6E8C")
    db.ellipse((cx + 44, ground - 158, cx + 56, ground - 146), fill="#B99B7E",
               outline=INK, width=1.5)
    # bras gauche (vers la rondache)
    _gp_bras(db, [(cx - 24, ground - 116), (cx - 44, ground - 98)], "#5B6E8C")
    buckler = (cx - 86, ground - 136, cx - 22, ground - 66)
    db.ellipse(buckler, fill=GRIS_ARMURE, outline=INK, width=3)
    db.ellipse((cx - 66, ground - 116, cx - 42, ground - 88), outline=OR, width=3)
    da.ellipse(buckler, fill="#FFFFFF")


def unite_milice(db, da, w, h):
    """256x320, Milice (nouvelle) : fantassin citadin — gambison, rondache
    (accent) et lance courte."""
    cx, ground = 120, 300
    shadow(db, cx, ground + 4, 48)
    db.rrect((cx - 22, ground - 56, cx - 6, ground), 7, fill="#5E4E3A")
    db.rrect((cx + 6, ground - 56, cx + 22, ground), 7, fill="#5E4E3A")
    db.poly([(cx - 28, ground - 124), (cx + 28, ground - 124), (cx + 34, ground - 56),
             (cx - 34, ground - 56)], fill="#A98F63", outline=INK, width=2)
    db.poly([(cx - 28, ground - 124), (cx - 8, ground - 124), (cx - 16, ground - 56),
             (cx - 34, ground - 56)], fill="#8F7B57")
    _gp_carrure(db, cx, ground - 124, 28, "#8F7B57")
    db.rrect((cx - 6, ground - 142, cx + 6, ground - 120), 3, fill="#B99B7E",
             outline=INK, width=1.5)
    db.ellipse((cx - 16, ground - 160, cx + 16, ground - 128), fill="#B99B7E")
    db.pieslice((cx - 18, ground - 166, cx + 18, ground - 136), 180, 360,
                fill="#6B5230")
    _gp_yeux(db, cx, ground - 146)
    db.line([(cx - 5, ground - 136), (cx + 5, ground - 136)], fill=INK, width=1.5)
    # lance courte, main droite dessus
    db.line([(cx + 38, ground - 30), (cx + 50, ground - 186)], fill=BOIS, width=6)
    db.poly([(cx + 44, ground - 192), (cx + 56, ground - 180), (cx + 46, ground - 176)],
            fill=GRIS_ARMURE, outline=INK, width=1)
    _gp_bras(db, [(cx + 22, ground - 114), (cx + 44, ground - 116)], "#A98F63")
    db.ellipse((cx + 38, ground - 124, cx + 52, ground - 110), fill="#B99B7E",
               outline=INK, width=1.5)
    # bras gauche + rondache (accent)
    _gp_bras(db, [(cx - 22, ground - 114), (cx - 42, ground - 98)], "#A98F63")
    buckler = (cx - 82, ground - 132, cx - 22, ground - 66)
    db.ellipse(buckler, fill="#6E655C", outline=INK, width=3)
    db.ellipse((cx - 64, ground - 112, cx - 40, ground - 88), fill="#8F8478")
    db.ellipse((cx - 56, ground - 104, cx - 48, ground - 96), fill=INK)
    da.ellipse(buckler, fill="#FFFFFF")


def unite_catapulte(db, da, w, h):
    """256x320, mangonneau : bundle de torsion, bras incliné cuillère chargée
    (bras + cuillère + rocher = accent), treuil et réserve de projectiles."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 100)
    # train de roues à rayons
    for x in (55, 147):
        db.ellipse((x, ground - 64, x + 58, ground - 6), fill="#6E4626",
                   outline=INK, width=2.5)
        for a in (0, 45, 90, 135):
            r = math.radians(a)
            hx, hy = x + 29, ground - 35
            dx, dy = 21 * math.cos(r), 21 * math.sin(r)
            db.line([(hx - dx, hy - dy), (hx + dx, hy + dy)], fill="#8A5A34", width=4)
        db.ellipse((x + 21, ground - 43, x + 37, ground - 27), fill="#8A5A34",
                   outline=INK, width=1.5)
    # châssis robuste
    db.rrect((44, ground - 100, 214, ground - 60), 5, fill=BOIS, outline=INK, width=2.5)
    for x in (60, 92, 124, 156, 188, 206):
        db.line([(x, ground - 96), (x, ground - 64)], fill=BOIS_CLAIR, width=4)
    # bundle de torsion : colonne de cordages + cheville centrale
    for y in (ground - 150, ground - 136, ground - 122):
        db.ellipse((66, y, 102, y + 20), fill=SABLE, outline=INK, width=2)
        db.arc((70, y + 3, 98, y + 17), 200, 340, fill="#B99B5E", width=2)
    db.line([(84, ground - 158), (84, ground - 106)], fill=BOIS, width=6)
    # bras de lancer incliné, cuillère chargée en bout (accent)
    db.line([(84, ground - 130), (164, ground - 240)], fill=INK, width=15)
    db.line([(84, ground - 130), (164, ground - 240)], fill=BOIS, width=9)
    db.poly([(142, ground - 250), (182, ground - 236), (170, ground - 210),
             (136, ground - 226)], fill="#6E4626", outline=INK, width=2)
    db.ellipse((148, ground - 258, 176, ground - 236), fill=MONTAGNE_1,
               outline=INK, width=1)
    da.line([(84, ground - 130), (164, ground - 240)], fill="#FFFFFF", width=9)
    da.poly([(142, ground - 250), (182, ground - 236), (170, ground - 210),
             (136, ground - 226)], fill="#FFFFFF")
    da.ellipse((148, ground - 258, 176, ground - 236), fill="#FFFFFF")
    # étrésillon qui raidit le bras
    db.line([(150, ground - 96), (138, ground - 180)], fill=BOIS, width=6)
    # treuil arrière + corde de bande
    db.line([(118, ground - 178), (192, ground - 100)], fill=SABLE, width=3)
    db.rrect((186, ground - 104, 210, ground - 80), 3, fill="#6B5230", outline=INK, width=1.5)
    db.line([(198, ground - 106), (198, ground - 78)], fill=BOIS, width=4)
    # réserve de projectiles à l'arrière
    db.ellipse((168, ground - 122, 194, ground - 100), fill=MONTAGNE_1, outline=INK, width=1)
    db.ellipse((188, ground - 114, 212, ground - 92), fill=MONTAGNE_2, outline=INK, width=1)
    db.ellipse((178, ground - 112, 200, ground - 92), fill=MONTAGNE_1, outline=INK, width=1)


def unite_chevalier(db, da, w, h):
    """256x320, cavalier lourd : destrier bardé de plates (barding = accent),
    chevalier en heaume fermé, lance au repos."""
    cx, ground = 128, 296
    shadow(db, cx, ground + 6, 84)
    # ---- destrier : robe brune visible, plaques d'armure par-dessus
    body = [(48, ground - 118), (200, ground - 118), (212, ground - 78),
            (192, ground - 58), (60, ground - 58), (40, ground - 80)]
    db.poly(body, fill="#8A5A34")
    db.poly([(48, ground - 118), (130, ground - 118), (124, ground - 58),
             (60, ground - 58), (40, ground - 80)], fill="#A06A40")
    for x in (56, 92, 148, 182):
        db.rrect((x, ground - 62, x + 14, ground), 5, fill="#6E4626")
    # crinet : plaques sur la crinière
    crinet = [(178, ground - 132), (196, ground - 116), (188, ground - 88), (172, ground - 104)]
    db.poly(crinet, fill=GRIS_ARMURE, outline=INK, width=1.5)
    # encolure + tête brune, chanfrain plaqué devant
    db.poly([(182, ground - 126), (214, ground - 118), (218, ground - 84),
             (188, ground - 88)], fill="#8A5A34")
    db.ellipse((208, ground - 118, 244, ground - 86), fill="#8A5A34")
    db.poly([(214, ground - 118), (224, ground - 132), (232, ground - 116)],
            fill="#8A5A34")
    db.poly([(214, ground - 116), (244, ground - 108), (240, ground - 88),
             (212, ground - 98)], fill=GRIS_ARMURE, outline=INK, width=1.5)
    db.line([(218, ground - 104), (238, ground - 98)], fill=INK, width=2)
    db.ellipse((216, ground - 112, 224, ground - 106), fill=INK)
    db.line([(44, ground - 100), (24, ground - 66)], fill="#4E3822", width=7)
    # peytral (plastron de poitrail)
    db.poly([(186, ground - 122), (208, ground - 112), (204, ground - 86),
             (182, ground - 92)], fill=GRIS_ARMURE, outline=INK, width=1.5)
    # ---- chevalier en armure complète
    rider = 92
    db.rrect((rider + 8, ground - 96, rider + 24, ground - 58), 6, fill="#6E6E78")
    db.poly([(rider - 14, ground - 190), (rider + 22, ground - 190),
             (rider + 30, ground - 108), (rider - 22, ground - 108)], fill=GRIS_ARMURE)
    db.poly([(rider - 14, ground - 190), (rider + 2, ground - 190),
             (rider - 8, ground - 108), (rider - 22, ground - 108)], fill="#84848E")
    # heaume fermé : fente de visière, trous de respiration, cimier
    db.rrect((rider + 2, ground - 202, rider + 14, ground - 186), 3,
             fill=GRIS_ARMURE, outline=INK, width=1.5)
    db.ellipse((rider - 8, ground - 222, rider + 22, ground - 192), fill=GRIS_ARMURE,
               outline=INK, width=1.5)
    db.rrect((rider - 2, ground - 210, rider + 20, ground - 204), 1, fill=INK)
    for hx in (rider + 4, rider + 10, rider + 16):
        db.ellipse((hx, ground - 198, hx + 3, ground - 195), fill=INK)
    db.poly([(rider + 4, ground - 228), (rider + 10, ground - 244),
             (rider + 16, ground - 228)], fill=ROUGE_JOUEUR, outline=INK, width=1)
    # bras d'armure, lance couchée en arrêt
    _gp_bras(db, [(rider + 24, ground - 172), (rider + 58, ground - 152)], GRIS_ARMURE)
    db.line([(rider + 50, ground - 158), (rider + 98, ground - 142)], fill=BOIS, width=6)
    db.poly([(rider + 96, ground - 146), (rider + 114, ground - 140),
             (rider + 98, ground - 132)], fill=GRIS_ARMURE, outline=INK, width=1)
    # caparaçon sur le flanc = accent
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
    _gp_carrure(db, cx, ground - 126, 28, "#4C5E74")
    db.rrect((cx - 6, ground - 144, cx + 6, ground - 122), 3, fill="#B99B7E",
             outline=INK, width=1.5)
    db.ellipse((cx - 16, ground - 160, cx + 16, ground - 130), fill="#B99B7E")
    _gp_yeux(db, cx, ground - 148)
    db.line([(cx - 5, ground - 138), (cx + 5, ground - 138)], fill=INK, width=1.5)
    db.poly([(cx - 30, ground - 152), (cx + 30, ground - 152), (cx + 22, ground - 172),
             (cx - 22, ground - 172)], fill="#2B2620", outline=INK, width=1)
    db.rrect((cx - 30, ground - 158, cx + 30, ground - 152), 2, fill=OR)
    # bras + fusil tenu à deux mains
    _gp_bras(db, [(cx - 24, ground - 116), (cx + 14, ground - 130)], "#3C4A5C")
    db.line([(cx - 52, ground - 70), (cx + 58, ground - 150)], fill=BOIS, width=7)
    db.line([(cx + 40, ground - 138), (cx + 76, ground - 164)], fill=GRIS_ARMURE, width=4)
    da.line([(cx - 52, ground - 70), (cx + 58, ground - 150)], fill="#FFFFFF", width=7)
    da.line([(cx + 40, ground - 138), (cx + 76, ground - 164)], fill="#FFFFFF", width=4)
    _gp_bras(db, [(cx + 24, ground - 114), (cx - 8, ground - 112)], "#3C4A5C")
    db.ellipse((cx + 12, ground - 127, cx + 24, ground - 115), fill="#B99B7E",
               outline=INK, width=1.5)
    db.ellipse((cx - 16, ground - 106, cx - 4, ground - 94), fill="#B99B7E",
               outline=INK, width=1.5)
    db.rrect((cx - 46, ground - 100, cx - 20, ground - 72), 4, fill="#7E6A48", outline=INK, width=1.5)


def unite_canon(db, da, w, h):
    """256x320, obusier moderne : tube long à frein de bouche, caisse blindée,
    grandes roues, bêche d'appui, pile d'obus (tube + frein = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 100)
    # châssis + deux grandes roues
    db.rrect((86, ground - 112, 204, ground - 70), 6, fill="#7A7E5E",
             outline=INK, width=2.5)
    for x in (56, 150):
        db.ellipse((x, ground - 72, x + 70, ground - 2), fill="#3E3E42",
                   outline=INK, width=2.5)
        db.ellipse((x + 14, ground - 58, x + 56, ground - 16), fill="#55555C",
                   outline=INK, width=1.5)
        db.ellipse((x + 28, ground - 44, x + 42, ground - 30), fill="#7A7E5E",
                   outline=INK, width=1.5)
    # bêche d'appui arrière
    db.poly([(92, ground - 104), (30, ground - 46), (38, ground - 36),
             (100, ground - 92)], fill="#6E7452", outline=INK, width=2)
    db.poly([(24, ground - 48), (46, ground - 40), (40, ground - 28),
             (20, ground - 34)], fill="#5A6046", outline=INK, width=1.5)
    # caisse blindée + optique
    db.rrect((92, ground - 178, 150, ground - 106), 5, fill="#6E7452",
             outline=INK, width=2.5)
    db.rrect((98, ground - 170, 144, ground - 128), 3, fill="#5A6046")
    db.rrect((100, ground - 202, 120, ground - 176), 3, fill="#6E7452",
             outline=INK, width=2)
    db.ellipse((105, ground - 197, 113, ground - 189), fill="#8FB4CC",
               outline=INK, width=1)
    db.line([(96, ground - 168), (90, ground - 138)], fill=INK, width=2)
    # tube long avec frein de bouche (accent)
    db.line([(126, ground - 190), (224, ground - 234)], fill=INK, width=18)
    db.line([(126, ground - 190), (224, ground - 234)], fill="#5C5C64", width=12)
    db.rrect((214, ground - 246, 246, ground - 214), 5, fill="#4A4A52",
             outline=INK, width=2)
    db.line([(224, ground - 240), (238, ground - 232)], fill=INK, width=3)
    db.line([(222, ground - 230), (236, ground - 222)], fill=INK, width=3)
    da.line([(126, ground - 190), (224, ground - 234)], fill="#FFFFFF", width=12)
    da.rrect((214, ground - 246, 246, ground - 214), 5, fill="#FFFFFF")
    # récupérateur au-dessus du tube
    db.line([(118, ground - 206), (168, ground - 228)], fill=INK, width=11)
    db.line([(118, ground - 206), (168, ground - 228)], fill="#6E6E78", width=6)
    # pile d'obus à droite
    for sx in (204, 222, 240):
        db.rrect((sx, ground - 36, sx + 14, ground - 4), 2, fill="#7A7E5E",
                 outline=INK, width=1.5)
        db.rrect((sx, ground - 18, sx + 14, ground - 12), 1, fill="#B99B5E")
        db.poly([(sx, ground - 36), (sx + 7, ground - 50), (sx + 14, ground - 36)],
                fill=OR_SOMBRE, outline=INK, width=1)


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
    _gp_yeux(db, cx, ground - 146)
    db.line([(cx - 5, ground - 136), (cx + 5, ground - 136)], fill=INK, width=1.5)
    # bras + fusil d'assaut tenu à deux mains
    _gp_bras(db, [(cx - 22, ground - 108), (cx + 24, ground - 110)], "#55624E")
    db.line([(cx + 24, ground - 96), (cx + 74, ground - 118)], fill="#3E342A", width=7)
    db.rrect((cx + 58, ground - 126, cx + 84, ground - 112), 2, fill="#2B2620")
    db.rrect((cx + 28, ground - 92, cx + 40, ground - 78), 2, fill="#2B2620")
    _gp_bras(db, [(cx + 20, ground - 112), (cx + 44, ground - 112)], "#55624E")
    db.ellipse((cx + 30, ground - 108, cx + 42, ground - 96), fill="#B99B7E",
               outline=INK, width=1.5)
    db.ellipse((cx + 42, ground - 113, cx + 54, ground - 101), fill="#B99B7E",
               outline=INK, width=1.5)


def unite_char_d_assaut(db, da, w, h):
    """256x320, char lourd : chenilles à galets, caisse inclinée, tourelle +
    canon à frein de bouche (tourelle/canon = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 104)
    # chenilles + galets
    db.rrect((24, ground - 66, 232, ground - 14), 22, fill="#3E342A", outline=INK, width=2.5)
    for x in (48, 78, 108, 138, 168, 198):
        db.ellipse((x, ground - 54, x + 20, ground - 30), fill="#6E6E78", outline=INK, width=1.5)
        db.ellipse((x + 6, ground - 48, x + 14, ground - 36), fill="#3E342A")
    # caisse avant inclinée
    db.poly([(30, ground - 62), (226, ground - 62), (214, ground - 106),
             (42, ground - 106)], fill="#55624E", outline=INK, width=2.5)
    db.poly([(42, ground - 106), (96, ground - 106), (92, ground - 62), (30, ground - 62)],
            fill="#63705A")
    # tourelle inclinée + écoutille + antenne (accent)
    turret = [(98, ground - 152), (176, ground - 152), (192, ground - 106), (82, ground - 106)]
    db.poly(turret, fill="#55624E", outline=INK, width=2.5)
    db.ellipse((118, ground - 168, 148, ground - 154), fill="#63705A", outline=INK, width=1.5)
    db.line([(150, ground - 158), (156, ground - 182)], fill=INK, width=2)
    da.poly(turret, fill="#FFFFFF")
    da.ellipse((118, ground - 168, 148, ground - 154), fill="#FFFFFF")
    # canon à frein de bouche (accent)
    db.line([(176, ground - 132), (240, ground - 140)], fill=INK, width=12)
    db.line([(176, ground - 132), (240, ground - 140)], fill="#3E342A", width=7)
    db.rrect((234, ground - 150, 252, ground - 126), 3, fill="#3E342A", outline=INK, width=1.5)
    da.line([(176, ground - 132), (240, ground - 140)], fill="#FFFFFF", width=7)
    da.rrect((234, ground - 150, 252, ground - 126), 3, fill="#FFFFFF")


def unite_artillerie(db, da, w, h):
    """256x320, artillerie moderne : long tube à frein de bouche sur châssis
    motorisé, caisse blindée (tube = accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 104)
    # châssis + trois essieux
    db.rrect((36, ground - 84, 212, ground - 36), 8, fill="#7A7E5E", outline=INK, width=2.5)
    for x in (44, 100, 156):
        db.ellipse((x, ground - 62, x + 44, ground - 18), fill="#3E3E42", outline=INK, width=2)
        db.ellipse((x + 10, ground - 52, x + 34, ground - 28), fill="#55555C")
        db.ellipse((x + 17, ground - 45, x + 27, ground - 35), fill="#7A7E5E")
    # caisse blindée arrière
    db.rrect((44, ground - 158, 108, ground - 80), 5, fill="#6E7452", outline=INK, width=2.5)
    db.rrect((52, ground - 148, 100, ground - 112), 3, fill="#5A6046")
    # caisse de munitions sur le pont
    db.rrect((150, ground - 108, 196, ground - 82), 3, fill="#6E7452", outline=INK, width=1.5)
    # tube long vers le haut (accent) + frein de bouche
    db.line([(120, ground - 140), (222, ground - 238)], fill=INK, width=17)
    db.line([(120, ground - 140), (222, ground - 238)], fill="#5C5C64", width=11)
    db.rrect((212, ground - 250, 244, ground - 218), 5, fill="#4A4A52", outline=INK, width=2)
    db.line([(220, ground - 242), (236, ground - 234)], fill=INK, width=3)
    db.line([(218, ground - 232), (234, ground - 224)], fill=INK, width=3)
    da.line([(120, ground - 140), (222, ground - 238)], fill="#FFFFFF", width=11)
    da.rrect((212, ground - 250, 244, ground - 218), 5, fill="#FFFFFF")
    # récupérateur
    db.line([(114, ground - 158), (162, ground - 206)], fill=INK, width=10)
    db.line([(114, ground - 158), (162, ground - 206)], fill="#6E6E78", width=5)


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
    pts = []
    for i in range(10):
        a = math.radians(-90 + i * 36)
        r = 14 if i % 2 == 0 else 6
        pts.append((32 + r * math.cos(a), 32 + r * math.sin(a)))
    d.poly(pts, fill=OR_SOMBRE)
    _shine(d, 22, 21, 2.5)


def _bowl(d, cx, y, r, fill=COMMERCE):
    """Demi-disque (godet de balance) : corde + arc inférieur."""
    pts = [(cx - r, y)]
    for i in range(1, 9):
        a = math.pi * i / 8
        pts.append((cx + r * math.cos(a), y + r * math.sin(a)))
    pts.append((cx + r, y))
    d.poly(pts, fill=fill, outline=INK, width=2.5)


def icone_commerce(d):
    """Commerce (Phase 6) : balance de marchand — répartition or/science."""
    # pilier + embase à deux marches
    d.line([(32, 14), (32, 50)], fill=INK, width=8)
    d.line([(32, 14), (32, 50)], fill=BOIS, width=4.5)
    d.line([(30.5, 16), (30.5, 48)], fill=BOIS_CLAIR, width=1.5)
    d.rrect((22, 48, 42, 55), 2, fill=BOIS, outline=INK, width=2)
    d.rrect((17, 53, 47, 60), 2, fill=BOIS_CLAIR, outline=INK, width=2)
    # pivot losange
    d.poly([(32, 5), (38, 12), (32, 19), (26, 12)], fill=COMMERCE,
           outline=INK, width=2)
    _shine(d, 31, 10, 1.5)
    # fléau avec boutons dorés aux extrémités
    d.line([(12, 24), (52, 24)], fill=INK, width=7)
    d.line([(12, 24), (52, 24)], fill=BOIS, width=4)
    d.line([(14, 24), (50, 24)], fill=BOIS_CLAIR, width=1.5)
    d.ellipse((8, 20, 16, 28), fill=OR, outline=INK, width=2)
    d.ellipse((48, 20, 56, 28), fill=OR, outline=INK, width=2)
    _shine(d, 10.5, 22, 1.5)
    _shine(d, 50.5, 22, 1.5)
    # chaînes claires + godets larges et clairs, pièce d'or dedans
    for cx in (12, 52):
        d.line([(cx, 26), (cx - 8, 39)], fill=SABLE, width=2)
        d.line([(cx, 26), (cx + 8, 39)], fill=SABLE, width=2)
        _bowl(d, cx, 40, 9, fill="#D8B276")
        d.line([(cx - 9, 40), (cx + 9, 40)], fill=BOIS, width=2)
        d.ellipse((cx - 4, 43, cx + 4, 50), fill=OR, outline=INK, width=1.5)
        _shine(d, cx - 1, 45, 1.5)


def icone_science(d):
    """Science : erlenmeyer — verre clair, liquide, bulles et reflet."""
    # verre
    d.poly([(26, 8), (38, 8), (38, 26), (52, 50), (12, 50), (26, 26)],
           fill="#D8ECF2", outline=INK, width=2.5)
    # liquide à surface plate
    d.poly([(20.5, 36), (43.5, 36), (52, 50), (12, 50)], fill=SCIENCE,
           outline=INK, width=2)
    d.ellipse((26, 41, 31, 46), fill="#A8CCDA")
    d.ellipse((35, 43, 39, 47), fill="#A8CCDA")
    # reflet sur le verre
    d.line([(22, 30), (16, 42)], fill="#FFFFFF", width=2)
    _shine(d, 25, 31, 1.5)
    # collerette métallique du goulot
    d.rrect((23, 4, 41, 11), 2, fill="#9A9AA0", outline=INK, width=2)
    _shine(d, 27, 7, 1.2)


def icone_nourriture(d):
    """Nourriture : pomme verte (lecture Civ VI), tige + feuille + reflet."""
    d.ellipse((13, 19, 51, 57), fill=NOURRITURE, outline=INK, width=2.5)
    # creux du haut + tige
    d.ellipse((26, 17, 38, 25), fill="#7A9340")
    d.line([(31, 20), (29, 8)], fill=INK, width=5)
    d.line([(31, 20), (29, 8)], fill=BOIS, width=2.5)
    # feuille
    d.poly([(34, 17), (46, 7), (51, 15), (39, 23)], fill="#6E8438",
           outline=INK, width=2)
    d.line([(36, 18), (47, 11)], fill="#4E6A2A", width=1.5)
    # reflet
    d.ellipse((19, 26, 29, 40), fill="#C4DA82")


def icone_production(d):
    """Production : marteau de forgeron devant un engrenage."""
    # engrenage en arrière-plan
    d.ellipse((14, 22, 46, 54), fill=PRODUCTION, outline=INK, width=2.5)
    for i in range(8):
        a = math.radians(i * 45)
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -math.sin(a), math.cos(a)
        pts = []
        for r, t in [(14, -6), (21, -5), (21, 5), (14, 6)]:
            pts.append((30 + r * ux + t * vx, 38 + r * uy + t * vy))
        d.poly(pts, fill=PRODUCTION, outline=INK, width=2)
    d.ellipse((23, 31, 37, 45), fill="#7E6140", outline=INK, width=2)
    # manche du marteau (contour puis bois)
    d.line([(14, 50), (44, 20)], fill=INK, width=9)
    d.line([(14, 50), (44, 20)], fill=BOIS, width=5)
    d.line([(16, 48), (42, 22)], fill=BOIS_CLAIR, width=2)
    # tête métal, perpendiculaire au manche
    u = (0.707, 0.707)   # le long de la tête
    v = (-0.707, 0.707)  # épaisseur
    c = (46, 18)
    head = [tuple(c[i] + s1 * 12 * u[i] + s2 * 6 * v[i] for i in (0, 1))
            for s1, s2 in [(1, -1), (1, 1), (-1, 1), (-1, -1)]]
    d.poly(head, fill="#9A9AA0", outline=INK, width=2.5)
    c2 = (c[0] - 2.5 * v[0], c[1] - 2.5 * v[1])
    shine = [tuple(c2[i] + s1 * 9 * u[i] + s2 * 2.5 * v[i] for i in (0, 1))
             for s1, s2 in [(1, -1), (1, 1), (-1, 1), (-1, -1)]]
    d.poly(shine, fill="#C9CCD4")


def icone_pv(d):
    d.poly([(32, 56), (10, 34), (10, 20), (20, 12), (32, 20), (44, 12), (54, 20),
            (54, 34)], fill=PV, outline=INK, width=2.5)
    d.ellipse((15, 19, 27, 31), fill="#E89898")
    _shine(d, 20, 22, 2)


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
    """Aluminium : un seul gros tuyau creux, ouverte vers le haut-droite."""
    x0, y0, x1, y1 = 12, 50, 48, 26
    # corps en capsule : contour INK puis métal, bouts arrondis continus
    d.line([(x0, y0), (x1, y1)], fill=INK, width=21)
    for x, y in ((x0, y0), (x1, y1)):
        d.ellipse((x - 10, y - 10, x + 10, y + 10), fill=INK)
    d.line([(x0, y0), (x1, y1)], fill="#C9CCD4", width=15)
    for x, y in ((x0, y0), (x1, y1)):
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill="#C9CCD4")
    # ombre portée du flanc inférieur + reflet du flanc supérieur
    d.line([(x0 + 2, y0 + 4), (x1 - 4, y1 + 3)], fill="#8A8A92", width=4)
    d.line([(x0 + 2, y0 - 4), (x1 - 4, y1 - 3)], fill="#E8EBF0", width=4)
    # ouverture proche : couronne + âme sombre, lueur qui traverse au fond
    d.ellipse((x1 - 9, y1 - 13, x1 + 9, y1 + 13), fill="#C9CCD4", outline=INK, width=2)
    d.ellipse((x1 - 5, y1 - 8, x1 + 5, y1 + 8), fill="#3E3E50")
    _shine(d, x1 - 2, y1 - 5, 1.6)
    # ouverture : couronne + âme sombre
    d.ellipse((x1 - 9, y1 - 13, x1 + 9, y1 + 13), fill="#C9CCD4", outline=INK, width=2)
    d.ellipse((x1 - 5, y1 - 8, x1 + 5, y1 + 8), fill="#3E3E50")


def res_baleine(db, da=None, w=64, h=64, img=None):
    """Baleine : grande baleinebleue occupant presque toute la tuile —
    nettement plus grosse que le poisson (échelle relative lisible).
    Silhouette lissée, ventre rayé de plis gular, modelés dégradés."""
    # nageoire pectorale (derrière le corps)
    pect = [(26, 38), (22, 48), (30, 46), (34, 40)]
    db.smooth_poly(pect, fill="#4A78A0")
    db.smooth_line(pect + [pect[0]], fill=INK, width=1.5)
    # nageoire caudale (grande queue fourchue) — dessinée AVANT le corps
    # pour que le corps recouvre l'attache (pas de couture)
    queue = [(46, 28), (61, 12), (63, 17), (55, 28), (62, 41), (55, 45), (46, 36)]
    db.smooth_poly(queue, fill="#4A78A0")
    db.smooth_line(queue + [queue[0]], fill=INK, width=2)
    # corps massif : dos arqué du museau à la queue
    corps = [(3, 32), (4, 22), (14, 13), (30, 9), (44, 13), (53, 22),
             (55, 30), (50, 39), (38, 46), (22, 48), (10, 44)]
    db.smooth_poly(corps, fill="#5E8CB4")
    db.smooth_line(corps + [corps[0]], fill=INK, width=2)
    # ventre clair (plis gular)
    db.smooth_poly([(5, 36), (14, 44), (28, 47), (40, 44), (48, 37), (46, 34),
                    (34, 40), (18, 41), (9, 34)],
                   fill="#A8C6DE", outline=None)
    for i, y in enumerate((36, 39, 42)):
        db.smooth_line([(6 + i, y), (40 + i * 2, y + 2 - i)],
                       fill="#7FA9CC", width=1.4)
    # bouche + œil + évent
    db.smooth_line([(3, 34), (14, 40), (26, 42)], fill=INK, width=1.8)
    db.ellipse((13, 24, 17, 28), fill=INK)
    db.smooth_line([(22, 9), (20, 4)], fill=INK, width=1.6)
    # jet d'eau : double panache vertical + gouttes
    if img is not None:
        vgrad(img, (3, 9, 53, 30), (255, 255, 255), 26, 0, steps=14)
        radial(img, 18, 15, 10, (255, 255, 255), 30, steps=7)
    db.smooth_line([(20, 9), (18, 4), (15, 1)], fill=EAU_2, width=2.4)
    db.smooth_line([(22, 9), (25, 4), (27, 1)], fill=EAU_2, width=2.4)
    db.ellipse((12, 0, 15, 3), fill=EAU_2)
    db.ellipse((28, 0, 31, 3), fill=EAU_2)


def res_betail(d):
    """Bétail : vache blanche à taches, vue de profil vers la droite."""
    # pattes + queue
    for x in (14, 24, 34, 42):
        d.rrect((x, 44, x + 6, 58), 2, fill="#F2F0E8", outline=INK, width=1.5)
    d.line([(10, 30), (5, 46)], fill=INK, width=2)
    # corps + taches
    d.ellipse((8, 24, 46, 48), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((16, 32, 28, 44), fill="#8A5A34")
    d.ellipse((30, 26, 40, 36), fill="#8A5A34")
    # tête + museau rose
    d.ellipse((38, 14, 60, 34), fill="#F2F0E8", outline=INK, width=2)
    d.ellipse((40, 14, 52, 24), fill="#8A5A34")
    d.ellipse((50, 26, 62, 36), fill="#E3B8A0", outline=INK, width=1.5)
    d.ellipse((55, 29, 58, 32), fill=INK)
    d.ellipse((46, 22, 50, 26), fill=INK)
    # oreille + corne
    d.ellipse((36, 12, 44, 20), fill="#F2F0E8", outline=INK, width=1.5)
    d.poly([(52, 10), (48, 2), (58, 8)], fill="#D9C04A", outline=INK, width=1.2)


def res_ble(d):
    """Blé : gerbe liée, deux feuilles, trois épis aux arêtes fines."""
    # feuilles
    d.poly([(30, 58), (16, 30), (24, 28), (34, 50)], fill="#B8A85E",
           outline=INK, width=1.2)
    d.poly([(34, 58), (48, 30), (40, 28), (30, 50)], fill="#B8A85E",
           outline=INK, width=1.2)
    # tiges en éventail
    for x_top, x_base in ((22, 24), (32, 32), (42, 40)):
        d.line([(x_base, 58), (x_top, 26)], fill="#B8892B", width=2.5)
    # épis latéraux
    for hx in (22, 42):
        for i in range(2):
            d.ellipse((hx - 5, 14 + i * 7, hx + 5, 14 + i * 7 + 9), fill=OR,
                      outline="#8A641C", width=1.2)
        d.line([(hx, 14), (hx - 3, 6)], fill="#C8A040", width=1.5)
        d.line([(hx, 14), (hx + 3, 6)], fill="#C8A040", width=1.5)
    # épi central
    for y in range(6, 28, 5):
        d.ellipse((26, y, 34, y + 8), fill=OR, outline="#8A641C", width=1.2)
        d.ellipse((30, y + 3, 38, y + 11), fill=OR, outline="#8A641C", width=1.2)
    d.line([(32, 8), (29, 0)], fill="#C8A040", width=1.5)
    d.line([(32, 8), (35, 0)], fill="#C8A040", width=1.5)
    # lien de la gerbe
    d.rrect((24, 34, 40, 42), 3, fill="#B8892B", outline=INK, width=2)


def res_boeufs(db, da=None, w=64, h=64, img=None):
    """Bœufs : même vocabulaire que le bétail (de profil) mais taureau
    brun — plus gros, cordré, cornes en croissant ; robe brune à taches
    plus foncées pour le distinguer du bétail blanc."""
    BRUN, TACHE = "#A06A3C", "#6E4426"
    # pattes épaisses + sabot
    for x in (12, 24, 38, 48):
        db.rrect((x, 44, x + 8, 62), 2.5, fill=BRUN, outline=INK, width=1.5)
        db.rrect((x, 57, x + 8, 62), 2, fill="#4E4438", outline=None)
    # queue avec touffe
    db.smooth_line([(8, 26), (3, 38), (5, 50)], fill=INK, width=2)
    db.ellipse((2, 48, 9, 56), fill=TACHE, outline=INK, width=1.2)
    # corps massif + taches foncées
    db.ellipse((6, 18, 52, 50), fill=BRUN, outline=INK, width=2)
    db.ellipse((14, 28, 28, 44), fill=TACHE)
    db.ellipse((32, 22, 44, 34), fill=TACHE)
    # cornes en croissant, de part et d'autre du haut du crâne
    # (contour INK puis cœur doré, en taper fuselé)
    for pts in ([(50, 13), (42, 8), (35, 9)], [(54, 13), (61, 8), (63, 12)]):
        db.taper(pts, 6, 1.5, INK)
        db.taper(pts, 4, 0.8, "#D9C04A")
    # tête + museau rose
    db.ellipse((40, 10, 62, 34), fill=BRUN, outline=INK, width=2)
    db.ellipse((44, 12, 56, 22), fill=TACHE)
    db.ellipse((50, 24, 64, 36), fill="#E3B8A0", outline=INK, width=1.5)
    db.ellipse((57, 28, 61, 32), fill=INK)
    db.ellipse((52, 20, 56, 24), fill=INK)
    # oreille
    db.ellipse((38, 8, 46, 16), fill=BRUN, outline=INK, width=1.5)
    # modelés : dos éclairé, ventre ombré
    if img is not None:
        vgrad(img, (8, 18, 50, 34), (255, 255, 255), 26, 0, steps=12)
        vgrad(img, (10, 36, 50, 50), (20, 20, 30), 0, 24, steps=10)


def res_caoutchouc(db, da=None, w=64, h=64, img=None):
    """Caoutchouc : pneu de profil — bande de roulement crantée, flanc
    modelé, jante à rayons, valve. Modelés dégradés doux."""
    cx, cy = 32, 34
    # gomme : gros anneau
    db.ellipse((6, 8, 58, 60), fill="#3A3A40", outline=INK, width=2)
    # crans de bande de roulement (autour du périmètre)
    for a in range(0, 360, 20):
        r0, r1 = 21, 25
        x0, y0 = cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a))
        x1, y1 = cx + r1 * math.cos(math.radians(a)), cy + r1 * math.sin(math.radians(a))
        db.line([(x0, y0), (x1, y1)], fill="#26262C", width=3)
    # flanc : anneau médian
    db.ellipse((14, 16, 50, 52), outline="#5A5A62", width=2)
    # jante claire + moyeu
    db.ellipse((19, 21, 45, 47), fill="#8A8A92", outline=INK, width=2)
    db.ellipse((27, 29, 37, 39), fill="#3A3A40", outline=INK, width=1.5)
    # rayons de jante
    for a in range(0, 360, 60):
        r0, r1 = 6, 11
        x0, y0 = cx + r0 * math.cos(math.radians(a)), cy + r0 * math.sin(math.radians(a))
        x1, y1 = cx + r1 * math.cos(math.radians(a)), cy + r1 * math.sin(math.radians(a))
        db.line([(x0, y0), (x1, y1)], fill="#6E6E76", width=2.5)
    # valve
    db.rrect((49, 30, 55, 36), 2, fill="#8A8A92", outline=INK, width=1.2)
    # modelés : reflet haut-gauche sur la gomme, ombre bas-droite
    if img is not None:
        radial(img, 20, 18, 14, (255, 255, 255), 34, steps=7)
        vgrad(img, (30, 34, 58, 60), (20, 20, 30), 0, 30, steps=10)


def res_charbon(db, da=None, w=64, h=64, img=None):
    """Charbon : tas de houille aux facettes brillantes — blocs anguleux
    empilés, éclats métalliques, modelés et ombre portée."""
    # ombre portée sous le tas
    db.ellipse((6, 50, 58, 60), fill=(0, 0, 0, 45))
    # gros bloc central (arêtes vives)
    bloc1 = [(8, 44), (14, 32), (28, 28), (38, 34), (40, 46), (28, 54), (14, 52)]
    db.poly(bloc1, fill="#2E2E34", outline=INK, width=2)
    # bloc de droite, appuyé
    bloc2 = [(36, 46), (40, 36), (52, 32), (58, 42), (54, 52), (42, 53)]
    db.poly(bloc2, fill="#26262C", outline=INK, width=2)
    # bloc du sommet
    bloc3 = [(20, 30), (30, 22), (40, 26), (38, 35), (26, 37)]
    db.poly(bloc3, fill="#33333A", outline=INK, width=1.8)
    # facettes grises (plans réfléchissants)
    db.poly([(14, 32), (28, 28), (24, 36), (16, 38)], fill="#4A4A52")
    db.poly([(40, 36), (52, 32), (50, 42), (42, 42)], fill="#3E3E46")
    db.poly([(30, 22), (40, 26), (34, 30), (27, 28)], fill="#52525A")
    # éclats brillants
    db.line([(16, 34), (22, 31)], fill="#8A8A92", width=1.6)
    db.line([(43, 35), (49, 34)], fill="#7A7A84", width=1.4)
    db.line([(31, 24), (36, 26)], fill="#9A9AA2", width=1.2)
    # petits morceaux détachés
    db.ellipse((10, 52, 16, 57), fill="#2E2E34", outline=INK, width=1.2)
    db.ellipse((52, 50, 58, 55), fill="#2E2E34", outline=INK, width=1.2)
    # modelés : lumière haut-gauche du tas
    if img is not None:
        vgrad(img, (8, 22, 40, 44), (255, 255, 255), 22, 0, steps=10)
        radial(img, 18, 32, 10, (255, 255, 255), 26, steps=5)


def res_chene(db, da=None, w=64, h=64, img=None):
    """Chêne : branche lignifiée (taper), feuilles lobées bien marquées
    (sinus profonds, arêtes vives), glands à chapeau texturé."""
    # branche principale + rameau (taper fuselé)
    db.taper([(12, 56), (26, 42), (38, 26), (46, 14)], 4, 1.2, "#6B5230")
    db.taper([(26, 42), (38, 42), (50, 36)], 3, 0.8, "#6B5230")
    # feuille de chêne : silhouette lobée dessinée à la main (moitié
    # supérieure puis miroir), placée avec rotation
    def feuille(x0, y0, ang, s):
        ca, sa = math.cos(ang), math.sin(ang)
        moitie = [(0, 0), (2, -2.5), (1, -4.5), (5, -5.5), (4, -7.5),
                  (9, -7.5), (9, -9.5), (13.5, -8.5), (16, 0)]
        pts = moitie + [(px, -py) for px, py in reversed(moitie[1:-1])]
        pts = [(x0 + (px * ca - py * sa) * s,
                y0 + (px * sa + py * ca) * s) for px, py in pts]
        db.poly(pts, fill=FORET_2, outline="#33582A", width=1.5)
        db.line([(x0, y0), (x0 + 15 * ca * s, y0 + 15 * sa * s)],
                fill="#2A4A22", width=1.2)
    feuille(14, 46, math.radians(-38), 1.1)
    feuille(26, 34, math.radians(-15), 1.0)
    feuille(34, 26, math.radians(-45), 0.85)
    # glands : noix ovale + chapeau strié + reflet
    for x, y in [(16, 48), (32, 46)]:
        db.ellipse((x, y, x + 8, y + 12), fill="#B98A4E", outline=INK, width=1.4)
        db.rrect((x - 1, y - 4, x + 9, y + 1), 2.5, fill="#6B5230",
                 outline=INK, width=1.2)
        db.line([(x + 2, y - 2.5), (x + 2, y - 0.5)], fill="#8A6A40", width=1)
        db.line([(x + 5, y - 2.5), (x + 5, y - 0.5)], fill="#8A6A40", width=1)
        db.ellipse((x + 2, y + 4, x + 4, y + 7), fill="#D9B27A")
    # modelés : lumière sur le haut du bouquet
    if img is not None:
        vgrad(img, (12, 8, 50, 30), (255, 255, 255), 24, 0, steps=10)
        vgrad(img, (16, 42, 52, 60), (20, 20, 30), 0, 22, steps=8)


def res_encens(db, da=None, w=64, h=64, img=None):
    """Encens : brûle-parfum doré sur pied, braises incandescentes,
    volutes de fumée lissées. Modelés métalliques."""
    # volutes de fumée : deux S allongés séparés, montée douce
    db.smooth_line([(27, 26), (24, 20), (30, 14), (27, 8), (29, 2)],
                   fill="#B8B4AC", width=2.4)
    db.smooth_line([(37, 26), (40, 19), (34, 13), (38, 6)],
                   fill="#A8A4AC", width=2)
    # pied + coupelle (silhouette lissée)
    db.smooth_poly([(24, 58), (40, 58), (37, 50), (27, 50)], fill=BOIS)
    db.smooth_line([(24, 58), (40, 58), (37, 50), (27, 50), (24, 58)],
                   fill=INK, width=1.5)
    # vasque dorée : dôme + collerette
    db.smooth_poly([(16, 44), (18, 34), (26, 28), (38, 28), (46, 34), (48, 44)],
                   fill=OR)
    db.smooth_line([(16, 44), (18, 34), (26, 28), (38, 28), (46, 34), (48, 44),
                    (16, 44)], fill=INK, width=2)
    db.rrect((14, 42, 50, 48), 3, fill="#8A641C", outline=INK, width=1.5)
    # braises incandescentes sur le dôme (percées)
    for x, y, r in ((28, 32, 2.5), (36, 30, 2), (32, 36, 1.6)):
        db.ellipse((x - r, y - r, x + r, y + r), fill="#E8843C")
        db.ellipse((x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4),
                   fill="#F7C948")
    # modelés métalliques : reflet haut-gauche, ombre bas-droite
    if img is not None:
        radial(img, 24, 34, 12, (255, 244, 200), 40, steps=7)
        vgrad(img, (30, 30, 48, 48), (20, 20, 30), 0, 30, steps=10)


def res_epices(db, da=None, w=64, h=64, img=None):
    """Épices : mortier de bois et pilon, monticules de paprika et de
    curcuma débordant, poudre répandue et bâtons de cannelle."""
    # nappes de poudre répandue sous le mortier
    db.ellipse((4, 54, 26, 62), fill="#D9A93F")
    db.ellipse((40, 56, 62, 63), fill="#C24545")
    # mortier : cuve lissée sur pied, bois chaud
    cuve = [(10, 36), (12, 28), (52, 28), (54, 36), (48, 46), (38, 50),
            (26, 50), (16, 46)]
    db.smooth_poly(cuve, fill="#8A5A34")
    db.smooth_line(cuve + [cuve[0]], fill=INK, width=2)
    # pied du mortier
    db.rrect((22, 50, 42, 58), 3, fill="#6B5230", outline=INK, width=1.8)
    # monticules de poudre au-dessus du bord
    db.smooth_poly([(14, 28), (20, 22), (28, 26), (24, 30), (16, 31)],
                   fill="#D9A93F")
    db.smooth_poly([(26, 28), (34, 21), (44, 24), (50, 28), (38, 30), (30, 30)],
                   fill="#C24545")
    # pilon appuyé, tête plongeant dans la cuve
    db.taper([(50, 8), (44, 18), (38, 26)], 4.5, 3, "#A87A24")
    db.ellipse((34, 24, 42, 32), fill="#C8A176", outline=INK, width=1.5)
    # bâtons de cannelle croisés au sol
    db.rrect((36, 56, 56, 60), 2, fill="#8A5A34", outline=INK, width=1.2)
    db.rrect((42, 58, 58, 62), 2, fill="#A87A24", outline=INK, width=1.2)
    # anis étoilé
    db.ellipse((12, 52, 20, 60), fill="#6B5230", outline=INK, width=1.2)
    db.ellipse((15, 55, 17, 57), fill="#F2F0E8")
    # modelés : lumière sur le bord de la cuve
    if img is not None:
        vgrad(img, (10, 26, 54, 38), (255, 255, 255), 26, 0, steps=10)
        vgrad(img, (14, 40, 50, 50), (20, 20, 30), 0, 24, steps=8)


def res_fer(db, da=None, w=64, h=64, img=None):
    """Fer : enclume de forgeron sur billot — bec, corps d'acier, table
    polie brillante, base de bois, étincelle."""
    # billot de souche
    db.rrect((18, 50, 46, 62), 3, fill="#6B5230", outline=INK, width=2)
    db.line([(18, 55), (46, 55)], fill="#8A6A40", width=1.4)
    # enclume : pied évasé, taille fine, corps massif, bec à gauche
    corps = [(12, 26), (52, 26), (56, 32), (50, 36), (40, 36), (38, 44),
             (44, 50), (26, 50), (32, 44), (30, 36), (20, 36), (14, 38),
             (6, 32)]
    db.smooth_poly(corps, fill="#4A4A52", steps=6)
    db.smooth_line(corps + [corps[0]], fill=INK, width=2)
    # table supérieure polie (bande claire)
    db.rrect((10, 24, 54, 29), 2, fill="#8A8A94", outline=INK, width=1.5)
    db.line([(12, 26), (30, 26)], fill="#C8C8D2", width=1.4)
    # reflets sur le corps
    db.line([(16, 30), (26, 30)], fill="#6E6E78", width=2)
    db.line([(42, 40), (36, 40)], fill="#6E6E78", width=2)
    # étincelle de frappe au-dessus du bec
    db.line([(14, 14), (14, 20)], fill="#F7C948", width=1.6)
    db.line([(11, 17), (17, 17)], fill="#F7C948", width=1.6)
    db.line([(12, 15), (16, 19)], fill="#E8843C", width=1.2)
    db.line([(16, 15), (12, 19)], fill="#E8843C", width=1.2)
    # modelés : lumière sur la table, ombre sous le corps
    if img is not None:
        vgrad(img, (8, 24, 56, 36), (255, 255, 255), 30, 0, steps=10)
        vgrad(img, (20, 40, 46, 50), (20, 20, 30), 0, 26, steps=8)


def res_gemmes(db, da=None, w=64, h=64, img=None):
    """Gemmes : géode — bloc rocheux ouvert d'où poussent des cristaux
    prisme (améthyste, cyan), pointes brillantes, éclats."""
    # socle rocheux
    roche = [(8, 54), (10, 44), (20, 40), (36, 40), (50, 44), (56, 52),
             (52, 60), (14, 60)]
    db.smooth_poly(roche, fill="#4A4A52", steps=6)
    db.smooth_line(roche + [roche[0]], fill=INK, width=2)
    db.poly([(14, 46), (26, 42), (24, 50)], fill="#5E5E68")
    # grand cristal améthyste central
    def cristal(cx, base, sommet, w, fill, clair):
        x0, y0 = base
        x1, y1 = sommet
        dx, dy = x1 - x0, y1 - y0
        n = (-dy, dx)
        ln = math.hypot(*n) or 1
        nx, ny = n[0] / ln, n[1] / ln
        pts = [(x0 + nx * w, y0 + ny * w), (x1 + nx * w * 0.5, y1 + ny * w * 0.5),
               (x1, y1), (x1 - nx * w * 0.5, y1 - ny * w * 0.5),
               (x0 - nx * w, y0 - ny * w)]
        db.poly(pts, fill=fill, outline=INK, width=1.8)
        db.line([(x0, y0), (x1, y1)], fill=clair, width=1.4)
        db.line([(x1 - nx * w * 0.5, y1 - ny * w * 0.5),
                 (x1 - nx * w * 0.2, y1 - ny * w * 0.2 - 3)],
                fill="#FFFFFF", width=1.4)
    cristal(30, (30, 44), (26, 8), 6, "#9C6FD6", "#CBADEF")
    cristal(40, (38, 44), (46, 14), 4.5, "#58B6C9", "#A8DEE8")
    cristal(22, (22, 46), (14, 22), 3.5, "#58B6C9", "#A8DEE8")
    cristal(46, (44, 46), (54, 30), 2.5, "#CBADEF", "#FFFFFF")
    # éclat en croix au-dessus du grand cristal
    db.line([(26, 2), (26, 6)], fill="#FFFFFF", width=1.3)
    db.line([(24, 4), (28, 4)], fill="#FFFFFF", width=1.3)
    # modelés : lumière sur le socle
    if img is not None:
        vgrad(img, (8, 40, 56, 50), (255, 255, 255), 22, 0, steps=8)


def res_gibier(db, da=None, w=64, h=64, img=None):
    """Gibier : cerf debout de profil — corps allongé, cou dressé, tête
    à museau clair, bois ramifiés (taper), modelés dégradés."""
    BRUN, CLAIR = "#8A5A34", "#C8A176"
    # bois de cerf : deux branches ramifiées, dans le cadre
    for pts, tines in (
        ([(44, 9), (41, 4), (37, 1)], [(42, 3), (46, 1)]),
        ([(47, 9), (50, 4), (55, 2)], [(49, 4), (48, 1)]),
    ):
        db.taper(pts, 3, 0.8, "#D9C04A")
        db.taper(tines, 2.2, 0.6, "#D9C04A")
    # oreille derrière les bois
    db.smooth_poly([(40, 10), (35, 6), (40, 14)], fill=BRUN)
    # cou dressé
    db.smooth_poly([(34, 30), (38, 18), (42, 11), (50, 12), (48, 22), (44, 32)],
                   fill=BRUN)
    db.smooth_line([(34, 30), (38, 18), (42, 11), (50, 12), (48, 22), (44, 32),
                    (34, 30)],
                   fill=INK, width=1.8)
    # tête : crâne + museau clair
    db.ellipse((40, 8, 54, 18), fill=BRUN, outline=INK, width=1.8)
    db.smooth_poly([(50, 9), (58, 11), (58, 15), (50, 17)], fill=CLAIR)
    db.ellipse((56, 11.5, 58.5, 14.5), fill=INK)
    db.ellipse((46, 11, 48.5, 13.5), fill=INK)
    # pattes fines (taper) + sabots
    for (x0, y0, x1, y1) in ((18, 44, 16, 60), (24, 46, 24, 62),
                             (36, 46, 38, 62), (42, 44, 44, 60)):
        db.taper([(x0, y0), (x1, y1)], 4, 2, BRUN)
        db.rrect((x1 - 2.5, y1 - 2, x1 + 2.5, y1 + 2), 1.5, fill="#3A3A40")
    # corps allongé
    corps = [(8, 34), (10, 28), (20, 24), (32, 24), (42, 28), (45, 36),
             (41, 44), (30, 47), (18, 45), (9, 40)]
    db.smooth_poly(corps, fill=BRUN)
    db.smooth_line(corps + [corps[0]], fill=INK, width=2)
    # ventre clair + queue
    db.smooth_poly([(14, 40), (22, 45), (34, 45), (41, 41), (37, 39),
                    (26, 42), (17, 38)],
                   fill=CLAIR)
    db.smooth_poly([(9, 33), (5, 29), (8, 36)], fill=CLAIR)
    # modelés : dos éclairé, ombre au flanc
    if img is not None:
        vgrad(img, (8, 22, 46, 34), (255, 255, 255), 26, 0, steps=12)
        vgrad(img, (10, 38, 46, 47), (20, 20, 30), 0, 24, steps=8)


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


def res_poisson(db, da=None, w=64, h=64, img=None):
    """Poisson : petit poisson volant (moyenne ~55 % du gabarit) —
    volontairement bien plus petit que la baleine pour une échelle
    relative lisible sur la carte. Modelés dégradés doux."""
    # corps ramassé
    corps = [(14, 38), (16, 31), (24, 28), (33, 29), (39, 34),
             (40, 40), (35, 46), (26, 48), (18, 46)]
    db.smooth_poly(corps, fill="#7FA9CC")
    db.smooth_line(corps + [corps[0]], fill=INK, width=2)
    # nageoire pectorale (sur le corps, bas-gauche)
    pect = [(26, 40), (23, 47), (30, 45), (33, 40)]
    db.smooth_poly(pect, fill="#5E8CB4")
    db.smooth_line(pect + [pect[0]], fill=INK, width=1.2)
    # queue fourchue
    queue = [(38, 34), (47, 28), (48, 32), (43, 38), (48, 46), (44, 49), (38, 42)]
    db.smooth_poly(queue, fill="#5E8CB4")
    db.smooth_line(queue + [queue[0]], fill=INK, width=2)
    # nageoire dorsale
    dors = [(22, 29), (27, 23), (33, 24), (35, 29)]
    db.smooth_poly(dors, fill="#5E8CB4")
    db.smooth_line(dors + [dors[0]], fill=INK, width=1.5)
    # opercule + œil
    db.smooth_line([(22, 32), (20, 40), (23, 46)], fill="#5E8CB4", width=1.4)
    db.ellipse((17, 33, 21, 37), fill=INK)
    db.ellipse((18, 34, 20, 35.5), fill="#FFFFFF")
    if img is not None:
        radial(img, 24, 33, 9, (255, 255, 255), 34, steps=6)


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


def unite_galere(db, da, w, h):
    """256x320, Galère (R-117) : éper de proue, rames à palettes, voile carrée
    (accent), château arrière et guidon."""
    cx, ground = 128, 240
    shadow(db, cx, ground + 6, 96)
    # coque bordée + liste claire
    db.poly([(cx - 100, ground - 46), (cx + 100, ground - 46), (cx + 78, ground - 6),
             (cx - 78, ground - 6)], fill=BOIS, outline=INK, width=2.5)
    db.poly([(cx - 100, ground - 46), (cx - 40, ground - 46), (cx - 52, ground - 6),
             (cx - 78, ground - 6)], fill=BOIS_CLAIR)
    db.line([(cx - 94, ground - 34), (cx + 94, ground - 34)], fill=BOIS_CLAIR, width=2.5)
    # éper de proue en bronze
    db.poly([(cx - 124, ground - 44), (cx - 88, ground - 44), (cx - 88, ground - 28)],
            fill="#9EA6B2", outline=INK, width=1.5)
    # château arrière
    db.rrect((cx + 44, ground - 60, cx + 94, ground - 40), 3, fill=BOIS_CLAIR,
             outline=INK, width=1.5)
    # rames à palettes
    for i in range(5):
        y = ground - 36 + i * 6
        for side in (-1, 1):
            x0, x1 = cx + side * 86, cx + side * 128
            db.line([(x0, y), (x1, y - 4)], fill=BOIS_CLAIR, width=3.5)
            db.ellipse((x1 + side * 5 - 7, y - 10, x1 + side * 5 + 7, y - 3),
                       fill=BOIS_CLAIR, outline=INK, width=1)
    # mât, haubans et voile carrée (accent)
    db.line([(cx - 98, ground - 48), (cx, ground - 186)], fill=SABLE, width=1.5)
    db.line([(cx + 98, ground - 48), (cx, ground - 186)], fill=SABLE, width=1.5)
    db.line([(cx, ground - 190), (cx, ground - 50)], fill=BOIS, width=7)
    db.line([(cx - 62, ground - 184), (cx + 62, ground - 184)], fill=BOIS, width=6)
    db.poly([(cx - 56, ground - 180), (cx + 56, ground - 180), (cx + 48, ground - 84),
             (cx - 48, ground - 84)], fill="#E8DCC2", outline=INK, width=2)
    da.poly([(cx - 56, ground - 180), (cx + 56, ground - 180), (cx + 48, ground - 84),
             (cx - 48, ground - 84)], fill="#FFFFFF")
    # guidon rouge au sommet
    db.poly([(cx, ground - 198), (cx + 36, ground - 192), (cx, ground - 186)],
            fill=ROUGE_JOUEUR, outline=INK, width=1)


def unite_galion(db, da, w, h):
    """256x320, Galion (R-117) : château arrière à deux niveaux, beaupré et foc,
    deux mâts voilés, sabords (grand foc = accent)."""
    cx, ground = 128, 240
    shadow(db, cx, ground + 6, 100)
    db.poly([(cx - 104, ground - 56), (cx + 104, ground - 56), (cx + 82, ground - 8),
             (cx - 82, ground - 8)], fill=BOIS, outline=INK, width=2.5)
    db.poly([(cx + 104, ground - 56), (cx + 82, ground - 8), (cx + 96, ground - 6),
             (cx + 116, ground - 52)], fill=BOIS_CLAIR)
    db.line([(cx - 100, ground - 40), (cx + 100, ground - 40)], fill=BOIS_CLAIR, width=2.5)
    # sabords de batterie
    for gx in (cx - 64, cx - 24, cx + 16, cx + 56):
        db.rrect((gx, ground - 34, gx + 9, ground - 26), 1, fill=INK)
    # château arrière à deux niveaux
    db.rrect((cx - 88, ground - 86, cx - 34, ground - 54), 4, fill=BOIS_CLAIR,
             outline=INK, width=1.5)
    db.rrect((cx - 80, ground - 108, cx - 42, ground - 82), 4, fill=BOIS_CLAIR,
             outline=INK, width=1.5)
    # beaupré
    db.line([(cx + 94, ground - 54), (cx + 122, ground - 150)], fill=BOIS, width=5)
    # deux mâts, voiles et foc (accent sur la grand-voile)
    db.line([(cx - 26, ground - 156), (cx - 26, ground - 52)], fill=BOIS, width=6)
    db.line([(cx + 34, ground - 206), (cx + 34, ground - 52)], fill=BOIS, width=6)
    db.poly([(cx - 64, ground - 150), (cx + 12, ground - 150), (cx + 4, ground - 86),
             (cx - 58, ground - 86)], fill="#E8DCC2", outline=INK, width=2)
    grand = [(cx + 34, ground - 200), (cx + 94, ground - 198), (cx + 86, ground - 122),
             (cx + 28, ground - 124)]
    db.poly(grand, fill="#E8DCC2", outline=INK, width=2)
    da.poly(grand, fill="#FFFFFF")
    db.poly([(cx + 120, ground - 148), (cx + 66, ground - 124), (cx + 106, ground - 90)],
            fill="#E8DCC2", outline=INK, width=1.5)
    # pavillons
    db.poly([(cx + 34, ground - 220), (cx + 68, ground - 214), (cx + 34, ground - 206)],
            fill=ROUGE_JOUEUR, outline=INK, width=1)
    db.poly([(cx - 26, ground - 170), (cx - 4, ground - 164), (cx - 26, ground - 158)],
            fill=ROUGE_JOUEUR, outline=INK, width=1)


def unite_croiseur(db, da, w, h):
    """256x320, Croiseur (R-117/R-118) : proue fine, superstructure étagée,
    cheminée inclinée (accent), tourelles jumelles, mât radar."""
    cx, ground = 128, 240
    shadow(db, cx, ground + 6, 100)
    # coque fine à proue pointue
    db.poly([(cx - 112, ground - 44), (cx + 106, ground - 44), (cx + 124, ground - 34),
             (cx + 88, ground - 10), (cx - 86, ground - 10)], fill=GRIS_ARMURE,
            outline=INK, width=2.5)
    db.poly([(cx - 112, ground - 44), (cx - 40, ground - 44), (cx - 52, ground - 10),
             (cx - 86, ground - 10)], fill=GRIS_NEUTRE)
    db.line([(cx - 100, ground - 34), (cx + 110, ground - 34)], fill="#B4B4BA", width=2)
    # superstructure étagée
    db.rrect((cx - 48, ground - 80, cx + 44, ground - 42), 4, fill="#8E8E98",
             outline=INK, width=1.5)
    db.rrect((cx - 24, ground - 102, cx + 20, ground - 76), 3, fill=GRIS_NEUTRE,
             outline=INK, width=1.5)
    db.rrect((cx - 16, ground - 112, cx + 8, ground - 98), 2, fill=GRIS_NEUTRE,
             outline=INK, width=1)
    # cheminée inclinée (accent)
    funnel = [(cx - 8, ground - 116), (cx + 12, ground - 116), (cx + 18, ground - 94),
              (cx - 2, ground - 94)]
    db.poly(funnel, fill="#5E5E68", outline=INK, width=1.5)
    da.poly(funnel, fill="#FFFFFF")
    # mât radar : antenne rectangulaire au sommet
    db.line([(cx - 2, ground - 112), (cx - 2, ground - 136)], fill=GRIS_NEUTRE, width=4)
    db.rrect((cx - 12, ground - 150, cx + 8, ground - 134), 2, fill=GRIS_NEUTRE,
             outline=INK, width=1.5)
    db.line([(cx - 8, ground - 146), (cx + 4, ground - 138)], fill=INK, width=1.5)
    # tourelle avant jumelle + tourelle arrière
    db.rrect((cx + 40, ground - 64, cx + 72, ground - 44), 8, fill=GRIS_ARMURE,
             outline=INK, width=1.5)
    db.line([(cx + 64, ground - 57), (cx + 98, ground - 61)], fill="#3E3E48", width=3.5)
    db.line([(cx + 64, ground - 52), (cx + 98, ground - 54)], fill="#3E3E48", width=3.5)
    db.rrect((cx - 98, ground - 62, cx - 70, ground - 44), 7, fill=GRIS_ARMURE,
             outline=INK, width=1.5)
    db.line([(cx - 76, ground - 54), (cx - 46, ground - 57)], fill="#3E3E48", width=3.5)


def unite_cuirasse(db, da, w, h):
    """256x320, Cuirassé (R-117/R-118) : gros bordé à proue fine, mât-tour
    (accent), trois tourelles jumelles."""
    cx, ground = 128, 240
    shadow(db, cx, ground + 6, 108)
    db.poly([(cx - 118, ground - 52), (cx + 118, ground - 52), (cx + 136, ground - 42),
             (cx + 96, ground - 10), (cx - 90, ground - 10)], fill="#5E5E68",
            outline=INK, width=3)
    db.poly([(cx - 118, ground - 52), (cx - 44, ground - 52), (cx - 56, ground - 10),
             (cx - 90, ground - 10)], fill="#6E6E78")
    db.line([(cx - 106, ground - 40), (cx + 120, ground - 40)], fill="#8A8A94", width=2)
    # superstructure étagée
    db.rrect((cx - 52, ground - 94, cx + 48, ground - 50), 4, fill=GRIS_ARMURE,
             outline=INK, width=1.5)
    db.rrect((cx - 20, ground - 122, cx + 24, ground - 92), 3, fill=GRIS_NEUTRE,
             outline=INK, width=1.5)
    # mât-tour lourd (accent)
    db.rrect((cx - 4, ground - 150, cx + 12, ground - 118), 3, fill=GRIS_NEUTRE,
             outline=INK, width=1.5)
    db.line([(cx - 14, ground - 144), (cx + 20, ground - 144)], fill=GRIS_NEUTRE, width=3)
    db.line([(cx + 4, ground - 150), (cx + 4, ground - 168)], fill=GRIS_NEUTRE, width=3)
    da.rrect((cx - 4, ground - 150, cx + 12, ground - 118), 3, fill="#FFFFFF")
    # trois tourelles jumelles
    for tx, gl in ((cx - 86, 34), (cx + 52, 34), (cx + 96, 26)):
        db.rrect((tx - 17, ground - 66, tx + 17, ground - 46), 8, fill=GRIS_ARMURE,
                 outline=INK, width=1.5)
        db.line([(tx + 10, ground - 58), (tx + 10 + gl, ground - 62)], fill="#3E3E48", width=3.5)
        db.line([(tx + 10, ground - 53), (tx + 10 + gl, ground - 55)], fill="#3E3E48", width=3.5)


def unite_sous_marin(db, da, w, h):
    """256x320, Sous-marin (R-117) : coque noire effilée, barres de plongée,
    kiosque, périscopes (accent), canon de pont, hélice triple."""
    cx, ground = 128, 240
    shadow(db, cx, ground + 6, 92)
    # coque effilée
    db.ellipse((cx - 104, ground - 52, cx + 104, ground - 16), fill="#3A3A42",
               outline=INK, width=2.5)
    db.ellipse((cx - 104, ground - 52, cx + 20, ground - 16), fill="#2C2C34")
    # barres de plongée avant/arrière
    db.rrect((cx + 42, ground - 58, cx + 74, ground - 50), 2, fill="#4A4A54",
             outline=INK, width=1.5)
    db.rrect((cx - 80, ground - 58, cx - 48, ground - 50), 2, fill="#4A4A54",
             outline=INK, width=1.5)
    # kiosque + massif
    db.rrect((cx - 16, ground - 84, cx + 24, ground - 50), 5, fill="#4A4A54",
             outline=INK, width=1.5)
    db.rrect((cx - 8, ground - 92, cx + 14, ground - 80), 2, fill="#55555F",
             outline=INK, width=1)
    # périscopes + snorkel (accent)
    db.line([(cx + 2, ground - 92), (cx + 2, ground - 118)], fill=GRIS_NEUTRE, width=3.5)
    da.line([(cx + 2, ground - 92), (cx + 2, ground - 118)], fill="#FFFFFF", width=3.5)
    db.line([(cx + 2, ground - 118), (cx + 14, ground - 113)], fill=GRIS_NEUTRE, width=3)
    db.line([(cx + 16, ground - 90), (cx + 16, ground - 108)], fill=GRIS_NEUTRE, width=3)
    # canon de pont
    db.line([(cx - 46, ground - 52), (cx - 62, ground - 66)], fill="#55555F", width=4)
    # hélice triple + gouvernail
    db.poly([(cx - 104, ground - 44), (cx - 122, ground - 52), (cx - 122, ground - 22),
             (cx - 104, ground - 24)], fill="#4A4A54", outline=INK, width=1.5)
    for ang in (-45, 0, 45):
        a = math.radians(ang)
        px = cx - 124 + 8 * math.sin(a)
        py = ground - 36 - 8 * math.cos(a)
        db.ellipse((px - 5, py - 4, px + 5, py + 4), fill="#6E6E78", outline=INK, width=1)


# ------------------------------------------------- Phase 7h — gouvernements & GP restants (R-121..R-125)

def unite_scientifique(db, da, w, h):
    """256x320, Scientifique illustre (R-123) : blouse blanche, fiole bulante (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#DDE3E6", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#C9D2D8")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    # lunettes rondes (accent)
    db.ellipse((cx - 14, ground - 172, cx - 2, ground - 160), outline=INK, width=2)
    db.ellipse((cx + 2, ground - 172, cx + 14, ground - 160), outline=INK, width=2)
    da.ellipse((cx - 14, ground - 172, cx - 2, ground - 160), fill="#FFFFFF")
    da.ellipse((cx + 2, ground - 172, cx + 14, ground - 160), fill="#FFFFFF")
    # fiole bulante (accent)
    db.ellipse((cx + 30, ground - 96, cx + 58, ground - 68), fill="#6FA3B8", outline=INK, width=2)
    db.rrect((cx + 40, ground - 112, cx + 48, ground - 94), 1, fill="#6FA3B8", outline=INK, width=1)
    da.ellipse((cx + 34, ground - 100, cx + 42, ground - 92), fill="#FFFFFF")
    for bx, by in ((cx + 44, ground - 104), (cx + 52, ground - 92)):
        db.ellipse((bx, by, bx + 5, by + 5), fill="#DDE3E6", outline=INK, width=1)
    # bras tenant la fiole
    db.line([(cx + 18, ground - 120), (cx + 40, ground - 96)], fill="#DDE3E6", width=10)


def unite_mogul(db, da, w, h):
    """256x320, Mogul illustre (R-123) : caftan pourpre, sac d'or (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#8C5A3C", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#7A4C30")
    db.line([(cx, ground - 142), (cx, ground - 56)], fill="#D9B45C", width=3)
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    # turban (accent)
    db.ellipse((cx - 20, ground - 196, cx + 20, ground - 168), fill="#6B4C8C", outline=INK, width=2)
    db.rrect((cx - 6, ground - 196, cx + 6, ground - 188), 2, fill="#D9B45C")
    da.ellipse((cx - 20, ground - 196, cx + 20, ground - 168), fill="#FFFFFF")
    # sac d'or (accent : pièces)
    db.poly([(cx + 24, ground - 88), (cx + 60, ground - 88), (cx + 66, ground - 56),
             (cx + 18, ground - 56)], fill="#C9A85C", outline=INK, width=2)
    db.line([(cx + 36, ground - 88), (cx + 32, ground - 100)], fill="#8A7A5A", width=3)
    for gx, gy in ((cx + 34, ground - 74), (cx + 48, ground - 70)):
        db.ellipse((gx, gy, gx + 10, gy + 10), fill="#E8C96A", outline=INK, width=1)
        da.ellipse((gx + 2, gy + 2, gx + 6, gy + 6), fill="#FFFFFF")
    db.line([(cx + 18, ground - 118), (cx + 40, ground - 92)], fill="#8C5A3C", width=10)


def unite_ingenieur(db, da, w, h):
    """256x320, Ingénieur illustre (R-123) : casque, engrenage, plan roulé (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#C79A4A", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#B2873C")
    db.rrect((cx - 16, ground - 100, cx + 16, ground - 56), 2, fill="#8A7A5A", outline=INK, width=1)
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    # casque jaune (accent)
    db.pieslice((cx - 20, ground - 200, cx + 20, ground - 158), 180, 360,
                fill="#E8C96A", outline=INK, width=2)
    da.pieslice((cx - 20, ground - 200, cx + 20, ground - 158), 180, 360, fill="#FFFFFF")
    db.line([(cx - 24, ground - 160), (cx + 24, ground - 160)], fill=INK, width=2)
    # engrenage (accent)
    for a in range(0, 360, 45):
        tx = cx + 44 + 14 * math.cos(math.radians(a))
        ty = ground - 78 + 14 * math.sin(math.radians(a))
        db.ellipse((tx - 4, ty - 4, tx + 4, ty + 4), fill="#9EA6B2", outline=INK, width=1)
        da.ellipse((tx - 4, ty - 4, tx + 4, ty + 4), fill="#FFFFFF")
    db.ellipse((cx + 30, ground - 92, cx + 58, ground - 64), fill="#9EA6B2", outline=INK, width=2)
    db.ellipse((cx + 40, ground - 82, cx + 48, ground - 74), fill="#1D242B")
    # plan roulé sous le bras
    db.rrect((cx - 56, ground - 110, cx - 20, ground - 96), 4, fill="#E3D19A", outline=INK, width=1.5)


def unite_leader(db, da, w, h):
    """256x320, Leader illustre (R-123) : uniforme, épée levée, médailles (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#3C5A7A", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#324A66")
    _gp_carrure(db, cx, ground - 142, 30, "#324A66")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # casquette à visière (accent)
    db.rrect((cx - 20, ground - 196, cx + 20, ground - 176), 3, fill="#2C3E52", outline=INK, width=2)
    db.ellipse((cx - 22, ground - 178, cx + 22, ground - 170), fill="#D9B45C", outline=INK, width=1.5)
    da.ellipse((cx - 6, ground - 194, cx + 6, ground - 182), fill="#FFFFFF")
    # médailles (accent)
    for mx in (cx - 18, cx - 6):
        db.ellipse((mx, ground - 124, mx + 10, ground - 114), fill="#D9B45C", outline=INK, width=1)
        da.ellipse((mx + 2, ground - 122, mx + 6, ground - 118), fill="#FFFFFF")
    # épée levée, tenue par le bras droit
    db.line([(cx + 34, ground - 96), (cx + 52, ground - 180)], fill="#9EA6B2", width=6)
    da.line([(cx + 34, ground - 96), (cx + 52, ground - 180)], fill="#FFFFFF", width=6)
    db.line([(cx + 26, ground - 112), (cx + 44, ground - 112)], fill="#D9B45C", width=5)
    db.rrect((cx + 30, ground - 100, cx + 40, ground - 90), 2, fill=BOIS)
    _gp_bras(db, [(cx + 18, ground - 124), (cx + 34, ground - 97)], "#3C5A7A")


# ------------------------------------------------- Phase 7k — sprites dédiés des 6 classes canoniques de GP (R-126)

def _gp_carrure(d, cx, top, half, ombre, skin="#B99B7E"):
    """Cou + carrure d'épaules posés sur le haut de la robe d'un GP."""
    d.rrect((cx - 6, top - 16, cx + 6, top + 8), 3, fill=skin, outline=INK, width=1.5)
    d.poly([(cx - half + 6, top), (cx + half - 6, top), (cx + half + 2, top + 16),
            (cx - half - 2, top + 16)], fill=ombre, outline=INK, width=2)


def _gp_yeux(d, cx, y):
    d.ellipse((cx - 8, y, cx - 3, y + 5), fill=INK)
    d.ellipse((cx + 3, y, cx + 8, y + 5), fill=INK)


def _gp_bras(d, pts, fill, w=9):
    """Bras avec contour INK (double passe, comme les icônes)."""
    d.line(pts, fill=INK, width=w + 5)
    d.line(pts, fill=fill, width=w)


def unite_artiste_penseur(db, da, w, h):
    """256x320, Grand Artiste / Penseur (fusion D1 — R-114 rev.) : palette,
    pinceau ET livre, beret (accent) — la silhouette des deux anciennes classes."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#C4A4D6", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#B18CE0")
    _gp_carrure(db, cx, ground - 142, 30, "#B18CE0")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # beret (accent)
    beret = [(cx - 22, ground - 182), (cx + 22, ground - 182), (cx + 14, ground - 200),
             (cx - 14, ground - 200)]
    db.poly(beret, fill="#7A5A96", outline=INK, width=1.5)
    da.poly(beret, fill="#FFFFFF")
    # palette + taches de peinture (accent)
    db.ellipse((cx + 26, ground - 108, cx + 84, ground - 72), fill="#A8794F", outline=INK, width=2)
    for tx, ty in ((cx + 42, ground - 96), (cx + 62, ground - 88), (cx + 54, ground - 78)):
        db.ellipse((tx, ty, tx + 10, ty + 10), fill="#E8D44A")
        da.ellipse((tx, ty, tx + 10, ty + 10), fill="#FFFFFF")
    # livre du Penseur sous le bras gauche (fusion D1)
    db.rrect((cx - 78, ground - 128, cx - 44, ground - 84), 3, fill="#8A5A3A", outline=INK, width=2)
    da.rrect((cx - 74, ground - 106, cx - 48, ground - 100), 1, fill="#FFFFFF")
    # bras tenant la palette
    _gp_bras(db, [(cx + 18, ground - 120), (cx + 44, ground - 96)], "#C4A4D6")


def unite_savant(db, da, w, h):
    """256x320, Grand Savant (R-126) : blouse, fiole d'Erlenmeyer (accent =
    liquide), lunettes rondes (accent)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#5E7A8E", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#4E6678")
    _gp_carrure(db, cx, ground - 142, 30, "#4E6678")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # lunettes rondes (accent)
    da.ellipse((cx - 12, ground - 170, cx - 2, ground - 160), outline="#FFFFFF", width=2)
    da.ellipse((cx + 2, ground - 170, cx + 12, ground - 160), outline="#FFFFFF", width=2)
    db.line([(cx - 2, ground - 165), (cx + 2, ground - 165)], fill="#FFFFFF", width=2)
    # fiole d'Erlenmeyer (accent = liquide)
    db.poly([(cx + 34, ground - 140), (cx + 58, ground - 96), (cx + 22, ground - 96)],
            fill="#D7E3EC", outline=INK, width=2)
    db.rrect((cx + 33, ground - 146, cx + 59, ground - 138), 2, fill="#D7E3EC", outline=INK, width=2)
    da.poly([(cx + 54, ground - 106), (cx + 57, ground - 98), (cx + 25, ground - 98),
             (cx + 28, ground - 106)], fill="#FFFFFF")
    # parchemin tenu au flanc
    db.rrect((cx - 74, ground - 118, cx - 42, ground - 92), 3, fill="#E8DDBB", outline=INK, width=2)
    da.line([(cx - 70, ground - 112), (cx - 46, ground - 112)], fill="#FFFFFF", width=3)
    # bras tenant la fiole
    _gp_bras(db, [(cx + 18, ground - 124), (cx + 40, ground - 108)], "#5E7A8E")


def unite_batisseur(db, da, w, h):
    """256x320, Grand Batisseur (R-126) : tablier de cuir, marteau, plans roules
    (accent = boucle du tablier, marteau, plans)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 30, ground - 142), (cx + 30, ground - 142), (cx + 38, ground - 50),
             (cx - 38, ground - 50)], fill="#8A6A4A", outline=INK, width=2)
    db.poly([(cx - 30, ground - 142), (cx - 8, ground - 142), (cx - 16, ground - 50),
             (cx - 38, ground - 50)], fill="#765A3E")
    _gp_carrure(db, cx, ground - 142, 30, "#765A3E")
    db.ellipse((cx - 14, ground - 178, cx + 14, ground - 150), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # tablier de cuir (accent : boucle)
    db.poly([(cx - 20, ground - 130), (cx + 20, ground - 130), (cx + 16, ground - 62),
             (cx - 16, ground - 62)], fill="#A87C50", outline=INK, width=2)
    da.rrect((cx - 7, ground - 110, cx + 7, ground - 98), 2, fill="#FFFFFF")
    # casquette plate
    db.rrect((cx - 18, ground - 192, cx + 18, ground - 178), 3, fill="#5A4632", outline=INK, width=2)
    da.rrect((cx - 14, ground - 190, cx + 14, ground - 186), 1, fill="#FFFFFF")
    # marteau leve
    db.line([(cx + 34, ground - 92), (cx + 48, ground - 168)], fill=BOIS, width=6)
    db.rrect((cx + 40, ground - 184, cx + 72, ground - 168), 3, fill="#9EA6B2", outline=INK, width=2)
    da.rrect((cx + 40, ground - 184, cx + 72, ground - 168), 3, fill="#FFFFFF")
    # plans roules sous le bras
    db.rrect((cx - 76, ground - 122, cx - 44, ground - 92), 8, fill="#E8DDBB", outline=INK, width=2)
    da.ellipse((cx - 64, ground - 115, cx - 56, ground - 99), outline="#FFFFFF", width=2)
    # bras tenant le marteau
    _gp_bras(db, [(cx + 18, ground - 124), (cx + 36, ground - 100)], "#8A6A4A")


def unite_explorateur(db, da, w, h):
    """256x320, Grand Explorateur / Industriel (R-126) : manteau, chapeau a
    larges bords (accent = bande), lunette astronomique, besace (accent = carte)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 34, ground - 146), (cx + 34, ground - 146), (cx + 42, ground - 50),
             (cx - 42, ground - 50)], fill="#6E5A3E", outline=INK, width=2)
    db.poly([(cx - 34, ground - 146), (cx - 10, ground - 146), (cx - 18, ground - 50),
             (cx - 42, ground - 50)], fill="#5C4B34")
    _gp_carrure(db, cx, ground - 146, 34, "#5C4B34")
    db.ellipse((cx - 14, ground - 180, cx + 14, ground - 152), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # chapeau a larges bords (accent = bande)
    db.ellipse((cx - 34, ground - 192, cx + 34, ground - 172), fill="#7A6444", outline=INK, width=2)
    db.rrect((cx - 16, ground - 208, cx + 16, ground - 186), 6, fill="#7A6444", outline=INK, width=2)
    da.ellipse((cx - 32, ground - 186, cx + 32, ground - 176), fill="#FFFFFF")
    # lunette astronomique sur l'epaule
    db.rrect((cx + 26, ground - 150, cx + 70, ground - 132), 4, fill="#D9B45C", outline=INK, width=2)
    da.rrect((cx + 62, ground - 150, cx + 70, ground - 132), 4, fill="#FFFFFF")
    # besace + carte qui depasse (accent)
    db.rrect((cx - 70, ground - 104, cx - 36, ground - 72), 4, fill="#8A6A4A", outline=INK, width=2)
    db.poly([(cx - 66, ground - 104), (cx - 40, ground - 118), (cx - 40, ground - 104)],
            fill="#8A6A4A", outline=INK, width=1)
    da.rrect((cx - 62, ground - 100, cx - 44, ground - 76), 1, fill="#FFFFFF")
    # bras
    _gp_bras(db, [(cx + 18, ground - 122), (cx + 36, ground - 140)], "#6E5A3E")


def unite_humanitaire(db, da, w, h):
    """256x320, Grand Humanitaire (R-126) : longue blouse claire, corbeille de
    pain et de grain (accent = miches + epis) — croissance et don."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 50)
    db.rrect((cx - 22, ground - 54, cx - 4, ground), 7, fill="#4E4438")
    db.rrect((cx + 4, ground - 54, cx + 22, ground), 7, fill="#4E4438")
    db.poly([(cx - 32, ground - 146), (cx + 32, ground - 146), (cx + 40, ground - 50),
             (cx - 40, ground - 50)], fill="#D9D2C2", outline=INK, width=2)
    db.poly([(cx - 32, ground - 146), (cx - 10, ground - 146), (cx - 18, ground - 50),
             (cx - 40, ground - 50)], fill="#C6BDA9")
    _gp_carrure(db, cx, ground - 146, 32, "#C6BDA9")
    db.ellipse((cx - 14, ground - 180, cx + 14, ground - 152), fill="#B99B7E", outline=INK, width=1.5)
    _gp_yeux(db, cx, ground - 168)
    # voile discrete (accent)
    da.poly([(cx - 16, ground - 182), (cx + 16, ground - 182), (cx + 10, ground - 196),
             (cx - 10, ground - 196)], fill="#FFFFFF")
    # corbeille de pain (accent : miches + epis)
    db.poly([(cx + 24, ground - 100), (cx + 78, ground - 100), (cx + 70, ground - 72),
             (cx + 32, ground - 72)], fill="#A8794F", outline=INK, width=2)
    da.ellipse((cx + 34, ground - 108, cx + 52, ground - 96), fill="#FFFFFF")
    da.ellipse((cx + 54, ground - 106, cx + 70, ground - 96), fill="#FFFFFF")
    for wx in (cx + 38, cx + 50, cx + 62):
        db.line([(wx, ground - 96), (wx + 2, ground - 112)], fill="#C9A84C", width=3)
    # bras portant la corbeille
    _gp_bras(db, [(cx + 16, ground - 122), (cx + 36, ground - 98)], "#D9D2C2")


def icone_gouvernement(d):
    """Gouvernement (Phase 7h, R-121) : colonne / portique."""
    d.rrect((8, 48, 56, 56), 2, fill="#C2B6A2", outline=INK, width=2)
    d.rrect((6, 8, 58, 14), 2, fill="#C2B6A2", outline=INK, width=2)
    d.pieslice((14, 12, 50, 44), 180, 360, fill="#C2B6A2", outline=INK, width=2)
    for x in (16, 28, 40, 52):
        d.rrect((x - 4, 18, x + 4, 44), 1, fill="#E3D19A", outline=INK, width=1)
    d.ellipse((26, 2, 38, 14), fill="#D9B45C", outline=INK, width=2)


def unite_espion(db, da, w, h):
    """256x320, Espion (R-119) : cape sombre, capuche, dague discrète (accent = fente d'yeux)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 46)
    # cape longue et sombre
    db.poly([(cx - 34, ground - 148), (cx + 34, ground - 148), (cx + 44, ground - 50),
             (cx - 44, ground - 50)], fill="#3A3A46", outline=INK, width=2)
    db.poly([(cx - 34, ground - 148), (cx - 6, ground - 148), (cx - 18, ground - 50),
             (cx - 44, ground - 50)], fill="#2C2C36")
    db.poly([(cx - 30, ground - 152), (cx + 30, ground - 152), (cx + 36, ground - 130),
             (cx - 36, ground - 130)], fill="#3A3A46", outline=INK, width=1.5)
    # capuche
    db.pieslice((cx - 24, ground - 196, cx + 24, ground - 140), 140, 400,
                fill="#3A3A46", outline=INK, width=2)
    # fente d'yeux (accent)
    db.ellipse((cx - 16, ground - 178, cx + 16, ground - 158), fill="#1A1A22")
    da.ellipse((cx - 16, ground - 178, cx + 16, ground - 158), fill="#FFFFFF")
    db.ellipse((cx - 8, ground - 174, cx + 2, ground - 164), fill="#B99B7E")
    db.ellipse((cx + 6, ground - 174, cx + 16, ground - 164), fill="#B99B7E")
    # poignard court tenu à la main
    _gp_bras(db, [(cx + 20, ground - 122), (cx + 42, ground - 102)], "#3A3A46")
    db.ellipse((cx + 34, ground - 112, cx + 48, ground - 98), fill="#B99B7E",
               outline=INK, width=1.5)
    db.rrect((cx + 38, ground - 116, cx + 48, ground - 108), 2, fill=BOIS)
    db.line([(cx + 42, ground - 108), (cx + 50, ground - 126)], fill="#9EA6B2", width=4)
    # ceinture d'outils
    db.rrect((cx - 36, ground - 92, cx + 36, ground - 82), 3, fill="#231F1A")
    db.rrect((cx - 6, ground - 100, cx + 6, ground - 74), 3, fill="#8A7A5A", outline=INK, width=1)
    # bourse accrochée
    db.rrect((cx + 14, ground - 98, cx + 30, ground - 80), 3, fill="#6B5230",
             outline=INK, width=1)


def unite_caravane(db, da, w, h):
    """256x320, Caravane (nouvelle) : wagon couvert, toile marchande (accent),
    marchand menant par le timon."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 6, 100)
    # timon vers le marchand
    db.line([(122, ground - 70), (74, ground - 62)], fill=BOIS, width=5)
    # caisse du wagon
    db.rrect((120, ground - 92, 226, ground - 52), 3, fill=BOIS, outline=INK, width=2.5)
    for x in (140, 160, 180, 200):
        db.line([(x, ground - 88), (x, ground - 56)], fill=BOIS_CLAIR, width=3)
    # roues à rayons
    for x in (132, 202):
        db.ellipse((x, ground - 56, x + 48, ground - 8), fill="#6E4626",
                   outline=INK, width=2.5)
        for a in range(6):
            ang = a * 3.1416 / 3
            db.line([(x + 24, ground - 32),
                     (x + 24 + 17 * math.cos(ang), ground - 32 + 17 * math.sin(ang))],
                    fill="#8A5A34", width=3)
        db.ellipse((x + 17, ground - 39, x + 31, ground - 25), fill="#8A5A34",
                   outline=INK, width=1.5)
    # toile couvrante arquée (accent)
    canopy = [(116, ground - 94), (230, ground - 94), (226, ground - 146),
              (196, ground - 166), (150, ground - 166), (120, ground - 146)]
    db.poly(canopy, fill="#E8DCC2", outline=INK, width=2)
    db.line([(150, ground - 166), (148, ground - 94)], fill=INK, width=1.5)
    db.line([(196, ground - 166), (198, ground - 94)], fill=INK, width=1.5)
    da.poly(canopy, fill="#FFFFFF")
    # marchand qui mène
    db.rrect((42, ground - 58, 58, ground), 6, fill="#5E4E3A")
    db.rrect((64, ground - 58, 80, ground), 6, fill="#5E4E3A")
    db.poly([(38, ground - 128), (84, ground - 128), (92, ground - 54),
             (30, ground - 54)], fill="#8A5A34", outline=INK, width=2)
    db.poly([(38, ground - 128), (58, ground - 128), (52, ground - 54),
             (30, ground - 54)], fill="#A06A40")
    _gp_carrure(db, 61, ground - 128, 23, "#A06A40")
    db.ellipse((47, ground - 164, 75, ground - 136), fill="#B99B7E",
               outline=INK, width=1.5)
    _gp_yeux(db, 61, ground - 154)
    db.pieslice((43, ground - 172, 79, ground - 142), 180, 360, fill="#6E5A3E")
    # bras tenant le timon
    _gp_bras(db, [(80, ground - 116), (100, ground - 84)], "#8A5A34")
    db.ellipse((92, ground - 92, 106, ground - 78), fill="#B99B7E", outline=INK, width=1.5)


def unite_chasseur(db, da, w, h):
    """256x320, Chasseur à réaction (nouveau) : fuselage effilé, verrière bulle,
    aile delta, missile underwing (fuselage = accent)."""
    cx, ground = 128, 260
    shadow(db, cx, ground - 10, 70)
    # flamme de turboréacteur
    db.poly([(58, ground - 176), (38, ground - 172), (58, ground - 166)],
            fill=OR, outline=INK, width=1)
    # fuselage effilé vers le nez (accent)
    fuselage = [(60, ground - 180), (170, ground - 180), (206, ground - 170),
                (170, ground - 160), (60, ground - 160)]
    db.poly(fuselage, fill="#9EA6B2", outline=INK, width=2)
    da.poly(fuselage, fill="#FFFFFF")
    # dérive + empennage
    db.poly([(62, ground - 180), (62, ground - 208), (88, ground - 180)],
            fill="#6E747C", outline=INK, width=1.5)
    db.poly([(56, ground - 172), (88, ground - 172), (80, ground - 164),
             (56, ground - 164)], fill="#6E747C", outline=INK, width=1.5)
    # verrière bulle
    db.ellipse((126, ground - 192, 156, ground - 176), fill="#8FB4CC",
               outline=INK, width=1.5)
    # aile delta + missile underwing
    db.poly([(116, ground - 158), (162, ground - 158), (144, ground - 126),
             (104, ground - 126)], fill="#6E747C", outline=INK, width=2)
    db.rrect((114, ground - 122, 152, ground - 112), 3, fill="#55555C",
             outline=INK, width=1.5)
    db.poly([(152, ground - 122), (164, ground - 117), (152, ground - 112)],
            fill=ROUGE_JOUEUR, outline=INK, width=1)
    # prise d'air sous le nez
    db.rrect((168, ground - 162, 190, ground - 152), 3, fill="#55555C",
             outline=INK, width=1.5)


def unite_bombardier(db, da, w, h):
    """256x320, Bombardier (nouveau) : gros fuselage, aile à nacelles, dérive
    multiple, soute ouverte (fuselage = accent)."""
    cx, ground = 128, 260
    shadow(db, cx, ground - 10, 92)
    # fuselage épais (accent)
    db.rrect((40, ground - 196, 186, ground - 158), 16, fill="#9EA6B2", outline=INK, width=2)
    da.rrect((40, ground - 196, 186, ground - 158), 16, fill="#FFFFFF")
    # nez vitré
    db.poly([(180, ground - 192), (198, ground - 178), (180, ground - 164)],
            fill="#8FB4CC", outline=INK, width=1.5)
    # dérive multiple
    db.poly([(46, ground - 196), (46, ground - 234), (78, ground - 196)],
            fill="#6E747C", outline=INK, width=2)
    db.poly([(70, ground - 196), (70, ground - 216), (92, ground - 196)],
            fill="#6E747C", outline=INK, width=1.5)
    db.poly([(40, ground - 186), (76, ground - 186), (70, ground - 176),
             (40, ground - 176)], fill="#6E747C", outline=INK, width=1.5)
    # aile chargée + nacelles
    db.poly([(94, ground - 162), (182, ground - 162), (198, ground - 126),
             (110, ground - 126)], fill="#6E747C", outline=INK, width=2)
    db.rrect((116, ground - 150, 142, ground - 128), 8, fill="#55555C",
             outline=INK, width=1.5)
    db.rrect((154, ground - 144, 180, ground - 122), 8, fill="#55555C",
             outline=INK, width=1.5)
    # bombe sous la soute
    db.line([(100, ground - 160), (100, ground - 148)], fill=INK, width=2)
    db.ellipse((92, ground - 146, 110, ground - 122), fill="#3E3E42", outline=INK, width=1.5)
    db.poly([(94, ground - 146), (108, ground - 146), (112, ground - 138),
             (90, ground - 138)], fill="#55555C", outline=INK, width=1)


def unite_icbm(db, da, w, h):
    """256x320, ICBM (7m R-138) : missile debout sur son pas de tir, ogive
    pointue, bandes d'avertissement (accent = plage lumineuse du nez)."""
    cx, ground = 128, 300
    shadow(db, cx, ground + 4, 40)
    db.ellipse((cx - 46, ground - 26, cx + 46, ground - 2), fill="#4A4E55", outline=INK, width=2)
    db.ellipse((cx - 28, ground - 20, cx + 28, ground - 6), fill="#33363B", outline=INK, width=1)
    db.poly([(cx - 20, ground - 30), (cx + 20, ground - 30), (cx + 20, ground - 180),
             (cx, ground - 218), (cx - 20, ground - 180)], fill="#B9BEC6", outline=INK, width=2)
    db.poly([(cx - 20, ground - 30), (cx - 6, ground - 30), (cx - 6, ground - 180),
             (cx, ground - 218), (cx - 20, ground - 180)], fill="#9EA6B2")
    db.rrect((cx - 20, ground - 96, cx + 20, ground - 78), 2, fill="#C9A227", outline=INK, width=1)
    db.rrect((cx - 20, ground - 62, cx + 20, ground - 50), 2, fill="#C9A227", outline=INK, width=1)
    db.poly([(cx - 20, ground - 96), (cx - 52, ground - 40), (cx - 20, ground - 40)],
            fill="#6E7681", outline=INK, width=2)
    db.poly([(cx + 20, ground - 96), (cx + 52, ground - 40), (cx + 20, ground - 40)],
            fill="#6E7681", outline=INK, width=2)
    da.ellipse((cx - 10, ground - 196, cx + 10, ground - 176), fill="#FFFFFF")


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
        # Phase 7o — artefacts / reliques (RULES.md §7.10, R-151..R-156)
        "artefact_angkor_wat": (224, 256, artefact_angkor_wat),
        "artefact_arche_alliance": (224, 256, artefact_arche_alliance),
        "artefact_sept_cites_or": (224, 256, artefact_sept_cites_or),
        "artefact_ecole_confucius": (224, 256, artefact_ecole_confucius),
        "artefact_chevaliers_templiers": (224, 256, artefact_chevaliers_templiers),
        "artefact_atlantide": (224, 256, artefact_atlantide),
        # Phase 7e — unités terrestres complémentaires (Appendice A)
        "unite_piquier": (256, 320, unite_piquier),
        "unite_milice": (256, 320, unite_milice),
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
        # Phase 7g — naval & espionnage (R-117..R-119).
        "unite_galere": (256, 320, unite_galere),
        "unite_galion": (256, 320, unite_galion),
        "unite_croiseur": (256, 320, unite_croiseur),
        "unite_cuirasse": (256, 320, unite_cuirasse),
        "unite_sous_marin": (256, 320, unite_sous_marin),
        "unite_espion": (256, 320, unite_espion),
        "unite_caravane": (256, 320, unite_caravane),
        "unite_chasseur": (256, 320, unite_chasseur),
        "unite_bombardier": (256, 320, unite_bombardier),
        # Phase 7m — nucléaire (R-138) : ICBM (arme stratégique instanciée
        # par le Projet Manhattan).
        "unite_icbm": (256, 320, unite_icbm),
        # Phase 7h — GP restants (R-123) : Scientifique, Mogul, Ingénieur, Leader.
        "unite_scientifique": (256, 320, unite_scientifique),
        "unite_mogul": (256, 320, unite_mogul),
        "unite_ingenieur": (256, 320, unite_ingenieur),
        "unite_leader": (256, 320, unite_leader),
        # Phase 7k — sprites DÉDIÉS des 6 classes canoniques de GP (R-126) :
        # fin des alias 7j (silhouettes réutilisées), un fichier par classe.
        "unite_artiste_penseur": (256, 320, unite_artiste_penseur),
        "unite_savant": (256, 320, unite_savant),
        "unite_batisseur": (256, 320, unite_batisseur),
        "unite_explorateur": (256, 320, unite_explorateur),
        "unite_humanitaire": (256, 320, unite_humanitaire),
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
        # Phase 7h (R-121) : menu de gouvernement.
        "icone_gouvernement": icone_gouvernement,
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
          "infanterie_moderne", "char_d_assaut", "artillerie", "milice"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
# Phase 7g : naval & espionnage (R-117..R-119).
for n in ["galere", "galion", "croiseur", "cuirasse", "sous_marin", "espion",
          "caravane", "chasseur", "bombardier"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
# Phase 7m (R-138) : ICBM — arme stratégique.
EXPECTED["unite_icbm.png"] = (256, 320)
EXPECTED["unite_icbm_accent.png"] = (256, 320)
# Phase 7f : GP de culture (Artiste, Penseur) — fichiers historiques conservés.
for n in ["artiste", "penseur"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
# Phase 7h : GP restants (R-123) + icône gouvernement (R-121).
for n in ["scientifique", "mogul", "ingenieur", "leader"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
# Phase 7k (R-126) : sprites dédiés des 6 classes canoniques de GP — la classe
# `leader` partage son fichier 7h ; les autres remplacent les alias 7j.
for n in ["artiste_penseur", "savant", "batisseur", "explorateur", "humanitaire"]:
    EXPECTED[f"unite_{n}.png"] = (256, 320)
    EXPECTED[f"unite_{n}_accent.png"] = (256, 320)
for n in ["or", "commerce", "science", "nourriture", "production", "pv", "pm", "fin_tour", "reseau", "culture", "gouvernement"]:
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
