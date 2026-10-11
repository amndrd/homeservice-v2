// Le défilement du site, sur ordinateur (souris ou pavé tactile ; pas sur téléphone, ni en mouvement réduit) : doux
// et contrôlé. La molette et les touches ne font plus sauter la page : elles déplacent une cible, que la page
// rejoint en douceur, jamais plus vite que SCROLL.max, et jamais plus d'un écran en avance (un grand coup de molette
// ne fait pas traverser une section).
// Les chiffres (index.html, .stats ; leurs pas : .stats__snap, posés par js/statsmur.js) se parcourent un par un : en
// descendant, le défilement ne va pas plus loin que le premier (il s'y pose de lui-même, en ralentissant : la page
// n'est jamais ramenée toute seule vers lui) ; un nouveau geste amène le deuxième, puis le troisième, puis la
// page reprend son cours. En remontant, pareil, du troisième au premier. Un geste ne compte qu'une fois : l'élan d'un
// pavé tactile (la traîne d'un geste) ne fait pas passer au chiffre suivant.
// Le défilement reste celui du navigateur (la barre, les liens du menu, le glissé de l'ascenseur) : s'il bouge sans
// nous, on reprend de là où il est.
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktop = matchMedia('(min-width: 900px) and (hover: hover) and (pointer: fine)').matches;

// [vitesse maximale (hauteurs d'écran par seconde), raideur du rattrapage (1/s), avance maximale de la cible (hauteurs
//  d'écran) ; d'un chiffre à l'autre : durée (s) ; à l'arrêt sur un chiffre, temps avant d'accepter un nouveau geste
//  (s) ; un nouveau geste : après un silence de la molette (s), ou un coup plus fort que la traîne (× le précédent)]
const SCROLL = { max: 2.2, stiff: 9, ahead: 0.9, step: 0.85, hold: 0.35, quiet: 0.16, surge: 1.6 };
// les touches : [flèches (px), page et espace (hauteurs d'écran)]
const KEYS = { line: 90, page: 0.85 };

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

