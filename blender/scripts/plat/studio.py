# Le groupe du premier chiffre en studio (style produit) : chaque objet posé au sol, en profondeur, vu en légère
# plongée par une caméra orthographique ; même composition à l'écran que le groupe (layout.json) : la base de chaque
# objet, à l'écran, à sa hauteur dans le groupe. Lumière douce de studio, ombres de contact sur un sol invisible.
import bpy, bmesh, json, os, sys, math
from mathutils import Matrix, Vector
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "studio.png"
RES = int(ARGS[1]) if len(ARGS) > 1 else 1000
SAMPLES = int(ARGS[2]) if len(ARGS) > 2 else 64
TILT = math.radians(12)
HERE = os.path.dirname(bpy.data.filepath)
L = json.load(open(os.path.join(HERE, "layout.json")))
AX = {"face": (0, 2, 1, 1), "profil": (1, 2, 0, -1), "dessus": (0, 1, 2, -1)}
dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.data.scenes.new("Studio")
col = sc.collection
def inside(pt, poly):
    x, y = pt; c = False; n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]; x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
GROUPE_Y = {"Pelle · jardinage": 0.35, "Échelle · montage": 0.35, "Râteau · jardinage": 0.35, "Balai · nettoyage": 0.35,
    "Tabouret · montage": 0.30, "Diable · livraison": 0.06, "Carton ouvert · desencombrement": 0.0,
    "Brouette · jardinage": 0.04, "Seau · nettoyage": 0.02, "Sac poubelle · desencombrement": -0.14}
