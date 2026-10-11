// Le hero sur téléphone (et tout écran sans souris) : pas d'îlot. Le titre et la description au centre de l'écran ;
// autour d'eux, les objets des services flottent en apesanteur. Devant (toile .scene__front, au-dessus du texte), les
// plus grands, nets, posés sur le pourtour de l'écran, à moitié coupés par ses bords ; derrière (toile .scene__back,
// sous le texte), d'autres plus loin, plus petits et flous (css : filter blur), comme hors du plan net d'un objectif.
// Chacun dérive doucement : il monte et descend, tourne lentement sur lui-même, se balance un peu. Ils arrivent l'un
// après l'autre quand la page s'ouvre (html.intro), en grandissant depuis rien. En défilant, ceux de devant montent
// plus vite que la page et ceux du fond plus lentement : la profondeur se lit.
// Les objets sont ceux de l'îlot (models/ilot.glb, chargé par js/hero.js, qui nous le confie), avec leurs matières ;
// la lumière est celle des objets du mur des chiffres (js/statsmur.js : LIGHT).
import * as THREE from 'three';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// les objets : [nom (début du nom dans le modèle), place de son centre (part de la largeur, de la hauteur de l'écran ;
//  hors de [0, 1] : coupé par le bord), taille de sa plus grande dimension (part de la largeur de l'écran), pose de
//  départ (rad : x, y, z)] — devant, sur le pourtour (le centre reste libre pour le texte)
const FRONT = [
  ['Échelle', 0.1, 0.12, 0.58, [0.15, 0.5, 0.55]],
  ['Plante', 0.84, 0.15, 0.34, [0.25, -0.4, -0.18]],
  ['Marteau', 0.52, 0.2, 0.22, [0.4, 0.3, 0.9]],
  ['Seau', 0.02, 0.33, 0.26, [0.35, 0.6, 0.3]],
  ['Montage_1', 1.0, 0.68, 0.32, [0.3, -0.8, -0.25]],
  ['Sac_de_courses', 0.02, 0.69, 0.26, [0.2, 0.5, -0.15]],
  ['Tondeuse', 0.17, 0.87, 0.42, [0.35, 0.9, 0.12]],
  ['Carton_ouvert', 0.85, 0.88, 0.4, [0.45, -0.5, 0.1]],
];
// derrière, flous : plus petits, certains passent derrière le texte
const BACK = [
  ['Diable', 0.3, 0.3, 0.26, [0.3, 0.7, 0.35]],
  ['Chaise', 0.74, 0.31, 0.24, [0.4, -0.6, -0.2]],
  ['Râteau', 0.3, 0.7, 0.4, [0.5, 0.3, -0.7]],
  ['Colis_1', 0.72, 0.72, 0.16, [0.5, 0.5, 0.2]],
  ['Sac_poubelle', 0.6, 0.06, 0.17, [0.2, 0.4, 0.15]],
  ['Pot_renversé', 0.52, 0.8, 0.15, [0.6, -0.3, 0.4]],
  ['Pulvérisateur', 0.14, 0.5, 0.17, [0.2, 0.9, -0.3]],
  ['Taille-haie', 0.9, 0.46, 0.26, [0.5, -0.2, 0.5]],
];
// [champ de la caméra (°), distance au plan des objets de devant (m), recul du fond (m)] ; le mouvement : [montée et
//  descente (part de la largeur de l'écran), leur période (s), rotation sur lui-même (rad/s), balancement (rad)] ;
//  l'arrivée : [durée de chacun (s), écart entre deux (s), attente après l'ouverture de la page (s)] ; parallaxe au
//  défilement : [devant, derrière (part du défilement, en plus ou en moins de la page)]
const VIEW = { fov: 30, dist: 10, back: 9 };
const DRIFT = { bob: 0.018, period: [4.5, 7.5], spin: [0.08, 0.2], sway: 0.18 };
const ARRIVE = { dur: 1.1, gap: 0.07, wait: 0.35 };
const PARALLAX = { front: 0.25, back: -0.35 };
const LIGHT = { sky: '#dfe9ff', ground: '#d8d1c2', skyI: 1.3, sun: '#fff4e0', sunI: 3.6, dir: [-0.4, 0.8, 0.9] };

const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; })();
const backOut = (t) => { const c = 1.4; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };

