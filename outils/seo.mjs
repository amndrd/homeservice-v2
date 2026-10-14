// Le référencement du site (SEO), posé à chaque construction (outils/build.mjs, après les versions des fichiers) :
// - l'en-tête de chaque page, entre <!-- seo … --> et <!-- /seo --> : titre, description, adresse canonique, pages
//   sœurs dans l'autre langue (hreflang), aperçu de partage (Open Graph, Twitter), icônes, et les données structurées
//   schema.org (l'entreprise, ses services, les 19 communes desservies ; la FAQ, tirée de la page) ;
// - la version néerlandaise des pages, en vrai HTML lisible par les moteurs : nl.html (servie à /nl) et
//   afspraak.html (à /afspraak), tirées des pages françaises et des traductions de js/langues.js ;
// - robots.txt, sitemap.xml (avec les pages sœurs), site.webmanifest.
// Les adresses /nl et /afspraak sont des réécritures (vercel.json) ; les fichiers restent à la racine, si bien que
// toutes les adresses relatives des pages (css/, js/, images/…) fonctionnent telles quelles.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { TRADUCTIONS } from '../js/langues.js';

const SITE = 'https://homeservicebxl.com';
const NL = TRADUCTIONS.nl;

// ------------------------------------------------------------------------------------------------ l'entreprise
// Mêmes nom, téléphone et zone que la fiche Google Business Profile (« Home Service Bruxelles ») : Google les recoupe.
const ENTREPRISE = {
  nom: 'HomeService BXL',
  autresNoms: ['Home Service Bruxelles', 'HomeService Bruxelles'],
  telephone: '+32471917014',
  email: 'homeservicebxl.contact@gmail.com',
  fondateurs: ['Amandin Dardenne', 'André Campilho'],
  fiche: 'https://www.google.com/search?kgmid=/g/11nqxwy26l',   // la fiche Google Business Profile
  horaires: { ouvre: '09:00', ferme: '19:00' },                 // 7 j/7, jours fériés compris (les créneaux d'appel)
};
const COMMUNES = [   // [français, néerlandais] : les 19 communes de la Région de Bruxelles-Capitale
  ['Anderlecht', 'Anderlecht'], ['Auderghem', 'Oudergem'], ['Berchem-Sainte-Agathe', 'Sint-Agatha-Berchem'],
  ['Bruxelles', 'Brussel'], ['Etterbeek', 'Etterbeek'], ['Evere', 'Evere'], ['Forest', 'Vorst'],
  ['Ganshoren', 'Ganshoren'], ['Ixelles', 'Elsene'], ['Jette', 'Jette'], ['Koekelberg', 'Koekelberg'],
  ['Molenbeek-Saint-Jean', 'Sint-Jans-Molenbeek'], ['Saint-Gilles', 'Sint-Gillis'],
  ['Saint-Josse-ten-Noode', 'Sint-Joost-ten-Node'], ['Schaerbeek', 'Schaarbeek'], ['Uccle', 'Ukkel'],
  ['Watermael-Boitsfort', 'Watermaal-Bosvoorde'], ['Woluwe-Saint-Lambert', 'Sint-Lambrechts-Woluwe'],
  ['Woluwe-Saint-Pierre', 'Sint-Pieters-Woluwe'],
];
// les fourchettes indicatives de la section Tarifs (index.html, .tarifs), une par service (sa prestation principale) :
// [prix min, prix max (null : « à partir de »), unité (fr), unité (nl)]
const PRIX = [
  [30, 38, 'par heure (ménage à domicile)', 'per uur (schoonmaak aan huis)'],
  [0.35, 0.5, 'par m² (tonte de pelouse)', 'per m² (gazon maaien)'],
  [100, 250, 'par camion, un trajet (débarras)', 'per bestelwagen, één rit (ontruiming)'],
  [25, null, 'par meuble en kit', 'per bouwpakket'],
  [15, null, 'par livraison', 'per levering'],
];
const SERVICES = {
  fr: [
    ['Nettoyage à domicile', 'Ménage régulier ou grand nettoyage : maisons, appartements et bureaux, vitres comprises.'],
    ['Jardinage', 'Tonte de pelouse, taille de haies, désherbage et entretien des massifs, au fil des saisons.'],
    ['Désencombrement et débarras', 'Caves, greniers, garages ou logements entiers vidés ; tri, évacuation et nettoyage.'],
    ['Montage de meubles', 'Meubles en kit, fixations murales, tringles et luminaires, posés droit et solides.'],
    ['Livraison à domicile', 'Courses, colis et achats volumineux livrés chez vous, au moment qui vous arrange.'],
  ],
  nl: [
    ['Schoonmaak aan huis', 'Regelmatige of grote schoonmaak: huizen, appartementen en kantoren, ramen inbegrepen.'],
    ['Tuinwerk', 'Gazon maaien, hagen snoeien, wieden en onderhoud van borders, het hele jaar door.'],
    ['Ontruiming', 'Kelders, zolders, garages of hele woningen leeggemaakt: sorteren, afvoeren en schoonmaken.'],
    ['Meubelmontage', 'Bouwpakketten, wandbevestigingen, gordijnroedes en lampen, recht en stevig geplaatst.'],
    ['Levering aan huis', 'Boodschappen, pakjes en grote aankopen aan huis geleverd, wanneer het u past.'],
  ],
};

