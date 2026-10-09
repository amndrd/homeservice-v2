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
import './stats.js';                                // les chiffres, sous l'À propos (leurs scènes 3D)

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
  // (stencil : le rai ne s'ajoute pas sur le plan qui recouvre le titre, voir STENCIL_TEXT)
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
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
// Le rai est une lumière ajoutée, × l'alpha de la toile : invisible sur la page. Mais quand le vide reprend le titre,
// le plan qui le recouvre (textVoid) est peint de la couleur de la page, opaque : le rai s'y verrait (un cône plus
// blanc que le blanc). Ce plan marque donc ses pixels dans le stencil (STENCIL_TEXT), l'îlot et les objets effacent la
// marque là où ils passent devant lui, et le rai (et sa poussière) ne s'ajoute pas sur ce qui reste marqué. Ainsi il
// peut rester allumé pendant que les objets s'envolent : ils gardent leur éclaircie.
const STENCIL_TEXT = 1;
const shaftStencil = { stencilWrite: true, stencilWriteMask: 0, stencilRef: STENCIL_TEXT, stencilFunc: THREE.NotEqualStencilFunc };
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
const uExit = { value: 1e5 };                       // le front du départ (au-delà de 1e4 : pas de départ)
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
    ...shaftStencil,
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
// Le même front sert au départ (uExit, plus bas : LÉVITATION) : le vide reprend l'îlot, du bord vers le centre ; il
// ne reprend pas les objets qui s'envolent (matière marquée userData.lifter).
const VOID_FN = `
${VD_NOISE}
float vdN(vec3 P) { return vdNoise(P * ${REVEAL.f1.toFixed(2)}) * 0.75 + vdNoise(P * ${REVEAL.f2.toFixed(2)}) * 0.25; }
float voidAt(float R, vec3 P, float n) {
  return R - length(P.xz) - max(P.y - ${REVEAL.ground.toFixed(2)}, 0.0) / ${REVEAL.rise.toFixed(1)} + n * ${REVEAL.edge.toFixed(1)};
}`;
const VOID_FRAG = `
uniform float uReveal, uExit; varying vec3 vVoidP;
${VOID_FN}`;
const voidDiscard = (exit) => `
if ( uReveal < 1e4${exit ? ' || uExit < 1e4' : ''} ) {
  float vn = vdN(vVoidP);
  if ( ( uReveal < 1e4 && voidAt(uReveal, vVoidP, vn) < 0.0 )${exit ? ' || ( uExit < 1e4 && voidAt(uExit, vVoidP, vn) < 0.0 )' : ''} ) discard;
}`;
// l'ombre du ciel sous les objets qui lévitent (plus bas : LÉVITATION). L'ombre du soleil, elle, reste celle de la
// carte d'ombre : elle suit l'objet dans le sens de la lumière. Mais un objet cache aussi le ciel à ce qui est sous
// lui : la lumière du ciel (seulement elle : reflectedLight.indirectDiffuse) y baisse, selon la silhouette de l'objet
// vue de dessus (uFoot : une case par objet, dessinée au chargement), d'autant plus floue et légère que le point est
// loin sous lui. Au repos (uLiftN = 0), rien n'est calculé.
const MAX_LIFT = 32;
// la silhouette des objets vus de dessus : [cases par côté, pixels par case, marge autour de l'objet (m), flou le plus
// fort (niveau de mipmap : la marge le contient)]
const FOOT = { grid: 6, px: 256, margin: 0.35, maxLod: 5 };
// l'ombre du ciel : [force, distance sous l'objet où elle a perdu la moitié de sa force (m), flou (m : au contact,
//  par m de distance), hauteur de l'objet où elle a toute sa force (m : elle naît doucement)]
const SKY = { strength: 0.85, reach: 0.4, blur: [0.03, 0.6], born: 0.05 };
const footRT = new THREE.WebGLRenderTarget(FOOT.grid * FOOT.px, FOOT.grid * FOOT.px, {
  generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
const uLift = {
  uLiftA: { value: Array.from({ length: MAX_LIFT }, () => new THREE.Vector4()) },   // case : coin (x, z), côté (m)
  uLiftB: { value: Array.from({ length: MAX_LIFT }, () => new THREE.Vector4()) },   // case dans uFoot (u, v), px/m, force
  uLiftY: { value: new Float32Array(MAX_LIFT) },    // dessous de l'objet : seul ce qui est plus bas est à l'ombre
  uLiftN: { value: 0 },
  uFoot: { value: footRT.texture },
};
const LIFT_FRAG = `
uniform vec4 uLiftA[${MAX_LIFT}]; uniform vec4 uLiftB[${MAX_LIFT}]; uniform float uLiftY[${MAX_LIFT}]; uniform int uLiftN;
uniform sampler2D uFoot;
float liftSky() {
  float occ = 0.0;
  for (int i = 0; i < ${MAX_LIFT}; i++) {
    if (i >= uLiftN) break;
    vec4 A = uLiftA[i], B = uLiftB[i];
    float d = uLiftY[i] - vVoidP.y;                                   // distance sous l'objet (m)
    if (B.w <= 0.0 || d < 0.0) continue;
    vec2 q = vec2(vVoidP.x - A.x, A.y + A.z - vVoidP.z) / A.z;         // dans sa case (vue de dessus, nord en haut)
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue;
    float blur = ${SKY.blur[0].toFixed(3)} + ${SKY.blur[1].toFixed(3)} * d;
    float lod = clamp(log2(max(blur * B.z, 1.0)), 0.0, ${FOOT.maxLod.toFixed(1)});
    float s = textureLod(uFoot, B.xy + q * ${(1 / FOOT.grid).toFixed(6)}, lod).r;
    occ = max(occ, s * B.w / (1.0 + d * d / ${(SKY.reach * SKY.reach).toFixed(4)}));
  }
  return 1.0 - ${SKY.strength.toFixed(3)} * occ;
}`;
const voidPatched = new WeakSet();
// le vide sur un matériau : chaque fragment encore dans le blanc n'est pas dessiné. Le calcul se fait dans le repère
// de l'îlot : le dessin du bord tourne avec lui si on le fait tourner pendant l'apparition.
function voidify(m) {
  if (voidPatched.has(m)) return m;
  voidPatched.add(m);
  // devant le plan du titre, il efface sa marque : le rai s'y ajoute de nouveau (STENCIL_TEXT)
  Object.assign(m, { stencilWrite: true, stencilRef: 0, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.uReveal = uReveal;
    sh.uniforms.uExit = uExit;
    sh.uniforms.uIslandInv = uIslandInv;
    Object.assign(sh.uniforms, uLift);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uIslandInv;\nvarying vec3 vVoidP;')
      .replace('#include <project_vertex>', 'vVoidP = ( uIslandInv * modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n#include <project_vertex>');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + VOID_FRAG + LIFT_FRAG)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + voidDiscard(!m.userData.lifter))
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nif ( uLiftN > 0 ) reflectedLight.indirectDiffuse *= liftSky();');
  };
  m.customProgramCacheKey = () => prevKey() + (m.userData.lifter ? '|vide-objet' : '|vide');
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
  if (uReveal.value > 1e4 && uExit.value > 1e4) return 1;
  const n = vdNoise(p.x * REVEAL.f1, p.y * REVEAL.f1, p.z * REVEAL.f1) * 0.75
    + vdNoise(p.x * REVEAL.f2, p.y * REVEAL.f2, p.z * REVEAL.f2) * 0.25;
  const d = (R) => R - Math.hypot(p.x, p.z) - Math.max(p.y - REVEAL.ground, 0) / REVEAL.rise + n * REVEAL.edge;
  return Math.min(uReveal.value > 1e4 ? 1 : d(uReveal.value), uExit.value > 1e4 ? 1 : d(uExit.value));
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
    ...shaftStencil,
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
  seedMesh.visible = exitK < 1;
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
const statics = [];                                 // l'îlot sans ses objets (sol, flore…) : caché une fois reparti

// un point de l'image (x, y en part de l'écran) à une profondeur donnée (m), dans le monde : vu de la caméra à sa
// place, ou de la caméra telle qu'elle est à l'instant (`live` : ce qui doit coller à la page)
function screenToWorld(sx, sy, depth, out, live = false) {
  _ndc.set(sx * 2 - 1, 1 - sy * 2, 0.5).applyMatrix4(camera.projectionMatrixInverse);
  return out.copy(_ndc).multiplyScalar(depth / -_ndc.z).applyMatrix4(live ? camera.matrixWorld : baseView);
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

// ------------------------------------------------------------ le papillon guide
// L'un des papillons de l'îlot, l'« aurore » (turquoise et rose), accompagne la lecture de la page. Ce n'est pas une
// animation au défilement : à chaque image, il regarde ce qu'il y a à l'écran et décide. Il voit les objets qui
// volent (il les contourne), les bords de l'écran (il y reste), la lecture de l'À propos et les endroits où il peut se
// poser (js/apropos.js : window.hsPage). Au repos, il vit chez lui comme les autres. Quand les objets décollent, il
// quitte son coin d'herbe et vole parmi eux ; le vide ne le reprend pas. À partir de l'À propos, la page est un mur,
// face à nous : il vole devant lui par trajets (ROUTES : une traversée, un tour du texte, une exploration le long des lignes,
// un survol de mots, une sortie de l'écran), tracés d'avance en courbe ; le défilement ne les interrompt pas. Il ne se
// pose que si on lit (LAND : la page arrêtée depuis quelques secondes, de plus en plus volontiers), d'abord sur le
// dernier mot du texte, souvent après un ou deux passages d'inspection. Posé contre le mur, la tête vers le haut, le
// dos vers nous, il part avec la page ; il s'envole quand on reprend le défilement, quand son perchoir quitte l'écran, ou
// quand il en a assez (après s'être réveillé, s'il est resté longtemps). En remontant jusqu'à l'îlot, il rentre chez
// lui. Son vol est celui des autres (poursuite amortie, accélération et vitesse bornées, vol erratique), dans le
// repère du mur (wallFrame) : on le voit de face ou de profil, jamais de dessus.
// [profondeur où il vole près de la page, parmi les objets (part du recul de la caméra), vitesse max, accélération
//  max, pulsation et amortissement de la poursuite, vol erratique (de côté, en hauteur), marge autour des objets (m)
//  et anticipation (s), temps pour rattraper un
//  perchoir (s), zone de l'écran où il reste (x0, y0, x1, y1), taille près de la page (×), distance où il commence
//  à se plaquer contre le mur (m), temps pour s'en écarter (s), distance de vol au mur (m), moment où il
//  rejoint la page (part de l'envol : début, fin)]
const GUIDE = { species: 'aurore', depth: 0.45, among: 0.85, vmax: 2.2, accel: 6, omega: 2.2, zeta: 0.85,
  wander: [0.7, 1.4], avoid: 0.5, ahead: 0.4, catchUp: 3, view: [0.06, 0.12, 0.94, 0.9],
  scale: 1.15, settle: 0.5, rise: 0.45, alt: [0.35, 0.9], page: [0.03, 0.4] };
// se poser en chemin, près de la page : [distance préférée d'un endroit où se poser (part de la hauteur de l'écran),
//  tolérance, longueur d'une étape de vol (idem), vitesse sur la courbe d'approche et au contact (m/s), de croisière
//  (m/s), souplesse de la poursuite (pulsation, 1/s)]
// en retard sur la page (on a défilé vite, il est resté au fond) : [retard (m) en deçà duquel il l'a rejointe, au-delà
//  duquel il pique vers elle à pleine vitesse], vitesse du piqué (m/s), part du temps où il bat des ailes en piqué
const CATCH = { late: [0.3, 1.5], dive: 4.5, beat: 0.3 };
const PATH_LAND = { reach: 0.24, spread: 0.12, hop: [0.12, 0.3], speed: 1.6, touch: 0.3, cruise: 2.2, omega: 2.6 };
// ses trajets devant le mur : [chances (0 : jamais tiré au sort), allure (m/s), distances au mur entre lesquelles il
//  va et vient le long du trajet (m)]
// L'allure se juge à ses battements : un papillon avance de plusieurs envergures par battement ; à ~6 battements/s et
// 0,23 m d'envergure, moins de ~1,5 m/s paraît au ralenti (on était à 0,8 : un quart d'envergure par battement).
const ROUTES = {
  traverse: { w: 0.25, speed: 2.6, alt: [0.25, 1.8] },   // d'un côté de l'écran à l'autre, en arc
  tour: { w: 0.2, speed: 2.2, alt: [0.2, 1.6] },         // une grande boucle autour du texte
  explore: { w: 0.2, speed: 1.5, alt: [0.12, 0.7] },     // en zigzag, près du mur, le long des lignes
  words: { w: 0.15, speed: 1.6, alt: [0.15, 0.6] },      // de mot en mot, sans s'y poser
  away: { w: 0.2, speed: 3.0, alt: [0.5, 1.8] },         // il sort de l'écran, et reviendra par un autre bord
  enter: { w: 0, speed: 2.4, alt: [0.5, 1.6] },          // il rentre
  hop: { w: 0, speed: 1.5, alt: [0.3, 0.6] },            // un petit saut (approche abandonnée)
  inspect: { w: 0, speed: 1.6, alt: [0.2, 0.35] },       // il passe au-dessus d'un perchoir avant de s'y poser
};
// se poser : [lecture (s sans défiler) à partir de laquelle il peut le vouloir, où l'envie est au plus fort ; chance
//  de se poser à la fin d'un trajet (au début, au plus fort) ; envie d'abréger son trajet pour se poser, au plus fort
//  (par s) ; chance d'une inspection avant, d'une seconde ; temps dehors en sortie (s)]
const LAND = { read: [2, 6], chance: [0.35, 0.95], early: 0.25, inspect: 0.65, again: 0.35, out: [5, 20] };
let guide = null;
const G = { mode: 'home', target: new THREE.Vector3(), site: null, path: null, timer: 0, until: 0, since: 0, spot: null,
  fly: null, away: null, fleeDir: new THREE.Vector3(), first: false, posture: 'open', nextAct: 0, restA: null, flick: 0,
  step: new THREE.Vector2(), stepTo: new THREE.Vector2(),
  spotAt: 0, last: null, sawEnd: false, wall: 0, liftoff: -9, dist: 1, flat: new THREE.Quaternion(), alt: 0.9,
  touch: -9, clap: -9, clapAt: new THREE.Vector3(), scrollY: 0, route: null, recent: [], wake: null };
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3(), _ga = new THREE.Vector3(), _gq = new THREE.Quaternion();
const _wy = new THREE.Vector3(), _wz = new THREE.Vector3(), _wx = new THREE.Vector3();
// à plat contre le mur : le dos vers la caméra, la tête vers le haut de l'écran, tournée de `angle`
function wallQuat(pos, angle, out) {
  _wy.subVectors(camera.position, pos).normalize();
  _wz.setFromMatrixColumn(camera.matrixWorld, 1);
  _wz.addScaledVector(_wy, -_wz.dot(_wy)).normalize().applyAxisAngle(_wy, angle);
  _wx.crossVectors(_wy, _wz);
  return out.setFromRotationMatrix(_m.makeBasis(_wx, _wy, _wz));
}
// 0 : parmi les objets, 1 : près de la page (le mur). Il ne rejoint la page que quand les objets s'en vont et que le
// texte arrive (l'envol, flyK) : il passe peu à peu du repère du monde à celui du mur (wallFrame).
const nearPage = () => smooth(GUIDE.page[0], GUIDE.page[1], flyK);
const guideDepth = () => THREE.MathUtils.lerp(GUIDE.among, GUIDE.depth, nearPage()) * baseDist;
// son retard sur la page (m) : de combien il est plus loin de nous que sa hauteur de vol au-dessus d'elle. La page
// arrive avec le défilement, lui la rejoint en volant : défilé vite, il est encore au fond (petit à l'écran).
const _gl = new THREE.Vector3(), _gm = new THREE.Vector3();
function guideLag() {
  camera.getWorldDirection(_gl);
  return _gl.dot(_gm.subVectors(guide.pos, camera.position)) - (guideDepth() - G.alt * nearPage());
}
// 0 : il est à sa distance du mur ; 1 : très en retard, il pique vers lui
const catching = () => nearPage() * smooth(CATCH.late[0], CATCH.late[1], guideLag());
// il peut se poser : il a rejoint la page (pour de vrai, pas seulement le défilement), et il ne reste presque plus
// d'objets à l'écran (compté chaque image) — ou on lit déjà : arrêté en pleine envolée, les objets restent en l'air
// au-dessus du texte, et ne doivent pas l'empêcher de se poser
const pageReady = () => nearPage() >= 0.99 && guideLag() < CATCH.late[0]
  && (objectsOnScreen <= 1 || readFor() > LAND.read[0]);
const guideScale = () => THREE.MathUtils.lerp(1, GUIDE.scale, nearPage());
// À partir de l'À propos, la page est un mur : un plan à guideDepth() de la caméra, face à elle. En vol, il est devant,
// à G.alt mètres vers nous (plus loin du mur, il paraît plus grand) ; se poser, c'est aller jusqu'au plan.
const airPoint = (sx, sy, out) => screenToWorld(sx, sy, guideDepth() - G.alt * nearPage(), out, true);
// un perchoir de la page, à l'instant (ou null s'il n'existe plus)
const perchNow = (id) => window.hsPage?.perches().find((p) => p.id === id) ?? null;
const inView = (p) => p.y > 0.18 && p.y < 0.85 && p.x > 0.05 && p.x < 0.95;
// Où se poser : un mot de la page, ou un point du blanc de la page (le mur) ; les deux défilent avec
// elle. Un endroit sur le blanc est retenu par sa place dans le document (docY), pas à l'écran.
function siteAt(site) {                             // sa place à l'écran, à l'instant (null s'il n'existe plus)
  if (site.kind === 'word') { const p = perchNow(site.id); return p && { x: p.x, y: p.yc }; }
  return { x: site.x, y: (site.docY - window.scrollY) / window.innerHeight };
}
const siteWorld = (s, out) => screenToWorld(s.x, s.y, guideDepth(), out, true);   // collé à la page
const siteOk = (s) => !!s && s.y > 0.12 && s.y < 0.9 && s.x > 0.04 && s.x < 0.96;
// sa place et sa direction de vol à l'écran (en hauteurs d'écran, pour que les distances soient les mêmes en x et y)
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
function onScreen(f) {
  const asp = window.innerWidth / window.innerHeight;
  _sa.copy(f.pos).project(camera);
  _sb.copy(f.pos).addScaledVector(f.vel, 0.25).project(camera);
  let hx = (_sb.x - _sa.x) * asp, hy = -(_sb.y - _sa.y);
  const n = Math.hypot(hx, hy);
  if (n < 1e-4) { hx = 0; hy = -1; } else { hx /= n; hy /= n; }
  return { x: (_sa.x + 1) / 2, y: (1 - _sa.y) / 2, hx, hy, asp };
}
// un déplacement à l'écran (en hauteurs d'écran) en direction dans le monde, dans le plan de la page
function screenDir(dx, dy, out) {
  _wx.setFromMatrixColumn(camera.matrixWorld, 0);
  _wz.setFromMatrixColumn(camera.matrixWorld, 1);
  return out.copy(_wx).multiplyScalar(dx).addScaledVector(_wz, -dy).normalize();
}
// choisir où se poser : devant lui, à bonne distance (`reach`, en hauteurs d'écran), plutôt sur un mot, pas là où il
// était ; un peu de hasard
function chooseSite(f, reach) {
  const me = onScreen(f), vh = window.innerHeight, cands = [];
  for (const p of window.hsPage?.perches() ?? []) cands.push({ kind: 'word', id: p.id, x: p.x, y: p.yc });
  for (let i = 0; i < 16; i++) {
    const x = rand(0.1, 0.9), y = rand(0.22, 0.82);
    cands.push({ kind: 'page', x, y, docY: y * vh + window.scrollY });
  }
  let best = null, top = 0;
  for (const c of cands) {
    if (!siteOk(c) || (c.kind === 'word' && c.id === G.last)) continue;
    const dx = (c.x - me.x) * me.asp, dy = c.y - me.y, d = Math.hypot(dx, dy) || 1e-3;
    const ahead = 0.2 + 0.8 * Math.max(0, (dx * me.hx + dy * me.hy) / d);
    const score = Math.exp(-(((d - reach) / (0.5 * reach)) ** 2)) * ahead * ahead
      * (c.kind === 'word' ? 1.3 : 1) * rand(0.75, 1.25);
    if (score > top) { top = score; best = c; }
  }
  return best;
}

// ------------------------------------------------------------ la souris
// Il la voit quand il est posé : si le curseur s'approche vivement, il s'envole et s'enfuit. En vol, il l'ignore.
const mouse = { x: -9, y: -9, t: -9, speed: 0 };
window.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const now = performance.now() / 1000, x = e.clientX / window.innerWidth, y = e.clientY / window.innerHeight;
  const asp = window.innerWidth / window.innerHeight;
  mouse.speed = Math.hypot((x - mouse.x) * asp, y - mouse.y) / Math.max(1 / 60, now - mouse.t);
  Object.assign(mouse, { x, y, t: now });
}, { passive: true });
// la page qui défile : sa vitesse (écrans par seconde), lissée, et qui retombe quand on s'arrête. Posé, un
// défilement brusque l'effraie (BEHAVE.jolt) ; une lecture tranquille, non.
const scrolling = { y: window.scrollY, yPrev: window.scrollY, t: performance.now() / 1000, v: 0, jolt: -9, dir: 0 };
window.addEventListener('scroll', () => {
  const now = performance.now() / 1000, dt = Math.max(1 / 120, now - scrolling.t);
  const v = (window.scrollY - scrolling.y) / window.innerHeight / Math.max(1 / 60, dt);
  scrolling.v = scrolling.v * Math.exp(-dt * 20) + v * (1 - Math.exp(-dt * 20));   // lissé sur ~50 ms
  Object.assign(scrolling, { y: window.scrollY, t: now });
  // une secousse — un bond de la page, rapide — est retenue un instant, quelle que soit la cadence des images
  const dy = (window.scrollY - scrolling.yPrev) / window.innerHeight;
  if (Math.abs(dy) > 0.04 && Math.abs(v) > BEHAVE.jolt) {
    scrolling.jolt = now; scrolling.dir = Math.sign(dy || scrolling.v);
  }
  scrolling.yPrev = window.scrollY;
}, { passive: true });
const scrollSpeed = () => scrolling.v * Math.exp(-(performance.now() / 1000 - scrolling.t) * 6);
const jolted = () => performance.now() / 1000 - scrolling.jolt < 0.4;
function cursorNear(me, r) {                        // le curseur, s'il a bougé il y a peu et qu'il est près de lui
  if (performance.now() / 1000 - mouse.t > 0.6) return null;
  const dx = (me.x - mouse.x) * me.asp, dy = me.y - mouse.y, d = Math.hypot(dx, dy);
  return d < r ? { dx, dy, d } : null;
}

// ------------------------------------------------------------ ce qu'il fait : posé, en vol
// Posé, il reste longtemps et ne reste pas figé : il change de posture (ailes grandes ouvertes au soleil, en V,
// fermées), bat vivement des ailes un instant, pivote un peu, fait quelques pas. Resté longtemps, il se réveille avant
// de repartir : il ouvre et referme lentement les ailes, deux ou trois fois.
// [temps posé (s), la première fois sur le dernier mot (s), un geste toutes les… (s), postures (angle des ailes) ;
//  la souris : distance qui l'effraie posé (part de la hauteur de l'écran), vitesse du curseur qui l'effraie (hauteurs
//  d'écran par s), fuite : durée (s), vitesse (m/s) ; défilement qui l'effraie posé (écrans par s), défilement qui le
//  fait repartir (part de la hauteur de l'écran), penché au plus contre le mur (rad) ; le réveil : après combien de temps posé (s), durée (s), un
//  battement lent (s)]
const BEHAVE = {
  rest: [8, 30], first: [10, 20], act: [2.5, 7], postures: { open: 0.08, vee: 0.62, closed: 1.3 },
  startle: 0.09, scare: 0.4, flee: [1.2, 2], fleeSpeed: 3, jolt: 1.6, resume: 0.01, tilt: 0.6,
  wake: { after: 12, dur: [1.8, 2.8], beat: 0.9 },
};
// depuis combien de temps on lit (s) : la page n'a pas bougé
const readFor = () => performance.now() / 1000 - scrolling.t;
// l'envie de se poser à la fin d'un trajet : nulle tant qu'on défile, de plus en plus forte à mesure qu'on lit
const landChance = (read) => read < LAND.read[0] ? 0 : THREE.MathUtils.lerp(LAND.chance[0], LAND.chance[1], smooth(LAND.read[0], LAND.read[1], read));
// posé ou sur le point de l'être, la page a bougé (au-delà d'un frémissement) depuis qu'il a choisi son perchoir
const scrolledSince = () => Math.abs(window.scrollY - G.scrollY) > BEHAVE.resume * window.innerHeight;
// Les gestes (d'après les vidéos à haute vitesse d'insectes qui se posent et décollent) : à l'approche, il freine
// presque jusqu'au surplace en se redressant, ses battements plus amples et plus vifs ; au contact, il referme les
// ailes un instant et se tasse un peu, puis prend sa posture. Au départ, il claque les ailes au-dessus du dos et les
// rouvre d'un coup en s'élançant (le « clap and fling » des papillons), ses premiers battements amples. Posé, ses ailes
// frémissent à peine et son corps bouge un tout petit peu.
// Au départ, il bat d'abord des ailes pour s'élever de la page, presque sur place (lift : il ne monte que de `climb`),
// puis prend de la vitesse peu à peu (ramp) : jamais d'un coup.
// [distance où il commence à se redresser (m), redressement (rad), ailes fermées au contact (s), tassement (part,
//  durée en s), claquement (s), envol sur place (s), hauteur prise (m), mise en vitesse (s), battements vifs du
//  départ (s), frémissement des ailes (rad), du corps (rad)]
const GESTURE = { flare: 0.3, pitch: 0.45, shut: 0.4, squash: [0.12, 0.35], clap: 0.14, lift: 0.35, climb: 0.15,
  ramp: 0.8, burst: 0.9, tremble: 0.035, sway: 0.03 };
// le prochain trajet : au sort, pas l'un des deux derniers (autant que possible) ; quand on défile, il sort plus
// volontiers de l'écran
function pickRoute() {
  const kinds = Object.keys(ROUTES).filter((k) => ROUTES[k].w > 0 && (k !== 'words' || visiblePerches().length >= 2));
  const w = kinds.map((k) => ROUTES[k].w * (G.recent.includes(k) ? 0.25 : 1) * (k === 'away' && readFor() < 1.5 ? 2 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kinds.length; i++) if ((r -= w[i]) <= 0) return kinds[i];
  return kinds[0];
}
const visiblePerches = () => (window.hsPage?.perches() ?? []).filter(inView);
const inside = (x, y) => [THREE.MathUtils.clamp(x, 0.1, 0.9), THREE.MathUtils.clamp(y, 0.2, 0.8)];
// les portes hors de l'écran, par bord (gauche, droite, haut, bas) : assez loin pour que son ombre n'y paraisse pas
const DOOR = 0.2;
const doorOn = (e, a) => [[-DOOR, a], [1 + DOOR, a], [a, -DOOR], [a, 1 + DOOR]][e];
// Un trajet : des points de l'écran (x, y en part de l'écran), tracés d'avance ; une courbe douce (Catmull-Rom) passe
// par eux, devant le mur, et il la suit à son allure (guideThink). Il part de là où il est, dans le sens où il
// va : jamais de demi-tour au départ.
function planRoute(t, kind, site = null, extra = {}) {
  const R = ROUTES[kind], me = onScreen(guide), asp = me.asp;
  G.fly = kind;
  G.alt = rand(...R.alt);
  const P = [];
  const toward = (a, b, f, side = 0) => {           // de a vers b, une part f du chemin, écarté de côté (hauteurs d'écran)
    const dx = (b[0] - a[0]) * asp, dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
    return [a[0] + (dx * f - (dy / n) * side) / asp, a[1] + dy * f + (dx / n) * side];
  };
  const at = [me.x, me.y];
  if (kind === 'traverse') {                         // vers l'autre côté, en arc
    const s = me.x < 0.5 ? 1 : -1, end = [0.5 + s * rand(0.22, 0.38), rand(0.25, 0.75)];
    P.push(inside(...toward(at, end, 0.5, (Math.random() < 0.5 ? -1 : 1) * rand(0.08, 0.18))), inside(...end));
  } else if (kind === 'tour') {                     // autour du texte, un tour ou un peu plus, dans un sens ou l'autre
    const cx = 0.5 + rand(-0.08, 0.08), cy = 0.5 + rand(-0.05, 0.05), rx = rand(0.26, 0.36), ry = rand(0.2, 0.27);
    const a0 = Math.atan2((me.y - cy) / ry, (me.x - cx) / rx), dir = Math.random() < 0.5 ? -1 : 1;
    const turns = rand(0.8, 1.25), n = Math.round(6 * turns) + 1;
    for (let k = 1; k <= n; k++) {
      const a = a0 + (dir * 2 * Math.PI * turns * k) / n, r = rand(0.88, 1.12);
      P.push(inside(cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)));
    }
  } else if (kind === 'explore') {                  // le long des lignes, d'un bord du texte à l'autre
    let left = me.x > 0.5, y = me.y;
    const dy = (me.y < 0.5 ? 1 : -1) * rand(0.06, 0.1);
    for (let k = 0, n = 3 + ((Math.random() * 3) | 0); k < n; k++) {
      y += dy;
      P.push(inside(left ? rand(0.14, 0.3) : rand(0.7, 0.86), y));
      left = !left;
    }
  } else if (kind === 'words') {                    // deux ou trois mots, du plus proche au suivant
    let pool = visiblePerches().filter((q) => Math.hypot((q.x - me.x) * asp, q.yc - me.y) > 0.15), from = at;
    for (let k = 0, n = 2 + (Math.random() < 0.5 ? 1 : 0); k < n && pool.length; k++) {
      pool.sort((a, b) => Math.hypot((a.x - from[0]) * asp, a.yc - from[1]) - Math.hypot((b.x - from[0]) * asp, b.yc - from[1]));
      const p = pool[Math.min(pool.length - 1, (Math.random() * 2) | 0)];
      pool = pool.filter((q) => q !== p && Math.hypot((q.x - p.x) * asp, q.yc - p.yc) > 0.18);   // pas de crochets serrés
      from = inside(p.x + rand(-0.03, 0.03), p.yc - 0.03);
      P.push(from);
    }
    if (!P.length) P.push(inside(1 - me.x, me.y));  // plus de mots assez loin : il traverse
  } else if (kind === 'away') {                     // par un bord proche, en arc
    const dist = [me.x, 1 - me.x, me.y, 1 - me.y];
    const order = [0, 1, 2, 3].sort((a, b) => dist[a] - dist[b]);
    const edge = order[Math.random() < 0.7 ? 0 : 1];
    const door = doorOn(edge, edge < 2 ? THREE.MathUtils.clamp(me.y + rand(-0.25, 0.25), 0.15, 0.85)
      : THREE.MathUtils.clamp(me.x + rand(-0.25, 0.25), 0.15, 0.85));
    P.push(toward(at, door, 0.5, (Math.random() < 0.5 ? -1 : 1) * rand(0.05, 0.12)), door);
    G.away = { phase: 'out', edge, door, back: 0 };
  } else if (kind === 'enter') {                    // de la porte vers l'intérieur, en arc
    const end = [rand(0.25, 0.75), rand(0.3, 0.7)];
    P.push(toward(at, end, 0.55, (Math.random() < 0.5 ? -1 : 1) * rand(0.05, 0.12)), inside(...end));
  } else if (kind === 'hop') {                      // tout près, plutôt devant lui
    const a = Math.atan2(me.hy, me.hx) + rand(-0.8, 0.8), d = rand(0.08, 0.16);
    P.push(inside(me.x + (Math.cos(a) * d) / asp, me.y + Math.sin(a) * d));
  } else if (kind === 'inspect') {
    // un circuit : il passe au-dessus du perchoir, file au-delà, fait demi-tour en un large arc sur un côté, et
    // revient face à lui — c'est de là qu'il se posera, sans crochet (d : le sens du passage, n : le côté)
    const c = siteAt(site), sd = Math.random() < 0.5 ? -1 : 1;
    let dx = (c.x - me.x) * asp, dy = c.y - me.y;
    const D = Math.hypot(dx, dy);
    if (D < 0.06) { dx = me.hx; dy = me.hy; } else { dx /= D; dy /= D; }   // déjà dessus : dans le sens où il va
    const nx = -dy * sd, ny = dx * sd;
    const pt = (a, b) => inside(c.x + (dx * a + nx * b) / asp, c.y + dy * a + ny * b);
    P.push(pt(0, 0.03), pt(0.2, 0.07), pt(0.3, 0.2), pt(0.22, 0.28), pt(0.2, 0.12), pt(0.12, 0.04));
  }
  // dans le monde : devant le mur, à sa distance de vol ; le départ dans le sens de son vol (ou de sa tête)
  const pts = [guide.pos.clone()];
  if (guide.vel.lengthSq() > 0.04) pts.push(guide.pos.clone().addScaledVector(guide.vel, 0.4));
  else pts.push(guide.pos.clone().addScaledVector(guide.head, 0.35));   // juste envolé : d'abord droit devant lui
  // à chaque point, il s'approche du mur ou s'en éloigne (d'au moins un tiers de l'écart permis) : il ne vole pas
  // toujours à la même distance
  const [lo, hi] = R.alt, base = G.alt;
  let alt = THREE.MathUtils.clamp(guideDepth() - _gp.subVectors(guide.pos, camera.position).dot(camera.getWorldDirection(_gd)), lo, hi);
  for (const [x, y] of P) {
    const far = alt < (lo + hi) / 2 ? Math.random() < 0.75 : Math.random() < 0.25;   // plutôt vers l'autre bout
    alt = far ? rand(Math.min(hi, alt + (hi - lo) / 3), hi) : rand(lo, Math.max(lo, alt - (hi - lo) / 3));
    G.alt = alt;
    pts.push(airPoint(x, y, new THREE.Vector3()));
  }
  G.alt = base;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  G.route = { kind, curve, len: Math.max(0.05, curve.getLength()), u: 0, speed: R.speed, site, ...extra };
  if (R.w > 0) G.recent = [kind, ...G.recent].slice(0, 2);
  G.spot = null;
}
// il a choisi un perchoir : d'abord, souvent, un ou deux passages au-dessus ; sinon, il y va
// le perchoir n'est pas devant lui (à plus de ~70° de sa direction de vol) : se poser là, ce serait reculer
function siteBehind(site) {
  const s = siteAt(site);
  if (!s) return false;
  const me = onScreen(guide), dx = (s.x - me.x) * me.asp, dy = s.y - me.y;
  return dx * me.hx + dy * me.hy < 0.35 * Math.hypot(dx, dy);
}
function decideLand(site, t, first) {
  G.scrollY = window.scrollY;
  if (first) G.sawEnd = true;
  // derrière lui, il ne fait pas de crochet : il passe d'abord au-dessus, et revient face à lui
  if (siteBehind(site) || Math.random() < LAND.inspect) planRoute(t, 'inspect', site, { first, passes: Math.random() < LAND.again ? 2 : 1 });
  else landOn(site, t, first);
}
// la fuite : à l'opposé du curseur, vite, un moment
function startFlee(t) {
  G.fly = 'flee';
  G.route = null;
  G.until = t + rand(...BEHAVE.flee);
  G.alt = rand(...GUIDE.alt);
}
function landOn(site, t, first = false) {
  G.scrollY = window.scrollY;                       // la page où il a choisi de se poser : si elle repart, il renonce
  G.mode = 'land'; G.site = site; G.since = t; G.last = site.kind === 'word' ? site.id : null; G.first = first;
  // contre le mur, la tête vers le haut, un peu penchée du côté d'où il arrive (pas de pivot au contact)
  _wx.setFromMatrixColumn(camera.matrixWorld, 0);
  G.wall = THREE.MathUtils.clamp(-0.4 * guide.vel.dot(_wx), -BEHAVE.tilt, BEHAVE.tilt) + rand(-0.15, 0.15);
  G.route = null;
  G.path = { u: 0, from: guide.pos.clone(), dir: guide.vel.lengthSq() > 1e-4 ? guide.vel.clone().normalize()
    : new THREE.Vector3(0, 1, 0), len: 1 };
}
function touchDown(t) {
  G.mode = 'perch';
  G.touch = t;
  G.timer = rand(...(G.first ? BEHAVE.first : BEHAVE.rest));
  // contre le mur, on voit ses ailes ouvertes ; fermées, on ne verrait que leur tranche : plus rare
  G.posture = Math.random() < 0.6 ? 'open' : Math.random() < 0.8 ? 'vee' : 'closed';
  G.nextAct = t + rand(...BEHAVE.act);
  G.step.set(0, 0); G.stepTo.set(0, 0); G.flick = 0;
  G.wake = null;
}
function takeOff(t, from = null) {
  G.mode = 'free';
  G.site = null;
  G.liftoff = t;                                    // il se relève de la page en quittant son perchoir
  G.clap = t + GESTURE.clap;                        // d'abord, il claque les ailes, encore posé
  G.clapAt.copy(guide.pos);
  // il ne part pas lancé : ses battements le soulèvent d'abord (guideStep, GESTURE.lift)
  _wy.subVectors(camera.position, guide.pos).normalize();
  guide.vel.copy(_wy).multiplyScalar(0.05);
  G.route = null;
  if (from) {                                       // effrayé : il s'en ira à l'opposé du curseur
    startFlee(t);
    screenDir(from.dx, from.dy, G.fleeDir).addScaledVector(_wy, 0.3).normalize();
  } else G.fly = 'free';                            // son trajet se décidera une fois envolé
}
// la courbe d'approche : elle part dans sa direction de vol, et descend en arc vers son point de pose, où il arrive
// de biais, par au-dessus (une courbe de Bézier, recalculée à chaque image : le point de pose défile avec la page)
const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _end = new THREE.Vector3();
function approach(u, out) {
  const L = G.path.len;
  _p1.copy(G.path.from).addScaledVector(G.path.dir, L * 0.35);
  camera.getWorldDirection(_gp).negate();           // devant le mur : vers la caméra
  _p2.copy(_end).addScaledVector(_gp, Math.min(0.45, L * 0.35)).lerp(G.path.from, 0.12);
  const a = 1 - u;
  return out.copy(G.path.from).multiplyScalar(a * a * a).addScaledVector(_p1, 3 * a * a * u)
    .addScaledVector(_p2, 3 * a * u * u).addScaledVector(_end, u * u * u);
}
// posé : un geste de temps en temps
function perchLife(t, dt, s) {
  if (G.wake !== null) {                            // il se réveille : il ouvre et referme lentement les ailes
    const k = (t - G.wake) / BEHAVE.wake.beat;
    G.restA = BEHAVE.postures.open + (BEHAVE.postures.closed - 0.2) * (0.5 - 0.5 * Math.cos(2 * Math.PI * k));
    s.x += G.step.x / (window.innerWidth / window.innerHeight);
    s.y += G.step.y;
    return;
  }
  if (t >= G.nextAct) {
    G.nextAct = t + rand(...BEHAVE.act);
    const r = Math.random();
    if (r < 0.45) {                                 // une autre posture
      const others = Object.keys(BEHAVE.postures).filter((k) => k !== G.posture);
      G.posture = others[(Math.random() * others.length) | 0];
    } else if (r < 0.65) {                          // il pivote un peu, sur place (la tête reste vers le haut)
      G.wall = THREE.MathUtils.clamp(G.wall + (Math.random() < 0.5 ? -1 : 1) * rand(0.25, 0.7), -BEHAVE.tilt, BEHAVE.tilt);
    }
    else if (r < 0.85) {                            // quelques pas, droit devant lui
      const d = rand(0.01, 0.03), a = G.wall;
      G.stepTo.x += -Math.sin(a) * d; G.stepTo.y += -Math.cos(a) * d;
      G.posture = G.posture === 'open' ? 'vee' : G.posture;   // il marche les ailes à demi levées
    } else G.flick = t + 0.7;                       // un battement vif, un instant
  }
  G.step.lerp(G.stepTo, 1 - Math.exp(-dt * 3));     // il marche à petits pas
  s.x += G.step.x / (window.innerWidth / window.innerHeight);
  s.y += G.step.y;
  // juste posé, il garde les ailes fermées un instant ; ensuite sa posture, qui frémit à peine
  G.restA = t - G.touch < GESTURE.shut ? 1.35 : t < G.flick ? 0.1 + 0.9 * Math.abs(Math.sin(t * 15))
    : BEHAVE.postures[G.posture] + GESTURE.tremble * (Math.sin(t * 2.3) + 0.6 * Math.sin(t * 5.7 + 1));
}
// ce qu'il veut, à l'instant
function guideThink(t, dt) {
  const P = course?.LIFT ? THREE.MathUtils.clamp(flyS / course.LIFT, 0, 1) : 0;
  if (G.mode === 'home') {
    if (P > 0.05) { G.mode = 'free'; G.fly = 'free'; G.route = null; G.spot = null; }
    return;
  }
  if (P < 0.03 && exitK === 0) { G.mode = 'home'; G.site = null; return; }   // revenu à l'îlot : il rentre
  const reading = window.hsPage?.reading() ?? null;
  if (G.mode === 'perch') {
    const s = siteAt(G.site);
    G.timer -= dt;
    // la page part brusquement sous lui : il s'envole, effrayé (du côté où elle file, un peu de biais)
    if (jolted() && t - G.touch > 0.5) { scrolling.jolt = -9; takeOff(t, { dx: rand(-0.6, 0.6), dy: scrolling.dir }); return; }
    // on reprend la lecture plus loin : il s'envole, tranquillement
    if (scrolledSince()) { takeOff(t); return; }
    // son perchoir va quitter l'écran : il repart ; il en a assez : il repart (s'il est resté longtemps, après s'être
    // réveillé) ; le curseur approche vivement : il s'enfuit
    if (!s || s.y < 0.1 || s.y > 0.93) { takeOff(t); return; }
    if (G.timer <= 0) {
      if (G.wake === null && t - G.touch > BEHAVE.wake.after) { G.wake = t; G.timer = rand(...BEHAVE.wake.dur); }
      else { takeOff(t); return; }
    }
    const scare = mouse.speed > BEHAVE.scare && cursorNear({ x: s.x, y: s.y, asp: window.innerWidth / window.innerHeight }, BEHAVE.startle);
    if (scare) { takeOff(t, scare); return; }
    perchLife(t, dt, s);
    siteWorld(s, G.target);
    return;
  }
  if (G.mode === 'land') {
    const s = siteAt(G.site);
    const late = t - G.since > GUIDE.catchUp + (2 * G.path.len) / PATH_LAND.touch;   // il n'y arrive pas (la page file)
    if (!siteOk(s) || late || scrolledSince()) {
      if (G.first) G.sawEnd = false;                // le dernier mot : il y retournera à la prochaine pause
      // (il ne renonce que si on défile, si le perchoir quitte l'écran, ou s'il ne peut vraiment pas le rattraper)
      G.mode = 'free'; planRoute(t, 'hop');
    }
    else {
      siteWorld(s, _end);
      G.path.len = Math.max(0.2, G.path.from.distanceTo(_end));
      approach(Math.min(1, G.path.u + 0.05), G.target);   // un peu en avance sur la courbe
      return;
    }
  }
  // en vol. La fuite : à l'opposé du curseur, vite, un moment
  if (G.fly === 'flee') {
    if (t < G.until) { G.target.copy(guide.pos).addScaledVector(G.fleeDir, 2); return; }
    G.fly = 'free';
  }
  // parmi les objets, ou encore loin de la page (on a défilé vite) : vers un point au hasard, changé de temps en temps
  if (nearPage() < 0.99 || guideLag() > CATCH.late[1]) {
    G.route = null;
    if (!G.spot || t > G.spotAt || _gp.subVectors(G.target, guide.pos).length() < 0.3) {
      G.spot = [rand(0.2, 0.8), rand(0.3, 0.7)];
      G.spotAt = t + rand(2, 5);
      G.alt = rand(...GUIDE.alt);
    }
    airPoint(G.spot[0], G.spot[1], G.target);
    return;
  }
  // dehors, en sortie : il attend, invisible, puis revient par un autre bord (on ne le voit pas changer de bord)
  if (G.fly === 'away' && G.away?.phase === 'outside') {
    // on s'est mis à lire : il ne tarde plus (mais reste dehors au moins le minimum)
    if (readFor() > 4 && !G.away.soon) {
      G.away.soon = true;
      G.away.back = Math.min(G.away.back, Math.max(G.away.since + LAND.out[0], t + rand(0.5, 2.5)));
    }
    if (t < G.away.back) { airPoint(...G.away.door, G.target); return; }
    const edges = [0, 1, 2, 3].filter((e) => e !== G.away.edge), e = edges[(Math.random() * edges.length) | 0];
    const door = doorOn(e, rand(0.25, 0.75));
    G.alt = rand(...ROUTES.enter.alt);
    airPoint(...door, guide.pos);
    screenDir(0.5 - door[0], door[1] - 0.5, guide.vel).multiplyScalar(0.6);
    G.away = { phase: 'in', edge: e, door, back: 0 };
    planRoute(t, 'enter');
  }
  if (!G.route) planRoute(t, pickRoute());
  // il suit son trajet, à son allure, sans laisser son but filer devant lui
  const R = G.route, lag = _gp.subVectors(G.target, guide.pos).length();
  const lead = 0.15 + 0.25 * R.speed;               // son but, un peu devant lui sur la courbe
  R.u = Math.min(1, R.u + (R.speed * (1 - smooth(lead + 0.1, lead + 0.6, lag)) * dt) / R.len);
  R.curve.getPointAt(Math.min(1, R.u + lead / R.len), G.target);
  // sa distance au mur, celle de son but sur le trajet (elle varie le long du trajet)
  G.alt = Math.max(0, guideDepth() - _gp.subVectors(G.target, camera.position).dot(camera.getWorldDirection(_gd)));
  // fini quand il est vraiment arrivé au bout (pas seulement son but) : sinon il est encore dans son virage
  const done = R.u >= 1 && guide.pos.distanceTo(R.curve.points[R.curve.points.length - 1]) < 0.3;
  // le texte : se poser, d'abord sur le dernier mot (une fois par passage du texte), seulement si on lit
  const read = readFor(), canLand = pageReady() && read >= LAND.read[0];
  if (!reading) G.sawEnd = false;                   // le texte reviendra : il ira de nouveau au dernier mot
  const endP = reading && !G.sawEnd ? (window.hsPage?.perches() ?? []).find((p) => p.last) : null;
  const end = endP && inView(endP) ? { kind: 'word', id: endP.id, x: endP.x, y: endP.yc } : null;
  if (R.kind === 'inspect') {                        // en inspection : on défile, il renonce ; au bout, il se décide
    if (scrolledSince() || !siteOk(siteAt(R.site))) {
      if (R.first) G.sawEnd = false;
      planRoute(t, pickRoute());
    } else if (done) {
      // décidé : il s'y pose (il ne change pas d'avis) — face à lui ; si le perchoir est encore derrière lui, il refait
      // un passage pour revenir face à lui (deux fois au plus), plutôt que de reculer vers lui
      const again = R.passes > 1 || (siteBehind(R.site) && (R.retry ?? 0) < 2);
      if (again) planRoute(t, 'inspect', R.site, { first: R.first, passes: Math.max(1, R.passes - 1), retry: (R.retry ?? 0) + (R.passes > 1 ? 0 : 1) });
      else landOn(R.site, t, R.first);
    }
    return;
  }
  const free = R.kind !== 'away' && R.kind !== 'enter';
  // on lit : le dernier mot l'attire tout de suite ; ailleurs, il abrège parfois son trajet, d'autant plus qu'on lit
  // depuis longtemps
  if (canLand && free && end && siteOk(end)) { decideLand(end, t, true); return; }
  if (canLand && free && R.u > 0.35 && Math.random() < dt * LAND.early * smooth(LAND.read[0], LAND.read[1], read)) {
    const site = chooseSite(guide, PATH_LAND.reach);
    if (site) { decideLand(site, t, false); return; }
  }
  if (!done) return;
  // la fin du trajet : la sortie se poursuit dehors ; sinon, se poser si on lit (de plus en plus volontiers), ou un
  // autre trajet
  if (R.kind === 'away') { Object.assign(G.away, { phase: 'outside', since: t, back: t + rand(...LAND.out) }); return; }
  if (canLand && Math.random() < landChance(read)) {
    const site = chooseSite(guide, PATH_LAND.reach);
    if (site) { decideLand(site, t, false); return; }
  }
  planRoute(t, pickRoute());
}
// un pas de vol vers son but : comme flyStep, en contournant les objets et en restant à l'écran. Près de la page, il
// vole plus lentement et plus souplement ; à l'approche, il suit sa courbe en ralentissant jusqu'au contact.
function guideStep(f, t, h) {
  const landing = G.mode === 'land', near = nearPage();
  if (landing) {                                    // il avance sur sa courbe, de moins en moins vite
    const v = THREE.MathUtils.lerp(PATH_LAND.speed, PATH_LAND.touch, smooth(0.6, 1, G.path.u));
    G.path.u = Math.min(1, G.path.u + (v * h) / G.path.len);
    approach(Math.min(1, G.path.u + 0.05), G.target);
  }
  // au départ : d'abord il s'élève de la page en battant des ailes, presque sur place
  const since = t - G.liftoff, lifting = since < GESTURE.clap + GESTURE.lift;
  const late = landing || lifting ? 0 : catching();   // en retard : il pique vers la page
  if (lifting) {
    camera.getWorldDirection(_gp).negate();         // devant le mur : vers la caméra
    G.target.copy(G.clapAt).addScaledVector(_gp, GESTURE.climb);
  }
  const dist = _gd.subVectors(G.target, f.pos).length();
  const w = landing ? 4.5 : THREE.MathUtils.lerp(GUIDE.omega, PATH_LAND.omega, near);
  _acc.copy(_gd).multiplyScalar(w * w).addScaledVector(f.vel, -2 * GUIDE.zeta * w);
  // vol erratique, qui s'apaise à l'approche du perchoir
  const k = (f.gliding ? 0.3 : 1) * (landing ? 0.25 * (1 - G.path.u) : 1), [kh, kv] = GUIDE.wander;
  const wx = k * kh * (Math.sin(t * 0.7 + f.ph * 3) + 0.5 * Math.sin(t * 1.13 + f.ph));
  const wz = k * kh * 0.5 * (Math.sin(t * 0.83 + f.ph * 7) + 0.5 * Math.sin(t * 1.29 + f.ph * 4));
  const wy = k * kv * (Math.sin(t * 2.6 + f.ph * 5) + 0.5 * Math.sin(t * 4.3 + f.ph * 2));
  // parmi les objets : de côté et en hauteur, dans le monde. Devant le mur : en hauteur, il monte et descend le long du
  // mur ; de côté, il ondule le long du mur, et à peine vers lui ou vers nous
  _acc.x += wx * (1 - near); _acc.z += wz * (1 - near); _acc.y += wy * (1 - near);
  if (near > 0) {
    camera.getWorldDirection(_gp).negate();
    _wx.setFromMatrixColumn(camera.matrixWorld, 0);
    _wz.setFromMatrixColumn(camera.matrixWorld, 1);
    _acc.addScaledVector(_wz, wy * 0.8 * near).addScaledVector(_wx, wx * 0.45 * near).addScaledVector(_gp, wz * 0.25 * near);
  }
  if (f.gliding && !landing && !late) _acc.y -= FLIGHT.sink;
  // il contourne les objets qui volent : éviter passe avant son but (qui s'efface d'autant)
  _ga.set(0, 0, 0);
  for (const l of lifters) {
    if (!l.cw || !l.obj.visible) continue;
    _gp.copy(f.pos).addScaledVector(f.vel, GUIDE.ahead).sub(l.cw);   // là où il sera dans un instant
    const R = l.r + GUIDE.avoid, d = _gp.length();
    if (d < R && d > 1e-4) _ga.addScaledVector(_gp, (40 * (R - d)) / d);
  }
  const evade = Math.min(1, _ga.length() / GUIDE.accel);
  if (evade > 0) _acc.multiplyScalar(1 - evade).add(_ga);
  // il reste à l'écran (sauf en escapade) : poussé vers le milieu quand il approche d'un bord
  if (!landing && G.fly !== 'away' && G.fly !== 'enter') {
    _gp.copy(f.pos).project(camera);
    const sx = (_gp.x + 1) / 2, sy = (1 - _gp.y) / 2, [x0, y0, x1, y1] = GUIDE.view;
    const out = Math.max(x0 - sx, sx - x1, y0 - sy, sy - y1, 0);
    if (out > 0) _acc.addScaledVector(screenToWorld(0.5, 0.5, guideDepth(), _gp).sub(f.pos), 2 + 30 * out);
  }
  // puis il prend de la vitesse peu à peu
  const amax = THREE.MathUtils.lerp(GUIDE.accel, WALL_FLY.accel, near) * (1 + evade) * (since < GESTURE.ramp + GESTURE.lift ? 0.25 + 0.75 * smooth(GESTURE.lift, GESTURE.lift + GESTURE.ramp, since) : 1);
  if (_acc.length() > amax) _acc.setLength(amax);
  f.vel.addScaledVector(_acc, h);
  // la vitesse : en croisière près de la page, calme ; à l'approche, celle de sa courbe ; en fuite, plus vive ; dehors,
  // il peut se presser (on ne le voit pas) ; en retard sur la page, il pique vers elle (et ralentit en la rejoignant)
  const cruise = THREE.MathUtils.lerp(GUIDE.vmax, G.route ? G.route.speed * 1.25 : PATH_LAND.cruise, near);
  const me = G.fly === 'away' ? onScreen(f) : null;   // dehors pour de vrai : là seulement, il peut se presser
  const outside = !!me && G.away?.phase === 'outside' && (me.x < -0.03 || me.x > 1.03 || me.y < -0.03 || me.y > 1.03);
  const vmax = lifting ? 0.35 : landing ? PATH_LAND.speed * 1.4 : G.fly === 'flee' ? BEHAVE.fleeSpeed
    : outside ? Math.max(GUIDE.vmax, G.route?.speed ?? 0) * 1.5 : Math.max(cruise * (1 + 0.5 * evade), CATCH.dive * late);
  // devant le mur, jamais à reculons : à l'horizontale (le long du mur, vers lui ou vers nous), sa vitesse reste dans
  // l'axe de sa tête, à un dérapage près — c'est sa tête qui tourne et l'entraîne. Monter ou descendre n'a pas de cap.
  // Pas en s'élevant
  if (near > 0.5 && !lifting) {
    _wx.setFromMatrixColumn(camera.matrixWorld, 0);
    camera.getWorldDirection(_wz).negate();
    const vx = f.vel.dot(_wx), vy = f.vel.dot(_wz), fx = f.head.dot(_wx), fy = f.head.dot(_wz);
    const vs = Math.hypot(vx, vy), fs = Math.hypot(fx, fy);
    if (vs > 0.15 && fs > 0.5) {
      const a = Math.atan2(fx * vy - fy * vx, fx * vx + fy * vy);
      if (Math.abs(a) > WALL_FLY.slip) {
        const b = Math.atan2(fy, fx) + Math.sign(a) * WALL_FLY.slip;
        const k = vs * Math.max(0.35, Math.cos(Math.abs(a) - WALL_FLY.slip));   // il freine plutôt que de déraper
        f.vel.addScaledVector(_wx, Math.cos(b) * k - vx).addScaledVector(_wz, Math.sin(b) * k - vy);
      }
    }
  }
  const sp = f.vel.length();
  if (sp > vmax) f.vel.multiplyScalar(vmax / sp);
  else if (!landing && !lifting && sp < FLIGHT.vmin) f.vel.addScaledVector(f.head, FLIGHT.vmin - sp);
  f.pos.addScaledVector(f.vel, h);
  f.acc.copy(_acc);
  G.dist = landing ? _gd.subVectors(_end, f.pos).length() : dist;
  // posé : au bout de sa courbe, au contact
  if (landing && G.path.u >= 1 && G.dist < 0.05) { touchDown(t); f.vel.set(0, 0, 0); }
}
// posé : à plat sur son perchoir (qui part avec la page), le dos vers nous ; il n'en bouge pas d'un pixel (sauf quand
// il marche) ; il pivote en douceur
function perchPose(f, dt) {
  f.pos.copy(G.target);                             // collé à son perchoir : exactement là, à chaque image
  f.root.position.copy(f.pos);
  const t = uTime.value, sway = GESTURE.sway * (Math.sin(t * 0.9) + 0.5 * Math.sin(t * 2.1 + 2));   // il bouge à peine
  f.root.quaternion.slerp(wallQuat(f.pos, G.wall + sway, _gq), 1 - Math.exp(-dt * 2.5));
  G.flat.copy(f.root.quaternion);
  // au contact, il se tasse un peu contre la page, puis se redresse (le long de son dos : vers nous)
  const k = (t - G.touch) / GESTURE.squash[1], sc = guideScale();
  f.root.scale.set(sc, sc * (k < 1 ? 1 - GESTURE.squash[0] * Math.sin(Math.PI * k) : 1), sc);
  f.flap(dt, 0, 0, 1, G.restA ?? null);
}

// son ombre sur le mur : à chaque image, sa silhouette vue de la lumière (ailes comprises, telles qu'elles battent)
// est dessinée dans une petite image (shadowRT), puis posée sur le mur, à l'endroit où la lumière la projette. Au
// contact, elle est collée à lui, nette et sombre ; quand il s'écarte du mur, elle descend sous lui, grandit,
// s'adoucit (mipmaps) et pâlit : c'est ce qui fait voir sa distance au mur. La lumière vient d'en haut, un peu de
// gauche, du côté de la caméra : l'ombre tombe sous lui, un peu à droite. [taille de l'image (px), direction de la lumière (vers la droite, vers le haut de l'écran : sa pente
// par rapport à la page), force au contact, hauteur où elle a perdu les deux tiers de sa force (m), flou (niveaux de
// mipmap par m), agrandissement (par m), teinte]
const SHADOW = { px: 128, light: [-0.15, 0.6], strength: 0.4, fade: 1.1, blur: 3.5, grow: 0.3, color: [0.1, 0.11, 0.18] };
const SHADOW_LAYER = 8, SHADOW_EYE = 2;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW.px, SHADOW.px, {
  generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
const shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
shadowCam.layers.set(SHADOW_LAYER);
// sa silhouette : blanche, découpée comme ses ailes (leur image peinte porte leur contour dans son alpha)
const silhouette = (map) => new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: { map: { value: map } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: map ? `uniform sampler2D map; varying vec2 vUv;
    void main() { if ( texture2D( map, vUv ).a < 0.5 ) discard; gl_FragColor = vec4( 1.0 ); }`
    : `void main() { gl_FragColor = vec4( 1.0 ); }`,
});
const shadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, toneMapped: false,  // derrière lui : il la recouvre (test de profondeur)
  uniforms: { uMap: { value: shadowRT.texture }, uLod: { value: 0 }, uAlpha: { value: 0 },
    uColor: { value: new THREE.Vector3(...SHADOW.color) } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform sampler2D uMap; uniform float uLod, uAlpha; uniform vec3 uColor; varying vec2 vUv;
    void main() { float a = textureLod( uMap, vUv, uLod ).r * uAlpha; if ( a < 0.002 ) discard; gl_FragColor = vec4( uColor * a, a ); }`,
}));
shadowQuad.frustumCulled = false;
shadowQuad.renderOrder = 5;
shadowQuad.visible = false;
scene.add(shadowQuad);
const _sn = new THREE.Vector3(), _su = new THREE.Vector3(), _sr = new THREE.Vector3(), _sl = new THREE.Vector3();
const _shear = new THREE.Matrix4();
function updateGuideShadow() {
  const on = !!guide && G.mode !== 'home' && nearPage() > 0.05;
  shadowQuad.visible = on;
  if (!on) return;
  if (!guide.sil) {                                 // une fois : ses pièces dans le calque de l'ombre, leur silhouette
    guide.sil = [];
    guide.root.traverse((c) => {
      if (!c.isMesh) return;
      c.layers.enable(SHADOW_LAYER);
      guide.sil.push([c, silhouette(c.material.map ?? null)]);
    });
  }
  const p = guide.pos;
  camera.getWorldDirection(_sn).negate();           // la normale de la page : vers la caméra
  _su.setFromMatrixColumn(camera.matrixWorld, 1);   // le haut et la droite de l'écran
  _sr.setFromMatrixColumn(camera.matrixWorld, 0);
  _sl.copy(_sn).addScaledVector(_sr, SHADOW.light[0]).addScaledVector(_su, SHADOW.light[1]).normalize();   // vers la lumière
  // sa distance au mur, et son ombre : sur le mur, à l'opposé de la lumière
  const h = Math.max(0, guideDepth() - _gp.subVectors(p, camera.position).dot(_sn.clone().negate()));
  shadowQuad.position.copy(p).addScaledVector(_sl, -h / _sl.dot(_sn)).addScaledVector(_sn, -0.03);   // un rien sous lui
  // sa silhouette projetée sur la page, dans l'image de l'ombre : vue d'en face (dans le plan de la page), chaque
  // point décalé dans le sens de la lumière selon sa hauteur au-dessus de lui (projection oblique : un cisaillement)
  const e = BUTTERFLY.span * guideScale() * 0.75;
  Object.assign(shadowCam, { left: -e, right: e, top: e, bottom: -e });
  shadowCam.updateProjectionMatrix();
  const ln = _sl.dot(_sn);
  // (la hauteur se compte depuis le papillon, à SHADOW_EYE m devant la caméra de l'ombre)
  const cx = _sl.dot(_sr) / -ln, cy = _sl.dot(_su) / -ln;
  _shear.set(1, 0, cx, cx * SHADOW_EYE, 0, 1, cy, cy * SHADOW_EYE, 0, 0, 1, 0, 0, 0, 0, 1);
  shadowCam.projectionMatrix.multiply(_shear);
  shadowCam.projectionMatrixInverse.copy(shadowCam.projectionMatrix).invert();
  shadowCam.position.copy(p).addScaledVector(_sn, SHADOW_EYE);
  shadowCam.up.copy(_su);
  shadowCam.lookAt(p);
  shadowCam.updateMatrixWorld();
  const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
  const autoShadow = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;
  for (const it of guide.sil) { const [c, m] = it; it[2] = c.material; c.material = m; }
  renderer.setRenderTarget(shadowRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, shadowCam);
  for (const [c, , m] of guide.sil) c.material = m;
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearA);
  renderer.shadowMap.autoUpdate = autoShadow;
  // posée à plat sur le mur, plus grande, plus floue et plus pâle quand il s'en écarte
  shadowQuad.quaternion.setFromRotationMatrix(_m.makeBasis(_sr, _su, _sn));
  shadowQuad.scale.setScalar(2 * e * (1 + SHADOW.grow * h));
  shadowQuad.material.uniforms.uLod.value = Math.min(5, h * SHADOW.blur);
  shadowQuad.material.uniforms.uAlpha.value = SHADOW.strength * Math.exp(-h / SHADOW.fade) * nearPage();
}

// Devant le mur, le guide vole comme les autres, mais dans le repère du mur : son haut est le haut de l'écran (le
// mur est face à la caméra, qui plonge un peu sur l'îlot), son cap se prend à l'horizontale du mur — de côté, vers
// nous, vers le mur. On le voit donc de face, de profil, de trois quarts, jamais de dessus ; monter ou descendre à
// l'écran, c'est monter ou descendre, sans changer de cap. wallFrame : la rotation du monde vers ce repère, en part
// `k` (0 : le monde, 1 : le mur).
// [vitesse à l'horizontale (m/s) en deçà de laquelle il garde son cap ; dérapage max de sa vitesse par rapport à sa
//  tête (rad) ; accélération max devant le mur (m/s²)]
const WALL_FLY = { hold: 0.15, slip: 0.6, accel: 14 };
const _pn = new THREE.Vector3(), _wq = new THREE.Quaternion(), _wqi = new THREE.Quaternion(), _wqf = new THREE.Quaternion();
const _lv = new THREE.Vector3(), _la = new THREE.Vector3();
function wallFrame(k, out) {
  _pn.setFromMatrixColumn(camera.matrixWorld, 1);   // le haut de l'écran
  _wqf.setFromUnitVectors(UP, _pn);
  return out.identity().slerp(_wqf, k);
}

function updateButterflies(t, dt) {
  for (const f of flyers) {
    // le vide a repris l'îlot : seuls le guide reste
    if (f !== guide) { f.root.visible = exitK < 1; if (!f.root.visible) continue; }
    if (f === guide) guideThink(t, dt);             // il décide, même chez lui (quand partir)
    const guided = f === guide && G.mode !== 'home';
    if (guided && G.mode === 'perch') { perchPose(f, dt); continue; }
    if (guided && t < G.clap) {                     // le claquement : encore posé, ailes refermées d'un coup
      f.pos.copy(G.clapAt);
      f.root.position.copy(f.pos);
      f.flap(dt, 0, 0, 1, 1.5, true);
      continue;
    }
    if (!f.started) {                               // premier pas : il part de sa boucle, déjà lancé
      homeAt(f, t, f.pos);
      homeAt(f, t + 0.1, _tgt);
      f.vel.subVectors(_tgt, f.pos).multiplyScalar(10);
      f.started = true;
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));    // pas fixes : le même vol quelle que soit la cadence
    for (let i = 0; i < n; i++) {
      const ti = t - dt + ((i + 1) * dt) / n;
      if (guided) { f.u = null; guideStep(f, ti, dt / n); if (G.mode === 'perch') break; } else flyStep(f, ti, dt / n);
    }
    if (guided && G.mode === 'perch') { perchPose(f, dt); continue; }
    // le guide près du mur : son haut est celui du mur (le haut de l'écran), il vole dans le repère du mur ; ailleurs,
    // dans celui du monde (on passe de l'un à l'autre en approchant du texte)
    const pg = guided ? nearPage() : 0;
    if (pg > 0) wallFrame(pg, _wq); else _wq.identity();
    _wqi.copy(_wq).invert();
    _lv.copy(f.vel).applyQuaternion(_wqi);
    _la.copy(f.acc).applyQuaternion(_wqi);
    // le cap : vers sa vitesse à l'horizontale, en tournant à vitesse limitée
    _hv.set(_lv.x, 0, _lv.z);
    const yawWanted = _hv.lengthSq() > (pg > 0 ? WALL_FLY.hold ** 2 : 1e-6) ? Math.atan2(_hv.x, _hv.z) : f.yaw;
    let dy = yawWanted - f.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    // devant le mur, un demi-tour se fait face à nous, jamais le nez dans le mur
    if (pg > 0.5 && Math.abs(dy) > 2.4) {
      _pn.set(0, 0, 1).applyQuaternion(camera.quaternion).applyQuaternion(_wqi);   // vers nous, dans son repère
      const s = Math.sign(dy);
      if (Math.sin(f.yaw + s * Math.PI / 2) * _pn.x + Math.cos(f.yaw + s * Math.PI / 2) * _pn.z < 0) dy -= s * 2 * Math.PI;
    }
    const maxTurn = FLIGHT.yawRate * dt;
    const turn = THREE.MathUtils.clamp(dy, -maxTurn, maxTurn);
    f.yaw += turn;
    f.head.set(Math.sin(f.yaw), 0, Math.cos(f.yaw));
    const yawRate = turn / Math.max(dt, 1e-3);
    const climb = _lv.y;
    // planer : en vol rapide, à peu près droit et sans monter ; il reprend ses battements pour monter ou tourner
    const speed = f.vel.length();
    f.timer -= dt;
    if (f.gliding) {
      if (f.timer <= 0 || climb > 0.35 || Math.abs(yawRate) > 2.2) { f.gliding = false; f.timer = rand(...FLIGHT.rest); }
    } else if (f.timer <= 0 && speed > 0.45 && climb < 0.1 && Math.abs(yawRate) < 0.9 && Math.random() < dt * 1.2) {
      f.gliding = true;
      f.timer = rand(...FLIGHT.glide);
    }
    let effort = THREE.MathUtils.clamp(0.35 + climb * 0.8 + Math.abs(yawRate) * 0.15, 0, 1);
    if (guided && t - G.liftoff < GESTURE.burst) effort = 1;   // ses premiers battements, amples et vifs
    // en piqué vers la page : il plane, ailes tendues, avec de brèves reprises de battements, légers
    const late = guided && G.mode === 'free' && t - G.liftoff > GESTURE.burst ? catching() : 0;
    if (late > 0.3) {
      f.gliding = ((t + f.ph) % 1) > CATCH.beat;
      effort = Math.min(effort, 0.3);
      f.dived = true;
    } else if (f.dived) {                            // arrivé : il reprend son vol ordinaire, sans finir son plané
      f.dived = false;
      f.gliding = false;
      f.timer = rand(...FLIGHT.rest);
    }
    // penché dans les virages (accélération de côté), cabré un peu, plus en montée
    const side = _la.x * f.head.z - _la.z * f.head.x;
    f.bank += (THREE.MathUtils.clamp(-side * 0.1, -0.55, 0.55) - f.bank) * (1 - Math.exp(-dt * 5));
    const pitchUp = 0.24 + THREE.MathUtils.clamp(climb * 0.35, -0.2, 0.3);
    f.pitch += (pitchUp - f.pitch) * (1 - Math.exp(-dt * 4));
    f.root.position.copy(f.pos);
    f.root.rotation.set(0, 0, 0);
    f.root.rotateY(f.yaw);
    f.root.rotateX(-f.pitch);
    f.root.rotateZ(f.bank);
    // en excursion, il se penche vers l'écran : on voit le dessus de ses ailes, pas sa tranche
    const show = guided || f.u === null ? 0 : Math.sin(Math.PI * f.u) * 0.9;
    if (show > 0) {
      _look.subVectors(camera.position, f.pos).normalize();
      _m.makeRotationFromQuaternion(f.root.quaternion);
      _bx.setFromMatrixColumn(_m, 0);                // sa droite
      _bz.setFromMatrixColumn(_m, 2);                // l'avant
      f.root.rotateZ(-show * _look.dot(_bx));
      f.root.rotateX(show * _look.dot(_bz));
    }
    // son attitude et son cap, du repère du mur à celui du monde
    f.root.quaternion.premultiply(_wq);
    f.head.applyQuaternion(_wq);
    if (guided && G.mode === 'land') {               // à l'approche, il se redresse peu à peu contre le mur
      f.root.quaternion.slerp(wallQuat(f.pos, G.wall, _gq), smooth(0, 1, 1 - G.dist / GUIDE.settle));
      // il freine en se cabrant, en battant plus fort ; au contact, il est à plat contre le mur
      const fl = smooth(0, 1, 1 - G.dist / GESTURE.flare) * (1 - smooth(0.9, 1, G.path.u));
      f.root.rotateX(-GESTURE.pitch * fl);
      effort = Math.max(effort, 0.6 + 0.4 * fl);
      f.gliding = false;
    } else if (guided && t - G.liftoff < GUIDE.rise) {   // au départ, il s'en relève
      f.root.quaternion.slerp(G.flat, 1 - smooth(0, 1, (t - G.liftoff) / GUIDE.rise));
    }
    if (f === guide) f.root.scale.setScalar(guided ? guideScale() : 1);
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
  if (t >= nextEscape && uExit.value > 1e4) {
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
  if (t >= nextGust && !gust && uExit.value > 1e4) {
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
    const m = makeBee(BEE.length, voidify);        // elles retournent au vide avec l'îlot
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
  const on = t > lifeAt && exitK < 1;             // reparties avec l'îlot
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

// ------------------------------------------------------------ LÉVITATION des objets, au défilement
// Au début de la course (js/apropos.js : LIFT écrans), les objets des services quittent le sol d'eux-mêmes, l'un
// après l'autre : les légers d'abord, les lourds ensuite (rang selon leur volume). Chacun fait un seul trajet, de sa
// place au sol jusqu'au-dessus de l'écran : il monte, s'écarte un peu vers l'extérieur de l'îlot et tourne lentement
// sur lui-même, sur un axe qui lui est propre — sa rotation ne prend de l'ampleur qu'à mesure qu'il s'élève : il ne
// touche jamais le sol en tournant —, puis il poursuit dans la même direction en prenant de la vitesse, et sort par le
// haut pendant que l'À propos arrive (les plus proches de la caméra vont plus loin, plus vite). Le trajet ralentit un
// peu, sans s'arrêter, le temps que le vide reprenne l'îlot (PATH). Par-dessus, chacun se balance doucement à son
// rythme (le temps), même quand on ne défile plus. Ce qui est posé sur un autre (l'éponge sur son
// carton…) part avant son porteur. Les places en l'air sont écartées pour que deux objets ne se touchent pas
// (sphères qui se repoussent). Son ombre de soleil le suit dans le sens de la lumière (la carte d'ombre, telle
// quelle) ; sous lui, l'ombre du ciel prend la forme de sa silhouette, floue et légère à mesure qu'il s'éloigne (uLift,
// liftSky, plus haut). Pendant ce temps, le vide reprend l'îlot et le titre (EXIT). De la terre tombe de la brouette ; quelques brins d'herbe restent accrochés sous les objets,
// certains se décrochent et tombent ; des pétales et des aigrettes montent avec eux (RISE). Tout se rejoue à l'envers
// en remontant (la terre et les brins tombés s'enfoncent dans l'herbe ; revenus au sol, les objets les retrouvent).
// Sur ordinateur seulement, sans mouvement réduit (ailleurs, la course n'a pas de lévitation : js/apropos.js).
// [hauteur de base (m : le plus léger, le plus lourd), écart de hauteur (m), penché (rad), ce qu'un objet porté a en
//  plus (m), amorti du défilement (1/s)]
const LIFT = { height: [0.55, 0.3], vary: 0.05, tilt: [0.03, 0.07], carry: 0.09, ease: 5 };
// le trajet, sur toute la course (lévitation + envol, de 0 à 1) : [départ du plus lourd, durée d'un trajet (parts de
// la course) ; part du trajet où il atteint sa place en l'air, où il commence à prendre de la vitesse ; distance de la
// fin du trajet (m) ; allure pendant que le vide reprend l'îlot (part de l'allure ordinaire)]
const PATH = { spread: 0.2, dur: 0.8, hover: 0.45, away: 0.4, dist: [12, 18], slow: 0.45 };
// [hauteur en plus de la base (m), écart vers l'extérieur (m), rotation (rad), balancement (m) et sa période (s),
//  oscillation (rad), écart gardé entre deux objets (m), plus loin du centre (m), marge au sol en tournant (m)]
const HOVER = { rise: [0.2, 1.25], spread: [0.15, 0.6], turn: [0.45, 1.2], bob: 0.045, period: [3.4, 5.8], sway: 0.07,
  gap: 0.1, reach: 6, clear: 0.03 };
// Une fois les objets en l'air, dans le désordre, le vide reprend l'îlot : l'apparition à l'envers (même bruit, même
// bord net), du bord vers le centre ; le titre, au fond de l'îlot et plus haut, s'en va le premier (textVoid, plus
// bas). Les objets restent : ils flottent dans le blanc. [début et fin (part de la lévitation), rayon du front au
// départ (m : tout est encore là, titre compris) et à la fin (m : plus rien)]
const EXIT = { span: [0.4, 0.97], from: 14, to: REVEAL.start - REVEAL.edge };
let exitK = 0;                                      // la part du départ (0 → 1), pour le rai et le titre
let objectsOnScreen = 0;                            // les objets encore visibles (le guide attend qu'ils soient partis)
// pétales et aigrettes qui montent : [par seconde au plus fort, au plus en même temps, durée de vie (s), vitesse de
//  montée (m/s), part de pétales (le reste : aigrettes), taille d'une aigrette (m)]
const RISE = { rate: 6, max: 40, life: [4, 6.5], speed: [0.16, 0.32], petals: 0.6, seed: 0.1 };
const risers = [];
let riseAcc = 0;
// la terre de la brouette : [mottes, taille (m), moments où elles partent (part du décollage), dispersion (m/s),
//  temps pour s'enfoncer dans l'herbe (s)]
const CRUMBS = { count: 18, size: [0.022, 0.045], at: [0.06, 0.75], spread: 0.18, sink: 1.4 };
// les brins accrochés : [par objet, longueur (m), part qui se décroche, moment où ils se décrochent (part du
//  décollage), vitesse de chute (m/s), temps pour s'enfoncer (s)]
const BLADES = { per: [2, 4], length: [0.05, 0.13], drop: 0.45, at: [0.5, 1.0], fall: 0.45, sink: 1.6 };
const GRAVITY = 9.8;
const lifters = [];                                 // les objets, dans l'ordre : porteurs d'abord
const crumbs = [], blades = [];
let liftRoot = null;
const easeLift = (u) => u * u * (3 - 2 * u);
const _lp = new THREE.Vector3(), _lq = new THREE.Quaternion(), _lq2 = new THREE.Quaternion(), _lc = new THREE.Vector3();
const FOOT_LAYER = 7;

// la silhouette de chaque objet vu de dessus, blanche sur noir, dans sa case de uFoot (caméra orthogonale dans le
// repère de l'îlot, tournée vers le bas, nord en haut) ; les mipmaps donnent ses versions floues
function drawFootprints(root) {
  const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 50);
  cam.rotation.set(-Math.PI / 2, 0, 0);             // regarde vers le bas, le haut de l'image vers −z
  cam.layers.set(FOOT_LAYER);
  root.add(cam);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
  const shadows = renderer.shadowMap.autoUpdate;
  renderer.shadowMap.autoUpdate = false;            // la carte d'ombre n'a pas à être refaite pour ces dessins
  scene.overrideMaterial = white;
  renderer.setRenderTarget(footRT);
  renderer.setClearColor(0x000000, 1);
  footRT.scissorTest = false;
  renderer.clear();
  footRT.scissorTest = true;
  lifters.forEach((l, i) => {
    const gx = i % FOOT.grid, gy = Math.floor(i / FOOT.grid), b = l.box;
    const side = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) + 2 * FOOT.margin;
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    l.foot = { x0: cx - side / 2, z0: cz - side / 2, side, u: gx / FOOT.grid, v: gy / FOOT.grid };
    footRT.viewport.set(gx * FOOT.px, gy * FOOT.px, FOOT.px, FOOT.px);
    footRT.scissor.copy(footRT.viewport);
    renderer.setRenderTarget(footRT);               // three ne lit la case qu'ici
    Object.assign(cam, { left: -side / 2, right: side / 2, top: side / 2, bottom: -side / 2, far: b.max.y - b.min.y + 2 });
    cam.position.set(cx, b.max.y + 1, cz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    l.obj.traverse((m) => m.layers.enable(FOOT_LAYER));
    renderer.render(scene, cam);
    l.obj.traverse((m) => m.layers.disable(FOOT_LAYER));
  });
  footRT.scissorTest = false;
  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearA);
  renderer.shadowMap.autoUpdate = shadows;
  root.remove(cam);
}

// un brin d'herbe qui pend : bande effilée, un peu courbée, de sa racine (en haut, à l'origine) vers le bas
function bladeGeometry(len, color) {
  const seg = 5, pos = [], col = [], idx = [];
  const tip = color.clone().offsetHSL(0, 0, 0.08);
  for (let i = 0; i <= seg; i++) {
    const s = i / seg, w = 0.0045 * (1 - s) + 0.0006;
    const y = -len * s, x = 0.3 * len * s * s;
    pos.push(x - w, y, 0, x + w, y, 0);
    const c = color.clone().lerp(tip, s);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function makeLevitation(root, floraMesh) {
  liftRoot = root;
  const depthLift = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depthLift.userData.lifter = true;
  voidify(depthLift);
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  for (const obj of root.children.filter((o) => o.userData.service)) {
    // ses points, dans le repère de l'îlot et dans le sien
    const box = new THREE.Box3(), pts = [];
    const toObj = new THREE.Matrix4().copy(obj.matrixWorld).invert();
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const a = new THREE.Matrix4().multiplyMatrices(toRoot, m.matrixWorld);
      const b = new THREE.Matrix4().multiplyMatrices(toObj, m.matrixWorld);
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        _lp.fromBufferAttribute(pos, i);
        const p = _lp.clone().applyMatrix4(a);
        box.expandByPoint(p);
        pts.push({ p, local: _lp.clone().applyMatrix4(b), mesh: m });
      }
    });
    // ses matières (et sa carte d'ombre) ne sont pas reprises par le vide du départ : il s'envole
    obj.traverse((m) => { if (m.isMesh) { m.material.userData.lifter = true; m.customDepthMaterial = depthLift; } });
    const size = box.getSize(new THREE.Vector3());
    lifters.push({ obj, pts, box, carrier: null, carries: false,
      pos0: obj.position.clone(), q0: obj.quaternion.clone(), center: box.getCenter(new THREE.Vector3()),
      vol: size.x * size.y * size.z, u: 0, y: 0, rest: true });
  }
  // qui est posé sur qui : le dessous de l'un sur le dessus de l'autre, son centre au-dessus de lui
  for (const a of lifters) {
    for (const b of lifters) {
      if (a === b || a.box.min.y < b.box.min.y + 0.05) continue;
      const gap = a.box.min.y - b.box.max.y;
      if (gap > -0.1 && gap < 0.05 && a.center.x > b.box.min.x && a.center.x < b.box.max.x
        && a.center.z > b.box.min.z && a.center.z < b.box.max.z) { a.carrier = b; b.carries = true; break; }
    }
  }
  // l'ordre de départ : les légers d'abord
  const free = lifters.filter((l) => !l.carrier).sort((a, b) => a.vol - b.vol);
  free.forEach((l, i) => {
    l.rank = free.length > 1 ? i / (free.length - 1) : 0;
    l.start = PATH.spread * l.rank;
    l.h = THREE.MathUtils.lerp(LIFT.height[0], LIFT.height[1], l.rank) + rand(-LIFT.vary, LIFT.vary);
    const a = rand(0, Math.PI * 2);
    l.axis = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    l.tilt = l.carries ? 0 : rand(...LIFT.tilt);   // un porteur reste droit : ce qu'il porte ne le traverse pas
  });
  for (const l of lifters.filter((x) => x.carrier)) {
    // il part avant son porteur, de sa place sur lui
    Object.assign(l, { rank: l.carrier.rank, start: Math.max(0, l.carrier.start - 0.05), h: l.carrier.h + LIFT.carry,
      axis: l.carrier.axis, tilt: 0 });
  }
  makeHover();
  lifters.sort((a, b) => (a.carrier ? 1 : 0) - (b.carrier ? 1 : 0));
  drawFootprints(root);

  // la terre de la brouette : des mottes partent du bord de son chargement
  const barrow = lifters.find((l) => /^Brouette/.test(l.obj.name));
  const soil = barrow?.pts.filter((q) => /^(Terreau|Terre claire)/.test(q.mesh.material?.name || ''));
  if (soil?.length) {
    const top = Math.max(...soil.map((q) => q.p.y));
    const surf = soil.filter((q) => q.p.y > top - 0.05);
    const cx = surf.reduce((a, q) => a + q.p.x, 0) / surf.length, cz = surf.reduce((a, q) => a + q.p.z, 0) / surf.length;
    surf.sort((a, b) => Math.hypot(b.p.x - cx, b.p.z - cz) - Math.hypot(a.p.x - cx, a.p.z - cz));
    const rim = surf.slice(0, Math.max(1, Math.round(surf.length * 0.4)));
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const soilMats = new Map();                     // la terre tombée retourne au vide avec l'îlot
    const ats = Array.from({ length: CRUMBS.count }, () => rand(...CRUMBS.at)).sort((a, b) => a - b);
    for (const at of ats) {
      const q = rim[(Math.random() * rim.length) | 0];
      if (!soilMats.has(q.mesh.material)) {
        const c = q.mesh.material.clone();
        c.userData = {};
        soilMats.set(q.mesh.material, voidify(c));
      }
      const mesh = new THREE.Mesh(geo, soilMats.get(q.mesh.material));
      mesh.visible = false;
      root.add(mesh);
      crumbs.push({ mesh, at, local: q.local, r: rand(...CRUMBS.size), state: 0, vel: new THREE.Vector3(), t0: 0,
        spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), turn: rand(4, 9), owner: barrow });
    }
  }

  // les brins accrochés sous les objets posés dans l'herbe
  const greens = [];
  const col = floraMesh?.geometry.attributes.color;
  if (col) {
    const c = new THREE.Color();
    for (let k = 0; k < 4000 && greens.length < 40; k++) {
      c.fromBufferAttribute(col, (Math.random() * col.count) | 0);
      if (c.g > c.r * 1.25 && c.g > c.b * 1.6) greens.push(c.clone());
    }
  }
  if (!greens.length) return;
  const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide,
    roughness: floraMesh.material.roughness ?? 0.8, metalness: 0 });
  bladeMat.userData.lifter = true;                  // accrochés aux objets : ils restent avec eux
  voidify(bladeMat);
  for (const l of lifters) {
    if (l.carrier || l.box.min.y > GROUND_Y + 0.06) continue;
    const low = l.pts.filter((q) => q.p.y < l.box.min.y + 0.012);
    if (!low.length) continue;
    const n = Math.round(rand(...BLADES.per));
    for (let i = 0; i < n; i++) {
      const q = low[(Math.random() * low.length) | 0];
      const len = rand(...BLADES.length);
      const mesh = new THREE.Mesh(bladeGeometry(len, greens[(Math.random() * greens.length) | 0]), bladeMat);
      // il pend vers le bas de l'îlot, tourné au hasard autour de la verticale
      const hang = new THREE.Quaternion().copy(l.q0).invert()
        .multiply(new THREE.Quaternion().setFromAxisAngle(UP, rand(0, Math.PI * 2)));
      mesh.position.copy(q.local);
      mesh.quaternion.copy(hang);
      mesh.visible = false;
      l.obj.add(mesh);
      blades.push({ mesh, owner: l, local: q.local.clone(), hang, len, state: 0, t0: 0, sway: rand(1.6, 2.8),
        ph: rand(0, 6.3), drop: Math.random() < BLADES.drop ? rand(...BLADES.at) : Infinity,
        vel: new THREE.Vector3() });
    }
  }
}

// en l'air : la place de chacun (écartée des autres), son axe de rotation, son rythme
function makeHover() {
  for (const l of lifters) {
    const size = l.box.getSize(new THREE.Vector3());
    l.r = size.length() * 0.42;                     // sa sphère (un peu moins que la demi-diagonale)
    l.half = l.center.y - l.box.min.y;
    const out = new THREE.Vector3(l.center.x, 0, l.center.z);
    if (out.lengthSq() < 0.04) out.set(Math.cos(rand(0, 6.3)), 0, Math.sin(rand(0, 6.3)));
    out.normalize().multiplyScalar(rand(...HOVER.spread));
    l.o = new THREE.Vector3(out.x, rand(...HOVER.rise), out.z);
    l.lifted = l.h;                                 // la hauteur de base
    l.turnAxis = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
    l.turn = rand(...HOVER.turn) * (Math.random() < 0.5 ? -1 : 1);
    l.swayAxis = new THREE.Vector3(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1)).normalize();
    l.period = rand(...HOVER.period);
    l.ph = [rand(0, 6.3), rand(0, 6.3)];
  }
  // les places finales : les sphères se repoussent
  const at = (l) => _lc.copy(l.center).add(l.o).setY(l.center.y + l.lifted + l.o.y);
  const P = lifters.map((l) => at(l).clone());
  for (let k = 0; k < 80; k++) {
    for (let i = 0; i < lifters.length; i++) for (let j = i + 1; j < lifters.length; j++) {
      const a = lifters[i], b = lifters[j], d = P[i].clone().sub(P[j]);
      const need = a.r + b.r + HOVER.gap, dist = d.length();
      if (dist >= need) continue;
      if (dist < 1e-4) d.set(rand(-1, 1), rand(-0.3, 0.3), rand(-1, 1));
      d.normalize().multiplyScalar((need - dist) / 2);
      P[i].add(d); P[j].sub(d);
    }
    lifters.forEach((l, i) => {
      const p = P[i];
      p.y = Math.max(p.y, l.center.y + l.lifted + 0.1);   // jamais plus bas que sa hauteur de base
      const r = Math.hypot(p.x, p.z);
      if (r > HOVER.reach) { p.x *= HOVER.reach / r; p.z *= HOVER.reach / r; }
    });
  }
  // le chemin de chacun : de sa place au sol (0) à sa place en l'air (l.o, hauteur comprise) ; son envol, d'autant plus
  // rapide qu'il est près de la caméra
  const eye = liftRoot.worldToLocal(basePos.clone());
  lifters.forEach((l, i) => {
    l.o.copy(P[i]).sub(l.center);
    l.par = THREE.MathUtils.clamp((baseDist / P[i].distanceTo(eye)) ** 1.5, 0.6, 1.7) * rand(0.9, 1.1);
    // la fin du trajet : dans le prolongement de son écart, surtout vers le haut
    l.away = new THREE.Vector3(l.o.x * 0.35, 1, l.o.z * 0.35).normalize().multiplyScalar(rand(...PATH.dist) * l.par);
  });
}

// pétales et aigrettes qui montent avec les objets
function spawnRiser(t) {
  const from = lifters.filter((l) => l.y > 0.1);
  if (!from.length || risers.length >= RISE.max) return;
  const l = from[(Math.random() * from.length) | 0];
  let mesh, mat, flap = null;
  if (Math.random() < RISE.petals || !escapeGeo) {
    const sp = Object.keys(PETALE)[(Math.random() * Object.keys(PETALE).length) | 0];
    mat = petalMaterial(PETALE[sp].p.gloss);
    mesh = new THREE.Mesh(petalGeos[sp] ??= makePetalGeometry(PETALE[sp].p), mat);
    flap = PETALE[sp].flap * PETALE[sp].p.length * FLEUR;   // l'ondulation : une part de sa longueur (comme updateGusts)
  } else {
    mat = new THREE.MeshStandardMaterial({ color: '#fbfaf4', emissive: '#fbfaf4', emissiveIntensity: 0.35,
      roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false });
    mesh = new THREE.Mesh(escapeGeo, mat);
    mesh.scale.setScalar(RISE.seed);
  }
  mat.opacity = 0;
  mesh.frustumCulled = false;
  // sous l'objet, dans l'herbe ou un peu au-dessus
  const f = l.foot, s = f.side / 2 - FOOT.margin;
  mesh.position.set(f.x0 + f.side / 2 + l.o.x * l.k + rand(-s, s), GROUND_Y + rand(0.05, 0.35),
    f.z0 + f.side / 2 + l.o.z * l.k + rand(-s, s));
  mesh.quaternion.setFromEuler(new THREE.Euler(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3)));
  liftRoot.add(mesh);
  risers.push({ mesh, mat, flap, born: t, life: rand(...RISE.life), up: rand(...RISE.speed), ph: rand(0, 6.3),
    spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(), turn: rand(0.3, 0.9) });
}

let riseK = 0;
function updateRisers(t, dt, live, K) {
  riseAcc += RISE.rate * live * dt;
  const up = 24 * (K - riseK);                      // l'envol les emporte, vers le haut
  riseK = K;
  while (riseAcc >= 1) { riseAcc -= 1; spawnRiser(t); }
  for (let i = risers.length - 1; i >= 0; i--) {
    const r = risers[i], age = t - r.born, m = r.mesh;
    if (age >= r.life) { liftRoot.remove(m); r.mat.dispose(); risers.splice(i, 1); continue; }
    // il monte, lent au départ, en dérivant un peu ; il tourne sur lui-même
    m.position.y += r.up * Math.min(1, age / 1.2) * dt + up;
    m.position.x += Math.sin(age * 1.1 + r.ph) * 0.05 * dt;
    m.position.z += Math.cos(age * 0.9 + r.ph) * 0.05 * dt;
    m.rotateOnAxis(r.spin, r.turn * dt);
    if (r.flap !== null) r.mat.userData.flap.value.set(r.flap, age * 6 + r.ph);
    r.mat.opacity = Math.min(1, age / 0.6) * Math.min(1, (r.life - age) / 1.0);
  }
}

function updateLevitation(t, dt) {
  if (!lifters.length) return;
  // la course amortie (updateCourse) : la lévitation P (pour le vide), et toute la course g, ralentie (pathAt)
  const P = course?.LIFT ? THREE.MathUtils.clamp(flyS / course.LIFT, 0, 1) : 0;
  const g = course ? THREE.MathUtils.clamp(flyS / (course.LIFT + course.LEAVE), 0, 1) : 0, along = pathAt(g);
  // le vide reprend l'îlot, à vitesse presque constante (comme l'apparition)
  const x = THREE.MathUtils.clamp((P - EXIT.span[0]) / (EXIT.span[1] - EXIT.span[0]), 0, 1);
  exitK = x;
  uExit.value = x <= 0 ? 1e5 : EXIT.from + (EXIT.to - EXIT.from) * (x + (x * x * (3 - 2 * x) - x) * 0.35);
  textVoid.visible = x > 0 && x < 1;                // fini : il ne peint plus (l'À propos arrive sous la scène)
  if (textEl) textEl.style.visibility = x >= 1 ? 'hidden' : '';   // parti : il ne reparaît pas sous la scène
  document.documentElement.classList.toggle('lifted', x > 0);    // la scène passe devant la page (css : .scene)
  let any = false;
  lifters.forEach((l, i) => {
    const u = THREE.MathUtils.clamp((along - l.start) / PATH.dur, 0, 1);
    const e = easeLift(Math.min(1, u / PATH.hover));                     // vers sa place en l'air
    const b = Math.max(0, (u - PATH.away) / (1 - PATH.away)) ** 2;       // puis au-delà, en prenant de la vitesse
    const B = uLift.uLiftB.value[i];
    l.u = Math.min(1, u / PATH.hover);              // la part du décollage (la terre, les brins)
    l.k = e;
    l.y = l.o.y * e + l.away.y * b;                 // sa hauteur au-dessus de sa place
    if (u <= 0) {
      if (!l.rest) {                                // revenu au sol : exactement à sa place
        l.obj.position.copy(l.pos0); l.obj.quaternion.copy(l.q0); l.rest = true;
      }
      B.w = 0;
      return;
    }
    l.rest = false;
    any = true;
    // sa rotation : autant qu'il a de hauteur pour tourner sans toucher le sol (en tournant, il peut descendre
    // jusqu'au bas de sa sphère)
    const room = (l.r - l.half) * Math.abs(l.turn);
    const rot = room > 0 ? Math.min(e, Math.max(0, (l.y - HOVER.clear) / room)) : e;
    // en l'air, il se balance et oscille à son rythme
    const live = smooth(0.35, 1, u), w = (Math.PI * 2) / l.period;
    const bob = HOVER.bob * live * Math.sin(t * w + l.ph[0]);
    _lq.setFromAxisAngle(l.turnAxis, l.turn * (rot + 0.5 * b))
      .multiply(_lq2.setFromAxisAngle(l.swayAxis, HOVER.sway * live * Math.sin(t * w * 0.77 + l.ph[1])))
      .multiply(_lq2.setFromAxisAngle(l.axis, l.tilt * rot));   // un peu penché, autour de son centre
    _lc.copy(l.center).addScaledVector(l.o, e).addScaledVector(l.away, b);
    _lc.y += bob;
    (l.cw ??= new THREE.Vector3()).copy(_lc).applyMatrix4(island.matrixWorld);   // son centre, pour le guide
    l.obj.position.copy(l.pos0).sub(l.center).applyQuaternion(_lq).add(_lc);
    l.obj.quaternion.copy(_lq).multiply(l.q0);
    l.obj.updateMatrix();
    // l'ombre du ciel sous lui : elle naît doucement quand il quitte le sol ; elle suit son écart
    const f = l.foot;
    uLift.uLiftA.value[i].set(f.x0 + _lc.x - l.center.x, f.z0 + _lc.z - l.center.z, f.side, 0);
    B.set(f.u, f.v, FOOT.px / f.side, smooth(0, SKY.born, l.y));
    uLift.uLiftY.value[i] = _lc.y - THREE.MathUtils.lerp(l.half, l.r, Math.min(1, Math.abs(l.turn) * rot));
  });
  uLift.uLiftN.value = any ? lifters.length : 0;
  // l'îlot reparti, on ne dessine plus que ce qui vole encore ; les objets sortis de l'écran non plus
  for (const o of statics) o.visible = exitK < 1;
  for (const l of lifters) l.obj.visible = flyK < 1;
  objectsOnScreen = 0;
  for (const l of lifters) {
    if (!l.cw || !l.obj.visible) continue;
    _gp.copy(l.cw).project(camera);
    if (Math.abs(_gp.x) < 1 && Math.abs(_gp.y) < 1) objectsOnScreen++;
  }
  updateRisers(t, dt, smooth(0.05, 0.3, P) * (1 - smooth(0.6, 0.75, g)), smooth(0.6, 1, g) ** 2);

  // la terre de la brouette
  for (const c of crumbs) {
    const m = c.mesh;
    if (c.state === 0) {
      if (c.owner.u < c.at) continue;
      m.position.copy(c.local).applyMatrix4(c.owner.obj.matrix);
      c.vel.set(rand(-1, 1) * CRUMBS.spread, rand(0, 0.12), rand(-1, 1) * CRUMBS.spread);
      m.scale.setScalar(c.r);
      m.visible = true;
      c.state = 1;
    } else if (c.state === 1) {                     // elle tombe en tournant
      c.vel.y -= GRAVITY * dt;
      m.position.addScaledVector(c.vel, dt);
      m.rotateOnAxis(c.spin, c.turn * dt);
      if (m.position.y <= GROUND_Y + c.r * 0.4) { m.position.y = GROUND_Y + c.r * 0.4; c.state = 2; c.t0 = t; }
    } else if (c.state === 2) {                     // dans l'herbe, elle s'enfonce
      const k = 1 - (t - c.t0) / CRUMBS.sink;
      if (c.owner.u === 0) c.back = true;
      if (k <= 0) { m.visible = false; c.state = c.back ? 0 : 3; c.back = false; }
      else { m.scale.setScalar(c.r * k); m.position.y = GROUND_Y + c.r * (0.4 * k - (1 - k)); }
    } else if (c.owner.u === 0) c.state = 0;        // la brouette est revenue au sol : sa terre aussi
  }

  // les brins accrochés : ils pendent et se balancent un peu ; certains se décrochent
  for (const b of blades) {
    const m = b.mesh, l = b.owner;
    if (b.state === 0) {
      m.visible = l.y > 0.002;
      if (!m.visible) continue;
      _lq.setFromAxisAngle(AX_X, 0.16 * Math.sin(t * b.sway + b.ph) * Math.min(1, l.y * 8));
      m.quaternion.copy(b.hang).multiply(_lq);
      if (l.u >= b.drop) {                          // il se décroche : il tombe dans le repère de l'îlot
        liftRoot.attach(m);
        b.vel.set(rand(-0.05, 0.05), -BLADES.fall, rand(-0.05, 0.05));
        b.state = 1;
      }
    } else if (b.state === 1) {                     // il descend en voletant
      m.position.addScaledVector(b.vel, dt);
      m.position.x += Math.sin(t * 5 + b.ph) * 0.08 * dt;
      m.rotateOnAxis(AX_Z, Math.sin(t * 3 + b.ph) * 1.5 * dt);
      if (m.position.y <= GROUND_Y + 0.01) { b.state = 2; b.t0 = t; }
    } else if (b.state === 2) {
      const k = 1 - (t - b.t0) / BLADES.sink;
      if (l.u === 0) b.back = true;
      if (k <= 0) { m.visible = false; b.state = 3; } else m.position.y = GROUND_Y + 0.01 - (1 - k) * b.len;
    } else if (l.u === 0 || b.back) {               // l'objet est revenu au sol : le brin reprend sa place dessous
      b.back = false;
      l.obj.add(m);
      m.position.copy(b.local);
      m.quaternion.copy(b.hang);
      m.visible = false;
      b.state = 0;
    }
  }
}

// ------------------------------------------------------------ chargement de l'îlot
// le décodeur Draco, servi par le site (outils/build.mjs), chargé tout de suite : en même temps que le modèle
const draco = new DRACOLoader().setDecoderPath('js/draco/');
draco.preload();
const gltfLoader = new GLTFLoader().setDRACOLoader(draco);
gltfLoader.load(MODEL, (gltf) => {
  const root = gltf.scene;
  let seedTemplate = null, floraMesh = null;
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
      if (!floraMesh && o.geometry.attributes.color) floraMesh = { geometry: o.geometry, material: o.material };
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

  // le papillon guide (sur ordinateur) : le vide du départ ne le reprend pas
  if (desktop && !reduced) {
    guide = flyers[BUTTERFLY.species.indexOf(GUIDE.species)] ?? null;
    guide?.root.traverse((c) => { if (c.isMesh) c.material.userData.lifter = true; });
  }

  island.add(root);
  grabbable = root;
  root.children.forEach((o) => { if (!o.userData.service) statics.push(o); });   // le sol, la flore…
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
    if (desktop) makeLevitation(root, floraMesh);  // les objets qui décollent au défilement
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
let vfovR = 0, frameF = FRAME.wide, baseDist = 10, frameW = 1, frameH = 1;
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
  frameW = w; frameH = h;
  camera.setViewOffset(w, h, -(frameF.x - 0.5) * w, -(frameF.y - 0.5) * h, w, h);
  camera.updateProjectionMatrix();
  // le titre, comme posé au fond de l'îlot : le point de la scène derrière son milieu (pour son départ : textVoid)
  if (textEl) {
    screenToWorld(0.5, (textEl.offsetTop + textEl.offsetHeight / 2) / h, baseDist + FIT_RADIUS, textAnchor);
  }
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
  // l'îlot parti, la caméra ne suit plus la souris : elle revient à sa place (la page, elle, ne bouge pas)
  const follow = 1 - exitK;
  sway.x += (sway.tx * follow - sway.x) * k;
  sway.y += (sway.ty * follow - sway.y) * k;
  if (Math.abs(sway.tx * follow - sway.x) + Math.abs(sway.ty * follow - sway.y) < 1e-4) return false;
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
  if (textEl) {
    textEl.style.setProperty('--sx', `${(sway.x * SWAY.x * g).toFixed(2)}px`);
    textEl.style.setProperty('--sy', `${textShift.toFixed(2)}px`);
  }
  tiltUp = maxTiltUp(h);            // vu d'un peu plus haut, le sol remonte : la bascule s'adapte
  return true;
}

// ------------------------------------------------------------ la course, au défilement (js/apropos.js)
// La course est lue dans window.hsCourse (écrans défilés), amortie (flyS) : la lévitation (LIFT écrans, plus haut :
// les objets décollent, le vide reprend l'îlot et le titre), puis l'envol (LEAVE écrans, flyK de 0 à 1) : la caméra
// ne bouge pas, les objets sortent par le haut pendant que l'À propos monte du bas de l'écran. Puis l'îlot n'est plus
// dessiné.
const course = window.hsCourse;
const textAnchor = new THREE.Vector3();
let flyS = 0, flyK = 0;

// le titre part dans le vide avec l'îlot : il est sous la scène (html), et la scène peint, devant lui, la couleur de
// la page là où le vide l'a repris — sur le plan qui passe par son milieu, au fond de l'îlot, face à la caméra, avec
// le même front, le même bruit, le même bord net que l'îlot. Les objets, dessinés après, passent devant.
const textVoid = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false, toneMapped: false,
  // il marque ses pixels : le rai ne s'y ajoute pas (STENCIL_TEXT)
  stencilWrite: true, stencilRef: STENCIL_TEXT, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  uniforms: { uExit, uIslandInv, uInvProj: { value: camera.projectionMatrixInverse }, uCamWorld: { value: camera.matrixWorld },
    uPlane: { value: new THREE.Vector4() }, uPaper: { value: new THREE.Color(PAPER).convertLinearToSRGB() } },
  vertexShader: `varying vec2 vNdc; void main() { vNdc = position.xy; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
  fragmentShader: `
    uniform float uExit; uniform mat4 uIslandInv, uInvProj, uCamWorld; uniform vec4 uPlane; uniform vec3 uPaper;
    varying vec2 vNdc;
    ${VOID_FN}
    void main() {
      vec4 v = uInvProj * vec4( vNdc, 1.0, 1.0 );
      vec3 dir = normalize( ( uCamWorld * vec4( v.xyz / v.w, 0.0 ) ).xyz );
      vec3 P = cameraPosition + dir * ( ( uPlane.w - dot( uPlane.xyz, cameraPosition ) ) / dot( uPlane.xyz, dir ) );
      P = ( uIslandInv * vec4( P, 1.0 ) ).xyz;
      float d = voidAt( uExit, P, vdN( P ) );
      float aa = max( fwidth( d ), 1e-4 );
      float a = 1.0 - smoothstep( - aa, aa, d );
      if ( a <= 0.0 ) discard;
      gl_FragColor = vec4( uPaper * a, a );          // la couleur exacte de la page (prémultipliée)
    }`,
}));
textVoid.frustumCulled = false;
textVoid.renderOrder = -10;                         // avant tout : l'îlot et les objets se dessinent par-dessus
textVoid.visible = false;
textVoid.onBeforeRender = () => {                   // le plan du titre, face à la caméra
  const n = camera.getWorldDirection(new THREE.Vector3());
  textVoid.material.uniforms.uPlane.value.set(n.x, n.y, n.z, n.dot(textAnchor));
};
scene.add(textVoid);

