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
RX, RY = 3.3, 2.5            # demi-axes du contour de l'îlot (m)
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
LIP = mat("Bord de pelouse", "#4f9440")
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
    tufts = [tuft_mesh(f"Herbe de fente {i}", rnd, blades=rnd.randint(5, 8), h=rnd.uniform(0.1, 0.16)) for i in range(4)]
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
            o = link(f"Herbe de fente {k}", tufts[k % len(tufts)], [BLADE[k % 2]], (r * math.cos(t), r * math.sin(t), z))
            o.rotation_euler.z = rnd.uniform(0, 6.28)
            o.scale = [rnd.uniform(1.3, 2.1) * (1.2 - f * 0.6)] * 3
            k += 1
    for i in range(90):                             # touffes collées au pied de l'îlot, entre lui et la croûte
        t = rnd.uniform(0, 2 * math.pi)
        r = edge_r(t) + rnd.uniform(0.0, 0.06)
        o = link(f"Herbe du pied {i}", tufts[i % len(tufts)], [BLADE[(i // 3) % 2]],
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
def tapered(name, p0, p1, r0, r1, material, sides=7):
    """tronçon conique de p0 à p1"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r0, radius2=r1, depth=1.0)
    bmesh.ops.translate(bm, vec=(0, 0, 0.5), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    o = link(name, me, [material])
    d = Vector(p1) - Vector(p0)
    o.location = p0
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")
    o.scale = (1, 1, d.length)
    return flat(o)


def blob(name, loc, r, material, rnd, sub=2, squash=0.85):
    """touffe de feuillage low poly : icosphère cabossée"""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=r)
    off = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), 0))
    for v in bm.verts:
        v.co *= 1 + 0.16 * noise.noise(v.co * 2.2 + off)
        v.co.z *= squash
    bm.to_mesh(me)
    bm.free()
    return flat(link(name, me, [material], loc))


def tree():
    rnd = random.Random(5)
    x0, y0 = 0.15, 0.35                                  # un peu en arrière du centre : le relief y culmine
    z0 = height(x0, y0) - 0.05
    H = TREE_H
    # tronc légèrement penché, qui se divise en trois branches maîtresses
    fork = Vector((x0 - 0.08, y0 + 0.02, z0 + H * 0.34))
    tapered("Tronc", (x0, y0, z0), fork, 0.32, 0.2, BARK, 8)
    tips = []
    for a, lean, L in ((0.3, 0.75, 0.85), (2.4, 0.8, 0.75), (4.3, 0.6, 0.8)):
        tip = fork + Vector((math.cos(a) * lean, math.sin(a) * lean * 0.7, L))
        tapered(f"Branche {len(tips)}", fork, tip, 0.17, 0.07, BARK, 6)
        tips.append(tip)
    # racines qui courent sur le gazon
    for i, a in enumerate((0.4, 1.9, 3.3, 4.9)):
        d = Vector((math.cos(a), math.sin(a), 0))
        p1 = Vector((x0, y0, 0)) + d * 0.75
        p1.z = height(p1.x, p1.y) - 0.03
        p0 = Vector((x0 + d.x * 0.18, y0 + d.y * 0.18, 0))
        p0.z = max(height(p0.x, p0.y), z0) + 0.1
        tapered(f"Racine {i}", p0, p1, 0.12, 0.035, ROOT_M, 5)
    # houppier : grosses touffes autour des bouts de branches, puis des plus petites pour la silhouette
    crown = fork + Vector((0, 0, H * 0.42))
    blob("Houppier cœur", crown, 1.15, LEAF[1], rnd)
    for i, tip in enumerate(tips):
        blob(f"Houppier {i}", tip + Vector((0, 0, 0.2)), rnd.uniform(0.82, 0.95), LEAF[i % 3], rnd)
    for i in range(9):
        a = rnd.uniform(0, 2 * math.pi)
        e = rnd.uniform(-0.25, 0.6)
        p = crown + Vector((math.cos(a) * 1.3, math.sin(a) * 1.0, e * 0.85))
        blob(f"Touffe {i}", p, rnd.uniform(0.45, 0.65), LEAF[rnd.randint(0, 2)], rnd)
    blob("Cime", crown + Vector((0.1, 0.05, 0.85)), 0.55, LEAF[0], rnd)
    # quelques fruits orange, l'accent du site
    for i in range(7):
        a = rnd.uniform(0, 2 * math.pi)
        p = crown + Vector((math.cos(a) * 1.45, math.sin(a) * 1.1 - 0.3, rnd.uniform(-0.5, 0.3)))
        blob(f"Fruit {i}", p, 0.075, FLOWER[3], rnd, sub=1, squash=1)
    return Vector((x0, y0))


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
    # herbes : quelques maillages partagés par des centaines d'instances
    tufts = [tuft_mesh(f"Herbe {i}", rnd, blades=rnd.randint(4, 7), h=rnd.uniform(0.08, 0.14)) for i in range(4)]
    for i in range(150):
        x, y = on_island(rnd, keep, margin=0.06)
        o = link(f"Touffe d'herbe {i}", tufts[i % 4], [BLADE[rnd.random() > 0.65]], (x, y, height(x, y) - 0.01))
        o.rotation_euler.z = rnd.uniform(0, 6.28)
        o.scale = [rnd.uniform(0.8, 1.4)] * 3
    # herbes hautes en bordure : l'îlot déborde de vie
    for i in range(70):
        x, y = on_island(rnd, margin=0.02, near_edge=0.93)
        o = link(f"Herbe du bord {i}", tufts[i % 4], [BLADE[i % 2]], (x, y, height(x, y) - 0.01))
        o.rotation_euler.z = rnd.uniform(0, 6.28)
        o.scale = [rnd.uniform(1.2, 1.7)] * 3
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
    co.location = (0.7, -14.5, 6.6)
    co.rotation_euler = (Vector((0.05, 0.3, 1.55)) - co.location).to_track_quat("-Z", "Y").to_euler()
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
    r.resolution_x, r.resolution_y = 1600, 1100
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


terrain()
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
