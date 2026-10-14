"""Met à jour les mini-mondes de la section Services (models/minimondes.glb, copie de l'immersif) avec les objets
refaits de l'îlot (blender/hero.blend) : le seau (nettoyage), le sac poubelle (désencombrement), la caisse à outils
(montage) et la plante en pot, devenue monstera (livraison) ; et la végétation du jardinage, refaite dans le style de
l'îlot (blender/scripts/jardin_monde.py). Chaque nouvel objet prend la place, l'aplomb et la taille
de l'ancien, et son NOM (ou celui de son groupe) : js/assemblage.js retrouve les pièces par leur nom. Les matériaux de
l'îlot qui existent aussi dans les mondes (« Seau bleu.004 » → « Seau bleu ») sont remplacés par ceux des mondes.
Usage : Blender -b --factory-startup --python blender/scripts/mondes_maj.py -- entrée.glb hero.blend sortie.glb [brut]
(brut : aller-retour sans rien changer, pour vérifier l'export)."""
import bpy, re, sys, math
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
ENTREE, HERO, SORTIE = args[:3]
BRUT = "brut" in args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=ENTREE)


def boite(obs):
    pts = [o.matrix_world @ Vector(c) for o in obs if o.type == "MESH" for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def descendants(o):
    out = []
    for c in o.children:
        out += [c] + descendants(c)
    return out


def importe(nom):
    with bpy.data.libraries.load(HERO, link=False) as (src, dst):
        dst.objects = [nom]
    o = dst.objects[0]
    o.data = o.data.copy()
    for k in list(o.keys()):
        del o[k]
    for i, m in enumerate(o.data.materials):          # les matériaux des mondes, quand ils existent
        if m is None:
            continue
        base = re.sub(r"\.\d{3}$", "", m.name)
        mm = bpy.data.materials.get(base)
        if mm is not None and mm is not m:
            o.data.materials[i] = mm
    for a in [a.name for a in o.data.attributes if "souplesse" in a.name]:
        o.data.attributes.remove(o.data.attributes[a])
    bpy.context.scene.collection.objects.link(o)
    return o


def remplace(anciens, nom_hero, nouveau_nom, parent, ajuste="hauteur", cap=0.0, largeur_max=None):
    """Pose l'objet de l'îlot `nom_hero` à la place des objets `anciens` (supprimés) : même centre au sol, même dessous ;
    taille : même hauteur (ou même emprise au sol), bornée à largeur_max × l'ancienne largeur."""
    lo, hi = boite(anciens)
    n = importe(nom_hero)
    n.parent = None
    n.matrix_world = Matrix.Rotation(cap, 4, "Z")
    bpy.context.view_layer.update()
    nlo, nhi = boite([n])
    if ajuste == "hauteur":
        s = (hi.z - lo.z) / (nhi.z - nlo.z)
    else:
        s = max(hi.x - lo.x, hi.y - lo.y) / max(nhi.x - nlo.x, nhi.y - nlo.y)
    if largeur_max:
        s = min(s, largeur_max * max(hi.x - lo.x, hi.y - lo.y) / max(nhi.x - nlo.x, nhi.y - nlo.y))
    n.matrix_world = Matrix.Scale(s, 4) @ n.matrix_world
    bpy.context.view_layer.update()
    nlo, nhi = boite([n])
    cible = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    actuel = Vector(((nlo.x + nhi.x) / 2, (nlo.y + nhi.y) / 2, nlo.z))
    n.matrix_world = Matrix.Translation(cible - actuel) @ n.matrix_world
    mw = n.matrix_world.copy()
    for o in anciens:
        bpy.data.objects.remove(o, do_unlink=True)
    n.name = nouveau_nom
    n.data.name = nouveau_nom
    n.parent = parent
    n.matrix_world = mw
    print("REMPLACÉ", nouveau_nom, "échelle", round(s, 3), "ancienne boîte", tuple(round(v, 3) for v in hi - lo),
          "nouvelle", tuple(round(v, 3) for v in boite([n])[1] - boite([n])[0]))


O = bpy.data.objects
if not BRUT:
    # nettoyage : le seau
    vieux = O["Seau arrondi"]
    remplace([vieux], "Seau · nettoyage", "Seau arrondi", vieux.parent, cap=math.radians(-60))
    # désencombrement : le sac poubelle
    vieux = O["Sac poubelle"]
    remplace([vieux], "Sac poubelle · desencombrement", "Sac poubelle", vieux.parent)
    # montage : la caisse et ses pièces (corps, couvercle, fermoirs, poignée et ses montants) → la caisse noire
    groupe = next(o for o in O if o.name.startswith("Pièce · Service · Montage"))
    parts = [o for o in groupe.children if re.match(r"(Caisse|Couvercle|Fermoir|Poignée caisse|Montant)", o.name)]
    remplace(parts, "Montage 1 · montage", "Caisse.003 (proto)", groupe, ajuste="emprise",
             cap=math.radians(float(args[args.index("cap") + 1])) if "cap" in args else 0.0)
    # livraison : la plante (le groupe « Plante porte » garde son nom, il porte désormais le monstera)
    groupe = O["Plante porte (proto)"]
    remplace(descendants(groupe), "Plante · livraison", "Monstera (proto)", groupe, ajuste="hauteur", largeur_max=1.6)
    # jardinage : la végétation refaite (haie en cours de taille, pelouse en cours de tonte, massif, buissons)
    exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/jardin_monde.py").read())
    jardin()

bpy.ops.export_scene.gltf(filepath=SORTIE, export_format="GLB", export_extras=True, export_cameras=False,
                          export_lights=False, export_draco_mesh_compression_enable=True,
                          export_draco_mesh_compression_level=6)
print("EXPORT", SORTIE)