// l'allure du trajet sur la course (0 → 1) : ordinaire, sauf le temps que le vide reprenne l'îlot, où elle ralentit
// un peu (PATH.slow), sans jamais s'arrêter ; tabulée une fois, ramenée à 1 au bout
const PATH_AT = (() => {
  const n = 400, lift = course?.LIFT || 1, all = lift + (course?.LEAVE || 1);
  const a = (EXIT.span[0] * lift) / all, z = (EXIT.span[1] * lift) / all, edge = 0.06;
  const tab = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    const gm = (k - 0.5) / n;
    const slow = smooth(a - edge, a + edge, gm) * (1 - smooth(z - edge, z + edge, gm));
    tab[k] = tab[k - 1] + (1 - (1 - PATH.slow) * slow) / n;
  }
  return tab.map((v) => v / tab[n]);
})();
function pathAt(g) {
  const f = g * (PATH_AT.length - 1), k = Math.min(PATH_AT.length - 2, Math.floor(f));
  return PATH_AT[k] + (PATH_AT[k + 1] - PATH_AT[k]) * (f - k);
}
const courseEnd = () => (course ? course.LIFT + course.LEAVE : 0);
function updateCourse(dt) {
  const end = courseEnd(), target = course ? Math.min(course.at(), end) : 0;
  const before = flyS;
  flyS = reduced ? target : flyS + (target - flyS) * (1 - Math.exp(-dt * LIFT.ease));
  if (Math.abs(target - flyS) < 1e-4) flyS = target;
  flyK = course?.LEAVE ? THREE.MathUtils.clamp((flyS - course.LIFT) / course.LEAVE, 0, 1) : 0;
  return flyS !== before;
}
// parti : la course est au-delà de l'envol, et l'amorti l'a rattrapée
const gone = () => !guide && !!course && course.leave() >= 1 && flyS >= courseEnd() - 1e-4;   // le guide, lui, reste

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


// ------------------------------------------------------------ boucle : à l'écran seulement (pas une fois l'îlot parti)
let dirty = true, visible = true, animating = false, running = false;
const hidden = () => !visible || document.hidden || gone();
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
  const moving = updateCourse(dt) | swayCamera(dt) | turn(dt);
  host.style.visibility = gone() ? 'hidden' : '';
  if (animating) {
    updateButterflies(uTime.value, dt);
    updateGuideShadow();                            // son ombre sur le mur, d'après sa pose de l'instant
    if (desktop) updateEscapes(uTime.value, dt);
    if (desktop) updateGusts(uTime.value);
    if (bees.length) updateBees(uTime.value, dt);
    updateLevitation(uTime.value, dt);
    // le rai se lève dès que l'îlot commence à apparaître
    uShaft.fade.value = (born < 0 ? 0 : smooth(born + REVEAL.wait, born + REVEAL.wait + 1.6, uTime.value)) * (1 - smooth(0.55, 0.9, flyK));   // il reste allumé pendant l'envol (les objets gardent leur éclaircie), s'éteint quand ils sont partis
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
window.addEventListener('scroll', () => { if (!gone()) host.style.visibility = ''; start(); }, { passive: true });
resize();
start();








