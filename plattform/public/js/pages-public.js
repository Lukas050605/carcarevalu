'use strict';
(() => {
  const A = window.App, el = A.el;

  // ---------- Startseite ----------
  A.route('/', () => {
    const area = (key, icon, eyebrow, title, text, cta) => el('a', { class: 'card pad-lg', href: '#/anfrage/neu?bereich=' + key },
      el('span', { class: 'icon' }, A.icon(icon)), el('span', { class: 'eyebrow' }, eyebrow), el('h3', {}, title), el('span', { class: 'muted' }, text), el('strong', { class: 'small' }, cta + ' →'));
    const step = (n, t, d) => el('div', { class: 'card stack' }, el('span', { class: 'step-no' }, n), el('h3', {}, t), el('p', { class: 'muted' }, d));
    const bp = A.meta.commissionBp;
    return el('div', {},
      el('section', { class: 'hero' }, el('div', { class: 'wrap' },
        el('div', { class: 'kicker' }, 'Mobil · In der Halle · Lackschäden'),
        el('h1', {}, 'Dein Auto. Der passende Profi.'),
        el('p', { class: 'lead' }, 'Mobile Autopflege, Aufbereitung in der Werkstatt und Hilfe bei Lackschäden. Stelle kostenlos eine Anfrage und finde den passenden Betrieb.'),
        el('div', { class: 'row' }, el('a', { class: 'btn primary', href: '#/anfrage/neu' }, 'Kostenlos Auftrag einstellen'), el('a', { class: 'btn onDark', href: '#/auftraege' }, 'Aufträge finden')),
        el('p', { class: 'note' }, 'Die Vermittlung ist für Kunden kostenlos. Die Aufbereitung oder Reparatur selbst kostet den vereinbarten Angebotspreis.'))),
      el('section', { class: 'block' }, el('div', { class: 'wrap' },
        el('h2', {}, 'Was brauchst du?'),
        el('p', { class: 'muted' }, 'Wähle einen Bereich. Wo gearbeitet wird – bei dir oder beim Betrieb – legst du in der Anfrage fest.'),
        el('div', { class: 'grid' },
          area('mobil', 'pin', 'A · Mobil', 'Mobile Aufbereitung', 'Der Dienstleister kommt zu dir oder zu einem vereinbarten Standort.', 'Anfrage starten'),
          area('halle', 'hall', 'B · Beim Betrieb', 'Aufbereitung in Halle / Werkstatt', 'Du bringst dein Fahrzeug zum Betrieb.', 'Anfrage starten'),
          area('lack', 'brush', 'C · Fachbetrieb', 'Lackschäden & Smart Repair', 'Beschreibe den Schaden und erhalte Angebote geeigneter Fachbetriebe. Ob mobil repariert werden kann, bestätigt der Betrieb.', 'Schaden beschreiben')))),
      el('section', { class: 'block' }, el('div', { class: 'wrap' },
        el('h2', {}, "So funktioniert's"),
        el('div', { class: 'grid g4' },
          step('1', 'Anfrage einstellen', 'Leistung, Fahrzeug, Ort und Zeitraum angeben. Fotos sind freiwillig.'),
          step('2', 'Angebote vergleichen', 'Betriebe nennen Endpreis, Leistungsumfang, Ausführungsort und Termin. Deine Kontaktdaten bleiben verborgen.'),
          step('3', 'Betrieb beauftragen', 'Der Vertrag kommt zwischen dir und dem Betrieb zustande. Erst dann werden Kontaktdaten ausgetauscht.'),
          step('4', 'Abschluss bestätigen', 'Du bezahlst direkt beim Betrieb. Beide Seiten bestätigen Durchführung und Zahlung.')))),
      el('section', { class: 'block' }, el('div', { class: 'wrap' }, el('div', { class: 'card pad-lg layout' },
        el('div', { class: 'main stack' },
          el('h2', {}, 'Transparente Provision'),
          el('p', {}, el('b', {}, 'Für Kunden: '), 'Die Vermittlung ist kostenlos. Es gibt keine Vermittlungsgebühr. Du zahlst nur den vereinbarten Angebotspreis an den Betrieb.'),
          el('p', {}, el('b', {}, 'Für Betriebe: '), `Profil, Ansehen von Anfragen und Angebote sind kostenlos, ohne Monatsgebühr. Nur für einen über die Plattform vermittelten, ausgeführten und bezahlten Auftrag berechnen wir ${A.pct(bp)} Provision auf den Netto-Auftragswert.`),
          el('p', { class: 'muted' }, 'Keine Provision auf abgelehnte oder stornierte Aufträge.')),
        el('aside', { class: 'calc', 'aria-label': 'Rechenbeispiel' },
          el('p', { class: 'eyebrow' }, 'Rechenbeispiel (15 %)'),
          el('div', {}, el('span', {}, 'Kundenpreis inkl. 19 % USt.'), el('b', {}, '119,00 €')),
          el('div', {}, el('span', {}, 'Netto-Auftragswert'), el('b', {}, '100,00 €')),
          el('div', {}, el('span', {}, 'Provision 15 %'), el('b', {}, '15,00 €')),
          el('div', { class: 'muted' }, el('span', {}, 'ggf. zzgl. 19 % USt. auf die Provision'), el('span', {}, '2,85 €')),
          el('div', { class: 'sum' }, el('span', {}, 'Beim Betrieb verbleiben netto'), el('span', {}, '85,00 €')))))),
      el('section', { class: 'band' }, el('div', { class: 'wrap block row between' },
        el('div', { class: 'narrow' }, el('h2', {}, 'Du bist Aufbereiter oder Lackierer?'),
          el('p', {}, 'Kostenloses Unternehmensprofil anlegen, mobil, stationär oder beides angeben und passende Anfragen ansehen.')),
        el('a', { class: 'btn dark', href: A.me ? '#/auftraege' : '#/registrieren?rolle=betrieb' }, A.me ? 'Aufträge finden' : 'Als Betrieb registrieren'))));
  });

  // ---------- Anmeldung ----------
  A.route('/anmelden', (_, q) => {
    const msg = el('div');
    const form = el('form', { class: 'card pad-lg stack', novalidate: true },
      el('h1', {}, 'Anmelden'),
      A.field('E-Mail', A.input('email', '', { type: 'email', autocomplete: 'email', required: true })),
      A.field('Passwort', A.input('password', '', { type: 'password', autocomplete: 'current-password', required: true })),
      msg,
      el('button', { class: 'btn primary', type: 'submit' }, 'Anmelden'),
      el('p', { class: 'small muted' }, 'Noch kein Konto? ', el('a', { href: '#/registrieren' }, 'Kostenlos registrieren')),
      el('p', { class: 'small muted' }, 'Passwort vergessen? Die automatische Zurücksetzung per E-Mail ist noch nicht aktiv. Bitte wende dich an die Agentur.'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await A.post('/api/auth/login', A.formData(form)); await A.loadMe(); A.go(q.get('next') || (A.me.role === 'admin' ? '#/verwaltung' : A.me.role === 'betrieb' ? '#/kalender' : '#/meine-anfragen')); }
      catch (e) { msg.replaceChildren(A.alert('err', e.message)); }
    });
    return A.page(el('div', { class: 'narrow' }, form));
  });

  A.route('/registrieren', (_, q) => {
    const msg = el('div');
    const form = el('form', { class: 'card pad-lg stack', novalidate: true },
      el('h1', {}, 'Kostenlos registrieren'),
      A.radios('role', { kunde: 'Ich suche einen Betrieb', betrieb: 'Ich bin Aufbereiter / Fachbetrieb' }, q.get('rolle') === 'betrieb' ? 'betrieb' : 'kunde', 'Ich bin …',
        { kunde: 'Anfragen einstellen und Angebote vergleichen', betrieb: 'Profil anlegen, Anfragen ansehen, Angebote senden' }),
      A.field('Name', A.input('name', '', { autocomplete: 'name', required: true })),
      A.field('E-Mail', A.input('email', '', { type: 'email', autocomplete: 'email', required: true })),
      A.field('Telefon (optional)', A.input('phone', '', { type: 'tel', autocomplete: 'tel' }), 'Wird nur an den beauftragten Vertragspartner weitergegeben.'),
      A.field('Passwort', A.input('password', '', { type: 'password', autocomplete: 'new-password', minlength: 10, required: true }), 'Mindestens 10 Zeichen'),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', name: 'accept_terms' }), el('span', {}, 'Ich habe die ', el('a', { href: '#/rechtliches/vermittlungsbedingungen', target: '_blank' }, 'Vermittlungsbedingungen'), ' und die ', el('a', { href: '#/rechtliches/datenschutz', target: '_blank' }, 'Datenschutzinformationen'), ' gelesen.')),
      msg,
      el('button', { class: 'btn primary', type: 'submit' }, 'Konto anlegen'));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await A.post('/api/auth/register', A.formData(form)); await A.loadMe(); A.go(q.get('next') || (A.me.role === 'betrieb' ? '#/profil' : '#/anfrage/neu')); }
      catch (e) { msg.replaceChildren(A.alert('err', e.message)); }
    });
    return A.page(el('div', { class: 'narrow' }, form));
  });

  // ---------- Öffentliches Betriebsprofil ----------
  A.companyBadges = (c) => el('div', { class: 'stack' },
    el('div', { class: 'chips' },
      c.mobile ? el('span', { class: 'chip green' }, `Mobil${c.mobile_radius_km ? ' bis ' + c.mobile_radius_km + ' km' : ''}`) : null,
      c.workshop ? el('span', { class: 'chip purple' }, 'Halle / Werkstatt') : null,
      c.vat_mode === 'klein' ? el('span', { class: 'chip' }, 'Kleinunternehmer (§ 19 UStG, laut Selbstauskunft)') : null),
    c.verified.length
      ? el('div', { class: 'chips' }, c.verified.map((v) => el('span', { class: 'chip green' }, `✓ Geprüft durch die Agentur: ${{ gewerbe: 'Gewerbenachweis', versicherung: 'Versicherungsnachweis', sonstiges: 'Nachweis' }[v.kind]} (${A.date(v.checked_at)})`)))
      : el('p', { class: 'small muted' }, 'Noch keine Nachweise durch die Agentur geprüft.'));

  A.route('/firma/:id', async ({ id }) => {
    const { company: c } = await A.get('/api/companies/' + encodeURIComponent(id));
    return A.page(el('div', { class: 'stack narrow' },
      el('h1', {}, c.name), el('p', { class: 'muted' }, `${c.city} (PLZ ${c.plz_area})`),
      A.companyBadges(c),
      el('div', { class: 'card stack' }, el('h3', {}, 'Leistungen'), el('div', { class: 'chips' }, c.services.map((s) => el('span', { class: 'chip' }, A.label('services', s))))),
      c.description ? el('div', { class: 'card' }, el('h3', {}, 'Über den Betrieb'), el('p', {}, c.description)) : null,
      el('div', { class: 'card stack' }, el('h3', {}, 'Selbstauskunft des Betriebs'), el('p', { class: 'small muted' }, 'Diese Angaben wurden vom Betrieb selbst gemacht und von der Agentur nicht geprüft, sofern oben kein Prüfvermerk steht.'),
        el('p', {}, el('b', {}, 'Versicherung: '), c.self_declared.insurance || 'keine Angabe'),
        el('p', {}, el('b', {}, 'Gewerbliche Tätigkeit: '), c.self_declared.trade || 'keine Angabe')),
      c.examples.length ? el('div', { class: 'card stack' }, el('h3', {}, 'Arbeitsbeispiele'), el('div', { class: 'photos' }, c.examples.map((f) => el('figure', {}, el('img', { src: '/api/files/' + f, alt: 'Arbeitsbeispiel von ' + c.name, loading: 'lazy' }))))) : null,
      el('div', {}, el('button', { class: 'link small', onclick: () => A.reportDialog('company', c.id) }, 'Profil melden'))));
  });

  A.reportDialog = (type, id) => {
    if (!A.me) { A.go('#/anmelden?next=' + encodeURIComponent(location.hash)); return; }
    const ta = el('textarea', { name: 'reason', required: true });
    const msg = el('div');
    const d = A.dialog('Inhalt melden', [A.field('Was ist das Problem?', ta), msg, el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: async () => { try { await A.post('/api/reports', { target_type: type, target_id: id, reason: ta.value }); d.close(); A.toast('Danke, die Meldung wurde an die Agentur übermittelt.'); } catch (e) { msg.replaceChildren(A.alert('err', e.message)); } } }, 'Melden'),
      el('button', { class: 'btn ghost', onclick: () => d.close() }, 'Abbrechen'))]);
  };

  // ---------- Rechtliches (Entwürfe) ----------
  const M = (t) => el('span', { class: 'missing' }, `[FEHLT: ${t}]`);
  const draft = () => el('div', { class: 'draft' }, el('b', {}, 'Entwurf – rechtlich prüfen lassen. '), 'Dieser Text ist eine Vorlage und keine Rechtsberatung. Fehlende Angaben sind markiert. Vor dem Livegang durch eine Rechtsanwältin oder einen Rechtsanwalt prüfen lassen.');
  const legal = {
    impressum: () => [el('h1', {}, 'Impressum'), draft(),
      el('h2', {}, 'Angaben gemäß § 5 DDG'),
      el('p', {}, 'MHL Agentur – Aufbereitung mobil, in der Halle & Lackschäden'),
      el('p', {}, 'Inhaber/in bzw. vertretungsberechtigte Person: ', M('vollständiger Name')), el('p', {}, 'Rechtsform: ', M('z. B. Einzelunternehmen, GmbH')),
      el('p', {}, 'Anschrift: ', M('ladungsfähige Anschrift')), el('p', {}, 'E-Mail: ', M('E-Mail-Adresse'), ' · Telefon: ', M('Telefonnummer')),
      el('p', {}, 'Umsatzsteuer-ID gemäß § 27a UStG: ', M('USt-IdNr., falls vorhanden')), el('p', {}, 'Handelsregister: ', M('Registergericht und Nummer, falls eingetragen')),
      el('h2', {}, 'Verbraucherstreitbeilegung'), el('p', {}, 'Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. ', M('prüfen, ob diese Aussage zutrifft'))],
    datenschutz: () => [el('h1', {}, 'Datenschutzinformationen'), draft(),
      el('h2', {}, '1. Verantwortlicher'), el('p', {}, M('Name und Anschrift des Verantwortlichen, Kontakt')),
      el('h2', {}, '2. Welche Daten wir verarbeiten'),
      el('p', {}, 'Konto: Name, E-Mail, Passwort (nur als Hash gespeichert), optional Telefon. Anfragen: Fahrzeug, Leistung, PLZ/Ort, optionale genaue Anschrift, Beschreibung, optionale Fotos. Betriebe: Firmendaten, Kontaktdaten, Leistungen, Nachweise. Aufträge: Angebote, Status, Bestätigungen, Provisionsdaten.'),
      el('h2', {}, '3. Zwecke und Rechtsgrundlagen'),
      el('p', {}, 'Vermittlung und Durchführung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO); gesetzliche Aufbewahrungspflichten für Abrechnungsdaten (Art. 6 Abs. 1 lit. c DSGVO); Missbrauchsabwehr und Sicherheit (Art. 6 Abs. 1 lit. f DSGVO).'),
      el('h2', {}, '4. Weitergabe'),
      el('p', {}, 'In der öffentlichen Auftragsübersicht erscheinen keine Namen, E-Mail-Adressen, Telefonnummern oder genauen Anschriften, sondern nur ein ungefährer Standort (PLZ-Bereich und Ort). Kontaktdaten erhalten ausschließlich die Beteiligten eines verbindlich vergebenen Auftrags, und zwar nur zu dessen Durchführung. Fotos sind nur für angemeldete Betriebe sichtbar; Metadaten wie GPS-Koordinaten werden beim Hochladen entfernt.'),
      el('h2', {}, '5. Hosting und Auftragsverarbeiter'), el('p', {}, M('Hosting-Anbieter, Serverstandort, Auftragsverarbeitungsvertrag')),
      el('h2', {}, '6. Speicherdauer'), el('p', {}, M('Löschfristen festlegen, z. B. Anfragen ohne Auftrag nach X Monaten; Abrechnungsdaten 8 bzw. 10 Jahre gemäß HGB/AO')),
      el('h2', {}, '7. Cookies'), el('p', {}, 'Wir verwenden ausschließlich ein technisch notwendiges Sitzungs-Cookie für die Anmeldung. Keine Analyse- oder Werbe-Cookies, keine externen Schriftarten.'),
      el('h2', {}, '8. Deine Rechte'), el('p', {}, 'Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch sowie Beschwerde bei einer Aufsichtsbehörde. ', M('zuständige Aufsichtsbehörde'))],
    vermittlungsbedingungen: () => [el('h1', {}, 'Vermittlungsbedingungen'), draft(),
      el('h2', {}, '1. Rolle der Agentur'), el('p', {}, 'Die MHL Agentur betreibt eine Plattform, über die Kundinnen und Kunden Anfragen einstellen und Betriebe Angebote abgeben können. Die Agentur ist ausschließlich Vermittlerin. Verträge über Fahrzeugaufbereitung oder Reparatur kommen direkt zwischen dem Kunden und dem ausführenden Betrieb zustande. Die Agentur wird nicht Vertragspartei dieser Verträge und schuldet weder die Durchführung noch einen bestimmten Erfolg.'),
      el('h2', {}, '2. Kosten für Kunden'), el('p', {}, 'Die Nutzung der Plattform und die Vermittlung sind für Kunden kostenlos. Für die Leistung selbst zahlt der Kunde den im angenommenen Angebot genannten Endpreis direkt an den Betrieb.'),
      el('h2', {}, '3. Kosten für Betriebe'), el('p', {}, 'Profil, Ansehen von Anfragen und Abgabe von Angeboten sind kostenlos; es gibt keine Monatsgebühr. Für jeden über die Plattform vermittelten, ausgeführten und bezahlten Auftrag schuldet der Betrieb der Agentur eine Provision auf den Netto-Auftragswert. Maßgeblich ist der bei Angebotsabgabe angezeigte und gespeicherte Provisionssatz, zuzüglich gesetzlicher Umsatzsteuer, soweit diese anfällt. Für abgelehnte, stornierte oder vollständig erstattete Aufträge fällt keine Provision an. Folgeaufträge sind nur provisionspflichtig, wenn sie erneut über die Plattform vermittelt werden. ', M('Zahlungsziel, Rechnungsstellung, Umgang mit Teilerstattungen prüfen')),
      el('h2', {}, '4. Angebote'), el('p', {}, 'Angebote müssen den Leistungsumfang, den Ausführungsort, Termin oder Zeitfenster, den Endpreis für den Kunden einschließlich anfallender Steuern und enthaltener Anfahrtskosten sowie die geschätzte Dauer enthalten. Zusatzleistungen sind nur geschuldet, wenn sie ausdrücklich benannt und vereinbart sind. Fotos ersetzen keine Begutachtung. Eine mobile Lackreparatur gilt erst als möglich, wenn der Fachbetrieb dies im Angebot bestätigt.'),
      el('h2', {}, '5. Bestätigung und Klärung'), el('p', {}, 'Nach Abschluss bestätigen Betrieb und Kunde getrennt die Durchführung und den gezahlten Betrag. Bei abweichenden Angaben prüft die Agentur den Vorgang manuell.'),
      el('h2', {}, '6. Haftung, Laufzeit, Kündigung, Gerichtsstand'), el('p', {}, M('durch Rechtsberatung zu ergänzen'))],
    verbraucherinformationen: () => [el('h1', {}, 'Verbraucherinformationen'), draft(),
      el('h2', {}, 'Wer ist mein Vertragspartner?'), el('p', {}, 'Für die Aufbereitung oder Reparatur ist dein Vertragspartner der Betrieb, dessen Angebot du annimmst. Name, Anschrift und Kontaktdaten des Betriebs siehst du vor der Annahme im Angebot und nach der Beauftragung vollständig in deinem Auftrag. Für die Nutzung der Plattform ist die MHL Agentur dein Vertragspartner (kostenlos).'),
      el('h2', {}, 'Wesentliche Eigenschaften und Preis'), el('p', {}, 'Leistungsumfang, Ausführungsort, Termin und der Gesamtpreis inklusive Steuern und Anfahrt stehen im Angebot. Für Kunden fällt keine Vermittlungsgebühr an.'),
      el('h2', {}, 'Zahlung'), el('p', {}, 'Du bezahlst direkt beim Betrieb auf dem mit ihm vereinbarten Weg. Über die Plattform werden derzeit keine Zahlungen abgewickelt.'),
      el('h2', {}, 'Widerrufsrecht'), el('p', {}, 'Ob und wie dir beim Vertrag mit dem Betrieb ein Widerrufsrecht zusteht (z. B. bei Fernabsatz oder außerhalb von Geschäftsräumen geschlossenen Verträgen), hängt vom Einzelfall ab. Der Betrieb ist verpflichtet, dich darüber zu informieren. ', M('Muster-Widerrufsbelehrung für Betriebe und Hinweis zum vorzeitigen Beginn der Dienstleistung durch Rechtsberatung erstellen lassen')),
      el('h2', {}, 'Beschwerden'), el('p', {}, 'Bei Problemen nutze im Auftrag die Funktion „Problem melden“. Die Agentur vermittelt, kann aber keine Leistung des Betriebs garantieren.')],
  };
  A.route('/rechtliches/:page', ({ page }) => {
    const f = legal[page];
    if (!f) throw new Error('Seite nicht gefunden');
    return A.page(el('article', { class: 'narrow legal stack' }, ...f()));
  });
})();
