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
      'about.photo': 'The HomeService truck, rear open', 'stats.label': 'HomeService in numbers',
      'svc.eyebrow': 'Our services', 'svc.prev': 'Previous service', 'svc.next': 'Next service', 'svc.more': 'See more',
      'svc.nettoyage': 'Cleaning', 'svc.jardinage': 'Gardening', 'svc.desencombrement': 'Decluttering',
      'svc.montage': 'Assembly', 'svc.livraison': 'Delivery',
      'svcd.nettoyage': 'Regular cleaning or deep clean: floors, kitchen, bathroom, windows. We leave your home spotless.',
      'svcd.jardinage': 'Mowing, hedge trimming, weeding and flowerbed care, all year round.',
      'svcd.desencombrement': 'Cellar, attic or a whole home: we sort, pack, clear out, and recycle everything we can.',
      'svcd.montage': 'Flat-pack furniture, shelves, wall fixings: we assemble, mount and adjust, while you put your feet up.',
      'svcd.livraison': 'Groceries, parcels or bulky purchases: we pick them up and deliver to your door, whenever suits you.',
      'ba.title': 'See the difference', 'ba.before': 'Before', 'ba.after': 'After', 'ba.range': 'Compare before and after',
      'svcx.close': "Close",
      'svcx.cta': "Request a quote",
      'svcx.photo': "Photo coming soon",
      'svcx.list': "What we do",
      'svcx.nettoyage.t': "A spotless home, without a second thought",
      'svcx.nettoyage.d': "Weekly or for a deep clean, our teams take care of all the upkeep of your home, room by room, with the care we would give our own.",
      'svcx.nettoyage.0': "Floors: vacuuming, mopping and dusting in every room",
      'svcx.nettoyage.1': "Kitchen: worktops, appliances and cupboards",
      'svcx.nettoyage.2': "Descaled bathroom and toilets",
      'svcx.nettoyage.3': "Windows, frames and mirrors",
      'svcx.nettoyage.4': "End-of-lease or post-renovation cleaning",
      'svcx.jardinage.t': "A garden cared for all year round",
      'svcx.jardinage.d': "Small city garden or large lawn, we look after it through the seasons so all that's left for you is to enjoy it, and we take the green waste away.",
      'svcx.jardinage.0': "Lawn mowing and edge trimming",
      'svcx.jardinage.1': "Pruning hedges, shrubs and roses",
      'svcx.jardinage.2': "Weeding paths and flowerbeds",
      'svcx.jardinage.3': "Leaf clearing and green waste removal",
      'svcx.jardinage.4': "Planting and window-box care",
      'svcx.desencombrement.t': "Space, at last",
      'svcx.desencombrement.d': "Cellar, attic, garage or a whole home: we sort with you what stays, what goes and what can have a second life, then we pack and clear out everything else.",
      'svcx.desencombrement.0': "Guided sorting, room by room",
      'svcx.desencombrement.1': "Packing and protecting the things you keep",
      'svcx.desencombrement.2': "Removal of bulky items, down to the last box",
      'svcx.desencombrement.3': "Recycling everything that can be",
      'svcx.desencombrement.4': "Cleaning the space once it's empty",
      'svcx.montage.t': "Your furniture assembled, straight and sturdy",
      'svcx.montage.d': "Flat-pack furniture, shelves, lights or curtain rails: we come with the right tools, we assemble, mount and adjust, then we leave with the packaging.",
      'svcx.montage.0': "Flat-pack furniture assembly, all brands",
      'svcx.montage.1': "Wall mounting: shelves, TVs, mirrors",
      'svcx.montage.2': "Fitting curtain rails, blinds and lights",
      'svcx.montage.3': "Adjusting doors and drawers",
      'svcx.montage.4': "Removal of boxes and packaging",
      'svcx.livraison.t': "Delivered to your door, on your schedule",
      'svcx.livraison.d': "Groceries, parcels to collect or bulky purchases: we fetch them for you and deliver them to your home, whenever suits you, right into the room of your choice.",
      'svcx.livraison.0': "Weekly groceries, from your list",
      'svcx.livraison.1': "Parcel pick-up from collection points",
      'svcx.livraison.2': "Transport of bulky purchases from the shop",
      'svcx.livraison.3': "Delivery right into the room of your choice",
      'svcx.livraison.4': "A time slot agreed with you",
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
      'about.photo': 'De HomeService-vrachtwagen, achterkant open', 'stats.label': 'HomeService in cijfers',
      'svc.eyebrow': 'Onze diensten', 'svc.prev': 'Vorige dienst', 'svc.next': 'Volgende dienst', 'svc.more': 'Meer zien',
      'svc.nettoyage': 'Schoonmaak', 'svc.jardinage': 'Tuinwerk', 'svc.desencombrement': 'Ontruiming',
      'svc.montage': 'Montage', 'svc.livraison': 'Levering',
      'svcd.nettoyage': 'Wekelijkse schoonmaak of grote poetsbeurt: vloeren, keuken, badkamer, ramen. Alles blinkt weer.',
      'svcd.jardinage': 'Gras maaien, hagen snoeien, onkruid wieden en perken onderhouden, het hele jaar door.',
      'svcd.desencombrement': 'Kelder, zolder of een hele woning: wij sorteren, pakken in, voeren af en recycleren wat kan.',
      'svcd.montage': 'Bouwpakketten, rekken, wandbevestigingen: wij monteren, bevestigen en stellen af, u hoeft niets te doen.',
      'svcd.livraison': 'Boodschappen, pakjes of grote aankopen: wij halen ze op en leveren ze aan huis, wanneer het u past.',
      'ba.title': 'Zie het verschil', 'ba.before': 'Voor', 'ba.after': 'Na', 'ba.range': 'Vergelijk voor en na',
      'svcx.close': "Sluiten",
      'svcx.cta': "Offerte aanvragen",
      'svcx.photo': "Foto volgt",
      'svcx.list': "Wat we doen",
      'svcx.nettoyage.t': "Een stralend interieur, zonder er aan te denken",
      'svcx.nettoyage.d': "Wekelijks of voor een grote poetsbeurt: onze ploegen nemen het volledige onderhoud van uw woning op zich, kamer per kamer, met de zorg die we thuis zouden hebben.",
      'svcx.nettoyage.0': "Vloeren: stofzuigen, dweilen en afstoffen in alle kamers",
      'svcx.nettoyage.1': "Keuken: werkbladen, huishoudtoestellen en kasten",
      'svcx.nettoyage.2': "Ontkalkte badkamer en sanitair",
      'svcx.nettoyage.3': "Ramen, kozijnen en spiegels",
      'svcx.nettoyage.4': "Eindschoonmaak bij verhuizing of na werken",
      'svcx.jardinage.t': "Een verzorgde tuin, het hele jaar door",
      'svcx.jardinage.d': "Kleine stadstuin of groot gazon: wij onderhouden hem door de seizoenen heen, zodat u er enkel nog van hoeft te genieten, en we nemen het groenafval mee.",
      'svcx.jardinage.0': "Gras maaien en randen afwerken",
      'svcx.jardinage.1': "Hagen, struiken en rozen snoeien",
      'svcx.jardinage.2': "Onkruid wieden in paden en perken",
      'svcx.jardinage.3': "Bladeren ruimen en groenafval afvoeren",
      'svcx.jardinage.4': "Aanplanten en bloembakken onderhouden",
      'svcx.desencombrement.t': "Eindelijk ruimte",
      'svcx.desencombrement.d': "Kelder, zolder, garage of een hele woning: samen met u sorteren we wat blijft, wat weg mag en wat een tweede leven kan krijgen, daarna pakken we in en voeren we de rest af.",
      'svcx.desencombrement.0': "Begeleid sorteren, kamer per kamer",
      'svcx.desencombrement.1': "Inpakken en beschermen wat u houdt",
      'svcx.desencombrement.2': "Afvoer van grofvuil, tot de laatste doos",
      'svcx.desencombrement.3': "Recyclage van alles wat kan",
      'svcx.desencombrement.4': "Schoonmaak van de lege ruimte",
      'svcx.montage.t': "Uw meubels gemonteerd, recht en stevig",
      'svcx.montage.d': "Bouwpakketten, rekken, lampen of gordijnroedes: wij komen met het juiste gereedschap, monteren, bevestigen en stellen af, en nemen de verpakking mee.",
      'svcx.montage.0': "Montage van bouwpakketten, alle merken",
      'svcx.montage.1': "Wandbevestiging: rekken, televisies, spiegels",
      'svcx.montage.2': "Plaatsen van gordijnroedes, rolgordijnen en lampen",
      'svcx.montage.3': "Afstellen van deuren en lades",
      'svcx.montage.4': "Afvoer van dozen en verpakking",
      'svcx.livraison.t': "Aan huis geleverd, wanneer het u past",
      'svcx.livraison.d': "Boodschappen, pakjes om op te halen of grote aankopen: wij halen ze voor u op en leveren ze aan huis, op het moment dat het u past, tot in de kamer van uw keuze.",
      'svcx.livraison.0': "Wekelijkse boodschappen, volgens uw lijst",
      'svcx.livraison.1': "Pakjes ophalen in afhaalpunten",
      'svcx.livraison.2': "Vervoer van grote aankopen vanuit de winkel",
      'svcx.livraison.3': "Levering tot in de kamer van uw keuze",
      'svcx.livraison.4': "Een tijdslot dat we samen kiezen",
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
