// Hero de l'accueil : le vide blanc, en 3D temps réel (three.js). Un sol sans horizon qui se fond dans le blanc de la
// page, une flaque de lumière douce, de la poussière figée dans l'air (le temps n'existe plus : rien ne bouge, seul le
// regard tourne). Un objet sort du sol au chargement ; on tourne autour à la souris ou au doigt.
// Scène de référence : blender/hero.blend (mêmes cadrage, lumière et couleurs). L'objet est provisoire : il sera
// remplacé par un modèle exporté de Blender (.glb).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const host = document.getElementById('hero-scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = matchMedia('(max-width: 720px)').matches;

const PAPER = new THREE.Color('#f7f7f5');          // = --paper : le sol se fond exactement dans la page
const SKY = new THREE.Color('#fbfaf6');            // zénith, un rien plus chaud
const FLOOR = new THREE.Color('#e7e5e0');          // sol au pied de l'objet
const POOL = new THREE.Color('#f8f6f1');           // flaque de lumière
const TARGET = new THREE.Vector3(0, 0.55, 0);      // ce que la caméra regarde : le milieu de l'objet
const LIGHT_DIR = new THREE.Vector3(-3.5, 9, -2.5);   // la lampe de blender/hero.blend (y en haut)
const EMERGE_DELAY = 0.5, EMERGE_DUR = 2.8;        // s

// ------------------------------------------------------------ rendu
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch { host.classList.add('hero__scene--off'); throw new Error('WebGL indisponible'); }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;      // l'objet seulement : sol, ciel et poussière ne sont pas tonemappés
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
renderer.setClearColor(PAPER);
renderer.domElement.setAttribute('aria-hidden', 'true');
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 200);
camera.position.set(0, 2.3, 6.5);                 // = caméra Blender (0, -6.5, 2.3), objectif 45 mm

// bruit de valeur et tramage partagés : le tramage casse les bandes des dégradés presque blancs
const GLSL_NOISE = `
  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  vec3 dither(vec3 c) { return c + (hash(gl_FragCoord.xy) - 0.5) / 255.0; }`;

// ------------------------------------------------------------ ciel : blanc de la page à l'horizon, plus chaud en haut
const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, toneMapped: false,
  uniforms: { uPaper: { value: PAPER }, uSky: { value: SKY } },
  vertexShader: `varying vec3 vDir;
    void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 uPaper, uSky; varying vec3 vDir; ${GLSL_NOISE}
    void main() {
      gl_FragColor = vec4(mix(uPaper, uSky, smoothstep(0.0, 0.7, vDir.y)), 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb = dither(gl_FragColor.rgb);
    }`,
}));
scene.add(sky);

// ------------------------------------------------------------ sol : se lit au pied de l'objet, disparaît au loin
const floorU = {
  uPaper: { value: PAPER }, uFloor: { value: FLOOR }, uPool: { value: POOL },
  uRing: { value: 0 },                             // onde au sol quand l'objet sort (0 → 1)
};
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  toneMapped: false, uniforms: floorU,
  vertexShader: `varying vec2 vXZ;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 uPaper, uFloor, uPool; uniform float uRing; varying vec2 vXZ; ${GLSL_NOISE}
    void main() {
      float r = length(vXZ);
      vec3 c = mix(uFloor, uPool, exp(-r * r / 2.2) * 0.85);              // flaque de lumière douce
      // micro-relief du sol : deux échelles de bruit, à peine perceptibles
      c *= 1.0 + (vnoise(vXZ * 9.0) - 0.5) * 0.018 + (vnoise(vXZ * 60.0) - 0.5) * 0.012;
      // onde : le sol s'assombrit d'un rien sur un anneau qui s'éloigne de l'objet
      float ringR = 0.45 + uRing * 2.2;
      c *= 1.0 - exp(-pow((r - ringR) / 0.18, 2.0)) * 0.035 * (1.0 - uRing) * step(0.001, uRing);
      c = mix(c, uPaper, smoothstep(2.5, 13.0, r));                       // pas d'horizon : le sol devient la page
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
      gl_FragColor.rgb = dither(gl_FragColor.rgb);
    }`,
}));
scene.add(floor);

