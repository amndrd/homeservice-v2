"""Remplace les fleurs et l'herbe de l'îlot (« Îlot · Printemps », « Îlot · Prairie ») par celles de flore.py, aux mêmes
places : chaque fleur garde son emplacement et sa colonie, chaque touffe d'herbe sa place, sa hauteur et son penché (la
lisière penche vers le dehors). Une colonie sur quatre passe aux espèces nouvelles (trèfle, myosotis, campanule,
pissenlit) ; les fleurs isolées prennent une espèce au hasard. Le tout devient un seul maillage, « Îlot · Flore », avec
le vent de la scène (Geometry Nodes « Vent ») et la souplesse que le site anime.
Usage : Blender -b scène.blend --python blender/scripts/remplace_flore.py -- sortie.blend"""
import bpy, bmesh, math, random, sys
from mathutils import Vector
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())

Z = 1.197                                           # le sol plat (plat.py)
BLADES_PER_TUFT = (6, 9)                            # un peu moins que sur la planche : l'îlot entier reste léger
FLEUR = 1.35                                        # les fleurs de l'îlot, agrandies : de loin, des taches de couleur
TIGE_H = 0.78                                       # … mais leurs tiges un peu moins (elles ne cachent pas les objets)
BRIN_W = 1.6                                        # des brins plus larges : l'herbe couvre le sol
rnd = random.Random(2026)
OLD = ["Îlot · Printemps", "Îlot · Prairie"]
GRASS = {"brin_sombre": "brin_sombre", "brin_clair": "brin_clair", "brin_menthe": "brin_menthe",
         "herbe_sombre": "brin_sombre", "herbe_claire": "brin_clair", "mousse": "brin_menthe"}
KIND = {"coquelicot": "coquelicot", "bleuet": "bleuet", "marguerite": "marguerite", "bouton_or": "bouton_or",
        "lavande": "lavande", "rose": "eglantine",
        "orange": "pissenlit", "blanc": "marguerite", "jaune": "bouton_or", "lilas": "campanule", "corail": "coquelicot"}
NEW = ["trefle", "myosotis", "campanule", "pissenlit"]


def matkey(name):
    n = name.split("· ")[-1].split(".")[0]
    return n.replace("fleur_", "")


# ------------------------------------------------------------------ relevé de l'existant
flowers, blades = [], []
for name in OLD:
    o = bpy.data.objects.get(name)
    if not o:
        continue
    mw = o.matrix_world
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.faces.ensure_lookup_table()
    mats = [matkey(m.name) for m in o.data.materials]
    seen = set()
    for f in bm.faces:
        if f.index in seen:
            continue
        comp, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        key = mats[comp[0].material_index]
        pts = [mw @ v.co for g in comp for v in g.verts]
        if key in GRASS and len(comp) == 1:                         # un brin : un triangle seul
            vs = sorted(pts, key=lambda p: p.z)
            base, tip = (vs[0] + vs[1]) / 2, vs[2]
            blades.append((base, tip, GRASS[key]))
        elif key in KIND and (len(comp) == 10 if name == "Îlot · Prairie" else len(comp) >= 8):   # une corolle
            # (dans la prairie d'ilot.py : 10 pétales en éventail ; ses cœurs, des boules de 20 faces, ne comptent pas)
            c = sum(pts, Vector()) / len(pts)
            flowers.append((c, KIND[key]))
    bm.free()
print("RELEVÉ", len(flowers), "fleurs,", len(blades), "brins")

# ------------------------------------------------------------------ les brins en touffes
kd = KDTree(len(blades))
for i, (b, t, k) in enumerate(blades):
    kd.insert(Vector((b.x, b.y, 0)), i)
kd.balance()
used, tufts = set(), []
for i, (b, t, k) in enumerate(blades):
    if i in used:
        continue
    group = [j for (_, j, _) in kd.find_range(Vector((b.x, b.y, 0)), 0.05) if j not in used]
    used.update(group)
    base = sum((blades[j][0] for j in group), Vector()) / len(group)
    lean = sum(((blades[j][1] - blades[j][0]) * Vector((1, 1, 0)) for j in group), Vector()) / len(group)
    h = sum(blades[j][1].z - blades[j][0].z for j in group) / len(group)
    kinds = [blades[j][2] for j in group]
    tufts.append((base, lean, h, max(set(kinds), key=kinds.count)))
