// Hero de l'accueil : l'îlot des services (models/ilot.glb, exporté de blender/hero.blend par
// blender/scripts/export_web.py), en 3D temps réel. Il sort du blanc de la page : hors de l'herbe, le sol prend
// exactement la couleur de la page, avec un bord net comme dans Blender. L'îlot vit comme dans hero.blend
// (blender/scripts/vfx.py, printemps.py) : l'herbe et les fougères ondulent sous la brise, une poussière brille dans le rai, des
// aigrettes de pissenlit dérivent avec le vent, des papillons volettent. À l'arrivée, le vide blanc le révèle (plus bas).
// Présentation reprise des dioramas de la section Services du site immersif (homeservice-immersive, web/js/app.js,
// SVC_SHOT, MINI, MINI_PITCH) : caméra fixe en légère plongée, modèle de trois quarts qui tourne lentement sur lui-même ;
// on l'attrape pour le faire tourner autour de la verticale (lâché, il garde un peu d'élan, qui se fond dans la rotation lente) ou le basculer d'un glissé
// vertical (lâché, il revient à plat).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { makeButterfly } from './papillons.js';
import { makeBee } from './abeilles.js';

const host = document.getElementById('hero-scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// les détails qui ajoutent de la profondeur (aigrettes qui s'échappent…) : sur ordinateur seulement
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;

const PAPER = '#f7f7f5';                            // = --paper
// l'adresse du modèle, avec une version tirée de son contenu (posée par outils/build.mjs) : un nouvel export est
// toujours rechargé, l'ancien peut rester en cache
const MODEL = __MODEL__;
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
// ------------------------------------------------------------ le voile de brume sur le fond de l'îlot
// Perspective atmosphérique : plus un point est loin de l'œil, plus il se fond dans la couleur de la page, comme à
// travers un léger voile d'air. Il commence au milieu de l'îlot (l'avant reste net et franc) et atteint `amount` au
// bord du fond : le fond semble sortir du blanc. Réglé au cadrage (resize), selon le recul de la caméra.
// [début (m au-delà du centre de l'îlot), part de voile au bord du fond]
const MIST = { start: 0.5, amount: 0.3 };
scene.fog = new THREE.Fog(PAPER, 10, 30);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const clock = new THREE.Clock();
const uTime = { value: 0 };

// l'îlot sur ses deux pivots, au centre de l'îlot : bascule (axe horizontal de l'écran), puis rotation autour de la
// verticale. Tout ce qui vit sur l'îlot (papillons, aigrettes) tourne avec lui.
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

// ------------------------------------------------------------ le rai de lumière du matin (hero.blend : Rai, Brume_rai)
// Dans Blender, une brume volumétrique rend visible le faisceau du spot « Rai » : un pinceau de soleil qui tombe d'en
// haut à gauche sur l'îlot. Ici, un cône dans l'axe exact du spot, rendu en lumière ajoutée (additive) : il éclaircit
// ce qu'il traverse — l'herbe, les objets — mais pas le blanc de la page, qui ne peut pas être plus blanc : le vide
// reste pur. Le faisceau est plus dense en son cœur et vers le sol, se dissout vers le haut ; une poussière lumineuse
// y dérive lentement (le bruit de la brume de Blender). De fins grains de poussière y scintillent (dustMat).
// [couleur, intensité, part du faisceau dessinée (depuis le sol), adoucissement du bord, échelle et vitesse de la brume,
//  hauteur (m) sur laquelle il se fond en approchant du sol]
const SHAFT = { color: '#fff1d2', strength: 0.22, len: 0.62, soft: 0.55, mist: 0.9, drift: 0.05, feather: 1.1 };
const uShaft = {
  apex: { value: rai.position.clone() },
  axis: { value: rai.target.position.clone().sub(rai.position).normalize() },
  tan: { value: Math.tan(rai.angle) },
  fade: { value: 0 },                               // il apparaît avec l'îlot (boucle : updateShaft)
};
// (le cône est construit plus bas, après le bruit de la brume : addShaft)

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
// le cône du rai, de la lampe jusqu'un peu sous le sol ; seule sa partie basse se voit (elle se dissout vers le haut)
function addShaft() {
  const L = rai.position.distanceTo(rai.target.position) * 1.1;
  const R = L * Math.tan(rai.angle);
  const geo = new THREE.ConeGeometry(R, L, 48, 1, true);
  geo.translate(0, -L / 2, 0);                      // la pointe sur la lampe, la base sous le sol
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    // lumière ajoutée à ce qui est déjà dessiné (× l'alpha de la toile : rien sur la page, qui reste de sa couleur)
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.CustomBlending,
    blendSrc: THREE.DstAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    uniforms: { uTime, uColor: { value: new THREE.Color(SHAFT.color) }, uFade: uShaft.fade,
      uApex: uShaft.apex, uAxis: uShaft.axis, uLen: { value: L }, uGround: { value: GROUND_Y } },   // (îlot à plat : son sol est à GROUND_Y dans le monde)
    vertexShader: `
      varying vec3 vW;
      void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      uniform float uTime, uFade, uLen, uGround; uniform vec3 uColor, uApex, uAxis; varying vec3 vW;
      ${VD_NOISE}
      void main() {
        // à travers le cône : plus dense au cœur (le rayon de vue y traverse le plus de lumière), doux au bord
        vec3 d = vW - uApex;
        float t = dot( d, uAxis );
        vec3 v = normalize( cameraPosition - vW );
        float edge = abs( dot( normalize( d - uAxis * t ), v ) );
        float core = pow( edge, ${(1 / SHAFT.soft).toFixed(2)} );
        // le long du faisceau : invisible en haut, il apparaît sur sa partie basse, plein vers le sol
        float along = smoothstep( uLen * ${(1 - SHAFT.len).toFixed(2)}, uLen * ${(1 - SHAFT.len * 0.45).toFixed(2)}, t );
        // la brume qui dérive
        vec3 q = vW * ${SHAFT.mist.toFixed(2)} + vec3( 0.0, - uTime * ${SHAFT.drift.toFixed(3)}, uTime * ${(SHAFT.drift * 0.6).toFixed(3)} );
        float mist = 0.55 + 0.45 * ( vdNoise( q ) * 0.7 + vdNoise( q * 3.1 ) * 0.3 );
        // près du sol, il se fond : sans cela, la ligne où le cône entre dans l'herbe ferait un bord net
        float ground = smoothstep( uGround - 0.05, uGround + ${SHAFT.feather.toFixed(2)}, vW.y );
        float k = ${SHAFT.strength.toFixed(3)} * core * along * mist * ground * uFade;
        gl_FragColor = vec4( uColor * k, 0.0 );          // ajouté : l'alpha ne change pas (le blanc de la page reste)
      }`,
  }));
  mesh.position.copy(rai.position);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), uShaft.axis.value);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);
}
addShaft();

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
// le même calcul, côté script (aigrettes : rien tant que l'endroit est dans le vide)
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
      .replace('#include <fog_fragment>',
        '#include <fog_fragment>\ngl_FragColor = vec4(gl_FragColor.rgb * grassMask, grassMask);');   // prémultiplié,
        // après le voile de brume (sinon il colorerait la page hors de l'herbe)
  };
  material.customProgramCacheKey = () => 'ilot-sol';
}

