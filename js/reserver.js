// Réserver un appel et préparer son devis (reserver.html). Le module de réservation de la page /contact du site
// Harborview (Projets/Harborview/assets/booking.js, repris du booker de Cal.com), précédé d'un écran de devis.
// Cinq écrans : le devis (services, lieu, surface, code postal, détails ; le résumé se compose à
// droite) — ou, avec ?demande=sur-mesure (bouton de la section « sur mesure » de l'accueil), une demande libre (un texte,
// le lieu, le code postal) — la ou les dates de l'intervention (un calendrier ; les 7 prochains jours sont l'urgence, avec des frais en
// plus), le jour et l'heure d'un appel de 15 min, les coordonnées, puis la demande complète.
//
// Le site est statique : la demande (devis, créneau, coordonnées) part par FormSubmit (formsubmit.co), qui la remet
// par e-mail à l'adresse de l'équipe — toujours en français, quelle que soit la langue du visiteur. Le premier envoi
// déclenche chez FormSubmit un e-mail d'activation à cette adresse : tant qu'il n'est pas validé, rien n'arrive.
// L'écran final ne s'affiche qu'une fois l'envoi accepté, avec les liens d'ajout à l'agenda.
// Textes : ceux de la page passent par js/i18n.js ; ceux que ce script écrit (dates, résumé, e-mail) sont ici, et
// tout se redessine au changement de langue (événement hs:lang).
(() => {
  const el = document.getElementById('bk');
  if (!el) return;
  // demande sur mesure : la CSS montre les textes .bk-seul-sur et cache les .bk-seul-devis
  const SUR = new URLSearchParams(location.search).get('demande') === 'sur-mesure';
  if (SUR) document.querySelector('.bk-page').dataset.mode = 'sur';

  const DISPO = {
    debut: 9,            // première heure d'appel
    fin: 19,             // dernière heure (le dernier appel finit ici)
    pas: 15,             // minutes entre deux créneaux
    duree: 15,           // durée d'un appel
    delai: 2,            // heures de préavis minimum
    horizon: 60,         // jours ouverts à la réservation
    joursOuvres: null,   // null = 7 jours sur 7 ; sinon [1, 2, 3, 4, 5] par exemple
  };
  // les dates de l'intervention : [jours d'urgence à partir d'aujourd'hui (frais en plus), jours ouverts au choix]
  const INTERV = { urgence: 7, horizon: 90 };
  const MAIL = 'homeservicebxl.contact@gmail.com';

  const D = {
    fr: {
      videSur: 'Décrivez votre demande : elle se résume ici.', titreSur: 'Demande sur mesure – HomeService BXL', sur: 'Sur mesure',
      locale: 'fr-BE', urg: 'urgence', aucune: "Aucune date pour l'instant.", retirer: 'Retirer', sep: ' : ', pick: 'Choisissez un jour pour voir les heures.', none: 'Plus aucun créneau ce jour-là.',
      call: (n) => `Appel de 15 min entre HomeService BXL et ${n}`, tel: 'Par téléphone', host: 'Hôte',
      vide: 'Choisissez vos services : votre devis se compose ici.',
      k: { sur: 'Demande', services: 'Services', lieu: 'Lieu', surface: 'Surface',
        commune: 'Code postal', dates: 'Dates', besoin: 'Détails' },
      sujet: (n) => `Réservation d'un appel – devis – ${n}`,
      agenda: 'Réservé sur HomeService BXL',
    },
    en: {
      videSur: "Describe your request: it's summed up here.", titreSur: 'Custom request – HomeService BXL', sur: 'Custom',
      locale: 'en-GB', urg: 'urgent', aucune: 'No dates yet.', retirer: 'Remove', sep: ': ', pick: 'Pick a day to see the times.', none: 'Nothing left on this day.',
      call: (n) => `15 min call between HomeService BXL and ${n}`, tel: 'Phone call', host: 'Host',
      vide: 'Pick your services: your quote takes shape here.',
      k: { sur: 'Request', services: 'Services', lieu: 'Place', surface: 'Size',
        commune: 'Postcode', dates: 'Dates', besoin: 'Details' },
      sujet: (n) => `Call booking – quote – ${n}`,
      agenda: 'Booked on HomeService BXL',
    },
    nl: {
      videSur: 'Beschrijf uw aanvraag: hier wordt ze samengevat.', titreSur: 'Aanvraag op maat – HomeService BXL', sur: 'Op maat',
      locale: 'nl-BE', urg: 'spoed', aucune: 'Nog geen data.', retirer: 'Verwijderen', sep: ': ', pick: 'Kies een dag om de uren te zien.', none: 'Geen tijdstippen meer op deze dag.',
      call: (n) => `Gesprek van 15 min tussen HomeService BXL en ${n}`, tel: 'Telefonisch', host: 'Gastheer',
      vide: 'Kies uw diensten: hier krijgt uw offerte vorm.',
      k: { sur: 'Aanvraag', services: 'Diensten', lieu: 'Plaats', surface: 'Oppervlakte',
        commune: 'Postcode', dates: 'Data', besoin: 'Details' },
      sujet: (n) => `Gesprek inplannen – offerte – ${n}`,
      agenda: 'Geboekt op HomeService BXL',
    },
  };
  const lang = () => (document.documentElement.lang || 'fr').slice(0, 2);
  const t = () => D[lang()] || D.fr;

  const ICONES = {
    tel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z"/></svg>',
  };

  const q = (s) => el.querySelector(s);
  const qa = (s) => [...el.querySelectorAll(s)];
  const texte = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const minuit = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const memeJour = (a, b) => a && b && a.toDateString() === b.toDateString();
  let fuseau = 'Europe/Brussels';
  try { fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone || fuseau; } catch {}

  const etat = {
    services: new Set(), lieu: '', surface: '', dates: new Set(), dMois: minuit(new Date()),
    jour: null, creneau: null, format24: true, moisVu: minuit(new Date()),
  };

  // ------------------------------------------------------------ 1. le devis
  const GROUPES = ['services', 'lieu', 'surface'];
  // le libellé d'une pastille, dans la langue affichée ou, avec fr, dans celle de la page (pour l'e-mail de l'équipe)
  function libelle(groupe, v, fr) {
    const b = q(`[data-groupe="${groupe}"] [data-v="${v}"]`);
    if (!b) return '';
    const orig = fr && b.dataset.i18n && window.hsFr?.(b.dataset.i18n);
    return (orig ? orig.replace(/<[^>]*>/g, '') : b.textContent).trim();
  }
  function marqueFaute(champ, oui) {
    champ.closest('.bk-champ')?.classList.toggle('est-fautif', !!oui);
    return !oui;
  }
  qa('.bk-pastilles').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('.bk-pastille');
    if (!b) return;
    const nom = g.dataset.groupe;
    if ('multi' in g.dataset) {                    // plusieurs services à la fois
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (on) etat.services.add(b.dataset.v); else etat.services.delete(b.dataset.v);
    } else {                                       // un seul choix ; un second clic le retire
      const on = etat[nom] !== b.dataset.v;
      g.querySelectorAll('.bk-pastille').forEach((p) => p.setAttribute('aria-pressed', String(on && p === b)));
      etat[nom] = on ? b.dataset.v : '';
    }
    if (nom === 'services' && etat.services.size) marqueFaute(g, false);
    resume();
  }));
  const commune = q('#bk-commune'), besoin = q('#bk-besoin'), libre = q('#bk-sur');
  // le code postal : quatre chiffres (on ne garde que les chiffres tapés)
  const cpOk = () => /^\d{4}$/.test(commune.value);
  commune.addEventListener('input', () => {
    const v = commune.value.replace(/\D/g, '').slice(0, 4);
    if (v !== commune.value) commune.value = v;
    if (cpOk()) marqueFaute(commune, false);
    resume();
  });
  besoin.addEventListener('input', resume);
  libre.addEventListener('input', () => { if (libre.value.trim()) marqueFaute(libre, false); resume(); });

  // les choix du devis, dans l'ordre de l'écran : [clé, libellé de la clé, valeur affichée]
  function lignesDevis() {
    const k = t().k, out = [];
    if (SUR) {
      if (libre.value.trim()) out.push(['sur', k.sur, libre.value.trim()]);
      if (etat.lieu) out.push(['lieu', k.lieu, libelle('lieu', etat.lieu)]);
      if (cpOk()) out.push(['commune', k.commune, commune.value]);
      if (etat.dates.size) out.push(['dates', k.dates, datesTriees().map(dateCourte).join(', ')]);
      return out;
    }
    const svc = [...etat.services].map((v) => libelle('services', v));
    if (svc.length) out.push(['services', k.services, svc.join(', ')]);
    for (const g of GROUPES.slice(1)) if (etat[g]) out.push([g, k[g], libelle(g, etat[g])]);
    if (cpOk()) out.push(['commune', k.commune, commune.value]);
    if (etat.dates.size) out.push(['dates', k.dates, datesTriees().map(dateCourte).join(', ')]);
    if (besoin.value.trim()) out.push(['besoin', k.besoin, besoin.value.trim()]);
    return out;
  }
  function resume() {
    const l = lignesDevis();
    q('#bk-resume').innerHTML = l.length
      ? l.map(([c, k, v]) => `<div class="bk-resume__ligne bk-resume__ligne--${c}"><dt>${texte(k)}</dt><dd>${texte(v)}</dd></div>`).join('')
      : `<p class="bk-resume__vide">${texte(SUR ? t().videSur : t().vide)}</p>`;
    const svc = SUR ? t().sur : [...etat.services].map((v) => libelle('services', v)).join(', ');
    qa('.bk-services').forEach((s) => { s.textContent = svc; s.parentElement.hidden = !svc; });
  }

  q('#bk-suivant').addEventListener('click', () => {
    let ok = SUR ? marqueFaute(libre, !libre.value.trim()) : marqueFaute(q('[data-groupe="services"]'), !etat.services.size);
    ok = marqueFaute(commune, !cpOk()) && ok;
    if (!ok) { q('.est-fautif')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    allerA('dates');
  });

  // ------------------------------------------------------------ 2. les dates de l'intervention
  // une ou plusieurs, d'aujourd'hui à INTERV.horizon jours ; les INTERV.urgence premiers jours sont l'urgence
  const cle = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deCle = (k) => { const [y, m, j] = k.split('-').map(Number); return new Date(y, m - 1, j); };
  const ecart = (d) => Math.round((minuit(d) - minuit(new Date())) / 86400000);
  const urgent = (d) => { const e = ecart(d); return e >= 0 && e < INTERV.urgence; };
  const datesTriees = () => [...etat.dates].sort().map(deCle);
  const dateCourte = (d) => maj(fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(d)) + (urgent(d) ? ` (${t().urg})` : '');
  function dessineDates() {
    const vue = etat.dMois, auj = minuit(new Date());
    q('#bk-d-mois').innerHTML = texte(maj(fmt({ month: 'long' }).format(vue))) + ' <em>' + vue.getFullYear() + '</em>';
    q('#bk-d-jours').innerHTML = Array.from({ length: 7 }, (_, i) =>
      `<span>${texte(fmt({ weekday: 'short' }).format(new Date(2024, 0, 1 + i)).replace('.', ''))}</span>`).join('');
    q('#bk-d-prec').disabled = vue.getFullYear() === auj.getFullYear() && vue.getMonth() === auj.getMonth();
    const limite = new Date(auj);
    limite.setDate(limite.getDate() + INTERV.horizon);
    q('#bk-d-suiv').disabled = new Date(vue.getFullYear(), vue.getMonth() + 1, 1) > limite;
    const premier = new Date(vue.getFullYear(), vue.getMonth(), 1), debut = new Date(premier);
    debut.setDate(1 - ((premier.getDay() + 6) % 7));
    const grille = q('#bk-d-grille');
    grille.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      if (i >= 35 && d.getMonth() !== vue.getMonth()) break;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-case';
      b.textContent = d.getDate();
      b.dataset.cle = cle(d);
      b.setAttribute('aria-label', dateLongue(d) + (urgent(d) ? ` (${t().urg})` : ''));
      if (d < auj || d > limite) b.disabled = true;
      else {
        b.classList.add('est-libre');
        if (urgent(d)) b.classList.add('est-urgent');
        const on = etat.dates.has(b.dataset.cle);
        b.classList.toggle('est-choisi', on);
        b.setAttribute('aria-pressed', String(on));
      }
      if (memeJour(d, auj)) b.classList.add('est-aujourdhui');
      grille.appendChild(b);
    }
    listeDates();
  }
  // à droite : les dates choisies (chacune se retire), et l'avertissement de l'urgence
  function listeDates() {
    const T = t(), l = datesTriees();
    q('#bk-choix-dates').innerHTML = l.length
      ? l.map((d) => `<li${urgent(d) ? ' class="est-urgent"' : ''}><span>${texte(maj(fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(d)))}</span>`
        + (urgent(d) ? `<em>${texte(T.urg)}</em>` : '')
        + `<button type="button" data-cle="${cle(d)}" aria-label="${texte(T.retirer)}">×</button></li>`).join('')
      : `<li class="bk-choix-dates__vide">${texte(T.aucune)}</li>`;
    q('#bk-urgence').hidden = !l.some(urgent);
  }
  function basculeDate(k) {
    if (etat.dates.has(k)) etat.dates.delete(k); else etat.dates.add(k);
    if (etat.dates.size) marqueFaute(q('#bk-d-grille'), false);
    dessineDates();
    resume();
  }
  q('#bk-d-grille').addEventListener('click', (e) => {
    const b = e.target.closest('.bk-case');
    if (b && !b.disabled) basculeDate(b.dataset.cle);
  });
  q('#bk-choix-dates').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cle]');
    if (b) basculeDate(b.dataset.cle);
  });
  q('#bk-d-prec').addEventListener('click', () => {
    etat.dMois = new Date(etat.dMois.getFullYear(), etat.dMois.getMonth() - 1, 1);
    dessineDates();
  });
  q('#bk-d-suiv').addEventListener('click', () => {
    etat.dMois = new Date(etat.dMois.getFullYear(), etat.dMois.getMonth() + 1, 1);
    dessineDates();
  });
  q('#bk-dates-suivant').addEventListener('click', () => {
    if (!marqueFaute(q('#bk-d-grille'), !etat.dates.size)) return;
    allerA('quand');
  });

  // ------------------------------------------------------------ 3. calendrier et créneaux
  function creneaux(d) {
    const out = [], tot = (DISPO.fin - DISPO.debut) * 60 - DISPO.duree;
    const plancher = new Date();
    plancher.setHours(plancher.getHours() + DISPO.delai);
    for (let m = 0; m <= tot; m += DISPO.pas) {
      const c = new Date(d);
      c.setHours(DISPO.debut, m, 0, 0);
      if (c >= plancher) out.push(c);
    }
    return out;
  }
  function jourOuvert(d) {
    const auj = minuit(new Date()), limite = new Date(auj);
    limite.setDate(limite.getDate() + DISPO.horizon);
    if (d < auj || d > limite) return false;
    if (DISPO.joursOuvres && !DISPO.joursOuvres.includes(d.getDay())) return false;
    return creneaux(d).length > 0;
  }
  const fmt = (o) => new Intl.DateTimeFormat(t().locale, o);
  function heure(d) {
    if (etat.format24) return fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    return (h % 12 || 12) + ':' + m + (h < 12 ? 'am' : 'pm');
  }
  const dateLongue = (d) => {
    const s = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function dessineMois() {
    const vue = etat.moisVu;
    q('#bk-mois').innerHTML = texte(maj(fmt({ month: 'long' }).format(vue))) + ' <em>' + vue.getFullYear() + '</em>';
    // la semaine commence le lundi, comme en Belgique (le 1er janvier 2024 est un lundi)
    q('#bk-jours').innerHTML = Array.from({ length: 7 }, (_, i) =>
      `<span>${texte(fmt({ weekday: 'short' }).format(new Date(2024, 0, 1 + i)).replace('.', ''))}</span>`).join('');
    const auj = minuit(new Date());
    q('#bk-prec').disabled = vue.getFullYear() === auj.getFullYear() && vue.getMonth() === auj.getMonth();
    const premier = new Date(vue.getFullYear(), vue.getMonth(), 1);
    const debut = new Date(premier);
    debut.setDate(1 - ((premier.getDay() + 6) % 7));
    const grille = q('#bk-grille');
    grille.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(debut.getDate() + i);
      if (i >= 35 && d.getMonth() !== vue.getMonth()) break;      // 6e rangée inutile
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-case';
      b.textContent = d.getDate();
      b.dataset.jour = d.toISOString();
      b.setAttribute('aria-label', dateLongue(d));
      if (d.getMonth() !== vue.getMonth() && d.getDate() === 1) {
        const tag = document.createElement('span');
        tag.className = 'bk-case-mois';
        tag.textContent = fmt({ month: 'short' }).format(d).replace('.', '');
        b.appendChild(tag);
      }
      if (jourOuvert(d)) b.classList.add('est-libre'); else b.disabled = true;
      if (memeJour(d, auj)) b.classList.add('est-aujourdhui');
      if (memeJour(d, etat.jour)) { b.classList.add('est-choisi'); b.setAttribute('aria-pressed', 'true'); }
      grille.appendChild(b);
    }
  }
  function dessineCreneaux() {
    const liste = q('#bk-liste');
    liste.innerHTML = '';
    if (!etat.jour) {
      q('#bk-jour').textContent = '';
      liste.innerHTML = `<p class="bk-vide">${texte(t().pick)}</p>`;
      return;
    }
    q('#bk-jour').innerHTML = texte(maj(fmt({ weekday: 'short' }).format(etat.jour).replace('.', ''))) + ' <em>' + etat.jour.getDate() + '</em>';
    const libres = creneaux(etat.jour);
    if (!libres.length) { liste.innerHTML = `<p class="bk-vide">${texte(t().none)}</p>`; return; }
    libres.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-creneau';
      b.textContent = heure(c);
      b.dataset.heure = c.toISOString();
      if (etat.creneau && c.getTime() === etat.creneau.getTime()) b.classList.add('est-choisi');
      b.style.animationDelay = Math.min(i, 20) * 18 + 'ms';     // les vingt premiers entrent l'un après l'autre
      liste.appendChild(b);
    });
  }
  q('#bk-grille').addEventListener('click', (e) => {
    const b = e.target.closest('.bk-case');
    if (!b || b.disabled) return;
    etat.jour = minuit(new Date(b.dataset.jour));
    etat.creneau = null;
    dessineMois();
    dessineCreneaux();
  });
  // le créneau se marque d'abord, l'écran change ensuite : le temps d'un regard (320 ms)
  q('#bk-liste').addEventListener('click', (e) => {
    const b = e.target.closest('.bk-creneau');
    if (!b) return;
    qa('.bk-creneau').forEach((x) => x.classList.toggle('est-choisi', x === b));
    etat.creneau = new Date(b.dataset.heure);
    remplitRecap();
    setTimeout(() => allerA('confirmer'), 320);
  });
  q('#bk-prec').addEventListener('click', () => {
    etat.moisVu = new Date(etat.moisVu.getFullYear(), etat.moisVu.getMonth() - 1, 1);
    dessineMois();
  });
  q('#bk-suiv').addEventListener('click', () => {
    etat.moisVu = new Date(etat.moisVu.getFullYear(), etat.moisVu.getMonth() + 1, 1);
    dessineMois();
  });
  q('.bk-format').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    etat.format24 = b.dataset.format === '24';
    qa('.bk-format button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    dessineCreneaux();
    remplitRecap();
  });

  // ------------------------------------------------------------ 4. coordonnées
  const fin = () => new Date(etat.creneau.getTime() + DISPO.duree * 60000);
  function remplitRecap() {
    if (!etat.creneau) return;
    q('#bk-recap-date').textContent = dateLongue(etat.creneau);
    q('#bk-recap-heure').textContent = heure(etat.creneau) + ' – ' + heure(fin());
    q('#bk-recap-canal').textContent = t().tel;
  }
  q('.bk-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const nom = q('#bk-nom'), email = q('#bk-email'), tel = q('#bk-tel');
    let ok = marqueFaute(nom, !nom.value.trim());
    ok = marqueFaute(email, !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) && ok;
    ok = marqueFaute(tel, tel.value.replace(/\D/g, '').length < 8) && ok;
    if (ok) envoyer();
  });

  // ------------------------------------------------------------ 5. la demande
  const horodate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function liensAgenda(debut, fin2, titre, detail, lieu) {
    const e = encodeURIComponent, d1 = horodate(debut), d2 = horodate(fin2);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HomeService BXL//Appel//FR', 'BEGIN:VEVENT',
      'UID:' + Date.now() + '@homeservice-bxl', 'DTSTAMP:' + horodate(new Date()), 'DTSTART:' + d1, 'DTEND:' + d2,
      'SUMMARY:' + titre, 'DESCRIPTION:' + detail.replace(/\n/g, '\\n'), 'LOCATION:' + lieu, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return {
      google: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${e(titre)}&dates=${d1}/${d2}&details=${e(detail)}&location=${e(lieu)}`,
      outlook: 'https://outlook.live.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent'
        + `&subject=${e(titre)}&startdt=${e(debut.toISOString())}&enddt=${e(fin2.toISOString())}&body=${e(detail)}&location=${e(lieu)}`,
      ics: 'data:text/calendar;charset=utf-8,' + e(ics),
    };
  }
  const datesFr = () => datesTriees().map((d) => d.toLocaleDateString(D.fr.locale, { weekday: 'short', day: 'numeric', month: 'short' })
    + (urgent(d) ? ` (${D.fr.urg})` : '')).join(', ');
  // la demande telle que l'équipe la reçoit (toujours en français) : FormSubmit en fait un tableau, dans cet ordre
  function demande() {
    const F = D.fr, L = lang();
    const nom = q('#bk-nom').value.trim(), email = q('#bk-email').value.trim();
    const tel = q('#bk-tel').value.trim(), adresse = q('#bk-adresse').value.trim();
    const dl = (d) => d.toLocaleDateString(F.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const hh = (d) => d.toLocaleTimeString(F.locale, { hour: '2-digit', minute: '2-digit' });
    const champs = {
      _subject: SUR ? `Demande sur mesure – ${nom}` : F.sujet(nom), _template: 'table', _captcha: 'false', _replyto: email, _honey: q('#bk-piege').value,
      'Appel': `${dl(etat.creneau)}, ${hh(etat.creneau)} – ${hh(fin())} (${fuseau})`,
      'Téléphone': tel, 'Nom': nom, 'E-mail': email,
    };
    if (adresse) champs['Adresse'] = adresse;
    if (SUR) {
      champs['Type'] = 'Demande sur mesure';
      champs[F.k.sur] = libre.value.trim();
      if (etat.lieu) champs[F.k.lieu] = libelle('lieu', etat.lieu, 'fr');
      if (cpOk()) champs[F.k.commune] = commune.value;
      if (etat.dates.size) champs[F.k.dates] = datesFr();
      champs['Langue du site'] = { fr: 'français', en: 'anglais', nl: 'néerlandais' }[L] || L;
      return champs;
    }
    // le devis, relu avec les libellés français
    const svc = [...etat.services].map((v) => libelle('services', v, 'fr'));
    if (svc.length) champs[F.k.services] = svc.join(', ');
    for (const g of GROUPES.slice(1)) if (etat[g]) champs[F.k[g]] = libelle(g, etat[g], 'fr');
    if (cpOk()) champs[F.k.commune] = commune.value;
    if (etat.dates.size) champs[F.k.dates] = datesFr();
    if (besoin.value.trim()) champs[F.k.besoin] = besoin.value.trim();
    champs['Langue du site'] = { fr: 'français', en: 'anglais', nl: 'néerlandais' }[L] || L;
    return champs;
  }

  let enCours = false;
  async function envoyer() {
    if (enCours) return;
    enCours = true;
    const bouton = q('#bk-confirmer'), erreur = q('#bk-envoi-erreur');
    bouton.disabled = true;
    bouton.classList.add('est-envoi');
    erreur.hidden = true;
    let ok = false;
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${MAIL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(demande()),
      });
      const j = await r.json().catch(() => ({}));
      ok = r.ok && String(j.success) === 'true';
    } catch {}
    enCours = false;
    bouton.disabled = false;
    bouton.classList.remove('est-envoi');
    if (!ok) { erreur.hidden = false; return; }
    afficheFait();
  }

  // l'écran final : le récapitulatif de ce qui vient de partir
  function afficheFait() {
    const T = t();
    const nom = q('#bk-nom').value.trim(), email = q('#bk-email').value.trim(), tel = q('#bk-tel').value.trim();
    const titre = T.call(nom);
    const lieu = `${T.tel} – ${tel}`;
    const devis = lignesDevis();

    q('#bk-quoi').textContent = titre;
    q('#bk-quand-d').textContent = dateLongue(etat.creneau);
    q('#bk-quand-h').textContent = heure(etat.creneau) + ' – ' + heure(fin());
    q('#bk-quand-tz').textContent = '(' + fuseau + ')';
    q('#bk-qui').innerHTML = `HomeService BXL <span class="bk-jeton bk-jeton--hote">${texte(T.host)}</span>`
      + `<br><small class="bk-sec">${MAIL}</small><br><br>${texte(nom)}<br><small class="bk-sec">${texte(email)}`
      + ' · ' + texte(tel) + '</small>';
    q('#bk-ou').textContent = lieu;
    q('#bk-devis').innerHTML = devis.map(([, k, v]) => `<span class="bk-sec">${texte(k + T.sep.trimEnd())}</span> ${texte(v)}`).join('<br>');

    const liens = liensAgenda(etat.creneau, fin(), titre, `${T.agenda}\n${devis.map(([, k, v]) => k + T.sep + v).join('\n')}`, lieu);
    q('#bk-cal-google').href = liens.google;
    q('#bk-cal-outlook').href = liens.outlook;
    q('#bk-cal-ics').href = liens.ics;
    allerA('fait');
  }

  // ------------------------------------------------------------ navigation entre écrans
  function allerA(etape, defile = true) {
    el.dataset.step = etape;
    const n = ['devis', 'dates', 'quand', 'confirmer'].indexOf(etape);
    document.querySelectorAll('.bk-fil-item').forEach((item, i) => {
      item.classList.toggle('est-actif', i === n);
      item.classList.toggle('est-fait', n < 0 || i < n);
    });
    if (etape === 'dates') dessineDates();
    if (etape === 'quand') { dessineMois(); dessineCreneaux(); }
    const haut = document.querySelector('.bk-fil').getBoundingClientRect().top;
    if (defile && (haut < 0 || haut > innerHeight * 0.6)) document.querySelector('.bk-fil').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  qa('[data-aller]').forEach((b) => b.addEventListener('click', () => allerA(b.dataset.aller)));

  // la langue change : tout ce que ce script a écrit est récrit
  const titrePage = () => { if (SUR) document.title = t().titreSur; };
  addEventListener('hs:lang', () => {
    titrePage();
    resume();
    dessineDates();
    dessineMois();
    dessineCreneaux();
    remplitRecap();
    if (el.dataset.step === 'fait') afficheFait();
  });

  // premier jour libre présélectionné, comme sur la référence
  const d = minuit(new Date());
  for (let i = 0; i < DISPO.horizon && !jourOuvert(d); i++) d.setDate(d.getDate() + 1);
  etat.jour = jourOuvert(d) ? d : null;
  if (etat.jour) etat.moisVu = new Date(etat.jour.getFullYear(), etat.jour.getMonth(), 1);
  qa('.bk-fuseau').forEach((s) => { s.textContent = fuseau; });
  resume();
  remplitRecap();
  dessineMois();
  dessineCreneaux();
  q('#bk-recap-canal-ic').innerHTML = ICONES.tel;
  q('#bk-recap-canal').textContent = t().tel;
  allerA('devis', false);
  // arrivée depuis un bouton « Demander un devis » d'un service : ?service=nettoyage le présélectionne
  titrePage();
  const pre = !SUR && new URLSearchParams(location.search).get('service');
  if (pre) q(`[data-groupe="services"] [data-v="${CSS.escape(pre)}"]`)?.click();
  // arrivée depuis la zone d'intervention (js/zone.js) : ?cp=1050 remplit le code postal de la commune choisie
  const venue = new URLSearchParams(location.search).get('cp');
  if (venue && /^\d{4}$/.test(venue)) { commune.value = venue; commune.dispatchEvent(new Event('input')); }
})();
