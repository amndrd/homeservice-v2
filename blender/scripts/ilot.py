"""Îlot du hero (site non immersif), étape 1 : l'îlot seul, sans les services.
Le sol blanc du site (le « vide ») se fend et se soulève en éclats ; au milieu surgit une terre vivante, ondulée, avec
un arbre au centre, de l'herbe, des fleurs, des buissons et des pierres. Repart de zéro (les premiers prototypes sont
dans scripts/ilot_v1_prototypes.py et rendus/v1-prototypes/).

  Blender -b --factory-startup --python blender/scripts/ilot.py -- [--no-render] [--draft]

Enregistre blender/ilot.blend ; rendu transparent blender/rendus/ilot.png (l'image du site : l'îlot et son ombre)
et aperçu sur le crème de la page, blender/rendus/ilot-apercu.png.
Repère : x vers la droite de l'image, y vers le fond, z vers le haut ; la caméra regarde depuis l'avant."""
import bpy, bmesh, math, os, random, sys
from mathutils import Vector, Matrix, noise

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))           # homeservice/
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RENDER = "--no-render" not in ARGS
DRAFT = "--draft" in ARGS                               # rendu rapide pour mettre au point
OUT_BLEND = os.path.join(ROOT, "blender", "ilot.blend")
OUT_DIR = os.path.join(ROOT, "blender", "rendus")
PAGE = "#f7f7f5"                                        # crème de la page (le vide du site immersif)

# ------------------------------------------------------------- réglages de la forme
RX, RY = 3.9, 2.95            # demi-axes du contour de l'îlot (m)
EDGE_FRONT, EDGE_BACK = 0.34, 0.64   # hauteur du bord au-dessus du sol blanc : l'îlot sort davantage au fond
DOME = 0.5                  # bombé du centre
WAVE = 0.24                  # amplitude des ondulations
TREE_H = 3.1                 # hauteur de l'arbre (pied compris)
BUSHES = False               # buissons sur la pelouse (retirés ; le tirage au sort est gardé : le reste ne bouge pas)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
sc = bpy.context.scene
sc.name = "Îlot"
COLL = sc.collection


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def mat(name, hexcol, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*srgb(hexcol), 1)
    b.inputs["Roughness"].default_value = rough
    m.diffuse_color = (*srgb(hexcol), 1)
    return m


# palette : celle des dioramas (pelouse, terre, haie), réchauffée
GRASS = mat("Pelouse", "#7cc35a")
GRASS_D = mat("Pelouse ombre", "#72b955")
LIP = mat("Bord de pelouse", "#3d5f2a")
SOIL = mat("Terre", "#8a5634")
SOIL_D = mat("Terre profonde", "#5c3622")
ROOT_M = mat("Racine", "#6e4a33")
BARK = mat("Écorce", "#7a5236")
LEAF = [mat("Feuillage clair", "#8fd16a"), mat("Feuillage", "#5fb04c"), mat("Feuillage sombre", "#3f8a3e")]
BUSH = [mat("Buisson", "#4f9e45"), mat("Buisson clair", "#76bf55")]
BLADE = [mat("Herbe", "#5aa844"), mat("Herbe claire", "#9ad46b")]
FLOWER = [mat("Fleur blanche", "#fff8ec"), mat("Fleur jaune", "#ffcf3f"), mat("Fleur rose", "#ff9bb3"),
          mat("Fleur orange", "#ff8a1f")]
HEART = mat("Cœur de fleur", "#ffb21f")
STEM = mat("Tige", "#4e9a3c")
ROCK = mat("Pierre", "#b9b5ab", 0.9)
ROCK_D = mat("Pierre sombre", "#8f8b82", 0.9)
VOID = mat("Éclat du vide", "#ffffff", 0.95)                 # dessus des éclats : le sol blanc de la page
VOID_CUT = mat("Tranche du vide", "#e4e1d9", 0.95)
CRACK = mat("Fissure", "#c9c4b9", 0.95)      # tranche des éclats, un peu plus sombre


def flat(o):
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def link(name, me, materials, loc=(0, 0, 0)):
    o = bpy.data.objects.new(name, me)
    if me is not None and me.users > 1:             # maillage partagé (herbes, fleurs) : couleurs par objet
        while len(me.materials) < len(materials):
            me.materials.append(materials[len(me.materials)])
        for i, m in enumerate(materials):
            o.material_slots[i].link = "OBJECT"
            o.material_slots[i].material = m
    else:
        for m in materials:
            o.data.materials.append(m)
    o.location = loc
    COLL.objects.link(o)
    return o


# ------------------------------------------------------------- le terrain
SEED = Vector((3.7, 1.3, 0.0))


def edge_r(t):
    """rayon du contour dans la direction t : ovale aux flancs pleins, ondulé (criques et avancées)"""
    c, s = math.cos(t), math.sin(t)
    n = 2.4
    r = (abs(c) ** n / RX ** n + abs(s) ** n / RY ** n) ** (-1 / n)
    return r * (1 + 0.06 * math.sin(3 * t + 0.7) + 0.035 * math.sin(5 * t + 2.1) + 0.02 * math.sin(11 * t + 0.3))


def edge_h(t):
    """hauteur du bord : bas devant (on voit le dessus), haut au fond (l'îlot se dresse)"""
    back = (math.sin(t) + 1) / 2                        # 0 devant, 1 au fond
    return EDGE_FRONT + (EDGE_BACK - EDGE_FRONT) * back ** 1.3 + 0.05 * noise.noise(Vector((math.cos(t), math.sin(t), 0)) * 3 + SEED)


def height(x, y):
    """hauteur de la pelouse en (x, y) : bord, bombé vers l'arbre, collines douces et creux"""
    t = math.atan2(y, x)
    u = min(1.0, math.hypot(x, y) / edge_r(t))         # 0 au centre, 1 au bord
    h = edge_h(t) + DOME * (1 - u * u) ** 1.4
    w = noise.noise(Vector((x * 0.55, y * 0.55, 0)) + SEED) * WAVE + noise.noise(Vector((x * 1.3, y * 1.3, 0)) + SEED * 2) * WAVE * 0.3
    h += w * (1 - u ** 6)                               # les ondulations s'éteignent juste au bord
    for bx, by, br, bh in HILLS:                        # deux collines et un creux, pour le relief
        h += bh * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br)) * (1 - u ** 4)
    return h


HILLS = [(-1.8, 0.5, 0.95, 0.32), (2.0, 0.8, 0.85, 0.24), (1.0, -1.2, 0.75, -0.12), (-0.9, -1.4, 0.6, 0.1)]


