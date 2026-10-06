"""Planche de présentation des nouveaux buissons (flore.py : buisson), à côté des anciens (ilot.py : des boules)."""
import bpy, math, random, sys, bmesh
from mathutils import Vector
exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())
OUT = sys.argv[sys.argv.index("--") + 1]
Z = 1.197
O = Vector((40, 8, Z))
sc = bpy.context.scene
bpy.ops.mesh.primitive_plane_add(size=1, location=O + Vector((0, 0, -0.002)))
g = bpy.context.active_object; g.scale = (8, 6, 1)
gm = bpy.data.materials.new("planche_sol"); gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Base Color"].default_value = (*lin("#7cc94e"), 1)
g.data.materials.append(gm)
rnd = random.Random(11)
# l'ancien buisson, pour comparer : une copie d'une pièce du maillage actuel n'est pas simple ; on le refait comme ilot.py
old = bpy.data.objects.get("Îlot · Buissons")
spots = {"ancien": O + Vector((-1.2, 0, 0)), "feuillu": O + Vector((-0.4, 0, 0)), "baies": O + Vector((0.4, 0, 0)),
         "fleuri": O + Vector((1.2, 0, 0))}
B = Flore()
for k in ("feuillu", "baies", "fleuri"):
    buisson(B, spots[k], 0.32, rnd, k)
me = B.mesh("Planche · buissons"); o = bpy.data.objects.new("Planche · buissons", me); sc.collection.objects.link(o)
print("SOMMETS", len(me.vertices), "pour 3 buissons")
# l'ancien : quelques boules à facettes vertes (feuille_sombre / feuille), comme ilot.py
bm = bmesh.new()
r = random.Random(300)
for k in range(3):
    a = r.uniform(0, math.tau)
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.32 * r.uniform(0.7, 1.0))
    c = spots["ancien"] + Vector((math.cos(a) * 0.16, math.sin(a) * 0.16, 0.32 * 0.55))
    for v in res["verts"]:
        v.co *= 1 + r.uniform(-0.16, 0.16); v.co.z *= 0.85; v.co += c
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = 0 if k else 1
me2 = bpy.data.meshes.new("ancien"); bm.to_mesh(me2)
for p in me2.polygons: p.use_smooth = False
for nm in ("Îlot · feuille_sombre", "Îlot · feuille"):
    m = bpy.data.materials.get(nm) or next((m for m in bpy.data.materials if m.name.startswith(nm)), None)
    me2.materials.append(m)
o2 = bpy.data.objects.new("ancien", me2); sc.collection.objects.link(o2)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
sc.cycles.samples = 96; sc.cycles.use_denoising = True
try:
    sc.cycles.device = "GPU"; prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
except Exception as e:
    print("gpu", e)
def shot(name, loc, look, lens, w, h):
    cam.location = loc; cam.rotation_euler = (look - loc).to_track_quat("-Z", "Y").to_euler(); cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = w, h
    sc.render.filepath = f"{OUT}/{name}.png"; bpy.ops.render.render(write_still=True)
shot("rang", O + Vector((0, -3.6, 1.5)), O + Vector((0, 0, 0.25)), 40, 2000, 800)
for k in ("feuillu", "baies", "fleuri"):
    shot("b_" + k, spots[k] + Vector((0.5, -1.0, 0.75)), spots[k] + Vector((0, 0, 0.28)), 50, 800, 700)