# ---------- matières : satinées, couleurs de chaque matière un peu affinées
mats = {}
def studio_mat(m):
    if m is None: m_name, c = "gris", (0.6, 0.6, 0.62, 1)
    else: m_name, c = m.name, tuple(m.diffuse_color)
    if m_name in mats: return mats[m_name]
    t = bpy.data.materials.new("S " + m_name); t.use_nodes = True
    p = next(n for n in t.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    p.inputs["Base Color"].default_value = c
    lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    metal = abs(c[0] - c[1]) < 0.03 and abs(c[1] - c[2]) < 0.05 and 0.25 < lum < 0.7   # les gris clairs : alu brossé
    p.inputs["Roughness"].default_value = 0.32 if metal else 0.5
    p.inputs["Metallic"].default_value = 0.6 if metal else 0.0
    try: p.inputs["Coat Weight"].default_value = 0.15
    except KeyError: pass
    mats[m_name] = t; return t
for k, it in enumerate(L["items"]):
    o = bpy.data.objects[it["n"]]
    a, b, c, s = AX[it["view"]]
    M = it["M"]
    G = Matrix.Identity(4)
    for j in range(4): G[0][j] = G[1][j] = G[2][j] = 0
    G[0][a] = M[0][0]; G[0][b] = M[0][1]; G[0][3] = M[0][2]
    G[2][a] = M[1][0]; G[2][b] = M[1][1]; G[2][3] = M[1][2]
    G[1][c] = -s                                  # profondeur : loin = grand Y (s : vers nous)
    base = o.matrix_world.inverted()
    scm = Matrix.Diagonal(o.matrix_world.to_scale().to_4d())
    parts = []
    for m in [o] + list(o.children_recursive):
        if m.type != 'MESH' or m.hide_render: continue
        me = bpy.data.meshes.new_from_object(m.evaluated_get(dg))
        me.transform(G @ scm @ base @ m.matrix_world)
        if G.to_3x3().determinant() < 0: me.flip_normals()
        if it["cut"]:
            bm = bmesh.new(); bm.from_mesh(me)
            for _ in range(8):
                long = [e for e in bm.edges if e.calc_length() > 0.03]
                if not long: break
                bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
            bmesh.ops.triangulate(bm, faces=bm.faces[:])
            bad = [f for f in bm.faces if not inside((f.calc_center_median().x, f.calc_center_median().z), it["cut"])]
            bmesh.ops.delete(bm, geom=bad, context='FACES'); bm.to_mesh(me); bm.free()
        parts.append(me)
    vs = [v.co for me in parts for v in me.vertices]
    zmin = min(v.z for v in vs); ymin = min(v.y for v in vs)
    D = GROUPE_Y[it["n"]] / math.tan(TILT)
    for me in parts:
        me.transform(Matrix.Translation((0, D - ymin, -zmin)))
        for i, sl in enumerate(me.materials): me.materials[i] = studio_mat(sl)
        if not me.materials: me.materials.append(studio_mat(None))
        for poly in me.polygons: poly.use_smooth = True
        try: me.set_sharp_from_angle(angle=math.radians(40))
        except Exception: pass
        no = bpy.data.objects.new(f"S {it['n']}", me); col.objects.link(no)
# ---------- le sol : il ne garde que les ombres
bpy.ops.mesh.primitive_plane_add(size=60, location=(0.5, 5, 0))
floor = bpy.context.active_object
for c0 in floor.users_collection: c0.objects.unlink(floor)
col.objects.link(floor)
floor.is_shadow_catcher = True
# ---------- la caméra : orthographique, en légère plongée, cadrée sur le groupe et ses ombres
cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam")); col.objects.link(cam)
cam.data.type = 'ORTHO'
cam.rotation_euler = (math.pi / 2 - TILT, 0, 0)
fwd = Vector((0, math.cos(TILT), -math.sin(TILT))); up = Vector((0, math.sin(TILT), math.cos(TILT))); right = Vector((1, 0, 0))
pts = [o.matrix_world @ v.co for o in col.objects if o.type == 'MESH' and o is not floor for v in o.data.vertices]
xs = [p.dot(right) for p in pts]; ys = [p.dot(up) for p in pts]
pad = 0.45
x0, x1 = min(xs) - pad, max(xs) + pad
y0, y1 = min(ys) - pad, max(ys) + 0.08          # de la place autour du groupe : son ombre s'efface avant le bord
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
cam.location = right * cx + up * cy - fwd * 40
cam.data.ortho_scale = max(x1 - x0, y1 - y0); cam.data.clip_end = 100
sc.camera = cam
w, h = x1 - x0, y1 - y0
sc.render.resolution_x = RES if w >= h else round(RES * w / h)
sc.render.resolution_y = RES if h > w else round(RES * h / w)
json.dump({"w": w, "h": h, "cx": cx, "cy": cy}, open(os.path.join(HERE, "studio_frame.json"), "w"))
# ---------- lumière de studio : grande boîte à lumière en haut à gauche, devant ; contre-jour doux ; ciel blanc faible
def area(name, loc, size, power, color=(1, 1, 1)):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA'))
    l.data.size = size; l.data.energy = power; l.data.color = color
    l.location = loc
    d = Vector((0.4, 0.8, 0.6)) - Vector(loc)
    l.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    col.objects.link(l); return l
# (le contre-jour ne fait pas d'ombre : ses ombres partiraient vers nous et voileraient le sol derrière)
area("Clef", (-4.5, -4.0, 5.5), 5.0, 2000, (1.0, 0.98, 0.95))
area("Remplissage", (5.0, -3.5, 2.5), 6.0, 600, (0.95, 0.97, 1.0)).data.use_shadow = False
area("Contre", (1.0, 6.0, 6.0), 4.0, 1100).data.use_shadow = False
w0 = bpy.data.worlds.new("Studio"); w0.use_nodes = True
bg = w0.node_tree.nodes["Background"]; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.25
sc.world = w0
# ---------- rendu
sc.render.engine = 'CYCLES'
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print("CPU", e)
sc.render.film_transparent = True
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Punchy'
except TypeError: pass
sc.view_settings.exposure = -0.35
sc.render.filepath = os.path.join(HERE, OUT)
bpy.context.window.scene = sc if bpy.context.window else None
bpy.ops.render.render(write_still=True, scene="Studio")
print("FRAME", w, h)
