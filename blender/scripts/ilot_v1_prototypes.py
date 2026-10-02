"""Îlot des services (hero du site non immersif) : un îlot posé sur le vide blanc, qui réunit les cinq services.
Construit à partir des modèles de homeservice-immersive/blender/services.blend (copiés, l'original n'est pas touché),
une scène par prototype, puis enregistré dans blender/ilot.blend ; un rendu par prototype dans blender/rendus/.

  Blender -b ../homeservice-immersive/blender/services.blend --python blender/scripts/ilot.py -- [A B C] [--no-render]

Repère : x vers la droite de l'image, y vers le fond, z vers le haut ; la caméra regarde l'îlot depuis l'avant."""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))           # homeservice/
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WANT = [a for a in ARGS if not a.startswith("--")] or ["A", "B", "C"]
RENDER = "--no-render" not in ARGS
OUT_BLEND = os.path.join(ROOT, "blender", "ilot.blend")
OUT_DIR = os.path.join(ROOT, "blender", "rendus")

SRC_SCENE = bpy.context.scene
M = bpy.data.materials


def mat(name, rgb=None, rough=0.8):
    """matériau des dioramas s'il existe (même teinte partout), sinon créé"""
    if name in M:
        return M[name]
    m = M.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    return m


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------- forme de l'îlot
def outline(rx, ry, n=3.0, wob=0.03, seed=0, count=120):
    """contour : superellipse (ovale aux flancs pleins) légèrement ondulée"""
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    pts = []
    for i in range(count):
        t = 2 * math.pi * i / count
        c, s = math.cos(t), math.sin(t)
        r = (abs(c) ** n / rx ** n + abs(s) ** n / ry ** n) ** (-1 / n)
        r *= 1 + wob * (math.sin(3 * t + ph[0]) * 0.6 + math.sin(5 * t + ph[1]) * 0.3 + math.sin(9 * t + ph[2]) * 0.15)
        pts.append((r * c, r * s))
    return pts


