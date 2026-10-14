// Les services : un diaporama des cinq services (index.html, .services), repris de l'onglet Services du site immersif
// (homeservice-immersive/web/js/app.js : MINI, miniWorlds, updateMini, svcUI), à l'identique pour le diorama. Chaque
// service a sa fiche (titre, description) et son mini-monde (models/minimondes.glb, composé dans
// homeservice-immersive/blender/services.blend : « Monde_<service> »).
// Un seul diorama à la fois. Quand la section arrive à l'écran, il s'assemble pièce par pièce (js/assemblage.js) ;
// pour laisser la place au suivant, il s'envole, puis le suivant s'assemble. Il arrive déjà en rotation, calé pour
// passer de trois quarts face au milieu de son apparition, tourne lentement sur lui-même et flotte un peu. On
// l'attrape à la souris (ou au doigt) : glissé horizontal, il tourne (lâché, il garde un peu d'élan) ; glissé
// vertical, il bascule vers nous ou vers l'arrière, dans des limites, et revient à plat. Quand la section quitte
// l'écran, c'est le vide qui le reprend ; il se réassemble au retour. Les flèches, les cases, le clavier (← →) et
// le glissé sur la fiche changent de service. Sans animations (réglage système), le vide fait la relève.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { draco } from './draco.js';                 // le décodeur Draco partagé (js/draco.js)
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MINI_ASM, MINI_CHOREO, MINI_EXIT, asmBuild, asmApply, exitApply, exitReset } from './assemblage.js';

const section = document.querySelector('.services');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const WORLDS = ['nettoyage', 'jardinage', 'desencombrement', 'montage', 'livraison'];
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
const sms = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };

// Le site immersif agrandit les dioramas 3,4 fois et les regarde à 35 mm depuis la caméra de l'onglet Services
// (SVC_SHOT : 33 m en arrière, 18 m de haut ; le diorama à 7,4 m de haut, 3 m plus loin) : une plongée de 16,4°.
// Ici on garde leur taille d'origine : les longueurs du site immersif sont divisées par 3,4.
// [rotation de départ (rad, trois quarts), rotation lente (rad/s), durée d'une apparition par le vide (s), profondeur
//  du bord du vide, flottement (amplitude, rad/s), plongée (rad), objectif (mm), part de la hauteur de la toile
//  occupée par la sphère englobante du plus grand diorama]
const S = 3.4;
const MINI = { yaw: -0.5, spin: 0.3, dur: 1.2, edge: 1.2 / S, bob: 0.12 / S, bobW: 1.1, dive: Math.atan2(18 - 7.4, 33 + 3.0),
  lens: 35, fill: 1.6, fillNarrow: 1.15 };
// la bascule au glissé vertical : [max vers la caméra (rad), marge gardée avant de voir le sol par la tranche (rad),
// vitesse du retour à plat (1/s)] ; le glissé : rad par px (horizontal, vertical)
const MINI_PITCH = { up: 0.3, margin: 0.14, back: 4 };
const DRAG = { yaw: 0.009, pitch: 0.006 };
// la lumière du site immersif : tons neutres (exposition 1,1), ciel (hémisphère + ambiance), soleil de face à
// gauche (SUN_LOOP, du repère Blender à celui de three)
const LIGHT = { exposure: 1.1, sky: '#d6e9ff', ground: '#7a9a5e', skyI: 1.25, env: 0.6, sun: '#fffaf2', sunI: 4.2,
  dir: [0.62, -0.60, -0.50] };

const VD_NOISE = `
float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vdNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
// le vide du site immersif (MINI_VOID, addMiniVoid), mis à l'échelle du diorama : rien n'est dessiné hors du rayon
// uMiniR autour de son centre, derrière un bord ondulé et net
const MINI_VOID = { uMiniC: { value: new THREE.Vector3() }, uMiniR: { value: 0 } };
function addMiniVoid(m) {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, MINI_VOID);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMiniW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMiniW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uMiniC; uniform float uMiniR; varying vec3 vMiniW;
        ${VD_NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float mn = vdNoise(vMiniW * ${(0.9 * S).toFixed(3)}) * 0.75 + vdNoise(vMiniW * ${(3.2 * S).toFixed(3)}) * 0.25;
        if (uMiniR - length(vMiniW - uMiniC) + (mn - 1.0) * ${MINI.edge.toFixed(3)} < 0.0) discard;`);
  };
  m.customProgramCacheKey = () => 'vide-mini';
  return m;
}

