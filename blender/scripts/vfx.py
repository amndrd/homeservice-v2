"""Effets de vie autour de l'îlot, animés : l'herbe, les fleurs et les fougères qui ondulent sous la brise, pollen
lumineux en suspension, aigrettes de pissenlit portées par le vent, papillons qui battent des ailes. Tout bouge avec le temps (frame / 24) : particules, petits pilotes (drivers).
À exécuter après ilot.py, dans le même espace de noms :
    ns = {}; exec(open('blender/scripts/ilot.py').read(), ns); exec(open('blender/scripts/vfx.py').read(), ns)"""
import bpy, bmesh, math, random
from mathutils import Vector

R_VFX = random.Random(1234)
FPS = 24

for o in list(coll.objects):
    if o.name.startswith(("Vie · ", "Gabarit · ")):
        bpy.data.objects.remove(o, do_unlink=True)


def col(h):
    return (*srgb(h), 1)


def driver(o, path, idx, expr):
    d = o.driver_add(path, idx).driver
    d.type = "SCRIPTED"
    d.expression = expr


def mat_fade(name, hexcol, alpha=1.0, emit=0.0, fade_in=0.15, fade_out=0.5):
    """Particules : s'allument puis s'éteignent au fil de leur vie (Particle Info)."""
    m = bpy.data.materials.get("Vie · " + name) or bpy.data.materials.new("Vie · " + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    pi = nt.nodes.new("ShaderNodeParticleInfo")

    def math_(op, a, b):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, bpy.types.NodeSocket):
                nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    def smooth(v, a, b):
        n = nt.nodes.new("ShaderNodeMapRange"); n.interpolation_type = "SMOOTHSTEP"; n.clamp = True
        nt.links.new(v, n.inputs["Value"])
        n.inputs["From Min"].default_value, n.inputs["From Max"].default_value = a, b
        return n.outputs["Result"]

    life = math_("DIVIDE", pi.outputs["Age"], math_("MAXIMUM", pi.outputs["Lifetime"], 1.0))
    a = math_("MULTIPLY", smooth(life, 0.0, fade_in), math_("SUBTRACT", 1.0, smooth(life, 1 - fade_out, 1.0)))
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = col(hexcol)
    b.inputs["Emission Color"].default_value = col(hexcol)
    b.inputs["Emission Strength"].default_value = emit
    b.inputs["Roughness"].default_value = 0.4
    nt.links.new(math_("MULTIPLY", a, alpha), b.inputs["Alpha"])
    nt.links.new(b.outputs[0], out.inputs[0])
    m.diffuse_color = col(hexcol)
    return m


def gabarit(name, bm, material):
    """Modèle d'une particule, rangé sous le sol : seules ses copies se voient."""
    o = obj("Gabarit · " + name, bm, [material], root)
    o.location = (0, 0, -60)
    o.visible_shadow = False
    return o


def volume_emitter(name, center, radius, squash=1.0):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=radius)
    for v in bm.verts:
        v.co.z *= squash
    o = obj("Vie · " + name, bm, [], root)
    o.location = center
    o.show_instancer_for_render = False
    o.show_instancer_for_viewport = False
    return o


def particles(o, inst, count, life, size, size_rand=0.5, gravity=0.0, brown=0.0, drag=0.0, start=-240, end=400):
    mod = o.modifiers.new("Particules", "PARTICLE_SYSTEM")
    st = mod.particle_system.settings
    st.count = count
    st.frame_start, st.frame_end = start, end
    st.lifetime, st.lifetime_random = life, 0.45
    st.emit_from = "VOLUME"
    st.normal_factor = 0.0
    st.factor_random = 0.02
    st.render_type = "OBJECT"
    st.instance_object = inst
    st.particle_size = size
    st.size_random = size_rand
    st.effector_weights.gravity = gravity
    st.brownian_factor = brown
    st.drag_factor = drag
    mod.particle_system.seed = R_VFX.randint(0, 999)
    return st


# ------------------------------------------------------------- la brise : elle porte les aigrettes (et un peu le pollen)
bpy.ops.object.effector_add(type="WIND", location=(-6, -2, 1.5),
                            rotation=(0, math.radians(90), math.radians(20)))   # souffle vers +x, un rien vers l'arrière
brise = bpy.context.active_object
brise.name = "Vie · Brise"
for c_ in list(brise.users_collection):
    c_.objects.unlink(brise)
coll.objects.link(brise)
brise.parent = root
brise.field.strength = 0.25
brise.field.flow = 0.3
brise.field.noise = 0.4

