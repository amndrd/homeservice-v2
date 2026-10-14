// Pied de page (index.html et reserver.html, .ft) : celui du site Harborview (Projets/Harborview/app/chunks/layout :
// la classe du pied, ParticleText, la marquee), repris sans GSAP.
// 1. le défilé des services et des communes : la liste est recopiée autant de fois qu'il faut pour couvrir la largeur,
//    toutes les copies glissent ensemble à 40 px/s ; l'onglet choisi fait apparaître la sienne, sa pastille glisse ;
// 2. la langue (les trois ronds) passe par le sélecteur de la navbar (js/i18n.js) ;
// 3. le nom du site en points : le texte est dessiné hors écran, échantillonné tous les 4 px, chaque point part d'un
//    endroit au hasard et rejoint sa place ; la souris les repousse, ils reviennent (sur ordinateur ; ailleurs, les
//    points sont posés une fois pour toutes, sur deux lignes sur téléphone) ;
// 4. les apparitions au défilement (sur tablette et ordinateur) : textes balayés ligne à ligne (comme la section
//    « Book a call »), traits tirés de gauche à droite, blocs qui montent, photo qui se découvre.
(() => {
  const ft = document.querySelector('.ft');
  if (!ft) return;
  const q = (s) => ft.querySelector(s), qa = (s) => [...ft.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  const annee = q('.ft-annee');
  if (annee) annee.textContent = new Date().getFullYear();

  // le lien de la page où l'on est, en couleur (comme « Home » chez Harborview)
  const ici = /reserver\.html$/.test(location.pathname) ? 'reserver.html' : 'accueil';
  const courant = qa('.ft-nav .ft-link').find((a) => a.getAttribute('href').endsWith(ici));
  if (courant) { courant.classList.add('is-current'); courant.setAttribute('aria-current', 'page'); }

  // ------------------------------------------------------------ 1. défilé et onglets
  const PX_S = 40;
  const tracks = qa('.ft-marquee__track');
  const modeles = tracks.map((t) => t.querySelector('.ft-marquee__list').cloneNode(true));
  function marquee() {
    tracks.forEach((t, i) => {
      const liste = modeles[i].cloneNode(true);
      t.replaceChildren(liste);
      const w = liste.getBoundingClientRect().width;
      if (!w) return;
      const n = Math.ceil(Math.max(innerWidth, t.getBoundingClientRect().width) / w) + 1;
      for (let k = 1; k < n; k++) {
        const c = liste.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        c.querySelectorAll('a').forEach((a) => { a.tabIndex = -1; });
        t.appendChild(c);
      }
      t.querySelectorAll('.ft-marquee__list').forEach((l) => {
        l.style.setProperty('--dur', Math.ceil(w / PX_S) + 's');
        l.classList.add('is-moving');
      });
    });
  }
  // les textes changent de langue : les modèles suivent, puis tout est recopié
  addEventListener('hs:lang', () => {
    tracks.forEach((t, i) => { modeles[i] = t.querySelector('.ft-marquee__list').cloneNode(true); });
    marquee();
  });
  let lw = innerWidth;
  addEventListener('resize', () => { if (innerWidth !== lw) { lw = innerWidth; marquee(); } });
  ready.then(marquee);

  const btns = qa('.ft-switch__btn'), bg = q('.ft-switch__bg');
  btns.forEach((b, i) => b.addEventListener('click', () => {
    btns.forEach((x, j) => { x.classList.toggle('is-active', j === i); x.setAttribute('aria-selected', String(j === i)); });
    tracks.forEach((t, j) => t.classList.toggle('is-active', j === i));
    bg.style.setProperty('--i', i);
    bg.classList.remove('is-squash'); void bg.offsetWidth; bg.classList.add('is-squash');
  }));

  // ------------------------------------------------------------ 3. le nom en points
  const NOM = 'HomeService BXL', NOM_2 = ['HomeService', 'BXL'];
  const wrap = q('.ft__logo-canvas'), canvas = wrap?.querySelector('canvas');
  const vivant = () => matchMedia('(min-width: 992px) and (hover: hover)').matches && !reduced;
  let pts = [], mouse = { x: -1e4, y: -1e4, actif: false, t: 0 }, visible = false, ctx = null, dpr = 1, raf = 0;
  // le texte, dessiné serré sur une toile hors écran
  function source(lignes) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const F = 200, font = `500 ${F}px "Helvetica Neue", Arial, sans-serif`;
    g.font = font;
    const m = lignes.map((l) => g.measureText(l));
    const asc = Math.max(...m.map((x) => x.actualBoundingBoxAscent)), desc = Math.max(...m.map((x) => x.actualBoundingBoxDescent));
    const lh = asc + desc, pas = lh * 0.28;
    const w = Math.ceil(Math.max(...m.map((x) => x.actualBoundingBoxLeft + x.actualBoundingBoxRight)));
    c.width = w + 4; c.height = Math.ceil(lh * lignes.length + pas * (lignes.length - 1)) + 4;
    g.font = font;
    g.fillStyle = getComputedStyle(ft).getPropertyValue('--ft-main').trim() || '#111';
    lignes.forEach((l, i) => g.fillText(l, 2 + m[i].actualBoundingBoxLeft, 2 + asc + i * (lh + pas)));
    return c;
  }
  function pose() {
    if (!canvas) return;
    const lignes = innerWidth <= 767 ? NOM_2 : [NOM];
    const img = source(lignes);
    // le cadre prend la hauteur du texte étalé sur toute la largeur (comme le logo de Harborview)
    const W = wrap.clientWidth;
    wrap.style.height = Math.round(W * img.height / img.width) + 'px';
    const H = wrap.clientHeight;
    dpr = Math.min(devicePixelRatio || 1, 2);
    const anim = vivant();
    const cw = anim ? W * 1.5 : W, ch = anim ? H * 3 : H;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    const k = Math.min(W * dpr / img.width, H * dpr / img.height);
    const iw = img.width * k, ih = img.height * k, ox = (canvas.width - iw) / 2, oy = (canvas.height - ih) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, ox, oy, iw, ih);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gap = Math.round(4 * dpr), size = 2 * dpr;
    pts = [];
    for (let y = Math.max(0, Math.floor(oy)); y < Math.min(canvas.height, Math.ceil(oy + ih)); y += gap)
      for (let x = Math.max(0, Math.floor(ox)); x < Math.min(canvas.width, Math.ceil(ox + iw)); x += gap) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] > 0) pts.push({ ox: x, oy: y, x: anim ? Math.random() * canvas.width : x, y: anim ? Math.random() * canvas.height : y,
          vx: 0, vy: 0, ease: 0.04 + Math.random() * 0.04, te: 0.2 + Math.random() * 0.2, fr: 0.8 + Math.random() * 0.15, size,
          c: `rgba(${data[i]}, ${data[i + 1]}, ${data[i + 2]}, ${data[i + 3] / 255})` });
      }
    if (anim) { if (visible) boucle(); } else dessine();
  }
  function dessine() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // sur un écran standard, la toile de Harborview est un peu floue (tailles non entières) et ses points sortent gris
    // clair : même teinte ici ; sur un écran Retina, les points sont pleins chez eux comme ici
    ctx.globalAlpha = dpr < 1.5 ? 0.45 : 1;
    for (const p of pts) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
  }
  const R2 = 3000, R = Math.sqrt(R2);
  function pas() {
    raf = 0;
    if (!visible) return;
    const r2 = R2 * dpr, r = R * Math.sqrt(dpr);
    if (mouse.actif && performance.now() - mouse.t > 100) mouse.actif = false;
    for (const p of pts) {
      if (mouse.actif) {
        const dx = mouse.x - p.x, dy = mouse.y - p.y, d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          p.ease = p.te;
          const d = Math.sqrt(d2) || 1, f = -((r - d) / r) * 150 * (0.5 + Math.random());
          p.vx += dx / d * f + (Math.random() - 0.5);
          p.vy += dy / d * f + (Math.random() - 0.5);
        }
      }
      p.x += (p.vx *= p.fr) + (p.ox - p.x) * p.ease;
      p.y += (p.vy *= p.fr) + (p.oy - p.y) * p.ease;
    }
    dessine();
    boucle();
  }
  const boucle = () => { if (!raf) raf = requestAnimationFrame(pas); };
  if (canvas) {
    let pret = false;
    new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      if (visible && !pret) { pret = true; ready.then(pose); }
      else if (visible && vivant()) boucle();
    }).observe(wrap);
    addEventListener('mousemove', (e) => {
      if (!visible || !vivant()) return;
      const b = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - b.left) * dpr; mouse.y = (e.clientY - b.top) * dpr;
      mouse.actif = true; mouse.t = performance.now();
    }, { passive: true });
    let rw = innerWidth;
    addEventListener('resize', () => { if (pret && innerWidth !== rw) { rw = innerWidth; pose(); } });
  }

  // ------------------------------------------------------------ 4. apparitions au défilement
  if (reduced || innerWidth <= 767 || !('IntersectionObserver' in window)) return;
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const io = (el, fn, marge) => {
    const o = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { o.disconnect(); fn(); } }, { rootMargin: marge });
    o.observe(el);
  };
  const ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),          // power1.inOut
    out: (t) => 1 - (1 - t) ** 2,                                         // power1.out
    p3: (t) => 1 - (1 - t) ** 4,                                          // power3.out
    expo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),                     // expo.out
  };
  const tween = (dur, f, e, fin) => {
    let t0 = null;
    const step = (now) => {
      if (t0 === null) t0 = now;
      const u = Math.min(1, (now - t0) / dur);
      f(e(u));
      if (u < 1) requestAnimationFrame(step); else fin?.();
    };
    requestAnimationFrame(step);
  };
  // le balayage d'un texte : découpé en lignes (les <br> restent des retours), chaque ligne se colore de gauche à droite
  function balaye(el, delai) {
    const html = el.innerHTML;
    const segs = html.split(/<br\s*\/?>/i).map((h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.trim(); });
    el.innerHTML = segs.map((s) => s.split(/[ \n\t]+/).filter(Boolean).map((w) => `<span>${esc(w)}</span>`).join(' ')).join('<br>');
    const lignes = [];
    let top = null;
    for (const s of el.querySelectorAll('span')) {
      if (s.offsetTop !== top) { lignes.push([]); top = s.offsetTop; }
      lignes[lignes.length - 1].push(s.textContent);
    }
    const fin = getComputedStyle(el).color;
    el.innerHTML = lignes.map((l) => `<span class="cta-line" style="--fin:${fin};--p:30">${esc(l.join(' '))}</span>`).join('');
    const ls = [...el.children];
    setTimeout(() => ls.forEach((l, i) => setTimeout(() => tween(1200, (v) => l.style.setProperty('--p', (30 + 70 * v).toFixed(2)),
      ease.inOut, i === ls.length - 1 ? () => { el.innerHTML = html; } : null), i * 100)), delai);
  }
  const trait = (el, delai) => { el.classList.add('ft-line-anim');
    return () => setTimeout(() => tween(1200, (v) => { el.style.transform = `scaleX(${v})`; }, ease.out, () => { el.classList.remove('ft-line-anim'); el.style.transform = ''; }), delai); };
  const monte = (el, delai, cls = 'ft-up') => { el.classList.add(cls);
    const cs = getComputedStyle(el), [x, y] = cs.translate === 'none' ? [0, 0] : cs.translate.split(' ').map(parseFloat).concat(0);
    return () => setTimeout(() => tween(1000, (v) => { el.style.opacity = v; el.style.translate = `${x * (1 - v)}px ${(y || 0) * (1 - v)}px`; }, ease.p3,
      () => { el.classList.remove(cls); el.style.opacity = ''; el.style.translate = ''; }), delai); };
  // un groupe : ses éléments partent l'un après l'autre (pas de 0,1 s, ou 0,02 s pour les longs) quand son déclencheur
  // passe aux 85 % de l'écran ; les textes sont découpés (cachés) un écran plus tôt
  function groupe(declencheur, items, pas = 100) {
    if (!declencheur) return;
    const prep = [];
    io(declencheur, () => ready.then(() => {
      items.forEach(([type, el, d], i) => {
        if (!el) return;
        const delai = d ?? i * pas;
        if (type === 'txt') { el.classList.add('ft-hide'); prep.push(() => { el.classList.remove('ft-hide'); balaye(el, delai); }); }
        else prep.push((type === 'line' ? trait : type === 'left' ? (e, t) => monte(e, t, 'ft-left') : monte)(el, delai));
      });
      io(declencheur, () => prep.forEach((f) => f()), '0px 0px -15% 0px');
    }), '0px 0px 100% 0px');
  }
  const t = (s) => ['txt', q(s)], ts = (s) => qa(s).map((e) => ['txt', e]);
  groupe(q('.ft__sub'), [t('.ft__sub p'), ['line', q('.ft__side .ft__line')], ['line', q('.ft__menu > .ft__line'), 200]]);
  groupe(q('.ft__menu'), [...ts('.ft__menu .ft-label'), ...qa('.ft-nav .ft-roll__t').map((e) => ['txt', e]), t('.ft__devis-txt'),
    ['up', q('.ft__devis .ft-arrow')]]);
  groupe(q('.ft__info'), [['up', q('.ft-switch')], ['left', q('.ft-marquee')]], 20);
  groupe(q('.ft__main'), [...qa('.ft__main-line').map((e) => ['line', e]), ...ts('.ft__main .ft-label'), ...ts('.ft__main .ft-txt'),
    ...qa('.ft__main .ft-roll__t').map((e) => ['up', e]), ['up', q('.ft__zone .ft-arrow')], ['up', q('.ft__map')]], 20);
  groupe(q('.ft__bot'), [['line', q('.ft__bot .ft__line')], t('.ft__copy'), t('.ft__legal')]);
})();