// ------------------------------------------------------------------------------------------------ les pages
// [fichier français, adresse française, fichier néerlandais, adresse néerlandaise, textes]
const PAGES = [
  {
    fr: { fichier: 'index.html', url: '/' }, nl: { fichier: 'nl.html', url: '/nl' }, accueil: true,
    textes: {
      fr: {
        titre: 'Services à domicile à Bruxelles | Nettoyage, jardinage – HomeService BXL',
        description: 'Nettoyage, jardinage, débarras, montage de meubles et livraison à Bruxelles et en périphérie. '
          + 'Un seul interlocuteur, 7 jours sur 7. Devis gratuit en un appel.',
      },
      nl: {
        titre: NL['title.home'],
        description: 'Schoonmaak, tuinwerk, ontruiming, meubelmontage en levering in Brussel en de rand. '
          + 'Eén aanspreekpunt, 7 dagen op 7. Gratis offerte via één gesprek.',
      },
    },
  },
  {
    fr: { fichier: 'reserver.html', url: '/reserver.html' }, nl: { fichier: 'afspraak.html', url: '/afspraak' },
    textes: {
      fr: {
        titre: 'Réserver un appel – Devis gratuit à domicile à Bruxelles | HomeService BXL',
        description: 'Composez votre devis (nettoyage, jardinage, débarras, montage, livraison), choisissez vos dates '
          + 'et un créneau : nous vous appelons 15 minutes, gratuitement et sans engagement.',
      },
      nl: {
        titre: NL['title.book'],
        description: 'Stel uw offerte samen (schoonmaak, tuinwerk, ontruiming, montage, levering), kies uw data en '
          + 'een tijdstip: wij bellen u 15 minuten, gratis en vrijblijvend.',
      },
    },
  },
];
// les liens d'une page française, sur sa version néerlandaise
const LIENS_NL = [[/^index\.html#/, '/nl#'], [/^index\.html$/, '/nl'], [/^reserver\.html/, '/afspraak']];

const echappe = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const texte = (html) => html.replace(/<span class="sr-only">[^<]*<\/span>/g, '').replace(/<br\s*\/?>/g, ' ')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function entreprise(l) {
  const S = SERVICES[l];
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': `${SITE}/#entreprise`,
    name: ENTREPRISE.nom,
    alternateName: ENTREPRISE.autresNoms,
    description: PAGES[0].textes[l].description,
    url: `${SITE}${l === 'fr' ? '/' : '/nl'}`,
    logo: `${SITE}/images/icones/icon-512.png`,
    image: `${SITE}/images/og-image.jpg`,
    telephone: ENTREPRISE.telephone,
    email: ENTREPRISE.email,
    founder: ENTREPRISE.fondateurs.map((name) => ({ '@type': 'Person', name })),
    priceRange: '€€',
    currenciesAccepted: 'EUR',
    knowsLanguage: ['fr', 'nl', 'en'],
    areaServed: [
      { '@type': 'AdministrativeArea', name: l === 'fr' ? 'Région de Bruxelles-Capitale' : 'Brussels Hoofdstedelijk Gewest' },
      ...COMMUNES.map(([fr, nl]) => ({ '@type': 'City', name: l === 'fr' ? fr : nl })),
    ],
    openingHoursSpecification: [{
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: ENTREPRISE.horaires.ouvre, closes: ENTREPRISE.horaires.ferme,
    }],
    sameAs: [ENTREPRISE.fiche],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: l === 'fr' ? 'Services à domicile' : 'Diensten aan huis',
      itemListElement: S.map(([name, description], i) => {
        const [min, max, uFr, uNl] = PRIX[i];
        return {
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name, description, areaServed: { '@id': `${SITE}/#zone` } },
          priceSpecification: { '@type': 'PriceSpecification', priceCurrency: 'EUR', minPrice: min,
            ...(max ? { maxPrice: max } : {}), unitText: l === 'fr' ? uFr : uNl,
            description: l === 'fr' ? 'Prix indicatif, hors frais de déplacement ; le prix exact est fixé pendant l’appel.'
              : 'Richtprijs, zonder verplaatsingskosten; de exacte prijs wordt tijdens het gesprek vastgelegd.' },
        };
      }),
    },
  };
}

