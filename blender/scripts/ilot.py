"""Îlot de nature du hero : un plateau bombé qui sort du sol blanc, couvert d'une prairie — herbe, fleurs, buissons,
fougères. Pas d'arbre, pas d'eau : un sol vivant, rien de plus. Low poly (faces plates, couleurs franches).
Le bord de l'herbe est découpé dans le matériau du sol par le même bruit que le vide du site immersif : net, ondulé,
avec ses îlots et ses trous. Au-delà, la dune reste blanche et se fond dans le sol du vide.
Usage (Blender ouvert sur blender/hero.blend, serveur MCP) : exec(open('blender/scripts/ilot.py').read())
Relancer le script reconstruit l'îlot entièrement (collection « Îlot »)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise

SEED = 7
rng = random.Random(SEED)

# ------------------------------------------------------------- forme de l'îlot (m, repère Blender, z en haut)
DUNE_R = 6.8            # pied de la dune : au-delà, le sol du vide
DUNE_H = 1.2            # hauteur du plateau
GRASS_R = 5.0           # rayon de l'herbe (avant le bruit du bord)
ISLE = 1.22             # écartement des éléments placés à la main (l'îlot a grandi pour accueillir les objets)
EDGE = 1.5              # profondeur du bord ondulé (m)
SPACING = 0.34          # taille des facettes du sol

# ------------------------------------------------------------- palette
PAL = {
    "herbe": "#69ad45", "herbe_claire": "#8fc552", "herbe_sombre": "#4a8a3c", "mousse": "#3f7a3a",
    "sable": "#dccb9f", "berge": "#b9a983", "vide": "#f7f7f5",
    "eau": "#4fb8cf", "eau_claire": "#8fd8e2",
    "roche": "#837c72", "roche_claire": "#9a9387", "roche_sombre": "#6a645c",
    "tronc": "#8a5a3c", "tronc_sombre": "#6b442d", "bouleau": "#ece8df", "bouleau_marque": "#3a3633",
    "feuille": "#5ea544", "feuille_claire": "#86bf4a", "feuille_sombre": "#3d7d3c", "feuille_tres_claire": "#b2d65e",
    "feuille_profonde": "#2f6636", "fleur_rose_sombre": "#d9708c",
    "pin": "#2f6e4a", "pin_clair": "#3f8455",
    "fleur_rose": "#f08aa3", "fleur_rose_claire": "#f8bccb",
    "orange": "#ff8a1f", "jaune": "#f5cc4a", "blanc": "#fbfaf5", "lilas": "#b79be0", "corail": "#ff6f5e",
    "champignon": "#e0503f", "pied": "#f3ecdc", "nenuphar": "#5f9e4b", "roseau": "#7a9a4a", "massette": "#7a4b2e",
    "bois": "#a87a52", "cible": "#c9a27a", "fougere": "#3f8a3e", "lapin": "#c4ab8c", "lapin_clair": "#efe6d8", "nez": "#e8909a", "oeil": "#2a2522",
}


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------- nettoyage
COLL = "Îlot"
old = bpy.data.collections.get(COLL)
if old:
    for o in list(old.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(old)
for m in list(bpy.data.meshes):
    if m.users == 0:
        bpy.data.meshes.remove(m)
coll = bpy.data.collections.new(COLL)
bpy.context.scene.collection.children.link(coll)


# ------------------------------------------------------------- matériaux
def mat(name, hexcol, rough=0.85, spec=0.25, emit=0.0, alpha=None):
    m = bpy.data.materials.get("Îlot · " + name) or bpy.data.materials.new("Îlot · " + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs[0])
    c = (*srgb(hexcol), 1)
    b.inputs["Base Color"].default_value = c
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = spec
    if emit:
        b.inputs["Emission Color"].default_value = c
        b.inputs["Emission Strength"].default_value = emit
    m.diffuse_color = c
    return m


def mat_vcol(name, rough=0.9):
    """Couleur par facette (attribut « Col », coin de face)."""
    m = bpy.data.materials.get("Îlot · " + name) or bpy.data.materials.new("Îlot · " + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    a = nt.nodes.new("ShaderNodeVertexColor")
    a.layer_name = "Col"
    nt.links.new(a.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(b.outputs[0], out.inputs[0])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.2
    return m, nt, a, b, out


M = {k: mat(k, v) for k, v in PAL.items()}
M["eau"] = mat("eau", PAL["eau"], rough=0.15, spec=0.6)
M["eau_claire"] = mat("eau_claire", PAL["eau_claire"], rough=0.2, spec=0.5)


def obj(name, bm, mats, parent=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mm in mats:
        me.materials.append(mm)
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if parent:
        o.parent = parent
    return o


# ------------------------------------------------------------- hauteur du sol : un plateau bombé
def height(x, y):
    p = Vector((x, y))
    ang = math.atan2(y, x)
    rr = DUNE_R * (1 + 0.07 * noise.noise(Vector((math.cos(ang) * 1.3, math.sin(ang) * 1.3, 3.7))))
    r = p.length / rr
    if r >= 1:
        return 0.0
    # dessus large, à peine bombé ; flancs qui descendent en douceur jusqu'au sol du vide
    h = DUNE_H * (1 - r ** 4) ** 3
    # relief : de longues ondulations et de petites bosses, effacées vers le pied
    env = 1 - r * r
    h += 0.09 * env * noise.noise(Vector((x * 0.45, y * 0.45, 1.1)))
    h += 0.035 * env * noise.noise(Vector((x * 1.4, y * 1.4, 5.3)))
    return max(h, 0.0)


def grass_mask(x, y):
    """Même découpe que le matériau (approchée) : > 0 dans l'herbe."""
    v = Vector((x, y, 0.0))
    n = noise.noise(v * 1.25) * 0.5 + 0.5
    return GRASS_R - v.length + (n - 1) * EDGE