// ------------------------------------------------------------ le vent dans l'herbe (vfx.py, VENT et wind_group)
// Même calcul que le Geometry Nodes « Vent » : des vagues qui avancent dans le sens de la brise, des rafales (bruit
// qui dérive), un frémissement propre à chaque brin ; la souplesse (0 au pied, 1 en haut) dit qui plie.
const VENT = { dir: THREE.MathUtils.degToRad(20), amp: 0.075, vague: 1.5, vitesse: 2.1, rafale: 0.35, fremi: 0.12 };
// une rafale (js : RAFALE) : un front qui traverse l'îlot dans le sens de la brise, à uGust.x m de son centre, de
// force uGust.y ; l'herbe se couche net à son passage et se relève plus lentement (devant : 0,8 m ; derrière : 2,2 m)
const uGust = { value: new THREE.Vector2(-99, 0) };
const WIND_GLSL = `
  uniform float uTime;
  uniform vec2 uGust;
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
    shader.uniforms.uGust = uGust;
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
          float gx = along - uGust.x;
          float blow = uGust.y * exp( - gx * gx / ( gx > 0.0 ? 0.64 : 4.84 ) );
          float k = ( 0.15 + 0.85 * wave * gust + flutter + blow ) * _souplesse * ${VENT.amp.toFixed(3)};
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

// ------------------------------------------------------------ particules : aigrettes (vfx.py) et poussière du rai
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

// poussière du rai : à la place du pollen doré, de fins grains clairs qui ne se voient que dans le faisceau, comme
// la poussière dans un rayon de soleil. Ils naissent dans sa partie visible, dérivent à peine (quelques cm/s, en
// tournoyant) dans le bas du faisceau, là où il passe devant l'îlot (plus haut, il est devant la page, où rien ne
// s'ajoute), et scintillent : un grain qui tourne renvoie la lumière par éclats. Tout se calcule dans le shader
// (chaque grain renaît ailleurs à chaque cycle). Rendus comme le rai : lumière ajoutée × l'alpha de la toile, donc
// rien sur la page ; dans le repère du monde, comme le faisceau (ils ne tournent pas avec l'îlot).
// [nombre, diamètre (m), durée d'un cycle (s), dérive (m/s), tournoiement (m), lueur et éclat, part du rayon du cône
//  occupée, hauteurs au-dessus du sol (m)]
const DUST = { count: 260, size: 0.01, life: [7, 13], drift: 0.025, swirl: 0.05, base: 0.6, glint: 2.4, fill: 0.9,
  high: [0.1, 1.3] };
const dustGeo = new THREE.BufferGeometry();
{
  const seed = new Float32Array(DUST.count * 4), pos = new Float32Array(DUST.count * 3);
  for (let i = 0; i < DUST.count; i++)
    seed.set([Math.random(), Math.random() * 6.283, rnd(...DUST.life), rnd(0.6, 1.0)], i * 4);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));   // (inutilisé : le shader place les grains)
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
}
const dustMat = (() => {
  const ax = uShaft.axis.value, u = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)).normalize(), w = new THREE.Vector3().crossVectors(ax, u);
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, blending: THREE.CustomBlending,
    blendSrc: THREE.DstAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    uniforms: { uTime, uScale: { value: 1 }, uFade: uShaft.fade, uColor: { value: new THREE.Color(SHAFT.color) },
      uApex: uShaft.apex, uAxis: uShaft.axis, uU: { value: u }, uW: { value: w }, uTan: uShaft.tan,
      uGround: { value: GROUND_Y } },
    vertexShader: `
      attribute vec4 aSeed; uniform float uTime, uScale, uTan, uGround, uFade; uniform vec3 uApex, uAxis, uU, uW;
      varying float vK;
      float h1( float x ) { return fract( sin( x * 127.1 ) * 43758.5453 ); }
      void main() {
        float life = aSeed.z, c = ( uTime + aSeed.x * life ) / life, n = floor( c ), a = fract( c ), age = a * life;
        float id = aSeed.x * 91.7 + n * 13.3;
        // un point du bas du faisceau, réparti en volume dans le cône : sa hauteur au-dessus du sol donne sa place sur l'axe
        float t = ( uApex.y - uGround - mix( ${DUST.high[0].toFixed(2)}, ${DUST.high[1].toFixed(2)}, h1( id ) ) ) / - uAxis.y;
        float ang = h1( id + 1.0 ) * 6.283, rad = sqrt( h1( id + 2.0 ) ) * ${DUST.fill.toFixed(2)} * t * uTan;
        vec3 p = uApex + uAxis * t + ( uU * cos( ang ) + uW * sin( ang ) ) * rad;
        // il dérive à peine et tournoie
        p += vec3( 0.6, -0.4, 0.3 ) * ${DUST.drift.toFixed(3)} * age;
        p += ${DUST.swirl.toFixed(3)} * vec3( sin( age * 0.7 + aSeed.y ), sin( age * 0.5 + aSeed.y * 1.7 ), cos( age * 0.6 + aSeed.y ) );
        vec4 mv = viewMatrix * vec4( p, 1.0 );
        gl_Position = projectionMatrix * mv;
        // dans le cône (et pas près du sol, où le faisceau se fond), il apparaît et s'éteint en douceur
        vec3 d = p - uApex; float tt = dot( d, uAxis ), r = length( d - uAxis * tt ) / max( tt * uTan, 1e-3 );
        float inside = 1.0 - smoothstep( 0.6, 1.0, r );
        float along = smoothstep( uGround, uGround + 0.25, p.y ) * ( 1.0 - smoothstep( 1.6, 2.2, p.y - uGround ) );
        float life01 = smoothstep( 0.0, 0.2, a ) * ( 1.0 - smoothstep( 0.75, 1.0, a ) );
        // l'éclat : par moments, le grain renvoie la lumière
        float glint = pow( 0.5 + 0.5 * sin( uTime * ( 1.2 + 2.8 * aSeed.w ) + aSeed.y * 3.0 ), 6.0 );
        vK = uFade * inside * along * life01 * aSeed.w * ( ${DUST.base.toFixed(2)} + ${DUST.glint.toFixed(2)} * glint );
        gl_PointSize = max( 1.0, ${DUST.size.toFixed(4)} * ( 1.0 + 0.6 * glint ) * uScale / - mv.z );
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vK;
      void main() {
        float r = length( gl_PointCoord - 0.5 ) * 2.0;
        float k = vK * ( 1.0 - smoothstep( 0.2, 1.0, r ) );
        if ( k < 0.004 ) discard;
        gl_FragColor = vec4( mix( uColor, vec3( 1.0 ), 0.5 ) * k, 0.0 );   // ajouté : l'alpha ne change pas
      }`,
  });
})();
const dustPoints = new THREE.Points(dustGeo, dustMat);
dustPoints.frustumCulled = false;
dustPoints.renderOrder = 3;
dustPoints.visible = !reduced;
scene.add(dustPoints);

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

// ------------------------------------------------------------ papillons (js/papillons.js)
// Les papillons de hero.blend donnent leur coin de l'îlot (propriétés exportées : centre cx, cy, hauteur cz, rayon
// rad, phase ph, vitesse sp) ; leur modèle et leur battement sont ceux de js/papillons.js. Chacun vole pour de bon :
// une position et une vitesse, qui poursuivent un point qui bouge — chez lui, une boucle irrégulière au-dessus de son
// coin d'herbe (elle tourne avec l'îlot) ; en excursion, un tracé dans l'image. Accélération et vitesse bornées,
// jamais à l'arrêt, un vol un peu erratique ; le cap suit la vitesse en tournant à vitesse limitée, il penche dans les
// virages. Il plane en vol rapide et à peu près droit, en descendant un peu ; il bat des ailes pour monter et tourner.
// Deux d'entre eux partent de temps en temps en excursion : ils montent devant la description et le titre, sortent
// de l'îlot, passent tout près de l'écran, puis rentrent. L'excursion est tracée dans l'image (part de l'écran,
// profondeur en part du recul de la caméra), calée sur la place du texte.
// [envergure (m), espèces dans l'ordre des papillons de l'îlot]
const BUTTERFLY = { span: 0.2, species: ['peche', 'menthe', 'rose', 'aurore', 'vieuxrose', 'peche', 'rose'] };
// le vol : [pulsation de la poursuite (rad/s), amortissement, accélération max (m/s²), vitesse min, max chez lui, max
// en excursion (m/s), vol erratique : de côté, en hauteur (m/s²), virage max (rad/s), planés : durée (s), repos entre
// deux (s), chute (m/s²), ampleur des boucles chez lui (× leur rayon de hero.blend), hauteur min au-dessus du sol (m)]
const FLIGHT = { omega: 1.8, zeta: 0.8, accel: 4, vmin: 0.28, vmax: 0.85, vtrip: 2.4, wander: [0.55, 2.2], yawRate: 3.5,
  glide: [0.45, 1.2], rest: [1.2, 3.5], sink: 0.8, roam: 1.8, floor: 0.3 };
// excursions : [papillon, premier départ (s après l'apparition), retour tous les… (s), durée (s), points de passage :
// [x (part de la largeur du texte, 0 à gauche, 1 à droite ; hors de 0..1 : à côté), y (0 : haut du titre, 1 : bas
// de la description ; au-delà : plus bas), profondeur (part du recul)]]
const TRIPS = [
  { who: 3, first: 2.5, every: 38, dur: 16, path: [[0.45, 1.6, 0.95], [0.25, 0.85, 0.85], [0.5, 0.3, 0.8], [0.8, 0.55, 0.58],
    [1.05, 1.3, 0.22], [0.75, 1.9, 0.55]] },
  { who: 0, first: 17, every: 44, dur: 17, path: [[0.6, 1.6, 0.95], [0.8, 0.8, 0.88], [0.45, 0.4, 0.82], [0.0, 0.6, 0.7],
    [-0.25, 1.45, 0.26], [0.2, 1.9, 0.6]] },
];
const flyers = [];
const baseView = new THREE.Matrix4();               // caméra à sa place (sans le mouvement de la souris) → monde
const _ndc = new THREE.Vector3(), _home = new THREE.Vector3(), _vel = new THREE.Vector3(), _look = new THREE.Vector3();
const _bx = new THREE.Vector3(), _bz = new THREE.Vector3();
let lifeAt = Infinity;                              // fin de l'apparition : les excursions peuvent commencer

// un point de l'image (x, y en part de l'écran) à une profondeur donnée (m), dans le monde
function screenToWorld(sx, sy, depth, out) {
  _ndc.set(sx * 2 - 1, 1 - sy * 2, 0.5).applyMatrix4(camera.projectionMatrixInverse);
  return out.copy(_ndc).multiplyScalar(depth / -_ndc.z).applyMatrix4(baseView);
}
// la boucle d'un papillon au-dessus de son coin d'herbe, dans le monde
function homeAt(f, t, out) {
  const a = (t * f.sp * FPS) / FLIGHT.roam + f.ph, r = f.rad * FLIGHT.roam;   // plus amples, à la même allure
  const x = f.cx + r * 0.9 * (Math.sin(a) + 0.4 * Math.sin(1.7 * a + f.ph * 0.5));
  const y = f.cy + r * 0.8 * (Math.sin(2 * a) + 0.3 * Math.sin(2.9 * a + 1));
  const z = f.cz + 0.08 * Math.sin(0.6 * a + f.ph) + 0.04 * Math.sin(1.9 * a);
  return island.localToWorld(out.copy(blender(x, y, z)));
}
// où en est l'excursion d'un papillon à l'instant t : null s'il est chez lui
function tripAt(f, t) {
  const tr = f.trip;
  if (!tr || t < lifeAt + tr.first) return null;
  const k = (t - lifeAt - tr.first) % tr.every;
  return k < tr.dur ? k / tr.dur : null;
}
const _pts = Array.from({ length: 8 }, () => new THREE.Vector3());
const tripCurve = new THREE.CatmullRomCurve3(_pts, false, 'centripetal');
function tripPoint(f, u, t, out) {
  const box = textBox();
  homeAt(f, t, _pts[0]);
  _pts[7].copy(_pts[0]);
  f.trip.path.forEach(([x, y, d], i) => {
    screenToWorld(box.x0 + x * (box.x1 - box.x0), box.y0 + y * (box.y1 - box.y0), d * baseDist, _pts[i + 1]);
  });
  tripCurve.updateArcLengths();
  return tripCurve.getPointAt(Math.min(1, u), out);   // à allure régulière le long du tracé
}
// la place du titre et de la description à l'écran (part de la largeur et de la hauteur)
function textBox() {
  const w = host.clientWidth || 1, h = host.clientHeight || 1;
  if (!textEl) return { x0: 0.3, x1: 0.7, y0: 0.15, y1: 0.45 };
  const x0 = textEl.offsetLeft - textEl.offsetWidth / 2;   // centré (translateX(-50%))
  return { x0: x0 / w, x1: (x0 + textEl.offsetWidth) / w, y0: textEl.offsetTop / h,
    y1: (textEl.offsetTop + textEl.offsetHeight) / h };
}

const _acc = new THREE.Vector3(), _tgt = new THREE.Vector3(), _hv = new THREE.Vector3();
const rand = (a, b) => a + Math.random() * (b - a);
function flyStep(f, t, h) {
  // le point poursuivi : la boucle chez lui, ou le tracé de l'excursion, pris un peu en avance
  const u = tripAt(f, t);
  if (u === null) homeAt(f, t + 0.35, _tgt);
  else tripPoint(f, u + 0.35 / f.trip.dur, t, _tgt);
  f.u = u;
  const w = FLIGHT.omega;
  _acc.subVectors(_tgt, f.pos).multiplyScalar(w * w).addScaledVector(f.vel, -2 * FLIGHT.zeta * w);
  // vol erratique : en hauteur, des sautes vives (le papillon monte et descend à chaque série de battements) ; de
  // côté, une dérive lente — il ne zigzague pas, il ondule
  const k = f.gliding ? 0.3 : 1, [kh, kv] = FLIGHT.wander;
  _acc.x += k * kh * (Math.sin(t * 0.7 + f.ph * 3) + 0.5 * Math.sin(t * 1.13 + f.ph));
  _acc.z += k * kh * (Math.sin(t * 0.83 + f.ph * 7) + 0.5 * Math.sin(t * 1.29 + f.ph * 4));
  _acc.y += k * kv * (Math.sin(t * 2.6 + f.ph * 5) + 0.5 * Math.sin(t * 4.3 + f.ph * 2));
  if (f.gliding) _acc.y -= FLIGHT.sink;
  const low = GROUND_Y + FLIGHT.floor - f.pos.y;   // trop bas : il remonte (il ne vole pas dans l'herbe)
  if (low > 0) _acc.y += low * 30;
  if (_acc.length() > FLIGHT.accel) _acc.setLength(FLIGHT.accel);
  f.vel.addScaledVector(_acc, h);
  const vmax = u === null ? FLIGHT.vmax : FLIGHT.vtrip;
  const sp = f.vel.length();
  if (sp > vmax) f.vel.multiplyScalar(vmax / sp);
  else if (sp < FLIGHT.vmin) f.vel.addScaledVector(f.head, FLIGHT.vmin - sp);   // jamais sur place : il avance
  f.pos.addScaledVector(f.vel, h);
  f.acc.copy(_acc);
}

function updateButterflies(t, dt) {
  for (const f of flyers) {
    if (!f.started) {                               // premier pas : il part de sa boucle, déjà lancé
      homeAt(f, t, f.pos);
      homeAt(f, t + 0.1, _tgt);
      f.vel.subVectors(_tgt, f.pos).multiplyScalar(10);
      f.started = true;
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));    // pas fixes : le même vol quelle que soit la cadence
    for (let i = 0; i < n; i++) flyStep(f, t - dt + ((i + 1) * dt) / n, dt / n);
    // le cap : vers sa vitesse à l'horizontale, en tournant à vitesse limitée
    _hv.set(f.vel.x, 0, f.vel.z);
    const yawWanted = _hv.lengthSq() > 1e-6 ? Math.atan2(_hv.x, _hv.z) : f.yaw;
    let dy = yawWanted - f.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const maxTurn = FLIGHT.yawRate * dt;
    const turn = THREE.MathUtils.clamp(dy, -maxTurn, maxTurn);
    f.yaw += turn;
    f.head.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    const yawRate = turn / Math.max(dt, 1e-3);
    // planer : en vol rapide, à peu près droit et sans monter ; il reprend ses battements pour monter ou tourner
    const speed = f.vel.length();
    f.timer -= dt;
    if (f.gliding) {
      if (f.timer <= 0 || f.vel.y > 0.35 || Math.abs(yawRate) > 2.2) { f.gliding = false; f.timer = rand(...FLIGHT.rest); }
    } else if (f.timer <= 0 && speed > 0.45 && f.vel.y < 0.1 && Math.abs(yawRate) < 0.9 && Math.random() < dt * 1.2) {
      f.gliding = true;
      f.timer = rand(...FLIGHT.glide);
    }
    const effort = THREE.MathUtils.clamp(0.35 + f.vel.y * 0.8 + Math.abs(yawRate) * 0.15, 0, 1);
    // penché dans les virages (accélération de côté), cabré un peu, plus en montée
    const side = f.acc.x * f.head.z - f.acc.z * f.head.x;
    f.bank += (THREE.MathUtils.clamp(-side * 0.1, -0.55, 0.55) - f.bank) * (1 - Math.exp(-dt * 5));
    const pitchUp = 0.24 + THREE.MathUtils.clamp(f.vel.y * 0.35, -0.2, 0.3);
    f.pitch += (pitchUp - f.pitch) * (1 - Math.exp(-dt * 4));
    f.root.position.copy(f.pos);
    f.root.rotation.set(0, 0, 0);
    f.root.rotateY(f.yaw);
    f.root.rotateX(-f.pitch);
    f.root.rotateZ(f.bank);
    // en excursion, il se penche vers l'écran : on voit le dessus de ses ailes, pas sa tranche
    const show = f.u === null ? 0 : Math.sin(Math.PI * f.u) * 0.9;
    if (show > 0) {
      _look.subVectors(camera.position, f.pos).normalize();
      _m.makeRotationFromQuaternion(f.root.quaternion);
      _bx.setFromMatrixColumn(_m, 0);                // sa droite
      _bz.setFromMatrixColumn(_m, 2);                // l'avant
      f.root.rotateZ(-show * _look.dot(_bx));
      f.root.rotateX(show * _look.dot(_bz));
    }
    f.flap(dt, f.gliding ? 1 : 0, effort);
  }
}

// ------------------------------------------------------------ des aigrettes s'échappent de l'îlot
// De temps en temps, une ou deux aigrettes se détachent des fleurs : elles montent doucement, la brise les porte
// devant la description ou le titre — parfois tout près de l'écran — puis elles sortent par le haut, sur un côté.
// Parachute toujours vers le ciel, un peu penché par l'air qui les pousse ; elles oscillent et tournent lentement sur
// elles-mêmes. Ce sont les aigrettes de l'îlot, même modèle, même matière.
// [attente entre deux départs (s), aigrettes par départ, vitesse (m/s), taille (m), au plus en même temps, part de
//  celles qui passent tout près de l'écran, et jusqu'où (part du recul de la caméra)]
const ESCAPE = { every: [9, 18], count: [1, 2], speed: [0.34, 0.5], size: 0.12, max: 4, near: 0.4, closest: 0.3 };
const escapes = [];
let escapeGeo = null, nextEscape = Infinity;
const _e0 = new THREE.Vector3(), _ev = new THREE.Vector3(), _eq = new THREE.Quaternion();

// le modèle d'aigrette de l'îlot (Gabarit · aigrette), tel quel : il se dresse, le parachute en haut
function makeEscapeGeometry(template) {
  const geo = template.geometry.clone();
  geo.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  return geo;
}

function spawnEscape(t) {
  if (!escapeGeo || escapes.length >= ESCAPE.max) return;
  // la matière des aigrettes de l'îlot (makeSeeds)
  const mat = new THREE.MeshStandardMaterial({ color: '#fbfaf4', emissive: '#fbfaf4', emissiveIntensity: 0.35,
    roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.Mesh(escapeGeo, mat);
  mesh.scale.setScalar(ESCAPE.size);
  mesh.frustumCulled = false;
  scene.add(mesh);
  // le départ : dans les fleurs de l'îlot, à hauteur des têtes de pissenlit
  const a = Math.random() * Math.PI * 2, r = rand(0.8, 3.4);
  const p0 = island.localToWorld(blender(Math.cos(a) * r, Math.sin(a) * r, GROUND_Y + rand(0.3, 0.5)));
  // le passage : devant la description ou le titre ; une partie tout près de l'écran
  const box = textBox(), near = Math.random() < ESCAPE.near;
  const sx = rand(box.x0 - 0.08, box.x1 + 0.08), sy = rand(box.y0 + 0.15 * (box.y1 - box.y0), box.y1 + 0.05);
  const depth = (near ? rand(ESCAPE.closest, 0.45) : rand(0.6, 0.95)) * baseDist;
  const p2 = screenToWorld(sx, sy, depth, new THREE.Vector3());
  const p1 = p0.clone().add(new THREE.Vector3(0, 1.2, 0)).lerp(p2, 0.25);   // elle monte d'abord au-dessus de l'îlot
  // la sortie : par le haut de l'écran, du côté où elle allait
  const p3 = screenToWorld(sx + (sx < 0.5 ? -0.3 : 0.3), -0.2, depth * 1.05, new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3], false, 'centripetal');
  escapes.push({ mesh, mat, curve, born: t, dur: curve.getLength() / rand(...ESCAPE.speed), spin: rand(-0.7, 0.7),
    ph: rand(0, 6.3), prev: p0.clone() });
}

function updateEscapes(t, dt) {
  if (t >= nextEscape) {
    const n = Math.round(rand(ESCAPE.count[0] - 0.49, ESCAPE.count[1] + 0.49));
    for (let i = 0; i < n; i++) setTimeout(() => spawnEscape(uTime.value), i * rand(400, 1500));
    nextEscape = t + rand(...ESCAPE.every);
  }
  for (let i = escapes.length - 1; i >= 0; i--) {
    const e = escapes[i];
    const u = (t - e.born) / e.dur;
    if (u >= 1) { scene.remove(e.mesh); e.mat.dispose(); escapes.splice(i, 1); continue; }
    // la brise la prend peu à peu : lente au départ, puis portée
    e.curve.getPointAt(u * u * (1.6 - 0.6 * u), _e0);
    const age = t - e.born;
    _e0.x += 0.07 * Math.sin(age * 0.9 + e.ph);          // elle oscille, un peu de côté, un peu en hauteur
    _e0.y += 0.05 * Math.sin(age * 1.3 + e.ph * 2);
    _e0.z += 0.06 * Math.sin(age * 0.7 + e.ph * 3);
    _ev.subVectors(_e0, e.prev).divideScalar(Math.max(dt, 1e-3));
    e.prev.copy(_e0);
    e.mesh.position.copy(_e0);
    // parachute vers le ciel, penché par l'air qui la pousse (dans le sens de sa course), et elle tourne sur elle-même
    _eq.setFromUnitVectors(UP, _ev.multiplyScalar(-0.35).add(UP).normalize());
    e.mesh.quaternion.copy(_eq).multiply(new THREE.Quaternion().setFromAxisAngle(UP, age * e.spin));
    e.mat.opacity = Math.min(1, age / 0.8) * Math.min(1, (1 - u) / 0.08);   // elle apparaît dans les fleurs
  }
}

// ------------------------------------------------------------ rafales : l'herbe se couche, des pétales s'envolent
// De temps en temps, une rafale traverse l'îlot dans le sens de la brise : l'herbe, les fleurs et les fougères se
// couchent à son passage (uGust, dans le vent des matériaux), puis se relèvent. Quand le front atteint une fleur qui
// s'effeuille, un ou deux pétales s'en détachent — de cette fleur, à sa place, du côté où souffle le vent — puis
// filent avec le vent, passent pour certains devant le texte, et sortent de l'écran du côté où souffle le vent.
// Chaque espèce a ses pétales, dessinés comme dans flore.py (forme, creux, courbure, dégradé), et son envol :
//   coquelicot : grand pétale de soie, il ondule et culbute lentement, porté loin ;
//   églantine : il se balance en feuille morte, d'un côté à l'autre, en basculant à chaque bout ;
//   marguerite : la languette tourne vite sur sa longueur, à plat ;
//   bouton d'or : la petite coupe brillante tourne sur elle-même, creux en bas, plus lourde, plus directe ;
//   bleuet : le fleuron en entonnoir file en volant, le bout étroit devant, en tournant sur son axe.
// Les autres fleurs (lavande, pissenlit, myosotis, campanule, trèfle) ne s'effeuillent pas au vent.
// [attente entre deux rafales (s), durée de la traversée (s), force (en plus du vent ordinaire), fleurs qui
//  s'effeuillent par rafale, part des pétales qui passent devant le texte]
const RAFALE = { every: [22, 38], cross: 4.2, force: 3.0, flowers: [3, 5], text: 0.6 };
// par espèce : [pétale (mesures de flore.py, × FLEUR de remplace_flore.py)], chances de s'effeuiller, pétales par
// fleur, allure (m/s), envol (mode, balancement : amplitude m et fréquence Hz, rotation rad/s, ondulation du pétale)
const FLEUR = 1.35;
const PETALE = {
  coquelicot: { p: { length: 0.08, width: 0.1, cup: 0.3, curl: 0.22, round: 1, crumple: 0.05, nu: 7, nv: 8,
      prof: (v) => Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.7)) ** 0.45,
      stops: [[0, '#140809'], [0.17, '#240a0c'], [0.27, '#a80804'], [1, '#d4170c']] },   // tache noire à la base
    odds: 3, count: [1, 2], speed: [0.7, 1.0], mode: 'culbute', sway: [0.16, 0.45], spin: 2.2, flap: 0.35 },
  eglantine: { p: { length: 0.058, width: 0.062, cup: 0.3, curl: -0.15, notch: 0.55, round: 1, nu: 6, nv: 5,
      prof: (v) => Math.sin(Math.PI * Math.min(1, 0.06 + v * 0.62)) ** 0.5,
      stops: [[0, '#fff3e6'], [0.3, '#ffd0e0'], [0.75, '#ff7bb0'], [1, '#f2588f']] },
    odds: 3, count: [1, 2], speed: [0.8, 1.1], mode: 'feuille', sway: [0.13, 0.7], spin: 0.6, flap: 0.12 },
  marguerite: { p: { length: 0.072, width: 0.017, cup: 0.25, curl: -0.35, notch: 0.4, nu: 2, nv: 5,
      prof: (v) => Math.sin(Math.PI * Math.min(1, 0.2 + v * 0.75)) ** 0.4,
      stops: [[0, '#dfe8d2'], [0.25, '#f8f9f2'], [1, '#ffffff']] },
    odds: 0.5, count: [1, 2], speed: [0.9, 1.3], mode: 'languette', sway: [0.05, 0.9], spin: 15, flap: 0.05 },
  bouton_or: { p: { length: 0.04, width: 0.042, cup: 0.5, curl: 0.2, nu: 4, nv: 4, gloss: true,
      prof: (v) => Math.sin(Math.PI * Math.min(1, 0.1 + v * 0.78)) ** 0.45,
      stops: [[0, '#7f7a00'], [0.3, '#d8c400'], [1, '#e8d400']] },
    odds: 1, count: [1, 1], speed: [1.1, 1.5], mode: 'toupie', sway: [0.04, 1.2], spin: 10, flap: 0.02 },
  bleuet: { p: { length: 0.042, width: 0.026, cup: 0.7, fringe: 1, nu: 4, nv: 4,
      prof: (v) => 0.35 + 0.65 * v ** 0.8,
      stops: [[0, '#2a3fb8'], [0.5, '#2f63ef'], [1, '#5a8cff']] },
    odds: 1, count: [1, 1], speed: [1.0, 1.4], mode: 'volant', sway: [0.05, 0.8], spin: 7, flap: 0.04 },
};
const petals = [];
let gust = null, nextGust = Infinity;
const petalGeos = {};
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pq = new THREE.Quaternion(), _pq2 = new THREE.Quaternion();
const _pm = new THREE.Matrix4(), _px = new THREE.Vector3(), _py = new THREE.Vector3(), _pz = new THREE.Vector3();
const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);

// le pétale de flore.py (Flore.petal) : il part de la base vers +y, sa face vers +z ; il se creuse en cuillère (cup),
// se courbe (curl), sa largeur suit prof(v), sa pointe peut être échancrée (notch), frangée (fringe) ou arrondie aux
// coins (round) ; froissé (crumple, la soie du coquelicot). Dégradé de couleur de la base à la pointe (sommets). Recentré sur son milieu : il tourne autour.
// aUV garde (u, v) pour l'ondulation du pétale en vol.
function makePetalGeometry({ length, width, cup = 0, curl = 0, notch = 0, fringe = 0, round = 0, crumple = 0, nu, nv, prof, stops }) {
  const L0 = length * FLEUR, W0 = width * FLEUR;
  const stopCols = stops.map(([t, h]) => [t, new THREE.Color(h)]);   // en linéaire, comme Col dans Blender
  const ramp = (t, out) => {
    for (let i = 1; i < stopCols.length; i++) {
      const [t0, c0] = stopCols[i - 1], [t1, c1] = stopCols[i];
      if (t <= t1) return out.copy(c0).lerp(c1, Math.min(1, Math.max(0, (t - t0) / Math.max(t1 - t0, 1e-6))));
    }
    return out.copy(stopCols.at(-1)[1]);
  };
  const pos = [], col = [], uv = [], idx = [], c = new THREE.Color();
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = -1 + 2 * i / nu, v = j / nv;
      const w = W0 / 2 * prof(v);
      let L = L0 * v;
      if (v > 0.6) {                                // la pointe : échancrure, dents, coins arrondis
        const k = ((v - 0.6) / 0.4) ** 2;
        L -= L0 * k * notch * (1 - u * u) * 0.35;
        L -= L0 * k * fringe * 0.12 * (0.5 + 0.5 * Math.cos(u * Math.PI * 3));
        L -= L0 * k * round * 0.3 * u ** 4;
      }
      const th = curl * v * v;
      const cr = crumple * L0 * v * Math.sin(u * 7.1 + v * 3.3) * Math.sin(v * 9.7 - u * 2.1);
      pos.push(u * w, L * Math.cos(th), L * Math.sin(th) + cup * w * u * u + cr);
      ramp(v, c); col.push(c.r, c.g, c.b);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, d = a + nu + 1, e = d + 1;
    idx.push(a, b, e, a, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setIndex(idx);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingBox();
  const mid = g.boundingBox.getCenter(new THREE.Vector3());
  g.translate(-mid.x, -mid.y, -mid.z);
  g.userData.base = new THREE.Vector3(0, -mid.y, -mid.z);   // où était la base (attache à la fleur)
  g.userData.length = L0;
  return g;
}

// l'ondulation du pétale en vol : sa pointe et ses bords battent (uFlap : amplitude, phase), dans le shader
function petalMaterial(gloss) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: gloss ? 0.38 : 0.62, flatShading: true,
    side: THREE.DoubleSide, transparent: true, opacity: 1 });
  mat.userData.flap = { value: new THREE.Vector2() };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlap = mat.userData.flap;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aUV;\nuniform vec2 uFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.z += uFlap.x * ( aUV.y * aUV.y * sin( uFlap.y ) + 0.6 * aUV.x * aUV.x * sin( uFlap.y * 1.3 + 1.7 ) );`);
  };
  return mat;
}

