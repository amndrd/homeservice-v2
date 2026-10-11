// Les chiffres sur le mur (ordinateur) : ils s'additionnent. À chaque pas de défilement dans la section
// (window.hsStats.active, js/stats.js), le chiffre suivant s'ajoute sous les précédents, qui restent ; en remontant,
// le dernier arrivé repart.
// Chaque chiffre est écrit sur le mur : il sort du vide quand il arrive, et y retourne quand il repart.
// (Depuis le 2026-10-11, les trois chiffres arrivent ensemble ; la progression sous les creux est retirée : PROGRESS.on.)
// (Essayés puis retirés le 2026-10-11 : les chiffres sur des cartes blanches ; une illustration du premier chiffre à
// la place de son creux, images/services-studio.webp — son code reste, dormant : FLAT_ON.)
// LE VIDE : exactement celui de l'îlot du hero (js/hero.js : REVEAL, VOID_FN), à plat. Même bruit, même échelle à
// l'écran (10 m par hauteur d'écran), même bord ondulé, de profondeur constante, et même allure du front : il part du
// centre et passe sur toute l'image à la même vitesse, jusqu'à ses bords ; pour disparaître, il revient du bord vers
// le centre, à la même vitesse.
// Rien n'est lié au défilement : tout se joue dans le temps. Le texte est celui de la page (traduit, décompté par
// js/stats.js), redessiné dans une image mot par mot, exactement à sa place dans la carte (la mise en page HTML fait
// foi : rien ne déborde) ; le HTML reste pour les lecteurs d'écran, invisible (html.statsVoid). Sans WebGL : le
// texte HTML, en fondu (css).
const box = document.querySelector('.stats');
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;

// le vide de l'îlot (js/hero.js : REVEAL) : [m par hauteur d'écran, fréquences des deux octaves du bruit (1/m),
//  profondeur du bord (m), allure du front (m/s : celle de l'apparition de l'îlot, de son rayon de départ à son rayon
//  final en 3,6 s), rayon où rien n'est encore découvert (m), part de lissage de l'allure (celle de l'îlot)]
const VOID = { screen: 10, f1: 0.66, f2: 3.8, edge: 3.0, speed: (5.6 + 1.0 + 1.6) / 3.6, none: -3.0, ease: 0.35 };
// le texte d'un chiffre est bien plus petit que l'îlot : même vide, mais son front part déjà découvert à quelques
// taches près (TEXT.start, m : il apparaît aussitôt) et va plus vite (× TEXT.pace) : il suit le chiffre qu'on amène
const TEXT = { start: -1.4, pace: 2.6 };
// le bord du vide, à plat : > 0 découvert (m) — VD_NOISE et voidAt de js/hero.js, P = (x, 0, y)
const VOID_GLSL = `
float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vdNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float voidAt(float R, vec2 p, vec2 seed) {
  vec3 P = vec3(p.x + seed.x, 0.0, p.y + seed.y);
  float n = vdNoise(P * ${VOID.f1.toFixed(2)}) * 0.75 + vdNoise(P * ${VOID.f2.toFixed(2)}) * 0.25;
  return R - length(p) + n * ${VOID.edge.toFixed(1)};
}`;
// l'allure du front, comme celle de l'îlot : presque constante, un rien plus douce au départ et à l'arrivée
const voidEase = (u) => u + (u * u * (3 - 2 * u) - u) * VOID.ease;

