"""La tondeuse (« Tondeuse · jardinage ») reposée sur ses quatre roues. Lors du passage au sol plat (plat.py), elle
s'était posée sur ses roues arrière et le carter du moteur : penchée vers l'arrière, les petites roues avant à 5 cm du
sol. Dans le modèle, les quatre roues touchent un même plan : on le remet à l'horizontale (pivot au milieu des
roues), puis on la pose sur le sol plat, enfoncée dans l'herbe autant que les roues arrière l'étaient. Sa place et son
orientation vues de dessus ne changent pas.
Usage : Blender -b scène.blend --python blender/scripts/tondeuse.py -- [sortie.blend]"""
import bpy, bmesh, sys
import numpy as np
from mathutils import Vector, Matrix

NAME = "Tondeuse · jardinage"
PLAT = 1.197                                        # hauteur du sol plat (plat.py)
SINK = 0.006                                        # enfoncement des roues dans l'herbe (m)

o = bpy.data.objects[NAME]
bm = bmesh.new()
bm.from_mesh(o.data)
bm.verts.ensure_lookup_table()
mats = [m.name if m else "" for m in o.data.materials]

# les pièces du modèle (morceaux d'un seul tenant) ; les roues : pneus anthracite ronds (≈ 17-18 cm), tout en bas
seen, wheels = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, comp = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop()
        comp.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index)
                stack.append(y)
    co = np.array([tuple(x.co) for x in comp])
    size = co.max(axis=0) - co.min(axis=0)
    dark = any("anthracite" in mats[f.material_index] for x in comp for f in x.link_faces)
    if dark and 0.15 < size[1] < 0.21 and 0.15 < size[2] < 0.2 and size[0] < 0.13 and co[:, 2].mean() < -0.44:
        wheels.append(comp)
assert len(wheels) == 4, len(wheels)

def lows():
    """Le point bas de chaque roue, dans le monde."""
    mw = o.matrix_world
    return [min((mw @ x.co for x in comp), key=lambda p: p.z) for comp in wheels]

before = lows()
print("AVANT", [round(p.z - PLAT, 4) for p in before])
# le plan des quatre points bas → horizontal
P = np.array([tuple(p) for p in before])
c = P.mean(axis=0)
n = Vector(np.linalg.svd(P - c)[2][2])
if n.z < 0:
    n = -n
pivot = Vector(c)
at = Vector(c[:2])
o.matrix_world = (Matrix.Translation(pivot) @ n.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
                  @ Matrix.Translation(-pivot) @ o.matrix_world)
# posée sur le plat, enfoncée de SINK, à sa place vue de dessus
after = lows()
dz = PLAT - SINK - min(p.z for p in after)
mid = sum(after, Vector()) / 4
o.matrix_world = Matrix.Translation((at.x - mid.x, at.y - mid.y, dz)) @ o.matrix_world
print("APRÈS", [round(p.z - PLAT, 4) for p in lows()], "rotation", tuple(round(a, 4) for a in o.matrix_world.to_euler()))

if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1:
    bpy.ops.wm.save_as_mainfile(filepath=sys.argv[sys.argv.index("--") + 1], copy=True)
