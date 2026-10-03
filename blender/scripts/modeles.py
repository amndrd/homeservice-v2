"""Modèles faits main pour l'îlot, plus soignés que leurs équivalents importés : marteau, pelle, sac de courses
rempli, et la brouette de l'écran de chargement du site immersif, remplie d'herbe coupée. (En cours : pas encore
branché dans tas.py.)
Chaque fonction rend un objet à taille réelle (m), posé sur z = 0, centré en x/y, en facettes (low poly).
À exécuter après ilot.py, dans le même espace de noms (mat, M, srgb, coll…)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

R_MOD = random.Random(21)


def mm(name, hexcol, rough=0.7, spec=0.3):
    return mat(name, hexcol, rough=rough, spec=spec)


MAT = {
    "bois": mm("manche bois", "#c99561"), "bois_sombre": mm("manche bois sombre", "#a5713f"),
    "acier": mm("acier", "#8f979e", rough=0.35, spec=0.6), "acier_sombre": mm("acier sombre", "#4f575f", rough=0.4, spec=0.5),
    "caoutchouc": mm("caoutchouc", "#26292d", rough=0.8), "vert": mm("vert marque", "#2f7a4b", rough=0.6),
    "kraft": mm("kraft", "#c8a06a"), "kraft_sombre": mm("kraft sombre", "#9c7748"), "kraft_clair": mm("kraft clair", "#dcb983"),
    "blanc": mm("papier blanc", "#f1eee6"), "pain": mm("croûte", "#c98a45"), "pain_clair": mm("mie", "#e8c48a"),
    "poireau": mm("poireau", "#eef0de"), "poireau_vert": mm("poireau vert", "#4d8b45"), "salade": mm("salade", "#7fbf4f"),
    "salade_sombre": mm("salade sombre", "#4f9a3e"), "pomme": mm("pomme rouge", "#d2443b"), "pomme_verte": mm("pomme verte", "#9cc84a"),
    "tige": mm("tige", "#5b3d22"), "herbe": M["herbe"], "herbe_claire": M["herbe_claire"], "herbe_sombre": M["herbe_sombre"],
}


class Mesh:
    """Petit atelier bmesh : chaque pièce reçoit un matériau ; finir() fait l'objet, en facettes."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def mi(self, key):
        m = MAT[key]
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def paint(self, faces, key):
        i = self.mi(key)
        for f in faces:
            f.material_index = i

    def tube(self, pts, radii, key, segs=8, squash=1.0, caps=True, twist=0.0):
        """Tube le long d'une ligne (anneaux perpendiculaires) ; squash aplatit la section (sa 2e dimension)."""
        bm, rings = self.bm, []
        n = len(pts)
        for i, p in enumerate(pts):
            p = Vector(p)
            t = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            a = t.cross(ref).normalized()
            b = t.cross(a).normalized()
            ring = []
            for k in range(segs):
                th = k / segs * math.tau + twist * i
                ring.append(bm.verts.new(p + (a * math.cos(th) + b * math.sin(th) * squash) * radii[i]))
            rings.append(ring)
        faces = []
        for i in range(n - 1):
            for k in range(segs):
                k2 = (k + 1) % segs
                faces.append(bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k])))
        if caps:
            faces.append(bm.faces.new(list(reversed(rings[0]))))
            faces.append(bm.faces.new(rings[-1]))
        self.paint(faces, key)
        return faces

    def _place(self, res, center, key, rot):
        vs = [v for v in res["verts"] if v.is_valid]
        R = rot or Matrix.Identity(3)
        for v in vs:
            v.co = R @ v.co + Vector(center)
        faces = list({f for v in vs for f in v.link_faces})
        self.paint(faces, key)
        return faces

    def blob(self, center, radius, key, subdiv=2, jitter=0.1, scale=(1, 1, 1), r=R_MOD):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=radius)
        for v in res["verts"]:
            v.co = Vector((v.co.x * scale[0], v.co.y * scale[1], v.co.z * scale[2])) * (1 + r.uniform(-jitter, jitter))
            v.co += Vector(center)
        faces = list({f for v in res["verts"] for f in v.link_faces})
        self.paint(faces, key)
        return faces

    def finish(self, name):
        bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.mats:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = False
        o = bpy.data.objects.new(name, me)
        # posé sur z = 0, centré en x/y
        pts = [v.co for v in me.vertices]
        c = Vector(((min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2,
                    min(p.z for p in pts)))
        me.transform(Matrix.Translation(-c))
        return o


def beveled_box(m, center, size, key, chamfer):
    """Boîte aux arêtes chanfreinées (un pan coupé)."""
    bm = m.bm
    res = bmesh.ops.create_cube(bm, size=1.0)
    vs = res["verts"]
    for v in vs:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    edges = list({e for v in vs for e in v.link_edges})
    out = bmesh.ops.bevel(bm, geom=list(vs) + edges, offset=chamfer, segments=1, affect="EDGES", profile=0.5)
    allv = set(vs) | {v for f in out["faces"] for v in f.verts}
    allv = [v for v in allv if v.is_valid]
    for v in allv:
        v.co += Vector(center)
    faces = list({f for v in allv for f in v.link_faces})
    m.paint(faces, key)
    return faces


# ------------------------------------------------------------- marteau (arrache-clou)
def marteau():
    m = Mesh()
    L = 0.32
    # manche : bois effilé, section ovale ; poignée caoutchouc en bas, un peu renflée au bout
    zs = [0.0, 0.012, 0.03, 0.08, 0.12, 0.2, 0.27, L]
    rs = [0.017, 0.019, 0.0175, 0.0165, 0.015, 0.0135, 0.0125, 0.012]
    m.tube([(0, 0, z) for z in zs], rs, "bois", segs=8, squash=0.72)
    gz_ = [0.0, 0.012, 0.03, 0.07, 0.115, 0.125]
    m.tube([(0, 0, z) for z in gz_], [0.0195, 0.0215, 0.02, 0.019, 0.018, 0.0155], "caoutchouc", segs=8, squash=0.75)
    # tête : corps chanfreiné
    hz = L + 0.012
    beveled_box(m, (0.0, 0, hz), (0.07, 0.028, 0.036), "acier_sombre", 0.004)
    # col et face ronde (côté frappe)
    m.tube([(0.035, 0, hz), (0.055, 0, hz), (0.07, 0, hz), (0.078, 0, hz)], [0.014, 0.0125, 0.0165, 0.0165],
           "acier", segs=10)
    # panne arrachante : deux becs courbes, fendus, qui plongent vers le manche
    for sy in (-1, 1):
        pts = [(-0.035, sy * 0.006, hz + 0.004), (-0.06, sy * 0.007, hz + 0.001), (-0.082, sy * 0.008, hz - 0.008),
               (-0.098, sy * 0.009, hz - 0.022), (-0.106, sy * 0.009, hz - 0.036)]
        m.tube(pts, [0.009, 0.0085, 0.007, 0.0055, 0.003], "acier", segs=6, squash=1.6)
    # coin du manche, visible sur le dessus de la tête
    beveled_box(m, (0.0, 0, hz + 0.0185), (0.022, 0.016, 0.003), "bois_sombre", 0.001)
    return m.finish("Marteau")


# ------------------------------------------------------------- pelle (bêche à poignée en D)
def pelle():
    m = Mesh()
    bm = m.bm
    # lame : surface creusée (en gouttière) au contour de bêche, pointe arrondie, puis épaissie
    cols, rows = 9, 9
    H, Wd = 0.29, 0.115
    grid = []
    for j in range(rows):
        zf = j / (rows - 1)
        # demi-largeur selon la hauteur : pointe ronde en bas, épaules droites en haut
        half = Wd * (0.25 + 0.75 * math.sin(min(1.0, zf * 1.6) * math.pi / 2)) * (1 - 0.08 * zf)
        z = H * zf
        row = []
        for i in range(cols):
            xf = i / (cols - 1) * 2 - 1
            x = xf * half
            y = 0.03 * xf * xf + 0.012 * (1 - zf)            # gouttière, et un rien de galbe vers la pointe
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    blade = []
    for j in range(rows - 1):
        for i in range(cols - 1):
            blade.append(bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])))
    res = bmesh.ops.solidify(bm, geom=blade, thickness=0.006)
    m.paint([f for f in bm.faces], "acier_sombre")
    # repose-pieds : les épaules repliées vers l'arrière
    for sx in (-1, 1):
        beveled_box(m, (sx * 0.07, 0.035, H + 0.004), (0.085, 0.03, 0.008), "acier_sombre", 0.002)
    # douille qui enserre le manche, en acier plus clair
    m.tube([(0, 0.02, H - 0.03), (0, 0.02, H + 0.02), (0, 0.02, H + 0.08), (0, 0.02, H + 0.12)],
           [0.03, 0.026, 0.021, 0.0195], "acier", segs=8)
    # manche en bois
    top = H + 0.82
    m.tube([(0, 0.02, H + 0.1), (0, 0.02, top)], [0.0175, 0.0165], "bois", segs=8)
    # bague et poignée en D
    m.tube([(0, 0.02, top - 0.01), (0, 0.02, top + 0.025)], [0.021, 0.021], "vert", segs=8)
    d = []
    for k in range(9):
        a = math.pi * k / 8
        d.append((0.065 * math.cos(a), 0.02, top + 0.02 + 0.11 * math.sin(a) ** 0.8))
    m.tube(d, [0.012] * len(d), "vert", segs=6)
    m.tube([(-0.068, 0.02, top + 0.02), (0.068, 0.02, top + 0.02)], [0.014, 0.014], "vert", segs=6)
    return m.finish("Pelle")


