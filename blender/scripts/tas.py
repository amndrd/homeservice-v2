"""Les objets des services, tombés sur l'îlot : nettoyage, jardinage, désencombrement, montage et livraison.
Les modèles viennent de homeservice-immersive/blender/services.blend (collection « Prototypes · sol fondu ») : les
groupes y sont découpés en objets (chaque carton, colis… avec son scotch, ses étiquettes), agrandis (×SCALE) et passés
en facettes.
Pas de simulation : la composition est écrite à la main (COMPO). Chaque objet a sa place, droit (seuls le balai et
la chaise sont couchés) ; un calcul l'aligne sur la surface qui est sous lui (pente du sol, dessus d'un carton) et
le pose, toute sa base au contact (lancer de rayons vers le bas, sur le sol et sur les objets déjà posés).
La prairie (herbe, fleurs, buissons, rochers…) est ensuite retirée sous les objets.
Chaque objet garde son service et son ordre d'arrivée (propriétés « service », « chute_ordre ») pour rejouer la chute
sur le site.
À exécuter après ilot.py et vfx.py, dans le même espace de noms : compose()."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler
from mathutils.bvhtree import BVHTree

SRC = "/Users/amandindardenne/Desktop/homeservice-immersive/blender/services.blend"
SRC_COLL = "Prototypes · sol fondu"
# objets de la scène du vide du site immersif (déjà à plat pour ceux qui se couchent, déjà renversé pour le pot)
VIDE = "/Users/amandindardenne/Desktop/homeservice-immersive/web/assets/vide.glb"
VIDE_ITEMS = [("Objet · brouette", "Brouette", "jardinage"), ("Objet · râteau", "Râteau", "jardinage"),
              ("Objet · pelle", "Pelle", "jardinage"), ("Objet · pot renversé", "Pot renversé", "jardinage"),
              ("Objet · échelle", "Échelle", "montage"), ("Objet · marteau", "Marteau", "montage")]
SIZE = {"Montage 1": 0.7, "Échelle": 0.7}          # retouches de taille, par objet
SCALE = 1.3
TAS = "Tas"
SINK = 0.015                                  # enfoncés d'un rien dans l'herbe : posés, pas collés dessus

# [objet racine, nom, service, copies, corps (préfixes des pièces qui deviennent des objets à part ; None : un seul
# objet), pièces écartées (préfixes)]
ITEMS = [
    ("Seau arrondi", "Seau", "nettoyage", 1, None, ()),
    ("Éponge", "Éponge", "nettoyage", 1, None, ()),
    ("Panneau sol glissant", "Panneau", "nettoyage", 1, None, ()),
    ("Pièce · Nettoyage · balai (proto)", "Balai", "nettoyage", 1, None, ()),
    ("Pulvérisateur (proto)", "Pulvérisateur", "nettoyage", 1, None, ()),
    ("Pièce · Jardinage · tondeuse", "Tondeuse", "jardinage", 1, None, ()),
    ("Pièce · Jardinage · taille-haie", "Taille-haie", "jardinage", 1, None, ()),
    ("Sac poubelle", "Sac poubelle", "desencombrement", 2, None, ()),
    ("Chaise retournée", "Chaise", "desencombrement", 1, None, ()),
    ("Pièce · Désencombrement · pile (proto)", "Carton", "desencombrement", 1, ("Carton ",), ()),
    ("Pièce · Service · Désencombrement (proto)", "Carton ouvert", "desencombrement", 1, None, ()),
    ("Pièce · Service · Montage (proto)", "Montage", "montage", 1, ("Caisse", "Corps visseuse"), ("Clé Allen",)),
    ("Pièce · Montage · tabouret (proto)", "Tabouret", "montage", 1, None, ()),
    ("Pièce · Livraison · colis (proto)", "Colis", "livraison", 2, ("Colis", "Petit colis"), ()),
    ("Diable (proto)", "Diable", "livraison", 1, None, ()),
    ("Plante porte (proto)", "Plante", "livraison", 1, None, ()),
    ("Pièce · Service · Livraison (proto)", "Sac de courses", "livraison", 1, None, ()),
]

# La composition, dans le repère de la caméra du hero : u vers la droite de l'image, v en s'éloignant (m), à partir
# du centre de l'îlot. [nom, u, v, cap (°), bascule autour de x (°), bascule autour de y (°)]. Les objets restent
# droits (seuls le balai et la chaise sont couchés) ; settle() les incline ensuite selon la pente du sol sous eux.
# Dans l'ordre de pose : ce qui porte d'abord, ce qui est porté ensuite.
COMPO = [
    # au fond à gauche : la brouette, le pot renversé
    ("Brouette", -1.9, 1.6, 118, 0, 0),
    ("Pot renversé", -1.2, 1.05, 20, 0, 0),
    ("Pelle", -0.75, -2.7, 15, 0, 0),
    # devant : le râteau, la pelle, l'échelle couchée dans l'herbe ; le marteau à droite
    ("Râteau", -2.7, -1.6, 118, 0, 0),
    ("Échelle", 1.5, -2.3, 28, 0, 0),
    ("Marteau", 2.6, -1.3, 75, 0, 0),
    # au centre, un peu en retrait : la caisse à outils, un carton avec l'éponge dessus
    ("Montage 1", 0.05, 0.98, 68, 0, 0),
    ("Carton 1", 1.0, 1.45, 38, 0, 0),
    ("Éponge", 1.0, 1.42, 15, 0, 0),
    ("Sac poubelle", -0.75, 0.95, 20, 0, 0),
    ("Carton ouvert", 1.55, 0.3, -28, 0, 0),
    ("Seau", -0.2, -0.35, 205, 0, 0),
    ("Montage 2", 0.95, -0.25, 120, 0, 0),
    # à gauche : le jardin
    ("Tondeuse", -2.45, 0.35, 58, 0, 0),
    ("Taille-haie", -1.75, -0.65, -32, 0, 0),
    ("Sac poubelle 2", -3.0, -0.3, 110, 0, 0),
    # à droite : la livraison
    ("Diable", 2.6, 0.75, -110, 0, 0),
    ("Colis 1", 1.55, -0.95, -20, 0, 0),
    ("Colis 2", 2.05, -0.25, 30, 0, 0),
    ("Colis 1 2", 3.05, -0.4, 52, 0, 0),
    ("Colis 2 2", 1.8, 1.45, 10, 0, 0),
    ("Plante", 3.1, 1.5, 140, 0, 0),
    # devant : la chaise couchée, le tabouret, le balai en travers
    ("Chaise", -1.05, -2.0, 30, 0, 90),
    ("Tabouret", 0.25, -2.3, 10, 0, 0),
    ("Pulvérisateur", 0.9, -2.05, 0, 0, 0),
    ("Balai", -0.2, -1.25, 28, "couché", 0),
    # derrière : cartons empilés, le sac de courses, le panneau
    ("Carton 2", 1.0, 2.5, 10, 0, 0),
    ("Carton 3", 1.75, 2.7, -15, 0, 0),
    ("Carton 4", 1.0, 2.5, 30, 0, 0),
    ("Sac de courses", 0.05, 2.25, -60, 0, 0),
    ("Panneau", -1.25, 1.9, 30, 0, 0),
]
CAM_AZ = math.radians(-28)                    # azimut de la caméra du hero (cf. cadrage dans hero.blend)
RIGHT = Vector((math.cos(CAM_AZ), -math.sin(CAM_AZ)))
AWAY = Vector((math.sin(CAM_AZ), math.cos(CAM_AZ)))
CENTER = Vector((0.0, 0.1))
SPREAD, SHIFT = (1.2, 1.15), -0.75             # écartement de la composition, et recul vers la caméra (m)


def tas_coll():
    c = bpy.data.collections.get(TAS)
    if c is None:
        c = bpy.data.collections.new(TAS)
        bpy.context.scene.collection.children.link(c)
    return c


def clear():
    c = bpy.data.collections.get(TAS)
    if c:
        for o in list(c.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)


def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx


def split_groups(meshes, bodies):
    """Chaque corps devient un objet ; chaque détail (scotch, étiquette, vis…) rejoint le corps le plus proche."""
    groups = {o.name: [o] for o in meshes if any(o.name.startswith(b) for b in bodies)}
    for o in meshes:
        if o.name in groups:
            continue
        c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
        best, bd = None, 1e9
        for name, g in groups.items():
            mn, mx = bbox(g[:1])
            q = Vector((min(max(c.x, mn.x), mx.x), min(max(c.y, mn.y), mx.y), min(max(c.z, mn.z), mx.z)))
            if (q - c).length < bd:
                best, bd = name, (q - c).length
        groups[best].append(o)
    return list(groups.values())


def build(objs, name, dg):
    """Fusionne des objets (modificateurs appliqués) en un seul maillage, origine au centre, agrandi, en facettes."""
    mats, bm = [], bmesh.new()
    mn, mx = bbox(objs)
    center = (mn + mx) / 2
    for o in objs:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
        me.transform(Matrix.Translation(-center) @ o.matrix_world)
        remap = []
        for m in me.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for p in me.polygons:
            p.material_index = remap[p.material_index] if remap else 0
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    bmesh.ops.scale(bm, vec=(SCALE, SCALE, SCALE), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    o = bpy.data.objects.new(name, me)
    tas_coll().objects.link(o)
    return o


def import_objects():
    """Importe les modèles, les découpe et les fusionne ; rend {nom: objet}."""
    clear()
    scene = bpy.context.scene
    with bpy.data.libraries.load(SRC, link=False) as (src, dst):
        dst.collections = [SRC_COLL]
    lib = dst.collections[0]
    scene.collection.children.link(lib)
    dg = bpy.context.evaluated_depsgraph_get()
    by_name = {o.name: o for o in lib.all_objects}
    made = {}
    for root_name, name, service, copies, bodies, skip in ITEMS:
        root = by_name[root_name]
        meshes = [o for o in [root] + list(root.children_recursive)
                  if o.type == "MESH" and not any(o.name.startswith(k) for k in skip)]
        groups = split_groups(meshes, bodies) if bodies else [meshes]
        for gi, g in enumerate(groups):
            label = name if len(groups) == 1 else f"{name} {gi + 1}"
            for k in range(copies):
                lab = label if k == 0 else f"{label} {k + 1}"
                o = build(g, f"{lab} · {service}", dg) if k == 0 else made[label].copy()
                if k:
                    o.name = f"{lab} · {service}"
                    tas_coll().objects.link(o)
                o["service"] = service
                made[lab] = o
    for o in list(lib.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for c in [lib] + list(lib.children_recursive):
        bpy.data.collections.remove(c)
    # la scène du vide (glTF)
    tmp = bpy.data.collections.new("_import vide")
    scene.collection.children.link(tmp)
    lc = bpy.context.view_layer.layer_collection.children[tmp.name]
    prev = bpy.context.view_layer.active_layer_collection
    bpy.context.view_layer.active_layer_collection = lc
    bpy.ops.import_scene.gltf(filepath=VIDE)
    bpy.context.view_layer.active_layer_collection = prev
    dg = bpy.context.evaluated_depsgraph_get()
    vide = {o.name: o for o in tmp.all_objects}
    for node, name, service in VIDE_ITEMS:
        root = vide[node]
        meshes = [o for o in [root] + list(root.children_recursive) if o.type == "MESH"]
        o = build(meshes, f"{name} · {service}", dg)
        o["service"] = service
        made[name] = o
    for o in list(tmp.all_objects):
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.data.collections.remove(tmp)
    for label, k in SIZE.items():
        if label in made:
            made[label].data.transform(Matrix.Scale(k, 4))
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    return made


def bvh(o):
    """Arbre de lancer de rayons de l'objet, dans le repère de la scène (FromObject resterait en repère local)."""
    me = o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    mw = o.matrix_world
    tree = BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return tree


