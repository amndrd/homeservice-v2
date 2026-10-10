import json, sys
from shapely.geometry import Polygon
from shapely.ops import unary_union
from PIL import Image, ImageDraw
D = json.load(open("tris.json"))
VIEWS = {"face": (0, 2), "profil": (1, 2), "dessus": (0, 1)}
def sil(tris, ax):
    ps = []
    for t in tris:
        p = Polygon([(v[ax[0]], v[ax[1]]) for v in t])
        if p.area > 1e-9: ps.append(p.buffer(0.002, join_style=2))
    return unary_union(ps)
if __name__ == "__main__":
    names = sorted(D); cell = 150
    img = Image.new("RGB", (cell * 3, cell * len(names)), "white"); dr = ImageDraw.Draw(img)
    for r, n in enumerate(names):
        for c, (vn, ax) in enumerate(VIEWS.items()):
            g = sil(D[n]["tris"], ax); x0, y0, x1, y1 = g.bounds; s = (cell - 30) / max(x1 - x0, y1 - y0)
            for poly in getattr(g, "geoms", [g]):
                pts = [(c * cell + 15 + (x - x0) * s, r * cell + 20 + (y1 - y) * s) for x, y in poly.exterior.coords]
                dr.polygon(pts, fill=(60, 60, 60))
                for h in poly.interiors:
                    dr.polygon([(c * cell + 15 + (x - x0) * s, r * cell + 20 + (y1 - y) * s) for x, y in h.coords], fill="white")
            dr.text((c * cell + 3, r * cell + 2), f"{n[:18]} {vn}", fill="red")
    # en deux colonnes de planches
    h = img.height // 2 + cell
    a = img.crop((0, 0, cell * 3, h)); b = img.crop((0, h, cell * 3, img.height))
    out = Image.new("RGB", (cell * 6, h), "white"); out.paste(a, (0, 0)); out.paste(b, (cell * 3, 0)); out.save("planche.png")
