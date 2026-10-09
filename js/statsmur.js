// Les chiffres sur le mur (ordinateur) : la section des chiffres reste à l'écran le temps de les faire défiler un par
// un, à droite (index.html, .stats ; leur texte et leur décompte : js/stats.js) ; à gauche, contre le mur, un modèle 3D
// qui représente le chiffre lu.
// Premier chiffre (5 services réunis) : tous les objets des services de l'îlot du hero (models/ilot.glb, confiés par
// js/hero.js au chargement), à leur taille d'origine, tombent du haut de l'écran et sont rattrapés en l'air, au centre gauche :
// ils lévitent en groupe, serrés en boule, qui tourne lentement sur elle-même. Ce n'est pas une animation au
// défilement : elle se joue d'elle-même, une seule fois, quand la section approche (la fin de l'À propos est encore
// à l'écran : ils tombent par-dessus son texte, et forment la boule pendant qu'on continue jusqu'à elle). Une fois
// là, ils restent : en remontant, la boule repart simplement avec la section.
// La lumière vient d'en haut, un peu de gauche, de notre côté : l'ombre de la boule tombe sur le mur, sous elle.
// La toile couvre l'écran, fixée (les objets tombent du haut de l'écran, pas du haut de la section) ; la boule, à
// gauche (BALL.x), suit la place de la scène (.stats__stage, collante) : elle monte avec la section, reste au centre
// tant que la section est là, et part avec elle à la fin. Un objet ne fait d'ombre sur le mur qu'une fois entré à
// l'écran (sinon on verrait son ombre avant lui), et l'ombre de la boule se lève à mesure que les objets arrivent.
// Puis on fait défiler les chiffres un par un (js/stats.js : window.hsStats.active) ; le modèle des chiffres 2 et 3
// reste à définir (pour l'instant, la boule reste).
import * as THREE from 'three';

const box = document.querySelector('.stats');
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
const on = !!box && desktop && !reduced;
if (on) {
  root.classList.add('statsWall');                 // la mise en page des chiffres un par un (css/style.css)
  // les points où le défilement s'aimante : la section en place (la boule au centre), puis chaque chiffre
  for (let i = 0; i < 3; i++) {
    const d = document.createElement('div');
    d.className = 'stats__snap';
    d.style.top = `calc(${i} * var(--step))`;
    box.append(d);
  }
}

// la boule (m) : [écart gardé entre deux objets (m : ils ne se touchent jamais, même en lévitant et en se balançant),
//  rotation lente (rad/s), lévitation : ampleur (m), vitesse (rad/s), balancement des objets (rad)] ; part de la
//  hauteur de l'écran qu'elle occupe, place de son centre (part de la largeur de l'écran) ; part de la surface du noyau couverte par les empreintes des objets ; un objet
//  est long quand sa plus grande dimension dépasse autant de fois la suivante
const BALL = { gap: 0.16, spin: 0.14, bob: 0.04, bobSpeed: 1.3, sway: 0.04,
  screen: 0.8, x: 0.3, cover: 0.8, long: 2.4 };
// la chute : [pesanteur (m/s²), hauteur au-dessus de sa place où la lévitation commence à le retenir (m), raideur et
//  amortissement de la lévitation, départs échelonnés (s, entre deux objets, et au hasard en plus), marge au-dessus
//  de l'écran (m), tournoiement pendant la chute (rad)]
const FALL = { g: 18, field: 2.2, k: 50, c: 13, step: 0.05, jitter: 0.05, above: 0.4, tumble: 2.6 };
// l'écart entre la boule et le mur derrière elle (m), la caméra (champ, °), la lumière [ciel, sol, force ; soleil, force, direction
//  (droite, haut, vers nous)], l'ombre sur le mur (force, flou)
const WALL = 0.4, FOV = 30;
const LIGHT = { sky: '#dfe9ff', ground: '#d8d1c2', skyI: 1.3, sun: '#fff4e0', sunI: 3.6, dir: [-0.3, 0.5, 1],
  shadow: 0.13, blur: 10 };