def surface_z(trees, x, y):
    best = None
    for t in trees:
        hit = t.ray_cast(Vector((x, y, 60.0)), Vector((0, 0, -1)))
        if hit[0] is not None and (best is None or hit[0].z > best):
            best = hit[0].z
    return 0.0 if best is None else best


def bottom(o, frac=0.12):
    """Les sommets du dessous de l'objet (dans la tranche basse de sa hauteur), en coordonnées de la scène."""
    mw = o.matrix_world
    pts = [mw @ v.co for v in o.data.vertices]
    lo = min(p.z for p in pts)
    hi = max(p.z for p in pts)
    low = [p for p in pts if p.z < lo + max(0.02, (hi - lo) * frac)]
    return low if len(low) >= 3 else sorted(pts, key=lambda p: p.z)[:8]


def fit_normal(pts):
    """Normale du plan z = a·x + b·y + c ajusté aux points (moindres carrés)."""
    n = len(pts)
    mx = sum(p.x for p in pts) / n
    my = sum(p.y for p in pts) / n
    mz = sum(p.z for p in pts) / n
    sxx = sum((p.x - mx) ** 2 for p in pts)
    syy = sum((p.y - my) ** 2 for p in pts)
    sxy = sum((p.x - mx) * (p.y - my) for p in pts)
    sxz = sum((p.x - mx) * (p.z - mz) for p in pts)
    syz = sum((p.y - my) * (p.z - mz) for p in pts)
    det = sxx * syy - sxy * sxy
    if abs(det) < 1e-9:
        return Vector((0, 0, 1))
    a = (sxz * syy - syz * sxy) / det
    b = (syz * sxx - sxz * sxy) / det
    return Vector((-a, -b, 1)).normalized()