# ------------------------------------------------------------- le sol : une dune douce (silhouette low poly,
# ombrage lissé) — les facettes restent aux objets ; le sol, lui, se lit par ses taches de couleur
def build_ground():
    bm = bmesh.new()
    st = SPACING * 0.62
    N = int(DUNE_R * 1.12 / st) + 1
    grid = {}
    for i in range(-N, N + 1):
        for j in range(-N, N + 1):
            x, y = i * st, j * st
            if math.hypot(x, y) > DUNE_R * 1.1:
                continue
            grid[(i, j)] = bm.verts.new((x, y, height(x, y)))
    for (i, j), v in grid.items():
        q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
        if all(k in grid for k in q):
            vs = [grid[k] for k in q]
            if all(abs(vv.co.z) < 1e-4 for vv in vs):
                continue                        # plat : c'est le sol du vide qui le dessine
            bm.faces.new(vs)
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    for v in bm.verts:                          # le pied touche le sol : enfoncé d'un rien (pas de scintillement)
        if abs(v.co.z) < 1e-4:
            v.co.z = -0.002
    o = obj("Îlot · Sol", bm, [], smooth=True)
    return o


ground = build_ground()


def ground_material():
    m, nt, a, b, out = mat_vcol("sol")
    # masque de l'herbe : rayon − distance + (bruit − 1) × bord  (bruit du vide : 0.75·n(0.9 p) + 0.25·n(3.2 p))
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = nt.nodes.new("ShaderNodeTexNoise"); n1.noise_dimensions = "3D"
    n1.inputs["Scale"].default_value = 1.25; n1.inputs["Detail"].default_value = 0.0
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.noise_dimensions = "3D"
    n2.inputs["Scale"].default_value = 4.2; n2.inputs["Detail"].default_value = 0.0
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    com = nt.nodes.new("ShaderNodeCombineXYZ")
    ln = nt.nodes.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    nt.links.new(sep.outputs[0], com.inputs[0]); nt.links.new(sep.outputs[1], com.inputs[1])
    nt.links.new(com.outputs[0], ln.inputs[0])
    nt.links.new(com.outputs[0], n1.inputs["Vector"]); nt.links.new(com.outputs[0], n2.inputs["Vector"])

    def math_node(op, a_=None, b_=None):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a_, b_)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    nmix = math_node("ADD", math_node("MULTIPLY", n1.outputs["Fac"], 0.75), math_node("MULTIPLY", n2.outputs["Fac"], 0.25))
    field = math_node("ADD", math_node("SUBTRACT", GRASS_R, ln.outputs["Value"]),
                      math_node("MULTIPLY", math_node("SUBTRACT", nmix, 1.0), EDGE))
    mask = math_node("GREATER_THAN", field, 0.0)
    # taches de prairie : un bruit large, posterisé en trois tons (sombre, moyen, clair et plus jaune)
    pn = nt.nodes.new("ShaderNodeTexNoise"); pn.noise_dimensions = "3D"
    pn.inputs["Scale"].default_value = 0.55; pn.inputs["Detail"].default_value = 1.5
    pn.inputs["Roughness"].default_value = 0.45
    nt.links.new(tc.outputs["Object"], pn.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.interpolation = "CONSTANT"
    els = ramp.color_ramp.elements
    els[0].position = 0.0; els[0].color = (0.86, 0.9, 0.86, 1)
    els[1].position = 0.43; els[1].color = (1, 1, 1, 1)
    e = els.new(0.6); e.color = (1.1, 1.1, 0.92, 1)
    nt.links.new(pn.outputs["Fac"], ramp.inputs["Fac"])
    # petit grain, comme une herbe rase (doux, pas de facettes)
    gn = nt.nodes.new("ShaderNodeTexNoise"); gn.noise_dimensions = "3D"
    gn.inputs["Scale"].default_value = 9.0; gn.inputs["Detail"].default_value = 2.0
    nt.links.new(tc.outputs["Object"], gn.inputs["Vector"])
    gm = nt.nodes.new("ShaderNodeMapRange")
    gm.inputs["To Min"].default_value = 0.93; gm.inputs["To Max"].default_value = 1.05
    nt.links.new(gn.outputs["Fac"], gm.inputs["Value"])
    mul = nt.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    nt.links.new(a.outputs["Color"], mul.inputs["A"]); nt.links.new(ramp.outputs["Color"], mul.inputs["B"])
    mul2 = nt.nodes.new("ShaderNodeMix"); mul2.data_type = "RGBA"; mul2.blend_type = "MULTIPLY"
    mul2.inputs["Factor"].default_value = 1.0
    nt.links.new(mul.outputs["Result"], mul2.inputs["A"]); nt.links.new(gm.outputs["Result"], mul2.inputs["B"])
    nt.links.new(mul2.outputs["Result"], b.inputs["Base Color"])
    # hors de l'herbe, la dune prend exactement le shader du sol du vide (Sol_blanc) : même blanc, même fondu au
    # loin. Sans cela, son pied blanc, éclairé autrement, dessinait un grand disque pâle autour de l'îlot
    void = copy_shader(bpy.data.materials["Sol_blanc"].node_tree, nt)
    final = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask, final.inputs["Fac"])
    nt.links.new(void, final.inputs[1])
    nt.links.new(b.outputs[0], final.inputs[2])
    nt.links.new(final.outputs[0], out.inputs["Surface"])
    return m


