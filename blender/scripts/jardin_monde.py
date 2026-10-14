"""Le mini-monde du jardinage (section Services), sa végétation refaite dans le style de l'îlot (flore.py) — un jardin
EN COURS DE TRAVAIL :
- la haie : côté taille-haie, taillée au cordeau (un tapis serré de petites feuilles sur un volume net) ; côté
  palissade, encore en broussaille, plus volumineuse et plus large en bas qu'en haut (buissons de l'îlot, pousses folles) ;
- au pied de la partie taillée, près du taille-haie, les coupes : feuilles et brindilles tombées (« Feuilles tombées ») ;
- la pelouse : des bandes de tonte claires et sombres là où la tondeuse est passée (à sa gauche, et derrière elle) ;
  devant elle et à sa droite, l'herbe encore haute (touffes et graminées de l'îlot) et quelques fleurs sauvages ;
- un massif de fleurs le long de la palissade et au pied du pilier (couleurs de l'îlot) ; deux buissons de l'îlot
  (à baies au bout du massif, fleuri au pied du pilier).
Pas de vent (demandé). Chaque pièce garde son objet, son nom et sa place (js/assemblage.js les fait pousser une à une) :
seule sa géométrie change. Repère : celui du monde de Blender après import du glb (z en haut, pelouse à z = 0).
Usage : exécuté par mondes_maj.py (même espace de noms), après l'import des mini-mondes."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix
exec(open("/Users/amandindardenne/Desktop/homeservice/blender/scripts/flore.py").read())

BRIN_W = 1.6                                        # comme sur l'îlot (remplace_flore.py)
TIGE_H = 0.78
ECH = 0.73                                          # le mini-monde est à 0,73 de l'îlot (la tondeuse : 1,02 m contre 1,39)
rnd = random.Random(1904)

# ------------------------------------------------------------------------------------------------ le terrain
HAIE = dict(x0=-0.94, x1=0.48, y0=0.54, y1=0.87, h=0.40)
XB = -0.28                                          # limite broussaille (côté palissade) | taillé (côté taille-haie)
TONDEUSE = Vector((0.2, -0.24))                     # le plateau de coupe
CAP = Vector((-0.32, 0.95)).normalized()            # elle avance vers la haie
TRAVERS = Vector((CAP.y, -CAP.x))                   # vers sa droite
BANDE = 0.42                                        # largeur d'un passage
PILIER = Vector((0.6, 0.975))
pel = bpy.data.objects["Jardin · pelouse"]
_mw = pel.matrix_world
_top = [(_mw @ v.co) for v in pel.data.vertices if (_mw @ v.co).z > -0.003]
_c = sum(_top, Vector()) / len(_top)
CONTOUR = sorted([Vector((p.x, p.y)) for p in _top], key=lambda q: math.atan2(q.y - _c.y, q.x - _c.x))


def dans_pelouse(p, marge=0.0):
    """p (x, y) est sur la pelouse, à `marge` m au moins du bord (contour en étoile autour du centre)."""
    a = math.atan2(p.y - _c.y, p.x - _c.x)
    best = min(CONTOUR, key=lambda q: abs(math.atan2(q.y - _c.y, q.x - _c.x) - a))
    return (p - Vector((_c.x, _c.y))).length < (best - Vector((_c.x, _c.y))).length - marge


def passage(p):
    """Le numéro du passage de tondeuse (0 = le sien ; négatif = déjà tondu, à sa gauche) et l'avance le long du cap."""
    d = p - TONDEUSE
    return math.floor(d.dot(TRAVERS) / BANDE + 0.5), d.dot(CAP)


def tondu(p):
    k, av = passage(p)
    return k < 0 or (k == 0 and av < 0.12)


# les obstacles (boîtes au sol) : rien n'y pousse
OBST = [(-1.05, -0.9, -0.75, 1.0),                   # la palissade
        (HAIE["x0"] - 0.02, HAIE["x1"] + 0.03, HAIE["y0"] - 0.03, 1.2),
        (0.45, 0.75, 0.83, 1.12),                    # le pilier
        (-0.14, 0.87, 0.30, 0.46),                   # le taille-haie posé
        ]