# ------------------------------------------------------------- sac de courses en kraft, rempli
def sac_courses():
    m = Mesh()
    bm = m.bm
    W, D, H = 0.30, 0.17, 0.36
    # sac : parois à soufflets (les côtés rentrent un peu à mi-hauteur), fond fermé, parois épaissies
    segs_z = 6
    rings = []
    for j in range(segs_z + 1):
        zf = j / segs_z
        z = H * zf
        pinch = 0.018 * math.sin(zf * math.pi)               # le soufflet des côtés
        bulge = 0.008 * math.sin(zf * math.pi)               # les grandes faces bombent un peu
        hw, hd = W / 2 + bulge, D / 2
        pts = [(-hw, -hd), (0, -hd - bulge), (hw, -hd), (hw + 0.004, 0 - 0.0), (hw, hd), (0, hd + bulge), (-hw, hd),
               (-hw - 0.004, 0)]
        ring = []
        for k, (x, y) in enumerate(pts):
            if k in (3, 7):
                x = x - math.copysign(pinch, x)              # le pli rentrant du soufflet
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    walls = []
    for j in range(segs_z):
        for k in range(8):
            k2 = (k + 1) % 8
            walls.append(bm.faces.new((rings[j][k], rings[j][k2], rings[j + 1][k2], rings[j + 1][k])))
    walls.append(bm.faces.new(list(reversed(rings[0]))))
    bmesh.ops.solidify(bm, geom=walls, thickness=0.004)
    m.paint(list(bm.faces), "kraft")
    # bord replié vers l'extérieur, en haut
    cuff = []
    for k in range(8):
        v = rings[-1][k].co
        cuff.append(v.copy())
    top = [bm.verts.new((p.x * 1.035, p.y * 1.08, H + 0.002)) for p in cuff]
    low = [bm.verts.new((p.x * 1.035, p.y * 1.08, H - 0.035)) for p in cuff]
    cf = [bm.faces.new((low[k], low[(k + 1) % 8], top[(k + 1) % 8], top[k])) for k in range(8)]
    m.paint(cf, "kraft_clair")
    # bande verte HomeService et une étiquette blanche, sur les deux grandes faces
    for sy in (-1, 1):
        beveled_box(m, (0, sy * (D / 2 + 0.0105), 0.15), (W * 0.98, 0.003, 0.055), "vert", 0.0008)
        beveled_box(m, (0.0, sy * (D / 2 + 0.0125), 0.15), (0.09, 0.002, 0.022), "blanc", 0.0005)
    # anses en papier torsadé
    for sy in (-1, 1):
        pts = []
        for k in range(9):
            a = math.pi * k / 8
            pts.append((0.065 * math.cos(a), sy * (D / 2 - 0.004), H - 0.02 + 0.085 * math.sin(a)))
        m.tube(pts, [0.0055] * len(pts), "kraft_sombre", segs=5, twist=0.9)
    # le contenu : une couche de papier froissé au ras du bord, sur laquelle tout repose (pas de vide)
    m.blob((0, 0, H - 0.03), 0.13, "blanc", subdiv=1, jitter=0.18, scale=(1.05, 0.6, 0.35))
    # salade : une boule froissée qui déborde
    m.blob((-0.075, 0.005, H + 0.0), 0.075, "salade", subdiv=2, jitter=0.16, scale=(1, 0.95, 0.85))
    m.blob((-0.06, -0.02, H + 0.035), 0.045, "salade_sombre", subdiv=1, jitter=0.2)
    # deux baguettes, plantées au fond, qui dépassent en biais
    for (x, y, lean, length, rot) in ((0.085, 0.035, 0.32, 0.62, 0.3), (0.105, -0.02, 0.18, 0.55, -0.4)):
        base = Vector((x, y, 0.03))
        dirv = Vector((math.sin(lean) * math.cos(rot), math.sin(lean) * math.sin(rot), math.cos(lean)))
        pts = [base + dirv * (length * f) for f in (0, 0.04, 0.5, 0.94, 1.0)]
        m.tube([tuple(p) for p in pts], [0.012, 0.029, 0.031, 0.026, 0.01], "pain", segs=8, squash=0.75)
        for k in range(4):                                  # les grignes
            p = base + dirv * (length * (0.6 + 0.09 * k))
            beveled_box(m, tuple(p + Vector((0, 0, 0)) + dirv.cross(Vector((0, 0, 1))).normalized() * 0.0
                                 + Vector((0.0, 0.0, 0.0)) + Vector((0, 0, 0))), (0.035, 0.012, 0.004), "pain_clair",
                        0.001)
    # poireau : fût blanc, feuilles vertes en éventail
    base = Vector((0.005, 0.045, 0.04))
    lean = Vector((-0.12, 0.08, 1)).normalized()
    m.tube([tuple(base + lean * f) for f in (0, 0.38, 0.46)], [0.022, 0.021, 0.02], "poireau", segs=8)
    for k, (dx, dy) in enumerate(((-0.07, 0.03), (0.0, 0.07), (0.06, 0.01), (-0.03, -0.04))):
        a = base + lean * 0.44
        b = a + Vector((dx, dy, 0.16))
        c = b + Vector((dx * 0.6, dy * 0.6, 0.02))
        m.tube([tuple(a), tuple(b), tuple(c)], [0.016, 0.012, 0.002], "poireau_vert", segs=4, squash=0.25)
    # brique de lait
    br = Matrix.Rotation(0.14, 3, "Y") @ Matrix.Rotation(0.35, 3, "Z")
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res["verts"]:
        v.co = Vector((v.co.x * 0.07, v.co.y * 0.07, v.co.z * 0.2))
    m._place(res, (-0.02, -0.035, 0.22), "blanc", br)
    m.tube([tuple(Vector((-0.02, -0.035, 0.22)) + br @ Vector((0.012, 0, 0.1))),
            tuple(Vector((-0.02, -0.035, 0.22)) + br @ Vector((0.012, 0, 0.12)))], [0.014, 0.014], "vert", segs=8)
    # pommes, posées sur le papier et la salade
    for (x, y, z, key) in ((0.03, -0.04, H + 0.02, "pomme"), (-0.005, 0.0, H + 0.015, "pomme_verte"),
                           (0.065, -0.005, H + 0.03, "pomme")):
        m.blob((x, y, z), 0.036, key, subdiv=2, jitter=0.04, scale=(1, 1, 0.9))
        m.tube([(x, y, z + 0.03), (x + 0.004, y, z + 0.048)], [0.003, 0.0025], "tige", segs=4)
    return m.finish("Sac de courses")