def copy_shader(src, dst):
    """Recopie les nœuds d'un matériau dans un autre ; rend la sortie qui alimentait sa surface."""
    skip = {"rna_type", "name", "label", "location", "width", "height", "dimensions", "select", "parent", "type",
            "bl_idname", "bl_label", "bl_description", "bl_icon", "bl_static_type", "bl_width_default",
            "bl_width_min", "bl_width_max", "bl_height_default", "bl_height_min", "bl_height_max", "inputs",
            "outputs", "internal_links", "is_active_output", "warning_propagation"}
    nodes, surf = {}, None
    for n in src.nodes:
        if n.type == "OUTPUT_MATERIAL":
            continue
        c = dst.nodes.new(n.bl_idname)
        for pr in n.bl_rna.properties:
            if pr.identifier in skip or pr.is_readonly:
                continue
            try:
                setattr(c, pr.identifier, getattr(n, pr.identifier))
            except (AttributeError, TypeError, ValueError):
                pass
        for i, si in enumerate(n.inputs):
            if hasattr(si, "default_value"):
                try:
                    c.inputs[i].default_value = si.default_value
                except (AttributeError, TypeError, ValueError):
                    pass
        nodes[n.name] = c
    for l in src.links:
        if l.to_node.type == "OUTPUT_MATERIAL":
            if l.to_socket.name == "Surface":
                surf = nodes[l.from_node.name].outputs[list(l.from_node.outputs).index(l.from_socket)]
            continue
        fo = nodes[l.from_node.name].outputs[list(l.from_node.outputs).index(l.from_socket)]
        ti = nodes[l.to_node.name].inputs[list(l.to_node.inputs).index(l.to_socket)]
        dst.links.new(fo, ti)
    return surf


