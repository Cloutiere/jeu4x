# Génère l'icône de l'application à partir du sprite de la ville capitale du jeu
# (apps/web/public/art/ville_capitale.png — aucune retouche de l'asset source).
# Sortie : resources/icon.png (512) + resources/icon.ico (256→16).
# Usage : python resources/make-icon.py

from PIL import Image, ImageDraw

import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'apps', 'web', 'public', 'art', 'ville_capitale.png')
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

FOND = (26, 28, 34, 255)  # même teinte que le fond de fenêtre de la coquille
SIZE = 512
MARGE = 0.14  # marge relative autour du sprite
RAYON = 96  # coins arrondis du fond


def main() -> None:
    sprite = Image.open(SRC).convert('RGBA')

    base = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    fond = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(fond)
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=RAYON, fill=FOND)
    base.alpha_composite(fond)

    cible = int(SIZE * (1 - 2 * MARGE))
    ratio = min(cible / sprite.width, cible / sprite.height)
    taille = (max(1, round(sprite.width * ratio)), max(1, round(sprite.height * ratio)))
    sprite_scaled = sprite.resize(taille, Image.LANCZOS)
    position = ((SIZE - taille[0]) // 2, (SIZE - taille[1]) // 2)
    base.alpha_composite(sprite_scaled, position)

    png_path = os.path.join(OUT_DIR, 'icon.png')
    base.save(png_path)

    ico_path = os.path.join(OUT_DIR, 'icon.ico')
    base.save(ico_path, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])

    print(f'ok : {png_path} + {ico_path}')


if __name__ == '__main__':
    main()
