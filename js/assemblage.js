// L'assemblage des mini-mondes, recopié tel quel du site immersif (homeservice-immersive/web/js/app.js : MINI_ASM,
// MINI_CHOREO, asmBuild, asmApply, MINI_EXIT, exitApply, exitReset). Chaque diorama se construit pièce par pièce
// (le sol d'abord, puis les meubles, les objets qui tombent du ciel en se balançant, les détails) ; pour laisser la
// place au suivant, il s'envole (chorégraphie de sortie propre au service). Les pièces sont retrouvées par leur nom
// (models/minimondes.glb ; noms Blender, espaces → « _ », points retirés).
import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;

// [vitesse de l'assemblage (× les temps de MINI_CHOREO), vitesse du démontage (× l'assemblage), hauteur d'une pose
// (m, repère du diorama), hauteur d'une chute du ciel (m), tassement à l'arrivée d'une chute (part de la hauteur)]
// balancement d'une chute vivante : [bascule max (rad), rotation sur elle-même (rad), dérive latérale (m)]
// hauteur de l'envol à la disparition (m)
const MINI_ASM = { speed: 1.2, out: 2.4, drop: 0.45, fall: 1.1, squash: 0.12, sway: { tilt: 0.18, spin: 0.45, drift: 0.14 },
  lift: 1.3 };
