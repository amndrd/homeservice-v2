// Langue du site : français (la page telle qu'écrite), anglais, néerlandais — repris du site immersif.
// Chaque élément traduit porte data-i18n (son contenu HTML) ou data-i18n-aria (aria-label) ; le titre de la page
// vient de data-i18n-title sur <html>. Le français est celui de la page, gardé en copie pour y revenir.
// Choix gardé dans localStorage ; ?lang=en|nl dans l'adresse l'emporte. En changer passe sous le voile (js/veil.js).
(() => {
  const LANGS = { fr: 'fr-BE', en: 'en', nl: 'nl-BE' };
  const T = {
    en: {
      home: 'HomeService BXL, home', mainNav: 'Main navigation', langBtn: 'Language',
      'nav.about': 'About', 'nav.stats': 'Area', 'nav.services': 'Services', 'nav.ba': 'Before / after', 'nav.sur': 'Custom', 'nav.zone': 'Area',
      cta: 'Book a call',
      'ft.sub': 'One point of contact.<br>Your everyday life, sorted.', 'ft.plan': 'Site map',
      'ft.home': 'Home', 'ft.faq': 'FAQ', 'ft.devis': 'Free quote',
      'ft.devisTxt': 'Free and with no commitment.<br>Reply within 24 h, 7 days a week.', 'ft.devisLink': 'Prepare my quote',
      'ft.communes': 'Communes', 'ft.s.lavage': 'Car washing', 'ft.s.demenagement': 'Moving help', 'ft.s.bricolage': 'DIY and small repairs',
      'ft.zone': 'Service area', 'ft.zoneTxt': 'The 19 municipalities of <span class="ft-nw">Brussels-Capital</span>,<br>and the surrounding area.',
      'ft.zoneLink': 'See the area', 'ft.email': 'Email', 'ft.call': 'A call', 'ft.dispo': 'Availability', 'ft.photo': 'The HomeService team',
      'zn.close': 'Close', 'zn.mapLabel': 'Map of our service area: Brussels-Capital, its outskirts and beyond',
      'zn.eyebrow': 'Service area', 'zn.title': 'Brussels, its outskirts, and beyond',
      'zn.lead': 'We work everywhere. Only the travel costs change.',
      'zn.z1': 'Brussels-Capital', 'zn.z1d': 'The 19 municipalities · lowest travel costs',
      'zn.z2': 'Outskirts', 'zn.z2d': 'The municipalities bordering Brussels, as well as Wezembeek-Oppem · moderate travel costs',
      'zn.z3': 'Further afield', 'zn.z3d': 'Anywhere in Belgium · travel costs by distance',
      'zn.see': 'See the area',
      'ft.dispoTxt': '7 days a week, public holidays included', 'ft.legal': 'Free quote, no commitment · Brussels and surroundings',
      'cta2.title': 'Ready to book a call?',
      'cta2.text': 'A short call is the fastest way to find out how we can help. No call centres, no runaround — just a team in Brussels, at a time that suits you.',
      'cta2.btn': 'Book a call', 'cta2.cursor': 'Book<br>a call',
      'title.book': 'Book a call – HomeService BXL',
      'bk.eyebrow': 'Book a call', 'bk.title': 'Your quote, in one call',
      'bk.lead': "Tell us what you need and pick a time: we'll call you for 15 minutes to fine-tune your quote, free and with no commitment.",
      'bk.steps': 'Steps', 'bk.step1': 'Your quote', 'bk.step2': 'The time', 'bk.step3': 'Your details',
      'bk.d.title': 'Customise your quote', 'bk.d.services': 'What do you need?',
      'bk.d.montage': 'Furniture assembly', 'bk.d.err.services': "Pick at least one service: we'll fine-tune it on the call.",
      'bk.d.lieu': 'The place', 'bk.d.appartement': 'Flat', 'bk.d.maison': 'House', 'bk.d.bureau': 'Office', 'bk.d.autre': 'Other',
      'bk.d.surface': 'The size', 'bk.d.s50': 'Under 50 m²', 'bk.d.s100': '50 to 100 m²', 'bk.d.s200': '100 to 200 m²', 'bk.d.s200p': 'Over 200 m²',
      'bk.d.commune': 'Your municipality', 'bk.d.choisir': 'Choose…', 'bk.d.region': 'Brussels-Capital', 'bk.d.peripherie': 'Surrounding area',
      'bk.d.autreCommune': 'Another municipality', 'bk.d.err.commune': 'Tell us where the job is.',
      'bk.d.besoin': 'Your needs in a few words', 'bk.d.besoinPh': 'E.g. deep clean before moving out, three bedrooms, windows included.',
      'bk.continuer': 'Continue', 'bk.r.title': 'Your quote',
      'bk.r.note': "Free and with no commitment. You'll get the exact price on the call, or in writing within 24 h.",
      'bk.call': '15 min call', 'bk.canaux': 'Phone or Google Meet', 'bk.modifierDevis': 'Edit the quote',
      'bk.prec': 'Previous month', 'bk.suiv': 'Next month',
      'bk.c.nom': 'Your name', 'bk.c.err.nom': 'We need a name for the invite.', 'bk.c.email': 'Email address',
      'bk.c.err.email': 'That address does not look right.', 'bk.c.canal': 'How should we call you?', 'bk.c.tel': 'Phone call',
      'bk.c.numero': 'Phone number', 'bk.c.err.tel': 'We need a number to call you on.', 'bk.c.adresse': 'Address of the job',
      'bk.c.facultatif': 'Optional', 'bk.retour': 'Back', 'bk.confirmer': 'Confirm',
      'bk.f.title': 'Your request is ready',
      'bk.f.desc': "All that's left is to send it: the email is already written, with your quote and your time slot. We'll confirm the call the same day.",
      'bk.f.quoi': 'What', 'bk.f.quand': 'When', 'bk.f.qui': 'Who', 'bk.f.ou': 'Where', 'bk.f.devis': 'Quote',
      'bk.f.envoyer': 'Send the request', 'bk.f.agenda': 'Add to calendar', 'bk.f.changer': 'Need to make a change?',
      'bk.f.creneau': 'Change the time', 'bk.f.ou2': 'or', 'bk.f.devis2': 'the quote',
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
      'sur.title': "Need something outside our usual services?",
      'sur.text': "Painting a room, helping with a move, watering your plants while you're away… Tell us what you need. Our team reviews every request and replies within 24 h to let you know whether we can take it on.",
      'sur.cta': "Make a custom request",
      'sur.card.name': "Custom service",
      'sur.card.tier': "Special card · HomeService",
      'sur.card.k1': "Valid for",
      'sur.card.v1': "Any request",
      'sur.card.k2': "Region",
      'faq.title': "Frequently asked questions",
      'faq.lead': "Straightforward answers, so you can move forward with confidence.",
      'faq.aside': "Still have questions?",
      'faq.aside2': "Our team is here to help.",
      'faq.mail': "Email us",
      'faq.q0': "What services do you offer?",
      'faq.a0': "HomeService BXL offers indoor cleaning (houses, flats, offices), outdoor cleaning and gardening, car washing at your home, help with moving and decluttering, grocery delivery, furniture assembly, as well as DIY and small repairs.",
      'faq.q1': "Do you work at weekends?",
      'faq.a1': "Yes, HomeService BXL is available 7 days a week, including weekends and public holidays, in Brussels and the surrounding area.",
      'faq.q2': "How do I get a quote?",
      'faq.a2': "Just click the “Book a call” button, describe what you need in a few questions, then pick a time for a short call. The quote is free and with no commitment, and you'll hear back the same day.",
      'faq.q3': "Which municipalities do you cover?",
      'faq.a3': "We work in all 19 municipalities of the Brussels-Capital Region (Bruxelles-Ville, Ixelles, Schaerbeek, Etterbeek, Saint-Josse-ten-Noode, Uccle, Anderlecht, Molenbeek, Forest, Saint-Gilles, Jette, Evere, Ganshoren, Berchem-Sainte-Agathe, Koekelberg, Woluwe-Saint-Lambert, Woluwe-Saint-Pierre, Auderghem, Watermael-Boitsfort) as well as the surrounding area (Waterloo, Braine-l'Alleud, La Hulpe, Zaventem, Vilvoorde, Tervuren).",
      'faq.q4': "How soon can I get an appointment?",
      'faq.a4': "We reply to every quote request within 24 h and usually offer a quick appointment that fits your schedule.",
      'faq.q5': "What if my need isn't among your services?",
      'faq.a5': "Send us a custom request describing what you need. Our team reviews every request and replies within 24 h to let you know whether we can take it on.",
      'faq.q6': "Do I need to be there during the job?",
      'faq.a6': "Not necessarily. You can be there, or leave us your keys or an access code: we agree together on what suits you best when booking.",
      'faq.q7': "Do you bring the equipment and products?",
      'faq.a7': "Yes, our teams arrive with all the equipment and products needed. If you'd rather we use yours, just let us know.",
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
      'nav.about': 'Over ons', 'nav.stats': 'Regio', 'nav.services': 'Diensten', 'nav.ba': 'Voor / na', 'nav.sur': 'Op maat', 'nav.zone': 'Regio',
      cta: 'Gesprek inplannen',
      'ft.sub': 'Eén aanspreekpunt.<br>Uw dagelijkse leven, geregeld.', 'ft.plan': 'Sitemap',
      'ft.home': 'Home', 'ft.faq': 'FAQ', 'ft.devis': 'Gratis offerte',
      'ft.devisTxt': 'Gratis en vrijblijvend.<br>Antwoord binnen 24 u, 7 dagen op 7.', 'ft.devisLink': 'Mijn offerte voorbereiden',
      'ft.communes': 'Gemeenten', 'ft.s.lavage': 'Auto wassen', 'ft.s.demenagement': 'Verhuishulp', 'ft.s.bricolage': 'Klusjes en kleine werken',
      'ft.zone': 'Werkgebied', 'ft.zoneTxt': 'De 19 gemeenten van <span class="ft-nw">Brussel-Hoofdstad</span>,<br>en de rand.',
      'ft.zoneLink': 'Bekijk het gebied', 'ft.email': 'E-mail', 'ft.call': 'Een gesprek', 'ft.dispo': 'Beschikbaarheid', 'ft.photo': 'Het HomeService-team',
      'zn.close': 'Sluiten', 'zn.mapLabel': 'Kaart van ons werkgebied: Brussel-Hoofdstad, de rand en verder',
      'zn.eyebrow': 'Werkgebied', 'zn.title': 'Brussel, de rand, en verder',
      'zn.lead': 'We komen overal. Alleen de verplaatsingskosten verschillen.',
      'zn.z1': 'Brussel-Hoofdstad', 'zn.z1d': 'De 19 gemeenten · laagste verplaatsingskosten',
      'zn.z2': 'Rand', 'zn.z2d': 'De gemeenten die aan Brussel grenzen, en ook Wezembeek-Oppem · beperkte verplaatsingskosten',
      'zn.z3': 'Verder weg', 'zn.z3d': 'Overal in België · kosten volgens de afstand',
      'zn.see': 'Bekijk het gebied',
      'ft.dispoTxt': '7 dagen op 7, ook op feestdagen', 'ft.legal': 'Gratis en vrijblijvende offerte · Brussel en de rand',
      'cta2.title': 'Klaar om een gesprek in te plannen?',
      'cta2.text': 'Een kort gesprek is de snelste manier om te ontdekken hoe wij u kunnen helpen. Geen callcenter, geen omwegen: gewoon een team in Brussel, op een moment dat u past.',
      'cta2.btn': 'Gesprek inplannen', 'cta2.cursor': 'Gesprek<br>inplannen',
      'title.book': 'Gesprek inplannen – HomeService BXL',
      'bk.eyebrow': 'Gesprek inplannen', 'bk.title': 'Uw offerte, in één gesprek',
      'bk.lead': 'Vertel ons wat u nodig hebt en kies een moment: wij bellen u 15 minuten om uw offerte te verfijnen, gratis en vrijblijvend.',
      'bk.steps': 'Stappen', 'bk.step1': 'Uw offerte', 'bk.step2': 'Het moment', 'bk.step3': 'Uw gegevens',
      'bk.d.title': 'Stel uw offerte samen', 'bk.d.services': 'Wat hebt u nodig?',
      'bk.d.montage': 'Meubelmontage', 'bk.d.err.services': 'Kies minstens één dienst: we verfijnen alles tijdens het gesprek.',
      'bk.d.lieu': 'De plaats', 'bk.d.appartement': 'Appartement', 'bk.d.maison': 'Huis', 'bk.d.bureau': 'Kantoor', 'bk.d.autre': 'Andere',
      'bk.d.surface': 'De oppervlakte', 'bk.d.s50': 'Minder dan 50 m²', 'bk.d.s100': '50 tot 100 m²', 'bk.d.s200': '100 tot 200 m²', 'bk.d.s200p': 'Meer dan 200 m²',
      'bk.d.commune': 'Uw gemeente', 'bk.d.choisir': 'Kiezen…', 'bk.d.region': 'Brussels Hoofdstedelijk Gewest', 'bk.d.peripherie': 'Rand',
      'bk.d.autreCommune': 'Andere gemeente', 'bk.d.err.commune': 'Laat ons weten waar we moeten zijn.',
      'bk.d.besoin': 'Uw behoefte in enkele woorden', 'bk.d.besoinPh': 'Bv. grote schoonmaak voor een verhuizing, drie slaapkamers, ramen inbegrepen.',
      'bk.continuer': 'Doorgaan', 'bk.r.title': 'Uw offerte',
      'bk.r.note': 'Gratis en vrijblijvend. De exacte prijs krijgt u tijdens het gesprek, of schriftelijk binnen 24 u.',
      'bk.call': 'Gesprek van 15 min', 'bk.canaux': 'Telefoon of Google Meet', 'bk.modifierDevis': 'Offerte wijzigen',
      'bk.prec': 'Vorige maand', 'bk.suiv': 'Volgende maand',
      'bk.c.nom': 'Uw naam', 'bk.c.err.nom': 'We hebben een naam nodig voor de uitnodiging.', 'bk.c.email': 'E-mailadres',
      'bk.c.err.email': 'Dit adres lijkt niet te kloppen.', 'bk.c.canal': 'Hoe mogen we u bellen?', 'bk.c.tel': 'Telefonisch',
      'bk.c.numero': 'Telefoonnummer', 'bk.c.err.tel': 'We hebben een nummer nodig om u te bellen.', 'bk.c.adresse': 'Adres van de opdracht',
      'bk.c.facultatif': 'Optioneel', 'bk.retour': 'Terug', 'bk.confirmer': 'Bevestigen',
      'bk.f.title': 'Uw aanvraag is klaar',
      'bk.f.desc': 'U hoeft ze enkel nog te versturen: de e-mail is al opgesteld, met uw offerte en uw tijdstip. Wij bevestigen het gesprek nog dezelfde dag.',
      'bk.f.quoi': 'Wat', 'bk.f.quand': 'Wanneer', 'bk.f.qui': 'Wie', 'bk.f.ou': 'Waar', 'bk.f.devis': 'Offerte',
      'bk.f.envoyer': 'Aanvraag versturen', 'bk.f.agenda': 'Toevoegen aan agenda', 'bk.f.changer': 'Iets wijzigen?',
      'bk.f.creneau': 'Tijdstip wijzigen', 'bk.f.ou2': 'of', 'bk.f.devis2': 'de offerte',
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
      'sur.title': "Iets nodig buiten onze gewone diensten?",
      'sur.text': "Een kamer schilderen, helpen bij een verhuizing, uw planten water geven tijdens de vakantie… Vertel ons wat u nodig hebt. Ons team bekijkt elke aanvraag en antwoordt binnen 24 u of we die kunnen opnemen.",
      'sur.cta': "Een aanvraag op maat doen",
      'sur.card.name': "Dienst op maat",
      'sur.card.tier': "Speciale kaart · HomeService",
      'sur.card.k1': "Geldig voor",
      'sur.card.v1': "Elke aanvraag",
      'sur.card.k2': "Regio",
      'faq.title': "Veelgestelde vragen",
      'faq.lead': "Duidelijke antwoorden, zodat u met vertrouwen verder kunt.",
      'faq.aside': "Nog vragen?",
      'faq.aside2': "Ons team helpt u graag verder.",
      'faq.mail': "Mail ons",
      'faq.q0': "Welke diensten bieden jullie aan?",
      'faq.a0': "HomeService BXL biedt binnenschoonmaak (huizen, appartementen, kantoren), buitenschoonmaak en tuinwerk, autowassen aan huis, hulp bij verhuizen en ontruiming, levering van boodschappen, montage van meubels en klusjes en kleine werken aan.",
      'faq.q1': "Werken jullie ook in het weekend?",
      'faq.a1': "Ja, HomeService BXL is 7 dagen op 7 beschikbaar, ook in het weekend en op feestdagen, in Brussel en de rand.",
      'faq.q2': "Hoe krijg ik een offerte?",
      'faq.a2': "Klik op de knop “Gesprek inplannen”, beschrijf uw behoefte in enkele vragen en kies een moment voor een kort gesprek. De offerte is gratis en vrijblijvend, en u krijgt nog dezelfde dag antwoord.",
      'faq.q3': "In welke gemeenten werken jullie?",
      'faq.a3': "Wij werken in de 19 gemeenten van het Brussels Hoofdstedelijk Gewest (Bruxelles-Ville, Ixelles, Schaerbeek, Etterbeek, Saint-Josse-ten-Noode, Uccle, Anderlecht, Molenbeek, Forest, Saint-Gilles, Jette, Evere, Ganshoren, Berchem-Sainte-Agathe, Koekelberg, Woluwe-Saint-Lambert, Woluwe-Saint-Pierre, Auderghem, Watermael-Boitsfort) en in de rand (Waterloo, Eigenbrakel, Terhulpen, Zaventem, Vilvoorde, Tervuren).",
      'faq.q4': "Hoe snel kan ik een afspraak krijgen?",
      'faq.a4': "Wij beantwoorden elke offerteaanvraag binnen 24 u en stellen meestal snel een afspraak voor, afgestemd op uw beschikbaarheid.",
      'faq.q5': "Mijn behoefte staat niet bij jullie diensten, wat nu?",
      'faq.a5': "Doe een aanvraag op maat en beschrijf wat u nodig hebt. Ons team bekijkt elke aanvraag en antwoordt binnen 24 u of we die kunnen opnemen.",
      'faq.q6': "Moet ik aanwezig zijn tijdens de interventie?",
      'faq.a6': "Dat hoeft niet. U kunt er zijn, of ons uw sleutels of een toegangscode toevertrouwen: we spreken samen af wat u het best uitkomt.",
      'faq.q7': "Brengen jullie het materiaal en de producten mee?",
      'faq.a7': "Ja, onze ploegen komen met al het nodige materiaal en de producten. Hebt u liever dat we de uwe gebruiken, laat het ons gewoon weten.",
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
    ['[data-i18n-suffix]', 'i18nSuffix', (el) => el.dataset.suffix, (el, v) => { el.dataset.suffix = v; }],
    ['[data-i18n-placeholder]', 'i18nPlaceholder', (el) => el.placeholder, (el, v) => { el.placeholder = v; }],
    ['[data-i18n-label]', 'i18nLabel', (el) => el.label, (el, v) => { el.label = v; }]];
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