def prism(name, pts, z0, z1, material, coll, scale=1.0, top_scale=None, bevel=0.0):
    """dalle au contour donné, de z0 à z1 (top_scale : contour du dessus, pour un flanc incliné)"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    ts = scale if top_scale is None else top_scale
    bot = [bm.verts.new((x * scale, y * scale, z0)) for x, y in pts]
    top = [bm.verts.new((x * ts, y * ts, z1)) for x, y in pts]
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material)
    coll.objects.link(o)
    if bevel:
        b = o.modifiers.new("Biseau", "BEVEL")
        b.width = bevel
        b.segments = 2
        b.limit_method = "ANGLE"
    for p in me.polygons:
        p.use_smooth = False
    return o


def inside(pts, x, y, margin=0.0):
    """le point (x, y) est-il dans le contour, à margin près (contour ramené vers le centre)"""
    t = math.atan2(y, x)
    i = int(round((t % (2 * math.pi)) / (2 * math.pi) * len(pts))) % len(pts)
    r = math.hypot(*pts[i])
    return math.hypot(x, y) < r - margin


def box(name, size, loc, material, coll, rot=0.0, bevel=0.015):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material)
    o.location = loc
    o.rotation_euler.z = rot
    coll.objects.link(o)
    if bevel:
        b = o.modifiers.new("Biseau", "BEVEL")
        b.width = bevel
        b.segments = 2
    return o


def bush(name, loc, r, material, coll, seed=0):
    """buisson low poly : icosphère cabossée, aplatie au pied"""
    rnd = random.Random(seed)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    for v in bm.verts:
        v.co *= 1 + rnd.uniform(-0.1, 0.1)
        v.co.z = max(v.co.z, -r * 0.55)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material)
    o.location = loc
    coll.objects.link(o)
    return o


# ------------------------------------------------------------- modèles des services, copiés
def bounds(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == "MESH" for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def place(src_name, coll, x, y, z, rot=0.0, scale=1.0, tilt=None):
    """copie un modèle (et toute sa descendance), centré en (x, y), posé à la hauteur z"""
    src = bpy.data.objects[src_name]
    family = [src] + list(src.children_recursive)
    copies = {}
    for o in family:
        c = o.copy()
        copies[o] = c
        coll.objects.link(c)
    for o, c in copies.items():
        if o.parent in copies:
            c.parent = copies[o.parent]
            c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
    root = copies[src]
    root.parent = None
    root.matrix_world = src.matrix_world.copy()
    bpy.context.view_layer.update()
    lo, hi = bounds(list(copies.values()))
    pivot = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    rotm = Matrix.Rotation(rot, 4, "Z")
    if tilt:
        rotm = Matrix.Rotation(tilt[1], 4, tilt[0]) @ rotm
    m = Matrix.Translation((x, y, z)) @ rotm @ Matrix.Scale(scale, 4) @ Matrix.Translation(-pivot)
    root.matrix_world = m @ root.matrix_world
    bpy.context.view_layer.update()
    return root


# ------------------------------------------------------------- scène, lumière, rendu
def new_scene(name):
    sc = bpy.data.scenes.get(name)
    if sc:
        for o in list(sc.objects):
            bpy.data.objects.remove(o)
        bpy.data.scenes.remove(sc)
    sc = bpy.data.scenes.new(name)
    return sc


def setup_render(sc, cam_loc, cam_target, lens):
    col = bpy.data.collections.new(f"{sc.name} · prise de vue")
    sc.collection.children.link(col)
    # sol : le vide blanc, qui ne garde que les ombres (attrape-ombres) ; le fond est composé sur le crème du site
    me = bpy.data.meshes.new("Sol vide")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    bm.to_mesh(me)
    bm.free()
    g = bpy.data.objects.new("Sol vide", me)
    g.is_shadow_catcher = True
    col.objects.link(g)
    cam = bpy.data.cameras.new("Caméra îlot")
    cam.lens = lens
    co = bpy.data.objects.new("Caméra îlot", cam)
    co.location = cam_loc
    co.rotation_euler = (Vector(cam_target) - Vector(cam_loc)).to_track_quat("-Z", "Y").to_euler()
    col.objects.link(co)
    sc.camera = co
    sun = bpy.data.lights.new("Soleil", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(14)
    so = bpy.data.objects.new("Soleil", sun)
    so.rotation_euler = (math.radians(42), 0, math.radians(-32))
    col.objects.link(so)
    w = bpy.data.worlds.new(f"Monde {sc.name}")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 0.9
    sc.world = w
    r = sc.render
    r.engine = "CYCLES"
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.cycles.device = "GPU"
    r.film_transparent = True
    r.resolution_x, r.resolution_y, r.resolution_percentage = 1600, 1000, 100
    # AgX, comme les dioramas : couleurs douces. Le rendu est transparent (l'îlot et son ombre) : c'est l'image du
    # site, posée sur le crème de la page ; un aperçu déjà composé sur ce crème est écrit à côté (preview)
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    return col


def preview(png, out, bg="#f7f7f5"):
    """aperçu : le rendu transparent posé sur le fond de la page"""
    import numpy as np
    img = bpy.data.images.load(png)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    c = np.array([int(bg[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + c * (1 - a)     # PNG non prémultiplié
    px[..., 3] = 1
    o = bpy.data.images.new("aperçu", w, h)
    o.pixels[:] = px.ravel()
    o.filepath_raw = out
    o.file_format = "PNG"
    o.save()


def enable_gpu():
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception as e:
        print("GPU indisponible :", e)


# ------------------------------------------------------------- l'îlot, commun aux prototypes
GRASS = mat("Pelouse tondue")
SOIL = mat("Terre coupe")
SOIL_D = mat("Terre coupe sombre")
HEDGE = mat("Haie")
HEDGE_D = mat("Haie ombre")
LEAF = mat("Feuille 3")
STONE = mat("Dalle allée", srgb("#d3c7b0"), 0.9)
STONE_D = mat("Dalle allée sombre", srgb("#bfb197"), 0.9)
WOOD = mat("Plancher clair", srgb("#d9b98c"), 0.7)
TILE = mat("Carrelage bleu", srgb("#8fb4d6"), 0.5)
TILE_W = mat("Carrelage blanc", srgb("#eef0ef"), 0.5)
PAVE = mat("Pavé", srgb("#a7a39b"), 0.9)

TOP = 0.55                                    # dessus de la pelouse


def island(coll, pts):
    prism("Îlot · pelouse", pts, TOP - 0.1, TOP, GRASS, coll, scale=1.015, bevel=0.03)
    prism("Îlot · terre", pts, 0.12, TOP - 0.08, SOIL, coll, scale=0.985, top_scale=1.0)
    prism("Îlot · terre profonde", pts, 0.0, 0.14, SOIL_D, coll, scale=0.94, top_scale=0.975)


def path_cross(coll, pts, w=0.55, seed=1):
    """allées en croix : dalles de pierre irrégulières qui partagent l'îlot en quatre"""
    rnd = random.Random(seed)
    k = 0
    for axis in ("x", "y"):
        L = 4.2 if axis == "x" else 3.0
        t = -L
        while t < L:
            step = rnd.uniform(0.36, 0.46)
            for side in (-1, 1):
                off = side * w / 4
                x, y = (t, off) if axis == "x" else (off, t)
                if abs(t) < w / 2 and axis == "y":
                    continue                    # le carrefour est dalé par l'allée en x
                if not inside(pts, x, y, 0.25):
                    continue
                sx = step - 0.06 if axis == "x" else w / 2 - 0.05
                sy = w / 2 - 0.05 if axis == "x" else step - 0.06
                box(f"Dalle {k}", (sx * rnd.uniform(0.92, 1), sy * rnd.uniform(0.9, 1), 0.05),
                    (x, y, TOP + 0.015), STONE if rnd.random() > 0.3 else STONE_D, coll,
                    rot=rnd.uniform(-0.05, 0.05), bevel=0.012)
                k += 1
            t += step


