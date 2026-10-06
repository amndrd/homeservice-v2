"""Fleurs et herbe de l'îlot, redessinées : dix espèces de prairie et des touffes d'herbe plus fines.
Style de la scène (facettes plates), mais des formes vraies : tiges en tube qui s'incurvent, feuilles, pétales
courbés en cuillère, échancrés ou frangés selon l'espèce, couleurs en dégradé (base → pointe) portées par les sommets,
cœurs en relief (étamines, disques, capsules).
Chaque sommet porte sa souplesse (0 au pied, 1 en haut) : le vent du site (js/hero.js) les fait onduler comme avant.
Usage : depuis un autre script (exec, même espace de noms) — B = Flore(), puis ESPECES["coquelicot"](B, pied, échelle,
hasard), touffe(B, pied, …), et B.mesh("nom") pour obtenir le maillage."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Quaternion

UP = Vector((0, 0, 1))
BRIN_W = 1.0                                       # largeur des brins (facteur)
TIGE_H = 1.0                                       # hauteur des tiges (facteur) : l'îlot agrandit les fleurs, moins leurs tiges


def lin(h):
    """Couleur hexadécimale (sRGB) → linéaire, comme le reste de la scène."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return Vector([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c])


def mix(a, b, t):
    return a.lerp(b, max(0.0, min(1.0, t)))


def ramp(stops, t):
    """Dégradé à plusieurs arrêts : [(position, couleur linéaire), …]."""
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            return mix(c0, c1, (t - t0) / max(t1 - t0, 1e-6))
    return stops[-1][1]