// le sens du vent à l'instant, dans le monde (il tourne avec l'îlot)
const windWorld = (out) => out.copy(WIND_DIR).transformDirection(island.matrixWorld).setY(0).normalize();

function spawnPetal(t, head, sp) {
  const S = PETALE[sp];
  const geo = petalGeos[sp] ??= makePetalGeometry(S.p);
  const mat = petalMaterial(S.p.gloss);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const wind = windWorld(new THREE.Vector3());
  // sur la fleur : le pétale du côté où souffle le vent, ouvert vers le haut, sa base au cœur
  const heart = island.localToWorld(head.clone());
  const out = wind.clone().applyAxisAngle(UP, rand(-0.9, 0.9));
  _py.copy(out).multiplyScalar(Math.cos(0.4)).addScaledVector(UP, Math.sin(0.4));   // longueur : vers le dehors
  _pz.copy(UP).multiplyScalar(Math.cos(0.4)).addScaledVector(out, -Math.sin(0.4));  // face : vers le ciel
  _px.crossVectors(_py, _pz);
  const q0 = new THREE.Quaternion().setFromRotationMatrix(_pm.makeBasis(_px, _py, _pz));
  const p0 = heart.clone().sub(geo.userData.base.clone().applyQuaternion(q0));
  // il file avec le vent, en montant ; une partie passe devant le texte, à la profondeur où il se trouve à peu près
  const p1 = p0.clone().addScaledVector(wind, 1.6).add(_pa.set(0, 0.9, 0));
  const ahead = p0.clone().addScaledVector(wind, 6).project(camera), from = p0.clone().project(camera);
  const goRight = ahead.x >= from.x;
  const box = textBox();
  const toText = Math.random() < RAFALE.text;
  const sx = toText ? rand(box.x0, box.x1) : rand(0.1, 0.9), sy = toText ? rand(box.y0, box.y1) : rand(0.25, 0.55);
  const depth = (Math.random() < 0.3 ? rand(0.35, 0.5) : rand(0.55, 1.0)) * baseDist;   // quelques-uns plus près
  const p2 = screenToWorld(sx, sy, depth, new THREE.Vector3());
  const p3 = screenToWorld(goRight ? 1.25 : -0.25, sy - rand(0.15, 0.4), depth * rand(0.8, 1.1), new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3([p0, p1, p2, p3], false, 'centripetal');
  petals.push({ mesh, mat, S, curve, q0, born: t, dur: curve.getLength() / rand(...S.speed),
    side: new THREE.Vector3().crossVectors(UP, wind).normalize(), ph: rand(0, 6.3), dir: Math.random() < 0.5 ? -1 : 1,
    axis: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), q: new THREE.Quaternion() });
}

