"""L'image de l'À propos (images/camion.webp) : le rendu du camion (blender/apropos.blend, fond transparent, avec son
ombre) posé sur une forme géométrique en aplat, de couleur, derrière lui. La forme est dessinée à plat (pas de
lumière) ; l'ombre du camion passe dessus. Le fond reste transparent : le tout se pose sur la page.
Lancement (avec Pillow et numpy) : python apropos_forme.py rendus/camion_apropos_hd.png ../images/camion.webp"""
import sys
import numpy as np
from PIL import Image, ImageDraw

SRC, OUT = sys.argv[1], sys.argv[2]
SIZE = (1472, 1104)                                  # 2 × l'affichage (736 × 552)
SS = 3                                               # suréchantillonnage des formes (bords lisses)
# les formes, en part de la hauteur de l'image : [centre x, centre y, rayon, couleur]
# (x aussi en hauteurs : l’image fait 1,33 hauteur de large)
GREEN, MINT = (17, 112, 63), (196, 230, 208)        # le vert du site (#11703f), un vert d'eau clair
SHAPES = [
    ("disque", 0.62, 0.46, 0.40, GREEN),            # le grand disque, derrière la caisse et la cabine
    ("disque", 0.24, 0.24, 0.13, MINT),             # un petit disque clair, en haut à gauche
    ("anneau", 1.2, 0.16, 0.06, GREEN),             # un anneau fin, en haut à droite
]

def shapes(w, h):
    big = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    H = h * SS
    for kind, x, y, r, c in SHAPES:
        cx, cy, R = x * H, y * H, r * H
        box = (cx - R, cy - R, cx + R, cy + R)
        if kind == "disque": d.ellipse(box, fill=c + (255,))
        else: d.ellipse(box, outline=c + (255,), width=int(0.018 * H))
    return big.resize((w, h), Image.BOX)        # moyenne de zone : pas de liseré (Lanczos déborde)

# le rendu, réduit en prémultiplié (bords et ombre propres)
a = np.asarray(Image.open(SRC).convert("RGBA")).astype(np.float32) / 255
a[..., :3] *= a[..., 3:]
# (moyenne de zone, comme les formes : un filtre Lanczos déborde des contours et laisse un liseré clair sur le vert)
truck = np.asarray(Image.fromarray((a * 255).round().astype(np.uint8), "RGBA").resize(SIZE, Image.BOX)).astype(np.float32) / 255
truck[..., :3] = np.minimum(truck[..., :3], truck[..., 3:])
back = np.asarray(shapes(*SIZE)).astype(np.float32) / 255
back[..., :3] *= back[..., 3:]
# le camion par-dessus la forme (prémultiplié : over)
out = truck + back * (1 - truck[..., 3:])
al = out[..., 3:]
rgb = np.where(al > 1e-4, out[..., :3] / np.maximum(al, 1e-4), 0)
res = np.concatenate([rgb, al], -1)
sh = (res[..., 3] < 0.8) & (res[..., :3].max(-1) < 0.25)   # sous une ombre très légère, la couleur ne compte pas
res[sh, :3] = 0
img = Image.fromarray((res.clip(0, 1) * 255).round().astype(np.uint8), "RGBA")
img.save(OUT, quality=90, method=6)
print(OUT, img.size)
