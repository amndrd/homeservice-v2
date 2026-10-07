// Papillons du hero (js/hero.js) : modèle et battement d'ailes.
// Chaque papillon a quatre ailes (deux antérieures, deux postérieures), peintes dans des toiles 2D d'après des
// planches de papillons : dégradé depuis la base, apex et bordure plus sombres, nervures qui rayonnent depuis
// l'attache, cellule discoïdale, points le long de la marge, bord festonné aux ailes postérieures, un voile de
// paillettes. Un corps en trois parties (tête, thorax, abdomen annelé) et deux antennes à massue.
// Repère d'un papillon : la tête vers +z, le dos vers +y, l'aile droite vers +x ; envergure 1 (on le met à l'échelle).
// Battement : les ailes postérieures suivent les antérieures avec un temps de retard ; la descente est plus rapide
// que la remontée ; le corps monte quand les ailes descendent. Le vol (js/hero.js) décide quand planer.
import * as THREE from 'three';

// [base de l'aile, milieu, extrémité, aile postérieure (base, extrémité), bordure, nervures, points, corps]
export const SPECIES = {
  peche: { fore: ['#e5795a', '#ec8f6c', '#ee9e78'], hind: ['#5f9a7c', '#86b597'], border: '#5a2c1a',
    vein: 'rgba(110, 50, 32, .8)', spot: 'rgba(60, 28, 20, .9)', body: '#3d4a30', apex: true, spots: true },
  menthe: { fore: ['#5fae93', '#83c0a6', '#a2cfb6'], hind: ['#7dbba2', '#acd3bd'], border: '#7a5634',
    vein: 'rgba(110, 82, 52, .75)', spot: 'rgba(120, 140, 120, .35)', body: '#2f3a32', apex: false, spots: false },
  rose: { fore: ['#e86f80', '#ee8592', '#f199a4'], hind: ['#ec7f8d', '#f2a2ac'], border: '#9a1f30',
    vein: 'rgba(150, 30, 48, .7)', spot: 'rgba(160, 40, 56, .4)', body: '#4a1c22', apex: true, spots: false },
  vieuxrose: { fore: ['#e3a690', '#d68a74', '#c97a66'], hind: ['#e9c6ae', '#cf8670'], border: '#7e3f2e',
    vein: 'rgba(120, 60, 42, .75)', spot: 'rgba(96, 44, 32, .85)', body: '#5a4434', apex: true, spots: true },
  aurore: { fore: ['#3fb7a5', '#e6a9b6', '#e08c9e'], hind: ['#7ccfbe', '#e48a9c'], border: '#a32640',
    vein: 'rgba(150, 40, 66, .7)', spot: 'rgba(236, 110, 96, .8)', body: '#26302a', apex: true, spots: false, rim: '#f07a6a' },
};

const W = 512;                                      // taille d'une toile d'aile (px)
// contour de l'aile antérieure et de l'aile postérieure, dans la toile (px) : attache, bord d'attaque, apex, marge,
// bord interne. Les marges (outer) servent aux nervures et aux points.
const FORE = { hinge: [12, 330], outline: [[12, 300], [[110, 190], [290, 50], [462, 38]], [[506, 32], [512, 86], [490, 128]],
  [[466, 220], [432, 318], [382, 398]], [[262, 424], [96, 386], [12, 348]]], outer: [2, 3] };
const HIND = { hinge: [12, 118], outline: [[12, 104], [[150, 52], [330, 84], [430, 168]], [[470, 250], [436, 360], [366, 430]],
  [[300, 486], [200, 500], [140, 472]], [[70, 430], [28, 290], [12, 140]]], outer: [2, 3] };

function bezier(p0, [c1, c2, p3], n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
              u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]);
  }
  return out;
}
// le contour en points, et les points de la marge extérieure
function outlinePts(shape) {
  const [start, ...segs] = shape.outline;
  const pts = [start], outer = [];
  let p = start;
  segs.forEach((seg, i) => {
    const b = bezier(p, seg, 24);
    pts.push(...b);
    if (shape.outer.includes(i + 1)) outer.push(...b);
    p = seg[2];
  });
  return { pts, outer };
}

