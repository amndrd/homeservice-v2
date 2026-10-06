// Hero de l'accueil : l'îlot des services (models/ilot.glb, exporté de blender/hero.blend par
// blender/scripts/export_web.py), en 3D temps réel. Il sort du blanc de la page : hors de l'herbe, le sol prend
// exactement la couleur de la page, avec un bord net comme dans Blender. L'îlot vit comme dans hero.blend
// (blender/scripts/vfx.py, printemps.py) : l'herbe et les fougères ondulent sous la brise, du pollen doré flotte, des
// aigrettes de pissenlit dérivent avec le vent, des papillons volettent. À l'arrivée, le vide blanc le révèle (plus bas).
// Présentation reprise des dioramas de la section Services du site immersif (homeservice-immersive, web/js/app.js,
// SVC_SHOT, MINI, MINI_PITCH) : caméra fixe en légère plongée, modèle de trois quarts qui tourne lentement sur lui-même ;
// on l'attrape pour le faire tourner autour de la verticale (lâché, il garde un peu d'élan, qui se fond dans la rotation lente) ou le basculer d'un glissé
// vertical (lâché, il revient à plat).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const host = document.getElementById('hero-scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const PAPER = '#f7f7f5';                            // = --paper
const MODEL = 'models/ilot.glb?v=panneau-glissant';    // la version force le rechargement quand le modèle change
// La caméra des dioramas du site immersif : objectif 35 mm, en face du modèle, qu'elle domine de 10,6 m à 36 m de
// distance (SVC_SHOT : recul 33, hauteur 18 ; MINI : 3 m plus loin, à 7,4 m) — une plongée de 16,4°.
const LENS = 35;
const DIVE = Math.atan2(18 - 7.4, 33 + 3.0);
const CENTER = new THREE.Vector3(0, 0.95, 0);       // le milieu de l'îlot : pivot de ses rotations, visé par la caméra
// rotation autour de la verticale (MINI) : [angle de départ, de trois quarts (rad) — à peu près celui de la caméra de
// hero.blend —, rotation lente sur lui-même (rad/s ; 0,3 dans le site immersif, plus lente ici : un tour en ~50 s),
// rad par pixel glissé (0,009 dans le site immersif, ralenti ici), retour de l'élan à la rotation lente (1/s)]
const TURN = { yaw: -0.5, spin: 0.12, drag: 0.006, settle: 3 };
// bascule autour de l'axe horizontal de l'écran (MINI_PITCH) : [rad par pixel glissé, max vers la caméra (rad), marge
// gardée avant de voir le sol par la tranche (rad), vitesse du retour à plat (1/s), écart gardé entre le bord du sol et
// le bas de la description (px)]. Vers la caméra, la bascule s'arrête aussi avant que le sol ne passe devant le texte
// (tiltUp, calculé au cadrage) : seuls les objets posés dessus peuvent passer devant.
const TILT = { drag: 0.006, up: 0.3, margin: 0.14, back: 4, gap: 10 };
const GROUND_Y = 1.197;                             // hauteur du sol plat de l'îlot (blender/scripts/plat.py : PLAT)
const GRASS_R = 5.2;                                // on n'attrape l'îlot que sur l'herbe, pas sur le sol fondu dans la page
const FIT_RADIUS = 5.4;                             // rayon de l'îlot (herbe), pour le cadrage (m)
// Place de l'îlot à l'écran : en grand, dans la moitié basse, sous le titre et la description.
// [centre de l'îlot (part de la largeur, de la hauteur de l'écran), largeur qu'il occupe (part de l'écran)]
const FRAME = { wide: { x: 0.5, y: 0.73, width: 0.84 }, tall: { x: 0.5, y: 0.74, width: 1.6 } };
const FPS = 24;                                     // le temps de hero.blend (les pilotes sont écrits en frames)

const blender = (x, y, z) => new THREE.Vector3(x, z, -y);   // un point de Blender dans three

// ------------------------------------------------------------ look « Punchy » d'AgX, comme hero.blend
// three fait le mappage AgX de Blender sans look ; on y ajoute un look, juste après la sigmoïde. Blender (puissance
// 1,35, saturation 1,4) ne l'applique pas au même endroit de la chaîne : les valeurs sont réglées pour retrouver la
// saturation et la luminosité de ses rendus (blender/rendus). (Les commentaires des shaders sont retirés dans la
// version publiée de three : on s'accroche à une instruction.)
const LOOK = { power: 1.0, sat: 1.12 };
const AGX_SIGMOID = 'color = agxDefaultContrastApprox( color );';
if (THREE.ShaderChunk.tonemapping_pars_fragment.includes(AGX_SIGMOID)) {
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(AGX_SIGMOID,
    `${AGX_SIGMOID}
	float agxLuma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
	color = pow( max( color, vec3( 0.0 ) ), vec3( ${LOOK.power.toFixed(3)} ) );
	color = agxLuma + ${LOOK.sat.toFixed(3)} * ( color - agxLuma );`);
}

