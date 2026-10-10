# Dans hero.blend : pour chaque objet de service, ses triangles dans son repère local (échelle comprise, sans
# rotation ni position), enfants compris. Écrit tris.json : {nom: {service, tris: [[x,y,z]*3...]}}
import bpy, json
from mathutils import Matrix
out = {}
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if "service" not in o: continue
    if o.parent and "service" in o.parent: continue
    base = o.matrix_world.inverted()
    sc = Matrix.Diagonal(o.matrix_world.to_scale().to_4d())
    tris = []
    for m in [o] + list(o.children_recursive):
        if m.type != 'MESH': continue
        ev = m.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
        M = sc @ base @ m.matrix_world
        vs = [M @ v.co for v in me.vertices]
        for t in me.loop_triangles:
            tris.append([[round(c, 4) for c in vs[i]] for i in t.vertices])
        ev.to_mesh_clear()
    out[o.name] = {"service": o["service"], "tris": tris}
json.dump(out, open("tris.json", "w"))
print("OBJETS", len(out), sorted(out))