// la pose en vol, selon l'espèce ; pos : sur le tracé (déjà placé), tan : sens de la course
function flightPose(pt, age, pos, tan, q) {
  const S = pt.S, [A, f] = S.sway, w = Math.PI * 2 * f, a = age * w + pt.ph;
  const sway = Math.sin(a);
  switch (S.mode) {
    case 'feuille': {
      // feuille morte : il glisse d'un côté à l'autre, remonte un peu à chaque bout et y bascule ; à plat
      pos.addScaledVector(pt.side, A * sway);
      pos.y += 0.35 * A * Math.cos(2 * a);
      q.setFromAxisAngle(AX_Y, age * S.spin * pt.dir);                     // il pivote doucement
      q.premultiply(_pq.setFromAxisAngle(_pb.copy(tan).setY(0).normalize(), 0.9 * Math.cos(a)));
      q.multiply(_pq2.setFromAxisAngle(AX_X, -Math.PI / 2));                 // face vers le ciel
      break;
    }
    case 'culbute': {
      // soie : grands balancements lents, il culbute autour d'un axe qui dérive
      pos.addScaledVector(pt.side, A * sway);
      pos.y += 0.5 * A * Math.sin(a * 0.7 + 1);
      q.setFromAxisAngle(_pb.copy(pt.axis).applyAxisAngle(AX_Y, 0.4 * age), age * S.spin * pt.dir);
      q.multiply(_pq2.setFromAxisAngle(AX_X, 0.8 * Math.sin(age * 1.7 + pt.ph)));
      break;
    }
    case 'languette': {
      // la languette tourne vite sur sa longueur, couchée en travers du vent, et vrille lentement
      pos.addScaledVector(pt.side, A * sway);
      _pb.copy(pt.side).applyAxisAngle(UP, 0.5 * Math.sin(age * 0.8 + pt.ph)).applyAxisAngle(tan, 0.25 * sway);
      q.setFromUnitVectors(AX_Y, _pb);
      q.multiply(_pq2.setFromAxisAngle(AX_Y, age * S.spin * pt.dir));
      break;
    }
    case 'toupie': {
      // la coupe tourne sur elle-même, creux en bas, en vacillant
      pos.addScaledVector(pt.side, A * sway);
      _pb.set(0.35 * Math.cos(a), -1, 0.35 * Math.sin(a)).normalize();       // son creux : vers le bas
      q.setFromUnitVectors(AX_Z, _pb);
      q.multiply(_pq2.setFromAxisAngle(AX_Z, age * S.spin * pt.dir));
      break;
    }
    case 'volant': {
      // le fleuron vole le bout étroit devant, comme un volant, et tourne sur son axe en vacillant
      pos.addScaledVector(pt.side, A * sway);
      _pb.copy(tan).negate().addScaledVector(pt.side, 0.3 * sway).normalize();   // la pointe (large) traîne
      q.setFromUnitVectors(AX_Y, _pb);
      q.multiply(_pq2.setFromAxisAngle(AX_Y, age * S.spin * pt.dir));
      break;
    }
  }
}

