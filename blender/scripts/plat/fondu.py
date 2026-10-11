# L'ombre s'efface avant les bords de l'image (à gauche, à droite, en bas : le groupe n'y touche pas) ; écrit le webp
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("RGBA")).astype(np.float32)
h, w = a.shape[:2]
f = 0.09
sm = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
x = np.linspace(0, 1, w); y = np.linspace(0, 1, h)
mx = sm(x / f) * sm((1 - x) / f)
my = sm((1 - y) / f)
m = my[:, None] * mx[None, :]
a *= m[..., None]                                  # prémultiplié : couleur et alpha ensemble
out = np.zeros_like(a); al = a[..., 3:] / 255
out[..., :3] = np.where(al > 0, a[..., :3] / np.maximum(al, 1e-6), 0); out[..., 3] = a[..., 3]
im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")
im.save(sys.argv[2], quality=88, method=6)
bg = Image.new("RGB", im.size, (247, 247, 245)); bg.paste(im, (0, 0), im); bg.thumbnail((1000, 1000)); bg.save("fondu_v.png")
print(im.size)