// une graine fixe par espèce : les mêmes paillettes à chaque chargement
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function paintWing(sp, shape, colors, hind, seed) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const g = cv.getContext('2d');
  const r = rng(seed);
  const { pts, outer } = outlinePts(shape);
  const [hx, hy] = shape.hinge;
  const path = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };
  g.save();
  path();
  g.clip();
  // le fond : un dégradé depuis l'attache
  const grad = g.createRadialGradient(hx, hy, 10, hx, hy, 500);
  colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, W);
  // la base, plus sombre et velue, près du corps
  const base = g.createRadialGradient(hx, hy, 0, hx, hy, 120);
  base.addColorStop(0, 'rgba(40, 28, 22, .45)');
  base.addColorStop(1, 'rgba(40, 28, 22, 0)');
  g.fillStyle = base;
  g.fillRect(0, 0, W, W);
  // nervures : de l'attache vers la marge, légèrement courbées
  g.strokeStyle = sp.vein;
  g.lineCap = 'round';
  const n = hind ? 7 : 9;
  for (let i = 0; i < n; i++) {
    const [tx, ty] = outer[Math.round(((i + 0.5) / n) * (outer.length - 1))];
    const mx = hx + (tx - hx) * 0.5, my = hy + (ty - hy) * 0.5;
    const nx = -(ty - hy), ny = tx - hx, l = Math.hypot(nx, ny) || 1;
    g.lineWidth = 4.6 - i * 0.18;
    g.beginPath();
    g.moveTo(hx + (tx - hx) * 0.06, hy + (ty - hy) * 0.06);
    g.quadraticCurveTo(mx + (nx / l) * 18, my + (ny / l) * 18, tx, ty);
    g.stroke();
  }
  // la cellule discoïdale : une boucle fermée au tiers de l'aile
  g.lineWidth = 4.2;
  g.beginPath();
  const [ax, ay] = outer[Math.round(outer.length * 0.25)], [bx, by] = outer[Math.round(outer.length * 0.7)];
  g.moveTo(hx + 20, hy - 4);
  g.quadraticCurveTo(hx + (ax - hx) * 0.45, hy + (ay - hy) * 0.45, hx + (ax - hx) * 0.52 + (bx - ax) * 0.2, hy + (ay - hy) * 0.52 + (by - ay) * 0.2);
  g.lineTo(hx + (bx - hx) * 0.48, hy + (by - hy) * 0.48);
  g.quadraticCurveTo(hx + (bx - hx) * 0.3, hy + (by - hy) * 0.3, hx + 20, hy + 6);
  g.stroke();
  // l'apex de l'aile antérieure, plus sombre
  if (sp.apex && !hind) {
    const [px, py] = outer[Math.round(outer.length * 0.08)];
    const ap = g.createRadialGradient(px, py, 0, px, py, 240);
    ap.addColorStop(0, sp.border);
    ap.addColorStop(0.45, sp.border + 'aa');
    ap.addColorStop(1, sp.border + '00');
    g.fillStyle = ap;
    g.fillRect(0, 0, W, W);
  }
  // une rangée de points sous la marge
  if (sp.spots) {
    g.fillStyle = sp.spot;
    g.shadowColor = sp.spot;
    g.shadowBlur = 6;
    const k = hind ? 6 : 7;
    for (let i = 0; i < k; i++) {
      const [tx, ty] = outer[Math.round(((i + 0.7) / (k + 0.6)) * (outer.length - 1))];
      const f = hind ? 0.82 : 0.86;
      g.beginPath();
      g.ellipse(hx + (tx - hx) * f, hy + (ty - hy) * f, hind ? 14 : 10, hind ? 17 : 12, Math.atan2(ty - hy, tx - hx), 0, Math.PI * 2);
      g.fill();
    }
    g.shadowBlur = 0;
  }
  // la bordure : un liseré le long de tout le contour, plus large sur la marge
  if (sp.rim) {
    g.strokeStyle = sp.rim;
    g.lineWidth = 46;
    g.beginPath();
    outer.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  g.strokeStyle = sp.border;
  g.lineWidth = 12;
  path();
  g.stroke();
  g.lineWidth = sp.rim ? 20 : 28;
  g.beginPath();
  outer.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
  // paillettes : le grain des écailles
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255, 255, 255, .10)' : 'rgba(60, 40, 30, .06)';
    g.fillRect(r() * W, r() * W, 2, 2);
  }
  g.restore();
  // le bord festonné de l'aile postérieure : de petites morsures le long de la marge
  if (hind) {
    g.globalCompositeOperation = 'destination-out';
    for (let i = 3; i < outer.length - 2; i += 6) {
      const [x, y] = outer[i];
      const dx = x - hx, dy = y - hy, l = Math.hypot(dx, dy);
      g.beginPath();
      g.arc(x + (dx / l) * 9, y + (dy / l) * 9, 11, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const cache = new Map();
function wingMaterials(name, prepare) {
  if (cache.has(name)) return cache.get(name);
  const sp = SPECIES[name];
  const seed = [...name].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 1;
  const make = (tex) => prepare(new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.0,
    roughness: 0.75, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true,
  }));
  // pour les ombres : la profondeur vue du soleil, découpée comme l'aile (sinon l'ombre serait un carré)
  const depth = (tex) => prepare(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex,
    alphaTest: 0.5, side: THREE.DoubleSide }));
  const foreTex = paintWing(sp, FORE, sp.fore, false, seed);
  const hindTex = paintWing(sp, HIND, [sp.hind[0], sp.hind[1]], true, seed + 1);
  const m = {
    fore: make(foreTex),
    hind: make(hindTex),
    foreDepth: depth(foreTex),
    hindDepth: depth(hindTex),
    bodyDepth: depth(null),
    body: prepare(new THREE.MeshStandardMaterial({ color: sp.body, roughness: 0.45, metalness: 0.15 })),
    abdomen: prepare(new THREE.MeshStandardMaterial({ color: new THREE.Color(sp.body).lerp(new THREE.Color('#a87c6c'), 0.6),   // brun rosé
      roughness: 0.6 })),
    eye: prepare(new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.25 })),
  };
  cache.set(name, m);
  return m;
}