// ombre portée et ombre de contact, posées sur le sol, qui s'effacent avec lui
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ opacity: 0.11, transparent: true, depthWrite: false }));
shadowPlane.position.y = 0.001;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const contactTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(40,36,30,0.55)'); grd.addColorStop(0.45, 'rgba(40,36,30,0.18)'); grd.addColorStop(1, 'rgba(40,36,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
contact.position.y = 0.002;
scene.add(contact);

// ------------------------------------------------------------ lumière : la même lampe que dans Blender
scene.add(new THREE.HemisphereLight(0xfffaf2, 0xe6e8ec, 1.3));
const sun = new THREE.DirectionalLight(0xfff3e4, 2.4);
sun.position.copy(LIGHT_DIR);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 6;
sun.shadow.bias = -0.0004;
Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
scene.add(sun);

// ------------------------------------------------------------ objet provisoire : il sort du sol
// Tout ce qui passe sous le sol est coupé : l'objet semble traverser la surface.
const ground = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
const object = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.52, 16, 64), new THREE.MeshPhysicalMaterial({
  color: 0xf3f1ec, roughness: 0.32, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.2,
  clippingPlanes: ground, clipShadows: true,
}));
body.position.y = 0.6;
body.castShadow = true;
object.add(body);
scene.add(object);
const OBJ_H = 1.2;

// ------------------------------------------------------------ poussière figée
// Des grains gris immobiles, plus denses dans le faisceau de la lampe ; flous hors du plan de netteté.
const dust = (() => {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const N = small ? 700 : 1400;
  const pos = new Float32Array(N * 3), size = new Float32Array(N), tone = new Float32Array(N);
  const L = LIGHT_DIR.clone(), axis = L.clone().negate().normalize();
  const p1 = new THREE.Vector3(1, 0, 0).cross(axis).normalize(), p2 = axis.clone().cross(p1);
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    if (i < N * 0.6) {                             // dans le faisceau, entre la lampe et le sol
      const d = L.length() * (0.35 + rnd() * 0.65);
      const rad = Math.tan(0.2) * d * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
      v.copy(L).addScaledVector(axis, d).addScaledVector(p1, Math.cos(a) * rad).addScaledVector(p2, Math.sin(a) * rad);
      if (v.y < 0.03) v.y = 0.03 + rnd() * 0.3;
    } else {                                       // éparse, partout autour
      const a = rnd() * Math.PI * 2, r = 0.6 + rnd() * 7;
      v.set(Math.cos(a) * r, 0.03 + rnd() * 3.5, Math.sin(a) * r);
    }
    pos.set([v.x, v.y, v.z], i * 3);
    size[i] = (0.6 + rnd() * 1.4) * (rnd() < 0.04 ? 2.2 : 1);
    tone[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
  return new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uScale: { value: 1 }, uFocus: { value: 6.8 } },
    vertexShader: `attribute float aSize, aTone; uniform float uScale, uFocus; varying float vAlpha, vTone, vSoft;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float depth = -mv.z;
        float blur = clamp(abs(depth - uFocus) / uFocus, 0.0, 1.0);        // profondeur de champ
        gl_PointSize = aSize * uScale * (1.0 + blur * 3.0) / depth;
        vSoft = blur;
        vAlpha = (0.32 / (1.0 + blur * 9.0)) * (1.0 - smoothstep(6.0, 9.0, length(position.xz)));
        vTone = aTone;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vAlpha, vTone, vSoft;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(mix(0.55, 0.0, vSoft), 1.0, d);
        gl_FragColor = vec4(vec3(mix(0.5, 0.72, vTone)), a * vAlpha);
      }`,
  }));
})();
scene.add(dust);