// ------------------------------------------------------------ rendu
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch {
  throw new Error('WebGL indisponible');            // la page reste blanche, sans l'îlot
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;        // comme hero.blend (AgX Punchy, exposition +1,6)
renderer.toneMappingExposure = 2.3;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// l'îlot tourne sous un soleil fixe : l'ombre est recalculée à chaque image
// toile transparente, posée sur le titre et la description : les objets de l'îlot passent devant eux
renderer.setClearColor(PAPER, 0);
renderer.domElement.setAttribute('aria-hidden', 'true');
host.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const clock = new THREE.Clock();
const uTime = { value: 0 };

// l'îlot sur ses deux pivots, au centre de l'îlot : bascule (axe horizontal de l'écran), puis rotation autour de la
// verticale. Tout ce qui vit sur l'îlot (papillons, pollen, aigrettes) tourne avec lui.
const pitch = new THREE.Group();
pitch.position.copy(CENTER);
const yaw = new THREE.Group();
const island = new THREE.Group();
island.position.copy(CENTER).negate();
scene.add(pitch);
pitch.add(yaw);
yaw.add(island);
const uIslandInv = { value: new THREE.Matrix4() };  // monde → repère de l'îlot (le vent souffle dans ce repère)

// ------------------------------------------------------------ lumière de hero.blend : un matin de printemps
// (blender/scripts/printemps.py, LUMIERE) : ciel qui éclaire en bleu frais, soleil bas et doré venant de l'avant
// gauche, contre-jour qui fait briller les pointes de l'herbe, rai de lumière au centre
const LIGHT = { sky: '#bcd9ff', ground: '#9fd27a', skyI: 1.25, sun: '#fff0d6', sunI: 3.9, sunElev: 26,
  back: '#fff3c4', backI: 1.9, backElev: 16 };
scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.skyI));
const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunI);
{
  const e = THREE.MathUtils.degToRad(LIGHT.sunElev), h = new THREE.Vector2(-0.47, -0.671).normalize();
  sun.position.copy(blender(h.x * Math.cos(e), h.y * Math.cos(e), Math.sin(e))).multiplyScalar(14);
}
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
// contre-jour : de derrière l'îlot, face à la caméra (fixe), sans ombre
const back = new THREE.DirectionalLight(LIGHT.back, LIGHT.backI);
back.position.set(0, Math.sin(THREE.MathUtils.degToRad(LIGHT.backElev)), -Math.cos(THREE.MathUtils.degToRad(LIGHT.backElev))).multiplyScalar(14);
scene.add(back);
const rai = new THREE.SpotLight('#fff7ea', 90, 0, 0.26, 1, 2);
rai.position.copy(blender(-3.5, 2.5, 9));
rai.target.position.copy(blender(-0.46, 0.33, 1.2));
scene.add(rai, rai.target);

