"""La caisse à outils (« Montage 1 · montage ») refaite d'après une caisse en plastique du commerce : cuve et couvercle
aux arêtes chanfreinées, bande au joint, nervures verticales, deux fermoirs à pastille, deux compartiments à
couvercle clair sur le dessus, poignée en U au centre, languette du couvercle devant. Facettes plates, comme les
autres objets. La caisse garde sa place, son gabarit (0,82 × 0,60 m) et son dessous (posée au même endroit) ; seul
son maillage change. L'avant (fermoirs, languette) est en -y, face à la caméra du hero.
Usage : Blender -b scène.blend --python blender/scripts/caisse.py -- [palette] [sortie.blend]"""
import bpy, bmesh, sys
from mathutils import Vector, Matrix

NAME = "Montage 1 · montage"
# [rôle : (couleur linéaire, rugosité)]
PALETTES = {
    # la caisse de la référence : noire, poignée et fermoirs rouges, couvercles gris clair
    "noire": {"corps": ((0.022, 0.025, 0.03), 0.55), "joint": ((0.012, 0.014, 0.017), 0.6),
              "accent": ((0.62, 0.03, 0.02), 0.45), "clair": ((0.5, 0.53, 0.57), 0.25), "creux": ((0.006, 0.007, 0.009), 0.7)},
    # dans les couleurs de la caisse actuelle : rouge, poignée et fermoirs anthracite
    "rouge": {"corps": ((0.644, 0.067, 0.042), 0.6), "joint": ((0.397, 0.036, 0.02), 0.6),
              "accent": ((0.025, 0.033, 0.047), 0.6), "clair": ((0.5, 0.53, 0.57), 0.25), "creux": ((0.14, 0.012, 0.008), 0.7)},
}
ROLES = ["corps", "joint", "accent", "clair", "creux"]

Z0 = -0.259                 # dessous de la caisse (repère de l'objet) : inchangé, elle reste posée


def part(bm, center, half, role, bevel=0.006, taper=None):
    """Un bloc chanfreiné : centre, demi-tailles, rôle (matériau). taper : demi-tailles du dessous (cuve évasée)."""
    before = set(bm.faces)
    r = bmesh.ops.create_cube(bm, size=1.0)
    vs = r["verts"]
    for v in vs:
        h = half
        if taper and v.co.z < 0:
            h = (taper[0], taper[1], half[2])
        v.co = Vector((v.co.x * 2 * h[0], v.co.y * 2 * h[1], v.co.z * 2 * h[2])) + Vector(center)
    if bevel > 0:
        edges = list({e for v in vs for e in v.link_edges})
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=1, affect="EDGES", clamp_overlap=True)
    # toute la pièce dans sa couleur, chanfreins compris (les faces du biseau n'héritent pas du matériau)
    for f in set(bm.faces) - before:
        f.material_index = ROLES.index(role)
    return vs