// les objets tombent quand le haut de la section passe au-dessus de cette part de l'écran (la fin de l'À propos est
// encore là)
const ENTER = 0.8;

let gl = null;
const pieces = [];

// des nombres au hasard, mais toujours les mêmes (la boule a toujours la même forme)
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

// js/hero.js nous confie l'îlot dès son chargement, avant de toucher à ses matières : on clone ses objets (ceux d'un
// service : le tas, sans le sol, la flore ni les papillons)
export function statObjects(island) {
  if (!on || gl) return;
  const found = island.children.filter((c) => c.userData.service);
  if (!found.length) return;
  try { init(found); } catch { gl = null; }         // sans WebGL : les chiffres seuls
}

function init(found) {
  const stage = document.createElement('div');
  stage.className = 'stats__stage';
  stage.setAttribute('aria-hidden', 'true');
  box.prepend(stage);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;      // comme l'îlot (js/hero.js)
  renderer.toneMappingExposure = 2.3;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;     // une ombre douce sur le mur
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.skyI));
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.radius = LIGHT.blur;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: LIGHT.shadow }));
  wall.receiveShadow = true;
  scene.add(wall);
  const ball = new THREE.Group();                   // la boule : elle tourne lentement sur elle-même
  scene.add(ball);

  // chaque objet, centré sur lui-même, à sa taille d'origine
  const box3 = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  const raw = found.map((src) => {
    const o = src.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
      m.castShadow = false;                         // son ombre : une fois à l'écran (draw)
      m.receiveShadow = false;
    });
    o.updateMatrixWorld(true);
    box3.setFromObject(o).getCenter(c);
    o.position.copy(c).negate();
    // sa boîte (demi-côtés), dans son repère : c'est elle qui ne doit en toucher aucune autre
    const half = box3.getSize(sz).clone().multiplyScalar(0.5);
    const holder = new THREE.Group();
    holder.add(o);
    return { holder, half, r: half.length(), service: src.userData.service };
  });
  for (const { holder, half, r, service } of raw) {
    pieces.push({ obj: holder, half, r, service, ax: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], home: new THREE.Vector3(), rest: new THREE.Quaternion(),
      axis: new THREE.Vector3(), ph: rnd() * Math.PI * 2, y: 0, v: 0, y0: 1, wait: 0, live: false });
    ball.add(holder);
  }
  place();
  // ce qu'elle occupe vraiment, une fois serrée (m) : c'est elle qui fait BALL.screen de la hauteur de l'écran
  const extent = 2 * Math.max(...pieces.map((p) => p.home.length() + p.r));
  // l'ordre de chute : du bas de la boule vers le haut (un objet qui tombe ne traverse jamais un objet déjà en place,
  // tous ceux au-dessus de sa place arrivent après lui), avec un peu de désordre
  const order = pieces.map((p, i) => i).sort((a, b) => (pieces[a].home.y + rnd() * 0.3) - (pieces[b].home.y + rnd() * 0.3));
  order.forEach((k, i) => { pieces[k].wait = i * FALL.step + rnd() * FALL.jitter; });

  gl = { renderer, scene, camera, sun, wall, ball, stage, phase: 'idle', t0: 0, extent };
  makeBlock();
  layout();
  new ResizeObserver(layout).observe(document.body);
  window.addEventListener('scroll', wake, { passive: true });
  new IntersectionObserver(([e]) => { gl.seen = e.isIntersecting; wake(); }, { rootMargin: '20% 0px' }).observe(box);
  wake();
}