print("TOUFFES", len(tufts))

# ------------------------------------------------------------------ les fleurs en colonies
fk = KDTree(len(flowers))
for i, (c, k) in enumerate(flowers):
    fk.insert(Vector((c.x, c.y, 0)), i)
fk.balance()
colony = [-1] * len(flowers)
n_col = 0
for i in range(len(flowers)):
    if colony[i] >= 0:
        continue
    stack, members = [i], []
    colony[i] = n_col
    while stack:
        a = stack.pop()
        members.append(a)
        for (_, j, _) in fk.find_range(Vector((flowers[a][0].x, flowers[a][0].y, 0)), 0.42):
            if colony[j] < 0:
                colony[j] = n_col
                stack.append(j)
    n_col += 1
sizes = [colony.count(c) for c in range(n_col)]
species = {}
for c in range(n_col):
    members = [i for i in range(len(flowers)) if colony[i] == c]
    if sizes[c] >= 3:                                              # une colonie : une espèce
        kinds = [flowers[i][1] for i in members]
        species[c] = NEW[(c // 4) % len(NEW)] if c % 4 == 3 else max(set(kinds), key=kinds.count)
print("COLONIES", sum(1 for s in sizes if s >= 3), "isolées", sum(1 for s in sizes if s < 3))

# ------------------------------------------------------------------ obstacles : les objets du tas
objs = [o for o in bpy.data.collections["Tas"].objects if o.type == "MESH"]
trees = [BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
         for o in objs]


def clear(p, r):
    """Rien d'un objet à moins de r m de p (on ne plante pas une fleur dans un carton)."""
    for t in trees:
        hit = t.find_nearest(p, r)
        if hit[0] is not None:
            return False
    return True


# ------------------------------------------------------------------ la nouvelle flore
B = Flore()
_ = flore_materials()
n_f = n_t = skipped = 0
for (base, lean, h, kind) in tufts:
    s = max(0.6, min(1.7, h / 0.2))
    out = lean.normalized() if lean.length > 0.06 * s else None
    rng_t = random.Random(rnd.random())
    touffe(B, Vector((base.x, base.y, Z)), s, rng_t, kind, tall=1.0, lean_out=out, blades=BLADES_PER_TUFT)
    n_t += 1
for i, (c, kind) in enumerate(flowers):
    foot = Vector((c.x, c.y, Z))
    sp = species.get(colony[i]) or rnd.choice(list(ESPECES))
    if not clear(Vector((c.x, c.y, Z + 0.25)), 0.11):
        skipped += 1
        continue
    ESPECES[sp](B, foot, rnd.uniform(0.85, 1.12) * FLEUR, random.Random(rnd.random()))
    n_f += 1
# quelques graminées dans le pré, là où l'herbe est déjà
for k in range(60):
    base, lean, h, kind = tufts[rnd.randrange(len(tufts))]
    graminee(B, Vector((base.x + 0.03, base.y, Z)), rnd.uniform(0.85, 1.1), random.Random(rnd.random()))
print("CONSTRUIT", n_f, "fleurs,", n_t, "touffes,", skipped, "fleurs écartées des objets")

root = bpy.data.objects.get("Îlot")
me = B.mesh("Îlot · Flore")
flore = bpy.data.objects.new("Îlot · Flore", me)
coll = bpy.data.collections["Îlot"]
coll.objects.link(flore)
if root:
    flore.parent = root
    flore.matrix_parent_inverse = root.matrix_world.inverted()
old_mods = None
for name in OLD:                                                  # le vent de la scène, comme les anciens
    o = bpy.data.objects.get(name)
    if o and old_mods is None:
        old_mods = [m for m in o.modifiers if m.type == "NODES"]
        for m in old_mods:
            nm = flore.modifiers.new(m.name, "NODES")
            nm.node_group = m.node_group
            for k in m.keys():
                try:
                    nm[k] = m[k]
                except Exception:
                    pass
for name in OLD:
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
print("FLORE", len(me.vertices), "sommets,", len(me.polygons), "faces")

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else None
if out:
    bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
    print("ENREGISTRÉ", out)