class Flore:
    """Un maillage en construction : sommets avec souplesse et couleur, faces avec matériau."""
    MATS = ("flore", "flore_brillant")

    def __init__(self):
        self.bm = bmesh.new()
        self.flex, self.col = [], []

    def v(self, co, flex, col):
        vert = self.bm.verts.new(co)
        self.flex.append(max(0.0, min(1.0, flex)))
        self.col.append(col)
        return vert

    def face(self, vs, mat=0):
        f = self.bm.faces.new(vs)
        f.material_index = mat
        return f

    # ---------------------------------------------------------------- primitives
    def tube(self, pts, radii, flexes, cols, sides=5, mat=0, cap=True):
        """Un tube le long d'une ligne de points (tige, pédoncule), rayon et couleur par point."""
        rings = []
        prev_n = None
        for i, p in enumerate(pts):
            t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            ref = prev_n if prev_n is not None else (Vector((1, 0, 0)) if abs(t.z) > 0.9 else UP)
            n = (ref - t * ref.dot(t)).normalized()
            prev_n = n
            b = t.cross(n)
            ring = []
            for k in range(sides):
                a = k / sides * math.tau
                ring.append(self.v(p + (n * math.cos(a) + b * math.sin(a)) * radii[i], flexes[i], cols[i]))
            rings.append(ring)
        for r0, r1 in zip(rings, rings[1:]):
            for k in range(sides):
                self.face((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]), mat)
        if cap:
            tip = self.v(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1] * 0.6, flexes[-1], cols[-1])
            for k in range(sides):
                self.face((rings[-1][k], rings[-1][(k + 1) % sides], tip), mat)

    def surface(self, at, nu, nv, flex, color, mat=0):
        """Une surface paramétrée at(u, v) → point, u de -1 à 1 (travers), v de 0 à 1 (long)."""
        grid = [[self.v(at(-1 + 2 * i / nu, j / nv), flex(j / nv), color(-1 + 2 * i / nu, j / nv))
                 for i in range(nu + 1)] for j in range(nv + 1)]
        for j in range(nv):
            for i in range(nu):
                self.face((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]), mat)

    def petal(self, base, d, n, length, width, stops, flex0, flex1, cup=0.25, curl=0.0, twist=0.0, prof=None,
              notch=0.0, fringe=0.0, round_=0.0, nu=4, nv=4, mat=0):
        """Un pétale (ou une feuille) : part de `base` dans la direction `d`, sa face vers `n`. Il se creuse en cuillère
        (cup), se courbe vers sa face ou son dos (curl, rad), se tord (twist) ; sa largeur suit `prof(v)` ; sa pointe peut
        être échancrée (notch, en cœur), frangée (fringe, en dents) ou arrondie aux coins (round_). Couleur : dégradé `stops` de la base à la pointe."""
        d = d.normalized()
        n = (n - d * n.dot(d)).normalized()
        side = d.cross(n)
        prof = prof or (lambda v: math.sin(math.pi * min(1.0, 0.12 + v * 0.95)) ** 0.7)

        def at(u, v):
            w = width / 2 * prof(v)
            L = length * v
            if v > 0.6:                                      # la pointe : échancrure, dents
                k = ((v - 0.6) / 0.4) ** 2
                L -= length * k * notch * (1 - u * u) * 0.35
                L -= length * k * fringe * 0.12 * (0.5 + 0.5 * math.cos(u * math.pi * 3))
                L -= length * k * round_ * 0.3 * u ** 4
            th = curl * v * v
            tw = Quaternion(d, twist * v)
            o = d * (L * math.cos(th)) + n * (L * math.sin(th))
            o += tw @ (side * (u * w)) + n * (cup * w * u * u)
            return base + o

        self.surface(at, nu, nv, lambda v: flex0 + (flex1 - flex0) * v, lambda u, v: ramp(stops, v), mat)

    def dome(self, c, rad, height, stops, flex, segs=10, rings=3, mat=0, up=UP):
        """Un dôme (cœur de fleur, bouton) : couleur du bord au sommet."""
        up = up.normalized()
        a = (Vector((1, 0, 0)) if abs(up.z) > 0.9 else UP).cross(up).normalized()
        b = up.cross(a)
        prev = None
        for j in range(rings + 1):
            t = j / rings
            r = rad * math.cos(t * math.pi / 2)
            h = height * math.sin(t * math.pi / 2)
            if j == rings:
                top = self.v(c + up * height, flex, ramp(stops, 1))
                for k in range(segs):
                    self.face((prev[k], prev[(k + 1) % segs], top), mat)
                break
            ring = [self.v(c + up * h + (a * math.cos(k / segs * math.tau) + b * math.sin(k / segs * math.tau)) * r,
                           flex, ramp(stops, t)) for k in range(segs)]
            if prev:
                for k in range(segs):
                    self.face((prev[k], prev[(k + 1) % segs], ring[(k + 1) % segs], ring[k]), mat)
            prev = ring

    def blob(self, c, rad, col, flex, mat=0, squash=1.0):
        """Une petite boule à facettes (étamine, bouton, fleuron) : un octaèdre."""
        ax = [Vector((rad, 0, 0)), Vector((-rad, 0, 0)), Vector((0, rad, 0)), Vector((0, -rad, 0))]
        top = self.v(c + Vector((0, 0, rad * squash)), flex, col)
        bot = self.v(c - Vector((0, 0, rad * squash)), flex, col)
        ring = [self.v(c + ax[i], flex, col) for i in (0, 2, 1, 3)]
        for k in range(4):
            self.face((ring[k], ring[(k + 1) % 4], top), mat)
            self.face((ring[(k + 1) % 4], ring[k], bot), mat)

    # ---------------------------------------------------------------- fin
    def mesh(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        for p in me.polygons:
            p.use_smooth = False
        sp = me.attributes.new("souplesse", "FLOAT", "POINT")
        sp.data.foreach_set("value", [f ** 1.6 for f in self.flex])
        col = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        for loop in me.loops:
            c = self.col[loop.vertex_index]
            col.data[loop.index].color = (c[0], c[1], c[2], 1.0)
        me.color_attributes.active_color = col
        for m in flore_materials():
            me.materials.append(m)
        return me


def flore_materials():
    """Deux matériaux : la couleur vient des sommets (dégradés) ; l'un mat, l'autre brillant (bouton d'or)."""
    out = []
    for name, rough in (("Îlot · flore", 0.62), ("Îlot · flore brillant", 0.38)):
        m = bpy.data.materials.get(name)
        if not m:
            m = bpy.data.materials.new(name)
            m.use_nodes = True
            nt = m.node_tree
            bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
            ca = nt.nodes.new("ShaderNodeVertexColor")
            ca.layer_name = "Col"
            nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])
            bsdf.inputs["Roughness"].default_value = rough
            m.diffuse_color = (0.5, 0.6, 0.3, 1)
        out.append(m)
    return out


# ------------------------------------------------------------------------------------------------ tiges et feuilles
TIGE = [(0.0, lin("#1f6b34")), (1.0, lin("#4fa848"))]
FEUILLE = [(0.0, lin("#2a7a38")), (0.6, lin("#45a548")), (1.0, lin("#7cc457"))]


def stem(B, foot, top, r0, r1, bow, rnd, seg=5, sides=5):
    """Une tige du pied au sommet, un peu arquée (bow : écart au milieu, en m, vers un côté au hasard)."""
    side = Vector((math.cos(rnd.uniform(0, math.tau)), math.sin(rnd.uniform(0, math.tau)), 0)) * bow
    pts, radii, fl, cols = [], [], [], []
    for i in range(seg + 1):
        t = i / seg
        p = foot.lerp(top, t) + side * math.sin(math.pi * t)
        pts.append(p)
        radii.append(r0 + (r1 - r0) * t)
        fl.append(t)
        cols.append(ramp(TIGE, t))
    B.tube(pts, radii, fl, cols, sides=sides)
    return pts


def leaves(B, foot, n, length, width, rnd, rise=0.6, droop=0.9, flex=0.25, stops=FEUILLE, prof=None):
    """Feuilles en rosette au pied de la tige, qui s'élancent puis retombent."""
    a0 = rnd.uniform(0, math.tau)
    for k in range(n):
        a = a0 + k / n * math.tau + rnd.uniform(-0.3, 0.3)
        h = Vector((math.cos(a), math.sin(a), 0))
        d = (h + UP * rise).normalized()
        nrm = UP.cross(h).cross(d) * -1
        B.petal(foot + UP * 0.005, d, nrm, length * rnd.uniform(0.8, 1.15), width, stops, 0.0, flex,
                cup=0.18, curl=-droop, twist=rnd.uniform(-0.4, 0.4), prof=prof, nu=2, nv=4)


