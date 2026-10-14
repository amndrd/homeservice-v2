// Langue du site : français (la page telle qu'écrite), anglais, néerlandais — repris du site immersif.
// Chaque élément traduit porte data-i18n (son contenu HTML) ou data-i18n-aria (aria-label) ; le titre de la page
// vient de data-i18n-title sur <html>. Le français est celui de la page, gardé en copie pour y revenir.
// Choix gardé dans localStorage ; ?lang=en|nl dans l'adresse l'emporte. En changer passe sous le voile (js/veil.js).
// Le néerlandais a ses propres pages (nl.html, afspraak.html) : le choisir y mène ; l'anglais se traduit sur place.
// Les traductions sont dans js/langues.js.
import { TRADUCTIONS } from './langues.js';

(() => {
  const LANGS = { fr: 'fr-BE', en: 'en', nl: 'nl-BE' };
  const T = { ...TRADUCTIONS };
  const store = {
    get() { try { return localStorage.getItem('hs-lang'); } catch { return null; } },
    set(v) { try { localStorage.setItem('hs-lang', v); } catch {} },
  };
  const root = document.documentElement;
  // la langue dans laquelle la page est écrite : le français, ou le néerlandais (nl.html, afspraak.html, construites
  // par outils/build.mjs) ; ses pages sœurs dans les autres langues : <link rel="alternate" hreflang> de l'en-tête
  const PAGE = root.dataset.langue || 'fr';
  const SOEUR = {};
  document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => {
    const k = l.hreflang.slice(0, 2);
    if (k !== PAGE && LANGS[k]) SOEUR[k] = new URL(l.href).pathname;   // le chemin : on reste sur le même site
  });
  const FR = {};
  const slots = [
    ['[data-i18n]', 'i18n', (el) => el.innerHTML, (el, v) => { el.innerHTML = v; }],
    ['[data-i18n-aria]', 'i18nAria', (el) => el.getAttribute('aria-label'), (el, v) => el.setAttribute('aria-label', v)],
    ['[data-i18n-alt]', 'i18nAlt', (el) => el.alt, (el, v) => { el.alt = v; }],
    ['[data-i18n-suffix]', 'i18nSuffix', (el) => el.dataset.suffix, (el, v) => { el.dataset.suffix = v; }],
    ['[data-i18n-placeholder]', 'i18nPlaceholder', (el) => el.placeholder, (el, v) => { el.placeholder = v; }],
    ['[data-i18n-label]', 'i18nLabel', (el) => el.label, (el, v) => { el.label = v; }]];
  for (const [sel, key, get] of slots) document.querySelectorAll(sel).forEach((el) => { FR[el.dataset[key]] = get(el); });
  const titleKey = root.dataset.i18nTitle;
  if (titleKey) FR[titleKey] = document.title;
  // le texte de la page, gardé pour y revenir (en français sur les pages françaises, en néerlandais sur les autres)
  T[PAGE] = { ...T[PAGE], ...FR };
  if (PAGE !== 'fr') delete T.fr;               // le français n'est que sur sa page sœur
  // le texte français d'une clé (js/reserver.js écrit la demande en français) : celui de la page, ou, sur une page
  // néerlandaise, celui que la construction y a gardé (#textes-fr, outils/seo.mjs)
  let textesFr = FR;
  if (PAGE !== 'fr') { try { textesFr = JSON.parse(document.getElementById('textes-fr').textContent); } catch { textesFr = {}; } }
  window.hsFr = (k) => textesFr[k];

  const box = document.getElementById('lang');
  let lang = PAGE;
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
  // la langue voulue (?lang=, sinon le choix gardé), si cette page sait l'afficher ; sinon la sienne
  const wanted = () => [asked, store.get()].find((l) => l && T[l]) || PAGE;
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
    // une langue qui a sa propre page (le français, le néerlandais) : on y va (sous le voile, comme les onglets)
    if (SOEUR[l]) {
      const url = SOEUR[l] + location.hash;
      if (window.hsVeil?.go) window.hsVeil.go(url); else location.href = url;
      return;
    }
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) {                // le choix enregistré prend le relais
      url.searchParams.delete('lang');
      history.replaceState(null, '', url);
    }
    // le voile monte ; à couvert, les textes changent, puis il se retire. Depuis le menu du téléphone (js/veil.js),
    // pas de voile : les textes changent sur place, le menu reste ouvert
    if (root.classList.contains('menu-ouvert')) apply(l);
    else if (!window.hsVeil?.cover(() => { apply(l); window.hsVeil.clear(); })) apply(l);
  });
})();
