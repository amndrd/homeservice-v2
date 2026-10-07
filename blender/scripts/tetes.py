"""Relève la place des fleurs de l'îlot (« Îlot · Flore ») pour les abeilles du site : les sommets des corolles (souples,
de couleur qui n'est pas verte) regroupés par fleur ; le centre de chaque groupe, au plus haut. Rangé dans la propriété
« tetes » de l'objet (JSON, repère de Blender), exportée avec le modèle (js/hero.js la lit).
Usage : Blender -b scène.blend --python blender/scripts/tetes.py -- sortie.blend"""
import bpy, json, sys
from mathutils import Vector
from mathutils.kdtree import KDTree

o = bpy.data.objects["Îlot · Flore"]
me = o.data
mw = o.matrix_world
soup = [0.0] * len(me.vertices)
me.attributes["souplesse"].data.foreach_get("value", soup)
col = {}
for loop in me.loops:
    col.setdefault(loop.vertex_index, me.color_attributes["Col"].data[loop.index].color)
pts, cols = [], []
for v in me.vertices:
    c = col.get(v.index)
    if c is None or soup[v.index] < 0.8:
        continue
    r, g, b = c[0], c[1], c[2]
    if g > r * 1.15 and g > b * 1.15:                 # vert : feuille, tige, brin
        continue
    if r > 0.3 and g > 0.18 and b < 0.06 and r < 0.6 and abs(r - g) < 0.25 and g < 0.4:   # épillets des graminées
        continue
    pts.append(mw @ v.co)
    cols.append(c)
def lin(h):
    c = [int(h.lstrip("#")[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c])


# les couleurs des corolles et des cœurs, par espèce (flore.py), sans les tons partagés (blanc de base, verts)
PAL = [(sp, lin(h)) for sp, hs in {
    "coquelicot": ("#140809", "#240a0c", "#a80804", "#d4170c", "#1b1216"),
    "bleuet": ("#2a3fb8", "#2f63ef", "#5a8cff", "#4a3aa8", "#3a3550"),
    "marguerite": ("#f8f9f2", "#ffffff", "#dfe8d2", "#c9a000"),
    "bouton_or": ("#7f7a00", "#d8c400", "#e8d400", "#e69a0c"),
    "lavande": ("#8a5cf0", "#5a33c2", "#7247d9"),
    "eglantine": ("#fff3e6", "#ffd0e0", "#ff7bb0", "#f2588f", "#ffc93a"),
    "campanule": ("#5a4fd6", "#7b6df5", "#a69cff"),
    "trefle": ("#c23c7c", "#e86aa6", "#c9367a", "#ffd0e6", "#9e2c64"),
    "pissenlit": ("#e2cc00", "#d8bc00", "#cfa800", "#ecda20"),
    "myosotis": ("#7fb6ff", "#4f8dff", "#ff9ec2", "#ffd23a"),
}.items() for h in hs]
kd = KDTree(len(pts))
for i, p in enumerate(pts):
    kd.insert(p, i)
kd.balance()
done, heads = set(), []
for i, p in enumerate(pts):
    if i in done:
        continue
    group = [j for (_, j, _) in kd.find_range(p, 0.12) if j not in done]
    done.update(group)
    if len(group) < 6:
        continue
    c = sum((pts[j] for j in group), Vector()) / len(group)
    top = max(pts[j].z for j in group)
    # l'espèce : chaque sommet vote pour l'espèce dont la palette (celle de flore.py) a la couleur la plus proche ;
    # les abeilles lui restent fidèles pendant leur tournée, les pétales des rafales prennent sa forme
    votes = {}
    for j in group:
        c_ = Vector(cols[j][:3])
        best = min(PAL, key=lambda e: (e[1] - c_).length)
        votes[best[0]] = votes.get(best[0], 0) + 1
    sp = max(votes, key=votes.get)
    heads.append([round(c.x, 3), round(c.y, 3), round(top, 3), sp])
o["tetes"] = json.dumps(heads)
import collections
print("TETES", len(heads), collections.Counter(h[3] for h in heads))
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