def corolla(B, center, axis, n, length, width, stops, flex, rnd, tilt=0.35, cup=0.3, curl=0.0, notch=0.0,
            fringe=0.0, prof=None, nu=4, nv=4, mat=0, a0=None, jitter=0.12, round_=0.0):
    """Une couronne de pétales autour de `axis` : ils s'ouvrent à `tilt` rad au-dessus du plan (négatif : retombent)."""
    axis = axis.normalized()
    a_ = (Vector((1, 0, 0)) if abs(axis.z) > 0.9 else UP).cross(axis).normalized()
    b_ = axis.cross(a_)
    a0 = rnd.uniform(0, math.tau) if a0 is None else a0
    for k in range(n):
        a = a0 + k / n * math.tau + rnd.uniform(-jitter, jitter) / n * math.tau
        h = a_ * math.cos(a) + b_ * math.sin(a)
        t = tilt + rnd.uniform(-0.08, 0.08)
        d = h * math.cos(t) + axis * math.sin(t)
        nrm = axis * math.cos(t) - h * math.sin(t)
        B.petal(center, d, nrm, length * rnd.uniform(0.92, 1.08), width, stops, flex, 1.0, cup=cup, curl=curl,
                notch=notch, fringe=fringe, round_=round_, prof=prof, nu=nu, nv=nv, mat=mat)


def head_axis(top, prev, nod=0.0):
    """L'axe de la fleur : dans le prolongement de la tige, penché de `nod` vers le bas."""
    d = (top - prev).normalized()
    return (d.lerp(Vector((d.x, d.y, -0.6)).normalized(), nod)).normalized() if nod else d


# ------------------------------------------------------------------------------------------------ espèces
def coquelicot(B, foot, s, rnd):
    """Coquelicot : tige haute et velue un peu penchée, quatre grands pétales froissés en coupe, rouge vif à la base
    tachée de noir ; au centre la capsule verte et sa couronne d'étamines sombres."""
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.34, 0.44) * s * TIGE_H))
    pts = stem(B, foot, top, 0.006 * s, 0.0045 * s, 0.04 * s, rnd)
    leaves(B, foot, 3, 0.13 * s, 0.035 * s, rnd, prof=lambda v: math.sin(math.pi * v) ** 0.6, droop=1.1)
    ax = head_axis(top, pts[-2], 0.15)
    red = [(0.0, lin("#140809")), (0.13, lin("#240a0c")), (0.2, lin("#a80804")), (1.0, lin("#d4170c"))]
    roundish = lambda v: math.sin(math.pi * min(1, 0.06 + v * 0.7)) ** 0.45
    a0 = rnd.uniform(0, math.tau)
    corolla(B, top, ax, 2, 0.08 * s, 0.1 * s, red, 0.95, rnd, tilt=0.42, cup=0.3, curl=0.22, nu=6, nv=5,
            prof=roundish, a0=a0, jitter=0.02, round_=1.0)
    corolla(B, top + ax * 0.004 * s, ax, 2, 0.07 * s, 0.09 * s, red, 0.95, rnd, tilt=0.62, cup=0.34, curl=0.2,
            nu=6, nv=5, prof=roundish, a0=a0 + math.pi / 2, jitter=0.02, round_=1.0)
    for k in range(12):                                  # étamines
        a = k / 12 * math.tau
        p = top + ax * 0.012 * s + Vector((math.cos(a), math.sin(a), 0)) * 0.017 * s
        B.blob(p, 0.0045 * s, lin("#1b1216"), 1.0)
    B.dome(top + ax * 0.008 * s, 0.013 * s, 0.016 * s, [(0, lin("#5f7a4c")), (1, lin("#9db87a"))], 1.0, segs=8,
           rings=2, up=ax)


def bleuet(B, foot, s, rnd):
    """Bleuet : tige fine, feuilles étroites ; sur un involucre écailleux, une couronne de fleurons en entonnoir aux
    bords frangés, bleu profond, et au centre une touffe de petits fleurons violets."""
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.3, 0.38) * s * TIGE_H))
    pts = stem(B, foot, top, 0.004 * s, 0.003 * s, 0.03 * s, rnd)
    leaves(B, foot, 3, 0.12 * s, 0.014 * s, rnd, rise=1.0, droop=0.6, prof=lambda v: math.sin(math.pi * v) ** 0.4)
    ax = head_axis(top, pts[-2])
    B.dome(top - ax * 0.012 * s, 0.014 * s, 0.022 * s, [(0, lin("#3c5e3a")), (0.6, lin("#5e7d4c")),
                                                         (1, lin("#3a3550"))], 0.95, segs=8, rings=3, up=ax)
    blue = [(0.0, lin("#2a3fb8")), (0.5, lin("#2f63ef")), (1.0, lin("#5a8cff"))]
    corolla(B, top + ax * 0.006 * s, ax, 9, 0.042 * s, 0.026 * s, blue, 0.95, rnd, tilt=0.35, cup=0.7, fringe=1.0,
            nu=4, nv=3, prof=lambda v: 0.35 + 0.65 * v ** 0.8)
    for k in range(7):                                   # le cœur : fleurons violets
        a = k / 7 * math.tau
        p = top + ax * 0.014 * s + Vector((math.cos(a), math.sin(a), 0)) * 0.007 * s
        B.blob(p, 0.006 * s, lin("#4a3aa8"), 1.0, squash=1.6)


