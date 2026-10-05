"""Export de l'îlot pour le hero du site (models/ilot.glb, lu par js/hero.js).
Le sol a un matériau procédural que glTF ne transporte pas : sa couleur d'herbe est précalculée dans une texture vue
de dessus, et la distance au bord de l'herbe (linéaire, ±EDGE_FIELD m autour du bord ondulé) va dans le canal alpha :
le site en tire un bord net au pixel près, et fond tout ce qui est hors de l'herbe dans la couleur de la page.
Le vent n'est pas appliqué : l'herbe et les fougères partent au repos avec leur souplesse par sommet (attribut
_souplesse), que js/hero.js anime avec la même formule que vfx.py ; les brins gardent leur dégradé (couleur par
sommet). Les papillons partent avec leurs réglages (propriétés cx, cy, cz, rad, ph, sp : le site rejoue leurs
pilotes), le modèle d'aigrette aussi ; le pollen et les aigrettes sont recréés sur le site (particules).
Usage, sur une copie de hero.blend (le script modifie la scène) :
  Blender -b copie.blend --python blender/scripts/export_web.py"""
import bpy, os
import numpy as np

SITE = "/Users/amandindardenne/Desktop/homeservice"
OUT = os.path.join(SITE, "models", "ilot.glb")
TEX = 2048
EDGE_FIELD = 0.5           # la distance au bord est codée de -EDGE_FIELD (dehors) à +EDGE_FIELD (dedans), en m
SKIP = ("Vie · Pollen", "Vie · Aigrettes", "Vie · Brise", "Gabarit · pollen")

scene = bpy.context.scene
ground = bpy.data.objects["Îlot · Sol"]


def top_uv(o):
    """UV vue de dessus, sur l'emprise du sol."""
    me = o.data
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    x0, y0 = min(xs), min(ys)
    size = max(max(xs) - x0, max(ys) - y0)
    uv = me.uv_layers.new(name="dessus")
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - x0) / size, (co.y - y0) / size)


