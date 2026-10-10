import json
from shapely import affinity
from shapely.geometry import Polygon, MultiPolygon
from sil import D, sil, VIEWS
GAP = 0.16
ROWS = [  # [nom, vue], de gauche à droite ; rangées du haut vers le bas
  [("Échelle · montage", "dessus"), ("Râteau · jardinage", "dessus")],
  [("Pelle · jardinage", "face"), ("Balai · nettoyage", "profil"), ("Diable · livraison", "profil"),
   ("Chaise · desencombrement", "face"), ("Tondeuse · jardinage", "profil")],
  [("Brouette · jardinage", "profil"), ("Seau · nettoyage", "face"), ("Sac poubelle · desencombrement", "face"),
   ("Plante · livraison", "face")],
  [("Carton ouvert · desencombrement", "face"), ("Tabouret · montage", "face"), ("Montage 2 · montage", "dessus"),
   ("Marteau · montage", "face"), ("Pulvérisateur · nettoyage", "face"), ("Sac de courses · livraison", "face")],
]
items = []
for row in ROWS:
    gs = []
    for n, v in row:
        g = sil(D[n]["tris"], VIEWS[v]).buffer(-0.002, join_style=2).simplify(0.008)
        if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
        x0, y0, x1, y1 = g.bounds
        gs.append((n, affinity.translate(g, -x0, -y0)))
    items.append(gs)
W = max(sum(g.bounds[2] for _, g in r) + GAP * (len(r) - 1) for r in items)
out, y = [], 0
for r in items:
    h = max(g.bounds[3] for _, g in r)
    free = (W - sum(g.bounds[2] for _, g in r)) / (len(r) - 1)   # rangée justifiée
    x = 0
    for n, g in r:
        out.append((n, affinity.translate(g, x, -y - h)))   # posés sur le bas de la rangée
        x += g.bounds[2] + free
    y += h + GAP
H = y - GAP
S = 1 / H   # en hauteurs du tableau, centré
res = []
for n, g in out:
    g = affinity.scale(affinity.translate(g, -W / 2, H / 2), S, S, origin=(0, 0))
    g = g.simplify(0.0015)
    rings = [[[round(x, 4), round(y, 4)] for x, y in list(g.exterior.coords)[:-1]]]
    rings += [[[round(x, 4), round(y, 4)] for x, y in list(h.coords)[:-1]] for h in g.interiors if Polygon(h).area > 2e-5]
    res.append({"n": n.split(" · ")[0], "s": D[n]["service"], "p": rings})
print("tableau", round(W, 2), "x", round(H, 2), "m ; largeur", round(W / H, 3), "; points", sum(len(r) for x in res for r in x["p"]))
json.dump({"w": round(W / H, 4), "items": res}, open("board.json", "w"))
from PIL import Image, ImageDraw
im = Image.new("RGB", (900, 900), "white"); d = ImageDraw.Draw(im)
for it in res:
    for k, ring in enumerate(it["p"]):
        d.polygon([(450 + x * 820, 450 - y * 820) for x, y in ring], fill="white" if k else (70, 70, 70))
im.save("board.png")
