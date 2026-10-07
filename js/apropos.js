// Du hero à l'À propos, au fil du défilement, sur le blanc de la page.
// 1. Sur ordinateur, sans mouvement réduit : le hero reste en place (collant) pendant LIFT écrans ; les objets de
//    l'îlot décollent et vont flotter pendant que le vide reprend l'îlot et le titre (js/hero.js, qui lit la course :
//    window.hsCourse). Puis la page reprend son cours : l'À propos monte juste en dessous, pendant que les objets
//    poursuivent leur trajet et sortent par le haut, devant lui (LEAVE écrans). Ailleurs, LIFT = 0 : le hero défile
//    simplement, l'îlot avec lui.
// 2. L'À propos, repris du plan 1 du site immersif (homeservice-immersive/web/js/app.js : inkMaterial, wordsLit,
//    photoMat, photoAt), défile comme une section de page : ses mots sont là à 16 % et s'allument un à un en passant
//    au milieu de l'écran, la partie en couleur passe au vert avec son premier mot ; la photo s'ouvre depuis son
//    centre, derrière un bord ondulé et net, celui du vide, en montant vers le milieu de l'écran. Tout est lié au
//    défilement : on avance, ça apparaît ; on s'arrête, ça s'arrête. Tout se rejoue à l'envers en remontant.
(() => {
  const track = document.querySelector('.hero-track');
  const hero = document.querySelector('.hero');
  const about = document.querySelector('.about');
  if (!track || !hero || !about) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const span = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  const sms = (a, b, x) => { const t = span(a, b, x); return t * t * (3 - 2 * t); };

  // La course, en écrans de défilement (1 = la hauteur de la fenêtre)
  // la lévitation : sur ordinateur seulement (même règle que js/hero.js)
  const lifts = !reduced && matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;
  const LIFT = lifts ? 2.0 : 0;                   // le hero reste en place : les objets décollent, le vide reprend l'îlot
  const LEAVE = 1.5;                              // puis l'À propos monte, les objets sortent par le haut, devant lui
  root.classList.toggle('lifts', LIFT > 0);       // la scène 3D reste fixée à l'écran (css : .scene)
  // le milieu de l'écran, en part de sa hauteur, que traversent les mots (de … à : ils s'allument) et la photo
  // (elle s'ouvre)
  const WORD = [0.62, 0.48], PHOTO = [0.92, 0.5];

  // la course du hero ; le repère de l'accueil dans la navbar la couvre
  const home = document.getElementById('accueil');
  function layout() {
    const vh = window.innerHeight;
    track.style.height = LIFT ? `${(1 + LIFT) * vh}px` : '';
    if (home) { home.style.top = '0px'; home.style.height = `${(LIFT + 0.5) * vh}px`; }
  }

  // état du défilement (déclaré avant la photo : chargée depuis le cache, elle relance l'image aussitôt)
  let target = 0, raf = 0;
  const scene3d = () => !!document.querySelector('#hero-scene canvas');   // posée par js/hero.js, chargé après
  // la course lue par l'îlot (js/hero.js) : écrans défilés, et la part de l'envol (0 → 1)
  window.hsCourse = { at: () => target, leave: () => clamp((target - LIFT) / LEAVE, 0, 1), LIFT, LEAVE };

  function program(gl, vert, frag) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    return prog;
  }
  function fit(canvas, gl, el, maxPr) {
    const w = el.clientWidth, h = el.clientHeight, pr = Math.min(window.devicePixelRatio || 1, maxPr);
    const cw = Math.max(1, Math.round(w * pr)), ch = Math.max(1, Math.round(h * pr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    return w / Math.max(1, h);
  }

  // ------------------------------------------------------------ le texte : un mot après l'autre
  const textBox = about.querySelector('.about__text');
  const src = textBox?.querySelector('[data-i18n="about"]');
  let words = [], accent = null, accentFirst = -1;
  function split() {                              // chaque mot dans son <span class="w">, la partie .accent repérée
    if (!src) return;
    words = []; accent = src.querySelector('.accent'); accentFirst = -1;
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const part of n.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const w = document.createElement('span');
          w.className = 'w';
          w.textContent = part;
          if (accent && accent.contains(n) && accentFirst < 0) accentFirst = words.length;
          words.push(w);
          frag.append(w);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(src);
  }
  // la lecture : pendant que le texte traverse le milieu de l'écran (WORD : son haut y entre, son bas en sort), les
  // mots s'allument l'un après l'autre, dans l'ordre de lecture, chacun de 16 % à 100 % le temps d'avancer d'un mot ;
  // la partie en couleur passe au vert au même rythme que son premier mot. En mouvement réduit, tout est allumé.
  const readAt = (r, vh) => span(0, r.height + (WORD[0] - WORD[1]) * vh, WORD[0] * vh - r.top) * words.length;
  function light(vh) {
    const read = readAt(textBox.getBoundingClientRect(), vh);
    const k = words.map((w, i) => (reduced ? 1 : clamp(read - i, 0, 1)));
    words.forEach((w, i) => { w.style.opacity = (0.16 + 0.84 * k[i]).toFixed(3); });
    if (accent) accent.style.setProperty('--lit', accentFirst >= 0 ? k[accentFirst].toFixed(3) : '0');
  }

  // ce que voit le papillon guide (js/hero.js), en part de l'écran, lu à l'instant : où en est la lecture (le mot qui
  // s'allume ; null si le texte n'est pas à l'écran), et où il peut se poser — sur le haut des mots qui commencent ou
  // finissent une ligne, et du premier de la partie en couleur ; le dernier mot est marqué (il le préfère, la lecture
  // finie)
  const onScreen = (r, vh) => r.bottom > 0 && r.top < vh;
  window.hsPage = {
    reading() {
      const vw = window.innerWidth, vh = window.innerHeight, r = textBox?.getBoundingClientRect();
      if (!r || !words.length || !onScreen(r, vh)) return null;
      const read = readAt(r, vh), w = words[clamp(Math.floor(read), 0, words.length - 1)].getBoundingClientRect();
      return { x: (w.left + w.right) / 2 / vw, y: (w.top + w.bottom) / 2 / vh, done: read >= words.length - 0.01,
        right: r.right / vw };
    },
    perches() {
      const vw = window.innerWidth, vh = window.innerHeight, n = words.length;
      if (!n) return [];
      const rects = words.map((w) => w.getBoundingClientRect());
      const ids = new Set([accentFirst, n - 1]);
      rects.forEach((r, i) => {                   // les bouts de ligne : là où la ligne change
        if (i === 0 || Math.abs(r.top - rects[i - 1].top) > 2) { ids.add(i); if (i > 0) ids.add(i - 1); }
      });
      return [...ids].filter((i) => i >= 0).map((i) => {
        const r = rects[i];
        return { id: i, x: (r.left + r.right) / 2 / vw, y: r.top / vh, yc: (r.top + r.bottom) / 2 / vh, w: r.width / vw,
          last: i === n - 1 };
      }).filter((p) => p.y > -1 && p.y < 2);      // même hors de l'écran : le guide sait où attendre le dernier mot
    },
  };

  // ------------------------------------------------------------ la photo : elle s'ouvre derrière le bord du vide
  // Le shader du site immersif (photoMat), à plat : la photo mesure PHOTO_W m de large ; une ouverture en rectangle
  // arrondi grandit depuis son centre, son bord est le bruit du vide (mêmes fréquences, bande de 6 m pendant
  // l'ouverture) ; sur la fin, la bande ondulée se resserre jusqu'à disparaître : ouverte, la photo est entière, aux
  // bords nets et aux coins arrondis comme les images du site (PHOTO_CORNER px). Le contour est lissé au pixel près.
  const PHOTO_W = 18.5, PHOTO_EDGE = 6.0, PHOTO_ROUND = 2.2, PHOTO_CORNER = 18;
  const photoBox = about.querySelector('.about__photo');
  const img = photoBox?.querySelector('img');
  const pCanvas = document.createElement('canvas');
  pCanvas.setAttribute('aria-hidden', 'true');
  let pgl = null, PU = null, photoReady = false, photoH = PHOTO_W * 0.75;
  if (img && !reduced) {
    photoBox.prepend(pCanvas);
    pgl = pCanvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    const prog = pgl && program(pgl, `attribute vec2 aPos; varying vec2 vUv;
      void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`, `precision highp float;
      uniform sampler2D uImg; uniform float uReveal, uAlpha, uPx, uCorner; uniform vec2 uSize; varying vec2 vUv;
      float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vdNoise(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        vec2 pm = vUv * uSize;                                          // en mètres, comme le vide
        vec3 w = vec3(pm.x + 31.0, 0.0, pm.y + 17.0);
        float n = vdNoise(w * 0.33) * 0.75 + vdNoise(w * 1.9) * 0.25;
        float edge = mix(${PHOTO_EDGE.toFixed(1)}, 0.0, smoothstep(0.55, 1.0, uReveal));   // le bord ondulé se resserre
        vec2 hs = uReveal * (uSize * 0.5 - edge);                       // l'ouverture grandit jusqu'au cadre
        float rc = min(mix(uReveal * ${PHOTO_ROUND.toFixed(1)}, uCorner, smoothstep(0.7, 1.0, uReveal)), min(hs.x, hs.y));
        vec2 q = abs(pm - uSize * 0.5) - hs + rc;
        float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rc;  // > 0 : hors de l'ouverture
        float a = clamp((-sd + (n - 1.0 + uReveal) * edge) / uPx + 0.5, 0.0, 1.0);   // bord lissé sur un pixel
        if (a <= 0.0) { gl_FragColor = vec4(0.0); return; }
        gl_FragColor = texture2D(uImg, vUv) * uAlpha * a;
      }`);
    if (prog) {
      PU = {};
      for (const k of ['uImg', 'uReveal', 'uAlpha', 'uSize', 'uPx', 'uCorner']) PU[k] = pgl.getUniformLocation(prog, k);
      pgl.uniform1i(PU.uImg, 0);
      const load = () => {
        const tex = pgl.createTexture();
        pgl.bindTexture(pgl.TEXTURE_2D, tex);
        pgl.pixelStorei(pgl.UNPACK_FLIP_Y_WEBGL, true);
        pgl.pixelStorei(pgl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        pgl.texImage2D(pgl.TEXTURE_2D, 0, pgl.RGBA, pgl.RGBA, pgl.UNSIGNED_BYTE, img);
        for (const [p, v] of [[pgl.TEXTURE_MIN_FILTER, pgl.LINEAR], [pgl.TEXTURE_MAG_FILTER, pgl.LINEAR],
          [pgl.TEXTURE_WRAP_S, pgl.CLAMP_TO_EDGE], [pgl.TEXTURE_WRAP_T, pgl.CLAMP_TO_EDGE]]) pgl.texParameteri(pgl.TEXTURE_2D, p, v);
        photoH = PHOTO_W * img.naturalHeight / img.naturalWidth;
        pgl.uniform2f(PU.uSize, PHOTO_W, photoH);
        photoReady = true;
        photoBox.classList.add('about__photo--gl');
        kick();
      };
      if (img.complete && img.naturalWidth) load(); else img.addEventListener('load', load, { once: true });
    }
  }
  function drawPhoto(open, alpha) {
    if (!photoReady) { if (img) img.style.opacity = String(Math.min(alpha, open > 0.02 ? 1 : 0)); return; }
    fit(pCanvas, pgl, pCanvas, 2);
    const mpp = PHOTO_W / Math.max(1, pCanvas.width);                   // mètres par pixel de la toile
    pgl.uniform1f(PU.uPx, mpp);
    pgl.uniform1f(PU.uCorner, PHOTO_CORNER * (pCanvas.width / Math.max(1, pCanvas.clientWidth)) * mpp);
    pgl.uniform1f(PU.uReveal, open);
    pgl.uniform1f(PU.uAlpha, alpha);
    pgl.clearColor(0, 0, 0, 0);
    pgl.clear(pgl.COLOR_BUFFER_BIT);
    if (open > 0.001 && alpha > 0.001) pgl.drawArrays(pgl.TRIANGLE_STRIP, 0, 4);
  }

  // ------------------------------------------------------------ défilement, image par image
  function read() {
    target = Math.max(0, -track.getBoundingClientRect().top / window.innerHeight);   // en écrans
    kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame() {
    raf = 0;
    const vh = window.innerHeight;
    // sans la scène 3D (pas de WebGL), le titre part en défilant pendant que le hero reste en place
    hero.style.setProperty('--leave', LIFT && !scene3d() ? `${(clamp(target, 0, LIFT) * vh).toFixed(1)}px` : '0px');
    const r = about.getBoundingClientRect();
    if (r.bottom < -vh || r.top > 2 * vh) return;   // loin de l'écran : rien à faire
    light(vh);
    const box = photoBox?.getBoundingClientRect();
    drawPhoto(reduced ? 1 : box ? sms(PHOTO[0] * vh, PHOTO[1] * vh, (box.top + box.bottom) / 2) : 1, 1);
  }

  split();
  // changement de langue (js/i18n.js réécrit le texte sous le voile) : on redécoupe, sans fondu
  window.addEventListener('hs:lang', () => { split(); read(); });
  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', () => { layout(); read(); });
  layout();
  read();
})();
