// La zone d'intervention (index.html, .zn) : un panneau plein écran. À gauche, la carte (dessinée ici, d'après
// js/zonedata.js) : les 19 communes de Bruxelles-Capitale (vert plein), sa périphérie (les communes qui la touchent,
// ainsi que Wezembeek-Oppem ; vert clair) et, autour, les communes suivantes (au-delà), qui s'effacent vers les bords ; des cercles de 10 et 20 km
// autour du centre de la région. Au survol (ou au toucher) d'une commune : son nom et sa zone ; un clic la choisit. À
// droite : les trois zones et leurs frais de déplacement, et « Réserver un appel » (qui emmène le code postal de la
// commune choisie sur la carte, s'il y en a une, sur la page de réservation).
// On l'ouvre depuis la carte creusée des chiffres (js/statsmur.js : la carte du mur s'agrandit jusqu'à remplir
// l'écran, et y revient à la fermeture), « Voir la zone » du pied de page, « Zone » du menu, une commune du défilé du
// pied de page (elle est alors choisie), ou une adresse qui finit par #zone (depuis la page de réservation). La croix
// ou Échap le referme ; la page ne défile pas pendant ce temps (html.svc-lock, comme la carte d'un service).
// window.hsZone : open({ from, nis }), hover(x, y, nis) (la pastille « Voir la zone » de la carte creusée).
import { KM, ZONE, REGION } from './zonedata.js';