// les fleurs qui s'effeuilleront à cette rafale, dans l'ordre où le front les atteindra
function pickGustFlowers() {
  const d = new THREE.Vector2(Math.cos(VENT.dir), Math.sin(VENT.dir));
  const pool = flowerHeads.filter((h) => PETALE[h.sp]);
  const total = pool.reduce((s, h) => s + PETALE[h.sp].odds, 0);
  const n = Math.round(rand(RAFALE.flowers[0] - 0.49, RAFALE.flowers[1] + 0.49));
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    let r = Math.random() * total, h = pool[0];
    for (const x of pool) if ((r -= PETALE[x.sp].odds) <= 0) { h = x; break; }
    if (out.some((o) => o.head === h)) continue;
    // les pétales d'une même fleur partent l'un après l'autre (le front avance de 16 m en RAFALE.cross)
    const c = PETALE[h.sp].count, m = Math.round(rand(c[0] - 0.49, c[1] + 0.49));
    for (let i = 0; i < m; i++)
      out.push({ head: h, sp: h.sp, along: h.x * d.x - h.z * d.y + i * rand(0.6, 1.4) });
  }
  return out.sort((a, b) => a.along - b.along);
}

const DETACH = 0.45;                                 // le temps de se détacher de la fleur (s)
function updateGusts(t) {
  if (t >= nextGust && !gust) {
    gust = { t0: t, spots: flowerHeads.length ? pickGustFlowers() : [] };
    nextGust = t + RAFALE.cross + rand(...RAFALE.every);
  }
  if (gust) {
    const u = (t - gust.t0) / RAFALE.cross;
    if (u >= 1) { gust = null; uGust.value.set(-99, 0); }
    else {
      const front = -8 + 16 * u;                    // il traverse l'îlot de part en part
      uGust.value.set(front, RAFALE.force * Math.sin(Math.PI * u) ** 0.5);
      while (gust.spots.length && gust.spots[0].along <= front) {
        const s = gust.spots.shift();
        spawnPetal(t, s.head, s.sp);
      }
    }
  }
  for (let i = petals.length - 1; i >= 0; i--) {
    const pt = petals[i];
    const age = t - pt.born, u = age / pt.dur;
    if (u >= 1) { scene.remove(pt.mesh); pt.mat.dispose(); petals.splice(i, 1); continue; }
    // emporté d'un coup, puis porté
    const k = Math.min(1, u * (1.35 - 0.35 * u));
    pt.curve.getPointAt(k, _pa);
    pt.curve.getTangentAt(k, _px);
    // le balancement et la rotation s'installent pendant qu'il se détache : au départ, il est encore sur la fleur
    const e = Math.min(1, age / DETACH), ease = e * e * (3 - 2 * e);
    _py.copy(_pa);
    flightPose(pt, age, _pa, _px, pt.q);
    pt.mesh.position.lerpVectors(_py, _pa, ease);
    // il se soulève d'abord à sa base (il pivote autour de son attache), puis part
    _pq.copy(pt.q0).multiply(_pq2.setFromAxisAngle(AX_X, 0.9 * Math.min(1, age / (DETACH * 0.5))));
    pt.mesh.quaternion.slerpQuaternions(_pq, pt.q, ease);
    pt.mat.userData.flap.value.set(pt.S.flap * pt.S.p.length * FLEUR * ease, age * (pt.S.mode === 'culbute' ? 7 : 11) + pt.ph);
    pt.mat.opacity = Math.min(1, (1 - u) / 0.08);
  }
}

