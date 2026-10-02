// Navbar et transitions entre pages, reprises du site immersif (homeservice-immersive/web/js/app.js, « onglets »).
// Un clic sur un lien de la navbar fait monter du bas de l'écran un voile bleu encre frappé du logo, au bord rongé
// comme une feuille qui brûle (le même bruit que le vide de la scène 3D) ; une fois l'écran couvert, on change de
// page, et sur la nouvelle page le voile sort par le haut. Le changement de langue passe sous le même voile.
// WebGL pur : pas besoin de three.js pour un rectangle plein écran.
(() => {
  const VEIL_COVER = 0.92, VEIL_CLEAR = 0.95;      // durées (s) : le front va assez lentement pour qu'on voie
                                                   // sa dentelle, et l'écran n'est plein qu'un instant
  const VEIL_COL = [0x0f / 255, 0x1a / 255, 0x2c / 255];   // bleu encre du site (--ink)
  const VEIL_M = 20;                               // hauteur d'écran, en mètres de sol : l'échelle du bord du vide
  const EDGE_W = 6.0;                              // profondeur du bord irrégulier (m)
  const VEIL_LOGO_H = 0.075;                       // hauteur du logo, en fraction de la hauteur d'écran
  const KEY = 'hs-veil';                           // sessionStorage : la page suivante arrive sous le voile
  const root = document.documentElement;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const VERT = `attribute vec2 aPos; varying vec2 vUv;
    void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FRAG = `precision highp float;
    uniform float uTop, uBot, uAspect; uniform vec3 uCol; uniform sampler2D uLogo; uniform vec2 uLogoSize;
    varying vec2 vUv;
    float vdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vdNoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(vdHash(i), vdHash(i + vec3(1, 0, 0)), f.x), mix(vdHash(i + vec3(0, 1, 0)), vdHash(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(vdHash(i + vec3(0, 0, 1)), vdHash(i + vec3(1, 0, 1)), f.x), mix(vdHash(i + vec3(0, 1, 1)), vdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    void main() {
      // l'écran vu comme un sol de ${VEIL_M} m de haut, le front y avance sur le bruit du vide (deux octaves) : des
      // îlots subsistent au-delà du front, des trous s'ouvrent
      vec3 w = vec3(vUv.x * uAspect, 0.0, vUv.y) * ${VEIL_M.toFixed(1)};
      float n = vdNoise(w * 0.33) * 0.75 + vdNoise(w * 1.9) * 0.25;
      float raw = max(vUv.y - uTop, uBot - vUv.y) * ${VEIL_M.toFixed(1)};   // > 0 : hors du voile
      float a = step(raw + n * ${EDGE_W.toFixed(1)}, 0.0);
      // le logo, petit et blanc au centre de l'écran, peint sur le voile
      vec2 lq = (vUv - 0.5) * vec2(uAspect, 1.0) / uLogoSize + 0.5;
      vec4 logo = texture2D(uLogo, lq);
      float inLogo = step(0.0, lq.x) * step(lq.x, 1.0) * step(0.0, lq.y) * step(lq.y, 1.0);
      gl_FragColor = vec4(mix(uCol, logo.rgb, logo.a * inLogo) * a, a);
    }`;

  // ------------------------------------------------------------ toile et shader
  const canvas = document.createElement('canvas');
  canvas.className = 'veil-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
  let U = null, ready = false;
  if (gl) {
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      U = {};
      for (const k of ['uTop', 'uBot', 'uAspect', 'uCol', 'uLogo', 'uLogoSize']) U[k] = gl.getUniformLocation(prog, k);
      gl.uniform3fv(U.uCol, VEIL_COL);
      gl.uniform1i(U.uLogo, 0);
    }
  }
  const logo = new Image();
  const logoReady = new Promise((res) => {
    if (!U) return res(false);
    logo.onload = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, logo);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      gl.uniform2f(U.uLogoSize, VEIL_LOGO_H * logo.naturalWidth / logo.naturalHeight, VEIL_LOGO_H);
      ready = true;
      res(true);
    };
    logo.onerror = () => res(false);
    logo.src = new URL('../images/logo-blanc.png', document.currentScript.src).href;
  });

  function draw(top, bot) {
    const w = window.innerWidth, h = window.innerHeight, pr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.round(w * pr), ch = Math.round(h * pr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.uniform1f(U.uAspect, w / h);
    gl.uniform1f(U.uTop, top);
    gl.uniform1f(U.uBot, bot);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    canvas.style.visibility = 'visible';
  }
  function hide() {
    if (U) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    canvas.style.visibility = 'hidden';
  }

  // ------------------------------------------------------------ passages du voile
  let busy = false;
  // phase 'cover' : le voile monte du bas et couvre l'écran ; phase 'clear' : il sort par le haut
  function run(phase, done) {
    const dur = phase === 'cover' ? VEIL_COVER : VEIL_CLEAR;
    let t0 = null;
    const frame = (now) => {
      if (t0 === null) t0 = now;
      const u = clamp((now - t0) / 1000 / dur, 0, 1);
      const e = lerp(u, u * u * (3 - 2 * u), 0.35);   // presque linéaire : le front se propage à vitesse lisible
      // le front dépasse l'écran de toute la profondeur du bord (EDGE_W / VEIL_M) : aucun trou à la fin
      if (phase === 'cover') draw(lerp(-0.25, 1.05 + EDGE_W / VEIL_M, e), -1.4);
      else draw(1.25, lerp(-0.2, 1.25, e));
      root.classList.remove('veil-in');            // la toile a pris le relais du fond de secours
      if (u < 1) requestAnimationFrame(frame);
      else done?.();
    };
    requestAnimationFrame(frame);
  }
  // couvre l'écran, exécute action à couvert ; false si le voile est indisponible (pas de WebGL, mouvement réduit)
  function cover(action) {
    if (!ready || reduced) return false;
    busy = true;
    run('cover', () => action());
    return true;
  }
  function clear() {
    busy = true;
    run('clear', () => { hide(); busy = false; });
  }

  // arrivée d'une transition : le voile couvre déjà (fond de secours html.veil-in), il sort par le haut.
  // Une page préparée d'avance (voir plus bas) attend d'être affichée pour le faire.
  const arrive = () => logoReady.then((ok) => (ok && !reduced ? clear() : root.classList.remove('veil-in')));
  if (document.prerendering) {
    document.addEventListener('prerenderingchange', () => {
      try { sessionStorage.removeItem(KEY); } catch {}
      arrive();
    }, { once: true });
  } else if (root.classList.contains('veil-in')) arrive();
  // retour arrière depuis le cache du navigateur : la page revient telle qu'on l'a quittée, voile fermé
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted || !busy) return;
    sessionStorage.removeItem(KEY);
    clear();
  });

  // ------------------------------------------------------------ pages préparées d'avance
  // Sans cela, la page suivante n'était demandée qu'une fois l'écran couvert, et l'image du voile restait figée le
  // temps qu'elle arrive. Chrome et Edge préparent la page en entier dès le survol d'un lien (elle s'affiche alors
  // d'un coup) ; les autres navigateurs la téléchargent au survol, ou au plus tard au clic, pendant que le voile monte.
  if (HTMLScriptElement.supports?.('speculationrules')) {
    const rules = document.createElement('script');
    rules.type = 'speculationrules';
    rules.textContent = JSON.stringify({ prerender: [{ source: 'document', where: { selector_matches: '[data-veil]' },
      eagerness: 'moderate' }] });
    document.head.appendChild(rules);
  }
  const fetched = new Set([location.pathname]);
  function prefetch(href) {
    const url = new URL(href, location.href);
    if (url.origin !== location.origin || fetched.has(url.pathname)) return;
    fetched.add(url.pathname);
    const l = document.createElement('link');
    l.rel = 'prefetch';
    l.href = url.href;
    document.head.appendChild(l);
  }

  // ------------------------------------------------------------ navigation : logo, onglets, devis
  function go(href) {
    if (busy) return;                              // un voile passe déjà : le clic est ignoré
    prefetch(href);
    const url = new URL(href, location.href);
    const ok = cover(() => {
      try { sessionStorage.setItem(KEY, '1'); } catch {}
      if (url.pathname === location.pathname) {    // même page : on remonte en haut, à couvert
        if (url.hash) location.hash = url.hash; else window.scrollTo(0, 0);
        try { sessionStorage.removeItem(KEY); } catch {}
        clear();
      } else location.href = url.href;
    });
    if (!ok) location.href = url.href;
  }
  document.querySelectorAll('[data-veil]').forEach((a) => {
    for (const ev of ['pointerenter', 'focus', 'touchstart']) a.addEventListener(ev, () => prefetch(a.href), { passive: true });
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // nouvel onglet, etc.
      e.preventDefault();
      go(a.href);
    });
  });

  window.hsVeil = { cover, clear, busy: () => busy };
})();