ground.data.materials.append(ground_material())


def ground_vcolors(o):
    me = o.data
    at = me.color_attributes.get("Col")
    if at:
        me.color_attributes.remove(at)
    at = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    g0, g1, g2 = srgb(PAL["herbe"]), srgb(PAL["herbe_sombre"]), srgb(PAL["herbe_claire"])
    for v in me.vertices:
        x, y, z = v.co
        slope = 1 - v.normal.z
        t = min(1.0, max(0.0, (slope - 0.08) / 0.25))
        c = tuple(g0[i] * (1 - t) + g1[i] * t for i in range(3))
        hz = min(1.0, max(0.0, (z - DUNE_H * 0.7) / (DUNE_H * 0.4)))
        c = tuple(c[i] * (1 - hz * 0.45) + g2[i] * hz * 0.45 for i in range(3))
        at.data[v.index].color = (*c, 1)


ground_vcolors(ground)


def gz(x, y):
    return height(x, y)


# ------------------------------------------------------------- primitives low poly
def ico(bm, center, radius, subdiv=1, jitter=0.12, squash=1.0, mat_index=0, r=rng):
    res = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    vs = res["verts"]
    for v in vs:
        v.co *= 1 + r.uniform(-jitter, jitter)
        v.co.z *= squash
        v.co += Vector(center)
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        f.material_index = mat_index
    return faces


def cone(bm, base, height, r1, r2=0.0, segs=7, jitter=0.08, mat_index=0, rot=0.0, tilt=Vector((0, 0, 0)), r=rng):
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2,
                                depth=height)
    vs = res["verts"]
    rm = Matrix.Rotation(rot, 4, "Z")
    for v in vs:
        v.co.z += height / 2
        if r2 == 0 and v.co.z > height * 0.99:
            pass
        else:
            v.co.x *= 1 + r.uniform(-jitter, jitter)
            v.co.y *= 1 + r.uniform(-jitter, jitter)
        v.co = rm @ v.co
        v.co += tilt * (v.co.z / max(height, 1e-6))
        v.co += Vector(base)
    faces = {f for v in vs for f in v.link_faces}
    for f in faces:
        f.material_index = mat_index
    return faces