def marguerite(B, foot, s, rnd):
    """Marguerite : une vingtaine de pétales fins, blancs à la base à peine verte, qui retombent un peu ; un disque
    jaune bombé, plus orangé au centre."""
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.28, 0.36) * s * TIGE_H))
    pts = stem(B, foot, top, 0.0045 * s, 0.0035 * s, 0.03 * s, rnd)
    leaves(B, foot, 4, 0.08 * s, 0.022 * s, rnd, rise=0.4, droop=0.9,
           prof=lambda v: (math.sin(math.pi * v) ** 0.5) * (0.6 + 0.4 * v))
    ax = head_axis(top, pts[-2])
    white = [(0.0, lin("#dfe8d2")), (0.25, lin("#f8f9f2")), (1.0, lin("#ffffff"))]
    corolla(B, top, ax, 20, 0.072 * s, 0.017 * s, white, 0.95, rnd, tilt=0.12, cup=0.25, curl=-0.35, notch=0.4,
            nu=2, nv=4, prof=lambda v: math.sin(math.pi * min(1, 0.2 + v * 0.75)) ** 0.4)
    B.dome(top + ax * 0.002 * s, 0.024 * s, 0.014 * s, [(0, lin("#d8c000")), (0.7, lin("#e2c800")),
                                                         (1, lin("#c9a000"))], 1.0, segs=12, rings=3, up=ax)


def bouton_or(B, foot, s, rnd):
    """Bouton d'or : cinq pétales ronds et brillants, très creusés en coupe, jaune d'or ; un cœur vert entouré
    d'étamines dorées ; feuilles découpées."""
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.24, 0.3) * s * TIGE_H))
    pts = stem(B, foot, top, 0.0035 * s, 0.003 * s, 0.03 * s, rnd)
    leaves(B, foot, 3, 0.06 * s, 0.05 * s, rnd, rise=0.5, droop=0.6,
           prof=lambda v: abs(math.sin(math.pi * v)) ** 0.5 * (0.75 + 0.25 * math.cos(v * 18)))
    ax = head_axis(top, pts[-2])
    gold = [(0.0, lin("#7f7a00")), (0.3, lin("#d8c400")), (1.0, lin("#e8d400"))]   # jaunes verts : l'éclairage
                                                                                      # pousse les autres vers l'orange
    corolla(B, top, ax, 5, 0.04 * s, 0.042 * s, gold, 0.95, rnd, tilt=0.5, cup=0.5, curl=0.2, nu=4, nv=3, mat=1,
            prof=lambda v: math.sin(math.pi * min(1, 0.1 + v * 0.78)) ** 0.45, jitter=0.03)
    for k in range(10):
        a = k / 10 * math.tau
        B.blob(top + ax * 0.008 * s + Vector((math.cos(a), math.sin(a), 0)) * 0.009 * s, 0.003 * s, lin("#e69a0c"), 1.0)
    B.dome(top + ax * 0.004 * s, 0.006 * s, 0.008 * s, [(0, lin("#9aa52a")), (1, lin("#c6c94a"))], 1.0, segs=6,
           rings=2, up=ax)


def lavande(B, foot, s, rnd):
    """Lavande : touffe de tiges droites et de feuilles grises très fines ; en haut, un épi de verticilles de petites
    fleurs violettes, plus foncées et plus serrées vers la pointe."""
    for j in range(3):
        f = foot + Vector((rnd.uniform(-0.02, 0.02), rnd.uniform(-0.02, 0.02), 0))
        top = f + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0.32, 0.42) * s * TIGE_H))
        pts = stem(B, f, top, 0.003 * s, 0.0025 * s, 0.02 * s, rnd, sides=4)
        ax = head_axis(top, pts[-2])
        n = 7
        for k in range(n):
            t = k / (n - 1)
            c = top - ax * (0.11 * s) * (1 - t)
            rad = (0.011 - 0.005 * t) * s
            col = mix(lin("#8a5cf0"), lin("#5a33c2"), t)
            for m in range(5):
                a = m / 5 * math.tau + k * 0.6
                B.blob(c + Vector((math.cos(a), math.sin(a), 0)) * rad, (0.0062 - 0.002 * t) * s, col,
                       0.8 + 0.2 * t, squash=1.3)
    leaves(B, foot, 6, 0.09 * s, 0.008 * s, rnd, rise=1.3, droop=0.3,
           stops=[(0, lin("#56785a")), (1, lin("#9db59a"))], prof=lambda v: math.sin(math.pi * v) ** 0.3)


