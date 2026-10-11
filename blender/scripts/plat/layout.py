# Pour chaque objet du groupe (groupe.py) : la transformation 2D (affine) des coordonnées projetées de sa vue vers
# celles du groupe (en m), et la coupe (brouette) dans le repère du groupe. Écrit layout.json.
import json, re
from shapely import affinity
from shapely.geometry import Polygon, MultiPolygon, Point
src = open("groupe.py").read()
src = src[:src.index("items = [")]          # seulement les réglages et les fonctions
exec(src)
def track(n, v, x, y, mirror, rot):
    g = sil(D[n]["tris"], VIEWS[v]).buffer(-0.002, join_style=2).simplify(0.008)
    if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
    g = net(g, n)
    ref = MultiPolygon([Polygon([(0, 0), (1, 0), (0, 1)])])   # suit les mêmes opérations
    pts = [Point(0, 0), Point(1, 0), Point(0, 1)]
    def op(f, **k):
        nonlocal g, pts
        o = g.centroid
        g = f(g, origin=o, **k); pts = [f(p, origin=o, **k) for p in pts]
    if n in TAILLE: op(affinity.scale, xfact=TAILLE[n], yfact=TAILLE[n])
    if mirror: op(affinity.scale, xfact=-1, yfact=1)
    if rot: op(affinity.rotate, angle=rot)
    x0, y0, x1, y1 = g.bounds
    g = affinity.translate(g, -x0, -y0); pts = [affinity.translate(p, -x0, -y0) for p in pts]
    cut = None
    if n in COUPE:
        cut = Polygon(COUPE[n])
        g = g.intersection(cut)
        if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
    x0, y0, x1, y1 = g.bounds
    dx, dy = x - x0, y - y0
    pts = [(p.x + dx, p.y + dy) for p in pts]
    o, a, b = pts
    M = [[a[0] - o[0], b[0] - o[0], o[0]], [a[1] - o[1], b[1] - o[1], o[1]]]
    if cut is not None: cut = [(px + dx, py + dy) for px, py in cut.exterior.coords[:-1]]
    return {"n": n, "view": v, "M": M, "cut": cut, "final": affinity.translate(g, dx, dy)}
out = [track(n, v, x, y, m, r) | {"d": d} for n, v, x, y, d, m, r in GROUPE]
from shapely.ops import unary_union
X0, Y0, X1, Y1 = unary_union([o.pop("final") for o in out]).bounds
json.dump({"items": out, "bounds": [X0, Y0, X1, Y1], "views": VIEWS}, open("layout.json", "w"), indent=1)
print([X0, Y0, X1, Y1])
