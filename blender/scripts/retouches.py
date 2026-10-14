"""Retouches des objets de l'îlot (2026-10-14, demandées objet par objet) :
- le bout de tronc au bord de l'îlot (« Îlot · Détails » : écorce et cernes) est retiré, les champignons restent ;
- les scotchs des cartons ne passent plus sous le fond et ne dépassent plus des bords ;
- le pot renversé est creux (paroi, lèvre, fond percé), à la même place ;
- le seau est refait net (flanc à pans, deux nervures franches, rebord carré, oreilles de l'anse) ; son anse est gardée ;
- les sacs poubelle sont refaits : plis qui convergent vers le col, col froncé, oreilles nouées, lien jaune ;
- les pieds de la brouette deviennent de vrais pieds en tube cintré (patin au sol, traverse, boulons, embouts) ;
- la lame de la pelle est refaite simple (un fer de bêche légèrement creusé, sa douille) ; le manche n'est pas touché ;
- un seul sac poubelle reste (demandé) : « Sac poubelle 2 », au premier plan à gauche, est retiré.
Chaque retouche garde la place, le cap et les propriétés (service…) de l'objet. Facettes plates, comme le reste.
Usage : Blender -b hero.blend --python blender/scripts/retouches.py -- sortie.blend [étape …]
Sans étape, toutes, dans l'ordre (sur la scène d'avant les retouches : la brouette ne se refait pas deux fois)."""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

UP = Vector((0, 0, 1))


def mat(nom):
    return bpy.data.materials[nom]


def mat_copie(nom, base, couleur):
    """Une variante d'un matériau existant (même réglages), d'une autre couleur (sRGB hexadécimale)."""
    m = bpy.data.materials.get(nom)
    if m:
        return m
    m = bpy.data.materials[base].copy()
    m.name = nom
    h = couleur.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    m.diffuse_color = (*lin, 1)
    return m


