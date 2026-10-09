// Les chiffres, sous l'À propos — repris du plan 1 du site immersif (homeservice-immersive/web/js/app.js : STATS,
// STAT, toyOf, splitParts, scenes, updateStats). Chaque chiffre a sa petite scène, posée sur la page à sa gauche
// (models/services.glb, les mêmes modèles) : 5 services → un objet par service ; 19 communes → la carte de la Région,
// une pièce par commune ; 24 h → le devis qui sort de son enveloppe, le tampon, puis la coche verte. Quand sa ligne
// arrive à l'écran, son texte s'allume (il était là à 16 %), le chiffre se décompte (vite, puis il ralentit) et les
// éléments de la scène surgissent en rebondissant au rythme du décompte ; en remontant, tout se rejoue à l'envers.
// Le texte est du HTML (index.html, .stats) ; les scènes sont dessinées dans une toile posée sous lui, vue d'en haut
// comme dans le site immersif (même caméra en plongée, même soleil, mêmes ombres sur la page).
// Sur ordinateur seulement (comme l'îlot) ; ailleurs, ou sans mouvement, les chiffres sont simplement affichés.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const box = document.querySelector('.stats');
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
const live = desktop && !reduced;                  // le décompte et les scènes animées
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => x * x * (3 - 2 * x);
const backOut = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

// [une ligne s'allume dès qu'elle entre à l'écran (son haut passe au-dessus de cette part de l'écran), s'éteint quand
//  elle en est ressortie par le bas (son haut redescend sous celle-ci) ; temps (s) : le texte arrive, il s'allume, le décompte, un élément de la scène surgit]
const SHOW = { at: 0.97, off: 1, text: 0.45, on: 0.35, count: 1.6, pop: 0.4 };
// Les scènes, comme dans le site immersif (m) : [agrandissement des objets des services, de la carte, de l'enveloppe ;
//  échelle de la page (px par m, en tailles de chiffre F : celle relevée à l'écran du site immersif) ; centre de l'emplacement
//  de la scène, avant le bord droit des chiffres (en F) ; plongée de la caméra depuis la verticale (°) ; champ (°)]
const STAT = { toy: 2.2, map: 2.55, devis: 3.6, scale: 0.53, anchor: 3.6, tilt: 10, fov: 30 };
// la lumière du plan 1 du site immersif : ciel, soleil (sa course, dans le repère de l'écran : vers la droite, vers le
// haut de l'écran, vers le sol), force de l'ombre sur la page
const LIGHT = { sky: '#d6e9ff', ground: '#7a9a5e', skyI: 1.25, sun: '#fffaf2', sunI: 4.2, dir: [-0.5, 0.62, -0.42],
  shadow: 0.26, exposure: 1.1 };

const rows = box ? [...box.querySelectorAll('.stat')].map((li) => ({
  li, n: +li.dataset.n, kind: li.dataset.scene, num: li.querySelector('.stat__num'),
  count: li.querySelector('.stat__count'), unit: li.querySelector('.stat__unit'), sr: li.querySelector('.sr-only'),
  shown: false, text: 0, on: 0, k: 0, shownN: -1, els: [], group: null,
})) : [];

// l'unité (traduite : data-suffix, js/i18n.js) et le chiffre lu par les lecteurs d'écran
function labels() {
  for (const r of rows) {
    const u = r.li.dataset.suffix || '';
    if (r.unit) r.unit.textContent = u;
    if (r.sr) r.sr.textContent = `${r.n}${u ? ' ' + u : ''} `;
  }
}
labels();
window.addEventListener('hs:lang', labels);

// ------------------------------------------------------------ le texte et le décompte
function paint(r) {
  r.li.style.setProperty('--on', (0.16 + 0.84 * smooth(r.on)).toFixed(3));
  const v = Math.round(r.n * (1 - (1 - r.k) ** 3));
  if (v !== r.shownN) { r.shownN = v; r.count.textContent = String(v); }
}
for (const r of rows) { if (!live) r.text = r.on = r.k = 1; paint(r); }   // en attendant : là à 16 %, à 0

