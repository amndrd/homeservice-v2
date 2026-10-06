"""Planche de présentation des nouvelles fleurs et de la nouvelle herbe (blender/scripts/flore.py), rendue à l'écart
de l'îlot, sous le soleil de hero.blend. Usage : Blender -b copie.blend --python planche_flore.py -- dossier_sortie"""
import bpy, math, random, sys
from mathutils import Vector
exec(open(bpy.path.abspath("//") + "../blender/scripts/flore.py").read() if False else open(
    "/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())
OUT = sys.argv[sys.argv.index("--") + 1]
Z = 1.197                                           # le sol plat de l'îlot
O = Vector((40, 0, Z))                              # la planche, loin de l'îlot
sc = bpy.context.scene
coll = bpy.data.collections.new("Planche")
sc.collection.children.link(coll)
# un sol d'herbe
bpy.ops.mesh.primitive_plane_add(size=1, location=O + Vector((0, 0.6, -0.002)))
g = bpy.context.active_object; g.scale = (9, 9, 1)
gm = bpy.data.materials.new("planche_sol"); gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (*lin("#7cc94e"), 1)
g.data.materials.append(gm)
for c in g.users_collection: c.objects.unlink(g)
coll.objects.link(g)
rnd = random.Random(7)
# 1. les dix espèces en rang
names = list(ESPECES)
SPOT = {n: O + Vector(((i % 5 - 2) * 1.2, (i // 5) * -1.2 - 1.5, 0)) for i, n in enumerate(names)}   # bien espacées
HEAD = {}
nverts = 0
for n in names:
    B = Flore()
    ESPECES[n](B, SPOT[n], 1.0, rnd)
    ob = bpy.data.objects.new("Planche · " + n, B.mesh("Planche · " + n)); coll.objects.link(ob)
    zs = [v.co.z for v in ob.data.vertices]; top = max(zs)
    hv = [v.co for v in ob.data.vertices if v.co.z > top - 0.06]
    HEAD[n] = sum(hv, Vector()) / len(hv)             # le cœur de la fleur, à peu près
    nverts += len(ob.data.vertices)
    print("ESPECE", n, len(ob.data.vertices), "sommets")
o = ob
# 2. un carré de prairie : herbe nouvelle, graminées et fleurs en petites colonies
B = Flore()
for k in range(160):
    x, y = rnd.uniform(-1.6, 1.6), rnd.uniform(1.8, 3.4)
    touffe(B, O + Vector((x, y, 0)), rnd.uniform(0.85, 1.3), rnd, rnd.choice(list(BRINS)))
for k in range(14):
    graminee(B, O + Vector((rnd.uniform(-1.6, 1.6), rnd.uniform(1.8, 3.4), 0)), rnd.uniform(0.9, 1.1), rnd)
for c in range(9):
    cx, cy, kind = rnd.uniform(-1.4, 1.4), rnd.uniform(1.9, 3.3), names[c % len(names)]
    for k in range(rnd.randint(3, 6)):
        a, d = rnd.uniform(0, math.tau), 0.18 * math.sqrt(rnd.random())
        ESPECES[kind](B, O + Vector((cx + math.cos(a) * d, cy + math.sin(a) * d, 0)), rnd.uniform(0.85, 1.1), rnd)
o2 = bpy.data.objects.new("Planche · prairie", B.mesh("Planche · prairie")); coll.objects.link(o2)
print("SOMMETS espèces", nverts, "prairie", len(o2.data.vertices))
for i, n in enumerate(names):
    pass
# rendus
cam = bpy.data.objects.new("planche_cam", bpy.data.cameras.new("planche_cam")); coll.objects.link(cam)
sc.camera = cam
sc.render.resolution_percentage = 100
sc.cycles.samples = 96
sc.cycles.use_denoising = True
try:
    sc.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
except Exception as e:
    print("gpu", e)
def shot(name, loc, look, lens, w, h):
    cam.location = loc
    cam.rotation_euler = (look - loc).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = f"{OUT}/{name}.png"
    bpy.ops.render.render(write_still=True)
for n in names:
    p, h = SPOT[n], HEAD[n]
    shot("v_" + n, p + Vector((0.5, -0.75, 0.5)), p + Vector((0, 0, (h.z - p.z) * 0.55)), 50, 600, 700)   # entière
    shot("t_" + n, h + Vector((0.12, -0.2, 0.17)), h, 50, 600, 600)                                      # la fleur de près
shot("prairie", O + Vector((0, 0.4, 0.95)), O + Vector((0, 2.6, 0.05)), 35, 1800, 1000)