// ------------------------------------------------------------ abeilles qui butinent
// Quelques abeilles butinent l'îlot comme de vraies butineuses, dans le repère de l'îlot (elles tournent avec lui).
// Les fleurs viennent du modèle (tetes.py : place et couleur de chaque corolle).
// - Constance florale : pendant une tournée, une abeille reste fidèle à une espèce (une couleur).
// - De proche en proche : elle choisit la fleur suivante parmi les voisines de cette espèce, les plus proches d'abord,
//   plutôt dans le sens où elle avance ; jamais une fleur qu'elle vient de visiter, ni celle d'une autre abeille.
// - Elle inspecte : sur-place devant la corolle ; parfois elle la refuse (déjà vidée) et passe à la suivante.
// - Posée, elle butine : elle piétine, tourne sur la fleur, ailes à demi repliées.
// - Quand le coin est épuisé, elle part vers un autre groupe de la même espèce (ou change d'espèce) ; elle ne quitte
//   jamais l'îlot.
// - Son cap suit le trajet (pas le zigzag) et tourne à vitesse limitée ; posée, elle oscille autour de son cap
//   d'arrivée, sans tourner en rond.
// - Les objets : chaque trajet passe au-dessus de ceux qui sont sur sa route (hauteur de passage), et une force la
//   repousse si elle s'en approche ; les fleurs cachées sous un objet ne sont pas visitées.
// [nombre, longueur (m), vitesse de croisière (m/s), pulsation de la poursuite (rad/s), inspection (s), part des fleurs
//  refusées, pose (s), voisinage (m), hauteur au-dessus des fleurs (m) pour un saut court / un long trajet, marge
//  autour des objets (m), fleurs avant de changer de coin, virage max (rad/s)]
const BEE = { count: 3, length: 0.075, speed: 1.0, omega: 6.5, inspect: [0.35, 0.9], refuse: 0.2, land: [1.6, 3.8],
  near: 1.2, hop: 0.07, lift: 0.2, margin: 0.09, trip: [8, 14], turn: 4 };