// ------------------------------------------------------------ apparition : le vide blanc révèle l'îlot
// Repris du vide du site immersif (homeservice-immersive/web/js/app.js : VD_NOISE, addVoid, MINI_VOID) et du voile
// des onglets (js/veil.js) : même bruit, même formule, même bord net. L'îlot est là, entier ; le blanc de la page le
// couvre, puis se retire depuis le centre. Un point se découvre, le front s'élargit ; en avant de lui, des taches se
// découvrent déjà, des trous s'ouvrent ; il traverse le sol, les plantes, les objets et leurs ombres (ce qui est
// encore dans le vide n'est pas dessiné : on voit la page). Un point haut demande un peu plus d'avance au front qu'un
// point au sol : un objet se découvre du pied vers le haut (uRise du site immersif).
// Échelle : le voile compte 20 m de sol sur la hauteur de l'écran, le hero environ 10 m ; le bruit est deux fois plus
// serré (0,33 et 1,9 → 0,66 et 3,8 par m) et le bord deux fois moins profond (6 → 3 m) : mêmes ondulations à l'écran.
// [attente (s), durée (s), fréquences des deux octaves du bruit (1/m), profondeur du bord (m), rayon de départ (m :
// seules quelques taches, au plus fort du bruit, sont déjà découvertes), rayon de l'herbe à découvrir (m), biseau (m
// d'avance demandés par m de hauteur au-dessus du sol), hauteur du sol (m)]
// Le front ne parcourt que ce qui se voit : au-delà de l'herbe, le sol a la couleur de la page.
const REVEAL = { wait: 0.3, dur: 3.6, f1: 0.66, f2: 3.8, edge: 3.0, start: -1.6, rmax: 5.6, rise: 3.0, ground: 0.9 };
const R0 = REVEAL.start;
const R1 = REVEAL.rmax + 1.0;                      // fin : tout est découvert, sommets compris
const uReveal = { value: reduced ? 1e5 : R0 };     // rayon du front (m)
// bruit du bord du vide, identique à celui du site immersif et du voile des onglets
const VD_NOISE = `
float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vdNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
// distance au vide (m) : > 0 découvert, < 0 encore dans le blanc. Le bruit ne fait que découvrir en avance.
const VOID_FRAG = `
uniform float uReveal; varying vec3 vVoidP;
${VD_NOISE}
float voidD() {
  float n = vdNoise(vVoidP * ${REVEAL.f1.toFixed(2)}) * 0.75 + vdNoise(vVoidP * ${REVEAL.f2.toFixed(2)}) * 0.25;
  return uReveal - length(vVoidP.xz) - max(vVoidP.y - ${REVEAL.ground.toFixed(2)}, 0.0) / ${REVEAL.rise.toFixed(1)} + n * ${REVEAL.edge.toFixed(1)};
}`;
const voidPatched = new WeakSet();
// le vide sur un matériau : chaque fragment encore dans le blanc n'est pas dessiné. Le calcul se fait dans le repère
// de l'îlot : le dessin du bord tourne avec lui si on le fait tourner pendant l'apparition.
function voidify(m) {
  if (voidPatched.has(m)) return m;
  voidPatched.add(m);
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uReveal = uReveal;
    sh.uniforms.uIslandInv = uIslandInv;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uIslandInv;\nvarying vec3 vVoidP;')
      .replace('#include <project_vertex>', 'vVoidP = ( uIslandInv * modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + VOID_FRAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif ( uReveal < 1e4 && voidD() < 0.0 ) discard;');
  };
  m.customProgramCacheKey = () => prevKey() + '|vide';
  return m;
}
// le même calcul, côté script (pollen et aigrettes : rien tant que l'endroit est dans le vide)
const vdFract = (x) => x - Math.floor(x);
function vdHash(x, y, z) {
  x = vdFract(x * 0.3183099 + 0.1) * 17; y = vdFract(y * 0.3183099 + 0.1) * 17; z = vdFract(z * 0.3183099 + 0.1) * 17;
  return vdFract(x * y * z * (x + y + z));
}
function vdNoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t, h = (a, b, c) => vdHash(ix + a, iy + b, iz + c);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), fx), l(h(0, 1, 0), h(1, 1, 0), fx), fy),
           l(l(h(0, 0, 1), h(1, 0, 1), fx), l(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
function voidD(p) {
  if (uReveal.value > 1e4) return 1;
  const n = vdNoise(p.x * REVEAL.f1, p.y * REVEAL.f1, p.z * REVEAL.f1) * 0.75
    + vdNoise(p.x * REVEAL.f2, p.y * REVEAL.f2, p.z * REVEAL.f2) * 0.25;
  return uReveal.value - Math.hypot(p.x, p.z) - Math.max(p.y - REVEAL.ground, 0) / REVEAL.rise + n * REVEAL.edge;
}

// ------------------------------------------------------------ le sol : bord net, la page au-delà
// La texture du sol porte la couleur de l'herbe, et dans son alpha la distance au bord de l'herbe (0,5 sur le bord,
// linéaire sur ±0,5 m). Seuillée au pixel près (fwidth), elle donne un bord net à toutes les distances, sans le flou
// des textures vues de biais. Au-delà du bord, après le mappage des tons, le sol prend la couleur de la page.
function blendIntoPage(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nfloat grassMask = 1.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          float edge = texture2D( map, vMapUv ).a;
          float aa = max( fwidth( edge ), 1e-4 );
          grassMask = smoothstep( 0.5 - aa, 0.5 + aa, edge );
        #endif
`)
      .replace('#include <colorspace_fragment>',
        '#include <colorspace_fragment>\ngl_FragColor = vec4(gl_FragColor.rgb * grassMask, grassMask);');   // prémultiplié
  };
  material.customProgramCacheKey = () => 'ilot-sol';
}