function start() {
  root.style.scrollBehavior = 'auto';               // c'est nous qui adoucissons (css : html { scroll-behavior })
  let cur = window.scrollY, target = cur, written = cur;
  let tween = null;                                 // un passage d'un chiffre à l'autre : { from, to, t0 }
  let parked = -1, parkedAt = 0;                    // le chiffre où l'on est arrêté (−1 : défilement libre)
  let landing = -1;                                 // le chiffre où le défilement va se poser (le premier ou le dernier)
  let lastWheel = 0, lastAbs = 0, raf = 0, last = 0;

  const maxY = () => root.scrollHeight - window.innerHeight;
  // les arrêts : la place de chaque chiffre (px depuis le haut de la page)
  const stops = () => [...document.querySelectorAll('.stats__snap')].map((a) => a.getBoundingClientRect().top + window.scrollY)
    .sort((a, b) => a - b);

  function write(y) {
    written = Math.round(y);
    window.scrollTo({ top: written, behavior: 'instant' });
  }
  function frame(now) {
    raf = 0;
    const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
    last = now;
    const vh = window.innerHeight;
    if (tween) {
      const t = clamp((now - tween.t0) / 1000 / SCROLL.step, 0, 1);
      cur = tween.from + (tween.to - tween.from) * inOut(t);
      if (t >= 1) { cur = target = tween.to; tween = null; parkedAt = now; window.hsScrollGoal = null; }
    } else {
      const want = (target - cur) * (1 - Math.exp(-dt * SCROLL.stiff)), lim = SCROLL.max * vh * dt;
      cur += clamp(want, -lim, lim);
      if (Math.abs(target - cur) < 0.5) cur = target;
      if (landing >= 0 && cur === target) { parked = landing; parkedAt = now; landing = -1; }
    }
    write(cur);
    if (tween || cur !== target) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function goTo(y, i) {                             // vers un chiffre, d'un geste
    tween = { from: cur, to: clamp(y, 0, maxY()), t0: performance.now() };
    window.hsScrollGoal = i;                         // js/stats.js : c'est déjà lui (le texte, le creux, la progression)
    window.dispatchEvent(new Event('scroll'));
    target = tween.to;
    parked = i;
    wake();
  }

  // un geste vers le bas (d > 0) ou vers le haut (px)
  function move(d, now) {
    const vh = window.innerHeight, S = stops();
    // la traîne d'un geste : ignorée tant qu'on est arrêté sur un chiffre (ou qu'on y va)
    const fresh = now - lastWheel > SCROLL.quiet * 1000 || Math.abs(d) > lastAbs * SCROLL.surge + 2;
    lastWheel = now; lastAbs = Math.abs(d);
    if (S.length) {
      if (parked >= 0) {
        if (tween || now - parkedAt < SCROLL.hold * 1000 || !fresh) return;
        const next = parked + Math.sign(d);
        if (next >= 0 && next < S.length) { goTo(S[next], next); return; }
        parked = -1;                                // au-delà du premier ou du dernier : la page reprend son cours
      } else {
        // entre deux chiffres (après un saut de la barre, un lien) : on rejoint le suivant dans le sens du geste
        const inside = cur > S[0] + 1 && cur < S[S.length - 1] - 1;
        if (inside) {
          const i = d > 0 ? S.findIndex((y) => y > cur + 1) : S.length - 1 - [...S].reverse().findIndex((y) => y < cur - 1);
          goTo(S[i], i); return;
        }
        // on arrive sur la section : le défilement ne va pas plus loin que le premier chiffre (en descendant) ou le
        // dernier (en remontant), et s'y pose ; un geste en sens inverse le libère
        const to = clamp(target + d, cur - SCROLL.ahead * vh, cur + SCROLL.ahead * vh), L = S.length - 1;
        if (landing >= 0) {
          if (Math.sign(d) === (landing === 0 ? 1 : -1)) return;
          landing = -1;
        } else if (d > 0 && cur < S[0] - 1 && to >= S[0]) { target = S[0]; landing = 0; wake(); return; }
        else if (d < 0 && cur > S[L] + 1 && to <= S[L]) { target = S[L]; landing = L; wake(); return; }
      }
    }
    target = clamp(clamp(target + d, cur - SCROLL.ahead * vh, cur + SCROLL.ahead * vh), 0, maxY());
    wake();
  }

  // une fenêtre est ouverte par-dessus la page (la carte d'un service, html.svc-lock) : la page ne bouge pas, la
  // molette et les touches font défiler la fenêtre elle-même
  const locked = () => root.classList.contains('svc-lock');
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || locked()) return;              // le zoom (pincement) reste au navigateur
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const vh = window.innerHeight;
    const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1);
    e.preventDefault();
    move(d, performance.now());
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const el = document.activeElement;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || locked()) return;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    const vh = window.innerHeight;
    const d = { ArrowDown: KEYS.line, ArrowUp: -KEYS.line, PageDown: KEYS.page * vh, PageUp: -KEYS.page * vh,
      ' ': (e.shiftKey ? -1 : 1) * KEYS.page * vh }[e.key];
    if (!d) return;
    e.preventDefault();
    lastWheel = 0;                                  // une touche est toujours un nouveau geste
    move(d, performance.now());
  });

  // la page a bougé sans nous (la barre, un lien, le redimensionnement) : on repart de là où elle est
  window.addEventListener('scroll', () => {
    if (Math.abs(window.scrollY - written) <= 1) return;
    cur = target = written = window.scrollY;
    tween = null; parked = -1; landing = -1; window.hsScrollGoal = null;
    const S = stops(), k = S.findIndex((y) => Math.abs(y - cur) <= 2);
    if (k >= 0) { parked = k; parkedAt = 0; }
  }, { passive: true });
  window.addEventListener('resize', () => { cur = target = written = window.scrollY; tween = null; });
}

if (desktop && !reduced) start();