def bake(mat, socket, name):
    """Précalcule `socket` (couleur ou valeur) du matériau du sol dans une image, via une émission."""
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    keep = out.inputs["Surface"].links[0].from_socket
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(socket, em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    img = bpy.data.images.new(name, TEX, TEX, alpha=False, float_buffer=True)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    bpy.ops.object.select_all(action="DESELECT")
    ground.select_set(True)
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.bake(type="EMIT", margin=4)
    nt.links.new(keep, out.inputs["Surface"])
    nt.nodes.remove(em)
    nt.nodes.remove(tex)
    return np.array(img.pixels[:]).reshape(TEX, TEX, 4)


def bake_ground():
    mat = ground.data.materials[0]
    nt = mat.node_tree
    top_uv(ground)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    color = bake(mat, nt.nodes["Mix.001"].outputs["Result"], "_couleur")
    # le bord de l'herbe : la valeur continue avant le seuil (> 0 dans l'herbe), en champ linéaire autour du bord
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -EDGE_FIELD
    mr.inputs["From Max"].default_value = EDGE_FIELD
    nt.links.new(nt.nodes["Math.006"].outputs["Value"], mr.inputs["Value"])
    mask = bake(mat, mr.outputs["Result"], "_masque")
    nt.nodes.remove(mr)
    rgba = np.empty((TEX, TEX, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(color[..., :3], 0, 1) ** (1 / 2.2)       # linéaire → sRGB (approché) pour un PNG 8 bits
    rgba[..., 3] = np.clip(mask[..., 0], 0, 1)
    global MASK
    MASK = rgba[..., 3].copy()
    img = bpy.data.images.new("Îlot · sol (herbe)", TEX, TEX, alpha=True)
    img.pixels = rgba.ravel()
    path = os.path.join(bpy.app.tempdir, "ilot_sol.png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.colorspace_settings.name = "sRGB"
    # matériau exportable : couleur de l'herbe (alpha = bord), rugueux comme l'herbe de hero.blend
    web = bpy.data.materials.new("Îlot · sol (web)")
    web.use_nodes = True
    bsdf = next(n for n in web.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Specular IOR Level"].default_value = 0.2
    tex = web.node_tree.nodes.new("ShaderNodeTexImage")
    tex.image = img
    uvn = web.node_tree.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "dessus"
    web.node_tree.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
    web.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    ground.data.materials.clear()
    ground.data.materials.append(web)
    # seul le canal « dessus » part dans le glb
    for uv in list(ground.data.uv_layers):
        if uv.name != "dessus":
            ground.data.uv_layers.remove(uv)


def prune_outside(mask, names=("Îlot · Prairie", "Îlot · Fougères", "Îlot · Détails", "Îlot · Printemps")):
    """Retire les brins, fougères, fleurs et détails plantés hors de l'herbe : sur le site, ils flotteraient dans le
    blanc. Une plante peut être faite de plusieurs pièces (tige, corolle, cœur) : seules les pièces plantées dans le
    sol sont jugées, à leur pied, sur le masque précalculé ; une pièce en l'air (corolle, cœur) suit la tige la plus
    proche — une fleur penchée vers le blanc garde sa corolle."""
    import bmesh
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    me_g = ground.data
    xs = [v.co.x for v in me_g.vertices]
    ys = [v.co.y for v in me_g.vertices]
    x0, y0 = min(xs), min(ys)
    size = max(max(xs) - x0, max(ys) - y0)
    gt = BVHTree.FromPolygons([ground.matrix_world @ v.co for v in me_g.vertices], [tuple(p.vertices) for p in me_g.polygons])

    def inside(p):
        gx = (p.x - x0) / size * (TEX - 1)
        gy = (p.y - y0) / size * (TEX - 1)
        return 0 <= gx < TEX and 0 <= gy < TEX and mask[int(gy), int(gx)] >= 0.5

    for name in names:
        o = bpy.data.objects.get(name)
        if not o:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bm.verts.ensure_lookup_table()
        seen, pieces = set(), []
        for v in bm.verts:
            if v.index in seen:
                continue
            piece, stack = [], [v]
            seen.add(v.index)
            while stack:
                a = stack.pop()
                piece.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b.index not in seen:
                        seen.add(b.index)
                        stack.append(b)
            pts = [o.matrix_world @ q.co for q in piece]
            foot = min(pts, key=lambda q: q.z)
            hit = gt.ray_cast(Vector((foot.x, foot.y, foot.z + 5)), Vector((0, 0, -1)))
            planted = hit[0] is None or foot.z - hit[0].z < 0.05
            pieces.append((piece, pts, foot, planted))
        tops = KDTree(max(1, sum(1 for p in pieces if p[3])))
        keep_planted = []
        for piece, pts, foot, planted in pieces:
            if planted:
                keep_planted.append(inside(foot))
                tops.insert(max(pts, key=lambda q: q.z), len(keep_planted) - 1)
        tops.balance()
        drop = []
        for piece, pts, foot, planted in pieces:
            if planted:
                ok = inside(foot)
            elif keep_planted:
                ok = keep_planted[tops.find(foot)[1]]
            else:
                ok = True
            if not ok:
                drop += piece
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
        bm.to_mesh(o.data)
        bm.free()
        print("hors de l'herbe :", name, len(drop), "sommets retirés")


def export():
    keep = [o for o in bpy.data.collections["Îlot"].all_objects
            if o.type in ("MESH", "EMPTY") and not o.name.startswith(SKIP)]
    for o in keep:                                  # le modèle d'aigrette est rangé sous le sol : on le ramène
        if o.name.startswith("Gabarit · "):
            o.location = (0, 0, 0)
    keep += list(bpy.data.collections["Tas"].all_objects)
    bpy.ops.object.select_all(action="DESELECT")
    for o in keep:
        o.hide_set(False)
        o.select_set(True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_attributes=True,
                              export_animations=False, export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6, export_image_format="AUTO")
    print("export :", OUT, round(os.path.getsize(OUT) / 1e6, 2), "Mo,", len(keep), "objets")


MASK = None
bake_ground()
for o in bpy.data.collections["Îlot"].all_objects:    # au repos : le site anime le vent
    if o.type == "MESH" and o.data.attributes.get("souplesse"):
        for m in list(o.modifiers):
            o.modifiers.remove(m)
        o.data.attributes["souplesse"].name = "_souplesse"  # « _ » : attribut exporté tel quel
prune_outside(MASK)
export()