// ------------------------------------------------------------ le vent dans l'herbe (vfx.py, VENT et wind_group)
// Même calcul que le Geometry Nodes « Vent » : des vagues qui avancent dans le sens de la brise, des rafales (bruit
// qui dérive), un frémissement propre à chaque brin ; la souplesse (0 au pied, 1 en haut) dit qui plie.
const VENT = { dir: THREE.MathUtils.degToRad(20), amp: 0.075, vague: 1.5, vitesse: 2.1, rafale: 0.35, fremi: 0.12 };
const WIND_GLSL = `
  uniform float uTime;
  attribute float _souplesse;
  vec2 windHash( vec2 p ) {
    p = vec2( dot( p, vec2( 127.1, 311.7 ) ), dot( p, vec2( 269.5, 183.3 ) ) );
    return -1.0 + 2.0 * fract( sin( p ) * 43758.5453123 );
  }
  float windNoise( vec2 p ) {                         // bruit de gradient, centré sur 0,5 comme le Noise de Blender
    vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
    float n = mix( mix( dot( windHash( i ), f ), dot( windHash( i + vec2( 1, 0 ) ), f - vec2( 1, 0 ) ), u.x ),
                   mix( dot( windHash( i + vec2( 0, 1 ) ), f - vec2( 0, 1 ) ), dot( windHash( i + vec2( 1, 1 ) ), f - vec2( 1, 1 ) ), u.x ), u.y );
    return 0.5 + 0.5 * n;
  }`;