MAX_TILT = math.radians(28)                   # au-delà, la pente serait trop forte pour qu'un objet y tienne


def lay_flat(o):
    """Orientation d'un objet long couché à plat (le balai) : son axe principal (le manche) à l'horizontale, la
    largeur de sa tête à l'horizontale, son épaisseur à la verticale — quelle que soit la pose du modèle d'origine
    (le balai était penché dans son diorama). Calculé sur les sommets (analyse en composantes principales)."""
    import numpy as np
    P = np.array([v.co[:] for v in o.data.vertices])
    P = P - P.mean(axis=0)
    _, vec = np.linalg.eigh(np.cov(P.T))
    a = vec[:, 2]                                   # le plus long : le manche
    t = P @ a
    ends = [P[t > np.percentile(t, 85)], P[t < np.percentile(t, 15)]]
    spread = [np.linalg.norm(e - e.mean(axis=0), axis=1).mean() for e in ends]
    head = ends[int(np.argmax(spread))]             # la tête : le bout le plus large
    if spread[1] > spread[0]:
        a = -a                                      # a pointe vers la tête
    h = head - head.mean(axis=0)
    h = h - np.outer(h @ a, a)                      # dans le plan perpendiculaire au manche
    _, hv = np.linalg.eigh(np.cov(h.T))
    w = hv[:, 2] - (hv[:, 2] @ a) * a
    w /= np.linalg.norm(w)
    d = np.cross(a, w)
    # (a, w, d) du modèle → (x, y, z) de la scène : manche le long de x, tête à plat
    M = Matrix((a.tolist(), w.tolist(), d.tolist()))
    return M.to_4x4()