def eglantine(B, foot, s, rnd):
    """Églantine (rose sauvage) : cinq pétales larges en cœur, blancs à la base, rose vif au bord ; un cœur
    vert-jaune et une couronne dense d'étamines dorées ; feuilles dentées."""
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.26, 0.34) * s * TIGE_H))
    pts = stem(B, foot, top, 0.005 * s, 0.004 * s, 0.035 * s, rnd)
    leaves(B, foot, 3, 0.07 * s, 0.04 * s, rnd, rise=0.6, droop=0.7,
           prof=lambda v: math.sin(math.pi * v) ** 0.6 * (0.85 + 0.15 * math.cos(v * 30)))
    ax = head_axis(top, pts[-2])
    pink = [(0.0, lin("#fff3e6")), (0.3, lin("#ffd0e0")), (0.75, lin("#ff7bb0")), (1.0, lin("#f2588f"))]
    corolla(B, top, ax, 5, 0.058 * s, 0.062 * s, pink, 0.95, rnd, tilt=0.3, cup=0.3, curl=-0.15, notch=0.55,
            round_=1.0, nu=6, nv=4, prof=lambda v: math.sin(math.pi * min(1, 0.06 + v * 0.62)) ** 0.5, jitter=0.03)
    for k in range(16):
        a = k / 16 * math.tau
        r_ = 0.012 * s if k % 2 else 0.009 * s
        B.blob(top + ax * 0.007 * s + Vector((math.cos(a), math.sin(a), 0)) * r_, 0.0028 * s, lin("#ffc93a"), 1.0)
    B.dome(top + ax * 0.003 * s, 0.007 * s, 0.006 * s, [(0, lin("#c9c25a")), (1, lin("#e7d36a"))], 1.0, segs=6, rings=2,
           up=ax)


def campanule(B, foot, s, rnd):
    """Campanule : une tige qui s'arque, et deux ou trois clochettes penchées, violet bleuté, aux cinq lobes
    pointus retroussés."""
    top = foot + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), rnd.uniform(0.3, 0.38) * s * TIGE_H))
    pts = stem(B, foot, top, 0.0035 * s, 0.0025 * s, 0.05 * s, rnd)
    leaves(B, foot, 3, 0.07 * s, 0.03 * s, rnd, rise=0.5, droop=0.6)
    violet = [(0.0, lin("#5a4fd6")), (0.6, lin("#7b6df5")), (1.0, lin("#a69cff"))]
    for j, t in enumerate((1.0, 0.8, 0.62)[:rnd.randint(2, 3)]):
        p = pts[int(t * (len(pts) - 1))]
        out = Vector((math.cos(j * 2.3 + 1), math.sin(j * 2.3 + 1), 0))
        hang = p + out * 0.03 * s
        B.tube([p, p + out * 0.02 * s + UP * 0.005 * s, hang], [0.0018 * s] * 3, [t, t, 1.0], [ramp(TIGE, 1)] * 3, sides=3,
               cap=False)
        ax = Vector((out.x * 0.3, out.y * 0.3, -1)).normalized()   # la clochette pend
        bell = hang + UP * 0.002 * s
        corolla(B, bell, ax, 5, 0.042 * s, 0.036 * s, violet, 1.0, rnd, tilt=-1.38, cup=0.42, curl=0.5, nu=3, nv=4,
                prof=lambda v: 0.45 + 0.55 * v, jitter=0.02)
        B.dome(bell - ax * 0.004 * s, 0.006 * s, 0.006 * s, [(0, lin("#3d6b3a")), (1, lin("#4f8a45"))], 1.0, segs=5,
               rings=1, up=-ax)