# ------------------------------------------------------------- l'herbe ondule sous la brise
# Chaque sommet a une souplesse (0 au pied, 1 à 30 cm au-dessus du sol) : les pointes plient, les pieds restent.
# Des vagues de vent traversent la prairie dans le sens de la brise, modulées par des rafales (bruit qui dérive) et
# un frémissement propre à chaque brin. Geometry Nodes : même calcul à reprendre tel quel dans un vertex shader.
VENT = {"dir": math.radians(20), "amp": 0.075, "vague": 1.5, "vitesse": 2.1, "rafale": 0.35, "fremi": 0.12}


def set_flex(o, reach=0.3):
    me = o.data
    at = me.attributes.get("souplesse") or me.attributes.new("souplesse", "FLOAT", "POINT")
    for v in me.vertices:
        h = v.co.z - gz(v.co.x, v.co.y)
        at.data[v.index].value = max(0.0, min(1.0, h / reach)) ** 1.6


def wind_group():
    ng = bpy.data.node_groups.get("Vent") or bpy.data.node_groups.new("Vent", "GeometryNodeTree")
    ng.nodes.clear()
    ng.interface.clear()
    ng.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    N, L = ng.nodes, ng.links
    gi, go = N.new("NodeGroupInput"), N.new("NodeGroupOutput")
    setp = N.new("GeometryNodeSetPosition")
    L.new(gi.outputs[0], setp.inputs["Geometry"]); L.new(setp.outputs[0], go.inputs[0])
    flex = N.new("GeometryNodeInputNamedAttribute"); flex.data_type = "FLOAT"; flex.inputs["Name"].default_value = "souplesse"
    pos = N.new("GeometryNodeInputPosition")
    T = N.new("GeometryNodeInputSceneTime").outputs["Seconds"]
    sep_ = N.new("ShaderNodeSeparateXYZ"); L.new(pos.outputs[0], sep_.inputs[0])
    sep = sep_.outputs

    def m(op, a, b=None):
        n = N.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                L.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    dx, dy = math.cos(VENT["dir"]), math.sin(VENT["dir"])
    along = m("ADD", m("MULTIPLY", sep[0], dx), m("MULTIPLY", sep[1], dy))
    # vague qui avance avec le vent (0 à 1)
    wave = m("ADD", 0.5, m("MULTIPLY", 0.5, m("SINE", m("SUBTRACT", m("MULTIPLY", along, VENT["vague"]),
                                                                      m("MULTIPLY", T, VENT["vitesse"])))))
    # rafales : un bruit large qui dérive dans le sens du vent
    drift = N.new("ShaderNodeCombineXYZ")
    L.new(m("SUBTRACT", sep[0], m("MULTIPLY", T, VENT["rafale"] * dx)), drift.inputs[0])
    L.new(m("SUBTRACT", sep[1], m("MULTIPLY", T, VENT["rafale"] * dy)), drift.inputs[1])
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 0.35; nz.inputs["Detail"].default_value = 1.0
    L.new(drift.outputs[0], nz.inputs["Vector"])
    gust = N.new("ShaderNodeMapRange"); gust.clamp = True
    gust.inputs["From Min"].default_value, gust.inputs["From Max"].default_value = 0.35, 0.65
    gust.inputs["To Min"].default_value = 0.3
    L.new(nz.outputs["Fac"], gust.inputs["Value"])
    # frémissement : chaque brin a sa phase
    flutter = m("MULTIPLY", VENT["fremi"], m("SINE", m("ADD", m("MULTIPLY", T, 6.5),
                                                       m("MULTIPLY", m("ADD", sep[0], m("MULTIPLY", sep[1], 1.7)), 23.0))))
    strength = m("ADD", m("ADD", 0.15, m("MULTIPLY", 0.85, m("MULTIPLY", wave, gust.outputs["Result"]))), flutter)
    k = m("MULTIPLY", m("MULTIPLY", strength, flex.outputs["Attribute"]), VENT["amp"])
    off = N.new("ShaderNodeCombineXYZ")
    L.new(m("MULTIPLY", k, dx), off.inputs[0])
    L.new(m("MULTIPLY", k, dy), off.inputs[1])
    L.new(m("MULTIPLY", m("ABSOLUTE", k), -0.35), off.inputs[2])      # en pliant, la pointe s'abaisse un peu
    L.new(off.outputs[0], setp.inputs["Offset"])
    return ng


vent = wind_group()
for name, reach in (("Îlot · Prairie", 0.3), ("Îlot · Fougères", 0.4)):
    o = bpy.data.objects[name]
    set_flex(o, reach)
    for md in [md for md in o.modifiers if md.name == "Vent"]:
        o.modifiers.remove(md)
    o.modifiers.new("Vent", "NODES").node_group = vent