// La boule, composée : les objets sont posés tout autour d'un noyau invisible, comme sur une petite planète — chacun
// debout, le pied vers le centre, le haut vers l'extérieur, tourné d'un angle au hasard autour de cet axe ; les objets
// longs et fins (échelle, râteau, pelle, balai…) couchés le long de la surface, leur côté plat contre elle. Le noyau
// a juste la taille qu'il faut pour que leurs empreintes couvrent sa surface (BALL.cover) : la boule est pleine et
// ronde. Les services sont mêlés (on les prend tour à tour, du plus gros au plus petit, sur une spirale qui couvre la
// sphère), les gros objets répartis partout. Puis on les écarte jusqu'à BALL.gap, en les gardant sur la surface (ils
// glissent dessus et se réorientent) ; pour finir, ceux qui se touchent encore s'écartent librement.
const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _m4 = new THREE.Matrix4();
function orient(p) {
  _n.copy(p.home).normalize();
  _t.copy(p.tan).addScaledVector(_n, -p.tan.dot(_n));          // sa direction le long de la surface
  if (_t.lengthSq() < 1e-6) _t.set(1, 0, 0).addScaledVector(_n, -_n.x);
  _t.normalize();
  p.tan.copy(_t);
  const cols = [null, null, null];
  cols[p.along] = _t.clone();                                  // le long de la surface
  cols[p.out] = _n.clone();                                    // vers l'extérieur
  const k = 3 - p.along - p.out;
  cols[k] = new THREE.Vector3().crossVectors(cols[(k + 1) % 3], cols[(k + 2) % 3]);
  _m4.makeBasis(cols[0], cols[1], cols[2]);
  p.rest.setFromRotationMatrix(_m4);
  p.ax.forEach((v, i) => v.copy(cols[i]));
  p.home.copy(_n).multiplyScalar(p.lift);
}
function place() {
  const n = pieces.length, h = (p, i) => p.half.getComponent(i);
  let area = 0;
  for (const p of pieces) {
    const dims = [0, 1, 2].sort((a, b) => h(p, b) - h(p, a));   // du plus grand au plus petit
    p.long = h(p, dims[0]) > BALL.long * h(p, dims[1]);
    // debout : le haut (y) vers l'extérieur ; long : couché, le côté le plus mince vers l'extérieur
    p.out = p.long ? dims[2] : 1;
    p.along = p.long ? dims[0] : 0;
    const k = 3 - p.along - p.out;
    p.foot = [h(p, p.along), h(p, k)];
    area += (2 * p.foot[0] + BALL.gap) * (2 * p.foot[1] + BALL.gap);
  }
  const core = Math.sqrt(area / (4 * Math.PI * BALL.cover));
  // l'ordre sur la spirale : les services tour à tour, chacun du plus gros au plus petit
  const by = {};
  for (const p of pieces) (by[p.service] ??= []).push(p);
  const lists = Object.values(by).map((l) => l.sort((a, b) => b.r - a.r));
  const seq = [];
  while (seq.length < n) for (const l of lists) if (l.length) seq.push(l.shift());
  seq.forEach((p, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, a = i * 2.39996, rr = Math.sqrt(1 - y * y);
    p.home.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
    p.lift = core + h(p, p.out) + BALL.gap / 2;      // posé sur le noyau
    p.tan = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
    p.axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    orient(p);
  });
  const push = new THREE.Vector3();
  for (let it = 0; it < 900; it++) {
    const free = it >= 600;                           // à la fin : ils s'écartent librement
    let hit = false;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (!separate(pieces[i], pieces[j], BALL.gap, push)) continue;
      hit = true;
      pieces[i].home.addScaledVector(push, -0.5);
      pieces[j].home.addScaledVector(push, 0.5);
    }
    if (!free) for (const p of pieces) orient(p);   // de retour sur la surface, réorientés
    if (free && !hit) break;
  }
}