def libre(p, r=0.0):
    if not dans_pelouse(p, 0.05):
        return False
    for x0, x1, y0, y1 in OBST:
        if x0 - r < p.x < x1 + r and y0 - r < p.y < y1 + r:
            return False
    # la tondeuse : un disque autour du plateau, et son guidon
    if (p - TONDEUSE).length < 0.36 + r:
        return False
    return True


def vers(objet, B):
    """Remplace la géométrie de `objet` par celle de B (construite dans le repère du monde)."""
    me = B.mesh(objet.data.name)
    me.attributes.remove(me.attributes["souplesse"])  # pas de vent dans les mini-mondes
    me.transform(objet.matrix_world.inverted())
    vieux = objet.data
    objet.data = me
    bpy.data.meshes.remove(vieux)
    print("JARDIN", objet.name, len(me.polygons), "faces")


# ------------------------------------------------------------------------------------------------ la haie
HAIE_F = [("#17603a", "#3f9a46"), ("#1c6a3a", "#4fae5a"), ("#24804a", "#6cbf4f")]


def feuille_couchee(B, p, n, longueur, largeur, clair=0.0, nu=1, nv=2):
    """Une petite feuille posée sur une surface (sa face vers n), dans une direction au hasard."""
    t = n.cross(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))).normalized()
    base_c, tip_c = HAIE_F[rnd.randrange(len(HAIE_F))]
    tip = mix(lin(tip_c), lin("#9fd45c"), clair)
    B.petal(p - t * longueur * 0.45 + n * 0.004, (t + n * 0.12).normalized(), n, longueur, largeur,
            [(0, lin(base_c)), (1, tip)], 0, 0, cup=0.15, curl=-0.2, round_=1.0,
            prof=lambda v: math.sin(math.pi * min(1, 0.1 + v * 0.82)) ** 0.5, nu=nu, nv=nv)


