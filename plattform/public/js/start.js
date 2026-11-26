'use strict';
(async () => {
  const A = window.App;
  const btn = document.getElementById('menuBtn');
  btn.addEventListener('click', () => {
    const nav = document.getElementById('nav');
    const open = nav.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  try {
    [A.meta] = await Promise.all([A.get('/api/meta'), A.loadMe()]);
  } catch (e) {
    document.getElementById('app').replaceChildren(A.page(A.errorBox(e, () => location.reload())));
    return;
  }
  if (A.meta.demo) {
    document.body.prepend(A.el('div', { class: 'demo-banner', role: 'note' },
      A.el('b', {}, 'DEMO-Version zum Testen. '), 'Keine echten Aufträge. Daten werden bei jedem Neustart zurückgesetzt. Zugänge: kunde@demo.test / demo-kunde-1234 · betrieb@demo.test / demo-betrieb-1234 · admin@demo.test / demo-admin-1234'));
  }
  window.addEventListener('hashchange', () => A.render());
  A.render();
})();