def build():
    bm = bmesh.new()
    zt = 0.03                                         # joint entre la cuve et le couvercle
    # la cuve, un peu évasée vers le haut, sur un socle en retrait
    part(bm, (0, 0, Z0 + 0.008), (0.355, 0.24, 0.008), "joint", bevel=0.004)
    part(bm, (0, 0, (Z0 + 0.012 + zt) / 2), (0.386, 0.274, (zt - Z0 - 0.012) / 2), "corps", bevel=0.014,
         taper=(0.366, 0.254))
    # rebord haut de la cuve, puis bande du couvercle qui le déborde
    part(bm, (0, 0, zt - 0.012), (0.393, 0.281, 0.014), "corps", bevel=0.006)
    part(bm, (0, 0, zt + 0.016), (0.404, 0.292, 0.016), "joint", bevel=0.007)
    # le couvercle, chanfrein large sur le dessus
    part(bm, (0, 0, zt + 0.067), (0.39, 0.279, 0.036), "corps", bevel=0.02)
    ztop = zt + 0.103
    # nervures verticales, de part et d'autre de chaque fermoir, devant et derrière
    for x in (-0.33, -0.17, 0.17, 0.33):
        for s in (-1, 1):
            part(bm, (x, s * 0.276, (Z0 + 0.02 + ztop - 0.012) / 2), (0.013, 0.014, (ztop - 0.012 - Z0 - 0.02) / 2),
                 "corps", bevel=0.004)
    # sangles des nervures sur le dessus du couvercle
    for x in (-0.17, 0.17):
        part(bm, (x, 0, ztop - 0.004), (0.013, 0.282, 0.008), "corps", bevel=0.004)
    # fermoirs : une plaque à cheval sur le joint, avec sa pastille en creux
    for x in (-0.25, 0.25):
        for s in (-1, 1):
            part(bm, (x, s * 0.296, zt + 0.012), (0.05, 0.009, 0.068), "accent", bevel=0.005)
            part(bm, (x, s * 0.305, zt + 0.03), (0.03, 0.003, 0.026), "creux", bevel=0.002)
            for k in range(3):                        # stries du bas du fermoir
                part(bm, (x, s * 0.305, zt - 0.03 - k * 0.012), (0.04, 0.002, 0.003), "accent", bevel=0.0)
    # languette du couvercle, au milieu devant
    part(bm, (0, -0.292, zt + 0.045), (0.075, 0.016, 0.034), "corps", bevel=0.006)
    part(bm, (0, -0.302, zt + 0.02), (0.05, 0.008, 0.01), "joint", bevel=0.003)
    # les deux compartiments du dessus, aux extrémités : un cadre, et son couvercle clair
    for s in (-1, 1):
        cx = s * 0.285
        part(bm, (cx, 0, ztop + 0.014), (0.1, 0.25, 0.016), "corps", bevel=0.008)
        part(bm, (cx, 0, ztop + 0.031), (0.086, 0.232, 0.004), "clair", bevel=0.003)
        part(bm, (cx + s * 0.07, -0.248, ztop + 0.016), (0.02, 0.006, 0.01), "clair", bevel=0.002)   # sa patte
    # le creux du milieu, où la poignée se couche
    part(bm, (0, 0.02, ztop - 0.003), (0.13, 0.09, 0.006), "creux", bevel=0.003)
    # la poignée en U : deux montants et une prise, avec ses rainures
    hz = ztop + 0.115
    for x in (-0.135, 0.135):
        part(bm, (x, 0.02, (ztop + hz) / 2), (0.02, 0.03, (hz - ztop) / 2), "accent", bevel=0.006)
        part(bm, (x, 0.02, ztop + 0.006), (0.032, 0.042, 0.008), "accent", bevel=0.004)   # sa charnière
    part(bm, (0, 0.02, hz), (0.155, 0.032, 0.017), "accent", bevel=0.008)
    for k in range(-3, 4):
        part(bm, (k * 0.03, 0.02, hz + 0.0175), (0.006, 0.026, 0.0015), "accent", bevel=0.0)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return bm


def materials(pal):
    mats = []
    for role in ROLES:
        name = f"Caisse · {role}"
        m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        col, rough = PALETTES[pal][role]
        b.inputs["Base Color"].default_value = (*col, 1.0)
        b.inputs["Roughness"].default_value = rough
        mats.append(m)
    return mats


def apply(pal="noire"):
    o = bpy.data.objects[NAME]
    bm = build()
    me = bpy.data.meshes.new(NAME)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = False
    for m in materials(pal):
        me.materials.append(m)
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    print("CAISSE", pal, len(me.vertices), "sommets", tuple(round(d, 3) for d in o.dimensions))


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    apply(args[0] if args else "noire")
    if len(args) > 1:
        bpy.ops.wm.save_as_mainfile(filepath=args[1], copy=True)
        print("ENREGISTRÉ", args[1])
