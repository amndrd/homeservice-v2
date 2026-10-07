// Langue du site : français (la page telle qu'écrite), anglais, néerlandais — repris du site immersif.
// Chaque élément traduit porte data-i18n (son contenu HTML) ou data-i18n-aria (aria-label) ; le titre de la page
// vient de data-i18n-title sur <html>. Le français est celui de la page, gardé en copie pour y revenir.
// Choix gardé dans localStorage ; ?lang=en|nl dans l'adresse l'emporte. En changer passe sous le voile (js/veil.js).
(() => {
  const LANGS = { fr: 'fr-BE', en: 'en', nl: 'nl-BE' };
  const T = {
    en: {
      home: 'HomeService BXL, home', mainNav: 'Main navigation', langBtn: 'Language',
      'nav.about': 'About', 'nav.services': 'Services', 'nav.how': 'How it works', 'nav.zone': 'Area',
      'nav.contact': 'Contact', cta: 'Free quote',
      'title.home': 'HomeService BXL', 'title.about': 'About – HomeService BXL',
      'title.services': 'Services – HomeService BXL', 'title.how': 'How it works – HomeService BXL',
      'title.zone': 'Area – HomeService BXL', 'title.contact': 'Contact – HomeService BXL',
      'title.quote': 'Free quote – HomeService BXL',
      'hero.label': 'Home', hint: 'Scroll down',
      about: '<p>You have better things to do than deal with everyday chores. <span class="accent">HomeService '
        + 'comes to your home in Brussels for all your needs</span>, we take care of what you don\'t have the time to do, '
        + 'so that you can focus on the things that really matter.</p>',
      'about.photo': 'The HomeService team',
      'chantier.label': 'The rest is under construction', 'chantier.photo': 'Website under construction',
      'stat.services': '<strong>services combined</strong>\n            No need for several providers, we take care of it all.',
      'stat.communes': '<strong>municipalities served</strong>\n            We work everywhere in the Brussels region.',
      'stat.devis': '<strong>to receive your quote</strong>\n            Quick response guaranteed from your very first request.',
      'stat.devis.suffix': 'h', 'hero.title': 'Need a helping<br>hand?',
      'hero.text': 'Cleaning, decluttering, furniture assembly, gardening… We take care of everything,\n'
        + '        <mark>at your pace</mark> and <mark>within your budget</mark>.',
    },
    nl: {
      home: 'HomeService BXL, startpagina', mainNav: 'Hoofdnavigatie', langBtn: 'Taal',
      'nav.about': 'Over ons', 'nav.services': 'Diensten', 'nav.how': 'Werkwijze', 'nav.zone': 'Regio',
      'nav.contact': 'Contact', cta: 'Gratis offerte',
      'title.home': 'HomeService BXL', 'title.about': 'Over ons – HomeService BXL',
      'title.services': 'Diensten – HomeService BXL', 'title.how': 'Werkwijze – HomeService BXL',
      'title.zone': 'Regio – HomeService BXL', 'title.contact': 'Contact – HomeService BXL',
      'title.quote': 'Gratis offerte – HomeService BXL',
      'hero.label': 'Startpagina', hint: 'Scroll naar beneden',
      about: '<p>U hebt wel beters te doen dan u bezig te houden met uw klusjes. <span class="accent">HomeService komt '
        + 'bij u thuis in Brussel voor al uw noden</span>, wij doen waar u zelf geen tijd voor hebt, zodat u zich kunt '
        + 'concentreren op wat echt belangrijk is.</p>',
      'about.photo': 'Het HomeService-team',
      'chantier.label': 'De rest is in aanbouw', 'chantier.photo': 'Website in aanbouw',
      'stat.services': '<strong>diensten onder één dak</strong>\n            Niet langer meerdere vakmensen zoeken, wij regelen alles.',
      'stat.communes': '<strong>gemeenten bediend</strong>\n            Wij zijn actief in het hele Brusselse Gewest.',
      'stat.devis': '<strong>om uw offerte te ontvangen</strong>\n            Snelle reactie gegarandeerd vanaf uw eerste aanvraag.',
      'stat.devis.suffix': 'u', 'hero.title': 'Een handje<br>hulp nodig?',
      'hero.text': 'Schoonmaak, ontruiming, meubelmontage, tuinwerk… Wij regelen alles,\n'
        + '        <mark>op uw tempo</mark> en <mark>binnen uw budget</mark>.',
    },
  };
  const store = {
    get() { try { return localStorage.getItem('hs-lang'); } catch { return null; } },
    set(v) { try { localStorage.setItem('hs-lang', v); } catch {} },
  };
  const root = document.documentElement;
  const FR = {};
  const slots = [
    ['[data-i18n]', 'i18n', (el) => el.innerHTML, (el, v) => { el.innerHTML = v; }],
    ['[data-i18n-aria]', 'i18nAria', (el) => el.getAttribute('aria-label'), (el, v) => el.setAttribute('aria-label', v)],
    ['[data-i18n-alt]', 'i18nAlt', (el) => el.alt, (el, v) => { el.alt = v; }],
    ['[data-i18n-suffix]', 'i18nSuffix', (el) => el.dataset.suffix, (el, v) => { el.dataset.suffix = v; }]];
  for (const [sel, key, get] of slots) document.querySelectorAll(sel).forEach((el) => { FR[el.dataset[key]] = get(el); });
  const titleKey = root.dataset.i18nTitle;
  if (titleKey) FR[titleKey] = document.title;
  T.fr = FR;

  const box = document.getElementById('lang');
  let lang = 'fr';
  function apply(l) {
    lang = l;
    const t = T[l];
    root.lang = LANGS[l];
    if (titleKey && t[titleKey]) document.title = t[titleKey];
    for (const [sel, key, , set] of slots) {
      document.querySelectorAll(sel).forEach((el) => { const v = t[el.dataset[key]]; if (v !== undefined) set(el, v); });
    }
    window.dispatchEvent(new CustomEvent('hs:lang', { detail: l }));   // l'À propos redécoupe ses mots (js/apropos.js)
    if (!box) return;
    box.querySelector('.lang__code').textContent = l.toUpperCase();
    box.querySelectorAll('[data-lang]').forEach((o) => o.setAttribute('aria-selected', String(o.dataset.lang === l)));
  }
  const asked = new URLSearchParams(location.search).get('lang');
  const wanted = () => [asked, store.get()].find((l) => l && LANGS[l]) || 'fr';
  apply(wanted());
  // page préparée d'avance (js/veil.js) : la langue a pu changer depuis, on la relit au moment de l'afficher
  if (document.prerendering) document.addEventListener('prerenderingchange', () => apply(wanted()), { once: true });

  // sélecteur de la navbar : un bouton (code de la langue), un menu des trois langues
  if (!box) return;
  const btn = box.querySelector('.lang__btn'), menu = box.querySelector('.lang__menu');
  const open = (v) => { box.classList.toggle('open', v); btn.setAttribute('aria-expanded', String(v)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); open(!box.classList.contains('open')); });
  document.addEventListener('click', (e) => { if (!box.contains(e.target)) open(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  menu.addEventListener('click', (e) => {
    const o = e.target.closest('[data-lang]');
    if (!o) return;
    open(false);
    const l = o.dataset.lang;
    if (l === lang || window.hsVeil?.busy()) return;
    store.set(l);
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) {                // le choix enregistré prend le relais
      url.searchParams.delete('lang');
      history.replaceState(null, '', url);
    }
    // le voile monte ; à couvert, les textes changent, puis il se retire
    if (!window.hsVeil?.cover(() => { apply(l); window.hsVeil.clear(); })) apply(l);
  });
})();