// ------------------------------------------------------------ poussière lumineuse
// Quelques grains de lumière qui flottent autour de l'objet : un cœur presque blanc et un halo doré (sur le blanc,
// c'est le halo chaud qui les rend visibles). Chacun dérive lentement sur sa propre boucle et respire.
const glow = (() => {
  let s = 31;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const N = small ? 26 : 45;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = 0.5 + Math.pow(rnd(), 0.7) * 3.6;
    pos.set([Math.cos(a) * r, 0.12 + rnd() * 2.2, Math.sin(a) * r], i * 3);
    seed.set([rnd() * 100, 0.6 + rnd() * 0.8, 0.5 + rnd() * 1.2, rnd()], i * 4);   // phase, vitesse, taille, éclat
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  return new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { uScale: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `attribute vec4 aSeed; uniform float uScale, uTime; varying float vGlow;
      void main() {
        float ph = aSeed.x, sp = aSeed.y, t = uTime * 0.11 * sp + ph;
        // dérive lente sur une courbe fermée, un rien de montée et de descente
        vec3 p = position + vec3(sin(t) * 0.22 + sin(t * 2.3) * 0.06, sin(t * 1.4 + 1.7) * 0.14, cos(t * 0.9) * 0.22);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float breath = 0.65 + 0.35 * sin(uTime * (0.5 + aSeed.w * 0.7) + ph * 3.0);
        gl_PointSize = aSeed.z * uScale * 38.0 * (0.85 + 0.15 * breath) / -mv.z;
        vGlow = breath * (0.55 + aSeed.w * 0.45) * (1.0 - smoothstep(4.5, 7.0, length(p.xz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float core = exp(-d * d * 90.0), halo = exp(-d * d * 5.0) * (1.0 - d);
        vec3 col = mix(vec3(1.0, 0.76, 0.45), vec3(1.0, 0.975, 0.92), core);
        gl_FragColor = vec4(col, clamp(halo * 0.55 + core, 0.0, 1.0) * vGlow);
      }`,
  }));
})();
scene.add(glow);

// ------------------------------------------------------------ orbite à la souris
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableZoom = false;                       // la molette fait défiler la page
controls.enablePan = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.55;
controls.minPolarAngle = THREE.MathUtils.degToRad(58);   // jamais sous le sol, jamais à la verticale
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.autoRotate = !reduced;                    // le regard tourne lentement tant qu'on n'a pas pris la main
controls.autoRotateSpeed = 0.35;
controls.update();
let touched = false;
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  if (!touched) { touched = true; document.querySelector('.hero')?.classList.add('hero--touched'); }
});

// ------------------------------------------------------------ taille : l'objet reste cadré, même en portrait
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // en portrait, on élargit le champ pour que l'objet garde la même largeur apparente
  camera.fov = camera.aspect >= 1.2 ? 25 : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(12.5)) * 1.2 / camera.aspect));
  camera.updateProjectionMatrix();
  dust.material.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.009;
  glow.material.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.009;
}
new ResizeObserver(resize).observe(host);
resize();

// ------------------------------------------------------------ boucle : seulement quand le hero est visible
const ease = (t) => 1 - Math.pow(1 - t, 3);
const clock = new THREE.Clock();
let visible = true, running = false, t = 0;
function frame() {
  if (!visible || document.hidden) { running = false; return; }
  t += Math.min(clock.getDelta(), 0.05);
  const u = reduced ? 1 : THREE.MathUtils.clamp((t - EMERGE_DELAY) / EMERGE_DUR, 0, 1);
  object.position.y = -OBJ_H * (1 - ease(u));
  contact.material.opacity = ease(u);
  floorU.uRing.value = reduced ? 0 : THREE.MathUtils.clamp((t - EMERGE_DELAY) / (EMERGE_DUR * 1.1), 0, 1);
  if (!reduced) glow.material.uniforms.uTime.value = t;
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
function start() { if (!running && visible && !document.hidden) { running = true; clock.getDelta(); requestAnimationFrame(frame); } }
new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(host);
document.addEventListener('visibilitychange', start);
start();
