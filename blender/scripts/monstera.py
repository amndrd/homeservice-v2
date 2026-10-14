"""La plante en pot de l'îlot (« Plante · livraison »), refaite dans le style de flore.py : un monstera dans un pot rond en
terre cuite (sa soucoupe, essayée, a été retirée), terreau et cailloux. En option (avec-kraft), un emballage de papier kraft noué d'une
ficelle, objet à part « Plante · livraison · kraft » : essayé le 2026-10-14, écarté par l'utilisateur.
Couleurs en dégradé portées par les sommets (matériaux « Îlot · flore » de flore.py) ; souplesse par sommet : le pot ne
bouge pas, les tiges plient un peu, les feuilles davantage — le vent du site (js/hero.js) les fait onduler.
Même place et même cap que l'ancienne plante, 1,2 fois plus grande.
Usage : Blender -b hero.blend --python blender/scripts/monstera.py -- sortie.blend [avec-kraft]"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix, Quaternion
exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())

NOM, NOM_KRAFT = "Plante · livraison", "Plante · livraison · kraft"
# ses propriétés (exportées en extras) : « service » en fait un objet qui s'envole au défilement (js/hero.js,
# makeLevitation), comme les autres ; celles de l'ancienne plante sont reprises, sinon celles-ci
PROPS = {"service": "livraison", "chute_ordre": 21}
ECHELLE = 1.2                                       # par rapport aux mesures ci-dessous (celles de l'ancienne plante)
SOL = 1.190                                         # le dessous de l'ancien pot (le sol est à 1,197 : il s'y enfonce à peine)

# ------------------------------------------------------------------------------------------------ le pot
POT = dict(r_bas=0.175, r_haut=0.215, h=0.30, r_levre=0.232, h_levre=0.058, terre=0.315, segs=28)
TERRE_CUITE = [(0.0, lin("#a9502c")), (0.45, lin("#c96a3f")), (1.0, lin("#dd8655"))]
LEVRE = [(0.0, lin("#d47a49")), (1.0, lin("#eb9f6c"))]
INTERIEUR = lin("#7a3a20")
TERREAU = [(0.0, lin("#3b2417")), (1.0, lin("#5d3c28"))]
CAILLOUX = [lin("#c9c2b4"), lin("#a89f90"), lin("#ddd6c8")]


def anneau(B, z, r, segs, col, flex=0.0, bruit=0.0, rnd=None, phase=0.0):
    out = []
    for k in range(segs):
        a = k / segs * math.tau + phase
        rr = r * (1 + (rnd.uniform(-bruit, bruit) if rnd else 0))
        out.append(B.v(Vector((math.cos(a) * rr, math.sin(a) * rr, z)), flex, col(a) if callable(col) else col))
    return out


def relie(B, r0, r1, mat=0):
    n = len(r0)
    for k in range(n):
        B.face((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]), mat)


def ferme(B, ring, centre, mat=0, dessous=False):
    n = len(ring)
    for k in range(n):
        B.face((ring[(k + 1) % n], ring[k], centre) if dessous else (ring[k], ring[(k + 1) % n], centre), mat)


def pot(B, rnd):
    P, n = POT, POT["segs"]
    # le corps : légèrement évasé, la couleur s'éclaircit vers le haut ; puis la lèvre épaisse, l'intérieur, la terre
    z0 = 0.0                                        # posé à même le sol (la soucoupe a été retirée à sa demande)
    rings = []
    for j in range(6):
        t = j / 5
        rings.append(anneau(B, z0 + P["h"] * t, P["r_bas"] + (P["r_haut"] - P["r_bas"]) * t, n, ramp(TERRE_CUITE, t)))
    ferme(B, rings[0], B.v(Vector((0, 0, z0)), 0, ramp(TERRE_CUITE, 0)), dessous=True)
    for a, b in zip(rings, rings[1:]):
        relie(B, a, b)
    zl = z0 + P["h"]
    l0 = anneau(B, zl, P["r_levre"], n, ramp(LEVRE, 0))
    l1 = anneau(B, zl + P["h_levre"], P["r_levre"] * 1.01, n, ramp(LEVRE, 0.7))
    l2 = anneau(B, zl + P["h_levre"] + 0.006, P["r_levre"] * 0.97, n, ramp(LEVRE, 1))
    l3 = anneau(B, zl + P["h_levre"] + 0.006, P["r_haut"] * 0.9, n, ramp(LEVRE, 1))
    l4 = anneau(B, z0 + P["terre"], P["r_haut"] * 0.89, n, INTERIEUR)
    for a, b in ((rings[-1], l0), (l0, l1), (l1, l2), (l2, l3), (l3, l4)):
        relie(B, a, b)
    # le terreau : un disque bosselé, plus clair sur les bosses, et quelques cailloux
    zt = z0 + P["terre"]
    rt = P["r_haut"] * 0.89
    prev = l4
    for j, f in enumerate((0.75, 0.45, 0.18)):
        ring = []
        for k in range(n):
            a = k / n * math.tau
            bump = rnd.uniform(0, 0.012)
            ring.append(B.v(Vector((math.cos(a) * rt * f, math.sin(a) * rt * f, zt + 0.004 + bump)), 0,
                            ramp(TERREAU, bump / 0.012)))
        relie(B, prev, ring)
        prev = ring
    ferme(B, prev, B.v(Vector((0, 0, zt + 0.01)), 0, TERREAU[1][1]))
    for i in range(7):
        a, r = rnd.uniform(0, math.tau), rt * rnd.uniform(0.35, 0.82)
        B.blob(Vector((math.cos(a) * r, math.sin(a) * r, zt + 0.012)), rnd.uniform(0.011, 0.02), rnd.choice(CAILLOUX), 0,
               squash=0.6)
    return zt + 0.008


# ------------------------------------------------------------------------------------------------ les feuilles
TIGE_M = [(0.0, lin("#2c6b34")), (1.0, lin("#5a9c45"))]
LIMBE = [(0.0, lin("#a6dc6a")), (0.1, lin("#2f8f3e")), (0.6, lin("#257f3a")), (1.0, lin("#4aa548"))]   # nervure → bord


def feuille(B, base, d, up, L, rnd, fentes=7, trous=True, stops=LIMBE, flex0=0.3, flex1=0.62):
    """Un limbe de monstera : en cœur (deux lobes à la base, de part et d'autre du pétiole), fendu depuis le bord
    (fentes par côté) et percé de petits trous près de la nervure. Il part de `base`, sa nervure suit `d`, sa face
    regarde `up` ; les deux moitiés se relèvent un peu (en V) et la pointe retombe."""
    d = d.normalized()
    up = (up - d * up.dot(d)).normalized()
    side = d.cross(up)
    W = L * 0.48                                    # demi-largeur
    T0, NT, NC, SPLIT = -0.27, 56, 8, 3             # rangées le long de la nervure, colonnes vers le bord, début des fentes
    # les fentes : des bandes de rangées vides côté bord, régulières le long du limbe
    pas = (1.0 - 0.05 - T0) / (fentes + 1)
    bords = [T0 + 0.05 + pas * (i + 1) for i in range(fentes)]

    def largeur(t):
        e = (t - 0.33) / 0.62
        return W * math.sqrt(max(0.0, 1 - e * e)) * (1 - 0.25 * max(0.0, t - 0.75) / 0.25)

    def point(s, t, c):
        w = largeur(t)
        x_in = 0.62 * (-t) * W if t < 0 else 0.0
        x_in = min(x_in, w * 0.9)
        x = x_in + (w - x_in) * c
        y = t * L + 0.18 * c * w                    # les nervures latérales filent vers la pointe
        z = 0.16 * x - 0.22 * (max(0.0, t) ** 2) * L - 0.10 * (c ** 2) * w   # en V, pointe et bords qui retombent
        return base + side * (s * x) + d * y + up * z

    for s in (-1, 1):
        rows = [T0 + (1.0 - T0) * j / NT for j in range(NT + 1)]
        grid = []
        for t in rows:
            line = []
            for i in range(NC + 1):
                c = i / NC
                col = ramp(stops, c) * (0.85 + 0.15 * min(1.0, max(0.0, t + 0.3)))
                f = flex0 + (flex1 - flex0) * min(1.0, ((max(t, 0) * 0.8 + c * 0.4)))
                line.append(B.v(point(s, t, c), f, col))
            grid.append(line)
        trou_rangs = {int(round((b - pas / 2 - T0) / (1.0 - T0) * NT)) for b in bords[1:-1:2]} if trous else set()
        for j in range(NT):
            tm = (rows[j] + rows[j + 1]) / 2
            fente = any(abs(tm - b) < pas * 0.09 for b in bords) and -0.05 < tm < 0.9
            for i in range(NC):
                if fente and i >= SPLIT:
                    continue                        # une fente, du bord vers la nervure
                if i == 1 and j in trou_rangs and rnd.random() < 0.8:
                    continue                        # un petit trou près de la nervure
                q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
                B.face(q if s > 0 else q[::-1], 2)  # le matériau des feuilles (voir feuillage())


def petiole(B, foot, dir_h, h, portee, rnd):
    """La tige : monte du terreau, s'arque vers l'extérieur ; renvoie son bout et sa direction."""
    pts, radii, fl, cols = [], [], [], []
    n = 8
    for i in range(n + 1):
        t = i / n
        p = foot + Vector((0, 0, h * math.sin(t * math.pi / 2) ** 0.9)) + dir_h * (portee * t ** 1.6)
        pts.append(p)
        radii.append(0.011 * (1 - 0.45 * t))
        fl.append(0.3 * t ** 1.5)
        cols.append(ramp(TIGE_M, t))
    B.tube(pts, radii, fl, cols, sides=6, cap=False)
    return pts[-1], (pts[-1] - pts[-2]).normalized()


def monstera(B, sol, rnd):
    feuilles = [  # (cap °, hauteur de tige, portée, longueur du limbe, fentes) : de grandes feuilles basses tout autour,
        # d'autres plus hautes au-dessus, qui se chevauchent comme sur une plante bien fournie
        (0, 0.22, 0.26, 0.36, 5), (45, 0.36, 0.20, 0.38, 6), (95, 0.24, 0.27, 0.34, 5), (140, 0.40, 0.16, 0.37, 6),
        (190, 0.23, 0.26, 0.35, 5), (235, 0.34, 0.22, 0.38, 6), (285, 0.26, 0.25, 0.33, 4), (330, 0.42, 0.15, 0.36, 6),
        (115, 0.47, 0.10, 0.30, 4), (300, 0.48, 0.09, 0.29, 4),
    ]
    for cap, h, portee, L, fentes in feuilles:
        a = math.radians(cap + rnd.uniform(-8, 8))
        dh = Vector((math.cos(a), math.sin(a), 0))
        foot = Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), sol))
        bout, dt = petiole(B, foot, dh, h * rnd.uniform(0.95, 1.05), portee, rnd)
        # le limbe part du bout de la tige : nervure vers l'extérieur, d'autant plus penchée que la tige est basse
        d = (dh + Vector((0, 0, rnd.uniform(-0.25, 0.1) + (h - 0.3) * 0.8))).normalized()
        upv = (Vector((0, 0, 1)) + dh * 0.15).normalized()
        upv = Quaternion(d, rnd.uniform(-0.3, 0.3)) @ upv
        feuille(B, bout, d, upv, L * rnd.uniform(0.95, 1.05), rnd, fentes=fentes)


# ------------------------------------------------------------------------------------------------ le kraft
KRAFT = [(0.0, lin("#a87e55")), (0.5, lin("#c49a6c")), (1.0, lin("#d7b287"))]
FICELLE = lin("#efe4cc")


def kraft(B, rnd):
    """Un manchon de papier kraft autour du pot : plissé (des plis verticaux irréguliers, plus sombres dans les creux),
    serré au milieu par la ficelle, et dont le haut s'ouvre en collerette froissée au-dessus de la lèvre."""
    P = POT
    n = 44
    z0 = 0.0
    z_lien = z0 + P["h"] * 0.62
    phases = [rnd.uniform(0, math.tau) for _ in range(3)]
    amp = [rnd.uniform(0.6, 1.0) for _ in range(n)]

    def rayon(z, a, k):
        t = (z - z0) / (P["h"] + 0.11)
        r_pot = P["r_bas"] + (P["r_haut"] - P["r_bas"]) * min(1.0, max(0.0, (z - z0) / P["h"]))
        if z > z0 + P["h"]:
            r_pot = P["r_levre"]
        serre = 1 - 0.07 * math.exp(-((z - z_lien) / 0.035) ** 2)          # la ficelle serre le papier
        evase = max(0.0, z - (z0 + P["h"] + P["h_levre"])) * 0.7            # la collerette s'ouvre
        pli = 0.010 * amp[k] * (0.5 + 0.5 * math.sin(a * 9 + phases[0])) + 0.006 * math.sin(a * 17 + phases[1])
        return (r_pot + 0.012 + pli * (0.4 + t)) * serre + evase

    zs = [z0 + (P["h"] + 0.11) * j / 9 for j in range(10)]
    rings = []
    for j, z in enumerate(zs):
        ring = []
        for k in range(n):
            a = k / n * math.tau
            r = rayon(z, a, k)
            zz = z + (0.012 * math.sin(a * 9 + phases[0]) + rnd.uniform(-0.008, 0.008) if j == len(zs) - 1 else 0)   # bord haut froissé
            creux = 0.5 + 0.5 * math.sin(a * 9 + phases[0])
            col = ramp(KRAFT, 0.25 + 0.6 * creux) * (0.92 + 0.08 * j / 9)
            ring.append(B.v(Vector((math.cos(a) * r, math.sin(a) * r, zz)), 0, col))
        rings.append(ring)
    ferme(B, rings[0], B.v(Vector((0, 0, z0)), 0, KRAFT[0][1]), dessous=True)
    for a, b in zip(rings, rings[1:]):
        relie(B, a, b)
    # l'intérieur de la collerette (le papier a deux faces)
    inner = [B.v(v.co * Vector((0.97, 0.97, 1)) - Vector((0, 0, 0.004)), 0, ramp(KRAFT, 0.15)) for v in rings[-1]]
    inner2 = [B.v(Vector((v.co.x * 0.86, v.co.y * 0.86, zs[-3])), 0, ramp(KRAFT, 0.1)) for v in rings[-1]]
    relie(B, rings[-1], inner)
    relie(B, inner, inner2)
    # la ficelle : deux tours, puis un nœud à deux boucles et deux brins qui pendent
    for dz in (-0.006, 0.006):
        pts = []
        for k in range(n + 1):
            a = k / n * math.tau
            r = rayon(z_lien + dz, a, k % n) + 0.004
            pts.append(Vector((math.cos(a) * r, math.sin(a) * r, z_lien + dz)))
        B.tube(pts, [0.0042] * len(pts), [0] * len(pts), [FICELLE] * len(pts), sides=5, cap=False)
    a = math.radians(-35)
    o = Vector((math.cos(a), math.sin(a), 0))
    t = Vector((-math.sin(a), math.cos(a), 0))
    c = o * (rayon(z_lien, a, 0) + 0.012) + Vector((0, 0, z_lien))
    for s in (-1, 1):
        boucle = [c + t * (s * 0.05 * math.sin(u * math.pi)) + Vector((0, 0, 0.022 * math.sin(u * math.tau))) +
                  o * (0.012 * math.sin(u * math.pi)) for u in [i / 10 for i in range(11)]]
        B.tube(boucle, [0.004] * 11, [0] * 11, [FICELLE] * 11, sides=5, cap=False)
        brin = [c + t * (s * 0.018 * u) + Vector((0, 0, -0.07 * u)) + o * (0.01 * u) for u in [i / 4 for i in range(5)]]
        B.tube(brin, [0.0038] * 5, [0] * 5, [FICELLE] * 5, sides=5)
    B.blob(c + o * 0.004, 0.009, FICELLE, 0)


# ------------------------------------------------------------------------------------------------ dans la scène
def feuillage():
    """Les grandes feuilles reflètent le ciel blanc et en pâlissent : un matériau à elles, mat, à reflet discret
    (couleur par sommet comme la flore)."""
    m = bpy.data.materials.get("Îlot · feuillage")
    if not m:
        m = bpy.data.materials.new("Îlot · feuillage")
        m.use_nodes = True
        nt = m.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        ca = nt.nodes.new("ShaderNodeVertexColor")
        ca.layer_name = "Col"
        nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.85
        for k in ("Specular IOR Level", "Specular"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = 0.2
        m.diffuse_color = (0.15, 0.5, 0.2, 1)
    return m


def objet(nom, B, ref, coll, props):
    me = B.mesh(nom)
    me.materials.append(feuillage())
    me.attributes["souplesse"].name = "_souplesse"  # objet du tas : exporté tel quel (export_web.py ne renomme que l'îlot)
    ob = bpy.data.objects.new(nom, me)
    coll.objects.link(ob)
    ob.matrix_world = ref
    for k, v in props.items():
        ob[k] = v
    return ob


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    old = bpy.data.objects[NOM]
    coll = old.users_collection[0]
    x, y = old.matrix_world.translation.x, old.matrix_world.translation.y
    cap = old.rotation_euler.z
    props = {k: old[k] for k in ("service", "chute_ordre") if k in old.keys()} or PROPS
    ref = Matrix.Translation((x, y, SOL)) @ Matrix.Rotation(cap, 4, "Z") @ Matrix.Scale(ECHELLE, 4)
    for o in [old] + [o for o in bpy.data.objects if o.name == NOM_KRAFT]:
        bpy.data.objects.remove(o, do_unlink=True)
    rnd = random.Random(7)
    B = Flore()
    sol = pot(B, rnd)
    monstera(B, sol, rnd)
    plante = objet(NOM, B, ref, coll, props)
    print("PLANTE", len(plante.data.polygons), "faces")
    if "avec-kraft" in args:
        K = Flore()
        kraft(K, random.Random(3))
        k = objet(NOM_KRAFT, K, ref, coll, {})
        print("KRAFT", len(k.data.polygons), "faces")
    bpy.ops.wm.save_as_mainfile(filepath=args[0], copy=True)
    print("ENREGISTRÉ", args[0])