function donnees(page, l, faq) {
  const url = `${SITE}${page[l].url}`;
  const graphe = [
    {
      '@type': 'WebSite', '@id': `${SITE}/#site`, url: `${SITE}/`, name: ENTREPRISE.nom,
      alternateName: ENTREPRISE.autresNoms, inLanguage: ['fr-BE', 'nl-BE'], publisher: { '@id': `${SITE}/#entreprise` },
    },
    entreprise(l),
    {
      '@type': 'WebPage', '@id': `${url}#page`, url, name: page.textes[l].titre, description: page.textes[l].description,
      inLanguage: l === 'fr' ? 'fr-BE' : 'nl-BE', isPartOf: { '@id': `${SITE}/#site` }, about: { '@id': `${SITE}/#entreprise` },
    },
  ];
  // la zone (référencée par les services) : la Région de Bruxelles-Capitale
  graphe[1].areaServed[0]['@id'] = `${SITE}/#zone`;
  if (faq.length) {
    graphe.push({
      '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: l === 'fr' ? 'fr-BE' : 'nl-BE',
      mainEntity: faq.map(([q, r]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: r } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graphe };
}

function entete(page, l, faq) {
  const T = page.textes[l];
  const url = `${SITE}${page[l].url}`;
  const lignes = [
    `<title>${echappe(T.titre)}</title>`,
    `<meta name="description" content="${echappe(T.description)}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`,
    `<link rel="canonical" href="${url}">`,
    `<link rel="alternate" hreflang="fr-BE" href="${SITE}${page.fr.url}">`,
    `<link rel="alternate" hreflang="nl-BE" href="${SITE}${page.nl.url}">`,
    `<link rel="alternate" hreflang="x-default" href="${SITE}${page.fr.url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${ENTREPRISE.nom}">`,
    `<meta property="og:title" content="${echappe(T.titre)}">`,
    `<meta property="og:description" content="${echappe(T.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE}/images/og-image.jpg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${echappe(l === 'fr' ? 'L’îlot de HomeService BXL : les outils de nos services à domicile à Bruxelles' : 'Het eiland van HomeService BXL: het gereedschap van onze diensten aan huis in Brussel')}">`,
    `<meta property="og:locale" content="${l === 'fr' ? 'fr_BE' : 'nl_BE'}">`,
    `<meta property="og:locale:alternate" content="${l === 'fr' ? 'nl_BE' : 'fr_BE'}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${echappe(T.titre)}">`,
    `<meta name="twitter:description" content="${echappe(T.description)}">`,
    `<meta name="twitter:image" content="${SITE}/images/og-image.jpg">`,
    `<meta name="theme-color" content="#f7f7f5">`,
    `<meta name="format-detection" content="telephone=yes">`,
    `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="/images/icones/icon-192.png">`,
    `<link rel="apple-touch-icon" href="/images/icones/icon-180.png">`,
    `<link rel="manifest" href="/site.webmanifest">`,
    `<script type="application/ld+json">${JSON.stringify(donnees(page, l, faq)).replace(/</g, '\\u003c')}</script>`,
  ];
  return `<!-- seo : posé par outils/seo.mjs (npm run build) -->\n${lignes.join('\n')}\n<!-- /seo -->`;
}

const BLOC = /<!-- seo :[^]*?<!-- \/seo -->/;

// la FAQ d'une page : [question, réponse] en texte, dans la langue voulue
function faqDe(document, l) {
  const out = [];
  for (let i = 0; ; i++) {
    const q = document.querySelector(`[data-i18n="faq.q${i}"]`), r = document.querySelector(`[data-i18n="faq.a${i}"]`);
    if (!q || !r) break;
    out.push(l === 'fr' ? [texte(q.innerHTML), texte(r.innerHTML)]
      : [texte(NL[`faq.q${i}`] ?? q.innerHTML), texte(NL[`faq.a${i}`] ?? r.innerHTML)]);
  }
  return out;
}

// la page néerlandaise : la française, ses textes remplacés par les traductions (mêmes cases que js/i18n.js)
const CASES = [
  ['data-i18n', (el, v) => { el.innerHTML = v; }],
  ['data-i18n-aria', (el, v) => el.setAttribute('aria-label', v)],
  ['data-i18n-alt', (el, v) => el.setAttribute('alt', v)],
  ['data-i18n-suffix', (el, v) => el.setAttribute('data-suffix', v)],
  ['data-i18n-placeholder', (el, v) => el.setAttribute('placeholder', v)],
  ['data-i18n-label', (el, v) => el.setAttribute('label', v)],
];
function versNl(html) {
  const { document } = parseHTML(html);
  const racine = document.documentElement;
  racine.setAttribute('lang', 'nl-BE');
  racine.setAttribute('data-langue', 'nl');
  // les textes français de la page, gardés à part : la demande envoyée à l'équipe reste en français (js/reserver.js,
  // par window.hsFr de js/i18n.js)
  const fr = {};
  for (const el of document.querySelectorAll('[data-i18n]')) fr[el.getAttribute('data-i18n')] = el.innerHTML;
  const garde = document.createElement('script');
  garde.setAttribute('type', 'application/json');
  garde.setAttribute('id', 'textes-fr');
  garde.textContent = JSON.stringify(fr).replace(/</g, '\\u003c');
  document.head.appendChild(garde);                // dans l'en-tête : lu au démarrage de js/i18n.js
  const manque = new Set();
  for (const [attr, pose] of CASES) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      const v = NL[el.getAttribute(attr)];
      if (v === undefined) manque.add(el.getAttribute(attr)); else pose(el, v);
    }
  }
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    for (const [re, par] of LIENS_NL) if (re.test(h)) { a.setAttribute('href', h.replace(re, par)); break; }
  }
  return { html: '<!DOCTYPE html>\n' + racine.outerHTML + '\n', manque };
}

