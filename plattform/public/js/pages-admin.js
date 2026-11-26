'use strict';
(() => {
  const A = window.App, el = A.el;
  const TABS = { uebersicht: 'Übersicht', anfragen: 'Anfragen', betriebe: 'Betriebe & Nachweise', meldungen: 'Meldungen', auftraege: 'Aufträge & Streitfälle', provisionen: 'Provisionen', einstellungen: 'Einstellungen', protokoll: 'Protokoll' };
  const table = (head, rows) => el('div', { class: 'tablebox' }, el('table', {}, el('thead', {}, el('tr', {}, head.map((h) => el('th', {}, h)))), el('tbody', {}, rows)));
  const prompt2 = (title, fields, onOk) => {
    const inputs = fields.map(([name, label, value, attrs]) => [name, attrs && attrs.textarea ? el('textarea', {}, value || '') : A.input(name, value || '', attrs || {}), label]);
    const m = el('div');
    const d = A.dialog(title, [...inputs.map(([, i, l]) => A.field(l, i)), m, el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: async () => { const v = Object.fromEntries(inputs.map(([n, i]) => [n, i.value])); try { await onOk(v); d.close(); A.render(); } catch (e) { m.replaceChildren(A.alert('err', e.message)); } } }, 'Speichern'),
      el('button', { class: 'btn ghost', onclick: () => d.close() }, 'Abbrechen'))]);
  };

  const views = {
    async uebersicht() {
      const o = await A.get('/api/admin/overview');
      const c = o.commissions;
      const tile = (t, v, s) => el('div', { class: 'card stack' }, el('span', { class: 'small muted' }, t), el('strong', { class: 'eyebrow' }, v), s ? el('span', { class: 'small muted' }, s) : null);
      return el('div', { class: 'stack' },
        o.geo_available ? null : A.alert('warn', 'Keine PLZ-Geodaten importiert: Umkreissuche und Entfernungen sind deaktiviert. Siehe README → „Postleitzahlen importieren“.'),
        el('div', { class: 'grid g4' },
          tile('Offene Anfragen', o.requests_open), tile('Aufträge gesamt', o.orders_total), tile('Streitfälle', o.disputes), tile('Offene Meldungen', o.reports_open)),
        el('h3', {}, 'Provisionen (brutto) nach Status'),
        el('div', { class: 'grid g4' }, Object.entries(c).map(([k, v]) => tile(A.label('commissionStatus', k), A.eur(v.s), `${v.n} Vorgänge`))),
        el('h3', {}, 'Tatsächliche Zahlungseingänge'),
        el('div', { class: 'grid g4' }, tile('Erfasste Zahlungseingänge', A.eur(o.payments_received_cents), 'manuell aus dem Kontoauszug erfasst')),
        A.alert('info', 'Eine erfasste oder in Rechnung gestellte Provision ist noch keine eingegangene Zahlung. Zahlungseingänge werden getrennt erfasst.'));
    },
    async anfragen() {
      const { requests } = await A.get('/api/admin/requests');
      return table(['#', 'Leistung', 'Kunde', 'Ort', 'Status', 'Sichtbar', ''], requests.map((r) => el('tr', {},
        el('td', {}, r.id), el('td', {}, A.label('services', r.service), el('br'), el('span', { class: 'small muted' }, `${r.vehicle_make} ${r.vehicle_model}`)), el('td', {}, r.customer_email),
        el('td', {}, `${r.plz} ${r.city}`), el('td', {}, A.statusChip(r.display_status)), el('td', {}, r.hidden ? 'ausgeblendet' : 'ja'),
        el('td', {}, el('a', { href: '#/job/' + r.id }, 'Ansehen'), ' · ', el('button', { class: 'link', onclick: async () => { await A.post(`/api/admin/requests/${r.id}/hide`, { hidden: !r.hidden }); A.render(); } }, r.hidden ? 'einblenden' : 'ausblenden')))));
    },
    async betriebe() {
      const { companies } = await A.get('/api/admin/companies');
      if (!companies.length) return el('div', { class: 'card empty' }, 'Noch keine Betriebe registriert.');
      return el('div', { class: 'stack' }, companies.map((c) => el('div', { class: 'card stack' },
        el('div', { class: 'row between' }, el('h3', {}, c.name || '(ohne Namen)', ' ', el('span', { class: 'small muted' }, c.login_email)), el('div', { class: 'chips' }, c.complete ? el('span', { class: 'chip green' }, 'Profil vollständig') : el('span', { class: 'chip warn' }, 'unvollständig'), c.locked ? el('span', { class: 'chip err' }, 'gesperrt') : null)),
        el('p', { class: 'small' }, `${c.street}, ${c.plz} ${c.city} · ${c.phone} · ${c.vat_mode === 'klein' ? 'Kleinunternehmer' : 'USt-pflichtig'} · ${c.mobile ? 'mobil' : ''} ${c.workshop ? 'Halle/Werkstatt' : ''}`),
        el('p', { class: 'small' }, el('b', {}, 'Selbstauskunft Versicherung: '), c.self_insurance || '–', el('br'), el('b', {}, 'Selbstauskunft Gewerbe: '), c.self_trade || '–'),
        el('div', {}, el('b', {}, 'Hochgeladene Nachweise: '), c.files.length ? c.files.map((f) => el('span', {}, el('a', { href: '/api/files/' + f.id, target: '_blank' }, f.label || f.id), ' ')) : 'keine'),
        el('div', {}, el('b', {}, 'Dokumentierte Prüfungen: '), c.verifications.length ? el('ul', {}, c.verifications.map((v) => el('li', {}, `${v.kind} · ${A.date(v.checked_at)} durch ${v.checked_by_email}: ${v.note}${v.revoked_at ? ' (widerrufen)' : ''} `, v.revoked_at ? null : el('button', { class: 'link', onclick: async () => { await A.post(`/api/admin/verifications/${v.id}/revoke`); A.render(); } }, 'widerrufen')))) : 'keine'),
        el('div', { class: 'row' },
          el('button', { class: 'btn ghost sm', onclick: () => prompt2('Prüfung dokumentieren', [['kind', 'Art (gewerbe, versicherung, sonstiges)', 'gewerbe'], ['file_id', 'Datei-ID des geprüften Nachweises (optional)', c.files[0] ? c.files[0].id : ''], ['valid_until', 'Gültig bis (JJJJ-MM-TT, optional)', ''], ['note', 'Prüfvermerk: was wurde wie geprüft?', '', { textarea: true }]], (v) => A.post(`/api/admin/companies/${c.id}/verify`, v)) }, 'Nachweis als geprüft dokumentieren'),
          el('button', { class: 'btn danger sm', onclick: async () => { if (confirm(c.locked ? 'Betrieb entsperren?' : 'Betrieb sperren? Er wird sofort abgemeldet.')) { await A.post(`/api/admin/companies/${c.id}/lock`, { locked: !c.locked }); A.render(); } } }, c.locked ? 'Entsperren' : 'Sperren')))));
    },
    async meldungen() {
      const { reports } = await A.get('/api/admin/reports');
      return table(['#', 'Art', 'Ziel', 'Grund', 'Von', 'Status', ''], reports.map((r) => el('tr', {},
        el('td', {}, r.id), el('td', {}, r.target_type), el('td', {}, r.target_type === 'request' ? el('a', { href: '#/job/' + r.target_id }, 'Anfrage #' + r.target_id) : r.target_type === 'company' ? el('a', { href: '#/firma/' + r.target_id }, 'Betrieb #' + r.target_id) : 'Angebot #' + r.target_id),
        el('td', {}, r.reason), el('td', {}, r.reporter_email), el('td', {}, r.status, r.admin_note ? ': ' + r.admin_note : ''),
        el('td', {}, r.status === 'offen' ? el('button', { class: 'link', onclick: () => prompt2('Meldung erledigen', [['note', 'Vermerk', ''], ['hide_target', 'Inhalt ausblenden? (ja/nein)', 'nein']], (v) => A.post(`/api/admin/reports/${r.id}/resolve`, { note: v.note, hide_target: v.hide_target.trim().toLowerCase() === 'ja' })) }, 'Erledigen') : null))));
    },
    async auftraege() {
      const { orders } = await A.get('/api/admin/orders');
      return table(['#', 'Leistung', 'Betrieb', 'Kunde', 'Preis', 'Status', 'Bestätigungen', 'Aktionen'], orders.map((o) => el('tr', {},
        el('td', {}, el('a', { href: '#/auftrag/' + o.id }, o.id)), el('td', {}, A.label('services', o.service)), el('td', {}, o.company_name), el('td', {}, o.customer_email),
        el('td', {}, A.eur(o.gross_cents), o.refund_cents ? el('div', { class: 'small' }, 'Erstattet: ' + A.eur(o.refund_cents)) : null),
        el('td', {}, A.statusChip(o.status), o.dispute_reason ? el('div', { class: 'small muted' }, o.dispute_reason) : null),
        el('td', { class: 'small' }, `Betrieb: ${o.provider_paid_cents != null ? A.eur(o.provider_paid_cents) : '–'}`, el('br'), `Kunde: ${o.customer_paid_cents != null ? A.eur(o.customer_paid_cents) : '–'}`),
        el('td', {}, el('div', { class: 'stack' },
          ['klaerung', 'fertig_gemeldet', 'vergeben', 'in_bearbeitung'].includes(o.status) ? el('button', { class: 'link', onclick: () => prompt2('Als durchgeführt & bezahlt bestätigen', [['paid_amount', 'Tatsächlich gezahlter Betrag (brutto, €)', (o.gross_cents / 100).toFixed(2).replace('.', ',')], ['note', 'Klärungsvermerk (Beleg, Rücksprache …)', '', { textarea: true }]], (v) => A.post(`/api/admin/orders/${o.id}/resolve`, { action: 'bestaetigen', ...v })) }, 'Klären: bestätigen') : null,
          ['klaerung', 'fertig_gemeldet', 'vergeben', 'in_bearbeitung'].includes(o.status) ? el('button', { class: 'link', onclick: () => prompt2('Auftrag stornieren', [['note', 'Begründung', '', { textarea: true }]], (v) => A.post(`/api/admin/orders/${o.id}/resolve`, { action: 'stornieren', ...v })) }, 'Klären: stornieren') : null,
          o.status !== 'storniert' ? el('button', { class: 'link', onclick: () => prompt2('Rückerstattung erfassen', [['amount', 'Erstatteter Betrag an den Kunden (brutto, €)', ''], ['note', 'Vermerk', '']], (v) => A.post(`/api/admin/orders/${o.id}/refund`, v)) }, 'Rückerstattung') : null)))));
    },
    async provisionen() {
      const { commissions } = await A.get('/api/admin/commissions');
      return el('div', { class: 'stack' },
        el('div', { class: 'row' }, el('a', { class: 'btn ghost sm', href: '/api/admin/export/commissions.csv' }, 'Abrechnungsübersicht exportieren (CSV)')),
        A.alert('info', 'Die PDF-Rechnung selbst wird noch nicht erzeugt. „Rechnung erstellen“ vergibt eine fortlaufende, eindeutige Rechnungsnummer; die Rechnung schreibst du vorerst in deinem Buchhaltungsprogramm.'),
        table(['#', 'Auftrag', 'Betrieb', 'Netto-Auftragswert', 'Provision', 'USt.', 'Status', 'Rechnung', 'Eingang', 'Aktionen'], commissions.map((k) => el('tr', {},
          el('td', {}, k.id), el('td', {}, el('a', { href: '#/auftrag/' + k.order_id }, k.order_id), el('div', { class: 'small muted' }, A.label('requestStatus', k.order_status))),
          el('td', {}, k.company_name), el('td', {}, A.eur(k.net_cents)), el('td', {}, `${A.eur(k.amount_cents)} (${A.pct(k.rate_bp)})`), el('td', {}, A.eur(k.vat_cents)),
          el('td', {}, A.label('commissionStatus', k.status), k.note ? el('div', { class: 'small muted' }, k.note) : null), el('td', {}, k.invoice_number || '–'), el('td', {}, A.eur(k.paid_cents)),
          el('td', {}, el('div', { class: 'stack' },
            k.status === 'abrechenbar' ? el('button', { class: 'link', onclick: async () => { try { const r = await A.post(`/api/admin/commissions/${k.id}/invoice`); A.toast('Rechnungsnummer ' + r.invoice_number); A.render(); } catch (e) { A.toast(e.message); } } }, 'Rechnung erstellen') : null,
            k.invoice_number && ['rechnung_erstellt', 'klaerung'].includes(k.status) ? el('button', { class: 'link', onclick: () => prompt2('Zahlungseingang erfassen', [['amount', 'Betrag (€)', ((k.amount_cents + k.vat_cents - k.paid_cents) / 100).toFixed(2).replace('.', ',')], ['received_on', 'Eingangsdatum (JJJJ-MM-TT)', new Date().toISOString().slice(0, 10)], ['reference', 'Verwendungszweck / Beleg', k.invoice_number]], (v) => A.post(`/api/admin/commissions/${k.id}/payment`, v)) }, 'Zahlung erfassen') : null,
            !['storniert', 'bezahlt'].includes(k.status) ? el('button', { class: 'link', onclick: () => prompt2('Status ändern', [['status', 'Neuer Status (klaerung, abrechenbar, storniert)', 'klaerung'], ['note', 'Vermerk', '']], (v) => A.post(`/api/admin/commissions/${k.id}/status`, v)) }, 'Status ändern') : null))))));
    },
    async einstellungen() {
      const s = await A.get('/api/admin/settings');
      const pct = A.input('commission_percent', String(s.commission_bp / 100).replace('.', ','), { inputmode: 'decimal' });
      const vat = A.select('agency_vat_bp', { 1900: '19 % (Agentur ist umsatzsteuerpflichtig)', 0: '0 % (Agentur ist Kleinunternehmer)' }, String(s.agency_vat_bp));
      const m = el('div');
      return el('div', { class: 'card pad-lg stack narrow' }, el('h3', {}, 'Provision für künftige Angebote'),
        A.field('Provisionssatz in %', pct), A.field('Umsatzsteuer auf die Provision', vat),
        A.alert('info', 'Änderungen gelten nur für künftig abgegebene Angebote. Der beim Angebot gezeigte Satz wird gespeichert und gilt für den daraus entstehenden Auftrag.'), m,
        el('button', { class: 'btn primary', onclick: async () => { try { const r = await A.api('PUT', '/api/admin/settings', { commission_percent: pct.value, agency_vat_bp: Number(vat.value) }); m.replaceChildren(A.alert('ok', r.note)); A.meta = await A.get('/api/meta'); } catch (e) { m.replaceChildren(A.alert('err', e.message)); } } }, 'Speichern'));
    },
    async protokoll() {
      const { audit } = await A.get('/api/admin/audit');
      return table(['Zeit', 'Nutzer', 'Aktion', 'Objekt', 'Details'], audit.map((a) => el('tr', {}, el('td', {}, a.created_at), el('td', {}, a.email || '–'), el('td', {}, a.action), el('td', {}, `${a.entity} ${a.entity_id ?? ''}`), el('td', {}, a.detail))));
    },
  };

  A.route('/verwaltung', async (_, q) => {
    if (!A.me || A.me.role !== 'admin') return A.page(A.alert('err', 'Kein Zugriff. Dieser Bereich ist nur für die Agentur.'));
    const tab = TABS[q.get('tab')] ? q.get('tab') : 'uebersicht';
    const body = el('div', {}, A.loading());
    views[tab]().then((n) => body.replaceChildren(n)).catch((e) => body.replaceChildren(A.errorBox(e, () => A.render())));
    return A.page(el('div', { class: 'stack' }, el('h1', {}, 'Verwaltung'),
      el('div', { class: 'tabs', role: 'tablist' }, Object.entries(TABS).map(([k, v]) => el('button', { role: 'tab', 'aria-selected': k === tab ? 'true' : 'false', class: k === tab ? 'on' : '', onclick: () => A.go('#/verwaltung?tab=' + k) }, v))),
      body));
  });
})();
