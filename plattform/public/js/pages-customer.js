'use strict';
(() => {
  const A = window.App, el = A.el;
  const DRAFT_KEY = 'mhl_anfrage_entwurf';
  const saveDraft = (d) => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* egal */ } };
  const loadDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch { return null; } };
  const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* egal */ } };

  // ---------- Anfrage-Assistent (neu & bearbeiten) ----------
  // Ablauf: 0 Anmelden → 1 Ort & Leistung → 2 Ausführungsort & Details → 3 Fahrzeug → 4 Beschreibung, Zeitraum, Budget, Fotos → 5 Verdeckte Angaben
  async function wizard(existing, q) {
    const m = A.meta;
    const areaFromQ = { mobil: 'mobil', halle: 'halle', lack: 'lack' }[q.get('bereich')] || '';
    // Schritt 0: Anmeldung zuerst
    if (!A.me) {
      if (areaFromQ) saveDraft({ area: areaFromQ });
      const next = encodeURIComponent('#/anfrage/neu' + (areaFromQ ? '?bereich=' + areaFromQ : ''));
      return A.page(el('div', { class: 'narrow stack' },
        el('p', { class: 'small muted' }, 'Schritt 1 von 6 · Anmelden'),
        el('h1', {}, 'Kostenlos Auftrag einstellen'),
        el('div', { class: 'card pad-lg stack' },
          el('h2', {}, 'Zuerst anmelden'),
          el('p', {}, 'Damit du deine Anfrage später verwalten, Angebote vergleichen und mit dem Betrieb schreiben kannst, brauchst du ein kostenloses Kundenkonto. In deinem Profil speicherst du auch deine Fahrzeuge und siehst, wann die letzte Reinigung war.'),
          el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '#/registrieren?next=' + next }, 'Kostenlos registrieren'), el('a', { class: 'btn ghost', href: '#/anmelden?next=' + next }, 'Ich habe schon ein Konto')),
          el('p', { class: 'small muted' }, 'Die Vermittlung ist für dich kostenlos.'))));
    }
    if (A.me.role !== 'kunde') return A.page(A.alert('warn', 'Anfragen können nur mit einem Kundenkonto eingestellt werden.'));

    const [{ profile, vehicles }] = await Promise.all([A.get('/api/my/profile')]);
    const d = existing || loadDraft() || {};
    if (!existing && areaFromQ) d.area = areaFromQ;
    const budgetEuro = d.budget_cents != null ? String(d.budget_cents / 100).replace('.', ',') : (d.budget || '');
    let step = 1;
    const STEPS = ['Anmelden', 'Ort & Leistung', 'Ausführung', 'Fahrzeug', 'Beschreibung & Fotos', 'Verdeckte Angaben'];

    const form = el('form', { class: 'stack', id: 'wizardForm', novalidate: true });
    const sec = (n, ...kids) => el('section', { class: 'card pad-lg stack', 'data-step': n }, ...kids);
    const services = (area) => (area === 'lack' ? { lack: m.services.lack } : Object.fromEntries(Object.entries(m.services).filter(([k]) => k !== 'lack')));
    const serviceBox = el('div');
    const renderServices = () => {
      const area = A.formData(form).area || d.area;
      if (!area) { serviceBox.replaceChildren(); return; }
      serviceBox.replaceChildren(A.radios('service', services(area), area === 'lack' ? 'lack' : (d.service !== 'lack' ? d.service : ''), 'Welche Leistung möchtest du?'));
    };
    const paintBox = el('div', { class: 'stack' },
      A.alert('warn', el('b', {}, 'Wichtig: '), 'Lackaufbereitung durch Polieren ist etwas anderes als eine Reparatur mit Lackierarbeiten. Ob eine Reparatur mobil möglich ist, bestätigt erst der Fachbetrieb in seinem Angebot. Anhand von Fotos gibt es keine automatische Reparatur- oder Preiszusage.'),
      el('div', { class: 'form-grid' },
        A.field('Betroffenes Bauteil', A.select('damage_part', m.parts, d.damage_part)),
        A.field('Schadensart', A.select('damage_type', m.damageTypes, d.damage_type)),
        A.field('Ungefähre Größe', A.select('damage_size', m.damageSizes, d.damage_size))));
    const mobileBox = el('div', { class: 'stack' }, el('h3', {}, 'Für den mobilen Einsatz'),
      A.radios('mobile_parking', m.tristate, d.mobile_parking, 'Geeigneter Stellplatz vorhanden?'),
      A.radios('mobile_power', m.tristate, d.mobile_power, 'Strom verfügbar?'),
      A.radios('mobile_water', m.tristate, d.mobile_water, 'Wasser verfügbar (falls benötigt)?'));
    const fleetBox = el('div', {}, A.field('Anzahl der Fahrzeuge', A.input('fleet_count', d.fleet_count || '', { type: 'number', min: 1, inputmode: 'numeric' })));
    const isPaint = (f) => f.service === 'lack';

    // Fahrzeug: gespeichertes wählen oder neu eingeben
    const vehOpts = Object.fromEntries(vehicles.map((v) => [String(v.id), `${v.nickname ? v.nickname + ': ' : ''}${v.make} ${v.model}`]));
    const vehHints = Object.fromEntries(vehicles.map((v) => [String(v.id), v.last_cleaning_on ? 'Letzte Reinigung: ' + A.date(v.last_cleaning_on) : 'Letzte Reinigung: unbekannt']));
    const newVeh = el('div', { class: 'stack' },
      el('div', { class: 'form-grid' },
        A.field('Marke', A.input('vehicle_make', d.vehicle_make, { placeholder: 'z. B. VW' })),
        A.field('Modell', A.input('vehicle_model', d.vehicle_model, { placeholder: 'z. B. Golf' })),
        A.field('Fahrzeuggröße / -typ', A.select('vehicle_type', m.vehicleTypes, d.vehicle_type))),
      existing ? null : A.checkbox('save_vehicle', 'Fahrzeug in meinem Profil speichern', true));
    const vehChoice = vehicles.length ? A.radios('vehicle_id', { ...vehOpts, '': 'Anderes Fahrzeug eingeben' }, d.vehicle_id ? String(d.vehicle_id) : String(vehicles[0].id), 'Welches Fahrzeug?', { ...vehHints, '': 'Marke, Modell und Typ angeben' }) : null;

    const photosBox = el('div', { class: 'stack' });
    const renderPhotos = () => {
      const f = A.formData(form);
      photosBox.replaceChildren(el('h3', {}, 'Fotos (optional)'), A.photoNotice(),
        isPaint(f)
          ? el('div', { class: 'form-grid' },
            A.field('Detailfoto des Schadens', el('input', { type: 'file', name: 'photo_detail', accept: 'image/jpeg,image/png', multiple: true })),
            A.field('Übersichtsbild (ganzes Bauteil/Fahrzeugseite)', el('input', { type: 'file', name: 'photo_uebersicht', accept: 'image/jpeg,image/png', multiple: true })))
          : A.field('Fotos auswählen', el('input', { type: 'file', name: 'photo_allgemein', accept: 'image/jpeg,image/png', multiple: true })),
        ...(existing ? [el('p', { class: 'small muted' }, 'Bereits hochgeladene Fotos verwaltest du in der Anfrage-Ansicht.')] : []));
    };

    form.append(
      sec(1, el('h2', {}, 'Wo wohnst du und was brauchst du?'),
        el('div', { class: 'form-grid' },
          A.field('Postleitzahl', A.input('plz', d.plz, { inputmode: 'numeric', maxlength: 5, autocomplete: 'postal-code' })),
          A.field('Ort', A.input('city', d.city, { autocomplete: 'address-level2' }))),
        el('p', { class: 'small muted' }, 'Betriebe sehen nur den ungefähren Standort (PLZ-Bereich und Ort).'),
        A.radios('area', m.areas, d.area, 'Bereich', { mobil: 'Der Dienstleister kommt zu dir', halle: 'Du bringst dein Fahrzeug zum Betrieb', lack: 'Kratzer, Abplatzer, Parkschaden …' }),
        serviceBox),
      sec(2, el('h2', {}, 'Wo soll gearbeitet werden?'),
        A.radios('location_pref', m.locations, d.location_pref, 'Ausführungsort', { mobil: 'Bei mir oder an einem vereinbarten Ort', betrieb: 'Ich bringe das Fahrzeug hin', beides: 'Betriebe dürfen vorschlagen' }),
        paintBox, mobileBox),
      sec(3, el('h2', {}, 'Dein Fahrzeug'), vehChoice, newVeh,
        A.radios('customer_type', { privat: 'Privatfahrzeug', flotte: 'Firmenflotte' }, d.customer_type || 'privat', 'Privat oder Firma?'),
        fleetBox),
      sec(4, el('h2', {}, 'Beschreibung, Zeitraum und Budget'),
        A.field('Was soll gemacht werden?', el('textarea', { name: 'description', id: 'f_description', maxlength: 3000 }, d.description || ''), 'Bitte keine Namen, Telefonnummern oder Adressen – die Beschreibung sehen Betriebe.'),
        A.field('Gewünschter Zeitraum', A.select('timeframe', m.timeframes, d.timeframe)),
        A.radios('recurrence', { einmalig: 'Einmaliger Auftrag', regelmaessig: 'Regelmäßiger Auftrag' }, d.recurrence || 'einmalig', 'Einmalig oder regelmäßig?'),
        el('div', { class: 'form-grid' }, A.field('Budget (optional, in €)', A.input('budget', budgetEuro, { inputmode: 'decimal', placeholder: 'z. B. 150' }), 'Betriebe sehen dein Budget.')),
        A.checkbox('budget_none', 'Noch keine Preisvorstellung', existing ? existing.budget_cents == null : d.budget_none !== false && !budgetEuro),
        photosBox),
      sec(5, el('h2', {}, 'Verdeckte Angaben'),
        A.alert('info', el('b', {}, 'Nicht öffentlich. '), 'Diese Angaben sieht nur der Betrieb, den du verbindlich beauftragst – und erst nach der Beauftragung. Alle anderen sehen nur PLZ-Bereich, Ort, Leistung, Fahrzeug und Budget.'),
        A.field('Straße und Hausnummer', A.input('address_private', d.address_private, { autocomplete: 'street-address' }), 'Bei Arbeiten im Betrieb deine Rechnungs- bzw. Kontaktanschrift.'),
        el('div', { class: 'form-grid' },
          A.field('Name', A.input('profile_name', profile.name, { autocomplete: 'name' })),
          A.field('Telefon', A.input('profile_phone', profile.phone, { type: 'tel', autocomplete: 'tel' }), 'Empfohlen, damit der Betrieb Termine abstimmen kann.')),
        el('p', { class: 'small muted' }, `E-Mail: ${profile.email} (aus deinem Konto)`)),
    );

    const msg = el('div');
    const progress = el('div', { class: 'progress six', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': 6 });
    const stepLabel = el('p', { class: 'small muted' });
    const back = el('button', { type: 'button', class: 'btn ghost' }, 'Zurück');
    const next = el('button', { type: 'button', class: 'btn primary' }, 'Weiter');
    const submit = el('button', { type: 'submit', form: 'wizardForm', class: 'btn primary' }, existing ? 'Änderungen speichern' : 'Anfrage kostenlos einstellen');

    const sync = () => {
      const f = A.formData(form);
      paintBox.hidden = !isPaint(f);
      mobileBox.hidden = f.location_pref === 'betrieb' || !f.location_pref;
      fleetBox.hidden = f.customer_type !== 'flotte';
      newVeh.hidden = vehicles.length > 0 && f.vehicle_id !== '';
      for (const s of form.querySelectorAll('[data-step]')) s.hidden = Number(s.dataset.step) !== step;
      progress.replaceChildren(...STEPS.map((_, i) => el('span', { class: i <= step ? 'on' : '' })));
      progress.setAttribute('aria-valuenow', step + 1);
      stepLabel.textContent = `Schritt ${step + 1} von 6 · ${STEPS[step]}`;
      back.hidden = step === 1; next.hidden = step === 5; submit.hidden = step !== 5;
      if (!existing) { const x = { ...f }; delete x.address_private; delete x.profile_name; delete x.profile_phone; saveDraft(x); }
    };
    const checkStep = () => {
      const f = A.formData(form);
      const need = {
        1: [['plz', 'Bitte die Postleitzahl angeben'], ['city', 'Bitte den Ort angeben'], ['area', 'Bitte einen Bereich wählen'], ['service', 'Bitte eine Leistung wählen']],
        2: [['location_pref', 'Bitte den Ausführungsort wählen']],
        3: (vehicles.length && f.vehicle_id) ? [] : [['vehicle_make', 'Bitte die Marke angeben'], ['vehicle_model', 'Bitte das Modell angeben'], ['vehicle_type', 'Bitte den Fahrzeugtyp wählen']],
        4: [['description', 'Bitte kurz beschreiben, was gemacht werden soll'], ['timeframe', 'Bitte einen Zeitraum wählen']],
      }[step] || [];
      if (step === 1 && f.plz && !/^\d{5}$/.test(f.plz)) return 'Postleitzahl: bitte 5 Ziffern';
      if (step === 2 && isPaint(f)) need.push(['damage_part', 'Bitte das Bauteil wählen (oder „Ich bin mir nicht sicher“)'], ['damage_type', 'Bitte die Schadensart wählen'], ['damage_size', 'Bitte die ungefähre Größe wählen']);
      if (step === 2 && f.location_pref && f.location_pref !== 'betrieb') need.push(['mobile_parking', 'Bitte Stellplatz beantworten'], ['mobile_power', 'Bitte Strom beantworten'], ['mobile_water', 'Bitte Wasser beantworten']);
      if (step === 3 && f.customer_type === 'flotte') need.push(['fleet_count', 'Bitte die Anzahl der Fahrzeuge angeben']);
      if (step === 4 && (f.description || '').trim().length < 10) return 'Beschreibung: bitte mindestens 10 Zeichen';
      const miss = need.find(([k]) => !f[k]);
      return miss ? miss[1] : null;
    };
    form.addEventListener('change', (e) => {
      if (e.target.name === 'area') {
        renderServices();
        const lp = { mobil: 'mobil', halle: 'betrieb', lack: 'beides' }[e.target.value];
        const r = form.querySelector(`input[name=location_pref][value=${lp}]`); if (r) r.checked = true;
      }
      if (e.target.name === 'service') renderPhotos();
      sync();
    });
    form.addEventListener('input', (e) => { if (e.target.name === 'budget' && e.target.value) form.querySelector('[name=budget_none]').checked = false; });
    next.addEventListener('click', () => { const err = checkStep(); if (err) { msg.replaceChildren(A.alert('err', err)); return; } msg.replaceChildren(); step++; sync(); window.scrollTo(0, 0); });
    back.addEventListener('click', () => { msg.replaceChildren(); step--; sync(); });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = A.formData(form);
      if (!f.address_private || f.address_private.trim().length < 4) { msg.replaceChildren(A.alert('err', 'Bitte Straße und Hausnummer angeben. Sie bleiben verdeckt.')); return; }
      submit.disabled = true; msg.replaceChildren(A.loading());
      try {
        if (f.profile_name !== profile.name || f.profile_phone !== profile.phone) await A.api('PUT', '/api/my/profile', { name: f.profile_name, phone: f.profile_phone });
        let id;
        if (existing) { await A.api('PUT', '/api/requests/' + existing.id, f); id = existing.id; }
        else id = (await A.post('/api/requests', f)).id;
        const problems = [];
        for (const label of ['allgemein', 'detail', 'uebersicht']) {
          const inp = form.querySelector(`input[name=photo_${label}]`);
          if (!inp || !inp.files.length) continue;
          const fd = new FormData(); fd.append('label', label);
          for (const file of inp.files) fd.append('photos', file);
          try { await A.api('POST', `/api/requests/${id}/photos`, fd, true); } catch (e) { problems.push(e.message); }
        }
        clearDraft(); await A.loadMe();
        A.go('#/anfrage/' + id + (problems.length ? '?fotofehler=' + encodeURIComponent(problems.join(' · ')) : ''));
        A.toast(existing ? 'Anfrage gespeichert' : 'Deine Anfrage ist online');
      } catch (e) { msg.replaceChildren(A.alert('err', e.message)); submit.disabled = false; }
    });

    renderServices(); renderPhotos(); sync();
    return A.page(el('div', { class: 'narrow stack' }, el('h1', {}, existing ? 'Anfrage bearbeiten' : 'Kostenlos Auftrag einstellen'), stepLabel, progress, form,
      msg, el('div', { class: 'row between' }, back, next, submit)));
  }

  A.route('/anfrage/neu', (_, q) => wizard(null, q));
  A.route('/anfrage/:id/bearbeiten', async ({ id }, q) => {
    const r = await A.get('/api/requests/' + encodeURIComponent(id));
    if (!r.editable) return A.page(A.alert('warn', 'Diese Anfrage kann nicht mehr bearbeitet werden, weil der Auftrag bereits vergeben oder die Anfrage geschlossen ist.'));
    const x = r.request;
    return wizard({ ...x, id: x.id, plz: x.plz, address_private: x.address_private, vehicle_id: x.vehicle_id }, q);
  });

  // ---------- Meine Anfragen ----------
  A.route('/meine-anfragen', async () => {
    if (!A.me) { const e = new Error('Bitte anmelden'); e.status = 401; throw e; }
    const { requests } = await A.get('/api/my/requests');
    return A.page(el('div', { class: 'stack' },
      el('div', { class: 'row between' }, el('h1', {}, 'Meine Anfragen'), el('a', { class: 'btn primary', href: '#/anfrage/neu' }, 'Neue Anfrage')),
      requests.length ? requests.map((r) => el('article', { class: 'card stack' },
        el('div', { class: 'chips' }, A.statusChip(r.status), A.locChip(r.location_pref), r.offers ? el('span', { class: 'chip blue' }, `${r.offers} Angebot${r.offers === 1 ? '' : 'e'}`) : null),
        el('h3', {}, A.label('services', r.service), ' · ', r.vehicle),
        el('p', { class: 'muted small' }, `Erstellt am ${A.date(r.created_at)} · ${r.city}`),
        el('div', { class: 'row' }, el('a', { class: 'btn primary sm', href: '#/anfrage/' + r.id }, r.offers ? 'Angebote vergleichen' : 'Anfrage ansehen'),
          r.order_id ? el('a', { class: 'btn ghost sm', href: '#/auftrag/' + r.order_id }, 'Zum Auftrag') : null)))
        : el('div', { class: 'card empty' }, el('h3', {}, 'Noch keine Anfragen'), el('p', { class: 'muted' }, 'Stelle jetzt kostenlos deine erste Anfrage ein.'), el('a', { class: 'btn primary', href: '#/anfrage/neu' }, 'Anfrage einstellen'))));
  });

  A.requestFacts = (r) => el('div', { class: 'facts' },
    el('span', {}, el('b', {}, 'Fahrzeug: '), r.vehicle, ' · ', A.label('vehicleTypes', r.vehicle_type)),
    el('span', {}, el('b', {}, 'Gebiet: '), `PLZ ${r.area_approx} ${r.city}`),
    el('span', {}, el('b', {}, 'Zeitraum: '), A.label('timeframes', r.timeframe)),
    el('span', {}, el('b', {}, 'Budget: '), r.budget_cents != null ? A.eur(r.budget_cents) : 'Noch keine Preisvorstellung'),
    el('span', {}, el('b', {}, 'Kunde: '), r.customer_type === 'flotte' ? `Firmenflotte (${r.fleet_count} Fahrzeuge)` : 'Privat'),
    el('span', {}, el('b', {}, 'Rhythmus: '), r.recurrence === 'regelmaessig' ? 'Regelmäßig' : 'Einmalig'),
    r.distance_km != null ? el('span', {}, el('b', {}, 'Entfernung: '), `ca. ${r.distance_km.toLocaleString('de-DE')} km (Luftlinie zwischen PLZ-Mittelpunkten)`) : null);
  A.requestDetails = (r) => el('div', { class: 'stack' },
    el('p', {}, r.description),
    r.damage_part ? el('div', { class: 'facts' }, el('span', {}, el('b', {}, 'Bauteil: '), A.label('parts', r.damage_part)), el('span', {}, el('b', {}, 'Schaden: '), A.label('damageTypes', r.damage_type)), el('span', {}, el('b', {}, 'Größe: '), A.label('damageSizes', r.damage_size))) : null,
    r.mobile_parking ? el('div', { class: 'facts' }, el('span', {}, el('b', {}, 'Stellplatz: '), A.label('tristate', r.mobile_parking)), el('span', {}, el('b', {}, 'Strom: '), A.label('tristate', r.mobile_power)), el('span', {}, el('b', {}, 'Wasser: '), A.label('tristate', r.mobile_water))) : null,
    r.photos && r.photos.length ? el('div', { class: 'photos' }, r.photos.map((p) => el('figure', {}, el('a', { href: '/api/files/' + p.id, target: '_blank', rel: 'noopener' }, el('img', { src: '/api/files/' + p.id, alt: 'Foto zur Anfrage', loading: 'lazy' })), el('figcaption', {}, { detail: 'Detailfoto', uebersicht: 'Übersicht', allgemein: 'Foto' }[p.label])))) : null);

  // ---------- Anfrage-Ansicht für Kunden: Angebote vergleichen ----------
  A.route('/anfrage/:id', async ({ id }, q) => {
    const data = await A.get('/api/requests/' + encodeURIComponent(id));
    if (A.me.role === 'betrieb') { A.go('#/job/' + id); return el('div'); }
    const r = data.request;
    const open = data.offers.filter((o) => o.status === 'offen');
    const photoMsg = el('div');
    const photoInput = el('input', { type: 'file', accept: 'image/jpeg,image/png', multiple: true });
    const upload = async () => {
      if (!photoInput.files.length) return;
      const fd = new FormData(); fd.append('label', 'allgemein'); for (const f of photoInput.files) fd.append('photos', f);
      try { await A.api('POST', `/api/requests/${r.id}/photos`, fd, true); A.render(); } catch (e) { photoMsg.replaceChildren(A.alert('err', e.message)); }
    };
    const withdraw = async () => {
      if (!confirm('Anfrage wirklich zurückziehen? Betriebe können dann keine Angebote mehr abgeben.')) return;
      try { await A.post(`/api/requests/${r.id}/withdraw`); A.toast('Anfrage zurückgezogen'); A.render(); } catch (e) { A.toast(e.message); }
    };
    const offerCard = (o) => el('article', { class: 'card stack' },
      el('div', { class: 'row between' }, el('h3', {}, el('a', { href: '#/firma/' + o.company.id }, o.company.name)), el('strong', { class: 'eyebrow' }, A.eur(o.gross_cents), ' Endpreis')),
      el('div', { class: 'chips' }, A.locChip(o.location), o.status !== 'offen' ? el('span', { class: 'chip' }, { angenommen: 'Angenommen', abgelehnt: 'Nicht gewählt', zurueckgezogen: 'Zurückgezogen' }[o.status]) : null,
        o.request_changed_after ? el('span', { class: 'chip warn' }, 'Anfrage wurde nach diesem Angebot geändert') : null),
      A.companyBadges(o.company),
      el('div', { class: 'facts' },
        el('span', {}, el('b', {}, 'Termin: '), o.appointment), el('span', {}, el('b', {}, 'Dauer: '), o.duration),
        el('span', {}, el('b', {}, 'Anfahrt: '), o.location === 'mobil' ? (o.travel_included ? 'im Endpreis enthalten' : o.travel_note) : 'entfällt (beim Betrieb)'),
        el('span', {}, el('b', {}, 'Preis: '), o.provider_vat_bp ? `inkl. ${A.pct(o.provider_vat_bp)} USt.` : 'Kleinunternehmer, keine USt. ausgewiesen')),
      el('div', {}, el('b', {}, 'Leistungsumfang'), el('p', {}, o.scope)),
      o.extras ? el('div', {}, el('b', {}, 'Mögliche Zusatzleistungen (nur nach ausdrücklicher Vereinbarung)'), el('p', {}, o.extras)) : null,
      o.status === 'offen' && data.editable ? el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => acceptDialog(o) }, 'Dieses Angebot verbindlich beauftragen'), el('button', { class: 'link small', onclick: () => A.reportDialog('offer', o.id) }, 'Angebot melden')) : null);

    const acceptDialog = (o) => {
      const msg = el('div');
      const c1 = el('input', { type: 'checkbox' }), c2 = el('input', { type: 'checkbox' });
      const d = A.dialog('Verbindlich beauftragen', [
        el('div', { class: 'calc' },
          el('div', {}, el('span', {}, 'Ausführender Betrieb'), el('b', {}, o.company.name)),
          el('div', {}, el('span', {}, 'Ausführungsort'), el('b', {}, o.location === 'mobil' ? 'Mobil bei dir' : 'Beim Betrieb')),
          el('div', {}, el('span', {}, 'Termin / Zeitfenster'), el('b', {}, o.appointment)),
          el('div', { class: 'sum' }, el('span', {}, 'Vollständiger Preis'), el('span', {}, A.eur(o.gross_cents)))),
        el('p', {}, el('b', {}, 'Leistungsumfang: '), o.scope),
        el('label', { class: 'check' }, c1, el('span', {}, `Mir ist bewusst: Mit der Beauftragung schließe ich einen Vertrag direkt mit ${o.company.name}. Die MHL Agentur vermittelt nur und wird nicht Vertragspartner.`)),
        el('label', { class: 'check' }, c2, el('span', {}, 'Ich habe Preis, Leistungsumfang und Termin geprüft. Ich bezahle direkt beim Betrieb. Für mich fällt keine Vermittlungsgebühr an. Meine Kontaktdaten werden dafür an diesen Betrieb weitergegeben. ', el('a', { href: '#/rechtliches/verbraucherinformationen', target: '_blank' }, 'Verbraucherinformationen'))),
        msg,
        el('div', { class: 'row' },
          el('button', { class: 'btn primary', onclick: async () => { try { const res = await A.post(`/api/offers/${o.id}/accept`, { acknowledge_intermediary: c1.checked, accept_terms: c2.checked }); d.close(); A.go('#/auftrag/' + res.order_id); } catch (e) { msg.replaceChildren(A.alert('err', e.message)); } } }, 'Jetzt verbindlich beauftragen'),
          el('button', { class: 'btn ghost', onclick: () => d.close() }, 'Abbrechen'))]);
    };

    return A.page(el('div', { class: 'stack' },
      q.get('fotofehler') ? A.alert('warn', 'Die Anfrage wurde gespeichert, aber nicht alle Fotos konnten hochgeladen werden: ' + q.get('fotofehler')) : null,
      el('div', { class: 'chips' }, A.statusChip(r.status), A.locChip(r.location_pref)),
      el('h1', {}, A.label('services', r.service), ' · ', r.vehicle),
      el('div', { class: 'layout' },
        el('div', { class: 'main stack' },
          el('h2', {}, data.offers.length ? `Angebote (${open.length} offen)` : 'Angebote'),
          data.order_id ? A.alert('ok', 'Du hast einen Betrieb beauftragt. ', el('a', { href: '#/auftrag/' + data.order_id }, 'Zum Auftrag')) : null,
          open.length > 1 ? A.alert('info', 'Sortiert nach Endpreis. Vergleiche auch Leistungsumfang, Termin und Betrieb – der günstigste Preis ist nicht immer das passende Angebot.') : null,
          data.offers.length ? data.offers.map(offerCard) : el('div', { class: 'card empty' }, el('h3', {}, 'Noch keine Angebote'), el('p', { class: 'muted' }, 'Passende Betriebe sehen deine Anfrage jetzt in der Auftragsübersicht. Neue Angebote erscheinen hier. (Eine Benachrichtigung per E-Mail ist noch nicht aktiv – bitte schau gelegentlich vorbei.)'))),
        el('aside', { class: 'card stack' },
          el('h3', {}, 'Deine Anfrage'), A.requestFacts(r), A.requestDetails(r),
          r.address_private ? el('p', { class: 'small muted' }, 'Genaue Anschrift (nur für den beauftragten Betrieb): ', r.address_private) : null,
          data.editable ? el('div', { class: 'stack' },
            el('h3', {}, 'Fotos ergänzen'), A.photoNotice(), photoInput, el('button', { class: 'btn ghost sm', onclick: upload }, 'Hochladen'), photoMsg,
            r.photos.length ? el('div', { class: 'stack' }, r.photos.map((p) => el('button', { class: 'link small', onclick: async () => { if (confirm('Foto löschen?')) { await A.api('DELETE', '/api/files/' + p.id); A.render(); } } }, 'Foto löschen (' + ({ detail: 'Detail', uebersicht: 'Übersicht', allgemein: 'allgemein' }[p.label]) + ')'))) : null,
            el('div', { class: 'row' }, el('a', { class: 'btn ghost sm', href: `#/anfrage/${r.id}/bearbeiten` }, 'Bearbeiten'), el('button', { class: 'btn danger sm', onclick: withdraw }, 'Zurückziehen'))) : null))));
  });
})();