def haie(B):
    H = HAIE
    y0, y1, h = H["y0"], H["y1"], H["h"]
    coeur = lin("#1f6a35")

    def boite(x0, x1, ya, yb, z1):
        c = [B.v(Vector((x, y, z)), 0, coeur) for x in (x0, x1) for y in (ya, yb) for z in (0, z1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            B.face([c[i] for i in q])

    # partie taillée (côté taille-haie) : un volume net (cœur vert sombre) couvert d'un tapis de petites feuilles
    x0, x1 = XB, H["x1"]
    boite(x0, x1 - 0.015, y0 + 0.015, y1 - 0.015, h - 0.015)
    faces = [  # (tirage d'un point, normale, clair, part)
        (lambda: Vector((rnd.uniform(x0, x1), rnd.uniform(y0, y1), h)), UP, 0.6, 1.0),
        (lambda: Vector((rnd.uniform(x0, x1), y0, rnd.uniform(0.02, h))), Vector((0, -1, 0)), 0.2, 1.0),
        (lambda: Vector((x1, rnd.uniform(y0, y1), rnd.uniform(0.02, h))), Vector((1, 0, 0)), 0.2, 0.45),
        (lambda: Vector((rnd.uniform(x0, x1), y1, rnd.uniform(h * 0.6, h))), Vector((0, 1, 0)), 0.0, 0.25),
    ]
    for tire, n, clair, part in faces:
        for k in range(int(620 * part)):
            p = tire()
            nn = n
            # arêtes du haut un peu arrondies : les feuilles du bord s'inclinent
            if n.z == 0 and p.z > h - 0.03:
                nn = (n + UP * 0.8).normalized()
            if n.z == 1 and (p.y - y0 < 0.025):
                nn = (n + Vector((0, -0.8, 0))).normalized()
            feuille_couchee(B, p, nn, rnd.uniform(0.04, 0.05), rnd.uniform(0.028, 0.034), clair * rnd.uniform(0.5, 1))

    # partie en broussaille (côté palissade) : plus volumineuse que le taillé, et comme une vraie haie laissée à
    # elle-même, plus large en bas qu'en haut — une rangée de gros buissons de l'îlot posés au sol (l'assise), une
    # rangée plus petite par-dessus (la hauteur) ; un cœur sombre dans le bas, couvert de feuilles en désordre
    xb0, xb1, yc0, hc = H["x0"] + 0.02, XB, y0 + 0.04, 0.3
    boite(xb0, xb1, yc0, y1 - 0.02, hc)
    bas = [(lambda: Vector((rnd.uniform(xb0, xb1), yc0, rnd.uniform(0.0, hc))), Vector((0, -1, 0)), 520),
           (lambda: Vector((xb0, rnd.uniform(yc0, y1 - 0.02), rnd.uniform(0.0, hc))), Vector((-1, 0, 0)), 140)]
    for tire, n, m in bas:
        for k in range(m):
            p = tire()
            nn = (n + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(-0.3, 0.6)))).normalized()
            feuille_couchee(B, p + n * rnd.uniform(0.0, 0.03), nn, rnd.uniform(0.045, 0.065), rnd.uniform(0.03, 0.04),
                            rnd.uniform(0.0, 0.5))
    for x in (xb0 + 0.12, (xb0 + xb1) / 2, xb1 - 0.1):           # l'assise, au sol, bombée vers la pelouse
        buisson(B, Vector((x + rnd.uniform(-0.02, 0.02), 0.6, 0.0)), 0.34 * rnd.uniform(0.95, 1.05),
                random.Random(rnd.random()), "feuillu", density=0.45)
    for x in (xb0 + 0.2, xb1 - 0.2):                             # la hauteur, par-dessus, en retrait
        buisson(B, Vector((x + rnd.uniform(-0.02, 0.02), 0.68, 0.27)), 0.27 * rnd.uniform(0.95, 1.05),
                random.Random(rnd.random()), "feuillu", density=0.5)
    for k in range(9):                                            # l'herbe qui remonte à son pied
        x = xb0 + (xb1 - xb0) * (k + rnd.uniform(0.2, 0.8)) / 9
        touffe(B, Vector((x, 0.36 - rnd.uniform(0.0, 0.04), 0)), rnd.uniform(0.5, 0.65), random.Random(rnd.random()),
               "brin_sombre", blades=(4, 6), lean_out=Vector((0, -1, 0)))
    # les pousses folles : des rameaux fins qui dépassent, quelques feuilles au bout
    for k in range(11):
        x = rnd.uniform(xb0 + 0.05, xb1 - 0.03)
        y = rnd.uniform(y0 + 0.05, y1 - 0.05)
        pied = Vector((x, y, rnd.uniform(0.52, 0.6)))
        d = Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.6, 0.2), 1)).normalized()
        L = rnd.uniform(0.12, 0.22)
        bout = pied + d * L
        stem(B, pied, bout, 0.004, 0.0025, 0.04, rnd, sides=3)
        for j in range(3):
            q = pied.lerp(bout, 0.5 + 0.25 * j)
            dd = (d + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)) * 0.8).normalized()
            base_c, tip_c = HAIE_F[rnd.randrange(len(HAIE_F))]
            B.petal(q, dd, UP, 0.045, 0.03, [(0, lin(base_c)), (1, lin(tip_c))], 0, 0, cup=0.2, round_=1.0,
                    prof=lambda v: math.sin(math.pi * min(1, 0.1 + v * 0.82)) ** 0.5, nu=1, nv=2)