// deux boîtes orientées, agrandies de la moitié de l'écart chacune, se touchent-elles ? (axes séparateurs) Si oui,
// `out` reçoit le déplacement de b par rapport à a qui les sépare, le plus court
const _d = new THREE.Vector3(), _L = new THREE.Vector3();
function separate(a, b, gap, out) {
  _d.subVectors(b.home, a.home);
  const g = gap / 2;
  const ext = (p, L) => (p.half.x + g) * Math.abs(p.ax[0].dot(L)) + (p.half.y + g) * Math.abs(p.ax[1].dot(L))
    + (p.half.z + g) * Math.abs(p.ax[2].dot(L));
  let best = Infinity;
  const test = (L) => {
    const l = L.length();
    if (l < 1e-6) return true;
    L.multiplyScalar(1 / l);
    const dl = _d.dot(L), o = ext(a, L) + ext(b, L) - Math.abs(dl);
    if (o <= 0) return false;                       // un axe qui les sépare : elles ne se touchent pas
    if (o < best) { best = o; out.copy(L).multiplyScalar(dl < 0 ? -o : o); }
    return true;
  };
  for (const v of a.ax) if (!test(_L.copy(v))) return false;
  for (const v of b.ax) if (!test(_L.copy(v))) return false;
  for (const u of a.ax) for (const v of b.ax) if (!test(_L.crossVectors(u, v))) return false;
  if (best === Infinity) return false;
  out.multiplyScalar(1.02);                         // un rien de plus, pour ne pas rester au contact
  return true;
}

// la toile : tout l'écran ; la caméra face au mur, la boule à BALL.screen de la hauteur de l'écran, à gauche
function layout() {
  if (!gl) return;
  const W = window.innerWidth, H = window.innerHeight;   // = sa taille dans la page (css : 100vw × 100vh)
  gl.renderer.setSize(W, H, false);
  const cam = gl.camera;
  cam.aspect = W / H;
  gl.half = gl.extent / BALL.screen / 2;               // la demi-hauteur vue, au plan de la boule (m)
  const D = gl.half / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  cam.position.set(0, 0, D);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  gl.ball.position.x = (BALL.x - 0.5) * 2 * gl.half * cam.aspect;
  gl.wall.position.set(0, 0, -(gl.extent / 2 + WALL));
  gl.wall.scale.set(gl.half * cam.aspect * 6, gl.half * 6, 1);
  // la carte d'ombre couvre tout ce qu'on voit du mur (la boule et le bloc des chiffres)
  gl.wallZ = -(gl.extent / 2 + WALL);
  gl.halfW = (D - gl.wallZ) * Math.tan(THREE.MathUtils.degToRad(FOV / 2));   // la demi-hauteur vue, au mur (m)
  const s = gl.halfW * cam.aspect * 1.05;
  gl.sunAt = s * 3;
  Object.assign(gl.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: s * 8 });
  gl.sun.shadow.camera.updateProjectionMatrix();
  layoutBlock();
  draw(0);
}

// la boule suit la scène collante : son centre à l'écran, dans le monde
function anchor() {
  const r = gl.stage.getBoundingClientRect(), H = window.innerHeight;
  return (0.5 - (r.top + r.height / 2) / H) * 2 * gl.half;
}