def hedge(coll, pts, h_mid=1.3, h_end=0.55, a0=14, a1=166, inset=0.4, depth=0.6, blocks=7, seed=2):
    """haie taillée qui enveloppe l'arrière, en modules arrondis (comme la haie des dioramas) : haute au centre,
    plus basse vers les côtés ; quelques touffes de feuilles dépassent du dessus"""
    rnd = random.Random(seed)
    n = len(pts)

    def ring(a, h, z0=TOP - 0.02):
        t = math.radians(a)
        i = int(round((t % (2 * math.pi)) / (2 * math.pi) * n)) % n
        r = math.hypot(*pts[i]) - inset
        ux, uy = math.cos(t), math.sin(t)
        ri, ro = r - depth / 2, r + depth / 2
        return [(ux * ri, uy * ri, z0), (ux * ro, uy * ro, z0), (ux * ro, uy * ro, z0 + h), (ux * ri, uy * ri, z0 + h)]

    def height(a):
        u = abs(a - 90) / ((a1 - a0) / 2)      # 0 au centre, 1 aux bouts
        return h_end + (h_mid - h_end) * (1 - min(1, max(0, (u - 0.2) / 0.7)) ** 1.6)

    span = (a1 - a0) / blocks
    parts = []
    for b in range(blocks):
        b0, b1 = a0 + b * span + 0.2, a0 + (b + 1) * span - 0.2
        h = height((b0 + b1) / 2) + rnd.uniform(-0.05, 0.05)
        steps = 4
        me = bpy.data.meshes.new(f"Haie {b}")
        bm = bmesh.new()
        rings = [[bm.verts.new(v) for v in ring(b0 + (b1 - b0) * k / steps, h)] for k in range(steps + 1)]
        for ra, rb in zip(rings, rings[1:]):
            for k in range(4):
                bm.faces.new((ra[k], ra[(k + 1) % 4], rb[(k + 1) % 4], rb[k]))
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        bm.normal_update()
        bm.to_mesh(me)
        bm.free()
        o = bpy.data.objects.new(f"Haie {b}", me)
        o.data.materials.append(HEDGE)
        coll.objects.link(o)
        bv = o.modifiers.new("Biseau", "BEVEL")
        bv.width = 0.11
        bv.segments = 3
        bv.limit_method = "ANGLE"
        parts.append(o)
        # touffes sur le dessus
        for _ in range(rnd.randint(0, 2)):
            a = math.radians(rnd.uniform(b0 + 2, b1 - 2))
            i = int(round((a % (2 * math.pi)) / (2 * math.pi) * n)) % n
            r = math.hypot(*pts[i]) - inset + rnd.uniform(-0.1, 0.1)
            bush(f"Touffe {b}", (r * math.cos(a), r * math.sin(a), TOP + h - 0.02), rnd.uniform(0.13, 0.2), LEAF, coll,
                 seed=seed * 31 + b)
    # buissons ronds aux deux bouts
    for side, a in ((-1, a1 + 4), (1, a0 - 4)):
        t = math.radians(a)
        i = int(round((t % (2 * math.pi)) / (2 * math.pi) * n)) % n
        r = math.hypot(*pts[i]) - 0.55
        bush(f"Buisson {side}", (r * math.cos(t), r * math.sin(t), TOP + 0.26), 0.44, LEAF, coll, seed=seed + side)
    return parts