def coupes(B):
    """Ce que le taille-haie a fait tomber : des feuilles à plat et des brindilles, au pied de la partie taillée (entre
    la haie et le taille-haie posé, et un peu autour de lui)."""
    xa, xb = XB + 0.03, HAIE["x1"] - 0.02
    for k in range(150):
        p = Vector((rnd.uniform(xa, xb), HAIE["y0"] - abs(rnd.gauss(0, 0.07)) - 0.01, 0.004))   # plus dense contre la haie
        n = (UP + Vector((rnd.uniform(-0.3, 0.3), rnd.uniform(-0.3, 0.3), 0))).normalized()
        feuille_couchee(B, p, n, rnd.uniform(0.035, 0.05), rnd.uniform(0.025, 0.032), 0.3)
    for k in range(14):
        a = Vector((rnd.uniform(xa, xb), HAIE["y0"] - abs(rnd.gauss(0, 0.06)) - 0.02, 0.006))
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-0.4, 0.4), 0)).normalized()
        b = a + d * rnd.uniform(0.06, 0.12)
        stem(B, a, b + Vector((0, 0, 0.01)), 0.0035, 0.0022, 0.01, rnd, sides=3)
        for j in range(2):
            q = a.lerp(b, 0.55 + 0.35 * j) + Vector((0, 0, 0.006))
            dd = (d + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0))).normalized()
            base_c, tip_c = HAIE_F[rnd.randrange(len(HAIE_F))]
            B.petal(q, dd, UP, 0.04, 0.028, [(0, lin(base_c)), (1, lin(tip_c))], 0, 0, cup=0.2, round_=1.0, nu=1, nv=2)


# ------------------------------------------------------------------------------------------------ l'herbe, les fleurs
def herbe(B):
    n_haute = n_rase = 0
    pas = 0.1
    xs = [x * pas for x in range(-14, 15)]
    for x in xs:
        for y in xs:
            p = Vector((x + rnd.uniform(-0.04, 0.04), y + rnd.uniform(-0.04, 0.04)))
            if not libre(p, 0.02):
                continue
            if not tondu(p):                          # l'herbe haute, pas encore tondue
                touffe(B, Vector((p.x, p.y, 0)), rnd.uniform(0.62, 0.8), random.Random(rnd.random()),
                       rnd.choice(("brin_sombre", "brin_clair", "brin_menthe")), blades=(4, 7))
                n_haute += 1
                if rnd.random() < 0.12:
                    graminee(B, Vector((p.x + 0.02, p.y, 0)), rnd.uniform(0.55, 0.7), random.Random(rnd.random()))
            elif rnd.random() < 0.08:                 # sur le tondu, quelques brins ras (le bord, les oublis)
                touffe(B, Vector((p.x, p.y, 0)), 0.3, random.Random(rnd.random()), "brin_clair", tall=0.6, blades=(3, 5))
                n_rase += 1
    # au pied de la palissade et du muret, là où la tondeuse ne passe pas : une frange d'herbe
    for k in range(26):
        p = Vector((rnd.uniform(-0.88, -0.82), rnd.uniform(-0.62, 0.3)))
        if dans_pelouse(p, 0.04):
            touffe(B, Vector((p.x, p.y, 0)), rnd.uniform(0.45, 0.6), random.Random(rnd.random()), "brin_sombre",
                   blades=(4, 6), lean_out=Vector((1, 0, 0)))
    print("HERBE", n_haute, "touffes hautes,", n_rase, "rases")


def fleurs(B):
    F = 0.95                                         # FLEUR de l'îlot (1,35) × 0,73, un peu plus pour le massif
    n = 0
    # le massif le long de la palissade : lavande au fond, puis marguerites, boutons d'or, myosotis devant
    rangs = [(-0.88, ("lavande",)), (-0.8, ("marguerite", "campanule", "lavande")),
             (-0.72, ("bouton_or", "myosotis", "marguerite", "coquelicot"))]
    for xr, especes in rangs:
        y = -0.5
        while y < 0.18:
            p = Vector((xr + rnd.uniform(-0.025, 0.025), y))
            if dans_pelouse(p, 0.04):
                ESPECES[rnd.choice(especes)](B, Vector((p.x, p.y, 0)), F * rnd.uniform(0.85, 1.1), random.Random(rnd.random()))
                n += 1
            y += rnd.uniform(0.07, 0.11)
    # autour du pilier (dans l'herbe haute) : coquelicots, campanules, marguerites
    for k in range(16):
        a, r = rnd.uniform(math.pi * 1.05, math.pi * 1.95), rnd.uniform(0.22, 0.42)
        p = PILIER + Vector((math.cos(a) * r, math.sin(a) * r * 0.8))
        if libre(p, 0.03):
            sp = rnd.choice(("coquelicot", "campanule", "marguerite", "coquelicot", "bleuet"))
            ESPECES[sp](B, Vector((p.x, p.y, 0)), F * rnd.uniform(0.85, 1.1), random.Random(rnd.random()))
            n += 1
    # quelques fleurs sauvages dans l'herbe haute
    for k in range(60):
        p = Vector((rnd.uniform(-1.2, 1.2), rnd.uniform(-1.2, 1.2)))
        if libre(p, 0.03) and not tondu(p) and rnd.random() < 0.5:
            sp = rnd.choice(("pissenlit", "trefle", "marguerite", "bouton_or", "bleuet"))
            ESPECES[sp](B, Vector((p.x, p.y, 0)), F * rnd.uniform(0.75, 0.95), random.Random(rnd.random()))
            n += 1
    print("FLEURS", n)