// une aile : un carré peint, à plat (plan xz), l'attache à l'origine, la tête vers +z
const S = 0.52;                                    // côté du carré : l'envergure fait ~1
function wingGeometry(shape) {
  const geo = new THREE.PlaneGeometry(S, S);
  geo.rotateX(Math.PI / 2);                         // le haut de la toile vers la tête
  const [hu, hv] = shape.hinge;
  geo.translate(-(hu / W - 0.5) * S, 0, -(0.5 - hv / W) * S);
  return geo;
}
let foreGeo, hindGeo;

// le corps, d'après une planche (envergure 1) : petite tête ronde aux deux yeux, thorax en ovale allongé entre les
// ailes antérieures, long abdomen fin et annelé qui file vers l'arrière, bout arrondi ; antennes très fines en V,
// terminées par une petite massue
function bodyParts(mats) {
  const g = new THREE.Group();
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mats.body);
  thorax.scale.set(0.026, 0.022, 0.056);
  g.add(thorax);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), mats.body);
  head.position.set(0, 0.002, 0.064);
  g.add(head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 10, 8), mats.eye);
    eye.position.set(s * 0.011, 0.004, 0.068);
    g.add(eye);
  }
  // abdomen : de la taille du thorax vers l'arrière (-z), annelé, le bout arrondi
  const prof = [];
  const L = 0.205, N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r = 0.0095 + 0.0045 * Math.sin(Math.PI * Math.min(1, t * 1.6)) - 0.004 * t;   // s'épaissit puis s'affine
    r *= 1 + 0.07 * Math.cos(t * Math.PI * 16);    // les anneaux
    if (t > 0.9) r *= Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2));               // bout arrondi
    prof.push(new THREE.Vector2(Math.max(r, 0.0004), -t * L));
  }
  const abd = new THREE.Mesh(new THREE.LatheGeometry(prof, 12), mats.abdomen);
  abd.rotation.x = Math.PI / 2;                     // l'axe du tour (y) vers -z : derrière le thorax
  abd.position.z = -0.042;
  g.add(abd);
  for (const s of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(s * 0.006, 0.008, 0.074),
      new THREE.Vector3(s * 0.032, 0.034, 0.15), new THREE.Vector3(s * 0.086, 0.05, 0.236));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0016, 5), mats.body));
    const club = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), mats.body);
    club.scale.set(1, 1, 2.2);
    club.position.copy(curve.getPoint(1));
    club.lookAt(curve.getPoint(1).add(curve.getTangent(1)));
    g.add(club);
  }
  return g;
}

