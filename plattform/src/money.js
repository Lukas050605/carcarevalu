'use strict';
// Alle Geldbeträge in ganzen Cent. Sätze in Basispunkten (1500 = 15,00 %).

function roundDiv(num, den) {
  // kaufmännisch runden (half up) für positive ganze Zahlen
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den <= 0) throw new Error('Ungültige Rechnung');
  return Math.floor((2 * num + den) / (2 * den));
}

/**
 * Rechnet ein Angebot durch.
 * @param {number} grossCents Endpreis für den Kunden inkl. ggf. USt.
 * @param {number} providerVatBp USt-Satz des Betriebs (1900 regelbesteuert, 0 Kleinunternehmer §19 UStG)
 * @param {number} commissionBp Provisionssatz der Agentur
 * @param {number} agencyVatBp USt-Satz auf die Agenturprovision (1900, oder 0 falls Agentur Kleinunternehmer)
 */
function calcOffer(grossCents, providerVatBp, commissionBp, agencyVatBp) {
  for (const v of [grossCents, providerVatBp, commissionBp, agencyVatBp]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error('Ungültiger Betrag');
  }
  const netCents = providerVatBp === 0 ? grossCents : roundDiv(grossCents * 10000, 10000 + providerVatBp);
  const providerVatCents = grossCents - netCents;
  const commissionCents = roundDiv(netCents * commissionBp, 10000);
  const commissionVatCents = roundDiv(commissionCents * agencyVatBp, 10000);
  return {
    grossCents, netCents, providerVatCents, providerVatBp,
    commissionBp, commissionCents, agencyVatBp, commissionVatCents,
    commissionTotalCents: commissionCents + commissionVatCents,
    providerKeepsNetCents: netCents - commissionCents,
  };
}

/** "119,50" / "119.5" / "119" → 11950. Wirft bei ungültiger Eingabe. */
function parseEuroToCents(input) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') throw new Error('Betrag fehlt');
  const s = input.trim().replace(/\s|€/g, '');
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) throw new Error('Betrag bitte als Zahl angeben, z. B. 119,00');
  return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}

function formatCents(c) {
  const neg = c < 0; c = Math.abs(c);
  const e = Math.floor(c / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + e + ',' + String(c % 100).padStart(2, '0') + ' €';
}

module.exports = { calcOffer, parseEuroToCents, formatCents, roundDiv };