def end_contact(o, trees, axis_dir):
    """Couché, un objet long touche le sol par ses deux bouts : on le bascule autour de l'axe horizontal
    perpendiculaire à sa longueur jusqu'à ce que les deux extrémités aient le même jeu, puis on le descend."""
    side = Vector((-axis_dir.y, axis_dir.x, 0)).normalized()
    for _ in range(5):
        mw = o.matrix_world
        pts = [mw @ v.co for v in o.data.vertices]
        c = o.matrix_world.translation
        proj = [(p - c).dot(axis_dir) for p in pts]
        L = max(proj) - min(proj)
        hi = [p for p, t in zip(pts, proj) if t > max(proj) - L * 0.15]
        lo = [p for p, t in zip(pts, proj) if t < min(proj) + L * 0.15]
        gh = min(p.z - surface_z(trees, p.x, p.y) for p in hi)
        gl = min(p.z - surface_z(trees, p.x, p.y) for p in lo)
        ang = math.atan2(gh - gl, L * 0.85)
        R_ = Matrix.Rotation(ang, 4, side)
        o.matrix_world = Matrix.Translation(c) @ R_ @ Matrix.Translation(-c) @ o.matrix_world
        bpy.context.view_layer.update()
    gaps = [p.z - surface_z(trees, p.x, p.y) for p in (o.matrix_world @ v.co for v in o.data.vertices)]
    o.location.z -= min(gaps) + SINK * 0.5
    bpy.context.view_layer.update()