class Maillage:
    """Un maillage en construction (bmesh), des matériaux par nom."""

    def __init__(self, noms):
        self.bm = bmesh.new()
        self.noms = list(noms)

    def m(self, nom):
        if nom not in self.noms:
            self.noms.append(nom)
        return self.noms.index(nom)

    def v(self, co):
        return self.bm.verts.new(co)

    def f(self, vs, nom):
        try:
            face = self.bm.faces.new(vs)
        except ValueError:
            return None
        face.material_index = self.m(nom)
        return face

    def anneau(self, centre, axe, r, n, phase=0.0, rx=None):
        """n sommets en cercle autour de `axe` (rx : rayon différent sur le premier axe du plan, pour un ovale)."""
        axe = axe.normalized()
        a = (Vector((1, 0, 0)) if abs(axe.x) < 0.9 else Vector((0, 1, 0))).cross(axe).normalized()
        b = axe.cross(a)
        rx = r if rx is None else rx
        return [self.v(centre + a * (math.cos(phase + k / n * math.tau) * rx) + b * (math.sin(phase + k / n * math.tau) * r))
                for k in range(n)]

    def relie(self, r0, r1, nom):
        n = len(r0)
        for k in range(n):
            self.f((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]), nom)

    def bouche(self, ring, nom, inverse=False):
        self.f(ring[::-1] if inverse else ring, nom)

    def tube(self, pts, r, nom, cotes=8, bouts=True):
        """Un tube le long d'une ligne brisée (cadres de transport parallèles, pour ne pas vriller)."""
        anneaux, prev = [], None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = prev if prev is not None else (Vector((1, 0, 0)) if abs(t.z) > 0.9 else UP)
            nrm = (ref - t * ref.dot(t)).normalized()
            prev = nrm
            b = t.cross(nrm)
            anneaux.append([self.v(p + (nrm * math.cos(k / cotes * math.tau) + b * math.sin(k / cotes * math.tau)) * r)
                            for k in range(cotes)])
        for a0, a1 in zip(anneaux, anneaux[1:]):
            self.relie(a0, a1, nom)
        if bouts:
            self.bouche(anneaux[0], nom, inverse=True)
            self.bouche(anneaux[-1], nom)

    def boite(self, centre, dx, dy, dz, nom, rot=None):
        rot = rot or Matrix.Identity(3)
        c = [self.v(centre + rot @ Vector((sx * dx, sy * dy, sz * dz)))
             for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.f([c[i] for i in q], nom)

    def vers(self, me, garder=None):
        """Écrit le maillage dans `me` (en gardant, si demandé, des faces existantes : bm déjà rempli par l'appelant)."""
        me.clear_geometry()
        me.materials.clear()
        for nom in self.noms:
            me.materials.append(mat(nom) if isinstance(nom, str) else nom)
        self.bm.normal_update()
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = False
        me.update()


def faces_gardees(o, noms_gardes):
    """Un bmesh des seules faces de `o` dont le matériau est dans `noms_gardes` (avec les noms de matériaux)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    noms = [m.name for m in o.data.materials]
    jeter = [f for f in bm.faces if noms[f.material_index] not in noms_gardes]
    bmesh.ops.delete(bm, geom=jeter, context="FACES")
    return bm, noms


# ------------------------------------------------------------------------------------------------ le tronc
def tronc():
    o = bpy.data.objects["Îlot · Détails"]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    noms = [m.name for m in o.data.materials]
    jeter = [f for f in bm.faces if noms[f.material_index] in ("Îlot · bois", "Îlot · cible")]
    bmesh.ops.delete(bm, geom=jeter, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    print("TRONC retiré :", len(jeter), "faces")


# ------------------------------------------------------------------------------------------------ les scotchs
SCOTCHS = ("Scotch.004", "Vert HomeService.004")


def scotchs():
    for o in bpy.data.objects:
        if not (o.name.startswith("Carton ") or o.name.startswith("Colis ")) or o.name.startswith("Carton ouvert"):
            continue
        me = o.data
        noms = [m.name for m in me.materials]
        corps = [v.co.copy() for p in me.polygons if noms[p.material_index].startswith("Carton")
                 for v in (me.vertices[i] for i in p.vertices)]
        lo = Vector([min(c[i] for c in corps) for i in range(3)])
        hi = Vector([max(c[i] for c in corps) for i in range(3)])
        bm = bmesh.new()
        bm.from_mesh(me)
        ruban = [f for f in bm.faces if noms[f.material_index] in SCOTCHS]
        # sous le fond : retiré (il dépassait, et on ne le voit que lorsque le carton s'envole)
        dessous = [f for f in ruban if f.calc_center_median().z < lo.z + 0.02]
        bmesh.ops.delete(bm, geom=dessous, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        # ce qui dépasse des bords du carton y est ramené (à 3 mm près : l'épaisseur du ruban)
        n = 0
        for f in bm.faces:
            if noms[f.material_index] not in SCOTCHS:
                continue
            for v in f.verts:
                for i in (0, 1):
                    if v.co[i] > hi[i] + 0.003:
                        v.co[i] = hi[i] + 0.003; n += 1
                    elif v.co[i] < lo[i] - 0.003:
                        v.co[i] = lo[i] - 0.003; n += 1
                if v.co.z < lo.z:
                    v.co.z = lo.z; n += 1
        bm.to_mesh(me)
        bm.free()
        print("SCOTCH", o.name, "dessous retirés :", len(dessous), "sommets ramenés :", n)


# ------------------------------------------------------------------------------------------------ le pot renversé
def pot_renverse():
    """Même gabarit que l'ancien (axe local x : fond en -x, ouverture en +x ; lèvre de 0,169 à 0,221), mais creux."""
    o = bpy.data.objects["Pot renversé · jardinage"]
    T, I = "Vide terre cuite.002", mat_copie("Vide terre cuite intérieur", "Vide terre cuite.002", "#8a4a2c").name
    M = Maillage([T, I])
    X = Vector((1, 0, 0))
    n = 16
    ep = 0.018                                      # épaisseur de la paroi
    prof = [(-0.221, 0.170), (0.169, 0.232)]        # (x, rayon extérieur) du corps
    levre = [(0.169, 0.247), (0.221, 0.247)]
    ext = [M.anneau(X * x, X, r, n) for x, r in prof + levre]
    M.relie(ext[0], ext[1], T)
    M.relie(ext[1], ext[2], T)                      # le ressaut sous la lèvre
    M.relie(ext[2], ext[3], T)
    bord_in = M.anneau(X * 0.221, X, 0.247 - ep, n)
    M.relie(ext[3], bord_in, T)                     # le dessus de la lèvre
    xs_in = [(0.221, 0.247 - ep), (0.150, 0.232 - ep), (-0.221 + ep, 0.170 - ep)]
    ins = [bord_in] + [M.anneau(X * x, X, r, n) for x, r in xs_in[1:]]
    for a, b in zip(ins, ins[1:]):
        M.relie(a, b, I)
    # le fond, percé d'un trou d'écoulement : couronne intérieure, couronne extérieure, paroi du trou
    t_in = M.anneau(X * (-0.221 + ep), X, 0.022, n)
    t_ex = M.anneau(X * -0.221, X, 0.022, n)
    M.relie(ins[-1], t_in, I)
    M.relie(t_ex, ext[0], T)
    M.relie(t_in, t_ex, I)
    M.vers(o.data)
    print("POT creux :", len(o.data.polygons), "faces")


# ------------------------------------------------------------------------------------------------ le seau
def seau():
    """Profil net (pans plats, ressauts francs) ; mêmes cotes que l'ancien : fond à z −0,38, rebord à 0,218, r 0,342."""
    o = bpy.data.objects["Seau · nettoyage"]
    garde = ("Métal gris.004", "Vert HomeService.004")          # l'anse et sa poignée
    bm, noms = faces_gardees(o, garde)
    anse = [v.co.copy() for v in bm.verts]
    M = Maillage(noms)
    M.bm = bm
    B, F, E, W = "Seau bleu.004", "Seau bleu foncé.002", "Eau.002", "Mousse eau.002"
    n = 24
    z0, z1 = -0.38, 0.185
    r0, r1 = 0.262, 0.322
    rayon = lambda z: r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    # le flanc, de bas en haut, avec deux nervures en saillie (ressauts nets, pas d'arrondi)
    pts = [(z0, rayon(z0) - 0.012), (z0 + 0.02, rayon(z0 + 0.02))]
    for zc in (-0.25, -0.02):
        pts += [(zc - 0.018, rayon(zc - 0.018)), (zc - 0.018, rayon(zc - 0.018) + 0.012),
                (zc + 0.018, rayon(zc + 0.018) + 0.012), (zc + 0.018, rayon(zc + 0.018))]
    pts += [(z1, rayon(z1)), (z1, r1 + 0.02), (0.218, r1 + 0.02), (0.218, r1 - 0.012)]   # le rebord carré
    rings = [M.anneau(Vector((0, 0, z)), UP, r, n) for z, r in pts]
    M.bouche(rings[0], B, inverse=True)
    for a, b in zip(rings, rings[1:]):
        M.relie(a, b, B)
    # l'intérieur (plus sombre) jusqu'à l'eau, puis l'eau et sa mousse
    zw = 0.10
    r_in = rings[-1]
    w_ring = M.anneau(Vector((0, 0, zw)), UP, rayon(zw) - 0.012, n)
    M.relie(r_in, w_ring, F)
    centre = M.v(Vector((0, 0, zw)))
    for k in range(n):
        M.f((w_ring[k], w_ring[(k + 1) % n], centre), E)
    rnd = random.Random(5)
    for i in range(14):                             # quelques îlots de mousse, plats, à pans
        a, r = rnd.uniform(0, math.tau), rnd.uniform(0.0, 0.2)
        c = Vector((math.cos(a) * r, math.sin(a) * r, zw + 0.004))
        s = rnd.uniform(0.03, 0.065)
        ring = M.anneau(c, UP, s, 7, phase=rnd.uniform(0, 1))
        top = M.v(c + Vector((0, 0, s * 0.35)))
        for k in range(7):
            M.f((ring[k], ring[(k + 1) % 7], top), W)
    # les oreilles de l'anse : un bloc de chaque côté, là où ses bouts touchent le seau
    bouts = sorted(anse, key=lambda c: c.x)
    for c in (bouts[0], bouts[-1]):
        d = Vector((c.x, c.y, 0)).normalized()
        cc = d * (rayon(0.16) + 0.012) + Vector((0, 0, 0.16))
        rot = Matrix.Rotation(math.atan2(d.y, d.x), 3, "Z")
        M.boite(cc, 0.02, 0.035, 0.04, B, rot)
    M.vers(o.data)
    print("SEAU :", len(o.data.polygons), "faces")


# ------------------------------------------------------------------------------------------------ les sacs poubelle
def sac(o, seed):
    """Un sac noir rempli : panse qui s'affaisse un peu, plis qui convergent vers le col, col froncé serré par un lien
    jaune, deux oreilles nouées au-dessus. (Un reflet sur les crêtes, essayé, faisait un damier : retiré.) Mêmes cotes que l'ancien (z −0,389 → 0,389 ; 0,68 × 0,6)."""
    S, L = "Sac poubelle.004", "Lien jaune.004"
    rnd = random.Random(seed)
    M = Maillage([S, L])
    n = 36
    zb, zc = -0.389, 0.245                          # le fond, le col
    ph = [rnd.uniform(0, math.tau) for _ in range(4)]
    plis = [rnd.uniform(0.6, 1.0) for _ in range(n)]

    # le profil (t : 0 au fond → 1 au col) : posé à plat, la panse s'affaisse vers le bas, puis se resserre au col
    PROFIL = [(0.0, 0.25), (0.05, 0.31), (0.16, 0.345), (0.32, 0.34), (0.5, 0.3), (0.66, 0.235), (0.8, 0.15),
              (0.92, 0.08), (1.0, 0.048)]

    def r_profil(t):
        for (t0, r0), (t1, r1) in zip(PROFIL, PROFIL[1:]):
            if t <= t1:
                u = (t - t0) / (t1 - t0)
                return r0 + (r1 - r0) * (3 * u * u - 2 * u ** 3)
        return PROFIL[-1][1]

    rows = []
    NZ = 12
    for j in range(NZ + 1):
        t = j / NZ
        z = zb + (zc - zb) * t + (0.0 if j else 0.0)
        ring = []
        for k in range(n):
            a = (k + 0.5 * (j % 2)) / n * math.tau      # rangées décalées d'une demi-facette : losanges, pas de grille
            # plis : de larges ondulations (neuf autour du sac), faibles en bas, marquées vers le col froncé
            fronce = (0.04 + 0.26 * t ** 2.0) * (math.sin(a * 9 + ph[3]) * 0.8 + 0.2 * plis[k])
            bosse = 0.035 * math.sin(a * 3 + ph[0]) * (1 - t) + 0.02 * math.sin(a * 5 + ph[1]) * math.sin(t * math.pi)
            r = r_profil(t) * (1 + fronce * 0.35 + bosse) * (1 + rnd.uniform(-0.035, 0.035) * (0 < j < NZ))
            ring.append(M.v(Vector((math.cos(a) * r * 1.13, math.sin(a) * r, z + 0.01 * math.sin(a * 2 + ph[2]) * t))))
        rows.append(ring)
    M.bouche(rows[0], S, inverse=True)
    for j, (a, b) in enumerate(zip(rows, rows[1:])):
        for k in range(n):                          # en triangles, d'une rangée à la suivante (décalée)
            k1 = (k + 1) % n
            if j % 2 == 0:
                M.f((a[k], a[k1], b[k]), S)
                M.f((a[k1], b[k1], b[k]), S)
            else:
                M.f((a[k], a[k1], b[k1]), S)
                M.f((a[k], b[k1], b[k]), S)
    # au-dessus du col : le plastique froncé qui remonte, puis deux oreilles nouées
    col = rows[-1]
    haut = []
    for k in range(n):
        a = k / n * math.tau
        r = 0.03 * (1.3 if k % 2 else 0.8)
        haut.append(M.v(Vector((math.cos(a) * r, math.sin(a) * r, zc + 0.05))))
    M.relie(col, haut, S)
    noeud = M.v(Vector((0, 0, zc + 0.075)))
    for k in range(n):
        M.f((haut[k], haut[(k + 1) % n], noeud), S)
    for s in (-1, 1):                               # les oreilles : deux pointes aplaties, inclinées
        base = Vector((0, 0, zc + 0.06))
        bout = Vector((s * 0.09, rnd.uniform(-0.03, 0.03), 0.389))
        mi = (base + bout) / 2 + Vector((s * 0.025, 0, 0.01))
        lat = Vector((0, 1, 0)) * 0.035
        pa = [M.v(base + lat), M.v(mi + lat * 1.2), M.v(bout), M.v(mi - lat * 1.2), M.v(base - lat)]
        epais = Vector((0, 0, 0)) + (bout - base).cross(Vector((0, 1, 0))).normalized() * 0.012
        pb = [M.v(p.co + epais) for p in pa]
        M.f(pa, S); M.f(pb[::-1], S)
        for i in range(len(pa) - 1):
            M.f((pa[i], pa[i + 1], pb[i + 1], pb[i]), S)
    # le lien jaune : un anneau plat serré sur le col, et ses deux petites boucles
    for dz in (0.0,):
        a0 = M.anneau(Vector((0, 0, zc + 0.012 + dz)), UP, 0.058, 12)
        a1 = M.anneau(Vector((0, 0, zc + 0.034 + dz)), UP, 0.052, 12)
        i0 = M.anneau(Vector((0, 0, zc + 0.012 + dz)), UP, 0.046, 12)
        i1 = M.anneau(Vector((0, 0, zc + 0.034 + dz)), UP, 0.040, 12)
        M.relie(a0, a1, L); M.relie(a1, i1, L); M.relie(i1, i0, L); M.relie(i0, a0, L)
    for s in (-1, 1):
        c = Vector((0.0, s * 0.06, zc + 0.03))
        boucle = [c + Vector((0.02 * math.sin(u * math.tau) * s, s * 0.035 * math.sin(u * math.pi), 0.03 * math.sin(u * math.pi)))
                  for u in [i / 8 for i in range(9)]]
        M.tube(boucle, 0.007, L, cotes=5)
    M.vers(o.data)
    print("SAC", o.name, len(o.data.polygons), "faces")


def sacs():
    sac(bpy.data.objects["Sac poubelle · desencombrement"], 11)


def un_seul_sac():
    o = bpy.data.objects.get("Sac poubelle 2 · desencombrement")
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
        print("SAC 2 retiré")


# ------------------------------------------------------------------------------------------------ la brouette
def brouette():
    """Les deux poteaux gris deviennent des pieds en tube cintré : du bras, il descend en biais jusqu'au sol, court au
    sol (le patin, sur un embout de caoutchouc) puis remonte en diagonale sous le bras ; une traverse relie les deux
    pieds, un boulon les tient aux bras. Repère local : roue en −y, poignées en +y, sol à z = 0."""
    o = bpy.data.objects["Brouette · jardinage"]
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    noms = [m.name for m in me.materials]
    poteaux = []
    for f in list(bm.faces):
        if noms[f.material_index] == "Métal gris.003" and f.calc_center_median().y > 0.2:
            poteaux.append(f)
    bmesh.ops.delete(bm, geom=poteaux, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    M = Maillage(noms)
    M.bm = bm
    G, A = "Métal gris.003", "Gris anthracite.003"
    # le bras en bois (son dessous) : de (±0,093 ; −0,842 ; 0,16) à (±0,333 ; 0,843 ; 0,658), poutre de 4 cm

    def bras(y, s):
        t = (y + 0.842) / 1.685
        return Vector((s * (0.093 + 0.24 * t), y, 0.16 + 0.498 * t - 0.024))

    r = 0.014
    for s in (-1, 1):
        haut_ar, haut_av = bras(0.43, s), bras(0.05, s)
        pied_ar = Vector((haut_ar.x + s * 0.03, 0.34, r))
        pied_av = Vector((haut_av.x + s * 0.03, 0.14, r))
        # coudes arrondis : deux points de part et d'autre de chaque pli
        pts = [haut_ar, haut_ar.lerp(pied_ar, 0.85), pied_ar + Vector((0, -0.02, 0.006)),
               pied_ar + Vector((0, -0.05, 0)), pied_av + Vector((0, 0.05, 0)), pied_av + Vector((0, 0.02, 0.006)),
               pied_av.lerp(haut_av, 0.15), haut_av]
        M.tube(pts, r, G, cotes=8)
        # les embouts de caoutchouc sous le patin, et les boulons sous le bras
        for y in (pied_ar.y - 0.035, pied_av.y + 0.035):
            M.boite(Vector((pied_ar.x, y, 0.009)), 0.022, 0.03, 0.009, A)
        for h in (haut_ar, haut_av):
            M.tube([h + Vector((s * -0.03, 0, 0.004)), h + Vector((s * 0.03, 0, 0.004))], 0.008, A, cotes=6)
    # la traverse, entre les deux pieds (à mi-hauteur de la jambe arrière)
    ga, dr = bras(0.43, -1).lerp(Vector((bras(0.43, -1).x - 0.03, 0.34, r)), 0.55), \
        bras(0.43, 1).lerp(Vector((bras(0.43, 1).x + 0.03, 0.34, r)), 0.55)
    M.tube([ga, dr], 0.011, G, cotes=8)
    M.vers(me)
    print("BROUETTE :", len(me.polygons), "faces")


# ------------------------------------------------------------------------------------------------ la pelle
def pelle():
    """Un fer de bêche sobre : plaque à peine creusée, épaules droites, côtés qui se resserrent vers une pointe
    arrondie ; une douille octogonale qui s'effile sur le manche. Repère local : fer en bas (z 0 → 0,36), manche au-dessus
    (il commence à z 0,507 ; rayon 0,023), face en +y."""
    o = bpy.data.objects["Pelle · jardinage"]
    bm, noms = faces_gardees(o, ("Îlot · manche bois", "Îlot · vert marque"))
    M = Maillage(noms)
    M.bm = bm
    FER, DOUILLE = "Îlot · acier sombre", "Îlot · acier"
    H, W, ep = 0.36, 0.135, 0.006                   # hauteur du fer, demi-largeur aux épaules, épaisseur
    NX, NZ = 8, 7

    def largeur(t):                                 # t : 0 à la pointe → 1 aux épaules
        return W * (math.sin(math.pi / 2 * min(1.0, t * 1.35)) ** 0.8)

    def p(t, u, dy):                                # u : −1 → 1 en travers
        x = u * largeur(t)
        y = -0.018 * (1 - u * u) * (0.4 + 0.6 * t) + dy   # creusé au milieu, plus vers le haut
        return Vector((x, y, t * H + 0.004 * (1 - t)))

    for dy, inv in ((ep / 2, False), (-ep / 2, True)):
        g = [[M.v(p(j / NZ, -1 + 2 * i / NX, dy)) for i in range(NX + 1)] for j in range(NZ + 1)]
        for j in range(NZ):
            for i in range(NX):
                q = (g[j][i], g[j][i + 1], g[j + 1][i + 1], g[j + 1][i])
                M.f(q[::-1] if inv else q, FER)
        if dy > 0:
            face_av = g
        else:
            face_ar = g
    # la tranche, tout autour (côtés et épaules)
    bord_av = [r[0] for r in face_av] + face_av[-1][1:] + [r[-1] for r in face_av[::-1]][1:]
    bord_ar = [r[0] for r in face_ar] + face_ar[-1][1:] + [r[-1] for r in face_ar[::-1]][1:]
    for i in range(len(bord_av) - 1):
        M.f((bord_av[i], bord_av[i + 1], bord_ar[i + 1], bord_ar[i]), FER)
    # la douille : naît sur le haut du fer, s'effile jusque sur le manche
    zs = [(H - 0.03, 0.05, 0.03), (H + 0.02, 0.036, 0.028), (0.50, 0.028, 0.027), (0.535, 0.0255, 0.0255)]
    rings = [M.anneau(Vector((0, -0.006, z)), UP, ry, 8, phase=math.pi / 8, rx=rx) for z, rx, ry in zs]
    M.bouche(rings[0], DOUILLE, inverse=True)
    for a, b in zip(rings, rings[1:]):
        M.relie(a, b, DOUILLE)
    M.bouche(rings[-1], DOUILLE)
    M.vers(o.data)
    print("PELLE :", len(o.data.polygons), "faces")


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    out, etapes = args[0], args[1:]
    for f in (tronc, scotchs, pot_renverse, seau, un_seul_sac, sacs, brouette, pelle):
        if not etapes or f.__name__ in etapes:
            f()
    bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
    print("ENREGISTRÉ", out)