def trefle(B, foot, s, rnd):
    """Trèfle des prés : feuilles à trois folioles rondes marquées d'un chevron pâle ; une tête ronde de petits
    fleurons roses, plus pâles à la pointe."""
    for k in range(4):                                   # feuilles
        a = rnd.uniform(0, math.tau)
        h = Vector((math.cos(a), math.sin(a), 0))
        lt = foot + h * 0.03 * s + UP * rnd.uniform(0.07, 0.12) * s
        B.tube([foot, foot.lerp(lt, 0.5) + h * 0.01 * s, lt], [0.002 * s] * 3, [0, 0.5, 1.0], [ramp(TIGE, 0.6)] * 3,
               sides=3, cap=False)
        for m in range(3):
            b = a + (m - 1) * 2.1
            d = Vector((math.cos(b), math.sin(b), 0.15)).normalized()
            B.petal(lt, d, UP, 0.03 * s, 0.026 * s, [(0, lin("#3f8f3e")), (0.45, lin("#9fd08a")),
                                                         (0.55, lin("#4b9a45")), (1, lin("#5aa84e"))],
                    0.9, 1.0, cup=0.2, curl=-0.2, nu=2, nv=3, prof=lambda v: math.sin(math.pi * min(1, 0.1 + v * 0.85)) ** 0.5)
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.16, 0.22) * s * TIGE_H))
    pts = stem(B, foot, top, 0.003 * s, 0.0025 * s, 0.02 * s, rnd, sides=4)
    c0 = top + UP * 0.02 * s
    B.dome(c0 - UP * 0.012 * s, 0.017 * s, 0.03 * s, [(0, lin("#c23c7c")), (1, lin("#e86aa6"))], 1.0, segs=8, rings=3)
    for k in range(44):                                  # la tête : des fleurons serrés, tournés vers le dehors
        phi = math.acos(1 - 2 * (k + 0.5) / 44 * 0.8)
        th = k * 2.39996
        dv = Vector((math.sin(phi) * math.cos(th), math.sin(phi) * math.sin(th), math.cos(phi)))
        col = mix(lin("#c9367a"), lin("#ffd0e6"), 1 - phi / math.pi * 0.9)
        side = dv.cross(UP).normalized() if abs(dv.z) < 0.95 else Vector((1, 0, 0))
        B.petal(c0 + dv * 0.012 * s, (dv + UP * 0.5).normalized(), side, 0.013 * s, 0.007 * s,
                [(0, mix(col, lin("#9e2c64"), 0.5)), (1, col)], 1.0, 1.0, cup=0.5, nu=1, nv=2)


def pissenlit(B, foot, s, rnd):
    """Pissenlit : rosette de feuilles dentées en dents de lion ; une tige creuse, et une tête plate de fines
    ligules jaunes sur plusieurs rangs, plus orangées au centre."""
    leaves(B, foot, 6, 0.13 * s, 0.035 * s, rnd, rise=0.25, droop=0.5,
           prof=lambda v: math.sin(math.pi * v) ** 0.5 * (0.55 + 0.45 * abs(math.sin(v * 14))))
    top = foot + Vector((rnd.uniform(-0.03, 0.03), rnd.uniform(-0.03, 0.03), rnd.uniform(0.22, 0.3) * s * TIGE_H))
    pts = stem(B, foot, top, 0.0045 * s, 0.004 * s, 0.025 * s, rnd, sides=6)
    ax = head_axis(top, pts[-2])
    for ring, (n, L, tilt) in enumerate(((22, 0.05, 0.2), (16, 0.038, 0.55), (10, 0.024, 0.9))):
        c0 = [lin("#e2cc00"), lin("#d8bc00"), lin("#cfa800")][ring]
        corolla(B, top + ax * 0.003 * ring * s, ax, n, L * s, 0.009 * s, [(0, c0), (1, mix(c0, lin("#ecda20"), 0.6))],
                0.95, rnd, tilt=tilt, cup=0.3, fringe=0.6, nu=1, nv=2, prof=lambda v: 0.6 + 0.4 * v)
    B.dome(top - ax * 0.008 * s, 0.012 * s, 0.01 * s, [(0, lin("#3e7a3a")), (1, lin("#5c9a4a"))], 0.95, segs=8, rings=1,
           up=ax)


def myosotis(B, foot, s, rnd):
    """Myosotis : tiges fines qui se ramifient ; à leur bout, des grappes de minuscules fleurs bleu ciel à cinq
    pétales ronds et à l'œil jaune, et des boutons roses."""
    for j in range(3):
        top = foot + Vector((rnd.uniform(-0.06, 0.06), rnd.uniform(-0.06, 0.06), rnd.uniform(0.18, 0.26) * s * TIGE_H))
        pts = stem(B, foot, top, 0.0025 * s, 0.002 * s, 0.03 * s, rnd, sides=4)
        for k in range(rnd.randint(4, 6)):
            a = k * 2.4 + j
            c = top + Vector((math.cos(a), math.sin(a), 0)) * (0.006 + 0.004 * k) * s + UP * rnd.uniform(-0.01, 0.006) * s
            if k >= 4:
                B.blob(c, 0.004 * s, lin("#ff9ec2"), 1.0, squash=1.3)
                continue
            sky = [(0, lin("#ffffff")), (0.25, lin("#7fb6ff")), (1, lin("#4f8dff"))]
            corolla(B, c, UP, 5, 0.012 * s, 0.012 * s, sky, 1.0, rnd, tilt=0.15, cup=0.2, nu=2, nv=2,
                    prof=lambda v: math.sin(math.pi * min(1, 0.15 + v * 0.75)) ** 0.4, jitter=0.02)
            B.blob(c + UP * 0.002 * s, 0.0025 * s, lin("#ffd23a"), 1.0, squash=0.6)
    leaves(B, foot, 4, 0.06 * s, 0.018 * s, rnd, rise=0.5, droop=0.5)


ESPECES = {"coquelicot": coquelicot, "bleuet": bleuet, "marguerite": marguerite, "bouton_or": bouton_or,
           "lavande": lavande, "eglantine": eglantine, "campanule": campanule, "trefle": trefle,
           "pissenlit": pissenlit, "myosotis": myosotis}