let raf = 0, last = 0;
function wake() {
  if (!gl || raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
function frame(now) {
  raf = 0;
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  // la section approche : les objets tombent (une fois pour toutes)
  if (gl.phase === 'idle' && box.getBoundingClientRect().top / window.innerHeight <= ENTER) start();
  const busy = draw(dt);
  if (gl.seen && (busy || gl.phase !== 'idle')) raf = requestAnimationFrame(frame);
}
function start() {
  gl.phase = 'in';
  gl.t0 = performance.now() / 1000;
  for (const p of pieces) {
    // du haut de l'écran : au-dessus du bord, à la hauteur de sa place
    p.y0 = gl.half - anchor() - p.home.y + p.r + FALL.above;
    p.y = p.y0; p.v = 0; p.live = false;
  }
}

// un pas : la chute rattrapée par la lévitation (au-dessus de sa place, elle le retient de plus en plus) ; la boule
// tourne, chaque objet lévite et se balance un peu
const qs = new THREE.Quaternion();
function draw(dt) {
  if (!gl) return false;
  const t = performance.now() / 1000;
  gl.ball.position.y = anchor();
  gl.ball.rotation.y += BALL.spin * dt;
  // le soleil suit la section (la boule et le bloc restent dans la carte d'ombre)
  gl.sun.target.position.set(0, gl.ball.position.y, gl.wallZ);
  gl.sun.position.set(...LIGHT.dir).normalize().multiplyScalar(gl.sunAt).add(gl.sun.target.position);
  let busy = false, shown = false, settled = 0;
  const top = gl.half - gl.ball.position.y;          // le haut de l'écran, au-dessus du centre de la boule (m)
  for (const p of pieces) {
    if (gl.phase === 'in') {
      if (!p.live && t - gl.t0 >= p.wait) p.live = true;
      if (p.live) {
        const h = 6;                                // pas fixes : le même mouvement quelle que soit la cadence
        for (let i = 0; i < h; i++) {
          const x = Math.min(1, Math.max(0, p.y / FALL.field)), w = 1 - x * x * (3 - 2 * x);
          const a = -FALL.g * (1 - w) + w * (-FALL.k * p.y - FALL.c * p.v);
          p.v += (a * dt) / h; p.y += (p.v * dt) / h;
        }
        if (Math.abs(p.y) > 0.002 || Math.abs(p.v) > 0.01) busy = true;
      } else busy = true;
    }
    p.obj.visible = p.live;
    if (!p.live) continue;
    settled += 1 - Math.min(1, Math.max(0, p.y / Math.max(p.y0, 1e-3)));
    // son ombre, seulement une fois entré à l'écran (le bas de l'objet passe le haut de l'écran)
    const cast = p.home.y + p.y < top + 0.5 * p.r;
    if (cast !== p.cast) { p.cast = cast; p.obj.traverse((m) => { if (m.isMesh) m.castShadow = cast; }); }
    shown = true;
    const b = BALL.bob * Math.sin(t * BALL.bobSpeed + p.ph);
    p.obj.position.copy(p.home);
    p.obj.position.y += p.y + b;
    // il tournoie en tombant, de moins en moins à mesure qu'il approche de sa place ; puis il se balance à peine
    const turn = FALL.tumble * Math.max(-0.3, Math.min(1, p.y / Math.max(p.y0, 1e-3)));
    qs.setFromAxisAngle(p.axis, turn + BALL.sway * Math.sin(t * 0.8 + p.ph * 2));
    p.obj.quaternion.copy(p.rest).multiply(qs);
  }
  // l'ombre sur le mur se lève à mesure que les objets arrivent à leur place (pas d'ombres qui surgissent pendant la
  // chute)
  const k = Math.min(1, Math.max(0, (settled / pieces.length - 0.6) / 0.4));
  gl.wall.material.opacity = LIGHT.shadow * k * k * (3 - 2 * k);
  if (stepBlock(dt)) { busy = true; shown = true; }
  gl.renderer.domElement.style.visibility = shown ? '' : 'hidden';
  gl.renderer.render(gl.scene, gl.camera);
  return busy;
}

// ------------------------------------------------------------ le bloc des chiffres
// À droite, un bloc blanc à section carrée, encastré dans le mur, comme une lamelle d'un panneau d'aéroport : il tourne
// d'un quart de tour autour d'un axe horizontal à chaque chiffre (la face du dessus vient vers nous en descendant). Ses
// quatre faces : blanche (au repos, elle affleure le mur et on ne la distingue pas), puis le premier chiffre, le
// deuxième, le troisième (window.hsStats.active, js/stats.js). Il tourne dans une fente du mur : pendant le quart de
// tour, ses arêtes sortent un peu du mur et on aperçoit le fond sombre de la fente ; il démarre et s'arrête en
// douceur, sans rebond. Ses faces ont toujours exactement les couleurs de la page (le blanc du mur, l'encre, le vert),
// sans lumière ni ombre : elles ne s'assombrissent pas en tournant. Le texte des faces est celui de la page (traduit,
// décompté par js/stats.js), dessiné dans une image ; le HTML reste pour les lecteurs d'écran.
// [taille de la face, en tailles de chiffre F (largeur, hauteur = profondeur), durée d'un quart de tour (s),
//  netteté des faces (px d'image par px d'écran), couleurs]
const BLOCK = { w: 8.4, h: 2.4, turn: 0.9, sharp: 2, ink: '#0f1a2c', green: '#11703f', grey: '#6a7382',
  paper: '#f7f7f5', cavity: '#30343b' };
// les faces de la boîte (BoxGeometry : +x, −x, +y, −y, +z, −z) : la blanche devant, puis celles qui arrivent tour à tour
const FACE_BLANK = 4, FACE_STAT = [2, 5, 3];
const rowsEl = box ? [...box.querySelectorAll('.stat')] : [];
let block = null;
function makeBlock() {
  if (rowsEl.length < 3) return;
  // ses faces : leur couleur exacte, sans lumière ni mappage des tons (la face blanche ne se distingue pas de la page)
  const plain = () => new THREE.MeshBasicMaterial({ color: BLOCK.paper, toneMapped: false });
  const faces = FACE_STAT.map((idx, i) => {
    const canvas = document.createElement('canvas');
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    if (idx === 5) { map.center.set(0.5, 0.5); map.rotation = Math.PI; }   // la face arrière arrive tête en bas
    return { idx, i, canvas, map, key: '' };
  });
  const mats = [plain(), plain(), plain(), plain(), plain(), plain()];
  for (const f of faces) mats[f.idx] = new THREE.MeshBasicMaterial({ map: f.map, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
  mesh.castShadow = true;
  const group = new THREE.Group();                  // sur l'axe de rotation
  group.add(mesh);
  // la fente : son fond sombre (l'intérieur d'une boîte), et le mur autour, qui cache ce qui est derrière lui (il
  // n'écrit que la profondeur : on voit la page à travers)
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: BLOCK.cavity, roughness: 1, side: THREE.BackSide }));
  // (quatre bandes qui se chevauchent autour de la fente, en unités de fente : pas de fissure entre elles)
  const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false }), mask = new THREE.Group();
  for (const [w, h, x, y] of [[7, 3, 0, 2], [7, 3, 0, -2], [3, 1.2, -2, 0], [3, 1.2, 2, 0]]) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(w, h), maskMat);
    band.position.set(x, y, 0);
    band.renderOrder = -1;
    mask.add(band);
  }
  gl.scene.add(group, cavity, mask);
  block = { faces, mesh, group, cavity, mask, angle: 0, from: 0, to: 0, t: 1, F: 0 };
  root.classList.add('statsBlock');                 // le texte HTML des chiffres s'efface (css) : le bloc l'affiche
  document.fonts?.ready.then(() => { for (const f of faces) f.key = ''; });
}
// sa place : là où étaient les chiffres (la colonne de droite), à la taille des chiffres
function layoutBlock() {
  if (!block) return;
  const F = parseFloat(getComputedStyle(rowsEl[0].querySelector('.stat__num')).fontSize) || 60;
  const H = window.innerHeight, mpp = (2 * gl.halfW) / H;   // m par px, au mur
  const w = BLOCK.w * F * mpp, a = BLOCK.h * F * mpp;
  const list = box.querySelector('.stats__list').getBoundingClientRect();
  block.x = (((list.left + list.right) / 2) / window.innerWidth - 0.5) * 2 * gl.halfW * gl.camera.aspect;
  block.w = w; block.a = a; block.mpp = mpp;
  block.mesh.scale.set(w, a, a);
  block.cavity.scale.set(w * 1.002, a * 1.46, a * 1.26);
  block.mask.scale.set(w, a, 1);
  if (F !== block.F) {                              // les images des faces, à la taille de l'écran
    block.F = F;
    for (const f of block.faces) {
      f.canvas.width = Math.round(BLOCK.w * F * BLOCK.sharp);
      f.canvas.height = Math.round(BLOCK.h * F * BLOCK.sharp);
      f.key = '';
    }
  }
}
// une face : le chiffre (et son unité, en vert), son titre et sa description, comme dans la page (css : .stat)
function drawFace(f) {
  const li = rowsEl[f.i], strong = li.querySelector('.stat__text strong');
  const count = li.querySelector('.stat__count').textContent, unit = li.querySelector('.stat__unit').textContent;
  const title = strong?.textContent.trim() ?? '';
  const desc = (strong?.parentElement.textContent ?? '').replace(strong?.textContent ?? '', '').replace(/\s+/g, ' ').trim();
  const key = [count, unit, title, desc, f.canvas.width].join('|');
  if (key === f.key) return;
  f.key = key;
  const c = f.canvas.getContext('2d'), W = f.canvas.width, Hh = f.canvas.height, F = block.F * BLOCK.sharp;
  c.fillStyle = BLOCK.paper;
  c.fillRect(0, 0, W, Hh);
  c.textBaseline = 'alphabetic';
  // le texte : le titre, puis la description, coupée en lignes
  const tf = `800 ${0.44 * F}px Manrope, sans-serif`, df = `500 ${0.28 * F}px Manrope, sans-serif`;
  c.font = tf;
  const tw = c.measureText(title).width;
  c.font = df;
  const lines = [];
  let line = '';
  for (const word of desc.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (line && c.measureText(test).width > 4.7 * F) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  const textW = Math.max(tw, ...lines.map((l) => c.measureText(l).width));
  // le chiffre
  const nf = `800 ${F}px Manrope, sans-serif`, uf = `800 ${0.5 * F}px Manrope, sans-serif`;
  c.font = nf;
  const nw = c.measureText(count).width;
  c.font = uf;
  const uw = unit ? c.measureText(unit).width + 0.03 * F : 0;
  // l'ensemble, centré sur la face
  const gap = 0.3 * F, total = nw + uw + gap + textW, x0 = (W - total) / 2, cy = Hh / 2;
  c.fillStyle = BLOCK.ink;
  c.font = nf;
  c.fillText(count, x0, cy + 0.36 * F);
  if (unit) { c.fillStyle = BLOCK.green; c.font = uf; c.fillText(unit, x0 + nw + 0.03 * F, cy + 0.36 * F); }
  const th = 0.44 * F * 1.05 + 0.07 * F + lines.length * 0.28 * F * 1.08, top = cy - th / 2, tx = x0 + nw + uw + gap;
  c.fillStyle = BLOCK.ink;
  c.font = tf;
  c.fillText(title, tx, top + 0.44 * F * 0.85);
  c.fillStyle = BLOCK.grey;
  c.font = df;
  lines.forEach((l, k) => c.fillText(l, tx, top + 0.44 * F * 1.05 + 0.07 * F + 0.28 * F * (0.85 + k * 1.08)));
  f.map.needsUpdate = true;
}
// un pas : le quart de tour vers la face du chiffre lu (accéléré puis freiné, sans dépassement ; s'il change de cible
// en route, il repart de là où il est), sa place (avec la section)
function stepBlock(dt) {
  if (!block) return false;
  for (const f of block.faces) drawFace(f);
  const target = ((window.hsStats?.active ?? -1) + 1) * (Math.PI / 2);
  if (target !== block.to) { block.from = block.angle; block.to = target; block.t = 0; }
  const quarters = Math.max(1, Math.abs(block.to - block.from) / (Math.PI / 2));
  block.t = Math.min(1, block.t + dt / (BLOCK.turn * Math.sqrt(quarters)));
  const e = block.t < 0.5 ? 4 * block.t ** 3 : 1 - (-2 * block.t + 2) ** 3 / 2;
  block.angle = block.from + (block.to - block.from) * e;
  const y = (gl.ball.position.y / gl.half) * gl.halfW;   // avec la section (la boule et lui, à la même hauteur d'écran)
  block.group.position.set(block.x, y, gl.wallZ + 0.002 - block.a / 2);
  block.mesh.rotation.x = block.angle;
  block.cavity.position.set(block.x, y, gl.wallZ - 0.05 - (block.a * 1.26) / 2);   // tout entière derrière le mur
  block.mask.position.set(block.x, y, gl.wallZ - 0.003);
  return block.t < 1;
}

