"""Le tableau du premier chiffre, en groupe : les objets serrés les uns contre les autres, certains devant d'autres.
Chaque objet ne garde que ce qu'on en voit (sa silhouette moins celles des objets devant lui) ; plus il est loin, plus
son creux est profond. Écrit js/empreintes.js. À lancer (avec shapely) après dump.py : python groupe.py [aperçu.png]"""
import json, sys
from shapely import affinity
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union
from sil import D, sil, VIEWS

# [nom, vue, x de son bord gauche (m), y de sa base (m), plan (0 : devant ; 1 : tout au fond ; il règle la profondeur
#  du creux, et peut s'en écarter pour distinguer un objet de ses voisins), miroir, rotation (°)] ; NUANCE : la nuance
#  choisie d'un objet (0 : le blanc du mur, 1 : la plus sombre), quand la nuance mêlée ne le distingue pas assez
# Du fond vers l'avant : un objet cache ceux qui sont listés avant lui.
GROUPE = [
    # les longs, debout derrière tout le monde, qui dépassent
    ("Pelle · jardinage", "face", -0.88, 0.35, 0.9, False, 180),
    ("Échelle · montage", "dessus", -0.40, 0.35, 1.0, False, 90),
    ("Râteau · jardinage", "dessus", 0.70, 0.35, 0.95, False, -90),
    ("Balai · nettoyage", "profil", 1.45, 0.35, 0.9, False, 180),
    # derrière le groupe
    ("Tabouret · montage", "face", 0.25, 0.30, 0.72, False, 0),
    # le groupe
    ("Diable · livraison", "profil", -1.17, 0.06, 0.45, False, 0),
    ("Carton ouvert · desencombrement", "face", -0.74, 0.0, 0.3, False, 0),
    ("Brouette · jardinage", "profil", 0.88, 0.04, 0.55, True, 0),   # sans manche ni pied (COUPE)
    ("Seau · nettoyage", "face", 0.90, 0.02, 0.35, False, 0),        # plus petit (TAILLE), entre le sac et la brouette
    # devant
    ("Sac poubelle · desencombrement", "face", 0.45, -0.14, 0.12, False, 0),
]

NUANCE = {"Carton ouvert · desencombrement": 0.0, "Sac poubelle · desencombrement": 0.85, "Diable · livraison": 0.35,
          "Brouette · jardinage": 0.5, "Seau · nettoyage": 0.2, "Tabouret · montage": 0.55, "Échelle · montage": 0.3,
          "Pelle · jardinage": 0.45, "Râteau · jardinage": 0.4, "Balai · nettoyage": 0.4}
# les contours : [encoches comblées (m, coins rentrants arrondis), dents et bavures retirées (m, plus fines que deux
#  fois cette mesure)] ; les objets aux détails plus fins que ça (les dents du râteau, l'anse du seau) n'y passent pas ;
#  les objets ronds, arrondis en plus (m)
NET = (0.008, 0.004)
FIN = {"Râteau · jardinage", "Seau · nettoyage"}
ROND = {"Sac poubelle · desencombrement": 0.03}
# ce qu'on voit d'un objet : les éclats plus fins que deux fois cette mesure (m) retirés, et les morceaux plus petits
# que cette aire (m²)
ECLAT, MIETTE = 0.01, 4e-3
# la taille d'un objet, quand elle doit s'écarter de sa taille réelle
TAILLE = {"Seau · nettoyage": 0.7}
# ce qu'on garde d'un objet (polygone dans son repère, une fois retourné ou tourné, son coin en bas à gauche en 0, 0) :
# la brouette sans son manche ni son pied (la benne et la roue)
COUPE = {"Brouette · jardinage": [(0.64, 0.95), (2.1, 0.95), (2.1, -0.1), (0.82, -0.1), (0.82, 0.31), (0.70, 0.505), (0.64, 0.6)]}

def big(g):
    return max(getattr(g, "geoms", [g]), key=lambda p: p.area)

def net(g, n):
    c, o = NET
    if n not in FIN:
        g = g.buffer(c, join_style=1).buffer(-c, join_style=1)                       # encoches comblées
        g = big(g.buffer(-o, join_style=2).buffer(o, join_style=2))                  # bavures retirées, coins vifs gardés
    if n in ROND: g = big(g.buffer(-ROND[n], join_style=1).buffer(ROND[n], join_style=1))
    return g.simplify(0.004)