const asmKids = (w, re) => w.children.filter((o) => re.test(o.name));
const asmSub = (w, groupRe, re = /./) => asmKids(w, groupRe).flatMap((g) => g.children.filter((o) => re.test(o.name)));
const asmEach = (nodes) => nodes.map((n) => [n]);
const asmOne = (nodes) => (nodes.length ? [nodes] : []);
const asmBy = (nodes, key) => {                         // regroupe les nœuds par clé (dans l'ordre des clés)
  const m = new Map();
  for (const n of nodes) { const k = key(n); if (!m.has(k)) m.set(k, []); m.get(k).push(n); }
  return [...m.keys()].sort().map((k) => m.get(k));
};
const MINI_CHOREO = {
  nettoyage: [
    [(w) => asmEach(asmKids(w, /^Carreau/)), 'tile', 0, 0.02, 0.5, { from: [-1, 1] }],
    [(w) => asmEach(asmKids(w, /^Meuble/)), 'fall', 0.75, 0, 0.65, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Seau_arrondi/)), 'fall', 1.0, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /seau_d/)), 'fall', 1.12, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Pulv/)), 'fall', 1.3, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /balai/)), 'fall', 1.45, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Panneau/)), 'fall', 1.6, 0, 0.45, { sway: 1, h: 0.5 }],
    [(w) => asmEach(asmKids(w, /ponge/)), 'fall', 1.72, 0, 0.45, { sway: 1, h: 0.4 }],
  ],
  desencombrement: [
    [(w) => asmEach(asmKids(w, /^Lame_\d/)), 'slide', 0, 0.035, 0.6, { along: 'z', order: 'x' }],
    // les trois cartons de la pile tombent l'un après l'autre et s'empilent ; le quatrième à côté
    [(w) => asmBy(asmSub(w, /pile/), (n) => (/tiquette/.test(n.name) ? '1' : (n.name.match(/_(\d)\d{3}_/) || [0, '1'])[1]))
      .slice(0, 3), 'fall', 0.85, 0.22, 0.6, { sway: 1 }],
    [(w) => asmBy(asmSub(w, /pile/), (n) => (/tiquette/.test(n.name) ? '1' : (n.name.match(/_(\d)\d{3}_/) || [0, '1'])[1]))
      .slice(3), 'fall', 1.05, 0, 0.6, { sway: 1 }],
    // le carton d'abord, puis la chaise retournée tombe dessus
    [(w) => asmOne(asmKids(w, /chaise_\(proto/)), 'fall', 1.0, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Chaise_retourn/)), 'fall', 1.3, 0, 0.6, { sway: 1 }],
    [(w) => asmOne(asmKids(w, /Service/)), 'fall', 1.2, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Sac/)), 'fall', 1.7, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Lame_d/)), 'tilt', 1.8, 0.08, 0.55, { axis: 'x', a: 0.5 }],
  ],
  livraison: [
    [(w) => asmEach(asmKids(w, /^Pierre_cour/)), 'tile', 0, 0.022, 0.5, { fromNode: /^Porte/ }],
    [(w) => asmEach(asmKids(w, /^Seuil/)), 'pop', 0.65, 0, 0.4],
    [(w) => asmEach(asmKids(w, /^Encadrement/)), 'grow', 0.7, 0, 0.55],
    [(w) => asmOne(asmKids(w, /^(Porte|Panneau_porte|Poign|Num)/)), 'swing', 0.95, 0, 0.8, { a: -1.3 }],
    [(w) => asmEach(asmKids(w, /^Plante/)), 'fall', 1.15, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Paillasson/)), 'unroll', 1.3, 0, 0.5, { along: 'x' }],
    [(w) => asmOne(asmSub(w, /colis/).filter((n) => !/etit/.test(n.name))), 'fall', 1.4, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /Service/)), 'fall', 1.55, 0, 0.6, { sway: 1 }],
    [(w) => asmOne(asmSub(w, /colis/).filter((n) => /etit/.test(n.name))), 'fall', 1.7, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Diable/)), 'slide', 1.75, 0, 0.7, { along: 'x', d: 0.9, sign: 1 }],
  ],
  montage: [
    [(w) => asmOne(asmKids(w, /^Tapis/)), 'fall', 0, 0, 0.6],
    [(w) => asmOne(asmSub(w, /kit/, /^(C.t._droit|Trou)/)), 'fall', 0.6, 0, 0.6, { sway: 0.6 }],
    [(w) => asmEach(asmSub(w, /kit/, /^Carton/)), 'fall', 0.7, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmSub(w, /kit/, /^Fond/)), 'fall', 0.85, 0, 0.6, { sway: 0.6 }],
    [(w) => asmEach(asmSub(w, /kit/, /^C.t._gauche/)), 'fall', 1.0, 0, 0.6, { sway: 0.6 }],
    [(w) => asmOne(asmSub(w, /Service/, /^(Caisse|Couvercle|Fermoir|Poign.e_caisse|Montant)/)), 'fall', 1.05, 0, 0.6, { sway: 1 }],
    [(w) => asmOne(asmKids(w, /tabouret/)), 'fall', 1.2, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmSub(w, /kit/, /^Tablette/)), 'slide', 1.15, 0.15, 0.55, { along: 'x', d: 0.5, sign: 1 }],
    [(w) => asmOne(asmSub(w, /kit/, /^Notice/)), 'unroll', 1.35, 0, 0.45, { along: 'z' }],
    [(w) => asmEach(asmSub(w, /kit/, /^Planche/)), 'fall', 1.45, 0, 0.6, { sway: 1 }],
    [(w) => asmBy(asmSub(w, /kit/, /^(Vis|T.te_vis)/), (n) => (n.name.match(/_(\d)\d{3}_/) || [0, '0'])[1]), 'pop', 1.55, 0.04, 0.35],
    [(w) => asmEach(asmSub(w, /kit/, /^Cheville/)), 'pop', 1.65, 0.04, 0.35],
    [(w) => asmOne(asmSub(w, /Service/, /^(Batterie|Corps|Poign.e_visseuse|Mandrin|Embout)/)), 'fall', 1.65, 0, 0.6, { sway: 1 }],
    [(w) => asmOne(asmSub(w, /kit/, /^Cl._Allen/)), 'pop', 1.75, 0, 0.35],
    [(w) => asmOne(asmSub(w, /kit/, /tournevis/)), 'fall', 1.8, 0, 0.55, { sway: 1 }],
    [(w) => asmOne(asmSub(w, /Service/, /^Cl./)), 'pop', 1.9, 0, 0.35],
  ],
  jardinage: [
    // le sol (terre + gazon) d'un seul bloc, puis tout tombe du ciel comme au désencombrement ; la haie, les
    // petits buissons, l'herbe, les fleurs, les cailloux et les feuilles au pied de la haie, eux, sortent du sol
    [(w) => asmOne(asmKids(w, /(terre|pelouse)/)), 'fall', 0, 0, 0.6],
    [(w) => asmEach(asmKids(w, /^Muret/)), 'fall', 0.6, 0, 0.6, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Barri/)), 'fall', 0.75, 0, 0.6, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Haie/)), 'grow', 0.9, 0, 0.6],
    [(w) => asmEach(asmKids(w, /^Boules/)), 'grow', 1.1, 0, 0.55],
    [(w) => asmEach(asmKids(w, /^Herbe/)), 'grow', 1.15, 0, 0.5],
    [(w) => asmEach(asmKids(w, /tondeuse/)), 'fall', 1.25, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Cailloux/)), 'grow', 1.35, 0, 0.55],
    [(w) => asmEach(asmKids(w, /^Fleurs/)), 'grow', 1.45, 0, 0.55],
    [(w) => asmEach(asmKids(w, /taille/)), 'fall', 1.55, 0, 0.6, { sway: 1 }],
    [(w) => asmEach(asmKids(w, /^Feuilles/)), 'grow', 1.6, 0, 0.55],
  ],
};
const easeOut = (u) => 1 - (1 - u) ** 3;
const easeBack = (u, s = 0.7) => 1 + (s + 1) * (u - 1) ** 3 + s * (u - 1) ** 2;   // léger dépassement, doux
const asmTmp = { m: new THREE.Matrix4(), r: new THREE.Matrix4(), s: new THREE.Matrix4(), q: new THREE.Quaternion(),
  v: new THREE.Vector3(), ax: { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) } };