def limb(bm, a, b, ra, rb, segs=6, mat_index=0):
    """Branche ou tronc : un cône tronqué de a vers b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    res = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=ra, radius2=rb,
                                depth=d.length)
    q = d.to_track_quat("Z", "Y")
    for v in res["verts"]:
        v.co.z += d.length / 2
        v.co = q @ v.co + a
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = mat_index


root = bpy.data.objects.new("Îlot", None)
coll.objects.link(root)
ground.parent = root


# ------------------------------------------------------------- buissons
def build_bushes():
    bm = bmesh.new()
    spots = [(1.35, 0.55, 0.32), (1.75, 0.8, 0.24), (-1.25, 2.0, 0.3), (-2.6, 1.05, 0.26), (2.15, -1.25, 0.28),
             (2.45, -1.6, 0.2), (0.2, -0.25, 0.22), (3.05, 1.0, 0.22), (-3.1, -0.8, 0.22), (0.05, -3.0, 0.2),
             (1.85, 2.65, 0.26), (-1.7, -2.45, 0.2)]
    berries = []
    for i, (x, y, rad) in enumerate(spots):
        x, y = x * ISLE, y * ISLE
        r = random.Random(300 + i)
        z = gz(x, y)
        n = r.randint(2, 3)
        for k in range(n):
            a = r.uniform(0, math.tau)
            c = Vector((x + math.cos(a) * rad * 0.5, y + math.sin(a) * rad * 0.5, z + rad * 0.55))
            rr = rad * r.uniform(0.7, 1.0)
            ico(bm, c, rr, 1, 0.16, 0.85, 0 if k else 1, r)
            if i % 3 == 0:
                for b in range(4):
                    d = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(0.2, 1))).normalized()
                    berries.append((c + d * rr * 0.92, i % 2))
    for c, kind in berries:
        ico(bm, c, 0.035, 0, 0.0, 1.0, 2 + kind)
    return obj("Îlot · Buissons", bm, [M["feuille_sombre"], M["feuille"], M["corail"], M["blanc"]], root)


build_bushes()


# ------------------------------------------------------------- fleurs, herbes, détails
def flower(bm, x, y, s, petal_mi, heart_mi=1, stem_mi=0, r=rng):
    z = gz(x, y)
    h = r.uniform(0.12, 0.22) * s
    lean = Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0))
    top = Vector((x, y, z + h)) + lean
    limb(bm, (x, y, z - 0.01), top, 0.008 * s, 0.006 * s, 3, stem_mi)
    # corolle : 5 pétales en losange
    n = 5
    a0 = r.uniform(0, math.tau)
    c = bm.verts.new(top + Vector((0, 0, 0.012 * s)))
    rim = []
    for k in range(n * 2):
        a = a0 + k / (n * 2) * math.tau
        rad = (0.055 if k % 2 == 0 else 0.022) * s
        rim.append(bm.verts.new(top + Vector((math.cos(a) * rad, math.sin(a) * rad, 0.006 * s if k % 2 == 0 else 0))))
    for k in range(n * 2):
        f = bm.faces.new((c, rim[k], rim[(k + 1) % (n * 2)]))
        f.material_index = petal_mi
    ico(bm, top + Vector((0, 0, 0.016 * s)), 0.016 * s, 0, 0.0, 0.7, heart_mi)


def tuft(bm, x, y, s, mi, r=rng):
    z = gz(x, y) - 0.01
    n = r.randint(3, 5)
    for k in range(n):
        a = r.uniform(0, math.tau)
        w = r.uniform(0.018, 0.03) * s
        h = r.uniform(0.12, 0.24) * s
        lean = Vector((math.cos(a), math.sin(a), 0)) * r.uniform(0.03, 0.08) * s
        side = Vector((-math.sin(a), math.cos(a), 0)) * w
        base = Vector((x, y, z)) + Vector((math.cos(a), math.sin(a), 0)) * 0.02 * s
        v1, v2 = bm.verts.new(base - side), bm.verts.new(base + side)
        v3 = bm.verts.new(base + lean + Vector((0, 0, h)))
        f = bm.faces.new((v1, v2, v3))
        f.material_index = mi


def build_meadow():
    bm = bmesh.new()
    pts = []
    tries = 0
    while len(pts) < 620 and tries < 30000:
        tries += 1
        x, y = rng.uniform(-5.2, 5.2), rng.uniform(-5.2, 5.2)
        if grass_mask(x, y) < 0.25:
            continue
        pts.append((x, y))
    for i, (x, y) in enumerate(pts):
        if i < 450:
            tuft(bm, x, y, rng.uniform(0.8, 1.3), rng.choice((0, 0, 1, 2)))
    # fleurs en petites colonies (couleurs groupées, comme dans un vrai pré)
    colonies = [((-0.8, -2.6), 3, 0.45, 9), ((1.8, -2.2), 4, 0.4, 8), ((-2.9, 0.9), 5, 0.4, 7), ((2.6, 0.55), 6, 0.35, 7),
                ((-1.6, 0.35), 3, 0.35, 6), ((0.4, 2.55), 7, 0.4, 6), ((-3.2, -1.5), 4, 0.3, 5), ((1.45, 0.05), 6, 0.3, 6),
                ((-0.15, -0.55), 5, 0.25, 4), ((3.1, -1.6), 3, 0.3, 5)]
    for (cx, cy), mi, rad, n in colonies:
        cx, cy = cx * ISLE, cy * ISLE
        for k in range(n):
            a, d = rng.uniform(0, math.tau), rad * math.sqrt(rng.random())
            x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
            if grass_mask(x, y) < 0.15:
                continue
            flower(bm, x, y, rng.uniform(0.9, 1.2), mi, 8 if mi != 8 else 3)
    return obj("Îlot · Prairie", bm, [M["herbe_sombre"], M["herbe_claire"], M["mousse"], M["orange"], M["blanc"],
                                      M["jaune"], M["lilas"], M["corail"], M["jaune"]], root)


build_meadow()


def build_details():
    bm = bmesh.new()
    # champignons, en deux ronds
    for i, (x, y, s) in enumerate([(0.95, 0.75, 1.0), (1.05, 0.62, 0.7), (0.82, 0.6, 0.55), (-1.45, 1.55, 0.8), (-1.32, 1.45, 0.6)]):
        x, y = x * ISLE, y * ISLE
        z = gz(x, y)
        limb(bm, (x, y, z - 0.01), (x, y, z + 0.07 * s), 0.018 * s, 0.014 * s, 5, 1)
        cone(bm, (x, y, z + 0.06 * s), 0.06 * s, 0.06 * s, 0.0, 7, 0.0, 0, rng.uniform(0, 1))
        for d in range(3):
            a = d / 3 * math.tau + i
            ico(bm, (x + math.cos(a) * 0.033 * s, y + math.sin(a) * 0.033 * s, z + 0.085 * s), 0.009 * s, 0, 0, 1, 1)
    # une souche
    x, y = -2.2 * ISLE, 2.35 * ISLE
    z = gz(x, y)
    limb(bm, (x, y, z - 0.05), (x, y, z + 0.2), 0.17, 0.15, 8, 2)
    cone(bm, (x, y, z + 0.2), 0.005, 0.15, 0.15, 8, 0.0, 3)
    return obj("Îlot · Détails", bm, [M["champignon"], M["pied"], M["bois"], M["cible"], M["mousse"]], root)


build_details()


def build_ferns():
    bm = bmesh.new()
    spots = [(-1.0, 1.75, 1.0), (-0.75, 2.05, 0.8), (0.95, 0.95, 0.9), (-1.95, 0.45, 0.85), (2.3, 1.35, 0.8),
             (0.15, 0.95, 0.7), (-2.2, -1.85, 0.75), (2.85, -0.75, 0.7), (0.15, 0.55, 0.6)]
    for i, (x, y, s_) in enumerate(spots):
        x, y = x * ISLE, y * ISLE
        r = random.Random(700 + i)
        z = gz(x, y) - 0.01
        n = r.randint(6, 8)
        for k in range(n):
            a = k / n * math.tau + r.uniform(-0.25, 0.25)
            d = Vector((math.cos(a), math.sin(a), 0))
            side = Vector((-d.y, d.x, 0))
            L = r.uniform(0.32, 0.45) * s_
            # une fronde : 4 segments qui montent puis retombent, plus larges au milieu
            pts = []
            for t in (0.0, 0.3, 0.6, 1.0):
                pts.append(Vector((x, y, z)) + d * (L * t) + Vector((0, 0, L * (1.1 * t - 0.95 * t * t))))
            widths = (0.01, 0.07, 0.055, 0.0)
            prev = None
            for t, (pp, w) in enumerate(zip(pts, widths)):
                w *= s_
                cur = (bm.verts.new(pp - side * w), bm.verts.new(pp + side * w)) if w > 0 else (bm.verts.new(pp),)
                if prev:
                    vs = [prev[0], prev[1]] + ([cur[1], cur[0]] if len(cur) == 2 else [cur[0]])
                    f = bm.faces.new(vs)
                    f.material_index = 0 if k % 2 else 1
                prev = cur
    return obj("Îlot · Fougères", bm, [M["fougere"], M["herbe_sombre"]], root)


build_ferns()


# ------------------------------------------------------------- rendu plat : facettes nettes
for o in coll.objects:
    if o.type == "MESH" and o is not ground:
        for p in o.data.polygons:
            p.use_smooth = False
        o.visible_shadow = True

print("îlot :", len(coll.objects), "objets")
