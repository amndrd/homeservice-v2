// Réserver un appel (index.html, .cta) : la section « Ready to book a call? » du site Harborview, reprise telle quelle
// (Projets/Harborview/app : la classe de la section dans chunks/layout, le curseur dans main.js). Les ondes sont en CSS.
// Ici : 1. le dévoilement du titre puis de la description (découpés en lignes, chacune se colore de gauche à droite,
//          précédée d'un liseré bleu : 1,2 s, lignes décalées de 0,1 s, la description 0,2 s après le titre), quand le
//          haut du titre passe aux 85 % de l'écran ;
//       2. sur ordinateur, au survol de la section, le rond orange « Book a call » qui suit la souris avec retard et
//          sème derrière lui des ronds flous qui s'éteignent en 0,4 s.
(() => {
  const cta = document.querySelector('.cta');
  if (!cta) return;
  const card = cta.querySelector('.cta__inner') || cta;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------ 1. dévoilement en lignes
  const DUR = 1200, STAGGER = 100;
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);   // power1.inOut de GSAP
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const items = [
    { el: cta.querySelector('.cta__title'), delay: 0 },
    { el: cta.querySelector('.cta__desc'), delay: 200 }];
  let phase = 'idle';                              // idle → split (prêt, caché) → play → done

  // découpe le texte en lignes telles que le navigateur les a mises en page ; les espaces insécables (« appel ? »)
  // restent dans leur mot
  function split(it) {
    const el = it.el;
    if (it.html !== undefined) { el.innerHTML = it.html; el.style.width = ''; }
    it.html = el.innerHTML;
    const words = el.textContent.trim().split(/[ \n\t]+/);
    el.style.width = el.offsetWidth + 5 + 'px';
    el.innerHTML = words.map((w) => `<span>${esc(w)}</span>`).join(' ');
    const lines = [];
    let top = null;
    for (const s of el.children) {
      if (s.offsetTop !== top) { lines.push([]); top = s.offsetTop; }
      lines[lines.length - 1].push(s.textContent);
    }
    const fin = getComputedStyle(el).color;
    el.innerHTML = lines.map((l) => `<span class="cta-line" style="--fin:${fin};--p:30">${esc(l.join(' '))}</span>`).join('');
    it.lines = [...el.children];
  }
  function revert(it) {
    it.el.innerHTML = it.html;
    it.el.style.width = '';
    it.html = undefined;
  }
  function play() {
    phase = 'play';
    let t0 = null;
    const frame = (now) => {
      if (t0 === null) t0 = now;
      let running = false;
      for (const it of items) {
        it.lines.forEach((line, i) => {
          const u = Math.min(1, Math.max(0, (now - t0 - it.delay - i * STAGGER) / DUR));
          if (u < 1) running = true;
          line.style.setProperty('--p', (30 + 70 * ease(u)).toFixed(2));
        });
      }
      if (running) requestAnimationFrame(frame);
      else { items.forEach(revert); phase = 'done'; }
    };
    requestAnimationFrame(frame);
  }

  if (!reduced && 'IntersectionObserver' in window && items.every((it) => it.el)) {
    const ready = document.fonts ? document.fonts.ready : Promise.resolve();
    // découpé (et caché) bien avant d'arriver à l'écran, joué quand le titre atteint les 85 % de sa hauteur
    const pre = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || phase !== 'idle') return;
      pre.disconnect();
      ready.then(() => {
        if (phase !== 'idle') return;
        items.forEach(split);
        phase = 'split';
        const r = items[0].el.getBoundingClientRect();
        if (r.top < innerHeight * 0.85) { go.disconnect(); play(); }
      });
    }, { rootMargin: '0px 0px 100% 0px' });
    const go = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting) || phase !== 'split') return;
      go.disconnect();
      play();
    }, { rootMargin: '0px 0px -15% 0px' });
    pre.observe(cta);
    go.observe(items[0].el);
    // la mise en page change (fenêtre, langue) avant le dévoilement : les lignes sont recoupées
    const resplit = () => { if (phase === 'split') items.forEach(split); };
    addEventListener('resize', resplit);
    addEventListener('hs:lang', () => {
      if (phase !== 'split') return;
      items.forEach((it) => { it.html = undefined; it.el.style.width = ''; split(it); });
    });
  }

  // ------------------------------------------------------------ 2. le rond qui suit la souris
  const fine = matchMedia('(min-width: 992px) and (hover: hover) and (pointer: fine)');
  const cursor = document.querySelector('.hs-cursor');
  if (!cursor) return;
  const main = cursor.querySelector('.hs-cursor__main');
  const trail = cursor.querySelector('.hs-cursor__trail');
  const LERP = 0.12, TRAIL_STEP = 28;              // retard du rond (par image à 60 i/s), pas de la traînée (px)
  const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const pos = { x: mouse.x, y: mouse.y };
  const last = { x: 0, y: 0 };
  let link = false, ticking = false, prev = 0, seen = false;   // seen : la souris a bougé au moins une fois

  function setLink(on) {
    if (on === link) return;
    link = on;
    cursor.classList.toggle('is-link', on);
    if (on) { last.x = pos.x; last.y = pos.y; }
    else trail.replaceChildren();
  }
  function spawn(x, y) {
    if (reduced) return;
    const d = document.createElement('i');
    const w = main.offsetWidth, h = main.offsetHeight;
    d.style.width = w + 'px';
    d.style.height = h + 'px';
    d.style.transform = `translate(${x - w / 2}px, ${y - h / 2}px)`;
    trail.appendChild(d);
    d.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 400, easing: 'cubic-bezier(.25, .46, .45, .94)' })
      .onfinish = () => d.remove();
  }
  function tick(now) {
    const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 1 / 60;
    prev = now;
    const k = 1 - (1 - LERP) ** (dt * 60);
    pos.x += (mouse.x - pos.x) * k;
    pos.y += (mouse.y - pos.y) * k;
    main.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
    if (link && Math.hypot(pos.x - last.x, pos.y - last.y) > TRAIL_STEP) {
      spawn(pos.x, pos.y);
      last.x = pos.x; last.y = pos.y;
    }
    if (Math.abs(mouse.x - pos.x) < 0.2 && Math.abs(mouse.y - pos.y) < 0.2) { ticking = false; prev = 0; return; }
    requestAnimationFrame(tick);
  }
  const wake = () => { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
  // la souris est-elle sur la carte ? (à chaque mouvement, et au défilement : la section passe sous la souris)
  const check = () => {
    if (!seen) return;
    const r = card.getBoundingClientRect();
    setLink(fine.matches && mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom);
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (!seen) { seen = true; pos.x = mouse.x; pos.y = mouse.y; }
    check();
    wake();
  }, { passive: true });
  addEventListener('scroll', check, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => setLink(false));
  fine.addEventListener?.('change', check);
})();