function layer(host, cls) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;      // comme l'îlot (js/hero.js)
  renderer.toneMappingExposure = 2.3;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = cls;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.skyI));
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunI);
  sun.position.set(...LIGHT.dir);
  scene.add(sun);
  return { renderer, scene };
}

export function floatHero(model, host) {
  root.classList.add('heroFloat');                 // css : le texte au centre, les deux toiles
  const front = layer(host, 'scene__front'), back = layer(host, 'scene__back');
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 100);
  camera.position.set(0, 0, VIEW.dist);

  // un objet du modèle, centré sur lui-même, sur un pivot (sa pose, son mouvement)
  const find = (name) => model.children.find((o) => o.userData.service && o.name.startsWith(name));
  const items = [];
  const add = ([name, x, y, size, rot], L, z) => {
    const src = find(name);
    if (!src) return;
    const o = src.clone(true);
    o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    // ses matières et ses formes à lui : chaque toile a son propre contexte WebGL
    o.traverse((m) => {
      if (!m.isMesh) return;
      m.geometry = m.geometry.clone();
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone();
    });
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3());
    const dim = box.getSize(new THREE.Vector3());
    o.position.copy(c).negate();
    const pivot = new THREE.Group();
    pivot.add(o);
    L.scene.add(pivot);
    items.push({ pivot, x, y, size, z, rot, max: Math.max(dim.x, dim.y, dim.z), layer: L,
      ph: rnd() * Math.PI * 2, period: DRIFT.period[0] + rnd() * (DRIFT.period[1] - DRIFT.period[0]),
      spin: (rnd() < 0.5 ? -1 : 1) * (DRIFT.spin[0] + rnd() * (DRIFT.spin[1] - DRIFT.spin[0])), k: reduced ? 1 : 0 });
  };
  FRONT.forEach((d) => add(d, front, 0));
  BACK.forEach((d) => add(d, back, -VIEW.back));
  // l'ordre d'arrivée : en désordre, ceux de devant et du fond mêlés
  const order = items.map((it, i) => i).sort(() => rnd() - 0.5);
  order.forEach((i, n) => { items[i].delay = n * ARRIVE.gap; });

  // la place de chacun : son centre sur l'écran, à sa profondeur ; sa taille en part de la largeur de l'écran
  let W = 1, H = 1;
  function layout() {
    W = host.clientWidth || window.innerWidth; H = host.clientHeight || window.innerHeight;
    for (const L of [front, back]) L.renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  const halfH = (z) => (VIEW.dist - z) * Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));

  let t0 = -1, last = performance.now(), time = 0;
  const begin = () => { if (t0 < 0) t0 = time + ARRIVE.wait; };
  if (root.classList.contains('intro')) begin();
  window.addEventListener('site:intro', begin, { once: true });

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    const scrolled = -host.getBoundingClientRect().top;   // le hero défile avec la page
    for (const it of items) {
      const h = halfH(it.z), w = h * camera.aspect;
      if (!reduced && t0 >= 0) it.k = Math.min(1, Math.max(0, (time - t0 - it.delay) / ARRIVE.dur));
      const s = (it.size * 2 * w) / it.max * Math.max(backOut(it.k), 0.001);
      const t = reduced ? 0 : time;
      const bob = Math.sin((t / it.period) * Math.PI * 2 + it.ph) * DRIFT.bob * 2 * w;
      // parallaxe : en part du défilement, à la profondeur de l'objet (px → m)
      const par = (it.z === 0 ? PARALLAX.front : PARALLAX.back) * scrolled * (2 * h / H);
      it.pivot.position.set((it.x * 2 - 1) * w, (1 - it.y * 2) * h + bob + par, it.z);
      it.pivot.scale.setScalar(s);
      it.pivot.visible = it.k > 0;
      it.pivot.rotation.set(it.rot[0] + Math.sin(t * 0.4 + it.ph) * DRIFT.sway, it.rot[1] + t * it.spin,
        it.rot[2] + Math.cos(t * 0.33 + it.ph) * DRIFT.sway * 0.6);
    }
    const r = host.getBoundingClientRect();
    if (r.bottom > 0) {                             // à l'écran : on dessine
      front.renderer.render(front.scene, camera);
      back.renderer.render(back.scene, camera);
    }
    if (!reduced || items.some((it) => it.k < 1)) requestAnimationFrame(frame);
  }
  layout();
  window.addEventListener('resize', layout);
  requestAnimationFrame(frame);
}
