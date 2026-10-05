"""Printemps : la vie qui sort du vide. Un matin de printemps frais et lumineux, des couleurs plus vives que nature.
- palette : verts de printemps vifs (émeraude dans les creux, vert frais, vert-jaune au soleil), taches du sol plus
  marquées ;
- brins d'herbe en dégradé : pied profond, pointe claire et lumineuse (couleur par sommet, matériaux « brin ») ;
- fleurs en colonies colorées (coquelicots, bleuets, marguerites, boutons d'or, lavande, roses) et fleurs isolées ;
- lisière : herbe haute et fleurs le long du bord de l'herbe, certaines penchées vers le blanc ;
- la nature envahit un peu les objets : herbes et fleurs au pied de chacun, jamais à travers ;
- papillons : quatre de plus, plus colorés ; chaque papillon garde ses réglages (propriétés) pour le site ;
- lumière du matin : soleil plus bas et doré, ciel qui éclaire en bleu frais (le fond reste blanc), contre-jour ;
  le blanc du vide reste pur (pas de lueur autour de l'îlot).
À exécuter sur la scène complète (après ilot.py, vfx.py, modeles.py, tas.py et compose()). Relançable : il refait ce
qu'il a fait (objets « Îlot · Printemps », papillons 3 et plus, lumière « Contre-jour »)."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree

R = random.Random(2026)
GRASS_R, EDGE = 5.0, 1.5                     # comme ilot.py (bord de l'herbe)

# ------------------------------------------------------------- palette du printemps (plus vive que nature)
PAL = {
    "herbe": "#62cc3c", "herbe_claire": "#a8e04a", "herbe_sombre": "#279a4a", "mousse": "#35b061",
    "fougere": "#2fb25a", "feuille": "#46c24a", "feuille_claire": "#9fe14c", "feuille_sombre": "#1f8f50",
    "feuille_tres_claire": "#c9ef6a", "feuille_profonde": "#16784a",
}
# brins : [pied, pointe] — le pied plonge dans l'ombre fraîche, la pointe prend la lumière
BRINS = {"brin_sombre": ("#13703f", "#6fd24a"), "brin_clair": ("#3a9a2e", "#d4f26a"), "brin_menthe": ("#1d8a55", "#8ff08a")}
FLOWER_SCALE = 1.55                          # assez grandes pour que les colonies se lisent en taches de couleur de loin
FLEURS = {  # [pétales, cœur, taille, pétales]
    "coquelicot": ("#ff3a2a", "#2a1a22", 1.25, 4), "bleuet": ("#3f7dff", "#2a3f9e", 1.0, 7),
    "marguerite": ("#ffffff", "#ffc61a", 1.05, 9), "bouton_or": ("#ffd21a", "#f2a20a", 0.85, 5),
    "lavande": ("#a36bff", "#6f3fd8", 0.95, 6), "rose": ("#ff6fae", "#ffd23f", 1.0, 5),
}


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexcol, rough=0.75, spec=0.25, emit=0.0):
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


def mat_brin(name):
    """Brin d'herbe : sa couleur vient du sommet (attribut « Col », dégradé du pied à la pointe)."""
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
    b.inputs["Roughness"].default_value = 0.7
    b.inputs["Specular IOR Level"].default_value = 0.3
    m.diffuse_color = (*srgb(BRINS.get(name, ("#3a9a2e", "#a8e04a"))[1]), 1)
    return m


def recolor(name, hexcol):
    m = bpy.data.materials.get("Îlot · " + name)
    if not m:
        return
    c = (*srgb(hexcol), 1)
    for n in m.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Base Color"].default_value = c
    m.diffuse_color = c


MASK_RES = 1024