const bees = [];
let flowerHeads = [], obstacles = [];
const _bt = new THREE.Vector3(), _ba = new THREE.Vector3(), _bw = new THREE.Vector3(), _bh = new THREE.Vector3();

// la hauteur au-dessus de laquelle passer pour aller de a à b sans toucher d'objet
function clearance(a, b) {
  let top = -Infinity;
  for (let k = 0; k <= 24; k++) {
    const t = k / 24, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    for (const o of obstacles) {
      if (x > o.min.x - BEE.margin && x < o.max.x + BEE.margin && z > o.min.z - BEE.margin && z < o.max.z + BEE.margin) {
        top = Math.max(top, o.max.y);
      }
    }
  }
  return top;
}
// la fleur est-elle sous un objet (ou collée contre lui) ?
function hidden_(h) {
  return obstacles.some((o) => h.x > o.min.x - 0.04 && h.x < o.max.x + 0.04 && h.z > o.min.z - 0.04 &&
    h.z < o.max.z + 0.04 && o.max.y > h.y - 0.02);
}

// la fleur suivante : même espèce, voisine, pas déjà vue ni prise, plutôt devant
function nextFlower(b) {
  const here = b.flower, dir = _bh.set(Math.sin(b.yaw), 0, Math.cos(b.yaw));
  const taken = new Set(bees.filter((o) => o !== b).map((o) => o.flower));
  let best = null, bestW = 0;
  for (const h of flowerHeads) {
    if (h === here || taken.has(h) || b.seen.includes(h) || h.sp !== b.sp) continue;
    const dx = h.x - here.x, dz = h.z - here.z, d = Math.hypot(dx, dz);
    if (d < 0.08 || d > BEE.near) continue;
    const ahead = (dx * dir.x + dz * dir.z) / d;    // -1 derrière, 1 devant
    const w = (1 / (d * d + 0.02)) * (1.4 + ahead) * (0.7 + 0.6 * Math.random());
    if (w > bestW) { bestW = w; best = h; }
  }
  return best;
}
// un autre coin : la fleur libre la plus proche de cette espèce au-delà du voisinage, sinon d'une autre espèce
function newPatch(b, from) {
  const taken = new Set(bees.filter((o) => o !== b).map((o) => o.flower));
  const pool = flowerHeads.filter((h) => !taken.has(h) && !b.seen.includes(h));
  let same = pool.filter((h) => h.sp === b.sp);
  if (!same.length || Math.random() < 0.3) { const sps = [...new Set(pool.map((h) => h.sp))]; b.sp = sps[Math.floor(Math.random() * sps.length)]; same = pool.filter((h) => h.sp === b.sp); }
  same.sort((p, q) => p.distanceTo(from) - q.distanceTo(from));
  const far = same.filter((h) => h.distanceTo(from) > BEE.near);
  const pick = far.length ? far : same;
  return pick[Math.min(pick.length - 1, Math.floor(Math.random() * 4))] || flowerHeads[0];
}

// un trajet : décoller, passer au-dessus de ce qui est sur la route, redescendre au-dessus de la fleur
function plan(b, to, from = b.pos) {
  const lift = from.distanceTo(to) < 0.45 ? BEE.hop : BEE.lift;
  const y = Math.max(from.y, to.y + 0.06) + lift;
  const cruise = Math.max(y, clearance(from, to) + 0.14);
  const hover = to.clone().add(_bt.set(0, 0.06, 0));
  b.path = new THREE.CurvePath();
  const pts = [from.clone(), new THREE.Vector3(from.x, cruise, from.z), new THREE.Vector3(to.x, cruise, to.z), hover];
  for (let i = 0; i < 3; i++) b.path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  b.len = b.path.getLength();
  b.s = 0;
}
function go(b, flower) {
  b.flower = flower;
  b.seen.push(flower);
  if (b.seen.length > 8) b.seen.shift();
  plan(b, flower);
  b.state = 'fly';
}

function makeBees() {
  const sps = [...new Set(flowerHeads.map((h) => h.sp))];
  for (let i = 0; i < BEE.count; i++) {
    const m = makeBee(BEE.length);
    m.root.visible = false;
    island.add(m.root);
    const b = { ...m, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.random() * 6.3, ph: rand(0, 6.3),
      sp: sps[i % sps.length], seen: [], flower: null, visits: 0, quota: Math.round(rand(...BEE.trip)), state: 'land',
      timer: rand(1, 4), path: null, len: 1, s: 0, yaw0: 0 };
    bees.push(b);
    b.flower = newPatch(b, flowerHeads[Math.floor(Math.random() * flowerHeads.length)]);   // déjà posée sur une fleur
    b.seen.push(b.flower);
    b.pos.copy(b.flower);
    b.yaw0 = b.yaw;
  }
}
function steer(b, t, dt, speed) {
  // le point poursuivi avance le long du trajet ; il ralentit à l'arrivée
  const left = b.len - b.s;
  b.s = Math.min(b.len, b.s + dt * speed * Math.min(1, 0.35 + left / 0.35));
  b.path.getPointAt(Math.min(1, b.s / b.len), _bt);
  const w = BEE.omega;
  _ba.subVectors(_bt, b.pos).multiplyScalar(w * w).addScaledVector(b.vel, -2 * 0.9 * w);
  // le zigzag des abeilles : vif, de côté et en hauteur
  _ba.x += 2.0 * Math.sin(t * 13 + b.ph);
  _ba.z += 2.0 * Math.cos(t * 11 + b.ph * 2);
  _ba.y += 1.4 * Math.sin(t * 9 + b.ph * 3);
  // les objets la repoussent : vers le haut et vers le dehors
  for (const o of obstacles) {
    const dx = Math.max(o.min.x - b.pos.x, 0, b.pos.x - o.max.x), dz = Math.max(o.min.z - b.pos.z, 0, b.pos.z - o.max.z);
    const dy = Math.max(o.min.y - b.pos.y, 0, b.pos.y - o.max.y);
    const d = Math.hypot(dx, dy, dz);
    if (d < BEE.margin) {
      const k = 60 * (1 - d / BEE.margin);
      _bw.set(b.pos.x - (o.min.x + o.max.x) / 2, 0, b.pos.z - (o.min.z + o.max.z) / 2).normalize();
      _ba.addScaledVector(_bw, k).y += k * 1.5;
    }
  }
  b.vel.addScaledVector(_ba, dt);
  const vmax = speed * 1.6;                          // jamais plus vite qu'une abeille
  if (b.vel.length() > vmax) b.vel.setLength(vmax);
  b.pos.addScaledVector(b.vel, dt);
  return left;
}

