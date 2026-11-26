'use strict';
(() => {
  const A = window.App, el = A.el;
  const STEPS = ['vergeben', 'in_bearbeitung', 'fertig_gemeldet', 'bestaetigt', 'abgeschlossen'];

  A.route('/meine-auftraege', async () => {
    const { orders } = await A.get('/api/my/orders');
    const isB = A.me.role === 'betrieb';
    return A.page(el('div', { class: 'stack' }, el('h1', {}, isB ? 'Meine Aufträge' : 'Meine beauftragten Betriebe'),
      orders.length ? orders.map((o) => el('article', { class: 'card stack' },
        el('div', { class: 'chips' }, A.statusChip(o.status), isB && o.commission ? el('span', { class: 'chip' }, A.label('commissionStatus', o.commission.status)) : null),
        el('h3', {}, A.label('services', o.service), ' · ', o.vehicle),
        el('p', { class: 'muted small' }, `${isB ? '' : o.company_name + ' · '}${A.eur(o.gross_cents)} · beauftragt am ${A.date(o.created_at)}`),
        el('div', {}, el('a', { class: 'btn primary sm', href: '#/auftrag/' + o.id }, 'Öffnen'))))
        : el('div', { class: 'card empty' }, el('p', { class: 'muted' }, 'Noch keine Aufträge.'))));
  });

  A.route('/auftrag/:id', async ({ id }) => {
    const d = await A.get('/api/orders/' + encodeURIComponent(id));
    const o = d.order, off = d.offer, role = d.role;
    const msg = el('div');
    const act = (url, body, ok) => async () => { try { await A.post(url, body ? body() : {}); A.toast(ok); A.render(); } catch (e) { msg.replaceChildren(A.alert('err', e.message)); } };
    const amountInput = () => A.input('amount', (o.gross_cents / 100).toFixed(2).replace('.', ','), { inputmode: 'decimal' });

    const disputeDialog = () => {
      const ta = el('textarea', {}); const m = el('div');
      const dl = A.dialog('Problem melden', [el('p', {}, 'Die Agentur prüft den Vorgang manuell. Bis zur Klärung wird keine Provision abgerechnet.'), A.field('Was ist passiert?', ta), m,
        el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: async () => { try { await A.post(`/api/orders/${o.id}/dispute`, { reason: ta.value }); dl.close(); A.render(); } catch (e) { m.replaceChildren(A.alert('err', e.message)); } } }, 'Meldung senden'), el('button', { class: 'btn ghost', onclick: () => dl.close() }, 'Abbrechen'))]);
    };
    const cancelDialog = () => {
      const ta = el('textarea', {}); const m = el('div');
      const dl = A.dialog('Auftrag stornieren', [el('p', {}, 'Eine Stornierung ist möglich, solange die Fertigstellung noch nicht gemeldet wurde. Für stornierte Aufträge fällt keine Provision an. Vertragliche Ansprüche zwischen Kunde und Betrieb bleiben davon unberührt.'), A.field('Grund', ta), m,
        el('div', { class: 'row' }, el('button', { class: 'btn danger', onclick: async () => { try { await A.post(`/api/orders/${o.id}/cancel`, { reason: ta.value }); dl.close(); A.render(); } catch (e) { m.replaceChildren(A.alert('err', e.message)); } } }, 'Verbindlich stornieren'), el('button', { class: 'btn ghost', onclick: () => dl.close() }, 'Zurück'))]);
    };

    const actions = [];
    if (role === 'betrieb') {
      if (o.status === 'vergeben') actions.push(el('button', { class: 'btn ghost', onclick: act(`/api/orders/${o.id}/start`, null, 'Status: in Bearbeitung') }, 'Arbeit begonnen'));
      if (['vergeben', 'in_bearbeitung'].includes(o.status)) {
        const amt = amountInput(); const paid = el('input', { type: 'checkbox' });
        actions.push(el('div', { class: 'card stack' }, el('h3', {}, 'Fertigstellung melden'),
          el('label', { class: 'check' }, paid, el('span', {}, 'Der Kunde hat bereits bezahlt')), A.field('Erhaltener Betrag in €', amt),
          el('button', { class: 'btn primary', onclick: act(`/api/orders/${o.id}/report-done`, () => ({ payment_received: paid.checked, amount: amt.value }), 'Fertigstellung gemeldet') }, 'Fertigstellung melden')));
      }
      if (o.status === 'fertig_gemeldet' && o.provider_paid_cents == null) {
        const amt = amountInput();
        actions.push(el('div', { class: 'card stack' }, el('h3', {}, 'Zahlungseingang bestätigen'), A.field('Tatsächlich erhaltener Betrag in €', amt),
          el('button', { class: 'btn primary', onclick: act(`/api/orders/${o.id}/provider-payment`, () => ({ amount: amt.value }), 'Zahlungseingang bestätigt') }, 'Zahlung erhalten')));
      }
    }
    if (role === 'kunde' && o.status === 'fertig_gemeldet' && o.customer_paid_cents == null) {
      const amt = amountInput(); const done = el('input', { type: 'checkbox' });
      actions.push(el('div', { class: 'card stack' }, el('h3', {}, 'Durchführung und Bezahlung bestätigen'),
        el('label', { class: 'check' }, done, el('span', {}, 'Die Arbeit wurde durchgeführt.')), A.field('Von mir an den Betrieb gezahlter Betrag in €', amt),
        el('button', { class: 'btn primary', onclick: act(`/api/orders/${o.id}/customer-confirm`, () => ({ work_done: done.checked, amount: amt.value }), 'Danke für deine Bestätigung') }, 'Bestätigen')));
    }
    if (role !== 'admin' && ['vergeben', 'in_bearbeitung'].includes(o.status)) actions.push(el('button', { class: 'btn danger', onclick: cancelDialog }, 'Auftrag stornieren'));
    if (role !== 'admin' && !['storniert', 'abgeschlossen', 'klaerung'].includes(o.status)) actions.push(el('button', { class: 'link', onclick: disputeDialog }, 'Problem melden'));

    const confirmState = el('div', { class: 'facts' },
      el('span', {}, el('b', {}, 'Betrieb: '), o.provider_paid_cents != null ? `Zahlung ${A.eur(o.provider_paid_cents)} bestätigt` : 'Zahlung noch nicht bestätigt'),
      el('span', {}, el('b', {}, 'Kunde: '), o.customer_paid_cents != null ? `Durchführung und Zahlung ${A.eur(o.customer_paid_cents)} bestätigt` : 'noch nicht bestätigt'));

    const cc = d.company_contact, cu = d.customer_contact, k = d.commission;
    return A.page(el('div', { class: 'stack' },
      el('div', { class: 'chips' }, A.statusChip(o.status)),
      el('h1', {}, `Auftrag #${o.id}: ${A.label('services', d.request.service)}`),
      el('ol', { class: 'chips', 'aria-label': 'Ablauf' }, STEPS.map((s) => el('li', { class: 'chip ' + (STEPS.indexOf(s) <= STEPS.indexOf(o.status) ? 'green' : '') }, A.label('requestStatus', s)))),
      o.status === 'klaerung' ? A.alert('warn', el('b', {}, 'In Klärung: '), o.dispute_reason || '', ' Die Agentur meldet sich.') : null,
      o.status === 'storniert' ? A.alert('err', 'Storniert: ', o.cancel_reason || '') : null,
      msg,
      el('div', { class: 'layout' },
        el('div', { class: 'main stack' },
          el('div', { class: 'card stack' }, el('h2', {}, 'Vereinbarung'),
            el('p', { class: 'small muted' }, `Vertrag zwischen Kunde und ${cc.name}. Die MHL Agentur hat vermittelt und ist nicht Vertragspartei.`),
            el('div', { class: 'facts' },
              el('span', {}, el('b', {}, 'Endpreis: '), A.eur(o.gross_cents), off.provider_vat_bp ? ` inkl. ${A.pct(off.provider_vat_bp)} USt.` : ' (Kleinunternehmer)'),
              el('span', {}, el('b', {}, 'Ort: '), off.location === 'mobil' ? 'Mobil beim Kunden' : 'Beim Betrieb'),
              el('span', {}, el('b', {}, 'Termin: '), off.appointment), el('span', {}, el('b', {}, 'Dauer: '), off.duration),
              off.location === 'mobil' ? el('span', {}, el('b', {}, 'Anfahrt: '), off.travel_included ? 'im Preis enthalten' : off.travel_note) : null,
              el('span', {}, el('b', {}, 'Beauftragt am: '), A.date(o.created_at))),
            el('p', {}, el('b', {}, 'Leistungsumfang: '), off.scope),
            off.extras ? el('p', {}, el('b', {}, 'Zusatzleistungen nur nach Absprache: '), off.extras) : null,
            o.refund_cents ? A.alert('info', `Erfasste Rückerstattung: ${A.eur(o.refund_cents)}`) : null),
          A.orderExtras(d),
          el('div', { class: 'card stack' }, el('h2', {}, 'Bestätigungen'), confirmState),
          actions.length ? el('div', { class: 'stack' }, ...actions) : null,
          el('div', { class: 'card stack' }, el('h3', {}, 'Anfrage'), A.requestFacts(d.request), A.requestDetails(d.request))),
        el('aside', { class: 'stack' },
          el('div', { class: 'card stack' }, el('h3', {}, 'Ausführender Betrieb'),
            el('p', {}, el('b', {}, cc.name), el('br'), cc.contact_person, el('br'), cc.street, el('br'), `${cc.plz} ${cc.city}`),
            cc.workshop_address ? el('p', { class: 'small' }, 'Halle/Werkstatt: ', cc.workshop_address) : null,
            el('p', {}, el('a', { href: 'tel:' + cc.phone }, cc.phone), el('br'), el('a', { href: 'mailto:' + cc.email }, cc.email))),
          cu ? el('div', { class: 'card stack' }, el('h3', {}, 'Kunde'), el('p', {}, el('b', {}, cu.name), el('br'), cu.address || '(keine genaue Anschrift angegeben)', el('br'), `${cu.plz} ${cu.city}`),
            el('p', {}, cu.phone ? el('a', { href: 'tel:' + cu.phone }, cu.phone) : 'kein Telefon angegeben', el('br'), el('a', { href: 'mailto:' + cu.email }, cu.email)),
            el('p', { class: 'small muted' }, 'Diese Daten dürfen nur für diesen Auftrag verwendet werden.')) : null,
          k ? el('div', { class: 'card calc stack' }, el('h3', {}, 'Provision'),
            el('div', {}, el('span', {}, 'Status'), el('b', {}, A.label('commissionStatus', k.status))),
            el('div', {}, el('span', {}, 'Netto-Auftragswert'), el('b', {}, A.eur(k.net_cents))),
            el('div', {}, el('span', {}, 'Satz (gespeichert)'), el('b', {}, A.pct(k.rate_bp))),
            el('div', {}, el('span', {}, 'Provision netto'), el('b', {}, A.eur(k.amount_cents))),
            el('div', {}, el('span', {}, `USt. ${A.pct(k.vat_bp)}`), el('b', {}, A.eur(k.vat_cents))),
            k.invoice_number ? el('div', {}, el('span', {}, 'Rechnung'), el('b', {}, k.invoice_number)) : null,
            el('p', { class: 'small muted' }, k.status === 'voraussichtlich' ? 'Wird erst abrechenbar, wenn Durchführung und Bezahlung von beiden Seiten bestätigt sind.' : 'Die Rechnung der Agentur erhältst du gesondert.')) : null))));
  });
})();