def shape(n, v, x, y, mirror, rot):
    g = sil(D[n]["tris"], VIEWS[v]).buffer(-0.002, join_style=2).simplify(0.008)
    if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
    g = net(g, n)
    if n in TAILLE: g = affinity.scale(g, TAILLE[n], TAILLE[n], origin="centroid")
    if mirror: g = affinity.scale(g, -1, 1, origin="centroid")
    if rot: g = affinity.rotate(g, rot, origin="centroid")
    x0, y0, x1, y1 = g.bounds
    g = affinity.translate(g, -x0, -y0)
    if n in COUPE:
        g = g.intersection(Polygon(COUPE[n]))
        if isinstance(g, MultiPolygon): g = max(g.geoms, key=lambda p: p.area)
    x0, y0, x1, y1 = g.bounds
    return affinity.translate(g, x - x0, y - y0)

items = [(n, d, shape(n, v, x, y, m, r)) for n, v, x, y, d, m, r in GROUPE]
# ce qu'on voit de chacun : moins tout ce qui est devant lui (listé après)
seen = []
for i, (n, d, g) in enumerate(items):
    front = unary_union([h for _, _, h in items[i + 1:]]) if i + 1 < len(items) else None
    v = g.difference(front) if front is not None else g
    if n not in FIN: v = v.buffer(-ECLAT, join_style=2).buffer(ECLAT, join_style=2).intersection(v)
    polys = [p for p in getattr(v, "geoms", [v]) if isinstance(p, Polygon) and p.area > MIETTE]
    seen.append((n, d, polys))
allg = unary_union([g for _, _, g in items])
X0, Y0, X1, Y1 = allg.bounds
W, H = X1 - X0, Y1 - Y0
S, cx, cy = 1 / H, (X0 + X1) / 2, (Y0 + Y1) / 2
res = []
for n, d, polys in seen:
    out = []
    for p in polys:
        p = affinity.scale(affinity.translate(p, -cx, -cy), S, S, origin=(0, 0)).simplify(0.0015)
        if p.is_empty or not isinstance(p, Polygon): continue
        rings = [[[round(x, 4), round(y, 4)] for x, y in list(p.exterior.coords)[:-1]]]
        rings += [[[round(x, 4), round(y, 4)] for x, y in list(h.coords)[:-1]] for h in p.interiors if Polygon(h).area > 2e-5]
        out.append(rings)
    res.append({"n": n.split(" · ")[0], "s": D[n]["service"], "d": d, "t": NUANCE.get(n), "p": out})
print(f"groupe {W:.2f} x {H:.2f} m ; largeur {W / H:.3f}")

lines = ["// Les empreintes des objets de l'îlot, pour le premier chiffre (5 services) creusé dans le mur (js/statsmur.js) :",
"// un groupe d'objets serrés, certains devant d'autres, chacun à sa silhouette exacte et à sa taille réelle.",
"// Silhouettes tirées de blender/hero.blend (union des triangles projetés, de face, de profil ou de dessus) ; chaque",
"// objet ne garde que ce qu'on en voit (les objets devant lui retranchés) : blender/scripts/empreintes/ (dump.py dans",
"// Blender, puis groupe.py avec shapely). Coordonnées : centrées, en hauteurs du groupe (x vers la droite, y vers le",
"// haut) ; s : son service ; d : son plan (0 : devant, 1 : tout au fond ; plus loin, plus profond) ; p : ses morceaux",
"// visibles, chacun un contour puis ses trous ; t : sa nuance choisie (0 : le blanc du mur, 1 : la plus sombre), s'il",
"// en a une. Du fond vers l'avant.",
f"export const BOARD_W = {round(W / H, 4)};",
"export const EMPREINTES = ["]
for it in res:
    t = f", t: {it['t']}" if it["t"] is not None else ""
    lines.append(f"  {{ n: {json.dumps(it['n'], ensure_ascii=False)}, s: '{it['s']}', d: {it['d']}{t}, p: {json.dumps(it['p'], separators=(',', ':'))} }},")
lines.append("];")
open("/Users/amandindardenne/Desktop/homeservice/js/empreintes.js", "w").write("\n".join(lines) + "\n")

if len(sys.argv) > 1:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (1100, 600), "white"); dr = ImageDraw.Draw(im); f = 520
    for it in res:
        c = int(225 - 150 * it["d"])
        for rings in it["p"]:
            for k, ring in enumerate(rings):
                dr.polygon([(550 + x * f, 300 - y * f) for x, y in ring], fill="white" if k else (c, c, c), outline=(40, 40, 40))
    im.save(sys.argv[1])