(() => {
  const panel = document.querySelector('.zn');
  if (!panel) return;
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const q = (s) => panel.querySelector(s);
  const svg = q('.zn__svg'), tip = q('.zn__tip'), cta = q('.zn__cta'), closeBtn = q('.zn__close');
  const pill = document.querySelector('.zn-pill');

  // les textes qui changent avec la commune choisie (le reste : data-i18n, js/i18n.js)
  const T = {
    fr: { z: ['', 'Bruxelles-Capitale', 'Périphérie', 'Au-delà'], km: 'km' },
    en: { z: ['', 'Brussels-Capital', 'Outskirts', 'Further afield'], km: 'km' },
    nl: { z: ['', 'Brussel-Hoofdstad', 'Rand', 'Verder weg'], km: 'km' },
  };
  const lang = () => { const l = (root.lang || 'fr').slice(0, 2); return T[l] ? l : 'fr'; };
  const t = () => T[lang()];
  // le nom d'une commune dans la langue de la page (en anglais : le nom en usage sur place, néerlandais en Flandre)
  const flemish = (c) => (c.nis >= 23000 && c.nis < 25000) || c.nis === 41002;
  const name = (c) => (lang() === 'nl' || (lang() === 'en' && flemish(c)) ? c.nl : c.fr);
  const byNis = new Map(ZONE.map((c) => [c.nis, c]));

  // ------------------------------------------------------------ la carte
  // (y vers le nord dans les données, vers le bas dans le SVG) ; la vue : un carré de ±VIEW autour du centre de la
  // région, qui remplit sa case (les bords débordent), et s'efface au-delà de FADE
  const VIEW = 1.3, FADE = [1.05, 1.5];
  const P = (ring) => 'M' + ring.map(([x, y]) => `${x},${-y}`).join('L') + 'Z';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  };
  svg.setAttribute('viewBox', `${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  const world = el('g', { class: 'zn-world' }, svg);
  // l'effacement vers les bords : un masque CSS sur toute la carte (pas un <mask> SVG : au survol, Chrome ne redessine
  // que le rectangle de la commune, et l'y oubliait parfois — des caches de la couleur du fond) ; en px, d'après la
  // taille de la carte (la vue « slice » : ±VIEW sur le plus grand côté)
  function fade() {
    const w = svg.clientWidth, h = svg.clientHeight;
    if (!w || !h) return;
    const k = Math.max(w, h) / (2 * VIEW);
    const g = `radial-gradient(circle at 50% 50%, #000 ${Math.round(FADE[0] * k)}px, transparent ${Math.round(FADE[1] * k)}px)`;
    svg.style.webkitMaskImage = g;
    svg.style.maskImage = g;
  }
  addEventListener('resize', fade);
  // les cercles de distance
  const rings = el('g', { class: 'zn-rings' }, world);
  const ringLabels = [];
  for (const km of [10, 20]) {
    el('circle', { cx: 0, cy: 0, r: km * KM }, rings);
    // (son nom en haut à droite du cercle)
    const a = Math.PI / 4, lb = el('text', { x: km * KM * Math.cos(a), y: -km * KM * Math.sin(a) }, rings);
    ringLabels.push([lb, km]);
  }
  const cells = el('g', { class: 'zn-cells' }, world);
  // les plus loin d'abord : un contour commun se dessine par-dessus, du côté de Bruxelles
  for (const c of [...ZONE].sort((a, b) => b.z - a.z)) {
    const p = el('path', { class: `zn-c zn-z${c.z}`, d: c.p.map((poly) => poly.map(P).join('')).join(''), 'fill-rule': 'evenodd' }, cells);
    // une nuance par commune de la région (mêlées), pour les distinguer
    if (c.z === 1) p.style.setProperty('--k', ((ZONE.indexOf(c) * 0.618034 + 0.3) % 1).toFixed(3));
    p.dataset.nis = c.nis;
  }
  const outline = el('path', { class: 'zn-region', d: P(REGION) }, world);
  world.insertBefore(rings, outline);             // les cercles par-dessus les communes, sous le contour
  // les noms de la périphérie, écrits sur la carte (ceux de la région : au survol)
  const labels = el('g', { class: 'zn-labels', 'aria-hidden': 'true' }, world);
  const named = ZONE.filter((c) => c.z === 2).map((c) => [el('text', { x: c.l[0], y: -c.l[1] }, labels), c]);
  function writeNames() {
    for (const [e, c] of named) e.textContent = name(c);
    for (const [e, km] of ringLabels) e.textContent = `${km} ${t().km}`;
  }
  writeNames();

  // ------------------------------------------------------------ survol, choix
  let selected = null;
  function showTip(c, x, y) {
    if (!c) { tip.classList.remove('is-on'); return; }
    tip.querySelector('b').textContent = name(c);
    tip.querySelector('span').textContent = t().z[c.z];
    tip.dataset.z = c.z;
    const r = q('.zn__map').getBoundingClientRect();
    tip.style.translate = `${x - r.left}px ${y - r.top}px`;
    tip.classList.add('is-on');
  }
  cells.addEventListener('pointermove', (e) => {
    const p = e.target.closest('.zn-c');
    showTip(p && byNis.get(+p.dataset.nis), e.clientX, e.clientY);
  });
  cells.addEventListener('pointerleave', () => showTip(null));
  cells.addEventListener('click', (e) => {
    const p = e.target.closest('.zn-c');
    if (!p) return;
    const c = byNis.get(+p.dataset.nis);
    select(c === selected ? null : c);
  });
  // la commune choisie (sans marque sur la carte) : « Réserver un appel » l'emmène
  function select(c) {
    selected = c;
    const page = root.dataset.langue === 'nl' ? '/afspraak' : 'reserver.html';   // la réservation, dans la langue de la page
    cta.href = page + (c ? `?cp=${c.pc[0]}` : '');
  }
  // les communes par leur nom (celles du défilé du pied de page)
  const norm = (str) => str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = new Map();
  for (const c of ZONE) for (const n of [c.fr, c.nl]) names.set(norm(n), c);

  // ------------------------------------------------------------ ouvrir, fermer
  let isOpen = false, from = null, opener = null, anim = [], wallTimer = 0;
  const EASE = 'cubic-bezier(.7, 0, .2, 1)', DUR = 800;
  const inset = (r) => `inset(${r.top}px ${innerWidth - r.right}px ${innerHeight - r.bottom}px ${r.left}px round 28px)`;
  const FULL = 'inset(0px 0px 0px 0px round 0px)';
  // la carte du panneau part de la place de la carte du mur (sa région sur la région), et y revient
  function flip(r) {
    const to = outline.getBoundingClientRect();
    const s = r.width / to.width;
    return `translate(${r.left + r.width / 2 - (to.left + to.width / 2)}px, ${r.top + r.height / 2 - (to.top + to.height / 2)}px) scale(${s})`;
  }
  function open(o = {}) {
    if (isOpen) { if (o.nis) pick(o.nis); return; }
    isOpen = true;
    opener = document.activeElement;
    from = o;
    panel.hidden = false;
    fade();
    root.classList.add('svc-lock', 'zn-open');
    hover();
    if (o.nis) pick(o.nis);
    anim.forEach((a) => a.cancel());
    anim = [];
    if (!reduced) {
      const r = o.from?.() || null;
      if (r) {
        anim.push(panel.animate([{ clipPath: inset(r) }, { clipPath: FULL }], { duration: DUR, easing: EASE }));
        // depuis la carte du mur : la carte plate apparaît par-dessus elle, d'abord blanche comme le mur, puis prend
        // ses couleurs en grandissant (la périphérie et les noms arrivent ensuite : css, .zn.is-in)
        if (o.map) {
          panel.classList.add('to-wall');
          anim.push(panel.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }], { duration: DUR, easing: 'ease-out' }));
          clearTimeout(wallTimer);
          wallTimer = setTimeout(() => panel.classList.remove('to-wall'), DUR * 0.3);
        }
        if (o.map) anim.push(svg.animate([{ transform: flip(r), transformOrigin: '50% 50%' }, { transform: 'none', transformOrigin: '50% 50%' }],
          { duration: DUR, easing: EASE }));
      } else anim.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease' }));
    }
    requestAnimationFrame(() => panel.classList.add('is-in'));
    setTimeout(() => closeBtn.focus({ preventScroll: true }), reduced ? 0 : 500);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove('is-in');
    showTip(null);
    const done = () => {
      panel.hidden = true;
      root.classList.remove('svc-lock', 'zn-open');
      opener?.focus?.({ preventScroll: true });
    };
    anim.forEach((a) => a.cancel());
    anim = [];
    const r = reduced ? null : from?.from?.();
    // (la carte du mur n'est plus à l'écran : le panneau s'efface simplement)
    const seen = r && r.bottom > 0 && r.top < innerHeight && r.width > 0;
    if (seen) {
      // vers la carte du mur : en se réduisant, la périphérie et les noms s'effacent, les communes pâlissent jusqu'au
      // blanc du mur ; sur la fin, le panneau devient transparent : la carte creusée apparaît à sa place (fondu
      // enchaîné, pas de disparition d'un coup)
      const D = DUR * 1.1;
      if (from.map) {
        clearTimeout(wallTimer);
        panel.classList.add('to-wall');
        panel.animate([{ opacity: 1 }, { opacity: 1, offset: 0.45, easing: 'cubic-bezier(.4, 0, .6, 1)' }, { opacity: 0 }],
          { duration: D, fill: 'forwards' });
        svg.animate([{ transform: 'none', transformOrigin: '50% 50%' }, { transform: flip(r), transformOrigin: '50% 50%' }],
          { duration: D, easing: EASE, fill: 'forwards' });
      }
      const a = panel.animate([{ clipPath: FULL }, { clipPath: inset(r) }], { duration: D, easing: EASE, fill: 'forwards' });
      a.onfinish = () => {
        done();
        panel.classList.remove('to-wall');
        panel.getAnimations().forEach((x) => x.cancel()); svg.getAnimations().forEach((x) => x.cancel());
      };
    } else if (!reduced) {
      panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, easing: 'ease', fill: 'forwards' })
        .onfinish = () => { done(); panel.getAnimations().forEach((x) => x.cancel()); };
    } else done();
  }
  function pick(nis) {
    const c = byNis.get(nis);
    if (c) select(c);
  }
  closeBtn.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) close(); });
  // le focus reste dans le panneau
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button, a[href]')].filter((x) => x.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  // les liens vers #zone (menu, pied de page, communes du défilé) : avant js/veil.js (capture)
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || panel.contains(a)) return;
    const url = new URL(a.href, location.href);
    if (url.hash !== '#zone' || url.pathname !== location.pathname) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const c = a.classList.contains('ft-marquee__item') ? names.get(norm(a.textContent)) : null;
    open({ from: () => a.getBoundingClientRect(), nis: c?.nis });
  }, true);
  // arrivée depuis une autre page (index.html#zone) : une fois la page prête
  if (location.hash === '#zone') {
    history.replaceState(null, '', location.pathname + location.search);
    const go = () => setTimeout(() => open(), 300);
    if (root.classList.contains('intro')) go();
    else new MutationObserver((m, o) => { if (root.classList.contains('intro')) { o.disconnect(); go(); } })
      .observe(root, { attributes: true, attributeFilter: ['class'] });
  }
  addEventListener('hs:lang', writeNames);

  // ------------------------------------------------------------ la pastille « Voir la zone » (carte du mur)
  const pos = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
  let pillOn = false, pillRaf = 0;
  function pillStep() {
    pillRaf = 0;
    pos.x += (goal.x - pos.x) * 0.22;
    pos.y += (goal.y - pos.y) * 0.22;
    pill.style.translate = `${pos.x}px ${pos.y}px`;
    if (Math.abs(goal.x - pos.x) + Math.abs(goal.y - pos.y) > 0.3) pillRaf = requestAnimationFrame(pillStep);
  }
  function hover(x, y, nis) {
    if (!pill) return;
    const on = nis != null && !isOpen;
    if (on) {
      if (!pillOn) { pos.x = x; pos.y = y; }
      goal.x = x; goal.y = y;
      const c = byNis.get(nis);
      pill.querySelector('small').textContent = c ? name(c) : '';
      if (!pillRaf) pillRaf = requestAnimationFrame(pillStep);
    }
    if (on !== pillOn) { pillOn = on; pill.classList.toggle('is-on', on); }
  }

  window.hsZone = { open, close, hover, isOpen: () => isOpen };
})();