function updateBees(t, dt) {
  const on = t > lifeAt;
  for (const b of bees) {
    if (!on) { b.root.visible = false; continue; }
    b.timer -= dt;
    let landed = 0, look = null;
    b.root.visible = true;
    if (b.state === 'fly') {
      const left = steer(b, t, dt, BEE.speed);
      if (left < 0.001 && b.pos.distanceTo(_bt) < 0.04) { b.state = 'inspect'; b.timer = rand(...BEE.inspect); }
    } else if (b.state === 'inspect') {             // sur-place devant la corolle
      steer(b, t, dt, BEE.speed);
      look = b.flower;
      if (b.timer <= 0) {
        if (Math.random() < BEE.refuse) next(b); else { b.state = 'land'; b.timer = rand(...BEE.land); b.yaw0 = b.yaw; }
      }
    } else if (b.state === 'land') {                // elle butine
      landed = 1;
      _bt.copy(b.flower).add(_ba.set(0.012 * Math.sin(t * 2.3 + b.ph), 0.014, 0.012 * Math.cos(t * 1.9 + b.ph)));
      b.pos.lerp(_bt, 1 - Math.exp(-dt * 8));
      b.vel.set(0, 0, 0);
      b.yaw = b.yaw0 + 0.35 * Math.sin(t * 0.6 + b.ph);   // elle oscille autour de son cap, sans tourner en rond
      if (b.timer <= 0) { b.visits++; next(b); }
    }
    // le cap : vers la fleur qu'elle inspecte (si elle n'est pas juste au-dessus), sinon dans le sens du trajet — le
    // point poursuivi, pas le zigzag ; il tourne à vitesse limitée
    if (!landed) {
      if (look) _bw.subVectors(look, b.pos); else _bw.subVectors(_bt, b.pos);
      if (_bw.x * _bw.x + _bw.z * _bw.z > 0.03 * 0.03) {
        let d = Math.atan2(_bw.x, _bw.z) - b.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const step = d * (1 - Math.exp(-dt * 5));
        b.yaw += THREE.MathUtils.clamp(step, -BEE.turn * dt, BEE.turn * dt);
      }
    }
    b.root.position.copy(b.pos);
    b.root.rotation.set(landed ? 0.25 : -0.12 + 0.08 * Math.sin(t * 3 + b.ph), b.yaw, 0, 'YXZ');
    b.buzz(dt, landed);
  }
}
// après une fleur : la suivante, un autre coin, ou la ruche
function next(b) {
  // après une dizaine de fleurs, elle change de coin (et parfois d'espèce) ; sinon la voisine
  if (b.visits >= b.quota) {
    b.visits = 0;
    b.quota = Math.round(rand(...BEE.trip));
    go(b, newPatch(b, b.pos));
    return;
  }
  const n = nextFlower(b);
  go(b, n || newPatch(b, b.pos));
}

// ------------------------------------------------------------ chargement de l'îlot
// le décodeur Draco, servi par le site (outils/build.mjs), chargé tout de suite : en même temps que le modèle
const draco = new DRACOLoader().setDecoderPath('js/draco/');
draco.preload();
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

  // papillons : les anciens modèles cèdent la place à ceux de js/papillons.js, qui gardent leurs réglages
  const bodies = [];
  root.traverse((o) => { if (o.userData.papillon) bodies.push(o); });
  bodies.forEach((node, i) => {
    const { cx, cy, cz, rad, ph, sp } = node.userData;
    node.parent.remove(node);
    const b = makeButterfly(BUTTERFLY.species[i % BUTTERFLY.species.length], BUTTERFLY.span, voidify);
    scene.add(b.root);
    b.root.traverse((c) => { if (c.isMesh) c.castShadow = desktop; });   // leur ombre sur l'îlot : sur ordinateur
    const trip = TRIPS.find((tr) => tr.who === i) || null;
    flyers.push({ ...b, cx, cy, cz, rad, ph, sp, trip,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), acc: new THREE.Vector3(), head: new THREE.Vector3(0, 0, 1),
      yaw: 0, bank: 0, pitch: 0.24, gliding: false, timer: rand(...FLIGHT.rest), started: false, u: null });
  });

  island.add(root);
  grabbable = root;
  if (!reduced) {
    if (seedTemplate) makeSeeds(seedTemplate);
    if (seedTemplate && desktop) escapeGeo = makeEscapeGeometry(seedTemplate);
    // les fleurs relevées dans le modèle (tetes.py), pour les abeilles
    root.traverse((o) => {
      if (o.userData.tetes && !flowerHeads.length) {
        flowerHeads = JSON.parse(o.userData.tetes).map(([x, y, z, sp]) => Object.assign(blender(x, y, z), { sp }));
      }
    });
    // les objets du tas, pour que les abeilles ne les traversent pas : leurs boîtes, dans le repère de l'îlot
    island.add(root);
    island.updateMatrixWorld(true);
    const toIsland = new THREE.Matrix4().copy(island.matrixWorld).invert();
    root.traverse((o) => {
      let p = o;
      while (p && !p.userData.service) p = p.parent;
      if (!o.isMesh || !p) return;
      o.geometry.computeBoundingBox();
      obstacles.push(o.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(toIsland, o.matrixWorld)));
    });
    flowerHeads = flowerHeads.filter((h) => !hidden_(h));
    if (desktop && flowerHeads.length) makeBees();
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
  if (u >= 1) {
    lifeAt = t;                                     // les papillons peuvent partir en excursion
    nextEscape = t + rand(3, 6);                    // et les premières aigrettes s'échapper
    nextGust = t + rand(10, 16);                    // la première rafale
  }
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
  // taille des grains de poussière : leur diamètre réel, projeté à la hauteur de l'écran
  dustMat.uniforms.uScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(vfovR / 2));
  // la caméra des dioramas : en face, en légère plongée, l'îlot décalé à sa place à l'écran
  camera.position.set(0, Math.sin(DIVE) * baseDist, Math.cos(DIVE) * baseDist).add(CENTER);
  camera.lookAt(CENTER);
  basePos.copy(camera.position);
  camera.updateMatrixWorld();
  baseView.copy(camera.matrixWorld);
  camera.setViewOffset(w, h, -(frameF.x - 0.5) * w, -(frameF.y - 0.5) * h, w, h);
  camera.updateProjectionMatrix();
  tiltUp = maxTiltUp(h);
  scene.fog.near = baseDist + MIST.start;
  scene.fog.far = scene.fog.near + (FIT_RADIUS - MIST.start) / MIST.amount;
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
    updateButterflies(uTime.value, dt);
    if (desktop) updateEscapes(uTime.value, dt);
    if (desktop) updateGusts(uTime.value);
    if (bees.length) updateBees(uTime.value, dt);
    // le rai se lève dès que l'îlot commence à apparaître
    uShaft.fade.value = born < 0 ? 0 : smooth(born + REVEAL.wait, born + REVEAL.wait + 1.6, uTime.value);
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
