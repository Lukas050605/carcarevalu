'use strict';
(() => {
  const A = window.App, el = A.el;
  const fmtDT = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}, ${s.slice(11, 16)} Uhr` : '–');
  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // ---------- Termin + Nachrichten im Auftrag ----------
  A.orderExtras = (d) => {
    const o = d.order;
    const box = el('div', { class: 'stack' });
    // Termin
    const termin = el('div', { class: 'card stack' }, el('h2', {}, 'Termin'),
      el('p', {}, o.scheduled_start ? el('b', {}, fmtDT(o.scheduled_start), ' bis ', o.scheduled_end.slice(11, 16), ' Uhr') : el('span', { class: 'muted' }, `Noch kein fester Termin. Vereinbart im Angebot: ${d.offer.appointment}`)));
    if (d.role === 'betrieb' && ['vergeben', 'in_bearbeitung'].includes(o.status)) {
      const day = A.input('day', o.scheduled_start ? o.scheduled_start.slice(0, 10) : '', { type: 'date' });
      const from = A.input('from', o.scheduled_start ? o.scheduled_start.slice(11, 16) : '09:00', { type: 'time' });
      const to = A.input('to', o.scheduled_end ? o.scheduled_end.slice(11, 16) : '12:00', { type: 'time' });
      const m = el('div');
      termin.append(el('div', { class: 'form-grid' }, A.field('Datum', day), A.field('Von', from), A.field('Bis', to)), m,
        el('div', {}, el('button', { class: 'btn ghost sm', onclick: async () => {
          try { await A.api('PUT', `/api/orders/${o.id}/schedule`, { start: `${day.value}T${from.value}`, end: `${day.value}T${to.value}` }); A.toast('Termin gespeichert – der Kunde sieht ihn im Auftrag'); A.render(); }
          catch (e) { m.replaceChildren(A.alert('err', e.message)); }
        } }, o.scheduled_start ? 'Termin ändern' : 'Termin in Kalender eintragen')));
    }
    // Nachrichten
    const list = el('div', { class: 'stack msgs', 'aria-live': 'polite' }, A.loading());
    const ta = el('textarea', { name: 'body', maxlength: 2000, placeholder: 'Nachricht schreiben …' });
    const m2 = el('div');
    const load = () => A.get(`/api/orders/${o.id}/messages`).then(({ messages }) => {
      list.replaceChildren(...(messages.length ? messages.map((x) => el('div', { class: 'msg' + (x.system ? ' sys' : x.mine ? ' mine' : '') },
        el('div', { class: 'small muted' }, x.system ? 'Hinweis' : x.mine ? 'Du' : (x.sender_name || 'Agentur'), ' · ', A.date(x.created_at), ' ', x.created_at.slice(11, 16)),
        el('div', {}, x.body))) : [el('p', { class: 'muted small' }, 'Noch keine Nachrichten.')]));
    }).catch((e) => list.replaceChildren(A.alert('err', e.message)));
    const chat = el('div', { class: 'card stack' }, el('h2', {}, 'Nachrichten'),
      el('p', { class: 'small muted' }, 'Stimmt euch hier über Termin, Anfahrt und Details ab. Nur Kunde und beauftragter Betrieb sehen diese Nachrichten (im Streitfall auch die Agentur).'),
      list);
    if (d.role !== 'admin' && o.status !== 'storniert') {
      chat.append(A.field('Neue Nachricht', ta), m2, el('div', {}, el('button', { class: 'btn primary sm', onclick: async () => {
        if (!ta.value.trim()) return;
        try { await A.post(`/api/orders/${o.id}/messages`, { body: ta.value }); ta.value = ''; m2.replaceChildren(); load(); }
        catch (e) { m2.replaceChildren(A.alert('err', e.message)); }
      } }, 'Senden')));
    }
    load();
    box.append(termin, chat);
    return box;
  };

  // ---------- Kundenprofil mit Fahrzeugen ----------
  A.route('/mein-profil', async () => {
    if (!A.me) { const e = new Error('Bitte anmelden'); e.status = 401; throw e; }
    const { profile, vehicles } = await A.get('/api/my/profile');
    const m = el('div');
    const pform = el('form', { class: 'card pad-lg stack', novalidate: true }, el('h2', {}, 'Persönliche Daten'),
      el('div', { class: 'form-grid' }, A.field('Name', A.input('name', profile.name)), A.field('Telefon', A.input('phone', profile.phone, { type: 'tel' }))),
      el('p', { class: 'small muted' }, `E-Mail: ${profile.email}. Diese Daten sind nicht öffentlich und gehen nur an Betriebe, die du beauftragst.`), m,
      el('div', {}, el('button', { class: 'btn primary sm', type: 'submit' }, 'Speichern')));
    pform.addEventListener('submit', async (ev) => { ev.preventDefault(); try { await A.api('PUT', '/api/my/profile', A.formData(pform)); await A.loadMe(); A.toast('Gespeichert'); } catch (e) { m.replaceChildren(A.alert('err', e.message)); } });
    if (A.me.role !== 'kunde') return A.page(el('div', { class: 'narrow stack' }, el('h1', {}, 'Mein Profil'), pform));

    const vehForm = (v) => {
      const f = el('form', { class: 'stack', novalidate: true },
        el('div', { class: 'form-grid' },
          A.field('Bezeichnung (optional)', A.input('nickname', v?.nickname, { placeholder: 'z. B. Familienauto' })),
          A.field('Marke', A.input('make', v?.make)), A.field('Modell', A.input('model', v?.model)),
          A.field('Typ', A.select('vehicle_type', A.meta.vehicleTypes, v?.vehicle_type)),
          A.field('Letzte Reinigung', A.input('last_cleaning_on', v?.last_cleaning_on || '', { type: 'date', max: isoDay(new Date()) }), 'Wird nach einem über die Plattform bestätigten Auftrag automatisch aktualisiert.')));
      const fm = el('div');
      f.append(fm, el('div', { class: 'row' }, el('button', { class: 'btn primary sm', type: 'submit' }, v ? 'Speichern' : 'Fahrzeug hinzufügen')));
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try { if (v) await A.api('PUT', '/api/my/vehicles/' + v.id, A.formData(f)); else await A.post('/api/my/vehicles', A.formData(f)); A.toast('Fahrzeug gespeichert'); A.render(); }
        catch (e) { fm.replaceChildren(A.alert('err', e.message)); }
      });
      return f;
    };
    const daysSince = (s) => Math.floor((Date.now() - new Date(s + 'T12:00:00').getTime()) / 86400000);
    return A.page(el('div', { class: 'stack' },
      el('h1', {}, 'Mein Profil'),
      el('div', { class: 'layout' },
        el('div', { class: 'main stack' },
          el('h2', {}, 'Meine Fahrzeuge'),
          vehicles.length ? vehicles.map((v) => {
            const edit = el('details', {}, el('summary', { class: 'small' }, 'Bearbeiten'), vehForm(v));
            return el('article', { class: 'card stack' },
              el('div', { class: 'row between' }, el('h3', {}, v.nickname ? v.nickname + ' · ' : '', `${v.make} ${v.model}`), el('span', { class: 'chip' }, A.label('vehicleTypes', v.vehicle_type))),
              el('p', {}, el('b', {}, 'Letzte Reinigung: '), v.last_cleaning_on ? `${A.date(v.last_cleaning_on)} (vor ${daysSince(v.last_cleaning_on)} Tagen, ${v.last_cleaning_source === 'plattform' ? 'über die Plattform bestätigt' : 'selbst eingetragen'})` : 'noch nicht eingetragen'),
              el('p', { class: 'small muted' }, `${v.jobs_done} abgeschlossene Aufträge über die Plattform`),
              el('div', { class: 'row' }, el('a', { class: 'btn primary sm', href: '#/anfrage/neu' }, 'Neue Anfrage für dieses Fahrzeug'),
                el('button', { class: 'btn danger sm', onclick: async () => { if (confirm('Fahrzeug aus dem Profil löschen?')) { await A.api('DELETE', '/api/my/vehicles/' + v.id); A.render(); } } }, 'Löschen')),
              edit);
          }) : el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'Noch kein Fahrzeug gespeichert.')),
          el('div', { class: 'card stack' }, el('h3', {}, 'Fahrzeug hinzufügen'), vehForm(null))),
        el('aside', {}, pform))));
  });

  // ---------- Dashboard / Kalender für Betriebe ----------
  A.route('/kalender', async (_, q) => {
    if (!A.me || A.me.role !== 'betrieb') return A.page(A.alert('err', 'Der Kalender ist für Betriebe.'));
    const now = new Date();
    const ym = /^\d{4}-\d{2}$/.test(q.get('monat') || '') ? q.get('monat') : `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    const [y, mo] = ym.split('-').map(Number);
    const first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0);
    const [{ orders, entries, unscheduled }, myOrders] = await Promise.all([
      A.get(`/api/my/calendar?from=${isoDay(first)}&to=${isoDay(last)}`), A.get('/api/my/orders')]);
    const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
    const byDay = {};
    for (const o of orders) (byDay[o.scheduled_start.slice(0, 10)] ||= []).push({ kind: 'order', start: o.scheduled_start, end: o.scheduled_end, title: `${A.label('services', o.service)} · ${o.vehicle_make} ${o.vehicle_model}`, sub: `${o.location === 'mobil' ? 'Mobil' : 'Im Betrieb'} · ${o.city} · ${A.label('requestStatus', o.status)}`, href: '#/auftrag/' + o.id });
    for (const e of entries) (byDay[e.starts_at.slice(0, 10)] ||= []).push({ kind: 'entry', start: e.starts_at, end: e.ends_at, title: e.title, sub: e.note, id: e.id });

    // Monatsraster (Mo–So)
    const cells = [];
    const lead = (first.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cells.push(el('div', { class: 'cal-cell empty-cell', 'aria-hidden': 'true' }));
    const today = isoDay(now);
    for (let day = 1; day <= last.getDate(); day++) {
      const key = `${ym}-${pad(day)}`;
      const items = (byDay[key] || []).sort((a, b) => a.start.localeCompare(b.start));
      cells.push(el('div', { class: 'cal-cell' + (key === today ? ' today' : '') },
        el('div', { class: 'cal-day' }, day),
        items.map((it) => it.href ? el('a', { class: 'cal-item order', href: it.href }, it.start.slice(11, 16), ' ', it.title) : el('span', { class: 'cal-item entry' }, it.start.slice(11, 16), ' ', it.title))));
    }
    // Liste (gut lesbar am Handy)
    const days = Object.keys(byDay).sort();
    const agenda = days.length ? days.map((k) => el('div', { class: 'card stack' }, el('h3', {}, new Date(k + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' })),
      byDay[k].sort((a, b) => a.start.localeCompare(b.start)).map((it) => el('div', { class: 'row between agenda-item' },
        el('div', {}, el('b', {}, `${it.start.slice(11, 16)}–${it.end.slice(11, 16)} `), it.href ? el('a', { href: it.href }, it.title) : it.title, it.sub ? el('div', { class: 'small muted' }, it.sub) : null),
        it.kind === 'entry' ? el('button', { class: 'link small', onclick: async () => { if (confirm('Eintrag löschen?')) { await A.api('DELETE', '/api/my/calendar/' + it.id); A.render(); } } }, 'löschen') : el('span', { class: 'chip green' }, 'Auftrag')))))
      : [el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'Keine Termine in diesem Monat.'))];

    const em = el('div');
    const ef = el('form', { class: 'stack', novalidate: true },
      A.field('Titel', A.input('title', '', { placeholder: 'z. B. Urlaub, Werkstatt belegt' })),
      el('div', { class: 'form-grid' }, A.field('Datum', A.input('day', '', { type: 'date' })), A.field('Von', A.input('from', '08:00', { type: 'time' })), A.field('Bis', A.input('to', '17:00', { type: 'time' }))),
      A.field('Notiz (optional)', A.input('note', '')), em, el('button', { class: 'btn ghost sm', type: 'submit' }, 'Eintragen'));
    ef.addEventListener('submit', async (ev) => {
      ev.preventDefault(); const f = A.formData(ef);
      try { await A.post('/api/my/calendar', { title: f.title, start: `${f.day}T${f.from}`, end: `${f.day}T${f.to}`, note: f.note }); A.render(); }
      catch (e) { em.replaceChildren(A.alert('err', e.message)); }
    });
    const active = myOrders.orders.filter((o) => ['vergeben', 'in_bearbeitung', 'fertig_gemeldet', 'klaerung'].includes(o.status));
    return A.page(el('div', { class: 'stack' },
      el('h1', {}, 'Dashboard'),
      A.company && !A.company.complete ? A.alert('warn', 'Vervollständige dein ', el('a', { href: '#/profil' }, 'Unternehmensprofil'), ', um Angebote abgeben zu können.') : null,
      el('div', { class: 'grid g4' },
        el('a', { class: 'card', href: '#/auftraege?matching=1' }, el('span', { class: 'eyebrow' }, 'Neue Anfragen'), el('strong', {}, 'Passende Aufträge finden →')),
        el('a', { class: 'card', href: '#/meine-auftraege' }, el('span', { class: 'eyebrow' }, 'Laufende Aufträge'), el('strong', {}, String(active.length))),
        el('a', { class: 'card', href: '#/meine-angebote' }, el('span', { class: 'eyebrow' }, 'Angebote'), el('strong', {}, 'Meine Angebote →'))),
      unscheduled.length ? el('div', { class: 'card stack' }, el('h3', {}, 'Aufträge ohne festen Termin'),
        unscheduled.map((u) => el('p', {}, el('a', { href: '#/auftrag/' + u.id }, `#${u.id} ${A.label('services', u.service)} · ${u.city}`), el('span', { class: 'small muted' }, ` – laut Angebot: ${u.appointment}`)))) : null,
      el('div', { class: 'row between' },
        el('h2', {}, 'Kalender ', first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })),
        el('div', { class: 'row' }, el('a', { class: 'btn ghost sm', href: '#/kalender?monat=' + shift(-1) }, '← Vormonat'), el('a', { class: 'btn ghost sm', href: '#/kalender' }, 'Heute'), el('a', { class: 'btn ghost sm', href: '#/kalender?monat=' + shift(1) }, 'Nächster →'))),
      el('div', { class: 'cal', role: 'grid', 'aria-label': 'Monatskalender' }, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => el('div', { class: 'cal-head' }, w)), cells),
      el('div', { class: 'layout' }, el('div', { class: 'main stack' }, el('h2', {}, 'Termine im Überblick'), ...agenda),
        el('aside', { class: 'card stack' }, el('h3', {}, 'Eigenen Eintrag hinzufügen'), el('p', { class: 'small muted' }, 'Für Blockzeiten, Urlaub oder Termine außerhalb der Plattform. Nur für dich sichtbar.'), ef))));
  });
})();