// une ligne arrive (le haut de son chiffre passe au-dessus de SHOW.at de l'écran), ou repart (sous SHOW.off)
function watch() {
  const vh = window.innerHeight;
  let changed = false;
  for (const r of rows) {
    const c = r.num.getBoundingClientRect().top / vh;   // le chiffre lui-même
    const shown = c < SHOW.at ? true : c > SHOW.off ? false : r.shown;
    if (shown !== r.shown) { r.shown = shown; changed = true; }
  }
  return changed;
}
// un pas : un court temps, puis le texte s'allume et le décompte commence ; les éléments de la scène suivent
function step(dt) {
  let busy = false;
  for (const r of rows) {
    const s = r.shown ? 1 : -1;
    r.text = clamp(r.text + s * dt / SHOW.text, 0, 1);
    const go = r.shown && r.text > 0.6 ? 1 : -1;
    r.on = clamp(r.on + go * dt / SHOW.on, 0, 1);
    r.k = clamp(r.k + go * dt / SHOW.count, 0, 1);
    paint(r);
    const vf = r.n * (1 - (1 - r.k) ** 3);
    for (const e of r.els) {                        // chaque élément surgit quand le chiffre le dépasse
      const go2 = vf > e.i + 0.35;
      if (e.delay) e.wait = go2 ? e.wait + dt : 0;   // les pièces d'un même objet, l'une après l'autre
      e.s = clamp(e.s + (go2 && !(e.wait < e.delay) ? 1 : -1) * dt / SHOW.pop, 0, 1);
      pose(e);
      if (e.s > 0 && e.s < 1) busy = true;
    }
    if ((r.text > 0 && r.text < 1) || (r.on > 0 && r.on < 1) || (r.k > 0 && r.k < 1)) busy = true;
  }
  return busy;
}
function pose(e) {
  const b = backOut(e.s);
  e.obj.visible = e.s > 0.001;
  if (e.kind === 'part') {
    e.obj.scale.setScalar(Math.max(b, 1e-3));
    e.obj.rotation.y = (1 - e.s) * 1.2;             // y : la verticale
  } else if (e.kind === 'slide') {                  // la feuille sort de l'enveloppe (repère glTF : z vers le bas)
    e.obj.position.z = e.from.z - e.dz * (1 - b);
    e.obj.scale.setScalar(Math.max(Math.min(1, e.s * 3), 1e-3));
  } else if (e.kind === 'pop') {
    e.obj.scale.setScalar(Math.max(b, 1e-3));
    e.obj.rotation.y = e.rot + (1 - e.s) * 1.2;
  } else if (e.kind === 'grow') e.obj.scale.y = Math.max(b, 1e-3);
}

