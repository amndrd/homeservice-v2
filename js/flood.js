// Du hero à l'À propos, au fil du défilement.
// 1. Le vert du site monte du bas de l'écran et le remplit, avec le front rongé du voile des onglets (js/veil.js :
//    même shader, même bruit), sans le logo. Il appartient au hero : il reste en place derrière l'À propos.
// 2. Quand il couvre 80 % de l'écran, l'À propos arrive et reste fixe le temps de ses apparitions, reprises du plan 1
//    du site immersif (homeservice-immersive/web/js/app.js : inkMaterial, wordsLit, photoMat, photoAt) : tous les
//    mots sont là à 16 %, ils s'allument un à un, la partie en couleur passe au vert avec son premier mot ; la photo
//    s'ouvre depuis son centre derrière un bord ondulé et net, celui du vide. Ici, tout est lié au défilement, sans
//    retard ni fondu dans le temps : on avance, ça apparaît ; on s'arrête, ça s'arrête.
// 3. Puis l'À propos défile vers le haut sur le vert, et la page reprend son cours.
// Tout se rejoue à l'envers en remontant.
(() => {
  const track = document.querySelector('.hero-track');
  const hero = document.querySelector('.hero');
  const aboutTrack = document.querySelector('.about-track');
  const about = document.querySelector('.about');
  if (!track || !hero || !about || !aboutTrack) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const span = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  const sms = (a, b, x) => { const t = span(a, b, x); return t * t * (3 - 2 * t); };

  // La course, en écrans de défilement (1 = la hauteur de la fenêtre)
  const FILL = 1.2;                               // le vert monte de 0 à FILL
  const START = 0.8;                              // l'À propos commence quand le vert couvre 80 % de sa course
  const AT = FILL * START;                        // … soit à ce point de la course
  // À partir de AT : [arrivée du texte à 16 % et de la photo], [mots allumés], [ouverture de la photo], fin de la
  // pause (l'À propos repart ensuite vers le haut)
  const ARRIVE = [0, 0.15], WORDS = [0.1, 1.5], PHOTO = [0.3, 1.6], HOLD = 2.0;
  const SMOOTH = 7;                               // rappel de l'amorti du vert (1/s)
  const GREEN = [0x11 / 255, 0x70 / 255, 0x3f / 255];   // --green

  // hauteurs de la course : l'À propos reste fixe de AT à AT + HOLD, puis défile d'un écran sur le vert encore fixe
  const marks = { home: document.getElementById('accueil'), about: document.getElementById('a-propos') };
  function layout() {
    const vh = window.innerHeight;
    aboutTrack.style.height = `${(1 + AT + HOLD) * vh}px`;
    if (marks.home) { marks.home.style.top = '0px'; marks.home.style.height = `${(AT + 0.5) * vh}px`; }
    if (marks.about) {
      marks.about.style.top = `${(AT + 0.5) * vh}px`;
      marks.about.style.height = `${(HOLD + 0.5) * vh}px`;
      // la navbar mène à l'À propos entièrement apparu (mots allumés, photo ouverte)
      marks.about.style.scrollMarginTop = `${-(AT + PHOTO[1] + 0.1 - (AT + 0.5)) * vh}px`;
    }
  }

  // état du défilement (déclaré avant la photo : chargée depuis le cache, elle relance l'image aussitôt)
  let target = 0, s = -1, raf = 0, last = 0, jump = true;

  // ------------------------------------------------------------ le vert : le shader du voile, sans logo
  const { VERT, FRAG, VEIL_M = 20, EDGE_W = 6 } = window.hsVeil?.shader ?? {};
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

  const flood = document.createElement('canvas');
  flood.className = 'hero__flood';
  flood.setAttribute('aria-hidden', 'true');
  hero.appendChild(flood);
  let fgl = null, FU = null;
  if (FRAG && !reduced) {
    fgl = flood.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
    const prog = fgl && program(fgl, VERT, FRAG);
    if (prog) {
      FU = {};
      for (const k of ['uTop', 'uBot', 'uAspect', 'uCol', 'uLogoOn']) FU[k] = fgl.getUniformLocation(prog, k);
      fgl.uniform3fv(FU.uCol, GREEN);
      fgl.uniform1f(FU.uLogoOn, 0);
      fgl.uniform1f(FU.uBot, -1.4);
    }
  }
  if (!FU) hero.classList.add('hero--flat');     // sans WebGL ou en mouvement réduit : le vert arrive en fondu (CSS)
  const TOP0 = -0.25, TOP1 = 1.05 + EDGE_W / VEIL_M;   // hors de l'écran, puis l'écran plein, sans trou
  function drawFlood(k) {
    const full = k >= 1;
    if (root.classList.contains('flooded') !== full) {
      root.classList.toggle('flooded', full);    // écran plein : l'îlot, caché, ne se dessine plus (js/hero.js)
      window.dispatchEvent(new Event('hs:flood'));
    }
    if (!FU) { hero.classList.toggle('hero--green', k > 0.5); return; }
    fgl.uniform1f(FU.uAspect, fit(flood, fgl, hero, 1.5));
    fgl.uniform1f(FU.uTop, lerp(TOP0, TOP1, k));
    fgl.clearColor(0, 0, 0, 0);
    fgl.clear(fgl.COLOR_BUFFER_BIT);
    if (k > 0) fgl.drawArrays(fgl.TRIANGLE_STRIP, 0, 4);
  }

  // ------------------------------------------------------------ le texte : un mot après l'autre
  const textBox = about.querySelector('.about__text');
  const src = textBox?.querySelector('[data-i18n="about"]');
  let words = [], accent = null, accentFirst = -1, lit = -1;
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
    lit = -1;
  }
  // x mots allumés (réel) : chaque mot passe de 16 % à 100 % pendant que le défilement avance d'un mot, la partie
  // en couleur passe au vert au même rythme que son premier mot
  function light(x) {
    if (x === lit) return;
    lit = x;
    words.forEach((w, i) => { w.style.opacity = (0.16 + 0.84 * clamp(x - i, 0, 1)).toFixed(3); });
    if (accent) accent.style.setProperty('--lit', accentFirst >= 0 ? clamp(x - accentFirst, 0, 1).toFixed(3) : '0');
  }

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
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    s = jump || reduced ? target : s + (target - s) * (1 - Math.exp(-dt * SMOOTH));
    if (Math.abs(target - s) < 1e-4) s = target;
    drawFlood(clamp(s / FILL, 0, 1));
    // l'À propos suit le défilement réel
    const a = target - AT;
    const k1 = sms(ARRIVE[0], ARRIVE[1], a);
    about.style.setProperty('--arrive', k1.toFixed(3));
    about.classList.toggle('about--here', k1 > 0);
    light(reduced ? words.length : span(WORDS[0], WORDS[1], a) * words.length);
    drawPhoto(reduced ? (a > 0 ? 1 : 0) : sms(PHOTO[0], PHOTO[1], a), k1);
    jump = false;
    raf = s === target ? 0 : requestAnimationFrame(frame);
  }

  split();
  // changement de langue (js/i18n.js réécrit le texte sous le voile) : on redécoupe, sans fondu
  window.addEventListener('hs:lang', () => { split(); read(); });
  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', () => { layout(); jump = true; read(); });
  layout();
  read();
})();