def buissons(B):
    buisson(B, Vector((-0.74, -0.78, 0)), 0.19, random.Random(rnd.random()), "baies", density=0.8)   # au bout du massif
    buisson(B, Vector((0.83, 0.66, 0)), 0.19, random.Random(rnd.random()), "fleuri", density=0.8)


# ------------------------------------------------------------------------------------------------ les bandes de tonte
def bandes():
    """Sur le dessus de la pelouse, là où la tondeuse est passée : des bandes alternées, claires et sombres, dans le
    sens de la tonte (un quadrillage fin, juste au-dessus du gazon, gardé dans l'objet de la pelouse)."""
    base = next(m for m in pel.data.materials if m.name == "Pelouse")
    bsdf = next(n for n in base.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    c = Vector(bsdf.inputs["Base Color"].default_value[:3])
    mats = []
    for nom, k in (("Pelouse tondue claire", 1.32), ("Pelouse tondue sombre", 0.74)):
        m = bpy.data.materials.get(nom) or base.copy()
        m.name = nom
        bs = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bs.inputs["Base Color"].default_value = (*(c * k), 1)
        if m.name not in [x.name for x in pel.data.materials]:
            pel.data.materials.append(m)
        mats.append([x.name for x in pel.data.materials].index(m.name))
    bm = bmesh.new()
    bm.from_mesh(pel.data)
    inv = pel.matrix_world.inverted()
    # un quadrillage TOURNÉ dans le sens de la tonte (axes : travers, cap), dont 10 colonnes font un passage : les
    # limites entre bandes tombent sur ses lignes et sont droites (un quadrillage droit les faisait en escalier)
    du, dt = BANDE / 10, 0.03
    n = 0
    for i in range(-60, 61):
        for j in range(-90, 91):
            u, t = -BANDE / 2 + i * du, j * dt
            coins = [TONDEUSE + TRAVERS * (u + a) + CAP * (t + b) for a, b in ((0, 0), (du, 0), (du, dt), (0, dt))]
            centre = TONDEUSE + TRAVERS * (u + du / 2) + CAP * (t + dt / 2)
            if not tondu(centre) or not all(dans_pelouse(q, 0.06) for q in coins):
                continue
            k, _ = passage(centre)
            f = bm.faces.new([bm.verts.new(inv @ Vector((q.x, q.y, 0.0015))) for q in coins])
            f.material_index = mats[k % 2]
            n += 1
    bm.to_mesh(pel.data)
    bm.free()
    print("BANDES", n, "carreaux")


def jardin():
    O = bpy.data.objects
    B = Flore(); _ = flore_materials(); haie(B); vers(O["Haie taillée · feuillage"], B)
    B = Flore(); coupes(B); vers(O["Feuilles tombées"], B)
    B = Flore(); herbe(B); vers(O["Herbe · touffes"], B)
    B = Flore(); fleurs(B); vers(O["Fleurs"], B)
    B = Flore(); buissons(B); vers(O["Boules du coin"], B)
    bandes()