def settle(o, xy, yaw, tx, ty, trees):
    """Oriente l'objet, l'aligne sur la surface qui est sous lui (sol en pente, dessus d'un carton…), puis le pose :
    toute sa base au contact, pas un seul point. tx = « couché » : objet long couché à plat, ses deux bouts au sol."""
    if tx == "couché":
        trees = trees[:1]                           # couché à même le sol : ses deux bouts dans l'herbe
        base = Matrix.Rotation(math.radians(yaw), 4, "Z") @ lay_flat(o)
        o.matrix_world = Matrix.Translation((xy.x, xy.y, 0.0)) @ base
        bpy.context.view_layer.update()
        gaps = [p.z - surface_z(trees, p.x, p.y) for p in (o.matrix_world @ v.co for v in o.data.vertices)]
        o.location.z -= min(gaps)
        bpy.context.view_layer.update()
        end_contact(o, trees, Vector((math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0)))
        return
    base = Euler((math.radians(tx), math.radians(ty), math.radians(yaw))).to_matrix().to_4x4()
    o.matrix_world = Matrix.Translation((xy.x, xy.y, 0.0)) @ base
    bpy.context.view_layer.update()
    # la surface sous la base : sa pente. Si une partie de la base repose sur un objet, seule cette partie compte
    # (une caisse qui dépasse d'un carton ne se règle pas sur le sol en contrebas)
    def support(pts):
        on_obj = [p for p in pts if surface_z(trees[1:], p.x, p.y) > surface_z(trees[:1], p.x, p.y) + 0.05]
        return on_obj if len(on_obj) >= 3 else pts

    under = [Vector((p.x, p.y, surface_z(trees, p.x, p.y))) for p in support(bottom(o))]
    n = fit_normal(under)
    ang = n.angle(Vector((0, 0, 1)))
    if ang > MAX_TILT:
        n = Vector((0, 0, 1)).slerp(n, MAX_TILT / ang)
    tilt = Vector((0, 0, 1)).rotation_difference(n).to_matrix().to_4x4()
    o.matrix_world = Matrix.Translation((xy.x, xy.y, 0.0)) @ tilt @ base
    bpy.context.view_layer.update()
    # descente : la base épouse la surface ; quelques sommets s'enfoncent à peine (l'herbe les cache)
    gaps = sorted(surface_z(trees, p.x, p.y) - p.z for p in support(bottom(o)))
    dz = gaps[int(len(gaps) * 0.8)]
    o.location.z += dz - SINK
    bpy.context.view_layer.update()