function start(gltf) {
  const stage = section.querySelector('.svc-stage');
  const ui = section.querySelector('.svc-wrap');
  const slides = [...ui.querySelectorAll('.svc-slide')], dots = [...ui.querySelectorAll('.svc-dot')];
  const count = ui.querySelector('.svc-count b');

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = LIGHT.env;
  scene.add(new THREE.HemisphereLight(LIGHT.sky, LIGHT.ground, LIGHT.skyI));
  const sun = new THREE.DirectionalLight(LIGHT.sun, LIGHT.sunI);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04 / S;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);

  // diorama : au centre (flottement), bascule (glissé vertical), rotation (lente, glissé horizontal)
  const miniRoot = new THREE.Group();
  const miniPitch = new THREE.Group();
  const miniYaw = new THREE.Group();
  scene.add(miniRoot);
  miniRoot.add(miniPitch);
  miniPitch.add(miniYaw);
  let miniRad = 0, frameR = 0, frameY = 0;
  const miniWorlds = WORLDS.map((n) => {
    const w = gltf.scene.getObjectByName(`Monde_${n}`);
    w.removeFromParent();
    w.traverse((m) => {
      if (!m.isMesh) return;
      m.material = addMiniVoid(m.material.clone());
      m.material.flatShading = true;
      m.castShadow = false;                         // pas d'ombre au sol : le diorama flotte, net
      m.receiveShadow = true;
      if (m.name.startsWith('Halo')) {              // sol qui se fond dans la page : teinte et fondu par sommet (RGBA)
        Object.assign(m.material, { vertexColors: true, transparent: true, depthWrite: false });
        m.renderOrder = -1;
      }
    });
    w.visible = false;
    miniYaw.add(w);
    w.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(w);
    // pour le cadrage : sa vraie boîte (centre et demi-diagonale), le sol fondu compris
    frameR = Math.max(frameR, box.getSize(new THREE.Vector3()).length() / 2);
    frameY += box.getCenter(new THREE.Vector3()).y / WORLDS.length;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      miniRad = Math.max(miniRad, Math.hypot(x, y, z));
    }
    return w;
  });
  miniRoot.updateMatrixWorld(true);
  const miniAsm = miniWorlds.map((w, i) => asmBuild(w, MINI_CHOREO[WORLDS[i]] || []));
  const miniExit = miniWorlds.map((w, i) => (MINI_EXIT[WORLDS[i]] ? asmBuild(w, MINI_EXIT[WORLDS[i]]) : null));

  // la caméra : en plongée, objectif 35 mm (sur la largeur, comme le site immersif), visant le milieu des dioramas, à
  // la distance où la demi-diagonale du plus grand occupe MINI.fill de la demi-hauteur de la toile
  // (la toile déborde de la case, du même tant de chaque côté : le cadrage se calcule sur la case, puis le champ
  //  s'élargit d'autant que la toile est plus grande — même échelle, même centre)
  const cvs = renderer.domElement;
  function layout() {
    const Ws = stage.clientWidth, Hs = stage.clientHeight, W = cvs.clientWidth, H = cvs.clientHeight;
    renderer.setSize(W, H, false);
    const aspectS = Ws / Hs;
    const hfov = 2 * Math.atan(18 / MINI.lens);
    const fovS = 2 * Math.atan(Math.tan(hfov / 2) / aspectS);
    const half = Math.min(fovS / 2, hfov / 2);
    camera.aspect = W / H;
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fovS / 2) * H / Hs));
    // (sur une case étroite, comme sur téléphone, il tourne dans moins de largeur : moins rempli)
    const fill = aspectS < 1.05 ? MINI.fillNarrow : MINI.fill;
    const D = frameR / Math.tan(half) / fill;
    camera.position.set(0, frameY + Math.sin(MINI.dive) * D, Math.cos(MINI.dive) * D);
    camera.lookAt(0, frameY, 0);
    camera.updateProjectionMatrix();
    sun.position.set(...LIGHT.dir).normalize().multiplyScalar(-miniRad * 6);
    Object.assign(sun.shadow.camera, { left: -miniRad, right: miniRad, top: miniRad, bottom: -miniRad, near: 0.1, far: miniRad * 14 });
    sun.shadow.camera.updateProjectionMatrix();
    wake();
  }

  // ---------------------------------------------------------------- l'état du site immersif (updateMini)
  let miniK = 0, miniCur = 0, miniNext = 0, miniSwap = 1;
  let miniExitT = -1, miniAsmT = 0, miniAsmDir = 1;
  let miniYawA = MINI.yaw, miniSpinV = 0, miniDrag = null, miniPitchA = 0;
  const miniFaceFront = () => { miniYawA = MINI.yaw - MINI.spin * MINI.dur * 0.5; miniSpinV = MINI.spin; };
  miniFaceFront();
  const miniAxis = new THREE.Vector3(), miniView = new THREE.Vector3();
  let on = false;                                   // la section est à l'écran
  let paused = false;                               // la carte d'un service est ouverte : le diorama s'efface

  function svcRender(i) {
    slides.forEach((el, k) => {
      el.classList.toggle('active', k === i);
      el.classList.toggle('is-before', k < i);
      el.classList.toggle('is-after', k > i);
      el.setAttribute('aria-hidden', String(k !== i));
    });
    dots.forEach((el, k) => { el.classList.toggle('active', k === i); el.setAttribute('aria-current', String(k === i)); });
    if (count) count.textContent = String(i + 1).padStart(2, '0');
  }
  const show = (i) => { miniNext = ((i % WORLDS.length) + WORLDS.length) % WORLDS.length; svcRender(miniNext); wake(); };
  svcRender(0);
  ui.querySelectorAll('.svc-arrow').forEach((b) => b.addEventListener('click', () => show(miniNext + +b.dataset.step)));
  dots.forEach((b) => b.addEventListener('click', () => show(+b.dataset.i)));
  section.addEventListener('keydown', (e) => {
    if (paused) return;                             // (la carte est ouverte)
    if (e.key === 'ArrowLeft') { show(miniNext - 1); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(miniNext + 1); e.preventDefault(); }
  });
  { // glissé horizontal sur la fiche (doigt ou souris)
    const area = ui.querySelector('.svc-slides');
    let x0 = null;
    area.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    area.addEventListener('pointerup', (e) => {
      if (x0 !== null && Math.abs(e.clientX - x0) > 40) show(miniNext + (e.clientX < x0 ? 1 : -1));
      x0 = null;
    });
  }
  // on attrape le diorama (là où il est dessiné)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const hit = (e) => {
    if (!miniRoot.visible || miniK < 0.9 || miniSwap < 0.9 || miniAsmDir < 0) return false;
    const r = cvs.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(miniWorlds[miniCur], true).length > 0;
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!hit(e)) return;
    miniDrag = { x: e.clientX, y: e.clientY, t: performance.now() };
    miniSpinV = 0;
    stage.setPointerCapture(e.pointerId);
    stage.style.cursor = 'grabbing';
    e.preventDefault();
    wake();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!miniDrag) { stage.style.cursor = hit(e) ? 'grab' : ''; return; }
    const now = performance.now(), da = (e.clientX - miniDrag.x) * DRAG.yaw;
    miniYawA += da;
    miniSpinV = da / Math.max((now - miniDrag.t) / 1000, 1 / 120);
    miniPitchA += (e.clientY - miniDrag.y) * DRAG.pitch;
    miniDrag = { x: e.clientX, y: e.clientY, t: now };
  });
  const release = (e) => {
    if (!miniDrag) return;
    if (performance.now() - miniDrag.t > 80) miniSpinV = 0;   // tenu immobile avant de lâcher : pas d'élan
    miniDrag = null;
    stage.style.cursor = hit(e) ? 'grab' : '';
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  function updateMini(dt, t) {
    const live = on && !paused;                     // (carte ouverte : comme hors de l'écran, le vide le reprend)
    // arrivée : le diorama s'assemble (miniK passe d'un coup à 1) ; départ (la section quitte l'écran) : le vide le
    // reprend. Sans animations, le vide le découvre aussi à l'arrivée.
    if (live && miniK === 0 && !REDUCED) {
      if (miniExitT >= 0) { exitReset(miniExit[miniCur]); miniExitT = -1; miniCur = miniNext; }
      miniAsmT = 0; miniAsmDir = 1;
    }
    miniK = live && !REDUCED ? 1 : clamp(miniK + (live ? 1 : -1) * dt / MINI.dur, 0, 1);
    miniRoot.visible = miniK > 0.001;
    if (!miniRoot.visible) { miniFaceFront(); return false; }
    let busy = !REDUCED || miniK < 1;
    if (REDUCED) {                                  // sans animations : le vide fait la relève
      if (miniNext !== miniCur) {
        miniSwap = Math.max(0, miniSwap - dt / (MINI.dur * 0.75));
        if (miniSwap === 0) { miniCur = miniNext; miniFaceFront(); }
        busy = true;
      } else { miniSwap = Math.min(1, miniSwap + dt / MINI.dur); if (miniSwap < 1) busy = true; }
    } else {
      // relève : le diorama s'envole (sa chorégraphie de sortie, s'il est entièrement monté ; sinon il se démonte à
      // l'envers, plus vite), puis le suivant s'assemble, de face
      const exit = miniExit[miniCur];
      if (miniNext !== miniCur && miniExitT < 0 && exit && miniAsmT >= miniAsm[miniCur].T) miniExitT = 0;
      const next = () => {
        if (exit) exitReset(exit);
        miniCur = miniNext; miniAsmT = 0; miniAsmDir = 1; miniExitT = -1; miniFaceFront();
      };
      if (miniExitT >= 0) {
        miniAsmDir = -1;
        miniExitT += dt * MINI_ASM.speed;
        if (miniExitT >= exit.T) next();
        else exitApply(exit, miniExitT);
      } else {
        miniAsmDir = miniNext !== miniCur ? -1 : 1;
        miniAsmT = Math.min(miniAsm[miniCur].T, miniAsmT + miniAsmDir * dt * MINI_ASM.speed * (miniAsmDir < 0 ? MINI_ASM.out : 1));
        if (miniAsmT <= 0 && miniAsmDir < 0) next();
      }
      if (miniExitT < 0) asmApply(miniAsm[miniCur], miniAsmT);
    }
    miniWorlds.forEach((w, i) => { w.visible = i === miniCur; });
    if (!miniDrag) {                                // lâché : l'élan se fond peu à peu dans la rotation lente
      miniYawA += miniSpinV * dt;
      miniSpinV = (REDUCED ? 0 : MINI.spin) + (miniSpinV - (REDUCED ? 0 : MINI.spin)) * Math.exp(-dt * 3);
    }
    miniYaw.rotation.y = miniYawA;
    miniRoot.position.set(0, REDUCED ? 0 : MINI.bob * Math.sin(t * MINI.bobW), 0);
    // bascule autour de l'axe horizontal de l'écran : vers l'arrière, on s'arrête avant que le regard passe sous le
    // sol (l'angle de plongée de la caméra, moins une marge) ; vers l'avant, au plus MINI_PITCH.up
    miniView.subVectors(miniRoot.position, camera.position).normalize();
    const dive = Math.asin(clamp(-miniView.y, -1, 1));
    miniPitchA = clamp(miniPitchA, -Math.max(0, dive - MINI_PITCH.margin), MINI_PITCH.up);
    if (!miniDrag) miniPitchA *= Math.exp(-dt * MINI_PITCH.back);
    if (Math.abs(miniPitchA) > 1e-4) busy = true;
    miniAxis.crossVectors(miniView, camera.up).normalize();
    miniPitch.quaternion.setFromAxisAngle(miniAxis, miniPitchA);
    MINI_VOID.uMiniC.value.copy(miniRoot.position);
    // le front du vide va du cœur (bord compris) jusqu'au-delà du diorama entier
    MINI_VOID.uMiniR.value = lerp(-0.2 / S, miniRad + MINI.edge, sms(0, 1, miniK) * sms(0, 1, miniSwap));
    return busy;
  }

  // les formes du fond (.svc-forme) : la palette du diorama affiché ; elles arrivent FORME.after s après le début de
  // son assemblage (ou de sa sortie du vide), et repartent dès qu'il s'envole ou que le vide le reprend
  const forme = stage.querySelector('.svc-forme');
  const FORME = { after: 0.35 };
  let formeWait = 0;
  function stepForme(dt) {
    if (!forme) return false;
    const settled = on && !paused && miniCur === miniNext && miniExitT < 0 && miniAsmDir > 0 && miniK > 0.99;
    formeWait = settled ? formeWait + dt : 0;
    const inn = settled && (REDUCED || formeWait >= FORME.after);
    if (!forme.classList.contains('is-in')) forme.dataset.svc = WORLDS[miniCur];   // caché : il prend la palette
    forme.classList.toggle('is-in', inn);
    return settled && !inn;
  }

  // ---------------------------------------------------------------- « Voir plus » : la carte du service
  // La fiche et le bouton s'effacent, le vide reprend le diorama (et ses formes) ; un fond couvre l'écran et la carte
  // du service affiché s'y pose au centre. La page ne défile plus (html.svc-lock, et js/scroll.js laisse faire) : la
  // croix ou Échap la referme, la fiche revient et le diorama se réassemble. La carte et son fond sont rattachés à la
  // page (au-dessus du menu). Une photo absente garde son cadre « Photo à venir ».
  const card = section.querySelector('.svc-card');
  const details = [...section.querySelectorAll('.svc-detail')];
  const moreBtn = section.querySelector('.svc-more'), closeBtn = card?.querySelector('.svc-card__close');
  const backdrop = document.createElement('div');
  backdrop.className = 'svc-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  if (card) document.body.append(backdrop, card);
  for (const img of card ? card.querySelectorAll('.svc-photo img') : []) {
    const fig = img.closest('.svc-photo');
    if (img.complete && img.naturalWidth) fig.classList.add('has-img');
    img.addEventListener('load', () => fig.classList.add('has-img'));
    img.addEventListener('error', () => img.remove());
  }
  // [attente avant la carte (s) : la fiche s'efface et le vide reprend le diorama ; retour de la fiche après la carte (s)]
  const CARD_T = { in: 1.2, out: 0.4 };   // (in : le temps que le vide reprenne le diorama, MINI.dur)
  let cardTimer = 0;
  function openCard() {
    if (!card || paused) return;
    const i = miniNext;
    paused = true;
    clearTimeout(cardTimer);
    card.dataset.svc = WORLDS[i];
    details.forEach((d, k) => { d.classList.toggle('active', k === i); d.setAttribute('aria-hidden', String(k !== i)); });
    card.scrollTop = 0;
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-hidden', 'false');
    section.classList.add('svc-open');               // 1. la fiche et le bouton s'effacent, le vide reprend le diorama
    document.documentElement.classList.add('svc-lock');
    wake();
    cardTimer = setTimeout(() => {                   // 2. puis le fond et la carte ; son contenu entre ensuite (css)
      backdrop.classList.add('is-open');
      card.classList.add('is-open');
      setTimeout(() => closeBtn?.focus({ preventScroll: true }), 400);
    }, CARD_T.in * 1000);
  }
  function closeCard() {
    if (!paused) return;
    clearTimeout(cardTimer);
    card.classList.remove('is-open');                // la carte et son fond partent…
    backdrop.classList.remove('is-open');
    card.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('svc-lock');
    cardTimer = setTimeout(() => {                   // … puis la fiche revient et le diorama se réassemble
      paused = false;
      section.classList.remove('svc-open');
      moreBtn?.focus({ preventScroll: true });
      wake();
    }, CARD_T.out * 1000);
  }
  moreBtn?.addEventListener('click', openCard);
  closeBtn?.addEventListener('click', closeCard);
  // « Réserver un appel » : le voile emmène vers la page de réservation, le service déjà choisi (?service=) ; la carte
  // se ferme sous lui (la page revient fermée si on fait « retour »)
  for (const a of card ? card.querySelectorAll('.svc-detail__cta') : []) a.addEventListener('click', () => setTimeout(closeCard, 950));
  document.addEventListener('keydown', (e) => {
    if (!paused) return;
    if (e.key === 'Escape') { closeCard(); return; }
    if (e.key === 'Tab') {                          // le focus reste dans la carte
      const f = [...card.querySelectorAll('button, a[href]')].filter((el) => el.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  // ---------------------------------------------------------------- image par image
  let raf = 0, last = 0, t = 0;
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    t += dt;
    const busy = updateMini(dt, t) | stepForme(dt);
    renderer.render(scene, camera);
    if (busy || miniDrag) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  // à l'écran quand un bon tiers de la toile est visible ; hors de l'écran, le vide le reprend puis tout s'arrête
  new IntersectionObserver(([e]) => { on = e.isIntersecting; wake(); }, { threshold: 0.35 }).observe(stage);
  new ResizeObserver(layout).observe(stage);
  layout();
}

if (section) {
  // chargé quand la section approche, à un écran près, et jamais avant que la page ait fini de se charger (sur
  // téléphone, le hero est court : la section est proche dès l'ouverture, et ce modèle disputait le réseau à la page)
  const charge = () => new GLTFLoader().setDRACOLoader(draco).loadAsync(__MONDES__).then((gltf) => {
    try { start(gltf); } catch (err) { console.error(err); }
  }).catch(() => {});
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    if (document.readyState === 'complete') charge();
    else addEventListener('load', charge, { once: true });
  }, { rootMargin: '100% 0px' });
  io.observe(section);
}
