"""Sol plat : la dune de l'îlot devient un sol plat, à la hauteur de son sommet, et tout ce qui est dessus suit.
Rien d'autre ne change : le motif du sol (herbe, bord ondulé, taches) est calculé sur la position d'origine de chaque
point (attribut « orig »), les couleurs par sommet restent, la caméra et les lumières ne bougent pas.
- le sol : chaque point descend ou monte à PLAT ; le sol du vide (« Sol ») monte au même niveau, juste dessous ;
- la végétation (herbe, fleurs, fougères, buissons, détails) : chaque pièce garde sa forme et suit le sol sous son
  pied ;
- les objets posés : redressés de la pente qui était sous eux, puis reposés sur le plat, sur trois appuis (pivot sur
  le point bas, puis sur une arête, jusqu'à ce que le centre de l'objet tombe dans ses appuis), enfoncés dans l'herbe
  d'autant qu'avant, et remis à leur place vue de dessus ;
- les objets portés (l'éponge sur son carton, un carton sur l'autre) suivent leur porteur ;
- les papillons gardent leur hauteur au-dessus du sol (propriété cz).
Usage, sur une copie de la scène : Blender -b copie.blend --python blender/scripts/plat.py -- sortie.blend"""
import bpy, bmesh, math, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

ground = bpy.data.objects["Îlot · Sol"]
floor = bpy.data.objects["Sol"]
MEADOW = ["Îlot · Prairie", "Îlot · Printemps", "Îlot · Fougères", "Îlot · Buissons", "Îlot · Détails"]
TAS = bpy.data.collections["Tas"]
CONTACT = 0.03          # un objet dont le point bas est à moins de 3 cm du sol est posé dessus ; sinon il est porté
EPS = 0.002             # tolérance d'appui (m)

# ------------------------------------------------------------- le sol d'origine, pour savoir où était chaque chose
mw = ground.matrix_world
gverts = [mw @ v.co for v in ground.data.vertices]
gtree = BVHTree.FromPolygons(gverts, [tuple(p.vertices) for p in ground.data.polygons])