def clear_meadow(objs):
    """Retire de la prairie ce qui pousserait à travers les objets : chaque touffe, fleur, buisson… dont un objet
    couvre le centre. Un buisson est fait de plusieurs pièces (feuillage, baies) : les pièces voisines d'une pièce
    retirée partent avec elle, sinon des baies resteraient en l'air."""
    trees = [bvh(o) for o in objs]
    for name in ("Îlot · Prairie", "Îlot · Fougères", "Îlot · Buissons", "Îlot · Détails"):
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        seen, parts = set(), []
        for v0 in bm.verts:
            if v0.index in seen:
                continue
            part, stack = [], [v0]
            seen.add(v0.index)
            while stack:                                 # une pièce : sommets reliés entre eux
                v = stack.pop()
                part.append(v)
                for e in v.link_edges:
                    w = e.other_vert(v)
                    if w.index not in seen:
                        seen.add(w.index)
                        stack.append(w)
            c = sum((v.co for v in part), Vector()) / len(part)
            parts.append((part, c, min(v.co.z for v in part)))
        doomed = []
        for part, c, low in parts:
            for t in trees:
                if t.ray_cast(Vector((c.x, c.y, low - 0.05)), Vector((0, 0, 1)), 4.0)[0] is not None:
                    doomed.append(c)
                    break
        if name in ("Îlot · Buissons", "Îlot · Détails"):
            near = [c for _, c, _ in parts if any((c.xy - d.xy).length < 0.45 for d in doomed)]
            doomed += near
        dead = {id(c) for c in doomed}
        geom = [v for part, c, _ in parts if id(c) in dead for v in part]
        bmesh.ops.delete(bm, geom=geom, context="VERTS")
        bm.to_mesh(ob.data)
        bm.free()


def shrunk_tree(o, tol=0.03):
    """L'objet légèrement rétréci (tol, m) : deux objets simplement posés l'un sur l'autre ne se « touchent » plus."""
    c = o.matrix_world.translation
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    pts = [c + (p - c) * (1 - tol / max(0.05, (p - c).length)) for p in pts]
    return BVHTree.FromPolygons(pts, [tuple(p.vertices) for p in o.data.polygons])


def overlaps(objs, tol=0.03):
    """Les paires d'objets qui s'interpénètrent (au-delà d'un simple contact)."""
    out = []
    shrunk = {o.name: shrunk_tree(o, tol) for o in objs}
    names = [o.name for o in objs]
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            if shrunk[a].overlap(shrunk[b]):
                out.append((a.split(" · ")[0], b.split(" · ")[0]))
    return out


def compose():
    made = import_objects()
    ground = bvh(bpy.data.objects["Îlot · Sol"])
    placed = []
    for i, (name, u, v, yaw, tx, ty) in enumerate(COMPO):
        o = made.pop(name)
        xy = CENTER + RIGHT * (u * SPREAD[0]) + AWAY * (v * SPREAD[1] + SHIFT)
        trees = [ground] + [bvh(p) for p in placed]
        settle(o, xy, yaw, tx, ty, trees)
        # tout l'objet doit tenir sur l'herbe, sans entrer dans un autre : sinon on cherche la place libre la plus
        # proche, en spirale autour de l'endroit voulu (en restant du côté du centre de l'îlot si possible)
        others = [shrunk_tree(p) for p in placed]

        def ok():
            if min(grass_mask(p.x, p.y) for p in (o.matrix_world @ v.co for v in o.data.vertices)) < 0.15:
                return False
            mine = shrunk_tree(o)
            return not any(mine.overlap(t) for t in others)

        if not ok():
            inward = (CENTER - xy).normalized()
            tries = [(r, a) for r in (0.15, 0.3, 0.45, 0.6, 0.8, 1.0, 1.25, 1.5, 1.8, 2.2) for a in range(12)]
            for r, a in tries:
                ang = math.atan2(inward.y, inward.x) + (a + 1) // 2 * (1 if a % 2 else -1) * math.tau / 12
                settle(o, xy + Vector((math.cos(ang), math.sin(ang))) * r, yaw, tx, ty, trees)
                if ok():
                    break
            else:
                print("pas de place libre pour", name)
        o["chute_ordre"] = i
        placed.append(o)
    for o in made.values():                             # ce qui n'a pas de place dans la composition
        bpy.data.objects.remove(o, do_unlink=True)
    clear_meadow(placed)
    print("tas :", len(placed), "objets posés", "; non placés :", list(made))
    print("chevauchements :", overlaps(placed) or "aucun")
    return placed
