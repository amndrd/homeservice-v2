"""Remplace les buissons de l'îlot (« Îlot · Buissons » : des boules à facettes) par ceux de flore.py, à leurs places et
à leur taille : chaque buisson actuel (un groupe de boules voisines) devient un buisson feuillu, à baies ou fleuri.
Usage : Blender -b scène.blend --python blender/scripts/remplace_buissons.py -- sortie.blend"""
import bpy, bmesh, math, random, sys
from mathutils import Vector
exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())

Z = 1.197
DENSITY = 0.65                                      # moins de feuilles que sur la planche : on les voit de loin
KINDS = ["feuillu", "baies", "fleuri"]
old = bpy.data.objects["Îlot · Buissons"]
mw = old.matrix_world
bm = bmesh.new(); bm.from_mesh(old.data); bm.verts.ensure_lookup_table()
seen, pieces = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    comp, stack = [], [v]; seen.add(v.index)
    while stack:
        a = stack.pop(); comp.append(mw @ a.co)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen:
                seen.add(b.index); stack.append(b)
    c = sum(comp, Vector()) / len(comp)
    r = max((p - c).length for p in comp)
    pieces.append((c, r))
bm.free()
# les boules d'un même buisson sont voisines ; les baies (petites) suivent leur buisson
big = [p for p in pieces if p[1] > 0.08]
groups = []
for c, r in big:
    for g in groups:
        if (Vector((c.x, c.y)) - Vector((g[0].x, g[0].y))).length < 0.55:
            g[1].append((c, r)); break
    else:
        groups.append([c, [(c, r)]])
rnd = random.Random(42)
B = Flore()
for i, (c0, members) in enumerate(groups):
    cx = sum((m[0] for m in members), Vector()) / len(members)
    xs = [m[0].x for m in members] + [m[0].x for m in members]
    span = max(((m[0] - cx) * Vector((1, 1, 0))).length + m[1] for m in members)
    rad = max(0.2, min(0.5, span * 1.0))
    buisson(B, Vector((cx.x, cx.y, Z)), rad, random.Random(rnd.random()), KINDS[i % 3], density=DENSITY)
print("BUISSONS", len(groups))
me = B.mesh("Îlot · Buissons")
new = bpy.data.objects.new("Îlot · Buissons", me)
coll = old.users_collection[0]
parent = old.parent
bpy.data.objects.remove(old, do_unlink=True)
new.name = "Îlot · Buissons"
coll.objects.link(new)
if parent:
    new.parent = parent
    new.matrix_parent_inverse = parent.matrix_world.inverted()
vent = bpy.data.node_groups.get("Vent")
fl = bpy.data.objects.get("Îlot · Flore")
if fl:
    for m in fl.modifiers:
        if m.type == "NODES":
            nm = new.modifiers.new(m.name, "NODES"); nm.node_group = m.node_group
print("SOMMETS", len(me.vertices))
out = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("ENREGISTRÉ", out)