def H(x, y):
    hit = gtree.ray_cast(Vector((x, y, 50.0)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 0.0


PLAT = H(0.0, 0.0)
print("PLAT", round(PLAT, 4))


def dz(x, y):
    return PLAT - H(x, y)


# ------------------------------------------------------------- objets du tas : posés ou portés
def world_verts(o):
    m = o.matrix_world
    return np.array([tuple(m @ v.co) for v in o.data.vertices])


tas = [o for o in TAS.objects if o.type == "MESH"]
gap = {}
for o in tas:
    V = world_verts(o)
    gap[o.name] = min(z - H(x, y) for x, y, z in V)
trees = {}
for o in tas:
    m = o.matrix_world
    trees[o.name] = BVHTree.FromPolygons([m @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])


def support_of(o):
    """L'objet sur lequel o repose : celui que touchent le plus de rayons lancés vers le bas depuis son dessous."""
    V = world_verts(o)
    zmin = V[:, 2].min()
    votes = {}
    for x, y, z in V[V[:, 2] < zmin + 0.03]:
        for name, t in trees.items():
            if name == o.name:
                continue
            hit = t.ray_cast(Vector((x, y, z + 0.005)), Vector((0, 0, -1)), 0.06)
            if hit[0]:
                votes[name] = votes.get(name, 0) + 1
    return max(votes, key=votes.get) if votes else None


carried = {}
for o in tas:
    if gap[o.name] > CONTACT:
        carried[o.name] = support_of(o)
        print("PORTÉ", o.name, "par", carried[o.name], "écart", round(gap[o.name], 3))


# ------------------------------------------------------------- pose sur le plat, sur trois appuis
def rot_about(axis_pt, axis, ang):
    return Matrix.Translation(axis_pt) @ Matrix.Rotation(ang, 4, axis) @ Matrix.Translation(-axis_pt)


def first_touch(V, p, a, sign):
    """Plus petit angle (rad) dont il faut tourner V autour de l'axe horizontal a passant par p (sens `sign`) pour
    qu'un nouveau point touche le plan z = PLAT."""
    R = V - p
    c = np.cross(a, R)[:, 2] * sign
    th = np.linspace(0, 1.2, 4801)[1:]
    Z = R[:, 2][:, None] * np.cos(th)[None, :] + c[:, None] * np.sin(th)[None, :]
    cand = R[:, 2] > EPS                                        # les points déjà en appui ne comptent pas
    if not cand.any():
        return None
    hit = (Z[cand] < 0).any(axis=0)
    if not hit.any():
        return None
    return th[np.argmax(hit)]


def hull2d(P):
    P = sorted(set(map(tuple, np.round(P, 5))))
    if len(P) < 3:
        return [np.array(p) for p in P]
    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return [np.array(p) for p in lo[:-1] + up[:-1]]


def settle(o):
    """Repose o sur le plan z = PLAT : il tombe sur son point bas, puis bascule (sur un point, puis sur une arête)
    du côté de son centre, jusqu'à ce que son centre soit au-dessus de ses appuis."""
    total = Matrix.Identity(4)
    def apply(M):
        nonlocal total
        o.matrix_world = M @ o.matrix_world
        total = M @ total
    V = world_verts(o)
    apply(Matrix.Translation((0, 0, PLAT - V[:, 2].min())))
    for _ in range(12):
        V = world_verts(o)
        com = V.mean(axis=0)
        C = V[V[:, 2] < PLAT + EPS]
        hull = hull2d(C[:, :2])
        if len(hull) >= 3:
            # le centre est-il dans le polygone d'appui ?
            inside = all(np.cross(hull[(i + 1) % len(hull)] - hull[i], com[:2] - hull[i]) >= -1e-6 for i in range(len(hull)))
            if inside:
                break
            # l'arête du polygone que le centre a franchie : on bascule autour d'elle
            best = None
            for i in range(len(hull)):
                e0, e1 = hull[i], hull[(i + 1) % len(hull)]
                s = np.cross(e1 - e0, com[:2] - e0)
                if s < 0 and (best is None or s < best[0]):
                    best = (s, e0, e1)
            _, e0, e1 = best
            p = np.array([e0[0], e0[1], PLAT])
            a = np.array([e1[0] - e0[0], e1[1] - e0[1], 0.0])
        elif len(hull) == 2:
            e0, e1 = hull
            p = np.array([e0[0], e0[1], PLAT])
            a = np.array([e1[0] - e0[0], e1[1] - e0[1], 0.0])
        else:
            p = np.array([hull[0][0], hull[0][1], PLAT])
            d = com[:2] - hull[0]
            if np.linalg.norm(d) < 1e-6:
                break
            a = np.array([-d[1], d[0], 0.0])
        a /= np.linalg.norm(a)
        # sens : le centre descend
        sign = -1.0 if np.cross(a, com - p)[2] > 0 else 1.0
        th = first_touch(V, p, a, sign)
        if th is None:
            break
        apply(rot_about(Vector(p), Vector(a), sign * th))
        # vérification : rien sous le plan
        V2 = world_verts(o)
        if V2[:, 2].min() < PLAT - 0.01:
            apply(Matrix.Translation((0, 0, PLAT - V2[:, 2].min())))
    return total


def fit_plane_normal(P):
    A = np.c_[P[:, 0], P[:, 1], np.ones(len(P))]
    (a, b, _), *_ = np.linalg.lstsq(A, P[:, 2], rcond=None)
    return Vector((-a, -b, 1)).normalized()


moves = {}
for o in tas:
    if o.name in carried:
        continue
    V = world_verts(o)
    zmin = V[:, 2].min()
    base = V[V[:, 2] < zmin + max(0.05, 0.15 * (V[:, 2].max() - zmin))]
    # la pente du sol sous l'objet, mesurée sur l'emprise de sa base
    xs = np.linspace(base[:, 0].min(), base[:, 0].max(), 6)
    ys = np.linspace(base[:, 1].min(), base[:, 1].max(), 6)
    P = np.array([(x, y, H(x, y)) for x in xs for y in ys])
    n = fit_plane_normal(P)
    pivot = Vector(base[np.argmin(base[:, 2])])
    before = o.matrix_world.copy()
    at = V[:, :2].mean(axis=0)                      # sa place au sol (centre de ses points, vu de dessus)
    undo = Matrix.Translation(pivot) @ n.rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4() @ Matrix.Translation(-pivot)
    o.matrix_world = undo @ o.matrix_world
    settle(o)
    # enfoncé dans l'herbe d'autant qu'avant (tas.py : SINK)
    o.matrix_world = Matrix.Translation((0, 0, min(0.0, max(gap[o.name], -CONTACT)))) @ o.matrix_world
    # redressé, il a pu glisser un peu : il reprend sa place, vue de dessus
    back = at - world_verts(o)[:, :2].mean(axis=0)
    o.matrix_world = Matrix.Translation((back[0], back[1], 0.0)) @ o.matrix_world
    moves[o.name] = o.matrix_world @ before.inverted()
    print("POSÉ", o.name, "pente", round(math.degrees(n.angle(Vector((0, 0, 1)))), 1), "°",
          "déplacement", round((o.matrix_world.translation - before.translation).length, 3))

# les objets portés suivent leur porteur (dans l'ordre : un porteur peut lui-même être porté)
pending = dict(carried)
while pending:
    for name, sup in list(pending.items()):
        if sup in moves:
            o = bpy.data.objects[name]
            before = o.matrix_world.copy()
            o.matrix_world = moves[sup] @ o.matrix_world
            moves[name] = moves[sup]
            del pending[name]
            print("SUIT", name, sup)
        elif sup is None or sup not in carried:
            print("SANS PORTEUR", name, sup)
            del pending[name]

# ------------------------------------------------------------- la végétation : chaque pièce suit le sol sous son pied
for name in MEADOW:
    o = bpy.data.objects[name]
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    seen = set()
    m, mi = o.matrix_world, o.matrix_world.inverted()
    n_parts = 0
    for v0 in bm.verts:
        if v0.index in seen:
            continue
        part, stack = [], [v0]
        seen.add(v0.index)
        while stack:
            v = stack.pop()
            part.append(v)
            for e in v.link_edges:
                w = e.other_vert(v)
                if w.index not in seen:
                    seen.add(w.index)
                    stack.append(w)
        foot = min(part, key=lambda v: (m @ v.co).z)
        fw = m @ foot.co
        shift = mi.to_3x3() @ Vector((0, 0, dz(fw.x, fw.y)))
        for v in part:
            v.co += shift
        n_parts += 1
    bm.to_mesh(me)
    bm.free()
    me.update()
    print("VÉGÉTATION", name, n_parts, "pièces")

# ------------------------------------------------------------- les papillons gardent leur hauteur au-dessus du sol
for o in bpy.data.objects:
    if o.get("cz") is not None and o.get("cx") is not None:
        o["cz"] = o["cz"] + dz(o["cx"], o["cy"])
        print("PAPILLON", o.name, round(o["cz"], 3))

# ------------------------------------------------------------- le sol : plat, motif calculé sur sa forme d'origine
me = ground.data
orig = me.attributes.get("orig") or me.attributes.new("orig", "FLOAT_VECTOR", "POINT")
orig.data.foreach_set("vector", [c for v in me.vertices for c in v.co])
for v in me.vertices:
    v.co.z = (mw.inverted() @ Vector((0, 0, PLAT))).z
me.update()
for mat in me.materials:
    nt = mat.node_tree
    for tc in [n for n in nt.nodes if n.type == "TEX_COORD"]:
        out = tc.outputs["Object"]
        if not out.links:
            continue
        at = nt.nodes.new("ShaderNodeAttribute")
        at.attribute_type = "GEOMETRY"
        at.attribute_name = "orig"
        at.location = tc.location + Vector((0, -220))
        for l in list(out.links):
            nt.links.new(at.outputs["Vector"], l.to_socket)    # remplace le lien de la position actuelle
floor.location.z = PLAT - 0.002

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None
if out:
    bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
    print("ENREGISTRÉ", out)