# ------------------------------------------------------------- prototypes
def proto_A():
    """A · jardin en croix : allées de pierre, quatre parterres, la haie qui embrasse l'arrière (le croquis)"""
    sc = new_scene("Îlot A · jardin en croix")
    coll = bpy.data.collections.new("Îlot A")
    sc.collection.children.link(coll)
    pts = outline(3.45, 2.35, n=2.6, seed=3)
    island(coll, pts)
    path_cross(coll, pts)
    hedge(coll, pts)
    z = TOP
    # fond gauche : Nettoyage — seau et serpillière (le grand manche du croquis), aspirateur, seau d'éponges
    place("Nettoyage · serpillière", coll, -2.4, 0.95, z, rot=math.radians(35), scale=1.1)
    place("Nettoyage · aspirateur", coll, -1.3, 0.72, z, rot=math.radians(8), scale=0.9)
    place("Service · Nettoyage", coll, -0.85, 1.45, z, rot=math.radians(-15), scale=0.85)
    # fond droit : Montage — meuble en kit, caisse à outils, tabouret
    place("Montage · meuble en kit", coll, 1.5, 1.05, z, rot=math.radians(-12), scale=0.95)
    place("Service · Montage", coll, 0.9, 0.48, z, rot=math.radians(10), scale=0.8)
    place("Montage · tabouret", coll, 2.55, 0.55, z, rot=math.radians(25), scale=0.9)
    # devant gauche : Désencombrement — pile de cartons au bord (les cartons jaunes du croquis), chaise et sac
    place("Désencombrement · pile", coll, -2.45, -0.6, z, rot=math.radians(18))
    place("Désencombrement · chaise", coll, -1.35, -0.85, z, rot=math.radians(-20), scale=0.95)
    # devant droit : Livraison — colis et sac de courses, déposés au bord de l'allée
    place("Livraison · colis", coll, 1.15, -0.95, z, rot=math.radians(-25), scale=0.95)
    place("Service · Livraison", coll, 2.15, -0.65, z, rot=math.radians(15))
    # Jardinage : la haie qui tient le tout, la brouette sur l'allée du fond, l'arrosoir, la plante
    place("Jardinage · brouette", coll, 0.0, 1.3, z, rot=math.radians(90), scale=0.85)
    place("Jardinage · arrosoir", coll, 2.65, -0.05, z, rot=math.radians(200), scale=0.9)
    place("Service · Jardinage", coll, -0.7, -1.45, z, scale=0.8)
    setup_render(sc, (0, -11.2, 6.6), (0, 0.2, 0.8), 50)
    return sc


def proto_B():
    """B · quatre « pièces » : chaque quart a son sol (carrelage, plancher, pavés), la pelouse et la haie font le lien"""
    sc = new_scene("Îlot B · quatre pièces")
    coll = bpy.data.collections.new("Îlot B")
    sc.collection.children.link(coll)
    pts = outline(3.45, 2.35, n=2.6, seed=3)
    island(coll, pts)
    hedge(coll, pts, h_mid=1.3)
    z = TOP + 0.03
    # sols des quartiers : plaques posées sur la pelouse, séparées par une bande de gazon (la croix)
    def tiles(x0, y0, nx, ny, s, m1, m2, name):
        for i in range(nx):
            for j in range(ny):
                x, y = x0 + i * s, y0 + j * s
                if inside(pts, x, y, 0.5):
                    box(f"{name} {i}-{j}", (s - 0.03, s - 0.03, 0.04), (x, y, TOP + 0.01),
                        m1 if (i + j) % 2 else m2, coll, bevel=0.006)
    tiles(-3.0, 0.45, 6, 3, 0.42, TILE, TILE_W, "Carrelage")      # Nettoyage : carrelage en damier
    for i in range(7):                                             # Montage : lames de plancher
        x = 0.55 + i * 0.4
        for j, (y, L) in enumerate(((0.95, 1.0), (0.95 + 1.02, 0.6))):
            if inside(pts, x, y, 0.55):
                box(f"Lame {i}-{j}", (0.37, L, 0.04), (x, y, TOP + 0.01), WOOD, coll, bevel=0.006)
    tiles(-3.1, -1.9, 7, 4, 0.36, PAVE, STONE_D, "Pavé")             # Désencombrement : sol de cave
    tiles(0.55, -1.9, 7, 4, 0.36, STONE, STONE_D, "Seuil")         # Livraison : pavés du seuil
    place("Nettoyage · aspirateur", coll, -1.8, 0.84, z, rot=math.radians(20))
    place("Service · Nettoyage", coll, -0.88, 1.19, z, rot=math.radians(-15))
    place("Nettoyage · serpillière", coll, -2.46, 1.19, z, rot=math.radians(30), scale=1.15)
    place("Montage · meuble en kit", coll, 1.54, 0.92, z, rot=math.radians(-12))
    place("Montage · tabouret", coll, 2.51, 0.66, z, rot=math.radians(25))
    place("Désencombrement · pile", coll, -2.29, -0.84, z, rot=math.radians(18))
    place("Désencombrement · chaise", coll, -1.23, -0.92, z, rot=math.radians(-20))
    place("Livraison · colis", coll, 1.23, -0.97, z, rot=math.radians(-25))
    place("Service · Livraison", coll, 2.11, -0.79, z, rot=math.radians(15))
    place("Jardinage · brouette", coll, 0.0, 0.0, TOP, rot=math.radians(90 + 25), scale=0.95)
    place("Jardinage · arrosoir", coll, 2.82, -0.09, TOP, rot=math.radians(200))
    setup_render(sc, (0, -11.2, 6.6), (0, 0.2, 0.8), 50)
    return sc