function asmBuild(w, steps) {
  const pieces = [];
  let T = 0;
  const inv = new THREE.Matrix4();
  // boîte d'une unité dans le repère de son parent
  const boxOf = (nodes) => {
    const b = new THREE.Box3(), c = new THREE.Box3();
    inv.copy(nodes[0].parent.matrixWorld).invert();
    for (const n of nodes) b.union(c.setFromObject(n).applyMatrix4(inv));
    return b;
  };
  const wBox = boxOf([w.children[0]]).makeEmpty();
  for (const o of w.children) wBox.union(boxOf([o]));
  for (const [pick, type, at, gap, dur, opt = {}] of steps) {
    let units = pick(w).filter((u) => u.length);
    const boxes = new Map(units.map((u) => [u, boxOf(u)]));
    const ctr = (u) => boxes.get(u).getCenter(new THREE.Vector3());
    if (opt.from || opt.fromNode) {                     // vague : depuis un coin du diorama, ou depuis une pièce
      const o = opt.fromNode ? boxOf([asmKids(w, opt.fromNode)[0]]).getCenter(new THREE.Vector3())
        : new THREE.Vector3(opt.from[0] < 0 ? wBox.min.x : wBox.max.x, 0, opt.from[1] < 0 ? wBox.min.z : wBox.max.z);
      const d = (u) => Math.hypot(ctr(u).x - o.x, ctr(u).z - o.z);
      units.sort((a, b) => d(a) - d(b));
    } else if (opt.order) units.sort((a, b) => ctr(a)[opt.order] - ctr(b)[opt.order]);
    if (opt.desc) units.reverse();
    units.forEach((u, k) => {
      const b = boxes.get(u), c = b.getCenter(new THREE.Vector3());
      const P = new THREE.Vector3(c.x, b.min.y, c.z);
      if (type === 'unroll' || type === 'roll') P[opt.along] = b.min[opt.along];
      if (type === 'swing') P.x = b.min.x;
      let hinge = null;
      if (type === 'close') {                           // rabat : pivote sur sa charnière (son origine) par-dessus
        P.copy(u[0].position);                          // le carton, jusqu'à se coucher à plat vers l'intérieur
        const d = c.clone().sub(P), out = new THREE.Vector3(d.x, 0, d.z).normalize();
        hinge = { axis: out.clone().cross(new THREE.Vector3(0, 1, 0)).normalize(),
          angle: Math.PI - Math.atan2(d.y, Math.hypot(d.x, d.z)) - (opt.flat ?? 0.04) };
      }
      const t0 = at + k * gap;
      T = Math.max(T, t0 + dur);
      for (const n of u) { n.updateMatrix(); n.matrixAutoUpdate = false; }
      pieces.push({ nodes: u, base: u.map((n) => n.matrix.clone()), P, t0, dur, type, opt, k, hinge,
        len: b.max[opt.along || 'x'] - b.min[opt.along || 'x'], h: b.max.y - b.min.y });
    });
  }
  return { pieces, T };
}
// pose des pièces au temps t (s) de l'assemblage
function asmApply(a, t) {
  const { m, r, s, q, v, ax } = asmTmp;
  for (const p of a.pieces) {
    const u = clamp((t - p.t0) / p.dur, 0, 1);
    const shown = u > 0;
    for (const n of p.nodes) n.visible = shown;
    if (!shown) continue;
    // e : position (ralentit en arrivant) ; b : taille (sort de rien, dépasse à peine, se pose)
    const e = easeOut(u), b = Math.max(1e-3, easeBack(u));
    let sx = b, sy = b, sz = b, ang = 0, axis = ax.y;
    asmTmp.swayed = false;
    v.set(0, 0, 0);
    switch (p.type) {
      case 'drop': v.y = (p.opt.h ?? MINI_ASM.drop) * (1 - e); break;                  // tombe doucement et se pose
      case 'fall': {                             // tombe du ciel : naît en grossissant pendant la descente (comme une
        // pose), prend de la vitesse puis freine en douceur (courbe en S), et se tasse à peine en se posant
        const h = p.opt.h ?? MINI_ASM.fall;
        const f = lerp(u * u, easeOut(u), u);
        v.y = h * (1 - f);
        if (p.opt.sway) {                        // chute vivante : se balance, pivote un peu et dérive, puis se redresse
          const rn = (s) => { const x = Math.sin(p.t0 * 12.9898 + p.k * 78.233 + s * 37.719) * 43758.5453; return x - Math.floor(x); };
          const left = 1 - f, dir = rn(1) * Math.PI * 2, sg = rn(2) < 0.5 ? -1 : 1;
          const rock = Math.cos(u * Math.PI * 1.6) * left;                 // bascule qui s'amortit en arrivant
          ax.t ??= new THREE.Vector3();
          ax.t.set(Math.cos(dir), 0, Math.sin(dir));
          q.setFromAxisAngle(ax.t, MINI_ASM.sway.tilt * p.opt.sway * rock);
          asmTmp.q2 ??= new THREE.Quaternion();
          q.premultiply(asmTmp.q2.setFromAxisAngle(ax.y, sg * MINI_ASM.sway.spin * p.opt.sway * left * left));
          v.x += Math.cos(dir + 1.2) * MINI_ASM.sway.drift * p.opt.sway * left * left;
          v.z += Math.sin(dir + 1.2) * MINI_ASM.sway.drift * p.opt.sway * left * left;
          asmTmp.swayed = true;
        }
        sx = sy = sz = Math.max(1e-3, easeBack(Math.min(1, u * 1.7), 0.5));
        if (u > 0.72) {
          const k = (u - 0.72) / 0.28, sq = MINI_ASM.squash * Math.sin(Math.PI * k) * (1 - k);
          sy *= 1 - sq; sx *= 1 + sq * 0.5; sz *= 1 + sq * 0.5;
        }
        break;
      }
      case 'tile': v.y = 0.2 * (1 - e); ang = 0.6 * (1 - e); axis = ax.x; break;       // carreau qui se couche en place
      case 'slide': {                                                                    // glisse le long d'un axe
        const sg = p.opt.sign ?? (p.k % 2 ? 1 : -1);
        v[p.opt.along] = sg * (p.opt.d ?? Math.max(0.4, p.len * 0.8)) * (1 - e); v.y = 0.06 * (1 - e);
        sx = sy = sz = Math.max(1e-3, easeOut(Math.min(1, u * 2.5)));
        break;
      }
      case 'grow': sx = sz = lerp(0.85, 1, e); break;                                    // pousse depuis le sol
      case 'pop': break;                                                                 // éclot sur place
      case 'unroll':                                                                     // se déroule depuis un bord
        sx = sz = 1; sy = lerp(0.4, 1, e);
        if (p.opt.along === 'x') sx = Math.max(1e-3, e); else sz = Math.max(1e-3, e);
        break;
      case 'swing': ang = p.opt.a * (1 - e); sx = sy = sz = Math.max(1e-3, easeOut(Math.min(1, u * 2))); break;   // pivote sur son bord
      case 'tilt': v.y = (p.opt.h ?? MINI_ASM.drop * 0.7) * (1 - e); ang = p.opt.a * (1 - e); axis = ax[p.opt.axis]; break;
    }
    if (!asmTmp.swayed) q.setFromAxisAngle(axis, ang);   // (la chute vivante a déjà fixé sa rotation)
    // M = T(P + v) · R · S · T(−P) · base
    m.makeTranslation(p.P.x + v.x, p.P.y + v.y, p.P.z + v.z);
    m.multiply(r.makeRotationFromQuaternion(q));
    m.multiply(s.makeScale(sx, sy, sz));
    m.multiply(r.makeTranslation(-p.P.x, -p.P.y, -p.P.z));
    p.nodes.forEach((n, i) => { n.matrix.multiplyMatrices(m, p.base[i]); n.matrixWorldNeedsUpdate = true; });
  }
}
// Disparition (relève entre deux services) : pas l'assemblage à l'envers, mais un envol. D'abord le geste propre au
// service (ici les rabats qui se referment sur le contenu rangé), puis les objets décollent (petit tassement d'élan,
// montée qui accélère, léger balancement, ils rétrécissent en partant), le sol en dernier, en vague. Même format
// d'étapes que MINI_CHOREO ; un service sans chorégraphie de sortie se démonte à l'envers.
const MINI_EXIT = {
  // Nettoyage : l'éponge et le panneau s'envolent les premiers (petits, ils montent moins haut), puis le reste ;
  // le carrelage part en vague
  nettoyage: [
    [(w) => asmEach(asmKids(w, /ponge/)), 'lift', 0, 0, 0.4, { h: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Panneau/)), 'lift', 0.05, 0, 0.42, { h: 0.7 }],
    [(w) => asmEach(asmKids(w, /balai/)), 'lift', 0.12, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Pulv/)), 'lift', 0.16, 0, 0.5],
    [(w) => asmEach(asmKids(w, /seau_d/)), 'lift', 0.2, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Seau_arrondi/)), 'lift', 0.26, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Meuble/)), 'lift', 0.34, 0, 0.5, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Carreau/)), 'lift', 0.46, 0.011, 0.42, { from: [-1, 1], desc: true, floor: true }],
  ],
  // Livraison : le paillasson se roule, puis colis, plante, diable et porte s'envolent ; les pavés partent en vague
  livraison: [
    [(w) => asmEach(asmKids(w, /^Paillasson/)), 'roll', 0, 0, 0.24, { along: 'x' }],
    [(w) => asmEach(asmKids(w, /^Diable/)), 'lift', 0.08, 0, 0.5],
    [(w) => asmOne(asmSub(w, /colis/).filter((n) => /etit/.test(n.name))), 'lift', 0.12, 0, 0.5],
    [(w) => asmEach(asmKids(w, /Service/)), 'lift', 0.16, 0, 0.5],
    [(w) => asmOne(asmSub(w, /colis/).filter((n) => !/etit/.test(n.name))), 'lift', 0.2, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Plante/)), 'lift', 0.24, 0, 0.5],
    [(w) => asmOne(asmKids(w, /^(Porte|Panneau_porte|Poign|Num|Encadrement|Seuil)/)), 'lift', 0.32, 0, 0.5, { sway: 0.5 }],
    [(w) => asmEach(asmKids(w, /^Pierre_cour/)), 'lift', 0.44, 0.012, 0.42, { fromNode: /^Porte/, desc: true, floor: true }],
  ],
  // Montage : les vis, chevilles et petits outils se rangent, puis meuble, tabouret et caisse s'envolent ; le tapis en dernier
  montage: [
    [(w) => asmEach(asmSub(w, /kit/, /^(Vis|T.te_vis|Cheville|Cl._Allen|Notice)/)), 'shrink', 0, 0.006, 0.18],
    [(w) => asmEach(asmSub(w, /Service/, /^Cl./)), 'shrink', 0.02, 0, 0.18],
    [(w) => asmOne(asmSub(w, /kit/, /tournevis/)), 'lift', 0.1, 0, 0.5],
    [(w) => asmOne(asmSub(w, /Service/, /^(Batterie|Corps|Poign.e_visseuse|Mandrin|Embout)/)), 'lift', 0.14, 0, 0.5],
    [(w) => asmEach(asmKids(w, /tabouret/)), 'lift', 0.2, 0, 0.5],
    [(w) => asmEach(asmSub(w, /kit/, /^Planche/)), 'lift', 0.22, 0, 0.5],
    [(w) => asmOne(asmSub(w, /Service/, /^(Caisse|Couvercle|Fermoir|Poign.e_caisse|Montant)/)), 'lift', 0.26, 0, 0.5],
    [(w) => asmEach(asmSub(w, /kit/, /^Carton/)), 'lift', 0.3, 0, 0.5],
    [(w) => asmOne(asmSub(w, /kit/, /^(C.t._gauche|Fond|Tablette)/)), 'lift', 0.34, 0, 0.5, { sway: 0.6 }],
    [(w) => asmOne(asmSub(w, /kit/, /^(C.t._droit|Trou)/)), 'lift', 0.4, 0, 0.5, { sway: 0.6 }],
    [(w) => asmOne(asmKids(w, /^Tapis/)), 'lift', 0.52, 0, 0.5, { floor: true }],
  ],
  // Jardinage : fleurs, herbe et feuilles rentrent dans la terre, puis les machines, buissons, haie, muret et
  // barrière s'envolent ; le sol (terre + gazon) en dernier, d'un bloc
  jardinage: [
    [(w) => asmEach(asmKids(w, /^(Fleurs|Herbe|Feuilles|Cailloux)/)), 'fold', 0, 0.03, 0.22],
    [(w) => asmEach(asmKids(w, /taille/)), 'lift', 0.1, 0, 0.5],
    [(w) => asmEach(asmKids(w, /tondeuse/)), 'lift', 0.14, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Boules/)), 'lift', 0.2, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Haie/)), 'lift', 0.26, 0, 0.5, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Barri/)), 'lift', 0.3, 0, 0.5, { sway: 0.6 }],
    [(w) => asmEach(asmKids(w, /^Muret/)), 'lift', 0.34, 0, 0.5, { sway: 0.6 }],
    [(w) => asmOne(asmKids(w, /(terre|pelouse)/)), 'lift', 0.46, 0, 0.5, { floor: true }],
  ],
  desencombrement: [
    [(w) => asmOne(asmSub(w, /Service/, /^(?!Carton|Rabat|Scotch)/)), 'sink', 0, 0, 0.22, { d: 0.18 }],
    [(w) => asmEach(asmSub(w, /Service/, /^Rabat_(gauche|droit)/)), 'close', 0.08, 0.04, 0.26],
    [(w) => asmEach(asmSub(w, /Service/, /^Rabat_(avant|arri)/)), 'close', 0.2, 0.04, 0.26, { up: 0.012 }],
    [(w) => asmEach(asmKids(w, /^Sac/)), 'lift', 0.12, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Chaise_retourn/)), 'lift', 0.18, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Lame_d/)), 'lift', 0.22, 0.05, 0.45],
    [(w) => asmBy(asmSub(w, /pile/), (n) => (/tiquette/.test(n.name) ? '1' : (n.name.match(/_(\d)\d{3}_/) || [0, '1'])[1]))
      .slice(0, 3).reverse(), 'lift', 0.26, 0.07, 0.5],
    [(w) => asmBy(asmSub(w, /pile/), (n) => (/tiquette/.test(n.name) ? '1' : (n.name.match(/_(\d)\d{3}_/) || [0, '1'])[1]))
      .slice(3), 'lift', 0.3, 0, 0.5],
    [(w) => asmOne(asmKids(w, /chaise_\(proto/)), 'lift', 0.34, 0, 0.5],
    [(w) => asmOne(asmKids(w, /Service/)), 'lift', 0.46, 0, 0.5],
    [(w) => asmEach(asmKids(w, /^Lame_\d/)), 'lift', 0.5, 0.014, 0.42, { order: 'x', desc: true, floor: true }],
  ],
};
const easeIn = (u) => u * u * u;
const easeInOut = (u) => (1 - Math.cos(Math.PI * u)) / 2;
// pose des pièces au temps t (s) de la disparition
function exitApply(a, t) {
  const { m, r, s, q, v, ax } = asmTmp;
  ax.t ??= new THREE.Vector3();
  for (const p of a.pieces) {
    const u = clamp((t - p.t0) / p.dur, 0, 1);
    const gone = u >= 1 && p.type !== 'close';
    for (const n of p.nodes) n.visible = !gone;
    if (gone) continue;
    let sx = 1, sy = 1, sz = 1;
    v.set(0, 0, 0); q.identity();
    switch (p.type) {
      case 'sink': {                              // se range dans le carton : descend et se tasse
        const e = easeIn(u);
        v.y = -(p.opt.d ?? p.h) * e; sx = sy = sz = Math.max(1e-3, 1 - 0.5 * e);
        break;
      }
      case 'fold': {                              // se replie / rentre dans le sol (écrasé vers le bas)
        const e = easeIn(u); sy = Math.max(1e-3, 1 - e); sx = sz = 1 - 0.2 * e;
        break;
      }
      case 'shrink': sx = sy = sz = Math.max(1e-3, 1 - easeIn(u)); break;   // se range : rétrécit sur place
      case 'roll': {                              // s'enroule vers son bord
        const e = easeIn(u), k = Math.max(1e-3, 1 - e);
        if (p.opt.along === 'x') sx = k; else sz = k;
        sy = 1 + 1.5 * e;
        break;
      }
      case 'close':                               // rabat qui se referme sur sa charnière
        q.setFromAxisAngle(p.hinge.axis, p.hinge.angle * easeInOut(u)); v.y = (p.opt.up ?? 0) * u;
        break;
      case 'lift': {                              // envol : tassement d'élan, puis montée qui accélère
        const pre = p.opt.floor ? 0.1 : 0.18, sq = MINI_ASM.squash * 0.7;
        if (u < pre) {
          const k = Math.sin(Math.PI * u / pre) * sq;
          sy = 1 - k; sx = sz = 1 + k * 0.5;
          break;
        }
        const w = (u - pre) / (1 - pre), up = w * w;
        v.y = (p.opt.h ?? MINI_ASM.lift) * up;
        const shrink = Math.max(1e-3, 1 - easeIn(clamp((w - 0.35) / 0.65, 0, 1)));
        sx = sy = sz = shrink;
        const rn = (k) => { const x = Math.sin(p.t0 * 12.9898 + p.k * 78.233 + k * 37.719) * 43758.5453; return x - Math.floor(x); };
        const dir = rn(1) * Math.PI * 2, sg = rn(2) < 0.5 ? -1 : 1, amt = p.opt.sway ?? (p.opt.floor ? 0.6 : 1);
        ax.t.set(Math.cos(dir), 0, Math.sin(dir));
        q.setFromAxisAngle(ax.t, MINI_ASM.sway.tilt * amt * Math.sin(w * Math.PI * 0.8));
        asmTmp.q2 ??= new THREE.Quaternion();
        q.premultiply(asmTmp.q2.setFromAxisAngle(ax.y, sg * MINI_ASM.sway.spin * amt * up));
        v.x += Math.cos(dir + 1.2) * MINI_ASM.sway.drift * amt * up;
        v.z += Math.sin(dir + 1.2) * MINI_ASM.sway.drift * amt * up;
        break;
      }
    }
    m.makeTranslation(p.P.x + v.x, p.P.y + v.y, p.P.z + v.z);
    m.multiply(r.makeRotationFromQuaternion(q));
    m.multiply(s.makeScale(sx, sy, sz));
    m.multiply(r.makeTranslation(-p.P.x, -p.P.y, -p.P.z));
    p.nodes.forEach((n, i) => { n.matrix.multiplyMatrices(m, p.base[i]); n.matrixWorldNeedsUpdate = true; });
  }
}
// remet les pièces de la disparition dans leur pose d'origine (avant un nouvel assemblage)
function exitReset(a) {
  for (const p of a.pieces) p.nodes.forEach((n, i) => { n.matrix.copy(p.base[i]); n.visible = true; n.matrixWorldNeedsUpdate = true; });
}

export { MINI_ASM, MINI_CHOREO, MINI_EXIT, asmBuild, asmApply, exitApply, exitReset };
