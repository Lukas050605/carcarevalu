'use strict';
function join(...parts) {
  const out = [];
  for (const seg of parts.join('/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return '/' + out.join('/');
}
module.exports = { join, resolve: join, dirname: (p) => p.replace(/\/[^/]*$/, '') || '/' };