// (uIslandInv, le repère de l'îlot, est déclaré par voidify : tout matériau venté est aussi soumis au vide)
function windy(material) {
  const dx = Math.cos(VENT.dir).toFixed(5), dy = Math.sin(VENT.dir).toFixed(5);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          mat4 toIsland = uIslandInv * modelMatrix;     // le vent suit l'îlot quand il tourne
          vec4 wp = toIsland * vec4( transformed, 1.0 );
          vec2 b = vec2( wp.x, - wp.z );                // en coordonnées de Blender
          vec2 d = vec2( ${dx}, ${dy} );
          float along = dot( b, d );
          float wave = 0.5 + 0.5 * sin( along * ${VENT.vague.toFixed(2)} - uTime * ${VENT.vitesse.toFixed(2)} );
          vec2 drift = b - uTime * ${VENT.rafale.toFixed(2)} * d;
          float nz = 0.67 * windNoise( drift * 0.35 ) + 0.33 * windNoise( drift * 0.7 + 7.3 );
          float gust = clamp( mix( 0.3, 1.0, ( nz - 0.35 ) / 0.3 ), 0.3, 1.0 );
          float flutter = ${VENT.fremi.toFixed(2)} * sin( uTime * 6.5 + ( b.x + b.y * 1.7 ) * 23.0 );
          float k = ( 0.15 + 0.85 * wave * gust + flutter ) * _souplesse * ${VENT.amp.toFixed(3)};
          vec3 off = vec3( k * d.x, - 0.35 * abs( k ), - k * d.y );   // three : (x, z, -y) de Blender
          transformed += inverse( mat3( toIsland ) ) * off;
        }`);
  };
  material.customProgramCacheKey = () => 'vent';
  return material;
}
// ombres : ce qui est encore dans le vide n'en projette pas (et l'ombre de l'herbe suit le vent)
const depthPlain = voidify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
const depthWind = voidify(windy(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })));

// ------------------------------------------------------------ particules : pollen et aigrettes (vfx.py)
// Les particules de Blender, refaites ici : chacune naît dans un volume (ellipsoïde), vit quelques secondes en
// dérivant (brise, mouvement brownien, un rien de montée pour les aigrettes), s'allume puis s'éteint.
const WIND_DIR = blender(Math.cos(VENT.dir), Math.sin(VENT.dir), 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

class Swarm {
  constructor({ count, center, radius, squash, life, drift, rise, brown, fadeIn, fadeOut, size, sizeRand, spin = 0 }) {
    Object.assign(this, { count, center, radius, squash, life, drift, rise, brown, fadeIn, fadeOut, size, sizeRand, spin });
    this.p = Array.from({ length: count }, () => this.spawn(true));
  }

  spawn(prewarm) {
    let x, y, z;
    do { x = rnd(-1, 1); y = rnd(-1, 1); z = rnd(-1, 1); } while (x * x + y * y + z * z > 1);
    const life = this.life * rnd(0.55, 1.45) / FPS;
    return {
      start: blender(this.center.x + x * this.radius, this.center.y + y * this.radius, this.center.z + z * this.radius * this.squash),
      born: uTime.value - (prewarm ? Math.random() * life : 0),
      life,
      size: this.size * (1 - this.sizeRand * Math.random()),
      ph: [rnd(0, 6.3), rnd(0, 6.3), rnd(0, 6.3)],
      fq: [rnd(0.25, 0.6), rnd(0.25, 0.6), rnd(0.25, 0.6)],
      turn: rnd(0, 6.3),
    };
  }

  // position, opacité et rotation de la particule i à l'instant t
  state(i, t, pos) {
    let q = this.p[i];
    if (t - q.born > q.life) q = this.p[i] = this.spawn(false);
    const age = t - q.born, a = age / q.life;
    pos.copy(q.start).addScaledVector(WIND_DIR, this.drift * age);
    pos.y += this.rise * age;
    pos.x += this.brown * Math.sin(age * q.fq[0] + q.ph[0]);
    pos.y += this.brown * 0.6 * Math.sin(age * q.fq[1] + q.ph[1]);
    pos.z += this.brown * Math.sin(age * q.fq[2] + q.ph[2]);
    return { alpha: smooth(0, this.fadeIn, a) * (1 - smooth(1 - this.fadeOut, 1, a)), size: q.size, turn: q.turn + this.spin * age };
  }
}

// pollen : points de lumière dorée en suspension (printemps.py : #ffe08a, émission 5)
const pollen = new Swarm({ count: 260, center: { x: 0, y: 0, z: 1.5 }, radius: 4.6, squash: 0.4, life: 220,
  drift: 0.035, rise: 0.0, brown: 0.12, fadeIn: 0.2, fadeOut: 0.3, size: 0.011, sizeRand: 0.6 });
const pollenGeo = new THREE.BufferGeometry();
pollenGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pollen.count * 3), 3));
pollenGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(pollen.count), 1));
pollenGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(pollen.count), 1));
const pollenMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,
  uniforms: { uColor: { value: new THREE.Color('#ffe08a') }, uScale: { value: 1 } },
  vertexShader: `
    attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max( 1.5, 2.0 * aSize * uScale / - mv.z );   // diamètre réel, au moins un pixel et demi
      vAlpha = aAlpha;
    }`,
  fragmentShader: `
    uniform vec3 uColor; varying float vAlpha;
    void main() {
      float r = length( gl_PointCoord - 0.5 ) * 2.0;
      float a = vAlpha * ( 1.0 - smoothstep( 0.55, 1.0, r ) );
      if ( a < 0.01 ) discard;
      gl_FragColor = vec4( uColor, a );
    }`,
});
const pollenPoints = new THREE.Points(pollenGeo, pollenMat);
pollenPoints.frustumCulled = false;

// aigrettes de pissenlit : debout (le parasol vers le ciel), elles dérivent avec la brise en tournoyant
const seeds = new Swarm({ count: 90, center: { x: 0, y: 0, z: 1.1 }, radius: 4.4, squash: 0.35, life: 260,
  drift: 0.16, rise: 0.025, brown: 0.18, fadeIn: 0.15, fadeOut: 0.25, size: 0.11, sizeRand: 0.35, spin: 0.5 });
let seedMesh = null;
const seedAlpha = new THREE.InstancedBufferAttribute(new Float32Array(seeds.count), 1);

function makeSeeds(template) {
  const geo = template.geometry.clone();
  geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));   // modèle bâti le long de +x : il se dresse
  geo.setAttribute('aAlpha', seedAlpha);
  const mat = new THREE.MeshStandardMaterial({ color: '#fbfaf4', emissive: '#fbfaf4', emissiveIntensity: 0.35,
    roughness: 0.6, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <opaque_fragment>', 'diffuseColor.a *= vAlpha;\n#include <opaque_fragment>');
  };
  seedMesh = new THREE.InstancedMesh(geo, mat, seeds.count);
  seedMesh.frustumCulled = false;
  seedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  island.add(seedMesh);
}

const _p = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
// pendant l'apparition : une particule encore dans le vide n'est pas dessinée
const born_ = (p) => (voidD(p) >= 0 ? 1 : 0);
function updateParticles(t) {
  const pos = pollenGeo.attributes.position, al = pollenGeo.attributes.aAlpha, sz = pollenGeo.attributes.aSize;
  for (let i = 0; i < pollen.count; i++) {
    const s = pollen.state(i, t, _p);
    pos.setXYZ(i, _p.x, _p.y, _p.z);
    al.setX(i, s.alpha * born_(_p));
    sz.setX(i, s.size);
  }
  pos.needsUpdate = al.needsUpdate = sz.needsUpdate = true;
  if (!seedMesh) return;
  for (let i = 0; i < seeds.count; i++) {
    const s = seeds.state(i, t, _p);
    _q.setFromAxisAngle(UP, s.turn);
    _m.compose(_p, _q, _s.setScalar(s.size));
    seedMesh.setMatrixAt(i, _m);
    seedAlpha.setX(i, s.alpha * born_(_p));
  }
  seedMesh.instanceMatrix.needsUpdate = true;
  seedAlpha.needsUpdate = true;
}

// ------------------------------------------------------------ papillons (vfx.py, printemps.py : les mêmes pilotes)
// Chaque papillon porte ses réglages (propriétés exportées) : centre du huit (cx, cy), hauteur (cz), rayon (rad),
// phase (ph), vitesse (sp). Ils dessinent un huit, montent et descendent un peu, s'orientent dans le sens du vol et
// battent des ailes.
const flyers = [];

function updateButterflies(t) {
  const f = t * FPS;
  for (const { node, wings, cx, cy, cz, rad, ph, sp } of flyers) {
    const x = cx + rad * Math.sin(f * sp + ph);
    const y = cy + rad * 0.8 * Math.sin(f * sp * 2 + ph);
    const z = cz + 0.06 * Math.sin(f * 0.31 + ph) + 0.03 * Math.sin(f * 0.9);
    node.position.copy(blender(x, y, z));
    node.rotation.set(0, Math.atan2(rad * 0.8 * 2 * Math.cos(f * sp * 2 + ph), rad * Math.cos(f * sp + ph)), 0);
    for (const [w, sgn] of wings) w.rotation.set(-sgn * (0.15 + 1.05 * Math.abs(Math.sin(f * 0.55 + ph))), 0, 0);
  }
}

// ------------------------------------------------------------ chargement de l'îlot
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
gltfLoader.load(MODEL, (gltf) => {
  const root = gltf.scene;
  let seedTemplate = null;
  const drop = [];
  root.traverse((o) => {
    if (o.name.startsWith('Gabarit')) {             // le modèle d'aigrette : il sert aux particules, pas à la scène
      if (o.isMesh && !seedTemplate) seedTemplate = o;
      drop.push(o);
      return;
    }
    if (!o.isMesh) return;
    o.castShadow = !o.name.startsWith('Vie');
    o.receiveShadow = true;
    const wind = !!o.geometry.attributes._souplesse && !reduced;
    if (o.material?.name === 'Îlot · sol (web)') {
      o.castShadow = false;
      o.material.map.colorSpace = THREE.SRGBColorSpace;
      o.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
      blendIntoPage(o.material);
    } else if (wind) {
      o.material = windy(o.material.clone());       // le vent ne touche que l'herbe, les fleurs et les fougères
    }
    voidify(o.material);                            // tout, sol compris, sort du vide
    o.customDepthMaterial = wind ? depthWind : depthPlain;
  });
  drop.forEach((o) => o.parent?.remove(o));
  root.updateMatrixWorld(true);                     // encore seul : son repère est celui de l'îlot

  // papillons : chaque corps (et ses deux ailes) suit ses pilotes de Blender
  const bodies = [];
  root.traverse((o) => { if (o.userData.papillon) bodies.push(o); });
  bodies.forEach((node) => {
    const { cx, cy, cz, rad, ph, sp } = node.userData;
    const wings = [];
    node.traverse((c) => {
      if (/aile g/.test(c.name) || /aile_g/.test(c.name)) wings.push([c, 1]);
      if (/aile d/.test(c.name) || /aile_d/.test(c.name)) wings.push([c, -1]);
      if (c.isMesh) c.material.side = THREE.DoubleSide;
    });
    node.parent.remove(node);
    island.add(node);
    flyers.push({ node, wings, cx, cy, cz, rad, ph, sp });
  });

  island.add(root);
  grabbable = root;
  if (!reduced) {
    island.add(pollenPoints);
    if (seedTemplate) makeSeeds(seedTemplate);
  }
  animating = !reduced;
  window.__heroReady = true;
  window.dispatchEvent(new Event('hero:ready'));   // l'écran de chargement peut s'effacer (js/veil.js)
  if (document.documentElement.classList.contains('intro')) born = uTime.value;
  start();
});
// l'apparition part avec l'entrée de la page (fin du chargement, ou sortie du voile)
window.addEventListener('site:intro', () => { born = uTime.value; }, { once: true });
setTimeout(() => { if (born < 0) born = uTime.value; }, 12500);   // filet de sécurité : l'îlot apparaît quand même

// ------------------------------------------------------------ apparition, image par image
// le front avance presque à vitesse constante, comme celui du voile des onglets (lisible), et ralentit un rien à la fin
let born = -1;                                      // instant où l'îlot commence à apparaître (entrée de la page)
function reveal(t) {
  if (reduced || uReveal.value > 1e4) return;
  if (born < 0) { uReveal.value = R0; return; }      // encore sous l'écran de chargement : tout est dans le vide
  const u = Math.min(1, Math.max(0, (t - born - REVEAL.wait) / REVEAL.dur));
  const e = u + (u * u * (3 - 2 * u) - u) * 0.35;
  uReveal.value = u >= 1 ? 1e5 : R0 + (R1 - R0) * e;   // fini : plus de calcul du vide
}

// ------------------------------------------------------------ on attrape l'îlot (site immersif : rotation à la souris)
// Glissé horizontal : il tourne autour de la verticale (lâché, il garde un peu d'élan, qui se fond dans la rotation
// lente). Glissé vertical : il bascule autour de l'axe horizontal de l'écran, dans des limites — jamais assez vers
// l'arrière pour voir le dessous du sol — et lâché, il revient à plat. Le curseur devient une main au survol.
const canvas = renderer.domElement;
let yawA = TURN.yaw, spinV = reduced ? 0 : TURN.spin, pitchA = 0, drag = null, grabbable = null;
const cruise = reduced ? 0 : TURN.spin;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function onIsland(e) {
  if (!grabbable) return false;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObject(grabbable, true)) {
    island.worldToLocal(_hit.copy(h.point));
    if (Math.hypot(_hit.x, _hit.z) < GRASS_R) return true;   // l'herbe, pas le sol fondu dans la page
  }
  return false;
}
canvas.addEventListener('pointerdown', (e) => {
  if (!onIsland(e)) return;
  drag = { x: e.clientX, y: e.clientY, t: performance.now() };
  spinV = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) { canvas.style.cursor = e.pointerType === 'mouse' && onIsland(e) ? 'grab' : ''; return; }
  const now = performance.now(), da = (e.clientX - drag.x) * TURN.drag;
  yawA += da;                                       // glisser vers la droite : l'avant part vers la droite
  spinV = da / Math.max((now - drag.t) / 1000, 1 / 120);   // rad/s, pour l'élan au lâcher
  pitchA += (e.clientY - drag.y) * TILT.drag;      // glisser vers le bas : le dessus vient vers nous
  drag = { x: e.clientX, y: e.clientY, t: now };
  dirty = true;
});
function release(e) {
  if (!drag) return;
  if (performance.now() - drag.t > 80) spinV = 0;  // tenu immobile avant de lâcher : pas d'élan
  drag = null;
  canvas.style.cursor = e.pointerType === 'mouse' && onIsland(e) ? 'grab' : '';
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

const tiltAxis = new THREE.Vector3(1, 0, 0);       // axe horizontal de l'écran (la caméra est en face)
function turn(dt) {
  if (!drag) {                                      // lâché : l'élan se fond peu à peu dans la rotation lente
    yawA += spinV * dt;
    spinV = cruise + (spinV - cruise) * Math.exp(-dt * TURN.settle);
  }
  pitchA = Math.min(tiltUp, Math.max(-Math.max(0, DIVE - TILT.margin), pitchA));
  if (!drag) pitchA *= Math.exp(-dt * TILT.back); // lâché : il revient en douceur à plat
  yaw.rotation.y = yawA;
  pitch.quaternion.setFromAxisAngle(tiltAxis, pitchA);
  island.updateMatrixWorld(true);
  uIslandInv.value.copy(island.matrixWorld).invert();
  return drag || Math.abs(spinV) > 1e-4 || Math.abs(pitchA) > 1e-4;
}

// ------------------------------------------------------------ cadrage : l'îlot entier, quelle que soit la fenêtre
let vfovR = 0, frameF = FRAME.wide, baseDist = 10;
function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.setFocalLength(LENS);
  vfovR = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfovR / 2) * camera.aspect);
  // recul pour que l'îlot, quelle que soit sa rotation, occupe la largeur voulue
  frameF = camera.aspect < 1 ? FRAME.tall : FRAME.wide;
  baseDist = FIT_RADIUS / (frameF.width * Math.tan(hfov / 2));
  // taille des points de pollen : leur diamètre réel, projeté à la hauteur de l'écran
  pollenMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(vfovR / 2));
  // la caméra des dioramas : en face, en légère plongée, l'îlot décalé à sa place à l'écran
  camera.position.set(0, Math.sin(DIVE) * baseDist, Math.cos(DIVE) * baseDist).add(CENTER);
  camera.lookAt(CENTER);
  basePos.copy(camera.position);
  camera.setViewOffset(w, h, -(frameF.x - 0.5) * w, -(frameF.y - 0.5) * h, w, h);
  camera.updateProjectionMatrix();
  tiltUp = maxTiltUp(h);
  sway.x += 1e-3;                                   // la caméra reprend son décalage autour de sa nouvelle place
  dirty = true;
}

// ------------------------------------------------------------ la caméra suit un peu la souris
// Elle glisse de quelques centimètres autour de sa place (souris à droite : elle part à droite ; en haut : elle monte),
// toujours tournée vers le centre de l'îlot, et rattrape la souris en douceur. Le titre et la description sont comme
// fixés dans la scène, au bord du fond de l'îlot (FIT_RADIUS derrière son centre) : ils bougent exactement comme un
// objet posé là.
// [déplacement quand la souris est au bord de la fenêtre, à l'horizontale et à la verticale (m), vitesse (1/s)]
const SWAY = { x: 0.35, y: 0.18, ease: 2.5 };
let textShift = 0;                                  // décalage vertical du texte (px), pris en compte par la bascule
const basePos = new THREE.Vector3();
const sway = { x: 0, y: 0, tx: 0, ty: 0 };
if (!reduced) {
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    sway.tx = (e.clientX / window.innerWidth) * 2 - 1;
    sway.ty = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { sway.tx = sway.ty = 0; });
}
const _right = new THREE.Vector3(), _up = new THREE.Vector3();
function swayCamera(dt) {
  const k = 1 - Math.exp(-dt * SWAY.ease);
  sway.x += (sway.tx - sway.x) * k;
  sway.y += (sway.ty - sway.y) * k;
  if (Math.abs(sway.tx - sway.x) + Math.abs(sway.ty - sway.y) < 1e-4) return false;
  camera.position.copy(basePos);
  camera.lookAt(CENTER);
  _right.setFromMatrixColumn(camera.matrix, 0);
  _up.setFromMatrixColumn(camera.matrix, 1);
  camera.position.addScaledVector(_right, sway.x * SWAY.x).addScaledVector(_up, sway.y * SWAY.y);
  camera.lookAt(CENTER);
  camera.updateMatrixWorld();
  // le texte : à la profondeur du fond de l'îlot, il glisse dans le sens de la caméra
  const h = host.clientHeight, fpx = h / (2 * Math.tan(vfovR / 2));
  const g = fpx * (1 / baseDist - 1 / (baseDist + FIT_RADIUS));
  textShift = -sway.y * SWAY.y * g;
  if (textEl) textEl.style.translate = `${(sway.x * SWAY.x * g).toFixed(2)}px ${textShift.toFixed(2)}px`;
  tiltUp = maxTiltUp(h);            // vu d'un peu plus haut, le sol remonte : la bascule s'adapte
  return true;
}

// la plus forte bascule vers la caméra pour laquelle le bord du sol (cercle de rayon FIT_RADIUS, quelle que soit la
// rotation) reste sous la description, d'au moins TILT.gap px
let tiltUp = TILT.up;
const textEl = document.querySelector('.hero__text');
const _rim = new THREE.Vector3();
function rimTop(a) {                                // haut du bord du sol à l'écran (px), pour la bascule a
  let top = Infinity;
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    _rim.set(Math.cos(t) * FIT_RADIUS, GROUND_Y - CENTER.y, Math.sin(t) * FIT_RADIUS)
      .applyAxisAngle(tiltAxis, a).add(CENTER).project(camera);
    top = Math.min(top, (1 - _rim.y) / 2);
  }
  return top;
}
function maxTiltUp(h) {
  if (!textEl) return TILT.up;
  const limit = (textEl.offsetTop + textEl.offsetHeight + Math.max(0, textShift) + TILT.gap) / h;
  if (rimTop(TILT.up) >= limit) return TILT.up;
  if (rimTop(0) < limit) return 0;
  let lo = 0, hi = TILT.up;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (rimTop(mid) >= limit) lo = mid; else hi = mid;
  }
  return lo;
}

// ------------------------------------------------------------ boucle : à l'écran seulement
// (et pas quand le vert du défilement couvre tout l'écran : html.flooded, posée par js/flood.js)
let dirty = true, visible = true, animating = false, running = false;
const hidden = () => !visible || document.hidden || document.documentElement.classList.contains('flooded');
function start() {
  if (running || hidden()) return;
  running = true;
  clock.getDelta();
  requestAnimationFrame(frame);
}
function frame() {
  if (hidden()) { running = false; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);       // pas de bond au retour d'un onglet
  uTime.value += dt;
  const moving = swayCamera(dt) | turn(dt);
  if (animating) {
    updateButterflies(uTime.value);
    reveal(uTime.value);
    updateParticles(uTime.value);
  }
  if (dirty || animating || moving) {
    renderer.render(scene, camera);
    dirty = false;
  }
}
const sizes = new ResizeObserver(resize);
sizes.observe(host);
if (textEl) sizes.observe(textEl);                  // le texte change de hauteur (langue, police chargée)
new IntersectionObserver(([e]) => {
  visible = e.isIntersecting;
  start();
}).observe(host);
document.addEventListener('visibilitychange', start);
window.addEventListener('hs:flood', start);
resize();
start();