// ------------------------------------------------------------ les scènes, en 3D (ordinateur seulement)
let gl = null;                                      // { renderer, scene, camera, canvas, sun, ground }
function initScenes(gltf) {
  const canvas = document.createElement('canvas');
  canvas.className = 'stats__scene';
  canvas.setAttribute('aria-hidden', 'true');
  box.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.skyI));
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  // la page : elle ne reçoit que les ombres (sa couleur reste celle de la page)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: LIGHT.shadow }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const camera = new THREE.PerspectiveCamera(STAT.fov, 1, 0.5, 600);

  // les objets en couleur (glTF, y en haut), centrés à plat, posés sur le sol ; agrandis de k
  const toyOf = (name, k) => {
    const src = gltf.scene.getObjectByName(name);
    if (!src) return null;
    const o = src.clone(true);
    o.position.set(0, 0, 0);
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.flatShading = true;
      m.material.emissive?.setRGB(0, 0, 0);
      m.castShadow = m.receiveShadow = true;
    });
    const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3());
    o.scale.multiplyScalar(k);
    o.position.set(-c.x * k, -b.min.y * k, -c.z * k);
    const pivot = new THREE.Group();
    pivot.add(o);
    return pivot;
  };
  // découpe un modèle en pièces animables : une pièce = les maillages dont le nom commence par l'un de ses préfixes
  // (le plus long l'emporte) ; chaque pièce est un groupe posé au centre bas de son emprise : elle grandit sur place
  const splitParts = (pivot, groups) => {
    const model = pivot.children[0];
    const meshes = [...model.children];
    model.updateMatrixWorld(true);
    const toModel = model.matrixWorld.clone().invert();
    return groups.map((prefixes, j) => {
      const mine = meshes.filter((m) => {
        let best = null;
        for (const [k, list] of groups.entries()) for (const p of list) {
          if (m.name.startsWith(p) && (!best || p.length > best.len)) best = { k, len: p.length };
        }
        return best?.k === j;
      });
      const bx = new THREE.Box3();
      for (const c of mine) c.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        bx.union(m.geometry.boundingBox.clone().applyMatrix4(toModel.clone().multiply(m.matrixWorld)));
      });
      const part = new THREE.Group();
      part.position.set((bx.min.x + bx.max.x) / 2, bx.min.y, (bx.min.z + bx.max.z) / 2);
      for (const m of mine) { m.position.sub(part.position); part.add(m); }
      model.add(part);
      return part;
    });
  };
  // dans l'emplacement d'une scène : x vers la droite de l'écran, y vers le haut (comme dans le site immersif)
  const at = (o, x, y) => o.position.set(x, 0, -y);
  const scenes = {
    services: (spot) => {                           // un objet par service : en groupe, la brouette au milieu
      const places = [['nettoyage', -1.1, 1.8], ['livraison', 3.75, 1.7], ['jardinage', 1.35, 0.15],
        ['montage', -0.95, -1.5], ['desencombrement', 3.35, -1.45]];
      const parts = {                               // services en plusieurs pièces : chacune surgit à son tour
        nettoyage: [['Seau', 'Rebord', 'Cerclage', 'Anse', 'Attache', 'Eau'], ['Éponge', 'Grattoir']],
        desencombrement: [['Carton', 'Scotch'], ['Sac', 'Col_du_sac', 'Oreille', 'Lien']],
        montage: [['Caisse', 'Couvercle', 'Fermoir', 'Montant_poignée', 'Poignée_caisse'],
          ['Corps_visseuse', 'Poignée_visseuse', 'Batterie', 'Mandrin', 'Embout'], ['Clé_Allen']],
        livraison: [['Sac', 'Bande', 'Anse', 'Baguette', 'Poireau', 'Feuille_poireau', 'Pomme_1'], ['Pomme_2', 'Queue']],
      };
      return places.flatMap(([n, x, y], i) => {
        const o = toyOf(`Stat_${n}`, STAT.toy);
        if (!o) return [];
        at(o, x, y);
        spot.add(o);
        if (!parts[n]) return [{ obj: o, i, kind: 'pop', rot: 0 }];
        return splitParts(o, parts[n]).map((part, j) => ({ obj: part, i, kind: 'part', delay: j * 0.22, wait: 0 }));
      });
    },
    communes: (spot) => {                           // la carte : chaque commune sort du sol, du centre vers le bord
      const o = toyOf('Stat_communes', STAT.map);
      if (!o) return [];
      at(o, 1.15, 0);
      spot.add(o);
      const model = o.children[0];
      model.children.filter((m) => m.name.startsWith('Fantôme')).forEach((m) => model.remove(m));
      model.updateMatrixWorld(true);
      const toModel = model.matrixWorld.clone().invert();
      const dist = (m) => {
        const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).applyMatrix4(toModel);
        return Math.hypot(c.x, c.z);
      };
      return model.children.filter((m) => m.name.startsWith('Commune'))
        .map((m) => ({ m, d: dist(m) })).sort((a, b) => a.d - b.d)
        .map(({ m }, i) => ({ obj: m, i, kind: 'grow' }));
    },
    devis: (spot) => {                              // le devis arrive, et il est tamponné
      const o = toyOf('Stat_devis', STAT.devis);
      if (!o) return [];
      at(o, 0.9, 0);
      spot.add(o);
      const [env, sheet, stamp, mark] = splitParts(o, [['Enveloppe', 'Rabat'], ['Devis'], ['Tampon'], ['Empreinte', 'Coche']]);
      return [
        { obj: env, i: 0, kind: 'part' },
        { obj: sheet, i: 6, kind: 'slide', from: sheet.position.clone(), dz: -0.3 },
        { obj: stamp, i: 14, kind: 'part' },
        { obj: mark, i: 22.6, kind: 'part' },
      ];
    },
  };
  for (const r of rows) {
    r.group = new THREE.Group();
    scene.add(r.group);
    r.els = (scenes[r.kind] || (() => []))(r.group);
    for (const e of r.els) { e.s = live ? 0 : 1; e.wait = 0; pose(e); }
  }
  gl = { renderer, scene, camera, canvas, sun, ground };
  root.classList.add('stats3d');
  layout();
}