# ------------------------------------------------------------------------------------------------ herbe
BRINS = {"brin_sombre": ("#13703f", "#6fd24a"), "brin_clair": ("#3a9a2e", "#d4f26a"), "brin_menthe": ("#1d8a55", "#8ff08a")}


def blade(B, foot, a, h, w, bend, stops, rnd, seg=4):
    """Un brin : effilé, courbé (il monte puis s'arque vers `a`), un peu vrillé ; plié en V le long de sa nervure."""
    d = Vector((math.cos(a), math.sin(a), 0))
    side = Vector((-d.y, d.x, 0))
    tw = rnd.uniform(-0.6, 0.6)
    rows = []
    for i in range(seg + 1):
        t = i / seg
        ang = bend * t * t                               # l'arc : de plus en plus couché vers la pointe
        p = foot + UP * (h * math.sin(math.pi / 2 - ang) * t) + d * (h * math.sin(ang) * t)
        ww = w * (1 - t) ** 0.85 + 0.0006
        sd = Quaternion(UP, tw * t) @ side
        col = ramp(stops, t)
        rows.append([B.v(p - sd * ww, t, col), B.v(p + d * 0.12 * ww + UP * 0.1 * ww, t, col), B.v(p + sd * ww, t, col)])
    for r0, r1 in zip(rows, rows[1:]):
        B.face((r0[0], r0[1], r1[1], r1[0]))
        B.face((r0[1], r0[2], r1[2], r1[1]))


def touffe(B, foot, s, rnd, kind="brin_sombre", tall=1.0, lean_out=None, blades=(6, 11)):
    """Une touffe : 6 à 11 brins (ou `blades`) de hauteurs et de courbures variées, les plus hauts au centre."""
    foot_c, tip_c = BRINS[kind]
    stops = [(0.0, lin(foot_c)), (0.55, mix(lin(foot_c), lin(tip_c), 0.6)), (1.0, lin(tip_c))]
    n = rnd.randint(*blades)
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        if lean_out is not None:
            a = math.atan2(lean_out.y, lean_out.x) + rnd.uniform(-0.9, 0.9)
        r = rnd.uniform(0, 0.022) * s
        f = foot + Vector((math.cos(a) * r, math.sin(a) * r, -0.01))
        h = rnd.uniform(0.13, 0.3) * s * tall * (1.15 - r / (0.022 * s) * 0.4)
        blade(B, f, a, h, rnd.uniform(0.006, 0.011) * s * BRIN_W, rnd.uniform(0.25, 1.05), stops, rnd)


def graminee(B, foot, s, rnd):
    """Une graminée : une tige fine qui s'arque, et un épi lâche de petits épillets dorés ; deux brins au pied."""
    top = foot + Vector((rnd.uniform(-0.05, 0.05), rnd.uniform(-0.05, 0.05), rnd.uniform(0.36, 0.48) * s * TIGE_H))
    pts = stem(B, foot, top, 0.0022 * s, 0.0014 * s, 0.05 * s, rnd, sides=3)
    ax = head_axis(top, pts[-2], 0.35)
    for k in range(9):
        t = k / 8
        c = top - (top - pts[-3]) * (1 - t) * 0.9
        side = Vector((math.cos(k * 2.2), math.sin(k * 2.2), 0))
        d = (ax + side * 0.9).normalized()
        B.petal(c, d, side.cross(d), 0.022 * s, 0.008 * s, [(0, lin("#b9a75a")), (1, lin("#e8d98c"))],
                0.9, 1.0, cup=0.3, nu=1, nv=2)
    touffe(B, foot, s * 0.7, rnd, "brin_clair", tall=0.8)


# ------------------------------------------------------------------------------------------------ buissons
FEUILLES = [("#1c6a3a", "#3f9a46"), ("#24804a", "#6cbf4f"), ("#2f8a3e", "#9fd45c"), ("#17603a", "#4fae5a")]


def _clump_core(B, c, r, rnd, col, flex):
    """Le cœur d'une touffe de feuillage : une boule à facettes un peu irrégulière (elle bouche les trous)."""
    res = bmesh.ops.create_icosphere(B.bm, subdivisions=1, radius=r)
    for v in res["verts"]:
        v.co = c + v.co * (1 + rnd.uniform(-0.12, 0.12)) * Vector((1, 1, 0.85))
        B.flex.append(flex * max(0.0, (v.co.z - c.z + r) / (2 * r)))
        B.col.append(col)
    for f in {f for v in res["verts"] for f in v.link_faces}:
        f.material_index = 0


