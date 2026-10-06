"""Le pictogramme du panneau « sol glissant » (« Panneau · nettoyage ») refait d'après le panneau normalisé : une
personne qui glisse en arrière — tête ronde, torse épais en diagonale, bras levés coudés vers le haut, deux jambes
coudées lancées vers la gauche — au-dessus d'un trait de sol. Traits à bouts arrondis, comme sur le panneau. Le
triangle d'encre du panneau est gardé ; seul le personnage (et son sol) est remplacé, sur les deux faces (en miroir
derrière, pour qu'il se lise des deux côtés).
Le dessin est relevé en pixels sur le panneau de référence (triangle jaune intérieur : base y = 530, sommet y = 95,
centre x = 350), puis posé dans le triangle intérieur du panneau.
Usage : Blender -b scène.blend --python blender/scripts/panneau.py -- [sortie.blend]"""
import bpy, bmesh, math, sys
from mathutils import Vector

NAME = "Panneau · nettoyage"
INK = 1                                             # matériau « Encre »
# le panneau : faces avant et arrière (repère de l'objet), penchées de 12° ; leur triangle d'encre intérieur
FACE = {"y": 0.056, "z": 0.062, "slope": 0.208 / 0.978, "n": (0.978, 0.208)}
TRI = {"base": -0.042, "height": 0.188}             # bas et hauteur du triangle jaune intérieur (m)
REF = {"base": 530, "apex": 95, "cx": 350}          # le même, sur l'image de référence (px)
OFF = (0.0012, 0.0042)                              # épaisseur du dessin, au-dessus de la face (m)

# le dessin (px de la référence) : [points du trait, largeur]
STROKES = [
    ([(352, 345), (321, 410)], 27),                 # torse
    ([(284, 270), (300, 318), (346, 344)], 19),     # bras gauche, levé
    ([(368, 352), (424, 341), (433, 300)], 19),     # bras droit, levé
    ([(322, 406), (262, 399), (207, 425)], 20),     # jambe haute
    ([(318, 412), (283, 428), (237, 467)], 20),     # jambe basse
]
HEAD = ((367, 316), 19)                             # centre, rayon
GROUND = ((157, 489), (543, 507))                   # trait de sol (rectangle)
# le triangle d'encre du panneau est plus fin que sur la référence : le personnage y paraît petit ; on l'agrandit
# autour du milieu du trait de sol (le trait garde sa longueur, il touche presque les bords du triangle)
SCALE, ANCHOR = 1.12, (338, 498)


def to_sign(px, py):
    s = TRI["height"] / (REF["base"] - REF["apex"])
    return (px - REF["cx"]) * s, TRI["base"] + (REF["base"] - py) * s, s


def stadium(a, b, r, seg=5):
    """Contour d'un trait de a à b, de rayon r, aux bouts arrondis (2D)."""
    d = (b - a)
    ang = math.atan2(d.y, d.x) if d.length > 1e-9 else 0.0
    pts = []
    for end, base in ((b, ang - math.pi / 2), (a, ang + math.pi / 2)):
        for i in range(seg + 1):
            t = base + math.pi * i / seg
            pts.append(end + Vector((math.cos(t), math.sin(t))) * r)
    return pts


def circle(c, r, seg=16):
    return [c + Vector((math.cos(2 * math.pi * i / seg), math.sin(2 * math.pi * i / seg))) * r for i in range(seg)]


def grow(q):
    return (ANCHOR[0] + (q[0] - ANCHOR[0]) * SCALE, ANCHOR[1] + (q[1] - ANCHOR[1]) * SCALE)


def shapes():
    out = []
    for pts, w in STROKES:
        p = [Vector(to_sign(*grow(q))[:2]) for q in pts]
        r = w * SCALE / 2 * to_sign(0, 0)[2]
        for a, b in zip(p, p[1:]):
            out.append(stadium(a, b, r))
    (hx, hy), hr = HEAD
    out.append(circle(Vector(to_sign(*grow((hx, hy)))[:2]), hr * SCALE * to_sign(0, 0)[2]))
    (x0, y0), (x1, y1) = GROUND
    y0, y1 = grow((0, y0))[1], grow((0, y1))[1]
    a, b = Vector(to_sign(x0, y1)[:2]), Vector(to_sign(x1, y0)[:2])
    out.append([a, Vector((b.x, a.y)), b, Vector((a.x, b.y))])
    return out


def place(u, v, side, off):
    """Un point du dessin (u à droite, v en hauteur) sur la face `side` (-1 : avant, +1 : arrière), à `off` m."""
    x = u if side < 0 else -u                       # derrière : en miroir, il se lit pareil
    y = side * FACE["y"] - side * FACE["slope"] * (v - FACE["z"])
    ny, nz = FACE["n"]
    return Vector((x, y + side * ny * off, v + nz * off))


def apply():
    o = bpy.data.objects[NAME]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    # retire l'ancien personnage : toute l'encre qui n'est pas une barre du triangle (les barres font la largeur)
    seen, drop = set(), []
    for f in bm.faces:
        if f.material_index != INK or f.index in seen:
            continue
        comp, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.material_index == INK and h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        xs = [v.co.x for g in comp for v in g.verts]
        if max(xs) - min(xs) < 0.12:
            drop += comp
    bmesh.ops.delete(bm, geom=list({v for f in drop for v in f.verts}), context="VERTS")
    # le nouveau : chaque forme, en relief sur les deux faces
    for side in (-1, 1):
        for poly in shapes():
            top = [bm.verts.new(place(p.x, p.y, side, OFF[1])) for p in poly]
            low = [bm.verts.new(place(p.x, p.y, side, OFF[0])) for p in poly]
            faces = [bm.faces.new(top)]
            for i in range(len(poly)):
                j = (i + 1) % len(poly)
                faces.append(bm.faces.new((top[i], top[j], low[j], low[i])))
            for f in faces:
                f.material_index = INK
                f.smooth = False
            # la face du dessus regarde vers l'extérieur du panneau
            if faces[0].normal.y * side < 0:
                for f in faces:
                    f.normal_flip()
    bm.to_mesh(o.data)
    bm.free()
    o.data.update()
    print("PANNEAU", len(o.data.vertices), "sommets")


if __name__ == "__main__":
    apply()
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if args:
        bpy.ops.wm.save_as_mainfile(filepath=args[0], copy=True)
        print("ENREGISTRÉ", args[0])