// un papillon : `prepare` reçoit chaque matériau (le hero y branche le vide qui le révèle)
export function makeButterfly(species, span, prepare = (m) => m) {
  foreGeo ??= wingGeometry(FORE);
  hindGeo ??= wingGeometry(HIND);
  const mats = wingMaterials(species, prepare);
  const root = new THREE.Group();                   // position et cap (posés par le hero)
  const body = new THREE.Group();                   // le corps qui monte et descend avec le battement
  body.scale.setScalar(span);
  root.add(body);
  body.add(bodyParts(mats));
  const wings = [];
  for (const side of [1, -1]) {
    for (const [geo, mat, z, y, lag, amp] of [[hindGeo, mats.hind, -0.012, 0, 0.5, 0.88], [foreGeo, mats.fore, 0.01, 0.003, 0, 1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.012, y, z);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(side, 1, 1).multiplyScalar(mat === mats.hind ? 0.84 : 1);   // la gauche : la droite en miroir
      pivot.add(mesh);
      body.add(pivot);
      wings.push({ pivot, side, lag, amp, fore: mat === mats.fore });
    }
  }
  // il porte une ombre : sur l'îlot (le soleil de la scène), découpée comme ses ailes, qui bat avec elles
  root.traverse((c) => {
    if (!c.isMesh) return;
    c.castShadow = true;
    c.customDepthMaterial = c.material === mats.fore ? mats.foreDepth : c.material === mats.hind ? mats.hindDepth : mats.bodyDepth;
  });
  const st = { phase: Math.random() * 6.3, glide: 0, perch: 0, bask: Math.random() * 6.3 };
  const wingState = { spread: 1 };                  // ouverture des ailes vue de dessus (1 : à plat, 0 : dressées)
  // le battement, image par image. Le vol (js/hero.js) dit quand planer (`glide`, 0 ou 1) et l'effort (0 à 1 : en
  // montée ou en virage, il bat plus vite et plus ample). Planer : les ailes se figent à demi levées, en V ouvert ;
  // elles y vont et en repartent en douceur. Posé (`perch`, 0 ou 1 : le papillon guide, à plat sur la page) : les
  // ailes prennent la posture demandée (`rest`, angle au-dessus du dos : 0 à plat, ~0,6 en V, ~1,3 fermées), en
  // douceur (`quick` : d'un coup, le claquement du départ) ; sans posture demandée, elles s'ouvrent à plat et se
  // referment de temps en temps.
  function flap(dt, glide = 0, effort = 0.4, perch = 0, rest = null, quick = false) {
    st.glide += (glide - st.glide) * (1 - Math.exp(-dt * (glide ? 7 : 10)));
    st.perch += (perch - st.perch) * (1 - Math.exp(-dt * (perch ? 6 : 14)));   // il replie vite, repart plus vite encore
    st.phase += dt * Math.PI * 2 * (5.2 + 2.6 * effort) * (1 - 0.85 * st.glide) * (1 - 0.9 * st.perch);
    st.bask += dt * (0.45 + 0.2 * Math.sin(st.bask * 0.37));    // les ailes qui se referment, à un rythme irrégulier
    const want = rest ?? 0.1 + 1.1 * Math.max(0, Math.sin(st.bask)) ** 3;
    st.rest = (st.rest ?? want) + (want - (st.rest ?? want)) * (1 - Math.exp(-dt * (quick ? 40 : 7)));   // `quick` : d'un coup
    const lift = 1 - st.glide, amp = 0.9 + 0.2 * effort, restA = st.rest;
    for (const w of wings) {
      const p = st.phase - w.lag;
      const s = Math.sin(p + 0.32 * Math.sin(p));   // la descente (s qui baisse) plus vive que la remontée
      const fly = (0.42 + 1.02 * s) * w.amp * amp * lift + 0.3 * st.glide;
      const a = fly + (restA * (w.fore ? 1 : 0.96) - fly) * st.perch;
      w.pivot.rotation.set(0, w.side * (w.fore ? 0.14 : 0.04) * Math.cos(p) * lift * (1 - st.perch), w.side * a);
      if (w.fore && w.side > 0) wingState.spread = Math.abs(Math.cos(a));
    }
    // le corps monte quand les ailes descendent, retombe un peu à la remontée (posé, il ne bouge plus)
    body.position.y = -0.05 * span * Math.sin(st.phase - 0.4) * lift * (1 - st.perch);
    body.rotation.x = -0.06 * Math.cos(st.phase) * lift * (1 - st.perch);
  }
  return { root, flap, wingState };
}