def buisson(B, foot, rad, rnd, kind="feuillu", density=1.0):
    """Un buisson de prairie : quelques rameaux bruns au pied, trois à cinq touffes de feuillage serrées (un cœur sombre
    couvert de petites feuilles tournées vers le dehors, plus claires en pointe, en plusieurs verts). Selon `kind` :
    des grappes de baies rouges (« baies ») ou de petites fleurs d'églantier blanches et roses (« fleuri »)."""
    clumps = []
    n = rnd.randint(3, 5)
    for k in range(n):
        a = k / n * math.tau + rnd.uniform(-0.4, 0.4)
        d = rad * (0.45 if k else 0.0) * rnd.uniform(0.7, 1.0)
        r = rad * (0.62 if k else 0.72) * rnd.uniform(0.85, 1.1)
        c = foot + Vector((math.cos(a) * d, math.sin(a) * d, r * 0.75 + (0.15 * rad if k == 0 else 0)))
        clumps.append((c, r))
    bark = [(0, lin("#4a3424")), (1, lin("#6b4c34"))]
    for c, r in clumps[:3]:                               # rameaux visibles au pied
        B.tube([foot + Vector((0, 0, -0.01)), foot.lerp(c, 0.5) + Vector((0, 0, 0.02)), c - Vector((0, 0, r * 0.4))],
               [0.012 * rad / 0.3, 0.009 * rad / 0.3, 0.006 * rad / 0.3], [0, 0.1, 0.2], [ramp(bark, 0), ramp(bark, 0.5), ramp(bark, 1)],
               sides=4)
    for c, r in clumps:
        _clump_core(B, c, r * 0.86, rnd, lin("#2f8a42"), 0.3)   # vert moyen : les jours entre les feuilles ne font pas de trous
    for c, r in clumps:                                   # les feuilles : couchées sur la touffe, en écailles
        m = int(150 * density * (r / 0.2) ** 2)
        for k in range(m):
            z = rnd.uniform(-0.3, 1.0)
            th = rnd.uniform(0, math.tau)
            dv = Vector((math.sqrt(1 - z * z) * math.cos(th), math.sqrt(1 - z * z) * math.sin(th), z))
            p = c + dv * r * rnd.uniform(0.84, 0.98)
            # la feuille file le long de la touffe (vers le haut et un peu de côté), sa face tournée vers le dehors
            t = (UP - dv * dv.z) if abs(dv.z) < 0.97 else Vector((math.cos(th), math.sin(th), 0))
            t = (t.normalized() + dv.cross(UP).normalized() * rnd.uniform(-0.8, 0.8) * (abs(dv.z) < 0.97)).normalized()
            out = (t + dv * 0.18).normalized()             # presque couchée : les feuilles se recouvrent
            base_c, tip_c = FEUILLES[rnd.randrange(len(FEUILLES))]
            fl = 0.3 * max(0.0, min(1.0, (p.z - foot.z) / (2 * rad)))
            B.petal(p - out * r * 0.12, out, dv, r * rnd.uniform(0.3, 0.36), r * rnd.uniform(0.24, 0.28),
                    [(0, lin(base_c)), (1, lin(tip_c))], fl, fl, cup=0.18, curl=-0.3, twist=rnd.uniform(-0.15, 0.15),
                    prof=lambda v: math.sin(math.pi * min(1, 0.1 + v * 0.82)) ** 0.5, round_=1.0, nu=2, nv=2)
    if kind == "baies":
        for c, r in clumps:
            for g in range(rnd.randint(2, 4)):
                z = rnd.uniform(0.0, 0.9); th = rnd.uniform(0, math.tau)
                dv = Vector((math.sqrt(1 - z * z) * math.cos(th), math.sqrt(1 - z * z) * math.sin(th), z))
                p0 = c + dv * r * 0.95
                for b in range(rnd.randint(3, 5)):
                    q = p0 + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 0.3))) * 0.018 * rad / 0.3
                    rb, red = 0.013 * rad / 0.3, mix(lin("#d42a22"), lin("#ff4a3a"), rnd.random())
                    B.dome(q, rb, rb, [(0, red), (1, lin("#ff9a8a"))], 0.3, segs=6, rings=2)          # une baie ronde :
                    B.dome(q, rb, rb, [(0, red), (1, lin("#8e1212"))], 0.3, segs=6, rings=2, up=-UP)  # deux demi-sphères
    if kind == "fleuri":
        pink = [(0, lin("#fff3e6")), (0.5, lin("#ffd3e2")), (1.0, lin("#ff8fb8"))]
        white = [(0, lin("#f2f5e8")), (1.0, lin("#ffffff"))]
        for c, r in clumps:
            for g in range(rnd.randint(3, 6)):
                z = rnd.uniform(0.1, 0.95); th = rnd.uniform(0, math.tau)
                dv = Vector((math.sqrt(1 - z * z) * math.cos(th), math.sqrt(1 - z * z) * math.sin(th), z))
                p = c + dv * r * 0.97
                corolla(B, p, dv, 5, 0.036 * rad / 0.3, 0.036 * rad / 0.3, pink if rnd.random() < 0.6 else white, 0.3,
                        rnd, tilt=0.25, cup=0.25, notch=0.5, round_=1.0, nu=2, nv=2, jitter=0.03)
                B.blob(p + dv * 0.004, 0.006 * rad / 0.3, lin("#ffc93a"), 0.3, squash=0.6)