// la toile couvre la liste (et ses marges, pour les ombres) ; la caméra la voit comme le site immersif voit le sol :
// en plongée, à l'échelle de la page au milieu (STAT.scale F par m) ; chaque scène est posée là où tombe, sur le sol,
// le centre de son emplacement (STAT.anchor F avant le bord droit des chiffres, au milieu de la ligne)
const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function layout() {
  if (!gl || !rows.length) return;
  const F = parseFloat(getComputedStyle(rows[0].num).fontSize);
  const list = box.querySelector('.stats__list').getBoundingClientRect(), sec = box.getBoundingClientRect();
  const m = 1.6 * F;
  const W = Math.round(list.width + 2 * m), H = Math.round(list.height + 2 * m);
  const left = list.left - sec.left - m, top = list.top - sec.top - m;
  Object.assign(gl.canvas.style, { left: `${left}px`, top: `${top}px`, width: `${W}px`, height: `${H}px` });
  gl.renderer.setSize(W, H, false);
  const s = F * STAT.scale;                         // px par m, au milieu
  const cam = gl.camera, th = THREE.MathUtils.degToRad(STAT.tilt);
  cam.aspect = W / H;
  const D = (H / 2) / (s * Math.tan(THREE.MathUtils.degToRad(STAT.fov) / 2));
  cam.position.set(0, D * Math.cos(th), D * Math.sin(th));
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const hit = new THREE.Vector3();
  for (const r of rows) {
    const n = r.num.getBoundingClientRect(), l = r.li.getBoundingClientRect();
    const px = n.right - STAT.anchor * F - (list.left - m), py = (l.top + l.bottom) / 2 - (list.top - m);
    _ndc.set((px / W) * 2 - 1, 1 - (py / H) * 2);
    _ray.setFromCamera(_ndc, cam);
    if (_ray.ray.intersectPlane(_plane, hit)) r.group.position.copy(hit);
  }
  // le soleil et son ombre couvrent tout le sol vu
  const span = Math.max(W, H) / s;
  const [dx, dy, dz] = LIGHT.dir;                   // sa course : (droite, haut de l'écran, sol) → (x, −z, −y)
  const d = new THREE.Vector3(dx, dz, -dy).normalize();
  gl.sun.target.position.set(0, 0, 0);
  gl.sun.position.copy(d).multiplyScalar(-span * 2);
  Object.assign(gl.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.1, far: span * 5 });
  gl.sun.shadow.camera.updateProjectionMatrix();
  gl.ground.scale.set(span * 3, span * 3, 1);
  draw();
}
function draw() { if (gl) gl.renderer.render(gl.scene, gl.camera); }

// ------------------------------------------------------------ la boucle : seulement quand quelque chose bouge
let raf = 0, last = 0, visible = false;
function frame(now) {
  raf = 0;
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  const busy = step(dt);
  draw();
  if (busy || rows.some((r) => r.shown !== (r.k >= 1))) raf = requestAnimationFrame(frame);
}
function wake() {
  if (!live || raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
if (box && rows.length) {
  if (live) {
    window.addEventListener('scroll', () => { if (visible && watch()) wake(); }, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && watch()) wake(); }).observe(box);
  }
  if (desktop) {
    const draco = new DRACOLoader().setDecoderPath('js/draco/');
    new GLTFLoader().setDRACOLoader(draco).loadAsync(__STATS__).then((gltf) => {
      try { initScenes(gltf); } catch { /* sans WebGL : les chiffres seuls */ }
      watch(); wake();
    }).catch(() => {});
    new ResizeObserver(() => layout()).observe(box);
    window.addEventListener('hs:lang', () => requestAnimationFrame(layout));
    document.fonts?.ready.then(layout);
  }
}