def bake_grass_field():
    """Le vrai bord de l'herbe : la valeur du matériau du sol (avant son seuil, > 0 dans l'herbe), précalculée vue de
    dessus. ilot.py n'en a qu'une approximation (bruit de mathutils) : les plantes de lisière y tomberaient à côté."""
    import numpy as np
    sc = bpy.context.scene
    me = ground.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    x0, y0 = min(xs), min(ys)
    size = max(max(xs) - x0, max(ys) - y0)
    uv = me.uv_layers.get("champ") or me.uv_layers.new(name="champ")
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - x0) / size, (co.y - y0) / size)
    active = me.uv_layers.active
    me.uv_layers.active = uv
    nt = ground.data.materials[0].node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    keep = out.inputs["Surface"].links[0].from_socket
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -1.0, 1.0
    nt.links.new(nt.nodes["Math.006"].outputs["Value"], mr.inputs["Value"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mr.outputs["Result"], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    img = bpy.data.images.new("_champ", MASK_RES, MASK_RES, float_buffer=True)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    engine, samples = sc.render.engine, sc.cycles.samples
    sc.render.engine, sc.cycles.samples = "CYCLES", 1
    sel = [o for o in bpy.context.selected_objects]
    act = bpy.context.view_layer.objects.active
    bpy.ops.object.select_all(action="DESELECT")
    ground.select_set(True)
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.bake(type="EMIT", margin=2)
    field = (np.array(img.pixels[:]).reshape(MASK_RES, MASK_RES, 4)[..., 0] * 2.0 - 1.0)   # en m, ±1
    nt.links.new(keep, out.inputs["Surface"])
    for n in (mr, em, tex):
        nt.nodes.remove(n)
    bpy.data.images.remove(img)
    me.uv_layers.active = active
    me.uv_layers.remove(me.uv_layers["champ"])
    sc.render.engine, sc.cycles.samples = engine, samples
    ground.select_set(False)
    for o in sel:
        o.select_set(True)
    bpy.context.view_layer.objects.active = act
    return field, x0, y0, size


FIELD = None


def grass_mask(x, y):
    """Distance (m, approchée) au bord de l'herbe : > 0 dedans."""
    f, x0, y0, size = FIELD
    i, j = int((y - y0) / size * (MASK_RES - 1)), int((x - x0) / size * (MASK_RES - 1))
    if not (0 <= i < MASK_RES and 0 <= j < MASK_RES):
        return -1.0
    return float(f[i, j])


def tree(o):
    mw = o.matrix_world
    return BVHTree.FromPolygons([mw @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


ground = bpy.data.objects["Îlot · Sol"]
FIELD = bake_grass_field()
coll = bpy.data.collections["Îlot"]
root = bpy.data.objects.get("Îlot")
GROUND = tree(ground)
TAS = [o for o in bpy.data.collections["Tas"].objects if o.type == "MESH"]
TAS_T = [tree(o) for o in TAS]


def gz(x, y):
    h = GROUND.ray_cast(Vector((x, y, 30)), Vector((0, 0, -1)))
    return h[0].z if h[0] else 0.0


def free(x, y, z):
    """Rien au-dessus : la plante ne pousse pas à travers un objet (elle peut le frôler)."""
    return not any(t.ray_cast(Vector((x, y, z - 0.05)), Vector((0, 0, 1)), 3.0)[0] is not None for t in TAS_T)


# ------------------------------------------------------------- 1. palette
for k, v in PAL.items():
    recolor(k, v)

# le sol : couleur par sommet (creux émeraude, hauteurs vert-jaune) et taches plus marquées
def ground_colors():
    me = ground.data
    at = me.color_attributes.get("Col")
    g0, g1, g2 = srgb(PAL["herbe"]), srgb(PAL["herbe_sombre"]), srgb(PAL["herbe_claire"])
    for v in me.vertices:
        x, y, z = v.co
        slope = 1 - v.normal.z
        t = min(1.0, max(0.0, (slope - 0.06) / 0.22))
        c = [g0[i] * (1 - t) + g1[i] * t for i in range(3)]
        hz = min(1.0, max(0.0, (z - 1.2 * 0.62) / (1.2 * 0.45)))
        c = [c[i] * (1 - hz * 0.55) + g2[i] * hz * 0.55 for i in range(3)]
        at.data[v.index].color = (*c, 1)


ground_colors()
sol = ground.data.materials[0]
ramp = next((n for n in sol.node_tree.nodes if n.type == "VALTORGB"), None)
if ramp:                                     # taches : émeraude fraîche, vert franc, clairière ensoleillée
    els = ramp.color_ramp.elements
    els[0].color = (0.62, 0.92, 0.78, 1)
    els[1].color = (1.0, 1.0, 1.0, 1)
    els[2].color = (1.22, 1.16, 0.72, 1)

# ------------------------------------------------------------- 2. brins en dégradé
BRIN_M = {k: mat_brin(k) for k in BRINS}
FLEUR_M = {k: (mat("fleur_" + k, p, rough=0.55), mat("coeur_" + k, c, rough=0.6)) for k, (p, c, _, _) in FLEURS.items()}
TIGE = mat("tige_printemps", "#2f9c45")


def paint_brins(o, families):
    """Les faces des familles données (index de matériau → nom du brin) passent au matériau « brin », couleur du
    pied à la pointe selon la hauteur dans la pièce."""
    me = o.data
    at = me.color_attributes.get("Col") or me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    names = [m.name for m in me.materials]
    remap = {}
    for mi, brin in families.items():
        m = BRIN_M[brin]
        if m.name not in names:
            me.materials.append(m)
            names.append(m.name)
        remap[mi] = (names.index(m.name), brin)
    for p in me.polygons:
        if p.material_index not in remap:
            for li in p.loop_indices:
                at.data[li].color = (1, 1, 1, 1)
            continue
        new, brin = remap[p.material_index]
        foot, tip = srgb(BRINS[brin][0]), srgb(BRINS[brin][1])
        zs = [me.vertices[me.loops[li].vertex_index].co.z for li in p.loop_indices]
        z0 = min(zs)
        for li in p.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            t = min(1.0, max(0.0, (z - z0) / 0.2)) ** 0.8
            at.data[li].color = (*[foot[i] * (1 - t) + tip[i] * t for i in range(3)], 1)
        p.material_index = new
    me.color_attributes.active_color = at


prairie = bpy.data.objects["Îlot · Prairie"]
if not any(m.name.startswith("Îlot · brin") for m in prairie.data.materials):
    fam = {}
    for i, m in enumerate(prairie.data.materials):
        if m.name == "Îlot · herbe_sombre":
            fam[i] = "brin_sombre"
        elif m.name == "Îlot · herbe_claire":
            fam[i] = "brin_clair"
        elif m.name == "Îlot · mousse":
            fam[i] = "brin_menthe"
    paint_brins(prairie, fam)

# ------------------------------------------------------------- 3. fleurs, lisière, pied des objets
old = bpy.data.objects.get("Îlot · Printemps")
if old:
    bpy.data.objects.remove(old, do_unlink=True)

bm = bmesh.new()
MATS = list(BRIN_M.values()) + [TIGE] + [m for pair in FLEUR_M.values() for m in pair]
MI = {m.name: i for i, m in enumerate(MATS)}
flex = []                                    # souplesse de chaque sommet (0 au pied, 1 en haut), pour le vent


def vert(co, f):
    v = bm.verts.new(co)
    flex.append(f)
    return v


def tuft(x, y, s, brin, lean_out=None, tall=1.0):
    z = gz(x, y) - 0.01
    n = R.randint(3, 6)
    for k in range(n):
        a = R.uniform(0, math.tau)
        w = R.uniform(0.016, 0.028) * s
        h = R.uniform(0.14, 0.28) * s * tall
        d = Vector((math.cos(a), math.sin(a), 0))
        lean = (lean_out * R.uniform(0.06, 0.16) if lean_out is not None else d * R.uniform(0.03, 0.08)) * s
        side = Vector((-d.y, d.x, 0)) * w
        base = Vector((x, y, z)) + d * 0.02 * s
        f = bm.faces.new((vert(base - side, 0), vert(base + side, 0), vert(base + lean + Vector((0, 0, h)), 1)))
        f.material_index = MI[BRIN_M[brin].name]


def flower(x, y, kind, s=1.0, lean_out=None):
    petal, heart, size, npet = FLEURS[kind]
    s *= size * FLOWER_SCALE
    z = gz(x, y)
    h = R.uniform(0.14, 0.26) * s
    lean = (lean_out * 0.08 if lean_out is not None else Vector((R.uniform(-0.03, 0.03), R.uniform(-0.03, 0.03), 0))) * s
    top = Vector((x, y, z + h)) + lean
    # tige : trois faces fines
    for a in (0, math.tau / 3, 2 * math.tau / 3):
        d = Vector((math.cos(a), math.sin(a), 0)) * 0.006 * s
        bm.faces.new((vert(Vector((x, y, z - 0.01)) - d, 0), vert(Vector((x, y, z - 0.01)) + d, 0),
                      vert(top, 1))).material_index = MI[TIGE.name]
    # corolle : pétales en losange, légèrement relevés
    a0 = R.uniform(0, math.tau)
    c = vert(top + Vector((0, 0, 0.01 * s)), 1)
    rim = []
    for k in range(npet * 2):
        a = a0 + k / (npet * 2) * math.tau
        rad = (0.06 if k % 2 == 0 else 0.022) * s
        rim.append(vert(top + Vector((math.cos(a) * rad, math.sin(a) * rad, 0.012 * s if k % 2 == 0 else 0)), 1))
    pm = MI["Îlot · fleur_" + kind]
    for k in range(npet * 2):
        bm.faces.new((c, rim[k], rim[(k + 1) % (npet * 2)])).material_index = pm
    # cœur : un petit dôme
    hc = top + Vector((0, 0, 0.018 * s))
    ring = [vert(top + Vector((math.cos(k / 5 * math.tau) * 0.017 * s, math.sin(k / 5 * math.tau) * 0.017 * s,
                                0.01 * s)), 1) for k in range(5)]
    tipv = vert(hc, 1)
    for k in range(5):
        bm.faces.new((ring[k], ring[(k + 1) % 5], tipv)).material_index = MI["Îlot · coeur_" + kind]


def ok(x, y, need=0.15):
    return grass_mask(x, y) > need and free(x, y, gz(x, y))


# colonies : chacune son espèce (comme dans un vrai pré), quelques intruses
kinds = list(FLEURS)
colonies = 0
for _ in range(400):
    if colonies >= 21:
        break
    cx, cy = R.uniform(-4.6, 4.6), R.uniform(-4.6, 4.6)
    if grass_mask(cx, cy) < 0.6:
        continue
    colonies += 1
    kind = kinds[colonies % len(kinds)]
    rad = R.uniform(0.25, 0.55)
    for k in range(R.randint(6, 12)):
        a, d = R.uniform(0, math.tau), rad * math.sqrt(R.random())
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        if ok(x, y):
            flower(x, y, kind if R.random() > 0.12 else R.choice(kinds), R.uniform(0.85, 1.2))
# fleurs isolées, partout
for _ in range(50):
    x, y = R.uniform(-5, 5), R.uniform(-5, 5)
    if ok(x, y, 0.3):
        flower(x, y, R.choice(kinds), R.uniform(0.8, 1.1))
# touffes en plus dans le pré (plus dense, plus vivant)
for _ in range(130):
    x, y = R.uniform(-5, 5), R.uniform(-5, 5)
    if ok(x, y, 0.3):
        tuft(x, y, R.uniform(0.8, 1.3), R.choice(list(BRINS)))

# lisière : la vie déborde du vide — herbe haute, fleurs, penchées vers le dehors
placed = 0
for _ in range(9000):
    if placed >= 200:
        break
    a = R.uniform(0, math.tau)
    rr = R.uniform(3.0, 6.0)
    x, y = math.cos(a) * rr, math.sin(a) * rr
    m = grass_mask(x, y)
    if not (0.03 < m < 0.35) or not free(x, y, gz(x, y)):
        continue
    out = Vector((x, y, 0)).normalized()
    placed += 1
    if R.random() < 0.28:
        flower(x, y, R.choice(kinds), R.uniform(0.9, 1.25), lean_out=out)
    else:
        tuft(x, y, R.uniform(1.0, 1.5), R.choice(list(BRINS)), lean_out=out, tall=R.uniform(1.1, 1.6))

# la nature envahit un peu les objets : au pied de chacun, sur son pourtour
for o in TAS:
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    zmin = min(p.z for p in pts)
    foot = [p for p in pts if p.z < zmin + 0.06]
    if len(foot) < 3:
        continue
    c = sum(foot, Vector()) / len(foot)
    rad = max((Vector((p.x - c.x, p.y - c.y)).length for p in foot), default=0.2)
    n = int(3 + rad * 16)
    for k in range(n):
        a = k / n * math.tau + R.uniform(-0.2, 0.2)
        d = rad + R.uniform(0.02, 0.14)
        x, y = c.x + math.cos(a) * d, c.y + math.sin(a) * d
        if not ok(x, y, 0.1):
            continue
        if R.random() < 0.22:
            flower(x, y, R.choice(kinds), R.uniform(0.8, 1.0))
        else:
            tuft(x, y, R.uniform(0.9, 1.35), R.choice(list(BRINS)), tall=R.uniform(1.0, 1.35))

me = bpy.data.meshes.new("Îlot · Printemps")
bm.to_mesh(me)
bm.free()
for m in MATS:
    me.materials.append(m)
for p in me.polygons:
    p.use_smooth = False
# souplesse (pour le vent) et couleur des brins : pied → pointe
sp = me.attributes.new("souplesse", "FLOAT", "POINT")
for i, f in enumerate(flex):
    sp.data[i].value = f ** 1.6
col = me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
brin_idx = {MI[BRIN_M[k].name]: k for k in BRINS}
for p in me.polygons:
    k = brin_idx.get(p.material_index)
    for li in p.loop_indices:
        if k is None:
            col.data[li].color = (1, 1, 1, 1)
        else:
            t = flex[me.loops[li].vertex_index]
            foot_, tip_ = srgb(BRINS[k][0]), srgb(BRINS[k][1])
            col.data[li].color = (*[foot_[i] * (1 - t) + tip_[i] * t for i in range(3)], 1)
me.color_attributes.active_color = col
spring = bpy.data.objects.new("Îlot · Printemps", me)
coll.objects.link(spring)
if root:
    spring.parent = root
vent = bpy.data.node_groups.get("Vent")
if vent:
    spring.modifiers.new("Vent", "NODES").node_group = vent

# ------------------------------------------------------------- 4. papillons : quatre de plus, plus colorés
# [x, y, hauteur au-dessus du sol, rayon du huit, couleur des ailes, taille]
NEW_FLY = [(-2.6, 1.8, 0.7, 0.4, "#3d8bff", 1.3), (2.9, 1.9, 0.6, 0.35, "#ff6fae", 1.25),
           (-1.3, 2.9, 0.55, 0.4, "#ffe14a", 1.2), (3.2, -0.7, 0.6, 0.45, "#7fe0ff", 1.3)]
OLD_FLY = [(1.7, -1.5, 0.55, 0.45), (-0.6, -2.0, 0.5, 0.35), (1.2, 1.1, 0.65, 0.4)]
for o in [o for o in bpy.data.objects if o.name.startswith("Vie · Papillon ") and int(o.name.split()[3]) >= 3]:
    bpy.data.objects.remove(o, do_unlink=True)


def fly_props(body, k, cx, cy, h, rad):
    body["papillon"] = 1
    body["cx"], body["cy"], body["cz"], body["rad"] = cx, cy, gz(cx, cy) + h, rad
    body["ph"], body["sp"] = k * 2.1, 0.025 + 0.006 * (k % 3)


for k, (cx, cy, h, rad) in enumerate(OLD_FLY):
    b = bpy.data.objects.get(f"Vie · Papillon {k}")
    if b:
        fly_props(b, k, cx, cy, h, rad)


def driver(o, path, idx, expr):
    d = o.driver_add(path, idx).driver
    d.type = "SCRIPTED"
    d.expression = expr


for j, (cx, cy, h, rad, wing, size) in enumerate(NEW_FLY):
    k = 3 + j
    body = bpy.data.objects.new(f"Vie · Papillon {k}", None)
    coll.objects.link(body)
    body.parent = root
    body.empty_display_size = 0.05
    body.scale = (size, size, size)
    fly_props(body, k, cx, cy, h, rad)
    cz, ph, sp_ = body["cz"], body["ph"], body["sp"]
    driver(body, "location", 0, f"{cx}+{rad}*sin(frame*{sp_:.3f}+{ph:.2f})")
    driver(body, "location", 1, f"{cy}+{rad * 0.8}*sin(frame*{sp_ * 2:.3f}+{ph:.2f})")
    driver(body, "location", 2, f"{cz:.3f}+0.06*sin(frame*0.31+{ph:.2f})+0.03*sin(frame*0.9)")
    driver(body, "rotation_euler", 2,
           f"atan2({rad * 0.8 * 2}*cos(frame*{sp_ * 2:.3f}+{ph:.2f}), {rad}*cos(frame*{sp_:.3f}+{ph:.2f}))")
    wm = mat("aile_" + wing.lstrip("#"), wing, rough=0.5)
    for sgn in (-1, 1):
        wb = bmesh.new()
        a = [wb.verts.new(v) for v in ((0, 0, 0), (0.035, sgn * 0.075, 0.01), (-0.005, sgn * 0.085, 0.0),
                                        (-0.04, sgn * 0.05, 0.0))]
        wb.faces.new(a if sgn > 0 else list(reversed(a)))
        wme = bpy.data.meshes.new(f"Vie · Papillon {k} aile")
        wb.to_mesh(wme)
        wb.free()
        wme.materials.append(wm)
        w = bpy.data.objects.new(f"Vie · Papillon {k} aile {'g' if sgn > 0 else 'd'}", wme)
        coll.objects.link(w)
        w.parent = body
        driver(w, "rotation_euler", 0, f"{-sgn}*(0.15+1.05*abs(sin(frame*0.55+{ph:.2f})))")
    cb = bmesh.new()
    bmesh.ops.create_cone(cb, cap_ends=True, segments=4, radius1=0.008, radius2=0.004, depth=0.05)
    for v in cb.verts:
        v.co = Vector((v.co.z, v.co.y, v.co.x * 0.3))
    cme = bpy.data.meshes.new(f"Vie · Papillon {k} corps")
    cb.to_mesh(cme)
    cb.free()
    cme.materials.append(bpy.data.materials.get("Îlot · oeil") or mat("oeil", "#2a2522"))
    cobj = bpy.data.objects.new(f"Vie · Papillon {k} corps", cme)
    coll.objects.link(cobj)
    cobj.parent = body

# pollen doré, plus lumineux
pm_ = bpy.data.materials.get("Vie · pollen")
if pm_:
    for n in pm_.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Base Color"].default_value = (*srgb("#ffe08a"), 1)
            n.inputs["Emission Color"].default_value = (*srgb("#ffe08a"), 1)
            n.inputs["Emission Strength"].default_value = 5.0

# ------------------------------------------------------------- 5. lumière du matin
LUMIERE = {"soleil": {"elev": 26, "color": "#fff0d6", "energy": 4.8},
           "contre": {"elev": 16, "color": "#fff3c4", "energy": 2.4},
           "ciel": {"color": "#bcd9ff", "strength": 0.7}}
sun = bpy.data.objects["Soleil"]
d = sun.matrix_world.to_3x3() @ Vector((0, 0, -1))
hd = Vector((d.x, d.y, 0)).normalized()
e = math.radians(LUMIERE["soleil"]["elev"])
newd = Vector((hd.x * math.cos(e), hd.y * math.cos(e), -math.sin(e)))
sun.rotation_euler = newd.to_track_quat("-Z", "Y").to_euler()
sun.data.color = srgb(LUMIERE["soleil"]["color"])
sun.data.energy = LUMIERE["soleil"]["energy"]
# contre-jour : de derrière l'îlot, vers la caméra du hero ; sans ombre
cam = bpy.data.objects["Camera"]
toward = Vector((cam.location.x, cam.location.y, 0)).normalized()
e2 = math.radians(LUMIERE["contre"]["elev"])
cd = Vector((toward.x * math.cos(e2), toward.y * math.cos(e2), -math.sin(e2)))
back = bpy.data.objects.get("Contre-jour")
if not back:
    back = bpy.data.objects.new("Contre-jour", bpy.data.lights.new("Contre-jour", "SUN"))
    bpy.context.scene.collection.objects.link(back)
back.rotation_euler = cd.to_track_quat("-Z", "Y").to_euler()
back.data.color = srgb(LUMIERE["contre"]["color"])
back.data.energy = LUMIERE["contre"]["energy"]
back.data.use_shadow = False
# le ciel : il éclaire en bleu frais, mais la caméra voit toujours le blanc du vide
w = bpy.context.scene.world
nt = w.node_tree
if not nt.nodes.get("Ciel du matin"):
    out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
    seen = out.inputs["Surface"].links[0].from_socket
    sky = nt.nodes.new("ShaderNodeBackground"); sky.name = "Ciel du matin"
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(sky.outputs[0], mix.inputs[1])
    nt.links.new(seen, mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
sky = nt.nodes["Ciel du matin"]
sky.inputs["Color"].default_value = (*srgb(LUMIERE["ciel"]["color"]), 1)
sky.inputs["Strength"].default_value = LUMIERE["ciel"]["strength"]

# ------------------------------------------------------------- 6. pas de lueur dans le blanc
# (essayée puis écartée : le blanc du vide reste pur) — retirée si une version précédente l'avait posée
nts = sol.node_tree
halo = nts.nodes.get("Halo printanier")
if halo:
    nts.links.new(halo.inputs[1].links[0].from_socket, nts.nodes["Mix Shader.001"].inputs[1])
    for name in ("Halo printanier", "Halo · distance", "Halo · teinte"):
        if nts.nodes.get(name):
            nts.nodes.remove(nts.nodes[name])

print("printemps :", colonies, "colonies,", placed, "plantes de lisière,", len(me.polygons), "faces ajoutées")