def proto_C():
    """C · îlot naturel : pas de croix ; un sentier en S relie des groupes serrés, la haie en croissant derrière"""
    sc = new_scene("Îlot C · sentier")
    coll = bpy.data.collections.new("Îlot C")
    sc.collection.children.link(coll)
    pts = outline(3.2, 2.4, n=2.2, wob=0.05, seed=7)
    island(coll, pts)
    hedge(coll, pts, h_mid=1.7, h_end=0.5, a0=25, a1=155)
    rnd = random.Random(4)
    for k in range(16):                                            # pas japonais en S, de l'avant vers le fond
        t = k / 15
        x = 1.2 * math.sin(t * math.pi * 1.6 - 0.6)
        y = -1.95 + t * 3.0
        if inside(pts, x, y, 0.3):
            box(f"Pas {k}", (0.42, 0.32, 0.05), (x, y, TOP + 0.015), STONE if k % 3 else STONE_D, coll,
                rot=rnd.uniform(-0.4, 0.4), bevel=0.02)
    z = TOP
    place("Nettoyage · aspirateur", coll, -1.5, 0.75, z, rot=math.radians(25))
    place("Service · Nettoyage", coll, -0.66, 1.14, z, rot=math.radians(-15))
    place("Nettoyage · serpillière", coll, -2.2, 1.28, z, rot=math.radians(30), scale=1.15)
    place("Montage · meuble en kit", coll, 1.67, 0.7, z, rot=math.radians(-20))
    place("Montage · tabouret", coll, 2.42, 0.0, z, rot=math.radians(25))
    place("Désencombrement · pile", coll, -2.29, -0.35, z, rot=math.radians(18))
    place("Désencombrement · chaise", coll, -1.54, -1.06, z, rot=math.radians(-30))
    place("Livraison · colis", coll, 0.48, -1.36, z, rot=math.radians(-25))
    place("Service · Livraison", coll, 1.36, -1.19, z, rot=math.radians(15))
    place("Jardinage · brouette", coll, 0.31, 1.28, z, rot=math.radians(80), scale=0.95)
    place("Jardinage · arrosoir", coll, 2.42, -0.84, z, rot=math.radians(200))
    place("Service · Jardinage", coll, -0.53, -0.26, z, scale=0.85)
    setup_render(sc, (0, -11.2, 6.6), (0, 0.2, 0.8), 50)
    return sc


PROTOS = {"A": proto_A, "B": proto_B, "C": proto_C}
enable_gpu()
built = [PROTOS[k]() for k in WANT]

# le fichier de travail ne garde que les îlots : les scènes de services.blend en sont retirées
for s in list(bpy.data.scenes):
    if not s.name.startswith("Îlot"):
        bpy.data.scenes.remove(s)
os.makedirs(OUT_DIR, exist_ok=True)
if RENDER:
    for sc in built:
        base = os.path.join(OUT_DIR, sc.name.split(" ·")[0].replace("Îlot ", "ilot-"))
        sc.render.filepath = base + ".png"
        bpy.ops.render.render(write_still=True, scene=sc.name)
        preview(base + ".png", base + "-apercu.png")
bpy.data.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print("ENREGISTRÉ", OUT_BLEND)