# ------------------------------------------------------------- brouette de l'écran de chargement, remplie d'herbe
CHARGEMENT = "/Users/amandindardenne/Desktop/homeservice-immersive/web/assets/chargement.glb"
BROUETTE_PARTS = ("Benne", "Brancard", "Moyeu", "Pied", "Pneu", "Poignée", "Rebord")


def brouette():
    """Importe la brouette verte de l'écran de chargement (sans son pot de fleurs) et remplit la benne d'un tas
    d'herbe coupée : un dôme à facettes, des brins dressés, quelques-uns qui débordent."""
    scene = bpy.context.scene
    tmp = bpy.data.collections.new("_import chargement")
    scene.collection.children.link(tmp)
    prev = bpy.context.view_layer.active_layer_collection
    bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[tmp.name]
    bpy.ops.import_scene.gltf(filepath=CHARGEMENT)
    bpy.context.view_layer.active_layer_collection = prev
    root = next(o for o in tmp.all_objects if o.name.startswith("Chargement_jardinage"))
    parts = [o for o in root.children_recursive if o.type == "MESH" and o.name.split(".")[0].startswith(BROUETTE_PARTS)]
    dg = bpy.context.evaluated_depsgraph_get()
    m = Mesh()
    for o in parts:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
        me.transform(o.matrix_world)
        remap = []
        for mt in me.materials:
            if mt not in m.mats:
                m.mats.append(mt)
            remap.append(m.mats.index(mt))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        m.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    benne = next(o for o in parts if o.name.startswith("Benne"))
    bpts = [benne.matrix_world @ v.co for v in benne.data.vertices]
    for o in list(tmp.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    # le tas d'herbe : un dôme qui épouse le haut de la benne
    mn = Vector((min(p.x for p in bpts), min(p.y for p in bpts), min(p.z for p in bpts)))
    mx = Vector((max(p.x for p in bpts), max(p.y for p in bpts), max(p.z for p in bpts)))
    c = (mn + mx) / 2
    rx, ry = (mx.x - mn.x) / 2 * 0.86, (mx.y - mn.y) / 2 * 0.86
    rim = mx.z - 0.015
    top = 0.13
    bm = m.bm
    rings, segs = 5, 16
    center = bm.verts.new((c.x, c.y, rim + top))
    prev_ring = None
    faces = []
    for ri in range(1, rings + 1):
        f = ri / rings
        ring = []
        for k in range(segs):
            a = k / segs * math.tau
            x = c.x + math.cos(a) * rx * f
            y = c.y + math.sin(a) * ry * f
            z = rim + top * (1 - f ** 2) ** 0.8 + R_MOD.uniform(-0.012, 0.012) * (1 - f)
            ring.append(bm.verts.new((x, y, z - (0.02 if ri == rings else 0))))
        for k in range(segs):
            k2 = (k + 1) % segs
            faces.append(bm.faces.new((center, ring[k], ring[k2]) if prev_ring is None else
                                      (prev_ring[k], ring[k], ring[k2], prev_ring[k2])))
        prev_ring = ring
    for fc in faces:
        fc.material_index = m.mi(R_MOD.choice(("herbe", "herbe", "herbe_claire", "herbe_sombre")))
    # brins : des touffes plantées dans le tas, plus quelques-uns qui pendent par-dessus le bord
    def blade(base, d, h, w, key):
        side = d.cross(Vector((0, 0, 1)))
        side = (side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))) * w
        v1, v2 = bm.verts.new(base - side), bm.verts.new(base + side)
        v3 = bm.verts.new(base + d * h)
        bm.faces.new((v1, v2, v3)).material_index = m.mi(key)

    for k in range(70):
        a, f = R_MOD.uniform(0, math.tau), math.sqrt(R_MOD.random()) * 0.92
        x, y = c.x + math.cos(a) * rx * f, c.y + math.sin(a) * ry * f
        z = rim + top * (1 - f ** 2) ** 0.8 - 0.01
        d = Vector((math.cos(a) * 0.35 * f, math.sin(a) * 0.35 * f, 1)).normalized()
        blade(Vector((x, y, z)), d, R_MOD.uniform(0.06, 0.12), R_MOD.uniform(0.008, 0.014),
              R_MOD.choice(("herbe_sombre", "herbe", "herbe_claire")))
    for k in range(18):
        a = R_MOD.uniform(0, math.tau)
        x, y = c.x + math.cos(a) * rx * 1.02, c.y + math.sin(a) * ry * 1.02
        d = Vector((math.cos(a) * 0.8, math.sin(a) * 0.8, -0.6)).normalized()
        blade(Vector((x, y, rim + 0.01)), d, R_MOD.uniform(0.05, 0.09), 0.009, "herbe_sombre")
    return m.finish("Brouette")