export function seo(site) {
  for (const page of PAGES) {
    const chemin = join(site, page.fr.fichier);
    let html = readFileSync(chemin, 'utf8');
    if (!BLOC.test(html)) throw new Error(`bloc <!-- seo --> absent de ${page.fr.fichier}`);
    const { document } = parseHTML(html);
    html = html.replace(BLOC, () => entete(page, 'fr', page.accueil ? faqDe(document, 'fr') : []));
    writeFileSync(chemin, html);
    const nl = versNl(html);
    writeFileSync(join(site, page.nl.fichier), nl.html.replace(BLOC, () => entete(page, 'nl', page.accueil ? faqDe(document, 'nl') : [])));
    console.log(`${page.nl.fichier} : page néerlandaise construite` + (nl.manque.size ? ` (${nl.manque.size} textes sans traduction, laissés en français : ${[...nl.manque].slice(0, 6).join(', ')}${nl.manque.size > 6 ? '…' : ''})` : ''));
  }
  const auj = new Date().toISOString().slice(0, 10);
  writeFileSync(join(site, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  writeFileSync(join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${PAGES.flatMap((p) => ['fr', 'nl'].map((l) => `  <url>
    <loc>${SITE}${p[l].url}</loc>
    <lastmod>${auj}</lastmod>
    <xhtml:link rel="alternate" hreflang="fr-BE" href="${SITE}${p.fr.url}"/>
    <xhtml:link rel="alternate" hreflang="nl-BE" href="${SITE}${p.nl.url}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${p.fr.url}"/>
  </url>`)).join('\n')}
</urlset>
`);
  writeFileSync(join(site, 'site.webmanifest'), JSON.stringify({
    name: 'HomeService BXL – Services à domicile à Bruxelles', short_name: 'HomeService BXL',
    description: PAGES[0].textes.fr.description, start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f7f7f5', theme_color: '#f7f7f5', lang: 'fr-BE',
    icons: [192, 512].map((n) => ({ src: `/images/icones/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png' })),
  }, null, 2) + '\n');
  console.log('SEO : en-têtes, robots.txt, sitemap.xml, site.webmanifest');
}
