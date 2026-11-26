'use strict';
// Minimaler Express-Ersatz für die Browser-Demo: dieselben Routen und Middleware laufen synchron im Browser.
function compile(path, end) {
  if (path === '*') return () => ({ params: {} });
  const keys = [];
  const src = path.replace(/\/$/, '').replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  const re = new RegExp('^' + src + (end ? '/?$' : '(?=/|$)'));
  return (p) => {
    const m = re.exec(p);
    if (!m) return null;
    const params = {};
    keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { params, matched: m[0] };
  };
}

function createRouter() {
  const stack = [];
  const r = { stack };
  for (const m of ['get', 'post', 'put', 'delete', 'patch']) {
    r[m] = (path, ...hs) => { stack.push({ method: m.toUpperCase(), match: compile(path, true), hs, prefix: false }); return r; };
  }
  r.use = (a, ...hs) => {
    if (typeof a === 'string') stack.push({ method: null, match: a === '/' ? () => ({ params: {}, matched: '' }) : compile(a, false), hs, prefix: true });
    else stack.push({ method: null, match: () => ({ params: {}, matched: '' }), hs: [a, ...hs], prefix: true });
    return r;
  };
  r.handle = (req, res, out) => {
    let i = 0;
    const path = req.path;
    const next = (err) => {
      if (res.finished) return;
      while (i < stack.length) {
        const L = stack[i++];
        if (L.method && L.method !== req.method) continue;
        const m = L.match(path);
        if (!m) continue;
        if (!L.prefix) req.params = { ...m.params };
        let j = 0;
        const inner = (e) => {
          if (res.finished) return;
          while (j < L.hs.length) {
            const fn = L.hs[j++];
            if (fn && typeof fn.handle === 'function') {
              const saved = req.path;
              req.path = path.slice(m.matched.length) || '/';
              return fn.handle(req, res, (e2) => { req.path = saved; inner(e2); });
            }
            const isErr = fn.length === 4;
            if (e && !isErr) continue;
            if (!e && isErr) continue;
            try { return isErr ? fn(e, req, res, inner) : fn(req, res, inner); } catch (ex) { e = ex; }
          }
          next(e);
        };
        return inner(err);
      }
      out(err);
    };
    next();
  };
  return r;
}

function express() {
  const app = createRouter();
  app.locals = {};
  app.disable = () => app;
  app.set = () => app;
  return app;
}
express.json = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();
express.Router = createRouter;
module.exports = express;
