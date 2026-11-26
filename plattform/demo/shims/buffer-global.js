import { Buffer } from 'buffer';
// Das Buffer-Polyfill kennt "base64url" nicht – nachrüsten (Node kann es nativ)
const orig = Buffer.prototype.toString;
Buffer.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return orig.call(this, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return orig.call(this, enc, ...rest);
};
export { Buffer };