# ------------------------------------------------------------- pollen : points de lumière tiède, en suspension
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
pollen = gabarit("pollen", bm, mat_fade("pollen", "#fff2c2", 1.0, 3.0, 0.2, 0.3))
em = volume_emitter("Pollen", Vector((0.0, 0.0, 1.5)), 4.6, 0.4)
st = particles(em, pollen, 260, 220, 0.011, 0.6, gravity=0.0, brown=0.04, drag=0.6)
st.effector_weights.wind = 0.15

# ------------------------------------------------------------- aigrettes de pissenlit : une tige, une graine, un
# parasol de filaments ; elles montent à peine, dérivent avec la brise et tournent lentement sur elles-mêmes
bm = bmesh.new()
L = 1.0                                             # modèle bâti le long de +x (axe que la particule aligne sur z)
for a in (0.0, math.tau / 3, 2 * math.tau / 3):     # tige : trois lames fines
    d = Vector((0, math.cos(a), math.sin(a))) * 0.025
    bm.faces.new((bm.verts.new(-d), bm.verts.new(d), bm.verts.new(Vector((L, 0, 0)) + d * 0.4)))
seed_ = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.07)    # la graine, au pied
for v in seed_["verts"]:
    v.co.x = v.co.x * 2.2 - 0.05
n_fil = 10
for k in range(n_fil):                              # parasol : filaments en étoile, légèrement relevés
    a = k / n_fil * math.tau
    d = Vector((0.0, math.cos(a), math.sin(a)))
    side = Vector((0.0, -math.sin(a), math.cos(a))) * 0.02
    tip = Vector((L + 0.18, 0, 0)) + d * 0.55
    base_ = Vector((L, 0, 0))
    bm.faces.new((bm.verts.new(base_ - side), bm.verts.new(base_ + side), bm.verts.new(tip)))
    ico_ = bmesh.ops.create_icosphere(bm, subdivisions=0, radius=0.035)
    for v in ico_["verts"]:
        v.co += tip
seeds = gabarit("aigrette", bm, mat_fade("aigrette", "#fbfaf4", 1.0, 0.6, 0.15, 0.25))
em = volume_emitter("Aigrettes", Vector((0.0, 0.0, 1.1)), 4.4, 0.35)
st = particles(em, seeds, 90, 260, 0.11, 0.35, gravity=-0.012, brown=0.12, drag=0.8, start=-300)
st.use_rotations = True
st.rotation_mode = "GLOB_Z"                         # debout, le parasol vers le ciel
st.phase_factor_random = 2.0
st.angular_velocity_mode = "GLOBAL_Z"              # tournoie autour de la verticale
st.angular_velocity_factor = 0.5
st.effector_weights.wind = 1.0

# ------------------------------------------------------------- papillons
wing_mats = [M["orange"], M["blanc"], M["jaune"]]
for k, (cx, cy, h, mi, rad) in enumerate([(1.7, -1.5, 0.55, 0, 0.45), (-0.6, -2.0, 0.5, 1, 0.35),
                                          (1.2, 1.1, 0.65, 2, 0.4)]):
    body = bpy.data.objects.new(f"Vie · Papillon {k}", None)
    coll.objects.link(body)
    body.parent = root
    body.empty_display_size = 0.05
    cz = gz(cx, cy) + h
    ph = k * 2.1
    sp = 0.025 + 0.006 * k
    driver(body, "location", 0, f"{cx}+{rad}*sin(frame*{sp:.3f}+{ph:.2f})")
    driver(body, "location", 1, f"{cy}+{rad * 0.8}*sin(frame*{sp * 2:.3f}+{ph:.2f})")
    driver(body, "location", 2, f"{cz:.3f}+0.06*sin(frame*0.31+{ph:.2f})+0.03*sin(frame*0.9)")
    driver(body, "rotation_euler", 2,
           f"atan2({rad * 0.8 * 2}*cos(frame*{sp * 2:.3f}+{ph:.2f}), {rad}*cos(frame*{sp:.3f}+{ph:.2f}))")
    for sgn in (-1, 1):
        bm = bmesh.new()
        a = [bm.verts.new(v) for v in ((0, 0, 0), (0.035, sgn * 0.075, 0.01), (-0.005, sgn * 0.085, 0.0),
                                        (-0.04, sgn * 0.05, 0.0))]
        bm.faces.new(a if sgn > 0 else list(reversed(a)))
        w = obj(f"Vie · Papillon {k} aile {'g' if sgn > 0 else 'd'}", bm, [wing_mats[mi]], body)
        driver(w, "rotation_euler", 0, f"{-sgn}*(0.15+1.05*abs(sin(frame*0.55+{ph:.2f})))")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.008, radius2=0.004, depth=0.05)
    for v in bm.verts:
        v.co = Vector((v.co.z, v.co.y, v.co.x * 0.3))
    obj(f"Vie · Papillon {k} corps", bm, [M["oeil"]], body)

scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, 120
print("vfx : vent, pollen, aigrettes, papillons")
