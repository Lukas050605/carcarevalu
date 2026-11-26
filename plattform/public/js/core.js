'use strict';
// Gemeinsame Helfer. Alle Nutzerinhalte werden als Text eingefügt (kein innerHTML mit Fremddaten).
window.App = (() => {
  const A = { meta: null, me: null, company: null, routes: [] };

  A.el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'required' || k === 'multiple') e[k] = !!v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      e.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return e;
  };
  const el = A.el;

  // Statisches, vertrauenswürdiges SVG (nur eigene Icons)
  const ICONS = {
    pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 1 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
    hall: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-7h10v7"/><path d="M7 17h10"/>',
    brush: '<path d="M4 20l6-6"/><path d="M14 4l6 6-8 8-6-6z"/><path d="M15 9l-2 2"/>',
  };
  A.icon = (name) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('width', '30'); s.setAttribute('height', '30'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', '#157A41'); s.setAttribute('stroke-width', '2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name]; // eigene Konstante, keine Fremddaten
    return s;
  };

  A.api = async (method, url, body, isForm = false) => {
    const opt = { method, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' };
    if (body !== undefined) {
      if (isForm) opt.body = body; else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    }
    let res;
    try { res = await fetch(url, opt); } catch { throw new Error('Keine Verbindung zum Server. Bitte Internetverbindung prüfen und erneut versuchen.'); }
    let data = null;
    try { data = await res.json(); } catch { /* leer */ }
    if (!res.ok) { const e = new Error((data && data.error) || `Fehler ${res.status}`); e.status = res.status; throw e; }
    return data;
  };
  A.get = (u) => A.api('GET', u);
  A.post = (u, b) => A.api('POST', u, b ?? {});

  A.eur = (c) => (c === null || c === undefined ? '–' : (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }));
  A.pct = (bp) => (bp / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' %';
  A.date = (s) => { if (!s) return '–'; const d = new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  A.label = (map, k) => (A.meta && A.meta[map] && A.meta[map][k]) || k || '–';

  A.toast = (msg) => {
    const t = el('div', { class: 'toast', role: 'status' }, msg);
    document.body.append(t); setTimeout(() => t.remove(), 3500);
  };
  A.alert = (kind, ...kids) => el('div', { class: 'alert ' + kind, role: kind === 'err' ? 'alert' : 'status' }, ...kids);
  A.loading = () => el('div', { class: 'loading' }, 'Wird geladen …');
  A.errorBox = (e, retry) => el('div', { class: 'stack' }, A.alert('err', e.message || String(e)), retry ? el('div', {}, el('button', { class: 'btn ghost', onclick: retry }, 'Erneut versuchen')) : null);

  A.statusChip = (s) => {
    const cls = { offen: 'green', angebote: 'blue', vergeben: 'purple', in_bearbeitung: 'purple', fertig_gemeldet: 'blue', bestaetigt: 'green', abgeschlossen: '', storniert: 'err', zurueckgezogen: 'err', klaerung: 'warn' }[s] ?? '';
    return el('span', { class: 'chip ' + cls }, A.label('requestStatus', s));
  };
  A.locChip = (l) => el('span', { class: 'chip ' + ({ mobil: 'green', betrieb: 'purple', beides: 'blue' }[l] || '') }, { mobil: 'Mobil beim Kunden', betrieb: 'Halle / Werkstatt', beides: 'Flexibel: mobil oder Betrieb' }[l] || l);

  // Formularfelder
  A.field = (label, input, hint) => el('label', { class: 'f' }, label, hint ? el('span', { class: 'hint' }, hint) : null, input);
  A.input = (name, value, attrs = {}) => el('input', { type: 'text', name, id: 'f_' + name, value: value ?? '', ...attrs });
  A.select = (name, map, value, { placeholder = 'Bitte wählen', ...attrs } = {}) =>
    el('select', { name, id: 'f_' + name, ...attrs }, el('option', { value: '' }, placeholder),
      Object.entries(map).map(([k, v]) => el('option', { value: k, selected: k === value }, v)));
  A.radios = (name, map, value, legend, hints = {}) => el('fieldset', {}, el('legend', {}, legend),
    el('div', { class: 'choices' }, Object.entries(map).map(([k, v]) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name, value: k, checked: k === value }), el('span', {}, v, hints[k] ? el('small', {}, hints[k]) : null)))));
  A.checkbox = (name, label, checked) => el('label', { class: 'check' }, el('input', { type: 'checkbox', name, checked }), el('span', {}, label));
  A.formData = (form) => {
    const o = {};
    for (const e of form.elements) {
      if (!e.name || e.type === 'file') continue;
      if (e.type === 'checkbox') { if (e.dataset.multi) { (o[e.name] ||= []); if (e.checked) o[e.name].push(e.value); } else o[e.name] = e.checked; }
      else if (e.type === 'radio') { if (e.checked) o[e.name] = e.value; else if (!(e.name in o)) o[e.name] = ''; }
      else o[e.name] = e.value;
    }
    return o;
  };

  A.dialog = (title, bodyNodes) => {
    const d = el('dialog', { 'aria-label': title }, el('div', { class: 'card pad-lg stack' }, el('h2', {}, title), ...bodyNodes));
    d.addEventListener('close', () => d.remove());
    document.body.append(d); d.showModal();
    return d;
  };

  A.photoNotice = () => A.alert('info', 'Fotos sind freiwillig. Bitte achte darauf, dass Kennzeichen, Personen und Dokumente möglichst nicht zu sehen sind. Erlaubt: JPG oder PNG, je höchstens 8 MB. Standortdaten (EXIF) entfernen wir automatisch.');

  // Router
  A.route = (pattern, fn) => A.routes.push({ re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });
  A.go = (hash) => { if (location.hash === hash) A.render(); else location.hash = hash; };
  A.render = async () => {
    const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const root = document.getElementById('app');
    document.getElementById('nav').classList.remove('open');
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
    for (const r of A.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      root.replaceChildren(el('div', { class: 'wrap' }, A.loading()));
      try {
        const node = await r.fn({ ...(m.groups || {}) }, params);
        root.replaceChildren(node);
      } catch (e) {
        if (e.status === 401) { A.go('#/anmelden?next=' + encodeURIComponent(location.hash)); return; }
        root.replaceChildren(el('div', { class: 'wrap page' }, A.errorBox(e, () => A.render())));
      }
      A.renderNav(path);
      window.scrollTo(0, 0);
      root.focus({ preventScroll: true });
      return;
    }
    root.replaceChildren(el('div', { class: 'wrap page' }, el('h1', {}, 'Seite nicht gefunden'), el('a', { href: '#/' }, 'Zur Startseite')));
  };
  A.page = (...kids) => el('div', { class: 'wrap page' }, ...kids);

  A.loadMe = async () => {
    const r = await A.get('/api/me');
    A.me = r.user; A.company = r.company;
  };
  A.renderNav = (path) => {
    const nav = document.getElementById('nav');
    const link = (href, text) => el('a', { href, class: ('#' + path).startsWith(href) && href !== '#/' ? 'active' : null }, text);
    const items = [];
    const role = A.me && A.me.role;
    if (!role) items.push(link('#/auftraege', 'Aufträge finden'), link('#/anfrage/neu', 'Auftrag einstellen'), link('#/anmelden', 'Anmelden'), link('#/registrieren', 'Registrieren'));
    if (role === 'kunde') items.push(link('#/anfrage/neu', 'Neue Anfrage'), link('#/meine-anfragen', 'Meine Anfragen'), link('#/meine-auftraege', 'Meine Aufträge'), link('#/mein-profil', 'Mein Profil'));
    if (role === 'betrieb') items.push(link('#/kalender', 'Dashboard'), link('#/auftraege', 'Aufträge finden'), link('#/gemerkt', 'Gemerkt'), link('#/meine-angebote', 'Meine Angebote'), link('#/meine-auftraege', 'Aufträge'), link('#/profil', 'Profil'));
    if (role === 'admin') items.push(link('#/verwaltung', 'Verwaltung'), link('#/auftraege', 'Auftragsübersicht'));
    if (role) items.push(el('button', { class: 'link', onclick: async () => { await A.post('/api/auth/logout'); await A.loadMe(); A.go('#/'); } }, 'Abmelden'));
    nav.replaceChildren(...items);
  };
  return A;
})();
