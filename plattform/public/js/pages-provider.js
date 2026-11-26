'use strict';
(() => {
  const A = window.App, el = A.el;

  const jobCard = (j, onBookmark) => el('article', { class: 'card stack' },
    el('div', { class: 'chips' }, A.locChip(j.location_pref), A.statusChip(j.status), j.service === 'lack' ? el('span', { class: 'chip warn' }, 'Lackschaden') : null, j.photo_count ? el('span', { class: 'chip' }, `${j.photo_count} Foto${j.photo_count === 1 ? '' : 's'}`) : null),
    el('h3', {}, A.label('services', j.service)),
    A.requestFacts(j),
    el('p', {}, j.description),
    el('div', { class: 'row' },
      el('a', { class: 'btn primary sm', href: '#/job/' + j.id }, 'Details ansehen'),
      A.me && A.me.role === 'betrieb' ? el('button', { class: 'btn ghost sm', 'aria-pressed': j.bookmarked ? 'true' : 'false', onclick: () => onBookmark(j) }, j.bookmarked ? 'Gemerkt ✓' : 'Merken') : null));

  const toggleBookmark = async (j) => {
    try { await A.api(j.bookmarked ? 'DELETE' : 'POST', `/api/jobs/${j.id}/bookmark`); j.bookmarked = !j.bookmarked; A.toast(j.bookmarked ? 'Gemerkt' : 'Nicht mehr gemerkt'); A.render(); }
    catch (e) { A.toast(e.message); }
  };

  // ---------- Aufträge finden ----------
  A.route('/auftraege', async (_, q) => {
    const m = A.meta;
    const f = Object.fromEntries(q.entries());
    const form = el('form', { class: 'stack', 'aria-label': 'Filter' },
      A.field('Ort / Postleitzahl', A.input('plz', f.plz, { inputmode: 'numeric', maxlength: 5, placeholder: 'z. B. 61130' })),
      A.field('Umkreis', A.select('radius', { 10: '10 km', 25: '25 km', 50: '50 km', 100: '100 km' }, f.radius, { placeholder: 'Beliebig', disabled: !m.geoAvailable }), m.geoAvailable ? null : 'Erst verfügbar, wenn PLZ-Geodaten importiert sind.'),
      A.field('Ausführungsort', A.select('loc', { mobil: 'Mobile Aufträge', betrieb: 'Halle / Werkstatt' }, f.loc, { placeholder: 'Alle' })),
      A.checkbox('lack', 'Nur Lackschäden', f.lack === '1'),
      A.field('Leistungsart', A.select('service', m.services, f.service, { placeholder: 'Alle Leistungen' })),
      el('div', { class: 'form-grid' }, A.field('Budget ab €', A.input('budget_min', f.budget_min, { inputmode: 'decimal' })), A.field('bis €', A.input('budget_max', f.budget_max, { inputmode: 'decimal' }))),
      A.field('Kunde', A.select('customer_type', { privat: 'Privatkunde', flotte: 'Firmenflotte' }, f.customer_type, { placeholder: 'Alle' })),
      A.field('Rhythmus', A.select('recurrence', { einmalig: 'Einmalig', regelmaessig: 'Regelmäßig' }, f.recurrence, { placeholder: 'Alle' })),
      A.me && A.me.role === 'betrieb' ? A.checkbox('matching', 'Nur zu meinem Profil passende', f.matching === '1') : null,
      el('button', { class: 'btn primary', type: 'submit' }, 'Filtern'),
      el('a', { href: '#/auftraege', class: 'small' }, 'Filter zurücksetzen'));
    const sort = A.select('sort', { new: 'Neueste zuerst', distance: 'Entfernung', budget: 'Budget (höchstes zuerst)' }, f.sort || 'new', { placeholder: 'Sortierung', 'aria-label': 'Sortierung' });
    const toQuery = () => {
      const d = A.formData(form); d.sort = sort.value;
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(d)) { if (v === true) p.set(k, '1'); else if (v && v !== false) p.set(k, v); }
      return p.toString();
    };
    form.addEventListener('submit', (e) => { e.preventDefault(); A.go('#/auftraege?' + toQuery()); });
    sort.addEventListener('change', () => A.go('#/auftraege?' + toQuery()));

    const results = el('section', { class: 'main stack', 'aria-label': 'Ergebnisse', 'aria-live': 'polite' }, A.loading());
    const apiQ = new URLSearchParams(f); if (!apiQ.get('sort')) apiQ.set('sort', 'new');
    A.get('/api/jobs?' + apiQ.toString()).then((r) => {
      results.replaceChildren(
        el('p', { class: 'small muted' }, `${r.total} offene Anfrage${r.total === 1 ? '' : 'n'}${r.origin ? ` · Entfernung ab ${r.origin.plz || ''} ${r.origin.city || ''}` : ''}`),
        ...r.notices.map((n) => A.alert('info', n)),
        ...(r.jobs.length ? r.jobs.map((j) => jobCard(j, toggleBookmark))
          : [el('div', { class: 'card empty' }, el('h3', {}, 'Keine passenden Anfragen gefunden'), el('p', { class: 'muted' }, 'Ändere die Filter oder schau später noch einmal vorbei.'), el('a', { class: 'btn ghost', href: '#/auftraege' }, 'Alle Anfragen anzeigen'))]));
    }).catch((e) => results.replaceChildren(A.errorBox(e, () => A.render())));

    return A.page(el('div', { class: 'stack' },
      el('div', { class: 'row between' },
        el('div', {}, el('h1', {}, 'Aufträge finden'), el('p', { class: 'muted' }, 'Ansehen ist kostenlos. Kontaktdaten erhalten Betriebe erst nach einer verbindlichen Beauftragung.')),
        el('label', { class: 'f' }, 'Sortierung', sort)),
      !A.me ? A.alert('info', 'Details und Fotos sehen angemeldete Betriebe. ', el('a', { href: '#/registrieren?rolle=betrieb' }, 'Kostenlos als Betrieb registrieren')) : null,
      A.me && A.me.role === 'betrieb' && A.company && !A.company.complete ? A.alert('warn', 'Vervollständige dein ', el('a', { href: '#/profil' }, 'Unternehmensprofil'), ', um Angebote abgeben zu können.') : null,
      el('div', { class: 'layout' }, el('aside', { class: 'card' }, form), results)));
  });

  A.route('/gemerkt', async () => {
    const { jobs } = await A.get('/api/my/bookmarks');
    return A.page(el('div', { class: 'stack' }, el('h1', {}, 'Gemerkte Anfragen'),
      jobs.length ? jobs.map((j) => jobCard(j, toggleBookmark)) : el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'Du hast noch keine Anfragen gemerkt.'), el('a', { class: 'btn primary', href: '#/auftraege' }, 'Aufträge finden'))));
  });

  // ---------- Anfrage-Detail für Betriebe + Angebot ----------
  A.route('/job/:id', async ({ id }) => {
    if (!A.me) { const e = new Error('Bitte anmelden'); e.status = 401; throw e; }
    if (A.me.role === 'kunde') { A.go('#/anfrage/' + id); return el('div'); }
    const data = await A.get('/api/requests/' + encodeURIComponent(id));
    if (A.me.role === 'admin') return A.page(el('div', { class: 'stack' }, el('h1', {}, 'Anfrage #' + id), A.requestFacts(data.request), A.requestDetails(data.request)));
    const r = data.request;
    const openOffer = data.my_offers.find((o) => o.status === 'offen');
    const locOptions = r.location_pref === 'beides' ? { mobil: 'Mobil beim Kunden', betrieb: 'Beim Betrieb (Halle/Werkstatt)' } : { [r.location_pref]: r.location_pref === 'mobil' ? 'Mobil beim Kunden' : 'Beim Betrieb (Halle/Werkstatt)' };

    const preview = el('div', { class: 'calc', 'aria-live': 'polite' }, el('p', { class: 'small muted' }, 'Gib einen Endpreis ein, um die Provision zu sehen.'));
    const msg = el('div');
    const priceInput = A.input('price', '', { inputmode: 'decimal', placeholder: 'z. B. 119,00' });
    const feas = el('div', {}, A.checkbox('feasibility_confirmed', 'Ich habe die Angaben und Fotos geprüft und halte die Reparatur mobil für machbar. (Ohne diese Bestätigung bitte im Betrieb anbieten.)', false));
    const travel = el('div', { class: 'stack' }, A.checkbox('travel_included', 'Anfahrtskosten sind im Endpreis enthalten', true), A.field('Hinweis zur Anfahrt (falls nicht enthalten: Betrag nennen)', A.input('travel_note', '')));
    const form = el('form', { class: 'stack', novalidate: true },
      A.radios('location', locOptions, Object.keys(locOptions).length === 1 ? Object.keys(locOptions)[0] : '', 'Ausführungsort'),
      feas, travel,
      A.field('Leistungsumfang', el('textarea', { name: 'scope', maxlength: 3000 }), 'Was genau ist im Preis enthalten?'),
      el('div', { class: 'form-grid' },
        A.field('Termin oder Zeitfenster', A.input('appointment', '', { placeholder: 'z. B. KW 49, Di–Do vormittags' })),
        A.field('Geschätzte Dauer', A.input('duration', '', { placeholder: 'z. B. ca. 4 Stunden' }))),
      A.field('Endpreis für den Kunden in € (inkl. anfallender Steuern)', priceInput, A.company ? null : ''),
      A.field('Mögliche Zusatzleistungen (optional, ausdrücklich benennen)', el('textarea', { name: 'extras', maxlength: 1000 }), 'z. B. „Ozonbehandlung gegen Geruch: 40 € extra, nur nach Absprache“'),
      el('h3', {}, 'Deine Kosten bei Beauftragung'), preview, msg,
      el('button', { class: 'btn primary', type: 'submit' }, 'Angebot verbindlich senden'));
    const sync = () => {
      const f = A.formData(form);
      feas.hidden = !(r.service === 'lack' && f.location === 'mobil');
      travel.hidden = f.location !== 'mobil';
    };
    form.addEventListener('change', sync);
    let t;
    priceInput.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        if (!priceInput.value.trim()) return;
        try {
          const { calc: k, vat_mode } = await A.post('/api/offers/preview', { price: priceInput.value });
          preview.replaceChildren(
            el('div', {}, el('span', {}, 'Endpreis Kunde'), el('b', {}, A.eur(k.grossCents))),
            el('div', {}, el('span', {}, vat_mode === 'klein' ? 'Netto-Auftragswert (Kleinunternehmer: = Endpreis)' : `Netto-Auftragswert (ohne ${A.pct(k.providerVatBp)} USt.)`), el('b', {}, A.eur(k.netCents))),
            el('div', {}, el('span', {}, 'Provisionssatz'), el('b', {}, A.pct(k.commissionBp))),
            el('div', {}, el('span', {}, 'Provision der Agentur (netto)'), el('b', {}, A.eur(k.commissionCents))),
            el('div', {}, el('span', {}, k.agencyVatBp ? `zzgl. ${A.pct(k.agencyVatBp)} USt. auf die Provision` : 'USt. auf die Provision'), el('b', {}, A.eur(k.commissionVatCents))),
            el('div', { class: 'sum' }, el('span', {}, 'Dir verbleiben netto'), el('span', {}, A.eur(k.providerKeepsNetCents))),
            el('p', { class: 'small muted' }, 'Fällig nur, wenn der Auftrag über die Plattform vergeben, ausgeführt und bezahlt wird. Der Satz wird mit deinem Angebot gespeichert.'));
        } catch (e) { preview.replaceChildren(A.alert('err', e.message)); }
      }, 300);
    });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await A.post(`/api/requests/${r.id}/offers`, A.formData(form)); A.toast('Angebot gesendet'); A.render(); }
      catch (e) { msg.replaceChildren(A.alert('err', e.message)); }
    });
    sync();

    const offerBox = data.order_id ? A.alert('ok', 'Du wurdest beauftragt. ', el('a', { href: '#/auftrag/' + data.order_id }, 'Zum Auftrag'))
      : openOffer ? el('div', { class: 'stack' }, A.alert('ok', `Dein Angebot über ${A.eur(openOffer.gross_cents)} liegt dem Kunden vor.`), openOffer.request_changed_after ? A.alert('warn', 'Der Kunde hat die Anfrage nach deinem Angebot geändert. Prüfe, ob dein Angebot noch passt.') : null,
        el('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Angebot zurückziehen?')) { await A.post(`/api/offers/${openOffer.id}/withdraw`); A.render(); } } }, 'Angebot zurückziehen'))
        : r.status === 'offen' || r.status === 'angebote'
          ? (A.company && A.company.complete ? form : A.alert('warn', 'Bitte vervollständige zuerst dein ', el('a', { href: '#/profil' }, 'Unternehmensprofil'), '.'))
          : A.alert('info', 'Für diese Anfrage können keine Angebote mehr abgegeben werden.');

    return A.page(el('div', { class: 'stack' },
      el('a', { href: '#/auftraege', class: 'small' }, '← Zur Übersicht'),
      el('div', { class: 'chips' }, A.locChip(r.location_pref), A.statusChip(r.status)),
      el('h1', {}, A.label('services', r.service)),
      el('div', { class: 'layout' },
        el('div', { class: 'main stack' }, el('div', { class: 'card stack' }, A.requestFacts(r), A.requestDetails(r)),
          el('div', { class: 'row' }, el('button', { class: 'btn ghost sm', onclick: () => toggleBookmark({ id: r.id, bookmarked: data.bookmarked }) }, data.bookmarked ? 'Gemerkt ✓' : 'Merken'), el('button', { class: 'link small', onclick: () => A.reportDialog('request', r.id) }, 'Anfrage melden'))),
        el('aside', { class: 'card stack' }, el('h2', {}, 'Angebot abgeben'), offerBox))));
  });

  A.route('/meine-angebote', async () => {
    const { offers } = await A.get('/api/my/offers');
    const st = { offen: ['Liegt dem Kunden vor', 'blue'], angenommen: ['Angenommen', 'green'], abgelehnt: ['Nicht gewählt', ''], zurueckgezogen: ['Zurückgezogen', ''] };
    return A.page(el('div', { class: 'stack' }, el('h1', {}, 'Meine Angebote'),
      offers.length ? el('div', { class: 'tablebox' }, el('table', {}, el('thead', {}, el('tr', {}, ['Anfrage', 'Gebiet', 'Endpreis', 'Provision (netto)', 'Status', ''].map((x) => el('th', {}, x)))),
        el('tbody', {}, offers.map((o) => el('tr', {},
          el('td', {}, A.label('services', o.service), el('br'), el('span', { class: 'small muted' }, o.vehicle)),
          el('td', {}, `${o.area_approx} ${o.city}`), el('td', {}, A.eur(o.gross_cents)),
          el('td', {}, `${A.eur(o.commission_cents)} (${A.pct(o.commission_bp)})`),
          el('td', {}, el('span', { class: 'chip ' + st[o.status][1] }, st[o.status][0])),
          el('td', {}, o.order_id ? el('a', { href: '#/auftrag/' + o.order_id }, 'Auftrag') : el('a', { href: '#/job/' + o.request_id }, 'Anfrage')))))))
        : el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'Noch keine Angebote abgegeben.'), el('a', { class: 'btn primary', href: '#/auftraege' }, 'Aufträge finden'))));
  });

  // ---------- Unternehmensprofil ----------
  A.route('/profil', async () => {
    const { company: c, files, verifications, complete } = await A.get('/api/my/company');
    const m = A.meta;
    const msg = el('div');
    const radius = el('div', {}, A.field('Mobiles Einsatzgebiet: Umkreis in km', A.input('mobile_radius_km', c.mobile_radius_km ?? '', { type: 'number', min: 1, max: 300, inputmode: 'numeric' })));
    const wsBox = el('div', {}, A.field('Adresse der Halle/Werkstatt (falls abweichend)', A.input('workshop_address', c.workshop_address)));
    const form = el('form', { class: 'stack', novalidate: true },
      el('div', { class: 'form-grid' },
        A.field('Firmenname', A.input('name', c.name)), A.field('Ansprechpartner', A.input('contact_person', c.contact_person)),
        A.field('Straße und Hausnummer', A.input('street', c.street)), A.field('PLZ', A.input('plz', c.plz, { inputmode: 'numeric', maxlength: 5 })), A.field('Ort', A.input('city', c.city)),
        A.field('E-Mail für Aufträge', A.input('email', c.email, { type: 'email' })), A.field('Telefon', A.input('phone', c.phone, { type: 'tel' }))),
      el('p', { class: 'small muted' }, 'Anschrift, E-Mail und Telefon sind nicht öffentlich. Kunden sehen sie erst, wenn sie dich verbindlich beauftragen. Öffentlich sind Firmenname, Ort und PLZ-Bereich.'),
      el('fieldset', {}, el('legend', {}, 'Angebotene Leistungen'), el('div', { class: 'choices' }, Object.entries(m.services).map(([k, v]) => el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'services', value: k, 'data-multi': '1', checked: c.services.includes(k) }), el('span', {}, v))))),
      el('fieldset', {}, el('legend', {}, 'Wo arbeitest du?'), A.checkbox('mobile', 'Mobil beim Kunden', c.mobile), radius, A.checkbox('workshop', 'Halle / Werkstatt vorhanden', c.workshop), wsBox),
      A.radios('vat_mode', { regel: 'Umsatzsteuerpflichtig (19 %)', klein: 'Kleinunternehmer (§ 19 UStG)' }, c.vat_mode, 'Umsatzsteuer', { regel: 'Deine Endpreise enthalten 19 % USt.', klein: 'Keine USt. auf deinen Rechnungen; Netto = Endpreis' }),
      A.field('Beschreibung des Betriebs', el('textarea', { name: 'description', maxlength: 3000 }, c.description)),
      el('h3', {}, 'Selbstauskunft'),
      A.alert('info', 'Selbstauskünfte werden Kunden als „Selbstauskunft“ angezeigt. Ein Prüfvermerk erscheint erst, wenn die Agentur einen hochgeladenen Nachweis geprüft und dokumentiert hat.'),
      A.field('Angaben zur Versicherung', A.input('self_insurance', c.self_insurance, { placeholder: 'z. B. Betriebshaftpflicht bei …' })),
      A.field('Angaben zur gewerblichen Tätigkeit', A.input('self_trade', c.self_trade, { placeholder: 'z. B. Gewerbe angemeldet seit …' })),
      msg, el('button', { class: 'btn primary', type: 'submit' }, 'Profil speichern'));
    const sync = () => { const f = A.formData(form); radius.hidden = !f.mobile; wsBox.hidden = !f.workshop; };
    form.addEventListener('change', sync); sync();
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await A.api('PUT', '/api/my/company', A.formData(form)); await A.loadMe(); A.toast('Profil gespeichert'); A.render(); }
      catch (e) { msg.replaceChildren(A.alert('err', e.message)); }
    });

    const uploader = (purpose, title, accept, extra) => {
      const inp = el('input', { type: 'file', accept, multiple: true });
      const label = purpose === 'proof' ? A.input('proof_label', '', { placeholder: 'z. B. Gewerbeanmeldung, Versicherungsbestätigung 2026' }) : null;
      const um = el('div');
      return el('div', { class: 'card stack' }, el('h3', {}, title), extra, label ? A.field('Bezeichnung', label) : null, inp,
        el('button', { class: 'btn ghost sm', onclick: async () => {
          if (!inp.files.length) return;
          const fd = new FormData(); fd.append('purpose', purpose); if (label) fd.append('label', label.value);
          for (const f of inp.files) fd.append('files', f);
          try { await A.api('POST', '/api/my/company/files', fd, true); A.render(); } catch (e) { um.replaceChildren(A.alert('err', e.message)); }
        } }, 'Hochladen'), um,
        el('div', { class: 'photos' }, files.filter((f) => f.purpose === purpose).map((f) => el('figure', {},
          f.mime === 'application/pdf' ? el('a', { href: '/api/files/' + f.id }, 'PDF: ' + (f.label || 'Nachweis')) : el('img', { src: '/api/files/' + f.id, alt: f.label || 'Bild' }),
          el('figcaption', {}, f.label, ' ', el('button', { class: 'link small', onclick: async () => { if (confirm('Datei löschen?')) { try { await A.api('DELETE', '/api/files/' + f.id); A.render(); } catch (e) { A.toast(e.message); } } } }, 'löschen'))))));
    };

    return A.page(el('div', { class: 'stack' },
      el('div', { class: 'row between' }, el('h1', {}, 'Unternehmensprofil'), c.name ? el('a', { href: '#/firma/' + c.id }, 'Öffentliche Ansicht') : null),
      complete ? A.alert('ok', 'Dein Profil ist vollständig. Du kannst Angebote abgeben.') : A.alert('warn', 'Bitte fülle Firmendaten, Kontakt, Leistungen und Arbeitsort aus, um Angebote abgeben zu können.'),
      el('div', { class: 'layout' },
        el('div', { class: 'main card pad-lg' }, form),
        el('aside', { class: 'stack' },
          el('div', { class: 'card stack' }, el('h3', {}, 'Geprüfte Nachweise'),
            verifications.filter((v) => !v.revoked_at).length
              ? verifications.filter((v) => !v.revoked_at).map((v) => el('p', { class: 'small' }, `✓ ${{ gewerbe: 'Gewerbenachweis', versicherung: 'Versicherung', sonstiges: 'Nachweis' }[v.kind]} – geprüft am ${A.date(v.checked_at)}${v.valid_until ? ', gültig bis ' + A.date(v.valid_until) : ''}`))
              : el('p', { class: 'small muted' }, 'Noch keine Prüfung. Lade unten Nachweise hoch; die Agentur prüft sie manuell.')),
          uploader('proof', 'Nachweise (nur für die Agentur)', 'application/pdf,image/jpeg,image/png', el('p', { class: 'small muted' }, 'PDF, JPG oder PNG. Nicht öffentlich sichtbar.')),
          uploader('work_example', 'Arbeitsbeispiele (öffentlich)', 'image/jpeg,image/png', A.photoNotice())))));
  });
})();