def terrain():
    RINGS, SEG = 34, 180
    me = bpy.data.meshes.new("Îlot · terrain")
    bm = bmesh.new()
    center = bm.verts.new((0, 0, height(0, 0)))
    rings = []
    for k in range(1, RINGS + 1):
        u = k / RINGS
        ring = []
        for i in range(SEG):
            t = 2 * math.pi * i / SEG
            r = edge_r(t) * u
            x, y = r * math.cos(t), r * math.sin(t)
            ring.append(bm.verts.new((x, y, height(x, y))))
        rings.append(ring)
    top_faces = []
    for i in range(SEG):
        top_faces.append(bm.faces.new((center, rings[0][i], rings[0][(i + 1) % SEG])))
    for a, b in zip(rings, rings[1:]):
        for i in range(SEG):
            j = (i + 1) % SEG
            top_faces.append(bm.faces.new((a[i], b[i], b[j], a[j])))
    # le bord : une lèvre de gazon qui déborde, puis la falaise de terre qui plonge sous le sol blanc
    last = rings[-1]
    profile = [  # (débord radial (m), hauteur relative au bord : 1 = la pelouse, 0 = le sol blanc, matériau)
        (0.05, 0.97, 2), (0.06, 0.88, 2), (0.02, 0.80, 3), (0.0, 0.55, 3), (-0.02, 0.3, 4), (0.02, -0.15, 4)]
    prev = last
    side_faces = []
    for dr, rel, mi in profile:
        ring = []
        for i in range(SEG):
            t = 2 * math.pi * i / SEG
            jag = 0.05 * noise.noise(Vector((math.cos(t) * 6, math.sin(t) * 6, rel * 3)) + SEED) if mi >= 3 else 0
            r = edge_r(t) + dr + jag
            v0 = last[i].co
            z = v0.z * rel if rel > 0 else rel
            ring.append(bm.verts.new((r * math.cos(t), r * math.sin(t), z)))
        for i in range(SEG):
            j = (i + 1) % SEG
            f = bm.faces.new((prev[i], ring[i], ring[j], prev[j]))
            f.material_index = mi
            side_faces.append(f)
        prev = ring
    bm.faces.new(list(reversed(prev))).material_index = 4
    bm.normal_update()
    # le gazon : clair sur les bosses, plus sombre dans les creux
    for f in top_faces:
        c = f.calc_center_median()
        f.material_index = 0 if c.z > height(c.x * 0.9, c.y * 0.9) - 0.01 or noise.noise(c * 1.7) > -0.2 else 1
    bm.to_mesh(me)
    bm.free()
    o = link("Îlot · terrain", me, [GRASS, GRASS_D, LIP, SOIL, SOIL_D])
    return flat(o)


# ------------------------------------------------------------- la croûte blanche, cassée par l'îlot
# Le sol blanc de la page est une croûte : l'îlot l'a percée en poussant. Autour de lui, elle est brisée en plaques,
# en deux couronnes : la première, contre la terre, est soulevée et basculée (son bord intérieur remonte le long de
# l'îlot), la seconde à peine décollée, et quelques plaques manquent. Dans les fentes, la terre sombre, et l'herbe qui
# s'en échappe ; plus loin, des fissures fines filent dans le sol.
CRUST_TH = 0.07              # épaisseur de la croûte
W1, W2 = 0.55, 0.5           # largeur des deux couronnes de plaques (m)
GAP = 0.05                  # demi-largeur des fentes entre plaques


def crust_r(t, band):
    """rayons des limites des couronnes : 0 = contre l'îlot, 1 = entre les deux, 2 = bord extérieur"""
    n = noise.noise(Vector((math.cos(t) * 2.5, math.sin(t) * 2.5, band * 1.7)) + SEED)
    return edge_r(t) + (0.015, W1 + 0.12 * n, W1 + W2 + 0.2 * n)[band]


def plate(name, a0, a1, skew0, skew1, band, lift, rnd, steps=5):
    """plaque de croûte entre les angles a0 et a1 (bords légèrement de biais), de la limite band à band + 1.
    Le dessus monte de 0 (bord extérieur) à lift (bord intérieur) : la plaque bascule vers l'extérieur."""
    inner, outer = [], []
    for k in range(steps + 1):
        f = k / steps
        ti = a0 + skew0 + (a1 + skew1 - a0 - skew0) * f
        to = a0 - skew0 + (a1 - skew1 - a0 + skew0) * f
        ri, ro = crust_r(ti, band), crust_r(to, band + 1)
        inner.append(Vector((ri * math.cos(ti), ri * math.sin(ti), lift)))
        outer.append(Vector((ro * math.cos(to), ro * math.sin(to), 0.006)))
    ring = inner + list(reversed(outer))
    c = sum(ring, Vector()) / len(ring)
    pts = []
    for v in ring:                                  # rétrécie vers son centre : la fente entre deux plaques
        d = Vector((v.x - c.x, v.y - c.y, 0))
        k = max(0.0, 1 - GAP / max(d.length, 1e-4))
        pts.append(Vector((c.x + d.x * k, c.y + d.y * k, v.z)))
    roll = rnd.uniform(-0.03, 0.03)                 # chaque plaque a son petit dévers
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    top = [bm.verts.new((v.x, v.y, v.z + roll * (v.x - c.x))) for v in pts]
    bot = [bm.verts.new((v.x, v.y, v.z + roll * (v.x - c.x) - CRUST_TH)) for v in pts]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot))).material_index = 1
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i])).material_index = 1
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return flat(link(name, me, [VOID, VOID_CUT]))