// [netteté (px d'image par px d'écran, au plus) ; marge de l'image du texte (px)]
const CARD = { sharp: 2, pad: 8 };
// la progression : son écart sous le bas du plus grand creux (px)
const PROGRESS = { on: false, gap: 36 };
const FLAT_ON = false;
// l'illustration du premier chiffre : son image, sa hauteur rapportée à celle du groupe d'objets des creux, sa largeur
// rapportée à sa hauteur, de combien son centre est sous celui du groupe (part de sa hauteur : il y a plus de place
// sous le groupe, pour son ombre) (blender/scripts/plat/studio.py : studio_frame.json)
const FLAT = { src: 'images/services-studio.webp', scale: 3.1245 / 2.674, aspect: 1600 / 1174, dy: 0.185 / 3.1245 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// la place des creux, donnée par js/statsmur.js : centre (part de la largeur de l'écran), hauteur du groupe du
// premier (part de la hauteur de l'écran), bas du plus grand sous leur centre (part de la hauteur de l'écran)
let first = { x: 0.3, h: 0.54, below: 0.32 }, onFirst = null;
export function setFirst(x, h, below) { first = { x, h, below }; onFirst?.(); }

// une toile WebGL qui dessine des images derrière le bord du vide
function voidCanvas(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `attribute vec2 aPos; varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision highp float;
    uniform sampler2D uImg; uniform float uR, uPx, uAlpha; uniform vec2 uSize, uSeed; varying vec2 vUv;
    ${VOID_GLSL}
    void main() {
      vec2 p = (vUv - 0.5) * uSize;                                    // en m, depuis le centre
      float a = clamp(voidAt(uR, p, uSeed) / uPx + 0.5, 0.0, 1.0);      // bord net, lissé sur un pixel
      if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }
      gl_FragColor = texture2D(uImg, vUv) * a * uAlpha;
    }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const k of ['uImg', 'uR', 'uPx', 'uSize', 'uSeed', 'uAlpha']) U[k] = gl.getUniformLocation(prog, k);
  gl.uniform1i(U.uImg, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  return {
    texture() {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      return tex;
    },
    upload(tex, img) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    },
    // la toile à la taille de son élément, vidée
    begin(pr) {
      const cw = Math.max(1, Math.round(canvas.clientWidth * pr)), ch = Math.max(1, Math.round(canvas.clientHeight * pr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    // une image dans le rectangle (px de toile, y depuis le haut), le front du vide à R (m) ; mpp : m par px de toile
    draw(tex, x, y, w, h, R, mpp, seed, alpha = 1) {
      if (alpha <= 0.001) return;
      gl.viewport(Math.round(x), Math.round(canvas.height - y - h), Math.round(w), Math.round(h));
      gl.uniform2f(U.uSize, w * mpp, h * mpp);
      gl.uniform1f(U.uPx, mpp);
      gl.uniform1f(U.uR, R);
      gl.uniform2f(U.uSeed, seed, seed * 0.61);
      gl.uniform1f(U.uAlpha, alpha);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
  };
}

// le front d'une image qui sort du vide ou y retourne, à l'allure de l'îlot : v (0 → 1) avance d'autant que le front
// parcourt de mètres ; R (m) : de « rien » à la demi-diagonale de l'image (tout est découvert)
function front(o, goal, dt, half, none = VOID.none, pace = 1) {
  const span = half + 0.05 - none;
  o.v = clamp(o.v + Math.sign(goal - o.v) * dt * VOID.speed * pace / span, 0, 1);
  return o.v <= 0 ? VOID.none : none + span * voidEase(o.v);
}

function start() {
  const list = box.querySelector('.stats__list');
  const items = [...box.querySelectorAll('.stat')];
  if (!list || !items.length) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'stats__vide';
  canvas.setAttribute('aria-hidden', 'true');
  list.prepend(canvas);
  const V = voidCanvas(canvas);
  if (!V) { canvas.remove(); return; }
  const rows = items.map((li, i) => ({ li, i, tex: V.texture(), img: document.createElement('canvas'), key: '',
    t: { v: 0 }, seed: 11 + i * 23.7 }));
  root.classList.add('statsVoid');                  // le texte HTML s'efface (css) : la toile le dessine

  // chaque mot du texte dans son <span> (une fois, et après chaque changement de langue) : sa place exacte se lit
  function split(li) {
    for (const el of li.querySelectorAll('.stat__text [data-i18n], .stat__text [data-i18n] strong')) {
      for (const n of [...el.childNodes]) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const frag = document.createDocumentFragment();
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const w = document.createElement('span');
          w.className = 'stat__w';
          w.textContent = part;
          frag.append(w);
        }
        n.replaceWith(frag);
      }
    }
  }
  for (const r of rows) split(r.li);

  // l'image du texte d'un chiffre : chaque mot (et le chiffre, et son unité) à sa place dans la carte, dans sa police
  // et sa couleur, comme le dessine la page
  function paint(r, pr) {
    const li = r.li, pad = CARD.pad;
    const words = [li.querySelector('.stat__count'), li.querySelector('.stat__unit'), ...li.querySelectorAll('.stat__w')]
      .filter((e) => e && e.textContent);
    const lr = li.getBoundingClientRect();
    const at = (e) => { const b = e.getBoundingClientRect(); return [b.left - lr.left, b.top - lr.top]; };
    const W = Math.round((li.offsetWidth + 2 * pad) * pr), H = Math.round((li.offsetHeight + 2 * pad) * pr);
    const places = words.map((e) => [e.textContent, ...at(e)]);
    const key = JSON.stringify([W, H, places]);
    if (key === r.key) return;
    r.key = key;
    const img = r.img;
    img.width = W; img.height = H;
    const c = img.getContext('2d');
    c.clearRect(0, 0, W, H);
    c.textBaseline = 'alphabetic';
    words.forEach((e, k) => {
      const cs = getComputedStyle(e);
      c.font = `${cs.fontWeight} ${parseFloat(cs.fontSize) * pr}px ${cs.fontFamily}`;
      if ('letterSpacing' in c) c.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : `${parseFloat(cs.letterSpacing) * pr}px`;
      c.fillStyle = cs.color;
      const m = c.measureText(e.textContent);
      const [, x, y] = places[k];
      // le haut de la boîte d'un mot est le haut de sa police : la ligne de base est une hauteur de police plus bas
      // (dans la place du chiffre)
      c.fillText(e.textContent, (x + pad) * pr, (y + pad) * pr + m.fontBoundingBoxAscent);
    });
    V.upload(r.tex, img);
  }

  // l'illustration du premier chiffre, dans sa propre toile, à la place des creux (collante avec la scène, que
  // js/statsmur.js pose au chargement de l'îlot)
  // et la progression, dans la même scène
  let stage = null, flat = null, progress = null;
  function makeFlat() {
    if (stage) return;
    stage = box.querySelector('.stats__stage');
    if (!stage) return;
    if (PROGRESS.on) {                              // (retirée le 2026-10-11 : les chiffres arrivent ensemble)
      progress = document.createElement('div');
      progress.className = 'stats__progress';
      progress.setAttribute('aria-hidden', 'true');
      progress.append(...rows.map(() => document.createElement('span')));
      stage.append(progress);
    }
    if (!FLAT_ON) return;
    const fc = document.createElement('canvas');
    fc.className = 'stats__flat';
    fc.setAttribute('aria-hidden', 'true');
    stage.append(fc);
    const FV = voidCanvas(fc);
    if (!FV) { fc.remove(); return; }
    flat = { canvas: fc, V: FV, tex: FV.texture(), ready: false, v: 0 };
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { FV.upload(flat.tex, img); flat.ready = true; wake(); };
    img.src = FLAT.src;
  }
  function placeFlat() {
    makeFlat();
    if (!stage) return;
    const vw = window.innerWidth, vh = window.innerHeight, sr = stage.getBoundingClientRect();
    if (progress) Object.assign(progress.style, { left: `${first.x * vw - sr.left}px`,
      top: `${sr.height / 2 + first.below * vh + PROGRESS.gap}px` });
    if (!flat) return;
    const h = first.h * FLAT.scale * vh, w = h * FLAT.aspect;
    Object.assign(flat.canvas.style, { width: `${w}px`, height: `${h}px`, left: `${first.x * vw - sr.left - w / 2}px`,
      top: `${(sr.height - h) / 2 + FLAT.dy * h}px` });
  }
  onFirst = () => { placeFlat(); wake(); };

  // la boucle : tant qu'un front avance, ou qu'un décompte tourne
  let raf = 0, last = 0;
  const counting = (r) => r.li.querySelector('.stat__count').textContent !== String(r.li.dataset.n);
  function frame(now) {
    raf = 0;
    const dt = clamp((now - last) / 1000 || 0, 0, 0.1);
    last = now;
    const active = window.hsStats?.active ?? -1;
    const pr = Math.min(window.devicePixelRatio || 1, CARD.sharp), mpp = VOID.screen / window.innerHeight / pr;
    let busy = false;
    V.begin(pr);
    for (const r of rows) {
      const on = r.i <= active;
      paint(r, pr);
      const R = front(r.t, on ? 1 : 0, dt, Math.hypot(r.img.width, r.img.height) / 2 * mpp, TEXT.start, TEXT.pace);
      if (r.t.v !== (on ? 1 : 0) || (on && counting(r))) busy = true;
      if (r.t.v <= 0.001) continue;
      V.draw(r.tex, (r.li.offsetLeft - CARD.pad) * pr, (r.li.offsetTop - CARD.pad) * pr, r.img.width, r.img.height, R, mpp,
        r.seed);
    }
    if (progress) {
      progress.classList.toggle('on', active >= 0);
      [...progress.children].forEach((sp, i) => sp.classList.toggle('on', i <= active));
    }
    if (flat) {
      const fw = flat.canvas.clientWidth * pr, fh = flat.canvas.clientHeight * pr;
      const goal = active === 0 && flat.ready ? 1 : 0;
      const R = front(flat, goal, dt, Math.hypot(fw, fh) / 2 * mpp);
      if (flat.v !== goal) busy = true;
      flat.V.begin(pr);
      if (flat.ready && flat.v > 0) flat.V.draw(flat.tex, 0, 0, fw, fh, R, mpp, 7.3);
    }
    if (busy) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('hs:stats', wake);
  window.addEventListener('resize', () => { placeFlat(); wake(); });
  // js/i18n.js réécrit le texte : on redécoupe les mots
  window.addEventListener('hs:lang', () => { for (const r of rows) { split(r.li); r.key = ''; } requestAnimationFrame(wake); });
  document.fonts?.ready.then(() => { for (const r of rows) r.key = ''; wake(); });
  placeFlat();
  wake();
}

if (box && desktop && !reduced) start();
