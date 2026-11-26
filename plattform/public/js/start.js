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
  window.addEventListener('hashchange', () => A.render());
  A.render();
})();