def berm():
    """terre sous la croûte : de la falaise de l'îlot jusqu'au sol, elle se voit dans les fentes"""
    SEG = 180
    me = bpy.data.meshes.new("Terre sous la croûte")
    bm = bmesh.new()
    rings = []
    for s_, (dr, rel) in enumerate(((-0.03, 0.32), (W1 * 0.5, 0.1), (W1 + 0.1, -0.02), (W1 + W2 + 0.3, -0.06))):
        ring = []
        for i in range(SEG):
            t = 2 * math.pi * i / SEG
            r = edge_r(t) + dr
            ring.append(bm.verts.new((r * math.cos(t), r * math.sin(t), edge_h(t) * rel - 0.02)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(SEG):
            j = (i + 1) % SEG
            bm.faces.new((a[i], b[i], b[j], a[j]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    return flat(link("Terre sous la croûte", me, [SOIL_D]))


def crack(name, x, y, ang, rnd, length, width):
    """fissure : un trait qui serpente en s'affinant, posé sur le sol"""
    pts = [Vector((x, y))]
    seg = rnd.randint(4, 7)
    for _ in range(seg):
        ang += rnd.uniform(-0.45, 0.45)
        pts.append(pts[-1] + Vector((math.cos(ang), math.sin(ang))) * length / seg)
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    left, right = [], []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        nrm = Vector((-d.y, d.x)) * width * (1 - i / len(pts)) * 0.5
        left.append(bm.verts.new((p.x + nrm.x, p.y + nrm.y, 0.003)))
        right.append(bm.verts.new((p.x - nrm.x, p.y - nrm.y, 0.003)))
    for i in range(len(pts) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    bm.to_mesh(me)
    bm.free()
    link(name, me, [CRACK])
    return pts[-1], ang


def crust():
    rnd = random.Random(11)
    tufts = [blade_clump(f"Herbe de fente {i}", rnd, blades=10).data for i in range(4)]
    berm()
    k = 0
    cuts = []                                       # angles des fentes de la première couronne, pour l'herbe
    for band, count in ((0, 30), (1, 38)):
        bounds_ = sorted(2 * math.pi * (i + rnd.uniform(-0.3, 0.3)) / count for i in range(count))
        skews = [rnd.uniform(-0.09, 0.09) for _ in bounds_]
        for i in range(count):
            a0, a1 = bounds_[i], bounds_[(i + 1) % count] + (2 * math.pi if i == count - 1 else 0)
            t = (a0 + a1) / 2
            if band == 0:
                lift = edge_h(t) * rnd.uniform(0.32, 0.95)   # soulevée contre l'îlot
                cuts.append(a0)
            else:
                if rnd.random() < 0.22:                       # quelques plaques manquent
                    continue
                lift = rnd.uniform(0.0, 0.1)
            plate(f"Plaque {band}-{i}", a0, a1, skews[i], skews[(i + 1) % count], band, lift, rnd)
            k += 1
    # l'herbe s'échappe des fentes de la première couronne, et du pied de l'îlot
    for a in cuts:
        for j in range(rnd.randint(2, 4)):
            f = rnd.uniform(0.05, 0.75)
            t = a + rnd.uniform(-0.012, 0.012)
            r = crust_r(t, 0) + (crust_r(t, 1) - crust_r(t, 0)) * f
            z = edge_h(t) * (0.32 - 0.3 * f) - 0.03
            o = link(f"Herbe de fente {k}", tufts[k % len(tufts)], [GRASS_BLADE], (r * math.cos(t), r * math.sin(t), z))
            o.rotation_euler.z = rnd.uniform(0, 6.28)
            o.scale = [rnd.uniform(1.3, 2.1) * (1.2 - f * 0.6)] * 3
            k += 1
    for i in range(90):                             # touffes collées au pied de l'îlot, entre lui et la croûte
        t = rnd.uniform(0, 2 * math.pi)
        r = edge_r(t) + rnd.uniform(0.0, 0.06)
        o = link(f"Herbe du pied {i}", tufts[i % len(tufts)], [GRASS_BLADE],
                 (r * math.cos(t), r * math.sin(t), edge_h(t) * rnd.uniform(0.55, 0.8)))
        o.rotation_euler = (rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), rnd.uniform(0, 6.28))
        o.scale = [rnd.uniform(1.2, 1.9)] * 3
    # fissures qui partent de la croûte brisée dans le sol blanc, parfois ramifiées
    for i in range(34):
        t = 2 * math.pi * (i + rnd.uniform(-0.4, 0.4)) / 34
        r = crust_r(t, 2) - 0.05
        end, ang = crack(f"Fissure {i}", r * math.cos(t), r * math.sin(t), t + rnd.uniform(-0.3, 0.3), rnd,
                         rnd.uniform(0.35, 1.2), rnd.uniform(0.022, 0.036))
        if rnd.random() < 0.4:
            crack(f"Fissure {i} b", end.x, end.y, ang + rnd.choice((-1, 1)) * rnd.uniform(0.5, 0.9), rnd,
                  rnd.uniform(0.2, 0.5), 0.016)
    # quelques éclats détachés, au-delà
    for i in range(16):
        t = rnd.uniform(0, 2 * math.pi)
        r = crust_r(t, 2) + rnd.uniform(0.12, 0.7)
        chip(f"Éclat {i}", r * math.cos(t), r * math.sin(t), rnd.uniform(0.06, 0.16), rnd)


def chip(name, x, y, size, rnd):
    """petit éclat de croûte, à plat sur le sol"""
    n = rnd.randint(4, 6)
    angs = sorted(rnd.uniform(0, 2 * math.pi) for _ in range(n))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    pts = [(math.cos(a) * size * rnd.uniform(0.6, 1), math.sin(a) * size * rnd.uniform(0.5, 0.9)) for a in angs]
    top = [bm.verts.new((px, py, 0.012)) for px, py in pts]
    bot = [bm.verts.new((px, py, -0.04)) for px, py in pts]
    bm.faces.new(top)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i])).material_index = 1
    bm.to_mesh(me)
    bm.free()
    o = flat(link(name, me, [VOID, VOID_CUT], (x, y, 0)))
    o.rotation_euler = (rnd.uniform(-0.1, 0.1), rnd.uniform(-0.1, 0.1), rnd.uniform(0, 6.28))


# ------------------------------------------------------------- l'arbre
# Grand arbre réaliste, d'un seul bois : le squelette (tronc, branches maîtresses, branches, rameaux, et les racines
# contreforts qui s'étalent sur le gazon) est un graphe de sommets habillé par un modificateur Skin, lissé, puis sculpté
# d'écorce (relief en long). Les feuilles sont de vraies feuilles, posées par milliers en rameaux feuillus (instances de
# nœuds géométriques) au bout des rameaux, qui retombent un peu sur le pourtour : silhouette ample, en dôme.
TREE_XY = (0.15, 0.35)       # pied de l'arbre
TRUNK_H = 2.75                # hauteur de la fourche
TREE_SEED = 8


def bark_material():
    """écorce : gris-brun, crêtes en long et fissures sombres (relief par bump), mousse au pied et sur le dessus"""
    m = bpy.data.materials.new("Écorce")
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes.new
    L = nt.links.new
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.92
    tc = N("ShaderNodeTexCoord")
    mp = N("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (16, 16, 1.1)             # très étiré en hauteur : sillons verticaux
    L(tc.outputs["Object"], mp.inputs["Vector"])
    vor = N("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = 2.2
    L(mp.outputs["Vector"], vor.inputs["Vector"])
    nz = N("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.5
    nz.inputs["Detail"].default_value = 8
    L(mp.outputs["Vector"], nz.inputs["Vector"])
    crack = N("ShaderNodeMapRange")                               # fissures : bords des cellules
    crack.inputs["From Min"].default_value = 0.0
    crack.inputs["From Max"].default_value = 0.08
    L(vor.outputs["Distance"], crack.inputs["Value"])
    ramp = N("ShaderNodeValToRGB")
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.3, (*srgb("#4a3b30"), 1)
    e[1].position, e[1].color = 0.75, (*srgb("#8a7865"), 1)
    L(nz.outputs["Fac"], ramp.inputs["Fac"])
    dark = N("ShaderNodeMix")
    dark.data_type = "RGBA"
    dark.blend_type = "MULTIPLY"
    dark.inputs["B"].default_value = (*srgb("#3a2c22"), 1)
    inv = N("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    L(crack.outputs["Result"], inv.inputs[1])
    L(inv.outputs["Value"], dark.inputs["Factor"])
    L(ramp.outputs["Color"], dark.inputs["A"])
    # mousse : sur les faces tournées vers le haut et près du sol
    geo = N("ShaderNodeNewGeometry")
    sep = N("ShaderNodeSeparateXYZ")
    L(geo.outputs["Normal"], sep.inputs["Vector"])
    sepp = N("ShaderNodeSeparateXYZ")
    L(geo.outputs["Position"], sepp.inputs["Vector"])
    up = N("ShaderNodeMapRange")
    up.inputs["From Min"].default_value = 0.35
    up.inputs["From Max"].default_value = 0.9
    L(sep.outputs["Z"], up.inputs["Value"])
    low = N("ShaderNodeMapRange")
    low.inputs["From Min"].default_value = 1.4
    low.inputs["From Max"].default_value = 0.5
    L(sepp.outputs["Z"], low.inputs["Value"])
    mx = N("ShaderNodeMath")
    mx.operation = "MAXIMUM"
    L(up.outputs["Result"], mx.inputs[0])
    L(low.outputs["Result"], mx.inputs[1])
    mossn = N("ShaderNodeTexNoise")
    mossn.inputs["Scale"].default_value = 6
    mossm = N("ShaderNodeMath")
    mossm.operation = "MULTIPLY"
    L(mx.outputs["Value"], mossm.inputs[0])
    L(mossn.outputs["Fac"], mossm.inputs[1])
    mossk = N("ShaderNodeMapRange")
    mossk.inputs["From Min"].default_value = 0.35
    mossk.inputs["From Max"].default_value = 0.6
    L(mossm.outputs["Value"], mossk.inputs["Value"])
    moss = N("ShaderNodeMix")
    moss.data_type = "RGBA"
    moss.inputs["B"].default_value = (*srgb("#5d7a2e"), 1)
    L(mossk.outputs["Result"], moss.inputs["Factor"])
    L(dark.outputs["Result"], moss.inputs["A"])
    L(moss.outputs["Result"], b.inputs["Base Color"])
    # relief : crêtes (bruit) et fissures creusées
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = 0.02
    hgt = N("ShaderNodeMath")
    hgt.operation = "MULTIPLY_ADD"
    hgt.inputs[1].default_value = 0.6
    L(nz.outputs["Fac"], hgt.inputs[0])
    L(crack.outputs["Result"], hgt.inputs[2])
    L(hgt.outputs["Value"], bump.inputs["Height"])
    L(bump.outputs["Normal"], b.inputs["Normal"])
    m.diffuse_color = (*srgb("#6b5a4a"), 1)
    return m


def leaf_material():
    """feuille : chaque rameau a sa nuance (vert profond à vert tendre, quelques jaunis), un peu brillante,
    translucide à contre-jour"""
    m = bpy.data.materials.new("Feuille")
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes.new
    L = nt.links.new
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.5
    info = N("ShaderNodeObjectInfo")
    nz = N("ShaderNodeTexNoise")                                  # et une variation dans le feuillage même
    nz.inputs["Scale"].default_value = 0.6
    geo = N("ShaderNodeNewGeometry")
    L(geo.outputs["Position"], nz.inputs["Vector"])
    mixv = N("ShaderNodeMix")
    mixv.data_type = "FLOAT"
    mixv.inputs["Factor"].default_value = 0.45
    L(info.outputs["Random"], mixv.inputs["A"])
    L(nz.outputs["Fac"], mixv.inputs["B"])
    ramp = N("ShaderNodeValToRGB")
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.15, (*srgb("#2f5a22"), 1)
    e[1].position, e[1].color = 0.92, (*srgb("#9bb84a"), 1)
    for pos, col in ((0.4, "#46792b"), (0.62, "#5f9433"), (0.8, "#7ea83b")):
        el = e.new(pos)
        el.color = (*srgb(col), 1)
    L(mixv.outputs["Result"], ramp.inputs["Fac"])
    L(ramp.outputs["Color"], b.inputs["Base Color"])
    tr = N("ShaderNodeBsdfTranslucent")
    tl = N("ShaderNodeMix")
    tl.data_type = "RGBA"
    tl.blend_type = "MULTIPLY"
    tl.inputs["Factor"].default_value = 1.0
    tl.inputs["B"].default_value = (*srgb("#c8e070"), 1)
    L(ramp.outputs["Color"], tl.inputs["A"])
    L(tl.outputs["Result"], tr.inputs["Color"])
    mix = N("ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.28
    L(b.outputs["BSDF"], mix.inputs[1])
    L(tr.outputs["BSDF"], mix.inputs[2])
    L(mix.outputs["Shader"], out.inputs["Surface"])
    m.diffuse_color = (*srgb("#4d8030"), 1)
    return m


def leaf_shape(bm, at, yaw, roll, pitch, length, width, mi=0):
    """une feuille : limbe ovale à pointe, pliée le long de la nervure, qui s'incurve vers le bas"""
    K = 6
    mid, left, right = [], [], []
    for i in range(K + 1):
        t = i / K
        w = width * math.sin(math.pi * min(1, t * 1.08)) ** 0.8 * (1 - 0.35 * t)
        z = -0.35 * length * t * t
        mid.append(Vector((length * t, 0, z)))
        left.append(Vector((length * t, w * 0.5, z + w * 0.18)))
        right.append(Vector((length * t, -w * 0.5, z + w * 0.18)))
    R = Matrix.Translation(at) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(pitch, 4, "Y") @ Matrix.Rotation(roll, 4, "X")
    vm = [bm.verts.new(R @ v) for v in mid]
    vl = [bm.verts.new(R @ v) for v in left]
    vr = [bm.verts.new(R @ v) for v in right]
    for i in range(K):
        for f in ((vm[i], vm[i + 1], vl[i + 1], vl[i]), (vm[i], vr[i], vr[i + 1], vm[i + 1])):
            try:
                bm.faces.new(f).material_index = mi
            except ValueError:
                pass


def sprig(name, rnd, leaves, leaf_len, stem_len, mats):
    """rameau feuillu : une tige qui s'incurve, des feuilles alternées le long, une au bout ; vers +x"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    seg = 5
    pts = [Vector((stem_len * i / seg, 0, -0.12 * stem_len * (i / seg) ** 2)) for i in range(seg + 1)]
    ring = []
    for p_ in pts:
        ring.append([bm.verts.new(p_ + Vector((0, math.cos(a) * 0.004, math.sin(a) * 0.004))) for a in (0, 2.1, 4.2)])
    for r0, r1 in zip(ring, ring[1:]):
        for k in range(3):
            bm.faces.new((r0[k], r0[(k + 1) % 3], r1[(k + 1) % 3], r1[k])).material_index = 1
    for i in range(leaves):
        t = 0.15 + 0.85 * i / leaves
        at = pts[0].lerp(pts[-1], t)
        side = 1 if i % 2 else -1
        ll = leaf_len * rnd.uniform(0.8, 1.15) * (0.75 + 0.35 * t)
        leaf_shape(bm, at, side * rnd.uniform(0.7, 1.05), side * rnd.uniform(0.2, 0.5), rnd.uniform(-0.15, 0.35),
                   ll, ll * rnd.uniform(0.42, 0.52))
    leaf_shape(bm, pts[-1], rnd.uniform(-0.1, 0.1), 0, 0.25, leaf_len * 1.1, leaf_len * 0.5)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    for m in mats:
        me.materials.append(m)
    for p_ in me.polygons:
        p_.use_smooth = True
    return o


def instancer(name, points, coll, attrs):
    """nœuds géométriques : un rameau (choisi au hasard dans coll) sur chaque point, tourné et mis à l'échelle
    par les attributs rot et scl des points"""
    ng = bpy.data.node_groups.new(name, "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N = ng.nodes.new
    L = ng.links.new
    gi, go = N("NodeGroupInput"), N("NodeGroupOutput")
    ci = N("GeometryNodeCollectionInfo")
    ci.transform_space = "ORIGINAL"
    ci.inputs["Collection"].default_value = coll
    ci.inputs["Separate Children"].default_value = True
    ci.inputs["Reset Children"].default_value = True
    iop = N("GeometryNodeInstanceOnPoints")
    iop.inputs["Pick Instance"].default_value = True
    rv = N("FunctionNodeRandomValue")
    rv.data_type = "INT"
    next(s for s in rv.inputs if s.name == "Min" and s.type == "INT").default_value = 0
    next(s for s in rv.inputs if s.name == "Max" and s.type == "INT").default_value = len(coll.objects) - 1
    rot = N("GeometryNodeInputNamedAttribute")
    rot.data_type = "FLOAT_VECTOR"
    rot.inputs["Name"].default_value = "rot"
    scl = N("GeometryNodeInputNamedAttribute")
    scl.data_type = "FLOAT"
    scl.inputs["Name"].default_value = "scl"
    e2r = N("FunctionNodeEulerToRotation")
    L(gi.outputs[0], iop.inputs["Points"])
    L(ci.outputs[0], iop.inputs["Instance"])
    L(next(s for s in rv.outputs if s.type == "INT"), iop.inputs["Instance Index"])
    L(rot.outputs["Attribute"], e2r.inputs[0])
    L(e2r.outputs[0], iop.inputs["Rotation"])
    L(scl.outputs["Attribute"], iop.inputs["Scale"])
    L(iop.outputs["Instances"], go.inputs[0])
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p_) for p_ in points], [], [])
    for key, vals in attrs.items():
        kind = "FLOAT_VECTOR" if isinstance(vals[0], (tuple, Vector)) else "FLOAT"
        at = me.attributes.new(key, kind, "POINT")
        if kind == "FLOAT_VECTOR":
            at.data.foreach_set("vector", [c for v in vals for c in v])
        else:
            at.data.foreach_set("value", vals)
    o = bpy.data.objects.new(name, me)
    COLL.objects.link(o)
    o.modifiers.new("Instances", "NODES").node_group = ng
    return o


class Skeleton:
    """graphe de sommets et d'arêtes, avec un rayon par sommet (habillé ensuite par Skin)"""

    def __init__(self):
        self.v, self.r, self.e = [], [], []

    def add(self, p_, r, parent=None):
        self.v.append(Vector(p_))
        self.r.append(r)
        i = len(self.v) - 1
        if parent is not None:
            self.e.append((parent, i))
        return i


def tree():
    rnd = random.Random(TREE_SEED)
    x0, y0 = TREE_XY
    z0 = height(x0, y0)
    BARK = bark_material()
    LEAF = leaf_material()
    sk = Skeleton()
    leaf_pts, leaf_rot, leaf_scl = [], [], []
    axis = Vector((x0, y0, 0))

    def add_leaves(p_, d, n, spread):
        for _ in range(n):
            q = p_ + Vector((rnd.gauss(0, spread), rnd.gauss(0, spread), rnd.gauss(0, spread * 0.7)))
            out = Vector((q.x - axis.x, q.y - axis.y, 0))
            yaw = math.atan2(out.y, out.x) + rnd.uniform(-1.1, 1.1)
            pitch = rnd.uniform(-0.2, 0.7) + (0.35 if d.z < 0 else 0)          # les rameaux retombent
            leaf_pts.append(q)
            leaf_rot.append((rnd.uniform(-0.5, 0.5), pitch, yaw))
            leaf_scl.append(rnd.uniform(0.8, 1.25))

    def grow(parent, p_, d, length, r0, depth):
        """branche : une suite de segments qui s'infléchissent ; des branches filles sur sa longueur"""
        seg_len = (0.32, 0.22, 0.14, 0.09)[depth]
        n = max(3, int(length / seg_len))
        cur, idx = Vector(p_), parent
        pts = []
        for i in range(1, n + 1):
            f = i / n
            bend = Vector((0, 0, (0.22, 0.05, -0.25, -0.45)[depth] * f))     # montent, puis retombent au bout
            d = (d + bend + Vector((rnd.gauss(0, 0.12), rnd.gauss(0, 0.12), rnd.gauss(0, 0.08)))).normalized()
            # enveloppe du houppier (dôme) : une branche qui en sort est ramenée vers l'intérieur
            q = cur + d * (length / n) - ENV_C
            k_ = (q.x / ENV_R.x) ** 2 + (q.y / ENV_R.y) ** 2 + (q.z / ENV_R.z) ** 2
            if k_ > 1:
                inward = -Vector((q.x / ENV_R.x ** 2, q.y / ENV_R.y ** 2, q.z / ENV_R.z ** 2)).normalized()
                d = (d + inward * min(1.2, (k_ - 1) * 3)).normalized()
            cur = cur + d * (length / n)
            r = max(0.012, r0 * (1 - 0.72 * f))
            idx = sk.add(cur, r, idx)
            pts.append((idx, Vector(cur), Vector(d), r, f))
        if depth < 3:
            kids = (0, 7, 6, 5)[depth + 0] if depth else 7
            kids = {0: 8, 1: 7, 2: 5}[depth]
            for k in range(kids):
                f = 0.28 + 0.68 * (k + rnd.uniform(0, 0.8)) / kids
                i_, c, dd, r, _ = pts[min(len(pts) - 1, int(f * len(pts)))]
                side = dd.cross(Vector((0, 0, 1)))
                if side.length < 0.1:
                    side = Vector((1, 0, 0))
                side.normalize()
                ang = rnd.uniform(0, 2 * math.pi)
                perp = (side * math.cos(ang) + dd.cross(side) * math.sin(ang)).normalized()
                spread = rnd.uniform(0.6, 1.0)
                nd = (dd * (1 - spread * 0.6) + perp * spread).normalized()
                if depth == 0:
                    nd.z = abs(nd.z) * 0.6 + 0.1                # les branches s'ouvrent plutôt à l'horizontale
                grow(i_, c, nd.normalized(), length * rnd.uniform(0.42, 0.6) * (1 - f * 0.3), r * 0.62, depth + 1)
        if depth >= 2:                                       # les rameaux portent les feuilles
            for (_, c, dd, r, f) in pts:
                if f > 0.25:
                    add_leaves(c, dd, 3 if depth == 3 else 2, 0.12)
            add_leaves(pts[-1][1], pts[-1][2], 3, 0.12)

    # le houppier tient dans un dôme : large, un peu aplati, posé sur la fourche
    global ENV_C, ENV_R
    ENV_C = Vector((x0, y0 + 0.1, z0 + TRUNK_H + 1.1))
    ENV_R = Vector((4.1, 3.2, 2.6))
    # tronc : légèrement tors et penché, très épais au pied
    root = sk.add((x0, y0, z0 - 0.15), 0.85)
    idx = sk.add((x0, y0, z0 + 0.12), 0.78, root)        # l'empattement, juste au-dessus du sol
    trunk = []
    for i in range(1, 9):
        f = i / 8
        p_ = Vector((x0 + 0.22 * math.sin(f * 2.4) - 0.1 * f, y0 + 0.08 * math.sin(f * 3.1), z0 + TRUNK_H * f))
        r = 0.34 + 0.4 * (1 - f) ** 1.6                    # s'évase franchement vers le pied
        idx = sk.add(p_, r, idx)
        trunk.append((idx, p_))
    top_i, top = trunk[-1]
    # branches maîtresses, en couronne autour de la fourche
    for k, (a, el, L_) in enumerate(((0.4, 0.5, 3.9), (1.7, 0.7, 3.4), (2.9, 0.45, 4.1), (4.2, 0.55, 3.6),
                                     (5.4, 0.62, 3.4), (3.6, 0.3, 3.0))):
        a += rnd.uniform(-0.15, 0.15)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) * 0.85, math.sin(el)))
        start_i, start = trunk[-1 - (k % 3)]                 # départs étagés : pas de nœud sous le houppier
        grow(start_i, start, d, L_, 0.21, 0)
    # flèche centrale, qui monte au milieu du houppier
    grow(top_i, top, Vector((0.05, 0.05, 1)), 2.0, 0.22, 0)
    # racines contreforts : larges au pied, elles courent sur le gazon et plongent ; des radicelles en partent
    base_i = trunk[0][0]
    for k in range(9):
        a = 2 * math.pi * k / 9 + rnd.uniform(-0.2, 0.2)
        L_ = rnd.uniform(1.4, 2.4)
        prev = root
        d = Vector((math.cos(a), math.sin(a), 0))
        n = 9
        for i in range(1, n + 1):
            f = i / n
            q = axis + d * (0.3 + L_ * f) + d.cross(Vector((0, 0, 1))) * 0.15 * math.sin(f * 4 + k)
            r = max(0.035, 0.42 * (1 - f) ** 1.25)
            z = height(q.x, q.y) + r * 0.6 - (0.18 if i == n else 0)
            prev = sk.add((q.x, q.y, z), r, prev)
            if i in (3, 6) and rnd.random() < 0.7:          # radicelle
                side = d.cross(Vector((0, 0, 1))) * rnd.choice((-1, 1))
                pr = prev
                for j in range(1, 4):
                    qq = q + (d * 0.5 + side) .normalized() * 0.18 * j
                    rr = r * 0.5 * (1 - j / 4) + 0.015
                    pr = sk.add((qq.x, qq.y, height(qq.x, qq.y) + rr * 0.2 - (0.06 if j == 3 else 0)), rr, pr)

    # habillage : Skin → lissage → relief d'écorce en long
    me = bpy.data.meshes.new("Arbre")
    me.from_pydata([tuple(v) for v in sk.v], sk.e, [])
    o = bpy.data.objects.new("Arbre", me)
    COLL.objects.link(o)
    skin = o.modifiers.new("Skin", "SKIN")
    skin.branch_smoothing = 0.6
    for i, r in enumerate(sk.r):
        sv = me.skin_vertices[0].data[i]
        sv.radius = (r, r)
        sv.use_root = (i == root)
    o.modifiers.new("Lissage", "SUBSURF").levels = 2
    o.modifiers["Lissage"].render_levels = 2
    ctrl = bpy.data.objects.new("Repère de l'écorce", None)    # l'écorce est étirée en hauteur : crêtes en long
    ctrl.scale = (0.12, 0.12, 0.9)
    COLL.objects.link(ctrl)
    tex = bpy.data.textures.new("Crêtes d'écorce", "CLOUDS")
    tex.noise_scale = 1.0
    tex.noise_depth = 3
    dm = o.modifiers.new("Écorce", "DISPLACE")
    dm.texture = tex
    dm.texture_coords = "OBJECT"
    dm.texture_coords_object = ctrl
    dm.strength = 0.05
    me.materials.append(BARK)
    for p_ in me.polygons:
        p_.use_smooth = True

    # feuilles : trois rameaux types, instanciés sur tous les points de feuillage
    sprigs = bpy.data.collections.new("Rameaux feuillus")      # hors scène : ne sert que de modèle
    for i, (nl, ll, sl) in enumerate(((9, 0.085, 0.3), (12, 0.075, 0.36), (7, 0.095, 0.26))):
        sprigs.objects.link(sprig(f"Rameau feuillu {i}", rnd, nl, ll, sl, [LEAF, BARK]))
    instancer("Feuillage", leaf_pts, sprigs, {"rot": leaf_rot, "scl": leaf_scl})
    print("feuillage :", len(leaf_pts), "rameaux,", sk.v.__len__(), "sommets de bois")
    return Vector((x0, y0))


# ------------------------------------------------------------- l'herbe : un tapis dense (nœuds géométriques)
def blade_clump(name, rnd, blades=7):
    """touffe de brins : lames effilées qui s'incurvent, de hauteurs différentes"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for b_ in range(blades):
        a = rnd.uniform(0, 2 * math.pi)
        h = rnd.uniform(0.07, 0.17)
        lean = rnd.uniform(0.2, 0.6)
        base = Vector((math.cos(a), math.sin(a), 0)) * rnd.uniform(0, 0.02)
        dirv = Vector((math.cos(a + rnd.uniform(-0.5, 0.5)), math.sin(a + rnd.uniform(-0.5, 0.5)), 0))
        side = Vector((-dirv.y, dirv.x, 0)) * 0.006
        prev = None
        for i in range(4):
            t = i / 3
            c = base + dirv * lean * h * t * t + Vector((0, 0, h * t))
            w = side * (1 - t * 0.9)
            pair = (bm.verts.new(c - w), bm.verts.new(c + w))
            if prev:
                bm.faces.new((prev[0], prev[1], pair[1], pair[0]))
            prev = pair
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


def grass_material():
    m = bpy.data.materials.new("Brin d'herbe")
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes.new
    L = nt.links.new
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Roughness"].default_value = 0.6
    info = N("ShaderNodeObjectInfo")
    ramp = N("ShaderNodeValToRGB")
    e = ramp.color_ramp.elements
    e[0].position, e[0].color = 0.0, (*srgb("#3e7428"), 1)
    e[1].position, e[1].color = 1.0, (*srgb("#93b84c"), 1)
    el = e.new(0.6)
    el.color = (*srgb("#5f9636"), 1)
    L(info.outputs["Random"], ramp.inputs["Fac"])
    # plus sombre au pied du brin
    geo = N("ShaderNodeTexCoord")
    sep = N("ShaderNodeSeparateXYZ")
    L(geo.outputs["Object"], sep.inputs["Vector"])
    mr = N("ShaderNodeMapRange")
    mr.inputs["From Max"].default_value = 0.12
    mr.inputs["To Min"].default_value = 0.45
    L(sep.outputs["Z"], mr.inputs["Value"])
    mul = N("ShaderNodeMix")
    mul.data_type = "RGBA"
    mul.blend_type = "MULTIPLY"
    mul.inputs["Factor"].default_value = 1.0
    L(ramp.outputs["Color"], mul.inputs["A"])
    cmb = N("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        L(mr.outputs["Result"], cmb.inputs[k])
    L(cmb.outputs["Color"], mul.inputs["B"])
    L(mul.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Subsurface Weight"].default_value = 0.0
    m.diffuse_color = (*srgb("#5f9636"), 1)
    return m


def grass_carpet(terrain_obj, density=520):
    """sème des touffes sur le dessus de l'îlot (pelouse seulement), tournées au hasard"""
    rnd = random.Random(31)
    gm = grass_material()
    clumps = bpy.data.collections.new("Touffes d'herbe")
    for i in range(6):
        o = blade_clump(f"Touffe {i}", rnd)
        o.data.materials.append(gm)
        clumps.objects.link(o)
    ng = bpy.data.node_groups.new("Tapis d'herbe", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N = ng.nodes.new
    L = ng.links.new
    gi, go = N("NodeGroupInput"), N("NodeGroupOutput")
    sel = []
    for m in (GRASS, GRASS_D):
        ms = N("GeometryNodeMaterialSelection")
        ms.inputs["Material"].default_value = m
        sel.append(ms)
    orr = N("FunctionNodeBooleanMath")
    orr.operation = "OR"
    L(sel[0].outputs[0], orr.inputs[0])
    L(sel[1].outputs[0], orr.inputs[1])
    dist = N("GeometryNodeDistributePointsOnFaces")
    dist.inputs["Density"].default_value = density
    L(gi.outputs[0], dist.inputs["Mesh"])
    L(orr.outputs[0], dist.inputs["Selection"])
    ci = N("GeometryNodeCollectionInfo")
    ci.inputs["Collection"].default_value = clumps
    ci.inputs["Separate Children"].default_value = True
    ci.inputs["Reset Children"].default_value = True
    iop = N("GeometryNodeInstanceOnPoints")
    iop.inputs["Pick Instance"].default_value = True
    ri = N("FunctionNodeRandomValue")
    ri.data_type = "INT"
    next(s for s in ri.inputs if s.name == "Max" and s.type == "INT").default_value = 5
    rr = N("FunctionNodeRandomValue")
    rr.data_type = "FLOAT_VECTOR"
    next(s for s in rr.inputs if s.name == "Min" and s.type == "VECTOR").default_value = (-0.15, -0.15, 0)
    next(s for s in rr.inputs if s.name == "Max" and s.type == "VECTOR").default_value = (0.15, 0.15, 6.28)
    rs = N("FunctionNodeRandomValue")
    rs.data_type = "FLOAT"
    next(s for s in rs.inputs if s.name == "Min" and s.type == "VALUE").default_value = 0.7
    next(s for s in rs.inputs if s.name == "Max" and s.type == "VALUE").default_value = 1.35
    e2r = N("FunctionNodeEulerToRotation")
    L(dist.outputs["Points"], iop.inputs["Points"])
    L(ci.outputs[0], iop.inputs["Instance"])
    L(next(s for s in ri.outputs if s.type == "INT"), iop.inputs["Instance Index"])
    L(next(s for s in rr.outputs if s.type == "VECTOR"), e2r.inputs[0])
    L(e2r.outputs[0], iop.inputs["Rotation"])
    L(next(s for s in rs.outputs if s.type == "VALUE"), iop.inputs["Scale"])
    join = N("GeometryNodeJoinGeometry")
    L(gi.outputs[0], join.inputs[0])
    L(iop.outputs["Instances"], join.inputs[0])
    L(join.outputs[0], go.inputs[0])
    terrain_obj.modifiers.new("Herbe", "NODES").node_group = ng
    return clumps


# ------------------------------------------------------------- la vie : herbes, fleurs, buissons, pierres
def on_island(rnd, keep_out=None, margin=0.18, near_edge=None):
    while True:
        t = rnd.uniform(0, 2 * math.pi)
        u = rnd.random() ** 0.5 if near_edge is None else rnd.uniform(near_edge, 1)
        r = (edge_r(t) - margin) * u
        x, y = r * math.cos(t), r * math.sin(t)
        if keep_out and math.hypot(x - keep_out[0].x, y - keep_out[0].y) < keep_out[1]:
            continue
        return x, y


def tuft_mesh(name, rnd, blades=5, h=0.16):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    for b in range(blades):
        a = 2 * math.pi * b / blades + rnd.uniform(-0.3, 0.3)
        lean = rnd.uniform(0.15, 0.4)
        hh = h * rnd.uniform(0.7, 1.2)
        base = Vector((math.cos(a) * 0.025, math.sin(a) * 0.025, 0))
        side = Vector((-math.sin(a), math.cos(a), 0)) * 0.018
        tip = base + Vector((math.cos(a) * lean * hh, math.sin(a) * lean * hh, hh))
        bm.faces.new((bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(tip)))
    bm.to_mesh(me)
    bm.free()
    return me


def flower_mesh(name, petals=5, r=0.075, h=0.14):
    """fleur : tige, corolle de pétales (matériau 0), cœur (matériau 1), tige (matériau 2)"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    s0, s1 = bm.verts.new((-0.006, 0, 0)), bm.verts.new((0.006, 0, 0))
    s2, s3 = bm.verts.new((0.006, 0, h)), bm.verts.new((-0.006, 0, h))
    bm.faces.new((s0, s1, s2, s3)).material_index = 2
    c = bm.verts.new((0, 0, h + 0.008))
    for p in range(petals):
        a0 = 2 * math.pi * p / petals
        a1 = a0 + 2 * math.pi / petals * 0.8
        am = (a0 + a1) / 2
        f = bm.faces.new((c, bm.verts.new((math.cos(a0) * r * 0.5, math.sin(a0) * r * 0.5, h)),
                          bm.verts.new((math.cos(am) * r, math.sin(am) * r, h + 0.01)),
                          bm.verts.new((math.cos(a1) * r * 0.5, math.sin(a1) * r * 0.5, h))))
        f.material_index = 0
    hc = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r * 0.26)
    for v in hc["verts"]:
        v.co.z += h + 0.014
    for f in {f for v in hc["verts"] for f in v.link_faces}:
        f.material_index = 1
    bm.to_mesh(me)
    bm.free()
    return me


def rock(name, loc, r, rnd, material):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), 0))
    for v in bm.verts:
        v.co *= 1 + 0.3 * noise.noise(v.co * 3 + off)
        v.co.z *= 0.6
    bm.to_mesh(me)
    bm.free()
    o = link(name, me, [material], loc)
    o.rotation_euler.z = rnd.uniform(0, 6.28)
    return flat(o)


def life(tree_xy):
    rnd = random.Random(21)
    keep = (tree_xy, 0.7)
    # fleurs, en petites colonies de même couleur
    fm = flower_mesh("Fleur")
    for c in range(18):
        cx, cy = on_island(rnd, keep, margin=0.25)
        col = FLOWER[c % 3] if c % 5 else FLOWER[3]
        for i in range(rnd.randint(4, 9)):
            x, y = cx + rnd.gauss(0, 0.16), cy + rnd.gauss(0, 0.16)
            if math.hypot(x, y) > edge_r(math.atan2(y, x)) - 0.12:
                continue
            o = link(f"Fleur {c}-{i}", fm, [col, HEART, STEM], (x, y, height(x, y) - 0.01))
            o.rotation_euler = (rnd.uniform(-0.15, 0.15), rnd.uniform(-0.15, 0.15), rnd.uniform(0, 6.28))
            o.scale = [rnd.uniform(0.8, 1.3)] * 3
    # buissons : en grappes de deux ou trois, surtout vers le fond et les côtés
    for g, (t, u) in enumerate(((2.55, 0.8), (0.55, 0.82), (1.6, 0.86), (3.6, 0.75), (5.3, 0.78))):
        r = edge_r(t) * u
        cx, cy = r * math.cos(t), r * math.sin(t)
        for i in range(rnd.randint(2, 3)):
            x, y = cx + rnd.uniform(-0.3, 0.3), cy + rnd.uniform(-0.2, 0.2)
            s = rnd.uniform(0.22, 0.4) * (1.2 if math.sin(t) > 0 else 0.8)
            if BUSHES:
                blob(f"Buisson {g}-{i}", (x, y, height(x, y) + s * 0.4), s, BUSH[(g + i) % 2], rnd)
            else:
                rnd.uniform(0, 50), rnd.uniform(0, 50)      # les tirages de blob(), pour ne rien déplacer d'autre
    # pierres : à moitié enterrées, quelques-unes au bord, sur la falaise
    for i in range(9):
        x, y = on_island(rnd, keep, margin=0.15)
        rock(f"Pierre {i}", (x, y, height(x, y) - 0.02), rnd.uniform(0.07, 0.16), rnd, ROCK if i % 3 else ROCK_D)
    for i in range(7):
        t = rnd.uniform(math.pi * 1.1, math.pi * 1.9)          # sur la falaise de devant
        r = edge_r(t) + 0.02
        rock(f"Pierre du bord {i}", (r * math.cos(t), r * math.sin(t), edge_h(t) * rnd.uniform(0.3, 0.7)),
             rnd.uniform(0.06, 0.11), rnd, ROCK_D)


# ------------------------------------------------------------- prise de vue
def setup_render():
    me = bpy.data.meshes.new("Sol vide")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=60)
    bm.to_mesh(me)
    bm.free()
    g = link("Sol vide", me, [VOID])
    g.is_shadow_catcher = True                          # ne garde que les ombres : la page fait le fond
    cam = bpy.data.cameras.new("Caméra îlot")
    cam.lens = 50
    co = link("Caméra îlot", cam, [])
    co.location = (0.8, -21.0, 7.9)
    co.rotation_euler = (Vector((0.05, 0.3, 2.85)) - co.location).to_track_quat("-Z", "Y").to_euler()
    sc.camera = co
    sun = bpy.data.lights.new("Soleil", "SUN")
    sun.energy = 3.4
    sun.angle = math.radians(12)
    sun.color = srgb("#fff2dc")
    so = link("Soleil", sun, [])
    so.rotation_euler = (math.radians(46), 0, math.radians(-38))
    w = bpy.data.worlds.new("Monde")
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (*srgb("#eef3ff"), 1)
    bg.inputs[1].default_value = 0.85
    sc.world = w
    r = sc.render
    r.engine = "CYCLES"
    sc.cycles.samples = 32 if DRAFT else 128
    sc.cycles.use_denoising = True
    sc.cycles.device = "GPU"
    r.film_transparent = True
    r.resolution_x, r.resolution_y = 1600, 1250
    r.resolution_percentage = 50 if DRAFT else 100
    sc.view_settings.view_transform = "AgX"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception as e:
        print("GPU indisponible :", e)


def preview(png, out):
    """aperçu : le rendu transparent posé sur le crème de la page"""
    import numpy as np
    img = bpy.data.images.load(png)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    c = np.array([int(PAGE[i:i + 2], 16) / 255 for i in (1, 3, 5)], dtype=np.float32)
    a = px[..., 3:4]
    px[..., :3] = px[..., :3] * a + c * (1 - a)
    px[..., 3] = 1
    o = bpy.data.images.new("aperçu", w, h)
    o.pixels[:] = px.ravel()
    o.filepath_raw = out
    o.file_format = "PNG"
    o.save()


GRASS_BLADE = grass_material()
ter = terrain()
grass_carpet(ter)
crust()
txy = tree()
life(txy)
setup_render()
os.makedirs(OUT_DIR, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
if RENDER:
    base = os.path.join(OUT_DIR, "ilot")
    sc.render.filepath = base + ".png"
    bpy.ops.render.render(write_still=True)
    preview(base + ".png", base + "-apercu.png")
print("ENREGISTRÉ", OUT_BLEND)
