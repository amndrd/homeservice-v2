"""Relève la place des fleurs de l'îlot (« Îlot · Flore ») pour les abeilles du site : les sommets des corolles (souples,
de couleur qui n'est pas verte) regroupés par fleur ; le centre de chaque groupe, au plus haut. Rangé dans la propriété
« tetes » de l'objet (JSON, repère de Blender), exportée avec le modèle (js/hero.js la lit).
Usage : Blender -b scène.blend --python blender/scripts/tetes.py -- sortie.blend"""
import bpy, colorsys, json, sys
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
    # l'espèce, d'après la couleur de la corolle : les abeilles restent fidèles à une espèce pendant leur tournée
    rgb = [sum(cols[j][k] for j in group) / len(group) for k in range(3)]
    hh, ss, vv = colorsys.rgb_to_hsv(*[x ** (1 / 2.2) for x in rgb])
    if ss < 0.25:
        sp = "blanc"
    elif hh < 0.04 or hh > 0.95:
        sp = "rouge"
    elif hh < 0.2:
        sp = "jaune"
    elif hh > 0.85:
        sp = "rose"
    elif hh > 0.7:
        sp = "violet"
    else:
        sp = "bleu"
    heads.append([round(c.x, 3), round(c.y, 3), round(top, 3), sp])
o["tetes"] = json.dumps(heads)
import collections
print("TETES", len(heads), collections.Counter(h[3] for h in heads))
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
